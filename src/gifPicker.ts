import {
  apiAddCommunityGifs,
  apiRemoveCommunityGif,
  apiSearchGifs,
  apiToggleFavoriteGif,
  apiUploadAttachment,
  resolveMediaUrl,
} from './apiClient';
import { type ContextMenuItem, copyGifShareLinkToClipboard, openContextMenu } from './contextMenu';
import type { GifItem, SocialSnapshot } from './types';

if (typeof window !== 'undefined') {
  window.addEventListener('redshift:close-gif-picker', () => {
    closeActiveGifPicker();
  });
}

export interface GifPickerOptions {
  anchorEl: HTMLElement;
  currentUsername?: string;
  getFavorites: () => GifItem[];
  onSelect: (gif: GifItem) => void;
  onFavoritesUpdated: (snapshot: SocialSnapshot) => void;
  onSwitchToEmoji?: () => void;
  onClose?: () => void;
}

interface PendingGifImport {
  file: File;
  previewUrl: string;
  title: string;
  tagsText: string;
}

let activeGifPickerClose: (() => void) | null = null;
let activeGifPickerAnchor: HTMLElement | null = null;

export function closeActiveGifPicker(): void {
  if (activeGifPickerClose) {
    activeGifPickerClose();
  }
}

export function isGifPickerOpenFor(anchorEl: HTMLElement): boolean {
  return Boolean(activeGifPickerClose && activeGifPickerAnchor === anchorEl);
}

function createStarSvg(filled: boolean, size = 14): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', filled ? 'currentColor' : 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');

  const star = document.createElementNS(ns, 'polygon');
  star.setAttribute(
    'points',
    '12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2',
  );
  svg.appendChild(star);
  return svg;
}

function createBackArrowSvg(size = 15): SVGSVGElement {
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

  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', 'M15 18l-6-6 6-6');
  svg.appendChild(p);
  return svg;
}

function createTrashSvg(size = 13): SVGSVGElement {
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

  const top = document.createElementNS(ns, 'polyline');
  top.setAttribute('points', '3 6 5 6 21 6');
  const bin = document.createElementNS(ns, 'path');
  bin.setAttribute('d', 'M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m5 0V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2');
  svg.appendChild(top);
  svg.appendChild(bin);
  return svg;
}

function defaultTitleFromFilename(fileName: string): string {
  const base = fileName.replace(/\.gif$/i, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return (base || 'Custom GIF').slice(0, 80);
}

function parseTagInput(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[\s,]+/)) {
    const clean = part.replace(/^#+/, '').trim().toLowerCase().slice(0, 30);
    if (!clean || seen.has(clean)) {
      continue;
    }
    seen.add(clean);
    out.push(clean);
    if (out.length >= 15) {
      break;
    }
  }
  return out;
}

function matchesGifQuery(gif: GifItem, query: string): boolean {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return true;
  }
  const haystack = `${gif.title} ${(gif.tags ?? []).join(' ')} ${gif.uploadedBy ?? ''}`.toLowerCase();
  return tokens.every((tok) => haystack.includes(tok));
}

function resolveTileAspect(width?: number, height?: number): number {
  if (typeof width === 'number' && typeof height === 'number' && width > 0 && height > 0) {
    return Math.min(2.6, Math.max(0.62, width / height));
  }
  return 16 / 10;
}

export function openGifPicker(options: GifPickerOptions): () => void {
  window.dispatchEvent(new CustomEvent('redshift:close-emoji-picker'));
  closeActiveGifPicker();

  let closed = false;
  let searchQuery = '';
  let activeSection: 'home' | 'favorites' = 'home';
  let communityGifs: GifItem[] = [];
  let loadingLibrary = true;
  let isImporting = false;
  let pendingImports: PendingGifImport[] = [];
  let loadSeq = 0;

  const panel = document.createElement('div');
  panel.className = 'gif-picker-square';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'GIF picker');

  if (options.onSwitchToEmoji) {
    const tabsRow = document.createElement('div');
    tabsRow.className = 'picker-tabs-row';

    const gifTab = document.createElement('button');
    gifTab.type = 'button';
    gifTab.className = 'picker-tab picker-tab--active';
    gifTab.textContent = 'GIFs';

    const emojiTab = document.createElement('button');
    emojiTab.type = 'button';
    emojiTab.className = 'picker-tab';
    emojiTab.textContent = 'Emoji';
    emojiTab.addEventListener('click', () => {
      close();
      options.onSwitchToEmoji?.();
    });

    tabsRow.appendChild(gifTab);
    tabsRow.appendChild(emojiTab);
    panel.appendChild(tabsRow);
  }

  const header = document.createElement('div');
  header.className = 'gif-picker-header';

  const backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'gif-picker-back-btn';
  backBtn.title = 'Back to GIFs';
  backBtn.setAttribute('aria-label', 'Back to GIFs');
  backBtn.appendChild(createBackArrowSvg(16));
  backBtn.hidden = true;
  header.appendChild(backBtn);

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'emoji-picker-search';
  searchInput.placeholder = 'Search GIFs';
  searchInput.setAttribute('aria-label', 'Search GIFs');
  header.appendChild(searchInput);

  const uploadInput = document.createElement('input');
  uploadInput.type = 'file';
  uploadInput.accept = 'image/gif,.gif';
  uploadInput.multiple = true;
  uploadInput.hidden = true;

  const uploadBtn = document.createElement('button');
  uploadBtn.type = 'button';
  uploadBtn.className = 'gif-upload-btn';
  uploadBtn.title = 'Add GIFs from your computer into Redshift';
  uploadBtn.textContent = '+ Add';
  uploadBtn.addEventListener('click', () => {
    if (isImporting) {
      return;
    }
    uploadInput.value = '';
    uploadInput.click();
  });

  header.appendChild(uploadInput);
  header.appendChild(uploadBtn);
  panel.appendChild(header);

  const statusLine = document.createElement('div');
  statusLine.className = 'gif-picker-status';
  statusLine.hidden = true;
  panel.appendChild(statusLine);

  const scrollBody = document.createElement('div');
  scrollBody.className = 'emoji-picker-scroll gif-picker-scroll';
  panel.appendChild(scrollBody);

  const setStatusMsg = (msg: string | null, isError = false) => {
    if (!msg) {
      statusLine.hidden = true;
      statusLine.textContent = '';
      statusLine.classList.remove('gif-picker-status--error');
      return;
    }
    statusLine.hidden = false;
    statusLine.textContent = msg;
    statusLine.classList.toggle('gif-picker-status--error', isError);
  };

  const revokePendingImports = () => {
    for (const item of pendingImports) {
      URL.revokeObjectURL(item.previewUrl);
    }
    pendingImports = [];
  };

  const refreshLibrary = async () => {
    const seq = ++loadSeq;
    const res = await apiSearchGifs('');
    if (closed || seq !== loadSeq) {
      return;
    }
    loadingLibrary = false;
    if (res.ok) {
      communityGifs = res.results;
    }
    if (pendingImports.length === 0) {
      renderBody();
    }
  };

  const queueGifFiles = (files: FileList | File[]) => {
    const all = Array.from(files);
    if (all.length === 0) {
      return;
    }
    const valid = all.filter(
      (f) => f.type === 'image/gif' || f.name.toLowerCase().endsWith('.gif'),
    );
    if (valid.length === 0) {
      setStatusMsg('Only .gif files can be imported into Redshift GIFs.', true);
      return;
    }

    setStatusMsg(null);
    revokePendingImports();
    pendingImports = valid.slice(0, 25).map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
      title: defaultTitleFromFilename(file.name),
      tagsText: '',
    }));
    if (valid.length > 25) {
      setStatusMsg('Showing the first 25 selected GIFs.');
    }
    renderBody();
  };

  uploadInput.addEventListener('change', () => {
    if (uploadInput.files && uploadInput.files.length > 0) {
      queueGifFiles(uploadInput.files);
    }
  });

  backBtn.addEventListener('click', () => {
    if (isImporting) {
      return;
    }
    if (pendingImports.length > 0) {
      revokePendingImports();
      setStatusMsg(null);
      renderBody();
      return;
    }
    activeSection = 'home';
    searchQuery = '';
    searchInput.value = '';
    renderBody();
  });

  const submitPendingImports = async () => {
    if (isImporting || pendingImports.length === 0) {
      return;
    }
    isImporting = true;
    uploadBtn.disabled = true;
    backBtn.disabled = true;
    renderBody();

    try {
      const uploadedItems: Array<{ uploadId: string; title: string; tags: string[] }> = [];
      const total = pendingImports.length;

      for (let i = 0; i < total; i += 1) {
        const entry = pendingImports[i];
        setStatusMsg(
          total === 1
            ? `Uploading ${entry.file.name}...`
            : `Uploading ${i + 1}/${total}: ${entry.file.name}...`,
        );

        const upRes = await apiUploadAttachment(entry.file, (pct) => {
          if (closed) {
            return;
          }
          setStatusMsg(
            total === 1
              ? `Uploading ${entry.file.name} — ${pct}%`
              : `Uploading ${i + 1}/${total}: ${entry.file.name} — ${pct}%`,
          );
        });

        if (closed) {
          return;
        }
        if (!upRes.ok || !upRes.attachment) {
          setStatusMsg(upRes.error ?? `Could not upload ${entry.file.name}`, true);
          return;
        }

        uploadedItems.push({
          uploadId: upRes.attachment.id,
          title: entry.title.trim() || defaultTitleFromFilename(entry.file.name),
          tags: parseTagInput(entry.tagsText),
        });
      }

      setStatusMsg(total === 1 ? 'Saving GIF to Redshift...' : `Saving ${total} GIFs to Redshift...`);
      const addRes = await apiAddCommunityGifs(uploadedItems);
      if (closed) {
        return;
      }
      if (!addRes.ok) {
        setStatusMsg(addRes.error ?? 'Could not save GIFs to database', true);
        return;
      }

      revokePendingImports();
      activeSection = 'home';
      searchQuery = '';
      searchInput.value = '';
      setStatusMsg(null);
      await refreshLibrary();
    } finally {
      isImporting = false;
      uploadBtn.disabled = false;
      backBtn.disabled = false;
      if (!closed) {
        renderBody();
      }
    }
  };

  const buildGifTile = (gif: GifItem): HTMLDivElement => {
    const tile = document.createElement('div');
    tile.className = 'gif-tile';
    tile.tabIndex = 0;
    tile.setAttribute('role', 'button');
    tile.setAttribute('aria-label', `Send ${gif.title} GIF`);
    tile.style.aspectRatio = String(resolveTileAspect(gif.width, gif.height));

    const img = document.createElement('img');
    img.className = 'gif-tile-img';
    img.src = resolveMediaUrl(gif.previewUrl ?? gif.url);
    img.alt = gif.title;
    img.loading = 'lazy';
    img.decoding = 'async';
    if (!(gif.width && gif.height)) {
      img.addEventListener(
        'load',
        () => {
          if (img.naturalWidth > 0 && img.naturalHeight > 0) {
            tile.style.aspectRatio = String(
              resolveTileAspect(img.naturalWidth, img.naturalHeight),
            );
          }
        },
        { once: true },
      );
    }
    tile.appendChild(img);

    const favs = options.getFavorites();
    let favorited = favs.some((f) => f.url === gif.url);

    const starBtn = document.createElement('button');
    starBtn.type = 'button';
    starBtn.className = favorited ? 'gif-fav-btn gif-fav-btn--active' : 'gif-fav-btn';
    starBtn.title = favorited ? 'Remove from Favorites' : 'Favorite GIF';
    starBtn.setAttribute('aria-label', starBtn.title);
    starBtn.appendChild(createStarSvg(favorited, 13));

    starBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      starBtn.disabled = true;
      const res = await apiToggleFavoriteGif(gif, 'toggle');
      starBtn.disabled = false;
      if (res.ok && res.snapshot) {
        options.onFavoritesUpdated(res.snapshot);
        favorited = Boolean(res.isFavorited);
        starBtn.classList.toggle('gif-fav-btn--active', favorited);
        starBtn.replaceChildren(createStarSvg(favorited, 13));
        starBtn.title = favorited ? 'Remove from Favorites' : 'Favorite GIF';
        if (activeSection === 'favorites') {
          renderBody();
        }
      }
    });
    tile.appendChild(starBtn);

    const canRemoveFromDb = Boolean(
      gif.id &&
        options.currentUsername &&
        gif.uploadedBy?.toLowerCase() === options.currentUsername.toLowerCase(),
    );

    if (canRemoveFromDb && gif.id) {
      let confirmingDelete = false;
      let confirmResetId: number | null = null;

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'gif-delete-btn';
      delBtn.title = 'Remove from Redshift GIFs';
      delBtn.setAttribute('aria-label', 'Remove GIF from Redshift');
      delBtn.appendChild(createTrashSvg(13));

      delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirmingDelete) {
          confirmingDelete = true;
          delBtn.classList.add('gif-delete-btn--confirm');
          delBtn.textContent = 'Remove?';
          confirmResetId = window.setTimeout(() => {
            confirmingDelete = false;
            delBtn.classList.remove('gif-delete-btn--confirm');
            delBtn.replaceChildren(createTrashSvg(13));
          }, 2800);
          return;
        }

        if (confirmResetId !== null) {
          window.clearTimeout(confirmResetId);
          confirmResetId = null;
        }
        delBtn.disabled = true;
        const res = await apiRemoveCommunityGif(gif.id!);
        if (!res.ok) {
          delBtn.disabled = false;
          confirmingDelete = false;
          delBtn.classList.remove('gif-delete-btn--confirm');
          delBtn.replaceChildren(createTrashSvg(13));
          setStatusMsg(res.error ?? 'Could not remove GIF', true);
          return;
        }
        await refreshLibrary();
      });

      tile.appendChild(delBtn);
    }

    const triggerSelect = () => {
      options.onSelect(gif);
      close();
    };
    tile.addEventListener('click', triggerSelect);
    tile.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const menuItems: ContextMenuItem[] = [
        {
          label: 'Send GIF',
          icon: 'gif',
          onSelect: triggerSelect,
        },
        {
          label: favorited ? 'Remove from Favorites' : 'Favorite GIF',
          icon: favorited ? 'star-filled' : 'star',
          onSelect: () => {
            starBtn.click();
          },
        },
        {
          label: 'Copy GIF Link',
          icon: 'link',
          onSelect: () => {
            void copyGifShareLinkToClipboard(gif).then((copiedUrl) => {
              if (!closed && copiedUrl) {
                setStatusMsg(`Copied link for "${gif.title || 'GIF'}"`);
                window.setTimeout(() => {
                  if (!closed) {
                    setStatusMsg(null);
                  }
                }, 2000);
              }
            });
          },
        },
      ];
      if (canRemoveFromDb && gif.id) {
        menuItems.push({
          label: 'Remove from Redshift GIFs',
          icon: 'trash',
          danger: true,
          dividerBefore: true,
          onSelect: async () => {
            const res = await apiRemoveCommunityGif(gif.id!);
            if (!res.ok) {
              setStatusMsg(res.error ?? 'Could not remove GIF', true);
              return;
            }
            await refreshLibrary();
          },
        });
      }
      openContextMenu({
        clientX: e.clientX,
        clientY: e.clientY,
        minWidth: 196,
        items: menuItems,
      });
    });
    tile.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        triggerSelect();
      }
    });

    return tile;
  };

  const renderGridItems = (items: GifItem[], emptyMsg: string) => {
    if (items.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'emoji-picker-empty';
      empty.textContent = emptyMsg;
      scrollBody.appendChild(empty);
      return;
    }

    const grid = document.createElement('div');
    grid.className = 'gif-results-grid';
    const colLeft = document.createElement('div');
    colLeft.className = 'gif-masonry-col';
    const colRight = document.createElement('div');
    colRight.className = 'gif-masonry-col';

    const colHeights = [0, 0];
    for (const item of items) {
      const ratio = resolveTileAspect(item.width, item.height);
      const colIdx = colHeights[0] <= colHeights[1] ? 0 : 1;
      const targetCol = colIdx === 0 ? colLeft : colRight;
      targetCol.appendChild(buildGifTile(item));
      colHeights[colIdx] += 1 / ratio;
    }

    grid.appendChild(colLeft);
    grid.appendChild(colRight);
    scrollBody.appendChild(grid);
  };

  const renderImportView = () => {
    const form = document.createElement('form');
    form.className = 'gif-import-form';
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      void submitPendingImports();
    });

    const heading = document.createElement('div');
    heading.className = 'gif-import-title';
    heading.textContent =
      pendingImports.length === 1
        ? 'Add GIF to Redshift'
        : `Add ${pendingImports.length} GIFs to Redshift`;
    form.appendChild(heading);

    const sub = document.createElement('div');
    sub.className = 'gif-import-desc';
    sub.textContent = 'Name and tag your GIF so anyone in Redshift can search and send it.';
    form.appendChild(sub);

    const list = document.createElement('div');
    list.className = 'gif-import-list';

    let firstTitleInput: HTMLInputElement | null = null;

    pendingImports.forEach((entry, idx) => {
      const row = document.createElement('div');
      row.className = 'gif-import-row';

      const thumb = document.createElement('img');
      thumb.className = 'gif-import-thumb';
      thumb.src = entry.previewUrl;
      thumb.alt = entry.title || entry.file.name;
      row.appendChild(thumb);

      const fields = document.createElement('div');
      fields.className = 'gif-import-fields';

      const titleInput = document.createElement('input');
      titleInput.type = 'text';
      titleInput.className = 'gif-setup-input gif-import-input';
      titleInput.value = entry.title;
      titleInput.placeholder = 'GIF name (for searching)';
      titleInput.maxLength = 80;
      titleInput.disabled = isImporting;
      titleInput.addEventListener('input', () => {
        entry.title = titleInput.value;
      });
      if (idx === 0) {
        firstTitleInput = titleInput;
      }

      const tagsInput = document.createElement('input');
      tagsInput.type = 'text';
      tagsInput.className = 'gif-setup-input gif-import-input gif-import-tags-input';
      tagsInput.value = entry.tagsText;
      tagsInput.placeholder = 'Tags (optional, e.g. funny, cat, hype)';
      tagsInput.disabled = isImporting;
      tagsInput.addEventListener('input', () => {
        entry.tagsText = tagsInput.value;
      });

      fields.appendChild(titleInput);
      fields.appendChild(tagsInput);
      row.appendChild(fields);

      if (pendingImports.length > 1 && !isImporting) {
        const dropBtn = document.createElement('button');
        dropBtn.type = 'button';
        dropBtn.className = 'gif-import-remove-item';
        dropBtn.title = 'Skip this file';
        dropBtn.setAttribute('aria-label', 'Skip this file');
        dropBtn.textContent = '×';
        dropBtn.addEventListener('click', () => {
          URL.revokeObjectURL(entry.previewUrl);
          pendingImports.splice(idx, 1);
          renderBody();
        });
        row.appendChild(dropBtn);
      }

      list.appendChild(row);
    });

    form.appendChild(list);

    const actions = document.createElement('div');
    actions.className = 'gif-setup-actions';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'submit';
    saveBtn.className = 'gif-setup-save';
    saveBtn.disabled = isImporting;
    saveBtn.textContent = isImporting
      ? 'Uploading...'
      : pendingImports.length === 1
        ? 'Add to Redshift'
        : `Add ${pendingImports.length} GIFs`;

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'gif-setup-clear';
    cancelBtn.disabled = isImporting;
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
      revokePendingImports();
      setStatusMsg(null);
      renderBody();
    });

    actions.appendChild(saveBtn);
    actions.appendChild(cancelBtn);
    form.appendChild(actions);

    scrollBody.appendChild(form);
    if (!isImporting && firstTitleInput) {
      const targetInput: HTMLInputElement = firstTitleInput;
      requestAnimationFrame(() => {
        targetInput.focus();
        targetInput.select();
      });
    }
  };

  const renderBody = () => {
    scrollBody.replaceChildren();
    const q = searchQuery.trim();
    const favorites = options.getFavorites();

    const showImport = pendingImports.length > 0;
    backBtn.hidden = !showImport && !q && activeSection === 'home';

    if (showImport) {
      renderImportView();
      return;
    }

    if (q) {
      if (activeSection === 'favorites') {
        const favMatches = favorites.filter((f) => matchesGifQuery(f, q));
        renderGridItems(favMatches, `No favorite GIFs match "${q}".`);
        return;
      }

      const seen = new Set<string>();
      const merged: GifItem[] = [];
      for (const item of [...favorites, ...communityGifs]) {
        if (!matchesGifQuery(item, q) || seen.has(item.url)) {
          continue;
        }
        seen.add(item.url);
        merged.push(item);
      }
      renderGridItems(merged, `No GIFs match "${q}".`);
      return;
    }

    if (activeSection === 'favorites') {
      const title = document.createElement('div');
      title.className = 'emoji-category-title gif-section-title';
      title.textContent = `Favorites (${favorites.length})`;
      scrollBody.appendChild(title);
      renderGridItems(
        favorites,
        'No favorite GIFs yet. Click the ★ on any GIF to save it here.',
      );
      return;
    }

    const favBtn = document.createElement('button');
    favBtn.type = 'button';
    favBtn.className = 'gif-category-card gif-category-card--favorites gif-favorites-only-btn';
    const favLabel = document.createElement('span');
    favLabel.className = 'gif-category-label';
    favLabel.appendChild(createStarSvg(true, 14));
    favLabel.appendChild(document.createTextNode(`Favorites (${favorites.length})`));
    favBtn.appendChild(favLabel);
    favBtn.addEventListener('click', () => {
      activeSection = 'favorites';
      renderBody();
    });
    scrollBody.appendChild(favBtn);

    const libraryTitle = document.createElement('div');
    libraryTitle.className = 'emoji-category-title gif-section-title';
    libraryTitle.textContent = `Redshift GIFs (${communityGifs.length})`;
    scrollBody.appendChild(libraryTitle);

    if (loadingLibrary && communityGifs.length === 0) {
      const loadingEl = document.createElement('div');
      loadingEl.className = 'emoji-picker-empty';
      loadingEl.textContent = 'Loading Redshift GIFs...';
      scrollBody.appendChild(loadingEl);
      return;
    }

    if (communityGifs.length === 0) {
      const emptyBox = document.createElement('div');
      emptyBox.className = 'gif-empty-box';

      const emptyText = document.createElement('div');
      emptyText.className = 'gif-empty-text';
      emptyText.textContent =
        'No GIFs have been submitted yet. Add .gif files from your computer to build Redshift’s GIF library.';

      const emptyAddBtn = document.createElement('button');
      emptyAddBtn.type = 'button';
      emptyAddBtn.className = 'gif-empty-add-btn';
      emptyAddBtn.textContent = '+ Add GIFs from Files';
      emptyAddBtn.addEventListener('click', () => {
        uploadInput.value = '';
        uploadInput.click();
      });

      emptyBox.appendChild(emptyText);
      emptyBox.appendChild(emptyAddBtn);
      scrollBody.appendChild(emptyBox);
      return;
    }

    renderGridItems(communityGifs, 'No GIFs submitted yet.');
  };

  searchInput.addEventListener('input', () => {
    if (pendingImports.length > 0 && !isImporting) {
      revokePendingImports();
      setStatusMsg(null);
    }
    searchQuery = searchInput.value;
    renderBody();
  });

  // Allow dropping .gif files straight onto the open GIF picker panel.
  panel.addEventListener('dragover', (e) => {
    if (!e.dataTransfer || !Array.from(e.dataTransfer.types).includes('Files')) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    panel.classList.add('gif-picker-square--dragover');
  });

  panel.addEventListener('dragleave', (e) => {
    if (!e.relatedTarget || !panel.contains(e.relatedTarget as Node)) {
      panel.classList.remove('gif-picker-square--dragover');
    }
  });

  panel.addEventListener('drop', (e) => {
    panel.classList.remove('gif-picker-square--dragover');
    if (isImporting || !e.dataTransfer?.files || e.dataTransfer.files.length === 0) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    queueGifFiles(e.dataTransfer.files);
  });

  const handleLibraryUpdateEvent = () => {
    if (!closed && !isImporting) {
      void refreshLibrary();
    }
  };
  window.addEventListener('redshift:gifs-updated', handleLibraryUpdateEvent);

  const close = () => {
    if (closed) {
      return;
    }
    closed = true;
    revokePendingImports();
    if (activeGifPickerClose === close) {
      activeGifPickerClose = null;
      activeGifPickerAnchor = null;
    }
    window.removeEventListener('pointerdown', onOutsidePointerDown);
    window.removeEventListener('keydown', onEscape);
    window.removeEventListener('redshift:gifs-updated', handleLibraryUpdateEvent);
    panel.remove();
    options.onClose?.();
  };

  const onOutsidePointerDown = (e: PointerEvent) => {
    const target = e.target as Node | null;
    if (!target || isImporting) {
      return;
    }
    if (
      panel.contains(target) ||
      options.anchorEl.contains(target) ||
      (target instanceof Element && Boolean(target.closest('.floating-action-menu')))
    ) {
      return;
    }
    close();
  };

  const onEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (isImporting) {
        return;
      }
      if (pendingImports.length > 0) {
        revokePendingImports();
        setStatusMsg(null);
        renderBody();
        return;
      }
      if (activeSection !== 'home' && !searchQuery.trim()) {
        activeSection = 'home';
        renderBody();
        return;
      }
      close();
    }
  };

  activeGifPickerClose = close;
  activeGifPickerAnchor = options.anchorEl;
  renderBody();
  void refreshLibrary();

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
