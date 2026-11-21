export type AuthScreen =
  | 'login'
  | 'signup-account'
  | 'signup-password'
  | 'signup-avatar'
  | 'forgot-email'
  | 'forgot-code'
  | 'forgot-reset'
  | 'app';

export type UserStatus = 'online' | 'idle' | 'dnd' | 'invisible';
export type EffectiveStatus = UserStatus | 'offline';
export type FriendsTab = 'online' | 'all' | 'pending' | 'blocked' | 'add';
export type MainWorkspaceView = 'friends' | 'dm' | 'group';

export type ThemeMode = 'dark' | 'light' | 'high-contrast';
export type MessageDensity = 'cozy' | 'compact';
export type VoiceInputMode = 'always-on' | 'push-to-talk';
export type VoiceModifierMode = 'none' | 'background-drowner' | 'custom';

export interface VoiceCustomAudioSettings {
  noiseGateThresholdDb: number;
  highPassHz: number;
  lowPassHz: number;
  voiceClarityDb: number;
  warmthDb: number;
  compressorAmount: number;
  noiseSuppression: boolean;
  echoCancellation: boolean;
  autoGainControl: boolean;
}

export interface UserPreferences {
  theme: ThemeMode;
  messageDensity: MessageDensity;
  fontSize: 14 | 15 | 16 | 18;
  use24HourTime: boolean;
  reducedMotion: boolean;
  desktopNotifications: boolean;
  inAppNotifications: boolean;
  notifyOnSocialRemovals: boolean;
  notificationSound: boolean;
  notificationShowPreview: boolean;
  enterToSend: boolean;
  sendTypingIndicators: boolean;
  alwaysRevealSpoilers: boolean;
  inlineMedia: boolean;
  voiceInputDeviceId: string;
  voiceOutputDeviceId: string;
  voiceInputMode: VoiceInputMode;
  voicePushToTalkKey: string;
  voicePushToTalkReleaseDelayMs: number;
  voiceSelfMuted: boolean;
  voiceSelfDeafened: boolean;
  voiceModifierMode: VoiceModifierMode;
  voiceMicAmplification: number;
  voiceCustom: VoiceCustomAudioSettings;
}

export type CustomStatusClearOption = 'tomorrow' | '30m' | '1h' | '1w' | 'never';

export interface CustomStatusData {
  text: string;
  emoji?: string;
  expiresAt: number | null;
}

export interface PublicProfile {
  username: string;
  displayName: string;
  bio: string;
  createdAt: number;
  status: EffectiveStatus;
  avatarPreset: number | null;
  avatarDataUrl?: string;
  bannerColor?: string;
  bannerDataUrl?: string;
  customStatus?: CustomStatusData | null;
  isProfilePrivate?: boolean;
  isBlockedRelation?: boolean;
  acceptsNonFriendDms?: boolean;
}

export interface UserPrivacySettings {
  allowFriendRequests: boolean;
  allowNonFriendDms: boolean;
  privateProfile: boolean;
  showReadReceipts?: boolean;
}

export interface SelfProfile {
  username: string;
  displayName: string;
  email: string;
  bio: string;
  createdAt: number;
  status: UserStatus;
  avatarPreset: number | null;
  avatarDataUrl?: string;
  bannerColor?: string;
  bannerDataUrl?: string;
  customStatus?: CustomStatusData | null;
  privacy?: UserPrivacySettings;
}

export interface PendingRequestItem {
  direction: 'incoming' | 'outgoing';
  user: PublicProfile;
  createdAt: number;
}

export interface GifItem {
  id?: string;
  url: string;
  previewUrl?: string;
  title: string;
  width?: number;
  height?: number;
  tags?: string[];
  uploadedBy?: string;
  createdAt?: number;
  mediaKind?: 'gif' | 'video';
  playbackSpeed?: number;
  durationSec?: number;
}

export interface GroupDmInfo {
  id: string;
  name: string;
  iconDataUrl?: string;
  ownerUsername: string;
  members: PublicProfile[];
  createdAt: number;
}

export interface SocialSnapshot {
  user: SelfProfile;
  friends: PublicProfile[];
  dmPeers?: PublicProfile[];
  incomingRequests: PendingRequestItem[];
  outgoingRequests: PendingRequestItem[];
  blockedUsers?: PublicProfile[];
  favoriteGifs?: GifItem[];
  groups?: GroupDmInfo[];
  unreadCounts: Record<string, number>;
  groupUnreadCounts?: Record<string, number>;
  unreadMentions?: Record<string, number>;
  groupUnreadMentions?: Record<string, number>;
  mutedThreads?: Record<string, number>;
  hiddenThreads?: string[];
  threadActivity?: Record<string, number>;
}

export interface LinkPreviewData {
  url: string;
  siteName: string;
  title: string;
  description: string;
  imageUrl?: string;
}

export interface GlobalSearchResultItem {
  kind: 'dm' | 'group';
  peerUsername?: string;
  peerDisplayName?: string;
  groupId?: string;
  groupName?: string;
  message: ChatMessage;
}

export interface SignUpDraft {
  username: string;
  email: string;
  confirmEmail: string;
  password: string;
  confirmPassword: string;
  selectedPresetIndex: number | null;
  avatarUrl: string;
}

export interface ResetSession {
  email: string;
  resendSecondsRemaining: number;
  resetProofToken?: string;
}

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

export interface MessageReaction {
  emoji: string;
  count: number;
  users: string[];
}

export type AttachmentKind = 'image' | 'video' | 'audio' | 'file';

export interface DmAttachment {
  id: string;
  url: string;
  name: string;
  mime: string;
  size: number;
  kind: AttachmentKind;
  spoiler?: boolean;
}

export interface ForwardedMeta {
  originalAuthorUsername?: string;
  originalAuthorName?: string;
  originalTimestamp?: number;
  sourceKind?: 'dm' | 'group';
}

export interface MessageReplyRef {
  messageId: string;
  authorUsername: string;
  authorName: string;
  authorAvatarPreset: number | null;
  authorAvatarDataUrl?: string;
  content: string;
  hasImage?: boolean;
  hasAttachment?: boolean;
  missing?: boolean;
}

export interface StatusReplyRef {
  authorUsername: string;
  authorName: string;
  emoji?: string;
  text?: string;
}

export type CallLogStatus = 'ringing' | 'active' | 'missed' | 'ended';

export interface CallLogData {
  threadKey: string;
  kind: 'dm' | 'group';
  status: CallLogStatus;
  callerUsername: string;
  callerDisplayName?: string;
  startedAt: number;
  answeredAt?: number;
  endedAt?: number;
  durationMs?: number;
  participantUsernames: string[];
}

export interface VoiceNoteMeta {
  durationSec: number;
  waveform: number[];
}

export interface DmReadReceipt {
  readerUsername: string;
  lastReadMessageId?: string;
  readAt: number;
}

export type SystemMessageEventKind =
  | 'pin'
  | 'group-add'
  | 'group-remove'
  | 'group-leave'
  | 'group-owner';

export interface SystemMessageEvent {
  kind: SystemMessageEventKind;
  actorUsername: string;
  actorDisplayName?: string;
  targetUsername?: string;
  targetDisplayName?: string;
  targetUsernames?: string[];
  targetDisplayNames?: string[];
  pinnedMessageId?: string;
}

export type SocialNotifyKind =
  | 'friend-request'
  | 'group-added'
  | 'group-removed'
  | 'unfriended'
  | 'blocked';

export interface SocialNotifyEventPayload {
  kind: SocialNotifyKind;
  actor: PublicProfile;
  groupId?: string;
  groupName?: string;
  groupIconDataUrl?: string;
  timestamp: number;
}

export interface ChatMessage {
  id: string;
  authorUsername: string;
  authorName: string;
  authorAvatarPreset: number | null;
  authorAvatarDataUrl?: string;
  content: string;
  imageDataUrl?: string;
  imageDataUrls?: string[];
  attachments?: DmAttachment[];
  gif?: GifItem;
  replyTo?: MessageReplyRef;
  statusReply?: StatusReplyRef;
  forwarded?: ForwardedMeta;
  callLog?: CallLogData;
  systemEvent?: SystemMessageEvent;
  voiceNote?: VoiceNoteMeta;
  timestamp: number;
  editedAt?: number;
  pinned?: boolean;
  pinnedAt?: number;
  pinnedBy?: string;
  reactions: MessageReaction[];
  isPending?: boolean;
  clientTempId?: string;
  uploadStatusText?: string;
  uploadProgress?: number;
}

export interface TypingEventPayload {
  fromUsername: string;
  displayName: string;
  isTyping: boolean;
  groupId?: string;
}

export interface DmMessageEventPayload {
  threadUsers?: [string, string];
  groupId?: string;
  message: ChatMessage;
}

export interface DmEditEventPayload {
  threadUsers?: [string, string];
  groupId?: string;
  message: ChatMessage;
}

export interface DmDeleteEventPayload {
  threadUsers?: [string, string];
  groupId?: string;
  messageId: string;
}

export interface DmPinEventPayload {
  threadUsers?: [string, string];
  groupId?: string;
  message: ChatMessage;
}

export interface DmReactEventPayload {
  threadUsers?: [string, string];
  groupId?: string;
  messageId: string;
  reactions: MessageReaction[];
}

export interface DmReadEventPayload {
  threadUsers?: [string, string];
  groupId?: string;
  receipt: DmReadReceipt;
}

export interface VcParticipantState {
  user: PublicProfile;
  muted: boolean;
  deafened: boolean;
  cameraOn?: boolean;
  screenSharing?: boolean;
  screenPaused?: boolean;
  cameraStreamId?: string;
  screenStreamId?: string;
  connectionId?: string;
  joinedAt: number;
}

export interface VcTransferredEventPayload {
  threadKey: string;
  newThreadKey?: string;
  reason?: string;
}

export interface VcStateEventPayload {
  threadKey: string;
  kind: 'dm' | 'group';
  groupId?: string;
  startedBy?: string;
  active: boolean;
  participants: VcParticipantState[];
  ringing: PublicProfile[];
}

export interface VcIncomingCallPayload {
  threadKey: string;
  kind: 'dm' | 'group';
  groupId?: string;
  groupName?: string;
  groupIconDataUrl?: string;
  caller: PublicProfile;
}

export interface VcSignalData {
  kind: 'offer' | 'answer' | 'ice';
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  streamMeta?: {
    cameraStreamId?: string;
    screenStreamId?: string;
  };
}

export interface VcSignalEventPayload {
  threadKey: string;
  fromUsername: string;
  signal: VcSignalData;
}

export interface VcSpeakingEventPayload {
  threadKey: string;
  username: string;
  speaking: boolean;
}

export type ActivityGameId =
  | 'chess'
  | 'checkers'
  | 'minesweeper'
  | 'vexilloguessr'
  | 'pool'
  | 'quoridor';

export interface ActivityPlayerEntry {
  username: string;
  displayName: string;
  avatarPreset: number | null;
  avatarDataUrl?: string;
  seat: number;
  wins: number;
}

export interface ActivitySpectatorEntry {
  username: string;
  displayName: string;
  avatarPreset: number | null;
  avatarDataUrl?: string;
}

export interface ActivityLobby {
  id: string;
  gameId: ActivityGameId;
  threadKey: string;
  isPublic: boolean;
  title: string;
  hostUsername: string;
  maxPlayers: number;
  status: 'waiting' | 'playing' | 'finished';
  players: ActivityPlayerEntry[];
  spectators: ActivitySpectatorEntry[];
  rematchVotes?: string[];
  gameState: any;
  version: number;
  createdAt: number;
  updatedAt: number;
}

export interface ActivityListEventPayload {
  lobbies: ActivityLobby[];
}

export interface ActivityLobbyUpdateEventPayload {
  lobby: ActivityLobby;
}

export interface ActivityLobbyRemovedEventPayload {
  lobbyId: string;
  threadKey?: string;
}
