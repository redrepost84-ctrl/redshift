import { getUserPreferences } from './settingsStore';
import type { UserStatus } from './types';

let gestureListenerAttached = false;
let toastStackEl: HTMLDivElement | null = null;
const MAX_VISIBLE_TOASTS = 4;

/** Returns true only when the Redshift tab is both visible and actively focused. */
export function isAppWindowFocused(): boolean {
  if (typeof document === 'undefined') {
    return false;
  }
  return document.visibilityState === 'visible' && document.hasFocus();
}

/** Requests browser desktop notification permission on the first user gesture if undecided. */
export function ensureNotificationPermissionOnGesture(): void {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return;
  }
  if (Notification.permission !== 'default' || gestureListenerAttached) {
    return;
  }

  gestureListenerAttached = true;
  window.addEventListener(
    'pointerdown',
    () => {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        void Notification.requestPermission().catch(() => {});
      }
    },
    { once: true, capture: true },
  );
}

export function truncateNotificationText(text: string, maxChars = 110): string {
  const singleLine = text.replace(/\s+/g, ' ').trim();
  if (singleLine.length <= maxChars) {
    return singleLine;
  }
  return `${singleLine.slice(0, Math.max(1, maxChars - 3)).trimEnd()}...`;
}

/**
 * Shows a native OS desktop notification while respecting Do Not Disturb mode,
 * preferences, and automatically suppressing when the Redshift window is focused.
 */
export function sendDesktopNotification(options: {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  userStatus?: UserStatus;
  force?: boolean;
  allowWhenFocused?: boolean;
  onClick?: () => void;
}): void {
  if (!options.allowWhenFocused && isAppWindowFocused()) {
    return;
  }
  if (!options.force && !getUserPreferences().desktopNotifications) {
    return;
  }
  if (!options.force && options.userStatus === 'dnd') {
    return;
  }
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return;
  }
  if (Notification.permission !== 'granted') {
    return;
  }

  try {
    const notif = new Notification(options.title, {
      body: truncateNotificationText(options.body, 140),
      icon: options.icon,
      tag: options.tag,
    });

    notif.onclick = () => {
      try {
        window.focus();
      } catch {
        // Focus may be ignored by some embedded webviews
      }
      notif.close();
      options.onClick?.();
    };

    window.setTimeout(() => {
      notif.close();
    }, 6000);
  } catch {
    // Ignore notification errors in restricted contexts
  }
}

function ensureToastStack(): HTMLDivElement {
  if (toastStackEl && toastStackEl.isConnected) {
    return toastStackEl;
  }
  toastStackEl = document.createElement('div');
  toastStackEl.className = 'rs-toast-stack';
  toastStackEl.setAttribute('aria-live', 'polite');
  document.body.appendChild(toastStackEl);
  return toastStackEl;
}

/**
 * Displays a compact built-in slide-in notification card in the bottom-right corner
 * with avatar/group icon, sender/group title, and truncated message preview.
 */
export function showInAppToast(options: {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  danger?: boolean;
  durationMs?: number;
  onClick?: () => void;
}): void {
  if (typeof document === 'undefined' || !document.body) {
    return;
  }

  const stack = ensureToastStack();
  while (stack.childElementCount >= MAX_VISIBLE_TOASTS) {
    stack.firstElementChild?.remove();
  }

  const card = document.createElement('div');
  card.className = options.danger ? 'rs-toast-card rs-toast-card--danger' : 'rs-toast-card';
  card.setAttribute('role', 'status');

  if (options.icon) {
    const av = document.createElement('img');
    av.className = 'rs-toast-avatar';
    av.src = options.icon;
    av.alt = options.title;
    card.appendChild(av);
  } else {
    const fallbackAv = document.createElement('div');
    fallbackAv.className = 'rs-toast-avatar rs-toast-avatar--fallback';
    fallbackAv.textContent = (options.title.trim()[0] || 'R').toUpperCase();
    card.appendChild(fallbackAv);
  }

  const content = document.createElement('div');
  content.className = 'rs-toast-content';

  const headerRow = document.createElement('div');
  headerRow.className = 'rs-toast-header';

  const titleEl = document.createElement('div');
  titleEl.className = 'rs-toast-title';
  titleEl.textContent = options.title;
  headerRow.appendChild(titleEl);

  if (options.badge) {
    const badgeEl = document.createElement('span');
    badgeEl.className = options.danger ? 'rs-toast-badge rs-toast-badge--danger' : 'rs-toast-badge';
    badgeEl.textContent = options.badge;
    headerRow.appendChild(badgeEl);
  }

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'rs-toast-close';
  closeBtn.title = 'Dismiss';
  closeBtn.setAttribute('aria-label', 'Dismiss notification');
  closeBtn.textContent = '×';
  headerRow.appendChild(closeBtn);

  const bodyEl = document.createElement('div');
  bodyEl.className = 'rs-toast-body';
  bodyEl.textContent = truncateNotificationText(options.body, 115);

  content.appendChild(headerRow);
  content.appendChild(bodyEl);
  card.appendChild(content);

  let dismissed = false;
  let dismissTimer: number | null = null;
  const duration = options.durationMs ?? 5200;

  const dismiss = () => {
    if (dismissed) {
      return;
    }
    dismissed = true;
    if (dismissTimer !== null) {
      window.clearTimeout(dismissTimer);
      dismissTimer = null;
    }
    card.classList.remove('rs-toast-card--visible');
    card.classList.add('rs-toast-card--leaving');
    window.setTimeout(() => {
      card.remove();
    }, 220);
  };

  const scheduleDismiss = () => {
    if (dismissed) {
      return;
    }
    if (dismissTimer !== null) {
      window.clearTimeout(dismissTimer);
    }
    dismissTimer = window.setTimeout(dismiss, duration);
  };

  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dismiss();
  });

  card.addEventListener('click', () => {
    dismiss();
    options.onClick?.();
  });

  card.addEventListener('mouseenter', () => {
    if (dismissTimer !== null) {
      window.clearTimeout(dismissTimer);
      dismissTimer = null;
    }
  });
  card.addEventListener('mouseleave', () => {
    scheduleDismiss();
  });

  stack.appendChild(card);
  requestAnimationFrame(() => {
    if (!dismissed) {
      card.classList.add('rs-toast-card--visible');
    }
  });
  scheduleDismiss();
}

/**
 * Dispatches both OS desktop notifications (only when unfocused) and optional
 * built-in slide-in bottom-right toast notifications.
 */
export function dispatchRedshiftNotification(options: {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  badge?: string;
  danger?: boolean;
  userStatus?: UserStatus;
  forceDesktop?: boolean;
  forceInAppToast?: boolean;
  suppressInAppToast?: boolean;
  allowDesktopWhenFocused?: boolean;
  onClick?: () => void;
}): void {
  const prefs = getUserPreferences();
  const isDnd = options.userStatus === 'dnd';

  sendDesktopNotification({
    title: options.title,
    body: options.body,
    icon: options.icon,
    tag: options.tag,
    userStatus: options.userStatus,
    force: options.forceDesktop,
    allowWhenFocused: options.allowDesktopWhenFocused,
    onClick: options.onClick,
  });

  if (
    !options.suppressInAppToast &&
    (options.forceInAppToast || (prefs.inAppNotifications && !isDnd))
  ) {
    showInAppToast({
      title: options.title,
      body: options.body,
      icon: options.icon,
      badge: options.badge,
      danger: options.danger,
      onClick: options.onClick,
    });
  }
}
