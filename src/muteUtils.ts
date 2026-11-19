import type { SocialSnapshot } from './types';

export interface MuteDurationOption {
  id: string;
  label: string;
  computeUntil: () => number;
}

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 24 * 60 * MS_PER_MINUTE;

/** Uniform table of notification mute presets offered in DM and Group DM context menus. */
export const THREAD_MUTE_OPTIONS: readonly MuteDurationOption[] = [
  { id: '5m', label: 'For 5 minutes', computeUntil: () => Date.now() + 5 * MS_PER_MINUTE },
  { id: '10m', label: 'For 10 minutes', computeUntil: () => Date.now() + 10 * MS_PER_MINUTE },
  { id: '15m', label: 'For 15 minutes', computeUntil: () => Date.now() + 15 * MS_PER_MINUTE },
  { id: '25m', label: 'For 25 minutes', computeUntil: () => Date.now() + 25 * MS_PER_MINUTE },
  { id: '30m', label: 'For 30 minutes', computeUntil: () => Date.now() + 30 * MS_PER_MINUTE },
  { id: '60m', label: 'For 60 minutes', computeUntil: () => Date.now() + 60 * MS_PER_MINUTE },
  {
    id: 'tomorrow',
    label: 'Until tomorrow',
    computeUntil: () => {
      const d = new Date();
      d.setHours(24, 0, 0, 0);
      return d.getTime();
    },
  },
  { id: 'next-week', label: 'Until next week', computeUntil: () => Date.now() + 7 * MS_PER_DAY },
  { id: 'forever', label: 'Until I turn it back on', computeUntil: () => -1 },
];

/** Canonicalizes a DM ("dm:<peer>") or Group ("group:<id>") mute/hide key. */
export function normalizeThreadMuteKey(threadKey: string): string {
  if (threadKey.startsWith('dm:')) {
    return `dm:${threadKey.slice(3).toLowerCase()}`;
  }
  return threadKey;
}

/** Returns active mute expiration (-2 = Only @mentions, -1 = indefinite mute, > now = timed mute) or null. */
export function getThreadMuteUntil(
  snapshot: SocialSnapshot | null | undefined,
  threadKey: string,
): number | null {
  if (!snapshot?.mutedThreads) {
    return null;
  }
  const val = snapshot.mutedThreads[normalizeThreadMuteKey(threadKey)];
  if (val === -1 || val === -2) {
    return val;
  }
  if (typeof val === 'number' && Number.isFinite(val) && val > Date.now()) {
    return val;
  }
  return null;
}

/** Notification level for a thread: 'all', 'mentions' (-2), or 'muted' (-1 or active expiry). */
export function getThreadNotificationMode(
  snapshot: SocialSnapshot | null | undefined,
  threadKey: string,
): 'all' | 'mentions' | 'muted' {
  const val = getThreadMuteUntil(snapshot, threadKey);
  if (val === -2) {
    return 'mentions';
  }
  if (val !== null) {
    return 'muted';
  }
  return 'all';
}

/** True when notifications for the given DM or Group thread are fully muted. */
export function isThreadMuted(
  snapshot: SocialSnapshot | null | undefined,
  threadKey: string,
): boolean {
  return getThreadNotificationMode(snapshot, threadKey) === 'muted';
}

/** True when a message in `threadKey` should play sound/desktop notification. */
export function shouldNotifyForThreadMessage(
  snapshot: SocialSnapshot | null | undefined,
  threadKey: string,
  isMentionOrReplyToSelf: boolean,
): boolean {
  const mode = getThreadNotificationMode(snapshot, threadKey);
  if (mode === 'muted') {
    return false;
  }
  if (mode === 'mentions') {
    return isMentionOrReplyToSelf;
  }
  return true;
}

/** Formats remaining mute time into a short badge/tooltip string. */
export function formatMuteRemaining(muteUntil: number): string {
  if (muteUntil === -2) {
    return '@mentions only';
  }
  if (muteUntil === -1) {
    return 'Until unmuted';
  }
  const diffMs = Math.max(0, muteUntil - Date.now());
  const mins = Math.ceil(diffMs / MS_PER_MINUTE);
  if (mins < 60) {
    return `${mins}m left`;
  }
  const hours = Math.round(mins / 60);
  if (hours < 24) {
    return `${hours}h left`;
  }
  const days = Math.round(hours / 24);
  return `${days}d left`;
}
