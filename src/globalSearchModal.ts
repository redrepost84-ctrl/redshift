import { apiSearchGlobalMessages } from './apiClient';
import { createCloseIconSvg } from './chatUi';
import { setTwemojiText } from './twemojiHelper';
import type { GlobalSearchResultItem } from './types';
import { createSearchIconSvg } from './voiceAudio';

export interface GlobalSearchModalOptions {
  resolveAvatar: (profile: { avatarPreset: number | null; avatarDataUrl?: string }) => string;
  formatTime: (ts: number) => string;
  onSelectResult: (item: GlobalSearchResultItem) => void;
  onClose?: () => void;
}

/**
 * Opens a Discord-style modal searching across all DM and Group DM history on the server.
 */
export function openGlobalSearchModal(options: GlobalSearchModalOptions): () => void {
  let closed = false;
  let searchSeq = 0;
  let debounceTimer: number | null = null;
  let selectedIdx = 0;
  let results: GlobalSearchResultItem[] = [];

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop modal-backdrop--deep';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-label', 'Global Message Search');

  const card = document.createElement('div');
  card.className = 'quick-switcher-card global-search-card';

  const inputRow = document.createElement('div');
  inputRow.className = 'quick-switcher-input-row';
  const iconWrap = document.createElement('span');
  iconWrap.className = 'quick-switcher-search-icon';
  iconWrap.appendChild(createSearchIconSvg(18));

  const input = document.createElement('input');
  input.type = 'search';
  input.className = 'quick-switcher-input';
  input.placeholder = 'Search all messages (supports from:user, has:image, has:link, has:voice)';
  input.setAttribute('aria-label', 'Search messages across all conversations');

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'modal-close-icon-btn';
  closeBtn.setAttribute('aria-label', 'Close global search');
  closeBtn.appendChild(createCloseIconSvg(15));

  inputRow.appendChild(iconWrap);
  inputRow.appendChild(input);
  inputRow.appendChild(closeBtn);
  card.appendChild(inputRow);

  const chipRow = document.createElement('div');
  chipRow.className = 'dm-search-chips global-search-chips';
  for (const tok of ['from:', 'has:image', 'has:gif', 'has:voice', 'has:link', 'has:pin']) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'dm-search-chip';
    chip.textContent = tok;
    chip.addEventListener('click', () => {
      const val = input.value;
      const prefix = val && !/\s$/.test(val) ? `${val} ` : val;
      input.value = `${prefix}${tok}`;
      input.focus();
      scheduleSearch(true);
    });
    chipRow.appendChild(chip);
  }
  card.appendChild(chipRow);

  const statusBar = document.createElement('div');
  statusBar.className = 'dm-search-count global-search-status';
  statusBar.textContent = 'Type to search messages across all DMs and Group Chats';
  card.appendChild(statusBar);

  const listEl = document.createElement('div');
  listEl.className = 'quick-switcher-list global-search-list';
  card.appendChild(listEl);

  const footer = document.createElement('div');
  footer.className = 'quick-switcher-footer';
  footer.textContent = '↑ ↓ to navigate • Enter or Click to jump directly to message • Esc to close';
  card.appendChild(footer);

  backdrop.appendChild(card);
  document.body.appendChild(backdrop);

  const renderResults = () => {
    listEl.replaceChildren();
    const q = input.value.trim();
    if (!q) {
      statusBar.textContent = 'Type to search messages across all DMs and Group Chats';
      return;
    }
    statusBar.textContent =
      results.length === 0
        ? 'No messages matched across your conversations'
        : `${results.length}${results.length === 50 ? '+' : ''} matching message${results.length === 1 ? '' : 's'}`;

    results.forEach((item, idx) => {
      const msg = item.message;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className =
        idx === selectedIdx
          ? 'dm-search-result-card global-search-result--active'
          : 'dm-search-result-card';

      const head = document.createElement('div');
      head.className = 'dm-search-result-head';

      const av = document.createElement('img');
      av.className = 'dm-search-result-avatar';
      av.src = options.resolveAvatar({
        avatarPreset: msg.authorAvatarPreset,
        avatarDataUrl: msg.authorAvatarDataUrl,
      });
      av.alt = msg.authorName;
      head.appendChild(av);

      const authorSpan = document.createElement('span');
      authorSpan.className = 'dm-search-result-author';
      authorSpan.textContent = msg.authorName;
      head.appendChild(authorSpan);

      const ctxPill = document.createElement('span');
      ctxPill.className = 'global-search-thread-pill';
      ctxPill.textContent =
        item.kind === 'group'
          ? `in ${item.groupName || 'Group Chat'}`
          : `in @${item.peerDisplayName || item.peerUsername || 'DM'}`;
      head.appendChild(ctxPill);

      const timeSpan = document.createElement('span');
      timeSpan.className = 'dm-search-result-time';
      timeSpan.textContent = options.formatTime(msg.timestamp);
      head.appendChild(timeSpan);
      btn.appendChild(head);

      const snippet = document.createElement('div');
      snippet.className = 'dm-search-result-snippet';
      const fallback = msg.gif
        ? `[GIF: ${msg.gif.title || 'GIF'}]`
        : msg.voiceNote
          ? `[Voice message ${Math.max(1, Math.round(msg.voiceNote.durationSec))}s]`
          : msg.attachments?.length
            ? `[${msg.attachments.length} attachment${msg.attachments.length === 1 ? '' : 's'}]`
            : '';
      const bodyText = msg.content.trim() || fallback;
      setTwemojiText(snippet, bodyText.length > 180 ? `${bodyText.slice(0, 177)}...` : bodyText);
      btn.appendChild(snippet);

      btn.addEventListener('mouseenter', () => {
        selectedIdx = idx;
        Array.from(listEl.children).forEach((el, cIdx) => {
          el.classList.toggle('global-search-result--active', cIdx === selectedIdx);
        });
      });
      btn.addEventListener('click', () => {
        close();
        options.onSelectResult(item);
      });

      listEl.appendChild(btn);
    });
  };

  const runSearch = async () => {
    const seq = ++searchSeq;
    const q = input.value.trim();
    if (!q) {
      results = [];
      selectedIdx = 0;
      renderResults();
      return;
    }
    statusBar.textContent = 'Searching conversations...';
    const res = await apiSearchGlobalMessages(q);
    if (closed || seq !== searchSeq) {
      return;
    }
    results = res.results;
    selectedIdx = 0;
    renderResults();
  };

  const scheduleSearch = (immediate = false) => {
    if (debounceTimer !== null) {
      window.clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (immediate) {
      void runSearch();
      return;
    }
    debounceTimer = window.setTimeout(() => {
      debounceTimer = null;
      void runSearch();
    }, 180);
  };

  const close = () => {
    if (closed) {
      return;
    }
    closed = true;
    if (debounceTimer !== null) {
      window.clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    window.removeEventListener('keydown', onKeyDown, true);
    backdrop.classList.remove('modal-backdrop--visible');
    window.setTimeout(() => backdrop.remove(), 150);
    options.onClose?.();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      close();
    } else if (e.key === 'ArrowDown' && results.length > 0) {
      e.preventDefault();
      selectedIdx = (selectedIdx + 1) % results.length;
      renderResults();
      listEl.querySelector('.global-search-result--active')?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp' && results.length > 0) {
      e.preventDefault();
      selectedIdx = (selectedIdx - 1 + results.length) % results.length;
      renderResults();
      listEl.querySelector('.global-search-result--active')?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && !e.isComposing && results[selectedIdx]) {
      e.preventDefault();
      const chosen = results[selectedIdx];
      close();
      options.onSelectResult(chosen);
    }
  };

  input.addEventListener('input', () => scheduleSearch(false));
  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) {
      close();
    }
  });
  window.addEventListener('keydown', onKeyDown, true);

  requestAnimationFrame(() => {
    if (!closed) {
      backdrop.classList.add('modal-backdrop--visible');
      input.focus();
    }
  });
  return close;
}
