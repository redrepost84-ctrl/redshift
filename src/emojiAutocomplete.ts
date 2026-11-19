import { searchEmojiSuggestions, type EmojiSuggestion } from './emojiCatalog';
import { setTwemojiText } from './twemojiHelper';

export interface EmojiAutocompleteOptions {
  inputEl: HTMLTextAreaElement;
  anchorContainer: HTMLElement;
  onApplied?: () => void;
}

export interface EmojiAutocompleteHandle {
  isOpen: () => boolean;
  dismiss: () => void;
  destroy: () => void;
}

interface ActiveMatch {
  query: string;
  colonIndex: number;
  cursorIndex: number;
  items: EmojiSuggestion[];
}

const TRIGGER_REGEX = /(?:^|\s)(:([a-zA-Z0-9_+-]{2,36}))$/;

export function attachEmojiAutocomplete(
  options: EmojiAutocompleteOptions,
): EmojiAutocompleteHandle {
  const { inputEl, anchorContainer } = options;
  let activeMatch: ActiveMatch | null = null;
  let selectedIndex = 0;
  let blurTimerId: number | null = null;

  const panel = document.createElement('div');
  panel.className = 'emoji-autocomplete-panel';
  panel.setAttribute('role', 'listbox');
  panel.setAttribute('aria-label', 'Emoji suggestions');
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

  const applySelection = (item: EmojiSuggestion) => {
    if (!activeMatch) {
      return;
    }
    const { colonIndex, cursorIndex } = activeMatch;
    const before = inputEl.value.slice(0, colonIndex);
    const after = inputEl.value.slice(cursorIndex);
    const insertText = item.char;
    inputEl.value = before + insertText + after;
    const nextPos = before.length + insertText.length;
    inputEl.setSelectionRange(nextPos, nextPos);
    dismiss();
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    options.onApplied?.();
    inputEl.focus();
  };

  const renderPanel = () => {
    if (!activeMatch || activeMatch.items.length === 0) {
      dismiss();
      return;
    }

    panel.hidden = false;
    header.replaceChildren(
      document.createTextNode('Emoji matching '),
      (() => {
        const strong = document.createElement('strong');
        strong.textContent = `:${activeMatch.query}`;
        return strong;
      })(),
    );

    listEl.replaceChildren();
    activeMatch.items.forEach((item, index) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'emoji-autocomplete-item';
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(index === selectedIndex));
      if (index === selectedIndex) {
        row.classList.add('emoji-autocomplete-item--active');
      }

      const icon = document.createElement('span');
      icon.className = 'emoji-autocomplete-icon';
      setTwemojiText(icon, item.char);
      row.appendChild(icon);

      const code = document.createElement('span');
      code.className = 'emoji-autocomplete-name';
      code.textContent = `:${item.name}:`;
      row.appendChild(code);

      row.addEventListener('pointerenter', () => {
        if (selectedIndex !== index) {
          selectedIndex = index;
          updateRowHighlights(false);
        }
      });

      row.addEventListener('mousedown', (e) => {
        // Keep focus on the textarea cleanly while applying click selection.
        e.preventDefault();
        applySelection(item);
      });

      listEl.appendChild(row);
    });
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

  const evaluate = () => {
    const start = inputEl.selectionStart;
    const end = inputEl.selectionEnd;
    if (start === null || end === null || start !== end) {
      dismiss();
      return;
    }

    const before = inputEl.value.slice(0, start);
    const match = TRIGGER_REGEX.exec(before);
    if (!match) {
      dismiss();
      return;
    }

    const token = match[1];
    const query = match[2];
    const items = searchEmojiSuggestions(query, 24);
    if (items.length === 0) {
      dismiss();
      return;
    }

    const colonIndex = start - token.length;
    const sameQuery =
      activeMatch &&
      activeMatch.colonIndex === colonIndex &&
      activeMatch.query === query;

    activeMatch = {
      query,
      colonIndex,
      cursorIndex: start,
      items,
    };

    if (!sameQuery) {
      selectedIndex = 0;
    } else if (selectedIndex >= items.length) {
      selectedIndex = 0;
    }

    renderPanel();
  };

  const onInput = () => {
    evaluate();
  };

  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      evaluate();
    }
  };

  const onClick = () => {
    evaluate();
  };

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
