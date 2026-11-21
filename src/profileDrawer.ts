import { apiUpdateCustomStatus, apiUpdateProfile, apiUpdateStatus } from './apiClient';
import { copyToClipboard } from './contextMenu';
import {
  createThoughtBubbleElement,
  openSetCustomStatusModal,
  pickCasualStatusPrompt,
} from './customStatusModal';
import { isModalConfirmShortcut, isTopmostModal } from './modalShortcuts';
import { setDisplayNameWithRoleBadge } from './profileBadges';
import {
  applyBannerBackground,
  openAvatarChangeFlow,
  openBannerChangeFlow,
} from './profileModals';
import type {
  CustomStatusData,
  EffectiveStatus,
  SelfProfile,
  SocialSnapshot,
  UserStatus,
} from './types';

interface ProfileDrawerOptions {
  presetAvatars: string[];
  resolveAvatar: (profile: { avatarPreset: number | null; avatarDataUrl?: string }) => string;
  getUser: () => SelfProfile;
  onSnapshotUpdated: (snapshot: SocialSnapshot, previousUsername?: string) => void;
  onOptimisticSelfPatch?: (patch: { status?: UserStatus; customStatus?: CustomStatusData | null }) => void;
  onSyncDock: () => void;
  onSignOut: () => void;
  onOpenFullProfile?: () => void;
  onOpenSettings?: () => void;
}

export interface SelfProfileModalOptions {
  presetAvatars: string[];
  resolveAvatar: (profile: { avatarPreset: number | null; avatarDataUrl?: string }) => string;
  getSnapshot: () => SocialSnapshot;
  onSnapshotUpdated: (snapshot: SocialSnapshot, previousUsername?: string) => void;
  onOptimisticSelfPatch?: (patch: { status?: UserStatus; customStatus?: CustomStatusData | null }) => void;
  onSyncDock: () => void;
  onOpenSettings: () => void;
  onSignOut: () => void;
  initialEdit?: boolean;
  onClose?: () => void;
}

export interface SelfProfileModalHandle {
  refresh: () => void;
  close: () => void;
}

interface StatusOptionMeta {
  value: UserStatus;
  label: string;
  description?: string;
}

const STATUS_OPTIONS: StatusOptionMeta[] = [
  { value: 'online', label: 'Online' },
  { value: 'idle', label: 'Idle' },
  {
    value: 'dnd',
    label: 'Do Not Disturb',
    description: 'You will not receive desktop notifications',
  },
  {
    value: 'invisible',
    label: 'Invisible',
    description: 'You will appear offline',
  },
];

export const STATUS_LABELS: Record<EffectiveStatus, string> = {
  online: 'Online',
  idle: 'Idle',
  dnd: 'Do Not Disturb',
  invisible: 'Invisible',
  offline: 'Offline',
};

let statusChangeSeq = 0;
let optimisticSelfStatusLock: { status: UserStatus; until: number } | null = null;
let customStatusChangeSeq = 0;
let optimisticSelfCustomStatusLock: { customStatus: CustomStatusData | null; until: number } | null =
  null;

/** Returns the active optimistic self status if a recent status click is still settling. */
export function getLockedOptimisticSelfStatus(): UserStatus | null {
  if (!optimisticSelfStatusLock) {
    return null;
  }
  if (Date.now() > optimisticSelfStatusLock.until) {
    optimisticSelfStatusLock = null;
    return null;
  }
  return optimisticSelfStatusLock.status;
}

/** Returns the active optimistic custom status if a recent edit/clear is still settling. */
export function getLockedOptimisticSelfCustomStatus(): {
  locked: boolean;
  customStatus: CustomStatusData | null;
} {
  if (!optimisticSelfCustomStatusLock) {
    return { locked: false, customStatus: null };
  }
  if (Date.now() > optimisticSelfCustomStatusLock.until) {
    optimisticSelfCustomStatusLock = null;
    return { locked: false, customStatus: null };
  }
  return { locked: true, customStatus: optimisticSelfCustomStatusLock.customStatus };
}

function beginOptimisticStatusChange(nextStatus: UserStatus): number {
  const seq = ++statusChangeSeq;
  optimisticSelfStatusLock = { status: nextStatus, until: Date.now() + 4500 };
  return seq;
}

function settleOptimisticStatusChange(seq: number, confirmedStatus: UserStatus): boolean {
  if (seq !== statusChangeSeq) {
    return false;
  }
  // Keep a short grace window so delayed WebSocket syncs from an earlier click never flicker back.
  optimisticSelfStatusLock = { status: confirmedStatus, until: Date.now() + 1800 };
  return true;
}

function beginOptimisticCustomStatusChange(nextCustomStatus: CustomStatusData | null): number {
  const seq = ++customStatusChangeSeq;
  optimisticSelfCustomStatusLock = { customStatus: nextCustomStatus, until: Date.now() + 4500 };
  return seq;
}

function settleOptimisticCustomStatusChange(
  seq: number,
  confirmedCustomStatus: CustomStatusData | null,
): boolean {
  if (seq !== customStatusChangeSeq) {
    return false;
  }
  optimisticSelfCustomStatusLock = {
    customStatus: confirmedCustomStatus,
    until: Date.now() + 1800,
  };
  return true;
}

export function createStatusGlyph(status: EffectiveStatus, size = 12): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');

  if (status === 'online') {
    const circle = document.createElementNS(ns, 'circle');
    circle.setAttribute('cx', '8');
    circle.setAttribute('cy', '8');
    circle.setAttribute('r', '7');
    circle.setAttribute('fill', '#23a55a');
    svg.appendChild(circle);
  } else if (status === 'idle') {
    const path = document.createElementNS(ns, 'path');
    path.setAttribute(
      'd',
      'M10.8 1.6a6.8 6.8 0 1 0 3.6 10.7A5.6 5.6 0 0 1 10.8 1.6z',
    );
    path.setAttribute('fill', '#f0b232');
    svg.appendChild(path);
  } else if (status === 'dnd') {
    const circle = document.createElementNS(ns, 'circle');
    circle.setAttribute('cx', '8');
    circle.setAttribute('cy', '8');
    circle.setAttribute('r', '7');
    circle.setAttribute('fill', '#f23f43');
    svg.appendChild(circle);

    const bar = document.createElementNS(ns, 'rect');
    bar.setAttribute('x', '4');
    bar.setAttribute('y', '6.8');
    bar.setAttribute('width', '8');
    bar.setAttribute('height', '2.4');
    bar.setAttribute('rx', '1.2');
    bar.setAttribute('fill', '#14151a');
    svg.appendChild(bar);
  } else {
    const outer = document.createElementNS(ns, 'circle');
    outer.setAttribute('cx', '8');
    outer.setAttribute('cy', '8');
    outer.setAttribute('r', '5.5');
    outer.setAttribute('fill', '#14151a');
    outer.setAttribute('stroke', '#80848e');
    outer.setAttribute('stroke-width', '3');
    svg.appendChild(outer);
  }

  return svg;
}

function createIconSvg(paths: string[], size = 16): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2.2');
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

export function formatCreationDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatAccountAgeYears(createdAt: number): string {
  const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
  const years = Math.max(0, (Date.now() - createdAt) / msPerYear);
  return `${years.toFixed(1)} years`;
}

export function createProfileDrawerController(options: ProfileDrawerOptions) {
  let isOpen = false;
  let isEditing = false;
  let isSaving = false;
  let editError: string | null = null;
  let statusMenuEl: HTMLDivElement | null = null;

  let draftDisplayName = '';
  let draftUsername = '';
  let draftBio = '';
  let draftAvatarPreset: number | null = 0;
  let draftAvatarUrl = '';
  let draftBannerColor: string | undefined;
  let draftBannerDataUrl: string | undefined;
  let sessionPrompt = pickCasualStatusPrompt();

  const drawer = document.createElement('section');
  drawer.className = 'profile-drawer';
  drawer.setAttribute('aria-label', 'Profile');
  drawer.setAttribute('aria-hidden', 'true');

  const closeStatusMenu = () => {
    if (statusMenuEl) {
      statusMenuEl.remove();
      statusMenuEl = null;
    }
    const statusTrigger = drawer.querySelector('.profile-status-btn');
    if (statusTrigger) {
      statusTrigger.setAttribute('aria-expanded', 'false');
    }
    window.removeEventListener('pointerdown', onOutsidePointerDown);
    window.removeEventListener('keydown', onEscapeKey);
  };

  const onOutsidePointerDown = (e: PointerEvent) => {
    const target = e.target as Node | null;
    if (!target) {
      return;
    }
    if (statusMenuEl?.contains(target)) {
      return;
    }
    if (drawer.querySelector('.profile-status-btn')?.contains(target)) {
      return;
    }
    closeStatusMenu();
  };

  const onEscapeKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && statusMenuEl) {
      closeStatusMenu();
    }
  };

  const beginEdit = () => {
    closeStatusMenu();
    const user = options.getUser();
    isEditing = true;
    isSaving = false;
    editError = null;
    draftDisplayName = user.displayName;
    draftUsername = user.username;
    draftBio = user.bio;
    draftAvatarPreset = user.avatarPreset;
    draftAvatarUrl = options.resolveAvatar(user);
    draftBannerColor = user.bannerColor;
    draftBannerDataUrl = user.bannerDataUrl;
    renderContents();
  };

  const cancelEdit = () => {
    if (isSaving) {
      return;
    }
    isEditing = false;
    editError = null;
    renderContents();
  };

  const openStatusDropdown = (anchorBtn: HTMLButtonElement) => {
    if (statusMenuEl) {
      closeStatusMenu();
      return;
    }

    const user = options.getUser();
    const menu = document.createElement('div');
    menu.className = 'status-dropdown-menu';
    menu.setAttribute('role', 'menu');

    for (const opt of STATUS_OPTIONS) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'status-option';
      item.setAttribute('role', 'menuitemradio');
      item.setAttribute('aria-checked', String(user.status === opt.value));
      if (user.status === opt.value) {
        item.classList.add('status-option--active');
      }

      const iconWrap = document.createElement('span');
      iconWrap.className = 'status-option-icon';
      iconWrap.appendChild(createStatusGlyph(opt.value, 12));
      item.appendChild(iconWrap);

      const textWrap = document.createElement('span');
      textWrap.className = 'status-option-text';

      const labelEl = document.createElement('span');
      labelEl.className = 'status-option-label';
      labelEl.textContent = opt.label;
      textWrap.appendChild(labelEl);

      if (opt.description) {
        const descEl = document.createElement('span');
        descEl.className = 'status-option-desc';
        descEl.textContent = opt.description;
        textWrap.appendChild(descEl);
      }

      item.appendChild(textWrap);

      item.addEventListener('click', async () => {
        closeStatusMenu();
        const mySeq = beginOptimisticStatusChange(opt.value);
        const curUser = options.getUser();
        curUser.status = opt.value;
        if (options.onOptimisticSelfPatch) {
          options.onOptimisticSelfPatch({ status: opt.value });
        } else {
          options.onSyncDock();
          renderContents();
        }
        const res = await apiUpdateStatus(opt.value);
        if (res.ok && res.snapshot) {
          if (settleOptimisticStatusChange(mySeq, res.snapshot.user.status)) {
            options.onSnapshotUpdated(res.snapshot);
            renderContents();
          }
        }
      });

      menu.appendChild(item);
    }

    document.body.appendChild(menu);
    statusMenuEl = menu;
    anchorBtn.setAttribute('aria-expanded', 'true');

    const anchorRect = anchorBtn.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const gap = 8;

    let left = anchorRect.right + gap;
    if (left + menuRect.width > window.innerWidth - 12) {
      left = Math.max(12, anchorRect.left);
    }

    let top = anchorRect.bottom - menuRect.height;
    if (top < 12) {
      top = 12;
    }
    if (top + menuRect.height > window.innerHeight - 12) {
      top = Math.max(12, window.innerHeight - menuRect.height - 12);
    }

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;

    window.setTimeout(() => {
      window.addEventListener('pointerdown', onOutsidePointerDown);
      window.addEventListener('keydown', onEscapeKey);
    }, 0);
  };

  const renderContents = () => {
    const user = options.getUser();
    const effectiveStatus = user.status ?? 'online';
    drawer.replaceChildren();

    const bannerBar = document.createElement('div');
    bannerBar.className = 'profile-drawer-banner';
    applyBannerBackground(
      bannerBar,
      isEditing
        ? { bannerColor: draftBannerColor, bannerDataUrl: draftBannerDataUrl }
        : user,
    );

    if (options.onOpenFullProfile) {
      const expandBtn = document.createElement('button');
      expandBtn.type = 'button';
      expandBtn.className = 'profile-expand-btn';
      expandBtn.title = 'View Full Profile';
      expandBtn.setAttribute('aria-label', 'View Full Profile');
      expandBtn.appendChild(
        createIconSvg(['M15 3h6v6', 'M9 21H3v-6', 'M21 3l-7 7', 'M3 21l7-7'], 14),
      );
      expandBtn.addEventListener('click', () => {
        close();
        options.onOpenFullProfile?.();
      });
      bannerBar.appendChild(expandBtn);
    }

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'profile-close-btn';
    closeBtn.setAttribute('aria-label', 'Hide profile');
    closeBtn.appendChild(createIconSvg(['M18 6L6 18', 'M6 6l12 12'], 15));
    closeBtn.addEventListener('click', close);
    bannerBar.appendChild(closeBtn);

    const triggerBannerFlow = () => {
      openBannerChangeFlow({
        currentBannerColor: draftBannerColor,
        currentBannerDataUrl: draftBannerDataUrl,
        onApply: (result) => {
          draftBannerColor = result.bannerColor;
          draftBannerDataUrl = result.bannerDataUrl;
          renderContents();
        },
      });
    };

    drawer.appendChild(bannerBar);

    const avatarSection = document.createElement('div');
    avatarSection.className = 'profile-avatar-row';

    const avatarWrap = document.createElement('div');
    avatarWrap.className = 'profile-avatar-wrap';

    const avatarImg = document.createElement('img');
    avatarImg.className = 'profile-avatar-img';
    avatarImg.src = isEditing ? draftAvatarUrl : options.resolveAvatar(user);
    avatarImg.alt = `${user.displayName} profile picture`;
    avatarWrap.appendChild(avatarImg);

    if (isEditing) {
      const plusBtn = document.createElement('button');
      plusBtn.type = 'button';
      plusBtn.className = 'profile-avatar-edit-btn';
      plusBtn.setAttribute('aria-label', 'Change profile picture');
      plusBtn.textContent = '+';
      plusBtn.addEventListener('click', () => {
        openAvatarChangeFlow({
          currentPresetIndex: draftAvatarPreset,
          currentAvatarUrl: draftAvatarUrl,
          presetAvatars: options.presetAvatars,
          onApply: (result) => {
            draftAvatarPreset = result.avatarPreset;
            draftAvatarUrl = result.avatarUrl;
            avatarImg.src = result.avatarUrl;
          },
        });
      });
      avatarWrap.appendChild(plusBtn);
    } else {
      const statusBadge = document.createElement('span');
      statusBadge.className = 'profile-avatar-status';
      statusBadge.appendChild(createStatusGlyph(effectiveStatus, 13));
      avatarWrap.appendChild(statusBadge);
    }

    avatarSection.appendChild(avatarWrap);

    if (!isEditing) {
      const thoughtBubble = createThoughtBubbleElement({
        profile: user,
        interactiveSelf: true,
        placeholderPrompt: sessionPrompt,
        onEdit: () => {
          closeStatusMenu();
          let pendingSeq = 0;
          openSetCustomStatusModal({
            user: options.getUser(),
            resolveAvatar: options.resolveAvatar,
            initialPrompt: sessionPrompt,
            onOptimisticCustomStatus: (nextCustom) => {
              pendingSeq = beginOptimisticCustomStatusChange(nextCustom);
              const curUser = options.getUser();
              curUser.customStatus = nextCustom;
              if (!nextCustom) {
                sessionPrompt = pickCasualStatusPrompt();
              }
              if (options.onOptimisticSelfPatch) {
                options.onOptimisticSelfPatch({ customStatus: nextCustom });
              } else {
                options.onSyncDock();
                renderContents();
              }
            },
            onSnapshotUpdated: (snapshot) => {
              if (!pendingSeq || settleOptimisticCustomStatusChange(pendingSeq, snapshot.user.customStatus ?? null)) {
                options.onSnapshotUpdated(snapshot);
                renderContents();
              }
            },
          });
        },
        onClear: async () => {
          closeStatusMenu();
          const mySeq = beginOptimisticCustomStatusChange(null);
          const curUser = options.getUser();
          curUser.customStatus = null;
          sessionPrompt = pickCasualStatusPrompt();
          if (options.onOptimisticSelfPatch) {
            options.onOptimisticSelfPatch({ customStatus: null });
          } else {
            options.onSyncDock();
            renderContents();
          }
          const res = await apiUpdateCustomStatus({ clear: true });
          if (res.ok && res.snapshot) {
            if (settleOptimisticCustomStatusChange(mySeq, res.snapshot.user.customStatus ?? null)) {
              options.onSnapshotUpdated(res.snapshot);
              renderContents();
            }
          }
        },
      });
      if (thoughtBubble) {
        avatarSection.appendChild(thoughtBubble);
      }
    }

    drawer.appendChild(avatarSection);

    const drawerBody = document.createElement('div');
    drawerBody.className = 'profile-drawer-body';

    if (isEditing) {
      const editForm = document.createElement('form');
      editForm.className = 'profile-edit-form';
      editForm.noValidate = true;

      const nameGroup = document.createElement('div');
      nameGroup.className = 'profile-field-group';
      const nameLabel = document.createElement('label');
      nameLabel.className = 'profile-section-label';
      nameLabel.textContent = 'Display Name';
      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.className = 'profile-edit-input';
      nameInput.value = draftDisplayName;
      nameInput.maxLength = 32;
      nameInput.placeholder = 'Display name';
      nameInput.addEventListener('input', () => {
        draftDisplayName = nameInput.value;
      });
      nameGroup.appendChild(nameLabel);
      nameGroup.appendChild(nameInput);
      editForm.appendChild(nameGroup);

      const userGroup = document.createElement('div');
      userGroup.className = 'profile-field-group';
      const userLabel = document.createElement('label');
      userLabel.className = 'profile-section-label';
      userLabel.textContent = 'Username';
      const userInput = document.createElement('input');
      userInput.type = 'text';
      userInput.className = 'profile-edit-input';
      userInput.value = draftUsername;
      userInput.maxLength = 32;
      userInput.placeholder = 'Username';
      userInput.addEventListener('input', () => {
        draftUsername = userInput.value;
      });
      userGroup.appendChild(userLabel);
      userGroup.appendChild(userInput);
      editForm.appendChild(userGroup);

      const bioGroup = document.createElement('div');
      bioGroup.className = 'profile-field-group';
      const bioLabel = document.createElement('label');
      bioLabel.className = 'profile-section-label';
      bioLabel.textContent = 'Bio';
      const bioInput = document.createElement('textarea');
      bioInput.className = 'profile-edit-textarea';
      bioInput.rows = 3;
      bioInput.maxLength = 190;
      bioInput.value = draftBio;
      bioInput.placeholder = 'Write something about yourself...';
      bioInput.addEventListener('input', () => {
        draftBio = bioInput.value;
      });
      bioInput.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && (e.key === 'Enter' || e.key.toLowerCase() === 's')) {
          e.preventDefault();
          editForm.requestSubmit();
        }
      });
      bioGroup.appendChild(bioLabel);
      bioGroup.appendChild(bioInput);
      editForm.appendChild(bioGroup);

      const bannerGroup = document.createElement('div');
      bannerGroup.className = 'profile-field-group';
      const bannerFieldLabel = document.createElement('div');
      bannerFieldLabel.className = 'profile-section-label';
      bannerFieldLabel.textContent = 'Banner';
      const bannerRow = document.createElement('div');
      bannerRow.className = 'profile-banner-field-row';
      const bannerMiniPreview = document.createElement('div');
      bannerMiniPreview.className = 'profile-banner-mini';
      applyBannerBackground(bannerMiniPreview, {
        bannerColor: draftBannerColor,
        bannerDataUrl: draftBannerDataUrl,
      });
      const changeBannerBtn = document.createElement('button');
      changeBannerBtn.type = 'button';
      changeBannerBtn.className = 'btn-secondary profile-banner-btn';
      changeBannerBtn.textContent = 'Change Banner';
      changeBannerBtn.addEventListener('click', triggerBannerFlow);
      bannerRow.appendChild(bannerMiniPreview);
      bannerRow.appendChild(changeBannerBtn);
      bannerGroup.appendChild(bannerFieldLabel);
      bannerGroup.appendChild(bannerRow);
      editForm.appendChild(bannerGroup);

      const detailsSection = document.createElement('div');
      detailsSection.className = 'profile-section';
      const detailsLabel = document.createElement('div');
      detailsLabel.className = 'profile-section-label';
      detailsLabel.textContent = 'Account Details';
      const detailsDate = document.createElement('div');
      detailsDate.className = 'profile-details-line';
      detailsDate.textContent = `Created ${formatCreationDate(user.createdAt)}`;
      const detailsAge = document.createElement('div');
      detailsAge.className = 'profile-details-line';
      detailsAge.textContent = `Age: ${formatAccountAgeYears(user.createdAt)}`;
      detailsSection.appendChild(detailsLabel);
      detailsSection.appendChild(detailsDate);
      detailsSection.appendChild(detailsAge);
      editForm.appendChild(detailsSection);

      if (editError) {
        const err = document.createElement('div');
        err.className = 'feedback-banner feedback-banner--error profile-edit-error';
        err.textContent = editError;
        editForm.appendChild(err);
      }

      const actionRow = document.createElement('div');
      actionRow.className = 'button-row profile-action-row';

      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'btn-secondary profile-btn-compact';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.disabled = isSaving;
      cancelBtn.addEventListener('click', cancelEdit);

      const saveBtn = document.createElement('button');
      saveBtn.type = 'submit';
      saveBtn.className = 'btn-primary profile-btn-compact';
      saveBtn.textContent = isSaving ? 'Saving...' : 'Save';
      saveBtn.disabled = isSaving;

      actionRow.appendChild(cancelBtn);
      actionRow.appendChild(saveBtn);
      editForm.appendChild(actionRow);

      editForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (isSaving) {
          return;
        }
        isSaving = true;
        editError = null;
        renderContents();

        const res = await apiUpdateProfile({
          displayName: draftDisplayName,
          username: draftUsername,
          bio: draftBio,
          avatarPreset: draftAvatarPreset,
          avatarDataUrl: draftAvatarPreset === null ? draftAvatarUrl : undefined,
          bannerColor: draftBannerColor ?? null,
          bannerDataUrl: draftBannerDataUrl ?? null,
        });

        isSaving = false;
        if (!res.ok || !res.snapshot) {
          editError = res.error ?? 'Error: Could not save profile';
          renderContents();
          return;
        }

        isEditing = false;
        editError = null;
        options.onSnapshotUpdated(res.snapshot, res.previousUsername);
        renderContents();
      });

      drawerBody.appendChild(editForm);
    } else {
      const identity = document.createElement('div');
      identity.className = 'profile-identity';

      const displayEl = document.createElement('div');
      displayEl.className = 'profile-display-name';
      setDisplayNameWithRoleBadge(displayEl, user.displayName, user, { badgeSize: 17 });
      identity.appendChild(displayEl);

      const usernameEl = document.createElement('div');
      usernameEl.className = 'profile-username';
      usernameEl.textContent = user.username;
      identity.appendChild(usernameEl);

      drawerBody.appendChild(identity);

      const bioSection = document.createElement('div');
      bioSection.className = 'profile-section';
      const bioLabel = document.createElement('div');
      bioLabel.className = 'profile-section-label';
      bioLabel.textContent = 'Bio';
      const bioBody = document.createElement('div');
      bioBody.className = user.bio ? 'profile-bio-text' : 'profile-bio-text profile-bio-text--empty';
      bioBody.textContent = user.bio || 'No bio set.';
      bioSection.appendChild(bioLabel);
      bioSection.appendChild(bioBody);
      drawerBody.appendChild(bioSection);

      const detailsSection = document.createElement('div');
      detailsSection.className = 'profile-section';
      const detailsLabel = document.createElement('div');
      detailsLabel.className = 'profile-section-label';
      detailsLabel.textContent = 'Account Details';
      const detailsDate = document.createElement('div');
      detailsDate.className = 'profile-details-line';
      detailsDate.textContent = `Created ${formatCreationDate(user.createdAt)}`;
      const detailsAge = document.createElement('div');
      detailsAge.className = 'profile-details-line';
      detailsAge.textContent = `Age: ${formatAccountAgeYears(user.createdAt)}`;
      detailsSection.appendChild(detailsLabel);
      detailsSection.appendChild(detailsDate);
      detailsSection.appendChild(detailsAge);
      drawerBody.appendChild(detailsSection);

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'btn-primary profile-edit-btn';
      editBtn.textContent = 'Edit Profile';
      editBtn.addEventListener('click', beginEdit);
      drawerBody.appendChild(editBtn);

      const statusBtn = document.createElement('button');
      statusBtn.type = 'button';
      statusBtn.className = 'profile-status-btn';
      statusBtn.setAttribute('aria-haspopup', 'menu');
      statusBtn.setAttribute('aria-expanded', String(Boolean(statusMenuEl)));

      const statusLeft = document.createElement('span');
      statusLeft.className = 'profile-status-left';
      statusLeft.appendChild(createStatusGlyph(effectiveStatus, 12));
      const statusText = document.createElement('span');
      statusText.className = 'profile-status-label';
      statusText.textContent = STATUS_LABELS[effectiveStatus];
      statusLeft.appendChild(statusText);

      const statusChevron = document.createElement('span');
      statusChevron.className = 'profile-status-chevron';
      statusChevron.appendChild(createIconSvg(['M9 18l6-6-6-6'], 14));

      statusBtn.appendChild(statusLeft);
      statusBtn.appendChild(statusChevron);
      statusBtn.addEventListener('click', () => openStatusDropdown(statusBtn));
      drawerBody.appendChild(statusBtn);

      const signOutBtn = document.createElement('button');
      signOutBtn.type = 'button';
      signOutBtn.className = 'profile-signout-btn';
      signOutBtn.textContent = 'Sign Out';
      signOutBtn.addEventListener('click', () => {
        closeStatusMenu();
        options.onSignOut();
      });
      drawerBody.appendChild(signOutBtn);
    }

    drawer.appendChild(drawerBody);

    options.onSyncDock();
  };

  const open = () => {
    if (isOpen) {
      return;
    }
    isOpen = true;
    isEditing = false;
    isSaving = false;
    editError = null;
    sessionPrompt = pickCasualStatusPrompt();
    renderContents();
    drawer.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => {
      drawer.classList.add('profile-drawer--open');
    });
  };

  const openEdit = () => {
    isOpen = true;
    sessionPrompt = pickCasualStatusPrompt();
    beginEdit();
    renderContents();
    drawer.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => {
      drawer.classList.add('profile-drawer--open');
    });
  };

  const close = () => {
    if (!isOpen) {
      return;
    }
    closeStatusMenu();
    isOpen = false;
    isEditing = false;
    isSaving = false;
    editError = null;
    drawer.classList.remove('profile-drawer--open');
    drawer.setAttribute('aria-hidden', 'true');
  };

  const destroy = () => {
    closeStatusMenu();
  };

  return {
    element: drawer,
    open,
    openEdit,
    close,
    destroy,
    refresh: () => {
      if (isOpen && !isEditing) {
        renderContents();
      }
    },
  };
}

function createGearSvg(size = 15): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = createIconSvg(
    [
      'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.86 1 1.51 1H21a2 2 0 0 1 0 4h-.09c-.65 0-1.25.4-1.51 1z',
    ],
    size,
  );
  svg.setAttribute('stroke-width', '2');
  const center = document.createElementNS(ns, 'circle');
  center.setAttribute('cx', '12');
  center.setAttribute('cy', '12');
  center.setAttribute('r', '3');
  svg.appendChild(center);
  return svg;
}

/**
 * Opens a detailed popup version of the user's own profile card, supporting inline
 * profile editing (avatar, banner, display name, username, bio), custom status,
 * live status switching, User Settings access, and Sign Out.
 */
export function openSelfProfileModal(options: SelfProfileModalOptions): SelfProfileModalHandle {
  let isClosed = false;
  let isEditing = Boolean(options.initialEdit);
  let isSaving = false;
  let editError: string | null = null;
  let statusMenuEl: HTMLDivElement | null = null;
  let statusMenuAnchor: HTMLElement | null = null;
  let sessionPrompt = pickCasualStatusPrompt();

  const initialUser = options.getSnapshot().user;
  let draftDisplayName = initialUser.displayName;
  let draftUsername = initialUser.username;
  let draftBio = initialUser.bio;
  let draftAvatarPreset: number | null = initialUser.avatarPreset;
  let draftAvatarUrl = options.resolveAvatar(initialUser);
  let draftBannerColor: string | undefined = initialUser.bannerColor;
  let draftBannerDataUrl: string | undefined = initialUser.bannerDataUrl;

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop modal-backdrop--deep';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-label', 'Your full profile');

  const modal = document.createElement('div');
  modal.className = 'modal-card modal-card--profile self-profile-modal';
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);

  const closeStatusMenu = () => {
    if (statusMenuEl) {
      statusMenuEl.remove();
      statusMenuEl = null;
    }
    if (statusMenuAnchor) {
      statusMenuAnchor.setAttribute('aria-expanded', 'false');
      statusMenuAnchor = null;
    }
    window.removeEventListener('pointerdown', onOutsideStatusPointerDown);
  };

  const onOutsideStatusPointerDown = (e: PointerEvent) => {
    const target = e.target as Node | null;
    if (!target) {
      return;
    }
    if (statusMenuEl?.contains(target) || statusMenuAnchor?.contains(target)) {
      return;
    }
    closeStatusMenu();
  };

  const openStatusDropdown = (anchorBtn: HTMLButtonElement) => {
    if (statusMenuEl && statusMenuAnchor === anchorBtn) {
      closeStatusMenu();
      return;
    }
    closeStatusMenu();

    const user = options.getSnapshot().user;
    const menu = document.createElement('div');
    menu.className = 'status-dropdown-menu';
    menu.setAttribute('role', 'menu');

    for (const opt of STATUS_OPTIONS) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'status-option';
      item.setAttribute('role', 'menuitemradio');
      item.setAttribute('aria-checked', String(user.status === opt.value));
      if (user.status === opt.value) {
        item.classList.add('status-option--active');
      }

      const iconWrap = document.createElement('span');
      iconWrap.className = 'status-option-icon';
      iconWrap.appendChild(createStatusGlyph(opt.value, 12));
      item.appendChild(iconWrap);

      const textWrap = document.createElement('span');
      textWrap.className = 'status-option-text';
      const labelEl = document.createElement('span');
      labelEl.className = 'status-option-label';
      labelEl.textContent = opt.label;
      textWrap.appendChild(labelEl);

      if (opt.description) {
        const descEl = document.createElement('span');
        descEl.className = 'status-option-desc';
        descEl.textContent = opt.description;
        textWrap.appendChild(descEl);
      }

      item.appendChild(textWrap);
      item.addEventListener('click', async () => {
        closeStatusMenu();
        const mySeq = beginOptimisticStatusChange(opt.value);
        const snapNow = options.getSnapshot();
        snapNow.user.status = opt.value;
        if (options.onOptimisticSelfPatch) {
          options.onOptimisticSelfPatch({ status: opt.value });
        } else {
          options.onSyncDock();
          renderModal();
        }
        const res = await apiUpdateStatus(opt.value);
        if (res.ok && res.snapshot) {
          if (settleOptimisticStatusChange(mySeq, res.snapshot.user.status)) {
            options.onSnapshotUpdated(res.snapshot);
            renderModal();
          }
        }
      });
      menu.appendChild(item);
    }

    document.body.appendChild(menu);
    statusMenuEl = menu;
    statusMenuAnchor = anchorBtn;
    anchorBtn.setAttribute('aria-expanded', 'true');

    const anchorRect = anchorBtn.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    let left = anchorRect.left;
    if (left + menuRect.width > window.innerWidth - 12) {
      left = Math.max(12, anchorRect.right - menuRect.width);
    }
    let top = anchorRect.bottom + 6;
    if (top + menuRect.height > window.innerHeight - 12) {
      top = Math.max(12, anchorRect.top - menuRect.height - 6);
    }
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;

    window.setTimeout(() => {
      window.addEventListener('pointerdown', onOutsideStatusPointerDown);
    }, 0);
  };

  const beginEdit = () => {
    closeStatusMenu();
    const user = options.getSnapshot().user;
    isEditing = true;
    isSaving = false;
    editError = null;
    draftDisplayName = user.displayName;
    draftUsername = user.username;
    draftBio = user.bio;
    draftAvatarPreset = user.avatarPreset;
    draftAvatarUrl = options.resolveAvatar(user);
    draftBannerColor = user.bannerColor;
    draftBannerDataUrl = user.bannerDataUrl;
    renderModal();
  };

  const cancelEdit = () => {
    if (isSaving) {
      return;
    }
    isEditing = false;
    editError = null;
    renderModal();
  };

  const closeModal = () => {
    if (isClosed) {
      return;
    }
    isClosed = true;
    closeStatusMenu();
    document.removeEventListener('keydown', onEscape, true);
    backdrop.classList.remove('modal-backdrop--visible');
    window.setTimeout(() => backdrop.remove(), 170);
    options.onClose?.();
  };

  const renderModal = () => {
    if (isClosed) {
      return;
    }
    const snap = options.getSnapshot();
    const user = snap.user;
    const effectiveStatus = user.status ?? 'online';

    modal.replaceChildren();

    const triggerBannerFlow = () => {
      openBannerChangeFlow({
        currentBannerColor: draftBannerColor,
        currentBannerDataUrl: draftBannerDataUrl,
        onApply: (result) => {
          draftBannerColor = result.bannerColor;
          draftBannerDataUrl = result.bannerDataUrl;
          renderModal();
        },
      });
    };

    const banner = document.createElement('div');
    banner.className = 'dm-full-banner';
    applyBannerBackground(
      banner,
      isEditing
        ? { bannerColor: draftBannerColor, bannerDataUrl: draftBannerDataUrl }
        : user,
    );

    const bannerActions = document.createElement('div');
    bannerActions.className = 'dm-full-banner-actions';

    const settingsIconBtn = document.createElement('button');
    settingsIconBtn.type = 'button';
    settingsIconBtn.className = 'dm-banner-friend-btn self-profile-banner-settings-btn';
    settingsIconBtn.dataset.action = 'self-profile-settings';
    settingsIconBtn.title = 'User Settings';
    settingsIconBtn.setAttribute('aria-label', 'Open User Settings');
    settingsIconBtn.appendChild(createGearSvg(15));
    settingsIconBtn.addEventListener('click', () => {
      closeModal();
      options.onOpenSettings();
    });
    bannerActions.appendChild(settingsIconBtn);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'dm-full-close';
    closeBtn.setAttribute('aria-label', 'Close profile popup');
    closeBtn.appendChild(createIconSvg(['M18 6L6 18', 'M6 6l12 12'], 16));
    closeBtn.addEventListener('click', closeModal);
    bannerActions.appendChild(closeBtn);
    banner.appendChild(bannerActions);

    modal.appendChild(banner);

    const topRow = document.createElement('div');
    topRow.className = 'dm-full-top';

    const avatarWrap = document.createElement('div');
    avatarWrap.className = 'dm-full-avatar-wrap';
    const avatarImg = document.createElement('img');
    avatarImg.className = 'dm-full-avatar';
    avatarImg.src = isEditing ? draftAvatarUrl : options.resolveAvatar(user);
    avatarImg.alt = `${user.displayName} profile picture`;
    avatarWrap.appendChild(avatarImg);

    if (isEditing) {
      const plusBtn = document.createElement('button');
      plusBtn.type = 'button';
      plusBtn.className = 'profile-avatar-edit-btn self-profile-avatar-edit-btn';
      plusBtn.title = 'Change profile picture';
      plusBtn.setAttribute('aria-label', 'Change profile picture');
      plusBtn.textContent = '+';
      plusBtn.addEventListener('click', () => {
        openAvatarChangeFlow({
          currentPresetIndex: draftAvatarPreset,
          currentAvatarUrl: draftAvatarUrl,
          presetAvatars: options.presetAvatars,
          onApply: (result) => {
            draftAvatarPreset = result.avatarPreset;
            draftAvatarUrl = result.avatarUrl;
            avatarImg.src = result.avatarUrl;
          },
        });
      });
      avatarWrap.appendChild(plusBtn);
    } else {
      const statusDot = document.createElement('span');
      statusDot.className = 'dm-full-status-dot';
      statusDot.appendChild(createStatusGlyph(effectiveStatus, 18));
      avatarWrap.appendChild(statusDot);
    }
    topRow.appendChild(avatarWrap);

    const openCustomStatusEditor = () => {
      closeStatusMenu();
      let pendingSeq = 0;
      openSetCustomStatusModal({
        user: options.getSnapshot().user,
        resolveAvatar: options.resolveAvatar,
        initialPrompt: sessionPrompt,
        onOptimisticCustomStatus: (nextCustom) => {
          pendingSeq = beginOptimisticCustomStatusChange(nextCustom);
          const snapNow = options.getSnapshot();
          snapNow.user.customStatus = nextCustom;
          if (!nextCustom) {
            sessionPrompt = pickCasualStatusPrompt();
          }
          if (options.onOptimisticSelfPatch) {
            options.onOptimisticSelfPatch({ customStatus: nextCustom });
          } else {
            options.onSyncDock();
            renderModal();
          }
        },
        onSnapshotUpdated: (snapshot) => {
          if (!pendingSeq || settleOptimisticCustomStatusChange(pendingSeq, snapshot.user.customStatus ?? null)) {
            options.onSnapshotUpdated(snapshot);
            renderModal();
          }
        },
      });
    };

    if (!isEditing) {
      const bubbleHost = document.createElement('div');
      bubbleHost.className = 'dm-full-bubble-host';
      const thoughtBubble = createThoughtBubbleElement({
        profile: user,
        interactiveSelf: true,
        placeholderPrompt: sessionPrompt,
        onEdit: openCustomStatusEditor,
        onClear: async () => {
          closeStatusMenu();
          const mySeq = beginOptimisticCustomStatusChange(null);
          const snapNow = options.getSnapshot();
          snapNow.user.customStatus = null;
          sessionPrompt = pickCasualStatusPrompt();
          if (options.onOptimisticSelfPatch) {
            options.onOptimisticSelfPatch({ customStatus: null });
          } else {
            options.onSyncDock();
            renderModal();
          }
          const res = await apiUpdateCustomStatus({ clear: true });
          if (res.ok && res.snapshot) {
            if (settleOptimisticCustomStatusChange(mySeq, res.snapshot.user.customStatus ?? null)) {
              options.onSnapshotUpdated(res.snapshot);
              renderModal();
            }
          }
        },
      });
      if (thoughtBubble) {
        bubbleHost.appendChild(thoughtBubble);
      }
      topRow.appendChild(bubbleHost);
    } else {
      const editBadge = document.createElement('div');
      editBadge.className = 'dm-full-status-pill self-profile-editing-pill';
      editBadge.textContent = 'Editing Profile';
      topRow.appendChild(editBadge);
    }

    modal.appendChild(topRow);

    const body = document.createElement('div');
    body.className = 'dm-full-body self-profile-body';

    if (isEditing) {
      const editForm = document.createElement('form');
      editForm.className = 'profile-edit-form self-profile-edit-form';
      editForm.noValidate = true;

      const fieldsGrid = document.createElement('div');
      fieldsGrid.className = 'self-profile-edit-grid';

      const nameGroup = document.createElement('div');
      nameGroup.className = 'profile-field-group';
      const nameLabel = document.createElement('label');
      nameLabel.className = 'profile-section-label';
      nameLabel.textContent = 'Display Name';
      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.className = 'profile-edit-input';
      nameInput.name = 'displayName';
      nameInput.value = draftDisplayName;
      nameInput.maxLength = 32;
      nameInput.placeholder = 'Display name';
      nameInput.addEventListener('input', () => {
        draftDisplayName = nameInput.value;
      });
      nameGroup.appendChild(nameLabel);
      nameGroup.appendChild(nameInput);
      fieldsGrid.appendChild(nameGroup);

      const userGroup = document.createElement('div');
      userGroup.className = 'profile-field-group';
      const userLabel = document.createElement('label');
      userLabel.className = 'profile-section-label';
      userLabel.textContent = 'Username';
      const userInput = document.createElement('input');
      userInput.type = 'text';
      userInput.className = 'profile-edit-input';
      userInput.name = 'username';
      userInput.value = draftUsername;
      userInput.maxLength = 32;
      userInput.placeholder = 'Username';
      userInput.addEventListener('input', () => {
        draftUsername = userInput.value;
      });
      userGroup.appendChild(userLabel);
      userGroup.appendChild(userInput);
      fieldsGrid.appendChild(userGroup);

      editForm.appendChild(fieldsGrid);

      const bioGroup = document.createElement('div');
      bioGroup.className = 'profile-field-group';
      const bioLabelRow = document.createElement('div');
      bioLabelRow.className = 'self-profile-label-row';
      const bioLabel = document.createElement('label');
      bioLabel.className = 'profile-section-label';
      bioLabel.textContent = 'Bio';
      const bioCount = document.createElement('span');
      bioCount.className = 'self-profile-char-count';
      bioCount.textContent = `${draftBio.length} / 190`;
      bioLabelRow.appendChild(bioLabel);
      bioLabelRow.appendChild(bioCount);

      const bioInput = document.createElement('textarea');
      bioInput.className = 'profile-edit-textarea';
      bioInput.name = 'bio';
      bioInput.rows = 3;
      bioInput.maxLength = 190;
      bioInput.value = draftBio;
      bioInput.placeholder = 'Write something about yourself...';
      bioInput.addEventListener('input', () => {
        draftBio = bioInput.value;
        bioCount.textContent = `${draftBio.length} / 190`;
      });
      bioGroup.appendChild(bioLabelRow);
      bioGroup.appendChild(bioInput);
      editForm.appendChild(bioGroup);

      const bannerGroup = document.createElement('div');
      bannerGroup.className = 'profile-field-group';
      const bannerFieldLabel = document.createElement('div');
      bannerFieldLabel.className = 'profile-section-label';
      bannerFieldLabel.textContent = 'Banner';
      const bannerRow = document.createElement('div');
      bannerRow.className = 'profile-banner-field-row';
      const bannerMiniPreview = document.createElement('div');
      bannerMiniPreview.className = 'profile-banner-mini';
      applyBannerBackground(bannerMiniPreview, {
        bannerColor: draftBannerColor,
        bannerDataUrl: draftBannerDataUrl,
      });
      const changeBannerBtn = document.createElement('button');
      changeBannerBtn.type = 'button';
      changeBannerBtn.className = 'btn-secondary profile-banner-btn';
      changeBannerBtn.textContent = 'Change Banner';
      changeBannerBtn.addEventListener('click', triggerBannerFlow);
      bannerRow.appendChild(bannerMiniPreview);
      bannerRow.appendChild(changeBannerBtn);
      bannerGroup.appendChild(bannerFieldLabel);
      bannerGroup.appendChild(bannerRow);
      editForm.appendChild(bannerGroup);

      if (editError) {
        const err = document.createElement('div');
        err.className = 'feedback-banner feedback-banner--error profile-edit-error';
        err.textContent = editError;
        editForm.appendChild(err);
      }

      const actionRow = document.createElement('div');
      actionRow.className = 'button-row profile-action-row';

      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'btn-secondary profile-btn-compact';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.disabled = isSaving;
      cancelBtn.addEventListener('click', cancelEdit);

      const saveBtn = document.createElement('button');
      saveBtn.type = 'submit';
      saveBtn.className = 'btn-primary profile-btn-compact';
      saveBtn.dataset.action = 'self-profile-save';
      saveBtn.textContent = isSaving ? 'Saving...' : 'Save Changes';
      saveBtn.disabled = isSaving;

      actionRow.appendChild(cancelBtn);
      actionRow.appendChild(saveBtn);
      editForm.appendChild(actionRow);

      editForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (isSaving) {
          return;
        }
        isSaving = true;
        editError = null;
        renderModal();

        const res = await apiUpdateProfile({
          displayName: draftDisplayName,
          username: draftUsername,
          bio: draftBio,
          avatarPreset: draftAvatarPreset,
          avatarDataUrl: draftAvatarPreset === null ? draftAvatarUrl : undefined,
          bannerColor: draftBannerColor ?? null,
          bannerDataUrl: draftBannerDataUrl ?? null,
        });

        isSaving = false;
        if (!res.ok || !res.snapshot) {
          editError = res.error ?? 'Error: Could not save profile';
          renderModal();
          return;
        }

        isEditing = false;
        editError = null;
        options.onSnapshotUpdated(res.snapshot, res.previousUsername);
        renderModal();
      });

      body.appendChild(editForm);
    } else {
      const identityHeader = document.createElement('div');
      identityHeader.className = 'self-profile-identity-row';

      const displayEl = document.createElement('h3');
      displayEl.className = 'dm-full-display';
      setDisplayNameWithRoleBadge(displayEl, user.displayName, user, { badgeSize: 18 });
      identityHeader.appendChild(displayEl);

      const youPill = document.createElement('span');
      youPill.className = 'self-profile-you-pill';
      youPill.textContent = 'You';
      identityHeader.appendChild(youPill);
      body.appendChild(identityHeader);

      const usernameEl = document.createElement('div');
      usernameEl.className = 'dm-full-username';
      usernameEl.textContent = `@${user.username}`;
      body.appendChild(usernameEl);

      const actionStrip = document.createElement('div');
      actionStrip.className = 'self-profile-action-strip';

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'btn-primary self-profile-action-btn';
      editBtn.dataset.action = 'self-profile-edit';
      editBtn.appendChild(
        createIconSvg(['M12 20h9', 'M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z'], 14),
      );
      editBtn.appendChild(document.createTextNode('Edit Profile'));
      editBtn.addEventListener('click', beginEdit);

      const customStatusActionBtn = document.createElement('button');
      customStatusActionBtn.type = 'button';
      customStatusActionBtn.className = 'btn-secondary self-profile-copy-btn';
      customStatusActionBtn.dataset.action = 'self-profile-custom-status';
      customStatusActionBtn.textContent = user.customStatus ? 'Edit Status' : 'Custom Status';
      customStatusActionBtn.addEventListener('click', openCustomStatusEditor);

      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'btn-secondary self-profile-copy-btn';
      copyBtn.title = 'Copy Username';
      copyBtn.textContent = 'Copy Username';
      copyBtn.addEventListener('click', () => {
        void copyToClipboard(user.username).then(() => {
          copyBtn.textContent = 'Copied!';
          window.setTimeout(() => {
            if (!isClosed) {
              copyBtn.textContent = 'Copy Username';
            }
          }, 1400);
        });
      });

      actionStrip.appendChild(editBtn);
      actionStrip.appendChild(customStatusActionBtn);
      actionStrip.appendChild(copyBtn);
      body.appendChild(actionStrip);

      const infoCard = document.createElement('div');
      infoCard.className = 'dm-full-card';

      const bioHeading = document.createElement('div');
      bioHeading.className = 'dm-profile-section-label';
      bioHeading.textContent = 'Bio';
      infoCard.appendChild(bioHeading);

      const bioText = document.createElement('div');
      bioText.className = 'dm-full-bio';
      const trimmedBio = user.bio.trim();
      bioText.textContent = trimmedBio || 'No bio set yet.';
      bioText.classList.toggle('dm-profile-bio--empty', trimmedBio.length === 0);
      infoCard.appendChild(bioText);

      const div1 = document.createElement('div');
      div1.className = 'dm-profile-divider';
      infoCard.appendChild(div1);

      const statsGrid = document.createElement('div');
      statsGrid.className = 'self-profile-stats-grid';
      const isPrivate = Boolean(user.privacy?.privateProfile);
      const statDefs = [
        { label: 'Friends', value: String(snap.friends.length) },
        { label: 'Groups', value: String((snap.groups ?? []).length) },
        { label: 'Visibility', value: isPrivate ? 'Private' : 'Public' },
      ];
      for (const s of statDefs) {
        const cell = document.createElement('div');
        cell.className = 'self-profile-stat-cell';
        const valEl = document.createElement('div');
        valEl.className = 'self-profile-stat-value';
        valEl.textContent = s.value;
        const lblEl = document.createElement('div');
        lblEl.className = 'self-profile-stat-label';
        lblEl.textContent = s.label;
        cell.appendChild(valEl);
        cell.appendChild(lblEl);
        statsGrid.appendChild(cell);
      }
      infoCard.appendChild(statsGrid);

      const div2 = document.createElement('div');
      div2.className = 'dm-profile-divider';
      infoCard.appendChild(div2);

      const detailsHeading = document.createElement('div');
      detailsHeading.className = 'dm-profile-section-label';
      detailsHeading.textContent = 'Account Details';
      infoCard.appendChild(detailsHeading);

      const createdEl = document.createElement('div');
      createdEl.className = 'dm-profile-date';
      createdEl.textContent = `Member Since ${formatCreationDate(user.createdAt)}`;
      infoCard.appendChild(createdEl);

      const ageEl = document.createElement('div');
      ageEl.className = 'dm-profile-age';
      ageEl.textContent = `Account Age: ${formatAccountAgeYears(user.createdAt)}`;
      infoCard.appendChild(ageEl);

      body.appendChild(infoCard);

      const bottomRow = document.createElement('div');
      bottomRow.className = 'self-profile-bottom-row';

      const statusBtn = document.createElement('button');
      statusBtn.type = 'button';
      statusBtn.className = 'profile-status-btn self-profile-bottom-status';
      statusBtn.setAttribute('aria-haspopup', 'menu');
      statusBtn.setAttribute('aria-expanded', 'false');
      const statusLeft = document.createElement('span');
      statusLeft.className = 'profile-status-left';
      statusLeft.appendChild(createStatusGlyph(effectiveStatus, 12));
      const statusText = document.createElement('span');
      statusText.className = 'profile-status-label';
      statusText.textContent = STATUS_LABELS[effectiveStatus];
      statusLeft.appendChild(statusText);
      const statusChevron = document.createElement('span');
      statusChevron.className = 'profile-status-chevron';
      statusChevron.appendChild(createIconSvg(['M9 18l6-6-6-6'], 14));
      statusBtn.appendChild(statusLeft);
      statusBtn.appendChild(statusChevron);
      statusBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openStatusDropdown(statusBtn);
      });

      const signOutBtn = document.createElement('button');
      signOutBtn.type = 'button';
      signOutBtn.className = 'profile-signout-btn self-profile-bottom-signout';
      signOutBtn.textContent = 'Sign Out';
      signOutBtn.addEventListener('click', () => {
        closeModal();
        options.onSignOut();
      });

      bottomRow.appendChild(statusBtn);
      bottomRow.appendChild(signOutBtn);
      body.appendChild(bottomRow);
    }

    modal.appendChild(body);
    options.onSyncDock();
  };

  const onEscape = (e: KeyboardEvent) => {
    if (!isTopmostModal(backdrop)) {
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (statusMenuEl) {
        closeStatusMenu();
        return;
      }
      if (isEditing && !isSaving) {
        cancelEdit();
        return;
      }
      closeModal();
      return;
    }
    if (isEditing && !isSaving && isModalConfirmShortcut(e, backdrop, { allowCtrlS: true })) {
      const form = modal.querySelector<HTMLFormElement>('form.self-profile-edit-form');
      if (form) {
        e.preventDefault();
        e.stopImmediatePropagation();
        form.requestSubmit();
      }
    }
  };

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) {
      closeModal();
    }
  });
  document.addEventListener('keydown', onEscape, true);

  renderModal();
  requestAnimationFrame(() => {
    if (!isClosed) {
      backdrop.classList.add('modal-backdrop--visible');
    }
  });

  return {
    refresh: () => {
      if (!isClosed && !isEditing) {
        renderModal();
      }
    },
    close: closeModal,
  };
}
