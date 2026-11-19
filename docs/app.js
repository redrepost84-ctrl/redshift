(() => {
  const REPO = 'redrepost84-ctrl/redshift';
  const DEFAULT_INSTALLER_URL = `https://github.com/${REPO}/releases/latest/download/RedshiftSetup.exe`;
  const FALLBACK_RELEASES = [
    {
      tag_name: 'v0.1.8',
      published_at: '2026-11-19T09:46:00Z',
      body: 'Overhauled the Windows auto-updater swapper with a verified detached worker so patches apply and relaunch reliably every time, and rebuilt the official v0.1.8 RedshiftSetup.exe one-click installer.',
      html_url: `https://github.com/${REPO}/releases/tag/v0.1.8`,
    },
    {
      tag_name: 'v0.1.7',
      published_at: '2026-11-19T09:26:00Z',
      body: 'Fixed Redshift lingering invisibly in the background after closing, made X cleanly exit by default (Minimize to Tray is now opt-in), and added cache-busted fresh update checks.',
      html_url: `https://github.com/${REPO}/releases/tag/v0.1.7`,
    },
    {
      tag_name: 'v0.1.6',
      published_at: '2026-11-19T08:56:00Z',
      body: 'Fixed Keep Me Signed In across restarts, protected user-submitted GIFs & uploads, added instant 0ms status & custom status sync across group sidebars, background message pre-caching, Copy Image, and textbox right-click Cut/Copy/Paste.',
      html_url: `https://github.com/${REPO}/releases/tag/v0.1.6`,
    },
    {
      tag_name: 'v0.1.4',
      published_at: '2026-11-19T08:05:00Z',
      body: 'Smooth progressive video streaming, universal 5-minute GIF creator with 0.25x-4x speed control, markdown bullet points, cleaner real-windows screen share picker, and smart DM scroll memory.',
      html_url: `https://github.com/${REPO}/releases/tag/v0.1.4`,
    },
  ];

  // 1. Subtle Ambient Starfield / Orbital Particles
  function initCosmosCanvas() {
    const canvas = document.getElementById('bg-cosmos');
    if (!(canvas instanceof HTMLCanvasElement)) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = 0;
    let height = 0;
    const stars = Array.from({ length: 64 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 0.7 + Math.random() * 1.5,
      vx: (Math.random() - 0.5) * 0.00009,
      vy: (Math.random() - 0.5) * 0.00009,
      tint: Math.random() < 0.24 ? 'rgba(255, 102, 108, ' : 'rgba(225, 230, 245, ',
      alpha: 0.16 + Math.random() * 0.35,
    }));

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      for (const s of stars) {
        s.x = (s.x + s.vx + 1) % 1;
        s.y = (s.y + s.vy + 1) % 1;
        ctx.fillStyle = `${s.tint}${s.alpha})`;
        ctx.beginPath();
        ctx.arc(s.x * width, s.y * height, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  }

  // 2. Interactive Redshift Desktop Preview Mockup
  function initInteractivePreview() {
    const messagesEl = document.getElementById('preview-messages');
    const titleEl = document.getElementById('preview-thread-title');
    const subEl = document.getElementById('preview-thread-sub');
    const composerHintEl = document.getElementById('preview-composer-hint');
    if (!messagesEl) return;

    const THREADS = {
      squad: {
        title: 'Squad Room',
        sub: '3 Members · Voice Live',
        hint: 'Message Squad Room',
        messages: [
          {
            author: 'Leyvora',
            avatarClass: 'preview-avatar--cyan',
            initial: 'L',
            time: 'Today at 1:42 AM',
            text: 'Just hopped on the 60fps stream — audio is crystal clear. New v0.1.8 update took like 4 seconds:',
            bullets: [
              'Zero-lag 1080p 60fps screen share with system audio',
              'Universal GIF creator supports MP4 & WAV up to 5:00 with speed control',
              'Background pre-caching loads every DM before you click it',
            ],
          },
          {
            author: 'LumpOfSoil',
            avatarClass: 'preview-avatar--amber',
            initial: 'S',
            time: 'Today at 1:44 AM',
            text: 'Check out this spoiler clip from tonight’s match (click the censor to reveal):',
            spoiler: {
              title: 'Clutch 1v4 Highlight Clip',
              sub: 'Click again anytime to re-blur the spoiler',
            },
          },
        ],
      },
      alex: {
        title: 'Leyvora',
        sub: '@leyvora · Online',
        hint: 'Message @leyvora',
        messages: [
          {
            author: 'Leyvora',
            avatarClass: 'preview-avatar--cyan',
            initial: 'L',
            time: 'Today at 1:18 AM',
            text: 'Yo I just uploaded a 2× sped-up catjam GIF straight from an MP4 inside Redshift GIFs.',
          },
          {
            author: 'You',
            avatarClass: 'preview-avatar--crimson',
            initial: 'R',
            time: 'Today at 1:19 AM',
            text: 'Sending the download link to the rest of the squad right now so they can join the voice call!',
          },
        ],
      },
      soil: {
        title: 'LumpOfSoil',
        sub: '@lumpofsoil3 · Do Not Disturb',
        hint: 'Message @lumpofsoil3',
        messages: [
          {
            author: 'LumpOfSoil',
            avatarClass: 'preview-avatar--amber',
            initial: 'S',
            time: 'Today at 12:55 AM',
            text: 'Grabbed RedshiftSetup.exe — Keep Me Signed In works across restarts and my status dot switches instantly now.',
          },
        ],
      },
    };

    const renderThread = (key) => {
      const thread = THREADS[key] || THREADS.squad;
      if (titleEl) titleEl.textContent = thread.title;
      if (subEl) subEl.textContent = thread.sub;
      if (composerHintEl) composerHintEl.textContent = thread.hint;

      messagesEl.replaceChildren();
      for (const msg of thread.messages) {
        const row = document.createElement('div');
        row.className = 'pmsg';

        const av = document.createElement('span');
        av.className = `preview-avatar preview-avatar--sm ${msg.avatarClass}`;
        av.textContent = msg.initial;
        row.appendChild(av);

        const body = document.createElement('div');
        body.className = 'pmsg-body';

        const head = document.createElement('div');
        head.className = 'pmsg-head';
        const author = document.createElement('span');
        author.className = 'pmsg-author';
        author.textContent = msg.author;
        const time = document.createElement('span');
        time.className = 'pmsg-time';
        time.textContent = msg.time;
        head.appendChild(author);
        head.appendChild(time);
        body.appendChild(head);

        const text = document.createElement('div');
        text.className = 'pmsg-text';
        text.textContent = msg.text;
        body.appendChild(text);

        if (Array.isArray(msg.bullets)) {
          const ul = document.createElement('ul');
          ul.className = 'pmsg-bullets';
          for (const b of msg.bullets) {
            const li = document.createElement('li');
            li.textContent = b;
            ul.appendChild(li);
          }
          body.appendChild(ul);
        }

        if (msg.spoiler) {
          const card = document.createElement('div');
          card.className = 'pmsg-spoiler-card';
          card.setAttribute('role', 'button');
          card.tabIndex = 0;
          card.title = 'Click to reveal or re-hide spoiler';

          const art = document.createElement('div');
          art.className = 'pmsg-spoiler-art';
          const artTitle = document.createElement('div');
          artTitle.className = 'pmsg-spoiler-art-title';
          artTitle.textContent = msg.spoiler.title;
          const artSub = document.createElement('div');
          artSub.className = 'pmsg-spoiler-art-sub';
          artSub.textContent = msg.spoiler.sub;
          art.appendChild(artTitle);
          art.appendChild(artSub);

          const overlay = document.createElement('div');
          overlay.className = 'pmsg-spoiler-overlay';
          const pill = document.createElement('span');
          pill.className = 'pmsg-spoiler-pill';
          pill.textContent = 'SPOILER';
          overlay.appendChild(pill);

          card.appendChild(art);
          card.appendChild(overlay);
          const toggleSpoiler = () => card.classList.toggle('is-revealed');
          card.addEventListener('click', toggleSpoiler);
          card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              toggleSpoiler();
            }
          });
          body.appendChild(card);
        }

        row.appendChild(body);
        messagesEl.appendChild(row);
      }
    };

    document.querySelectorAll('[data-preview-thread]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-preview-thread]').forEach((b) => {
          b.classList.toggle('preview-dm-item--active', b === btn);
        });
        renderThread(btn.getAttribute('data-preview-thread') || 'squad');
      });
    });

    const STATUS_META = {
      online: { label: 'Online', dotClass: 'preview-dot--online' },
      idle: { label: 'Idle', dotClass: 'preview-dot--idle' },
      dnd: { label: 'Do Not Disturb', dotClass: 'preview-dot--dnd' },
      invisible: { label: 'Invisible', dotClass: 'preview-dot--offline' },
    };

    const selfDot = document.getElementById('preview-self-dot');
    const selfStatusLabel = document.getElementById('preview-self-status-label');
    const memberSelfDot = document.getElementById('preview-member-self-dot');
    const memberSelfSub = document.getElementById('preview-member-self-sub');

    document.querySelectorAll('[data-set-status]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-set-status') || 'online';
        const meta = STATUS_META[key] || STATUS_META.online;
        document.querySelectorAll('[data-set-status]').forEach((b) => {
          b.classList.toggle('pstatus-btn--active', b === btn);
        });
        if (selfDot) selfDot.className = `preview-dot ${meta.dotClass}`;
        if (memberSelfDot) memberSelfDot.className = `preview-dot ${meta.dotClass}`;
        if (selfStatusLabel) selfStatusLabel.textContent = meta.label;
        if (memberSelfSub) memberSelfSub.textContent = key === 'invisible' ? 'Offline' : meta.label;
      });
    });

    renderThread('squad');
  }

  // 3. Copy Site Link & Copy SHA-256 Buttons
  let activeInstallerSha = '';
  function initCopyButtons() {
    const copySiteBtn = document.getElementById('copy-site-link-btn');
    const copySiteLabel = document.getElementById('copy-site-link-label');
    if (copySiteBtn && copySiteLabel) {
      copySiteBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(window.location.href);
          copySiteLabel.textContent = 'Copied Link!';
          setTimeout(() => {
            copySiteLabel.textContent = 'Copy Site Link';
          }, 2000);
        } catch (_) {}
      });
    }

    const copyShaBtn = document.getElementById('copy-sha-btn');
    const shaLabel = document.getElementById('hero-sha-label');
    if (copyShaBtn && shaLabel) {
      copyShaBtn.addEventListener('click', async () => {
        if (!activeInstallerSha) return;
        try {
          await navigator.clipboard.writeText(activeInstallerSha);
          const prev = shaLabel.textContent;
          shaLabel.textContent = 'SHA-256 Copied!';
          setTimeout(() => {
            shaLabel.textContent = prev;
          }, 2000);
        } catch (_) {}
      });
    }
  }

  // 4. Live Release Metadata & Changelog Hydration from GitHub Releases
  function formatBytesMB(bytes) {
    if (!bytes || !Number.isFinite(bytes)) return '121.5 MB';
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatDateShort(iso) {
    try {
      return new Date(iso).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch (_) {
      return '';
    }
  }

  function renderChangelogCards(releases) {
    const listEl = document.getElementById('changelog-list');
    if (!listEl) return;
    listEl.replaceChildren();

    releases.slice(0, 4).forEach((rel, idx) => {
      const card = document.createElement('article');
      card.className = idx === 0 ? 'release-card release-card--latest' : 'release-card';

      const top = document.createElement('div');
      top.className = 'release-card-top';

      const badges = document.createElement('div');
      badges.className = 'release-badges';
      const tag = document.createElement('span');
      tag.className = 'release-tag';
      tag.textContent = rel.tag_name || 'Release';
      badges.appendChild(tag);
      if (idx === 0) {
        const latest = document.createElement('span');
        latest.className = 'release-latest-pill';
        latest.textContent = 'LATEST';
        badges.appendChild(latest);
      }

      const date = document.createElement('span');
      date.className = 'release-date';
      date.textContent = formatDateShort(rel.published_at);

      top.appendChild(badges);
      top.appendChild(date);
      card.appendChild(top);

      const body = document.createElement('p');
      body.className = 'release-body';
      body.textContent = (rel.body || 'Bug fixes, performance upgrades, and stability improvements.').trim();
      card.appendChild(body);

      const link = document.createElement('a');
      link.className = 'release-link';
      link.href = rel.html_url || `https://github.com/${REPO}/releases`;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'View release on GitHub →';
      card.appendChild(link);

      listEl.appendChild(card);
    });
  }

  async function hydrateLatestRelease() {
    renderChangelogCards(FALLBACK_RELEASES);

    try {
      const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=6`, {
        headers: { Accept: 'application/vnd.github+json' },
      });
      if (!res.ok) return;
      const releases = await res.json();
      if (!Array.isArray(releases) || releases.length === 0) return;

      renderChangelogCards(releases);

      const latest = releases[0];
      const latestVer = String(latest.tag_name || 'v0.1.8').replace(/^v/i, '');
      const installerRelease = releases.find(
        (r) => Array.isArray(r.assets) && r.assets.some((a) => a.name === 'RedshiftSetup.exe'),
      );
      const installerAsset = installerRelease?.assets?.find((a) => a.name === 'RedshiftSetup.exe');
      const installerUrl = installerAsset?.browser_download_url || DEFAULT_INSTALLER_URL;
      const installerSize = formatBytesMB(installerAsset?.size);

      document.querySelectorAll('.js-download-link').forEach((el) => {
        if (el instanceof HTMLAnchorElement) {
          el.href = installerUrl;
        }
      });

      const navPill = document.getElementById('nav-version-pill');
      const heroBadge = document.getElementById('hero-release-badge');
      const heroMeta = document.getElementById('hero-download-meta');
      const footerDl = document.getElementById('footer-download-label');

      if (navPill) navPill.textContent = `v${latestVer}`;
      if (heroBadge) heroBadge.textContent = `Redshift v${latestVer} · Official Windows Desktop App · 100% Free`;
      if (heroMeta) heroMeta.textContent = `v${latestVer} · Windows 10/11 (64-bit) · ${installerSize}`;
      if (footerDl) footerDl.textContent = `Download Redshift v${latestVer} for Windows`;

      // Read exact SHA-256 & version metadata from same-origin docs/version.json (zero CORS / rate limits)
      try {
        const shaRes = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (shaRes.ok) {
          const manifest = await shaRes.json();
          if (manifest && typeof manifest.installerSha256 === 'string') {
            activeInstallerSha = manifest.installerSha256;
            const shaLabel = document.getElementById('hero-sha-label');
            if (shaLabel) {
              shaLabel.textContent = `SHA-256: ${activeInstallerSha.slice(0, 12)}…`;
            }
          }
        }
      } catch (_) {}
    } catch (_) {
      // Keep crisp fallback values silently
    }
  }

  // 5. Live Worldwide Server Health Probe (from online-server.json)
  async function probeWorldwideServer() {
    const dotEl = document.getElementById('server-status-dot');
    const textEl = document.getElementById('server-status-text');
    if (!dotEl || !textEl) return;

    try {
      const dirRes = await fetch(
        `https://raw.githubusercontent.com/${REPO}/main/online-server.json?t=${Date.now()}`,
        { cache: 'no-store' },
      );
      if (!dirRes.ok) throw new Error('Directory unavailable');
      const dir = await dirRes.json();
      const serverUrl = String(dir?.serverUrl || '').trim().replace(/\/+$/, '');
      if (!serverUrl) throw new Error('No live server URL');

      const t0 = performance.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        const healthRes = await fetch(`${serverUrl}/api/health`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const pingMs = Math.max(1, Math.round(performance.now() - t0));
        if (!healthRes.ok) throw new Error('Unhealthy');
        const health = await healthRes.json();
        if (health && health.ok) {
          dotEl.className = 'server-dot server-dot--online';
          const onlineCount = typeof health.onlineUsers === 'number' ? health.onlineUsers : null;
          textEl.textContent =
            onlineCount !== null && onlineCount > 0
              ? `Online · ${onlineCount} active · ${pingMs}ms`
              : `Worldwide Server Online · ${pingMs}ms`;
          return;
        }
      } finally {
        clearTimeout(timer);
      }
    } catch (_) {}

    dotEl.className = 'server-dot server-dot--offline';
    textEl.textContent = 'Downloads Ready 24/7';
  }

  initCosmosCanvas();
  initInteractivePreview();
  initCopyButtons();
  void hydrateLatestRelease();
  void probeWorldwideServer();
})();
