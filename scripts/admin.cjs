const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function loadEnvFile() {
  const envPath = path.join(ROOT, '.env');
  const map = {};
  if (!fs.existsSync(envPath)) return map;
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const k = trimmed.slice(0, eq).trim();
    const v = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    map[k] = v;
  }
  return map;
}

const envFile = loadEnvFile();
const PORT = Number(process.env.PORT) || 8080;
const ADMIN_SECRET = (
  process.env.REDSHIFT_ADMIN_SECRET ||
  envFile.REDSHIFT_ADMIN_SECRET ||
  ''
).trim();
const BASE_URL = (
  process.env.REDSHIFT_ADMIN_URL ||
  process.env.REDSHIFT_SERVER_URL ||
  envFile.REDSHIFT_SERVER_URL ||
  `http://127.0.0.1:${PORT}`
)
  .trim()
  .replace(/\/+$/, '');

const args = process.argv.slice(2);
const cmd = (args[0] || 'list').toLowerCase();

function getFlag(name) {
  const idx = args.indexOf(name);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

async function loadDirectSqliteDb() {
  const { createSqliteStore } = await import('../server/dbStore.js');
  const store = createSqliteStore(() => ({
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
  }));
  return { store, db: store.loadDb() };
}

async function callAdmin(pathUrl, method = 'GET', body = undefined) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (ADMIN_SECRET) headers['X-Admin-Secret'] = ADMIN_SECRET;

  try {
    const res = await fetch(`${BASE_URL}${pathUrl}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status !== 404 && res.status !== 401) {
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      return data;
    }
  } catch (err) {
    if (
      err &&
      err.message &&
      !err.message.includes('fetch failed') &&
      !err.message.includes('HTTP 404') &&
      !err.message.includes('HTTP 401') &&
      !err.message.includes('Not authenticated')
    ) {
      throw err;
    }
  }

  if (!BASE_URL.includes('127.0.0.1') && !BASE_URL.includes('localhost')) {
    throw new Error(`Could not reach remote Redshift admin API at ${BASE_URL}`);
  }

  // Direct local SQLite fallback when running against localhost without live /api/admin routes
  const { store, db } = await loadDirectSqliteDb();
  try {
    if (pathUrl === '/api/admin/accounts') {
      const accounts = db.accounts.map((acc) => {
        const uKey = acc.username.toLowerCase();
        const activeSessions = Object.values(db.sessions || {}).filter((v) => v === uKey).length;
        return {
          username: acc.username,
          displayName: acc.displayName,
          email: acc.email,
          bio: acc.bio || '',
          status: acc.status || 'online',
          online: activeSessions > 0,
          createdAt: acc.createdAt,
          friends: db.friendships?.[uKey] ?? [],
          activeSessions,
        };
      });
      return { ok: true, total: accounts.length, accounts };
    }
    throw new Error('Start the Redshift server to apply live mutations');
  } finally {
    store.close();
  }
}

async function main() {
  if (cmd === 'stats') {
    const data = await callAdmin('/api/admin/stats');
    console.log(`\n=== Redshift Cloud Server Stats (${BASE_URL}) ===`);
    console.log(`Accounts:       ${data.accounts}`);
    console.log(`Group Chats:    ${data.groupDms}`);
    console.log(`Messages:       ${data.messages}`);
    console.log(`Sessions:       ${data.sessions}`);
    console.log(`Online Users:   ${data.onlineUsers}`);
    console.log(`Uploaded Blobs: ${data.uploadedBlobs} (${data.uploadedBlobBytes} bytes)`);
    console.log('');
    return;
  }

  if (cmd === 'list') {
    const data = await callAdmin('/api/admin/accounts');
    console.log(`\n=== Redshift Live Accounts (${data.total}) [${BASE_URL}] ===`);
    for (const acc of data.accounts) {
      const onlineTag = acc.online ? 'ONLINE ' : 'offline';
      console.log(
        `- @${acc.username} (${acc.displayName}) | ${acc.email} | [${onlineTag} / ${acc.status}] | friends: ${acc.friends.length} | sessions: ${acc.activeSessions}`,
      );
    }
    console.log('');
    return;
  }

  if (cmd === 'update') {
    const username = args[1];
    if (!username) {
      console.error(
        'Usage: node scripts/admin.cjs update <username> [--displayName "..."] [--email "..."] [--password "..."] [--bio "..."] [--status online|idle|dnd|invisible]',
      );
      process.exit(1);
    }
    const payload = {
      username,
      displayName: getFlag('--displayName'),
      email: getFlag('--email'),
      newPassword: getFlag('--password'),
      bio: getFlag('--bio'),
      status: getFlag('--status'),
    };
    const data = await callAdmin('/api/admin/accounts/update', 'POST', payload);
    console.log('[Admin] Updated account in real time:', data.account);
    return;
  }

  if (cmd === 'kick') {
    const username = args[1];
    if (!username) {
      console.error('Usage: node scripts/admin.cjs kick <username>');
      process.exit(1);
    }
    const data = await callAdmin('/api/admin/accounts/kick', 'POST', { username });
    console.log(
      `[Admin] Kicked @${data.username} (revoked ${data.revokedSessions} sessions, closed ${data.closedSockets} sockets)`,
    );
    return;
  }

  if (cmd === 'delete') {
    const username = args[1];
    if (!username) {
      console.error('Usage: node scripts/admin.cjs delete <username>');
      process.exit(1);
    }
    const data = await callAdmin('/api/admin/accounts/delete', 'POST', { username });
    console.log(`[Admin] Deleted account @${data.deletedUsername} in real time.`);
    return;
  }

  console.log('Redshift Moderator CLI Commands:');
  console.log('  node scripts/admin.cjs stats');
  console.log('  node scripts/admin.cjs list');
  console.log(
    '  node scripts/admin.cjs update <username> [--displayName "..."] [--email "..."] [--password "..."] [--bio "..."] [--status online|idle|dnd|invisible]',
  );
  console.log('  node scripts/admin.cjs kick <username>');
  console.log('  node scripts/admin.cjs delete <username>');
}

main().catch((err) => {
  console.error('[Admin Error]', err.message);
  process.exit(1);
});
