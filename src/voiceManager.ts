import {
  apiFetchHostScreenSources,
  apiFetchIceServers,
  type HostScreenSource,
  type SocialSocketHandle,
  type ThreadTarget,
} from './apiClient';
import { openConfirmPopup } from './chatUi';
import { type ContextMenuItem, openContextMenu } from './contextMenu';
import { getDesktopBridge } from './desktopBridge';
import { resolveGroupAvatar } from './groupDmModals';
import { isModalConfirmShortcut, isTopmostModal } from './modalShortcuts';
import { isThreadMuted } from './muteUtils';
import { dispatchRedshiftNotification, isAppWindowFocused, showInAppToast } from './notifications';
import {
  getUserPreferences,
  getVoiceUserScreenVolume,
  getVoiceUserVolume,
  setVoiceUserScreenVolume,
  setVoiceUserVolume,
  subscribeUserPreferences,
  updateUserPreferences,
} from './settingsStore';
import type {
  ActivityListEventPayload,
  ActivityLobbyRemovedEventPayload,
  ActivityLobbyUpdateEventPayload,
  PublicProfile,
  SocialSnapshot,
  VcIncomingCallPayload,
  VcSignalEventPayload,
  VcSpeakingEventPayload,
  VcStateEventPayload,
  VcTransferredEventPayload,
} from './types';
import {
  createActivitiesControlIconSvg,
  createVcActivitiesController,
  createWatcherEyeIconSvg,
} from './vcActivities';
import {
  applyAudioOutputDevice,
  applyLiveScreenShareOptions,
  captureCameraStream,
  captureHostPreviewStream,
  captureMicStream,
  captureScreenShareStream,
  createCameraIconSvg,
  createExpandIconSvg,
  createFlipCameraIconSvg,
  createHeadphonesIconSvg,
  createMicDspChain,
  createMicIconSvg,
  createPauseIconSvg,
  createPhoneCallIconSvg,
  createPhoneHangupIconSvg,
  createPipIconSvg,
  createScreenShareIconSvg,
  createStopStreamIconSvg,
  createVolumeIconSvg,
  createWatchStreamIconSvg,
  disposeScreenShareStream,
  getScreenShareStreamSettings,
  getSharedVoiceAudioContext,
  getSharedVoiceSilentSink,
  isIosBrowser,
  isMobileTouchDevice,
  playStreamEndSound,
  playStreamStartSound,
  playVcJoinSound,
  playVcLeaveSound,
  playVcPeerJoinSound,
  playVcPeerLeaveSound,
  playVoiceToggleCue,
  startIncomingRingLoop,
  startOutgoingRingLoop,
  stopRingLoops,
  type MicDspChain,
  type ScreenShareOptions,
  type ScreenShareSurface,
} from './voiceAudio';

export interface VoiceManagerOptions {
  getSnapshot: () => SocialSnapshot | null;
  getSocket: () => SocialSocketHandle | null;
  resolveAvatar: (profile: { avatarPreset: number | null; avatarDataUrl?: string }) => string;
  onJumpToCallThread: (state: VcStateEventPayload) => void;
  onStateChanged: () => void;
  onErrorNotice?: (msg: string) => void;
  onOpenDm?: (username: string) => void;
  onViewProfile?: (user: PublicProfile) => void;
  onOpenVoiceSettings?: () => void;
}

export interface VoiceManagerHandle {
  startOrJoinCall: (target: ThreadTarget, threadKey: string) => void;
  ringUserInCurrentCall: (targetUsername?: string) => boolean;
  canRingUserInCurrentCall: (peerUsername: string) => boolean;
  confirmAndSwitchToCall: (
    target: ThreadTarget,
    threadKey: string,
    targetLabel: string,
    beforeSwitch?: () => void,
  ) => Promise<boolean>;
  leaveCall: () => void;
  acceptIncomingCall: (threadKey: string) => void;
  declineIncomingCall: (threadKey: string) => void;
  toggleMute: () => void;
  toggleDeafen: () => void;
  setTestingMic: (testing: boolean) => void;
  setViewedThreadKey: (threadKey: string | null) => void;
  isMicTesting: () => boolean;
  isMuted: () => boolean;
  isDeafened: () => boolean;
  getActiveCallThreadKey: () => string | null;
  getActiveCallState: () => VcStateEventPayload | null;
  getCallStateForThread: (threadKey: string) => VcStateEventPayload | null;
  isUserInActivity: (username: string) => boolean;
  isUserInAnyKnownCall: (username: string) => boolean;
  getThreadPresence: (threadKey: string) => 'activity' | 'call' | null;
  getSidebarPresenceSignature: () => string;
  renderCallTopBar: (host: HTMLElement, threadKey: string) => void;
  renderSidebarStatusBar: (host: HTMLElement) => void;
  handleVcState: (payload: VcStateEventPayload) => void;
  handleVcIncoming: (payload: VcIncomingCallPayload) => void;
  handleVcIncomingClear: (threadKey: string) => void;
  handleVcSignal: (payload: VcSignalEventPayload) => void;
  handleVcSpeaking: (payload: VcSpeakingEventPayload) => void;
  handleVcTransferred: (payload: VcTransferredEventPayload) => void;
  handleSocketReconnected: () => void;
  handleActivityList: (payload: ActivityListEventPayload) => void;
  handleActivityLobbyUpdate: (payload: ActivityLobbyUpdateEventPayload) => void;
  handleActivityLobbyRemoved: (payload: ActivityLobbyRemovedEventPayload) => void;
  destroy: () => void;
}

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

interface AudioBranchState {
  streamId: string | null;
  keepaliveEl: HTMLAudioElement | null;
  outputEl: HTMLAudioElement;
  sourceNode: MediaStreamAudioSourceNode | null;
  gainNode: GainNode | null;
  destNode: MediaStreamAudioDestinationNode | null;
  analyser?: AnalyserNode;
  dataArr?: Uint8Array<ArrayBuffer>;
}

interface PeerAudioPipeline {
  pc: RTCPeerConnection;
  remoteStream: MediaStream | null;
  audioEl: HTMLAudioElement;
  micBranch: AudioBranchState;
  screenAudioBranch: AudioBranchState | null;
  analyser?: AnalyserNode;
  dataArr?: Uint8Array<ArrayBuffer>;
  remoteStreamsById: Map<string, MediaStream>;
  remoteCameraStream: MediaStream | null;
  remoteScreenStream: MediaStream | null;
  remoteCameraStreamId?: string;
  remoteScreenStreamId?: string;
  remoteConnectionId?: string;
  micSender: RTCRtpSender | null;
  cameraSender: RTCRtpSender | null;
  screenVideoSender: RTCRtpSender | null;
  screenAudioSender: RTCRtpSender | null;
  lastSignalSpeaking: boolean;
  holdUntil: number;
  makingOffer: boolean;
  ignoreOffer: boolean;
  pendingIce: RTCIceCandidateInit[];
}

export function formatKeyCodeLabel(code: string): string {
  if (!code) {
    return 'V';
  }
  if (code.startsWith('Key') && code.length === 4) {
    return code.slice(3);
  }
  if (code.startsWith('Digit') && code.length === 6) {
    return code.slice(5);
  }
  const map: Record<string, string> = {
    Space: 'Space',
    Backquote: '`',
    AltLeft: 'Left Alt',
    AltRight: 'Right Alt',
    ControlLeft: 'Left Ctrl',
    ControlRight: 'Right Ctrl',
    ShiftLeft: 'Left Shift',
    ShiftRight: 'Right Shift',
    CapsLock: 'CapsLock',
    Tab: 'Tab',
  };
  return map[code] ?? code;
}

export function createVoiceManager(options: VoiceManagerOptions): VoiceManagerHandle {
  const callsByThread = new Map<string, VcStateEventPayload>();
  const incomingCalls = new Map<string, VcIncomingCallPayload>();
  const recentlyLeftCalls = new Map<string, number>();
  const lastAutoLeaveResendAt = new Map<string, number>();
  const watchedStreamKeys = new Set<string>();
  const knownPeersByCall = new Map<string, Map<string, { screenSharing: boolean }>>();
  const peers = new Map<string, PeerAudioPipeline>();
  const peerSignalQueue = new Map<string, Promise<void>>();
  const speakingHoldUntil = new Map<string, number>();

  let activeCallThreadKey: string | null = null;
  let activeCallTarget: ThreadTarget | null = null;
  let lastReconnectRejoinAt = 0;
  let localMicStream: MediaStream | null = null;
  let localRawMicStream: MediaStream | null = null;
  let localMicDsp: MicDspChain | null = null;
  let localMicDest: MediaStreamAudioDestinationNode | null = null;
  let localCameraStream: MediaStream | null = null;
  let cameraFacingMode: 'user' | 'environment' = 'user';
  let flippingCamera = false;
  let localScreenStream: MediaStream | null = null;
  let localScreenPaused = false;
  let expandedStageKey: string | null = null;
  let cachedIceServers: RTCIceServer[] = DEFAULT_ICE_SERVERS;
  let iceServersFetched = false;
  let callStatsTimer: number | null = null;
  let callQualityStats: {
    rttMs: number | null;
    packetLossPct: number | null;
    quality: 'good' | 'ok' | 'poor' | 'connecting';
  } = { rttMs: null, packetLossPct: null, quality: 'connecting' };
  const refreshIceServers = () => {
    if (iceServersFetched) {
      return;
    }
    iceServersFetched = true;
    void apiFetchIceServers().then((servers) => {
      cachedIceServers = servers;
    });
  };
  const isWatchingRemoteScreen = (peerKey: string): boolean =>
    watchedStreamKeys.has(`scr:${peerKey.toLowerCase()}`);

  const watchStreamKey = (key: string) => {
    watchedStreamKeys.add(key);
    expandedStageKey = key;
    syncTrackAndSinkStates();
    emitStateChanged();
  };

  const stopWatchingStreamKey = (key: string) => {
    watchedStreamKeys.delete(key);
    if (expandedStageKey === key) {
      expandedStageKey = null;
    }
    syncTrackAndSinkStates();
    emitStateChanged();
  };

  const toggleExpandKey = (key: string) => {
    const selfKey = options.getSnapshot()?.user.username.toLowerCase();
    const isRemoteScreen = key.startsWith('scr:') && key !== `scr:${selfKey ?? ''}`;
    if (isRemoteScreen && !watchedStreamKeys.has(key)) {
      watchStreamKey(key);
      return;
    }
    expandedStageKey = expandedStageKey === key ? null : key;
    emitStateChanged();
  };
  let activePopoverCleanup: (() => void) | null = null;
  let activeScreenModalCleanup: (() => void) | null = null;
  let cleanupLocalScreenListeners: (() => void) | null = null;
  let viewedThreadKey: string | null = null;
  let lastActiveSpeakerKey: string | null = null;
  let syncMiniPipOverlayRef: () => void = () => {};
  const emitStateChanged = () => {
    syncMiniPipOverlayRef();
    options.onStateChanged();
  };
  let screenSharePrefs: ScreenShareOptions = {
    resolution: '1080p',
    fps: 60,
    shareAudio: true,
    surface: 'browser',
  };
  let micAttachPromise: Promise<void> | null = null;
  let currentInputDeviceId = getUserPreferences().voiceInputDeviceId;
  let testingMic = false;
  let pttPressed = false;
  let pttReleaseTimer: number | null = null;
  let localAnalyser: AnalyserNode | null = null;
  let localSourceNode: MediaStreamAudioSourceNode | null = null;
  let localDataArr: Uint8Array<ArrayBuffer> | null = null;
  let vadIntervalId: number | null = null;
  let localSpeakingLastEmitted = false;
  let lastSentVoiceStateSig = '';
  let lastVoicePrefsSig = '';
  let lastDspPrefsSig = '';
  let activeRingMode: 'none' | 'incoming' | 'outgoing' = 'none';
  let incomingPopupEl: HTMLDivElement | null = null;
  let desktopNotifiedCalls = new Set<string>();
  let destroyed = false;

  const audioMount = document.createElement('div');
  audioMount.style.cssText =
    'position:fixed;width:0;height:0;overflow:hidden;opacity:0;pointer-events:none;';
  audioMount.setAttribute('aria-hidden', 'true');
  document.body.appendChild(audioMount);

  const getEffectiveDeafened = (): boolean => {
    return testingMic || getUserPreferences().voiceSelfDeafened;
  };

  const getEffectiveMuted = (): boolean => {
    const prefs = getUserPreferences();
    return testingMic || prefs.voiceSelfMuted || prefs.voiceSelfDeafened;
  };

  const canTransmitMic = (): boolean => {
    if (getEffectiveMuted() || !localMicStream) {
      return false;
    }
    const prefs = getUserPreferences();
    if (prefs.voiceInputMode === 'push-to-talk') {
      return pttPressed;
    }
    return true;
  };

  const ensureVadContext = (): { ctx: AudioContext; sink: GainNode } | null => {
    return getSharedVoiceSilentSink();
  };

  const getLocalStreamMeta = () => ({
    cameraStreamId: localCameraStream?.id || undefined,
    screenStreamId: localScreenStream?.id || undefined,
  });

  const resolvePeerLinearGain = (peerKey: string): number => {
    const vol = getVoiceUserVolume(peerKey);
    if (vol.muted || vol.volume <= 0) {
      return 0;
    }
    return Math.min(2, Math.max(0, vol.volume / 100));
  };

  const resolvePeerScreenLinearGain = (peerKey: string): number => {
    const vol = getVoiceUserScreenVolume(peerKey);
    if (vol.muted || vol.volume <= 0) {
      return 0;
    }
    return Math.min(2, Math.max(0, vol.volume / 100));
  };

  const createOutputAudioEl = (): HTMLAudioElement => {
    const el = document.createElement('audio') as HTMLAudioElement & { playsInline?: boolean };
    el.autoplay = true;
    el.playsInline = true;
    el.volume = 1;
    el.muted = getEffectiveDeafened();
    applyAudioOutputDevice(el, getUserPreferences().voiceOutputDeviceId);
    audioMount.appendChild(el);
    return el;
  };

  const cleanupAudioBranch = (branch: AudioBranchState | null) => {
    if (!branch) {
      return;
    }
    try {
      branch.sourceNode?.disconnect();
      branch.gainNode?.disconnect();
      branch.analyser?.disconnect();
      branch.destNode?.disconnect();
    } catch {
      // Ignore disconnect errors cleanly.
    }
    branch.sourceNode = null;
    branch.gainNode = null;
    branch.analyser = undefined;
    branch.destNode = null;
    if (branch.keepaliveEl) {
      branch.keepaliveEl.pause();
      branch.keepaliveEl.srcObject = null;
      branch.keepaliveEl.remove();
      branch.keepaliveEl = null;
    }
    branch.outputEl.pause();
    branch.outputEl.srcObject = null;
    branch.outputEl.remove();
  };

  const mountStreamToBranch = (
    branch: AudioBranchState,
    peerKey: string,
    stream: MediaStream,
    withAnalyser: boolean,
  ) => {
    if (branch.streamId === stream.id && branch.outputEl.srcObject) {
      return;
    }
    try {
      branch.sourceNode?.disconnect();
      branch.gainNode?.disconnect();
      branch.analyser?.disconnect();
      branch.destNode?.disconnect();
    } catch {
      // Ignore cleanup errors.
    }
    branch.streamId = stream.id;
    const linearGain = resolvePeerLinearGain(peerKey);
    const deaf = getEffectiveDeafened();
    const prefs = getUserPreferences();

    const ctx = getSharedVoiceAudioContext();
    const vad = ensureVadContext();
    if (ctx && typeof ctx.createMediaStreamDestination === 'function') {
      if (!branch.keepaliveEl) {
        const ka = document.createElement('audio') as HTMLAudioElement & { playsInline?: boolean };
        ka.autoplay = true;
        ka.playsInline = true;
        ka.muted = true;
        audioMount.appendChild(ka);
        branch.keepaliveEl = ka;
      }
      branch.keepaliveEl.srcObject = stream;
      branch.keepaliveEl.muted = true;
      void branch.keepaliveEl.play().catch(() => {});

      const sourceNode = ctx.createMediaStreamSource(stream);
      const gainNode = ctx.createGain();
      gainNode.gain.value = linearGain;
      const destNode = ctx.createMediaStreamDestination();

      if (withAnalyser && vad) {
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        const dataArr = new Uint8Array(analyser.fftSize);
        sourceNode.connect(analyser);
        analyser.connect(gainNode);
        analyser.connect(vad.sink);
        branch.analyser = analyser;
        branch.dataArr = dataArr;
      } else {
        sourceNode.connect(gainNode);
      }
      gainNode.connect(destNode);

      branch.sourceNode = sourceNode;
      branch.gainNode = gainNode;
      branch.destNode = destNode;
      branch.outputEl.volume = 1;
      branch.outputEl.srcObject = destNode.stream;
    } else {
      branch.outputEl.srcObject = stream;
      branch.outputEl.volume = Math.min(1, linearGain);
      if (withAnalyser && vad) {
        try {
          const sourceNode = vad.ctx.createMediaStreamSource(stream);
          const analyser = vad.ctx.createAnalyser();
          analyser.fftSize = 256;
          sourceNode.connect(analyser);
          analyser.connect(vad.sink);
          branch.sourceNode = sourceNode;
          branch.analyser = analyser;
          branch.dataArr = new Uint8Array(analyser.fftSize);
        } catch {
          // Ignore analyser errors gracefully.
        }
      }
    }

    branch.outputEl.muted = deaf;
    applyAudioOutputDevice(branch.outputEl, prefs.voiceOutputDeviceId);
    void branch.outputEl.play().catch(() => {});
  };

  const applyPeerGain = (peerKey: string, pipeline: PeerAudioPipeline) => {
    const micGain = resolvePeerLinearGain(peerKey);
    const screenGain = isWatchingRemoteScreen(peerKey) ? resolvePeerScreenLinearGain(peerKey) : 0;
    const ctx = getSharedVoiceAudioContext();
    const pairs: Array<{ branch: AudioBranchState | null; gain: number }> = [
      { branch: pipeline.micBranch, gain: micGain },
      { branch: pipeline.screenAudioBranch, gain: screenGain },
    ];
    for (const { branch, gain } of pairs) {
      if (!branch) {
        continue;
      }
      if (branch.gainNode && ctx) {
        branch.gainNode.gain.setTargetAtTime(gain, ctx.currentTime, 0.015);
      } else {
        branch.outputEl.volume = Math.min(1, gain);
      }
    }
  };

  const syncTrackAndSinkStates = () => {
    const allowTx = canTransmitMic();
    if (localMicStream) {
      for (const track of localMicStream.getAudioTracks()) {
        track.enabled = allowTx;
      }
    }
    if (localRawMicStream) {
      for (const track of localRawMicStream.getAudioTracks()) {
        track.enabled = allowTx;
      }
    }

    const prefs = getUserPreferences();
    const deaf = getEffectiveDeafened();
    for (const [peerKey, pipeline] of peers.entries()) {
      pipeline.audioEl.muted = deaf;
      applyAudioOutputDevice(pipeline.audioEl, prefs.voiceOutputDeviceId);
      if (pipeline.screenAudioBranch) {
        pipeline.screenAudioBranch.outputEl.muted = deaf || !isWatchingRemoteScreen(peerKey);
        applyAudioOutputDevice(pipeline.screenAudioBranch.outputEl, prefs.voiceOutputDeviceId);
      }
      applyPeerGain(peerKey, pipeline);
    }

    if (activeCallThreadKey) {
      const muted = getEffectiveMuted();
      const camOn = Boolean(localCameraStream);
      const scrOn = Boolean(localScreenStream);
      const scrPaused = Boolean(scrOn && localScreenPaused);
      const camId = localCameraStream?.id ?? '';
      const scrId = localScreenStream?.id ?? '';
      const watchingStreams = Array.from(watchedStreamKeys).sort();
      const watchingSig = watchingStreams.join(',');
      const sig = `${activeCallThreadKey}:${muted ? 1 : 0}:${deaf ? 1 : 0}:${camOn ? 1 : 0}:${scrOn ? 1 : 0}:${scrPaused ? 1 : 0}:${camId}:${scrId}:${watchingSig}`;
      if (sig !== lastSentVoiceStateSig) {
        lastSentVoiceStateSig = sig;
        options.getSocket()?.sendVcVoiceState(activeCallThreadKey, muted, deaf, {
          cameraOn: camOn,
          screenSharing: scrOn,
          screenPaused: scrPaused,
          cameraStreamId: camId,
          screenStreamId: scrId,
          watchingStreams,
        });
      }
    } else {
      lastSentVoiceStateSig = '';
    }
  };

  const syncRingAudio = () => {
    if (destroyed) {
      return;
    }
    const deaf = getEffectiveDeafened();
    const snap = options.getSnapshot();
    const hasUnmutedIncoming = Array.from(incomingCalls.keys()).some(
      (k) => k !== activeCallThreadKey && !isThreadMuted(snap, resolveUserThreadMuteKey(k)),
    );
    if (hasUnmutedIncoming && !deaf) {
      if (activeRingMode !== 'incoming') {
        activeRingMode = 'incoming';
        startIncomingRingLoop();
      }
      return;
    }

    const activeCall = activeCallThreadKey ? callsByThread.get(activeCallThreadKey) : undefined;
    const selfKey = options.getSnapshot()?.user.username.toLowerCase();
    const isCallStarter = Boolean(
      activeCall && selfKey && activeCall.startedBy?.toLowerCase() === selfKey,
    );
    const othersRinging = Boolean(
      activeCall &&
        selfKey &&
        activeCall.ringing.some((r) => r.username.toLowerCase() !== selfKey),
    );
    const othersJoined = Boolean(
      activeCall &&
        selfKey &&
        activeCall.participants.some((p) => p.user.username.toLowerCase() !== selfKey),
    );
    const isOutgoingRinging = Boolean(
      activeCall && isCallStarter && othersRinging && !othersJoined && !deaf,
    );
    if (isOutgoingRinging) {
      if (activeRingMode !== 'outgoing') {
        activeRingMode = 'outgoing';
        startOutgoingRingLoop();
      }
      return;
    }

    if (activeRingMode !== 'none') {
      activeRingMode = 'none';
      stopRingLoops();
    }
  };

  const disposePeerPipeline = (peerKey: string, pipeline: PeerAudioPipeline) => {
    cleanupAudioBranch(pipeline.micBranch);
    cleanupAudioBranch(pipeline.screenAudioBranch);
    pipeline.screenAudioBranch = null;
    pipeline.remoteStreamsById.clear();
    pipeline.remoteCameraStream = null;
    pipeline.remoteScreenStream = null;
    pipeline.pc.ontrack = null;
    pipeline.pc.onicecandidate = null;
    pipeline.pc.close();
    peers.delete(peerKey);
    peerSignalQueue.delete(peerKey);
  };

  const closeAllPeers = () => {
    for (const [peerKey, pipeline] of Array.from(peers.entries())) {
      disposePeerPipeline(peerKey, pipeline);
    }
    peerSignalQueue.clear();
  };

  const stopLocalCameraCapture = (notifyPeers = true) => {
    if (!localCameraStream) {
      return;
    }
    for (const track of localCameraStream.getTracks()) {
      track.stop();
    }
    localCameraStream = null;
    const selfKey = options.getSnapshot()?.user.username.toLowerCase();
    if (selfKey && expandedStageKey === `cam:${selfKey}`) {
      expandedStageKey = null;
    }
    if (notifyPeers) {
      void syncOutboundMediaTracks();
    }
    syncTrackAndSinkStates();
    options.onStateChanged();
  };

  const stopLocalScreenCapture = (notifyPeers = true, playSound = true) => {
    cleanupLocalScreenListeners?.();
    cleanupLocalScreenListeners = null;
    localScreenPaused = false;
    if (!localScreenStream) {
      return;
    }
    disposeScreenShareStream(localScreenStream);
    for (const track of localScreenStream.getTracks()) {
      track.onended = null;
      track.stop();
    }
    localScreenStream = null;
    if (playSound && !destroyed) {
      playStreamEndSound();
    }
    const selfKey = options.getSnapshot()?.user.username.toLowerCase();
    if (selfKey && expandedStageKey === `scr:${selfKey}`) {
      expandedStageKey = null;
    }
    syncTrackAndSinkStates();
    if (notifyPeers) {
      void syncOutboundMediaTracks();
    }
    emitStateChanged();
  };

  const stopLocalMicCapture = () => {
    micAttachPromise = null;
    if (localMicDsp) {
      localMicDsp.stop();
      localMicDsp = null;
    }
    try {
      localMicDest?.disconnect();
    } catch {
      // Ignore disconnect error.
    }
    localMicDest = null;
    try {
      localSourceNode?.disconnect();
      localAnalyser?.disconnect();
    } catch {
      // Ignore disconnect error.
    }
    localSourceNode = null;
    localAnalyser = null;
    localDataArr = null;
    if (localMicStream) {
      for (const track of localMicStream.getTracks()) {
        track.stop();
      }
      localMicStream = null;
    }
    if (localRawMicStream) {
      for (const track of localRawMicStream.getTracks()) {
        track.stop();
      }
      localRawMicStream = null;
    }
    if (localSpeakingLastEmitted && activeCallThreadKey) {
      localSpeakingLastEmitted = false;
      options.getSocket()?.sendVcSpeaking(activeCallThreadKey, false);
    }
  };

  const stopVadPolling = () => {
    if (vadIntervalId !== null) {
      window.clearInterval(vadIntervalId);
      vadIntervalId = null;
    }
  };

  const measureRms = (analyser: AnalyserNode, buf: Uint8Array<ArrayBuffer>): number => {
    analyser.getByteTimeDomainData(buf);
    let sumSq = 0;
    for (let i = 0; i < buf.length; i += 1) {
      const v = (buf[i] - 128) / 128;
      sumSq += v * v;
    }
    return Math.sqrt(sumSq / buf.length);
  };

  const startVadPolling = () => {
    stopVadPolling();
    vadIntervalId = window.setInterval(() => {
      if (destroyed || !activeCallThreadKey) {
        return;
      }
      const now = Date.now();
      let speakingChanged = false;
      const selfKey = options.getSnapshot()?.user.username.toLowerCase();

      if (selfKey && localAnalyser && localDataArr) {
        const wasLocalSpeaking = (speakingHoldUntil.get(selfKey) ?? 0) > now;
        const canTx = canTransmitMic();
        if (canTx) {
          const rms = measureRms(localAnalyser, localDataArr);
          if (rms > 0.01) {
            speakingHoldUntil.set(selfKey, now + 240);
          }
        } else {
          speakingHoldUntil.delete(selfKey);
        }
        const effectiveLocalSpeak = canTx && (speakingHoldUntil.get(selfKey) ?? 0) > now;
        if (effectiveLocalSpeak) {
          if (!lastActiveSpeakerKey) {
            lastActiveSpeakerKey = selfKey;
          }
        }
        if (effectiveLocalSpeak !== wasLocalSpeaking) {
          speakingChanged = true;
        }
        if (effectiveLocalSpeak !== localSpeakingLastEmitted) {
          localSpeakingLastEmitted = effectiveLocalSpeak;
          options.getSocket()?.sendVcSpeaking(activeCallThreadKey, effectiveLocalSpeak);
          speakingChanged = true;
        }
      }

      for (const [peerKey, pipeline] of peers.entries()) {
        const wasActive = (speakingHoldUntil.get(peerKey) ?? 0) > now;
        const peerAnalyser = pipeline.micBranch.analyser ?? pipeline.analyser;
        const peerDataArr = pipeline.micBranch.dataArr ?? pipeline.dataArr;
        if (peerAnalyser && peerDataArr) {
          const rms = measureRms(peerAnalyser, peerDataArr);
          if (rms > 0.01) {
            pipeline.holdUntil = now + 240;
            speakingHoldUntil.set(peerKey, now + 240);
            lastActiveSpeakerKey = peerKey;
          }
        }
        const isActive = (speakingHoldUntil.get(peerKey) ?? 0) > now;
        if (isActive !== wasActive) {
          speakingChanged = true;
        }
      }

      if (speakingChanged) {
        emitStateChanged();
      }
    }, 70);
  };

  const attachLocalMicIfNeeded = async (): Promise<void> => {
    const desiredDeviceId = getUserPreferences().voiceInputDeviceId;
    if (localMicStream && currentInputDeviceId === desiredDeviceId) {
      syncTrackAndSinkStates();
      return;
    }
    if (micAttachPromise && currentInputDeviceId === desiredDeviceId) {
      return micAttachPromise;
    }

    const expectedThread = activeCallThreadKey;
    currentInputDeviceId = desiredDeviceId;
    const executeMicAttach = async (): Promise<void> => {
      stopLocalMicCapture();
      currentInputDeviceId = desiredDeviceId;
      try {
        const prefs = getUserPreferences();
        const rawStream = await captureMicStream(desiredDeviceId, prefs);
        if (destroyed || !activeCallThreadKey || activeCallThreadKey !== expectedThread) {
          rawStream.getTracks().forEach((t) => t.stop());
          return;
        }

        const vad = ensureVadContext();
        let txStream = rawStream;
        if (vad && typeof vad.ctx.createMediaStreamDestination === 'function') {
          const dsp = createMicDspChain({
            ctx: vad.ctx,
            rawStream,
            prefs,
            analyserFftSize: 256,
          });
          const destNode = vad.ctx.createMediaStreamDestination();
          dsp.outputNode.connect(destNode);
          dsp.outputNode.connect(vad.sink);
          localMicDsp = dsp;
          localMicDest = destNode;
          localAnalyser = dsp.outputAnalyser;
          localDataArr = new Uint8Array(localAnalyser.fftSize);
          txStream = destNode.stream;
        } else if (vad) {
          localSourceNode = vad.ctx.createMediaStreamSource(rawStream);
          localAnalyser = vad.ctx.createAnalyser();
          localAnalyser.fftSize = 256;
          localDataArr = new Uint8Array(localAnalyser.fftSize);
          localSourceNode.connect(localAnalyser);
          localAnalyser.connect(vad.sink);
        }

        localRawMicStream = rawStream;
        localMicStream = txStream;

        const primaryTrack = txStream.getAudioTracks()[0];
        if (primaryTrack) {
          for (const [peerKey, pipeline] of peers.entries()) {
            if (pipeline.micSender) {
              await pipeline.micSender.replaceTrack(primaryTrack);
            } else {
              const audioTransceiver = pipeline.pc
                .getTransceivers()
                .find((t) => t.sender === pipeline.micSender || t.receiver.track?.kind === 'audio');
              if (audioTransceiver?.sender) {
                pipeline.micSender = audioTransceiver.sender;
                await audioTransceiver.sender.replaceTrack(primaryTrack);
              } else {
                pipeline.micSender = pipeline.pc.addTrack(primaryTrack, txStream);
                if (activeCallThreadKey) {
                  enqueueOfferToPeer(activeCallThreadKey, peerKey);
                }
              }
            }
          }
        }
        syncTrackAndSinkStates();
      } catch {
        // Allow joining listen-only if no microphone or permission denied.
        if (!getUserPreferences().voiceSelfMuted) {
          options.onErrorNotice?.('Microphone unavailable — joined in listen-only mode');
        }
      } finally {
        if (micAttachPromise === run) {
          micAttachPromise = null;
        }
      }
    };
    const run = executeMicAttach();
    micAttachPromise = run;
    return run;
  };

  const classifyPeerMediaStreams = (peerKey: string, pipeline: PeerAudioPipeline) => {
    const call = activeCallThreadKey ? callsByThread.get(activeCallThreadKey) : undefined;
    const participant = call?.participants.find(
      (p) => p.user.username.toLowerCase() === peerKey,
    );
    const camId = participant?.cameraStreamId || pipeline.remoteCameraStreamId;
    const scrId = participant?.screenStreamId || pipeline.remoteScreenStreamId;
    const allowCam = participant ? participant.cameraOn !== false : true;
    const allowScr = participant ? participant.screenSharing !== false : true;

    let nextCam: MediaStream | null = null;
    let nextScr: MediaStream | null = null;
    let nextMicAudio: MediaStream | null = null;
    let nextScrAudio: MediaStream | null = null;

    const liveVideoStreams: MediaStream[] = [];
    for (const stream of pipeline.remoteStreamsById.values()) {
      const liveVideoTracks = stream.getVideoTracks().filter((t) => t.readyState === 'live');
      if (liveVideoTracks.length > 0) {
        liveVideoStreams.push(stream);
      }
      const liveAudioTracks = stream.getAudioTracks().filter((t) => t.readyState === 'live');
      if (liveAudioTracks.length > 0) {
        if (scrId && stream.id === scrId) {
          nextScrAudio = stream;
        } else if (!nextMicAudio) {
          nextMicAudio = stream;
        } else if (!nextScrAudio) {
          nextScrAudio = stream;
        }
      }
    }

    for (const stream of liveVideoStreams) {
      if (scrId && stream.id === scrId && allowScr) {
        nextScr = stream;
      } else if (camId && stream.id === camId && allowCam) {
        nextCam = stream;
      } else if (!camId && !scrId) {
        if (allowCam && !nextCam) {
          nextCam = stream;
        }
      }
    }

    pipeline.remoteCameraStream = allowCam ? nextCam : null;
    pipeline.remoteScreenStream = allowScr ? nextScr : null;

    if (nextMicAudio) {
      pipeline.remoteStream = nextMicAudio;
      mountStreamToBranch(pipeline.micBranch, peerKey, nextMicAudio, true);
      pipeline.analyser = pipeline.micBranch.analyser;
      pipeline.dataArr = pipeline.micBranch.dataArr;
    }

    if (nextScrAudio && allowScr) {
      if (!pipeline.screenAudioBranch) {
        pipeline.screenAudioBranch = {
          streamId: null,
          keepaliveEl: null,
          outputEl: createOutputAudioEl(),
          sourceNode: null,
          gainNode: null,
          destNode: null,
        };
      }
      mountStreamToBranch(pipeline.screenAudioBranch, peerKey, nextScrAudio, false);
    } else if (pipeline.screenAudioBranch) {
      cleanupAudioBranch(pipeline.screenAudioBranch);
      pipeline.screenAudioBranch = null;
    }
  };

  const enqueueOfferToPeer = (threadKey: string, peerKey: string) => {
    const queued = (peerSignalQueue.get(peerKey) ?? Promise.resolve()).then(async () => {
      if (destroyed || activeCallThreadKey !== threadKey) {
        return;
      }
      const pipeline = peers.get(peerKey);
      if (!pipeline) {
        return;
      }
      try {
        pipeline.makingOffer = true;
        const offer = await pipeline.pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        });
        await pipeline.pc.setLocalDescription(offer);
        if (pipeline.pc.localDescription) {
          options.getSocket()?.sendVcSignal(threadKey, peerKey, {
            kind: 'offer',
            sdp: pipeline.pc.localDescription.toJSON(),
            streamMeta: getLocalStreamMeta(),
          });
        }
      } catch {
        // Ignore transient negotiation errors.
      } finally {
        pipeline.makingOffer = false;
      }
    });
    peerSignalQueue.set(peerKey, queued);
  };

  const applySenderTrack = async (
    pipeline: PeerAudioPipeline,
    slot: 'cameraSender' | 'screenVideoSender' | 'screenAudioSender',
    nextTrack: MediaStreamTrack | null,
    stream: MediaStream | null,
  ): Promise<boolean> => {
    const currentSender = pipeline[slot];
    if (currentSender) {
      if (currentSender.track === nextTrack) {
        return false;
      }
      if (nextTrack && stream) {
        const setStreamsFn = (currentSender as RTCRtpSender & {
          setStreams?: (...streams: MediaStream[]) => void;
        }).setStreams;
        try {
          setStreamsFn?.call(currentSender, stream);
        } catch {
          // Ignore setStreams errors in older browsers.
        }
      }
      await currentSender.replaceTrack(nextTrack);
      return Boolean(nextTrack);
    }
    if (nextTrack && stream) {
      pipeline[slot] = pipeline.pc.addTrack(nextTrack, stream);
      return true;
    }
    return false;
  };

  const syncOutboundMediaTracks = async (): Promise<void> => {
    const threadKey = activeCallThreadKey;
    if (!threadKey) {
      return;
    }
    const camTrack = localCameraStream?.getVideoTracks()[0] ?? null;
    const scrVideoTrack = localScreenStream?.getVideoTracks()[0] ?? null;
    const scrAudioTrack = localScreenStream?.getAudioTracks()[0] ?? null;

    for (const [peerKey, pipeline] of peers.entries()) {
      const c1 = await applySenderTrack(pipeline, 'cameraSender', camTrack, localCameraStream);
      const c2 = await applySenderTrack(
        pipeline,
        'screenVideoSender',
        scrVideoTrack,
        localScreenStream,
      );
      const c3 = await applySenderTrack(
        pipeline,
        'screenAudioSender',
        scrAudioTrack,
        localScreenStream,
      );
      if (c1 || c2 || c3) {
        enqueueOfferToPeer(threadKey, peerKey);
      }
    }
  };

  const createPeerConnection = (threadKey: string, peerKey: string): PeerAudioPipeline => {
    const existing = peers.get(peerKey);
    if (existing) {
      return existing;
    }

    refreshIceServers();
    const pc = new RTCPeerConnection({ iceServers: cachedIceServers });
    const audioEl = createOutputAudioEl();

    const pipeline: PeerAudioPipeline = {
      pc,
      remoteStream: null,
      audioEl,
      micBranch: {
        streamId: null,
        keepaliveEl: null,
        outputEl: audioEl,
        sourceNode: null,
        gainNode: null,
        destNode: null,
      },
      screenAudioBranch: null,
      remoteStreamsById: new Map(),
      remoteCameraStream: null,
      remoteScreenStream: null,
      micSender: null,
      cameraSender: null,
      screenVideoSender: null,
      screenAudioSender: null,
      lastSignalSpeaking: false,
      holdUntil: 0,
      makingOffer: false,
      ignoreOffer: false,
      pendingIce: [],
    };
    peers.set(peerKey, pipeline);

    if (localMicStream) {
      const micTrack = localMicStream.getAudioTracks()[0];
      if (micTrack) {
        pipeline.micSender = pc.addTrack(micTrack, localMicStream);
      }
    } else {
      pc.addTransceiver('audio', { direction: 'recvonly' });
    }

    if (localCameraStream) {
      const camTrack = localCameraStream.getVideoTracks()[0];
      if (camTrack) {
        pipeline.cameraSender = pc.addTrack(camTrack, localCameraStream);
      }
    }

    if (localScreenStream) {
      const scrVid = localScreenStream.getVideoTracks()[0];
      if (scrVid) {
        pipeline.screenVideoSender = pc.addTrack(scrVid, localScreenStream);
      }
      const scrAud = localScreenStream.getAudioTracks()[0];
      if (scrAud) {
        pipeline.screenAudioSender = pc.addTrack(scrAud, localScreenStream);
      }
    }

    pc.onicecandidate = (e) => {
      if (e.candidate && activeCallThreadKey === threadKey) {
        options.getSocket()?.sendVcSignal(threadKey, peerKey, {
          kind: 'ice',
          candidate: e.candidate.toJSON(),
        });
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (
        pc.iceConnectionState === 'failed' &&
        activeCallThreadKey === threadKey &&
        typeof pc.restartIce === 'function'
      ) {
        pc.restartIce();
        enqueueOfferToPeer(threadKey, peerKey);
      }
    };

    pc.ontrack = (e) => {
      const stream = e.streams[0] ?? new MediaStream([e.track]);
      pipeline.remoteStreamsById.set(stream.id, stream);
      classifyPeerMediaStreams(peerKey, pipeline);
      e.track.onunmute = () => {
        classifyPeerMediaStreams(peerKey, pipeline);
        options.onStateChanged();
      };
      e.track.onended = () => {
        classifyPeerMediaStreams(peerKey, pipeline);
        options.onStateChanged();
      };
      options.onStateChanged();
    };

    return pipeline;
  };

  const reconcilePeerConnections = async (call: VcStateEventPayload) => {
    if (!activeCallThreadKey || call.threadKey !== activeCallThreadKey) {
      return;
    }
    const selfKey = options.getSnapshot()?.user.username.toLowerCase();
    if (!selfKey) {
      return;
    }

    const activePeerKeys = new Set(
      call.participants
        .map((p) => p.user.username.toLowerCase())
        .filter((u) => u !== selfKey),
    );

    for (const [peerKey, pipeline] of Array.from(peers.entries())) {
      if (!activePeerKeys.has(peerKey)) {
        disposePeerPipeline(peerKey, pipeline);
      } else {
        const pState = call.participants.find((p) => p.user.username.toLowerCase() === peerKey);
        if (pState) {
          if (
            pState.connectionId &&
            pipeline.remoteConnectionId &&
            pipeline.remoteConnectionId !== pState.connectionId
          ) {
            // Peer switched devices (e.g. PC <-> Mobile) in the same call: reset WebRTC cleanly.
            disposePeerPipeline(peerKey, pipeline);
            continue;
          }
          if (pState.connectionId && !pipeline.remoteConnectionId) {
            pipeline.remoteConnectionId = pState.connectionId;
          }
          if (pState.cameraStreamId) {
            pipeline.remoteCameraStreamId = pState.cameraStreamId;
          } else if (pState.cameraOn === false) {
            pipeline.remoteCameraStreamId = undefined;
          }
          if (pState.screenStreamId) {
            pipeline.remoteScreenStreamId = pState.screenStreamId;
          } else if (pState.screenSharing === false) {
            pipeline.remoteScreenStreamId = undefined;
          }
          classifyPeerMediaStreams(peerKey, pipeline);
        }
      }
    }

    // Ensure our microphone track is captured BEFORE sending SDP offers or answers.
    await attachLocalMicIfNeeded();
    if (destroyed || activeCallThreadKey !== call.threadKey) {
      return;
    }

    for (const peerKey of activePeerKeys) {
      const alreadyHad = peers.has(peerKey);
      const pipeline = createPeerConnection(call.threadKey, peerKey);
      const pState = call.participants.find((p) => p.user.username.toLowerCase() === peerKey);
      if (pState) {
        if (pState.connectionId) {
          pipeline.remoteConnectionId = pState.connectionId;
        }
        if (pState.cameraStreamId) {
          pipeline.remoteCameraStreamId = pState.cameraStreamId;
        } else if (pState.cameraOn === false) {
          pipeline.remoteCameraStreamId = undefined;
        }
        if (pState.screenStreamId) {
          pipeline.remoteScreenStreamId = pState.screenStreamId;
        } else if (pState.screenSharing === false) {
          pipeline.remoteScreenStreamId = undefined;
        }
        if (alreadyHad) {
          classifyPeerMediaStreams(peerKey, pipeline);
        }
      }
      // Deterministic initial offer direction prevents glare on join.
      if (!alreadyHad && selfKey.localeCompare(peerKey) < 0) {
        enqueueOfferToPeer(call.threadKey, peerKey);
      }
    }
    emitStateChanged();
  };

  const syncIncomingPopup = () => {
    if (destroyed) {
      return;
    }
    const first = Array.from(incomingCalls.values())[0];
    if (!first) {
      if (incomingPopupEl) {
        incomingPopupEl.remove();
        incomingPopupEl = null;
      }
      return;
    }

    if (!incomingPopupEl) {
      incomingPopupEl = document.createElement('div');
      incomingPopupEl.className = 'vc-incoming-window';
      incomingPopupEl.setAttribute('role', 'dialog');
      incomingPopupEl.setAttribute('aria-label', 'Incoming Voice Call');
      document.body.appendChild(incomingPopupEl);
    }

    const snap = options.getSnapshot();
    const grp =
      first.kind === 'group' && first.groupId
        ? snap?.groups?.find((g) => g.id === first.groupId)
        : undefined;

    const displayAvatar =
      first.kind === 'group'
        ? grp
          ? resolveGroupAvatar(grp)
          : resolveGroupAvatar({
              name: first.groupName || 'Group',
              iconDataUrl: first.groupIconDataUrl,
            })
        : options.resolveAvatar(first.caller);

    const displayTitle =
      first.kind === 'group'
        ? first.groupName || grp?.name || 'Group Voice Call'
        : first.caller.displayName;
    const displaySub =
      first.kind === 'group'
        ? `${first.caller.displayName} is calling in group`
        : 'Incoming Voice Call';

    incomingPopupEl.replaceChildren();

    const header = document.createElement('div');
    header.className = 'vc-incoming-badge';
    header.textContent = 'INCOMING CALL';
    incomingPopupEl.appendChild(header);

    const avatarRing = document.createElement('div');
    avatarRing.className = 'vc-incoming-avatar-ring';
    const img = document.createElement('img');
    img.className = 'vc-incoming-avatar';
    img.src = displayAvatar;
    img.alt = displayTitle;
    avatarRing.appendChild(img);
    incomingPopupEl.appendChild(avatarRing);

    const nameEl = document.createElement('div');
    nameEl.className = 'vc-incoming-name';
    nameEl.textContent = displayTitle;
    incomingPopupEl.appendChild(nameEl);

    const subEl = document.createElement('div');
    subEl.className = 'vc-incoming-sub';
    subEl.textContent = displaySub;
    incomingPopupEl.appendChild(subEl);

    const btnRow = document.createElement('div');
    btnRow.className = 'vc-incoming-actions';

    const denyBtn = document.createElement('button');
    denyBtn.type = 'button';
    denyBtn.className = 'vc-incoming-btn vc-incoming-btn--deny';
    denyBtn.title = 'Decline Call';
    denyBtn.setAttribute('aria-label', 'Decline Call');
    denyBtn.appendChild(createPhoneHangupIconSvg(19));
    const denyLabel = document.createElement('span');
    denyLabel.textContent = 'Decline';
    denyBtn.appendChild(denyLabel);
    denyBtn.addEventListener('click', () => declineIncomingCall(first.threadKey));

    const acceptBtn = document.createElement('button');
    acceptBtn.type = 'button';
    acceptBtn.className = 'vc-incoming-btn vc-incoming-btn--accept';
    acceptBtn.title = 'Accept Call';
    acceptBtn.setAttribute('aria-label', 'Accept Call');
    acceptBtn.appendChild(createPhoneCallIconSvg(18));
    const acceptLabel = document.createElement('span');
    acceptLabel.textContent = 'Accept';
    acceptBtn.appendChild(acceptLabel);
    acceptBtn.addEventListener('click', () => acceptIncomingCall(first.threadKey));

    btnRow.appendChild(denyBtn);
    btnRow.appendChild(acceptBtn);
    incomingPopupEl.appendChild(btnRow);
  };

  const closeActivePopover = () => {
    activePopoverCleanup?.();
    activePopoverCleanup = null;
    activeScreenModalCleanup?.();
    activeScreenModalCleanup = null;
  };

  const leaveCall = () => {
    const leavingThread = activeCallThreadKey;
    if (!leavingThread) {
      return;
    }
    recentlyLeftCalls.set(leavingThread, Date.now());
    lastAutoLeaveResendAt.delete(leavingThread);
    watchedStreamKeys.clear();
    knownPeersByCall.delete(leavingThread);
    activitiesCtrl.leaveAllSeatedLobbiesForCall(leavingThread);
    closeActivePopover();
    expandedStageKey = null;
    activeCallThreadKey = null;
    activeCallTarget = null;
    lastActiveSpeakerKey = null;
    lastSentVoiceStateSig = '';
    stopCallStatsPolling();
    stopVadPolling();
    stopLocalCameraCapture(false);
    stopLocalScreenCapture(false, false);
    stopLocalMicCapture();
    closeAllPeers();

    // Optimistically remove self from the call state immediately (0ms) so the VC topbar
    // no longer shows you inside the call while looking at the chat from outside.
    const selfKey = options.getSnapshot()?.user.username.toLowerCase();
    const existingCall = callsByThread.get(leavingThread);
    if (existingCall && selfKey) {
      const remainingParticipants = existingCall.participants.filter(
        (p) => p.user.username.toLowerCase() !== selfKey,
      );
      const remainingRinging = existingCall.ringing.filter(
        (r) => r.username.toLowerCase() !== selfKey,
      );
      if (remainingParticipants.length === 0 && remainingRinging.length === 0) {
        callsByThread.delete(leavingThread);
      } else {
        callsByThread.set(leavingThread, {
          ...existingCall,
          active: remainingParticipants.length > 0 || remainingRinging.length > 0,
          participants: remainingParticipants,
          ringing: remainingRinging,
        });
      }
    }

    options.getSocket()?.sendVcLeave(leavingThread);
    playVcLeaveSound();
    syncRingAudio();
    emitStateChanged();
  };

  const toggleCamera = async () => {
    if (!activeCallThreadKey || destroyed) {
      return;
    }
    if (localCameraStream) {
      stopLocalCameraCapture(true);
      return;
    }
    try {
      const stream = await captureCameraStream(
        isMobileTouchDevice() ? cameraFacingMode : undefined,
      );
      if (destroyed || !activeCallThreadKey) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      localCameraStream = stream;
      const vidTrack = stream.getVideoTracks()[0];
      if (vidTrack) {
        vidTrack.onended = () => {
          stopLocalCameraCapture(true);
        };
      }
      await syncOutboundMediaTracks();
      syncTrackAndSinkStates();
      emitStateChanged();
    } catch {
      options.onErrorNotice?.('Error: Could not access camera — check browser permissions');
    }
  };

  const flipCamera = async () => {
    if (!activeCallThreadKey || !localCameraStream || flippingCamera || destroyed) {
      return;
    }
    flippingCamera = true;
    const prevFacing = cameraFacingMode;
    const nextFacing: 'user' | 'environment' = prevFacing === 'user' ? 'environment' : 'user';
    const prevStream = localCameraStream;
    try {
      // On some phones, releasing the active camera track first allows switching lenses cleanly.
      for (const t of prevStream.getTracks()) {
        t.onended = null;
        t.stop();
      }
      const nextStream = await captureCameraStream(nextFacing);
      if (destroyed || !activeCallThreadKey) {
        nextStream.getTracks().forEach((t) => t.stop());
        return;
      }
      cameraFacingMode = nextFacing;
      localCameraStream = nextStream;
      const nextTrack = nextStream.getVideoTracks()[0];
      if (nextTrack) {
        nextTrack.onended = () => {
          stopLocalCameraCapture(true);
        };
      }
      let usedFastReplace = false;
      for (const pipeline of peers.values()) {
        if (pipeline.cameraSender && nextTrack) {
          try {
            await pipeline.cameraSender.replaceTrack(nextTrack);
            usedFastReplace = true;
          } catch {
            // Fall back to full syncOutboundMediaTracks below.
          }
        }
      }
      if (!usedFastReplace) {
        await syncOutboundMediaTracks();
      }
      syncTrackAndSinkStates();
      emitStateChanged();
    } catch {
      cameraFacingMode = prevFacing;
      try {
        const restored = await captureCameraStream(prevFacing);
        localCameraStream = restored;
        await syncOutboundMediaTracks();
      } catch {
        localCameraStream = null;
      }
      syncTrackAndSinkStates();
      emitStateChanged();
      options.onErrorNotice?.('Could not switch camera — only one camera may be available on this device.');
    } finally {
      flippingCamera = false;
    }
  };

  const formatScreenQualityLabel = (compact = false): string => {
    const res = screenSharePrefs.resolution === 'source' ? (compact ? 'SRC' : 'Source') : screenSharePrefs.resolution;
    return compact ? `${res} ${screenSharePrefs.fps}` : `${res} • ${screenSharePrefs.fps} FPS`;
  };

  const setLocalScreenPaused = (nextPaused: boolean) => {
    const normalized = Boolean(localScreenStream && nextPaused);
    if (localScreenPaused === normalized) {
      return;
    }
    localScreenPaused = normalized;
    syncTrackAndSinkStates();
    emitStateChanged();
  };

  const attachScreenShareEndHandlers = (stream: MediaStream) => {
    cleanupLocalScreenListeners?.();
    localScreenPaused = false;
    let endedHandled = false;
    let hostMinimizedPaused = false;
    const handleStreamEnded = () => {
      if (endedHandled || localScreenStream !== stream) {
        return;
      }
      endedHandled = true;
      stopLocalScreenCapture(true);
    };

    const videoTracks = stream.getVideoTracks();
    const primaryTrack = videoTracks[0] ?? null;
    const primarySettings =
      primaryTrack && typeof primaryTrack.getSettings === 'function'
        ? (primaryTrack.getSettings() as MediaTrackSettings & { displaySurface?: string })
        : null;
    const isTabOrWindowCapture =
      primarySettings?.displaySurface === 'browser' ||
      primarySettings?.displaySurface === 'window' ||
      screenSharePrefs.surface === 'browser' ||
      screenSharePrefs.surface === 'window';

    const evaluatePausedState = () => {
      if (endedHandled || localScreenStream !== stream) {
        return;
      }
      const trackMuted = videoTracks.some((t) => Boolean(t.muted));
      const browserWindowMinimized =
        isTabOrWindowCapture &&
        document.visibilityState === 'hidden' &&
        (window.screenX < -10000 ||
          window.screenY < -10000 ||
          window.outerWidth <= 160 ||
          window.outerHeight <= 50);
      setLocalScreenPaused(hostMinimizedPaused || trackMuted || browserWindowMinimized);
    };

    const cleanups: Array<() => void> = [];
    for (const vt of videoTracks) {
      const onTrackEnded = () => handleStreamEnded();
      const onTrackMute = () => evaluatePausedState();
      const onTrackUnmute = () => evaluatePausedState();
      vt.addEventListener('ended', onTrackEnded);
      vt.addEventListener('mute', onTrackMute);
      vt.addEventListener('unmute', onTrackUnmute);
      cleanups.push(() => {
        vt.removeEventListener('ended', onTrackEnded);
        vt.removeEventListener('mute', onTrackMute);
        vt.removeEventListener('unmute', onTrackUnmute);
        vt.onended = null;
      });
    }
    const onStreamInactive = () => handleStreamEnded();
    const onTrackRemoved = () => {
      const hasLiveVideo = stream.getVideoTracks().some((t) => t.readyState === 'live');
      if (!hasLiveVideo) {
        handleStreamEnded();
      }
    };
    const onHostPaused = (ev: Event) => {
      const customEv = ev as CustomEvent<{ paused?: boolean }>;
      hostMinimizedPaused = Boolean(customEv.detail?.paused);
      evaluatePausedState();
    };
    const onVisibilityChange = () => evaluatePausedState();
    const pausePollId = window.setInterval(evaluatePausedState, 750);

    stream.addEventListener('inactive', onStreamInactive);
    stream.addEventListener('removetrack', onTrackRemoved);
    stream.addEventListener('rs-screen-paused', onHostPaused);
    document.addEventListener('visibilitychange', onVisibilityChange);
    evaluatePausedState();

    cleanupLocalScreenListeners = () => {
      window.clearInterval(pausePollId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      stream.removeEventListener('inactive', onStreamInactive);
      stream.removeEventListener('removetrack', onTrackRemoved);
      stream.removeEventListener('rs-screen-paused', onHostPaused);
      for (const fn of cleanups) {
        fn();
      }
    };
  };

  const applyLiveScreenShareSettings = async (
    patch: Partial<Pick<ScreenShareOptions, 'resolution' | 'fps'>>,
  ) => {
    screenSharePrefs = { ...screenSharePrefs, ...patch };
    const activeStream = localScreenStream;
    if (!activeStream || destroyed) {
      emitStateChanged();
      return;
    }
    await applyLiveScreenShareOptions(activeStream, screenSharePrefs);
    for (const pipeline of peers.values()) {
      const sender = pipeline.screenVideoSender;
      if (!sender || typeof sender.getParameters !== 'function' || typeof sender.setParameters !== 'function') {
        continue;
      }
      try {
        const params = sender.getParameters();
        if (params.encodings && params.encodings.length > 0) {
          params.encodings[0].maxFramerate = screenSharePrefs.fps;
          await sender.setParameters(params).catch(() => {});
        }
      } catch {
        // Some WebRTC implementations reject live setParameters on active encoders.
      }
    }
    emitStateChanged();
  };

  interface ScreenShareStartResult {
    ok: boolean;
    cancelled?: boolean;
    blocked?: boolean;
    error?: string;
  }

  const startScreenShareWithOptions = async (
    opts: ScreenShareOptions & { hostSource?: HostScreenSource },
  ): Promise<ScreenShareStartResult> => {
    if (!activeCallThreadKey || destroyed) {
      return { ok: false, error: 'Not in an active call' };
    }
    const nextPrefs: ScreenShareOptions = {
      resolution: opts.resolution,
      fps: opts.fps,
      shareAudio: opts.shareAudio,
      surface: opts.surface,
    };
    const startedAt = Date.now();
    try {
      const stream = opts.hostSource
        ? await captureHostPreviewStream(opts.hostSource, nextPrefs)
        : await captureScreenShareStream(nextPrefs);
      const vidTrack = stream.getVideoTracks()[0];
      if (destroyed || !activeCallThreadKey || !vidTrack || vidTrack.readyState === 'ended') {
        disposeScreenShareStream(stream);
        stream.getTracks().forEach((t) => t.stop());
        return { ok: false, error: 'Selected capture source ended immediately' };
      }
      screenSharePrefs = nextPrefs;
      const wasAlreadyStreaming = Boolean(localScreenStream);
      stopLocalScreenCapture(false, false);
      localScreenStream = stream;
      attachScreenShareEndHandlers(stream);
      if (!wasAlreadyStreaming) {
        playStreamStartSound();
      }
      const selfKey = options.getSnapshot()?.user.username.toLowerCase();
      if (selfKey) {
        expandedStageKey = `scr:${selfKey}`;
      }
      await syncOutboundMediaTracks();
      syncTrackAndSinkStates();
      emitStateChanged();
      return { ok: true };
    } catch (err) {
      const elapsed = Date.now() - startedAt;
      const errName = err instanceof DOMException ? err.name : '';
      const errMsg = err instanceof Error ? err.message : String(err);
      const isPolicyOrUnsupported =
        errMsg.startsWith('UNSUPPORTED:') ||
        errName === 'NotSupportedError' ||
        errName === 'TypeError' ||
        /disallowed|policy|unsupported|not available|not supported/i.test(errMsg) ||
        (errName === 'NotAllowedError' && elapsed < 180);
      const isCancelled = !isPolicyOrUnsupported && (errName === 'AbortError' || errName === 'NotAllowedError');
      return {
        ok: false,
        cancelled: isCancelled,
        blocked: isPolicyOrUnsupported,
        error: errMsg,
      };
    }
  };

  const mountAnchoredPopover = (
    anchorRect: { left: number; top: number; right: number; bottom: number },
    el: HTMLDivElement,
  ) => {
    closeActivePopover();
    document.body.appendChild(el);
    const margin = 10;
    const rect = el.getBoundingClientRect();
    let left = Math.min(Math.max(margin, anchorRect.left), window.innerWidth - rect.width - margin);
    let top = anchorRect.bottom + 8;
    if (top + rect.height > window.innerHeight - margin) {
      top = Math.max(margin, anchorRect.top - rect.height - 8);
    }
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;

    const onPointerDown = (ev: Event) => {
      const t = ev.target as Node | null;
      if (t && el.contains(t)) {
        return;
      }
      closeActivePopover();
    };
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        closeActivePopover();
      }
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown, true);
    activePopoverCleanup = () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown, true);
      el.remove();
    };
  };

  const buildSurfaceMockupPreview = (kind: 'window' | 'monitor' | 'browser' | 'any'): HTMLDivElement => {
    const mock = document.createElement('div');
    mock.className = `vc-screen-mockup vc-screen-mockup--${kind}`;
    const bar = document.createElement('div');
    bar.className = 'vc-screen-mockup-bar';
    for (let i = 0; i < 3; i += 1) {
      const dot = document.createElement('span');
      dot.className = 'vc-screen-mockup-dot';
      bar.appendChild(dot);
    }
    const body = document.createElement('div');
    body.className = 'vc-screen-mockup-body';
    const cardA = document.createElement('div');
    cardA.className = 'vc-screen-mockup-pane vc-screen-mockup-pane--a';
    const cardB = document.createElement('div');
    cardB.className = 'vc-screen-mockup-pane vc-screen-mockup-pane--b';
    body.appendChild(cardA);
    if (kind !== 'browser') {
      body.appendChild(cardB);
    }
    mock.appendChild(bar);
    mock.appendChild(body);
    return mock;
  };

  type ModalTabKey = 'window' | 'screen' | 'tab';
  type ModalSourceItem =
    | { key: string; kind: 'host'; tab: ModalTabKey; hostSource: HostScreenSource }
    | {
        key: string;
        kind: 'browser';
        tab: ModalTabKey;
        surface: ScreenShareSurface;
        title: string;
        subtitle: string;
        badge: string;
        mockKind: 'window' | 'monitor' | 'browser' | 'any';
      };

  const openScreenShareModal = () => {
    closeActivePopover();

    const backdrop = document.createElement('div');
    backdrop.className = 'vc-screen-modal-backdrop';
    const modal = document.createElement('div');
    modal.className = 'vc-screen-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Share Your Screen');

    const draft: ScreenShareOptions = { ...screenSharePrefs };
    let activeTab: ModalTabKey = 'window';
    let hostSources: HostScreenSource[] = [];
    let hostSupported = false;
    let loadingSources = true;
    let startingStream = false;
    let selectedKey = '';

    const header = document.createElement('div');
    header.className = 'vc-screen-modal-header';
    const titleWrap = document.createElement('div');
    const titleEl = document.createElement('h3');
    titleEl.className = 'vc-screen-modal-title';
    titleEl.textContent = localScreenStream ? 'Switch Screen Share' : 'Share Your Screen';
    const subEl = document.createElement('div');
    subEl.className = 'vc-screen-modal-sub';
    subEl.textContent =
      'Choose an open window, entire desktop, or browser tab to preview before going live.';
    titleWrap.appendChild(titleEl);
    titleWrap.appendChild(subEl);

    const headerBtns = document.createElement('div');
    headerBtns.className = 'vc-screen-modal-header-btns';

    const refreshBtn = document.createElement('button');
    refreshBtn.type = 'button';
    refreshBtn.className = 'vc-screen-modal-icon-btn';
    refreshBtn.title = 'Refresh Window & Desktop Previews';
    refreshBtn.textContent = '↻ Refresh';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'vc-screen-modal-close';
    closeBtn.title = 'Close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.textContent = '×';

    headerBtns.appendChild(refreshBtn);
    headerBtns.appendChild(closeBtn);
    header.appendChild(titleWrap);
    header.appendChild(headerBtns);

    const tabBar = document.createElement('div');
    tabBar.className = 'vc-screen-modal-tabs';
    tabBar.setAttribute('role', 'tablist');

    const alertBox = document.createElement('div');
    alertBox.className = 'vc-screen-modal-alert';
    alertBox.hidden = true;

    const previewGrid = document.createElement('div');
    previewGrid.className = 'vc-screen-preview-grid';

    const footer = document.createElement('div');
    footer.className = 'vc-screen-modal-footer';

    const buildPillControl = <T extends string | number>(
      labelText: string,
      choices: Array<{ label: string; value: T }>,
      initial: T,
      onPick: (val: T) => void,
    ) => {
      const group = document.createElement('div');
      group.className = 'vc-screen-modal-opt-group';
      const lbl = document.createElement('span');
      lbl.className = 'vc-screen-modal-opt-label';
      lbl.textContent = labelText;
      const pills = document.createElement('div');
      pills.className = 'vc-screen-modal-pills';
      const btns: HTMLButtonElement[] = [];
      let current = initial;
      for (const ch of choices) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'vc-popover-pill';
        if (ch.value === current) {
          b.classList.add('vc-popover-pill--active');
        }
        b.textContent = ch.label;
        b.addEventListener('click', () => {
          current = ch.value;
          onPick(ch.value);
          btns.forEach((other, idx) => {
            other.classList.toggle('vc-popover-pill--active', choices[idx].value === current);
          });
        });
        btns.push(b);
        pills.appendChild(b);
      }
      group.appendChild(lbl);
      group.appendChild(pills);
      return group;
    };

    const settingsLeft = document.createElement('div');
    settingsLeft.className = 'vc-screen-modal-settings';
    settingsLeft.appendChild(
      buildPillControl<'720p' | '1080p' | 'source'>(
        'Resolution',
        [
          { label: '720p', value: '720p' },
          { label: '1080p', value: '1080p' },
          { label: 'Source', value: 'source' },
        ],
        draft.resolution,
        (v) => {
          draft.resolution = v;
        },
      ),
    );
    settingsLeft.appendChild(
      buildPillControl<30 | 60>(
        'Frame Rate',
        [
          { label: '30 FPS', value: 30 },
          { label: '60 FPS', value: 60 },
        ],
        draft.fps,
        (v) => {
          draft.fps = v;
        },
      ),
    );

    const audioLabel = document.createElement('label');
    audioLabel.className = 'vc-popover-check';
    const audioInput = document.createElement('input');
    audioInput.type = 'checkbox';
    audioInput.checked = draft.shareAudio;
    audioInput.addEventListener('change', () => {
      draft.shareAudio = audioInput.checked;
    });
    const audioText = document.createElement('span');
    audioText.textContent = 'Share Tab / System Audio';
    audioLabel.appendChild(audioInput);
    audioLabel.appendChild(audioText);
    settingsLeft.appendChild(audioLabel);

    const footerActions = document.createElement('div');
    footerActions.className = 'vc-screen-modal-actions';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'vc-popover-pill';
    cancelBtn.textContent = 'Cancel';
    const goLiveBtn = document.createElement('button');
    goLiveBtn.type = 'button';
    goLiveBtn.className = 'vc-popover-primary-btn vc-screen-modal-go-btn';
    goLiveBtn.textContent = 'Go Live';

    footerActions.appendChild(cancelBtn);
    footerActions.appendChild(goLiveBtn);
    footer.appendChild(settingsLeft);
    footer.appendChild(footerActions);

    modal.appendChild(header);
    modal.appendChild(tabBar);
    modal.appendChild(alertBox);
    modal.appendChild(previewGrid);
    modal.appendChild(footer);
    backdrop.appendChild(modal);

    const buildCatalog = (): ModalSourceItem[] => {
      const items: ModalSourceItem[] = [];
      for (const hs of hostSources) {
        items.push({
          key: `host:${hs.id}`,
          kind: 'host',
          tab: hs.kind === 'screen' ? 'screen' : 'window',
          hostSource: hs,
        });
      }
      return items;
    };

    const showModalNotice = (
      text: string,
      kind: 'error' | 'info',
      showCopyUrlBtn = false,
    ) => {
      alertBox.hidden = false;
      alertBox.className =
        kind === 'error'
          ? 'vc-screen-modal-alert vc-screen-modal-alert--error'
          : 'vc-screen-modal-alert vc-screen-modal-alert--info';
      alertBox.replaceChildren();
      const msgSpan = document.createElement('span');
      msgSpan.textContent = text;
      alertBox.appendChild(msgSpan);
      if (showCopyUrlBtn) {
        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'vc-popover-pill vc-screen-modal-copy-btn';
        copyBtn.textContent = 'Copy URL for Chrome';
        copyBtn.addEventListener('click', () => {
          void navigator.clipboard?.writeText(window.location.href).catch(() => {});
          copyBtn.textContent = 'Copied!';
        });
        alertBox.appendChild(copyBtn);
      }
    };

    const syncSelectionUi = () => {
      const catalog = buildCatalog();
      const visibleItems = catalog.filter((i) => i.tab === activeTab);
      if (!visibleItems.some((i) => i.key === selectedKey)) {
        selectedKey = visibleItems[0]?.key ?? '';
      }
      const chosen = visibleItems.find((i) => i.key === selectedKey) ?? null;

      goLiveBtn.disabled = startingStream || !chosen;
      if (!startingStream) {
        goLiveBtn.textContent =
          chosen?.kind === 'browser' ? 'Choose Source & Go Live' : 'Go Live';
      }

      const isElectronSource = Boolean(
        getDesktopBridge() &&
          chosen?.kind === 'host' &&
          (chosen.hostSource.id.startsWith('screen:') || chosen.hostSource.id.startsWith('window:')),
      );
      const audioSupportedForSelection = chosen?.kind !== 'host' || isElectronSource;
      audioLabel.classList.toggle('vc-popover-check--muted', !audioSupportedForSelection);
      audioInput.disabled = !audioSupportedForSelection;
      audioText.textContent = audioSupportedForSelection
        ? isElectronSource
          ? 'Share System Audio'
          : 'Share Tab / System Audio'
        : 'Video stream (audio unsupported on host window capture)';

      for (const el of Array.from(previewGrid.querySelectorAll<HTMLElement>('.vc-screen-preview-card'))) {
        el.classList.toggle('vc-screen-preview-card--selected', el.dataset.sourceKey === selectedKey);
      }
    };

    const startSelectedItem = async (item: ModalSourceItem) => {
      if (startingStream) {
        return;
      }
      startingStream = true;
      goLiveBtn.disabled = true;
      goLiveBtn.textContent = 'Starting...';
      alertBox.hidden = true;

      const bridge = getDesktopBridge();
      let result;
      if (
        bridge &&
        item.kind === 'host' &&
        (item.hostSource.id.startsWith('screen:') || item.hostSource.id.startsWith('window:'))
      ) {
        await bridge.selectDesktopSource(item.hostSource.id, draft.shareAudio);
        result = await startScreenShareWithOptions({
          ...draft,
          surface: item.hostSource.kind === 'screen' ? 'monitor' : 'window',
        });
      } else {
        result =
          item.kind === 'host'
            ? await startScreenShareWithOptions({ ...draft, hostSource: item.hostSource })
            : await startScreenShareWithOptions({ ...draft, surface: item.surface });
      }

      startingStream = false;
      if (result.ok) {
        closeActivePopover();
        return;
      }

      syncSelectionUi();
      if (result.blocked) {
        const hasHostCards = hostSources.length > 0;
        showModalNotice(
          hasHostCards
            ? 'Browser native picker is blocked in this embedded view. Select any live Window or Desktop thumbnail preview above, or open Redshift in Chrome/Edge.'
            : 'This browser view blocks native screen/tab picking (common in IDE embedded panes). Open http://localhost:5173/ in Chrome or Edge—or start the dev server from your desktop terminal for live window & desktop previews here.',
          'error',
          true,
        );
      } else if (result.cancelled) {
        showModalNotice(
          'Screen selection was cancelled. Pick a source card above or click Go Live to try again.',
          'info',
          false,
        );
      } else if (result.error) {
        showModalNotice(result.error, 'error', false);
      }
    };

    const renderModalBody = () => {
      const catalog = buildCatalog();
      const winCount = catalog.filter((i) => i.tab === 'window' && i.kind === 'host').length;
      const scrCount = catalog.filter((i) => i.tab === 'screen' && i.kind === 'host').length;

      tabBar.replaceChildren();
      const tabDefs: Array<{ key: ModalTabKey; label: string; count?: number }> = [
        { key: 'window', label: 'Windows', count: winCount },
        { key: 'screen', label: 'Entire Desktop', count: scrCount },
      ];
      for (const td of tabDefs) {
        const tBtn = document.createElement('button');
        tBtn.type = 'button';
        tBtn.className =
          td.key === activeTab ? 'vc-screen-tab vc-screen-tab--active' : 'vc-screen-tab';
        tBtn.dataset.screenTab = td.key;
        tBtn.setAttribute('role', 'tab');
        tBtn.setAttribute('aria-selected', td.key === activeTab ? 'true' : 'false');
        tBtn.textContent =
          typeof td.count === 'number' && td.count > 0 ? `${td.label} (${td.count})` : td.label;
        tBtn.addEventListener('click', () => {
          activeTab = td.key;
          alertBox.hidden = true;
          renderModalBody();
        });
        tabBar.appendChild(tBtn);
      }

      previewGrid.replaceChildren();
      if (loadingSources && !hostSupported && activeTab !== 'tab') {
        const loadingNote = document.createElement('div');
        loadingNote.className = 'vc-screen-modal-loading';
        loadingNote.textContent = 'Scanning open windows and displays for live previews...';
        previewGrid.appendChild(loadingNote);
      }

      const visible = catalog.filter((i) => i.tab === activeTab);
      if (!visible.some((i) => i.key === selectedKey)) {
        selectedKey = visible[0]?.key ?? '';
      }

      if (visible.length === 0 && !loadingSources) {
        const emptyNote = document.createElement('div');
        emptyNote.className = 'vc-screen-modal-loading';
        emptyNote.textContent =
          activeTab === 'screen'
            ? 'No displays detected. Click Refresh to rescan.'
            : 'No open application windows detected. Click Refresh to rescan.';
        previewGrid.appendChild(emptyNote);
      }

      for (const item of visible) {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'vc-screen-preview-card';
        card.dataset.sourceKey = item.key;
        if (item.kind === 'browser') {
          card.dataset.surface = item.surface;
        } else {
          card.dataset.hostSourceId = item.hostSource.id;
          card.dataset.surface = item.hostSource.kind === 'screen' ? 'monitor' : 'window';
        }

        const thumbWrap = document.createElement('div');
        thumbWrap.className = 'vc-screen-preview-thumb-wrap';
        if (item.kind === 'host' && item.hostSource.thumbnailDataUrl) {
          const img = document.createElement('img');
          img.className = 'vc-screen-preview-thumb';
          img.src = item.hostSource.thumbnailDataUrl;
          img.alt = item.hostSource.name;
          thumbWrap.appendChild(img);
        } else if (item.kind === 'browser') {
          thumbWrap.appendChild(buildSurfaceMockupPreview(item.mockKind));
        }

        const badge = document.createElement('span');
        badge.className = 'vc-screen-preview-badge';
        badge.textContent =
          item.kind === 'host'
            ? `${item.hostSource.width}×${item.hostSource.height}`
            : item.badge;
        thumbWrap.appendChild(badge);

        const meta = document.createElement('div');
        meta.className = 'vc-screen-preview-meta';
        const cTitle = document.createElement('div');
        cTitle.className = 'vc-screen-preview-title';
        cTitle.textContent = item.kind === 'host' ? item.hostSource.name : item.title;
        const cSub = document.createElement('div');
        cSub.className = 'vc-screen-preview-sub';
        cSub.textContent =
          item.kind === 'host'
            ? item.hostSource.kind === 'screen'
              ? 'Entire Monitor • Live Preview'
              : `${item.hostSource.processName} • Live Preview`
            : item.subtitle;

        meta.appendChild(cTitle);
        meta.appendChild(cSub);
        card.appendChild(thumbWrap);
        card.appendChild(meta);

        card.addEventListener('click', () => {
          selectedKey = item.key;
          syncSelectionUi();
        });
        card.addEventListener('dblclick', () => {
          selectedKey = item.key;
          syncSelectionUi();
          void startSelectedItem(item);
        });
        previewGrid.appendChild(card);
      }

      syncSelectionUi();
    };

    const loadSources = async () => {
      loadingSources = true;
      refreshBtn.disabled = true;
      renderModalBody();

      const bridge = getDesktopBridge();
      if (bridge) {
        try {
          const nativeSources = await bridge.getDesktopSources();
          if (destroyed || !backdrop.isConnected) {
            return;
          }
          loadingSources = false;
          refreshBtn.disabled = false;
          hostSupported = true;
          hostSources = nativeSources.map((s) => ({
            id: s.id,
            kind: s.kind,
            name: s.name,
            processName: s.kind === 'screen' ? 'Display' : 'Desktop Window',
            width: 1920,
            height: 1080,
            thumbnailDataUrl: s.thumbnailDataUrl,
          }));
          renderModalBody();
          return;
        } catch {
          // Fall back to local host capture service if Electron IPC fails.
        }
      }

      const res = await apiFetchHostScreenSources();
      if (destroyed || !backdrop.isConnected) {
        return;
      }
      loadingSources = false;
      refreshBtn.disabled = false;
      hostSupported = res.supported;
      hostSources = res.sources;
      renderModalBody();
    };

    refreshBtn.addEventListener('click', () => {
      void loadSources();
    });
    goLiveBtn.addEventListener('click', () => {
      const chosen = buildCatalog().find((i) => i.tab === activeTab && i.key === selectedKey);
      if (chosen) {
        void startSelectedItem(chosen);
      }
    });
    closeBtn.addEventListener('click', closeActivePopover);
    cancelBtn.addEventListener('click', closeActivePopover);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        closeActivePopover();
      }
    });

    const onKeyDown = (e: KeyboardEvent) => {
      if (!isTopmostModal(backdrop)) {
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        closeActivePopover();
        return;
      }
      if (isModalConfirmShortcut(e, backdrop) && !goLiveBtn.disabled) {
        e.preventDefault();
        e.stopImmediatePropagation();
        goLiveBtn.click();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    activeScreenModalCleanup = () => {
      window.removeEventListener('keydown', onKeyDown, true);
      backdrop.remove();
    };

    document.body.appendChild(backdrop);
    void loadSources();
  };

  const openScreenSharePopover = (
    anchorOrRect: HTMLElement | { left: number; top: number; right: number; bottom: number },
    modeOverride?: 'source' | 'live',
  ) => {
    const getAnchorRect = () =>
      anchorOrRect instanceof HTMLElement ? anchorOrRect.getBoundingClientRect() : anchorOrRect;
    const isSharing = Boolean(localScreenStream);
    const mode: 'source' | 'live' =
      modeOverride ?? (isSharing ? 'live' : 'source');

    if (mode === 'source') {
      openScreenShareModal();
      return;
    }

    const pop = document.createElement('div');
    pop.className = 'vc-popover-card vc-popover-card--wide';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'Live Screen Share Controls');

    const titleRow = document.createElement('div');
    titleRow.className = 'vc-popover-title-row';
    const title = document.createElement('div');
    title.className = 'vc-popover-title';
    title.textContent = 'Stream Quality (Live)';
    const liveBadge = document.createElement('span');
    liveBadge.className = 'vc-popover-vol-pill';
    const syncLiveBadge = () => {
      const st = getScreenShareStreamSettings(localScreenStream);
      const actualDims =
        st?.width && st?.height ? ` (${st.width}×${st.height})` : '';
      liveBadge.textContent = `${formatScreenQualityLabel(false)}${actualDims}`;
    };
    syncLiveBadge();
    titleRow.appendChild(title);
    titleRow.appendChild(liveBadge);
    pop.appendChild(titleRow);

    const buildLivePillRow = <T extends string | number>(
      labelText: string,
      choices: Array<{ label: string; value: T }>,
      initial: T,
      onPick: (val: T) => void,
    ) => {
      const group = document.createElement('div');
      group.className = 'vc-popover-group';
      const lbl = document.createElement('div');
      lbl.className = 'vc-popover-label';
      lbl.textContent = labelText;
      group.appendChild(lbl);

      const row = document.createElement('div');
      row.className = 'vc-popover-pills';
      const btns: HTMLButtonElement[] = [];
      let current = initial;

      for (const ch of choices) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'vc-popover-pill';
        if (ch.value === current) {
          b.classList.add('vc-popover-pill--active');
        }
        b.textContent = ch.label;
        b.addEventListener('click', () => {
          current = ch.value;
          onPick(ch.value);
          btns.forEach((other, idx) => {
            other.classList.toggle('vc-popover-pill--active', choices[idx].value === current);
          });
        });
        btns.push(b);
        row.appendChild(b);
      }
      group.appendChild(row);
      pop.appendChild(group);
    };

    buildLivePillRow<'720p' | '1080p' | 'source'>(
      'Resolution',
      [
        { label: '720p', value: '720p' },
        { label: '1080p', value: '1080p' },
        { label: 'Source', value: 'source' },
      ],
      screenSharePrefs.resolution,
      (v) => {
        void applyLiveScreenShareSettings({ resolution: v }).then(syncLiveBadge);
      },
    );

    buildLivePillRow<30 | 60>(
      'Frame Rate',
      [
        { label: '30 FPS', value: 30 },
        { label: '60 FPS', value: 60 },
      ],
      screenSharePrefs.fps,
      (v) => {
        void applyLiveScreenShareSettings({ fps: v }).then(syncLiveBadge);
      },
    );

    const actionsRow = document.createElement('div');
    actionsRow.className = 'vc-popover-actions-row';

    const switchBtn = document.createElement('button');
    switchBtn.type = 'button';
    switchBtn.className = 'vc-popover-pill';
    switchBtn.textContent = 'Switch Source...';
    switchBtn.addEventListener('click', () => {
      openScreenSharePopover(anchorOrRect, 'source');
    });

    const stopBtn = document.createElement('button');
    stopBtn.type = 'button';
    stopBtn.className = 'vc-popover-primary-btn';
    stopBtn.textContent = 'Stop Sharing';
    stopBtn.addEventListener('click', () => {
      closeActivePopover();
      stopLocalScreenCapture(true);
    });

    actionsRow.appendChild(switchBtn);
    actionsRow.appendChild(stopBtn);
    pop.appendChild(actionsRow);

    mountAnchoredPopover(getAnchorRect(), pop);
  };

  const resolveUserThreadMuteKey = (vcThreadKey: string): string => {
    if (vcThreadKey.startsWith('group:')) {
      return vcThreadKey;
    }
    const selfKey = options.getSnapshot()?.user.username.toLowerCase();
    const parts = vcThreadKey.split('::');
    const peer = parts.find((u) => u.toLowerCase() !== selfKey) ?? parts[0] ?? '';
    return `dm:${peer.toLowerCase()}`;
  };

  const togglePictureInPicture = async (videoEl: HTMLVideoElement | null | undefined) => {
    if (!videoEl) {
      return;
    }
    try {
      if (document.pictureInPictureElement === videoEl) {
        await document.exitPictureInPicture();
      } else if (typeof videoEl.requestPictureInPicture === 'function') {
        await videoEl.requestPictureInPicture();
      }
    } catch {
      // Ignore browser PiP rejection if stream is not ready.
    }
  };

  const openRemoteParticipantMenu = (
    user: PublicProfile,
    clientX: number,
    clientY: number,
    stageMeta?: { stageKey?: string; videoEl?: HTMLVideoElement | null; ringingOnly?: boolean },
  ) => {
    const peerKey = user.username.toLowerCase();
    const selfKey = options.getSnapshot()?.user.username.toLowerCase() ?? '';
    const dmThreadKey = selfKey ? [selfKey, peerKey].sort().join('::') : '';
    const ringingOnly = Boolean(stageMeta?.ringingOnly);
    const initial = getVoiceUserVolume(peerKey);
    const activeCall = activeCallThreadKey ? callsByThread.get(activeCallThreadKey) : null;
    const participantState = activeCall?.participants.find(
      (p) => p.user.username.toLowerCase() === peerKey,
    );
    const hasScreenShare = Boolean(
      !ringingOnly &&
        (peers.get(peerKey)?.screenAudioBranch ||
          peers.get(peerKey)?.remoteScreenStream ||
          participantState?.screenSharing),
    );

    const volHeader = document.createElement('div');
    volHeader.className = 'ctx-vc-vol-widget';

    const head = document.createElement('div');
    head.className = 'vc-popover-title-row';
    const nameCol = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'vc-popover-title';
    title.textContent = user.displayName;
    const sub = document.createElement('div');
    sub.className = 'vc-popover-sub';
    sub.textContent = `@${user.username}`;
    nameCol.appendChild(title);
    nameCol.appendChild(sub);

    const volBadge = document.createElement('span');
    volBadge.className = 'vc-popover-vol-pill';
    head.appendChild(nameCol);
    head.appendChild(volBadge);
    volHeader.appendChild(head);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '200';
    slider.step = '5';
    slider.value = String(initial.volume);
    slider.className = 'settings-range';
    volHeader.appendChild(slider);

    let streamSlider: HTMLInputElement | null = null;
    let streamBadge: HTMLSpanElement | null = null;
    if (hasScreenShare) {
      const scrInit = getVoiceUserScreenVolume(peerKey);
      const scrHead = document.createElement('div');
      scrHead.className = 'vc-popover-title-row ctx-vc-stream-row';
      const scrLabel = document.createElement('div');
      scrLabel.className = 'vc-popover-sub';
      scrLabel.textContent = 'Stream Audio';
      streamBadge = document.createElement('span');
      streamBadge.className = 'vc-popover-vol-pill';
      scrHead.appendChild(scrLabel);
      scrHead.appendChild(streamBadge);
      volHeader.appendChild(scrHead);

      streamSlider = document.createElement('input');
      streamSlider.type = 'range';
      streamSlider.min = '0';
      streamSlider.max = '200';
      streamSlider.step = '5';
      streamSlider.value = String(scrInit.volume);
      streamSlider.className = 'settings-range';
      volHeader.appendChild(streamSlider);
    }

    const syncSliderUi = (nextVol: { volume: number; muted: boolean }) => {
      slider.value = String(nextVol.volume);
      volBadge.replaceChildren(createVolumeIconSvg(nextVol.muted, 13));
      const label = document.createElement('span');
      label.textContent = nextVol.muted ? 'Muted' : `${nextVol.volume}%`;
      volBadge.appendChild(label);
      if (streamSlider && streamBadge) {
        const scrVol = getVoiceUserScreenVolume(peerKey);
        streamSlider.value = String(scrVol.volume);
        streamBadge.replaceChildren(createVolumeIconSvg(scrVol.muted, 12));
        const sLbl = document.createElement('span');
        sLbl.textContent = scrVol.muted ? 'Muted' : `${scrVol.volume}%`;
        streamBadge.appendChild(sLbl);
      }
      const pipeline = peers.get(peerKey);
      if (pipeline) {
        applyPeerGain(peerKey, pipeline);
      }
      options.onStateChanged();
    };

    slider.addEventListener('input', () => {
      const val = Number(slider.value);
      const next = setVoiceUserVolume(peerKey, { volume: val, muted: val === 0 });
      syncSliderUi(next);
    });
    streamSlider?.addEventListener('input', () => {
      const val = Number(streamSlider!.value);
      setVoiceUserScreenVolume(peerKey, { volume: val, muted: val === 0 });
      syncSliderUi(getVoiceUserVolume(peerKey));
    });
    syncSliderUi(initial);

    const items: ContextMenuItem[] = ringingOnly
      ? [
          {
            label: 'Ring to Call',
            icon: 'phone',
            onSelect: () => {
              ringUserInCurrentCall(user.username);
            },
          },
        ]
      : [
          {
            label: 'Mute Locally',
            icon: 'headphones-off',
            checked: initial.muted,
            closeOnSelect: false,
            onSelect: () => {
              const cur = getVoiceUserVolume(peerKey);
              const next = setVoiceUserVolume(peerKey, { muted: !cur.muted });
              syncSliderUi(next);
            },
          },
          ...(hasScreenShare
            ? [
                {
                  label: 'Mute Stream Audio',
                  icon: 'screen' as const,
                  checked: getVoiceUserScreenVolume(peerKey).muted,
                  closeOnSelect: false,
                  onSelect: () => {
                    const cur = getVoiceUserScreenVolume(peerKey);
                    setVoiceUserScreenVolume(peerKey, { muted: !cur.muted });
                    syncSliderUi(getVoiceUserVolume(peerKey));
                  },
                },
              ]
            : []),
          {
            label: 'Reset Volume (100%)',
            icon: 'reset',
            onSelect: () => {
              const next = setVoiceUserVolume(peerKey, { volume: 100, muted: false });
              setVoiceUserScreenVolume(peerKey, { volume: 100, muted: false });
              syncSliderUi(next);
            },
          },
        ];

    if (!ringingOnly && stageMeta?.stageKey) {
      const sKey = stageMeta.stageKey;
      const isRemoteScreenKey = sKey.startsWith('scr:');
      const isWatched = !isRemoteScreenKey || watchedStreamKeys.has(sKey);
      if (isRemoteScreenKey && !isWatched) {
        items.push({
          label: 'Watch Stream',
          icon: 'expand',
          dividerBefore: true,
          onSelect: () => watchStreamKey(sKey),
        });
      } else {
        const expanded = expandedStageKey === sKey;
        items.push({
          label: expanded ? 'Shrink Video' : 'Expand Video',
          icon: expanded ? 'shrink' : 'expand',
          dividerBefore: true,
          onSelect: () => toggleExpandKey(sKey),
        });
        if (isRemoteScreenKey) {
          items.push({
            label: 'Stop Watching Stream',
            icon: createStopStreamIconSvg(14),
            onSelect: () => stopWatchingStreamKey(sKey),
          });
        }
      }
    }
    if (
      !ringingOnly &&
      stageMeta?.videoEl &&
      typeof document.pictureInPictureEnabled === 'boolean' &&
      document.pictureInPictureEnabled
    ) {
      const vidEl = stageMeta.videoEl;
      items.push({
        label: 'Picture-in-Picture',
        icon: 'pip',
        onSelect: () => {
          void togglePictureInPicture(vidEl);
        },
      });
    }

    const canStartDirectCall = Boolean(
      dmThreadKey && activeCallThreadKey && activeCallThreadKey !== dmThreadKey,
    );
    if (options.onOpenDm || options.onViewProfile || canStartDirectCall) {
      let needDivider = items.length > 0;
      const pushWithDiv = (entry: ContextMenuItem) => {
        items.push(needDivider ? { ...entry, dividerBefore: true } : entry);
        needDivider = false;
      };
      if (canStartDirectCall) {
        pushWithDiv({
          label: 'Start a Call',
          icon: 'phone',
          onSelect: () => {
            void confirmAndSwitchToCall(
              { peerUsername: user.username },
              dmThreadKey,
              user.displayName,
              () => options.onOpenDm?.(user.username),
            );
          },
        });
      }
      if (options.onOpenDm) {
        pushWithDiv({
          label: 'Message User',
          icon: 'message',
          onSelect: () => options.onOpenDm?.(user.username),
        });
      }
      if (options.onViewProfile) {
        pushWithDiv({
          label: 'View Profile',
          icon: 'user',
          onSelect: () => options.onViewProfile?.(user),
        });
      }
    }

    openContextMenu({
      clientX,
      clientY,
      minWidth: 230,
      headerWidget: ringingOnly ? undefined : volHeader,
      items,
    });
  };

  const openSelfVoiceMenu = (
    clientX: number,
    clientY: number,
    stageMeta?: { stageKey?: string; anchorEl?: HTMLElement },
  ) => {
    const effMuted = getEffectiveMuted();
    const effDeafened = getEffectiveDeafened();
    const camOn = Boolean(localCameraStream);
    const scrOn = Boolean(localScreenStream);

    const items: ContextMenuItem[] = [
      {
        label: effMuted ? 'Unmute Microphone' : 'Mute Microphone',
        icon: effMuted ? 'mic-off' : 'mic',
        checked: effMuted,
        onSelect: toggleMute,
      },
      {
        label: effDeafened ? 'Undeafen' : 'Deafen',
        icon: effDeafened ? 'headphones-off' : 'headphones',
        checked: effDeafened,
        onSelect: toggleDeafen,
      },
      {
        label: camOn ? 'Turn Off Camera' : 'Turn On Camera',
        icon: 'camera',
        checked: camOn,
        dividerBefore: true,
        onSelect: () => {
          void toggleCamera();
        },
      },
      {
        label: scrOn ? 'Stop Screen Share' : 'Share Screen...',
        icon: 'screen',
        checked: scrOn,
        onSelect: () => {
          const anchor = stageMeta?.anchorEl ?? {
            left: clientX,
            top: clientY,
            right: clientX,
            bottom: clientY,
          };
          if (scrOn) {
            stopLocalScreenCapture(true);
          } else {
            openScreenSharePopover(anchor, 'source');
          }
        },
      },
      ...(scrOn
        ? [
            {
              label: `Stream Quality (${formatScreenQualityLabel(false)})...`,
              icon: 'settings' as const,
              onSelect: () => {
                const anchor = stageMeta?.anchorEl ?? {
                  left: clientX,
                  top: clientY,
                  right: clientX,
                  bottom: clientY,
                };
                openScreenSharePopover(anchor, 'live');
              },
            },
          ]
        : []),
    ];

    if (stageMeta?.stageKey) {
      const sKey = stageMeta.stageKey;
      const expanded = expandedStageKey === sKey;
      items.push({
        label: expanded ? 'Shrink Video' : 'Expand Video',
        icon: expanded ? 'shrink' : 'expand',
        onSelect: () => toggleExpandKey(sKey),
      });
    }

    if (options.onOpenVoiceSettings) {
      items.push({
        label: 'Voice & Audio Settings',
        icon: 'settings',
        dividerBefore: true,
        onSelect: () => options.onOpenVoiceSettings?.(),
      });
    }

    items.push(
      scrOn
        ? {
            label: 'End Stream',
            icon: 'screen',
            danger: true,
            dividerBefore: !options.onOpenVoiceSettings,
            onSelect: () => stopLocalScreenCapture(true),
          }
        : {
            label: 'Disconnect',
            icon: 'phone-off',
            danger: true,
            dividerBefore: !options.onOpenVoiceSettings,
            onSelect: leaveCall,
          },
    );

    openContextMenu({
      clientX,
      clientY,
      minWidth: 215,
      items,
    });
  };

    const startCallStatsPolling = () => {
      if (callStatsTimer !== null) {
        return;
      }
      callStatsTimer = window.setInterval(async () => {
        if (destroyed || !activeCallThreadKey) {
          return;
        }
        let bestRttMs: number | null = null;
        let totalLost = 0;
        let totalRecv = 0;
        for (const pipeline of peers.values()) {
          try {
            const report = await pipeline.pc.getStats();
            report.forEach((stat) => {
              if (
                stat.type === 'candidate-pair' &&
                stat.state === 'succeeded' &&
                typeof stat.currentRoundTripTime === 'number'
              ) {
                const ms = Math.round(stat.currentRoundTripTime * 1000);
                if (bestRttMs === null || ms < bestRttMs) {
                  bestRttMs = ms;
                }
              } else if (stat.type === 'inbound-rtp') {
                if (typeof stat.packetsLost === 'number') totalLost += Math.max(0, stat.packetsLost);
                if (typeof stat.packetsReceived === 'number') totalRecv += Math.max(0, stat.packetsReceived);
              }
            });
          } catch {
            // Ignore transient getStats error on closing peer.
          }
        }
        const totalPkts = totalLost + totalRecv;
        const lossPct = totalPkts > 0 ? Math.round((totalLost / totalPkts) * 1000) / 10 : 0;
        const quality: 'good' | 'ok' | 'poor' | 'connecting' =
          bestRttMs === null
            ? peers.size === 0
              ? 'connecting'
              : 'good'
            : bestRttMs < 85 && lossPct < 2
              ? 'good'
              : bestRttMs < 200 && lossPct < 6
                ? 'ok'
                : 'poor';
        const changed =
          callQualityStats.rttMs !== bestRttMs ||
          callQualityStats.packetLossPct !== lossPct ||
          callQualityStats.quality !== quality;
        callQualityStats = { rttMs: bestRttMs, packetLossPct: totalPkts > 0 ? lossPct : null, quality };
        if (changed) {
          options.onStateChanged();
        }
      }, 2000);
    };

    const stopCallStatsPolling = () => {
      if (callStatsTimer !== null) {
        window.clearInterval(callStatsTimer);
        callStatsTimer = null;
      }
      callQualityStats = { rttMs: null, packetLossPct: null, quality: 'connecting' };
    };

    const seedOptimisticActiveCall = (
      target: ThreadTarget,
      threadKey: string,
      incoming?: VcIncomingCallPayload,
    ) => {
      const snap = options.getSnapshot();
      const selfUser = snap?.user;
      if (!selfUser) {
        return;
      }
      const selfKey = selfUser.username.toLowerCase();
      const existing = callsByThread.get(threadKey);
      const isGroupCall =
        threadKey.startsWith('group:') ||
        incoming?.kind === 'group' ||
        (typeof target !== 'string' && Boolean(target.groupId));
      const resolvedGroupId =
        existing?.groupId ||
        incoming?.groupId ||
        (typeof target !== 'string' ? target.groupId : undefined) ||
        (threadKey.startsWith('group:') ? threadKey.slice('group:'.length) : undefined);

      const selfParticipant = {
        user: {
          username: selfUser.username,
          displayName: selfUser.displayName,
          bio: selfUser.bio,
          createdAt: selfUser.createdAt,
          status: selfUser.status === 'invisible' ? ('offline' as const) : selfUser.status,
          avatarPreset: selfUser.avatarPreset,
          avatarDataUrl: selfUser.avatarDataUrl,
          bannerColor: selfUser.bannerColor,
          bannerDataUrl: selfUser.bannerDataUrl,
          customStatus: selfUser.customStatus,
        },
        muted: getEffectiveMuted(),
        deafened: getEffectiveDeafened(),
        cameraOn: Boolean(localCameraStream),
        screenSharing: Boolean(localScreenStream),
        screenPaused: Boolean(localScreenStream && localScreenPaused),
        joinedAt: Date.now(),
      };

      const prevParticipants = existing?.participants ?? [];
      const alreadyListed = prevParticipants.some(
        (p) => p.user.username.toLowerCase() === selfKey,
      );
      const nextParticipants = alreadyListed
        ? prevParticipants
        : [...prevParticipants, selfParticipant];
      const nextRinging = (existing?.ringing ?? []).filter(
        (r) => r.username.toLowerCase() !== selfKey,
      );

      callsByThread.set(threadKey, {
        threadKey,
        kind: isGroupCall ? 'group' : 'dm',
        groupId: resolvedGroupId,
        startedBy: existing?.startedBy ?? incoming?.caller.username ?? selfUser.username,
        active: true,
        participants: nextParticipants,
        ringing: nextRinging,
      });
    };

    const startOrJoinCall = (target: ThreadTarget, threadKey: string) => {
    // Already connected to this exact call — never leave, kick, or re-ring!
    if (activeCallThreadKey === threadKey) {
      activeCallTarget = target;
      emitStateChanged();
      return;
    }
    refreshIceServers();
    ensureVadContext();
    startCallStatsPolling();
    if (activeCallThreadKey && activeCallThreadKey !== threadKey) {
      leaveCall();
    }
    const pendingIncoming = incomingCalls.get(threadKey);
    incomingCalls.delete(threadKey);
    desktopNotifiedCalls.delete(threadKey);
    syncIncomingPopup();

    activeCallThreadKey = threadKey;
    activeCallTarget = target;
    recentlyLeftCalls.delete(threadKey);
    lastAutoLeaveResendAt.delete(threadKey);
    const isJoiningExisting = Boolean(callsByThread.get(threadKey)?.active || pendingIncoming);
    // Immediately populate optimistic VC state so the call topbar & sidebar voice bar render in 0ms
    // even if joining from an inline GC call message before vc:state roundtrips.
    seedOptimisticActiveCall(target, threadKey, pendingIncoming);
    void attachLocalMicIfNeeded();
    options
      .getSocket()
      ?.sendVcJoin(target, getEffectiveMuted(), getEffectiveDeafened(), !isJoiningExisting);

    playVcJoinSound();
    startVadPolling();
    syncRingAudio();
    options.onStateChanged();
  };

  const ringUserInCurrentCall = (targetUsername?: string): boolean => {
    if (!activeCallThreadKey) {
      return false;
    }
    options.getSocket()?.sendVcRing(activeCallThreadKey, targetUsername);
    return true;
  };

  const canRingUserInCurrentCall = (peerUsername: string): boolean => {
    const snap = options.getSnapshot();
    const selfKey = snap?.user.username.toLowerCase() ?? '';
    const peerKey = peerUsername.trim().toLowerCase();
    if (!activeCallThreadKey || !selfKey || !peerKey || peerKey === selfKey) {
      return false;
    }
    const activeCall = callsByThread.get(activeCallThreadKey);
    if (!activeCall || !activeCall.active) {
      return false;
    }
    if (activeCall.participants.some((p) => p.user.username.toLowerCase() === peerKey)) {
      return false;
    }
    if (activeCall.kind === 'dm') {
      return activeCallThreadKey === [selfKey, peerKey].sort().join('::');
    }
    if (activeCall.kind === 'group' && activeCall.groupId) {
      const grp = snap?.groups?.find((g) => g.id === activeCall.groupId);
      return Boolean(grp?.members.some((m) => m.username.toLowerCase() === peerKey));
    }
    return false;
  };

  const confirmAndSwitchToCall = async (
    target: ThreadTarget,
    threadKey: string,
    targetLabel: string,
    beforeSwitch?: () => void,
  ): Promise<boolean> => {
    if (activeCallThreadKey && activeCallThreadKey !== threadKey) {
      const confirmed = await openConfirmPopup({
        title: `Start a Call with ${targetLabel}?`,
        message: `You are currently in another voice call. Are you sure you want to leave your current call and start a call with ${targetLabel}?`,
        confirmLabel: 'Start Call',
      });
      if (!confirmed || destroyed) {
        return false;
      }
    }
    beforeSwitch?.();
    startOrJoinCall(target, threadKey);
    return true;
  };

  const acceptIncomingCall = (threadKey: string) => {
    refreshIceServers();
    ensureVadContext();
    startCallStatsPolling();
    const incoming = incomingCalls.get(threadKey);
    incomingCalls.delete(threadKey);
    desktopNotifiedCalls.delete(threadKey);
    syncIncomingPopup();

    if (!incoming) {
      return;
    }
    const target: ThreadTarget =
      incoming.kind === 'group' && incoming.groupId
        ? { groupId: incoming.groupId }
        : { peerUsername: incoming.caller.username };

    if (activeCallThreadKey && activeCallThreadKey !== threadKey) {
      leaveCall();
    }
    activeCallThreadKey = threadKey;
    activeCallTarget = target;
    recentlyLeftCalls.delete(threadKey);
    lastAutoLeaveResendAt.delete(threadKey);
    seedOptimisticActiveCall(target, threadKey, incoming);
    void attachLocalMicIfNeeded();
    options
      .getSocket()
      ?.sendVcJoin(target, getEffectiveMuted(), getEffectiveDeafened(), false);
    playVcJoinSound();
    startVadPolling();
    syncRingAudio();

    const callState = callsByThread.get(threadKey) ?? {
      threadKey,
      kind: incoming.kind,
      groupId: incoming.groupId,
      active: true,
      participants: [],
      ringing: [],
    };
    options.onJumpToCallThread(callState);
    options.onStateChanged();
  };

  const declineIncomingCall = (threadKey: string) => {
    incomingCalls.delete(threadKey);
    desktopNotifiedCalls.delete(threadKey);
    syncIncomingPopup();
    options.getSocket()?.sendVcDecline(threadKey);
    syncRingAudio();
  };

  const toggleMute = () => {
    ensureVadContext();
    const prefs = getUserPreferences();
    if (prefs.voiceSelfDeafened) {
      updateUserPreferences({ voiceSelfMuted: false, voiceSelfDeafened: false });
      playVoiceToggleCue(true);
    } else {
      const nextMuted = !prefs.voiceSelfMuted;
      updateUserPreferences({ voiceSelfMuted: nextMuted });
      playVoiceToggleCue(!nextMuted);
    }
    if (activeCallThreadKey && !getEffectiveMuted() && !localMicStream) {
      void attachLocalMicIfNeeded();
    }
    if (!getEffectiveDeafened()) {
      for (const p of peers.values()) {
        void p.audioEl.play().catch(() => {});
      }
    }
  };

  const toggleDeafen = () => {
    ensureVadContext();
    const prefs = getUserPreferences();
    const nextDeafened = !prefs.voiceSelfDeafened;
    updateUserPreferences({ voiceSelfDeafened: nextDeafened });
    playVoiceToggleCue(!nextDeafened);
    if (!nextDeafened) {
      for (const p of peers.values()) {
        void p.audioEl.play().catch(() => {});
      }
      if (activeCallThreadKey && !getEffectiveMuted() && !localMicStream) {
        void attachLocalMicIfNeeded();
      }
    }
  };

  const setTestingMic = (testing: boolean) => {
    if (testingMic === testing) {
      return;
    }
    testingMic = testing;
    syncTrackAndSinkStates();
    syncRingAudio();
    options.onStateChanged();
  };

  const isTypingFieldFocused = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) {
      return false;
    }
    const tag = target.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
  };

  const handleGlobalKeyDown = (e: KeyboardEvent) => {
    const prefs = getUserPreferences();
    if (prefs.voiceInputMode !== 'push-to-talk' || !activeCallThreadKey) {
      return;
    }
    if (e.code !== prefs.voicePushToTalkKey) {
      return;
    }
    // Avoid hijacking single-letter keys while actively typing chat messages.
    const isCharKey = e.code.startsWith('Key') || e.code.startsWith('Digit') || e.code === 'Space';
    if (isCharKey && isTypingFieldFocused(e.target)) {
      return;
    }
    if (pttReleaseTimer !== null) {
      window.clearTimeout(pttReleaseTimer);
      pttReleaseTimer = null;
    }
    if (!pttPressed) {
      pttPressed = true;
      syncTrackAndSinkStates();
      options.onStateChanged();
    }
  };

  const handleGlobalKeyUp = (e: KeyboardEvent) => {
    const prefs = getUserPreferences();
    if (e.code !== prefs.voicePushToTalkKey || !pttPressed) {
      return;
    }
    if (pttReleaseTimer !== null) {
      window.clearTimeout(pttReleaseTimer);
      pttReleaseTimer = null;
    }
    const delay = prefs.voicePushToTalkReleaseDelayMs;
    if (delay <= 0) {
      pttPressed = false;
      syncTrackAndSinkStates();
      options.onStateChanged();
    } else {
      pttReleaseTimer = window.setTimeout(() => {
        pttReleaseTimer = null;
        pttPressed = false;
        syncTrackAndSinkStates();
        options.onStateChanged();
      }, delay);
    }
  };

  const handleWindowBlur = () => {
    if (pttPressed) {
      pttPressed = false;
      syncTrackAndSinkStates();
      options.onStateChanged();
    }
  };

  window.addEventListener('keydown', handleGlobalKeyDown);
  window.addEventListener('keyup', handleGlobalKeyUp);
  window.addEventListener('blur', handleWindowBlur);

  const computeVoicePrefsSig = (p: ReturnType<typeof getUserPreferences>): string =>
    [
      p.voiceInputDeviceId,
      p.voiceOutputDeviceId,
      p.voiceInputMode,
      p.voicePushToTalkKey,
      p.voiceSelfMuted ? 1 : 0,
      p.voiceSelfDeafened ? 1 : 0,
    ].join('|');

  const computeVoiceDspSig = (p: ReturnType<typeof getUserPreferences>): string =>
    [
      p.voiceModifierMode,
      p.voiceMicAmplification,
      p.voiceCustom.noiseGateThresholdDb,
      p.voiceCustom.highPassHz,
      p.voiceCustom.lowPassHz,
      p.voiceCustom.voiceClarityDb,
      p.voiceCustom.warmthDb,
      p.voiceCustom.compressorAmount,
      p.voiceCustom.noiseSuppression ? 1 : 0,
      p.voiceCustom.echoCancellation ? 1 : 0,
      p.voiceCustom.autoGainControl ? 1 : 0,
    ].join('|');

  const initialPrefs = getUserPreferences();
  lastVoicePrefsSig = computeVoicePrefsSig(initialPrefs);
  lastDspPrefsSig = computeVoiceDspSig(initialPrefs);

  const unsubPrefs = subscribeUserPreferences((nextPrefs) => {
    const dspSig = computeVoiceDspSig(nextPrefs);
    if (dspSig !== lastDspPrefsSig) {
      lastDspPrefsSig = dspSig;
      localMicDsp?.updatePrefs(nextPrefs);
    }

    const sig = computeVoicePrefsSig(nextPrefs);
    if (sig === lastVoicePrefsSig) {
      return;
    }
    lastVoicePrefsSig = sig;
    if (activeCallThreadKey && nextPrefs.voiceInputDeviceId !== currentInputDeviceId) {
      void attachLocalMicIfNeeded();
    }
    syncTrackAndSinkStates();
    syncRingAudio();
    options.onStateChanged();
  });

  const handleVcState = (payload: VcStateEventPayload) => {
    const selfKey = options.getSnapshot()?.user.username.toLowerCase();
    let effectivePayload = payload;
    let selfJoined = Boolean(
      selfKey && effectivePayload.participants.some((p) => p.user.username.toLowerCase() === selfKey),
    );
    const selfStillRinging = Boolean(
      selfKey && effectivePayload.ringing.some((r) => r.username.toLowerCase() === selfKey),
    );

    if (activeCallThreadKey !== effectivePayload.threadKey) {
      const leftAt = recentlyLeftCalls.get(effectivePayload.threadKey);
      if (!selfJoined || !effectivePayload.active) {
        if (leftAt !== undefined) {
          recentlyLeftCalls.delete(effectivePayload.threadKey);
          lastAutoLeaveResendAt.delete(effectivePayload.threadKey);
        }
      } else if (selfKey && leftAt !== undefined && Date.now() - leftAt < 15_000) {
        // Ignore stale in-flight vc:state frames that still include us right after leaving,
        // and re-send vc:leave if the server still thinks we're in the call after >1s.
        const filteredParticipants = effectivePayload.participants.filter(
          (p) => p.user.username.toLowerCase() !== selfKey,
        );
        const stillActive = filteredParticipants.length > 0 || effectivePayload.ringing.length > 0;
        effectivePayload = {
          ...effectivePayload,
          active: stillActive,
          participants: filteredParticipants,
        };
        selfJoined = false;
        const nowTs = Date.now();
        const lastResend = lastAutoLeaveResendAt.get(effectivePayload.threadKey) ?? 0;
        if (nowTs - leftAt > 1000 && nowTs - lastResend > 2500) {
          lastAutoLeaveResendAt.set(effectivePayload.threadKey, nowTs);
          options.getSocket()?.sendVcLeave(effectivePayload.threadKey);
        }
      }
    }

    if (!effectivePayload.active || selfJoined || !selfStillRinging) {
      if (incomingCalls.has(effectivePayload.threadKey)) {
        incomingCalls.delete(effectivePayload.threadKey);
        desktopNotifiedCalls.delete(effectivePayload.threadKey);
        syncIncomingPopup();
      }
    }

    if (!effectivePayload.active) {
      callsByThread.delete(effectivePayload.threadKey);
      knownPeersByCall.delete(effectivePayload.threadKey);
      if (activeCallThreadKey === effectivePayload.threadKey) {
        watchedStreamKeys.clear();
        closeActivePopover();
        expandedStageKey = null;
        activeCallThreadKey = null;
        activeCallTarget = null;
        lastActiveSpeakerKey = null;
        stopCallStatsPolling();
        stopVadPolling();
        stopLocalCameraCapture(false);
        stopLocalScreenCapture(false, false);
        stopLocalMicCapture();
        closeAllPeers();
      }
    } else {
      callsByThread.set(effectivePayload.threadKey, effectivePayload);
      if (activeCallThreadKey === effectivePayload.threadKey) {
        if (selfJoined && selfKey) {
          const nextPeers = new Map<string, { screenSharing: boolean }>();
          for (const p of effectivePayload.participants) {
            const uKey = p.user.username.toLowerCase();
            if (uKey === selfKey) continue;
            nextPeers.set(uKey, { screenSharing: Boolean(p.screenSharing) });
          }

          // Clean up watched remote streams when a peer leaves or ends their stream.
          for (const watchedKey of Array.from(watchedStreamKeys)) {
            if (!watchedKey.startsWith('scr:')) continue;
            const ownerKey = watchedKey.slice(4);
            if (ownerKey === selfKey) continue;
            const peerState = nextPeers.get(ownerKey);
            if (!peerState || !peerState.screenSharing) {
              watchedStreamKeys.delete(watchedKey);
              if (expandedStageKey === watchedKey) {
                expandedStageKey = null;
              }
            }
          }

          const prevPeers = knownPeersByCall.get(effectivePayload.threadKey);
          if (!prevPeers) {
            knownPeersByCall.set(effectivePayload.threadKey, nextPeers);
          } else {
            let anyPeerJoined = false;
            let anyPeerLeft = false;
            let anyStreamStarted = false;
            let anyStreamEnded = false;

            for (const [uKey, nextMeta] of nextPeers.entries()) {
              const prevMeta = prevPeers.get(uKey);
              if (!prevMeta) {
                anyPeerJoined = true;
              } else if (!prevMeta.screenSharing && nextMeta.screenSharing) {
                anyStreamStarted = true;
              } else if (prevMeta.screenSharing && !nextMeta.screenSharing) {
                anyStreamEnded = true;
              }
            }
            for (const uKey of prevPeers.keys()) {
              if (!nextPeers.has(uKey)) {
                anyPeerLeft = true;
              }
            }

            knownPeersByCall.set(effectivePayload.threadKey, nextPeers);

            if (!destroyed && !getEffectiveDeafened()) {
              if (anyPeerJoined) {
                playVcPeerJoinSound();
              } else if (anyPeerLeft) {
                playVcPeerLeaveSound();
              }
              if (anyStreamStarted) {
                playStreamStartSound();
              } else if (anyStreamEnded) {
                playStreamEndSound();
              }
            }
          }
        } else if (
          !selfJoined &&
          activeCallTarget &&
          !recentlyLeftCalls.has(effectivePayload.threadKey) &&
          Date.now() - lastReconnectRejoinAt > 2500
        ) {
          // Server dropped our participant entry during a brief reconnect; silently re-attach without ringing!
          lastReconnectRejoinAt = Date.now();
          lastSentVoiceStateSig = '';
          options
            .getSocket()
            ?.sendVcJoin(
              activeCallTarget,
              getEffectiveMuted(),
              getEffectiveDeafened(),
              false,
              true,
            );
        }
        void reconcilePeerConnections(effectivePayload);
      }
    }
    syncTrackAndSinkStates();
    syncRingAudio();
    emitStateChanged();
  };

  const handleVcIncoming = (payload: VcIncomingCallPayload) => {
    if (activeCallThreadKey === payload.threadKey) {
      return;
    }
    const selfKey = options.getSnapshot()?.user.username.toLowerCase();
    const existingCall = callsByThread.get(payload.threadKey);
    if (
      selfKey &&
      existingCall?.participants.some((p) => p.user.username.toLowerCase() === selfKey)
    ) {
      return;
    }
    if (!incomingCalls.has(payload.threadKey)) {
      desktopNotifiedCalls.delete(payload.threadKey);
    }
    incomingCalls.set(payload.threadKey, payload);
    syncIncomingPopup();
    syncRingAudio();

    const snap = options.getSnapshot();
    const callMuted = isThreadMuted(snap, resolveUserThreadMuteKey(payload.threadKey));
    if (!desktopNotifiedCalls.has(payload.threadKey) && !getEffectiveDeafened() && !callMuted) {
      desktopNotifiedCalls.add(payload.threadKey);
      const grp =
        payload.kind === 'group' && payload.groupId
          ? snap?.groups?.find((g) => g.id === payload.groupId)
          : undefined;
      dispatchRedshiftNotification({
        title:
          payload.kind === 'group'
            ? payload.groupName || grp?.name || 'Group Voice Call'
            : payload.caller.displayName,
        body:
          payload.kind === 'group'
            ? `${payload.caller.displayName} is ringing you to join — click to answer`
            : 'Incoming Redshift voice call — click to answer',
        icon: options.resolveAvatar(payload.caller),
        tag: `redshift-call-${payload.threadKey}`,
        badge: 'CALL',
        userStatus: snap?.user.status,
        forceDesktop: !isAppWindowFocused(),
        onClick: () => {
          window.focus();
          const activeState = callsByThread.get(payload.threadKey);
          if (activeState) {
            options.onJumpToCallThread(activeState);
          }
        },
      });
    }
    options.onStateChanged();
  };

  const handleVcIncomingClear = (threadKey: string) => {
    incomingCalls.delete(threadKey);
    desktopNotifiedCalls.delete(threadKey);
    syncIncomingPopup();
    syncRingAudio();
    options.onStateChanged();
  };

  const handleVcSignal = (payload: VcSignalEventPayload) => {
    const peerKey = payload.fromUsername.toLowerCase();
    const prev = peerSignalQueue.get(peerKey) ?? Promise.resolve();
    const next = prev
      .then(async () => {
        if (destroyed || payload.threadKey !== activeCallThreadKey) {
          return;
        }
        await attachLocalMicIfNeeded();
        if (destroyed || payload.threadKey !== activeCallThreadKey) {
          return;
        }
        const pipeline = createPeerConnection(payload.threadKey, peerKey);
        const { signal } = payload;

        if (signal.streamMeta) {
          pipeline.remoteCameraStreamId = signal.streamMeta.cameraStreamId || undefined;
          pipeline.remoteScreenStreamId = signal.streamMeta.screenStreamId || undefined;
          classifyPeerMediaStreams(peerKey, pipeline);
        }

        const selfKey = options.getSnapshot()?.user.username.toLowerCase() ?? '';
        const polite = selfKey.localeCompare(peerKey) > 0;

        if (signal.kind === 'offer' && signal.sdp) {
          const offerCollision = pipeline.makingOffer || pipeline.pc.signalingState !== 'stable';
          pipeline.ignoreOffer = !polite && offerCollision;
          if (pipeline.ignoreOffer) {
            return;
          }
          if (offerCollision) {
            await pipeline.pc.setLocalDescription({ type: 'rollback' });
          }
          await pipeline.pc.setRemoteDescription(signal.sdp);
          const answer = await pipeline.pc.createAnswer();
          await pipeline.pc.setLocalDescription(answer);
          if (pipeline.pc.localDescription) {
            options.getSocket()?.sendVcSignal(payload.threadKey, peerKey, {
              kind: 'answer',
              sdp: pipeline.pc.localDescription.toJSON(),
              streamMeta: getLocalStreamMeta(),
            });
          }
          while (pipeline.pendingIce.length > 0) {
            const ice = pipeline.pendingIce.shift()!;
            await pipeline.pc.addIceCandidate(ice);
          }
          classifyPeerMediaStreams(peerKey, pipeline);
          options.onStateChanged();
        } else if (signal.kind === 'answer' && signal.sdp) {
          await pipeline.pc.setRemoteDescription(signal.sdp);
          while (pipeline.pendingIce.length > 0) {
            const ice = pipeline.pendingIce.shift()!;
            await pipeline.pc.addIceCandidate(ice);
          }
          classifyPeerMediaStreams(peerKey, pipeline);
          options.onStateChanged();
        } else if (signal.kind === 'ice' && signal.candidate) {
          if (pipeline.ignoreOffer) {
            return;
          }
          if (pipeline.pc.remoteDescription) {
            await pipeline.pc.addIceCandidate(signal.candidate);
          } else {
            pipeline.pendingIce.push(signal.candidate);
          }
        }
      })
      .catch(() => {
        // Ignore recoverable WebRTC signaling race conditions cleanly.
      });
    peerSignalQueue.set(peerKey, next);
  };

  const handleVcSpeaking = (payload: VcSpeakingEventPayload) => {
    const key = payload.username.toLowerCase();
    if (payload.speaking) {
      speakingHoldUntil.set(key, Date.now() + 260);
      lastActiveSpeakerKey = key;
    } else {
      speakingHoldUntil.delete(key);
    }
    emitStateChanged();
  };

  const handleVcTransferred = (payload: VcTransferredEventPayload) => {
    const transferredThread = activeCallThreadKey;
    if (!transferredThread) {
      return;
    }
    if (payload.threadKey && payload.threadKey !== transferredThread) {
      return;
    }
    // Tear down THIS device's local call cleanly WITHOUT sending vc:leave
    // so the newly joined device (PC <-> Mobile) remains connected seamlessly.
    watchedStreamKeys.clear();
    knownPeersByCall.delete(transferredThread);
    closeActivePopover();
    expandedStageKey = null;
    activeCallThreadKey = null;
    activeCallTarget = null;
    lastActiveSpeakerKey = null;
    lastSentVoiceStateSig = '';
    stopCallStatsPolling();
    stopVadPolling();
    stopLocalCameraCapture(false);
    stopLocalScreenCapture(false, false);
    stopLocalMicCapture();
    closeAllPeers();
    playVcLeaveSound();
    syncRingAudio();
    emitStateChanged();
    if (!destroyed) {
      showInAppToast({
        title: 'Call Moved to Another Device',
        body: payload.reason || 'Disconnected here because you joined on another device.',
        badge: 'CALL',
        durationMs: 4500,
      });
    }
  };

  const createStageVideoEl = (stream: MediaStream, mirror = false): HTMLVideoElement => {
    const vid = document.createElement('video');
    vid.className = mirror ? 'vc-stage-video vc-stage-video--mirrored' : 'vc-stage-video';
    vid.autoplay = true;
    vid.muted = true;
    vid.playsInline = true;
    vid.srcObject = stream;
    void vid.play().catch(() => {});
    return vid;
  };

  const renderTile = (
    user: PublicProfile,
    opts: {
      ringing: boolean;
      speaking: boolean;
      muted: boolean;
      deafened: boolean;
      isSelf: boolean;
      localMuted?: boolean;
      cameraStream?: MediaStream | null;
      stageKey?: string;
      onToggleExpand?: (key: string) => void;
    },
  ): HTMLDivElement => {
    const tile = document.createElement('div');
    tile.className = 'vc-participant-tile';
    if (opts.ringing) {
      tile.classList.add('vc-participant-tile--ringing');
    }
    if (opts.cameraStream) {
      tile.classList.add('vc-participant-tile--video');
    }
    if (opts.speaking && !opts.muted && !opts.deafened) {
      tile.classList.add('vc-participant-tile--speaking');
    }

    const avatarBox = document.createElement('div');
    avatarBox.className = opts.cameraStream ? 'vc-tile-video-box' : 'vc-tile-avatar-ring';

    if (opts.cameraStream) {
      avatarBox.appendChild(
        createStageVideoEl(opts.cameraStream, opts.isSelf && cameraFacingMode === 'user'),
      );
      if (opts.isSelf && localCameraStream) {
        const flipTileBtn = document.createElement('button');
        flipTileBtn.type = 'button';
        flipTileBtn.className = 'vc-tile-flip-btn';
        flipTileBtn.dataset.vcRole = 'tile-flip-camera';
        flipTileBtn.title =
          cameraFacingMode === 'user' ? 'Switch to Back Camera' : 'Switch to Front Camera';
        flipTileBtn.setAttribute('aria-label', flipTileBtn.title);
        flipTileBtn.appendChild(createFlipCameraIconSvg(13));
        flipTileBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          void flipCamera();
        });
        avatarBox.appendChild(flipTileBtn);
      }
      if (opts.stageKey && opts.onToggleExpand) {
        const expBtn = document.createElement('button');
        expBtn.type = 'button';
        expBtn.className = 'vc-tile-expand-btn';
        expBtn.title = expandedStageKey === opts.stageKey ? 'Shrink Video' : 'Expand Video';
        expBtn.setAttribute('aria-label', expBtn.title);
        expBtn.appendChild(createExpandIconSvg(expandedStageKey === opts.stageKey, 13));
        expBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          opts.onToggleExpand?.(opts.stageKey!);
        });
        avatarBox.appendChild(expBtn);
      }
    } else {
      const img = document.createElement('img');
      img.className = 'vc-tile-avatar';
      img.src = options.resolveAvatar(user);
      img.alt = user.displayName;
      avatarBox.appendChild(img);
    }

    const badgeMode = opts.ringing
      ? ''
      : opts.deafened
        ? 'deaf'
        : opts.muted || opts.localMuted
          ? 'mute'
          : '';
    avatarBox.dataset.vcBadge = badgeMode;
    if (badgeMode) {
      const stateBadge = document.createElement('span');
      stateBadge.className = opts.localMuted && !opts.muted && !opts.deafened
        ? 'vc-tile-voice-badge vc-tile-voice-badge--local'
        : 'vc-tile-voice-badge';
      stateBadge.appendChild(
        badgeMode === 'deaf' ? createHeadphonesIconSvg(true, 11) : createMicIconSvg(true, 11),
      );
      avatarBox.appendChild(stateBadge);
    }

    tile.appendChild(avatarBox);

    const nameEl = document.createElement('div');
    nameEl.className = 'vc-tile-name';
    nameEl.textContent = user.displayName;
    tile.appendChild(nameEl);

    if (opts.ringing) {
      const subEl = document.createElement('div');
      subEl.className = 'vc-tile-sub';
      subEl.textContent = 'Ringing...';
      tile.appendChild(subEl);
    }

    if (opts.ringing) {
      if (!opts.isSelf) {
        tile.title = 'Right-click to ring again or start a DM call';
        tile.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          openRemoteParticipantMenu(user, e.clientX, e.clientY, { ringingOnly: true });
        });
      }
    } else if (opts.isSelf) {
      tile.title = 'Right-click for voice options';
      tile.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openSelfVoiceMenu(e.clientX, e.clientY, {
          stageKey: opts.cameraStream ? opts.stageKey : undefined,
          anchorEl: tile,
        });
      });
    } else {
      tile.title = 'Right-click to adjust volume & user options';
      tile.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openRemoteParticipantMenu(user, e.clientX, e.clientY, {
          stageKey: opts.cameraStream ? opts.stageKey : undefined,
          videoEl: tile.querySelector('video'),
        });
      });
    }

    return tile;
  };

  const activitiesCtrl = createVcActivitiesController({
    getSelfProfile: () => options.getSnapshot()?.user ?? null,
    resolveAvatar: options.resolveAvatar,
    sendActivityFrame: (payload) => {
      options.getSocket()?.sendActivityFrame(payload);
    },
    onStateChanged: () => {
      emitStateChanged();
    },
  });

  const renderCallTopBar = (host: HTMLElement, threadKey: string) => {
    const call = callsByThread.get(threadKey);
    if (!call || !call.active) {
      delete host.dataset.vcLayoutSig;
      host.replaceChildren();
      host.hidden = true;
      return;
    }

    host.hidden = false;
    const sortedParticipants = [...call.participants].sort((a, b) => {
      const byName = a.user.displayName.localeCompare(b.user.displayName, undefined, {
        sensitivity: 'base',
      });
      return byName !== 0 ? byName : a.user.username.localeCompare(b.user.username);
    });
    const sortedRinging = [...call.ringing].sort((a, b) =>
      a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }),
    );

    const selfKey = options.getSnapshot()?.user.username.toLowerCase();
    const inThisCall = activeCallThreadKey === threadKey;
    const prefs = getUserPreferences();
    const effMuted = getEffectiveMuted();
    const effDeafened = getEffectiveDeafened();

    interface StageStreamItem {
      key: string;
      owner: PublicProfile;
      stream: MediaStream | null;
      isSelf: boolean;
      isScreen: boolean;
      paused: boolean;
      watched: boolean;
    }
    const streamItems = new Map<string, StageStreamItem>();
    for (const p of sortedParticipants) {
      const uKey = p.user.username.toLowerCase();
      const isSelf = uKey === selfKey;
      const camStream = isSelf
        ? inThisCall
          ? localCameraStream
          : null
        : peers.get(uKey)?.remoteCameraStream ?? null;
      const scrStream = isSelf
        ? inThisCall
          ? localScreenStream
          : null
        : peers.get(uKey)?.remoteScreenStream ?? null;

      if (camStream) {
        streamItems.set(`cam:${uKey}`, {
          key: `cam:${uKey}`,
          owner: p.user,
          stream: camStream,
          isSelf,
          isScreen: false,
          paused: false,
          watched: true,
        });
      }
      if (scrStream || (!isSelf && p.screenSharing)) {
        const scrKey = `scr:${uKey}`;
        streamItems.set(scrKey, {
          key: scrKey,
          owner: p.user,
          stream: scrStream,
          isSelf,
          isScreen: true,
          paused: isSelf ? localScreenPaused : Boolean(p.screenPaused),
          watched: isSelf || watchedStreamKeys.has(scrKey),
        });
      }
    }

    if (expandedStageKey) {
      const expItem = streamItems.get(expandedStageKey);
      if (!expItem || !expItem.watched) {
        expandedStageKey = null;
      }
    }

    const syncTileVoiceBadge = (
      avatarBox: HTMLElement | null,
      badgeMode: 'deaf' | 'mute' | '',
      localOnlyMuted = false,
    ) => {
      const sig = `${badgeMode}:${localOnlyMuted ? 1 : 0}`;
      if (!avatarBox || (avatarBox.dataset.vcBadgeSig ?? '') === sig) return;
      avatarBox.dataset.vcBadgeSig = sig;
      avatarBox.dataset.vcBadge = badgeMode;
      avatarBox.querySelector('.vc-tile-voice-badge')?.remove();
      if (!badgeMode) return;
      const stateBadge = document.createElement('span');
      stateBadge.className = localOnlyMuted
        ? 'vc-tile-voice-badge vc-tile-voice-badge--local'
        : 'vc-tile-voice-badge';
      stateBadge.appendChild(
        badgeMode === 'deaf' ? createHeadphonesIconSvg(true, 11) : createMicIconSvg(true, 11),
      );
      avatarBox.appendChild(stateBadge);
    };

    const syncControlBtn = (
      btn: HTMLButtonElement | null,
      kind: 'mute' | 'deaf' | 'camera' | 'screen',
      active: boolean,
    ) => {
      if (!btn) return;
      const sig = `${kind}:${active ? 1 : 0}:${testingMic ? 1 : 0}`;
      if (btn.dataset.vcBtnSig === sig) return;
      btn.dataset.vcBtnSig = sig;
      if (kind === 'camera' || kind === 'screen') {
        btn.className = active ? 'vc-ctrl-btn vc-ctrl-btn--active' : 'vc-ctrl-btn';
        btn.title =
          kind === 'camera'
            ? active
              ? 'Turn Off Camera'
              : 'Turn On Camera'
            : active
              ? 'Screen Share Settings (Live)'
              : 'Share Screen';
        btn.setAttribute('aria-label', btn.title);
        btn.replaceChildren(
          kind === 'camera'
            ? createCameraIconSvg(!active, 17)
            : createScreenShareIconSvg(active, 17),
        );
        return;
      }
      btn.className = active ? 'vc-ctrl-btn vc-ctrl-btn--danger' : 'vc-ctrl-btn';
      btn.title =
        kind === 'mute'
          ? testingMic
            ? 'Microphone Test Active'
            : active
              ? 'Unmute Microphone'
              : 'Mute Microphone'
          : testingMic
            ? 'Deafened during Mic Test'
            : active
              ? 'Undeafen Audio'
              : 'Deafen Audio';
      btn.setAttribute('aria-label', btn.title);
      btn.replaceChildren(
        kind === 'mute' ? createMicIconSvg(active, 17) : createHeadphonesIconSvg(active, 17),
      );
    };

    const syncLeaveOrEndStreamBtn = (btn: HTMLButtonElement | null, sharing: boolean) => {
      if (!btn) return;
      const sig = sharing ? 'end-stream' : 'leave';
      if (btn.dataset.vcBtnSig === sig) return;
      btn.dataset.vcBtnSig = sig;
      if (sharing) {
        btn.className = 'vc-ctrl-btn vc-ctrl-btn--end-stream';
        btn.title = 'End Stream (stop sharing before leaving call)';
        btn.setAttribute('aria-label', 'End Stream');
        const txt = document.createElement('span');
        txt.textContent = 'End Stream';
        btn.replaceChildren(createStopStreamIconSvg(16), txt);
      } else {
        btn.className = 'vc-ctrl-btn vc-ctrl-btn--hangup';
        btn.title = 'Leave Call';
        btn.setAttribute('aria-label', 'Leave Call');
        btn.replaceChildren(createPhoneHangupIconSvg(17));
      }
    };

    const selfOnOtherDevice = Boolean(
      !inThisCall &&
        selfKey &&
        sortedParticipants.some((p) => p.user.username.toLowerCase() === selfKey),
    );

    const getStreamWatchers = (streamKey: string, ownerKey: string): PublicProfile[] => {
      const watchers: PublicProfile[] = [];
      const seen = new Set<string>();
      for (const p of sortedParticipants) {
        const uKey = p.user.username.toLowerCase();
        if (uKey === ownerKey) continue;
        const isSelfWatching =
          uKey === selfKey && inThisCall && watchedStreamKeys.has(streamKey);
        const serverWatching =
          Array.isArray(p.watchingStreams) && p.watchingStreams.includes(streamKey);
        if ((uKey === selfKey ? isSelfWatching : serverWatching) && !seen.has(uKey)) {
          seen.add(uKey);
          watchers.push(p.user);
        }
      }
      return watchers;
    };

    const createStreamWatcherPill = (streamKey: string, ownerKey: string): HTMLElement => {
      const watchers = getStreamWatchers(streamKey, ownerKey);
      const pill = document.createElement('span');
      pill.className =
        watchers.length > 0
          ? 'vc-watcher-count-pill vc-watcher-count-pill--active'
          : 'vc-watcher-count-pill';
      pill.dataset.vcRole = 'stream-watcher-count';
      pill.title =
        watchers.length > 0
          ? `Watching: ${watchers.map((w) => w.displayName).join(', ')}`
          : 'No viewers yet';
      pill.appendChild(createWatcherEyeIconSvg(12));
      const num = document.createElement('span');
      num.textContent = String(watchers.length);
      pill.appendChild(num);
      return pill;
    };

    const layoutSig = [
      threadKey,
      inThisCall ? 'IN' : 'OUT',
      selfOnOtherDevice ? 'OTH1' : 'OTH0',
      prefs.voiceInputMode,
      prefs.voicePushToTalkKey,
      cameraFacingMode,
      localCameraStream ? 'CAM1' : 'CAM0',
      localScreenStream ? 'SCR1' : 'SCR0',
      expandedStageKey ?? '',
      sortedParticipants
        .map((p) => {
          const uKey = p.user.username.toLowerCase();
          const camItem = streamItems.get(`cam:${uKey}`);
          const scrItem = streamItems.get(`scr:${uKey}`);
          const camId = camItem?.stream?.id ?? '';
          const scrId = scrItem ? `${scrItem.stream?.id ?? 'pending'}:${scrItem.watched ? 'W' : 'U'}` : '';
          const watchingStr =
            uKey === selfKey
              ? Array.from(watchedStreamKeys).sort().join('~')
              : (p.watchingStreams ?? []).join('~');
          return `${uKey}:${p.user.displayName}:${camId}:${scrId}:${watchingStr}`;
        })
        .join(','),
      sortedRinging.map((r) => `${r.username.toLowerCase()}:${r.displayName}`).join(','),
      `ACT:${activitiesCtrl.getRenderRevision()}:${activitiesCtrl.getExpandedStageKey() ?? ''}:${activitiesCtrl
        .getCallLobbies(threadKey)
        .map(
          (l) =>
            `${l.id}:${l.version}:${l.status}:${(l.spectators ?? []).length}:${activitiesCtrl.isLobbyWatched(l.id) ? 'W' : 'U'}`,
        )
        .join(',')}`,
    ].join('|');

    const now = Date.now();
    // Fast in-place speaking ring, badge, and control button patch prevents DOM teardown/video flicker.
    if (host.dataset.vcLayoutSig === layoutSig && host.firstElementChild) {
      for (const p of sortedParticipants) {
        const uKey = p.user.username.toLowerCase();
        const isSelf = uKey === selfKey;
        const m = isSelf ? effMuted : p.muted;
        const d = isSelf ? effDeafened : p.deafened;
        const vol = isSelf ? null : getVoiceUserVolume(uKey);
        const localMuted = Boolean(vol && (vol.muted || vol.volume === 0));
        const speaking = !m && !d && (speakingHoldUntil.get(uKey) ?? 0) > now;
        const tileEl = host.querySelector(`[data-vc-tile="p:${uKey}"]`);
        tileEl?.classList.toggle('vc-participant-tile--speaking', speaking);
        const box =
          tileEl?.querySelector<HTMLElement>('.vc-tile-avatar-ring') ??
          tileEl?.querySelector<HTMLElement>('.vc-tile-video-box') ??
          null;
        syncTileVoiceBadge(
          box,
          d ? 'deaf' : m || localMuted ? 'mute' : '',
          !m && !d && localMuted,
        );
      }
      if (inThisCall) {
        syncControlBtn(
          host.querySelector<HTMLButtonElement>('[data-vc-role="mute"]'),
          'mute',
          effMuted,
        );
        syncControlBtn(
          host.querySelector<HTMLButtonElement>('[data-vc-role="deaf"]'),
          'deaf',
          effDeafened,
        );
        syncControlBtn(
          host.querySelector<HTMLButtonElement>('[data-vc-role="camera"]'),
          'camera',
          Boolean(localCameraStream),
        );
        const fastScreenBtn = host.querySelector<HTMLButtonElement>('[data-vc-role="screen"]');
        if (fastScreenBtn) {
          fastScreenBtn.hidden = Boolean(localScreenStream);
          syncControlBtn(fastScreenBtn, 'screen', Boolean(localScreenStream));
        }
        syncLeaveOrEndStreamBtn(
          host.querySelector<HTMLButtonElement>('[data-vc-role="leave"]'),
          Boolean(localScreenStream),
        );
        const expQualBtn = host.querySelector<HTMLButtonElement>(
          '[data-vc-role="expanded-screen-quality"]',
        );
        if (expQualBtn && localScreenStream) {
          expQualBtn.textContent = `${formatScreenQualityLabel(true)} ▾`;
        }
        const tileQualBtn = host.querySelector<HTMLButtonElement>(
          '[data-vc-role="tile-screen-quality"]',
        );
        if (tileQualBtn && localScreenStream) {
          tileQualBtn.textContent = `${formatScreenQualityLabel(true)} ▾`;
        }
      }
      if (expandedStageKey) {
        const hero = streamItems.get(expandedStageKey);
        if (hero && hero.isScreen) {
          const expStageEl = host.querySelector<HTMLElement>('.vc-expanded-stage');
          expStageEl?.classList.toggle('vc-expanded-stage--paused', hero.paused);
          const expBadge = expStageEl?.querySelector<HTMLElement>('.vc-stage-live-badge');
          if (expBadge) {
            expBadge.className = hero.paused
              ? 'vc-stage-live-badge vc-stage-live-badge--paused'
              : 'vc-stage-live-badge vc-stage-live-badge--screen';
            expBadge.textContent = hero.paused
              ? `${hero.owner.displayName} • Stream Paused`
              : `${hero.owner.displayName} • Screen Share`;
          }
          const expPausedOverlay = expStageEl?.querySelector<HTMLElement>(
            '[data-vc-role="expanded-paused-overlay"]',
          );
          if (expPausedOverlay) {
            expPausedOverlay.hidden = !hero.paused;
          }
        }
      }
      for (const item of streamItems.values()) {
        if (!item.isScreen) continue;
        const scrTileEl = host.querySelector<HTMLElement>(`[data-vc-screen-tile="${item.key}"]`);
        if (!scrTileEl) continue;
        scrTileEl.classList.toggle('vc-screen-share-tile--paused', item.paused);
        const livePill = scrTileEl.querySelector<HTMLElement>('.vc-screen-live-pill');
        if (livePill) {
          livePill.className = item.paused
            ? 'vc-screen-live-pill vc-screen-live-pill--paused'
            : 'vc-screen-live-pill';
          livePill.textContent = item.paused ? 'PAUSED' : 'LIVE';
        }
        const tilePaused = scrTileEl.querySelector<HTMLElement>('.vc-tile-paused-overlay');
        if (tilePaused) {
          tilePaused.hidden = !item.paused;
        }
      }
      const pttChip = host.querySelector('.vc-ptt-pill');
      if (pttChip && prefs.voiceInputMode === 'push-to-talk') {
        pttChip.classList.toggle('vc-ptt-pill--active', pttPressed);
        pttChip.textContent = pttPressed
          ? `Talking (${formatKeyCodeLabel(prefs.voicePushToTalkKey)})`
          : `Hold [${formatKeyCodeLabel(prefs.voicePushToTalkKey)}] to talk`;
      }
      return;
    }

    const prevTopStageScroll = host.querySelector<HTMLElement>('.vc-top-stage')?.scrollTop ?? 0;
    const prevActivityBodyScroll =
      host.querySelector<HTMLElement>('.vc-activity-stage-body')?.scrollTop ?? 0;

    host.dataset.vcLayoutSig = layoutSig;
    host.replaceChildren();

    const bar = document.createElement('section');
    bar.className = 'vc-top-bar';
    bar.setAttribute('aria-label', 'Voice Call');

    if (expandedStageKey) {
      const hero = streamItems.get(expandedStageKey);
      if (hero) {
        const expWrap = document.createElement('div');
        expWrap.className = hero.isScreen && hero.paused
          ? 'vc-expanded-stage vc-expanded-stage--paused'
          : 'vc-expanded-stage';

        const expHeader = document.createElement('div');
        expHeader.className = 'vc-expanded-header';
        const expLeft = document.createElement('div');
        expLeft.className = 'vc-expanded-title-row';
        if (hero.isScreen) {
          expLeft.appendChild(
            createStreamWatcherPill(hero.key, hero.owner.username.toLowerCase()),
          );
        }
        const badge = document.createElement('span');
        badge.className = hero.isScreen
          ? hero.paused
            ? 'vc-stage-live-badge vc-stage-live-badge--paused'
            : 'vc-stage-live-badge vc-stage-live-badge--screen'
          : 'vc-stage-live-badge';
        badge.textContent = hero.isScreen
          ? hero.paused
            ? `${hero.owner.displayName} • Stream Paused`
            : `${hero.owner.displayName} • Screen Share`
          : `${hero.owner.displayName} • Camera`;
        expLeft.appendChild(badge);
        expHeader.appendChild(expLeft);

        const expActions = document.createElement('div');
        expActions.className = 'vc-expanded-actions';

        const heroVideoWrap = document.createElement('div');
        heroVideoWrap.className = 'vc-expanded-video-wrap';
        let heroVideo: HTMLVideoElement | null = null;
        if (hero.stream) {
          heroVideo = createStageVideoEl(
            hero.stream,
            hero.isSelf && !hero.isScreen && cameraFacingMode === 'user',
          );
          heroVideo.classList.add('vc-expanded-video');
          heroVideoWrap.appendChild(heroVideo);
        } else {
          const connectingMsg = document.createElement('div');
          connectingMsg.className = 'vc-stream-connecting-state';
          connectingMsg.textContent = `Connecting to ${hero.owner.displayName}'s stream...`;
          heroVideoWrap.appendChild(connectingMsg);
        }

        if (hero.isScreen) {
          const pausedOverlay = document.createElement('div');
          pausedOverlay.className = 'vc-stream-paused-overlay';
          pausedOverlay.dataset.vcRole = 'expanded-paused-overlay';
          pausedOverlay.hidden = !hero.paused;
          pausedOverlay.appendChild(createPauseIconSvg(26));
          const pausedTitle = document.createElement('div');
          pausedTitle.className = 'vc-stream-paused-title';
          pausedTitle.textContent = 'Stream paused';
          const pausedSub = document.createElement('div');
          pausedSub.className = 'vc-stream-paused-sub';
          pausedSub.textContent = hero.isSelf
            ? 'Your shared tab or window is minimized — restore it to resume'
            : `${hero.owner.displayName}'s shared tab or window is minimized`;
          pausedOverlay.appendChild(pausedTitle);
          pausedOverlay.appendChild(pausedSub);
          heroVideoWrap.appendChild(pausedOverlay);
        }

        if (hero.isSelf && !hero.isScreen && localCameraStream) {
          const expFlipBtn = document.createElement('button');
          expFlipBtn.type = 'button';
          expFlipBtn.className = 'vc-stage-tool-btn';
          expFlipBtn.title =
            cameraFacingMode === 'user' ? 'Switch to Back Camera' : 'Switch to Front Camera';
          expFlipBtn.setAttribute('aria-label', expFlipBtn.title);
          expFlipBtn.appendChild(createFlipCameraIconSvg(15));
          expFlipBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            void flipCamera();
          });
          expActions.appendChild(expFlipBtn);
        }

        if (hero.isSelf && hero.isScreen && localScreenStream) {
          const expQualBtn = document.createElement('button');
          expQualBtn.type = 'button';
          expQualBtn.className = 'vc-stage-tool-btn vc-stage-tool-btn--quality';
          expQualBtn.dataset.vcRole = 'expanded-screen-quality';
          expQualBtn.title = 'Adjust Live Screen Resolution & Frame Rate';
          expQualBtn.textContent = `${formatScreenQualityLabel(true)} ▾`;
          expQualBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openScreenSharePopover(expQualBtn, 'live');
          });
          expActions.appendChild(expQualBtn);
        }

        if (!hero.isSelf && hero.isScreen) {
          const stopWatchBtn = document.createElement('button');
          stopWatchBtn.type = 'button';
          stopWatchBtn.className = 'vc-stage-tool-btn vc-stage-tool-btn--stop-watch';
          stopWatchBtn.dataset.vcRole = 'stop-watching-stream';
          stopWatchBtn.title = 'Stop Watching Stream';
          stopWatchBtn.textContent = 'Stop Watching';
          stopWatchBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            stopWatchingStreamKey(hero.key);
          });
          expActions.appendChild(stopWatchBtn);
        }

        if (heroVideo && document.pictureInPictureEnabled) {
          const pipTargetVideo = heroVideo;
          const pipBtn = document.createElement('button');
          pipBtn.type = 'button';
          pipBtn.className = 'vc-stage-tool-btn';
          pipBtn.title = 'Pop Out Picture-in-Picture';
          pipBtn.setAttribute('aria-label', 'Picture in Picture');
          pipBtn.appendChild(createPipIconSvg(15));
          pipBtn.addEventListener('click', () => {
            void pipTargetVideo.requestPictureInPicture?.().catch(() => {});
          });
          expActions.appendChild(pipBtn);
        }

        const shrinkBtn = document.createElement('button');
        shrinkBtn.type = 'button';
        shrinkBtn.className = 'vc-stage-tool-btn';
        shrinkBtn.title = 'Minimize Video';
        shrinkBtn.setAttribute('aria-label', 'Minimize Video');
        shrinkBtn.appendChild(createExpandIconSvg(true, 15));
        shrinkBtn.addEventListener('click', () => toggleExpandKey(hero.key));
        expActions.appendChild(shrinkBtn);

        expHeader.appendChild(expActions);
        expWrap.appendChild(expHeader);
        expWrap.appendChild(heroVideoWrap);
        bar.appendChild(expWrap);
      }
    }

    const expandedActivityEl = activitiesCtrl.renderExpandedActivityStage(threadKey);
    if (expandedActivityEl) {
      bar.appendChild(expandedActivityEl);
    }

    const stage = document.createElement('div');
    stage.className = 'vc-top-stage';

    for (const p of sortedParticipants) {
      const uKey = p.user.username.toLowerCase();
      const isSelf = uKey === selfKey;
      const muted = isSelf ? effMuted : p.muted;
      const deafened = isSelf ? effDeafened : p.deafened;
      const vol = isSelf ? null : getVoiceUserVolume(uKey);
      const localMuted = Boolean(vol && (vol.muted || vol.volume === 0));
      const speaking = !muted && !deafened && (speakingHoldUntil.get(uKey) ?? 0) > now;
      const camItem = streamItems.get(`cam:${uKey}`);
      const tile = renderTile(p.user, {
        ringing: false,
        speaking,
        muted,
        deafened,
        isSelf,
        localMuted,
        cameraStream: camItem?.stream ?? null,
        stageKey: camItem?.key,
        onToggleExpand: toggleExpandKey,
      });
      tile.dataset.vcTile = `p:${uKey}`;
      stage.appendChild(tile);

      const scrItem = streamItems.get(`scr:${uKey}`);
      if (scrItem) {
        const scrTile = document.createElement('div');
        scrTile.className = scrItem.paused
          ? 'vc-screen-share-tile vc-screen-share-tile--paused'
          : 'vc-screen-share-tile';
        scrTile.dataset.vcScreenTile = scrItem.key;
        if (!scrItem.watched) {
          scrTile.classList.add('vc-screen-share-tile--unwatched');
        }
        if (expandedStageKey === scrItem.key) {
          scrTile.classList.add('vc-screen-share-tile--expanded');
        }
        const vidBox = document.createElement('div');
        vidBox.className = scrItem.watched
          ? 'vc-screen-thumb-box'
          : 'vc-screen-thumb-box vc-screen-thumb-box--unwatched';
        if (scrItem.stream) {
          const thumbVideo = createStageVideoEl(scrItem.stream, false);
          if (!scrItem.watched) {
            thumbVideo.classList.add('vc-stage-video--blurred-preview');
          }
          vidBox.appendChild(thumbVideo);
        }

        const topLeftBadges = document.createElement('div');
        topLeftBadges.className = 'vc-tile-top-left-badges';
        topLeftBadges.appendChild(createStreamWatcherPill(scrItem.key, uKey));

        const livePill = document.createElement('span');
        livePill.className = scrItem.paused
          ? 'vc-screen-live-pill vc-screen-live-pill--paused'
          : 'vc-screen-live-pill';
        livePill.textContent = scrItem.paused ? 'PAUSED' : 'LIVE';
        topLeftBadges.appendChild(livePill);
        vidBox.appendChild(topLeftBadges);

        const triggerWatch = () => {
          if (!inThisCall) {
            const joinTarget: ThreadTarget =
              call.kind === 'group' && call.groupId
                ? { groupId: call.groupId }
                : { peerUsername: p.user.username };
            watchedStreamKeys.add(scrItem.key);
            expandedStageKey = scrItem.key;
            startOrJoinCall(joinTarget, threadKey);
            return;
          }
          watchStreamKey(scrItem.key);
        };

        if (!scrItem.watched) {
          const watchOverlay = document.createElement('div');
          watchOverlay.className = 'vc-screen-watch-overlay';
          const watchBtn = document.createElement('button');
          watchBtn.type = 'button';
          watchBtn.className = 'vc-screen-watch-btn';
          watchBtn.dataset.vcRole = 'watch-stream';
          watchBtn.title = `Watch ${p.user.displayName}'s Stream`;
          watchBtn.appendChild(createWatchStreamIconSvg(12));
          const watchTxt = document.createElement('span');
          watchTxt.textContent = 'Watch';
          watchBtn.appendChild(watchTxt);
          watchBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            triggerWatch();
          });
          watchOverlay.appendChild(watchBtn);
          vidBox.appendChild(watchOverlay);
        } else {
          const tilePaused = document.createElement('div');
          tilePaused.className = 'vc-tile-paused-overlay';
          tilePaused.hidden = !scrItem.paused;
          tilePaused.textContent = 'Stream paused';
          vidBox.appendChild(tilePaused);

          if (isSelf && expandedStageKey !== scrItem.key && localScreenStream) {
            const tileQualBtn = document.createElement('button');
            tileQualBtn.type = 'button';
            tileQualBtn.className = 'vc-tile-quality-btn';
            tileQualBtn.dataset.vcRole = 'tile-screen-quality';
            tileQualBtn.title = 'Adjust Live Screen Resolution & Frame Rate';
            tileQualBtn.textContent = `${formatScreenQualityLabel(true)} ▾`;
            tileQualBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              openScreenSharePopover(tileQualBtn, 'live');
            });
            vidBox.appendChild(tileQualBtn);
          }

          const expBtn = document.createElement('button');
          expBtn.type = 'button';
          expBtn.className = 'vc-tile-expand-btn';
          expBtn.title = expandedStageKey === scrItem.key ? 'Shrink Screen' : 'Expand Screen';
          expBtn.appendChild(createExpandIconSvg(expandedStageKey === scrItem.key, 13));
          expBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleExpandKey(scrItem.key);
          });
          vidBox.appendChild(expBtn);
        }

        vidBox.addEventListener('click', () => {
          if (!scrItem.watched) {
            triggerWatch();
          } else {
            toggleExpandKey(scrItem.key);
          }
        });
        scrTile.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const videoEl = scrItem.watched ? scrTile.querySelector('video') : null;
          if (isSelf) {
            openSelfVoiceMenu(e.clientX, e.clientY, {
              stageKey: scrItem.key,
              anchorEl: scrTile,
            });
          } else {
            openRemoteParticipantMenu(p.user, e.clientX, e.clientY, {
              stageKey: scrItem.key,
              videoEl,
            });
          }
        });

        const scrLabel = document.createElement('div');
        scrLabel.className = 'vc-tile-name';
        scrLabel.textContent = `${p.user.displayName}'s Screen`;

        scrTile.appendChild(vidBox);
        scrTile.appendChild(scrLabel);
        stage.appendChild(scrTile);
      }
    }

    for (const ringUser of sortedRinging) {
      const tile = renderTile(ringUser, {
        ringing: true,
        speaking: false,
        muted: false,
        deafened: false,
        isSelf: false,
      });
      tile.dataset.vcTile = `r:${ringUser.username.toLowerCase()}`;
      stage.appendChild(tile);
    }

    const activityTiles = activitiesCtrl.renderActivityStageTiles(
      threadKey,
      inThisCall,
      () => {
        const target: ThreadTarget =
          call.kind === 'group' && call.groupId
            ? { groupId: call.groupId }
            : { peerUsername: sortedParticipants[0]?.user.username };
        startOrJoinCall(target, threadKey);
      },
    );
    for (const actTile of activityTiles) {
      stage.appendChild(actTile);
    }

    bar.appendChild(stage);

    const controls = document.createElement('div');
    controls.className = 'vc-top-controls';

    if (inThisCall) {
      if (prefs.voiceInputMode === 'push-to-talk') {
        const pttChip = document.createElement('span');
        pttChip.className = pttPressed
          ? 'vc-ptt-pill vc-ptt-pill--active'
          : 'vc-ptt-pill';
        pttChip.textContent = pttPressed
          ? `Talking (${formatKeyCodeLabel(prefs.voicePushToTalkKey)})`
          : `Hold [${formatKeyCodeLabel(prefs.voicePushToTalkKey)}] to talk`;
        controls.appendChild(pttChip);
      }

      const muteBtn = document.createElement('button');
      muteBtn.type = 'button';
      muteBtn.dataset.vcRole = 'mute';
      syncControlBtn(muteBtn, 'mute', effMuted);
      muteBtn.addEventListener('click', toggleMute);

      const deafBtn = document.createElement('button');
      deafBtn.type = 'button';
      deafBtn.dataset.vcRole = 'deaf';
      syncControlBtn(deafBtn, 'deaf', effDeafened);
      deafBtn.addEventListener('click', toggleDeafen);

      const cameraBtn = document.createElement('button');
      cameraBtn.type = 'button';
      cameraBtn.dataset.vcRole = 'camera';
      syncControlBtn(cameraBtn, 'camera', Boolean(localCameraStream));
      cameraBtn.addEventListener('click', () => {
        void toggleCamera();
      });

      const flipCamBtn = document.createElement('button');
      flipCamBtn.type = 'button';
      flipCamBtn.className = 'vc-ctrl-btn';
      flipCamBtn.dataset.vcRole = 'flip-camera';
      flipCamBtn.title =
        cameraFacingMode === 'user' ? 'Flip to Back Camera' : 'Flip to Front Camera';
      flipCamBtn.setAttribute('aria-label', flipCamBtn.title);
      flipCamBtn.hidden = !localCameraStream;
      flipCamBtn.appendChild(createFlipCameraIconSvg(17));
      flipCamBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        void flipCamera();
      });

      const screenBtn = document.createElement('button');
      screenBtn.type = 'button';
      screenBtn.dataset.vcRole = 'screen';
      screenBtn.hidden = Boolean(localScreenStream);
      syncControlBtn(screenBtn, 'screen', Boolean(localScreenStream));
      screenBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isMobileTouchDevice()) {
          if (localScreenStream) {
            stopLocalScreenCapture(true);
            return;
          }
          if (
            isIosBrowser() &&
            (!navigator.mediaDevices || typeof navigator.mediaDevices.getDisplayMedia !== 'function')
          ) {
            options.onErrorNotice?.(
              'iPhone Safari only supports watching streams — Apple blocks web screen broadcasting on iOS.',
            );
            return;
          }
          // Mobile shares full screen directly (no desktop window/tab chooser).
          void startScreenShareWithOptions({
            resolution: '1080p',
            fps: 30,
            shareAudio: true,
            surface: 'monitor',
          }).then((res) => {
            if (!res.ok && !res.cancelled) {
              options.onErrorNotice?.(
                res.blocked
                  ? 'Screen broadcasting is not supported in this mobile browser (watching streams still works).'
                  : res.error || 'Could not start full-screen share.',
              );
            }
          });
          return;
        }
        openScreenSharePopover(screenBtn);
      });

      const activitiesBtn = document.createElement('button');
      activitiesBtn.type = 'button';
      activitiesBtn.className = 'vc-ctrl-btn vc-ctrl-btn--activities';
      activitiesBtn.dataset.vcRole = 'activities';
      activitiesBtn.title = 'Activities — Play Games in Call';
      activitiesBtn.setAttribute('aria-label', 'Activities');
      activitiesBtn.appendChild(createActivitiesControlIconSvg(18));
      activitiesBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        activitiesCtrl.toggleActivitiesBubble(activitiesBtn, threadKey);
      });

      const leaveBtn = document.createElement('button');
      leaveBtn.type = 'button';
      leaveBtn.dataset.vcRole = 'leave';
      syncLeaveOrEndStreamBtn(leaveBtn, Boolean(localScreenStream));
      leaveBtn.addEventListener('click', () => {
        if (localScreenStream) {
          stopLocalScreenCapture(true);
        } else {
          leaveCall();
        }
      });

      controls.appendChild(muteBtn);
      controls.appendChild(deafBtn);
      controls.appendChild(cameraBtn);
      if (localCameraStream) {
        controls.appendChild(flipCamBtn);
      }
      controls.appendChild(screenBtn);
      controls.appendChild(activitiesBtn);
      controls.appendChild(leaveBtn);
    } else {
      const joinBtn = document.createElement('button');
      joinBtn.type = 'button';
      joinBtn.className = 'vc-ctrl-join-btn';
      joinBtn.appendChild(createPhoneCallIconSvg(15));
      const label = document.createElement('span');
      label.textContent = selfOnOtherDevice ? 'Switch to This Device' : 'Join Voice';
      joinBtn.appendChild(label);
      joinBtn.addEventListener('click', () => {
        const target: ThreadTarget =
          call.kind === 'group' && call.groupId
            ? { groupId: call.groupId }
            : {
                peerUsername: threadKey
                  .split('::')
                  .find((u) => u !== options.getSnapshot()?.user.username.toLowerCase()),
              };
        startOrJoinCall(target, threadKey);
      });
      controls.appendChild(joinBtn);
    }

    bar.appendChild(controls);
    host.appendChild(bar);

    if (prevTopStageScroll > 0) {
      const nextTopStage = bar.querySelector<HTMLElement>('.vc-top-stage');
      if (nextTopStage) nextTopStage.scrollTop = prevTopStageScroll;
    }
    if (prevActivityBodyScroll > 0) {
      const nextActivityBody = bar.querySelector<HTMLElement>('.vc-activity-stage-body');
      if (nextActivityBody) {
        nextActivityBody.scrollTop = prevActivityBodyScroll;
        requestAnimationFrame(() => {
          if (nextActivityBody.isConnected) {
            nextActivityBody.scrollTop = prevActivityBodyScroll;
          }
        });
      }
    }
  };

  const renderSidebarStatusBar = (host: HTMLElement) => {
    syncMiniPipOverlayRef();
    host.replaceChildren();
    if (!activeCallThreadKey) {
      host.hidden = true;
      return;
    }
    const call = callsByThread.get(activeCallThreadKey);
    if (!call) {
      host.hidden = true;
      return;
    }
    host.hidden = false;

    const card = document.createElement('div');
    card.className = 'vc-sidebar-status';

    const infoBtn = document.createElement('button');
    infoBtn.type = 'button';
    infoBtn.className = 'vc-sidebar-status-main';
    const titleRow = document.createElement('div');
    titleRow.className = 'vc-sidebar-status-title-row';

    const qualityDot = document.createElement('span');
    qualityDot.className = `vc-signal-dot vc-signal-dot--${callQualityStats.quality}`;
    const rttLabel =
      callQualityStats.rttMs !== null ? `${callQualityStats.rttMs} ms` : callQualityStats.quality === 'connecting' ? 'Connecting' : 'Connected';
    const lossStr =
      callQualityStats.packetLossPct !== null ? ` • Loss ${callQualityStats.packetLossPct}%` : '';
    qualityDot.title = `Call quality: ${rttLabel}${lossStr}`;

    const title = document.createElement('div');
    title.className = 'vc-sidebar-status-title';
    title.textContent = 'Voice Connected';

    const pingBadge = document.createElement('span');
    pingBadge.className = 'vc-ping-badge';
    pingBadge.textContent = callQualityStats.rttMs !== null ? `${callQualityStats.rttMs}ms` : '';
    pingBadge.hidden = callQualityStats.rttMs === null;

    titleRow.appendChild(qualityDot);
    titleRow.appendChild(title);
    titleRow.appendChild(pingBadge);

    const sub = document.createElement('div');
    sub.className = 'vc-sidebar-status-sub';
    const snap = options.getSnapshot();
    if (call.kind === 'group' && call.groupId) {
      const grp = snap?.groups?.find((g) => g.id === call.groupId);
      sub.textContent = grp?.name ?? 'Group Call';
    } else {
      const selfKey = snap?.user.username.toLowerCase();
      const other = call.participants.find((p) => p.user.username.toLowerCase() !== selfKey)
        ?.user ?? call.ringing[0];
      sub.textContent = other?.displayName ?? 'Direct Message Call';
    }
    infoBtn.appendChild(titleRow);
    infoBtn.appendChild(sub);
    infoBtn.addEventListener('click', () => options.onJumpToCallThread(call));

    const hangupBtn = document.createElement('button');
    hangupBtn.type = 'button';
    hangupBtn.className = 'vc-sidebar-hangup-btn';
    hangupBtn.title = 'Disconnect';
    hangupBtn.setAttribute('aria-label', 'Disconnect from Voice Call');
    hangupBtn.appendChild(createPhoneHangupIconSvg(16));
    hangupBtn.addEventListener('click', () => {
      leaveCall();
    });

    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const effMuted = getEffectiveMuted();
      const effDeafened = getEffectiveDeafened();
      const items: ContextMenuItem[] = [
        {
          label: 'Jump to Call Conversation',
          icon: 'message',
          onSelect: () => options.onJumpToCallThread(call),
        },
        {
          label: effMuted ? 'Unmute Microphone' : 'Mute Microphone',
          icon: effMuted ? 'mic-off' : 'mic',
          checked: effMuted,
          dividerBefore: true,
          onSelect: toggleMute,
        },
        {
          label: effDeafened ? 'Undeafen' : 'Deafen',
          icon: effDeafened ? 'headphones-off' : 'headphones',
          checked: effDeafened,
          onSelect: toggleDeafen,
        },
      ];
      if (options.onOpenVoiceSettings) {
        items.push({
          label: 'Voice & Audio Settings',
          icon: 'settings',
          dividerBefore: true,
          onSelect: () => options.onOpenVoiceSettings?.(),
        });
      }
      items.push(
        localScreenStream
          ? {
              label: 'End Stream',
              icon: 'screen',
              danger: true,
              dividerBefore: !options.onOpenVoiceSettings,
              onSelect: () => stopLocalScreenCapture(true),
            }
          : {
              label: 'Disconnect',
              icon: 'phone-off',
              danger: true,
              dividerBefore: !options.onOpenVoiceSettings,
              onSelect: leaveCall,
            },
      );
      openContextMenu({
        clientX: e.clientX,
        clientY: e.clientY,
        minWidth: 215,
        items,
      });
    });

    card.appendChild(infoBtn);
    card.appendChild(hangupBtn);
    host.appendChild(card);
  };

  const MINI_PIP_SIZE = 196;
  const MINI_PIP_MARGIN = 18;
  let miniPipPos: { x: number; y: number } | null = null;
  let miniPipDom: {
    root: HTMLDivElement;
    videoStage: HTMLDivElement;
    videoEl: HTMLVideoElement;
    pausedOverlay: HTMLDivElement;
    liveBadge: HTMLSpanElement;
    speakerAvatar: HTMLImageElement;
    speakerName: HTMLDivElement;
    speakerSub: HTMLDivElement;
    audioStage: HTMLDivElement;
    avatarRing: HTMLDivElement;
    mainAvatar: HTMLImageElement;
    mainName: HTMLDivElement;
    mainSub: HTMLDivElement;
    muteBtn: HTMLButtonElement;
    leaveBtn: HTMLButtonElement;
    activeStreamId: string;
    activeMirror: boolean;
    activeIsScreen: boolean;
  } | null = null;
  let miniPipDragCleanup: (() => void) | null = null;

  const clampMiniPipPos = (x: number, y: number): { x: number; y: number } => {
    const w = miniPipDom?.root.offsetWidth || MINI_PIP_SIZE;
    const h = miniPipDom?.root.offsetHeight || MINI_PIP_SIZE;
    const maxX = Math.max(MINI_PIP_MARGIN, window.innerWidth - w - MINI_PIP_MARGIN);
    const maxY = Math.max(MINI_PIP_MARGIN, window.innerHeight - h - MINI_PIP_MARGIN);
    return {
      x: Math.min(Math.max(MINI_PIP_MARGIN, Math.round(x)), maxX),
      y: Math.min(Math.max(MINI_PIP_MARGIN, Math.round(y)), maxY),
    };
  };

  const applyMiniPipTransform = (el: HTMLElement) => {
    if (!miniPipPos) {
      miniPipPos = clampMiniPipPos(
        window.innerWidth - MINI_PIP_SIZE - MINI_PIP_MARGIN,
        window.innerHeight - MINI_PIP_SIZE - MINI_PIP_MARGIN,
      );
    } else {
      miniPipPos = clampMiniPipPos(miniPipPos.x, miniPipPos.y);
    }
    el.style.transform = `translate3d(${miniPipPos.x}px, ${miniPipPos.y}px, 0)`;
  };

  const handleMiniPipWindowResize = () => {
    if (miniPipDom && !miniPipDom.root.hidden) {
      applyMiniPipTransform(miniPipDom.root);
    }
  };
  window.addEventListener('resize', handleMiniPipWindowResize);

  const ensureMiniPipDom = () => {
    if (miniPipDom) {
      return miniPipDom;
    }

    const root = document.createElement('div');
    root.className = 'vc-mini-pip-overlay';
    root.hidden = true;
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', 'Active Call Floating Preview');

    const videoStage = document.createElement('div');
    videoStage.className = 'vc-mini-pip-video-stage';
    const videoEl = document.createElement('video');
    videoEl.className = 'vc-mini-pip-video';
    videoEl.autoplay = true;
    videoEl.muted = true;
    videoEl.playsInline = true;

    const liveBadge = document.createElement('span');
    liveBadge.className = 'vc-mini-pip-live-badge';

    const speakerBar = document.createElement('div');
    speakerBar.className = 'vc-mini-pip-speaker-bar';
    const speakerAvatar = document.createElement('img');
    speakerAvatar.className = 'vc-mini-pip-speaker-avatar';
    speakerAvatar.alt = '';
    const speakerCopy = document.createElement('div');
    speakerCopy.className = 'vc-mini-pip-speaker-copy';
    const speakerName = document.createElement('div');
    speakerName.className = 'vc-mini-pip-speaker-name';
    const speakerSub = document.createElement('div');
    speakerSub.className = 'vc-mini-pip-speaker-sub';
    speakerCopy.appendChild(speakerName);
    speakerCopy.appendChild(speakerSub);
    speakerBar.appendChild(speakerAvatar);
    speakerBar.appendChild(speakerCopy);

    const pausedOverlay = document.createElement('div');
    pausedOverlay.className = 'vc-mini-pip-paused-overlay';
    pausedOverlay.hidden = true;
    pausedOverlay.appendChild(createPauseIconSvg(18));
    const pausedLabel = document.createElement('span');
    pausedLabel.textContent = 'Stream paused';
    pausedOverlay.appendChild(pausedLabel);

    videoStage.appendChild(videoEl);
    videoStage.appendChild(pausedOverlay);
    videoStage.appendChild(liveBadge);
    videoStage.appendChild(speakerBar);

    const audioStage = document.createElement('div');
    audioStage.className = 'vc-mini-pip-audio-stage';
    const avatarRing = document.createElement('div');
    avatarRing.className = 'vc-mini-pip-avatar-ring';
    const mainAvatar = document.createElement('img');
    mainAvatar.className = 'vc-mini-pip-avatar';
    mainAvatar.alt = '';
    avatarRing.appendChild(mainAvatar);
    const mainName = document.createElement('div');
    mainName.className = 'vc-mini-pip-name';
    const mainSub = document.createElement('div');
    mainSub.className = 'vc-mini-pip-sub';
    audioStage.appendChild(avatarRing);
    audioStage.appendChild(mainName);
    audioStage.appendChild(mainSub);

    const actions = document.createElement('div');
    actions.className = 'vc-mini-pip-actions';

    const muteBtn = document.createElement('button');
    muteBtn.type = 'button';
    muteBtn.className = 'vc-mini-pip-btn';
    muteBtn.title = 'Toggle Mute';
    muteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMute();
    });

    const jumpBtn = document.createElement('button');
    jumpBtn.type = 'button';
    jumpBtn.className = 'vc-mini-pip-btn';
    jumpBtn.title = 'Return to Call';
    jumpBtn.setAttribute('aria-label', 'Return to Call');
    jumpBtn.appendChild(createExpandIconSvg(false, 13));
    jumpBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const activeCall = activeCallThreadKey ? callsByThread.get(activeCallThreadKey) : null;
      if (activeCall) {
        options.onJumpToCallThread(activeCall);
      }
    });

    const leaveBtn = document.createElement('button');
    leaveBtn.type = 'button';
    leaveBtn.className = 'vc-mini-pip-btn vc-mini-pip-btn--danger';
    leaveBtn.title = 'Disconnect';
    leaveBtn.setAttribute('aria-label', 'Disconnect from Call');
    leaveBtn.appendChild(createPhoneHangupIconSvg(13));
    leaveBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (localScreenStream) {
        stopLocalScreenCapture(true);
      } else {
        leaveCall();
      }
    });

    actions.appendChild(muteBtn);
    actions.appendChild(jumpBtn);
    actions.appendChild(leaveBtn);

    root.appendChild(videoStage);
    root.appendChild(audioStage);
    root.appendChild(actions);

    root.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0) {
        return;
      }
      if (ev.target instanceof Element && ev.target.closest('button')) {
        return;
      }
      ev.preventDefault();
      miniPipDragCleanup?.();

      applyMiniPipTransform(root);
      const startPos = miniPipPos ?? { x: MINI_PIP_MARGIN, y: MINI_PIP_MARGIN };
      const originX = ev.clientX;
      const originY = ev.clientY;
      let dragged = false;

      if (typeof root.setPointerCapture === 'function') {
        try {
          root.setPointerCapture(ev.pointerId);
        } catch {
          // Ignore synthetic pointer events without active pointerId.
        }
      }

      const onMove = (moveEv: PointerEvent) => {
        const dx = moveEv.clientX - originX;
        const dy = moveEv.clientY - originY;
        if (!dragged && Math.hypot(dx, dy) >= 4) {
          dragged = true;
          root.classList.add('vc-mini-pip-overlay--dragging');
        }
        if (dragged) {
          miniPipPos = clampMiniPipPos(startPos.x + dx, startPos.y + dy);
          root.style.transform = `translate3d(${miniPipPos.x}px, ${miniPipPos.y}px, 0)`;
        }
      };

      const finishDrag = (endEv: PointerEvent) => {
        cleanup();
        if (!dragged && endEv.type === 'pointerup') {
          const activeCall = activeCallThreadKey ? callsByThread.get(activeCallThreadKey) : null;
          if (activeCall) {
            options.onJumpToCallThread(activeCall);
          }
        }
      };

      const cleanup = () => {
        window.removeEventListener('pointermove', onMove, true);
        window.removeEventListener('pointerup', finishDrag, true);
        window.removeEventListener('pointercancel', finishDrag, true);
        root.classList.remove('vc-mini-pip-overlay--dragging');
        if (typeof root.releasePointerCapture === 'function') {
          try {
            root.releasePointerCapture(ev.pointerId);
          } catch {
            // Ignore release errors when pointer already ended.
          }
        }
        if (miniPipDragCleanup === cleanup) {
          miniPipDragCleanup = null;
        }
      };

      miniPipDragCleanup = cleanup;
      window.addEventListener('pointermove', onMove, true);
      window.addEventListener('pointerup', finishDrag, true);
      window.addEventListener('pointercancel', finishDrag, true);
    });

    root.addEventListener('contextmenu', (e) => {
      const activeCall = activeCallThreadKey ? callsByThread.get(activeCallThreadKey) : null;
      if (!activeCall) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const selfKey = options.getSnapshot()?.user.username.toLowerCase();
      const targetUser =
        (lastActiveSpeakerKey
          ? activeCall.participants.find(
              (p) => p.user.username.toLowerCase() === lastActiveSpeakerKey,
            )?.user
          : null) ??
        activeCall.participants.find((p) => p.user.username.toLowerCase() !== selfKey)?.user;
      if (targetUser && targetUser.username.toLowerCase() !== selfKey) {
        openRemoteParticipantMenu(targetUser, e.clientX, e.clientY, {
          videoEl: miniPipDom?.videoEl,
        });
      } else {
        openSelfVoiceMenu(e.clientX, e.clientY, { anchorEl: root });
      }
    });

    document.body.appendChild(root);
    miniPipDom = {
      root,
      videoStage,
      videoEl,
      pausedOverlay,
      liveBadge,
      speakerAvatar,
      speakerName,
      speakerSub,
      audioStage,
      avatarRing,
      mainAvatar,
      mainName,
      mainSub,
      muteBtn,
      leaveBtn,
      activeStreamId: '',
      activeMirror: false,
      activeIsScreen: false,
    };
    return miniPipDom;
  };

  const syncMiniPipOverlay = () => {
    if (destroyed) {
      return;
    }
    const call = activeCallThreadKey ? callsByThread.get(activeCallThreadKey) : null;
    const shouldShow = Boolean(
      activeCallThreadKey && call && viewedThreadKey !== activeCallThreadKey,
    );
    if (!shouldShow || !call) {
      if (miniPipDom && !miniPipDom.root.hidden) {
        miniPipDragCleanup?.();
        miniPipDom.root.hidden = true;
        if (miniPipDom.activeStreamId) {
          miniPipDom.videoEl.srcObject = null;
          miniPipDom.activeStreamId = '';
        }
      }
      return;
    }

    const dom = ensureMiniPipDom();
    const snap = options.getSnapshot();
    const selfKey = snap?.user.username.toLowerCase() ?? '';
    const effMuted = getEffectiveMuted();
    const effDeafened = getEffectiveDeafened();
    const now = Date.now();

    let liveRemoteSpeakerKey: string | null = null;
    let selfIsSpeaking = false;

    for (const p of call.participants) {
      const uKey = p.user.username.toLowerCase();
      const isSelf = uKey === selfKey;
      const muted = isSelf ? effMuted : p.muted;
      const deafened = isSelf ? effDeafened : p.deafened;
      const talking = !muted && !deafened && (speakingHoldUntil.get(uKey) ?? 0) > now;
      if (talking) {
        if (isSelf) {
          selfIsSpeaking = true;
        } else if (!liveRemoteSpeakerKey) {
          liveRemoteSpeakerKey = uKey;
        }
      }
    }

    const activeParticipantByKey = (key: string | null) =>
      key ? call.participants.find((p) => p.user.username.toLowerCase() === key) ?? null : null;

    if (liveRemoteSpeakerKey) {
      lastActiveSpeakerKey = liveRemoteSpeakerKey;
    } else if (selfIsSpeaking && selfKey) {
      lastActiveSpeakerKey = selfKey;
    }

    const remoteFallback =
      call.participants.find((p) => p.user.username.toLowerCase() !== selfKey) ?? null;
    const selectedParticipant =
      activeParticipantByKey(liveRemoteSpeakerKey) ??
      (selfIsSpeaking ? activeParticipantByKey(selfKey) : null) ??
      activeParticipantByKey(lastActiveSpeakerKey) ??
      remoteFallback ??
      call.participants[0] ??
      null;

    const displayUser: PublicProfile | null =
      selectedParticipant?.user ?? call.ringing[0] ?? snap?.user ?? null;
    const displayKey = displayUser?.username.toLowerCase() ?? '';
    const displayIsSelf = displayKey === selfKey;
    const displayMuted = selectedParticipant
      ? displayIsSelf
        ? effMuted
        : selectedParticipant.muted
      : false;
    const displayDeafened = selectedParticipant
      ? displayIsSelf
        ? effDeafened
        : selectedParticipant.deafened
      : false;
    const displayTalking = Boolean(
      selectedParticipant &&
        !displayMuted &&
        !displayDeafened &&
        (speakingHoldUntil.get(displayKey) ?? 0) > now,
    );

    interface MiniVideoCandidate {
      stream: MediaStream;
      owner: PublicProfile;
      isSelf: boolean;
      isScreen: boolean;
      paused: boolean;
    }
    const screenFeeds: MiniVideoCandidate[] = [];
    const cameraFeeds: MiniVideoCandidate[] = [];

    for (const p of call.participants) {
      const uKey = p.user.username.toLowerCase();
      const isSelf = uKey === selfKey;
      const scr = isSelf
        ? localScreenStream
        : watchedStreamKeys.has(`scr:${uKey}`)
          ? peers.get(uKey)?.remoteScreenStream ?? null
          : null;
      const cam = isSelf ? localCameraStream : peers.get(uKey)?.remoteCameraStream ?? null;
      if (scr) {
        screenFeeds.push({
          stream: scr,
          owner: p.user,
          isSelf,
          isScreen: true,
          paused: isSelf ? localScreenPaused : Boolean(p.screenPaused),
        });
      }
      if (cam) {
        cameraFeeds.push({ stream: cam, owner: p.user, isSelf, isScreen: false, paused: false });
      }
    }

    const chosenFeed =
      screenFeeds.find((f) => f.owner.username.toLowerCase() === displayKey) ??
      screenFeeds.find((f) => !f.isSelf) ??
      screenFeeds[0] ??
      cameraFeeds.find((f) => f.owner.username.toLowerCase() === displayKey) ??
      cameraFeeds.find((f) => !f.isSelf) ??
      cameraFeeds[0] ??
      null;

    dom.root.hidden = false;
    dom.root.classList.toggle('vc-mini-pip-overlay--speaking', displayTalking);
    dom.root.classList.toggle('vc-mini-pip-overlay--video', Boolean(chosenFeed));
    applyMiniPipTransform(dom.root);

    const muteSig = `${effMuted ? 1 : 0}`;
    if (dom.muteBtn.dataset.vcSig !== muteSig) {
      dom.muteBtn.dataset.vcSig = muteSig;
      dom.muteBtn.className = effMuted ? 'vc-mini-pip-btn vc-mini-pip-btn--danger' : 'vc-mini-pip-btn';
      dom.muteBtn.title = effMuted ? 'Unmute Microphone' : 'Mute Microphone';
      dom.muteBtn.setAttribute('aria-label', dom.muteBtn.title);
      dom.muteBtn.replaceChildren(createMicIconSvg(effMuted, 13));
    }

    const leaveSig = localScreenStream ? 'end-stream' : 'leave';
    if (dom.leaveBtn.dataset.vcSig !== leaveSig) {
      dom.leaveBtn.dataset.vcSig = leaveSig;
      dom.leaveBtn.title = localScreenStream
        ? 'End Stream (stop sharing before leaving call)'
        : 'Disconnect';
      dom.leaveBtn.setAttribute('aria-label', localScreenStream ? 'End Stream' : 'Disconnect from Call');
      dom.leaveBtn.replaceChildren(
        localScreenStream ? createStopStreamIconSvg(13) : createPhoneHangupIconSvg(13),
      );
    }

    const avatarUrl = displayUser ? options.resolveAvatar(displayUser) : '';
    const grp =
      call.kind === 'group' && call.groupId
        ? snap?.groups?.find((g) => g.id === call.groupId)
        : undefined;
    const callSubLabel =
      call.kind === 'group' ? grp?.name || 'Group Voice Call' : 'Voice Call';
    const speakerNameText = displayUser?.displayName || callSubLabel;
    const feedPaused = Boolean(chosenFeed && chosenFeed.isScreen && chosenFeed.paused);
    const statusText = displayTalking
      ? 'Speaking'
      : feedPaused
        ? 'Stream paused'
        : displayDeafened
          ? 'Deafened'
          : displayMuted
            ? 'Muted'
            : chosenFeed
              ? chosenFeed.isScreen
                ? `${chosenFeed.owner.displayName}'s Screen`
                : `${chosenFeed.owner.displayName}'s Camera`
              : !selectedParticipant && call.ringing.length > 0
                ? 'Ringing...'
                : callSubLabel;

    if (chosenFeed) {
      dom.videoStage.hidden = false;
      dom.audioStage.hidden = true;
      dom.pausedOverlay.hidden = !feedPaused;
      const shouldMirror = chosenFeed.isSelf && !chosenFeed.isScreen;
      if (
        dom.activeStreamId !== chosenFeed.stream.id ||
        dom.activeMirror !== shouldMirror ||
        dom.activeIsScreen !== chosenFeed.isScreen
      ) {
        dom.activeStreamId = chosenFeed.stream.id;
        dom.activeMirror = shouldMirror;
        dom.activeIsScreen = chosenFeed.isScreen;
        dom.videoEl.srcObject = chosenFeed.stream;
        dom.videoEl.className = [
          'vc-mini-pip-video',
          shouldMirror ? 'vc-mini-pip-video--mirrored' : '',
          chosenFeed.isScreen ? 'vc-mini-pip-video--screen' : '',
        ]
          .filter(Boolean)
          .join(' ');
        void dom.videoEl.play().catch(() => {});
      }
      dom.liveBadge.textContent = chosenFeed.isScreen
        ? feedPaused
          ? 'PAUSED'
          : 'SCREEN'
        : 'CAM';
      dom.liveBadge.className = chosenFeed.isScreen
        ? feedPaused
          ? 'vc-mini-pip-live-badge vc-mini-pip-live-badge--paused'
          : 'vc-mini-pip-live-badge vc-mini-pip-live-badge--screen'
        : 'vc-mini-pip-live-badge';
      if (avatarUrl && dom.speakerAvatar.src !== avatarUrl) {
        dom.speakerAvatar.src = avatarUrl;
      }
      dom.speakerAvatar.classList.toggle('vc-mini-pip-speaker-avatar--speaking', displayTalking);
      dom.speakerName.textContent = speakerNameText;
      dom.speakerSub.textContent = statusText;
    } else {
      dom.videoStage.hidden = true;
      dom.audioStage.hidden = false;
      if (dom.activeStreamId) {
        dom.videoEl.srcObject = null;
        dom.activeStreamId = '';
      }
      if (avatarUrl && dom.mainAvatar.src !== avatarUrl) {
        dom.mainAvatar.src = avatarUrl;
      }
      dom.avatarRing.classList.toggle('vc-mini-pip-avatar-ring--speaking', displayTalking);
      dom.mainName.textContent = speakerNameText;
      dom.mainSub.textContent = statusText;
    }
  };
  syncMiniPipOverlayRef = syncMiniPipOverlay;

  return {
    startOrJoinCall,
    ringUserInCurrentCall,
    canRingUserInCurrentCall,
    confirmAndSwitchToCall,
    leaveCall,
    acceptIncomingCall,
    declineIncomingCall,
    toggleMute,
    toggleDeafen,
    setTestingMic,
    setViewedThreadKey: (nextKey: string | null) => {
      if (viewedThreadKey === nextKey) {
        syncMiniPipOverlay();
        return;
      }
      viewedThreadKey = nextKey;
      syncMiniPipOverlay();
    },
    isMicTesting: () => testingMic,
    isMuted: () => getEffectiveMuted(),
    isDeafened: () => getEffectiveDeafened(),
    getActiveCallThreadKey: () => activeCallThreadKey,
    getActiveCallState: () =>
      activeCallThreadKey ? callsByThread.get(activeCallThreadKey) ?? null : null,
    getCallStateForThread: (threadKey) => callsByThread.get(threadKey) ?? null,
    isUserInActivity: (username) => activitiesCtrl.isUserInActivity(username),
    isUserInAnyKnownCall: (username) => {
      const targetKey = username.trim().toLowerCase();
      if (!targetKey) return false;
      for (const call of callsByThread.values()) {
        if (!call.active) continue;
        if (call.participants.some((p) => p.user.username.toLowerCase() === targetKey)) {
          return true;
        }
      }
      return false;
    },
    getThreadPresence: (threadKey) => {
      if (activitiesCtrl.hasActiveActivityInThread(threadKey)) {
        return 'activity';
      }
      const call = callsByThread.get(threadKey);
      if (call && call.active && call.participants.length > 0) {
        return 'call';
      }
      return null;
    },
    getSidebarPresenceSignature: () => {
      const callSig = Array.from(callsByThread.entries())
        .filter(([, c]) => c.active && c.participants.length > 0)
        .map(
          ([k, c]) =>
            `${k}:${c.participants.map((p) => p.user.username.toLowerCase()).sort().join(',')}`,
        )
        .sort()
        .join('|');
      return `${callSig}##${activitiesCtrl.getPresenceSignature()}`;
    },
    renderCallTopBar,
    renderSidebarStatusBar,
    handleVcState,
    handleVcIncoming,
    handleVcIncomingClear,
    handleVcSignal: (p) => {
      handleVcSignal(p);
    },
    handleVcSpeaking,
    handleVcTransferred,
    handleSocketReconnected: () => {
      if (destroyed) return;
      if (activeCallThreadKey && activeCallTarget) {
        lastReconnectRejoinAt = Date.now();
        lastSentVoiceStateSig = '';
        options
          .getSocket()
          ?.sendVcJoin(
            activeCallTarget,
            getEffectiveMuted(),
            getEffectiveDeafened(),
            false,
            true,
          );
        syncTrackAndSinkStates();
      }
      options.getSocket()?.sendActivityFrame({ type: 'activity:list' });
    },
    handleActivityList: (p) => {
      activitiesCtrl.handleLobbyList(p.lobbies);
    },
    handleActivityLobbyUpdate: (p) => {
      activitiesCtrl.handleLobbyUpdate(p.lobby);
    },
    handleActivityLobbyRemoved: (p) => {
      activitiesCtrl.handleLobbyRemoved(p.lobbyId);
    },
    destroy: () => {
      destroyed = true;
      closeActivePopover();
      activitiesCtrl.destroy();
      miniPipDragCleanup?.();
      window.removeEventListener('resize', handleMiniPipWindowResize);
      unsubPrefs();
      window.removeEventListener('keydown', handleGlobalKeyDown);
      window.removeEventListener('keyup', handleGlobalKeyUp);
      window.removeEventListener('blur', handleWindowBlur);
      if (pttReleaseTimer !== null) {
        window.clearTimeout(pttReleaseTimer);
        pttReleaseTimer = null;
      }
      stopCallStatsPolling();
      stopVadPolling();
      stopLocalCameraCapture(false);
      stopLocalScreenCapture(false);
      stopLocalMicCapture();
      closeAllPeers();
      stopRingLoops();
      miniPipDom?.root.remove();
      miniPipDom = null;
      incomingPopupEl?.remove();
      incomingPopupEl = null;
      audioMount.remove();
    },
  };
}
