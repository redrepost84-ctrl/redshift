import { createCloseIconSvg } from './chatUi';
import { setDisplayNameWithRoleBadge } from './profileBadges';
import { setTwemojiText } from './twemojiHelper';
import type { ChatMessage } from './types';
import { createSearchIconSvg } from './voiceAudio';

export interface DmSearchPopoverOptions {
  anchorEl: HTMLElement;
  threadTitle: string;
  getMessages: () => ChatMessage[];
  resolveAvatar: (profile: { avatarPreset: number | null; avatarDataUrl?: string }) => string;
  formatTime: (ts: number) => string;
  onJumpToMessage: (messageId: string) => void;
  onClose?: () => void;
}

interface ParsedSearchQuery {
  fromFilters: string[];
  hasFilters: string[];
  textTerms: string[];
}

let activeSearchCleanup: (() => void) | null = null;
let activeSearchAnchor: HTMLElement | null = null;

export function closeActiveSearchPopover(): void {
  activeSearchCleanup?.();
}

export function isSearchPopoverOpenFor(anchorEl: HTMLElement): boolean {
  return Boolean(activeSearchCleanup && activeSearchAnchor === anchorEl);
}

function parseSearchQuery(raw: string): ParsedSearchQuery {
  const tokens = raw.trim().split(/\s+/).filter(Boolean);
  const fromFilters: string[] = [];
  const hasFilters: string[] = [];
  const textTerms: string[] = [];

  for (const tok of tokens) {
    const lower = tok.toLowerCase();
    if (lower.startsWith('from:') && lower.length > 5) {
      fromFilters.push(lower.slice(5).replace(/^@/, ''));
    } else if (lower.startsWith('has:') && lower.length > 4) {
      hasFilters.push(lower.slice(4));
    } else {
      textTerms.push(lower);
    }
  }
  return { fromFilters, hasFilters, textTerms };
}

function matchesHasFilter(msg: ChatMessage, token: string): boolean {
  const atts = msg.attachments ?? [];
  const legacyImgs = msg.imageDataUrls?.length ?? (msg.imageDataUrl ? 1 : 0);
  switch (token) {
    case 'image':
    case 'images':
    case 'img':
      return legacyImgs > 0 || atts.some((a) => a.kind === 'image');
    case 'video':
    case 'videos':
      return atts.some((a) => a.kind === 'video');
    case 'audio':
    case 'voice':
      return Boolean(msg.voiceNote) || atts.some((a) => a.kind === 'audio');
    case 'file':
    case 'files':
    case 'attachment':
      return atts.length > 0 || legacyImgs > 0;
    case 'gif':
    case 'gifs':
      return Boolean(msg.gif) || atts.some((a) => a.mime === 'image/gif');
    case 'pin':
    case 'pinned':
      return Boolean(msg.pinned);
    case 'link':
    case 'url':
      return /https?:\/\/\S+/i.test(msg.content);
    case 'call':
      return Boolean(msg.callLog);
    default:
      return true;
  }
}

function describeNonTextMessage(msg: ChatMessage): string {
  if (msg.callLog) {
    return msg.callLog.status === 'missed'
      ? 'Missed call'
      : msg.callLog.status === 'ended'
        ? 'Voice call ended'
        : 'Voice call';
  }
  if (msg.voiceNote) {
    return `Voice message (${Math.max(1, Math.round(msg.voiceNote.durationSec))}s)`;
  }
  if (msg.gif) {
    return `[GIF: ${msg.gif.title || 'GIF'}]`;
  }
  const attCount =
    (msg.attachments?.length ?? 0) + (msg.imageDataUrls?.length ?? (msg.imageDataUrl ? 1 : 0));
  if (attCount > 0) {
    return `[${attCount} attachment${attCount === 1 ? '' : 's'}]`;
  }
  return '';
}

function filterMessages(messages: ChatMessage[], parsed: ParsedSearchQuery): ChatMessage[] {
  const results: ChatMessage[] = [];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (msg.isPending) {
      continue;
    }
    const authorUser = msg.authorUsername.toLowerCase();
    const authorDisplay = msg.authorName.toLowerCase();
    if (
      parsed.fromFilters.length > 0 &&
      !parsed.fromFilters.every((f) => authorUser.includes(f) || authorDisplay.includes(f))
    ) {
      continue;
    }
    if (parsed.hasFilters.length > 0 && !parsed.hasFilters.every((h) => matchesHasFilter(msg, h))) {
      continue;
    }
    if (parsed.textTerms.length > 0) {
      const hay = [
        msg.content,
        msg.gif?.title ?? '',
        ...(msg.attachments ?? []).map((a) => a.name),
      ]
        .join(' ')
        .toLowerCase();
      if (!parsed.textTerms.every((t) => hay.includes(t))) {
        continue;
      }
    }
    results.push(msg);
    if (results.length >= 60) {
      break;
    }
  }
  return results;
}

export function openDmSearchPopover(options: DmSearchPopoverOptions): () => void {
  closeActiveSearchPopover();

  const popover = document.createElement('div');
  popover.className = 'dm-search-popover';
  popover.setAttribute('role', 'dialog');
  popover.setAttribute('aria-label', `Search messages in ${options.threadTitle}`);

  const head = document.createElement('div');
  head.className = 'dm-search-head';

  const inputWrap = document.createElement('div');
  inputWrap.className = 'dm-search-input-wrap';
  const iconSpan = document.createElement('span');
  iconSpan.className = 'dm-search-icon';
  iconSpan.appendChild(createSearchIconSvg(15));
  const input = document.createElement('input');
  input.type = 'search';
  input.className = 'dm-search-input';
  input.placeholder = `Search in ${options.threadTitle}...`;
  input.setAttribute('aria-label', 'Search conversation messages');

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'dm-search-clear-btn';
  clearBtn.title = 'Clear search';
  clearBtn.hidden = true;
  clearBtn.appendChild(createCloseIconSvg(12));

  inputWrap.appendChild(iconSpan);
  inputWrap.appendChild(input);
  inputWrap.appendChild(clearBtn);
  head.appendChild(inputWrap);

  const chipRow = document.createElement('div');
  chipRow.className = 'dm-search-chips';
  const filterTokens = ['from:', 'has:image', 'has:video', 'has:voice', 'has:file', 'has:gif', 'has:pin', 'has:link'];
  for (const tok of filterTokens) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'dm-search-chip';
    chip.textContent = tok;
    chip.addEventListener('click', () => {
      const val = input.value;
      const prefix = val && !/\s$/.test(val) ? `${val} ` : val;
      input.value = `${prefix}${tok}`;
      input.focus();
      renderResults();
    });
    chipRow.appendChild(chip);
  }
  head.appendChild(chipRow);
  popover.appendChild(head);

  const countBar = document.createElement('div');
  countBar.className = 'dm-search-count';
  popover.appendChild(countBar);

  const scroll = document.createElement('div');
  scroll.className = 'dm-search-scroll';
  popover.appendChild(scroll);

  document.body.appendChild(popover);

  const positionPopover = () => {
    const rect = options.anchorEl.getBoundingClientRect();
    const width = Math.min(410, window.innerWidth - 20);
    popover.style.width = `${width}px`;
    const left = Math.min(Math.max(10, rect.right - width), window.innerWidth - width - 10);
    const top = Math.min(rect.bottom + 8, window.innerHeight - 160);
    popover.style.left = `${Math.round(left)}px`;
    popover.style.top = `${Math.round(top)}px`;
  };

  const renderResults = () => {
    scroll.replaceChildren();
    const raw = input.value;
    clearBtn.hidden = raw.length === 0;
    const trimmed = raw.trim();
    const allMsgs = options.getMessages();

    if (!trimmed) {
      countBar.textContent = `${allMsgs.length} messages in conversation`;
      const hint = document.createElement('div');
      hint.className = 'dm-search-empty';
      hint.textContent = 'Type keywords or click a filter chip like from:user or has:image.';
      scroll.appendChild(hint);
      return;
    }

    const parsed = parseSearchQuery(trimmed);
    const matches = filterMessages(allMsgs, parsed);
    countBar.textContent =
      matches.length === 0
        ? 'No matching messages'
        : matches.length === 60
          ? 'Showing latest 60 matching messages'
          : `${matches.length} matching message${matches.length === 1 ? '' : 's'}`;

    if (matches.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'dm-search-empty';
      empty.textContent = 'Try a different keyword or filter token.';
      scroll.appendChild(empty);
      return;
    }

    for (const msg of matches) {
      const card = document.createElement('div');
      card.className = 'pinned-item-card dm-search-result-card';
      card.tabIndex = 0;
      card.setAttribute('role', 'button');

      const topRow = document.createElement('div');
      topRow.className = 'pinned-item-top';

      const avatar = document.createElement('img');
      avatar.className = 'pinned-item-avatar';
      avatar.src = options.resolveAvatar({
        avatarPreset: msg.authorAvatarPreset,
        avatarDataUrl: msg.authorAvatarDataUrl,
      });
      avatar.alt = `${msg.authorName} avatar`;
      topRow.appendChild(avatar);

      const meta = document.createElement('div');
      meta.className = 'pinned-item-meta';
      const authorEl = document.createElement('span');
      authorEl.className = 'pinned-item-author';
      setDisplayNameWithRoleBadge(
        authorEl,
        msg.authorName,
        { username: msg.authorUsername, role: msg.authorRole },
        { badgeSize: 12 },
      );
      const timeEl = document.createElement('span');
      timeEl.className = 'pinned-item-time';
      timeEl.textContent = options.formatTime(msg.timestamp);
      meta.appendChild(authorEl);
      meta.appendChild(timeEl);
      topRow.appendChild(meta);

      const jumpHint = document.createElement('span');
      jumpHint.className = 'pinned-item-jump';
      jumpHint.textContent = 'Jump';
      topRow.appendChild(jumpHint);

      card.appendChild(topRow);

      const snippet = document.createElement('div');
      snippet.className = 'pinned-item-content';
      const textBody = msg.content.trim();
      if (textBody) {
        setTwemojiText(snippet, textBody);
      } else {
        snippet.classList.add('pinned-item-content--muted');
        snippet.textContent = describeNonTextMessage(msg) || 'Message';
      }
      card.appendChild(snippet);

      const activate = () => {
        options.onJumpToMessage(msg.id);
        cleanup();
      };
      card.addEventListener('click', activate);
      card.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          activate();
        }
      });

      scroll.appendChild(card);
    }
  };

  input.addEventListener('input', renderResults);
  clearBtn.addEventListener('click', () => {
    input.value = '';
    input.focus();
    renderResults();
  });

  positionPopover();
  renderResults();
  requestAnimationFrame(() => input.focus());

  let closed = false;
  const onPointerDown = (e: Event) => {
    const t = e.target as Node | null;
    if (t && (popover.contains(t) || options.anchorEl.contains(t))) {
      return;
    }
    cleanup();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      cleanup();
    }
  };
  const cleanup = () => {
    if (closed) {
      return;
    }
    closed = true;
    window.removeEventListener('pointerdown', onPointerDown, true);
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('resize', positionPopover);
    popover.remove();
    if (activeSearchCleanup === cleanup) {
      activeSearchCleanup = null;
      activeSearchAnchor = null;
    }
    options.onClose?.();
  };

  activeSearchCleanup = cleanup;
  activeSearchAnchor = options.anchorEl;
  window.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('resize', positionPopover);
  return cleanup;
}
