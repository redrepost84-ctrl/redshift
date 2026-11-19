import {
  apiAcceptFriendRequest,
  apiCancelFriendRequest,
  apiDeclineFriendRequest,
  apiSendFriendRequest,
  apiUnblockUser,
} from './apiClient';
import {
  confirmFriendRelationAction,
  createMoreVerticalSvg,
  openFloatingActionMenu,
} from './chatUi';
import { createHeaderUpdateAvailableButton } from './changelogModal';
import { formatCustomStatusLine } from './customStatusModal';
import {
  createProfilePanelToggleIconSvg,
  openPublicProfileModal,
} from './dmProfilePanel';
import { createStatusGlyph } from './profileDrawer';
import { setTwemojiText } from './twemojiHelper';
import type {
  EffectiveStatus,
  FriendsTab,
  PendingRequestItem,
  PublicProfile,
  SocialSnapshot,
} from './types';

interface FriendsViewOptions {
  getSnapshot: () => SocialSnapshot;
  resolveAvatar: (profile: { avatarPreset: number | null; avatarDataUrl?: string }) => string;
  activeTab: FriendsTab;
  onTabChange: (tab: FriendsTab) => void;
  onOpenDm: (friendUsername: string) => void;
  onSnapshotUpdated: (snapshot: SocialSnapshot) => void;
}

const EMPTY_FRIENDS_MESSAGE =
  "Looks like you dont have any friends in your DMs right now. That's okay! You can make friends by adding them! c:";

const STATUS_DISPLAY_LABEL: Record<EffectiveStatus, string> = {
  online: 'Online',
  idle: 'Idle',
  dnd: 'Do Not Disturb',
  invisible: 'Offline',
  offline: 'Offline',
};

export function createFriendsIconSvg(size = 20): SVGSVGElement {
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

  const paths = [
    'M8.5 11a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5Z',
    'M2.75 19.5c0-2.9 2.55-5 5.75-5s5.75 2.1 5.75 5',
    'M16.25 11.75a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2Z',
    'M15.8 14.8c2.95.2 5.45 2.05 5.45 4.7',
  ];

  for (const d of paths) {
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
  }

  return svg;
}

function createActionSvg(paths: string[], size = 16): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2.1');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');

  for (const d of paths) {
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
  }
  return svg;
}

function createSearchIcon(): SVGSVGElement {
  return createActionSvg(['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'M21 21l-4.35-4.35'], 16);
}

export interface FriendsPanelHandle {
  syncLive: () => void;
}

export function renderFriendsPanel(
  container: HTMLElement,
  options: FriendsViewOptions,
): FriendsPanelHandle {
  let searchQuery = '';
  let addFriendValue = '';
  let addBusy = false;
  let addFeedback: { kind: 'error' | 'success'; text: string } | null = null;

  container.replaceChildren();

  const header = document.createElement('header');
  header.className = 'friends-header';

  const titleGroup = document.createElement('div');
  titleGroup.className = 'friends-header-title';
  titleGroup.appendChild(createFriendsIconSvg(20));
  const titleText = document.createElement('span');
  titleText.textContent = 'Friends';
  titleGroup.appendChild(titleText);
  header.appendChild(titleGroup);

  const dotSep = document.createElement('span');
  dotSep.className = 'friends-header-dot';
  dotSep.textContent = '•';
  header.appendChild(dotSep);

  const tabsNav = document.createElement('nav');
  tabsNav.className = 'friends-tabs';
  tabsNav.setAttribute('aria-label', 'Friends filters');

  const tabs: Array<{ id: FriendsTab; label: string; isAdd?: boolean }> = [
    { id: 'online', label: 'Online' },
    { id: 'all', label: 'All' },
    { id: 'pending', label: 'Pending' },
    { id: 'blocked', label: 'Blocked' },
    { id: 'add', label: 'Add Friend', isAdd: true },
  ];

  const tabButtons = new Map<FriendsTab, HTMLButtonElement>();

  for (const tab of tabs) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = tab.isAdd ? 'friends-tab friends-tab--add' : 'friends-tab';
    if (options.activeTab === tab.id) {
      btn.classList.add('friends-tab--active');
    }

    const labelSpan = document.createElement('span');
    labelSpan.textContent = tab.label;
    btn.appendChild(labelSpan);

    btn.addEventListener('click', () => {
      if (options.activeTab !== tab.id) {
        options.onTabChange(tab.id);
      }
    });

    tabButtons.set(tab.id, btn);
    tabsNav.appendChild(btn);
  }

  header.appendChild(tabsNav);
  header.appendChild(createHeaderUpdateAvailableButton());
  container.appendChild(header);

  const updatePendingBadge = () => {
    const pendingBtn = tabButtons.get('pending');
    if (!pendingBtn) {
      return;
    }
    const existingBadge = pendingBtn.querySelector('.friends-tab-badge');
    const latestCount = options.getSnapshot().incomingRequests.length;
    if (latestCount > 0) {
      if (existingBadge) {
        existingBadge.textContent = String(latestCount);
      } else {
        const badge = document.createElement('span');
        badge.className = 'friends-tab-badge';
        badge.textContent = String(latestCount);
        pendingBtn.appendChild(badge);
      }
    } else if (existingBadge) {
      existingBadge.remove();
    }
  };
  updatePendingBadge();

  const body = document.createElement('div');
  body.className = 'friends-body';
  container.appendChild(body);

  const renderEmptyState = (text: string): HTMLDivElement => {
    const wrap = document.createElement('div');
    wrap.className = 'friends-empty';
    const p = document.createElement('p');
    p.className = 'friends-empty-text';
    p.textContent = text;
    wrap.appendChild(p);
    return wrap;
  };

  let listRefresher: (() => void) | null = null;

  const createFriendRow = (friend: PublicProfile): HTMLDivElement => {
    const row = document.createElement('div');
    row.className = 'friend-row';
    row.tabIndex = 0;
    row.setAttribute('role', 'button');
    row.setAttribute('aria-label', `Message ${friend.displayName}`);

    const left = document.createElement('div');
    left.className = 'friend-row-left';

    const avatarWrap = document.createElement('div');
    avatarWrap.className = 'friend-avatar-wrap';

    const avatar = document.createElement('img');
    avatar.className = 'friend-avatar-img';
    avatar.src = options.resolveAvatar(friend);
    avatar.alt = `${friend.displayName} profile picture`;
    avatarWrap.appendChild(avatar);

    const statusBadge = document.createElement('span');
    statusBadge.className = 'friend-status-badge';
    statusBadge.appendChild(createStatusGlyph(friend.status, 10));
    avatarWrap.appendChild(statusBadge);

    left.appendChild(avatarWrap);

    const meta = document.createElement('div');
    meta.className = 'friend-row-meta';

    const nameRow = document.createElement('div');
    nameRow.className = 'friend-name-row';

    const displayEl = document.createElement('span');
    displayEl.className = 'friend-display-name';
    displayEl.textContent = friend.displayName;
    nameRow.appendChild(displayEl);

    const usernameEl = document.createElement('span');
    usernameEl.className = 'friend-username-inline';
    usernameEl.textContent = friend.username;
    nameRow.appendChild(usernameEl);

    meta.appendChild(nameRow);

    const subEl = document.createElement('div');
    subEl.className = 'friend-subtext';
    if (friend.isProfilePrivate) {
      subEl.textContent = 'Private Profile';
    } else {
      setTwemojiText(subEl, formatCustomStatusLine(friend) ?? STATUS_DISPLAY_LABEL[friend.status]);
    }
    meta.appendChild(subEl);

    left.appendChild(meta);
    row.appendChild(left);

    const actions = document.createElement('div');
    actions.className = 'friend-row-actions';

    const msgBtn = document.createElement('button');
    msgBtn.type = 'button';
    msgBtn.className = 'friend-circle-btn';
    msgBtn.title = 'Message';
    msgBtn.setAttribute('aria-label', `Open DM with ${friend.displayName}`);
    msgBtn.appendChild(
      createActionSvg([
        'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
      ]),
    );
    msgBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      options.onOpenDm(friend.username);
    });

    const openMenuForFriend = (anchorEl?: HTMLElement, clientX?: number, clientY?: number) => {
      openFloatingActionMenu({
        anchorEl,
        clientX,
        clientY,
        items: [
          {
            label: 'Message',
            onSelect: () => options.onOpenDm(friend.username),
          },
          {
            label: 'View Profile',
            onSelect: () => {
              openPublicProfileModal({
                initialUser: friend,
                getSnapshot: options.getSnapshot,
                resolveAvatar: options.resolveAvatar,
                onSnapshotUpdated: options.onSnapshotUpdated,
                onOpenDm: options.onOpenDm,
              });
            },
          },
          {
            label: 'Remove Friend',
            danger: true,
            onSelect: () => {
              void confirmFriendRelationAction('remove', friend, options.onSnapshotUpdated);
            },
          },
          {
            label: 'Block',
            danger: true,
            onSelect: () => {
              void confirmFriendRelationAction('block', friend, options.onSnapshotUpdated);
            },
          },
        ],
      });
    };

    const moreBtn = document.createElement('button');
    moreBtn.type = 'button';
    moreBtn.className = 'friend-circle-btn';
    moreBtn.title = 'More';
    moreBtn.setAttribute('aria-label', `More actions for ${friend.displayName}`);
    moreBtn.appendChild(createMoreVerticalSvg(16));
    moreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openMenuForFriend(moreBtn);
    });

    actions.appendChild(msgBtn);
    actions.appendChild(moreBtn);
    row.appendChild(actions);

    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openMenuForFriend(undefined, e.clientX, e.clientY);
    });

    row.addEventListener('click', () => options.onOpenDm(friend.username));
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        options.onOpenDm(friend.username);
      }
    });

    return row;
  };

  const createPendingRow = (item: PendingRequestItem): HTMLDivElement => {
    const row = document.createElement('div');
    row.className = 'friend-row';
    row.tabIndex = 0;
    row.setAttribute('role', 'button');
    row.setAttribute('aria-label', `Open DM with ${item.user.displayName}`);

    const openPendingProfileModal = () => {
      openPublicProfileModal({
        initialUser: item.user,
        getSnapshot: options.getSnapshot,
        resolveAvatar: options.resolveAvatar,
        onSnapshotUpdated: options.onSnapshotUpdated,
        onOpenDm: options.onOpenDm,
      });
    };

    const left = document.createElement('div');
    left.className = 'friend-row-left';

    const avatarWrap = document.createElement('div');
    avatarWrap.className = 'friend-avatar-wrap';

    const avatar = document.createElement('img');
    avatar.className = 'friend-avatar-img';
    avatar.src = options.resolveAvatar(item.user);
    avatar.alt = `${item.user.displayName} profile picture`;
    avatarWrap.appendChild(avatar);
    left.appendChild(avatarWrap);

    const meta = document.createElement('div');
    meta.className = 'friend-row-meta';

    const nameEl = document.createElement('div');
    nameEl.className = 'friend-display-name';
    nameEl.textContent = item.user.displayName;
    meta.appendChild(nameEl);

    const subEl = document.createElement('div');
    subEl.className = 'friend-subtext';
    const baseSub =
      item.direction === 'incoming'
        ? `${item.user.username} • Incoming Friend Request`
        : `${item.user.username} • Outgoing Friend Request`;
    subEl.textContent = item.user.isProfilePrivate
      ? `${baseSub} • Private Profile`
      : baseSub;
    meta.appendChild(subEl);

    left.appendChild(meta);
    row.appendChild(left);

    const actions = document.createElement('div');
    actions.className = 'friend-row-actions';

    const msgBtn = document.createElement('button');
    msgBtn.type = 'button';
    msgBtn.className = 'friend-circle-btn';
    msgBtn.title = 'Message';
    msgBtn.setAttribute('aria-label', `Open DM with ${item.user.displayName}`);
    msgBtn.appendChild(
      createActionSvg(['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z']),
    );
    msgBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      options.onOpenDm(item.user.username);
    });

    const profileBtn = document.createElement('button');
    profileBtn.type = 'button';
    profileBtn.className = 'friend-circle-btn';
    profileBtn.title = 'View Profile';
    profileBtn.setAttribute('aria-label', `View ${item.user.displayName}'s profile`);
    profileBtn.appendChild(createProfilePanelToggleIconSvg(16));
    profileBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openPendingProfileModal();
    });

    actions.appendChild(msgBtn);
    actions.appendChild(profileBtn);

    if (item.direction === 'incoming') {
      const acceptBtn = document.createElement('button');
      acceptBtn.type = 'button';
      acceptBtn.className = 'friend-circle-btn friend-circle-btn--accept';
      acceptBtn.title = 'Accept';
      acceptBtn.setAttribute('aria-label', `Accept friend request from ${item.user.displayName}`);
      acceptBtn.appendChild(createActionSvg(['M20 6L9 17l-5-5'], 17));

      const declineBtn = document.createElement('button');
      declineBtn.type = 'button';
      declineBtn.className = 'friend-circle-btn friend-circle-btn--decline';
      declineBtn.title = 'Decline';
      declineBtn.setAttribute('aria-label', `Decline friend request from ${item.user.displayName}`);
      declineBtn.appendChild(createActionSvg(['M18 6L6 18', 'M6 6l12 12'], 16));

      acceptBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        acceptBtn.disabled = true;
        declineBtn.disabled = true;
        const res = await apiAcceptFriendRequest(item.user.username);
        if (res.ok && res.snapshot) {
          options.onSnapshotUpdated(res.snapshot);
        } else {
          acceptBtn.disabled = false;
          declineBtn.disabled = false;
        }
      });

      declineBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        acceptBtn.disabled = true;
        declineBtn.disabled = true;
        const res = await apiDeclineFriendRequest(item.user.username);
        if (res.ok && res.snapshot) {
          options.onSnapshotUpdated(res.snapshot);
        } else {
          acceptBtn.disabled = false;
          declineBtn.disabled = false;
        }
      });

      actions.appendChild(acceptBtn);
      actions.appendChild(declineBtn);
    } else {
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'friend-circle-btn friend-circle-btn--cancel';
      cancelBtn.title = 'Cancel';
      cancelBtn.setAttribute('aria-label', `Cancel friend request to ${item.user.displayName}`);
      cancelBtn.appendChild(createActionSvg(['M18 6L6 18', 'M6 6l12 12'], 16));
      cancelBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        cancelBtn.disabled = true;
        const res = await apiCancelFriendRequest(item.user.username);
        if (res.ok && res.snapshot) {
          options.onSnapshotUpdated(res.snapshot);
        } else {
          cancelBtn.disabled = false;
        }
      });

      actions.appendChild(cancelBtn);
    }

    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openFloatingActionMenu({
        clientX: e.clientX,
        clientY: e.clientY,
        items: [
          {
            label: 'Open DM',
            onSelect: () => options.onOpenDm(item.user.username),
          },
          {
            label: 'View Profile',
            onSelect: openPendingProfileModal,
          },
        ],
      });
    });

    row.addEventListener('click', () => options.onOpenDm(item.user.username));
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        options.onOpenDm(item.user.username);
      }
    });

    row.appendChild(actions);
    return row;
  };

  const createBlockedRow = (blockedUser: PublicProfile): HTMLDivElement => {
    const row = document.createElement('div');
    row.className = 'friend-row friend-row--static';

    const left = document.createElement('div');
    left.className = 'friend-row-left';

    const avatarWrap = document.createElement('div');
    avatarWrap.className = 'friend-avatar-wrap';

    const avatar = document.createElement('img');
    avatar.className = 'friend-avatar-img';
    avatar.src = options.resolveAvatar(blockedUser);
    avatar.alt = `${blockedUser.displayName} profile picture`;
    avatarWrap.appendChild(avatar);
    left.appendChild(avatarWrap);

    const meta = document.createElement('div');
    meta.className = 'friend-row-meta';

    const nameRow = document.createElement('div');
    nameRow.className = 'friend-name-row';

    const displayEl = document.createElement('span');
    displayEl.className = 'friend-display-name';
    displayEl.textContent = blockedUser.displayName;
    nameRow.appendChild(displayEl);

    const usernameEl = document.createElement('span');
    usernameEl.className = 'friend-username-inline';
    usernameEl.textContent = blockedUser.username;
    nameRow.appendChild(usernameEl);
    meta.appendChild(nameRow);

    const subEl = document.createElement('div');
    subEl.className = 'friend-subtext';
    subEl.textContent = 'Blocked';
    meta.appendChild(subEl);

    left.appendChild(meta);
    row.appendChild(left);

    const actions = document.createElement('div');
    actions.className = 'friend-row-actions';

    const unblockBtn = document.createElement('button');
    unblockBtn.type = 'button';
    unblockBtn.className = 'friend-unblock-btn';
    unblockBtn.textContent = 'Unblock';
    unblockBtn.addEventListener('click', async () => {
      unblockBtn.disabled = true;
      unblockBtn.textContent = 'Unblocking...';
      const res = await apiUnblockUser(blockedUser.username);
      if (res.ok && res.snapshot) {
        options.onSnapshotUpdated(res.snapshot);
      } else {
        unblockBtn.disabled = false;
        unblockBtn.textContent = 'Unblock';
      }
    });

    actions.appendChild(unblockBtn);
    row.appendChild(actions);
    return row;
  };

  if (options.activeTab === 'add') {
    const addSection = document.createElement('div');
    addSection.className = 'add-friend-panel';

    const addHeading = document.createElement('h2');
    addHeading.className = 'add-friend-title';
    addHeading.textContent = 'Add Friend';
    addSection.appendChild(addHeading);

    const addSubtitle = document.createElement('p');
    addSubtitle.className = 'add-friend-subtitle';
    addSubtitle.textContent = 'You can add friends with their Redshift username.';
    addSection.appendChild(addSubtitle);

    const addForm = document.createElement('form');
    addForm.className = 'add-friend-form';
    addForm.noValidate = true;

    const box = document.createElement('div');
    box.className = 'add-friend-box';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'add-friend-input';
    input.placeholder = 'Enter a username';
    input.value = addFriendValue;
    input.autocomplete = 'off';

    const submitBtn = document.createElement('button');
    submitBtn.type = 'submit';
    submitBtn.className = 'add-friend-submit';
    submitBtn.textContent = 'Send Friend Request';
    submitBtn.disabled = !addFriendValue.trim();

    box.appendChild(input);
    box.appendChild(submitBtn);
    addForm.appendChild(box);

    const feedbackSlot = document.createElement('div');
    feedbackSlot.className = 'add-friend-feedback';
    addForm.appendChild(feedbackSlot);

    const syncAddFeedback = () => {
      feedbackSlot.replaceChildren();
      box.classList.remove('add-friend-box--error', 'add-friend-box--success');
      if (!addFeedback) {
        return;
      }
      box.classList.add(
        addFeedback.kind === 'error' ? 'add-friend-box--error' : 'add-friend-box--success',
      );
      const banner = document.createElement('div');
      banner.className = `feedback-banner feedback-banner--${addFeedback.kind}`;
      banner.textContent = addFeedback.text;
      feedbackSlot.appendChild(banner);
    };

    input.addEventListener('input', () => {
      addFriendValue = input.value;
      if (!addBusy) {
        submitBtn.disabled = !addFriendValue.trim();
      }
      if (addFeedback) {
        addFeedback = null;
        syncAddFeedback();
      }
    });

    addForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (addBusy) {
        return;
      }

      addBusy = true;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending...';

      const res = await apiSendFriendRequest(input.value);
      addBusy = false;
      submitBtn.textContent = 'Send Friend Request';

      if (!res.ok) {
        submitBtn.disabled = !input.value.trim();
        addFeedback = { kind: 'error', text: res.error ?? 'Error: Could not send friend request' };
        syncAddFeedback();
        return;
      }

      addFriendValue = '';
      input.value = '';
      submitBtn.disabled = true;
      addFeedback = {
        kind: 'success',
        text: res.message ?? 'Friend request sent.',
      };
      syncAddFeedback();
      if (res.snapshot) {
        options.onSnapshotUpdated(res.snapshot);
      }
    });

    addSection.appendChild(addForm);
    body.appendChild(addSection);

    requestAnimationFrame(() => input.focus());
    return {
      syncLive: () => {
        updatePendingBadge();
      },
    };
  }

  const searchWrap = document.createElement('div');
  searchWrap.className = 'friends-search-wrap';

  const searchBox = document.createElement('div');
  searchBox.className = 'friends-search-box';

  const searchIcon = document.createElement('span');
  searchIcon.className = 'friends-search-icon';
  searchIcon.appendChild(createSearchIcon());

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'friends-search-input';
  searchInput.placeholder = 'Search';
  searchInput.setAttribute('aria-label', 'Search');

  searchBox.appendChild(searchIcon);
  searchBox.appendChild(searchInput);
  searchWrap.appendChild(searchBox);
  body.appendChild(searchWrap);

  const listContainer = document.createElement('div');
  listContainer.className = 'friends-list-scroll';
  body.appendChild(listContainer);

  const hashDataUrl = (str?: string): string => {
    if (!str) return '';
    let h = 2166136261;
    const step = Math.max(1, Math.floor(str.length / 64));
    for (let i = 0; i < str.length; i += step) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return `${str.length}:${h >>> 0}`;
  };

  const profileRowSig = (p: PublicProfile): string =>
    [
      p.username,
      p.displayName,
      p.status,
      p.bio,
      p.avatarPreset ?? 'c',
      hashDataUrl(p.avatarDataUrl),
      p.bannerColor ?? '',
      hashDataUrl(p.bannerDataUrl),
      p.customStatus?.emoji ?? '',
      p.customStatus?.text ?? '',
      p.isProfilePrivate ? 'P' : 'O',
    ].join(':');

  let lastListSig = '';

  const renderFilteredList = () => {
    const snapshot = options.getSnapshot();
    const q = searchQuery.trim().toLowerCase();
    const nextSig = [
      options.activeTab,
      q,
      snapshot.friends.map(profileRowSig).join('|'),
      snapshot.incomingRequests.map((r) => profileRowSig(r.user)).join('|'),
      snapshot.outgoingRequests.map((r) => profileRowSig(r.user)).join('|'),
      (snapshot.blockedUsers ?? []).map(profileRowSig).join('|'),
    ].join('§');
    if (nextSig === lastListSig && listContainer.childElementCount > 0) {
      return;
    }
    lastListSig = nextSig;
    listContainer.replaceChildren();

    if (options.activeTab === 'pending') {
      const incoming = q
        ? snapshot.incomingRequests.filter(
            (r) =>
              r.user.displayName.toLowerCase().includes(q) ||
              r.user.username.toLowerCase().includes(q),
          )
        : snapshot.incomingRequests;
      const outgoing = q
        ? snapshot.outgoingRequests.filter(
            (r) =>
              r.user.displayName.toLowerCase().includes(q) ||
              r.user.username.toLowerCase().includes(q),
          )
        : snapshot.outgoingRequests;

      const total = snapshot.incomingRequests.length + snapshot.outgoingRequests.length;
      if (incoming.length === 0 && outgoing.length === 0) {
        listContainer.appendChild(
          renderEmptyState(
            total === 0
              ? 'There are no pending friend requests right now.'
              : 'No pending requests match your search.',
          ),
        );
        return;
      }

      if (incoming.length > 0) {
        const heading = document.createElement('div');
        heading.className = 'friends-section-count';
        heading.textContent = `Incoming — ${incoming.length}`;
        listContainer.appendChild(heading);

        for (const req of incoming) {
          listContainer.appendChild(createPendingRow(req));
        }
      }

      if (outgoing.length > 0) {
        const heading = document.createElement('div');
        heading.className = 'friends-section-count';
        heading.textContent = `Sent — ${outgoing.length}`;
        listContainer.appendChild(heading);

        for (const req of outgoing) {
          listContainer.appendChild(createPendingRow(req));
        }
      }
      return;
    }

    if (options.activeTab === 'blocked') {
      const allBlocked = snapshot.blockedUsers ?? [];
      const filteredBlocked = q
        ? allBlocked.filter(
            (u) =>
              u.displayName.toLowerCase().includes(q) ||
              u.username.toLowerCase().includes(q),
          )
        : allBlocked;

      if (filteredBlocked.length === 0) {
        listContainer.appendChild(
          renderEmptyState(
            allBlocked.length === 0
              ? "You haven't blocked anyone."
              : 'No blocked users match your search.',
          ),
        );
        return;
      }

      const countLabel = document.createElement('div');
      countLabel.className = 'friends-section-count';
      countLabel.textContent = `Blocked — ${filteredBlocked.length}`;
      listContainer.appendChild(countLabel);

      for (const blockedUser of filteredBlocked) {
        listContainer.appendChild(createBlockedRow(blockedUser));
      }
      return;
    }

    const allFriends = snapshot.friends;
    if (allFriends.length === 0) {
      listContainer.appendChild(renderEmptyState(EMPTY_FRIENDS_MESSAGE));
      return;
    }

    let tabFriends =
      options.activeTab === 'online'
        ? allFriends.filter((f) => f.status !== 'offline' && f.status !== 'invisible')
        : [...allFriends].sort((a, b) => {
            const aOffline = a.status === 'offline' || a.status === 'invisible' ? 0 : 1;
            const bOffline = b.status === 'offline' || b.status === 'invisible' ? 0 : 1;
            if (aOffline !== bOffline) {
              return aOffline - bOffline;
            }
            return a.displayName.localeCompare(b.displayName);
          });

    if (options.activeTab === 'online') {
      tabFriends.sort((a, b) => a.displayName.localeCompare(b.displayName));
    }

    if (q) {
      tabFriends = tabFriends.filter(
        (f) =>
          f.displayName.toLowerCase().includes(q) ||
          f.username.toLowerCase().includes(q),
      );
    }

    if (tabFriends.length === 0) {
      listContainer.appendChild(
        renderEmptyState(
          q ? 'No friends match your search.' : 'No friends are online right now.',
        ),
      );
      return;
    }

    const countLabel = document.createElement('div');
    countLabel.className = 'friends-section-count';
    countLabel.textContent =
      options.activeTab === 'online'
        ? `Online — ${tabFriends.length}`
        : `All Friends — ${tabFriends.length}`;
    listContainer.appendChild(countLabel);

    for (const friend of tabFriends) {
      listContainer.appendChild(createFriendRow(friend));
    }
  };

  listRefresher = renderFilteredList;

  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value;
    renderFilteredList();
  });

  renderFilteredList();

  return {
    syncLive: () => {
      updatePendingBadge();
      listRefresher?.();
    },
  };
}
