import { ALL_EMOJIS, EMOJI_CATEGORIES, type EmojiEntry } from './emojiCatalog';
import { setTwemojiText } from './twemojiHelper';

if (typeof window !== 'undefined') {
  window.addEventListener('redshift:close-emoji-picker', () => {
    closeActiveEmojiPicker();
  });
}

interface EmojiPickerOptions {
  anchorEl: HTMLElement;
  onSelect: (emoji: string) => void;
  onSwitchToGif?: () => void;
  onClose?: () => void;
}

let activePickerClose: (() => void) | null = null;
let activePickerAnchor: HTMLElement | null = null;

export function closeActiveEmojiPicker(): void {
  if (activePickerClose) {
    activePickerClose();
  }
}

export function isEmojiPickerOpenFor(anchorEl: HTMLElement): boolean {
  return Boolean(activePickerClose && activePickerAnchor === anchorEl);
}

export function openEmojiPicker(options: EmojiPickerOptions): () => void {
  window.dispatchEvent(new CustomEvent('redshift:close-gif-picker'));
  closeActiveEmojiPicker();

  let closed = false;
  let searchQuery = '';

  const panel = document.createElement('div');
  panel.className = 'emoji-picker-square';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Emoji picker');

  if (options.onSwitchToGif) {
    const tabsRow = document.createElement('div');
    tabsRow.className = 'picker-tabs-row';

    const gifTab = document.createElement('button');
    gifTab.type = 'button';
    gifTab.className = 'picker-tab';
    gifTab.textContent = 'GIFs';
    gifTab.addEventListener('click', () => {
      close();
      options.onSwitchToGif?.();
    });

    const emojiTab = document.createElement('button');
    emojiTab.type = 'button';
    emojiTab.className = 'picker-tab picker-tab--active';
    emojiTab.textContent = 'Emoji';

    tabsRow.appendChild(gifTab);
    tabsRow.appendChild(emojiTab);
    panel.appendChild(tabsRow);
  }

  const header = document.createElement('div');
  header.className = 'emoji-picker-header';

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'emoji-picker-search';
  searchInput.placeholder = 'Search emojis';
  searchInput.setAttribute('aria-label', 'Search emojis');
  header.appendChild(searchInput);
  panel.appendChild(header);

  const scrollBody = document.createElement('div');
  scrollBody.className = 'emoji-picker-scroll';
  panel.appendChild(scrollBody);

  const footer = document.createElement('div');
  footer.className = 'emoji-picker-footer';
  const footerPreview = document.createElement('span');
  footerPreview.className = 'emoji-picker-footer-char';
  setTwemojiText(footerPreview, '😀');
  const footerName = document.createElement('span');
  footerName.className = 'emoji-picker-footer-name';
  footerName.textContent = ':grinning:';
  footer.appendChild(footerPreview);
  footer.appendChild(footerName);
  panel.appendChild(footer);

  const setHoveredEmoji = (entry: EmojiEntry) => {
    setTwemojiText(footerPreview, entry.char);
    footerName.textContent = `:${entry.name}:`;
  };

  const createEmojiButton = (entry: EmojiEntry): HTMLButtonElement => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'emoji-cell-btn';
    setTwemojiText(btn, entry.char);
    btn.title = `:${entry.name}:`;
    btn.setAttribute('aria-label', entry.name);
    btn.addEventListener('mouseenter', () => setHoveredEmoji(entry));
    btn.addEventListener('focus', () => setHoveredEmoji(entry));
    btn.addEventListener('click', () => {
      options.onSelect(entry.char);
      close();
    });
    return btn;
  };

  const renderGrid = () => {
    scrollBody.replaceChildren();
    const q = searchQuery.trim().toLowerCase().replaceAll(':', '');

    if (q) {
      const matches = ALL_EMOJIS.filter(
        (e) =>
          e.name.toLowerCase().includes(q) || e.keywords.toLowerCase().includes(q),
      );
      if (matches.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'emoji-picker-empty';
        empty.textContent = 'No emojis found.';
        scrollBody.appendChild(empty);
        return;
      }

      const grid = document.createElement('div');
      grid.className = 'emoji-grid';
      for (const entry of matches) {
        grid.appendChild(createEmojiButton(entry));
      }
      scrollBody.appendChild(grid);
      return;
    }

    for (const cat of EMOJI_CATEGORIES) {
      const section = document.createElement('div');
      section.className = 'emoji-category';

      const catTitle = document.createElement('div');
      catTitle.className = 'emoji-category-title';
      catTitle.textContent = cat.title;
      section.appendChild(catTitle);

      const grid = document.createElement('div');
      grid.className = 'emoji-grid';
      for (const entry of cat.emojis) {
        grid.appendChild(createEmojiButton(entry));
      }
      section.appendChild(grid);
      scrollBody.appendChild(section);
    }
  };

  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value;
    renderGrid();
  });

  const close = () => {
    if (closed) {
      return;
    }
    closed = true;
    if (activePickerClose === close) {
      activePickerClose = null;
      activePickerAnchor = null;
    }
    window.removeEventListener('pointerdown', onOutsidePointerDown);
    window.removeEventListener('keydown', onEscape);
    panel.remove();
    options.onClose?.();
  };

  const onOutsidePointerDown = (e: PointerEvent) => {
    const target = e.target as Node | null;
    if (!target) {
      return;
    }
    if (panel.contains(target) || options.anchorEl.contains(target)) {
      return;
    }
    close();
  };

  const onEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };

  activePickerClose = close;
  activePickerAnchor = options.anchorEl;
  renderGrid();
  document.body.appendChild(panel);

  const anchorRect = options.anchorEl.getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();
  const margin = 10;

  let left = anchorRect.right - panelRect.width;
  if (left < margin) {
    left = Math.min(anchorRect.left, window.innerWidth - panelRect.width - margin);
  }
  if (left < margin) {
    left = margin;
  }

  let top = anchorRect.top - panelRect.height - 8;
  if (top < margin) {
    top = Math.min(anchorRect.bottom + 8, window.innerHeight - panelRect.height - margin);
  }
  if (top < margin) {
    top = margin;
  }

  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;

  window.setTimeout(() => {
    if (!closed) {
      window.addEventListener('pointerdown', onOutsidePointerDown);
      window.addEventListener('keydown', onEscape);
      searchInput.focus();
    }
  }, 0);

  return close;
}
