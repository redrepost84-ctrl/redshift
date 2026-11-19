import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

function findChromeBinary() {
  const candidates = [
    process.env.REDSHIFT_TEST_CHROME,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean);
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return null;
}

async function waitFor(fn, timeoutMs = 8000, stepMs = 80) {
  const deadline = Date.now() + timeoutMs;
  let lastErr;
  while (Date.now() < deadline) {
    try {
      const val = await fn();
      if (val) return val;
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, stepMs));
  }
  throw lastErr ?? new Error('Timed out in waitFor');
}

async function api(baseUrl, pathUrl, { method = 'GET', token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${baseUrl}${pathUrl}`, {
    method,
    headers,
    body: payload,
    redirect: 'manual',
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, headers: res.headers, data };
}

class CdpSession {
  constructor(port) {
    this.port = port;
    this.id = 1;
    this.ws = null;
  }
  async connect(expectedUrl) {
    const target = await waitFor(async () => {
      try {
        const res = await fetch(`http://127.0.0.1:${this.port}/json/list`);
        const list = await res.json();
        if (!Array.isArray(list)) return false;
        return (
          list.find((t) => t.type === 'page' && t.url?.includes(expectedUrl)) ??
          list.find((t) => t.type === 'page') ??
          false
        );
      } catch {
        return false;
      }
    }, 25000);
    this.errors = [];
    this.ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r) => this.ws.addEventListener('open', r));
    this.ws.addEventListener('message', (ev) => {
      try {
        const d = JSON.parse(ev.data);
        if (d.method === 'Runtime.exceptionThrown') {
          this.errors.push(
            d.params?.exceptionDetails?.exception?.description ||
              d.params?.exceptionDetails?.text ||
              'unknown exception',
          );
        }
      } catch {}
    });
    await this.send('Page.enable');
    await this.send('Runtime.enable');
    if (expectedUrl) {
      const curHref = await this.evalJson('location.href').catch(() => '');
      if (!String(curHref || '').includes(expectedUrl)) {
        await this.send('Page.navigate', { url: expectedUrl });
      }
    }
  }
  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const myId = this.id++;
      const onMsg = (ev) => {
        const d = JSON.parse(ev.data);
        if (d.id === myId) {
          this.ws.removeEventListener('message', onMsg);
          if (d.error) reject(new Error(JSON.stringify(d.error)));
          else resolve(d.result);
        }
      };
      this.ws.addEventListener('message', onMsg);
      this.ws.send(JSON.stringify({ id: myId, method, params }));
    });
  }
  async evalJson(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (res.exceptionDetails) {
      throw new Error(`Browser eval failed: ${JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result?.value;
  }
  close() {
    try {
      this.ws?.close();
    } catch {}
  }
}

async function testLegacyJsonToSqliteMigration() {
  const migDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rs_mig_'));
  try {
    fs.writeFileSync(
      path.join(migDir, 'redshift-db.json'),
      JSON.stringify({
        accounts: [
          {
            username: 'alice',
            displayName: 'Alice',
            email: 'alice@test.local',
            passwordHash: 'salt:hash',
            bio: '',
            createdAt: 1000,
            status: 'online',
            avatarPreset: 0,
          },
        ],
        dms: {
          'alice::bob': [
            { id: 'm1', authorUsername: 'alice', content: 'first legacy', timestamp: 1000, reactions: {} },
            { id: 'm2', authorUsername: 'bob', content: 'second legacy', timestamp: 2000, reactions: {} },
          ],
        },
      }),
      'utf8',
    );
    const prevDir = process.env.REDSHIFT_DATA_DIR;
    process.env.REDSHIFT_DATA_DIR = migDir;
    const { createSqliteStore } = await import('../server/dbStore.js');
    const seedFactory = () => ({
      accounts: [],
      friendships: {},
      blocks: {},
      friendRequests: [],
      dms: {},
      openDms: {},
      groupDms: {},
      uploads: {},
      favoriteGifs: {},
      communityGifs: [],
      sessions: {},
      unreadDms: {},
      unreadGroups: {},
      unreadMentions: {},
      groupUnreadMentions: {},
      dmReadReceipts: {},
      mutedThreads: {},
      hiddenThreads: {},
      threadActivity: {},
      gifLinks: {},
    });

    const store1 = createSqliteStore(seedFactory);
    const db1 = store1.loadDb();
    assert.equal(db1.accounts.length, 1);
    assert.equal(db1.dms['alice::bob'].length, 2);
    assert.ok(fs.existsSync(path.join(migDir, 'redshift.sqlite')));
    assert.ok(fs.existsSync(path.join(migDir, 'redshift-db.json.bak')));
    store1.close();

    // Re-open directly from SQLite and verify paginated read works identically.
    const store2 = createSqliteStore(seedFactory);
    const db2 = store2.loadDb();
    assert.equal(db2.dms['alice::bob'].length, 2);
    const page1 = store2.getMessagesPage('alice::bob', { limit: 1 });
    assert.equal(page1.items.length, 1);
    assert.equal(page1.items[0].id, 'm2');
    assert.equal(page1.hasMore, true);
    store2.close();
    if (prevDir === undefined) delete process.env.REDSHIFT_DATA_DIR;
    else process.env.REDSHIFT_DATA_DIR = prevDir;
  } finally {
    fs.rmSync(migDir, { recursive: true, force: true });
  }
  console.log('[PASS] SQLite storage & legacy JSON migration');
}

async function run() {
  await testLegacyJsonToSqliteMigration();

  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rs_test_srv_'));
  const updatesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rs_test_upd_'));
  const dummyAsarBytes = Buffer.from('REDSHIFT_PATCH_ASAR_PAYLOAD_V0_9_9');
  fs.writeFileSync(path.join(updatesDir, 'Redshift-patch.asar'), dummyAsarBytes);
  fs.writeFileSync(
    path.join(updatesDir, 'version.json'),
    JSON.stringify({
      version: '0.9.9',
      changelog: 'Test desktop delta update',
      sha256: 'deadbeef',
      size: dummyAsarBytes.length,
      asarUrl: 'Redshift-patch.asar',
    }),
    'utf8',
  );
  const port = 18080 + Math.floor(Math.random() * 400);
  const baseUrl = `http://127.0.0.1:${port}`;

  const serverProc = spawn('node', ['--no-warnings', 'server.js'], {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      PORT: String(port),
      REDSHIFT_DATA_DIR: dataDir,
      REDSHIFT_UPDATES_DIR: updatesDir,
      REDSHIFT_AUTH_RATE_LIMIT: '12',
      REDSHIFT_MSG_RATE_LIMIT: '150',
      REDSHIFT_TURN_URLS: 'turn:turn.test.local:3478',
      REDSHIFT_TURN_USERNAME: 'turnuser',
      REDSHIFT_TURN_CREDENTIAL: 'turnpass',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    await waitFor(async () => {
      try {
        const res = await fetch(`${baseUrl}/`);
        return res.ok;
      } catch {
        return false;
      }
    }, 10_000);

    // 1. Signup two test users & verify ICE/TURN config
    const signUpA = await api(baseUrl, '/api/auth/signup', {
      method: 'POST',
      body: {
        username: 'alice_t',
        email: 'alice_t@test.local',
        confirmEmail: 'alice_t@test.local',
        password: 'Password123!',
        confirmPassword: 'Password123!',
        avatarPreset: 0,
      },
    });
    assert.equal(signUpA.status, 200);
    const tokenA = signUpA.data.token;

    const signUpB = await api(baseUrl, '/api/auth/signup', {
      method: 'POST',
      body: {
        username: 'bob_t',
        email: 'bob_t@test.local',
        confirmEmail: 'bob_t@test.local',
        password: 'Password123!',
        confirmPassword: 'Password123!',
        avatarPreset: 1,
      },
    });
    assert.equal(signUpB.status, 200);
    const tokenB = signUpB.data.token;

    // Become friends
    await api(baseUrl, '/api/friends/request', {
      method: 'POST',
      token: tokenA,
      body: { username: 'bob_t' },
    });
    await api(baseUrl, '/api/friends/accept', {
      method: 'POST',
      token: tokenB,
      body: { fromUsername: 'alice_t' },
    });

    const iceRes = await api(baseUrl, '/api/vc/ice-servers', { token: tokenA });
    assert.equal(iceRes.status, 200);
    assert.ok(iceRes.data.iceServers.some((s) => String(s.urls).includes('stun.l.google.com')));
    assert.ok(
      iceRes.data.iceServers.some(
        (s) => Array.isArray(s.urls) && s.urls.includes('turn:turn.test.local:3478') && s.username === 'turnuser',
      ),
    );
    console.log('[PASS] Auth, friendships & TURN ICE servers endpoint');

    // 2. Test Pagination, @mentions unread counts, global search & Only-@mentions (-2) mute
    const sentIds = [];
    for (let i = 1; i <= 65; i += 1) {
      const content =
        i === 3
          ? 'secret needle in msg 3 @bob_t'
          : i === 65
            ? 'hey @bob_t check latest msg 65'
            : `paginated message #${i}`;
      const r = await api(baseUrl, '/api/dms/send', {
        method: 'POST',
        token: tokenA,
        body: { toUsername: 'bob_t', content },
      });
      assert.equal(r.status, 200);
      sentIds.push(r.data.message.id);
    }

    const snapBRes = await api(baseUrl, '/api/social/snapshot', { token: tokenB });
    assert.equal(snapBRes.data.snapshot.unreadCounts.alice_t, 65);
    assert.equal(snapBRes.data.snapshot.unreadMentions.alice_t, 2);

    const p1 = await api(baseUrl, '/api/dms/history?peer=bob_t&limit=25', { token: tokenA });
    assert.equal(p1.data.messages.length, 25);
    assert.equal(p1.data.messages[0].id, sentIds[40]);
    assert.equal(p1.data.messages[24].id, sentIds[64]);
    assert.equal(p1.data.hasMore, true);

    const p2 = await api(
      baseUrl,
      `/api/dms/history?peer=bob_t&before=${encodeURIComponent(p1.data.messages[0].id)}&limit=25`,
      { token: tokenA },
    );
    assert.equal(p2.data.messages.length, 25);
    assert.equal(p2.data.messages[0].id, sentIds[15]);
    assert.equal(p2.data.messages[24].id, sentIds[39]);
    assert.equal(p2.data.hasMore, true);

    const p3 = await api(
      baseUrl,
      `/api/dms/history?peer=bob_t&before=${encodeURIComponent(p2.data.messages[0].id)}&limit=25`,
      { token: tokenA },
    );
    assert.equal(p3.data.messages.length, 15);
    assert.equal(p3.data.messages[0].id, sentIds[0]);
    assert.equal(p3.data.hasMore, false);

    const gSearch = await api(baseUrl, '/api/dms/search?q=secret%20needle%20from:alice_t', {
      token: tokenB,
    });
    assert.equal(gSearch.status, 200);
    assert.equal(gSearch.data.results.length, 1);
    assert.equal(gSearch.data.results[0].message.id, sentIds[2]);

    const muteOnlyMentions = await api(baseUrl, '/api/threads/mute', {
      method: 'POST',
      token: tokenB,
      body: { threadKey: 'dm:alice_t', muteUntil: -2 },
    });
    assert.equal(muteOnlyMentions.data.snapshot.mutedThreads['dm:alice_t'], -2);
    console.log('[PASS] Cursor pagination, global search, @mentions unread tracking & Only @mentions mode');

    // 3. Test SSRF link preview blocking
    const ssrfRes = await api(
      baseUrl,
      '/api/links/preview?url=' + encodeURIComponent(`http://127.0.0.1:${port}/`),
      { token: tokenA },
    );
    assert.equal(ssrfRes.status, 400);
    console.log('[PASS] Link preview SSRF guard');

    // 4. Browser E2E test against built production client (Keep signed in, @mention highlight & autocomplete, pagination & global search jump)
    const chromeBin = findChromeBinary();
    if (chromeBin && fs.existsSync(path.join(ROOT_DIR, 'dist', 'index.html'))) {
      const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'rs_cdp_test_'));
      const cdpPort = 9600 + Math.floor(Math.random() * 300);
      const chromeProc = spawn(
        chromeBin,
        [
          '--headless=new',
          '--disable-gpu',
          '--no-first-run',
          '--no-default-browser-check',
          '--disable-extensions',
          '--use-fake-ui-for-media-stream',
          '--use-fake-device-for-media-stream',
          `--remote-debugging-port=${cdpPort}`,
          `--user-data-dir=${ud}`,
          baseUrl,
        ],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      );

      const cdp = new CdpSession(cdpPort);
      try {
        await cdp.connect(baseUrl);
        await waitFor(
          async () => await cdp.evalJson(`Boolean(document.querySelector('.auth-remember-check'))`),
          15000,
        ).catch(async (err) => {
          const diag = await cdp
            .evalJson(
              `({ href: location.href, ready: document.readyState, bodyHtml: document.body?.innerHTML.slice(0, 1200) })`,
            )
            .catch(() => null);
          console.error('[CDP DIAG]', diag, cdp.errors);
          throw err;
        });

        // Log in as bob_t with Keep me signed in checked
        await cdp.evalJson(`(() => {
          const inputs = document.querySelectorAll('.auth-form input');
          inputs[0].value = 'bob_t';
          inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
          inputs[1].value = 'Password123!';
          inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
          document.querySelector('.auth-form button[type="submit"]')?.click();
          return true;
        })()`);

        await waitFor(
          async () => await cdp.evalJson(`Boolean(document.querySelector('.sidebar-dm-item'))`),
          8000,
        );

        // Verify persistent token saved in localStorage AND clear sessionStorage + reload to test survival across session restart!
        await cdp.evalJson(`(() => {
          if (!localStorage.getItem('redshift.session_persistent_token.v1')) {
            throw new Error('Persistent token missing in localStorage');
          }
          sessionStorage.clear();
          location.reload();
          return true;
        })()`);

        await waitFor(
          async () => await cdp.evalJson(`Boolean(document.querySelector('.sidebar-dm-item'))`),
          8000,
        );

        // Verify @1 mention badge on alice_t before opening
        const hasMentionBadge = await cdp.evalJson(`(() => {
          const item = Array.from(document.querySelectorAll('.sidebar-dm-item'))
            .find(el => el.querySelector('.sidebar-dm-name')?.textContent === 'alice_t');
          return item?.querySelector('.sidebar-dm-unread--mention')?.textContent;
        })()`);
        assert.equal(hasMentionBadge, '@2');

        // Open alice_t DM -> verify standout yellow mention highlight + @mention pill on msg 65!
        await cdp.evalJson(`(() => {
          const item = Array.from(document.querySelectorAll('.sidebar-dm-item'))
            .find(el => el.querySelector('.sidebar-dm-name')?.textContent === 'alice_t');
          item.click();
          return true;
        })()`);

        await waitFor(
          async () =>
            await cdp.evalJson(
              `document.querySelectorAll('.chat-message').length === 50 && Boolean(document.querySelector('.chat-message--mention-reply .md-mention--self'))`,
            ),
          8000,
        );

        // Scroll to top -> triggers paginated fetch of older 15 messages (total 65)
        await cdp.evalJson(`(() => {
          const box = document.querySelector('.chat-messages');
          box.scrollTop = 0;
          box.dispatchEvent(new Event('scroll'));
          return true;
        })()`);

        await waitFor(
          async () => await cdp.evalJson(`document.querySelectorAll('.chat-message').length === 65`),
          8000,
        );

        // Test @mention autocomplete + Ctrl+Shift+F Global Search
        const mentionSugCount = await cdp.evalJson(`(() => {
          const inp = document.querySelector('.chat-input');
          inp.focus();
          inp.value = 'hi @al';
          inp.setSelectionRange(6, 6);
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          return document.querySelectorAll('.mention-autocomplete-item').length;
        })()`);
        assert.ok(mentionSugCount >= 1, 'Expected @alice_t mention suggestion');

        await cdp.evalJson(`(() => {
          document.querySelector('.sidebar-global-search-btn').click();
          return true;
        })()`);
        await waitFor(
          async () => await cdp.evalJson(`Boolean(document.querySelector('.global-search-card input'))`),
          5000,
        );
        await cdp.evalJson(`(() => {
          const inp = document.querySelector('.global-search-card input');
          inp.value = 'secret needle';
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          return true;
        })()`);
        await waitFor(
          async () => await cdp.evalJson(`document.querySelectorAll('.global-search-list .dm-search-result-card').length === 1`),
          6000,
        );
        await cdp.evalJson(`(() => {
          document.querySelector('.global-search-list .dm-search-result-card')?.click();
          return true;
        })()`);
        console.log('[PASS] Browser E2E: Keep Signed In, @mentions highlight & autocomplete, pagination & Global Search');

        // Verify Screen Share source-first flow, live constraint editing, tab-close auto-end, & Draggable Mini Call Overlay
        await waitFor(
          async () => await cdp.evalJson(`Boolean(document.querySelector('.dm-header-actions .dm-header-icon-btn'))`),
          5000,
        );
        await cdp.evalJson(`(() => {
          window.__rsMockScreen = { calls: [], constraints: [], currentStream: null };
          window.redshiftDesktop = {
            isElectron: true,
            platform: 'win32',
            version: '0.1.4',
            getDesktopConfig: async () => ({}),
            getDesktopSources: async () => [
              { id: 'window:101:0', kind: 'window', name: 'Redshift Window', thumbnailDataUrl: '', appIconDataUrl: '' },
              { id: 'screen:1:0', kind: 'screen', name: 'Display 1', thumbnailDataUrl: '', appIconDataUrl: '' },
            ],
            selectDesktopSource: async () => ({ ok: true }),
            checkForUpdates: async () => ({ updateAvailable: false, currentVersion: '0.1.4', latestVersion: '0.1.4' }),
            initiateUpdate: () => {},
            applyUpdateAndRestart: () => {},
            onBackgroundUpdateAvailable: () => () => {},
            setUnreadCount: () => {},
            relaunchApp: () => {},
          };
          const origMediaDevices = navigator.mediaDevices;
          const patchedGetDisplay = async (opts) => {
            window.__rsMockScreen.calls.push(opts);
            const canvas = document.createElement('canvas');
            canvas.width = 640;
            canvas.height = 360;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.fillStyle = '#e23b41';
              ctx.fillRect(0, 0, 640, 360);
            }
            const stream = canvas.captureStream(30);
            const vt = stream.getVideoTracks()[0];
            vt.applyConstraints = async (c) => {
              window.__rsMockScreen.constraints.push(c);
            };
            vt.getSettings = () => {
              const last = window.__rsMockScreen.constraints[window.__rsMockScreen.constraints.length - 1] || {};
              const w = last.width?.ideal || 1920;
              const h = last.height?.ideal || 1080;
              const fps = last.frameRate?.ideal || 60;
              return { width: w, height: h, frameRate: fps };
            };
            let mockMuted = false;
            Object.defineProperty(vt, 'muted', {
              configurable: true,
              get: () => mockMuted,
            });
            window.__rsSetScreenMuted = (val) => {
              mockMuted = Boolean(val);
              vt.dispatchEvent(new Event(mockMuted ? 'mute' : 'unmute'));
              return mockMuted;
            };
            window.__rsMockScreen.currentStream = stream;
            return stream;
          };
          Object.defineProperty(origMediaDevices, 'getDisplayMedia', {
            configurable: true,
            writable: true,
            value: patchedGetDisplay,
          });
          window.__rsCloseSharedTab = () => {
            const st = window.__rsMockScreen.currentStream;
            if (!st) return false;
            const vt = st.getVideoTracks()[0];
            vt.stop();
            vt.dispatchEvent(new Event('ended'));
            st.dispatchEvent(new Event('inactive'));
            return true;
          };
          document.querySelector('.dm-header-actions .dm-header-icon-btn').click();
          return true;
        })()`);

        await waitFor(
          async () => await cdp.evalJson(`Boolean(document.querySelector('[data-vc-role="screen"]'))`),
          6000,
        );

        // 1. Click Share Screen -> must open full centered visual preview modal BEFORE capturing anything, showing ONLY real windows & monitors (zero placeholder picker cards)
        await cdp.evalJson(`(() => {
          document.querySelector('[data-vc-role="screen"]').click();
          return true;
        })()`);
        await waitFor(
          async () =>
            await cdp.evalJson(
              `Boolean(document.querySelector('.vc-screen-modal')) && document.querySelectorAll('.vc-screen-preview-card[data-host-source-id]').length > 0`,
            ),
          5000,
        );
        const chooserState = await cdp.evalJson(`(() => {
          const modal = document.querySelector('.vc-screen-modal');
          const cardsText = Array.from(document.querySelectorAll('.vc-screen-preview-card')).map((c) => c.textContent || '');
          return {
            callsBeforePick: window.__rsMockScreen.calls.length,
            hasModal: Boolean(modal),
            hasWinTab: Boolean(document.querySelector('[data-screen-tab="window"]')),
            hasDesktopTab: Boolean(document.querySelector('[data-screen-tab="screen"]')),
            hasBrowserTab: Boolean(document.querySelector('[data-screen-tab="tab"]')),
            hasPlaceholderCard: cardsText.some((t) => /WINDOW PICKER|Browse App Windows|DESKTOP PICKER/i.test(t)),
            hasGoLive: Boolean(document.querySelector('.vc-screen-modal-go-btn')),
          };
        })()`);
        assert.equal(chooserState.callsBeforePick, 0, 'getDisplayMedia must not start before choosing source');
        assert.equal(chooserState.hasModal, true, 'Full centered Screen Share modal expected');
        assert.equal(chooserState.hasWinTab, true, 'Windows tab expected');
        assert.equal(chooserState.hasDesktopTab, true, 'Entire Desktop tab expected');
        assert.equal(chooserState.hasBrowserTab, false, 'Placeholder Browser Tabs tab must not appear');
        assert.equal(chooserState.hasPlaceholderCard, false, 'Placeholder WINDOW PICKER card must not appear');
        assert.equal(chooserState.hasGoLive, true, 'Go Live button expected');

        // 1b. If getDisplayMedia is blocked by an embedded browser, modal stays open and displays explicit error banner
        await cdp.evalJson(`(() => {
          const origGdm = navigator.mediaDevices.getDisplayMedia;
          window.__rsOrigGdm = origGdm;
          navigator.mediaDevices.getDisplayMedia = async () => {
            throw new DOMException('Access to the feature "display-capture" is disallowed by permissions policy', 'NotAllowedError');
          };
          document.querySelector('[data-surface="window"]').click();
          document.querySelector('.vc-screen-modal-go-btn').click();
          return true;
        })()`);
        await waitFor(
          async () =>
            await cdp.evalJson(
              `Boolean(document.querySelector('.vc-screen-modal')) && !document.querySelector('.vc-screen-modal-alert')?.hidden && Boolean(document.querySelector('.vc-screen-modal-copy-btn'))`,
            ),
          4000,
        );
        await cdp.evalJson(`(() => {
          navigator.mediaDevices.getDisplayMedia = window.__rsOrigGdm;
          return true;
        })()`);

        // 2. Switch to Entire Desktop tab, pick preview card & click Go Live -> triggers displaySurface: 'monitor', shows top quality control, and shows ONLY ONE End Stream button
        await cdp.evalJson(`(() => {
          document.querySelector('[data-screen-tab="screen"]').click();
          document.querySelector('[data-surface="monitor"]').click();
          document.querySelector('.vc-screen-modal-go-btn').click();
          return true;
        })()`);
        await waitFor(
          async () =>
            await cdp.evalJson(
              `Boolean(document.querySelector('[data-vc-role="expanded-screen-quality"]')) && document.querySelector('[data-vc-role="leave"]')?.classList.contains('vc-ctrl-btn--end-stream')`,
            ),
          6000,
        );
        const monitorCall = await cdp.evalJson(`window.__rsMockScreen.calls[0]?.video?.displaySurface`);
        assert.equal(monitorCall, 'monitor');
        const streamBtnCounts = await cdp.evalJson(`({
          hasDupBottomPill: Boolean(document.querySelector('[data-vc-role="screen-quality"]')),
          endStreamAriaCount: document.querySelectorAll('button[aria-label="End Stream"]').length,
          sidebarHangupLabel: document.querySelector('.vc-sidebar-hangup-btn')?.getAttribute('aria-label'),
        })`);
        assert.equal(streamBtnCounts.hasDupBottomPill, false, 'Duplicate bottom quality pill must not be rendered');
        assert.equal(streamBtnCounts.endStreamAriaCount, 1, 'Exactly one End Stream button must be shown while streaming');
        assert.equal(streamBtnCounts.sidebarHangupLabel, 'Disconnect from Voice Call', 'Sidebar hangup button must stay Disconnect');

        // 3. Edit resolution & FPS from top of screen share WHILE actively screensharing without restarting capture
        await cdp.evalJson(`(() => {
          document.querySelector('[data-vc-role="expanded-screen-quality"]').click();
          const pills = Array.from(document.querySelectorAll('.vc-popover-card .vc-popover-pill'));
          pills.find((el) => el.textContent === '720p')?.click();
          pills.find((el) => el.textContent === '30 FPS')?.click();
          return true;
        })()`);
        await waitFor(
          async () =>
            await cdp.evalJson(
              `document.querySelector('[data-vc-role="expanded-screen-quality"]')?.textContent?.startsWith('720p 30') && window.__rsMockScreen.constraints.length >= 2`,
            ),
          4000,
        );
        const callCountAfterLiveEdit = await cdp.evalJson(`window.__rsMockScreen.calls.length`);
        assert.equal(callCountAfterLiveEdit, 1, 'Live edit must use applyConstraints without re-capturing');

        // 3b. Simulate minimizing shared tab/window (track mute) -> shows "Stream paused" overlay, then unmute resumes
        await cdp.evalJson(`window.__rsSetScreenMuted(true)`);
        await waitFor(
          async () =>
            await cdp.evalJson(
              `!document.querySelector('[data-vc-role="expanded-paused-overlay"]')?.hidden && document.querySelector('.vc-stream-paused-title')?.textContent === 'Stream paused' && document.querySelector('.vc-screen-live-pill')?.textContent === 'PAUSED'`,
            ),
          4000,
        );
        await cdp.evalJson(`window.__rsSetScreenMuted(false)`);
        await waitFor(
          async () =>
            await cdp.evalJson(
              `document.querySelector('[data-vc-role="expanded-paused-overlay"]')?.hidden === true && document.querySelector('.vc-screen-live-pill')?.textContent === 'LIVE'`,
            ),
          4000,
        );

        // 3c. Clicking End Stream (converted Leave Call button) ends stream FIRST while staying in call, then restores Leave Call button
        await cdp.evalJson(`(() => {
          document.querySelector('[data-vc-role="leave"]')?.click();
          return true;
        })()`);
        await waitFor(
          async () =>
            await cdp.evalJson(
              `Boolean(document.querySelector('.vc-top-bar')) && !document.querySelector('[data-vc-role="expanded-screen-quality"]') && document.querySelector('[data-vc-role="leave"]')?.classList.contains('vc-ctrl-btn--hangup')`,
            ),
          5000,
        );

        // 4. Start Window share via modal -> verify displaySurface: 'window' -> close window ends share automatically
        await cdp.evalJson(`(() => {
          document.querySelector('[data-vc-role="screen"]')?.click();
          return true;
        })()`);
        await waitFor(
          async () => await cdp.evalJson(`Boolean(document.querySelector('.vc-screen-modal [data-surface="window"]'))`),
          4000,
        );
        await cdp.evalJson(`(() => {
          document.querySelector('.vc-screen-modal [data-surface="window"]')?.click();
          document.querySelector('.vc-screen-modal-go-btn')?.click();
          return true;
        })()`);
        await waitFor(
          async () => await cdp.evalJson(`window.__rsMockScreen.calls.length === 2`),
          5000,
        );
        assert.equal(
          await cdp.evalJson(`window.__rsMockScreen.calls[1]?.video?.displaySurface`),
          'window',
        );
        await cdp.evalJson(`window.__rsCloseSharedTab()`);
        await waitFor(
          async () =>
            await cdp.evalJson(`!document.querySelector('[data-vc-role="expanded-screen-quality"]') && document.querySelector('[data-vc-role="leave"]')?.classList.contains('vc-ctrl-btn--hangup')`),
          5000,
        );

        // 5. Navigate away from active call with Camera active -> verify draggable picture-in-app square
        await cdp.evalJson(`(() => {
          document.querySelector('[data-vc-role="camera"]')?.click();
          return true;
        })()`);
        await waitFor(
          async () => await cdp.evalJson(`Boolean(document.querySelector('.vc-tile-video-box video'))`),
          6000,
        );
        await cdp.evalJson(`(() => {
          document.querySelector('.sidebar-friends-btn')?.click();
          return true;
        })()`);
        await waitFor(
          async () =>
            await cdp.evalJson(`Boolean(document.querySelector('.vc-mini-pip-overlay')) && !document.querySelector('.vc-mini-pip-overlay').hidden`),
          5000,
        );

        const pipInfo = await cdp.evalJson(`(() => {
          const ov = document.querySelector('.vc-mini-pip-overlay');
          const videoStage = ov.querySelector('.vc-mini-pip-video-stage');
          const badge = ov.querySelector('.vc-mini-pip-live-badge')?.textContent;
          const beforeTransform = ov.style.transform;
          ov.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 500, clientY: 500, pointerId: 1 }));
          window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 410, clientY: 430, pointerId: 1 }));
          const duringDrag = ov.classList.contains('vc-mini-pip-overlay--dragging');
          window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 410, clientY: 430, pointerId: 1 }));
          return {
            hasVideo: !videoStage.hidden && Boolean(ov.querySelector('video')?.srcObject),
            badge,
            beforeTransform,
            afterTransform: ov.style.transform,
            duringDrag,
            stillOnFriends: !document.querySelector('.vc-top-bar'),
          };
        })()`);
        assert.equal(pipInfo.hasVideo, true, 'Mini square must show picture-in-app camera/screenshare');
        assert.equal(pipInfo.badge, 'CAM');
        assert.equal(pipInfo.duringDrag, true);
        assert.notEqual(pipInfo.afterTransform, pipInfo.beforeTransform, 'Drag must move overlay position');
        assert.equal(pipInfo.stillOnFriends, true, 'Dragging must not switch away from current view');

        // Click without drag jumps back into call and hides overlay
        await cdp.evalJson(`(() => {
          const ov = document.querySelector('.vc-mini-pip-overlay');
          ov.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 410, clientY: 430, pointerId: 2 }));
          window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 410, clientY: 430, pointerId: 2 }));
          return true;
        })()`);
        await waitFor(
          async () =>
            await cdp.evalJson(`Boolean(document.querySelector('.vc-top-bar')) && document.querySelector('.vc-mini-pip-overlay')?.hidden === true`),
          5000,
        );

        // Turn camera off, start screen share via modal, navigate to Friends -> verify SCREEN PiP mode, then close window -> verifies fallback to speaker audio square
        await cdp.evalJson(`(() => {
          document.querySelector('[data-vc-role="camera"]')?.click();
          document.querySelector('[data-vc-role="screen"]')?.click();
          return true;
        })()`);
        await waitFor(
          async () => await cdp.evalJson(`Boolean(document.querySelector('.vc-screen-modal [data-surface="window"]'))`),
          4000,
        );
        await cdp.evalJson(`(() => {
          document.querySelector('.vc-screen-modal [data-surface="window"]')?.click();
          document.querySelector('.vc-screen-modal-go-btn')?.click();
          return true;
        })()`);
        await waitFor(
          async () =>
            await cdp.evalJson(
              `Boolean(document.querySelector('[data-vc-role="expanded-screen-quality"]'))`,
            ),
          5000,
        );
        await cdp.evalJson(`(() => {
          document.querySelector('.sidebar-friends-btn')?.click();
          return true;
        })()`);
        await waitFor(
          async () =>
            await cdp.evalJson(
              `!document.querySelector('.vc-mini-pip-overlay')?.hidden && document.querySelector('.vc-mini-pip-live-badge')?.textContent === 'SCREEN'`,
            ),
          5000,
        );
        await cdp.evalJson(`window.__rsCloseSharedTab()`);
        await waitFor(
          async () =>
            await cdp.evalJson(
              `document.querySelector('.vc-mini-pip-video-stage')?.hidden === true && document.querySelector('.vc-mini-pip-audio-stage')?.hidden === false && Boolean(document.querySelector('.vc-mini-pip-name')?.textContent)`,
            ),
          5000,
        );

        // Jump back and hang up cleanly
        await cdp.evalJson(`(() => {
          const ov = document.querySelector('.vc-mini-pip-overlay');
          ov.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 410, clientY: 430, pointerId: 3 }));
          window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 410, clientY: 430, pointerId: 3 }));
          return true;
        })()`);
        await waitFor(
          async () => await cdp.evalJson(`Boolean(document.querySelector('.vc-top-bar'))`),
          5000,
        );
        await cdp.evalJson(`(() => {
          document.querySelector('.vc-ctrl-btn--hangup')?.click();
          return true;
        })()`);
        await new Promise((r) => setTimeout(r, 250));
        console.log('[PASS] Browser E2E: Screen Share source chooser, live quality edit, tab-close auto-end, & Draggable Mini Call Square');

        // 6. Group Owner, Add Friends header button, Right-Sidebar Context Menu, System Messages, Reply Truncation & Slide-In/Removal Notifications
        const signUpC = await api(baseUrl, '/api/auth/signup', {
          method: 'POST',
          body: {
            username: 'carol_t',
            email: 'carol_t@test.local',
            confirmEmail: 'carol_t@test.local',
            password: 'Password123!',
            confirmPassword: 'Password123!',
            avatarPreset: 2,
          },
        });
        assert.equal(signUpC.status, 200);
        const tokenC = signUpC.data.token;

        // Make carol_t friends with bob_t
        await api(baseUrl, '/api/friends/request', {
          method: 'POST',
          token: tokenB,
          body: { username: 'carol_t' },
        });
        await api(baseUrl, '/api/friends/accept', {
          method: 'POST',
          token: tokenC,
          body: { fromUsername: 'bob_t' },
        });

        // Verify Reply Preview Truncation ("...") in DM with alice_t (composer preview + sent reply snippet)
        const longReplySource = `Long reply source text ${'word '.repeat(40)}END_MARKER`;
        const longMsgRes = await api(baseUrl, '/api/dms/send', {
          method: 'POST',
          token: tokenA,
          body: { toUsername: 'bob_t', content: longReplySource },
        });
        assert.equal(longMsgRes.status, 200);
        const longMsgId = longMsgRes.data.message.id;

        await waitFor(
          async () => await cdp.evalJson(`Boolean(document.querySelector('[data-msg-id="${longMsgId}"]'))`),
          5000,
        );
        const replyCheck = await cdp.evalJson(`(() => {
          const row = document.querySelector('[data-msg-id="${longMsgId}"]');
          const replyBtn = row?.querySelector('button[title="Reply"]');
          replyBtn?.click();
          const compPreview = document.querySelector('.composer-reply-preview')?.textContent || '';
          const input = document.querySelector('.chat-input');
          input.value = 'Got your long message!';
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
          return { compPreview };
        })()`);
        assert.ok(replyCheck.compPreview.endsWith('...'), `Expected truncated composer reply preview, got: ${replyCheck.compPreview}`);
        await waitFor(
          async () =>
            await cdp.evalJson(
              `Array.from(document.querySelectorAll('.msg-reply-snippet-text')).some((el) => el.textContent.endsWith('...'))`,
            ),
          5000,
        );
        console.log('[PASS] Browser E2E: Long reply preview truncation (...) in composer & message thread');

        // Create Group Chat as bob_t (owner) with alice_t
        const createGroupRes = await api(baseUrl, '/api/groups/create', {
          method: 'POST',
          token: tokenB,
          body: { name: 'Squad Room', memberUsernames: ['alice_t'] },
        });
        assert.equal(createGroupRes.status, 200);
        const testGroupId = createGroupRes.data.group.id;
        assert.equal(createGroupRes.data.group.ownerUsername, 'bob_t');

        // Non-owner (alice_t) must get 403 on kick & transfer-owner
        const forbiddenKick = await api(baseUrl, '/api/groups/kick', {
          method: 'POST',
          token: tokenA,
          body: { groupId: testGroupId, targetUsername: 'bob_t' },
        });
        assert.equal(forbiddenKick.status, 403);
        const forbiddenTransfer = await api(baseUrl, '/api/groups/transfer-owner', {
          method: 'POST',
          token: tokenA,
          body: { groupId: testGroupId, targetUsername: 'alice_t' },
        });
        assert.equal(forbiddenTransfer.status, 403);

        // Open Squad Room in sidebar as bob_t
        await waitFor(
          async () =>
            await cdp.evalJson(
              `Array.from(document.querySelectorAll('.sidebar-dm-item')).some((el) => el.textContent.includes('Squad Room'))`,
            ),
          5000,
        );
        await cdp.evalJson(`(() => {
          const item = Array.from(document.querySelectorAll('.sidebar-dm-item')).find((el) => el.textContent.includes('Squad Room'));
          item?.click();
          return true;
        })()`);
        await waitFor(
          async () =>
            await cdp.evalJson(
              `Boolean(document.querySelector('.group-members-panel')) && Boolean(document.querySelector('[data-action="group-add-friends"]'))`,
            ),
          5000,
        );

        // Verify right sidebar member list shows yellow crown on bob_t (owner)
        const initialMembersInfo = await cdp.evalJson(`(() => {
          const rows = Array.from(document.querySelectorAll('.group-members-panel .group-member-row'));
          return rows.map((r) => ({
            username: r.dataset.memberUsername,
            hasCrown: Boolean(r.querySelector('.group-owner-crown svg')),
          }));
        })()`);
        assert.equal(initialMembersInfo[0].username, 'bob_t');
        assert.equal(initialMembersInfo[0].hasCrown, true, 'Owner bob_t must have yellow crown SVG');
        assert.equal(initialMembersInfo[1].username, 'alice_t');
        assert.equal(initialMembersInfo[1].hasCrown, false);

        // Click "Add Friends" header button -> add carol_t directly
        await cdp.evalJson(`(() => {
          document.querySelector('[data-action="group-add-friends"]')?.click();
          return true;
        })()`);
        await waitFor(
          async () => await cdp.evalJson(`Boolean(document.querySelector('.group-friend-pick-row[data-friend-username="carol_t"]'))`),
          5000,
        );
        await cdp.evalJson(`(() => {
          document.querySelector('.group-friend-pick-row[data-friend-username="carol_t"]')?.click();
          document.querySelector('[data-action="confirm-add-group-friends"]')?.click();
          return true;
        })()`);
        await waitFor(
          async () =>
            await cdp.evalJson(
              `Boolean(document.querySelector('.group-member-row[data-member-username="carol_t"]')) && Boolean(document.querySelector('.chat-message--system[data-system-kind="group-add"]'))`,
            ),
          5000,
        );

        // Send a message in Squad Room and pin it -> verify inline pin system message with "See all pinned messages."
        const grpMsgRes = await api(baseUrl, '/api/dms/send', {
          method: 'POST',
          token: tokenB,
          body: { groupId: testGroupId, content: 'Important squad announcement' },
        });
        assert.equal(grpMsgRes.status, 200);
        const pinGrpRes = await api(baseUrl, '/api/dms/pin', {
          method: 'POST',
          token: tokenB,
          body: { groupId: testGroupId, messageId: grpMsgRes.data.message.id, pinned: true },
        });
        assert.equal(pinGrpRes.status, 200);
        await waitFor(
          async () =>
            await cdp.evalJson(
              `Boolean(document.querySelector('.chat-message--system[data-system-kind="pin"]')) && document.querySelector('.chat-message--system[data-system-kind="pin"]').textContent.includes('See all pinned messages.')`,
            ),
          5000,
        );

        // Right-click carol_t in group right sidebar -> verify owner context menu items & Remove from Group
        const memberCtxLabels = await cdp.evalJson(`(() => {
          const row = document.querySelector('.group-member-row[data-member-username="carol_t"]');
          const rect = row.getBoundingClientRect();
          row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: rect.left + 20, clientY: rect.top + 10 }));
          const items = Array.from(document.querySelectorAll('.ctx-menu-panel .ctx-menu-item'));
          const labels = items.map((el) => el.textContent.trim());
          const kickBtn = items.find((el) => el.textContent.includes('Remove from Group'));
          kickBtn?.click();
          return labels;
        })()`);
        assert.ok(memberCtxLabels.some((t) => t.includes('View Full Profile')), 'Missing View Full Profile in GC member menu');
        assert.ok(memberCtxLabels.some((t) => t.includes('Remove Friend')), 'Missing Remove Friend in GC member menu');
        assert.ok(memberCtxLabels.some((t) => t.includes('Make Group Owner')), 'Missing Make Group Owner in GC member menu');
        assert.ok(memberCtxLabels.some((t) => t.includes('Remove from Group')), 'Missing Remove from Group in GC member menu');
        await waitFor(
          async () =>
            await cdp.evalJson(
              `!document.querySelector('.group-member-row[data-member-username="carol_t"]') && Boolean(document.querySelector('.chat-message--system[data-system-kind="group-remove"]'))`,
            ),
          5000,
        );

        // Right-click alice_t -> Make Group Owner -> crown moves to alice_t + group-owner system message appears
        await cdp.evalJson(`(() => {
          const row = document.querySelector('.group-member-row[data-member-username="alice_t"]');
          const rect = row.getBoundingClientRect();
          row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: rect.left + 20, clientY: rect.top + 10 }));
          const btn = Array.from(document.querySelectorAll('.ctx-menu-panel .ctx-menu-item')).find((el) => el.textContent.includes('Make Group Owner'));
          btn?.click();
          return true;
        })()`);
        await waitFor(
          async () =>
            await cdp.evalJson(
              `Boolean(document.querySelector('.group-member-row[data-member-username="alice_t"] .group-owner-crown svg')) && !document.querySelector('.group-member-row[data-member-username="bob_t"] .group-owner-crown') && Boolean(document.querySelector('.chat-message--system[data-system-kind="group-owner"]'))`,
            ),
          5000,
        );
        console.log('[PASS] Browser E2E: Group Add Friends header button, yellow crown, member context menu, kick/transfer & inline system messages');

        // Verify clicking own profile in Group right sidebar opens Detailed Self Full-Profile Popup with inline editing & User Settings access
        await cdp.evalJson(`(() => {
          document.querySelector('.group-member-row[data-member-username="bob_t"]')?.click();
          return true;
        })()`);
        await waitFor(
          async () =>
            await cdp.evalJson(
              `Boolean(document.querySelector('.self-profile-modal')) && Boolean(document.querySelector('[data-action="self-profile-edit"]')) && Boolean(document.querySelector('[data-action="self-profile-settings"]'))`,
            ),
          5000,
        );
        const selfPopupInitial = await cdp.evalJson(`(() => {
          const m = document.querySelector('.self-profile-modal');
          return {
            hasAddFriend: m.textContent.includes('Add Friend'),
            hasStats: m.querySelectorAll('.self-profile-stat-cell').length === 3,
            statusPickerCount: m.querySelectorAll('.profile-status-btn, .self-profile-status-pill-btn').length,
            settingsBtnCount: m.querySelectorAll('[data-action="self-profile-settings"]').length,
            settingsNextToClose: Boolean(m.querySelector('.dm-full-banner-actions [data-action="self-profile-settings"]')),
          };
        })()`);
        assert.equal(selfPopupInitial.hasAddFriend, false, 'Own full profile must never show Add Friend');
        assert.equal(selfPopupInitial.hasStats, true, 'Own full profile must show Friends/Groups/Visibility stats');
        assert.equal(selfPopupInitial.statusPickerCount, 1, 'Must have only 1 status picker (bottom)');
        assert.equal(selfPopupInitial.settingsBtnCount, 1, 'Must have only 1 settings button');
        assert.equal(selfPopupInitial.settingsNextToClose, true, 'Settings button must be in top-right banner next to X');

        // Edit bio inline inside own full profile popup & save via Ctrl+Enter shortcut
        await cdp.evalJson(`(() => {
          document.querySelector('[data-action="self-profile-edit"]')?.click();
          const bio = document.querySelector('.self-profile-modal textarea[name="bio"]');
          bio.focus();
          bio.value = 'Updated from full profile popup!';
          bio.dispatchEvent(new Event('input', { bubbles: true }));
          bio.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
          return true;
        })()`);
        await waitFor(
          async () =>
            await cdp.evalJson(
              `document.querySelector('.self-profile-modal .dm-full-bio')?.textContent === 'Updated from full profile popup!'`,
            ),
          5000,
        );

        // Open User Settings directly from own full profile popup
        await cdp.evalJson(`(() => {
          document.querySelector('[data-action="self-profile-settings"]')?.click();
          return true;
        })()`);
        await waitFor(
          async () =>
            await cdp.evalJson(
              `Boolean(document.querySelector('.settings-overlay')) && !document.querySelector('.self-profile-modal')`,
            ),
          5000,
        );
        await cdp.evalJson(`(() => {
          document.querySelector('.settings-esc-btn')?.click();
          return true;
        })()`);
        await new Promise((r) => setTimeout(r, 150));

        // Verify sidebar profile drawer expand button also opens Detailed Self Full-Profile Popup
        await cdp.evalJson(`(() => {
          document.querySelector('.user-dock-trigger')?.click();
          return true;
        })()`);
        await waitFor(
          async () => await cdp.evalJson(`Boolean(document.querySelector('.profile-expand-btn'))`),
          4000,
        );
        await cdp.evalJson(`(() => {
          document.querySelector('.profile-expand-btn')?.click();
          return true;
        })()`);
        await waitFor(
          async () => await cdp.evalJson(`Boolean(document.querySelector('.self-profile-modal'))`),
          4000,
        );
        await cdp.evalJson(`(() => {
          document.querySelector('.self-profile-modal .dm-full-close')?.click();
          return true;
        })()`);
        await new Promise((r) => setTimeout(r, 200));
        console.log('[PASS] Browser E2E: Detailed Self Full-Profile Popup (inline edit, settings access & sidebar drawer expand)');

        // 7. Media Spoiler Blur + Eye Toggle, Code Block Copy Button, Date Dividers, Draft Persistence, Forward Message (up to 10) & Ref-Counted Orphan Upload Cleanup
        // Switch to alice_t DM
        await cdp.evalJson(`(() => {
          const item = Array.from(document.querySelectorAll('.sidebar-dm-item')).find((el) => el.textContent.includes('alice_t'));
          item?.click();
          return true;
        })()`);
        await waitFor(
          async () => await cdp.evalJson(`Boolean(document.querySelector('.chat-input')) && Boolean(document.querySelector('.dm-date-divider'))`),
          5000,
        );

        // Verify per-thread unsent draft persistence across view switch
        await cdp.evalJson(`(() => {
          const inp = document.querySelector('.chat-input');
          inp.value = 'Draft saved across switch';
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          document.querySelector('.sidebar-friends-btn')?.click();
          return true;
        })()`);
        await waitFor(async () => await cdp.evalJson(`!document.querySelector('.chat-input')`), 4000);
        await cdp.evalJson(`(() => {
          const item = Array.from(document.querySelectorAll('.sidebar-dm-item')).find((el) => el.textContent.includes('alice_t'));
          item?.click();
          return true;
        })()`);
        await waitFor(
          async () => await cdp.evalJson(`document.querySelector('.chat-input')?.value === 'Draft saved across switch'`),
          5000,
        );
        // Clear draft cleanly
        await cdp.evalJson(`(() => {
          const inp = document.querySelector('.chat-input');
          inp.value = '';
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          return true;
        })()`);

        // Send a fenced code block and verify Copy button renders
        const codeMsgRes = await api(baseUrl, '/api/dms/send', {
          method: 'POST',
          token: tokenB,
          body: { toUsername: 'alice_t', content: '```js\nconsole.log("hello redshift");\n```' },
        });
        assert.equal(codeMsgRes.status, 200);
        await waitFor(
          async () =>
            await cdp.evalJson(
              `Boolean(document.querySelector('[data-msg-id="${codeMsgRes.data.message.id}"] .md-codeblock-copy-btn'))`,
            ),
          5000,
        );

        // Upload a 1x1 PNG image as bob_t, send with spoilerAttachmentIds, verify blur + reveal + live Eye Toggle
        const tinyPng = Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
          'base64',
        );
        const upResp = await fetch(`${baseUrl}/api/uploads`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tokenB}`,
            'Content-Type': 'application/octet-stream',
            'X-File-Name': encodeURIComponent('secret-pic.png'),
            'X-File-Mime': 'image/png',
          },
          body: tinyPng,
        });
        const upData = await upResp.json();
        assert.equal(upResp.status, 200);
        const spoilerUploadId = upData.attachment.id;

        const spoilerMsgRes = await api(baseUrl, '/api/dms/send', {
          method: 'POST',
          token: tokenB,
          body: {
            toUsername: 'alice_t',
            content: 'Spoiler image test',
            attachmentIds: [spoilerUploadId],
            spoilerAttachmentIds: [spoilerUploadId],
          },
        });
        assert.equal(spoilerMsgRes.status, 200);
        const spoilerMsgId = spoilerMsgRes.data.message.id;

        // Non-author (alice_t) must get 403 toggling spoiler on bob_t's message
        const forbiddenSpoiler = await api(baseUrl, '/api/dms/spoiler', {
          method: 'POST',
          token: tokenA,
          body: { peerUsername: 'bob_t', messageId: spoilerMsgId, attachmentId: spoilerUploadId, spoiler: false },
        });
        assert.equal(forbiddenSpoiler.status, 403);

        await waitFor(
          async () =>
            await cdp.evalJson(
              `Boolean(document.querySelector('[data-msg-id="${spoilerMsgId}"] .msg-media-spoiler')) && Boolean(document.querySelector('[data-msg-id="${spoilerMsgId}"] .msg-spoiler-overlay'))`,
            ),
          5000,
        );

        // Click spoiler overlay -> reveals image without opening lightbox
        const revealRes = await cdp.evalJson(`(() => {
          const row = document.querySelector('[data-msg-id="${spoilerMsgId}"]');
          row.querySelector('.msg-spoiler-overlay')?.click();
          return {
            revealed: row.querySelector('.msg-media-spoiler')?.classList.contains('msg-media-spoiler--revealed'),
            lightboxOpen: Boolean(document.querySelector('.image-lightbox')),
          };
        })()`);
        assert.equal(revealRes.revealed, true, 'Clicking SPOILER overlay must unblur media');
        assert.equal(revealRes.lightboxOpen, false, 'Revealing spoiler must not immediately open lightbox');

        // Floating eye icon on chat images must NOT be rendered (removed per user request); toggling spoiler works cleanly via right-click context menu
        const hasFloatingEyeIcon = await cdp.evalJson(
          `Boolean(document.querySelector('[data-msg-id="${spoilerMsgId}"] [data-action="toggle-media-spoiler"]'))`,
        );
        assert.equal(hasFloatingEyeIcon, false, 'Floating eye icon on chat images must be removed');

        await cdp.evalJson(`(() => {
          const img = document.querySelector('[data-msg-id="${spoilerMsgId}"] .msg-image');
          img?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 200, clientY: 200 }));
          return true;
        })()`);
        await waitFor(
          async () =>
            await cdp.evalJson(
              `Array.from(document.querySelectorAll('.ctx-menu-item')).some((el) => el.textContent.includes('Remove Spoiler Blur'))`,
            ),
          4000,
        ).catch(async (err) => {
          const diag = await cdp.evalJson(`({
            hasImg: Boolean(document.querySelector('[data-msg-id="${spoilerMsgId}"] .msg-image')),
            menuItems: Array.from(document.querySelectorAll('.ctx-menu-item')).map((el) => el.textContent),
            allMenus: document.querySelectorAll('.floating-action-menu').length,
          })`);
          console.error('[SPOILER CTX DIAG]', diag);
          throw err;
        });
        const revealedCtxChecks = await cdp.evalJson(`({
          hasHideSpoiler: Array.from(document.querySelectorAll('.ctx-menu-item')).some((el) => el.textContent.includes('Hide Spoiler')),
          hasCopyImage: Array.from(document.querySelectorAll('.ctx-menu-item')).some((el) => el.textContent.trim() === 'Copy Image'),
          hasSidebarDupBanner: Boolean(document.querySelector('.desktop-update-banner')),
        })`);
        assert.equal(revealedCtxChecks.hasHideSpoiler, true, 'Revealing a spoiler must immediately show Hide Spoiler in context menu');
        assert.equal(revealedCtxChecks.hasCopyImage, true, 'Image context menu must include Copy Image');
        assert.equal(revealedCtxChecks.hasSidebarDupBanner, false, 'Duplicate bottom-left sidebar update banner must be removed');
        // Verify textbox right-click context menu opens with Paste
        await cdp.evalJson(`(() => {
          const ta = document.querySelector('.chat-input');
          ta?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 250, clientY: 250 }));
          return true;
        })()`);
        await waitFor(
          async () =>
            await cdp.evalJson(
              `Array.from(document.querySelectorAll('.ctx-menu-item')).some((el) => el.textContent.includes('Paste'))`,
            ),
          3000,
        );
        // Re-open spoiler context menu and remove spoiler blur
        await cdp.evalJson(`(() => {
          const img = document.querySelector('[data-msg-id="${spoilerMsgId}"] .msg-image');
          img?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 200, clientY: 200 }));
          return true;
        })()`);
        await waitFor(
          async () =>
            await cdp.evalJson(
              `Array.from(document.querySelectorAll('.ctx-menu-item')).some((el) => el.textContent.includes('Remove Spoiler Blur'))`,
            ),
          3000,
        );
        await cdp.evalJson(`(() => {
          const item = Array.from(document.querySelectorAll('.ctx-menu-item')).find((el) => el.textContent.includes('Remove Spoiler Blur'));
          item?.click();
          return true;
        })()`);
        await waitFor(
          async () =>
            await cdp.evalJson(
              `!document.querySelector('[data-msg-id="${spoilerMsgId}"] .msg-media-spoiler')`,
            ),
          5000,
        );
        await cdp.evalJson(`(() => {
          const img = document.querySelector('[data-msg-id="${spoilerMsgId}"] .msg-image');
          img?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 200, clientY: 200 }));
          return true;
        })()`);
        await waitFor(
          async () =>
            await cdp.evalJson(
              `Array.from(document.querySelectorAll('.ctx-menu-item')).some((el) => el.textContent.includes('Mark as Spoiler'))`,
            ),
          4000,
        );
        await cdp.evalJson(`(() => {
          const item = Array.from(document.querySelectorAll('.ctx-menu-item')).find((el) => el.textContent.includes('Mark as Spoiler'));
          item?.click();
          return true;
        })()`);
        await waitFor(
          async () =>
            await cdp.evalJson(
              `Boolean(document.querySelector('[data-msg-id="${spoilerMsgId}"] .msg-media-spoiler'))`,
            ),
          5000,
        );

        // Verify Markdown bullet list (* item) turns asterisk into bullet point (•)
        const bulletMsgRes = await api(baseUrl, '/api/dms/send', {
          method: 'POST',
          token: tokenB,
          body: { toUsername: 'alice_t', content: '* First bullet item\n* Second **bold** item' },
        });
        assert.equal(bulletMsgRes.status, 200);
        await waitFor(
          async () =>
            await cdp.evalJson(
              `document.querySelectorAll('[data-msg-id="${bulletMsgRes.data.message.id}"] .md-bullet-item').length === 2 && document.querySelector('[data-msg-id="${bulletMsgRes.data.message.id}"] .md-bullet-dot')?.textContent === '•'`,
            ),
          5000,
        );

        // Forward API must reject > 10 targets with 400
        const tooManyTargets = Array.from({ length: 11 }, (_, idx) => ({
          kind: 'dm',
          username: `user_${idx}`,
        }));
        const capRes = await api(baseUrl, '/api/dms/forward', {
          method: 'POST',
          token: tokenB,
          body: { sourcePeerUsername: 'alice_t', messageId: spoilerMsgId, targets: tooManyTargets },
        });
        assert.equal(capRes.status, 400, 'Forwarding to >10 recipients must return 400');

        // Click reverse-arrow Forward button on bob_t's spoiler image message -> open Forward modal -> forward to Squad Room
        await cdp.evalJson(`(() => {
          document.querySelector('[data-msg-id="${spoilerMsgId}"] [data-action="forward"]')?.click();
          return true;
        })()`);
        await waitFor(
          async () =>
            await cdp.evalJson(
              `Boolean(document.querySelector('.forward-modal-card')) && document.querySelector('.forward-count-pill')?.textContent === '0 / 10'`,
            ),
          5000,
        );
        await cdp.evalJson(`(() => {
          const row = document.querySelector('.forward-recipient-row[data-forward-key="group:${testGroupId}"]');
          row?.click();
          const note = document.querySelector('.forward-note-input');
          if (note) {
            note.focus();
            note.value = 'Check out this forwarded spoiler!';
            note.dispatchEvent(new Event('input', { bubbles: true }));
            note.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
          }
          return true;
        })()`);
        await waitFor(
          async () => await cdp.evalJson(`!document.querySelector('.forward-modal-card')`),
          5000,
        );

        // Open Squad Room -> verify Forwarded card + spoiler image + optional note arrived
        await cdp.evalJson(`(() => {
          const item = Array.from(document.querySelectorAll('.sidebar-dm-item')).find((el) => el.textContent.includes('Squad Room'));
          item?.click();
          return true;
        })()`);
        await waitFor(
          async () =>
            await cdp.evalJson(
              `Boolean(document.querySelector('.msg-forwarded-card .msg-media-spoiler')) && Array.from(document.querySelectorAll('.chat-message-text')).some((el) => el.textContent.includes('Check out this forwarded spoiler!'))`,
            ),
          5000,
        );
        const forwardedMsgId = await cdp.evalJson(
          `document.querySelector('.msg-forwarded-card')?.closest('.chat-message')?.dataset.msgId`,
        );
        assert.ok(forwardedMsgId, 'Forwarded message ID must exist in Squad Room');

        // Verify Enter saves Group Settings changes immediately
        await cdp.evalJson(`(() => {
          document.querySelector('button[title="Group Settings"]')?.click();
          return true;
        })()`);
        await waitFor(
          async () => await cdp.evalJson(`Boolean(document.querySelector('.modal-card--group-settings .group-modal-input'))`),
          5000,
        );
        await cdp.evalJson(`(() => {
          const nameInp = document.querySelector('.modal-card--group-settings .group-modal-input');
          nameInp.focus();
          nameInp.value = 'Squad Room HQ';
          nameInp.dispatchEvent(new Event('input', { bubbles: true }));
          nameInp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
          return true;
        })()`);
        await waitFor(
          async () =>
            await cdp.evalJson(
              `!document.querySelector('.modal-card--group-settings') && document.querySelector('.dm-header-name')?.textContent === 'Squad Room HQ'`,
            ),
          5000,
        );

        // Delete original DM message -> upload MUST still exist (200) because Squad Room forwarded copy still references it!
        const delOrigRes = await api(baseUrl, '/api/dms/delete', {
          method: 'POST',
          token: tokenB,
          body: { peerUsername: 'alice_t', messageId: spoilerMsgId },
        });
        assert.equal(delOrigRes.status, 200);
        const uploadStillAlive = await fetch(`${baseUrl}${upData.attachment.url}`);
        assert.equal(uploadStillAlive.status, 200, 'Upload referenced by forwarded message must remain available');

        // Now delete the forwarded copy too -> orphaned upload MUST be cleaned up (404)!
        const delFwdRes = await api(baseUrl, '/api/dms/delete', {
          method: 'POST',
          token: tokenB,
          body: { groupId: testGroupId, messageId: forwardedMsgId },
        });
        assert.equal(delFwdRes.status, 200);
        const uploadCleanedUp = await fetch(`${baseUrl}${upData.attachment.url}`);
        assert.equal(uploadCleanedUp.status, 404, 'Orphaned upload must be pruned once all referencing messages are deleted');
        console.log('[PASS] Browser E2E: Media spoiler blur & Eye toggle, code block Copy, date dividers, drafts, Forward modal (cap 10) & ref-counted upload cleanup');

        // Verify Notification defaults (inAppNotifications & notifyOnSocialRemovals OFF by default)
        await api(baseUrl, '/api/threads/mute', {
          method: 'POST',
          token: tokenB,
          body: { threadKey: 'dm:alice_t', muteUntil: null },
        });
        await cdp.evalJson(`(() => {
          document.querySelector('.sidebar-friends-btn')?.click();
          return true;
        })()`);
        await new Promise((r) => setTimeout(r, 150));

        // While notifyOnSocialRemovals is OFF, carol_t unfriends bob_t -> NO toast should appear
        const unfriendOffRes = await api(baseUrl, '/api/friends/remove', {
          method: 'POST',
          token: tokenC,
          body: { targetUsername: 'bob_t' },
        });
        assert.equal(unfriendOffRes.status, 200);
        await new Promise((r) => setTimeout(r, 400));
        const toastsWhenOff = await cdp.evalJson(`document.querySelectorAll('.rs-toast-card').length`);
        assert.equal(toastsWhenOff, 0, 'Unfriend must NOT show notification when notifyOnSocialRemovals is OFF');

        // Open Settings -> Notifications -> verify both new toggles start OFF -> enable both -> close Settings
        await cdp.evalJson(`(() => {
          document.querySelector('button[title="User Settings"]')?.click();
          return true;
        })()`);
        await waitFor(
          async () => await cdp.evalJson(`document.querySelectorAll('.settings-nav-item').length > 0`),
          5000,
        );
        const settingsToggleCheck = await cdp.evalJson(`(() => {
          const navBtns = Array.from(document.querySelectorAll('.settings-nav-item'));
          navBtns.find((b) => b.textContent.includes('Notifications'))?.click();
          const rows = Array.from(document.querySelectorAll('.settings-toggle-row'));
          const inAppRow = rows.find((r) => r.textContent.includes('Built-In Slide-In Notifications'));
          const removalsRow = rows.find((r) => r.textContent.includes('Notify on Group Removals, Unfriends & Blocks'));
          const inAppInput = inAppRow?.querySelector('input[type="checkbox"]');
          const removalsInput = removalsRow?.querySelector('input[type="checkbox"]');
          const before = { inApp: inAppInput?.checked, removals: removalsInput?.checked };
          inAppInput?.click();
          removalsInput?.click();
          const after = { inApp: inAppInput?.checked, removals: removalsInput?.checked };
          document.querySelector('.settings-esc-btn')?.click();
          return { before, after };
        })()`);
        assert.equal(settingsToggleCheck.before.inApp, false, 'Built-in slide-in notifications must default to OFF');
        assert.equal(settingsToggleCheck.before.removals, false, 'Social removal alerts must default to OFF');
        assert.equal(settingsToggleCheck.after.inApp, true);
        assert.equal(settingsToggleCheck.after.removals, true);

        // 1) Long incoming DM -> built-in slide-in toast appears with avatar, display name, and "..." truncated body
        await api(baseUrl, '/api/dms/send', {
          method: 'POST',
          token: tokenA,
          body: { toUsername: 'bob_t', content: `Slide in notification message ${'longtext '.repeat(25)}TAIL` },
        });
        await waitFor(
          async () =>
            await cdp.evalJson(
              `Array.from(document.querySelectorAll('.rs-toast-card')).some((el) => el.querySelector('.rs-toast-title')?.textContent === 'alice_t' && el.querySelector('.rs-toast-body')?.textContent.endsWith('...') && Boolean(el.querySelector('.rs-toast-avatar')))`,
            ),
          5000,
        );

        // 2) Incoming friend request from carol_t -> built-in slide-in toast with Friend Request badge
        await api(baseUrl, '/api/friends/request', {
          method: 'POST',
          token: tokenC,
          body: { username: 'bob_t' },
        });
        await waitFor(
          async () =>
            await cdp.evalJson(
              `Array.from(document.querySelectorAll('.rs-toast-card')).some((el) => el.querySelector('.rs-toast-badge')?.textContent === 'Friend Request')`,
            ),
          5000,
        );

        // 3) Added to a new group by alice_t -> Group Chat toast
        await api(baseUrl, '/api/groups/create', {
          method: 'POST',
          token: tokenA,
          body: { name: 'Night Watch', memberUsernames: ['bob_t'] },
        });
        await waitFor(
          async () =>
            await cdp.evalJson(
              `Array.from(document.querySelectorAll('.rs-toast-card')).some((el) => el.querySelector('.rs-toast-title')?.textContent === 'Night Watch' && el.querySelector('.rs-toast-badge')?.textContent === 'Group Chat')`,
            ),
          5000,
        );

        // 4) Removed from Squad Room by alice_t (new owner) -> danger Removed toast (since opt-in setting is ON)
        await api(baseUrl, '/api/groups/kick', {
          method: 'POST',
          token: tokenA,
          body: { groupId: testGroupId, targetUsername: 'bob_t' },
        });
        await waitFor(
          async () =>
            await cdp.evalJson(
              `Array.from(document.querySelectorAll('.rs-toast-card--danger')).some((el) => el.querySelector('.rs-toast-badge')?.textContent === 'Removed' && el.querySelector('.rs-toast-body')?.textContent.includes('removed you from the group'))`,
            ),
          5000,
        );

        // 5) Unfriended by carol_t (after re-accepting) -> danger Unfriended toast (since opt-in setting is ON)
        await api(baseUrl, '/api/friends/accept', {
          method: 'POST',
          token: tokenB,
          body: { fromUsername: 'carol_t' },
        });
        const unfriendOnRes = await api(baseUrl, '/api/friends/remove', {
          method: 'POST',
          token: tokenC,
          body: { targetUsername: 'bob_t' },
        });
        assert.equal(unfriendOnRes.status, 200);
        await waitFor(
          async () =>
            await cdp.evalJson(
              `Array.from(document.querySelectorAll('.rs-toast-card--danger')).some((el) => el.querySelector('.rs-toast-badge')?.textContent === 'Unfriended')`,
            ),
          5000,
        );

        // 6) Blocked by alice_t -> danger Blocked toast (since opt-in setting is ON)
        const blockOnRes = await api(baseUrl, '/api/friends/block', {
          method: 'POST',
          token: tokenA,
          body: { targetUsername: 'bob_t' },
        });
        assert.equal(blockOnRes.status, 200);
        await waitFor(
          async () =>
            await cdp.evalJson(
              `Array.from(document.querySelectorAll('.rs-toast-card--danger')).some((el) => el.querySelector('.rs-toast-badge')?.textContent === 'Blocked')`,
            ),
          5000,
        );
        console.log('[PASS] Browser E2E: Built-in slide-in notifications, friend request/group-add alerts & opt-in removal/unfriend/block alerts');

        // 7) Sidebar Group Chat X Leave Button (leave 'Night Watch' directly from DM list without right-clicking)
        await waitFor(
          async () =>
            await cdp.evalJson(
              `Boolean(Array.from(document.querySelectorAll('.sidebar-dm-item--group')).find((el) => el.textContent.includes('Night Watch'))?.querySelector('[data-action="leave-group-x"]'))`,
            ),
          5000,
        );
        await cdp.evalJson(`(() => {
          const grpRow = Array.from(document.querySelectorAll('.sidebar-dm-item--group')).find((el) => el.textContent.includes('Night Watch'));
          grpRow.querySelector('[data-action="leave-group-x"]').click();
          return true;
        })()`);
        await waitFor(
          async () => await cdp.evalJson(`Boolean(document.querySelector('.modal-card--confirm'))`),
          4000,
        );
        await cdp.evalJson(`(() => {
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
          return true;
        })()`);
        await waitFor(
          async () =>
            await cdp.evalJson(
              `!Array.from(document.querySelectorAll('.sidebar-dm-item--group')).some((el) => el.textContent.includes('Night Watch'))`,
            ),
          5000,
        );
        console.log('[PASS] Browser E2E: Sidebar Group Chat X leave button');

        // 8) Post-Update Scrollable News-Article Changelog Modal & Header "Update Available" Button + Restart Popup
        await cdp.evalJson(`(() => {
          localStorage.setItem('redshift.last_seen_changelog_version.v1', '0.0.1');
          location.reload();
          return true;
        })()`);
        await waitFor(
          async () =>
            await cdp.evalJson(
              `Boolean(document.querySelector('.changelog-article-modal')) && Boolean(document.querySelector('[data-action="close-changelog"]'))`,
            ),
          8000,
        );
        await cdp.evalJson(`(() => {
          document.querySelector('[data-action="close-changelog"]').click();
          return true;
        })()`);
        await waitFor(
          async () => await cdp.evalJson(`!document.querySelector('.changelog-article-modal')`),
          4000,
        );

        // Dispatch update-available event -> verify header button appears and clicking it opens "Update Available" restart popup
        await cdp.evalJson(`(() => {
          window.dispatchEvent(new CustomEvent('redshift:update-available', {
            detail: { updateAvailable: true, currentVersion: '0.1.3', latestVersion: '0.9.9', changelog: 'Major update ready!' }
          }));
          return true;
        })()`);
        await waitFor(
          async () =>
            await cdp.evalJson(
              `Boolean(document.querySelector('[data-action="header-update-available"]:not([hidden])'))`,
            ),
          4000,
        );
        await cdp.evalJson(`(() => {
          document.querySelector('[data-action="header-update-available"]:not([hidden])').click();
          return true;
        })()`);
        await waitFor(
          async () =>
            await cdp.evalJson(
              `Boolean(document.querySelector('.modal-card--confirm')) && document.querySelector('.modal-card--confirm').textContent.includes('Update Available (v0.9.9)')`,
            ),
          4000,
        );
        await cdp.evalJson(`(() => {
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          return true;
        })()`);
        console.log('[PASS] Browser E2E: Post-update News-Article Changelog modal & Header Update Available button/popup');
      } finally {
        cdp.close();
        try {
          chromeProc.kill();
        } catch {}
        try {
          fs.rmSync(ud, { recursive: true, force: true });
        } catch {}
      }
    } else {
      console.log('[SKIP] Browser UI test (Chrome or dist/ not found)');
    }

    // 4.5 Desktop Auto-Update Hosting, /api/health & CORS Preflight Check
    const healthResp = await api(baseUrl, '/api/health');
    assert.equal(healthResp.status, 200);
    assert.equal(healthResp.data.ok, true);
    assert.equal(healthResp.data.service, 'redshift');
    assert.equal(healthResp.data.wsReady, true);

    const corsPreflight = await fetch(`${baseUrl}/api/desktop/version.json`, {
      method: 'OPTIONS',
      headers: { Origin: 'http://127.0.0.1:54321' },
    });
    assert.equal(corsPreflight.status, 204);
    assert.equal(corsPreflight.headers.get('access-control-allow-origin'), 'http://127.0.0.1:54321');

    const verResp = await api(baseUrl, '/api/desktop/version.json');
    assert.equal(verResp.status, 200);
    assert.equal(verResp.headers.get('access-control-allow-origin'), '*');
    assert.equal(verResp.data.version, '0.9.9');
    assert.equal(verResp.data.asarUrl, '/api/desktop/patch.asar');

    const patchResp = await fetch(`${baseUrl}/api/desktop/patch.asar`);
    assert.equal(patchResp.status, 200);
    const patchBuf = Buffer.from(await patchResp.arrayBuffer());
    assert.equal(patchBuf.toString('utf8'), dummyAsarBytes.toString('utf8'));
    console.log('[PASS] Desktop updater manifest (/api/desktop/version.json), patch download & CORS preflight');

    // 4.6 Real-Time Moderator / Admin Authority Endpoints (loopback-only)
    const adminList = await api(baseUrl, '/api/admin/accounts');
    assert.equal(adminList.status, 200);
    assert.equal(adminList.data.ok, true);
    assert.ok(adminList.data.accounts.some((a) => a.username === 'carol_t'));

    const adminUpdate = await api(baseUrl, '/api/admin/accounts/update', {
      method: 'POST',
      body: { username: 'carol_t', displayName: 'Carol Moderated', bio: 'Moderated bio' },
    });
    assert.equal(adminUpdate.status, 200);
    assert.equal(adminUpdate.data.account.displayName, 'Carol Moderated');

    const adminKick = await api(baseUrl, '/api/admin/accounts/kick', {
      method: 'POST',
      body: { username: 'carol_t' },
    });
    assert.equal(adminKick.status, 200);
    assert.equal(adminKick.data.ok, true);

    const adminDel = await api(baseUrl, '/api/admin/accounts/delete', {
      method: 'POST',
      body: { username: 'carol_t' },
    });
    assert.equal(adminDel.status, 200);
    assert.equal(adminDel.data.deletedUsername, 'carol_t');
    console.log('[PASS] Real-time loopback Moderator / Admin account authority (list, update, kick & delete)');

    // 4.7 Universal GIF Creator (playbackSpeed + 5-min limit) & Video Range Streaming Headers
    const tinyMp4Upload = await fetch(`${baseUrl}/api/uploads`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': 'application/octet-stream',
        'X-File-Name': encodeURIComponent('clip.mp4'),
        'X-File-Mime': 'video/mp4',
      },
      body: Buffer.alloc(64, 0x41),
    });
    const mp4Meta = await tinyMp4Upload.json();
    assert.equal(tinyMp4Upload.status, 200);
    const rangeVidResp = await fetch(`${baseUrl}/api/uploads/${mp4Meta.attachment.id}`, {
      headers: { Range: 'bytes=0-' },
    });
    assert.equal(rangeVidResp.status, 206);
    assert.equal(rangeVidResp.headers.get('cross-origin-resource-policy'), 'cross-origin');
    assert.ok((rangeVidResp.headers.get('access-control-expose-headers') || '').includes('Content-Range'));

    // Reject > 5 minute (300s) GIF submission
    const tooLongGifRes = await api(baseUrl, '/api/gifs/add', {
      method: 'POST',
      token: tokenA,
      body: {
        items: [{ uploadId: mp4Meta.attachment.id, title: 'Too Long Video', tags: ['test'], playbackSpeed: 1.5, durationSec: 360 }],
      },
    });
    assert.equal(tooLongGifRes.status, 400, 'GIF media over 5 minutes must be rejected with 400');

    // Accept valid <= 5 minute MP4 with custom playback speed
    const validVidGifRes = await api(baseUrl, '/api/gifs/add', {
      method: 'POST',
      token: tokenA,
      body: {
        items: [{ uploadId: mp4Meta.attachment.id, title: 'Speedy Clip', tags: ['fast'], playbackSpeed: 2, durationSec: 12 }],
      },
    });
    assert.equal(validVidGifRes.status, 200);
    assert.equal(validVidGifRes.data.added[0].mediaKind, 'video');
    console.log('[PASS] Universal GIF creator (MP4/audio support, 5-min cap, playback speed) & video streaming headers');

    // 5. Auth rate limiting burst check (run after browser login from same IP)
    let got429 = false;
    for (let i = 0; i < 16; i += 1) {
      const badLogin = await api(baseUrl, '/api/auth/signin', {
        method: 'POST',
        body: { identifier: 'alice_t', password: 'wrong' },
      });
      if (badLogin.status === 429) {
        got429 = true;
        break;
      }
    }
    assert.ok(got429, 'Expected 429 rate limit on rapid signin burst');
    console.log('[PASS] Auth rate limiting (429)');
  } finally {
    try {
      serverProc.kill();
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
    try {
      fs.rmSync(dataDir, { recursive: true, force: true });
    } catch {}
    try {
      fs.rmSync(updatesDir, { recursive: true, force: true });
    } catch {}
  }

  console.log('ALL REDSHIFT TESTS PASSED');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
