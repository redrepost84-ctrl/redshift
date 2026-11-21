import {
  apiModClaimTicket,
  apiModDecideAppeal,
  apiModFetchOverview,
  apiModFetchUserMessages,
  apiModFetchUsers,
  apiModFetchUserThreads,
  apiModKickUser,
  apiModPurgeUser,
  apiModResolveTicket,
  apiModSearchMessages,
  apiModSendBotDm,
  apiModUnsuspendUser,
  apiModUpdateUser,
  resolveMediaUrl,
  type StaffOverviewResponse,
} from './apiClient';
import { createCloseIconSvg, openConfirmPopup } from './chatUi';
import { isTopmostModal } from './modalShortcuts';
import { setDisplayNameWithRoleBadge } from './profileBadges';
import type {
  AccountRole,
  BotTicketCardData,
  ChatMessage,
  ModerationEvidenceItem,
  StaffThreadSummary,
  StaffUserSummary,
  UserStatus,
} from './types';

export type StaffPanelTab = 'tickets' | 'users' | 'logs' | 'bans' | 'audit';

export interface OpenStaffPanelOptions {
  selfUsername: string;
  selfRole: AccountRole;
  initialTab?: StaffPanelTab;
  initialTargetUsername?: string;
  resolveAvatar: (profile: { avatarPreset: number | null; avatarDataUrl?: string }) => string;
  onOpenModerateScreen: (
    target: { username: string; displayName: string; role?: AccountRole },
    mode: 'suspend' | 'terminate',
    preselectedEvidence?: ModerationEvidenceItem[],
  ) => void;
  onClosed?: () => void;
}

export interface StaffPanelHandle {
  close: () => void;
  refresh: () => void;
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function msgToEvidence(
  msg: ChatMessage,
  threadKey?: string,
  threadLabel?: string,
): ModerationEvidenceItem {
  const atts: Array<{ name: string; kind: string; url?: string }> = [];
  for (const a of msg.attachments ?? []) {
    atts.push({ name: a.name, kind: a.kind, url: a.url });
  }
  return {
    messageId: msg.id,
    threadKey,
    threadLabel,
    authorUsername: msg.authorUsername,
    content: msg.content || '',
    timestamp: msg.timestamp,
    attachments: atts.length > 0 ? atts : undefined,
    gifUrl: msg.gif?.url,
    gifTitle: msg.gif?.title,
  };
}

export function openStaffPanelModal(options: OpenStaffPanelOptions): StaffPanelHandle {
  const isDeveloper = options.selfRole === 'developer';
  const selfKey = options.selfUsername.toLowerCase();

  let activeTab: StaffPanelTab = options.initialTab ?? 'tickets';
  let overview: StaffOverviewResponse | null = null;
  let allUsers: StaffUserSummary[] = [];
  let selectedUsername = (options.initialTargetUsername ?? '').toLowerCase();
  let userSearchQuery = '';
  let userFilter = 'all';
  let ticketFilter: 'open' | 'all' = 'open';

  // Chat logs state
  let logsTargetUser = (options.initialTargetUsername ?? '').toLowerCase();
  let logsThreads: StaffThreadSummary[] = [];
  let logsSelectedThread: StaffThreadSummary | null = null;
  let logsMessages: ChatMessage[] = [];
  let logsGlobalQuery = '';
  let logsGlobalFrom = '';
  let logsGlobalResults: Array<{ threadKey: string; threadLabel: string; message: ChatMessage }> = [];
  const selectedLogEvidence = new Map<string, ModerationEvidenceItem>();

  let closed = false;

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop modal-backdrop--deep staff-panel-backdrop';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');

  const panel = document.createElement('div');
  panel.className = 'staff-panel-shell';

  const header = document.createElement('header');
  header.className = 'staff-panel-header';

  const titleWrap = document.createElement('div');
  titleWrap.className = 'staff-panel-title-wrap';
  const h2 = document.createElement('h2');
  h2.className = 'staff-panel-title';
  h2.textContent = isDeveloper ? 'Redshift Developer Sandbox & Admin Panel' : 'Redshift Moderator Sandbox Panel';
  const rolePill = document.createElement('span');
  rolePill.className = isDeveloper ? 'staff-role-pill staff-role-pill--dev' : 'staff-role-pill staff-role-pill--mod';
  rolePill.textContent = isDeveloper ? 'DEVELOPER' : 'MODERATOR';
  titleWrap.appendChild(h2);
  titleWrap.appendChild(rolePill);
  header.appendChild(titleWrap);

  const headerRight = document.createElement('div');
  headerRight.className = 'staff-panel-header-actions';
  const refreshBtn = document.createElement('button');
  refreshBtn.type = 'button';
  refreshBtn.className = 'btn-secondary staff-sm-btn';
  refreshBtn.textContent = 'Refresh';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'modal-close-btn';
  closeBtn.title = 'Close Staff Panel';
  closeBtn.appendChild(createCloseIconSvg(16));
  headerRight.appendChild(refreshBtn);
  headerRight.appendChild(closeBtn);
  header.appendChild(headerRight);
  panel.appendChild(header);

  const statsStrip = document.createElement('div');
  statsStrip.className = 'staff-stats-strip';
  panel.appendChild(statsStrip);

  const navBar = document.createElement('nav');
  navBar.className = 'staff-tab-bar';
  const tabs: Array<{ id: StaffPanelTab; label: string }> = [
    { id: 'tickets', label: 'Reports & Appeals' },
    { id: 'users', label: 'User Sandbox' },
    { id: 'logs', label: 'Chat Logs' },
    { id: 'bans', label: 'Active Bans' },
    { id: 'audit', label: 'Audit Log' },
  ];
  const tabBtns = new Map<StaffPanelTab, HTMLButtonElement>();
  for (const t of tabs) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'staff-tab-btn';
    btn.dataset.staffTab = t.id;
    btn.textContent = t.label;
    btn.addEventListener('click', () => {
      activeTab = t.id;
      syncTabButtons();
      renderBody();
    });
    tabBtns.set(t.id, btn);
    navBar.appendChild(btn);
  }
  panel.appendChild(navBar);

  const bodyHost = document.createElement('div');
  bodyHost.className = 'staff-panel-body';
  panel.appendChild(bodyHost);

  const syncTabButtons = () => {
    for (const [id, btn] of tabBtns.entries()) {
      btn.classList.toggle('staff-tab-btn--active', id === activeTab);
    }
  };
  syncTabButtons();

  const renderStatsStrip = () => {
    statsStrip.replaceChildren();
    if (!overview) return;
    const s = overview.stats;
    const cards = [
      { label: 'Users', val: s.totalAccounts, tone: '' },
      { label: 'Online', val: s.onlineUsers, tone: 'ok' },
      { label: 'Messages', val: s.totalMessages, tone: '' },
      { label: 'Open Reports', val: s.openReports, tone: s.openReports > 0 ? 'warn' : '' },
      { label: 'Pending Appeals', val: s.pendingAppeals, tone: s.pendingAppeals > 0 ? 'warn' : '' },
      { label: 'Suspended', val: s.activeSuspensions, tone: s.activeSuspensions > 0 ? 'danger' : '' },
      { label: 'Terminated', val: s.terminatedAccounts, tone: s.terminatedAccounts > 0 ? 'danger' : '' },
    ];
    for (const c of cards) {
      const el = document.createElement('div');
      el.className = c.tone ? `staff-stat-chip staff-stat-chip--${c.tone}` : 'staff-stat-chip';
      const v = document.createElement('strong');
      v.textContent = String(c.val);
      const l = document.createElement('span');
      l.textContent = c.label;
      el.appendChild(v);
      el.appendChild(l);
      statsStrip.appendChild(el);
    }
  };

  const loadAllData = async () => {
    const [ovRes, usersRes] = await Promise.all([apiModFetchOverview(), apiModFetchUsers('', 'all')]);
    if (closed) return;
    if (ovRes.ok && ovRes.overview) {
      overview = ovRes.overview;
      renderStatsStrip();
    }
    if (usersRes.ok && usersRes.users) {
      allUsers = usersRes.users;
      if (!selectedUsername && allUsers.length > 0) {
        selectedUsername =
          allUsers.find((u) => !u.isSystemBot)?.username.toLowerCase() ??
          allUsers[0].username.toLowerCase();
      }
    }
    renderBody();
  };

  const openLogsForUser = async (username: string) => {
    logsTargetUser = username.toLowerCase();
    activeTab = 'logs';
    logsSelectedThread = null;
    logsMessages = [];
    selectedLogEvidence.clear();
    syncTabButtons();
    renderBody();
    const res = await apiModFetchUserThreads(logsTargetUser);
    if (closed) return;
    logsThreads = res.ok && res.threads ? res.threads : [];
    renderBody();
  };

  const renderTicketsTab = () => {
    const wrap = document.createElement('div');
    wrap.className = 'staff-tickets-wrap';

    const toolbar = document.createElement('div');
    toolbar.className = 'staff-toolbar';
    const openOnlyBtn = document.createElement('button');
    openOnlyBtn.type = 'button';
    openOnlyBtn.className = ticketFilter === 'open' ? 'btn-primary staff-sm-btn' : 'btn-secondary staff-sm-btn';
    openOnlyBtn.textContent = 'Open & Claimed';
    openOnlyBtn.addEventListener('click', () => {
      ticketFilter = 'open';
      renderBody();
    });
    const allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.className = ticketFilter === 'all' ? 'btn-primary staff-sm-btn' : 'btn-secondary staff-sm-btn';
    allBtn.textContent = 'All History';
    allBtn.addEventListener('click', () => {
      ticketFilter = 'all';
      renderBody();
    });
    toolbar.appendChild(openOnlyBtn);
    toolbar.appendChild(allBtn);
    wrap.appendChild(toolbar);

    const list = (overview?.tickets ?? []).filter((t) =>
      ticketFilter === 'open' ? t.status === 'open' || t.status === 'claimed' : true,
    );

    if (list.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'staff-empty-state';
      empty.textContent =
        ticketFilter === 'open'
          ? 'All caught up — no open reports or appeals right now.'
          : 'No reports or appeals have been submitted yet.';
      wrap.appendChild(empty);
      bodyHost.appendChild(wrap);
      return;
    }

    const grid = document.createElement('div');
    grid.className = 'staff-tickets-grid';
    for (const ticket of list) {
      grid.appendChild(buildTicketCard(ticket));
    }
    wrap.appendChild(grid);
    bodyHost.appendChild(wrap);
  };

  const buildTicketCard = (ticket: BotTicketCardData): HTMLElement => {
    const card = document.createElement('article');
    card.className = `staff-ticket-card staff-ticket-card--${ticket.kind}`;

    const top = document.createElement('div');
    top.className = 'staff-ticket-top';
    const kindBadge = document.createElement('span');
    kindBadge.className =
      ticket.kind === 'appeal' ? 'staff-pill staff-pill--appeal' : 'staff-pill staff-pill--report';
    kindBadge.textContent = ticket.kind === 'appeal' ? `APPEAL · ${ticket.ticketId}` : `REPORT · ${ticket.ticketId}`;
    const statusBadge = document.createElement('span');
    statusBadge.className = `staff-pill staff-pill--status-${ticket.status}`;
    statusBadge.textContent =
      ticket.status === 'claimed' && ticket.claimedBy
        ? `Claimed by @${ticket.claimedBy}`
        : ticket.status.toUpperCase();
    top.appendChild(kindBadge);
    top.appendChild(statusBadge);
    card.appendChild(top);

    const meta = document.createElement('div');
    meta.className = 'staff-ticket-meta';
    meta.textContent =
      ticket.kind === 'appeal'
        ? `Account: ${ticket.targetDisplayName} (@${ticket.targetUsername}) · ${fmtTime(ticket.createdAt)}`
        : `Target: ${ticket.targetDisplayName} (@${ticket.targetUsername}) · Reported by @${ticket.reporterUsername ?? 'unknown'} · ${fmtTime(ticket.createdAt)}`;
    card.appendChild(meta);

    const reasonEl = document.createElement('div');
    reasonEl.className = 'staff-ticket-reason';
    reasonEl.textContent = `Reason: ${ticket.reason}`;
    card.appendChild(reasonEl);

    const detailsEl = document.createElement('div');
    detailsEl.className = 'staff-ticket-details';
    detailsEl.textContent = ticket.details;
    card.appendChild(detailsEl);

    if (ticket.reportedMessage) {
      const repBox = document.createElement('div');
      repBox.className = 'staff-ticket-evidence';
      repBox.textContent = `Reported Message: "${ticket.reportedMessage.content || '[Media]'}"`;
      card.appendChild(repBox);
    }

    if (ticket.moderationSnapshot) {
      const snapBox = document.createElement('div');
      snapBox.className = 'staff-ticket-evidence';
      snapBox.textContent = `Original Action: ${
        ticket.moderationSnapshot.status === 'terminated'
          ? 'Account Terminated'
          : `Suspended (${ticket.moderationSnapshot.durationLabel})`
      }${ticket.moderationSnapshot.moderatorNote ? ` · Note: "${ticket.moderationSnapshot.moderatorNote}"` : ''}`;
      card.appendChild(snapBox);
    }

    if (ticket.decisionNote) {
      const decEl = document.createElement('div');
      decEl.className = 'staff-ticket-decision';
      decEl.textContent = `Outcome (${ticket.decidedBy ? `@${ticket.decidedBy}` : 'Staff'}): ${ticket.decisionNote}`;
      card.appendChild(decEl);
    }

    const actions = document.createElement('div');
    actions.className = 'staff-ticket-actions';

    const isOpen = ticket.status === 'open';
    const isClaimedBySelf = Boolean(ticket.claimedBy && ticket.claimedBy.toLowerCase() === selfKey);
    const canAct = isClaimedBySelf || (isDeveloper && ticket.status === 'claimed');

    if (isOpen) {
      const claimBtn = document.createElement('button');
      claimBtn.type = 'button';
      claimBtn.className = 'btn-primary staff-sm-btn';
      claimBtn.textContent = 'Take Request';
      claimBtn.addEventListener('click', async () => {
        claimBtn.disabled = true;
        await apiModClaimTicket(ticket.ticketId);
        await loadAllData();
      });
      actions.appendChild(claimBtn);
    }

    const inspectUserBtn = document.createElement('button');
    inspectUserBtn.type = 'button';
    inspectUserBtn.className = 'btn-secondary staff-sm-btn';
    inspectUserBtn.textContent = 'Inspect User';
    inspectUserBtn.addEventListener('click', () => {
      selectedUsername = ticket.targetUsername.toLowerCase();
      activeTab = 'users';
      syncTabButtons();
      renderBody();
    });
    actions.appendChild(inspectUserBtn);

    const viewLogsBtn = document.createElement('button');
    viewLogsBtn.type = 'button';
    viewLogsBtn.className = 'btn-secondary staff-sm-btn';
    viewLogsBtn.textContent = 'Chat Logs';
    viewLogsBtn.addEventListener('click', () => {
      void openLogsForUser(ticket.targetUsername);
    });
    actions.appendChild(viewLogsBtn);

    if (ticket.kind === 'report' && (isOpen || canAct)) {
      const resolveBtn = document.createElement('button');
      resolveBtn.type = 'button';
      resolveBtn.className = 'btn-secondary staff-sm-btn';
      resolveBtn.textContent = 'Mark Resolved';
      resolveBtn.addEventListener('click', async () => {
        const ok = await openConfirmPopup({
          title: `Resolve Report ${ticket.ticketId}?`,
          message: `Mark report against @${ticket.targetUsername} as resolved?`,
          confirmLabel: 'Resolve',
        });
        if (!ok) return;
        await apiModResolveTicket(ticket.ticketId);
        await loadAllData();
      });
      actions.appendChild(resolveBtn);
    }

    if (ticket.kind === 'appeal' && ticket.status === 'claimed' && canAct) {
      const acceptBtn = document.createElement('button');
      acceptBtn.type = 'button';
      acceptBtn.className = 'btn-primary staff-sm-btn';
      acceptBtn.textContent = 'Accept Appeal';
      acceptBtn.addEventListener('click', async () => {
        const ok = await openConfirmPopup({
          title: `Accept Appeal ${ticket.ticketId}?`,
          message: `Accept @${ticket.targetUsername}'s appeal and immediately restore their account?`,
          confirmLabel: 'Accept & Restore',
        });
        if (!ok) return;
        await apiModDecideAppeal(ticket.ticketId, 'accepted');
        await loadAllData();
      });

      const denyBtn = document.createElement('button');
      denyBtn.type = 'button';
      denyBtn.className = 'btn-danger staff-sm-btn';
      denyBtn.textContent = 'Deny Appeal';
      denyBtn.addEventListener('click', async () => {
        const ok = await openConfirmPopup({
          title: `Deny Appeal ${ticket.ticketId}?`,
          message: `Deny @${ticket.targetUsername}'s appeal? Their suspension/termination will remain in place.`,
          confirmLabel: 'Deny Appeal',
          danger: true,
        });
        if (!ok) return;
        await apiModDecideAppeal(ticket.ticketId, 'denied');
        await loadAllData();
      });
      actions.appendChild(acceptBtn);
      actions.appendChild(denyBtn);
    }

    card.appendChild(actions);
    return card;
  };

  const renderUsersSandboxTab = () => {
    const split = document.createElement('div');
    split.className = 'staff-sandbox-split';

    // Left: Searchable user directory
    const left = document.createElement('div');
    left.className = 'staff-sandbox-list-pane';

    const searchRow = document.createElement('div');
    searchRow.className = 'staff-sandbox-search-row';
    const searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.className = 'auth-input';
    searchInput.placeholder = 'Search username, display name, email...';
    searchInput.value = userSearchQuery;
    const filterSel = document.createElement('select');
    filterSel.className = 'auth-input mod-select';
    for (const optDef of [
      { v: 'all', l: 'All' },
      { v: 'online', l: 'Online' },
      { v: 'suspended', l: 'Suspended' },
      { v: 'terminated', l: 'Terminated' },
      { v: 'staff', l: 'Staff' },
    ]) {
      const o = document.createElement('option');
      o.value = optDef.v;
      o.textContent = optDef.l;
      if (optDef.v === userFilter) o.selected = true;
      filterSel.appendChild(o);
    }
    searchRow.appendChild(searchInput);
    searchRow.appendChild(filterSel);
    left.appendChild(searchRow);

    const listHost = document.createElement('div');
    listHost.className = 'staff-sandbox-user-list';
    left.appendChild(listHost);

    // Right: Sandbox user inspector & live editor
    const right = document.createElement('div');
    right.className = 'staff-sandbox-editor-pane';

    const renderListOnly = () => {
      listHost.replaceChildren();
      const q = userSearchQuery.trim().toLowerCase();
      const filtered = allUsers.filter((u) => {
        if (userFilter === 'suspended' && u.moderation?.status !== 'suspended') return false;
        if (userFilter === 'terminated' && u.moderation?.status !== 'terminated') return false;
        if (userFilter === 'staff' && u.role !== 'developer' && u.role !== 'moderator') return false;
        if (userFilter === 'online' && !u.online) return false;
        if (!q) return true;
        return (
          u.username.toLowerCase().includes(q) ||
          u.displayName.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q)
        );
      });

      for (const u of filtered) {
        const uKey = u.username.toLowerCase();
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className =
          uKey === selectedUsername
            ? 'staff-user-row staff-user-row--active'
            : 'staff-user-row';

        const av = document.createElement('img');
        av.className = 'staff-user-avatar';
        av.src = options.resolveAvatar(u);
        av.alt = u.displayName;
        btn.appendChild(av);

        const textWrap = document.createElement('div');
        textWrap.className = 'staff-user-row-text';
        const nameLine = document.createElement('div');
        nameLine.className = 'staff-user-row-name';
        setDisplayNameWithRoleBadge(nameLine, u.displayName, u, { badgeSize: 13 });
        const subLine = document.createElement('div');
        subLine.className = 'staff-user-row-sub';
        subLine.textContent = `@${u.username} · ${u.online ? 'Online' : 'Offline'}`;
        textWrap.appendChild(nameLine);
        textWrap.appendChild(subLine);
        btn.appendChild(textWrap);

        if (u.moderation) {
          const badge = document.createElement('span');
          badge.className =
            u.moderation.status === 'terminated'
              ? 'staff-pill staff-pill--status-denied'
              : 'staff-pill staff-pill--report';
          badge.textContent = u.moderation.status === 'terminated' ? 'TERM' : 'SUSP';
          btn.appendChild(badge);
        }

        btn.addEventListener('click', () => {
          selectedUsername = uKey;
          renderListOnly();
          renderEditorOnly();
        });
        listHost.appendChild(btn);
      }
    };

    const renderEditorOnly = () => {
      right.replaceChildren();
      const target = allUsers.find((u) => u.username.toLowerCase() === selectedUsername);
      if (!target) {
        const empty = document.createElement('div');
        empty.className = 'staff-empty-state';
        empty.textContent = 'Select a user from the list to inspect or edit.';
        right.appendChild(empty);
        return;
      }

      const targetKey = target.username.toLowerCase();
      const isProtectedDev = target.role === 'developer' && !isDeveloper;
      const isOtherMod = target.role === 'moderator' && !isDeveloper && targetKey !== selfKey;
      const canEdit = !target.isSystemBot && !isProtectedDev && !isOtherMod;
      const canModerate =
        !target.isSystemBot &&
        target.role !== 'developer' &&
        targetKey !== selfKey &&
        (isDeveloper || target.role !== 'moderator');

      // Profile header card
      const head = document.createElement('div');
      head.className = 'staff-editor-head';
      const av = document.createElement('img');
      av.className = 'staff-editor-avatar';
      av.src = options.resolveAvatar(target);
      av.alt = target.displayName;
      const headInfo = document.createElement('div');
      headInfo.className = 'staff-editor-head-info';
      const titleLine = document.createElement('div');
      titleLine.className = 'staff-editor-name';
      setDisplayNameWithRoleBadge(titleLine, target.displayName, target, { badgeSize: 16 });
      const metaLine = document.createElement('div');
      metaLine.className = 'staff-editor-meta';
      metaLine.textContent = `@${target.username} · Created ${fmtTime(target.createdAt)} · ${target.friendCount} friends · ${target.activeSessions} active session(s)`;
      headInfo.appendChild(titleLine);
      headInfo.appendChild(metaLine);
      head.appendChild(av);
      head.appendChild(headInfo);
      right.appendChild(head);

      // Active moderation banner + Unsuspend button
      if (target.moderation) {
        const banBanner = document.createElement('div');
        banBanner.className = 'staff-active-ban-banner';
        const banInfo = document.createElement('div');
        banInfo.innerHTML = '';
        const bStrong = document.createElement('strong');
        bStrong.textContent =
          target.moderation.status === 'terminated'
            ? 'ACCOUNT TERMINATED'
            : `ACCOUNT SUSPENDED (${target.moderation.durationLabel})`;
        const bSub = document.createElement('div');
        bSub.textContent = `Reason: ${target.moderation.reason}${
          target.moderation.expiresAt ? ` · Reactivates ${fmtTime(target.moderation.expiresAt)}` : ''
        }${target.moderation.moderatorNote ? ` · Note: "${target.moderation.moderatorNote}"` : ''}`;
        banInfo.appendChild(bStrong);
        banInfo.appendChild(bSub);

        const unsuspendBtn = document.createElement('button');
        unsuspendBtn.type = 'button';
        unsuspendBtn.className = 'btn-primary staff-sm-btn';
        unsuspendBtn.textContent =
          target.moderation.status === 'terminated' ? 'Restore Account' : 'Unsuspend User';
        unsuspendBtn.addEventListener('click', async () => {
          const ok = await openConfirmPopup({
            title: `Restore @${target.username}?`,
            message: `Immediately remove moderation lockout on @${target.username} so they can sign in again?`,
            confirmLabel: 'Restore Account',
          });
          if (!ok) return;
          await apiModUnsuspendUser(target.username);
          await loadAllData();
        });
        banBanner.appendChild(banInfo);
        banBanner.appendChild(unsuspendBtn);
        right.appendChild(banBanner);
      }

      // Quick Action Bar
      const quickBar = document.createElement('div');
      quickBar.className = 'staff-editor-quick-actions';

      const logsBtn = document.createElement('button');
      logsBtn.type = 'button';
      logsBtn.className = 'btn-secondary staff-sm-btn';
      logsBtn.textContent = 'Read Chat Logs';
      logsBtn.disabled = isProtectedDev;
      logsBtn.addEventListener('click', () => {
        void openLogsForUser(target.username);
      });
      quickBar.appendChild(logsBtn);

      if (!target.isSystemBot) {
        const botDmBtn = document.createElement('button');
        botDmBtn.type = 'button';
        botDmBtn.className = 'btn-secondary staff-sm-btn';
        botDmBtn.textContent = 'Send Bot DM';
        botDmBtn.addEventListener('click', async () => {
          const msg = window.prompt(`Send an official Redshift Bot DM to @${target.username}:`);
          if (!msg || !msg.trim()) return;
          await apiModSendBotDm(target.username, msg.trim());
          await loadAllData();
        });
        quickBar.appendChild(botDmBtn);
      }

      if (canModerate) {
        const kickBtn = document.createElement('button');
        kickBtn.type = 'button';
        kickBtn.className = 'btn-secondary staff-sm-btn';
        kickBtn.textContent = 'Force Sign Out';
        kickBtn.addEventListener('click', async () => {
          await apiModKickUser(target.username);
          await loadAllData();
        });
        quickBar.appendChild(kickBtn);

        const suspBtn = document.createElement('button');
        suspBtn.type = 'button';
        suspBtn.className = 'btn-danger staff-sm-btn';
        suspBtn.textContent = 'Suspend Account';
        suspBtn.addEventListener('click', () => {
          close();
          options.onOpenModerateScreen(
            { username: target.username, displayName: target.displayName, role: target.role },
            'suspend',
          );
        });
        quickBar.appendChild(suspBtn);

        const termBtn = document.createElement('button');
        termBtn.type = 'button';
        termBtn.className = 'btn-danger staff-sm-btn';
        termBtn.textContent = 'Delete / Terminate';
        termBtn.addEventListener('click', () => {
          close();
          options.onOpenModerateScreen(
            { username: target.username, displayName: target.displayName, role: target.role },
            'terminate',
          );
        });
        quickBar.appendChild(termBtn);
      }

      if (isDeveloper && !target.isSystemBot && target.role !== 'developer') {
        const purgeBtn = document.createElement('button');
        purgeBtn.type = 'button';
        purgeBtn.className = 'btn-danger staff-sm-btn';
        purgeBtn.textContent = 'Permanent Purge';
        purgeBtn.addEventListener('click', async () => {
          const ok = await openConfirmPopup({
            title: `Permanently Purge @${target.username}?`,
            message: `This permanently deletes @${target.username} from the database and cannot be appealed or undone.`,
            confirmLabel: 'Purge Forever',
            danger: true,
            confirmDelaySeconds: 5,
          });
          if (!ok) return;
          await apiModPurgeUser(target.username);
          selectedUsername = '';
          await loadAllData();
        });
        quickBar.appendChild(purgeBtn);
      }
      right.appendChild(quickBar);

      // Sandbox Editable Fields Form
      const form = document.createElement('form');
      form.className = 'staff-sandbox-form';
      form.noValidate = true;

      const makeField = (labelText: string, inputEl: HTMLElement) => {
        const g = document.createElement('div');
        g.className = 'mod-field-group';
        const l = document.createElement('label');
        l.className = 'mod-field-label';
        l.textContent = labelText;
        g.appendChild(l);
        g.appendChild(inputEl);
        return g;
      };

      const displayInput = document.createElement('input');
      displayInput.type = 'text';
      displayInput.className = 'auth-input';
      displayInput.value = target.displayName;
      displayInput.disabled = !canEdit;

      const usernameInput = document.createElement('input');
      usernameInput.type = 'text';
      usernameInput.className = 'auth-input';
      usernameInput.value = target.username;
      usernameInput.disabled = !canEdit || target.role === 'developer';

      const emailInput = document.createElement('input');
      emailInput.type = 'email';
      emailInput.className = 'auth-input';
      emailInput.value = target.email;
      emailInput.disabled = !canEdit;

      const passwordInput = document.createElement('input');
      passwordInput.type = 'text';
      passwordInput.className = 'auth-input';
      passwordInput.placeholder = 'Leave blank to keep current password (min 6 chars to change)';
      passwordInput.disabled = !canEdit;

      const bioInput = document.createElement('textarea');
      bioInput.className = 'auth-input mod-textarea';
      bioInput.rows = 2;
      bioInput.value = target.bio;
      bioInput.disabled = !canEdit;

      const statusSel = document.createElement('select');
      statusSel.className = 'auth-input mod-select';
      statusSel.disabled = !canEdit;
      for (const st of ['online', 'idle', 'dnd', 'invisible'] as UserStatus[]) {
        const o = document.createElement('option');
        o.value = st;
        o.textContent = st;
        if (st === target.rawStatus) o.selected = true;
        statusSel.appendChild(o);
      }

      const row1 = document.createElement('div');
      row1.className = 'mod-field-row';
      row1.appendChild(makeField('Display Name', displayInput));
      row1.appendChild(makeField('Username (@handle)', usernameInput));
      form.appendChild(row1);

      const row2 = document.createElement('div');
      row2.className = 'mod-field-row';
      row2.appendChild(makeField('Email Address', emailInput));
      row2.appendChild(makeField('Set New Password', passwordInput));
      form.appendChild(row2);

      const row3 = document.createElement('div');
      row3.className = 'mod-field-row';
      row3.appendChild(makeField('Account Status', statusSel));

      let roleSel: HTMLSelectElement | null = null;
      if (isDeveloper && !target.isSystemBot && target.role !== 'developer') {
        roleSel = document.createElement('select');
        roleSel.className = 'auth-input mod-select';
        for (const rOpt of [
          { v: 'user', l: 'Regular User' },
          { v: 'moderator', l: 'Moderator (White Hammer)' },
        ]) {
          const o = document.createElement('option');
          o.value = rOpt.v;
          o.textContent = rOpt.l;
          if ((target.role === 'moderator' ? 'moderator' : 'user') === rOpt.v) o.selected = true;
          roleSel.appendChild(o);
        }
        row3.appendChild(makeField('Staff Role (Developer Only)', roleSel));
      }
      form.appendChild(row3);
      form.appendChild(makeField('Bio', bioInput));

      const formFeedback = document.createElement('div');
      formFeedback.className = 'mod-form-feedback';
      formFeedback.hidden = true;
      form.appendChild(formFeedback);

      if (canEdit) {
        const saveBtn = document.createElement('button');
        saveBtn.type = 'submit';
        saveBtn.className = 'btn-primary';
        saveBtn.textContent = 'Save Sandbox Changes';
        form.appendChild(saveBtn);

        form.addEventListener('submit', async (ev) => {
          ev.preventDefault();
          formFeedback.hidden = true;
          saveBtn.disabled = true;
          saveBtn.textContent = 'Saving...';
          const res = await apiModUpdateUser({
            username: target.username,
            displayName: displayInput.value.trim(),
            newUsername: usernameInput.value.trim(),
            email: emailInput.value.trim(),
            newPassword: passwordInput.value || undefined,
            bio: bioInput.value,
            status: statusSel.value as UserStatus,
            role: roleSel ? (roleSel.value as 'moderator' | 'user') : undefined,
          });
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save Sandbox Changes';
          if (!res.ok || !res.user) {
            formFeedback.textContent = res.error ?? 'Could not save user changes.';
            formFeedback.className = 'mod-form-feedback mod-form-feedback--error';
            formFeedback.hidden = false;
            return;
          }
          selectedUsername = res.user.username.toLowerCase();
          passwordInput.value = '';
          formFeedback.textContent = 'Account updated successfully.';
          formFeedback.className = 'mod-form-feedback mod-form-feedback--ok';
          formFeedback.hidden = false;
          await loadAllData();
        });
      }
      right.appendChild(form);

      // Moderation History
      if (target.moderationHistory.length > 0) {
        const histTitle = document.createElement('h4');
        histTitle.className = 'staff-sub-heading';
        histTitle.textContent = `Moderation History (${target.moderationHistory.length})`;
        right.appendChild(histTitle);

        const histList = document.createElement('div');
        histList.className = 'staff-history-list';
        for (const h of target.moderationHistory) {
          const item = document.createElement('div');
          item.className = 'staff-history-item';
          item.textContent = `[${fmtTime(h.timestamp)}] ${h.action.toUpperCase()} by @${h.actorUsername}${
            h.durationLabel ? ` (${h.durationLabel})` : ''
          }${h.reason ? ` — ${h.reason}` : ''}${h.moderatorNote ? ` · Note: "${h.moderatorNote}"` : ''}`;
          histList.appendChild(item);
        }
        right.appendChild(histList);
      }
    };

    searchInput.addEventListener('input', () => {
      userSearchQuery = searchInput.value;
      renderListOnly();
    });
    filterSel.addEventListener('change', () => {
      userFilter = filterSel.value;
      renderListOnly();
    });

    renderListOnly();
    renderEditorOnly();

    split.appendChild(left);
    split.appendChild(right);
    bodyHost.appendChild(split);
  };

  const renderChatLogsTab = () => {
    const wrap = document.createElement('div');
    wrap.className = 'staff-logs-wrap';

    // Top bar: Inspect user threads OR Global search
    const topBar = document.createElement('div');
    topBar.className = 'staff-logs-controls';

    const userSel = document.createElement('select');
    userSel.className = 'auth-input mod-select';
    const defOpt = document.createElement('option');
    defOpt.value = '';
    defOpt.textContent = 'Inspect a user\'s conversations...';
    userSel.appendChild(defOpt);
    for (const u of allUsers) {
      if (u.role === 'developer' && !isDeveloper) continue;
      const o = document.createElement('option');
      o.value = u.username.toLowerCase();
      o.textContent = `${u.displayName} (@${u.username})`;
      if (o.value === logsTargetUser) o.selected = true;
      userSel.appendChild(o);
    }
    userSel.addEventListener('change', () => {
      if (userSel.value) {
        void openLogsForUser(userSel.value);
      }
    });

    const qInput = document.createElement('input');
    qInput.type = 'search';
    qInput.className = 'auth-input';
    qInput.placeholder = 'Global search message text...';
    qInput.value = logsGlobalQuery;

    const fromInput = document.createElement('input');
    fromInput.type = 'text';
    fromInput.className = 'auth-input';
    fromInput.placeholder = 'from:username (optional)';
    fromInput.value = logsGlobalFrom;

    const searchBtn = document.createElement('button');
    searchBtn.type = 'button';
    searchBtn.className = 'btn-primary staff-sm-btn';
    searchBtn.textContent = 'Search Logs';
    searchBtn.addEventListener('click', async () => {
      logsGlobalQuery = qInput.value.trim();
      logsGlobalFrom = fromInput.value.trim();
      logsSelectedThread = null;
      const res = await apiModSearchMessages({
        q: logsGlobalQuery,
        from: logsGlobalFrom,
        limit: 120,
      });
      if (closed) return;
      logsGlobalResults = res.ok && res.results ? res.results : [];
      renderBody();
    });

    topBar.appendChild(userSel);
    topBar.appendChild(qInput);
    topBar.appendChild(fromInput);
    topBar.appendChild(searchBtn);
    wrap.appendChild(topBar);

    // Action bar for selected evidence checkboxes
    if (selectedLogEvidence.size > 0) {
      const selBar = document.createElement('div');
      selBar.className = 'staff-selected-evidence-bar';
      const firstEv = Array.from(selectedLogEvidence.values())[0];
      const inferredUser = firstEv?.authorUsername || logsTargetUser;
      const selText = document.createElement('span');
      selText.textContent = `${selectedLogEvidence.size} message(s) selected as evidence (author: @${inferredUser || 'user'})`;

      const goSuspendBtn = document.createElement('button');
      goSuspendBtn.type = 'button';
      goSuspendBtn.className = 'btn-danger staff-sm-btn';
      goSuspendBtn.textContent = 'Suspend w/ Selected';
      goSuspendBtn.addEventListener('click', () => {
        const targetAcc = allUsers.find((u) => u.username.toLowerCase() === (inferredUser || '').toLowerCase());
        if (!targetAcc) return;
        close();
        options.onOpenModerateScreen(
          { username: targetAcc.username, displayName: targetAcc.displayName, role: targetAcc.role },
          'suspend',
          Array.from(selectedLogEvidence.values()),
        );
      });

      const goTermBtn = document.createElement('button');
      goTermBtn.type = 'button';
      goTermBtn.className = 'btn-danger staff-sm-btn';
      goTermBtn.textContent = 'Terminate w/ Selected';
      goTermBtn.addEventListener('click', () => {
        const targetAcc = allUsers.find((u) => u.username.toLowerCase() === (inferredUser || '').toLowerCase());
        if (!targetAcc) return;
        close();
        options.onOpenModerateScreen(
          { username: targetAcc.username, displayName: targetAcc.displayName, role: targetAcc.role },
          'terminate',
          Array.from(selectedLogEvidence.values()),
        );
      });

      const clearSelBtn = document.createElement('button');
      clearSelBtn.type = 'button';
      clearSelBtn.className = 'btn-secondary staff-sm-btn';
      clearSelBtn.textContent = 'Clear';
      clearSelBtn.addEventListener('click', () => {
        selectedLogEvidence.clear();
        renderBody();
      });

      selBar.appendChild(selText);
      selBar.appendChild(goSuspendBtn);
      selBar.appendChild(goTermBtn);
      selBar.appendChild(clearSelBtn);
      wrap.appendChild(selBar);
    }

    const split = document.createElement('div');
    split.className = 'staff-logs-split';

    const threadCol = document.createElement('div');
    threadCol.className = 'staff-logs-threads';
    if (logsThreads.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'staff-empty-state';
      empty.textContent = logsTargetUser
        ? `No conversations found for @${logsTargetUser}.`
        : 'Choose a user above to list their DMs and Group Chats.';
      threadCol.appendChild(empty);
    } else {
      for (const th of logsThreads) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className =
          logsSelectedThread?.threadKey === th.threadKey
            ? 'staff-thread-row staff-thread-row--active'
            : 'staff-thread-row';
        const l1 = document.createElement('div');
        l1.className = 'staff-thread-row-title';
        l1.textContent = th.label;
        const l2 = document.createElement('div');
        l2.className = 'staff-thread-row-sub';
        l2.textContent = `${th.messageCount} msgs · ${th.lastPreview || 'No preview'}`;
        btn.appendChild(l1);
        btn.appendChild(l2);
        btn.addEventListener('click', async () => {
          logsSelectedThread = th;
          logsGlobalResults = [];
          const res = await apiModFetchUserMessages({
            username: logsTargetUser,
            threadKey: th.threadKey,
            limit: 200,
          });
          if (closed) return;
          logsMessages = res.ok && res.messages ? res.messages : [];
          renderBody();
        });
        threadCol.appendChild(btn);
      }
    }

    const msgCol = document.createElement('div');
    msgCol.className = 'staff-logs-messages';
    const renderLogMsgRow = (msg: ChatMessage, threadKey: string, threadLabel: string) => {
      const evKey = `msg:${msg.id}`;
      const row = document.createElement('label');
      row.className = selectedLogEvidence.has(evKey)
        ? 'staff-log-msg-row staff-log-msg-row--selected'
        : 'staff-log-msg-row';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = selectedLogEvidence.has(evKey);
      cb.addEventListener('change', () => {
        if (cb.checked) {
          selectedLogEvidence.set(evKey, msgToEvidence(msg, threadKey, threadLabel));
        } else {
          selectedLogEvidence.delete(evKey);
        }
        renderBody();
      });
      const body = document.createElement('div');
      body.className = 'staff-log-msg-body';
      const head = document.createElement('div');
      head.className = 'staff-log-msg-head';
      const authorSpan = document.createElement('strong');
      setDisplayNameWithRoleBadge(authorSpan, `${msg.authorName} (@${msg.authorUsername})`, {
        username: msg.authorUsername,
        role: msg.authorRole,
      }, { badgeSize: 13 });
      const timeSpan = document.createElement('span');
      timeSpan.textContent = `${threadLabel} · ${fmtTime(msg.timestamp)}`;
      head.appendChild(authorSpan);
      head.appendChild(timeSpan);
      body.appendChild(head);

      if (msg.content) {
        const text = document.createElement('div');
        text.className = 'staff-log-msg-text';
        text.textContent = msg.content;
        body.appendChild(text);
      }
      if (msg.gif) {
        const gImg = document.createElement('img');
        gImg.src = resolveMediaUrl(msg.gif.url);
        gImg.alt = msg.gif.title || 'GIF';
        gImg.className = 'staff-log-msg-thumb';
        body.appendChild(gImg);
      }
      for (const att of msg.attachments ?? []) {
        if (att.kind === 'image') {
          const img = document.createElement('img');
          img.src = resolveMediaUrl(att.url);
          img.alt = att.name;
          img.className = 'staff-log-msg-thumb';
          body.appendChild(img);
        } else {
          const chip = document.createElement('div');
          chip.className = 'staff-log-msg-att';
          chip.textContent = `[${att.kind.toUpperCase()}] ${att.name}`;
          body.appendChild(chip);
        }
      }
      row.appendChild(cb);
      row.appendChild(body);
      return row;
    };

    if (logsGlobalResults.length > 0) {
      for (const hit of logsGlobalResults) {
        msgCol.appendChild(renderLogMsgRow(hit.message, hit.threadKey, hit.threadLabel));
      }
    } else if (logsSelectedThread) {
      if (logsMessages.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'staff-empty-state';
        empty.textContent = 'This conversation has no messages.';
        msgCol.appendChild(empty);
      } else {
        for (const m of logsMessages) {
          msgCol.appendChild(
            renderLogMsgRow(m, logsSelectedThread.threadKey, logsSelectedThread.label),
          );
        }
      }
    } else {
      const empty = document.createElement('div');
      empty.className = 'staff-empty-state';
      empty.textContent = 'Select a conversation on the left or run a global log search above.';
      msgCol.appendChild(empty);
    }

    split.appendChild(threadCol);
    split.appendChild(msgCol);
    wrap.appendChild(split);
    bodyHost.appendChild(wrap);
  };

  const renderActiveBansTab = () => {
    const moderated = allUsers.filter((u) => Boolean(u.moderation));
    if (moderated.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'staff-empty-state';
      empty.textContent = 'No users are currently suspended or terminated.';
      bodyHost.appendChild(empty);
      return;
    }
    const grid = document.createElement('div');
    grid.className = 'staff-tickets-grid';
    for (const u of moderated) {
      const mod = u.moderation!;
      const card = document.createElement('div');
      card.className = 'staff-ticket-card';
      const top = document.createElement('div');
      top.className = 'staff-ticket-top';
      const nameWrap = document.createElement('strong');
      nameWrap.textContent = `${u.displayName} (@${u.username})`;
      const pill = document.createElement('span');
      pill.className =
        mod.status === 'terminated'
          ? 'staff-pill staff-pill--status-denied'
          : 'staff-pill staff-pill--report';
      pill.textContent = mod.status === 'terminated' ? 'TERMINATED' : `SUSPENDED (${mod.durationLabel})`;
      top.appendChild(nameWrap);
      top.appendChild(pill);
      card.appendChild(top);

      const details = document.createElement('div');
      details.className = 'staff-ticket-meta';
      details.textContent = `Reason: ${mod.reason} · Issued by @${mod.issuedBy} on ${fmtTime(mod.issuedAt)}${
        mod.expiresAt ? ` · Reactivates ${fmtTime(mod.expiresAt)}` : ''
      }`;
      card.appendChild(details);

      if (mod.moderatorNote) {
        const note = document.createElement('div');
        note.className = 'staff-ticket-evidence';
        note.textContent = `Moderator Note: "${mod.moderatorNote}"`;
        card.appendChild(note);
      }

      const actions = document.createElement('div');
      actions.className = 'staff-ticket-actions';
      const restoreBtn = document.createElement('button');
      restoreBtn.type = 'button';
      restoreBtn.className = 'btn-primary staff-sm-btn';
      restoreBtn.textContent = mod.status === 'terminated' ? 'Restore Account' : 'Unsuspend User';
      restoreBtn.addEventListener('click', async () => {
        const ok = await openConfirmPopup({
          title: `Restore @${u.username}?`,
          message: `Remove active moderation from @${u.username}?`,
          confirmLabel: 'Restore',
        });
        if (!ok) return;
        await apiModUnsuspendUser(u.username);
        await loadAllData();
      });
      const inspectBtn = document.createElement('button');
      inspectBtn.type = 'button';
      inspectBtn.className = 'btn-secondary staff-sm-btn';
      inspectBtn.textContent = 'Open in Sandbox';
      inspectBtn.addEventListener('click', () => {
        selectedUsername = u.username.toLowerCase();
        activeTab = 'users';
        syncTabButtons();
        renderBody();
      });
      actions.appendChild(restoreBtn);
      actions.appendChild(inspectBtn);
      card.appendChild(actions);
      grid.appendChild(card);
    }
    bodyHost.appendChild(grid);
  };

  const renderAuditLogTab = () => {
    const entries = overview?.auditLog ?? [];
    if (entries.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'staff-empty-state';
      empty.textContent = 'No staff audit events recorded yet.';
      bodyHost.appendChild(empty);
      return;
    }
    const list = document.createElement('div');
    list.className = 'staff-audit-list';
    for (const entry of entries) {
      const row = document.createElement('div');
      row.className = 'staff-audit-row';
      const left = document.createElement('div');
      left.className = 'staff-audit-main';
      const actorEl = document.createElement('strong');
      setDisplayNameWithRoleBadge(actorEl, `@${entry.actorUsername}`, {
        username: entry.actorUsername,
        role: entry.actorRole,
      }, { badgeSize: 13 });
      const sum = document.createElement('span');
      sum.textContent = ` · ${entry.summary}`;
      left.appendChild(actorEl);
      left.appendChild(sum);
      const time = document.createElement('span');
      time.className = 'staff-audit-time';
      time.textContent = fmtTime(entry.timestamp);
      row.appendChild(left);
      row.appendChild(time);
      list.appendChild(row);
    }
    bodyHost.appendChild(list);
  };

  const renderBody = () => {
    bodyHost.replaceChildren();
    switch (activeTab) {
      case 'tickets':
        renderTicketsTab();
        break;
      case 'users':
        renderUsersSandboxTab();
        break;
      case 'logs':
        renderChatLogsTab();
        break;
      case 'bans':
        renderActiveBansTab();
        break;
      case 'audit':
        renderAuditLogTab();
        break;
    }
  };

  const close = () => {
    if (closed) return;
    closed = true;
    window.removeEventListener('keydown', onKeyDown, true);
    backdrop.classList.remove('modal-backdrop--visible');
    window.setTimeout(() => backdrop.remove(), 180);
    options.onClosed?.();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!isTopmostModal(backdrop)) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      close();
    }
  };

  refreshBtn.addEventListener('click', () => {
    void loadAllData();
  });
  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', (ev) => {
    if (ev.target === backdrop) close();
  });
  window.addEventListener('keydown', onKeyDown, true);

  backdrop.appendChild(panel);
  document.body.appendChild(backdrop);
  requestAnimationFrame(() => {
    if (!closed) backdrop.classList.add('modal-backdrop--visible');
  });

  if (options.initialTab === 'logs' && options.initialTargetUsername) {
    void loadAllData().then(() => {
      if (!closed && options.initialTargetUsername) {
        void openLogsForUser(options.initialTargetUsername);
      }
    });
  } else {
    void loadAllData();
  }

  return {
    close,
    refresh: () => {
      if (!closed) void loadAllData();
    },
  };
}
