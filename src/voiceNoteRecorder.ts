import { getUserPreferences } from './settingsStore';
import type { VoiceNoteMeta } from './types';
import { captureMicStream, createMicDspChain, encodePcm16MonoWav, type MicDspChain } from './voiceAudio';

export interface VoiceNoteResult {
  file: File;
  meta: VoiceNoteMeta;
}

export interface VoiceNoteRecorderSession {
  stopAndSave: () => Promise<VoiceNoteResult | null>;
  cancel: () => void;
}

function downsampleWaveform(samples: number[], targetBars = 36): number[] {
  if (samples.length === 0) {
    return new Array(targetBars).fill(0.14);
  }
  const result: number[] = [];
  for (let i = 0; i < targetBars; i += 1) {
    const start = Math.floor((i * samples.length) / targetBars);
    const end = Math.max(start + 1, Math.floor(((i + 1) * samples.length) / targetBars));
    let peak = 0;
    for (let k = start; k < end; k += 1) {
      if (samples[k] > peak) {
        peak = samples[k];
      }
    }
    result.push(Math.min(1, Math.max(0.08, Math.round(peak * 100) / 100)));
  }
  return result;
}

function encodeMonoPcmWav(chunks: Float32Array[], sourceSampleRate: number): Blob {
  const targetSampleRate = Math.min(24000, Math.max(16000, Math.round(sourceSampleRate)));
  const ratio = sourceSampleRate / targetSampleRate;
  let totalSrcSamples = 0;
  for (const c of chunks) {
    totalSrcSamples += c.length;
  }
  const merged = new Float32Array(totalSrcSamples);
  let pos = 0;
  for (const c of chunks) {
    merged.set(c, pos);
    pos += c.length;
  }

  const outLen = Math.max(1, Math.floor(totalSrcSamples / ratio));
  const resampled = new Float32Array(outLen);
  for (let i = 0; i < outLen; i += 1) {
    const srcIdx = i * ratio;
    const i0 = Math.floor(srcIdx);
    const i1 = Math.min(totalSrcSamples - 1, i0 + 1);
    const frac = srcIdx - i0;
    resampled[i] =
      totalSrcSamples > 0
        ? (merged[i0] ?? 0) * (1 - frac) + (merged[i1] ?? 0) * frac
        : 0;
  }

  return encodePcm16MonoWav(resampled, targetSampleRate);
}

/**
 * Starts recording a voice message using the user's selected mic & active Voice Modifiers DSP chain.
 * Records directly to universal 16-bit PCM WAV via Web Audio when available, with MediaRecorder fallback.
 */
export async function startVoiceNoteRecorder(options: {
  onProgress: (elapsedSec: number, liveLevel: number) => void;
}): Promise<VoiceNoteRecorderSession> {
  const prefs = getUserPreferences();
  const rawStream = await captureMicStream(prefs.voiceInputDeviceId, prefs);

  let audioCtx: AudioContext | null = null;
  let dsp: MicDspChain | null = null;
  let destNode: MediaStreamAudioDestinationNode | null = null;
  let scriptNode: ScriptProcessorNode | null = null;
  let silentGain: GainNode | null = null;
  let recordStream = rawStream;
  const pcmChunks: Float32Array[] = [];
  let useWavCapture = false;

  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor) {
      audioCtx = new Ctor();
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }
      dsp = createMicDspChain({
        ctx: audioCtx,
        rawStream,
        prefs,
        analyserFftSize: 128,
      });

      if (typeof audioCtx.createScriptProcessor === 'function') {
        scriptNode = audioCtx.createScriptProcessor(4096, 1, 1);
        silentGain = audioCtx.createGain();
        silentGain.gain.value = 0;
        scriptNode.onaudioprocess = (ev) => {
          if (cleaned) {
            return;
          }
          const ch = ev.inputBuffer.getChannelData(0);
          pcmChunks.push(new Float32Array(ch));
        };
        dsp.outputNode.connect(scriptNode);
        scriptNode.connect(silentGain);
        silentGain.connect(audioCtx.destination);
        useWavCapture = true;
      } else if (typeof audioCtx.createMediaStreamDestination === 'function') {
        destNode = audioCtx.createMediaStreamDestination();
        dsp.outputNode.connect(destNode);
        recordStream = destNode.stream;
      }
    }
  } catch {
    // Fall back to direct raw MediaRecorder cleanly if Web Audio fails.
    useWavCapture = false;
  }

  let recorder: MediaRecorder | null = null;
  const mediaChunks: BlobPart[] = [];
  let chosenMime = '';
  if (!useWavCapture) {
    const mimeCandidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', ''];
    if (typeof MediaRecorder !== 'undefined') {
      for (const candidate of mimeCandidates) {
        if (!candidate || MediaRecorder.isTypeSupported(candidate)) {
          chosenMime = candidate;
          break;
        }
      }
    }
    recorder = chosenMime
      ? new MediaRecorder(recordStream, { mimeType: chosenMime })
      : new MediaRecorder(recordStream);
    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) {
        mediaChunks.push(ev.data);
      }
    };
  }

  const startedAt = Date.now();
  const waveformSamples: number[] = [];
  const timeBuf = dsp ? new Uint8Array(dsp.outputAnalyser.fftSize) : null;
  let cleaned = false;

  const meterTimerId = window.setInterval(() => {
    const elapsedSec = Math.max(0, (Date.now() - startedAt) / 1000);
    let level = 0.14;
    if (dsp && timeBuf) {
      dsp.outputAnalyser.getByteTimeDomainData(timeBuf);
      let sumSq = 0;
      for (let i = 0; i < timeBuf.length; i += 1) {
        const v = (timeBuf[i] - 128) / 128;
        sumSq += v * v;
      }
      const rms = Math.sqrt(sumSq / timeBuf.length);
      level = Math.min(1, Math.max(0.08, rms * 4.2));
    }
    waveformSamples.push(level);
    options.onProgress(elapsedSec, level);
  }, 65);

  const releaseMedia = () => {
    if (cleaned) {
      return;
    }
    cleaned = true;
    window.clearInterval(meterTimerId);
    if (scriptNode) {
      scriptNode.onaudioprocess = null;
      try {
        scriptNode.disconnect();
      } catch {
        // Ignore disconnect error.
      }
      scriptNode = null;
    }
    if (silentGain) {
      try {
        silentGain.disconnect();
      } catch {
        // Ignore disconnect error.
      }
      silentGain = null;
    }
    dsp?.stop();
    dsp = null;
    try {
      destNode?.disconnect();
    } catch {
      // Ignore disconnect error.
    }
    destNode = null;
    rawStream.getTracks().forEach((t) => t.stop());
    if (recordStream !== rawStream) {
      recordStream.getTracks().forEach((t) => t.stop());
    }
    if (audioCtx) {
      void audioCtx.close().catch(() => {});
      audioCtx = null;
    }
  };

  recorder?.start(100);

  return {
    stopAndSave(): Promise<VoiceNoteResult | null> {
      if (useWavCapture) {
        if (cleaned) {
          return Promise.resolve(null);
        }
        const sr = audioCtx?.sampleRate ?? 48000;
        const durationSec = Math.max(0.4, (Date.now() - startedAt) / 1000);
        const captured = pcmChunks.slice();
        releaseMedia();
        if (captured.length === 0 || durationSec < 0.45) {
          return Promise.resolve(null);
        }
        const wavBlob = encodeMonoPcmWav(captured, sr);
        const file = new File([wavBlob], `voice-message-${Date.now()}.wav`, {
          type: 'audio/wav',
        });
        return Promise.resolve({
          file,
          meta: {
            durationSec: Math.round(durationSec * 10) / 10,
            waveform: downsampleWaveform(waveformSamples, 36),
          },
        });
      }

      return new Promise((resolve) => {
        if (cleaned || !recorder) {
          releaseMedia();
          resolve(null);
          return;
        }
        const durationSec = Math.max(0.4, (Date.now() - startedAt) / 1000);
        if (recorder.state === 'inactive') {
          releaseMedia();
          resolve(null);
          return;
        }
        recorder.onstop = () => {
          const finalMime = recorder?.mimeType || chosenMime || 'audio/webm';
          const ext = finalMime.includes('ogg') ? 'ogg' : 'weba';
          const blob = new Blob(mediaChunks, { type: finalMime });
          releaseMedia();
          if (blob.size < 256 || durationSec < 0.45) {
            resolve(null);
            return;
          }
          const file = new File([blob], `voice-message-${Date.now()}.${ext}`, {
            type: finalMime,
          });
          resolve({
            file,
            meta: {
              durationSec: Math.round(durationSec * 10) / 10,
              waveform: downsampleWaveform(waveformSamples, 36),
            },
          });
        };
        recorder.stop();
      });
    },
    cancel() {
      try {
        if (recorder && recorder.state !== 'inactive') {
          recorder.onstop = null;
          recorder.stop();
        }
      } catch {
        // Ignore stop errors on cancel.
      }
      releaseMedia();
    },
  };
}
