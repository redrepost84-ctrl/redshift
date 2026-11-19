import { createSettingsGearSvg } from './chatUi';
import { createFriendsIconSvg } from './friendsView';
import { resolveGroupAvatar } from './groupDmModals';
import { createStatusGlyph } from './profileDrawer';
import type { GroupDmInfo, PublicProfile, SocialSnapshot } from './types';
import { createSearchIconSvg } from './voiceAudio';

export interface QuickSwitcherOptions {
  getSnapshot: () => SocialSnapshot;
  resolveAvatar: (profile: { avatarPreset: number | null; avatarDataUrl?: string }) => string;
  onSelectDm: (username: string) => void;
  onSelectGroup: (groupId: string) => void;
  onOpenFriends: () => void;
  onOpenSettings: () => void;
  onOpenGlobalSearch?: () => void;
  onClose?: () => void;
}

interface SwitcherEntry {
  key: string;
  kind: 'group' | 'dm' | 'action';
  title: string;
  subtitle: string;
  searchText: string;
  unread: number;
  avatarUrl?: string;
  profile?: PublicProfile;
  group?: GroupDmInfo;
  actionId?: 'friends' | 'settings' | 'search';
}

export function openQuickSwitcherModal(options: QuickSwitcherOptions): () => void {
  let closed = false;
  let selectedIdx = 0;

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop modal-backdrop--deep';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-label', 'Quick Switcher');

  const card = document.createElement('div');
  card.className = 'quick-switcher-card';

  const inputRow = document.createElement('div');
  inputRow.className = 'quick-switcher-input-row';
  const iconWrap = document.createElement('span');
  iconWrap.className = 'quick-switcher-search-icon';
  iconWrap.appendChild(createSearchIconSvg(18));

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'quick-switcher-input';
  input.placeholder = 'Where would you like to go? (DMs, Groups, Friends, Settings)';
  input.setAttribute('aria-label', 'Jump to conversation');

  const kbdBadge = document.createElement('span');
  kbdBadge.className = 'quick-switcher-esc-pill';
  kbdBadge.textContent = 'ESC';

  inputRow.appendChild(iconWrap);
  inputRow.appendChild(input);
  inputRow.appendChild(kbdBadge);
  card.appendChild(inputRow);

  const listEl = document.createElement('div');
  listEl.className = 'quick-switcher-list';
  card.appendChild(listEl);

  const footer = document.createElement('div');
  footer.className = 'quick-switcher-footer';
  footer.textContent = 'Use ↑ ↓ arrows to navigate • Enter to open • Esc to dismiss';
  card.appendChild(footer);

  backdrop.appendChild(card);
  document.body.appendChild(backdrop);

  const buildEntries = (): SwitcherEntry[] => {
    const snap = options.getSnapshot();
    const out: SwitcherEntry[] = [];

    for (const grp of snap.groups ?? []) {
      const unread = snap.groupUnreadCounts?.[grp.id] ?? 0;
      const memberNames = grp.members.map((m) => `${m.displayName} ${m.username}`).join(' ');
      out.push({
        key: `group:${grp.id}`,
        kind: 'group',
        title: grp.name,
        subtitle: `Group Chat • ${grp.members.length} member${grp.members.length === 1 ? '' : 's'}`,
        searchText: `${grp.name} ${memberNames} group`.toLowerCase(),
        unread,
        avatarUrl: resolveGroupAvatar(grp),
        group: grp,
      });
    }

    const seenPeers = new Set<string>();
    const addPeerEntry = (peer: PublicProfile, isFriend: boolean) => {
      const key = peer.username.toLowerCase();
      if (seenPeers.has(key)) {
        return;
      }
      seenPeers.add(key);
      const unread = snap.unreadCounts?.[key] ?? 0;
      out.push({
        key: `dm:${key}`,
        kind: 'dm',
        title: peer.displayName,
        subtitle: isFriend ? `@${peer.username} • Friend` : `@${peer.username} • Direct Message`,
        searchText: `${peer.displayName} ${peer.username} dm`.toLowerCase(),
        unread,
        avatarUrl: options.resolveAvatar(peer),
        profile: peer,
      });
    };

    for (const f of snap.friends) {
      addPeerEntry(f, true);
    }
    for (const dmPeer of snap.dmPeers ?? []) {
      addPeerEntry(dmPeer, false);
    }

    if (options.onOpenGlobalSearch) {
      out.push({
        key: 'action:search',
        kind: 'action',
        title: 'Search All Messages',
        subtitle: 'Find messages across all DMs and Group Chats (Ctrl+Shift+F)',
        searchText: 'search global find messages history filter',
        unread: 0,
        actionId: 'search',
      });
    }
    out.push({
      key: 'action:friends',
      kind: 'action',
      title: 'Friends List',
      subtitle: 'View online friends, pending requests, or add friends',
      searchText: 'friends list pending online blocked add',
      unread: snap.incomingRequests.length,
      actionId: 'friends',
    });
    out.push({
      key: 'action:settings',
      kind: 'action',
      title: 'User Settings',
      subtitle: 'Account, Voice & Audio Modifiers, Privacy, Appearance',
      searchText: 'user settings voice audio krisp privacy appearance theme',
      unread: 0,
      actionId: 'settings',
    });

    out.sort((a, b) => b.unread - a.unread);
    return out;
  };

  let visibleEntries: SwitcherEntry[] = [];

  const selectEntry = (entry: SwitcherEntry) => {
    close();
    if (entry.kind === 'group' && entry.group) {
      options.onSelectGroup(entry.group.id);
    } else if (entry.kind === 'dm' && entry.profile) {
      options.onSelectDm(entry.profile.username);
    } else if (entry.actionId === 'friends') {
      options.onOpenFriends();
    } else if (entry.actionId === 'settings') {
      options.onOpenSettings();
    } else if (entry.actionId === 'search') {
      options.onOpenGlobalSearch?.();
    }
  };

  const renderList = () => {
    const query = input.value.trim().toLowerCase();
    const all = buildEntries();
    visibleEntries = query ? all.filter((e) => e.searchText.includes(query)) : all;
    if (selectedIdx >= visibleEntries.length) {
      selectedIdx = Math.max(0, visibleEntries.length - 1);
    }

    listEl.replaceChildren();
    if (visibleEntries.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'quick-switcher-empty';
      empty.textContent = 'No matching friends, DMs, or group chats.';
      listEl.appendChild(empty);
      return;
    }

    visibleEntries.forEach((entry, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className =
        idx === selectedIdx
          ? 'quick-switcher-item quick-switcher-item--active'
          : 'quick-switcher-item';

      const leftIconWrap = document.createElement('span');
      leftIconWrap.className = 'quick-switcher-item-avatar-wrap';
      if (entry.avatarUrl) {
        const img = document.createElement('img');
        img.className = 'quick-switcher-item-avatar';
        img.src = entry.avatarUrl;
        img.alt = entry.title;
        leftIconWrap.appendChild(img);
        if (entry.profile && !entry.profile.isProfilePrivate) {
          const st = document.createElement('span');
          st.className = 'quick-switcher-item-status';
          st.appendChild(createStatusGlyph(entry.profile.status, 9));
          leftIconWrap.appendChild(st);
        }
      } else {
        const sysCircle = document.createElement('span');
        sysCircle.className = 'quick-switcher-item-sys';
        sysCircle.appendChild(
          entry.actionId === 'friends'
            ? createFriendsIconSvg(16)
            : entry.actionId === 'search'
              ? createSearchIconSvg(16)
              : createSettingsGearSvg(16),
        );
        leftIconWrap.appendChild(sysCircle);
      }
      btn.appendChild(leftIconWrap);

      const meta = document.createElement('span');
      meta.className = 'quick-switcher-item-meta';
      const titleEl = document.createElement('span');
      titleEl.className = 'quick-switcher-item-title';
      titleEl.textContent = entry.title;
      const subEl = document.createElement('span');
      subEl.className = 'quick-switcher-item-sub';
      subEl.textContent = entry.subtitle;
      meta.appendChild(titleEl);
      meta.appendChild(subEl);
      btn.appendChild(meta);

      if (entry.unread > 0) {
        const badge = document.createElement('span');
        badge.className = 'quick-switcher-item-badge';
        badge.textContent = entry.unread > 99 ? '99+' : String(entry.unread);
        btn.appendChild(badge);
      }

      btn.addEventListener('mouseenter', () => {
        selectedIdx = idx;
        const rows = listEl.querySelectorAll('.quick-switcher-item');
        rows.forEach((r, rIdx) => {
          r.classList.toggle('quick-switcher-item--active', rIdx === selectedIdx);
        });
      });
      btn.addEventListener('click', () => selectEntry(entry));
      listEl.appendChild(btn);
    });
  };

  const close = () => {
    if (closed) {
      return;
    }
    closed = true;
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
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (visibleEntries.length > 0) {
        selectedIdx = (selectedIdx + 1) % visibleEntries.length;
        renderList();
        listEl.querySelector('.quick-switcher-item--active')?.scrollIntoView({ block: 'nearest' });
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (visibleEntries.length > 0) {
        selectedIdx = (selectedIdx - 1 + visibleEntries.length) % visibleEntries.length;
        renderList();
        listEl.querySelector('.quick-switcher-item--active')?.scrollIntoView({ block: 'nearest' });
      }
    } else if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      const target = visibleEntries[selectedIdx];
      if (target) {
        selectEntry(target);
      }
    }
  };

  input.addEventListener('input', () => {
    selectedIdx = 0;
    renderList();
  });
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) {
      close();
    }
  });
  window.addEventListener('keydown', onKeyDown, true);

  renderList();
  requestAnimationFrame(() => {
    if (!closed) {
      backdrop.classList.add('modal-backdrop--visible');
      input.focus();
    }
  });
  return close;
}
