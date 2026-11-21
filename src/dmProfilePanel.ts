import {
  apiAcceptFriendRequest,
  apiCancelFriendRequest,
  apiDeclineFriendRequest,
  apiFetchMutualProfile,
  apiSendFriendRequest,
  apiUnblockUser,
  type MutualGroupSummary,
} from './apiClient';
import {
  confirmFriendRelationAction,
  createCloseIconSvg,
  createMoreVerticalSvg,
  openFloatingActionMenu,
  openImageLightbox,
  type FloatingActionMenuItem,
} from './chatUi';
import { createThoughtBubbleElement } from './customStatusModal';
import { resolveGroupAvatar } from './groupDmModals';
import {
  canModerateTarget,
  canReportTarget,
  triggerModerateUser,
  triggerReportUser,
} from './moderationActions';
import { setDisplayNameWithRoleBadge } from './profileBadges';
import {
  createStatusGlyph,
  formatAccountAgeYears,
  formatCreationDate,
  STATUS_LABELS,
} from './profileDrawer';
import { applyBannerBackground } from './profileModals';
import type { CustomStatusData, PublicProfile, SocialSnapshot } from './types';

export type ReplyToStatusHandler = (
  user: PublicProfile,
  status: CustomStatusData,
  replyText: string,
  fromModal: boolean,
) => void;

export type ProfileRelationState =
  | 'friend'
  | 'incoming'
  | 'outgoing'
  | 'blocked'
  | 'none';

export interface DmProfilePanelOptions {
  initialFriend: PublicProfile;
  resolveAvatar: (profile: { avatarPreset: number | null; avatarDataUrl?: string }) => string;
  onSnapshotUpdated: (snapshot: SocialSnapshot) => void;
  getSnapshot?: () => SocialSnapshot;
  onOpenDm?: (username: string) => void;
  onOpenGroup?: (groupId: string) => void;
  onReplyToStatus?: ReplyToStatusHandler;
}

export interface DmProfilePanelHandle {
  element: HTMLElement;
  update: (friend: PublicProfile) => void;
  destroy: () => void;
}

const BIO_COLLAPSE_THRESHOLD = 180;

export function resolveProfileRelation(
  snap: SocialSnapshot | undefined,
  username: string,
): ProfileRelationState {
  if (!snap) {
    return 'none';
  }
  const targetKey = username.toLowerCase();
  if ((snap.blockedUsers ?? []).some((u) => u.username.toLowerCase() === targetKey)) {
    return 'blocked';
  }
  if (snap.friends.some((f) => f.username.toLowerCase() === targetKey)) {
    return 'friend';
  }
  if (snap.incomingRequests.some((r) => r.user.username.toLowerCase() === targetKey)) {
    return 'incoming';
  }
  if (snap.outgoingRequests.some((r) => r.user.username.toLowerCase() === targetKey)) {
    return 'outgoing';
  }
  return 'none';
}

function canReplyToUserCustomStatus(
  user: PublicProfile,
  relation: ProfileRelationState,
  snap?: SocialSnapshot,
): boolean {
  if (user.isProfilePrivate || user.isBlockedRelation || relation === 'blocked') {
    return false;
  }
  const selfKey = snap?.user.username.toLowerCase();
  if (selfKey && user.username.toLowerCase() === selfKey) {
    return false;
  }
  if (relation !== 'friend' && user.acceptsNonFriendDms === false) {
    return false;
  }
  return true;
}

interface InlineStatusReplyController {
  open: (user: PublicProfile, status: CustomStatusData) => void;
  close: () => void;
  syncAvailability: (stillAvailable: boolean) => void;
}

function createInlineStatusReplyController(
  host: HTMLElement,
  onSubmit: (user: PublicProfile, status: CustomStatusData, text: string) => void,
): InlineStatusReplyController {
  let activeUser: PublicProfile | null = null;
  let activeStatus: CustomStatusData | null = null;
  let inputEl: HTMLInputElement | null = null;

  const close = () => {
    activeUser = null;
    activeStatus = null;
    inputEl = null;
    host.hidden = true;
    host.replaceChildren();
  };

  const open = (user: PublicProfile, status: CustomStatusData) => {
    activeUser = user;
    activeStatus = status;
    host.hidden = false;

    if (inputEl && host.contains(inputEl)) {
      inputEl.placeholder = `Reply to @${user.username}'s status...`;
      inputEl.focus();
      return;
    }

    host.replaceChildren();
    const box = document.createElement('form');
    box.className = 'dm-status-reply-box';

    const topRow = document.createElement('div');
    topRow.className = 'dm-status-reply-top';

    const label = document.createElement('span');
    label.className = 'dm-status-reply-label';
    label.textContent = `Reply to ${user.displayName}'s status`;
    topRow.appendChild(label);

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'dm-status-reply-close';
    cancelBtn.title = 'Cancel reply';
    cancelBtn.setAttribute('aria-label', 'Cancel status reply');
    cancelBtn.appendChild(createCloseIconSvg(12));
    cancelBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      close();
    });
    topRow.appendChild(cancelBtn);
    box.appendChild(topRow);

    const inputRow = document.createElement('div');
    inputRow.className = 'dm-status-reply-input-row';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'dm-status-reply-input';
    input.maxLength = 2000;
    input.placeholder = `Reply to @${user.username}'s status...`;
    input.setAttribute('aria-label', `Reply to ${user.displayName}'s custom status`);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    });
    inputEl = input;

    const sendBtn = document.createElement('button');
    sendBtn.type = 'submit';
    sendBtn.className = 'dm-status-reply-send';
    sendBtn.textContent = 'Send';
    sendBtn.disabled = true;

    input.addEventListener('input', () => {
      sendBtn.disabled = !input.value.trim();
    });

    box.addEventListener('submit', (e) => {
      e.preventDefault();
      const trimmed = input.value.trim();
      if (!trimmed || !activeUser || !activeStatus) {
        return;
      }
      const targetUser = activeUser;
      const targetStatus = activeStatus;
      close();
      onSubmit(targetUser, targetStatus, trimmed);
    });

    inputRow.appendChild(input);
    inputRow.appendChild(sendBtn);
    box.appendChild(inputRow);
    host.appendChild(box);
    window.setTimeout(() => input.focus(), 0);
  };

  return {
    open,
    close,
    syncAvailability: (stillAvailable: boolean) => {
      if (!stillAvailable && activeUser) {
        close();
      }
    },
  };
}

export function createProfilePanelToggleIconSvg(size = 18): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.9');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');

  const circle = document.createElementNS(ns, 'circle');
  circle.setAttribute('cx', '12');
  circle.setAttribute('cy', '8.2');
  circle.setAttribute('r', '3.6');
  svg.appendChild(circle);

  const shoulders = document.createElementNS(ns, 'path');
  shoulders.setAttribute('d', 'M5 19.2c0-3.2 3.1-5.2 7-5.2s7 2 7 5.2');
  svg.appendChild(shoulders);

  return svg;
}

export function createLockIconSvg(size = 15): SVGSVGElement {
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

  const body = document.createElementNS(ns, 'rect');
  body.setAttribute('x', '5');
  body.setAttribute('y', '11');
  body.setAttribute('width', '14');
  body.setAttribute('height', '10');
  body.setAttribute('rx', '2');
  svg.appendChild(body);

  const shackle = document.createElementNS(ns, 'path');
  shackle.setAttribute('d', 'M8 11V7a4 4 0 0 1 8 0v4');
  svg.appendChild(shackle);

  return svg;
}

function createFriendBadgeIconSvg(size = 16): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.9');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');

  const circle = document.createElementNS(ns, 'circle');
  circle.setAttribute('cx', '9');
  circle.setAttribute('cy', '7.6');
  circle.setAttribute('r', '3.4');
  svg.appendChild(circle);

  const shoulders = document.createElementNS(ns, 'path');
  shoulders.setAttribute('d', 'M2.6 19.2c0-3.1 2.8-5 6.4-5s6.4 1.9 6.4 5');
  svg.appendChild(shoulders);

  const check = document.createElementNS(ns, 'path');
  check.setAttribute('d', 'M16.2 11.4l2 2 3.4-4');
  svg.appendChild(check);

  return svg;
}

function createPrivateProfileBox(): HTMLDivElement {
  const box = document.createElement('div');
  box.className = 'dm-profile-private-notice';

  const iconWrap = document.createElement('span');
  iconWrap.className = 'dm-profile-private-icon';
  iconWrap.appendChild(createLockIconSvg(16));

  const copy = document.createElement('div');
  copy.className = 'dm-profile-private-copy';

  const title = document.createElement('div');
  title.className = 'dm-profile-private-title';
  title.textContent = 'This profile is private';

  const sub = document.createElement('div');
  sub.className = 'dm-profile-private-sub';
  sub.textContent = 'Only username, display name, and profile picture are visible.';

  copy.appendChild(title);
  copy.appendChild(sub);
  box.appendChild(iconWrap);
  box.appendChild(copy);
  return box;
}

function renderBioSection(
  container: HTMLElement,
  bio: string,
  expanded: boolean,
  onToggleExpand: () => void,
): void {
  const bioBlock = document.createElement('div');
  bioBlock.className = 'dm-profile-bio-block';

  const trimmed = bio.trim();
  if (!trimmed) {
    const emptyEl = document.createElement('div');
    emptyEl.className = 'dm-profile-bio dm-profile-bio--empty';
    emptyEl.textContent = 'No bio yet.';
    bioBlock.appendChild(emptyEl);
    container.appendChild(bioBlock);
    return;
  }

  const bioText = document.createElement('div');
  bioText.className = 'dm-profile-bio';
  const needsCollapse = trimmed.length > BIO_COLLAPSE_THRESHOLD;
  if (needsCollapse && !expanded) {
    bioText.classList.add('dm-profile-bio--clamped');
  }
  bioText.textContent = trimmed;
  bioBlock.appendChild(bioText);

  if (needsCollapse) {
    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'dm-profile-bio-toggle';
    toggleBtn.textContent = expanded ? 'Show Less' : 'View Full Bio';
    toggleBtn.addEventListener('click', onToggleExpand);
    bioBlock.appendChild(toggleBtn);
  }

  container.appendChild(bioBlock);
}

type ProfileDetailTab = 'about' | 'mutual-friends' | 'mutual-groups';

interface ProfileMutualControllerState {
  activeTab: ProfileDetailTab;
  usernameLower: string;
  snapshotKey: string;
  loaded: boolean;
  loading: boolean;
  error: boolean;
  mutualFriends: PublicProfile[];
  mutualGroups: MutualGroupSummary[];
  requestSeq: number;
}

function getSnapshotMutualVersionKey(snapshot: SocialSnapshot | undefined): string {
  if (!snapshot) {
    return '';
  }
  const f = snapshot.friends.map((x) => x.username.toLowerCase()).sort().join(',');
  const g = (snapshot.groups ?? [])
    .map((gr) => `${gr.id}:${gr.members.map((m) => m.username.toLowerCase()).sort().join(',')}`)
    .sort()
    .join(';');
  return `${f}|${g}`;
}

function computeLocalMutualGroups(
  snapshot: SocialSnapshot | undefined,
  targetUsernameLower: string,
): MutualGroupSummary[] {
  if (!snapshot?.groups) {
    return [];
  }
  return snapshot.groups
    .filter((g) => g.members.some((m) => m.username.toLowerCase() === targetUsernameLower))
    .map((g) => ({
      id: g.id,
      name: g.name,
      iconDataUrl: g.iconDataUrl,
      memberCount: g.members.length,
    }));
}

function createProfileTabsController(onRedraw: () => void, isAlive: () => boolean) {
  const state: ProfileMutualControllerState = {
    activeTab: 'about',
    usernameLower: '',
    snapshotKey: '',
    loaded: false,
    loading: false,
    error: false,
    mutualFriends: [],
    mutualGroups: [],
    requestSeq: 0,
  };

  const ensureLoaded = (username: string, snapshot?: SocialSnapshot) => {
    const lower = username.trim().toLowerCase();
    const snapKey = getSnapshotMutualVersionKey(snapshot);
    const sameUser = state.usernameLower === lower;
    if (sameUser && state.snapshotKey === snapKey && (state.loaded || state.loading || state.error)) {
      return;
    }
    if (!sameUser) {
      state.mutualFriends = [];
      state.mutualGroups = computeLocalMutualGroups(snapshot, lower);
    }
    state.usernameLower = lower;
    state.snapshotKey = snapKey;
    state.loading = true;
    state.error = false;
    const seq = ++state.requestSeq;

    void apiFetchMutualProfile(username).then((res) => {
      if (!isAlive() || seq !== state.requestSeq || state.usernameLower !== lower) {
        return;
      }
      state.loading = false;
      state.loaded = res.ok;
      state.error = !res.ok;
      if (res.ok) {
        state.mutualFriends = res.mutualFriends;
        state.mutualGroups = res.mutualGroups;
      }
      onRedraw();
    });
  };

  return {
    getState: () => state,
    setTab(tab: ProfileDetailTab) {
      if (state.activeTab !== tab) {
        state.activeTab = tab;
        onRedraw();
      }
    },
    ensureLoaded,
  };
}

/** Renders the shared About / Mutual Friends / Mutual Groups card body for sidebar and modal. */
function renderProfileDetailsTabbedCard(opts: {
  container: HTMLElement;
  user: PublicProfile;
  variant: 'sidebar' | 'modal';
  isPrivate: boolean;
  isBlocked: boolean;
  bioExpanded: boolean;
  onToggleBioExpand: () => void;
  controller: ReturnType<typeof createProfileTabsController>;
  getSnapshot?: () => SocialSnapshot;
  resolveAvatar: (profile: { avatarPreset: number | null; avatarDataUrl?: string }) => string;
  onOpenDm?: (username: string) => void;
  onOpenGroup?: (groupId: string) => void;
}): void {
  const { container, user, variant, isPrivate, isBlocked, controller } = opts;
  container.replaceChildren();

  if (isPrivate) {
    container.appendChild(createPrivateProfileBox());
    return;
  }

  const snap = opts.getSnapshot?.();
  if (!isBlocked) {
    controller.ensureLoaded(user.username, snap);
  } else if (controller.getState().activeTab !== 'about') {
    controller.getState().activeTab = 'about';
  }

  const tabState = controller.getState();
  const targetLower = user.username.trim().toLowerCase();
  const localGroups = computeLocalMutualGroups(snap, targetLower);
  const mutualGroups = snap ? localGroups : tabState.mutualGroups;
  const mutualFriends = tabState.mutualFriends.map((mf) => {
    if (!snap) return mf;
    const k = mf.username.toLowerCase();
    return (
      snap.friends.find((f) => f.username.toLowerCase() === k) ??
      (snap.dmPeers ?? []).find((p) => p.username.toLowerCase() === k) ??
      mf
    );
  });

  if (!isBlocked) {
    const tabBar = document.createElement('div');
    tabBar.className = 'dm-profile-tabs';
    tabBar.setAttribute('role', 'tablist');

    const tabs: Array<{ id: ProfileDetailTab; label: string; count?: number }> = [
      { id: 'about', label: 'About' },
      {
        id: 'mutual-friends',
        label: 'Mutual Friends',
        count: tabState.loaded ? mutualFriends.length : undefined,
      },
      {
        id: 'mutual-groups',
        label: 'Mutual Groups',
        count: mutualGroups.length,
      },
    ];

    for (const def of tabs) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'dm-profile-tab';
      btn.setAttribute('role', 'tab');
      const isSelected = tabState.activeTab === def.id;
      btn.classList.toggle('dm-profile-tab--active', isSelected);
      btn.setAttribute('aria-selected', String(isSelected));
      btn.textContent =
        typeof def.count === 'number' && def.count > 0 ? `${def.label} (${def.count})` : def.label;
      btn.addEventListener('click', () => controller.setTab(def.id));
      tabBar.appendChild(btn);
    }

    container.appendChild(tabBar);
  }

  const activeTab = isBlocked ? 'about' : tabState.activeTab;

  if (activeTab === 'about') {
    if (variant === 'modal') {
      const bioHeading = document.createElement('div');
      bioHeading.className = 'dm-profile-section-label';
      bioHeading.textContent = 'Bio';
      container.appendChild(bioHeading);

      const modalBio = document.createElement('div');
      modalBio.className = 'dm-full-bio';
      const trimmedBio = isBlocked ? '' : user.bio.trim();
      modalBio.textContent = trimmedBio || 'No bio yet.';
      modalBio.classList.toggle('dm-profile-bio--empty', trimmedBio.length === 0);
      container.appendChild(modalBio);

      const modalDivider = document.createElement('div');
      modalDivider.className = 'dm-profile-divider';
      container.appendChild(modalDivider);

      const detailsHeading = document.createElement('div');
      detailsHeading.className = 'dm-profile-section-label';
      detailsHeading.textContent = 'Account Details';
      container.appendChild(detailsHeading);

      const modalCreated = document.createElement('div');
      modalCreated.className = 'dm-profile-date';
      modalCreated.textContent = `Member Since ${formatCreationDate(user.createdAt)}`;
      container.appendChild(modalCreated);

      const modalAge = document.createElement('div');
      modalAge.className = 'dm-profile-age';
      modalAge.textContent = `Account Age: ${formatAccountAgeYears(user.createdAt)}`;
      container.appendChild(modalAge);
      return;
    }

    renderBioSection(
      container,
      isBlocked ? '' : user.bio,
      opts.bioExpanded,
      opts.onToggleBioExpand,
    );

    const divider = document.createElement('div');
    divider.className = 'dm-profile-divider';
    container.appendChild(divider);

    const memberSection = document.createElement('div');
    memberSection.className = 'dm-profile-meta-section';

    const memberLabel = document.createElement('div');
    memberLabel.className = 'dm-profile-section-label';
    memberLabel.textContent = 'Member Since';
    memberSection.appendChild(memberLabel);

    const memberDate = document.createElement('div');
    memberDate.className = 'dm-profile-date';
    memberDate.textContent = formatCreationDate(user.createdAt);
    memberSection.appendChild(memberDate);

    const memberAge = document.createElement('div');
    memberAge.className = 'dm-profile-age';
    memberAge.textContent = `Account Age: ${formatAccountAgeYears(user.createdAt)}`;
    memberSection.appendChild(memberAge);

    container.appendChild(memberSection);
    return;
  }

  if (activeTab === 'mutual-friends') {
    if (tabState.loading && !tabState.loaded) {
      const msg = document.createElement('div');
      msg.className = 'dm-mutual-empty';
      msg.textContent = 'Loading mutual friends...';
      container.appendChild(msg);
      return;
    }
    if (tabState.error) {
      const msg = document.createElement('div');
      msg.className = 'dm-mutual-empty';
      msg.textContent = 'Could not load mutual friends.';
      container.appendChild(msg);
      return;
    }
    if (mutualFriends.length === 0) {
      const msg = document.createElement('div');
      msg.className = 'dm-mutual-empty';
      msg.textContent = 'No mutual friends.';
      container.appendChild(msg);
      return;
    }

    const list = document.createElement('div');
    list.className = 'dm-mutual-list';
    for (const friend of mutualFriends) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'dm-mutual-item';

      const avatarWrap = document.createElement('span');
      avatarWrap.className = 'dm-mutual-avatar-wrap';
      const img = document.createElement('img');
      img.className = 'dm-mutual-avatar';
      img.src = opts.resolveAvatar(friend);
      img.alt = friend.displayName;
      avatarWrap.appendChild(img);

      if (!friend.isProfilePrivate) {
        const dot = document.createElement('span');
        dot.className = 'dm-mutual-status';
        dot.appendChild(createStatusGlyph(friend.status, 10));
        avatarWrap.appendChild(dot);
      }

      const info = document.createElement('span');
      info.className = 'dm-mutual-info';
      const name = document.createElement('span');
      name.className = 'dm-mutual-name';
      setDisplayNameWithRoleBadge(name, friend.displayName, friend, { badgeSize: 13 });
      const sub = document.createElement('span');
      sub.className = 'dm-mutual-sub';
      sub.textContent = `@${friend.username}`;
      info.appendChild(name);
      info.appendChild(sub);

      row.appendChild(avatarWrap);
      row.appendChild(info);
      if (opts.onOpenDm) {
        row.addEventListener('click', () => opts.onOpenDm?.(friend.username));
      } else {
        row.disabled = true;
      }
      list.appendChild(row);
    }
    container.appendChild(list);
    return;
  }

  if (mutualGroups.length === 0) {
    const msg = document.createElement('div');
    msg.className = 'dm-mutual-empty';
    msg.textContent = 'No mutual groups.';
    container.appendChild(msg);
    return;
  }

  const list = document.createElement('div');
  list.className = 'dm-mutual-list';
  for (const grp of mutualGroups) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'dm-mutual-item';

    const avatarWrap = document.createElement('span');
    avatarWrap.className = 'dm-mutual-avatar-wrap';
    const img = document.createElement('img');
    img.className = 'dm-mutual-avatar';
    img.src = resolveGroupAvatar({ name: grp.name, iconDataUrl: grp.iconDataUrl });
    img.alt = grp.name;
    avatarWrap.appendChild(img);

    const info = document.createElement('span');
    info.className = 'dm-mutual-info';
    const name = document.createElement('span');
    name.className = 'dm-mutual-name';
    name.textContent = grp.name;
    const sub = document.createElement('span');
    sub.className = 'dm-mutual-sub';
    sub.textContent = `${grp.memberCount} ${grp.memberCount === 1 ? 'member' : 'members'}`;
    info.appendChild(name);
    info.appendChild(sub);

    row.appendChild(avatarWrap);
    row.appendChild(info);
    if (opts.onOpenGroup) {
      row.addEventListener('click', () => opts.onOpenGroup?.(grp.id));
    } else {
      row.disabled = true;
    }
    list.appendChild(row);
  }
  container.appendChild(list);
}

function renderRelationshipActionBar(
  container: HTMLElement,
  profile: PublicProfile,
  relation: ProfileRelationState,
  onSnapshotUpdated: (snap: SocialSnapshot) => void,
  onClosePopup?: () => void,
  onOpenDm?: (username: string) => void,
): void {
  if (relation === 'friend' && !onOpenDm) {
    return;
  }

  const bar = document.createElement('div');
  bar.className = 'dm-profile-relation-bar';

  const note = document.createElement('div');
  note.className = 'dm-profile-relation-note';

  const statusTag = document.createElement('div');
  statusTag.className = 'dm-profile-relation-feedback';
  statusTag.hidden = true;

  const actions = document.createElement('div');
  actions.className = 'dm-profile-relation-actions';

  const showError = (msg: string) => {
    statusTag.hidden = false;
    statusTag.textContent = msg;
  };

  if (onOpenDm && relation !== 'blocked') {
    const dmBtn = document.createElement('button');
    dmBtn.type = 'button';
    dmBtn.className = 'btn-primary settings-sm-btn';
    dmBtn.textContent = 'Message';
    dmBtn.addEventListener('click', () => {
      onClosePopup?.();
      onOpenDm(profile.username);
    });
    actions.appendChild(dmBtn);
  }

  if (relation === 'incoming') {
    note.textContent = 'Sent you a friend request';
    const acceptBtn = document.createElement('button');
    acceptBtn.type = 'button';
    acceptBtn.className = 'btn-primary settings-sm-btn';
    acceptBtn.textContent = 'Accept Friend';
    acceptBtn.addEventListener('click', async () => {
      acceptBtn.disabled = true;
      const res = await apiAcceptFriendRequest(profile.username);
      if (res.ok && res.snapshot) {
        onSnapshotUpdated(res.snapshot);
      } else {
        acceptBtn.disabled = false;
        showError(res.error ?? 'Error: Could not accept friend request');
      }
    });

    const declineBtn = document.createElement('button');
    declineBtn.type = 'button';
    declineBtn.className = 'btn-secondary settings-sm-btn';
    declineBtn.textContent = 'Decline';
    declineBtn.addEventListener('click', async () => {
      declineBtn.disabled = true;
      const res = await apiDeclineFriendRequest(profile.username);
      if (res.ok && res.snapshot) {
        onSnapshotUpdated(res.snapshot);
      } else {
        declineBtn.disabled = false;
        showError(res.error ?? 'Error: Could not decline friend request');
      }
    });
    actions.appendChild(acceptBtn);
    actions.appendChild(declineBtn);
  } else if (relation === 'outgoing') {
    note.textContent = 'Friend request pending';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn-secondary settings-sm-btn';
    cancelBtn.textContent = 'Cancel Request';
    cancelBtn.addEventListener('click', async () => {
      cancelBtn.disabled = true;
      const res = await apiCancelFriendRequest(profile.username);
      if (res.ok && res.snapshot) {
        onSnapshotUpdated(res.snapshot);
      } else {
        cancelBtn.disabled = false;
        showError(res.error ?? 'Error: Could not cancel request');
      }
    });
    actions.appendChild(cancelBtn);
  } else if (relation === 'blocked') {
    note.textContent = 'Blocked user';
    const unblockBtn = document.createElement('button');
    unblockBtn.type = 'button';
    unblockBtn.className = 'btn-secondary settings-sm-btn';
    unblockBtn.textContent = 'Unblock';
    unblockBtn.addEventListener('click', async () => {
      unblockBtn.disabled = true;
      const res = await apiUnblockUser(profile.username);
      if (res.ok && res.snapshot) {
        onSnapshotUpdated(res.snapshot);
      } else {
        unblockBtn.disabled = false;
        showError(res.error ?? 'Error: Could not unblock user');
      }
    });
    actions.appendChild(unblockBtn);
  } else if (relation === 'none') {
    note.textContent = 'Not on your friends list';
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'btn-secondary settings-sm-btn';
    addBtn.textContent = 'Add Friend';
    addBtn.addEventListener('click', async () => {
      addBtn.disabled = true;
      const res = await apiSendFriendRequest(profile.username);
      if (res.ok && res.snapshot) {
        onSnapshotUpdated(res.snapshot);
      } else {
        addBtn.disabled = false;
        showError(res.error ?? 'Error: Could not send friend request');
      }
    });
    actions.appendChild(addBtn);
  }

  if (note.textContent) {
    bar.appendChild(note);
  }
  bar.appendChild(actions);
  bar.appendChild(statusTag);
  container.appendChild(bar);
}

function buildRelationshipMenuItems(options: {
  user: PublicProfile;
  relation: ProfileRelationState;
  includeViewFull: boolean;
  onViewFull?: () => void;
  onOpenDm?: (username: string) => void;
  onSnapshotUpdated: (snapshot: SocialSnapshot) => void;
}): FloatingActionMenuItem[] {
  const { user, relation } = options;
  const items: FloatingActionMenuItem[] = [];
  if (options.includeViewFull && options.onViewFull) {
    items.push({
      label: 'View Full Profile',
      onSelect: options.onViewFull,
    });
  }
  if (options.onOpenDm && relation !== 'blocked') {
    items.push({
      label: 'Open DM',
      onSelect: () => options.onOpenDm?.(user.username),
    });
  }
  items.push({
    label: 'Copy Username',
    onSelect: () => {
      void navigator.clipboard?.writeText(user.username).catch(() => {});
    },
  });

  if (relation === 'friend') {
    items.push(
      {
        label: 'Remove Friend',
        danger: true,
        dividerBefore: true,
        onSelect: () => {
          void confirmFriendRelationAction('remove', user, options.onSnapshotUpdated);
        },
      },
      {
        label: 'Block',
        danger: true,
        onSelect: () => {
          void confirmFriendRelationAction('block', user, options.onSnapshotUpdated);
        },
      },
    );
  } else if (relation === 'blocked') {
    items.push({
      label: 'Unblock',
      dividerBefore: true,
      onSelect: () => {
        void apiUnblockUser(user.username).then((res) => {
          if (res.ok && res.snapshot) {
            options.onSnapshotUpdated(res.snapshot);
          }
        });
      },
    });
  } else {
    if (relation === 'incoming') {
      items.push({
        label: 'Accept Friend Request',
        dividerBefore: true,
        onSelect: () => {
          void apiAcceptFriendRequest(user.username).then((res) => {
            if (res.ok && res.snapshot) {
              options.onSnapshotUpdated(res.snapshot);
            }
          });
        },
      });
    } else if (relation === 'outgoing') {
      items.push({
        label: 'Cancel Friend Request',
        dividerBefore: true,
        onSelect: () => {
          void apiCancelFriendRequest(user.username).then((res) => {
            if (res.ok && res.snapshot) {
              options.onSnapshotUpdated(res.snapshot);
            }
          });
        },
      });
    } else {
      items.push({
        label: 'Send Friend Request',
        dividerBefore: true,
        onSelect: () => {
          void apiSendFriendRequest(user.username).then((res) => {
            if (res.ok && res.snapshot) {
              options.onSnapshotUpdated(res.snapshot);
            }
          });
        },
      });
    }
    if (!user.isSystemBot && user.username.toLowerCase() !== 'redshift') {
      items.push({
        label: 'Block',
        danger: true,
        onSelect: () => {
          void confirmFriendRelationAction('block', user, options.onSnapshotUpdated);
        },
      });
    }
  }

  if (canReportTarget(user.username)) {
    items.push({
      label: 'Report User',
      danger: true,
      dividerBefore: true,
      onSelect: () => {
        triggerReportUser({ username: user.username, displayName: user.displayName, role: user.role });
      },
    });
  }
  if (canModerateTarget(user)) {
    items.push(
      {
        label: 'Suspend Account',
        danger: true,
        dividerBefore: !canReportTarget(user.username),
        onSelect: () => {
          triggerModerateUser(
            { username: user.username, displayName: user.displayName, role: user.role },
            'suspend',
          );
        },
      },
      {
        label: 'Delete Account',
        danger: true,
        onSelect: () => {
          triggerModerateUser(
            { username: user.username, displayName: user.displayName, role: user.role },
            'terminate',
          );
        },
      },
    );
  }
  return items;
}

const activePublicProfileModals = new Set<{
  getUsernameLower: () => string;
  sync: (nextUser: PublicProfile) => void;
}>();

export function syncOpenPublicProfileModals(snapshot: SocialSnapshot): void {
  if (activePublicProfileModals.size === 0) {
    return;
  }
  const byUsername = new Map<string, PublicProfile>();
  for (const f of snapshot.friends) {
    byUsername.set(f.username.toLowerCase(), f);
  }
  for (const p of snapshot.dmPeers ?? []) {
    if (!byUsername.has(p.username.toLowerCase())) {
      byUsername.set(p.username.toLowerCase(), p);
    }
  }
  for (const r of snapshot.incomingRequests) {
    if (!byUsername.has(r.user.username.toLowerCase())) {
      byUsername.set(r.user.username.toLowerCase(), r.user);
    }
  }
  for (const r of snapshot.outgoingRequests) {
    if (!byUsername.has(r.user.username.toLowerCase())) {
      byUsername.set(r.user.username.toLowerCase(), r.user);
    }
  }
  for (const b of snapshot.blockedUsers ?? []) {
    if (!byUsername.has(b.username.toLowerCase())) {
      byUsername.set(b.username.toLowerCase(), b);
    }
  }
  for (const g of snapshot.groups ?? []) {
    for (const m of g.members) {
      if (!byUsername.has(m.username.toLowerCase())) {
        byUsername.set(m.username.toLowerCase(), m);
      }
    }
  }
  for (const entry of activePublicProfileModals) {
    const latest = byUsername.get(entry.getUsernameLower());
    if (latest) {
      entry.sync(latest);
    }
  }
}

/**
 * Opens a centered full-profile modal for any user (friend, pending user, or group member),
 * respecting private profile visibility and relationship actions.
 */
export function openPublicProfileModal(options: {
  initialUser: PublicProfile;
  resolveAvatar: (profile: { avatarPreset: number | null; avatarDataUrl?: string }) => string;
  onSnapshotUpdated: (snapshot: SocialSnapshot) => void;
  getSnapshot?: () => SocialSnapshot;
  onOpenDm?: (username: string) => void;
  onOpenGroup?: (groupId: string) => void;
  onReplyToStatus?: ReplyToStatusHandler;
  onClose?: () => void;
}): { sync: (nextUser: PublicProfile) => void; close: () => void } {
  let currentUser = options.initialUser;
  let activeMenuBtn: HTMLButtonElement | null = null;
  let activeMenuClose: (() => void) | null = null;
  let isClosed = false;

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop modal-backdrop--deep modal-backdrop--top';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-label', `${currentUser.displayName} full profile`);

  const modal = document.createElement('div');
  modal.className = 'modal-card modal-card--profile';

  const modalBanner = document.createElement('div');
  modalBanner.className = 'dm-full-banner';

  const bannerActions = document.createElement('div');
  bannerActions.className = 'dm-full-banner-actions';

  const menuBtn = document.createElement('button');
  menuBtn.type = 'button';
  menuBtn.className = 'dm-banner-friend-btn';
  menuBtn.title = 'User options';
  menuBtn.setAttribute('aria-label', 'User options');
  menuBtn.setAttribute('aria-haspopup', 'menu');
  menuBtn.setAttribute('aria-expanded', 'false');

  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (activeMenuClose && activeMenuBtn === menuBtn) {
      activeMenuClose();
      return;
    }
    const relation = options.getSnapshot
      ? resolveProfileRelation(options.getSnapshot(), currentUser.username)
      : 'friend';
    const items = buildRelationshipMenuItems({
      user: currentUser,
      relation,
      includeViewFull: false,
      onOpenDm: options.onOpenDm
        ? (uname) => {
            closeModal();
            options.onOpenDm?.(uname);
          }
        : undefined,
      onSnapshotUpdated: options.onSnapshotUpdated,
    });
    activeMenuBtn = menuBtn;
    menuBtn.classList.add('dm-banner-friend-btn--open');
    menuBtn.setAttribute('aria-expanded', 'true');
    activeMenuClose = openFloatingActionMenu({
      anchorEl: menuBtn,
      items,
      onClose: () => {
        menuBtn.classList.remove('dm-banner-friend-btn--open');
        menuBtn.setAttribute('aria-expanded', 'false');
        if (activeMenuBtn === menuBtn) {
          activeMenuBtn = null;
          activeMenuClose = null;
        }
      },
    });
  });

  bannerActions.appendChild(menuBtn);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'dm-full-close';
  closeBtn.setAttribute('aria-label', 'Close profile popup');
  closeBtn.appendChild(createCloseIconSvg(16));
  bannerActions.appendChild(closeBtn);
  modalBanner.appendChild(bannerActions);
  modal.appendChild(modalBanner);

  const modalTop = document.createElement('div');
  modalTop.className = 'dm-full-top';

  const modalAvatarWrap = document.createElement('div');
  modalAvatarWrap.className = 'dm-full-avatar-wrap';
  const modalAvatar = document.createElement('img');
  modalAvatar.className = 'dm-full-avatar';
  const modalStatusDot = document.createElement('span');
  modalStatusDot.className = 'dm-full-status-dot';
  modalAvatarWrap.appendChild(modalAvatar);
  modalAvatarWrap.appendChild(modalStatusDot);
  modalTop.appendChild(modalAvatarWrap);

  const modalBubbleHost = document.createElement('div');
  modalBubbleHost.className = 'dm-full-bubble-host';
  modalTop.appendChild(modalBubbleHost);

  const modalStatusPill = document.createElement('div');
  modalStatusPill.className = 'dm-full-status-pill';
  modalTop.appendChild(modalStatusPill);

  modal.appendChild(modalTop);

  const modalBody = document.createElement('div');
  modalBody.className = 'dm-full-body';

  const modalStatusReplyHost = document.createElement('div');
  modalStatusReplyHost.className = 'dm-status-reply-host dm-status-reply-host--modal';
  modalStatusReplyHost.hidden = true;
  modalBody.appendChild(modalStatusReplyHost);

  const modalDisplay = document.createElement('h3');
  modalDisplay.className = 'dm-full-display';
  modalBody.appendChild(modalDisplay);

  const modalUsername = document.createElement('div');
  modalUsername.className = 'dm-full-username';
  modalBody.appendChild(modalUsername);

  const modalRelationHost = document.createElement('div');
  modalBody.appendChild(modalRelationHost);

  const modalInfoCard = document.createElement('div');
  modalInfoCard.className = 'dm-full-card';
  modalBody.appendChild(modalInfoCard);

  modal.appendChild(modalBody);
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);

  const modalTabsController = createProfileTabsController(
    () => syncModal(currentUser),
    () => !isClosed,
  );

  const modalStatusReplyCtrl = createInlineStatusReplyController(
    modalStatusReplyHost,
    (targetUser, targetStatus, text) => {
      closeModal();
      options.onReplyToStatus?.(targetUser, targetStatus, text, true);
    },
  );

  const syncModal = (friend: PublicProfile) => {
    currentUser = friend;
    const isPrivate = Boolean(friend.isProfilePrivate);
    const relation = options.getSnapshot
      ? resolveProfileRelation(options.getSnapshot(), friend.username)
      : 'friend';
    const isBlocked = Boolean(friend.isBlockedRelation) || relation === 'blocked';
    const visibleStatus = isBlocked ? 'offline' : friend.status;

    menuBtn.replaceChildren(
      relation === 'friend'
        ? createFriendBadgeIconSvg(16)
        : createMoreVerticalSvg(16),
    );

    applyBannerBackground(modalBanner, isPrivate || isBlocked ? {} : friend);
    modalAvatar.src = options.resolveAvatar(friend);
    modalAvatar.alt = `${friend.displayName} profile picture`;

    if (isPrivate) {
      modalStatusDot.replaceChildren(createLockIconSvg(13));
      modalStatusDot.classList.add('dm-full-status-dot--private');
      modalStatusPill.replaceChildren(
        createLockIconSvg(11),
        document.createTextNode('Private Profile'),
      );
    } else {
      modalStatusDot.classList.remove('dm-full-status-dot--private');
      modalStatusDot.replaceChildren(createStatusGlyph(visibleStatus, 18));
      modalStatusPill.replaceChildren(
        createStatusGlyph(visibleStatus, 10),
        document.createTextNode(STATUS_LABELS[visibleStatus]),
      );
    }

    modalBubbleHost.replaceChildren();
    let hasModalReplyBubble = false;
    if (!isPrivate && !isBlocked) {
      const canReply =
        Boolean(options.onReplyToStatus) &&
        canReplyToUserCustomStatus(friend, relation, options.getSnapshot?.());
      const modalBubble = createThoughtBubbleElement({
        profile: friend,
        onReply: canReply
          ? (status) => {
              modalStatusReplyCtrl.open(friend, status);
            }
          : undefined,
      });
      if (modalBubble) {
        hasModalReplyBubble = canReply;
        modalBubbleHost.appendChild(modalBubble);
      }
    }
    modalStatusReplyCtrl.syncAvailability(hasModalReplyBubble);

    setDisplayNameWithRoleBadge(modalDisplay, friend.displayName, friend, { badgeSize: 18 });
    modalUsername.textContent = friend.username;

    modalRelationHost.replaceChildren();
    renderRelationshipActionBar(
      modalRelationHost,
      friend,
      relation,
      options.onSnapshotUpdated,
      closeModal,
      options.onOpenDm,
    );

    renderProfileDetailsTabbedCard({
      container: modalInfoCard,
      user: friend,
      variant: 'modal',
      isPrivate,
      isBlocked,
      bioExpanded: true,
      onToggleBioExpand: () => {},
      controller: modalTabsController,
      getSnapshot: options.getSnapshot,
      resolveAvatar: options.resolveAvatar,
      onOpenDm: options.onOpenDm
        ? (uname) => {
            closeModal();
            options.onOpenDm?.(uname);
          }
        : undefined,
      onOpenGroup: options.onOpenGroup
        ? (gid) => {
            closeModal();
            options.onOpenGroup?.(gid);
          }
        : undefined,
    });
  };

  const modalRegistryEntry = {
    getUsernameLower: () => currentUser.username.toLowerCase(),
    sync: syncModal,
  };
  activePublicProfileModals.add(modalRegistryEntry);

  const closeModal = () => {
    if (isClosed) {
      return;
    }
    isClosed = true;
    activePublicProfileModals.delete(modalRegistryEntry);
    activeMenuClose?.();
    document.removeEventListener('keydown', onEscape, true);
    backdrop.classList.remove('modal-backdrop--visible');
    window.setTimeout(() => backdrop.remove(), 170);
    options.onClose?.();
  };

  const onEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (activeMenuClose) {
        activeMenuClose();
        return;
      }
      closeModal();
    }
  };

  syncModal(currentUser);
  closeBtn.addEventListener('click', closeModal);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) {
      closeModal();
    }
  });
  document.addEventListener('keydown', onEscape, true);
  requestAnimationFrame(() => backdrop.classList.add('modal-backdrop--visible'));

  return { sync: syncModal, close: closeModal };
}

export function createDmProfilePanel(options: DmProfilePanelOptions): DmProfilePanelHandle {
  let currentFriend = options.initialFriend;
  let bioExpanded = false;
  let modalHandle: { sync: (friend: PublicProfile) => void; close: () => void } | null = null;
  let activeBannerMenuBtn: HTMLButtonElement | null = null;
  let activeBannerMenuClose: (() => void) | null = null;

  const bannerFriendBtn = document.createElement('button');
  bannerFriendBtn.type = 'button';
  bannerFriendBtn.className = 'dm-banner-friend-btn dm-banner-friend-btn--corner';
  bannerFriendBtn.title = 'User options';
  bannerFriendBtn.setAttribute('aria-label', 'User options');
  bannerFriendBtn.setAttribute('aria-haspopup', 'menu');
  bannerFriendBtn.setAttribute('aria-expanded', 'false');

  const openFullProfilePopup = () => {
    if (modalHandle) {
      return;
    }
    modalHandle = openPublicProfileModal({
      initialUser: currentFriend,
      resolveAvatar: options.resolveAvatar,
      onSnapshotUpdated: options.onSnapshotUpdated,
      getSnapshot: options.getSnapshot,
      onOpenDm: options.onOpenDm,
      onOpenGroup: options.onOpenGroup,
      onReplyToStatus: options.onReplyToStatus,
      onClose: () => {
        modalHandle = null;
      },
    });
  };

  bannerFriendBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (activeBannerMenuClose && activeBannerMenuBtn === bannerFriendBtn) {
      activeBannerMenuClose();
      return;
    }

    const relation = options.getSnapshot
      ? resolveProfileRelation(options.getSnapshot(), currentFriend.username)
      : 'friend';
    const items = buildRelationshipMenuItems({
      user: currentFriend,
      relation,
      includeViewFull: true,
      onViewFull: openFullProfilePopup,
      onSnapshotUpdated: options.onSnapshotUpdated,
    });

    activeBannerMenuBtn = bannerFriendBtn;
    bannerFriendBtn.classList.add('dm-banner-friend-btn--open');
    bannerFriendBtn.setAttribute('aria-expanded', 'true');
    activeBannerMenuClose = openFloatingActionMenu({
      anchorEl: bannerFriendBtn,
      items,
      onClose: () => {
        bannerFriendBtn.classList.remove('dm-banner-friend-btn--open');
        bannerFriendBtn.setAttribute('aria-expanded', 'false');
        if (activeBannerMenuBtn === bannerFriendBtn) {
          activeBannerMenuBtn = null;
          activeBannerMenuClose = null;
        }
      },
    });
  });

  const aside = document.createElement('aside');
  aside.className = 'dm-profile-panel';
  aside.setAttribute('aria-label', 'User profile inspection');

  const scrollWrap = document.createElement('div');
  scrollWrap.className = 'dm-profile-scroll';

  const banner = document.createElement('div');
  banner.className = 'dm-profile-banner';
  banner.appendChild(bannerFriendBtn);
  scrollWrap.appendChild(banner);

  const avatarRow = document.createElement('div');
  avatarRow.className = 'dm-profile-avatar-row';

  const avatarBtn = document.createElement('button');
  avatarBtn.type = 'button';
  avatarBtn.className = 'dm-profile-avatar-btn';
  avatarBtn.title = 'View avatar';
  avatarBtn.setAttribute('aria-label', 'View enlarged avatar');

  const avatarImg = document.createElement('img');
  avatarImg.className = 'dm-profile-avatar';
  avatarBtn.appendChild(avatarImg);

  const statusBadge = document.createElement('span');
  statusBadge.className = 'dm-profile-status-badge';
  avatarBtn.appendChild(statusBadge);

  avatarBtn.addEventListener('click', () => {
    openImageLightbox(
      options.resolveAvatar(currentFriend),
      `${currentFriend.displayName} avatar`,
    );
  });

  avatarRow.appendChild(avatarBtn);

  const sideBubbleHost = document.createElement('div');
  sideBubbleHost.className = 'dm-profile-bubble-host';
  avatarRow.appendChild(sideBubbleHost);

  scrollWrap.appendChild(avatarRow);

  const sideStatusReplyHost = document.createElement('div');
  sideStatusReplyHost.className = 'dm-status-reply-host dm-status-reply-host--sidebar';
  sideStatusReplyHost.hidden = true;
  scrollWrap.appendChild(sideStatusReplyHost);

  const identity = document.createElement('div');
  identity.className = 'dm-profile-identity';

  const displayNameEl = document.createElement('h2');
  displayNameEl.className = 'dm-profile-display';
  identity.appendChild(displayNameEl);

  const usernameEl = document.createElement('div');
  usernameEl.className = 'dm-profile-username';
  identity.appendChild(usernameEl);

  scrollWrap.appendChild(identity);

  const relationHost = document.createElement('div');
  relationHost.className = 'dm-profile-relation-host';
  scrollWrap.appendChild(relationHost);

  const card = document.createElement('div');
  card.className = 'dm-profile-card';
  scrollWrap.appendChild(card);

  aside.appendChild(scrollWrap);

  const footer = document.createElement('div');
  footer.className = 'dm-profile-footer';

  const fullProfileBtn = document.createElement('button');
  fullProfileBtn.type = 'button';
  fullProfileBtn.className = 'dm-profile-full-btn';
  fullProfileBtn.textContent = 'View Full Profile';
  footer.appendChild(fullProfileBtn);

  aside.appendChild(footer);

  let destroyed = false;
  const sideTabsController = createProfileTabsController(
    () => syncSideContents(),
    () => !destroyed,
  );

  const sideStatusReplyCtrl = createInlineStatusReplyController(
    sideStatusReplyHost,
    (targetUser, targetStatus, text) => {
      options.onReplyToStatus?.(targetUser, targetStatus, text, false);
    },
  );

  const syncSideContents = () => {
    const isPrivate = Boolean(currentFriend.isProfilePrivate);
    const relation = options.getSnapshot
      ? resolveProfileRelation(options.getSnapshot(), currentFriend.username)
      : 'friend';
    const isBlocked = Boolean(currentFriend.isBlockedRelation) || relation === 'blocked';
    const visibleStatus = isBlocked ? 'offline' : currentFriend.status;

    bannerFriendBtn.replaceChildren(
      relation === 'friend'
        ? createFriendBadgeIconSvg(16)
        : createMoreVerticalSvg(16),
    );
    bannerFriendBtn.title = relation === 'friend' ? 'Friend options' : 'User options';

    applyBannerBackground(banner, isPrivate || isBlocked ? {} : currentFriend);
    const avatarSrc = options.resolveAvatar(currentFriend);
    avatarImg.src = avatarSrc;
    avatarImg.alt = `${currentFriend.displayName} profile picture`;

    if (isPrivate) {
      statusBadge.classList.add('dm-profile-status-badge--private');
      statusBadge.replaceChildren(createLockIconSvg(11));
      statusBadge.title = 'Private Profile';
    } else {
      statusBadge.classList.remove('dm-profile-status-badge--private');
      statusBadge.replaceChildren(createStatusGlyph(visibleStatus, 15));
      statusBadge.title = STATUS_LABELS[visibleStatus];
    }

    sideBubbleHost.replaceChildren();
    let hasSideReplyBubble = false;
    if (!isPrivate && !isBlocked) {
      const canReply =
        Boolean(options.onReplyToStatus) &&
        canReplyToUserCustomStatus(currentFriend, relation, options.getSnapshot?.());
      const sideBubble = createThoughtBubbleElement({
        profile: currentFriend,
        onReply: canReply
          ? (status) => {
              sideStatusReplyCtrl.open(currentFriend, status);
            }
          : undefined,
      });
      if (sideBubble) {
        hasSideReplyBubble = canReply;
        sideBubbleHost.appendChild(sideBubble);
      }
    }
    sideStatusReplyCtrl.syncAvailability(hasSideReplyBubble);

    setDisplayNameWithRoleBadge(displayNameEl, currentFriend.displayName, currentFriend, { badgeSize: 17 });
    usernameEl.textContent = currentFriend.username;

    relationHost.replaceChildren();
    renderRelationshipActionBar(
      relationHost,
      currentFriend,
      relation,
      options.onSnapshotUpdated,
    );

    renderProfileDetailsTabbedCard({
      container: card,
      user: currentFriend,
      variant: 'sidebar',
      isPrivate,
      isBlocked,
      bioExpanded,
      onToggleBioExpand: () => {
        bioExpanded = !bioExpanded;
        syncSideContents();
      },
      controller: sideTabsController,
      getSnapshot: options.getSnapshot,
      resolveAvatar: options.resolveAvatar,
      onOpenDm: options.onOpenDm,
      onOpenGroup: options.onOpenGroup,
    });
  };

  fullProfileBtn.addEventListener('click', openFullProfilePopup);
  syncSideContents();

  return {
    element: aside,
    update(friend: PublicProfile) {
      currentFriend = friend;
      syncSideContents();
      modalHandle?.sync(friend);
    },
    destroy() {
      destroyed = true;
      activeBannerMenuClose?.();
      modalHandle?.close();
    },
  };
}
