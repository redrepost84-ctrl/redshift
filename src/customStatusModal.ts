import { apiUpdateCustomStatus } from './apiClient';
import {
  createCloseIconSvg,
  createEditPencilSvg,
  createEmojiIconSvg,
  createPlusIconSvg,
  createTrashSvg,
} from './chatUi';
import { replaceEmojiShortcodeBeforeCursor } from './emojiCatalog';
import { createStatusGlyph } from './profileDrawer';
import { isModalConfirmShortcut, isTopmostModal } from './modalShortcuts';
import { applyBannerBackground } from './profileModals';
import { setTwemojiText } from './twemojiHelper';
import type {
  CustomStatusClearOption,
  CustomStatusData,
  SelfProfile,
  SocialSnapshot,
} from './types';

export const CASUAL_STATUS_PROMPTS = [
  'Tell a crazy story about today.',
  "What's your favorite game right now?",
  'What are you currently obsessed with?',
  'What song is stuck in your head?',
  'Drop a random hot take...',
  'What are you up to right now?',
  'Any fun plans this week?',
  'Share a tiny win from today.',
];

export function pickCasualStatusPrompt(): string {
  const idx = Math.floor(Math.random() * CASUAL_STATUS_PROMPTS.length);
  return CASUAL_STATUS_PROMPTS[idx] ?? CASUAL_STATUS_PROMPTS[0];
}

export function resolveActiveCustomStatus(profile: {
  customStatus?: CustomStatusData | null;
}): CustomStatusData | null {
  const cs = profile.customStatus;
  if (!cs) {
    return null;
  }
  if (typeof cs.expiresAt === 'number' && cs.expiresAt <= Date.now()) {
    return null;
  }
  const text = cs.text?.trim() ?? '';
  const emoji = cs.emoji?.trim() || undefined;
  if (!text && !emoji) {
    return null;
  }
  return {
    text,
    emoji,
    expiresAt: typeof cs.expiresAt === 'number' ? cs.expiresAt : null,
  };
}

export function formatCustomStatusLine(profile: {
  customStatus?: CustomStatusData | null;
}): string | null {
  const active = resolveActiveCustomStatus(profile);
  if (!active) {
    return null;
  }
  if (active.emoji && active.text) {
    return `${active.emoji} ${active.text}`;
  }
  return active.emoji || active.text || null;
}

export interface ThoughtBubbleOptions {
  profile: { customStatus?: CustomStatusData | null };
  interactiveSelf?: boolean;
  placeholderPrompt?: string;
  previewEmptyPlaceholder?: string;
  onEdit?: () => void;
  onClear?: () => void;
}

export function createThoughtBubbleElement(opts: ThoughtBubbleOptions): HTMLDivElement | null {
  const active = resolveActiveCustomStatus(opts.profile);
  const showSelfEmpty = Boolean(opts.interactiveSelf && !active);
  const showPreviewEmpty = Boolean(opts.previewEmptyPlaceholder && !active);

  if (!active && !showSelfEmpty && !showPreviewEmpty) {
    return null;
  }

  const wrap = document.createElement('div');
  wrap.className = 'thought-bubble-wrap';
  if (opts.interactiveSelf && active) {
    wrap.classList.add('thought-bubble-wrap--has-actions');
  }

  const chatTail = document.createElement('span');
  chatTail.className = 'status-chat-tail';
  chatTail.setAttribute('aria-hidden', 'true');
  wrap.appendChild(chatTail);

  const pillEl = opts.interactiveSelf
    ? document.createElement('button')
    : document.createElement('div');

  if (pillEl instanceof HTMLButtonElement) {
    pillEl.type = 'button';
    pillEl.className = 'thought-bubble-pill thought-bubble-pill--clickable';
    pillEl.title = active ? 'Edit your status' : 'Set a custom status';
    pillEl.addEventListener('click', () => opts.onEdit?.());
  } else {
    pillEl.className = 'thought-bubble-pill';
  }

  if (active) {
    if (active.emoji) {
      const emojiSpan = document.createElement('span');
      emojiSpan.className = 'thought-bubble-emoji';
      setTwemojiText(emojiSpan, active.emoji);
      pillEl.appendChild(emojiSpan);
    }
    if (active.text) {
      const textSpan = document.createElement('span');
      textSpan.className = 'thought-bubble-text';
      setTwemojiText(textSpan, active.text);
      pillEl.appendChild(textSpan);
    }
  } else if (showSelfEmpty) {
    const plusBadge = document.createElement('span');
    plusBadge.className = 'thought-bubble-add-dot';
    plusBadge.appendChild(createPlusIconSvg(10));
    plusBadge.setAttribute('aria-hidden', 'true');
    pillEl.appendChild(plusBadge);

    const placeholder = document.createElement('span');
    placeholder.className = 'thought-bubble-placeholder';
    placeholder.textContent = opts.placeholderPrompt || pickCasualStatusPrompt();
    pillEl.appendChild(placeholder);
  } else if (opts.previewEmptyPlaceholder) {
    const placeholder = document.createElement('span');
    placeholder.className = 'thought-bubble-placeholder';
    placeholder.textContent = opts.previewEmptyPlaceholder;
    pillEl.appendChild(placeholder);
  }

  wrap.appendChild(pillEl);

  if (opts.interactiveSelf && active) {
    const actions = document.createElement('div');
    actions.className = 'thought-hover-actions';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'thought-action-btn';
    editBtn.title = 'Edit Status';
    editBtn.setAttribute('aria-label', 'Edit custom status');
    editBtn.appendChild(createEditPencilSvg(13));
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      opts.onEdit?.();
    });

    const trashBtn = document.createElement('button');
    trashBtn.type = 'button';
    trashBtn.className = 'thought-action-btn thought-action-btn--danger';
    trashBtn.title = 'Clear Status';
    trashBtn.setAttribute('aria-label', 'Clear custom status');
    trashBtn.appendChild(createTrashSvg(13));
    trashBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      opts.onClear?.();
    });

    actions.appendChild(editBtn);
    actions.appendChild(trashBtn);
    wrap.appendChild(actions);
  }

  return wrap;
}

interface ClearOptionMeta {
  id: CustomStatusClearOption;
  label: string;
  computeExpiresAt: (now: number) => number | null;
  formatTriggerText: (now: number) => string;
  formatMenuHint: (now: number) => string;
}

function formatClockTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function formatShortDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

const CLEAR_OPTIONS: ClearOptionMeta[] = [
  {
    id: 'tomorrow',
    label: 'Tomorrow',
    computeExpiresAt: (now) => now + 24 * 60 * 60 * 1000,
    formatTriggerText: (now) => `Clear tomorrow at ${formatClockTime(now + 24 * 60 * 60 * 1000)}`,
    formatMenuHint: (now) => formatClockTime(now + 24 * 60 * 60 * 1000),
  },
  {
    id: '30m',
    label: 'In 30 minutes',
    computeExpiresAt: (now) => now + 30 * 60 * 1000,
    formatTriggerText: () => 'Clear in 30 minutes',
    formatMenuHint: (now) => formatClockTime(now + 30 * 60 * 1000),
  },
  {
    id: '1h',
    label: 'In the next hour',
    computeExpiresAt: (now) => now + 60 * 60 * 1000,
    formatTriggerText: () => 'Clear in the next hour',
    formatMenuHint: (now) => formatClockTime(now + 60 * 60 * 1000),
  },
  {
    id: '1w',
    label: 'In the next week',
    computeExpiresAt: (now) => now + 7 * 24 * 60 * 60 * 1000,
    formatTriggerText: () => 'Clear in the next week',
    formatMenuHint: (now) => formatShortDate(now + 7 * 24 * 60 * 60 * 1000),
  },
  {
    id: 'never',
    label: "Don't clear",
    computeExpiresAt: () => null,
    formatTriggerText: () => "Don't clear",
    formatMenuHint: () => 'Forever',
  },
];

export interface SetCustomStatusModalOptions {
  user: SelfProfile;
  resolveAvatar: (profile: { avatarPreset: number | null; avatarDataUrl?: string }) => string;
  initialPrompt?: string;
  onOptimisticCustomStatus?: (customStatus: CustomStatusData | null) => void;
  onSnapshotUpdated: (snapshot: SocialSnapshot) => void;
}

export function openSetCustomStatusModal(options: SetCustomStatusModalOptions): void {
  const { user, resolveAvatar } = options;
  const active = resolveActiveCustomStatus(user);
  const promptText = options.initialPrompt || pickCasualStatusPrompt();

  let draftEmoji: string | undefined = active?.emoji;
  let draftText: string = active?.text ?? '';
  let clearChoice: CustomStatusClearOption =
    active && active.expiresAt === null ? 'never' : 'tomorrow';
  let isSaving = false;
  let closed = false;
  let clearMenuEl: HTMLDivElement | null = null;

  const openedAt = Date.now();

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop modal-backdrop--deep';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-label', 'Set your status');

  const card = document.createElement('form');
  card.className = 'modal-card modal-card--status';
  card.noValidate = true;

  const header = document.createElement('div');
  header.className = 'status-modal-header';

  const title = document.createElement('h2');
  title.className = 'status-modal-title';
  title.textContent = 'Set your status';
  header.appendChild(title);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'status-modal-close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.appendChild(createCloseIconSvg(16));
  header.appendChild(closeBtn);
  card.appendChild(header);

  // Live preview card matching user's banner, avatar, live status dot & thought bubble
  const previewCard = document.createElement('div');
  previewCard.className = 'status-preview-card';

  const previewBanner = document.createElement('div');
  previewBanner.className = 'status-preview-banner';
  applyBannerBackground(previewBanner, user);
  previewCard.appendChild(previewBanner);

  const previewTopRow = document.createElement('div');
  previewTopRow.className = 'status-preview-top';

  const previewAvatarWrap = document.createElement('div');
  previewAvatarWrap.className = 'status-preview-avatar-wrap';
  const previewAvatar = document.createElement('img');
  previewAvatar.className = 'status-preview-avatar';
  previewAvatar.src = resolveAvatar(user);
  previewAvatar.alt = `${user.displayName} avatar preview`;
  const previewStatusDot = document.createElement('span');
  previewStatusDot.className = 'status-preview-status-dot';
  previewStatusDot.appendChild(createStatusGlyph(user.status, 13));
  previewAvatarWrap.appendChild(previewAvatar);
  previewAvatarWrap.appendChild(previewStatusDot);
  previewTopRow.appendChild(previewAvatarWrap);

  const previewBubbleHost = document.createElement('div');
  previewBubbleHost.className = 'status-preview-bubble-host';
  previewTopRow.appendChild(previewBubbleHost);
  previewCard.appendChild(previewTopRow);

  const previewIdentity = document.createElement('div');
  previewIdentity.className = 'status-preview-identity';
  const previewDisplay = document.createElement('div');
  previewDisplay.className = 'status-preview-display';
  previewDisplay.textContent = user.displayName;
  const previewUsername = document.createElement('div');
  previewUsername.className = 'status-preview-username';
  previewUsername.textContent = user.username;
  previewIdentity.appendChild(previewDisplay);
  previewIdentity.appendChild(previewUsername);
  previewCard.appendChild(previewIdentity);

  card.appendChild(previewCard);

  // Status input section
  const fieldWrap = document.createElement('div');
  fieldWrap.className = 'status-modal-field';

  const fieldLabel = document.createElement('label');
  fieldLabel.className = 'status-modal-label';
  fieldLabel.textContent = 'Status';
  fieldWrap.appendChild(fieldLabel);

  const inputBox = document.createElement('div');
  inputBox.className = 'status-modal-input-box';

  const emojiBtn = document.createElement('button');
  emojiBtn.type = 'button';
  emojiBtn.className = 'status-modal-emoji-btn';
  emojiBtn.title = 'Pick an emoji (1 max at start)';
  emojiBtn.setAttribute('aria-label', 'Pick leading emoji');

  const textInput = document.createElement('input');
  textInput.type = 'text';
  textInput.className = 'status-modal-input';
  textInput.maxLength = 128;
  textInput.value = draftText;
  textInput.placeholder = promptText;
  textInput.setAttribute('aria-label', 'Status message');
  fieldLabel.htmlFor = 'custom-status-input';
  textInput.id = 'custom-status-input';

  const clearInputBtn = document.createElement('button');
  clearInputBtn.type = 'button';
  clearInputBtn.className = 'status-modal-clear-btn';
  clearInputBtn.title = 'Clear text and emoji';
  clearInputBtn.setAttribute('aria-label', 'Clear status text and emoji');
  clearInputBtn.appendChild(createCloseIconSvg(14));

  inputBox.appendChild(emojiBtn);
  inputBox.appendChild(textInput);
  inputBox.appendChild(clearInputBtn);
  fieldWrap.appendChild(inputBox);
  card.appendChild(fieldWrap);

  const errorSlot = document.createElement('div');
  errorSlot.className = 'status-modal-error-slot';
  card.appendChild(errorSlot);

  // Footer with Clear After dropdown + Save button
  const footer = document.createElement('div');
  footer.className = 'status-modal-footer';

  const clearSelectBtn = document.createElement('button');
  clearSelectBtn.type = 'button';
  clearSelectBtn.className = 'status-clear-select-btn';
  clearSelectBtn.setAttribute('aria-haspopup', 'listbox');
  clearSelectBtn.setAttribute('aria-expanded', 'false');

  const clearSelectText = document.createElement('span');
  clearSelectText.className = 'status-clear-select-text';
  clearSelectBtn.appendChild(clearSelectText);

  const chevron = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  chevron.setAttribute('viewBox', '0 0 24 24');
  chevron.setAttribute('width', '14');
  chevron.setAttribute('height', '14');
  chevron.setAttribute('fill', 'none');
  chevron.setAttribute('stroke', 'currentColor');
  chevron.setAttribute('stroke-width', '2.2');
  chevron.setAttribute('stroke-linecap', 'round');
  chevron.setAttribute('stroke-linejoin', 'round');
  chevron.setAttribute('aria-hidden', 'true');
  const chevPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  chevPath.setAttribute('d', 'M6 9l6 6 6-6');
  chevron.appendChild(chevPath);
  clearSelectBtn.appendChild(chevron);

  const saveBtn = document.createElement('button');
  saveBtn.type = 'submit';
  saveBtn.className = 'btn-primary status-modal-save-btn';
  saveBtn.textContent = 'Save';

  footer.appendChild(clearSelectBtn);
  footer.appendChild(saveBtn);
  card.appendChild(footer);

  backdrop.appendChild(card);
  document.body.appendChild(backdrop);

  const syncPreviewAndControls = () => {
    const trimmed = draftText.trim();
    const previewProfile = {
      customStatus:
        trimmed || draftEmoji
          ? { text: trimmed, emoji: draftEmoji, expiresAt: null }
          : null,
    };

    const bubble = createThoughtBubbleElement({
      profile: previewProfile,
      previewEmptyPlaceholder: promptText,
    });
    previewBubbleHost.replaceChildren();
    if (bubble) {
      previewBubbleHost.appendChild(bubble);
    }

    emojiBtn.replaceChildren();
    if (draftEmoji) {
      const charSpan = document.createElement('span');
      charSpan.className = 'status-modal-emoji-char';
      setTwemojiText(charSpan, draftEmoji);
      emojiBtn.appendChild(charSpan);
    } else {
      emojiBtn.appendChild(createEmojiIconSvg(19));
    }

    clearInputBtn.hidden = !draftEmoji && draftText.length === 0;

    const currentOpt = CLEAR_OPTIONS.find((o) => o.id === clearChoice) ?? CLEAR_OPTIONS[0];
    clearSelectText.textContent = currentOpt.formatTriggerText(openedAt);
  };

  const closeClearMenu = () => {
    if (clearMenuEl) {
      clearMenuEl.remove();
      clearMenuEl = null;
      clearSelectBtn.setAttribute('aria-expanded', 'false');
    }
    window.removeEventListener('pointerdown', onOutsideMenuClick);
  };

  const onOutsideMenuClick = (e: PointerEvent) => {
    const target = e.target as Node | null;
    if (!target) {
      return;
    }
    if (clearMenuEl?.contains(target) || clearSelectBtn.contains(target)) {
      return;
    }
    closeClearMenu();
  };

  const toggleClearMenu = () => {
    if (clearMenuEl) {
      closeClearMenu();
      return;
    }
    const menu = document.createElement('div');
    menu.className = 'status-clear-menu';
    menu.setAttribute('role', 'listbox');

    const menuHeader = document.createElement('div');
    menuHeader.className = 'status-clear-menu-title';
    menuHeader.textContent = 'Clear After';
    menu.appendChild(menuHeader);

    const now = Date.now();
    for (const opt of CLEAR_OPTIONS) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'status-clear-option';
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', String(opt.id === clearChoice));
      if (opt.id === clearChoice) {
        item.classList.add('status-clear-option--active');
      }

      const nameSpan = document.createElement('span');
      nameSpan.className = 'status-clear-option-label';
      nameSpan.textContent = opt.label;
      item.appendChild(nameSpan);

      const hintSpan = document.createElement('span');
      hintSpan.className = 'status-clear-option-hint';
      hintSpan.textContent = opt.formatMenuHint(now);
      item.appendChild(hintSpan);

      item.addEventListener('click', () => {
        clearChoice = opt.id;
        closeClearMenu();
        syncPreviewAndControls();
      });

      menu.appendChild(item);
    }

    document.body.appendChild(menu);
    clearMenuEl = menu;
    clearSelectBtn.setAttribute('aria-expanded', 'true');

    const anchorRect = clearSelectBtn.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const left = Math.min(anchorRect.left, window.innerWidth - menuRect.width - 10);
    let top = anchorRect.top - menuRect.height - 6;
    if (top < 10) {
      top = Math.min(anchorRect.bottom + 6, window.innerHeight - menuRect.height - 10);
    }
    menu.style.left = `${Math.max(10, left)}px`;
    menu.style.top = `${Math.max(10, top)}px`;

    window.setTimeout(() => {
      if (!closed && clearMenuEl === menu) {
        window.addEventListener('pointerdown', onOutsideMenuClick);
      }
    }, 0);
  };

  const cleanup = () => {
    if (closed) {
      return;
    }
    closed = true;
    closeClearMenu();
    window.dispatchEvent(new CustomEvent('redshift:close-emoji-picker'));
    document.removeEventListener('keydown', onEscape, true);
    backdrop.classList.remove('modal-backdrop--visible');
    window.setTimeout(() => backdrop.remove(), 170);
  };

  const onEscape = (e: KeyboardEvent) => {
    if (!isTopmostModal(backdrop)) {
      return;
    }
    if (e.key === 'Escape') {
      if (document.querySelector('.emoji-picker-square')) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('redshift:close-emoji-picker'));
        return;
      }
      if (clearMenuEl) {
        e.preventDefault();
        closeClearMenu();
        return;
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      cleanup();
      return;
    }
    if (!clearMenuEl && isModalConfirmShortcut(e, backdrop, { allowCtrlS: true }) && !saveBtn.disabled) {
      e.preventDefault();
      e.stopImmediatePropagation();
      card.requestSubmit();
    }
  };

  closeBtn.addEventListener('click', cleanup);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) {
      cleanup();
    }
  });
  document.addEventListener('keydown', onEscape, true);

  emojiBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeClearMenu();
    void import('./emojiPicker').then(({ openEmojiPicker }) => {
      openEmojiPicker({
        anchorEl: emojiBtn,
        onSelect: (emoji) => {
          draftEmoji = emoji;
          syncPreviewAndControls();
          textInput.focus();
        },
      });
    });
  });

  textInput.addEventListener('input', () => {
    replaceEmojiShortcodeBeforeCursor(textInput);
    draftText = textInput.value;
    errorSlot.replaceChildren();
    syncPreviewAndControls();
  });

  textInput.addEventListener('keydown', (e) => {
    if (
      e.key === 'Backspace' &&
      draftEmoji &&
      textInput.selectionStart === 0 &&
      textInput.selectionEnd === 0
    ) {
      e.preventDefault();
      draftEmoji = undefined;
      syncPreviewAndControls();
    }
  });

  clearInputBtn.addEventListener('click', () => {
    draftEmoji = undefined;
    draftText = '';
    textInput.value = '';
    errorSlot.replaceChildren();
    syncPreviewAndControls();
    textInput.focus();
  });

  clearSelectBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('redshift:close-emoji-picker'));
    toggleClearMenu();
  });

  card.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (isSaving) {
      return;
    }
    isSaving = true;
    errorSlot.replaceChildren();

    const opt = CLEAR_OPTIONS.find((o) => o.id === clearChoice) ?? CLEAR_OPTIONS[0];
    const expiresAt = opt.computeExpiresAt(Date.now());
    const trimmed = draftText.trim();
    const isClear = !trimmed && !draftEmoji;

    const optimisticCustomStatus: CustomStatusData | null = isClear
      ? null
      : {
          text: trimmed,
          emoji: draftEmoji,
          expiresAt,
        };

    // Apply instantaneously across the dock, profile card, and group chat sidebars before closing.
    if (options.onOptimisticCustomStatus) {
      options.onOptimisticCustomStatus(optimisticCustomStatus);
      cleanup();
      const res = isClear
        ? await apiUpdateCustomStatus({ clear: true })
        : await apiUpdateCustomStatus({
            text: trimmed,
            emoji: draftEmoji ?? null,
            expiresAt,
          });
      if (res.ok && res.snapshot) {
        options.onSnapshotUpdated(res.snapshot);
      }
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    const res = isClear
      ? await apiUpdateCustomStatus({ clear: true })
      : await apiUpdateCustomStatus({
          text: trimmed,
          emoji: draftEmoji ?? null,
          expiresAt,
        });

    isSaving = false;
    if (!res.ok || !res.snapshot) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save';
      const errBanner = document.createElement('div');
      errBanner.className = 'feedback-banner feedback-banner--error';
      errBanner.textContent = res.error ?? 'Error: Could not save custom status';
      errorSlot.replaceChildren(errBanner);
      return;
    }

    options.onSnapshotUpdated(res.snapshot);
    cleanup();
  });

  syncPreviewAndControls();
  requestAnimationFrame(() => {
    backdrop.classList.add('modal-backdrop--visible');
    textInput.focus();
    const len = textInput.value.length;
    textInput.setSelectionRange(len, len);
  });
}
