import { apiForwardMessage, type ForwardTargetRef, type ThreadTarget } from './apiClient';
import { createCloseIconSvg } from './chatUi';
import { resolveGroupAvatar } from './groupDmModals';
import { isModalConfirmShortcut, isTopmostModal } from './modalShortcuts';
import { setDisplayNameWithRoleBadge } from './profileBadges';
import { createStatusGlyph } from './profileDrawer';
import type { ChatMessage, PublicProfile, SocialSnapshot } from './types';

const MAX_FORWARD_RECIPIENTS = 10;

interface ForwardEntry {
  key: string;
  target: ForwardTargetRef;
  label: string;
  subLabel: string;
  avatarUrl: string;
  status?: PublicProfile['status'];
  profile?: PublicProfile;
  isGroup: boolean;
  sortTs: number;
}

function summarizeForwardedMessage(msg: ChatMessage): string {
  const cleanText = (msg.content ?? '').replace(/\s+/g, ' ').trim();
  if (cleanText) {
    return cleanText.length > 130 ? `${cleanText.slice(0, 127).trimEnd()}...` : cleanText;
  }
  if (msg.gif) {
    return `GIF: ${msg.gif.title || 'Animated GIF'}`;
  }
  if (msg.voiceNote) {
    return 'Voice message';
  }
  const attCount =
    (msg.attachments?.length ?? 0) +
    (msg.imageDataUrls?.length ?? (msg.imageDataUrl ? 1 : 0));
  if (attCount > 0) {
    return attCount === 1 ? '1 attachment' : `${attCount} attachments`;
  }
  return 'Message';
}

/**
 * Opens a centered popup to forward any message (text, GIF, images, files, voice notes)
 * to up to 10 Group Chats or Direct Messages at once.
 */
export function openForwardMessageModal(options: {
  message: ChatMessage;
  sourceTarget: ThreadTarget;
  snapshot: SocialSnapshot;
  resolveAvatar: (profile: { avatarPreset: number | null; avatarDataUrl?: string }) => string;
  onForwarded: (snapshot: SocialSnapshot, forwardedCount: number) => void;
}): () => void {
  const { message, sourceTarget, snapshot, resolveAvatar, onForwarded } = options;

  let closed = false;
  let searchQuery = '';
  let submitting = false;
  const selectedKeys = new Set<string>();

  const activityMap = snapshot.threadActivity ?? {};
  const blockedSet = new Set(
    (snapshot.blockedUsers ?? []).map((b) => b.username.toLowerCase()),
  );
  const selfLower = snapshot.user.username.toLowerCase();

  const entries: ForwardEntry[] = [];
  const seenDmUsers = new Set<string>();

  for (const grp of snapshot.groups ?? []) {
    const key = `group:${grp.id}`;
    entries.push({
      key,
      target: { kind: 'group', groupId: grp.id },
      label: grp.name,
      subLabel: `${grp.members.length} ${grp.members.length === 1 ? 'member' : 'members'}`,
      avatarUrl: resolveGroupAvatar(grp),
      isGroup: true,
      sortTs: activityMap[key] ?? grp.createdAt ?? 0,
    });
  }

  const pushDmEntry = (peer: PublicProfile) => {
    const uLower = peer.username.toLowerCase();
    if (uLower === selfLower || blockedSet.has(uLower) || peer.isBlockedRelation || seenDmUsers.has(uLower)) {
      return;
    }
    seenDmUsers.add(uLower);
    const key = `dm:${uLower}`;
    entries.push({
      key,
      target: { kind: 'dm', username: peer.username },
      label: peer.displayName,
      subLabel: `@${peer.username}`,
      avatarUrl: resolveAvatar(peer),
      status: peer.status,
      profile: peer,
      isGroup: false,
      sortTs: activityMap[key] ?? 0,
    });
  };

  for (const friend of snapshot.friends) {
    pushDmEntry(friend);
  }
  for (const dmPeer of snapshot.dmPeers ?? []) {
    pushDmEntry(dmPeer);
  }

  entries.sort((a, b) => {
    if (b.sortTs !== a.sortTs) {
      return b.sortTs - a.sortTs;
    }
    return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
  });

  const entryByKey = new Map<string, ForwardEntry>(entries.map((e) => [e.key, e]));

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop modal-backdrop--deep';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-label', 'Forward Message');

  const card = document.createElement('div');
  card.className = 'modal-card modal-card--group forward-modal-card';

  const header = document.createElement('div');
  header.className = 'group-modal-header';

  const heading = document.createElement('div');
  const titleRow = document.createElement('div');
  titleRow.className = 'forward-modal-title-row';
  const title = document.createElement('h2');
  title.className = 'modal-title';
  title.textContent = 'Forward Message';
  const countPill = document.createElement('span');
  countPill.className = 'forward-count-pill';
  countPill.textContent = `0 / ${MAX_FORWARD_RECIPIENTS}`;
  titleRow.appendChild(title);
  titleRow.appendChild(countPill);

  const sub = document.createElement('div');
  sub.className = 'modal-subtitle';
  sub.textContent = `Send to up to ${MAX_FORWARD_RECIPIENTS} DMs or Group Chats at once.`;
  heading.appendChild(titleRow);
  heading.appendChild(sub);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'modal-close-icon-btn';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.appendChild(createCloseIconSvg(16));

  header.appendChild(heading);
  header.appendChild(closeBtn);
  card.appendChild(header);

  const previewBox = document.createElement('div');
  previewBox.className = 'forward-preview-box';
  const previewMeta = document.createElement('div');
  previewMeta.className = 'forward-preview-meta';
  previewMeta.textContent = `From ${message.authorName}`;
  const previewText = document.createElement('div');
  previewText.className = 'forward-preview-text';
  previewText.textContent = summarizeForwardedMessage(message);
  previewBox.appendChild(previewMeta);
  previewBox.appendChild(previewText);
  card.appendChild(previewBox);

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'group-modal-input';
  searchInput.placeholder = 'Search DMs or Group Chats...';
  card.appendChild(searchInput);

  const listWrap = document.createElement('div');
  listWrap.className = 'group-friend-checklist forward-recipient-list';
  card.appendChild(listWrap);

  const noteInput = document.createElement('input');
  noteInput.type = 'text';
  noteInput.className = 'group-modal-input forward-note-input';
  noteInput.maxLength = 500;
  noteInput.placeholder = 'Add an optional message...';
  card.appendChild(noteInput);

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

  const sendBtn = document.createElement('button');
  sendBtn.type = 'button';
  sendBtn.className = 'btn-primary';
  sendBtn.dataset.action = 'confirm-forward';
  sendBtn.disabled = true;
  sendBtn.textContent = 'Forward';

  footer.appendChild(cancelBtn);
  footer.appendChild(sendBtn);
  card.appendChild(footer);

  backdrop.appendChild(card);
  document.body.appendChild(backdrop);

  const syncSelectionState = () => {
    const count = selectedKeys.size;
    countPill.textContent = `${count} / ${MAX_FORWARD_RECIPIENTS}`;
    countPill.classList.toggle('forward-count-pill--max', count >= MAX_FORWARD_RECIPIENTS);
    sendBtn.disabled = submitting || count === 0;
    sendBtn.textContent = submitting
      ? 'Forwarding...'
      : count > 0
        ? `Forward (${count})`
        : 'Forward';
  };

  const renderList = () => {
    listWrap.replaceChildren();
    const q = searchQuery.trim().toLowerCase();
    const matches = entries.filter(
      (e) =>
        !q ||
        e.label.toLowerCase().includes(q) ||
        e.subLabel.toLowerCase().includes(q),
    );

    if (entries.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'group-checklist-empty';
      empty.textContent = 'No DMs or Group Chats available to forward to.';
      listWrap.appendChild(empty);
      return;
    }

    if (matches.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'group-checklist-empty';
      empty.textContent = `No chats match "${searchQuery.trim()}".`;
      listWrap.appendChild(empty);
      return;
    }

    const atCap = selectedKeys.size >= MAX_FORWARD_RECIPIENTS;

    for (const entry of matches) {
      const isChecked = selectedKeys.has(entry.key);
      const isDisabled = !isChecked && atCap;

      const row = document.createElement('label');
      row.className = 'group-friend-option forward-recipient-row';
      row.dataset.forwardKey = entry.key;
      if (isChecked) {
        row.classList.add('group-friend-option--selected');
      }
      if (isDisabled) {
        row.classList.add('forward-recipient-row--disabled');
      }

      const avWrap = document.createElement('span');
      avWrap.className = 'group-friend-avatar-wrap';
      const img = document.createElement('img');
      img.className = 'group-friend-avatar';
      img.src = entry.avatarUrl;
      img.alt = entry.label;
      avWrap.appendChild(img);

      if (!entry.isGroup && entry.status) {
        const dot = document.createElement('span');
        dot.className = 'group-friend-status-dot';
        dot.appendChild(createStatusGlyph(entry.status, 9));
        avWrap.appendChild(dot);
      }

      const meta = document.createElement('span');
      meta.className = 'group-friend-meta';
      const nameLine = document.createElement('span');
      nameLine.className = 'group-friend-display';
      if (!entry.isGroup && entry.profile) {
        setDisplayNameWithRoleBadge(nameLine, entry.label, entry.profile, { badgeSize: 13 });
      } else {
        nameLine.textContent = entry.label;
      }
      const subLine = document.createElement('span');
      subLine.className = 'group-friend-username';
      subLine.textContent = entry.isGroup ? `Group • ${entry.subLabel}` : entry.subLabel;
      meta.appendChild(nameLine);
      meta.appendChild(subLine);

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'group-friend-checkbox';
      cb.checked = isChecked;
      cb.disabled = isDisabled;
      cb.addEventListener('change', () => {
        if (cb.checked) {
          if (selectedKeys.size >= MAX_FORWARD_RECIPIENTS) {
            cb.checked = false;
            return;
          }
          selectedKeys.add(entry.key);
        } else {
          selectedKeys.delete(entry.key);
        }
        errorLine.hidden = true;
        syncSelectionState();
        renderList();
      });

      row.appendChild(avWrap);
      row.appendChild(meta);
      row.appendChild(cb);
      listWrap.appendChild(row);
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
    if (isModalConfirmShortcut(e, backdrop) && !sendBtn.disabled) {
      e.preventDefault();
      e.stopImmediatePropagation();
      sendBtn.click();
    }
  };

  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value;
    renderList();
  });

  sendBtn.addEventListener('click', async () => {
    if (submitting || selectedKeys.size === 0) {
      return;
    }
    const targets: ForwardTargetRef[] = [];
    for (const key of selectedKeys) {
      const entry = entryByKey.get(key);
      if (entry) {
        targets.push(entry.target);
      }
    }
    if (targets.length === 0) {
      return;
    }
    submitting = true;
    errorLine.hidden = true;
    syncSelectionState();

    const res = await apiForwardMessage(
      sourceTarget,
      message.id,
      targets.slice(0, MAX_FORWARD_RECIPIENTS),
      noteInput.value,
    );
    if (closed) {
      return;
    }
    submitting = false;
    if (!res.ok) {
      errorLine.textContent = res.error ?? 'Error: Could not forward message';
      errorLine.hidden = false;
      syncSelectionState();
      return;
    }
    if (res.snapshot) {
      onForwarded(res.snapshot, res.forwardedCount ?? targets.length);
    }
    close();
  });

  closeBtn.addEventListener('click', close);
  cancelBtn.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) {
      close();
    }
  });
  window.addEventListener('keydown', onKeyDown, true);

  renderList();
  syncSelectionState();
  requestAnimationFrame(() => {
    if (!closed) {
      backdrop.classList.add('modal-backdrop--visible');
      searchInput.focus();
    }
  });

  return close;
}
