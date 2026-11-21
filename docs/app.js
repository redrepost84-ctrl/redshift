(() => {
  const REPO = 'redrepost84-ctrl/redshift';
  const DEFAULT_INSTALLER_URL = `https://github.com/${REPO}/releases/latest/download/RedshiftSetup.exe`;
  const FALLBACK_RELEASES = [
    {
      tag_name: 'v0.1.22',
      published_at: '2026-11-21T06:43:00Z',
      body: 'Overhauled Voice Call Activities: Fixed 8x8 Chess & Checkers tiles with rank/file coordinates (1–8, a–h), flanking Left & Right Taken Pieces trays, and smooth piece animations; redesigned 8-Ball Pool with pull-back-on-ball strike force physics & raycast deflection guides; added live split-screen Minesweeper spectator boards; ensured VexilloGuessr never repeats previous flags; added mutual rematch voting; and auto-cancelled lobbies when a seated player leaves.',
      html_url: `https://github.com/${REPO}/releases/tag/v0.1.22`,
    },
    {
      tag_name: 'v0.1.21',
      published_at: '2026-11-21T06:09:00Z',
      body: 'Voice Call Activities: Added an Activities button in the VC bar with a horizontally scrollable chat-bubble game launcher, stream-style join/watch/hide tiles so nobody is forced into a game screen or forced to restart, and 6 built-in online multiplayer games with lobbies (Chess, Checkers, Minesweeper Race, VexilloGuessr, 8-Ball Pool, and 2–4 player Quoridor).',
      html_url: `https://github.com/${REPO}/releases/tag/v0.1.21`,
    },
    {
      tag_name: 'v0.1.20',
      published_at: '2026-11-21T05:18:00Z',
      body: 'Fixed DM threads with custom status replies failing to appear on desktop and mobile, and repositioned the iPhone Sign-Up/Auth Back button safely below the iOS top pull-down drag zone with an inline thumb-reachable Back button.',
      html_url: `https://github.com/${REPO}/releases/tag/v0.1.20`,
    },
    {
      tag_name: 'v0.1.19',
      published_at: '2026-11-21T04:40:00Z',
      body: 'Seamless PC ↔ Mobile voice call transfer (joining a call on another device automatically disconnects the previous device cleanly and reconnects WebRTC), plus removed the duplicate stop streaming button from the VC controls bar.',
      html_url: `https://github.com/${REPO}/releases/tag/v0.1.19`,
    },
    {
      tag_name: 'v0.1.18',
      published_at: '2026-11-21T04:10:00Z',
      body: 'Desktop & Mobile: Clicking or tapping any user’s profile picture or name on DM/group messages, reply quotes, or the DM header now opens their full profile page.',
      html_url: `https://github.com/${REPO}/releases/tag/v0.1.18`,
    },
    {
      tag_name: 'v0.1.17',
      published_at: '2026-11-21T03:58:00Z',
      body: 'Mobile polish: added a universal red Send button in the chat box whenever any text, audio, video, image, file, or embed is inputted; optimized iPhone & Android keyboard sizing and viewport lift; and rebuilt mobile User Settings and Profile modals into full-width un-smooshed touch layouts.',
      html_url: `https://github.com/${REPO}/releases/tag/v0.1.17`,
    },
    {
      tag_name: 'v0.1.16',
      published_at: '2026-11-21T03:40:00Z',
      body: 'Full Mobile App Support (iPhone & Android PWA): Discord-mobile bottom nav (Chats/Friends/You), full-screen chat with edge-swipe back & long-press menus, flippable front/back phone camera, direct full-screen mobile share, and real lock-screen Web Push notifications from Cloudflare.',
      html_url: `https://github.com/${REPO}/releases/tag/v0.1.16`,
    },
    {
      tag_name: 'v0.1.15',
      published_at: '2026-11-21T03:10:00Z',
      body: 'Click-to-watch blurred grey stream previews with toggleable big screen & Stop Watching, hover-to-reply top-right button on custom statuses in profile panels & inspection popups, and sound effects for starting/ending streams and joining/rejoining/leaving calls for everyone in the call.',
      html_url: `https://github.com/${REPO}/releases/tag/v0.1.15`,
    },
    {
      tag_name: 'v0.1.14',
      published_at: '2026-11-21T02:45:00Z',
      body: 'Fixed sent messages jumping above a friend’s message due to PC-to-server clock skew, fixed leaving a group call still showing you in the VC topbar, and enabled 24/7 Gmail password reset emails on Cloudflare.',
      html_url: `https://github.com/${REPO}/releases/tag/v0.1.14`,
    },
    {
      tag_name: 'v0.1.13',
      published_at: '2026-11-20T23:00:00Z',
      body: 'Permanent 24/7 Cloud Server: migrated Redshift to Cloudflare Workers + SQLite Durable Objects so chats, voice calls, GIFs, and uploads stay online 24/7 even when the host PC is off or restarted.',
      html_url: `https://github.com/${REPO}/releases/tag/v0.1.13`,
    },
    {
      tag_name: 'v0.1.12',
      published_at: '2026-11-20T21:55:00Z',
      body: 'Instant real-time DMs, notifications & calls: replaced 3.46 MB inline base64 snapshot payloads with immutable cached /api/media endpoints (282x smaller), prioritized WebSocket delivery before DB flush, added 0ms DM unread badges and 0ms optimistic VC topbar on join, and fixed delayed ringing after joining calls.',
      html_url: `https://github.com/${REPO}/releases/tag/v0.1.12`,
    },
    {
      tag_name: 'v0.1.11',
      published_at: '2026-11-20T21:22:00Z',
      body: 'Add Friend now accepts @username (with leading @) and unique Display Names, and desktop clients are guarded against silently falling back to an empty local %AppData% database.',
      html_url: `https://github.com/${REPO}/releases/tag/v0.1.11`,
    },
    {
      tag_name: 'v0.1.10',
      published_at: '2026-11-20T00:58:00Z',
      body: 'Fixed ghost unread DM notification badges reappearing for already-read messages when switching chats, and fixed cached DMs randomly opening scrolled up to the top instead of pinned at the latest message.',
      html_url: `https://github.com/${REPO}/releases/tag/v0.1.10`,
    },
    {
      tag_name: 'v0.1.9',
      published_at: '2026-11-20T00:25:00Z',
      body: 'Protected accounts from empty local fallback tunnels after PC sleep/idle and added an automatic self-healing Cloudflare tunnel watchdog to keep the worldwide server reachable continuously.',
      html_url: `https://github.com/${REPO}/releases/tag/v0.1.9`,
    },
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

  // 2. Copy Site Link & Copy SHA-256 Buttons
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
  initCopyButtons();
  void hydrateLatestRelease();
  void probeWorldwideServer();
})();
