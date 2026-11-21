import { createCloseIconSvg, createPinIconSvg } from './chatUi';
import { renderFormattedMessageContent } from './markdownRenderer';
import { setDisplayNameWithRoleBadge } from './profileBadges';
import type { ChatMessage } from './types';

export interface PinnedPopoverOptions {
  anchorEl: HTMLElement;
  getMessages: () => ChatMessage[];
  resolveAvatar: (profile: { avatarPreset: number | null; avatarDataUrl?: string }) => string;
  formatTime: (ts: number) => string;
  onJumpToMessage: (messageId: string) => void;
  onUnpin: (msg: ChatMessage) => Promise<void>;
  onClose?: () => void;
}

let activePinnedPopoverClose: (() => void) | null = null;
let activePinnedAnchor: HTMLElement | null = null;

export function closeActivePinnedPopover(): void {
  if (activePinnedPopoverClose) {
    activePinnedPopoverClose();
  }
}

export function isPinnedPopoverOpenFor(anchorEl: HTMLElement): boolean {
  return Boolean(activePinnedPopoverClose && activePinnedAnchor === anchorEl);
}

/**
 * Opens an anchored Discord-style Pinned Messages popover below the DM/Group header Pin icon.
 */
export function openPinnedMessagesPopover(options: PinnedPopoverOptions): () => void {
  closeActivePinnedPopover();

  let closed = false;

  const panel = document.createElement('div');
  panel.className = 'pinned-popover';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Pinned Messages');

  const header = document.createElement('div');
  header.className = 'pinned-popover-header';

  const titleWrap = document.createElement('div');
  titleWrap.className = 'pinned-popover-title';
  titleWrap.appendChild(createPinIconSvg(16, true));
  const titleText = document.createElement('span');
  titleText.textContent = 'Pinned Messages';
  titleWrap.appendChild(titleText);

  const countBadge = document.createElement('span');
  countBadge.className = 'pinned-popover-count';
  titleWrap.appendChild(countBadge);
  header.appendChild(titleWrap);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'pinned-popover-close';
  closeBtn.title = 'Close';
  closeBtn.setAttribute('aria-label', 'Close pinned messages');
  closeBtn.appendChild(createCloseIconSvg(14));
  header.appendChild(closeBtn);
  panel.appendChild(header);

  const listEl = document.createElement('div');
  listEl.className = 'pinned-popover-list';
  panel.appendChild(listEl);

  const renderList = () => {
    listEl.replaceChildren();
    const pinned = options
      .getMessages()
      .filter((m) => Boolean(m.pinned))
      .sort((a, b) => (b.pinnedAt ?? b.timestamp) - (a.pinnedAt ?? a.timestamp));

    countBadge.textContent = String(pinned.length);
    countBadge.hidden = pinned.length === 0;

    if (pinned.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'pinned-popover-empty';
      empty.appendChild(createPinIconSvg(26, false));
      const emptyTitle = document.createElement('div');
      emptyTitle.className = 'pinned-popover-empty-title';
      emptyTitle.textContent = 'No pinned messages yet';
      const emptySub = document.createElement('div');
      emptySub.className = 'pinned-popover-empty-sub';
      emptySub.textContent = 'Hover any message and click the pin icon to save it here.';
      empty.appendChild(emptyTitle);
      empty.appendChild(emptySub);
      listEl.appendChild(empty);
      return;
    }

    for (const msg of pinned) {
      const card = document.createElement('div');
      card.className = 'pinned-item-card';

      const cardTop = document.createElement('div');
      cardTop.className = 'pinned-item-top';

      const avatar = document.createElement('img');
      avatar.className = 'pinned-item-avatar';
      avatar.src = options.resolveAvatar({
        avatarPreset: msg.authorAvatarPreset,
        avatarDataUrl: msg.authorAvatarDataUrl,
      });
      avatar.alt = `${msg.authorName} avatar`;
      cardTop.appendChild(avatar);

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
      meta.appendChild(authorEl);

      const timeEl = document.createElement('span');
      timeEl.className = 'pinned-item-time';
      timeEl.textContent = options.formatTime(msg.timestamp);
      meta.appendChild(timeEl);
      cardTop.appendChild(meta);

      const actions = document.createElement('div');
      actions.className = 'pinned-item-actions';

      const jumpBtn = document.createElement('button');
      jumpBtn.type = 'button';
      jumpBtn.className = 'pinned-item-jump';
      jumpBtn.textContent = 'Jump';
      jumpBtn.addEventListener('click', () => {
        options.onJumpToMessage(msg.id);
        close();
      });
      actions.appendChild(jumpBtn);

      const unpinBtn = document.createElement('button');
      unpinBtn.type = 'button';
      unpinBtn.className = 'pinned-item-unpin';
      unpinBtn.title = 'Unpin message';
      unpinBtn.setAttribute('aria-label', 'Unpin message');
      unpinBtn.appendChild(createCloseIconSvg(12));
      unpinBtn.addEventListener('click', async () => {
        unpinBtn.disabled = true;
        await options.onUnpin(msg);
        if (!closed) {
          renderList();
        }
      });
      actions.appendChild(unpinBtn);

      cardTop.appendChild(actions);
      card.appendChild(cardTop);

      if (msg.content) {
        const contentEl = document.createElement('div');
        contentEl.className = 'pinned-item-content';
        renderFormattedMessageContent(contentEl, msg.content);
        card.appendChild(contentEl);
      }

      const attCount =
        (msg.attachments?.length ?? 0) +
        (msg.imageDataUrls?.length ?? (msg.imageDataUrl ? 1 : 0));
      if (msg.gif) {
        const mediaNote = document.createElement('div');
        mediaNote.className = 'pinned-item-media-tag';
        mediaNote.textContent = `GIF: ${msg.gif.title || 'Animated GIF'}`;
        card.appendChild(mediaNote);
      } else if (attCount > 0) {
        const firstAtt = msg.attachments?.[0];
        const mediaNote = document.createElement('div');
        mediaNote.className = 'pinned-item-media-tag';
        mediaNote.textContent =
          attCount === 1 && firstAtt
            ? `Attachment: ${firstAtt.name}`
            : `${attCount} attachment${attCount === 1 ? '' : 's'}`;
        card.appendChild(mediaNote);
      }

      listEl.appendChild(card);
    }
  };

  renderList();

  const onRefreshEvent = () => {
    if (!closed) {
      renderList();
    }
  };
  window.addEventListener('redshift:pinned-updated', onRefreshEvent);

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

  const close = () => {
    if (closed) {
      return;
    }
    closed = true;
    if (activePinnedPopoverClose === close) {
      activePinnedPopoverClose = null;
      activePinnedAnchor = null;
    }
    window.removeEventListener('pointerdown', onOutsidePointerDown);
    window.removeEventListener('keydown', onEscape);
    window.removeEventListener('redshift:pinned-updated', onRefreshEvent);
    panel.remove();
    options.onClose?.();
  };

  closeBtn.addEventListener('click', close);

  activePinnedPopoverClose = close;
  activePinnedAnchor = options.anchorEl;
  document.body.appendChild(panel);

  const rect = options.anchorEl.getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();
  const margin = 10;
  let left = rect.right - panelRect.width;
  if (left < margin) {
    left = Math.max(margin, window.innerWidth - panelRect.width - margin);
  }
  const top = Math.min(rect.bottom + 8, window.innerHeight - panelRect.height - margin);
  panel.style.left = `${left}px`;
  panel.style.top = `${Math.max(margin, top)}px`;

  window.setTimeout(() => {
    if (!closed) {
      window.addEventListener('pointerdown', onOutsidePointerDown);
      window.addEventListener('keydown', onEscape);
    }
  }, 0);

  return close;
}
