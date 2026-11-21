import type { ContextMenuItem } from './contextMenu';
import { resolveAccountRole } from './profileBadges';
import type { AccountRole, BotTicketCardData, ModerationEvidenceItem, SelfProfile } from './types';
import type { StaffPanelTab } from './staffPanelModal';

export interface WorkspaceModerationHandlers {
  getSelfProfile: () => SelfProfile | null;
  onReportUser: (
    target: { username: string; displayName: string; role?: AccountRole },
    reportedMessage?: ModerationEvidenceItem,
  ) => void;
  onModerateUser: (
    target: { username: string; displayName: string; role?: AccountRole },
    mode: 'suspend' | 'terminate',
    preselectedEvidence?: ModerationEvidenceItem[],
  ) => void;
  onOpenStaffPanel: (tab?: StaffPanelTab, targetUsername?: string) => void;
  onClaimTicket: (ticketId: string) => Promise<BotTicketCardData | null>;
  onResolveTicket: (ticketId: string) => Promise<BotTicketCardData | null>;
  onDecideAppeal: (
    ticketId: string,
    decision: 'accepted' | 'denied',
  ) => Promise<BotTicketCardData | null>;
}

let activeHandlers: WorkspaceModerationHandlers | null = null;

export function registerWorkspaceModerationHandlers(
  handlers: WorkspaceModerationHandlers | null,
): void {
  activeHandlers = handlers;
}

export function getSelfRole(): AccountRole | undefined {
  const self = activeHandlers?.getSelfProfile();
  return self ? resolveAccountRole(self) : undefined;
}

export function isSelfStaff(): boolean {
  const role = getSelfRole();
  return role === 'developer' || role === 'moderator';
}

export function canReportTarget(targetUsername: string): boolean {
  const self = activeHandlers?.getSelfProfile();
  if (!self) return false;
  const selfKey = self.username.toLowerCase();
  const targetKey = targetUsername.trim().toLowerCase();
  if (!targetKey || targetKey === selfKey || targetKey === 'redshift') {
    return false;
  }
  return true;
}

export function canModerateTarget(
  target: { username: string; role?: AccountRole; isSystemBot?: boolean },
): boolean {
  const self = activeHandlers?.getSelfProfile();
  if (!self) return false;
  const selfRole = resolveAccountRole(self);
  if (selfRole !== 'developer' && selfRole !== 'moderator') return false;
  const selfKey = self.username.toLowerCase();
  const targetKey = target.username.trim().toLowerCase();
  if (!targetKey || targetKey === selfKey || targetKey === 'redshift' || target.isSystemBot) {
    return false;
  }
  const targetRole = resolveAccountRole(target);
  if (targetRole === 'developer' || targetRole === 'bot') return false;
  if (targetRole === 'moderator' && selfRole !== 'developer') return false;
  return true;
}

export function triggerReportUser(
  target: { username: string; displayName: string; role?: AccountRole },
  reportedMessage?: ModerationEvidenceItem,
): void {
  activeHandlers?.onReportUser(target, reportedMessage);
}

export function triggerModerateUser(
  target: { username: string; displayName: string; role?: AccountRole },
  mode: 'suspend' | 'terminate',
  preselectedEvidence?: ModerationEvidenceItem[],
): void {
  activeHandlers?.onModerateUser(target, mode, preselectedEvidence);
}

export function triggerOpenStaffPanel(tab?: StaffPanelTab, targetUsername?: string): void {
  activeHandlers?.onOpenStaffPanel(tab, targetUsername);
}

export async function triggerClaimTicket(ticketId: string): Promise<BotTicketCardData | null> {
  if (!activeHandlers) return null;
  return activeHandlers.onClaimTicket(ticketId);
}

export async function triggerResolveTicket(ticketId: string): Promise<BotTicketCardData | null> {
  if (!activeHandlers) return null;
  return activeHandlers.onResolveTicket(ticketId);
}

export async function triggerDecideAppeal(
  ticketId: string,
  decision: 'accepted' | 'denied',
): Promise<BotTicketCardData | null> {
  if (!activeHandlers) return null;
  return activeHandlers.onDecideAppeal(ticketId, decision);
}

export function buildModerationContextMenuItems(
  target: { username: string; displayName: string; role?: AccountRole; isSystemBot?: boolean },
  options?: { reportedMessage?: ModerationEvidenceItem; includeReport?: boolean },
): ContextMenuItem[] {
  const items: ContextMenuItem[] = [];
  const allowReport = options?.includeReport !== false && canReportTarget(target.username);
  const allowMod = canModerateTarget(target);

  if (allowReport) {
    items.push({
      label: options?.reportedMessage ? 'Report Message' : 'Report User',
      icon: 'flag',
      danger: true,
      dividerBefore: true,
      onSelect: () => {
        triggerReportUser(
          { username: target.username, displayName: target.displayName, role: target.role },
          options?.reportedMessage,
        );
      },
    });
  }

  if (allowMod) {
    const preEvidence = options?.reportedMessage ? [options.reportedMessage] : undefined;
    items.push(
      {
        label: 'Suspend Account',
        icon: 'gavel',
        danger: true,
        dividerBefore: !allowReport,
        onSelect: () => {
          triggerModerateUser(
            { username: target.username, displayName: target.displayName, role: target.role },
            'suspend',
            preEvidence,
          );
        },
      },
      {
        label: 'Delete Account',
        icon: 'trash',
        danger: true,
        onSelect: () => {
          triggerModerateUser(
            { username: target.username, displayName: target.displayName, role: target.role },
            'terminate',
            preEvidence,
          );
        },
      },
    );
  }

  return items;
}
