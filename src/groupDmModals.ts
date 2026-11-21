import {
  apiAcceptFriendRequest,
  apiAddGroupMembers,
  apiBlockUser,
  apiCancelFriendRequest,
  apiCreateGroupDm,
  apiKickGroupMember,
  apiLeaveGroupDm,
  apiRemoveFriend,
  apiSendFriendRequest,
  apiTransferGroupOwner,
  apiUnblockUser,
  apiUpdateGroupDm,
  resolveMediaUrl,
} from './apiClient';
import {
  attachImageDropZone,
  createCloseIconSvg,
  createImageDropOverlay,
  openConfirmPopup,
  prepareChatImageDataUrl,
} from './chatUi';
import { type ContextMenuItem, openContextMenu } from './contextMenu';
import { createThoughtBubbleElement } from './customStatusModal';
import { isModalConfirmShortcut, isTopmostModal } from './modalShortcuts';
import { createStatusGlyph, STATUS_LABELS } from './profileDrawer';
import type { GroupDmInfo, PublicProfile, SocialSnapshot } from './types';

export function createYellowCrownSvg(size = 14): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', '#facc15');
  svg.setAttribute('stroke', '#ca8a04');
  svg.setAttribute('stroke-width', '1.4');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', 'M3 18h18l-2-10-4.5 4L12 5l-2.5 7L5 8l-2 10z');
  svg.appendChild(path);
  return svg;
}

function createGroupFallbackSvgDataUrl(name: string): string {
  const cleanInitial = (name.trim().charAt(0) || 'G').toUpperCase().replace(/[<>&"']/g, '');
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">`,
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">`,
    `<stop offset="0%" stop-color="#e23b41"/><stop offset="100%" stop-color="#691922"/>`,
    `</linearGradient></defs>`,
    `<rect width="64" height="64" rx="32" fill="url(#g)"/>`,
    `<circle cx="24" cy="24" r="7" fill="#fff" fill-opacity="0.92"/>`,
    `<circle cx="41" cy="25" r="5.5" fill="#fff" fill-opacity="0.72"/>`,
    `<path d="M12 46c0-7 5.5-11 12-11s12 4 12 11" fill="#fff" fill-opacity="0.92"/>`,
    `<path d="M35 45c.4-5.2 4.3-8 8.8-8 4.4 0 8 2.8 8.2 8" fill="#fff" fill-opacity="0.72"/>`,
    `<text x="58" y="14" font-size="1" fill="transparent">${cleanInitial}</text>`,
    `</svg>`,
  ].join('');
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function resolveGroupAvatar(group: { name: string; iconDataUrl?: string }): string {
  if (
    group.iconDataUrl &&
    (group.iconDataUrl.startsWith('data:image/') ||
      group.iconDataUrl.startsWith('/api/media/') ||
      /^https?:\/\//i.test(group.iconDataUrl))
  ) {
    return resolveMediaUrl(group.iconDataUrl);
  }
  return createGroupFallbackSvgDataUrl(group.name);
}

/** Opens modal from the sidebar "+ Create Group DM" button to select friends and start a group chat. */
export function openCreateGroupDmModal(options: {
  friends: PublicProfile[];
  resolveAvatar: (profile: { avatarPreset: number | null; avatarDataUrl?: string }) => string;
  onCreated: (group: GroupDmInfo, snapshot: SocialSnapshot) => void;
}): () => void {
  let closed = false;
  let searchTerm = '';
  let submitting = false;
  const selected = new Set<string>();

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop modal-backdrop--deep';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-label', 'Create Group DM');

  const card = document.createElement('div');
  card.className = 'modal-card modal-card--group';

  const headerRow = document.createElement('div');
  headerRow.className = 'group-modal-header';

  const heading = document.createElement('div');
  const title = document.createElement('h2');
  title.className = 'modal-title';
  title.textContent = 'Select Friends';
  const sub = document.createElement('div');
  sub.className = 'modal-subtitle';
  sub.textContent = 'Start a shared group chat with your friends.';
  heading.appendChild(title);
  heading.appendChild(sub);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'modal-close-icon-btn';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.appendChild(createCloseIconSvg(16));

  headerRow.appendChild(heading);
  headerRow.appendChild(closeBtn);
  card.appendChild(headerRow);

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'group-modal-input';
  nameInput.placeholder = 'Group Name (optional)';
  nameInput.maxLength = 64;
  card.appendChild(nameInput);

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'group-modal-input';
  searchInput.placeholder = 'Search friends by name or username';
  card.appendChild(searchInput);

  const listWrap = document.createElement('div');
  listWrap.className = 'group-friend-checklist';
  card.appendChild(listWrap);

  const errorLine = document.createElement('div');
  errorLine.className = 'group-modal-error';
  errorLine.hidden = true;
  card.appendChild(errorLine);

  const footer = document.createElement('div');
  footer.className = 'button-row modal-footer';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn-secondary';
  cancelBtn.textContent = 'Cancel';

  const createBtn = document.createElement('button');
  createBtn.type = 'button';
  createBtn.className = 'btn-primary';

  footer.appendChild(cancelBtn);
  footer.appendChild(createBtn);
  card.appendChild(footer);

  backdrop.appendChild(card);
  document.body.appendChild(backdrop);

  const syncCreateButton = () => {
    const count = selected.size;
    createBtn.disabled = submitting || count === 0;
    createBtn.textContent = submitting
      ? 'Creating...'
      : count > 0
        ? `Create Group DM (${count})`
        : 'Create Group DM';
  };

  const renderFriendList = () => {
    listWrap.replaceChildren();
    const q = searchTerm.trim().toLowerCase();
    const matches = options.friends.filter(
      (f) =>
        !q ||
        f.displayName.toLowerCase().includes(q) ||
        f.username.toLowerCase().includes(q),
    );

    if (options.friends.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'group-checklist-empty';
      empty.textContent = 'Add some friends first to create a Group DM.';
      listWrap.appendChild(empty);
      return;
    }

    if (matches.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'group-checklist-empty';
      empty.textContent = `No friends match "${searchTerm.trim()}".`;
      listWrap.appendChild(empty);
      return;
    }

    for (const friend of matches) {
      const key = friend.username.toLowerCase();
      const row = document.createElement('label');
      row.className = 'group-friend-option';
      if (selected.has(key)) {
        row.classList.add('group-friend-option--selected');
      }

      const avatarWrap = document.createElement('span');
      avatarWrap.className = 'group-friend-avatar-wrap';
      const img = document.createElement('img');
      img.className = 'group-friend-avatar';
      img.src = options.resolveAvatar(friend);
      img.alt = friend.displayName;
      avatarWrap.appendChild(img);
      const statusDot = document.createElement('span');
      statusDot.className = 'group-friend-status-dot';
      statusDot.appendChild(createStatusGlyph(friend.status, 9));
      avatarWrap.appendChild(statusDot);

      const meta = document.createElement('span');
      meta.className = 'group-friend-meta';
      const dName = document.createElement('span');
      dName.className = 'group-friend-display';
      dName.textContent = friend.displayName;
      const uName = document.createElement('span');
      uName.className = 'group-friend-username';
      uName.textContent = `@${friend.username}`;
      meta.appendChild(dName);
      meta.appendChild(uName);

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'group-friend-checkbox';
      cb.checked = selected.has(key);
      cb.addEventListener('change', () => {
        if (cb.checked) {
          selected.add(key);
        } else {
          selected.delete(key);
        }
        row.classList.toggle('group-friend-option--selected', cb.checked);
        errorLine.hidden = true;
        syncCreateButton();
      });

      row.appendChild(avatarWrap);
      row.appendChild(meta);
      row.appendChild(cb);
      listWrap.appendChild(row);
    }
  };

  renderFriendList();
  syncCreateButton();

  searchInput.addEventListener('input', () => {
    searchTerm = searchInput.value;
    renderFriendList();
  });

  createBtn.addEventListener('click', async () => {
    if (submitting || selected.size === 0) {
      return;
    }
    submitting = true;
    errorLine.hidden = true;
    syncCreateButton();

    const res = await apiCreateGroupDm({
      memberUsernames: Array.from(selected),
      name: nameInput.value.trim() || undefined,
    });
    if (closed) {
      return;
    }
    submitting = false;
    if (!res.ok || !res.group || !res.snapshot) {
      errorLine.hidden = false;
      errorLine.textContent = res.error ?? 'Error: Could not create Group DM';
      syncCreateButton();
      return;
    }

    close();
    options.onCreated(res.group, res.snapshot);
  });

  const onKeyDown = (e: KeyboardEvent) => {
    if (!isTopmostModal(backdrop)) {
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      close();
      return;
    }
    if (isModalConfirmShortcut(e, backdrop) && !createBtn.disabled) {
      e.preventDefault();
      e.stopImmediatePropagation();
      createBtn.click();
    }
  };

  const close = () => {
    if (closed) {
      return;
    }
    closed = true;
    window.removeEventListener('keydown', onKeyDown, true);
    backdrop.classList.remove('modal-backdrop--visible');
    window.setTimeout(() => backdrop.remove(), 180);
  };

  closeBtn.addEventListener('click', close);
  cancelBtn.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) {
      close();
    }
  });
  window.addEventListener('keydown', onKeyDown, true);

  requestAnimationFrame(() => {
    if (!closed) {
      backdrop.classList.add('modal-backdrop--visible');
      searchInput.focus();
    }
  });

  return close;
}

/**
 * Popup opened by clicking the kebab/settings icon in any Group DM.
 * Allows any group member to change the group name, upload/drop a group profile picture,
 * invite more friends, or leave the group.
 */
export function openGroupSettingsModal(options: {
  group: GroupDmInfo;
  friends: PublicProfile[];
  resolveAvatar: (profile: { avatarPreset: number | null; avatarDataUrl?: string }) => string;
  onUpdated: (snapshot: SocialSnapshot) => void;
  onLeftGroup: (groupId: string, snapshot: SocialSnapshot) => void;
  focusInvite?: boolean;
}): () => void {
  let closed = false;
  let saving = false;
  let nextIconDataUrl: string | null | undefined = options.group.iconDataUrl ?? null;

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop modal-backdrop--deep';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-label', 'Group Chat Settings');

  const card = document.createElement('div');
  card.className = 'modal-card modal-card--group-settings';

  const dropOverlay = createImageDropOverlay('Drop image to set group photo');
  card.appendChild(dropOverlay);

  const headerRow = document.createElement('div');
  headerRow.className = 'group-modal-header';

  const heading = document.createElement('div');
  const title = document.createElement('h2');
  title.className = 'modal-title';
  title.textContent = 'Group Settings';
  const sub = document.createElement('div');
  sub.className = 'modal-subtitle';
  sub.textContent = `${options.group.members.length} members in this group chat`;
  heading.appendChild(title);
  heading.appendChild(sub);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'modal-close-icon-btn';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.appendChild(createCloseIconSvg(16));

  headerRow.appendChild(heading);
  headerRow.appendChild(closeBtn);
  card.appendChild(headerRow);

  // Avatar & Name Editor Section
  const identityBox = document.createElement('div');
  identityBox.className = 'group-settings-identity';

  const avatarWrap = document.createElement('div');
  avatarWrap.className = 'group-settings-avatar-wrap';

  const avatarImg = document.createElement('img');
  avatarImg.className = 'group-settings-avatar';
  avatarImg.alt = options.group.name;
  avatarWrap.appendChild(avatarImg);

  const avatarBtns = document.createElement('div');
  avatarBtns.className = 'group-settings-avatar-btns';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.hidden = true;

  const uploadBtn = document.createElement('button');
  uploadBtn.type = 'button';
  uploadBtn.className = 'btn-secondary group-settings-sm-btn';
  uploadBtn.textContent = 'Change Photo';

  const removePhotoBtn = document.createElement('button');
  removePhotoBtn.type = 'button';
  removePhotoBtn.className = 'group-settings-link-btn';
  removePhotoBtn.textContent = 'Remove';

  avatarBtns.appendChild(fileInput);
  avatarBtns.appendChild(uploadBtn);
  avatarBtns.appendChild(removePhotoBtn);

  const nameGroup = document.createElement('div');
  nameGroup.className = 'group-settings-name-col';

  const nameLabel = document.createElement('label');
  nameLabel.className = 'group-settings-field-label';
  nameLabel.textContent = 'Group Name';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'group-modal-input';
  nameInput.value = options.group.name;
  nameInput.placeholder = 'Enter group chat name';
  nameInput.maxLength = 64;

  const dragHint = document.createElement('div');
  dragHint.className = 'group-settings-hint';
  dragHint.textContent = 'Drag & drop an image anywhere on this popup or click Change Photo.';

  nameGroup.appendChild(nameLabel);
  nameGroup.appendChild(nameInput);
  nameGroup.appendChild(avatarBtns);
  nameGroup.appendChild(dragHint);

  identityBox.appendChild(avatarWrap);
  identityBox.appendChild(nameGroup);
  card.appendChild(identityBox);

  const statusLine = document.createElement('div');
  statusLine.className = 'group-modal-error';
  statusLine.hidden = true;
  card.appendChild(statusLine);

  const showStatus = (msg: string | null, isSuccess = false) => {
    if (!msg) {
      statusLine.hidden = true;
      return;
    }
    statusLine.hidden = false;
    statusLine.classList.toggle('group-modal-success', isSuccess);
    statusLine.textContent = msg;
  };

  const syncAvatarPreview = () => {
    avatarImg.src = resolveGroupAvatar({
      name: nameInput.value.trim() || options.group.name,
      iconDataUrl: typeof nextIconDataUrl === 'string' ? nextIconDataUrl : undefined,
    });
    removePhotoBtn.hidden = !nextIconDataUrl;
  };
  syncAvatarPreview();

  const applySelectedPhoto = async (file: File) => {
    showStatus(null);
    const prepared = await prepareChatImageDataUrl(file);
    if (!prepared.ok) {
      showStatus(prepared.error);
      return;
    }
    nextIconDataUrl = prepared.dataUrl;
    syncAvatarPreview();
  };

  uploadBtn.addEventListener('click', () => {
    fileInput.value = '';
    fileInput.click();
  });
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) {
      void applySelectedPhoto(file);
    }
  });
  removePhotoBtn.addEventListener('click', () => {
    nextIconDataUrl = null;
    syncAvatarPreview();
  });

  const detachDropZone = attachImageDropZone(card, {
    overlayEl: dropOverlay,
    activeClass: 'modal-card--dragover',
    onFiles: (files) => {
      const imgFile = files.find((f) => f.type.startsWith('image/'));
      if (imgFile) {
        void applySelectedPhoto(imgFile);
      } else {
        showStatus('Error: Please drop an image file');
      }
    },
  });

  // Add Friends section (shows friends not already in the group)
  const existingKeys = new Set(options.group.members.map((m) => m.username.toLowerCase()));
  const invitableFriends = options.friends.filter(
    (f) => !existingKeys.has(f.username.toLowerCase()),
  );
  const selectedInvites = new Set<string>();

  let inviteSectionEl: HTMLDivElement | null = null;
  if (invitableFriends.length > 0) {
    const inviteSection = document.createElement('div');
    inviteSection.className = 'group-invite-section';
    inviteSectionEl = inviteSection;

    const inviteLabel = document.createElement('div');
    inviteLabel.className = 'group-settings-field-label';
    inviteLabel.textContent = 'Invite Friends';
    inviteSection.appendChild(inviteLabel);

    const inviteList = document.createElement('div');
    inviteList.className = 'group-invite-chips';

    const inviteBtn = document.createElement('button');
    inviteBtn.type = 'button';
    inviteBtn.className = 'btn-secondary group-settings-sm-btn';
    inviteBtn.textContent = 'Add Selected Friends';
    inviteBtn.hidden = true;

    for (const friend of invitableFriends) {
      const fKey = friend.username.toLowerCase();
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'group-invite-chip';

      const chipImg = document.createElement('img');
      chipImg.className = 'group-invite-chip-avatar';
      chipImg.src = options.resolveAvatar(friend);
      chipImg.alt = friend.displayName;
      chip.appendChild(chipImg);
      chip.appendChild(document.createTextNode(friend.displayName));

      chip.addEventListener('click', () => {
        if (selectedInvites.has(fKey)) {
          selectedInvites.delete(fKey);
        } else {
          selectedInvites.add(fKey);
        }
        chip.classList.toggle('group-invite-chip--active', selectedInvites.has(fKey));
        inviteBtn.hidden = selectedInvites.size === 0;
        inviteBtn.textContent = `Add ${selectedInvites.size} Friend${selectedInvites.size === 1 ? '' : 's'}`;
      });
      inviteList.appendChild(chip);
    }

    inviteBtn.addEventListener('click', async () => {
      if (selectedInvites.size === 0 || saving) {
        return;
      }
      saving = true;
      inviteBtn.disabled = true;
      const res = await apiAddGroupMembers(options.group.id, Array.from(selectedInvites));
      saving = false;
      inviteBtn.disabled = false;
      if (!res.ok || !res.snapshot) {
        showStatus(res.error ?? 'Error: Could not add members');
        return;
      }
      options.onUpdated(res.snapshot);
      close();
    });

    inviteSection.appendChild(inviteList);
    inviteSection.appendChild(inviteBtn);
    card.appendChild(inviteSection);
  }

  const footer = document.createElement('div');
  footer.className = 'group-settings-footer';

  const leaveBtn = document.createElement('button');
  leaveBtn.type = 'button';
  leaveBtn.className = 'btn-danger';
  leaveBtn.textContent = 'Leave Group';
  leaveBtn.addEventListener('click', async () => {
    const confirmed = await openConfirmPopup({
      title: `Leave '${options.group.name}'?`,
      message: 'You will stop receiving messages from this group chat unless someone invites you back.',
      confirmLabel: 'Leave Group',
      danger: true,
    });
    if (!confirmed || closed) {
      return;
    }
    const res = await apiLeaveGroupDm(options.group.id);
    if (!res.ok || !res.snapshot) {
      showStatus(res.error ?? 'Error: Could not leave group');
      return;
    }
    close();
    options.onLeftGroup(options.group.id, res.snapshot);
  });

  const rightBtns = document.createElement('div');
  rightBtns.className = 'group-settings-right-actions';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn-secondary';
  cancelBtn.textContent = 'Cancel';

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'btn-primary';
  saveBtn.textContent = 'Save Changes';

  saveBtn.addEventListener('click', async () => {
    if (saving) {
      return;
    }
    const nextName = nameInput.value.replace(/\s+/g, ' ').trim();
    if (!nextName) {
      showStatus('Error: Group name cannot be empty');
      return;
    }
    saving = true;
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
    showStatus(null);

    const res = await apiUpdateGroupDm({
      groupId: options.group.id,
      name: nextName,
      iconDataUrl: nextIconDataUrl === undefined ? null : nextIconDataUrl,
    });
    if (closed) {
      return;
    }
    saving = false;
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Changes';
    if (!res.ok || !res.snapshot) {
      showStatus(res.error ?? 'Error: Could not save group settings');
      return;
    }
    options.onUpdated(res.snapshot);
    close();
  });

  rightBtns.appendChild(cancelBtn);
  rightBtns.appendChild(saveBtn);
  footer.appendChild(leaveBtn);
  footer.appendChild(rightBtns);
  card.appendChild(footer);

  backdrop.appendChild(card);
  document.body.appendChild(backdrop);

  const onKeyDown = (e: KeyboardEvent) => {
    if (!isTopmostModal(backdrop)) {
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      close();
      return;
    }
    if (isModalConfirmShortcut(e, backdrop, { allowCtrlS: true }) && !saveBtn.disabled) {
      e.preventDefault();
      e.stopImmediatePropagation();
      saveBtn.click();
    }
  };

  const close = () => {
    if (closed) {
      return;
    }
    closed = true;
    detachDropZone();
    window.removeEventListener('keydown', onKeyDown, true);
    backdrop.classList.remove('modal-backdrop--visible');
    window.setTimeout(() => backdrop.remove(), 180);
  };

  closeBtn.addEventListener('click', close);
  cancelBtn.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) {
      close();
    }
  });
  window.addEventListener('keydown', onKeyDown, true);

  requestAnimationFrame(() => {
    if (!closed) {
      backdrop.classList.add('modal-backdrop--visible');
      if (options.focusInvite && inviteSectionEl) {
        inviteSectionEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        const firstChip = inviteSectionEl.querySelector<HTMLButtonElement>('.group-invite-chip');
        firstChip?.focus();
      } else {
        nameInput.focus();
      }
    }
  });

  return close;
}

export interface GroupMembersPanelHandle {
  element: HTMLElement;
  update: (group: GroupDmInfo) => void;
}

/**
 * Quick modal from the Group DM header "Add Friends" button to immediately add selected friends.
 */
export function openAddFriendsToGroupModal(options: {
  group: GroupDmInfo;
  friends: PublicProfile[];
  resolveAvatar: (profile: { avatarPreset: number | null; avatarDataUrl?: string }) => string;
  onUpdated: (snapshot: SocialSnapshot) => void;
}): () => void {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop modal-backdrop--deep';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-label', 'Add Friends to Group Chat');

  const card = document.createElement('div');
  card.className = 'modal-card modal-card--group';

  const header = document.createElement('div');
  header.className = 'group-modal-header';
  const titleWrap = document.createElement('div');
  const title = document.createElement('h2');
  title.className = 'modal-title';
  title.textContent = 'Add Friends to Group';
  const subtitle = document.createElement('div');
  subtitle.className = 'modal-subtitle';
  subtitle.textContent = `Add friends directly to ${options.group.name}.`;
  titleWrap.appendChild(title);
  titleWrap.appendChild(subtitle);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'modal-close-icon-btn';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.appendChild(createCloseIconSvg(16));
  header.appendChild(titleWrap);
  header.appendChild(closeBtn);
  card.appendChild(header);

  const memberSet = new Set(options.group.members.map((m) => m.username.toLowerCase()));
  const availableFriends = options.friends.filter(
    (f) => !memberSet.has(f.username.toLowerCase()),
  );
  const selected = new Set<string>();
  let searchQuery = '';
  let submitting = false;
  let closed = false;

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'group-modal-input';
  searchInput.placeholder = 'Search friends by name or username';
  card.appendChild(searchInput);

  const listWrap = document.createElement('div');
  listWrap.className = 'group-friend-checklist';
  card.appendChild(listWrap);

  const statusMsg = document.createElement('div');
  statusMsg.className = 'group-modal-error';
  statusMsg.hidden = true;
  card.appendChild(statusMsg);

  const footer = document.createElement('div');
  footer.className = 'button-row modal-footer';
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn-secondary';
  cancelBtn.textContent = 'Cancel';

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn-primary';
  addBtn.dataset.action = 'confirm-add-group-friends';
  addBtn.textContent = 'Add to Group';
  addBtn.disabled = true;

  footer.appendChild(cancelBtn);
  footer.appendChild(addBtn);
  card.appendChild(footer);

  const syncAddBtn = () => {
    addBtn.disabled = submitting || selected.size === 0;
    addBtn.textContent = submitting
      ? 'Adding...'
      : selected.size > 0
        ? `Add ${selected.size} Friend${selected.size === 1 ? '' : 's'}`
        : 'Add to Group';
  };

  const renderList = () => {
    listWrap.replaceChildren();
    const q = searchQuery.trim().toLowerCase();
    const filtered = availableFriends.filter(
      (f) =>
        !q ||
        f.displayName.toLowerCase().includes(q) ||
        f.username.toLowerCase().includes(q),
    );
    if (availableFriends.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'group-checklist-empty';
      empty.textContent = 'All of your friends are already in this group chat.';
      listWrap.appendChild(empty);
      return;
    }
    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'group-checklist-empty';
      empty.textContent = `No friends match "${searchQuery.trim()}".`;
      listWrap.appendChild(empty);
      return;
    }

    for (const friend of filtered) {
      const key = friend.username.toLowerCase();
      const row = document.createElement('label');
      row.className = selected.has(key)
        ? 'group-friend-option group-friend-option--selected group-friend-pick-row'
        : 'group-friend-option group-friend-pick-row';
      row.dataset.friendUsername = key;

      const avWrap = document.createElement('span');
      avWrap.className = 'group-friend-avatar-wrap';
      const av = document.createElement('img');
      av.className = 'group-friend-avatar';
      av.src = options.resolveAvatar(friend);
      av.alt = friend.displayName;
      avWrap.appendChild(av);

      const dot = document.createElement('span');
      dot.className = 'group-friend-status-dot';
      dot.appendChild(createStatusGlyph(friend.status, 9));
      avWrap.appendChild(dot);

      const meta = document.createElement('span');
      meta.className = 'group-friend-meta';
      const dn = document.createElement('span');
      dn.className = 'group-friend-display';
      dn.textContent = friend.displayName;
      const un = document.createElement('span');
      un.className = 'group-friend-username';
      un.textContent = `@${friend.username}`;
      meta.appendChild(dn);
      meta.appendChild(un);

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'group-friend-checkbox';
      cb.checked = selected.has(key);
      cb.addEventListener('change', () => {
        if (cb.checked) {
          selected.add(key);
        } else {
          selected.delete(key);
        }
        row.classList.toggle('group-friend-option--selected', cb.checked);
        syncAddBtn();
      });

      row.appendChild(avWrap);
      row.appendChild(meta);
      row.appendChild(cb);
      listWrap.appendChild(row);
    }
  };

  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value;
    renderList();
  });

  const close = () => {
    if (closed) {
      return;
    }
    closed = true;
    window.removeEventListener('keydown', onKeyDown, true);
    backdrop.classList.remove('modal-backdrop--visible');
    window.setTimeout(() => backdrop.remove(), 180);
  };

  addBtn.addEventListener('click', async () => {
    if (submitting || selected.size === 0) {
      return;
    }
    submitting = true;
    statusMsg.hidden = true;
    syncAddBtn();
    const res = await apiAddGroupMembers(options.group.id, Array.from(selected));
    if (closed) {
      return;
    }
    submitting = false;
    if (!res.ok || !res.snapshot) {
      statusMsg.textContent = res.error ?? 'Error: Could not add friends to group';
      statusMsg.hidden = false;
      syncAddBtn();
      return;
    }
    options.onUpdated(res.snapshot);
    close();
  });

  const onKeyDown = (e: KeyboardEvent) => {
    if (!isTopmostModal(backdrop)) {
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      close();
      return;
    }
    if (isModalConfirmShortcut(e, backdrop) && !addBtn.disabled) {
      e.preventDefault();
      e.stopImmediatePropagation();
      addBtn.click();
    }
  };

  closeBtn.addEventListener('click', close);
  cancelBtn.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) {
      close();
    }
  });
  window.addEventListener('keydown', onKeyDown, true);

  renderList();
  syncAddBtn();
  backdrop.appendChild(card);
  document.body.appendChild(backdrop);
  requestAnimationFrame(() => {
    if (!closed) {
      backdrop.classList.add('modal-backdrop--visible');
      searchInput.focus();
    }
  });

  return close;
}

/**
 * Discord-style right-hand member sidebar inside Group DM chats.
 */
export function createGroupMembersPanel(options: {
  initialGroup: GroupDmInfo;
  selfUsername: string;
  getSnapshot: () => SocialSnapshot | null;
  resolveAvatar: (profile: { avatarPreset: number | null; avatarDataUrl?: string }) => string;
  onOpenDmWithMember: (username: string) => void;
  onViewMemberProfile?: (member: PublicProfile) => void;
  canRingToCall?: (member: PublicProfile) => boolean;
  onRingToCall?: (member: PublicProfile) => void;
  onStartCallWithMember?: (member: PublicProfile) => void;
  onSnapshotUpdated?: (snapshot: SocialSnapshot) => void;
}): GroupMembersPanelHandle {
  let currentGroup = options.initialGroup;

  const aside = document.createElement('aside');
  aside.className = 'group-members-panel';
  aside.setAttribute('aria-label', 'Group members');

  const scrollWrap = document.createElement('div');
  scrollWrap.className = 'group-members-scroll';
  aside.appendChild(scrollWrap);

  const renderMembers = () => {
    scrollWrap.replaceChildren();
    const ownerKey = currentGroup.ownerUsername.toLowerCase();
    const selfKey = options.selfUsername.toLowerCase();

    const orderedMembers = [...currentGroup.members].sort((a, b) => {
      const aOwner = a.username.toLowerCase() === ownerKey ? 0 : 1;
      const bOwner = b.username.toLowerCase() === ownerKey ? 0 : 1;
      if (aOwner !== bOwner) return aOwner - bOwner;
      const aOnline = a.status !== 'offline' ? 0 : 1;
      const bOnline = b.status !== 'offline' ? 0 : 1;
      if (aOnline !== bOnline) return aOnline - bOnline;
      return a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' });
    });

    const sectionHeading = document.createElement('div');
    sectionHeading.className = 'group-members-section-label';
    sectionHeading.textContent = `MEMBERS — ${orderedMembers.length}`;
    scrollWrap.appendChild(sectionHeading);

    for (const member of orderedMembers) {
      const memberKey = member.username.toLowerCase();
      const isMemberOwner = memberKey === ownerKey;
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'group-member-row';
      row.dataset.memberUsername = memberKey;
      if (member.status === 'offline') {
        row.classList.add('group-member-row--offline');
      }
      row.title = isMemberOwner
        ? `${member.displayName} (@${member.username}) • Group Owner`
        : member.isProfilePrivate
          ? `${member.displayName} (@${member.username}) • Private Profile`
          : `${member.displayName} (@${member.username}) • ${STATUS_LABELS[member.status]}`;

      const avWrap = document.createElement('span');
      avWrap.className = 'group-member-avatar-wrap';
      const img = document.createElement('img');
      img.className = 'group-member-avatar';
      img.src = options.resolveAvatar(member);
      img.alt = member.displayName;
      avWrap.appendChild(img);

      const dot = document.createElement('span');
      dot.className = 'group-member-status-dot';
      dot.appendChild(createStatusGlyph(member.status, 9));
      avWrap.appendChild(dot);

      const meta = document.createElement('span');
      meta.className = 'group-member-meta';

      const nameLine = document.createElement('span');
      nameLine.className = 'group-member-name-row';
      const nameEl = document.createElement('span');
      nameEl.className = 'group-member-name';
      nameEl.textContent = member.displayName;
      nameLine.appendChild(nameEl);

      if (isMemberOwner) {
        const ownerTag = document.createElement('span');
        ownerTag.className = 'group-owner-badge group-owner-crown';
        ownerTag.title = 'Group Owner';
        ownerTag.setAttribute('aria-label', 'Group Owner');
        ownerTag.appendChild(createYellowCrownSvg(14));
        nameLine.appendChild(ownerTag);
      }
      meta.appendChild(nameLine);

      const bubble = createThoughtBubbleElement({ profile: member });
      if (bubble) {
        const subEl = document.createElement('span');
        subEl.className = 'group-member-sub';
        subEl.textContent = member.customStatus?.text
          ? `${member.customStatus.emoji ? `${member.customStatus.emoji} ` : ''}${member.customStatus.text}`
          : member.customStatus?.emoji ?? '';
        if (subEl.textContent) {
          meta.appendChild(subEl);
        }
      }

      row.appendChild(avWrap);
      row.appendChild(meta);

      const openMemberContextMenu = (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const snap = options.getSnapshot();
        const isSelf = memberKey === selfKey;
        const isSelfOwner = selfKey === currentGroup.ownerUsername.toLowerCase();
        const items: ContextMenuItem[] = [];

        if (options.onViewMemberProfile) {
          items.push({
            label: 'View Full Profile',
            icon: 'user',
            onSelect: () => {
              options.onViewMemberProfile?.(member);
            },
          });
        }

        if (!isSelf) {
          items.push({
            label: `Message ${member.displayName}`,
            icon: 'message',
            onSelect: () => {
              options.onOpenDmWithMember(member.username);
            },
          });
          if (options.canRingToCall?.(member) && options.onRingToCall) {
            items.push({
              label: 'Ring to Call',
              icon: 'phone',
              onSelect: () => {
                options.onRingToCall?.(member);
              },
            });
          }
          if (options.onStartCallWithMember) {
            items.push({
              label: 'Start a Call',
              icon: 'phone',
              onSelect: () => {
                options.onStartCallWithMember?.(member);
              },
            });
          }
        }

        items.push({
          label: 'Copy Username',
          icon: 'copy',
          onSelect: () => {
            void navigator.clipboard?.writeText(member.username).catch(() => {});
          },
        });

        if (!isSelf && snap) {
          const isFriend = snap.friends.some((f) => f.username.toLowerCase() === memberKey);
          const isBlocked = (snap.blockedUsers ?? []).some(
            (b) => b.username.toLowerCase() === memberKey,
          );
          const hasOutgoing = snap.outgoingRequests.some(
            (r) => r.user.username.toLowerCase() === memberKey,
          );
          const hasIncoming = snap.incomingRequests.some(
            (r) => r.user.username.toLowerCase() === memberKey,
          );

          if (isFriend) {
            items.push({
              label: 'Remove Friend',
              icon: 'user-minus',
              danger: true,
              dividerBefore: true,
              onSelect: () => {
                void apiRemoveFriend(member.username).then((res) => {
                  if (res.ok && res.snapshot) options.onSnapshotUpdated?.(res.snapshot);
                });
              },
            });
          } else if (hasOutgoing) {
            items.push({
              label: 'Cancel Friend Request',
              icon: 'user-minus',
              dividerBefore: true,
              onSelect: () => {
                void apiCancelFriendRequest(member.username).then((res) => {
                  if (res.ok && res.snapshot) options.onSnapshotUpdated?.(res.snapshot);
                });
              },
            });
          } else if (hasIncoming) {
            items.push({
              label: 'Accept Friend Request',
              icon: 'check',
              dividerBefore: true,
              onSelect: () => {
                void apiAcceptFriendRequest(member.username).then((res) => {
                  if (res.ok && res.snapshot) options.onSnapshotUpdated?.(res.snapshot);
                });
              },
            });
          } else if (!isBlocked) {
            items.push({
              label: 'Add Friend',
              icon: 'user-plus',
              dividerBefore: true,
              onSelect: () => {
                void apiSendFriendRequest(member.username).then((res) => {
                  if (res.ok && res.snapshot) options.onSnapshotUpdated?.(res.snapshot);
                });
              },
            });
          }

          items.push({
            label: isBlocked ? 'Unblock' : 'Block',
            icon: 'block',
            danger: !isBlocked,
            dividerBefore: isBlocked,
            onSelect: () => {
              const run = isBlocked
                ? apiUnblockUser(member.username)
                : apiBlockUser(member.username);
              void run.then((res) => {
                if (res.ok && res.snapshot) options.onSnapshotUpdated?.(res.snapshot);
              });
            },
          });
        }

        if (isSelfOwner && !isSelf) {
          items.push(
            {
              label: 'Make Group Owner',
              icon: 'crown',
              dividerBefore: true,
              onSelect: () => {
                void apiTransferGroupOwner(currentGroup.id, member.username).then((res) => {
                  if (res.ok && res.snapshot) options.onSnapshotUpdated?.(res.snapshot);
                });
              },
            },
            {
              label: 'Remove from Group',
              icon: 'user-minus',
              danger: true,
              onSelect: () => {
                void apiKickGroupMember(currentGroup.id, member.username).then((res) => {
                  if (res.ok && res.snapshot) options.onSnapshotUpdated?.(res.snapshot);
                });
              },
            },
          );
        }

        openContextMenu({
          clientX: e.clientX,
          clientY: e.clientY,
          minWidth: 210,
          items,
        });
      };

      row.addEventListener('click', () => {
        options.onViewMemberProfile?.(member);
      });
      row.addEventListener('contextmenu', openMemberContextMenu);

      scrollWrap.appendChild(row);
    }
  };

  renderMembers();

  return {
    element: aside,
    update: (nextGroup) => {
      currentGroup = nextGroup;
      renderMembers();
    },
  };
}
