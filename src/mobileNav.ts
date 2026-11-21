import { apiUpdateStatus } from './apiClient';
import { createSettingsGearSvg } from './chatUi';
import { formatCustomStatusLine } from './customStatusModal';
import { createFriendsIconSvg } from './friendsView';
import { triggerOpenStaffPanel } from './moderationActions';
import { isStaffAccountRole, resolveAccountRole, setDisplayNameWithRoleBadge } from './profileBadges';
import { createStatusGlyph, STATUS_LABELS } from './profileDrawer';
import { applyBannerBackground } from './profileModals';
import {
  disablePhonePushNotifications,
  enablePhonePushNotifications,
  getWebPushStatus,
} from './pushNotifications';
import { setTwemojiText } from './twemojiHelper';
import type { SelfProfile, SocialSnapshot, UserStatus } from './types';

export type MobileHubTab = 'chats' | 'friends' | 'you';

function createMobileChatsIconSvg(size = 21): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(ns, 'path');
  p.setAttribute(
    'd',
    'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z',
  );
  svg.appendChild(p);
  return svg;
}

export function createMobileBackArrowSvg(size = 20): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2.3');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const line = document.createElementNS(ns, 'line');
  line.setAttribute('x1', '19');
  line.setAttribute('y1', '12');
  line.setAttribute('x2', '5');
  line.setAttribute('y2', '12');
  const poly = document.createElementNS(ns, 'polyline');
  poly.setAttribute('points', '12 19 5 12 12 5');
  svg.appendChild(line);
  svg.appendChild(poly);
  return svg;
}

export interface MobileBottomNavHandle {
  element: HTMLElement;
  sync: (opts: {
    activeTab: MobileHubTab;
    unreadChatsCount: number;
    pendingFriendsCount: number;
    user: SelfProfile;
    resolveAvatar: (profile: { avatarPreset: number | null; avatarDataUrl?: string }) => string;
  }) => void;
}

export function createMobileBottomNav(onSelectTab: (tab: MobileHubTab) => void): MobileBottomNavHandle {
  const nav = document.createElement('nav');
  nav.className = 'mobile-bottom-nav';
  nav.setAttribute('aria-label', 'Mobile Navigation');

  const chatsBtn = document.createElement('button');
  chatsBtn.type = 'button';
  chatsBtn.className = 'mobile-nav-tab';
  chatsBtn.dataset.tab = 'chats';
  const chatsIconWrap = document.createElement('span');
  chatsIconWrap.className = 'mobile-nav-icon-wrap';
  chatsIconWrap.appendChild(createMobileChatsIconSvg(21));
  const chatsBadge = document.createElement('span');
  chatsBadge.className = 'mobile-nav-badge';
  chatsBadge.hidden = true;
  chatsIconWrap.appendChild(chatsBadge);
  const chatsLabel = document.createElement('span');
  chatsLabel.className = 'mobile-nav-label';
  chatsLabel.textContent = 'Chats';
  chatsBtn.appendChild(chatsIconWrap);
  chatsBtn.appendChild(chatsLabel);
  chatsBtn.addEventListener('click', () => onSelectTab('chats'));

  const friendsBtn = document.createElement('button');
  friendsBtn.type = 'button';
  friendsBtn.className = 'mobile-nav-tab';
  friendsBtn.dataset.tab = 'friends';
  const friendsIconWrap = document.createElement('span');
  friendsIconWrap.className = 'mobile-nav-icon-wrap';
  friendsIconWrap.appendChild(createFriendsIconSvg(21));
  const friendsBadge = document.createElement('span');
  friendsBadge.className = 'mobile-nav-badge';
  friendsBadge.hidden = true;
  friendsIconWrap.appendChild(friendsBadge);
  const friendsLabel = document.createElement('span');
  friendsLabel.className = 'mobile-nav-label';
  friendsLabel.textContent = 'Friends';
  friendsBtn.appendChild(friendsIconWrap);
  friendsBtn.appendChild(friendsLabel);
  friendsBtn.addEventListener('click', () => onSelectTab('friends'));

  const youBtn = document.createElement('button');
  youBtn.type = 'button';
  youBtn.className = 'mobile-nav-tab';
  youBtn.dataset.tab = 'you';
  const youIconWrap = document.createElement('span');
  youIconWrap.className = 'mobile-nav-icon-wrap mobile-nav-avatar-wrap';
  const youAvatar = document.createElement('img');
  youAvatar.className = 'mobile-nav-avatar';
  youAvatar.alt = 'You';
  const youDot = document.createElement('span');
  youDot.className = 'mobile-nav-status-dot';
  youIconWrap.appendChild(youAvatar);
  youIconWrap.appendChild(youDot);
  const youLabel = document.createElement('span');
  youLabel.className = 'mobile-nav-label';
  youLabel.textContent = 'You';
  youBtn.appendChild(youIconWrap);
  youBtn.appendChild(youLabel);
  youBtn.addEventListener('click', () => onSelectTab('you'));

  nav.appendChild(chatsBtn);
  nav.appendChild(friendsBtn);
  nav.appendChild(youBtn);

  return {
    element: nav,
    sync: ({ activeTab, unreadChatsCount, pendingFriendsCount, user, resolveAvatar }) => {
      chatsBtn.classList.toggle('mobile-nav-tab--active', activeTab === 'chats');
      friendsBtn.classList.toggle('mobile-nav-tab--active', activeTab === 'friends');
      youBtn.classList.toggle('mobile-nav-tab--active', activeTab === 'you');

      chatsBadge.hidden = unreadChatsCount <= 0;
      if (unreadChatsCount > 0) {
        chatsBadge.textContent = unreadChatsCount > 99 ? '99+' : String(unreadChatsCount);
      }
      friendsBadge.hidden = pendingFriendsCount <= 0;
      if (pendingFriendsCount > 0) {
        friendsBadge.textContent = pendingFriendsCount > 99 ? '99+' : String(pendingFriendsCount);
      }
      youAvatar.src = resolveAvatar(user);
      youDot.replaceChildren(createStatusGlyph(user.status, 11));
    },
  };
}

export interface MobileYouViewHandle {
  element: HTMLElement;
  sync: (user: SelfProfile) => void;
  refreshPushStatus: () => void;
}

export function createMobileYouView(options: {
  resolveAvatar: (profile: { avatarPreset: number | null; avatarDataUrl?: string }) => string;
  onOptimisticStatus: (status: UserStatus) => void;
  onSnapshotUpdated: (snapshot: SocialSnapshot) => void;
  onOpenEditProfile: () => void;
  onOpenCustomStatus: () => void;
  onOpenSettings: () => void;
  onSignOut: () => void;
}): MobileYouViewHandle {
  const root = document.createElement('section');
  root.className = 'mobile-you-view';
  root.setAttribute('aria-label', 'Your Profile');

  const scroll = document.createElement('div');
  scroll.className = 'mobile-you-scroll';

  const heroCard = document.createElement('div');
  heroCard.className = 'mobile-you-hero';

  const banner = document.createElement('div');
  banner.className = 'mobile-you-banner';
  heroCard.appendChild(banner);

  const heroBody = document.createElement('div');
  heroBody.className = 'mobile-you-hero-body';

  const avatarWrap = document.createElement('div');
  avatarWrap.className = 'mobile-you-avatar-wrap';
  const avatarImg = document.createElement('img');
  avatarImg.className = 'mobile-you-avatar';
  avatarImg.alt = 'Your avatar';
  const statusDot = document.createElement('span');
  statusDot.className = 'mobile-you-status-dot';
  avatarWrap.appendChild(avatarImg);
  avatarWrap.appendChild(statusDot);

  const identity = document.createElement('div');
  identity.className = 'mobile-you-identity';
  const displayName = document.createElement('h2');
  displayName.className = 'mobile-you-display';
  const username = document.createElement('div');
  username.className = 'mobile-you-username';
  const customStatusLine = document.createElement('div');
  customStatusLine.className = 'mobile-you-custom-status';
  identity.appendChild(displayName);
  identity.appendChild(username);
  identity.appendChild(customStatusLine);

  heroBody.appendChild(avatarWrap);
  heroBody.appendChild(identity);

  const quickActions = document.createElement('div');
  quickActions.className = 'mobile-you-quick-actions';

  const editProfileBtn = document.createElement('button');
  editProfileBtn.type = 'button';
  editProfileBtn.className = 'mobile-you-action-btn mobile-you-action-btn--primary';
  editProfileBtn.textContent = 'Edit Profile';
  editProfileBtn.addEventListener('click', () => options.onOpenEditProfile());

  const customStatusBtn = document.createElement('button');
  customStatusBtn.type = 'button';
  customStatusBtn.className = 'mobile-you-action-btn';
  customStatusBtn.textContent = 'Set Status';
  customStatusBtn.addEventListener('click', () => options.onOpenCustomStatus());

  quickActions.appendChild(editProfileBtn);
  quickActions.appendChild(customStatusBtn);
  heroBody.appendChild(quickActions);
  heroCard.appendChild(heroBody);
  scroll.appendChild(heroCard);

  // Status Switcher Card
  const statusCard = document.createElement('div');
  statusCard.className = 'mobile-you-card';
  const statusTitle = document.createElement('div');
  statusTitle.className = 'mobile-you-card-title';
  statusTitle.textContent = 'Online Status';
  statusCard.appendChild(statusTitle);

  const statusGrid = document.createElement('div');
  statusGrid.className = 'mobile-you-status-grid';
  const statuses: UserStatus[] = ['online', 'idle', 'dnd', 'invisible'];
  const statusBtns = new Map<UserStatus, HTMLButtonElement>();
  for (const st of statuses) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mobile-you-status-pill';
    btn.appendChild(createStatusGlyph(st, 12));
    const lbl = document.createElement('span');
    lbl.textContent = STATUS_LABELS[st];
    btn.appendChild(lbl);
    btn.addEventListener('click', async () => {
      options.onOptimisticStatus(st);
      const res = await apiUpdateStatus(st);
      if (res.ok && res.snapshot) {
        options.onSnapshotUpdated(res.snapshot);
      }
    });
    statusBtns.set(st, btn);
    statusGrid.appendChild(btn);
  }
  statusCard.appendChild(statusGrid);
  scroll.appendChild(statusCard);

  // Phone Lock-Screen Notifications Card
  const pushCard = document.createElement('div');
  pushCard.className = 'mobile-you-card';
  const pushTitle = document.createElement('div');
  pushTitle.className = 'mobile-you-card-title';
  pushTitle.textContent = 'Phone Notifications';
  const pushDesc = document.createElement('div');
  pushDesc.className = 'mobile-you-push-desc';
  pushDesc.textContent = 'Checking notification status...';
  const pushBtn = document.createElement('button');
  pushBtn.type = 'button';
  pushBtn.className = 'mobile-you-action-btn mobile-you-action-btn--primary';
  pushBtn.hidden = true;
  pushCard.appendChild(pushTitle);
  pushCard.appendChild(pushDesc);
  pushCard.appendChild(pushBtn);
  scroll.appendChild(pushCard);

  const refreshPushStatus = () => {
    void getWebPushStatus().then((st) => {
      pushCard.hidden = st === 'desktop-app';
      if (st === 'enabled') {
        pushDesc.textContent = 'Lock-screen notifications are active on this phone.';
        pushBtn.hidden = false;
        pushBtn.className = 'mobile-you-action-btn';
        pushBtn.textContent = 'Turn Off Phone Notifications';
        pushBtn.onclick = async () => {
          pushBtn.disabled = true;
          await disablePhonePushNotifications();
          pushBtn.disabled = false;
          refreshPushStatus();
        };
      } else if (st === 'available') {
        pushDesc.textContent =
          'Get real lock-screen notifications on this phone for DMs, @mentions, friend requests, and calls.';
        pushBtn.hidden = false;
        pushBtn.className = 'mobile-you-action-btn mobile-you-action-btn--primary';
        pushBtn.textContent = 'Enable Phone Notifications';
        pushBtn.onclick = async () => {
          pushBtn.disabled = true;
          const res = await enablePhonePushNotifications();
          pushBtn.disabled = false;
          if (!res.ok && res.error) {
            pushDesc.textContent = res.error;
          } else {
            refreshPushStatus();
          }
        };
      } else if (st === 'ios-needs-homescreen') {
        pushDesc.textContent =
          'On iPhone: tap Safari’s Share button → "Add to Home Screen", then open Redshift from your Home Screen to enable lock-screen notifications.';
        pushBtn.hidden = true;
      } else if (st === 'denied') {
        pushDesc.textContent =
          'Notifications are blocked in your phone settings. Allow Redshift notifications in Settings to turn them on.';
        pushBtn.hidden = true;
      } else {
        pushDesc.textContent = 'Push notifications are not supported in this browser.';
        pushBtn.hidden = true;
      }
    });
  };
  refreshPushStatus();

  // Settings & Sign Out Card
  const menuCard = document.createElement('div');
  menuCard.className = 'mobile-you-card mobile-you-menu';

  const staffPanelBtn = document.createElement('button');
  staffPanelBtn.type = 'button';
  staffPanelBtn.className = 'mobile-you-menu-btn mobile-you-menu-btn--staff';
  staffPanelBtn.hidden = true;
  const staffIcon = document.createElement('span');
  staffIcon.className = 'mobile-you-staff-icon';
  staffIcon.textContent = '🛡️';
  const staffLbl = document.createElement('span');
  staffLbl.textContent = 'Staff Sandbox & Admin Panel';
  staffPanelBtn.appendChild(staffIcon);
  staffPanelBtn.appendChild(staffLbl);
  staffPanelBtn.addEventListener('click', () => triggerOpenStaffPanel('tickets'));

  const settingsBtn = document.createElement('button');
  settingsBtn.type = 'button';
  settingsBtn.className = 'mobile-you-menu-btn';
  settingsBtn.appendChild(createSettingsGearSvg(17));
  const settingsLbl = document.createElement('span');
  settingsLbl.textContent = 'User Settings';
  settingsBtn.appendChild(settingsLbl);
  settingsBtn.addEventListener('click', () => options.onOpenSettings());

  const signOutBtn = document.createElement('button');
  signOutBtn.type = 'button';
  signOutBtn.className = 'mobile-you-menu-btn mobile-you-menu-btn--danger';
  signOutBtn.textContent = 'Sign Out';
  signOutBtn.addEventListener('click', () => options.onSignOut());

  menuCard.appendChild(staffPanelBtn);
  menuCard.appendChild(settingsBtn);
  menuCard.appendChild(signOutBtn);
  scroll.appendChild(menuCard);

  root.appendChild(scroll);

  return {
    element: root,
    refreshPushStatus,
    sync: (user: SelfProfile) => {
      applyBannerBackground(banner, user);
      avatarImg.src = options.resolveAvatar(user);
      statusDot.replaceChildren(createStatusGlyph(user.status, 16));
      setDisplayNameWithRoleBadge(displayName, user.displayName, user, { badgeSize: 16 });
      username.textContent = `@${user.username}`;
      staffPanelBtn.hidden = !isStaffAccountRole(resolveAccountRole(user));
      const csLine = formatCustomStatusLine(user);
      customStatusLine.hidden = !csLine;
      if (csLine) {
        setTwemojiText(customStatusLine, csLine);
        customStatusBtn.textContent = 'Edit Status';
      } else {
        customStatusBtn.textContent = 'Set Status';
      }
      for (const [st, btn] of statusBtns.entries()) {
        btn.classList.toggle('mobile-you-status-pill--active', user.status === st);
      }
    },
  };
}
