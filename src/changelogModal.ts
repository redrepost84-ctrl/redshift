import { createCloseIconSvg, openConfirmPopup } from './chatUi';
import { getDesktopBridge, type DesktopUpdateInfo } from './desktopBridge';
import { isTopmostModal } from './modalShortcuts';

export const CURRENT_REDSHIFT_VERSION = '0.1.21';
const LAST_SEEN_CHANGELOG_KEY = 'redshift.last_seen_changelog_version.v1';

function compareSemverVersion(a: string, b: string): number {
  const pa = String(a || '0.0.0').replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b || '0.0.0').replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length, 3);
  for (let i = 0; i < len; i += 1) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}

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
    version: '0.1.21',
    date: 'November 20, 2026',
    kicker: 'VOICE CALL ACTIVITIES & 6 BUILT-IN ONLINE GAMES',
    headline: 'Play Chess, Checkers, Minesweeper, VexilloGuessr, 8-Ball Pool & Quoridor Live in Calls',
    lead:
      'Added an Activities button to the voice call bar with a horizontally scrollable chat-bubble game launcher, stream-style join/watch tiles so nobody is forced into a game screen, and 6 built-in online multiplayer games with lobbies.',
    sections: [
      {
        heading: 'Built-In Multiplayer Games & Stream-Style Lobbies',
        items: [
          'Scrollable Chat-Bubble Game Launcher — Click the new Activities icon in the voice call bar to scroll left-to-right through built-in Redshift game logos.',
          'Stream-Style Activity Tiles — Active lobbies appear as compact tiles in the call stage. You are never forced to watch or play, and you can click Hide Game anytime to minimize the board without restarting or leaving your match.',
          '6 Online Multiplayer Games With Lobbies — Play competitive 1v1 Chess, Checkers, Minesweeper Race (first to flag all wins / first to hit a mine loses), VexilloGuessr (turn-based 4-choice world flag duel with 3 lives each), 8-Ball Pool, and 2–4 player Quoridor (1v1, 1v1v1, or 1v1v1v1).',
        ],
      },
    ],
  },
  {
    version: '0.1.20',
    date: 'November 20, 2026',
    kicker: 'STATUS REPLY DM FIX & IPHONE SAFE-AREA BACK BUTTON',
    headline: 'Fixed DM Threads With Status Replies + Easy-Reach iPhone Sign-Up Back Button',
    lead:
      'Fixed a rendering crash when opening DM threads containing custom status replies, and repositioned the Sign-Up & Auth back buttons well below the iOS status bar and top-down pull zone with an inline thumb-reachable Back option.',
    sections: [
      {
        heading: 'Bug Fixes & Mobile Polish',
        items: [
          'Fixed DM threads failing to render when a message replied to a friend’s custom status without a standard message reply reference.',
          'Repositioned the mobile Sign-Up and Reset Password Back button below the iPhone status bar / top pull-down drag zone and added an inline Back button directly below the form.',
        ],
      },
    ],
  },
  {
    version: '0.1.19',
    date: 'November 20, 2026',
    kicker: 'SEAMLESS CALL TRANSFER & CLEANER VC BAR',
    headline: 'Switch Calls Automatically Between PC & Phone + Removed Duplicate Stop Streaming Button',
    lead:
      'Joining a voice call on mobile while already in a call on PC (or vice versa) now automatically disconnects your previous device and seamlessly reconnects audio & video on the new device — and the VC control bar now shows only one End Stream button while sharing your screen.',
    sections: [
      {
        heading: 'Voice Call Improvements',
        items: [
          'Automatic PC ↔ Mobile Call Transfer — Joining the same or another call on a second device cleanly disconnects your previous device (no double audio or ghost participants) and re-establishes fresh WebRTC audio/video with everyone in the call.',
          'Fixed Duplicate Stop Streaming Button — Hid the redundant Share Screen toggle in the VC bar while actively streaming so only a single clear End Stream button appears (with live quality & source switching still available from the stream pill).',
        ],
      },
    ],
  },
  {
    version: '0.1.18',
    date: 'November 20, 2026',
    kicker: 'CLICKABLE PROFILE AVATARS (DESKTOP & MOBILE)',
    headline: 'Tap or Click Any Message Avatar or DM Header PFP to Open Their Full Profile',
    lead:
      'Clicking or tapping a user’s profile picture or name on any DM or group chat message, reply quote, or DM header now opens their full profile page instantly on both desktop and mobile.',
    sections: [
      {
        heading: 'What’s New',
        items: [
          'Clickable DM & Group Message PFPs — Tap or click any user’s avatar or display name on a message (or reply header) to inspect their full profile page (or your own full profile when tapping yourself).',
          'Clickable DM Header PFP — Tap or click the profile picture or name in any 1-on-1 DM top bar to jump straight into their full profile.',
        ],
      },
    ],
  },
  {
    version: '0.1.17',
    date: 'November 20, 2026',
    kicker: 'MOBILE COMPOSER, SEND BUTTON & PROFILE/SETTINGS POLISH',
    headline: 'Mobile Chat Send Button for All Media & Text + Full-Screen Un-Smooshed Mobile Settings & Profiles',
    lead:
      'Optimized the chat textbox for iPhone & Android with an instant red Send button whenever any text, audio, video, photo, file, or embed is inputted, fixed keyboard viewport handling, and rebuilt mobile User Settings & Profile screens into spacious full-width touch layouts.',
    sections: [
      {
        heading: 'Mobile Chat Composer & Send Button',
        items: [
          'Universal Send Button — Automatically appears the moment you enter text, links/embeds, emojis, images, videos, audio files, or any attachment so sending on iPhone & Android is effortless.',
          'Keyboard-Safe Mobile Textbox — Fixed 16px anti-zoom sizing, added dynamic visualViewport keyboard height sync so the chat box stays pinned cleanly above the keyboard, horizontal attachment scrolling, and extra textbox room while typing.',
        ],
      },
      {
        heading: 'Mobile Profile & Settings Overhaul',
        items: [
          'Native 2-Pane Mobile Settings — Replaced the squished 3-column desktop grid on phones with a full-screen Settings category menu and full-width detail pages with a sticky Back/Close header.',
          'Un-Smooshed Profile Modals — Full-width single-column Edit Profile & User Inspection sheets with 16px touch inputs, clean banner/avatar spacing, and fixed "Edit User Profile" launching properly from Mobile Settings.',
        ],
      },
    ],
  },
  {
    version: '0.1.16',
    date: 'November 20, 2026',
    kicker: 'MOBILE APP & REAL PHONE PUSH NOTIFICATIONS',
    headline: 'Installable iPhone & Android Mobile App (PWA), Flippable Built-In Camera, Full-Screen Share & Lock-Screen Push Alerts',
    lead:
      'Redshift now runs on iPhone and Android as a free fullscreen installable app at redrepost84-ctrl.github.io/redshift/app/ — with a redesigned mobile UI, flippable front/back phone camera, direct full-screen mobile share, and real lock-screen push notifications straight from our 24/7 Cloudflare server.',
    sections: [
      {
        heading: 'Mobile App Redesign',
        items: [
          'Discord-Mobile Layout — Bottom tab bar (Chats / Friends / You) with live unread & friend-request badges, full-screen keyboard-safe chat view (100dvh), left-edge swipe-back gesture, slide-over Profile & Member sheets, and long-press message action menus.',
          'Install on iPhone & Android for Free — Add to Home Screen via Safari (iOS) or Chrome (Android) for a fullscreen native-feeling app icon with automatic updates and zero App Store fees.',
        ],
      },
      {
        heading: 'Mobile Calls, Camera & Lock-Screen Push',
        items: [
          'Built-In Flippable Camera — Uses your phone’s built-in front/back lenses with a live Flip Camera toggle (seamless mid-call track swap, auto-mirroring only the selfie camera).',
          'Direct Full-Screen Mobile Share — Bypasses the desktop window chooser on mobile to share your full screen directly on Android (with a clear notice on iPhone Safari where Apple only permits watching streams).',
          'Real iPhone & Android Lock-Screen Notifications — Zero-cost RFC 8291 Web Push notifications sent directly from Cloudflare Workers for DMs, @mentions, friend requests, group adds, and incoming calls.',
        ],
      },
    ],
  },
  {
    version: '0.1.15',
    date: 'November 20, 2026',
    kicker: 'STREAMS, STATUS REPLIES & VOICE SOUNDS',
    headline: 'Click-to-Watch Blurred Stream Previews, Custom Status Replies & Full Call/Stream Sound Cues',
    lead:
      'Remote screen shares now stay blurred and muted until you click Watch to pop open the toggleable big screen, hovering any user’s custom status lets you reply directly from the top-right Reply button, and voice/stream sound effects now play for everyone in the call.',
    sections: [
      {
        heading: 'New Features',
        items: [
          'Click-to-Watch Screen Shares — Remote streams appear as a blurred dark-grey preview with a Watch button (with stream audio muted until you opt in). Clicking Watch pops open the big screen view that you can minimize/expand anytime or leave with Stop Watching.',
          'Hover Custom Status to Reply — Hovering over another user’s custom status in either their right-hand profile panel or user inspection profile popup reveals a top-right Reply button that opens an inline reply composer and sends a DM with their quoted custom status.',
          'Call & Stream Sound Effects for Everyone — Added synthesized audio cues for starting a stream, ending a stream, joining/rejoining a call, and leaving a call — heard by both you and everyone else in the call.',
        ],
      },
    ],
  },
  {
    version: '0.1.14',
    date: 'November 20, 2026',
    kicker: 'MESSAGE ORDERING, VC LEAVE & CLOUD EMAIL FIX',
    headline: 'Fixed Out-of-Order Sent Messages, Ghost VC Topbar After Leaving & Cloud Password Reset Emails',
    lead:
      'Fixed newly sent messages momentarily jumping above a friend’s message when a PC clock differs from the cloud server, fixed leaving a group call still showing you in the topbar, and enabled direct Gmail password reset delivery on the 24/7 Cloudflare server.',
    sections: [
      {
        heading: 'Bug Fixes',
        items: [
          'Fixed Out-of-Order Sent Messages — Synced client timestamps with server time, pinned local optimistic messages strictly after the latest visible message in the thread, and ensured confirmed messages always sort by authoritative server timestamp.',
          'Fixed Ghost Participant in VC Topbar After Leaving — Leaving a DM or group call immediately removes you from the VC topbar in 0ms, blocks stale in-flight vc:state frames from re-adding you, and broadcasts authoritative server state on every vc:leave.',
          '24/7 Cloud Password Reset Emails — Enabled direct Gmail SMTPS (port 465) delivery on the Cloudflare Workers backend so Forgot Password codes send in ~1 second from the cloud.',
        ],
      },
    ],
  },
  {
    version: '0.1.13',
    date: 'November 20, 2026',
    kicker: '24/7 PERMANENT CLOUD SERVER',
    headline: 'Moved Worldwide Redshift Server to 24/7 Cloudflare Edge — Never Goes Down on PC Sleep or Restart',
    lead:
      'Redshift now runs 24/7 on a permanent Cloudflare Workers + SQLite Durable Object server instead of temporary local PC tunnels. All accounts, group chats, messages, voice notes, GIFs, and videos stay online around the clock with sub-200ms global latency.',
    sections: [
      {
        heading: 'Always-On Cloud Infrastructure',
        items: [
          'Permanent 24/7 Cloud Endpoint — Migrated all 21 accounts, group chats, message history, active sessions, and uploaded media to Cloudflare Workers + SQLite Durable Objects so the server stays up 24/7 even when the host PC is turned off.',
          'Zero-Configuration Automatic Cutover — Clients automatically discover and fail over to the permanent 24/7 cloud endpoint even if GitHub raw lookup is temporarily slow or rate-limited.',
          'Global Edge Speed — Live snapshots load in under 200ms (~13 KB) with 1-year immutable cached /api/media images and full HTTP Range video streaming.',
        ],
      },
    ],
  },
  {
    version: '0.1.12',
    date: 'November 20, 2026',
    kicker: 'INSTANT REAL-TIME OVERHAUL',
    headline: '282x Lighter Snapshots, Instant 0ms DM Badges, Instant Call Rings & Immediate VC Topbar',
    lead:
      'Eliminated multi-megabyte inline base64 avatar/banner payloads that were stalling group chat messages, red unread badges, and incoming call popups behind 8–25 second WebSocket queues. Every server-driven update is now delivered instantaneously.',
    sections: [
      {
        heading: 'Real-Time Speed & Performance',
        items: [
          '282x Smaller Real-Time Payloads — Avatars, profile banners, and group icons are now served from immutable content-hashed /api/media endpoints instead of repeating megabytes of raw base64 inside every WebSocket sync and snapshot (shrinking live snapshots from 3.46 MB down to ~12 KB).',
          'WebSocket-First Dispatch & Dirty-Skip SQLite Saves — Live DMs, incoming call rings, and VC state broadcasts now flush directly over TCP_NODELAY WebSockets BEFORE disk persistence or secondary syncs, and SQLite skips rewriting unchanged collections.',
          'Dead-Socket Watchdog & Reduced Background Polling — Clients automatically detect silent half-open WebSockets after 35s with no frames and reconnect cleanly, while healthy connected clients stop hammering /api/auth/session every 5 seconds.',
        ],
      },
      {
        heading: 'Instant Notifications & Voice Calls',
        items: [
          'Instant 0ms DM & Group Unread Badges — Incoming WebSocket messages immediately increment the sidebar red notification badge and mention pill on the exact millisecond they arrive, without waiting for a follow-up snapshot.',
          'Instant VC Topbar When Joining From Call Messages — Joining a call via the header Call button, an incoming ring popup, or an inline group chat call log message immediately opens the VC topbar and sidebar call bar with zero delay.',
          'Eliminated Stale Ringing After Joining — Accepting or joining a call immediately clears the incoming ring popup and ringtone, and late vc:incoming frames for a call you are already in are strictly ignored.',
        ],
      },
    ],
  },
  {
    version: '0.1.11',
    date: 'November 20, 2026',
    kicker: 'FRIEND REQUESTS & CONNECTION SAFEGUARD',
    headline: 'Smarter Add Friend (@username & Display Name Support) & Local-DB Fallback Guard',
    lead:
      'Friend requests now accept @username (with or without the @ prefix) as well as unique display names, and desktop clients can no longer silently fall back to an empty local %AppData% database if worldwide server discovery is momentarily slow.',
    sections: [
      {
        heading: 'Improvements & Fixes',
        items: [
          'Smarter Add Friend Lookup — Typing @username (with a leading @) or a unique Display Name now finds the user instead of failing with "No user found" or "Enter a username, not an email address".',
          'Prevented Stranded Local Accounts — Desktop clients now retry worldwide server discovery before allowing Sign Up, Sign In, or Add Friend so new users never accidentally register inside an empty local %AppData% database.',
        ],
      },
    ],
  },
  {
    version: '0.1.10',
    date: 'November 19, 2026',
    kicker: 'CHAT SCROLL & NOTIFICATION FIX',
    headline: 'Eliminated Ghost Unread Badges & Random Scroll-Up Jumps When Switching DMs',
    lead:
      'Fixed unread notifications reappearing for messages you already read after switching to another DM, and fixed chats randomly opening scrolled up to the top instead of staying pinned at the latest message.',
    sections: [
      {
        heading: 'Bug Fixes',
        items: [
          'Fixed Ghost Unread Badges After Switching Chats — Replaced the single-thread 900ms read guard with per-thread read tracking, in-flight ACK protection, and automatic read clearing when scrolling to the bottom or switching away so background snapshot polls can never resurrect badges for messages you already read.',
          'Fixed Chats Randomly Opening Scrolled Up — Initial scroll positioning now always waits until the message list is mounted and measured in the DOM before positioning the unread divider or pinning to the bottom, preventing cached threads from getting stuck at scrollTop 0.',
          'Prevented Duplicate Notifications — Replayed or already-seen message IDs no longer re-trigger notification chimes or badges.',
        ],
      },
    ],
  },
  {
    version: '0.1.9',
    date: 'November 19, 2026',
    kicker: 'ONLINE SERVER PROTECTION & AUTO-HEALING',
    headline: 'Self-Healing Worldwide Tunnel & Account Database Safeguard',
    lead:
      'Prevented the desktop app from ever falling back onto an empty local database when the worldwide tunnel expires after sleep, and upgraded the worldwide host daemon with automatic 45-second tunnel health recovery.',
    sections: [
      {
        heading: 'Reliability & Safeguards',
        items: [
          'Protected Accounts From Empty Embedded Fallback — The desktop app will never spin up a fallback tunnel against an empty %AppData% database; it only ever connects to or tunnels the real worldwide server database.',
          'Auto-Healing Worldwide Tunnel Watchdog — The host server now checks live tunnel health every 45 seconds and automatically restores a fresh public endpoint after sleep or network changes with zero data loss.',
        ],
      },
    ],
  },
  {
    version: '0.1.8',
    date: 'November 19, 2026',
    kicker: 'AUTO-UPDATER ENGINE OVERHAUL',
    headline: '100% Reliable Detached Patch Swap & Automatic Relaunch After Updating',
    lead:
      'Replaced the detached PowerShell update swapper (which Windows killed when Electron exited, leaving the app closed on the old version) with a fully detached native Windows updater worker that reliably swaps app.asar and relaunches Redshift every single time.',
    sections: [
      {
        heading: 'Fixes',
        items: [
          'Fixed Launcher Closing Without Applying Update or Reopening — Replaced detached powershell.exe with a verified detached cmd.exe self-cleaning updater worker so every future auto-update cleanly replaces app.asar and automatically restarts Redshift.',
          'Updated One-Click RedshiftSetup.exe Installer — Rebuilt the official Windows installer with v0.1.8 and the fixed auto-updater engine baked directly in.',
        ],
      },
    ],
  },
  {
    version: '0.1.7',
    date: 'November 19, 2026',
    kicker: 'LAUNCHER & UPDATER RELIABILITY',
    headline: 'Clean App Shutdown (No Stuck Background Processes) & Fresh Manifest Auto-Updates',
    lead:
      'Fixed Redshift lingering invisibly in the background after closing (which prevented reopening from shortcuts), made clicking X cleanly close the app by default, and ensured every update check or retry always fetches a fresh release manifest without stale caching.',
    sections: [
      {
        heading: 'Fixes',
        items: [
          'Fixed App Not Reopening After Closing — Closing the main window or Launcher now cleanly destroys the tray, closes local server sockets, and exits Redshift completely so reopening from your Desktop shortcut works every time (Minimize to Tray is now opt-in in Settings).',
          'Fresh Cache-Busted Update Checks — Clicking Update or Retry now always fetches the latest release manifest with cache-busting instead of reusing a stale cached version.',
          'Atomic Backup-Protected Patch Swap — The updater now waits for all Redshift child processes to exit and preserves an automatic .bak fallback during app.asar replacement.',
        ],
      },
    ],
  },
  {
    version: '0.1.6',
    date: 'November 19, 2026',
    kicker: 'CRITICAL FIXES & INSTANT SYNC',
    headline: 'Persistent Keep Me Signed In, Protected GIFs, Instant Status Sync, Background Message Capture & Context Menus',
    lead:
      'Fixed "Keep me signed in" across full desktop restarts, stopped background cleanup from wiping uploaded GIFs, fixed the changelog version badge, made status & custom status updates instantaneous everywhere (including group chat sidebars), added Copy Image and Textbox right-click menus, fixed spoiler context menu sync, and enabled background message pre-caching.',
    sections: [
      {
        heading: 'Critical Bug Fixes',
        items: [
          'Fixed "HTTP 618" Auto-Updater Error — Pinned release manifests to direct GitHub asset URLs (instead of relative paths resolved against GitHub’s signed CDN) so updates download cleanly on every machine without rolling back.',
          'Removed Duplicate Bottom-Left Update Banner — Kept only the clean "Update Available" button in the top DM, Group Chat, and Friends header.',
          'Fixed "Keep Me Signed In" Across App Restarts — Pinned the desktop UI to a fixed local port and backed up persistent sessions in %AppData%\\Redshift so restarting or updating Redshift keeps you logged in automatically.',
          'Protected User-Submitted GIFs & Uploads — Stopped stale background cleanup from deleting uploaded files and filtered out broken ghost tiles so every uploaded GIF and media file stays permanently.',
          'Fixed Changelog Header Version Badge — Fixed sandboxed Electron preload version detection so the What’s New header always displays the true installed version instead of v0.1.0.',
          'Instant Status & Custom Status Sync Everywhere — Changing online/idle/DND/invisible or editing/clearing your custom status now updates in 0ms across your dock, profile card, and group chat right sidebars with zero flicker.',
          'Background Message Capture — Messages sent to other DMs and group chats are now pre-cached in the background before you open them so switching conversations shows the latest messages immediately with zero delay or sudden jump.',
          'Spoiler Context Menu Sync — Revealing a spoiler and right-clicking now immediately updates the context menu to offer "Hide Spoiler" (and "Reveal Spoiler" when hidden).',
        ],
      },
      {
        heading: 'New Quality-of-Life Features',
        items: [
          'Copy Image Context Menu — Right-click any image in chat or the full-screen lightbox and click "Copy Image" to copy the actual image directly to your clipboard.',
          'Textbox Right-Click Menu — Right-click the message composer or any text box to Cut, Copy, Paste (including pasted images!), and Select All.',
        ],
      },
    ],
  },
  {
    version: '0.1.5',
    date: 'November 19, 2026',
    kicker: 'UPDATER & CONNECTION RELIABILITY',
    headline: 'Clean In-App Auto-Updater & Seamless Automatic Server Reconnection',
    lead:
      'Fixed the Redshift Launcher garbled text bug during in-app updates by never mutating the active app package on disk and restarting into a clean launcher process, plus added automatic transparent tunnel reconnection so messaging never breaks when the online server updates.',
    sections: [
      {
        heading: 'Bug Fixes & Reliability',
        items: [
          'Fixed Launcher Turning Into Garbled CSS Text on Update — Stopped background publish jobs from overwriting an open desktop app’s active ASAR package and hardened the "Update Available" button to relaunch a fresh Redshift Launcher process cleanly before applying updates.',
          'Seamless Automatic Server Reconnection — All messaging, profile, upload, and realtime WebSocket calls now automatically re-discover and retry against the latest live worldwide server if the tunnel ever rotates, with zero need to restart Redshift.',
          'Zero-Downtime Backend Hot-Reload — Future server-side improvements can now reload the backend in place without changing the live public server URL.',
        ],
      },
    ],
  },
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
  const bridgeVer = getDesktopBridge()?.version?.trim() || '';
  if (bridgeVer && compareSemverVersion(bridgeVer, CURRENT_REDSHIFT_VERSION) >= 0) {
    return bridgeVer;
  }
  return CURRENT_REDSHIFT_VERSION;
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
