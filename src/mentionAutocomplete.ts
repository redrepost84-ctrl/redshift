import type { PublicProfile } from './types';

export interface MentionAutocompleteOptions {
  inputEl: HTMLTextAreaElement;
  anchorContainer: HTMLElement;
  getCandidates: () => PublicProfile[];
  resolveAvatar: (profile: { avatarPreset: number | null; avatarDataUrl?: string }) => string;
  onApplied?: () => void;
}

export interface MentionAutocompleteHandle {
  isOpen: () => boolean;
  dismiss: () => void;
  destroy: () => void;
}

interface ActiveMentionMatch {
  query: string;
  atIndex: number;
  cursorIndex: number;
  items: PublicProfile[];
}

const MENTION_TRIGGER_REGEX = /(?:^|\s)(@([a-zA-Z0-9_.-]{0,32}))$/;

/** Attaches Discord-style @username autocomplete to a DM or inline edit textarea. */
export function attachMentionAutocomplete(
  options: MentionAutocompleteOptions,
): MentionAutocompleteHandle {
  const { inputEl, anchorContainer } = options;
  let activeMatch: ActiveMentionMatch | null = null;
  let selectedIndex = 0;
  let blurTimerId: number | null = null;

  const panel = document.createElement('div');
  panel.className = 'emoji-autocomplete-panel mention-autocomplete-panel';
  panel.setAttribute('role', 'listbox');
  panel.setAttribute('aria-label', 'Mention suggestions');
  panel.hidden = true;

  const header = document.createElement('div');
  header.className = 'emoji-autocomplete-header';
  panel.appendChild(header);

  const listEl = document.createElement('div');
  listEl.className = 'emoji-autocomplete-list';
  panel.appendChild(listEl);

  anchorContainer.appendChild(panel);

  const dismiss = () => {
    activeMatch = null;
    selectedIndex = 0;
    panel.hidden = true;
    listEl.replaceChildren();
  };

  const applySelection = (profile: PublicProfile) => {
    if (!activeMatch) {
      return;
    }
    const { atIndex, cursorIndex } = activeMatch;
    const before = inputEl.value.slice(0, atIndex);
    const after = inputEl.value.slice(cursorIndex);
    const trailingSpace = after.startsWith(' ') ? '' : ' ';
    const insertText = `@${profile.username}${trailingSpace}`;
    inputEl.value = before + insertText + after;
    const nextPos = before.length + insertText.length;
    inputEl.setSelectionRange(nextPos, nextPos);
    dismiss();
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    options.onApplied?.();
    inputEl.focus();
  };

  const updateRowHighlights = (scrollIntoView = true) => {
    const rows = Array.from(listEl.children);
    rows.forEach((node, idx) => {
      const isSelected = idx === selectedIndex;
      node.classList.toggle('emoji-autocomplete-item--active', isSelected);
      node.setAttribute('aria-selected', String(isSelected));
      if (isSelected && scrollIntoView && node instanceof HTMLElement) {
        node.scrollIntoView({ block: 'nearest' });
      }
    });
  };

  const renderPanel = () => {
    if (!activeMatch || activeMatch.items.length === 0) {
      dismiss();
      return;
    }

    panel.hidden = false;
    header.replaceChildren(
      document.createTextNode('Mention '),
      (() => {
        const strong = document.createElement('strong');
        strong.textContent = `@${activeMatch.query}`;
        return strong;
      })(),
    );

    listEl.replaceChildren();
    activeMatch.items.forEach((profile, index) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'emoji-autocomplete-item mention-autocomplete-item';
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(index === selectedIndex));
      if (index === selectedIndex) {
        row.classList.add('emoji-autocomplete-item--active');
      }

      const av = document.createElement('img');
      av.className = 'mention-autocomplete-avatar';
      av.src = options.resolveAvatar(profile);
      av.alt = profile.displayName;
      row.appendChild(av);

      const displayEl = document.createElement('span');
      displayEl.className = 'mention-autocomplete-display';
      displayEl.textContent = profile.displayName;
      row.appendChild(displayEl);

      const handleEl = document.createElement('span');
      handleEl.className = 'mention-autocomplete-handle';
      handleEl.textContent = `@${profile.username}`;
      row.appendChild(handleEl);

      row.addEventListener('pointerenter', () => {
        if (selectedIndex !== index) {
          selectedIndex = index;
          updateRowHighlights(false);
        }
      });
      row.addEventListener('mousedown', (e) => {
        e.preventDefault();
        applySelection(profile);
      });

      listEl.appendChild(row);
    });
  };

  const evaluate = () => {
    const start = inputEl.selectionStart;
    const end = inputEl.selectionEnd;
    if (start === null || end === null || start !== end) {
      dismiss();
      return;
    }

    const before = inputEl.value.slice(0, start);
    const match = MENTION_TRIGGER_REGEX.exec(before);
    if (!match) {
      dismiss();
      return;
    }

    const token = match[1];
    const query = match[2].toLowerCase();
    const candidates = options.getCandidates();
    const items = candidates
      .filter(
        (p) =>
          !query ||
          p.username.toLowerCase().includes(query) ||
          p.displayName.toLowerCase().includes(query),
      )
      .slice(0, 12);
    if (items.length === 0) {
      dismiss();
      return;
    }

    const atIndex = start - token.length;
    const sameQuery =
      activeMatch &&
      activeMatch.atIndex === atIndex &&
      activeMatch.query === query;

    activeMatch = {
      query,
      atIndex,
      cursorIndex: start,
      items,
    };

    if (!sameQuery || selectedIndex >= items.length) {
      selectedIndex = 0;
    }
    renderPanel();
  };

  const onInput = () => evaluate();
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      evaluate();
    }
  };
  const onClick = () => evaluate();

  const onKeyDown = (e: KeyboardEvent) => {
    if (!activeMatch || panel.hidden) {
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopImmediatePropagation();
      selectedIndex = (selectedIndex + 1) % activeMatch.items.length;
      updateRowHighlights(true);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopImmediatePropagation();
      selectedIndex =
        (selectedIndex - 1 + activeMatch.items.length) % activeMatch.items.length;
      updateRowHighlights(true);
      return;
    }
    if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey && !e.isComposing)) {
      const chosen = activeMatch.items[selectedIndex];
      if (chosen) {
        e.preventDefault();
        e.stopImmediatePropagation();
        applySelection(chosen);
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      dismiss();
    }
  };

  const onBlur = () => {
    if (blurTimerId !== null) {
      window.clearTimeout(blurTimerId);
    }
    blurTimerId = window.setTimeout(() => {
      blurTimerId = null;
      dismiss();
    }, 120);
  };

  inputEl.addEventListener('input', onInput);
  inputEl.addEventListener('keyup', onKeyUp);
  inputEl.addEventListener('click', onClick);
  inputEl.addEventListener('keydown', onKeyDown, true);
  inputEl.addEventListener('blur', onBlur);

  return {
    isOpen: () => Boolean(activeMatch && !panel.hidden),
    dismiss,
    destroy: () => {
      if (blurTimerId !== null) {
        window.clearTimeout(blurTimerId);
        blurTimerId = null;
      }
      inputEl.removeEventListener('input', onInput);
      inputEl.removeEventListener('keyup', onKeyUp);
      inputEl.removeEventListener('click', onClick);
      inputEl.removeEventListener('keydown', onKeyDown, true);
      inputEl.removeEventListener('blur', onBlur);
      panel.remove();
    },
  };
}
