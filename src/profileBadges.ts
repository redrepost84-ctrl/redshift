import type { AccountRole } from './types';

export const ROLE_BADGE_TOOLTIPS: Record<AccountRole, string> = {
  developer: 'This person is the owner of Redshift, say hi!',
  moderator: 'This person is a Redshift moderator, say hi!',
  bot: 'This is a bot. An application people can manipulate for commands and more.',
};

const DEVELOPER_SET = new Set(['redrepost95']);
const BOT_SET = new Set(['redshift']);

/** Resolve role defensively from profile object or known immutable usernames. */
export function resolveAccountRole(
  input?: { username?: string; role?: AccountRole; isSystemBot?: boolean } | AccountRole | null,
): AccountRole | undefined {
  if (!input) return undefined;
  if (typeof input === 'string') return input;
  if (input.role === 'developer' || input.role === 'moderator' || input.role === 'bot') {
    return input.role;
  }
  if (input.isSystemBot) return 'bot';
  const key = (input.username ?? '').trim().toLowerCase();
  if (DEVELOPER_SET.has(key)) return 'developer';
  if (BOT_SET.has(key)) return 'bot';
  return undefined;
}

let activeTooltipEl: HTMLDivElement | null = null;
let activeTooltipAnchor: HTMLElement | null = null;

function hideRoleBadgeTooltip(): void {
  if (activeTooltipEl) {
    activeTooltipEl.remove();
    activeTooltipEl = null;
  }
  activeTooltipAnchor = null;
}

function showRoleBadgeTooltip(anchor: HTMLElement, text: string): void {
  hideRoleBadgeTooltip();
  if (!anchor.isConnected) return;
  const tip = document.createElement('div');
  tip.className = 'rs-role-tooltip';
  tip.setAttribute('role', 'tooltip');
  tip.textContent = text;
  document.body.appendChild(tip);

  const rect = anchor.getBoundingClientRect();
  const tipRect = tip.getBoundingClientRect();
  const margin = 8;
  let top = rect.top - tipRect.height - 8;
  let placedBelow = false;
  if (top < margin) {
    top = rect.bottom + 8;
    placedBelow = true;
  }
  let left = rect.left + rect.width / 2 - tipRect.width / 2;
  left = Math.max(margin, Math.min(window.innerWidth - tipRect.width - margin, left));

  tip.style.left = `${Math.round(left)}px`;
  tip.style.top = `${Math.round(top)}px`;
  tip.classList.toggle('rs-role-tooltip--below', placedBelow);
  activeTooltipEl = tip;
  activeTooltipAnchor = anchor;
}

if (typeof window !== 'undefined') {
  window.addEventListener('scroll', hideRoleBadgeTooltip, true);
  window.addEventListener('resize', hideRoleBadgeTooltip, { passive: true });
  window.addEventListener(
    'pointerdown',
    (ev) => {
      if (activeTooltipAnchor && ev.target instanceof Node && !activeTooltipAnchor.contains(ev.target)) {
        hideRoleBadgeTooltip();
      }
    },
    true,
  );
}

function createCrossedRedHammersSvg(size: number): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('rs-role-badge-svg');

  // Hammer 1 (top-left head -> bottom-right handle)
  const h1Handle = document.createElementNS(ns, 'path');
  h1Handle.setAttribute('d', 'M7.4 7.4L19.4 19.4');
  h1Handle.setAttribute('stroke', '#e23b41');
  h1Handle.setAttribute('stroke-width', '2.5');
  h1Handle.setAttribute('stroke-linecap', 'round');
  svg.appendChild(h1Handle);

  const h1Head = document.createElementNS(ns, 'path');
  h1Head.setAttribute('d', 'M4.2 8.2L8.2 4.2L11.2 7.2L7.2 11.2Z');
  h1Head.setAttribute('fill', '#ff4d53');
  h1Head.setAttribute('stroke', '#b91c22');
  h1Head.setAttribute('stroke-width', '1.1');
  h1Head.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(h1Head);

  // Hammer 2 (top-right head -> bottom-left handle, crossed like an X)
  const h2Handle = document.createElementNS(ns, 'path');
  h2Handle.setAttribute('d', 'M16.6 7.4L4.6 19.4');
  h2Handle.setAttribute('stroke', '#ff4d53');
  h2Handle.setAttribute('stroke-width', '2.5');
  h2Handle.setAttribute('stroke-linecap', 'round');
  svg.appendChild(h2Handle);

  const h2Head = document.createElementNS(ns, 'path');
  h2Head.setAttribute('d', 'M19.8 8.2L15.8 4.2L12.8 7.2L16.8 11.2Z');
  h2Head.setAttribute('fill', '#ff5b61');
  h2Head.setAttribute('stroke', '#b91c22');
  h2Head.setAttribute('stroke-width', '1.1');
  h2Head.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(h2Head);

  return svg;
}

function createWhiteHammerSvg(size: number): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('rs-role-badge-svg');

  const handle = document.createElementNS(ns, 'path');
  handle.setAttribute('d', 'M14.2 9.8L4.8 19.2');
  handle.setAttribute('stroke', '#ffffff');
  handle.setAttribute('stroke-width', '2.6');
  handle.setAttribute('stroke-linecap', 'round');
  svg.appendChild(handle);

  const head = document.createElementNS(ns, 'path');
  head.setAttribute('d', 'M11.6 6.2L15.4 3.6L20.4 8.6L17.8 12.4L14.2 8.8L11.6 6.2Z');
  head.setAttribute('fill', '#ffffff');
  head.setAttribute('stroke', '#cbd5e1');
  head.setAttribute('stroke-width', '1');
  head.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(head);

  return svg;
}

function createBlueBotSvg(size: number): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('rs-role-badge-svg');

  const ant = document.createElementNS(ns, 'path');
  ant.setAttribute('d', 'M12 3v3');
  ant.setAttribute('stroke', '#ffffff');
  ant.setAttribute('stroke-width', '2');
  ant.setAttribute('stroke-linecap', 'round');
  svg.appendChild(ant);

  const head = document.createElementNS(ns, 'rect');
  head.setAttribute('x', '4');
  head.setAttribute('y', '6');
  head.setAttribute('width', '16');
  head.setAttribute('height', '13');
  head.setAttribute('rx', '3.5');
  head.setAttribute('fill', '#ffffff');
  head.setAttribute('fill-opacity', '0.18');
  head.setAttribute('stroke', '#ffffff');
  head.setAttribute('stroke-width', '1.9');
  svg.appendChild(head);

  const eyeL = document.createElementNS(ns, 'circle');
  eyeL.setAttribute('cx', '9.2');
  eyeL.setAttribute('cy', '12.2');
  eyeL.setAttribute('r', '1.5');
  eyeL.setAttribute('fill', '#ffffff');
  svg.appendChild(eyeL);

  const eyeR = document.createElementNS(ns, 'circle');
  eyeR.setAttribute('cx', '14.8');
  eyeR.setAttribute('cy', '12.2');
  eyeR.setAttribute('r', '1.5');
  eyeR.setAttribute('fill', '#ffffff');
  svg.appendChild(eyeR);

  const mouth = document.createElementNS(ns, 'path');
  mouth.setAttribute('d', 'M9.5 16h5');
  mouth.setAttribute('stroke', '#ffffff');
  mouth.setAttribute('stroke-width', '1.7');
  mouth.setAttribute('stroke-linecap', 'round');
  svg.appendChild(mouth);

  return svg;
}

export function createRoleBadgeElement(role: AccountRole, size = 15): HTMLSpanElement {
  const badge = document.createElement('span');
  badge.className = `rs-role-badge rs-role-badge--${role}`;
  badge.dataset.roleBadge = role;
  badge.tabIndex = -1;
  const tooltip = ROLE_BADGE_TOOLTIPS[role];
  badge.setAttribute('aria-label', tooltip);
  badge.title = tooltip;

  if (role === 'developer') {
    badge.appendChild(createCrossedRedHammersSvg(size));
  } else if (role === 'moderator') {
    badge.appendChild(createWhiteHammerSvg(size));
  } else {
    badge.appendChild(createBlueBotSvg(Math.max(12, size - 2)));
    const tag = document.createElement('span');
    tag.className = 'rs-role-badge-bot-text';
    tag.textContent = 'BOT';
    badge.appendChild(tag);
  }

  badge.addEventListener('pointerenter', () => {
    showRoleBadgeTooltip(badge, tooltip);
  });
  badge.addEventListener('pointerleave', () => {
    if (activeTooltipAnchor === badge) {
      hideRoleBadgeTooltip();
    }
  });
  badge.addEventListener('focus', () => {
    showRoleBadgeTooltip(badge, tooltip);
  });
  badge.addEventListener('blur', () => {
    if (activeTooltipAnchor === badge) {
      hideRoleBadgeTooltip();
    }
  });

  return badge;
}

/**
 * Renders a user's display name with their immutable server-derived role badge.
 * Developer (crossed red hammers) and Moderator (white hammer) sit to the LEFT of the display name.
 * Bot (blue bot badge) sits neatly to the RIGHT of the name (or left if requested).
 */
export function setDisplayNameWithRoleBadge(
  container: HTMLElement,
  displayName: string,
  roleInput?: { username?: string; role?: AccountRole; isSystemBot?: boolean } | AccountRole | null,
  options?: { badgeSize?: number; prefixText?: string },
): void {
  const role = resolveAccountRole(roleInput);
  const size = options?.badgeSize ?? 15;
  container.replaceChildren();

  if (options?.prefixText) {
    container.appendChild(document.createTextNode(options.prefixText));
  }

  if (!role) {
    container.appendChild(document.createTextNode(displayName));
    container.classList.remove('rs-name-with-badge');
    return;
  }

  container.classList.add('rs-name-with-badge');
  const nameSpan = document.createElement('span');
  nameSpan.className = 'rs-name-with-badge-text';
  nameSpan.textContent = displayName;

  if (role === 'developer' || role === 'moderator') {
    container.appendChild(createRoleBadgeElement(role, size));
    container.appendChild(nameSpan);
  } else {
    container.appendChild(nameSpan);
    container.appendChild(createRoleBadgeElement('bot', size));
  }
}

export function isStaffAccountRole(role?: AccountRole | null): boolean {
  return role === 'developer' || role === 'moderator';
}

export function createDisplayNameWithRoleBadge(
  displayName: string,
  roleInput?: { username?: string; role?: AccountRole; isSystemBot?: boolean } | AccountRole | null,
  className = '',
  badgeSize = 15,
): HTMLSpanElement {
  const wrap = document.createElement('span');
  if (className) wrap.className = className;
  setDisplayNameWithRoleBadge(wrap, displayName, roleInput, { badgeSize });
  return wrap;
}
