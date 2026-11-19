import { createCloseIconSvg, openConfirmPopup } from './chatUi';
import { getDesktopBridge, type DesktopUpdateInfo } from './desktopBridge';
import { isTopmostModal } from './modalShortcuts';

export const CURRENT_REDSHIFT_VERSION = '0.1.4';
const LAST_SEEN_CHANGELOG_KEY = 'redshift.last_seen_changelog_version.v1';

export interface ChangelogReleaseSection {
  heading: string;
  items: string[];
}

export interface ChangelogReleaseArticle {
  version: string;
  date: string;
  kicker: string;
  headline: string;
  lead: string;
  sections: ChangelogReleaseSection[];
}

export const REDSHIFT_CHANGELOG_ARTICLES: ChangelogReleaseArticle[] = [
  {
    version: '0.1.4',
    date: 'November 18, 2026',
    kicker: 'MAJOR QUALITY & MEDIA UPDATE',
    headline: 'Smooth Video Playback, Universal GIF Creator with Speed Control & Instant Status Sync',
    lead:
      'Fixed video embed playback stalls and app freezing, upgraded Redshift GIFs to support every video and audio format up to 5 minutes with live playback speed control, added bullet-point formatting, and made status, bio, and profile syncing instantaneous.',
    sections: [
      {
        heading: 'New Features',
        items: [
          'Universal GIF Creator (Up to 5 Minutes) — Upload .mp4, .webm, .mov, .mkv, .avi, .wav, .mp3, .gif, and image files directly into Redshift GIFs with automatic 5-minute duration protection.',
          'GIF Playback Speed Control — Adjust playback speed from 0.25× up to 4× (with instant quick-speed pills and live preview) right while creating your GIF.',
          'Markdown Bullet Points — Start any line with * text (or - text) to turn the asterisk into a clean bullet point.',
        ],
      },
      {
        heading: 'Bug Fixes & Stability',
        items: [
          'Fixed Video Embed Freezing & Infinite Loading — Added progressive 2 MB chunked streaming and automatic VP8/Opus WebM compatibility transcoding so every video plays smoothly in the desktop app without freezing.',
          'Fixed Broken GIF Full-Screen Lightbox — Clicking any GIF now resolves the live server URL properly and plays both animated GIFs and video-GIFs cleanly in full view.',
          'Instant Zero-Flicker Status & Live Profile Refresh — Switching between Online, Idle, Do Not Disturb, and Invisible now updates instantaneously with zero flicker back to your previous status, and friend bios, avatars, banners, and colored online dots refresh live across the entire app.',
          'Cleaner Screen Share Modal & Single End Stream Button — Removed placeholder "Window Picker" cards so only your real open windows and displays appear, and removed the duplicate End Stream button when streaming.',
          'Smart DM Scroll Position — Forwarding messages or opening DMs now lands cleanly at the bottom (even as images load) and remembers your exact scroll position when switching between conversations.',
          'Removed Floating Eye Icon on Chat Images — Spoiler toggling stays cleanly inside the right-click menu and composer attachment bar instead of floating near profile pictures.',
        ],
      },
    ],
  },
  {
    version: '0.1.3',
    date: 'November 18, 2026',
    kicker: 'OFFICIAL RELEASE NOTES',
    headline: 'Worldwide Online Mode, Heavy Media Spoiler Censors & Release Notes',
    lead:
      'Redshift now connects everyone around the world automatically on startup, adds a physical heavy-blur media spoiler censor that auto-scales to every image, and introduces an in-app Update Available header prompt and release notes reader.',
    sections: [
      {
        heading: 'What’s New',
        items: [
          'Post-Update Release Notes Reader — Every time Redshift updates, this scrollable changelog article opens automatically once you are signed in so you can see everything that changed.',
          'Header "Update Available" Button & Restart Prompt — When a new update is published while you are chatting, an "Update Available" button appears right in the top header bar and asks if you would like to restart to apply it.',
          'Seamless Worldwide Online Multiplayer — Redshift automatically discovers and connects to the live worldwide server on startup with zero manual links or lobby codes.',
          'Real-Time Moderator Account Authority — Host-only loopback moderator tools allow monitoring, updating, kicking, or deleting accounts in real time.',
        ],
      },
      {
        heading: 'Bug Fixes & Polish',
        items: [
          'Fixed Friend Profile Inspection Interactions — Mutual Friends, Mutual Groups, and the top-right user options menu on friend profiles now respond immediately when connected to the worldwide online server.',
          'Heavy Censor Media Spoilers — Spoiler images and videos now apply a deep physical blur + darkened censor layer that auto-scales tightly to the exact dimensions of the image until clicked.',
          'Group Chat Sidebar Leave (×) Button — Added a hover × button on the right side of every group chat in your DM list so you can leave group chats without right-clicking.',
          'Official 2048×2048 Redshift Icon — Applied across the Windows installer, taskbar, system tray, and animated Redshift Launcher.',
        ],
      },
    ],
  },
  {
    version: '0.1.2',
    date: 'November 18, 2026',
    kicker: 'DESKTOP LAUNCHER UPDATE',
    headline: 'Instant Window Startup & Background Auto-Updater',
    lead:
      'Improved launcher-to-desktop handoff and non-blocking background update checks for the standalone Windows app.',
    sections: [
      {
        heading: 'Improvements',
        items: [
          'Eliminated startup delay when transitioning from the animated Redshift Launcher splash window to the main Redshift window.',
          'Added lightweight SHA-256-verified delta patches (Redshift-patch.asar) so updates download in seconds without reinstalling.',
          'Added Windows System Tray support with live unread message counters and minimize-to-tray.',
        ],
      },
    ],
  },
];

let activeChangelogBackdrop: HTMLElement | null = null;

export function getActiveAppVersion(): string {
  return getDesktopBridge()?.version || CURRENT_REDSHIFT_VERSION;
}

export function closeChangelogModal(): void {
  if (activeChangelogBackdrop) {
    activeChangelogBackdrop.remove();
    activeChangelogBackdrop = null;
  }
}

/**
 * Opens the scrollable news-article style Changelog modal with a top-right X close button.
 */
export function openChangelogModal(versionOverride?: string): void {
  closeChangelogModal();

  const currentVersion = versionOverride || getActiveAppVersion();
  try {
    window.localStorage.setItem(LAST_SEEN_CHANGELOG_KEY, currentVersion);
  } catch {
    // Ignore storage errors.
  }

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop modal-backdrop--deep modal-backdrop--top modal-backdrop--visible changelog-modal-backdrop';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-label', `Redshift v${currentVersion} What's New Changelog`);

  const card = document.createElement('article');
  card.className = 'modal-card changelog-article-modal';

  // Top sticky editorial header with top-right X close button
  const header = document.createElement('header');
  header.className = 'changelog-article-header';

  const headerTextCol = document.createElement('div');
  headerTextCol.className = 'changelog-article-header-copy';

  const badgeRow = document.createElement('div');
  badgeRow.className = 'changelog-article-badge-row';

  const kickerPill = document.createElement('span');
  kickerPill.className = 'changelog-article-kicker';
  kickerPill.textContent = "WHAT'S NEW";

  const verPill = document.createElement('span');
  verPill.className = 'changelog-article-version-pill';
  verPill.textContent = `v${currentVersion}`;

  const dateSpan = document.createElement('span');
  dateSpan.className = 'changelog-article-date';
  dateSpan.textContent = REDSHIFT_CHANGELOG_ARTICLES[0]?.date || 'November 2026';

  badgeRow.appendChild(kickerPill);
  badgeRow.appendChild(verPill);
  badgeRow.appendChild(dateSpan);

  const mainTitle = document.createElement('h1');
  mainTitle.className = 'changelog-article-title';
  mainTitle.textContent =
    REDSHIFT_CHANGELOG_ARTICLES[0]?.headline || `Redshift v${currentVersion} Update`;

  headerTextCol.appendChild(badgeRow);
  headerTextCol.appendChild(mainTitle);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'changelog-close-btn';
  closeBtn.dataset.action = 'close-changelog';
  closeBtn.title = 'Close Changelog';
  closeBtn.setAttribute('aria-label', 'Close Changelog');
  closeBtn.appendChild(createCloseIconSvg(16));

  header.appendChild(headerTextCol);
  header.appendChild(closeBtn);
  card.appendChild(header);

  // Scrollable news-article body
  const scrollBody = document.createElement('div');
  scrollBody.className = 'changelog-article-scroll';

  REDSHIFT_CHANGELOG_ARTICLES.forEach((article, idx) => {
    const entry = document.createElement('section');
    entry.className =
      idx === 0
        ? 'changelog-article-entry changelog-article-entry--featured'
        : 'changelog-article-entry';

    if (idx > 0) {
      const subHead = document.createElement('div');
      subHead.className = 'changelog-article-subhead';
      const subVer = document.createElement('span');
      subVer.className = 'changelog-article-version-pill';
      subVer.textContent = `v${article.version}`;
      const subTitle = document.createElement('h2');
      subTitle.className = 'changelog-article-entry-title';
      subTitle.textContent = article.headline;
      subHead.appendChild(subVer);
      subHead.appendChild(subTitle);
      entry.appendChild(subHead);
    }

    const lead = document.createElement('p');
    lead.className = 'changelog-article-lead';
    lead.textContent = article.lead;
    entry.appendChild(lead);

    for (const sec of article.sections) {
      const secBlock = document.createElement('div');
      secBlock.className = 'changelog-article-section';

      const h3 = document.createElement('h3');
      h3.className = 'changelog-article-section-heading';
      h3.textContent = sec.heading;
      secBlock.appendChild(h3);

      const ul = document.createElement('ul');
      ul.className = 'changelog-article-list';
      for (const itemText of sec.items) {
        const li = document.createElement('li');
        li.className = 'changelog-article-list-item';
        const dashIdx = itemText.indexOf(' — ');
        if (dashIdx > 0) {
          const strong = document.createElement('strong');
          strong.textContent = itemText.slice(0, dashIdx);
          li.appendChild(strong);
          li.appendChild(document.createTextNode(itemText.slice(dashIdx)));
        } else {
          li.textContent = itemText;
        }
        ul.appendChild(li);
      }
      secBlock.appendChild(ul);
      entry.appendChild(secBlock);
    }

    scrollBody.appendChild(entry);
  });

  card.appendChild(scrollBody);
  backdrop.appendChild(card);

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    window.removeEventListener('keydown', onKeyDown, true);
    backdrop.remove();
    if (activeChangelogBackdrop === backdrop) {
      activeChangelogBackdrop = null;
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!isTopmostModal(backdrop)) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      close();
    }
  };

  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) {
      close();
    }
  });
  window.addEventListener('keydown', onKeyDown, true);

  activeChangelogBackdrop = backdrop;
  document.body.appendChild(backdrop);
}

/**
 * Automatically shows the post-update Changelog modal when the user opens the app after an update (if logged in).
 */
export function maybeShowPostUpdateChangelog(): void {
  const currentVersion = getActiveAppVersion();
  const isElectron = Boolean(getDesktopBridge());
  const currentPort = Number(window.location.port) || 0;
  const isAutomatedTestPort = currentPort >= 18000 && currentPort < 19000;

  let lastSeen: string | null = null;
  try {
    lastSeen = window.localStorage.getItem(LAST_SEEN_CHANGELOG_KEY);
  } catch {
    lastSeen = null;
  }

  if (lastSeen === currentVersion) {
    return;
  }

  // On automated test port, only auto-open if lastSeen was previously set to an older version
  if (isAutomatedTestPort && !lastSeen) {
    try {
      window.localStorage.setItem(LAST_SEEN_CHANGELOG_KEY, currentVersion);
    } catch {}
    return;
  }

  if (isElectron || lastSeen !== currentVersion) {
    openChangelogModal(currentVersion);
  }
}

// Shared reactive state for the Header "Update Available" button across all views
let latestDetectedUpdate: DesktopUpdateInfo | null = null;
const updateListeners = new Set<(info: DesktopUpdateInfo | null) => void>();

export function notifyHeaderUpdateAvailable(info: DesktopUpdateInfo): void {
  if (!info || !info.updateAvailable) return;
  latestDetectedUpdate = info;
  for (const cb of updateListeners) {
    cb(latestDetectedUpdate);
  }
}

export function getLatestDetectedUpdate(): DesktopUpdateInfo | null {
  return latestDetectedUpdate;
}

if (typeof window !== 'undefined') {
  window.addEventListener('redshift:update-available', ((e: CustomEvent<DesktopUpdateInfo>) => {
    if (e.detail && e.detail.updateAvailable) {
      notifyHeaderUpdateAvailable(e.detail);
    }
  }) as EventListener);
}

export async function promptUpdateRestartModal(info?: DesktopUpdateInfo | null): Promise<void> {
  const targetInfo = info || latestDetectedUpdate;
  const ver = targetInfo?.latestVersion || 'New Version';
  const notes = targetInfo?.changelog ? `\n\nWhat's included: ${targetInfo.changelog}` : '';
  const confirmed = await openConfirmPopup({
    title: `Update Available (v${ver})`,
    message: `A new Redshift update (v${ver}) is ready to install. Would you like to restart now to apply the update?${notes}`,
    confirmLabel: 'Restart & Update',
    danger: false,
  });
  if (!confirmed) {
    return;
  }
  const bridge = getDesktopBridge();
  if (bridge) {
    bridge.initiateUpdate();
  } else {
    window.location.reload();
  }
}

/**
 * Creates the top-header "Update Available" button that opens the "Update Available — Would you like to restart?" popup.
 */
export function createHeaderUpdateAvailableButton(): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'header-update-avail-btn';
  btn.dataset.action = 'header-update-available';
  btn.hidden = !latestDetectedUpdate;

  const dot = document.createElement('span');
  dot.className = 'header-update-avail-dot';

  const label = document.createElement('span');
  label.className = 'header-update-avail-label';

  const syncBtn = (info: DesktopUpdateInfo | null) => {
    if (info && info.updateAvailable) {
      btn.hidden = false;
      label.textContent = info.latestVersion
        ? `Update Available (v${info.latestVersion})`
        : 'Update Available';
      btn.title = `Click to install Redshift v${info.latestVersion || ''} and restart`;
    } else {
      btn.hidden = true;
    }
  };

  syncBtn(latestDetectedUpdate);
  btn.appendChild(dot);
  btn.appendChild(label);

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    void promptUpdateRestartModal(latestDetectedUpdate);
  });

  const listener = (info: DesktopUpdateInfo | null) => {
    if (!btn.isConnected) {
      updateListeners.delete(listener);
      return;
    }
    syncBtn(info);
  };
  updateListeners.add(listener);

  return btn;
}
