import { buildHostScreenCaptureWsUrl, type HostScreenSource } from './apiClient';
import type { UserPreferences, VoiceModifierMode } from './types';

const SVG_NS = 'http://www.w3.org/2000/svg';

function buildSvg(size: number, className = ''): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  if (className) {
    svg.classList.add(className);
  }
  return svg;
}

function appendPaths(svg: SVGSVGElement, paths: Array<{ d: string; stroke?: string }>): void {
  for (const item of paths) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', item.d);
    if (item.stroke) {
      p.setAttribute('stroke', item.stroke);
    }
    svg.appendChild(p);
  }
}

export function createPhoneCallIconSvg(size = 18): SVGSVGElement {
  const svg = buildSvg(size);
  appendPaths(svg, [
    {
      d: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z',
    },
  ]);
  return svg;
}

export function createPhoneHangupIconSvg(size = 18): SVGSVGElement {
  const svg = buildSvg(size);
  appendPaths(svg, [
    {
      d: 'M22.5 14.5c-2.9-2.8-6.7-4.5-10.5-4.5s-7.6 1.7-10.5 4.5a1.5 1.5 0 0 0-.2 2l1.6 2.1a1.5 1.5 0 0 0 2 .3l2.6-1.7a1.5 1.5 0 0 0 .7-1.3v-2a13 13 0 0 1 5.6 0v2a1.5 1.5 0 0 0 .7 1.3l2.6 1.7a1.5 1.5 0 0 0 2-.3l1.6-2.1a1.5 1.5 0 0 0-.2-2z',
    },
  ]);
  return svg;
}

export function createMicIconSvg(muted: boolean, size = 17): SVGSVGElement {
  const svg = buildSvg(size);
  if (muted) {
    appendPaths(svg, [
      { d: 'M12 1a3 3 0 0 0-3 3v4.5' },
      { d: 'M9 12a3 3 0 0 0 5.12 2.12' },
      { d: 'M15 9.34V4a3 3 0 0 0-3-3' },
      { d: 'M19 10v2a7 7 0 0 1-11.9 4.95' },
      { d: 'M5 10v2a7 7 0 0 0 .93 3.5' },
      { d: 'M12 19v4' },
      { d: 'M8 23h8' },
      { d: 'M3 3l18 18', stroke: '#ff4d52' },
    ]);
  } else {
    appendPaths(svg, [
      { d: 'M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z' },
      { d: 'M19 10v2a7 7 0 0 1-14 0v-2' },
      { d: 'M12 19v4' },
      { d: 'M8 23h8' },
    ]);
  }
  return svg;
}

export function createHeadphonesIconSvg(deafened: boolean, size = 17): SVGSVGElement {
  const svg = buildSvg(size);
  appendPaths(svg, [
    { d: 'M3 18v-6a9 9 0 0 1 18 0v6' },
    {
      d: 'M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z',
    },
    ...(deafened ? [{ d: 'M3 3l18 18', stroke: '#ff4d52' }] : []),
  ]);
  return svg;
}

export function createCameraIconSvg(off: boolean, size = 17): SVGSVGElement {
  const svg = buildSvg(size);
  appendPaths(svg, [
    { d: 'M23 7l-7 5 7 5V7z' },
    { d: 'M15 5H3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z' },
    ...(off ? [{ d: 'M2 2l20 20', stroke: '#ff4d52' }] : []),
  ]);
  return svg;
}

export function createScreenShareIconSvg(sharing: boolean, size = 17): SVGSVGElement {
  const svg = buildSvg(size);
  appendPaths(svg, [
    { d: 'M3 4h18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z' },
    { d: 'M8 21h8' },
    { d: 'M12 17v4' },
    sharing ? { d: 'M9 12l3-3 3 3M12 9v5' } : { d: 'M12 13V8M9 11l3-3 3 3' },
  ]);
  return svg;
}

export function createStopStreamIconSvg(size = 16): SVGSVGElement {
  const svg = buildSvg(size);
  appendPaths(svg, [
    { d: 'M3 4h18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z' },
    { d: 'M8 21h8' },
    { d: 'M12 17v4' },
    { d: 'M9.5 8l5 5M14.5 8l-5 5' },
  ]);
  return svg;
}

export function createPauseIconSvg(size = 22): SVGSVGElement {
  const svg = buildSvg(size);
  appendPaths(svg, [{ d: 'M8 5v14' }, { d: 'M16 5v14' }]);
  return svg;
}

export function createExpandIconSvg(expanded: boolean, size = 15): SVGSVGElement {
  const svg = buildSvg(size);
  appendPaths(
    svg,
    expanded
      ? [
          { d: 'M4 14h6v6' },
          { d: 'M20 10h-6V4' },
          { d: 'M14 10l7-7' },
          { d: 'M3 21l7-7' },
        ]
      : [
          { d: 'M15 3h6v6' },
          { d: 'M9 21H3v-6' },
          { d: 'M21 3l-7 7' },
          { d: 'M3 21l7-7' },
        ],
  );
  return svg;
}

export function createPipIconSvg(size = 15): SVGSVGElement {
  const svg = buildSvg(size);
  appendPaths(svg, [
    { d: 'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5z' },
    { d: 'M13 13h6v5h-6z' },
  ]);
  return svg;
}

export function createVolumeIconSvg(muted: boolean, size = 16): SVGSVGElement {
  const svg = buildSvg(size);
  appendPaths(svg, [
    { d: 'M11 5L6 9H2v6h4l5 4V5z' },
    ...(muted
      ? [{ d: 'M22 9l-6 6' }, { d: 'M16 9l6 6' }]
      : [
          { d: 'M15.54 8.46a5 5 0 0 1 0 7.07' },
          { d: 'M19.07 4.93a10 10 0 0 1 0 14.14' },
        ]),
  ]);
  return svg;
}

export function createSearchIconSvg(size = 17): SVGSVGElement {
  const svg = buildSvg(size);
  appendPaths(svg, [
    { d: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z' },
    { d: 'M21 21l-4.35-4.35' },
  ]);
  return svg;
}

let voiceAudioCtx: AudioContext | null = null;
let voiceSilentSink: GainNode | null = null;
let ringTimerId: number | null = null;
let ringGainNode: GainNode | null = null;
let ringSessionId = 0;

export function getSharedVoiceAudioContext(): AudioContext | null {
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) {
      return null;
    }
    if (!voiceAudioCtx || voiceAudioCtx.state === 'closed') {
      voiceAudioCtx = new Ctor();
      voiceSilentSink = null;
    }
    if (voiceAudioCtx.state === 'suspended') {
      void voiceAudioCtx.resume().catch(() => {});
    }
    return voiceAudioCtx;
  } catch {
    return null;
  }
}

export function getSharedVoiceSilentSink(): { ctx: AudioContext; sink: GainNode } | null {
  const ctx = getSharedVoiceAudioContext();
  if (!ctx) {
    return null;
  }
  if (!voiceSilentSink || voiceSilentSink.context !== ctx) {
    voiceSilentSink = ctx.createGain();
    voiceSilentSink.gain.value = 0;
    voiceSilentSink.connect(ctx.destination);
  }
  return { ctx, sink: voiceSilentSink };
}

function scheduleSynthNote(
  ctx: AudioContext,
  dest: AudioNode,
  startAt: number,
  freq: number,
  duration: number,
  peak: number,
  type: OscillatorType = 'triangle',
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startAt);

  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.linearRampToValueAtTime(peak, startAt + 0.012);
  gain.gain.exponentialRampToValueAtTime(peak * 0.38, startAt + duration * 0.45);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

  osc.connect(gain);
  gain.connect(dest);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.02);
}

/** Stops any currently playing incoming or outgoing ringtone loop. */
export function stopRingLoops(): void {
  ringSessionId += 1;
  if (ringTimerId !== null) {
    window.clearInterval(ringTimerId);
    ringTimerId = null;
  }
  if (ringGainNode) {
    const nodeToStop = ringGainNode;
    ringGainNode = null;
    try {
      if (voiceAudioCtx) {
        const now = voiceAudioCtx.currentTime;
        nodeToStop.gain.cancelScheduledValues(now);
        nodeToStop.gain.setValueAtTime(0.0001, now);
      }
      nodeToStop.disconnect();
    } catch {
      // Ignore cleanup errors.
    }
  }
}

/**
 * Redshift signature incoming call ringtone: rising atmospheric chord chime cadence.
 */
export function startIncomingRingLoop(): void {
  stopRingLoops();
  const ctx = getSharedVoiceAudioContext();
  if (!ctx) {
    return;
  }

  const sessionId = ++ringSessionId;
  const master = ctx.createGain();
  master.gain.value = 0.85;
  master.connect(ctx.destination);
  ringGainNode = master;

  const playPhrase = () => {
    if (ringSessionId !== sessionId || ringGainNode !== master) {
      return;
    }
    const runAt = () => {
      if (ringSessionId !== sessionId || ringGainNode !== master) {
        return;
      }
      const t = ctx.currentTime + 0.02;
      // Redshift signature motif: E5 -> G#5 -> B5 -> E6 ascending, then D#6 -> B5 echo
      scheduleSynthNote(ctx, master, t, 659.25, 0.22, 0.16, 'triangle');
      scheduleSynthNote(ctx, master, t + 0.11, 830.61, 0.22, 0.16, 'triangle');
      scheduleSynthNote(ctx, master, t + 0.22, 987.77, 0.26, 0.18, 'sine');
      scheduleSynthNote(ctx, master, t + 0.34, 1318.51, 0.48, 0.22, 'sine');
      scheduleSynthNote(ctx, master, t + 0.34, 659.25, 0.48, 0.09, 'sine');

      scheduleSynthNote(ctx, master, t + 0.72, 1244.51, 0.24, 0.14, 'triangle');
      scheduleSynthNote(ctx, master, t + 0.86, 987.77, 0.44, 0.18, 'sine');
    };
    if (ctx.state === 'suspended') {
      void ctx.resume().then(runAt).catch(() => {});
    } else {
      runAt();
    }
  };

  playPhrase();
  ringTimerId = window.setInterval(playPhrase, 2350);
}

/**
 * Redshift outgoing call ringback pulse heard by caller while waiting for recipients to answer.
 */
export function startOutgoingRingLoop(): void {
  stopRingLoops();
  const ctx = getSharedVoiceAudioContext();
  if (!ctx) {
    return;
  }

  const sessionId = ++ringSessionId;
  const master = ctx.createGain();
  master.gain.value = 0.65;
  master.connect(ctx.destination);
  ringGainNode = master;

  const playPulse = () => {
    if (ringSessionId !== sessionId || ringGainNode !== master) {
      return;
    }
    const runAt = () => {
      if (ringSessionId !== sessionId || ringGainNode !== master) {
        return;
      }
      const t = ctx.currentTime + 0.02;
      scheduleSynthNote(ctx, master, t, 523.25, 0.22, 0.12, 'sine');
      scheduleSynthNote(ctx, master, t + 0.18, 659.25, 0.28, 0.14, 'sine');
    };
    if (ctx.state === 'suspended') {
      void ctx.resume().then(runAt).catch(() => {});
    } else {
      runAt();
    }
  };

  playPulse();
  ringTimerId = window.setInterval(playPulse, 2600);
}

export function playVcJoinSound(): void {
  const ctx = getSharedVoiceAudioContext();
  if (!ctx) {
    return;
  }
  const t = ctx.currentTime + 0.01;
  scheduleSynthNote(ctx, ctx.destination, t, 523.25, 0.14, 0.14, 'sine');
  scheduleSynthNote(ctx, ctx.destination, t + 0.075, 783.99, 0.22, 0.16, 'sine');
}

export function playVcLeaveSound(): void {
  const ctx = getSharedVoiceAudioContext();
  if (!ctx) {
    return;
  }
  const t = ctx.currentTime + 0.01;
  scheduleSynthNote(ctx, ctx.destination, t, 659.25, 0.13, 0.14, 'sine');
  scheduleSynthNote(ctx, ctx.destination, t + 0.075, 440.0, 0.22, 0.14, 'sine');
}

export function playVcPeerJoinSound(): void {
  const ctx = getSharedVoiceAudioContext();
  if (!ctx) {
    return;
  }
  const t = ctx.currentTime + 0.01;
  scheduleSynthNote(ctx, ctx.destination, t, 659.25, 0.11, 0.11, 'sine');
  scheduleSynthNote(ctx, ctx.destination, t + 0.07, 880.0, 0.18, 0.13, 'sine');
}

export function playVcPeerLeaveSound(): void {
  const ctx = getSharedVoiceAudioContext();
  if (!ctx) {
    return;
  }
  const t = ctx.currentTime + 0.01;
  scheduleSynthNote(ctx, ctx.destination, t, 587.33, 0.11, 0.11, 'sine');
  scheduleSynthNote(ctx, ctx.destination, t + 0.07, 392.0, 0.19, 0.12, 'sine');
}

export function playStreamStartSound(): void {
  const ctx = getSharedVoiceAudioContext();
  if (!ctx) {
    return;
  }
  const t = ctx.currentTime + 0.01;
  scheduleSynthNote(ctx, ctx.destination, t, 587.33, 0.1, 0.11, 'triangle');
  scheduleSynthNote(ctx, ctx.destination, t + 0.065, 739.99, 0.11, 0.12, 'triangle');
  scheduleSynthNote(ctx, ctx.destination, t + 0.13, 880.0, 0.22, 0.13, 'sine');
}

export function playStreamEndSound(): void {
  const ctx = getSharedVoiceAudioContext();
  if (!ctx) {
    return;
  }
  const t = ctx.currentTime + 0.01;
  scheduleSynthNote(ctx, ctx.destination, t, 783.99, 0.1, 0.11, 'triangle');
  scheduleSynthNote(ctx, ctx.destination, t + 0.065, 587.33, 0.11, 0.11, 'triangle');
  scheduleSynthNote(ctx, ctx.destination, t + 0.13, 440.0, 0.2, 0.12, 'sine');
}

export function createWatchStreamIconSvg(size = 15): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');
  const poly = document.createElementNS(ns, 'polygon');
  poly.setAttribute('points', '7,4.5 20,12 7,19.5');
  svg.appendChild(poly);
  return svg;
}

export function playVoiceToggleCue(enabled: boolean): void {
  const ctx = getSharedVoiceAudioContext();
  if (!ctx) {
    return;
  }
  const t = ctx.currentTime + 0.005;
  if (enabled) {
    scheduleSynthNote(ctx, ctx.destination, t, 587.33, 0.08, 0.08, 'sine');
    scheduleSynthNote(ctx, ctx.destination, t + 0.045, 740.0, 0.11, 0.09, 'sine');
  } else {
    scheduleSynthNote(ctx, ctx.destination, t, 587.33, 0.08, 0.08, 'sine');
    scheduleSynthNote(ctx, ctx.destination, t + 0.045, 440.0, 0.11, 0.09, 'sine');
  }
}

export interface AudioDeviceOption {
  deviceId: string;
  label: string;
}

export async function listAudioDevices(): Promise<{
  inputs: AudioDeviceOption[];
  outputs: AudioDeviceOption[];
}> {
  const fallback = {
    inputs: [{ deviceId: 'default', label: 'Default Input Device' }],
    outputs: [{ deviceId: 'default', label: 'Default Output Device' }],
  };
  if (
    typeof navigator === 'undefined' ||
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.enumerateDevices !== 'function'
  ) {
    return fallback;
  }

  try {
    const rawDevices = await navigator.mediaDevices.enumerateDevices();
    const inputs: AudioDeviceOption[] = [{ deviceId: 'default', label: 'Default' }];
    const outputs: AudioDeviceOption[] = [{ deviceId: 'default', label: 'Default' }];
    let inIdx = 1;
    let outIdx = 1;

    for (const dev of rawDevices) {
      if (dev.kind === 'audioinput') {
        if (dev.deviceId === 'default') {
          if (dev.label) {
            inputs[0] = { deviceId: 'default', label: `Default (${dev.label})` };
          }
          continue;
        }
        inputs.push({
          deviceId: dev.deviceId,
          label: dev.label || `Microphone ${inIdx}`,
        });
        inIdx += 1;
      } else if (dev.kind === 'audiooutput') {
        if (dev.deviceId === 'default') {
          if (dev.label) {
            outputs[0] = { deviceId: 'default', label: `Default (${dev.label})` };
          }
          continue;
        }
        outputs.push({
          deviceId: dev.deviceId,
          label: dev.label || `Output Device ${outIdx}`,
        });
        outIdx += 1;
      }
    }
    return { inputs, outputs };
  } catch {
    return fallback;
  }
}

export interface EffectiveVoiceDspConfig {
  mode: VoiceModifierMode;
  ampGain: number;
  highPassHz: number;
  lowPassHz: number;
  warmthDb: number;
  voiceClarityDb: number;
  compressorAmount: number;
  noiseGateEnabled: boolean;
  noiseGateThresholdDb: number;
  noiseSuppression: boolean;
  echoCancellation: boolean;
  autoGainControl: boolean;
}

export function resolveEffectiveVoiceDsp(
  prefs: Pick<UserPreferences, 'voiceModifierMode' | 'voiceMicAmplification' | 'voiceCustom'>,
): EffectiveVoiceDspConfig {
  const ampScalar = Math.min(2.5, Math.max(0.5, (prefs.voiceMicAmplification || 100) / 100));
  if (prefs.voiceModifierMode === 'background-drowner') {
    return {
      mode: 'background-drowner',
      ampGain: ampScalar,
      highPassHz: 115,
      lowPassHz: 12000,
      warmthDb: -1.5,
      voiceClarityDb: 4.0,
      compressorAmount: 52,
      noiseGateEnabled: true,
      noiseGateThresholdDb: -48,
      noiseSuppression: true,
      echoCancellation: true,
      autoGainControl: true,
    };
  }
  if (prefs.voiceModifierMode === 'custom') {
    const c = prefs.voiceCustom;
    return {
      mode: 'custom',
      ampGain: ampScalar,
      highPassHz: c.highPassHz,
      lowPassHz: c.lowPassHz,
      warmthDb: c.warmthDb,
      voiceClarityDb: c.voiceClarityDb,
      compressorAmount: c.compressorAmount,
      noiseGateEnabled: c.noiseGateThresholdDb > -75,
      noiseGateThresholdDb: c.noiseGateThresholdDb,
      noiseSuppression: c.noiseSuppression,
      echoCancellation: c.echoCancellation,
      autoGainControl: c.autoGainControl,
    };
  }
  return {
    mode: 'none',
    ampGain: ampScalar,
    highPassHz: 20,
    lowPassHz: 20000,
    warmthDb: 0,
    voiceClarityDb: 0,
    compressorAmount: 0,
    noiseGateEnabled: false,
    noiseGateThresholdDb: -75,
    noiseSuppression: false,
    echoCancellation: true,
    autoGainControl: false,
  };
}

export async function captureMicStream(
  inputDeviceId: string,
  prefs?: Pick<UserPreferences, 'voiceModifierMode' | 'voiceMicAmplification' | 'voiceCustom'>,
): Promise<MediaStream> {
  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
    throw new Error('Error: Microphone access is unavailable in this browser');
  }
  const cleanId = inputDeviceId && inputDeviceId !== 'default' ? inputDeviceId : undefined;
  const cfg = prefs ? resolveEffectiveVoiceDsp(prefs) : null;
  const baseConstraints: MediaTrackConstraints = {
    echoCancellation: cfg ? cfg.echoCancellation : true,
    noiseSuppression: cfg ? cfg.noiseSuppression : true,
    autoGainControl: cfg ? cfg.autoGainControl : true,
  };
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: cleanId ? { ...baseConstraints, deviceId: { exact: cleanId } } : baseConstraints,
    });
  } catch (err) {
    if (cleanId) {
      return await navigator.mediaDevices.getUserMedia({ audio: baseConstraints });
    }
    throw err;
  }
}

export async function captureCameraStream(): Promise<MediaStream> {
  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
    throw new Error('Error: Camera access is unavailable in this browser');
  }
  return await navigator.mediaDevices.getUserMedia({
    video: {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30 },
    },
    audio: false,
  });
}

export type ScreenShareSurface = 'browser' | 'monitor' | 'window' | 'any';

export interface ScreenShareOptions {
  resolution: '720p' | '1080p' | 'source';
  fps: 30 | 60;
  shareAudio: boolean;
  surface?: ScreenShareSurface;
}

interface HostCaptureController {
  updateLive: (opts: Pick<ScreenShareOptions, 'resolution' | 'fps'>) => MediaTrackSettings;
  dispose: () => void;
  getSettings: () => MediaTrackSettings;
}

const hostCaptureControllers = new WeakMap<MediaStream, HostCaptureController>();

function resolveTargetCaptureDims(
  srcW: number,
  srcH: number,
  resolution: ScreenShareOptions['resolution'],
): { maxW: number; maxH: number } {
  const safeW = Math.max(320, Math.round(srcW || 1280));
  const safeH = Math.max(180, Math.round(srcH || 720));
  const capW = resolution === '720p' ? 1280 : resolution === '1080p' ? 1920 : 2560;
  const capH = resolution === '720p' ? 720 : resolution === '1080p' ? 1080 : 1440;
  const scale = Math.min(1, capW / safeW, capH / safeH);
  return {
    maxW: Math.max(320, Math.round((safeW * scale) / 2) * 2),
    maxH: Math.max(180, Math.round((safeH * scale) / 2) * 2),
  };
}

/**
 * Builds MediaTrackConstraints for screen capture and live stream updates.
 */
export function buildScreenShareVideoConstraints(
  options: Pick<ScreenShareOptions, 'resolution' | 'fps' | 'surface'>,
  includeSurface = true,
): MediaTrackConstraints & { displaySurface?: string } {
  const constraints: MediaTrackConstraints & { displaySurface?: string } = {
    frameRate: { ideal: options.fps, max: options.fps },
  };
  if (options.resolution === '720p') {
    constraints.width = { ideal: 1280, max: 1280 };
    constraints.height = { ideal: 720, max: 720 };
  } else if (options.resolution === '1080p') {
    constraints.width = { ideal: 1920, max: 1920 };
    constraints.height = { ideal: 1080, max: 1080 };
  }
  if (
    includeSurface &&
    (options.surface === 'browser' ||
      options.surface === 'monitor' ||
      options.surface === 'window')
  ) {
    constraints.displaySurface = options.surface;
  }
  return constraints;
}

export async function captureScreenShareStream(
  options: ScreenShareOptions,
): Promise<MediaStream> {
  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getDisplayMedia !== 'function') {
    throw new Error('UNSUPPORTED: Native browser screen capture is unavailable in this environment');
  }
  const attempts: DisplayMediaStreamOptions[] = [
    {
      video: buildScreenShareVideoConstraints(options, true),
      audio: options.shareAudio,
      surfaceSwitching: 'include',
      selfBrowserSurface: 'exclude',
    } as DisplayMediaStreamOptions,
    {
      video: buildScreenShareVideoConstraints(options, false),
      audio: options.shareAudio,
    },
    {
      video: true,
      audio: options.shareAudio,
    },
  ];
  if (options.shareAudio) {
    attempts.push({ video: true, audio: false });
  }

  let lastErr: unknown;
  for (let i = 0; i < attempts.length; i += 1) {
    try {
      return await navigator.mediaDevices.getDisplayMedia(attempts[i]);
    } catch (err) {
      lastErr = err;
      const errName = err instanceof DOMException ? err.name : '';
      const errMsg = err instanceof Error ? err.message : String(err);
      // Only abort fallback chain immediately if the user clicked Cancel or permissions policy explicitly blocked capture.
      if (
        errName === 'AbortError' ||
        (errName === 'NotAllowedError' && !/constraint|audio/i.test(errMsg))
      ) {
        throw err;
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Screen capture failed');
}

/**
 * Streams a host-enumerated window or entire monitor over the local capture WebSocket
 * into an offscreen canvas MediaStream so previews & streaming work even inside embedded browsers.
 */
export async function captureHostPreviewStream(
  source: Pick<HostScreenSource, 'id' | 'width' | 'height'>,
  options: Pick<ScreenShareOptions, 'resolution' | 'fps'>,
): Promise<MediaStream> {
  let curResolution = options.resolution;
  let curFps: 30 | 60 = options.fps;
  const srcW = Math.max(320, source.width || 1280);
  const srcH = Math.max(180, source.height || 720);
  let target = resolveTargetCaptureDims(srcW, srcH, curResolution);

  const canvas = document.createElement('canvas');
  canvas.width = target.maxW;
  canvas.height = target.maxH;
  const ctx = canvas.getContext('2d');
  const stream = canvas.captureStream(curFps);
  const videoTrack = stream.getVideoTracks()[0];

  const wsUrl = buildHostScreenCaptureWsUrl(source.id, {
    maxW: target.maxW,
    maxH: target.maxH,
    fps: curFps,
  });
  if (!wsUrl) {
    stream.getTracks().forEach((t) => t.stop());
    throw new Error('Authentication required for host screen streaming');
  }

  let disposed = false;
  let decoding = false;
  const ws = new WebSocket(wsUrl);
  ws.binaryType = 'arraybuffer';

  const dispose = () => {
    if (disposed) {
      return;
    }
    disposed = true;
    try {
      ws.close();
    } catch {
      // Ignore WS close failure.
    }
  };

  if (videoTrack) {
    const origStop = videoTrack.stop.bind(videoTrack);
    videoTrack.stop = () => {
      dispose();
      origStop();
    };
  }

  const endDueToSourceClosed = () => {
    dispose();
    for (const track of stream.getTracks()) {
      track.stop();
      track.dispatchEvent(new Event('ended'));
    }
    stream.dispatchEvent(new Event('inactive'));
  };

  ws.addEventListener('message', (ev) => {
    if (disposed) {
      return;
    }
    if (typeof ev.data === 'string') {
      try {
        const msg = JSON.parse(ev.data) as { type?: string; paused?: boolean };
        if (msg.type === 'closed') {
          endDueToSourceClosed();
        } else if (msg.type === 'paused') {
          stream.dispatchEvent(
            new CustomEvent('rs-screen-paused', { detail: { paused: Boolean(msg.paused) } }),
          );
        }
      } catch {
        // Ignore malformed control payload.
      }
      return;
    }
    if (!(ev.data instanceof ArrayBuffer) || decoding || !ctx) {
      return;
    }
    decoding = true;
    const blob = new Blob([ev.data], { type: 'image/jpeg' });
    void createImageBitmap(blob)
      .then((bmp) => {
        if (disposed) {
          bmp.close();
          return;
        }
        if (canvas.width !== bmp.width || canvas.height !== bmp.height) {
          canvas.width = bmp.width;
          canvas.height = bmp.height;
        }
        ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
        bmp.close();
      })
      .catch(() => {})
      .finally(() => {
        decoding = false;
      });
  });

  ws.addEventListener('close', () => {
    if (!disposed) {
      endDueToSourceClosed();
    }
  });

  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      dispose();
      stream.getTracks().forEach((t) => t.stop());
      reject(new Error('Timed out starting local screen stream'));
    }, 6000);
    ws.addEventListener('open', () => {
      window.clearTimeout(timeout);
      resolve();
    });
    ws.addEventListener('error', () => {
      window.clearTimeout(timeout);
      dispose();
      stream.getTracks().forEach((t) => t.stop());
      reject(new Error('Could not connect local screen stream'));
    });
  });

  hostCaptureControllers.set(stream, {
    updateLive: (nextOpts) => {
      curResolution = nextOpts.resolution;
      curFps = nextOpts.fps;
      target = resolveTargetCaptureDims(srcW, srcH, curResolution);
      canvas.width = target.maxW;
      canvas.height = target.maxH;
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: 'config',
            maxW: target.maxW,
            maxH: target.maxH,
            fps: curFps,
          }),
        );
      }
      return { width: canvas.width, height: canvas.height, frameRate: curFps };
    },
    dispose,
    getSettings: () => ({ width: canvas.width, height: canvas.height, frameRate: curFps }),
  });

  return stream;
}

export function disposeScreenShareStream(stream: MediaStream | null): void {
  if (!stream) {
    return;
  }
  hostCaptureControllers.get(stream)?.dispose();
}

export function getScreenShareStreamSettings(stream: MediaStream | null): MediaTrackSettings | null {
  if (!stream) {
    return null;
  }
  const ctrl = hostCaptureControllers.get(stream);
  if (ctrl) {
    return ctrl.getSettings();
  }
  const vt = stream.getVideoTracks()[0];
  return vt && typeof vt.getSettings === 'function' ? vt.getSettings() : null;
}

/**
 * Updates resolution and frame rate constraints live on an active screen share stream
 * without interrupting capture or peer connections.
 */
export async function applyLiveScreenShareOptions(
  stream: MediaStream,
  options: Pick<ScreenShareOptions, 'resolution' | 'fps'>,
): Promise<MediaTrackSettings | null> {
  const hostCtrl = hostCaptureControllers.get(stream);
  if (hostCtrl) {
    return hostCtrl.updateLive(options);
  }
  const videoTrack = stream.getVideoTracks()[0];
  if (!videoTrack || videoTrack.readyState !== 'live' || typeof videoTrack.applyConstraints !== 'function') {
    return null;
  }
  const nextConstraints = buildScreenShareVideoConstraints(options, false);
  if (options.resolution === 'source') {
    // Clearing explicit width/height caps restores native source resolution in Chromium.
    try {
      await videoTrack.applyConstraints({
        ...nextConstraints,
        width: {},
        height: {},
      });
    } catch {
      await videoTrack.applyConstraints(nextConstraints).catch(() => {});
    }
  } else {
    try {
      await videoTrack.applyConstraints(nextConstraints);
    } catch {
      // Fallback to ideal-only bounds if strict max constraints are rejected by a driver.
      await videoTrack
        .applyConstraints({
          frameRate: { ideal: options.fps },
          width: options.resolution === '720p' ? { ideal: 1280 } : { ideal: 1920 },
          height: options.resolution === '720p' ? { ideal: 720 } : { ideal: 1080 },
        })
        .catch(() => {});
    }
  }
  return typeof videoTrack.getSettings === 'function' ? videoTrack.getSettings() : null;
}

export interface MicDspChain {
  outputNode: AudioNode;
  outputAnalyser: AnalyserNode;
  updatePrefs: (
    nextPrefs: Pick<UserPreferences, 'voiceModifierMode' | 'voiceMicAmplification' | 'voiceCustom'>,
  ) => void;
  isGateOpen: () => boolean;
  stop: () => void;
}

/**
 * Real-time Web Audio microphone DSP chain supporting None, Background Drowner (Krisp-like),
 * microphone amplification, multi-band clarity/warmth EQ, compressor, and smooth RMS noise gate.
 */
export function createMicDspChain(options: {
  ctx: AudioContext;
  rawStream: MediaStream;
  prefs: Pick<UserPreferences, 'voiceModifierMode' | 'voiceMicAmplification' | 'voiceCustom'>;
  analyserFftSize?: number;
}): MicDspChain {
  const { ctx, rawStream } = options;
  const sourceNode = ctx.createMediaStreamSource(rawStream);

  const inputAnalyser = ctx.createAnalyser();
  inputAnalyser.fftSize = 256;

  const highPass = ctx.createBiquadFilter();
  highPass.type = 'highpass';
  highPass.Q.value = 0.707;

  const warmth = ctx.createBiquadFilter();
  warmth.type = 'lowshelf';
  warmth.frequency.value = 180;

  const clarity = ctx.createBiquadFilter();
  clarity.type = 'peaking';
  clarity.frequency.value = 2800;
  clarity.Q.value = 1.05;

  const lowPass = ctx.createBiquadFilter();
  lowPass.type = 'lowpass';
  lowPass.Q.value = 0.707;

  const compressor = ctx.createDynamicsCompressor();
  compressor.knee.value = 18;
  compressor.attack.value = 0.004;
  compressor.release.value = 0.16;

  const gateGain = ctx.createGain();
  gateGain.gain.value = 1;

  const ampGain = ctx.createGain();
  ampGain.gain.value = 1;

  const outputAnalyser = ctx.createAnalyser();
  outputAnalyser.fftSize = options.analyserFftSize ?? 256;
  outputAnalyser.smoothingTimeConstant = 0.68;

  sourceNode.connect(inputAnalyser);
  inputAnalyser.connect(highPass);
  highPass.connect(warmth);
  warmth.connect(clarity);
  clarity.connect(lowPass);
  lowPass.connect(compressor);
  compressor.connect(gateGain);
  gateGain.connect(ampGain);
  ampGain.connect(outputAnalyser);

  const gateTimeBuf = new Uint8Array(inputAnalyser.fftSize);
  let gateTimerId: number | null = null;
  let gateOpen = true;
  let gateHoldUntil = 0;
  let lastAppliedConstraintsKey = '';
  let stopped = false;

  let currentCfg = resolveEffectiveVoiceDsp(options.prefs);

  const stopGateTimer = () => {
    if (gateTimerId !== null) {
      window.clearInterval(gateTimerId);
      gateTimerId = null;
    }
  };

  const ensureGateTimer = () => {
    if (stopped || !currentCfg.noiseGateEnabled) {
      stopGateTimer();
      gateOpen = true;
      gateGain.gain.setTargetAtTime(1, ctx.currentTime, 0.015);
      return;
    }
    if (gateTimerId !== null) {
      return;
    }
    gateTimerId = window.setInterval(() => {
      if (stopped || !currentCfg.noiseGateEnabled) {
        return;
      }
      inputAnalyser.getByteTimeDomainData(gateTimeBuf);
      let sumSq = 0;
      for (let i = 0; i < gateTimeBuf.length; i += 1) {
        const s = (gateTimeBuf[i] - 128) / 128;
        sumSq += s * s;
      }
      const rms = Math.sqrt(sumSq / gateTimeBuf.length);
      const db = 20 * Math.log10(Math.max(rms, 1e-5));
      const now = Date.now();

      let target = 1;
      if (db >= currentCfg.noiseGateThresholdDb) {
        gateHoldUntil = now + 150;
        gateOpen = true;
        target = 1;
      } else if (now < gateHoldUntil) {
        gateOpen = true;
        target = 1;
      } else {
        gateOpen = false;
        const delta = currentCfg.noiseGateThresholdDb - db;
        // Soft-knee attenuation below gate threshold so quiet room noise smoothly drops away.
        target = delta < 8 ? Math.max(0.025, 1 - (delta / 8) * 0.92) : 0.02;
      }
      const tau = target > gateGain.gain.value ? 0.012 : 0.095;
      gateGain.gain.setTargetAtTime(target, ctx.currentTime, tau);
    }, 35);
  };

  const applyConfigToNodes = (cfg: EffectiveVoiceDspConfig) => {
    currentCfg = cfg;
    const nowT = ctx.currentTime;
    const maxHz = Math.max(4000, Math.min(20000, ctx.sampleRate * 0.45));
    highPass.frequency.setTargetAtTime(Math.max(20, Math.min(350, cfg.highPassHz)), nowT, 0.02);
    lowPass.frequency.setTargetAtTime(Math.min(maxHz, cfg.lowPassHz), nowT, 0.02);
    warmth.gain.setTargetAtTime(cfg.warmthDb, nowT, 0.02);
    clarity.gain.setTargetAtTime(cfg.voiceClarityDb, nowT, 0.02);

    const compAmt = Math.min(100, Math.max(0, cfg.compressorAmount));
    if (compAmt <= 0) {
      compressor.threshold.setTargetAtTime(0, nowT, 0.02);
      compressor.ratio.setTargetAtTime(1, nowT, 0.02);
    } else {
      const thresh = -8 - (compAmt / 100) * 28; // -8 dB to -36 dB
      const ratio = 1.4 + (compAmt / 100) * 6.6; // 1.4:1 to 8:1
      compressor.threshold.setTargetAtTime(thresh, nowT, 0.02);
      compressor.ratio.setTargetAtTime(ratio, nowT, 0.02);
    }

    ampGain.gain.setTargetAtTime(cfg.ampGain, nowT, 0.02);

    const constraintKey = `${cfg.noiseSuppression ? 1 : 0}:${cfg.echoCancellation ? 1 : 0}:${cfg.autoGainControl ? 1 : 0}`;
    if (constraintKey !== lastAppliedConstraintsKey) {
      lastAppliedConstraintsKey = constraintKey;
      const track = rawStream.getAudioTracks()[0];
      if (track && typeof track.applyConstraints === 'function') {
        void track
          .applyConstraints({
            noiseSuppression: cfg.noiseSuppression,
            echoCancellation: cfg.echoCancellation,
            autoGainControl: cfg.autoGainControl,
          })
          .catch(() => {});
      }
    }

    ensureGateTimer();
  };

  applyConfigToNodes(currentCfg);

  return {
    outputNode: outputAnalyser,
    outputAnalyser,
    updatePrefs(nextPrefs) {
      if (stopped) {
        return;
      }
      applyConfigToNodes(resolveEffectiveVoiceDsp(nextPrefs));
    },
    isGateOpen() {
      return !currentCfg.noiseGateEnabled || gateOpen;
    },
    stop() {
      if (stopped) {
        return;
      }
      stopped = true;
      stopGateTimer();
      try {
        sourceNode.disconnect();
        inputAnalyser.disconnect();
        highPass.disconnect();
        warmth.disconnect();
        clarity.disconnect();
        lowPass.disconnect();
        compressor.disconnect();
        gateGain.disconnect();
        ampGain.disconnect();
        outputAnalyser.disconnect();
      } catch {
        // Ignore cleanup disconnect errors.
      }
    },
  };
}

export function applyAudioOutputDevice(audioEl: HTMLAudioElement, outputDeviceId: string): void {
  const sinkCapable = audioEl as HTMLAudioElement & {
    sinkId?: string;
    setSinkId?: (id: string) => Promise<void>;
  };
  if (typeof sinkCapable.setSinkId !== 'function') {
    return;
  }
  const cleanId = outputDeviceId && outputDeviceId !== 'default' ? outputDeviceId : '';
  if ((sinkCapable.sinkId ?? '') === cleanId) {
    return;
  }
  void sinkCapable.setSinkId(outputDeviceId || 'default').catch(() => {});
}

export interface MicSelfTestSession {
  setOutputDevice: (deviceId: string) => void;
  updatePrefs: (
    nextPrefs: Pick<UserPreferences, 'voiceModifierMode' | 'voiceMicAmplification' | 'voiceCustom'>,
  ) => void;
  isGateOpen: () => boolean;
  stop: () => void;
}

/**
 * Starts real-time microphone capture + DSP modifier processing + self-monitor playback + live visualizer.
 */
export async function startMicSelfTest(options: {
  inputDeviceId: string;
  outputDeviceId: string;
  prefs: Pick<UserPreferences, 'voiceModifierMode' | 'voiceMicAmplification' | 'voiceCustom'>;
  onLevel: (level: number, bands: number[], gateOpen: boolean) => void;
}): Promise<MicSelfTestSession> {
  const stream = await captureMicStream(options.inputDeviceId, options.prefs);
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) {
    stream.getTracks().forEach((t) => t.stop());
    throw new Error('Error: Web Audio API is unavailable');
  }

  const testCtx = new Ctor();
  if (testCtx.state === 'suspended') {
    await testCtx.resume();
  }

  const dsp = createMicDspChain({
    ctx: testCtx,
    rawStream: stream,
    prefs: options.prefs,
    analyserFftSize: 128,
  });

  const loopbackGain = testCtx.createGain();
  loopbackGain.gain.value = 0.92;
  dsp.outputNode.connect(loopbackGain);

  let monitorAudioEl: HTMLAudioElement | null = null;
  if (typeof testCtx.createMediaStreamDestination === 'function') {
    const destNode = testCtx.createMediaStreamDestination();
    loopbackGain.connect(destNode);
    monitorAudioEl = document.createElement('audio');
    monitorAudioEl.autoplay = true;
    monitorAudioEl.srcObject = destNode.stream;
    applyAudioOutputDevice(monitorAudioEl, options.outputDeviceId);
    void monitorAudioEl.play().catch(() => {});
  } else {
    loopbackGain.connect(testCtx.destination);
  }

  const analyser = dsp.outputAnalyser;
  const freqBins = new Uint8Array(analyser.frequencyBinCount);
  const timeBins = new Uint8Array(analyser.fftSize);
  let stopped = false;
  let rafId = 0;

  const tick = () => {
    if (stopped) {
      return;
    }
    analyser.getByteFrequencyData(freqBins);
    analyser.getByteTimeDomainData(timeBins);

    let sumSq = 0;
    for (let i = 0; i < timeBins.length; i += 1) {
      const sample = (timeBins[i] - 128) / 128;
      sumSq += sample * sample;
    }
    const rms = Math.sqrt(sumSq / timeBins.length);
    const normalized = Math.min(1, rms * 3.8);

    const bandsCount = 24;
    const bands: number[] = [];
    const usableBins = Math.min(freqBins.length, 48);
    const step = Math.max(1, Math.floor(usableBins / bandsCount));
    for (let b = 0; b < bandsCount; b += 1) {
      let acc = 0;
      const start = Math.min(usableBins - 1, b * step);
      for (let k = 0; k < step; k += 1) {
        acc += freqBins[Math.min(usableBins - 1, start + k)];
      }
      bands.push(Math.min(1, acc / (step * 210)));
    }

    options.onLevel(normalized, bands, dsp.isGateOpen());
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);

  return {
    setOutputDevice(deviceId: string) {
      if (monitorAudioEl) {
        applyAudioOutputDevice(monitorAudioEl, deviceId);
      }
    },
    updatePrefs(nextPrefs) {
      if (!stopped) {
        dsp.updatePrefs(nextPrefs);
      }
    },
    isGateOpen() {
      return dsp.isGateOpen();
    },
    stop() {
      if (stopped) {
        return;
      }
      stopped = true;
      cancelAnimationFrame(rafId);
      dsp.stop();
      options.onLevel(0, new Array(24).fill(0), true);
      stream.getTracks().forEach((t) => t.stop());
      if (monitorAudioEl) {
        monitorAudioEl.pause();
        monitorAudioEl.srcObject = null;
        monitorAudioEl = null;
      }
      void testCtx.close().catch(() => {});
    },
  };
}

/** Encodes a mono float PCM sample array [-1, 1] into a standard 16-bit RIFF WAVE Blob. */
export function encodePcm16MonoWav(samples: Float32Array, sampleRate: number): Blob {
  const cleanRate = Math.max(8000, Math.round(sampleRate) || 24000);
  const len = samples.length;
  const dataBytes = len * 2;
  const wav = new ArrayBuffer(44 + dataBytes);
  const dv = new DataView(wav);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i += 1) {
      dv.setUint8(off + i, s.charCodeAt(i));
    }
  };
  writeStr(0, 'RIFF');
  dv.setUint32(4, 36 + dataBytes, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, 1, true);
  dv.setUint32(24, cleanRate, true);
  dv.setUint32(28, cleanRate * 2, true);
  dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true);
  writeStr(36, 'data');
  dv.setUint32(40, dataBytes, true);
  let off = 44;
  for (let i = 0; i < len; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i] ?? 0));
    dv.setInt16(off, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    off += 2;
  }
  return new Blob([wav], { type: 'audio/wav' });
}
