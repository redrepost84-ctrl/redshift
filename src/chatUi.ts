import {
  apiBlockUser,
  apiFetchLinkPreview,
  apiRemoveFriend,
  formatFileSize,
  resolveMediaUrl,
} from './apiClient';
import {
  closeActiveContextMenu,
  type ContextMenuItem,
  copyGifShareLinkToClipboard,
  copyImageToClipboard,
  copyToClipboard,
  createMenuIconSvg,
  openContextMenu,
  triggerDownload,
} from './contextMenu';
import { attachEmojiAutocomplete } from './emojiAutocomplete';
import { replaceEmojiShortcodeBeforeCursor } from './emojiCatalog';
import {
  containsSelfMention,
  extractFirstPreviewableUrl,
  renderFormattedMessageContent,
} from './markdownRenderer';
import { isModalConfirmShortcut, isTopmostModal } from './modalShortcuts';
import { getUserPreferences } from './settingsStore';
import { isEmojiOnlyMessage, setTwemojiText } from './twemojiHelper';
import type {
  ChatMessage,
  DmAttachment,
  GifItem,
  LinkPreviewData,
  MessageReaction,
  SocialSnapshot,
  VoiceNoteMeta,
} from './types';
import {
  applyAudioOutputDevice,
  createPhoneCallIconSvg,
  createPhoneHangupIconSvg,
  encodePcm16MonoWav,
  getSharedVoiceAudioContext,
} from './voiceAudio';

const MAX_PROCESSED_IMAGE_CHARS = 1_500_000;
const MAX_RAW_PASSTHROUGH_BYTES = 600_000;
const MAX_IMAGE_DIMENSION = 1120;

function openEmojiPicker(options: {
  anchorEl: HTMLElement;
  onSelect: (emoji: string) => void;
  onClose?: () => void;
}): void {
  void import('./emojiPicker').then((mod) => {
    mod.openEmojiPicker(options);
  });
}

let sharedAudioCtx: AudioContext | null = null;
let lastNotificationChimeAt = 0;

function createSvg(
  paths: string[],
  viewBox = '0 0 24 24',
  size = 18,
  className = '',
): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', viewBox);
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
  for (const d of paths) {
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
  }
  return svg;
}

export function createPlusIconSvg(size = 18): SVGSVGElement {
  return createSvg(['M12 5v14', 'M5 12h14'], '0 0 24 24', size);
}

export function createEmojiIconSvg(size = 18): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.9');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');

  const circle = document.createElementNS(ns, 'circle');
  circle.setAttribute('cx', '12');
  circle.setAttribute('cy', '12');
  circle.setAttribute('r', '9.2');
  svg.appendChild(circle);

  const eyeL = document.createElementNS(ns, 'circle');
  eyeL.setAttribute('cx', '9');
  eyeL.setAttribute('cy', '10');
  eyeL.setAttribute('r', '1');
  eyeL.setAttribute('fill', 'currentColor');
  eyeL.setAttribute('stroke', 'none');
  svg.appendChild(eyeL);

  const eyeR = document.createElementNS(ns, 'circle');
  eyeR.setAttribute('cx', '15');
  eyeR.setAttribute('cy', '10');
  eyeR.setAttribute('r', '1');
  eyeR.setAttribute('fill', 'currentColor');
  eyeR.setAttribute('stroke', 'none');
  svg.appendChild(eyeR);

  const smile = document.createElementNS(ns, 'path');
  smile.setAttribute('d', 'M8.5 14.3a4.2 4.2 0 0 0 7 0');
  svg.appendChild(smile);

  return svg;
}

export function createGifIconSvg(size = 20): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');

  const rect = document.createElementNS(ns, 'rect');
  rect.setAttribute('x', '2');
  rect.setAttribute('y', '4.2');
  rect.setAttribute('width', '20');
  rect.setAttribute('height', '15.6');
  rect.setAttribute('rx', '3.5');
  rect.setAttribute('fill', 'currentColor');
  svg.appendChild(rect);

  const label = document.createElementNS(ns, 'text');
  label.setAttribute('x', '12');
  label.setAttribute('y', '14.9');
  label.setAttribute('text-anchor', 'middle');
  label.setAttribute('fill', '#1f2128');
  label.setAttribute('font-size', '8.2');
  label.setAttribute('font-weight', '800');
  label.setAttribute('font-family', 'system-ui, -apple-system, sans-serif');
  label.setAttribute('letter-spacing', '0.3');
  label.textContent = 'GIF';
  svg.appendChild(label);

  return svg;
}

export function createFavoriteStarSvg(filled: boolean, size = 14): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', filled ? 'currentColor' : 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');

  const star = document.createElementNS(ns, 'polygon');
  star.setAttribute(
    'points',
    '12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2',
  );
  svg.appendChild(star);
  return svg;
}

export function createEditPencilSvg(size = 15): SVGSVGElement {
  return createSvg(
    [
      'M12 20h9',
      'M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z',
    ],
    '0 0 24 24',
    size,
  );
}

export function createReplyArrowSvg(size = 16): SVGSVGElement {
  return createSvg(
    ['M9 14L4 9l5-5', 'M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11'],
    '0 0 24 24',
    size,
  );
}

/** Reverse reply arrow pointing right, used for Forward Message buttons and forwarded headers. */
export function createForwardArrowSvg(size = 16): SVGSVGElement {
  return createSvg(
    ['M15 14l5-5-5-5', 'M20 9H9.5a5.5 5.5 0 0 0-5.5 5.5v0A5.5 5.5 0 0 0 9.5 20H13'],
    '0 0 24 24',
    size,
  );
}

export function createSmallImageIconSvg(size = 14): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = createSvg(
    ['M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z', 'M3 16l5-5 4 4 3-3 6 6'],
    '0 0 24 24',
    size,
    'msg-reply-attachment-icon',
  );
  const dot = document.createElementNS(ns, 'circle');
  dot.setAttribute('cx', '15.5');
  dot.setAttribute('cy', '8.5');
  dot.setAttribute('r', '1.4');
  dot.setAttribute('fill', 'currentColor');
  dot.setAttribute('stroke', 'none');
  svg.appendChild(dot);
  return svg;
}

export function createTrashSvg(size = 15): SVGSVGElement {
  return createSvg(
    [
      'M3 6h18',
      'M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2',
      'M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6',
      'M10 11v6',
      'M14 11v6',
    ],
    '0 0 24 24',
    size,
  );
}

export function createCloseIconSvg(size = 14): SVGSVGElement {
  return createSvg(['M18 6L6 18', 'M6 6l12 12'], '0 0 24 24', size);
}

/** Creates a crisp pushpin icon SVG (used in header, hover bar, and pin popover). */
export function createPinIconSvg(size = 16, filled = false): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', filled ? 'currentColor' : 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');

  const body = document.createElementNS(ns, 'path');
  body.setAttribute('d', 'M12 17v5M9 4h6l1 6 2 3H6l2-3 1-6z');
  svg.appendChild(body);
  return svg;
}

/** Creates a settings gear SVG icon. */
export function createSettingsGearSvg(size = 18): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = createSvg(
    [
      'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.86 1 1.51 1H21a2 2 0 0 1 0 4h-.09c-.65 0-1.25.4-1.51 1z',
    ],
    '0 0 24 24',
    size,
  );
  const circle = document.createElementNS(ns, 'circle');
  circle.setAttribute('cx', '12');
  circle.setAttribute('cy', '12');
  circle.setAttribute('r', '3');
  svg.appendChild(circle);
  return svg;
}

/** Creates a dual-person Members List icon SVG for Group DM header. */
export function createMembersIconSvg(size = 18): SVGSVGElement {
  return createSvg(
    [
      'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2',
      'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
      'M23 21v-2a4 4 0 0 0-3-3.87',
      'M16 3.13a4 4 0 0 1 0 7.75',
    ],
    '0 0 24 24',
    size,
  );
}

export function createVideoIconSvg(size = 18): SVGSVGElement {
  return createSvg(
    [
      'M3 7a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z',
      'M16 10l5-3v10l-5-3z',
    ],
    '0 0 24 24',
    size,
  );
}

export function createAudioIconSvg(size = 18): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = createSvg(['M9 18V5l12-2v13'], '0 0 24 24', size);
  const c1 = document.createElementNS(ns, 'circle');
  c1.setAttribute('cx', '6');
  c1.setAttribute('cy', '18');
  c1.setAttribute('r', '3');
  svg.appendChild(c1);
  const c2 = document.createElementNS(ns, 'circle');
  c2.setAttribute('cx', '18');
  c2.setAttribute('cy', '16');
  c2.setAttribute('r', '3');
  svg.appendChild(c2);
  return svg;
}

export function createFileIconSvg(size = 18): SVGSVGElement {
  return createSvg(
    [
      'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z',
      'M14 2v6h6',
    ],
    '0 0 24 24',
    size,
  );
}

export function createDownloadIconSvg(size = 16): SVGSVGElement {
  return createSvg(
    ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M7 10l5 5 5-5', 'M12 15V3'],
    '0 0 24 24',
    size,
  );
}

export function createNewMessagesDivider(): HTMLDivElement {
  const wrap = document.createElement('div');
  wrap.className = 'dm-unread-divider';
  wrap.setAttribute('role', 'separator');
  wrap.setAttribute('aria-label', 'New messages');

  const line = document.createElement('span');
  line.className = 'dm-unread-line';
  wrap.appendChild(line);

  const pill = document.createElement('span');
  pill.className = 'dm-unread-pill';
  pill.textContent = 'NEW MESSAGES';
  wrap.appendChild(pill);

  const rightLine = document.createElement('span');
  rightLine.className = 'dm-unread-line dm-unread-line--short';
  wrap.appendChild(rightLine);

  return wrap;
}

/** Creates a Discord-style horizontal calendar date divider between days in chat history. */
export function createDateDivider(timestamp: number): HTMLDivElement {
  const labelText = new Date(timestamp).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const wrap = document.createElement('div');
  wrap.className = 'dm-date-divider';
  wrap.setAttribute('role', 'separator');
  wrap.setAttribute('aria-label', labelText);

  const leftLine = document.createElement('span');
  leftLine.className = 'dm-date-line';
  const label = document.createElement('span');
  label.className = 'dm-date-label';
  label.textContent = labelText;
  const rightLine = document.createElement('span');
  rightLine.className = 'dm-date-line';

  wrap.appendChild(leftLine);
  wrap.appendChild(label);
  wrap.appendChild(rightLine);
  return wrap;
}

export function insertTextAtCursor(textarea: HTMLTextAreaElement, text: string): void {
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? textarea.value.length;
  const nextVal = textarea.value.slice(0, start) + text + textarea.value.slice(end);
  textarea.value = nextVal;
  const nextPos = start + text.length;
  textarea.setSelectionRange(nextPos, nextPos);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.focus();
}

function schedulePingNote(
  ctx: AudioContext,
  destination: AudioNode,
  startAt: number,
  freq: number,
  peakGain: number,
  decaySeconds: number,
): void {
  const bodyOsc = ctx.createOscillator();
  const bodyGain = ctx.createGain();
  bodyOsc.type = 'sine';
  bodyOsc.frequency.setValueAtTime(freq * 1.03, startAt);
  bodyOsc.frequency.exponentialRampToValueAtTime(freq, startAt + 0.015);

  bodyGain.gain.setValueAtTime(0.0001, startAt);
  bodyGain.gain.linearRampToValueAtTime(peakGain, startAt + 0.004);
  bodyGain.gain.exponentialRampToValueAtTime(peakGain * 0.34, startAt + decaySeconds * 0.32);
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, startAt + decaySeconds);

  bodyOsc.connect(bodyGain);
  bodyGain.connect(destination);
  bodyOsc.start(startAt);
  bodyOsc.stop(startAt + decaySeconds + 0.02);

  // Crisp upper bell harmonic so the ping cuts clearly through music or voice.
  const harmonicOsc = ctx.createOscillator();
  const harmonicGain = ctx.createGain();
  harmonicOsc.type = 'triangle';
  harmonicOsc.frequency.setValueAtTime(freq * 2, startAt);

  harmonicGain.gain.setValueAtTime(0.0001, startAt);
  harmonicGain.gain.linearRampToValueAtTime(peakGain * 0.36, startAt + 0.003);
  harmonicGain.gain.exponentialRampToValueAtTime(0.0001, startAt + decaySeconds * 0.45);

  harmonicOsc.connect(harmonicGain);
  harmonicGain.connect(destination);
  harmonicOsc.start(startAt);
  harmonicOsc.stop(startAt + decaySeconds * 0.48 + 0.02);
}

function scheduleAlertPing(ctx: AudioContext): void {
  const masterGain = ctx.createGain();
  masterGain.gain.value = 0.92;
  masterGain.connect(ctx.destination);

  const t0 = ctx.currentTime + 0.005;
  // Two-tone signature ping ("ba-DING!"): snappy G5 tap followed by bright ringing D6 bell.
  schedulePingNote(ctx, masterGain, t0, 783.99, 0.21, 0.11);
  schedulePingNote(ctx, masterGain, t0 + 0.072, 1174.66, 0.27, 0.32);
}

export function playNotificationChime(force = false): void {
  if (!force && !getUserPreferences().notificationSound) {
    return;
  }
  const nowMs = Date.now();
  if (!force && nowMs - lastNotificationChimeAt < 160) {
    return;
  }
  lastNotificationChimeAt = nowMs;

  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) {
      return;
    }
    if (!sharedAudioCtx) {
      sharedAudioCtx = new Ctor();
    }
    const ctx = sharedAudioCtx;
    if (ctx.state === 'suspended') {
      void ctx
        .resume()
        .then(() => {
          scheduleAlertPing(ctx);
        })
        .catch(() => {
          // Ignore autoplay restriction errors silently.
        });
      return;
    }

    scheduleAlertPing(ctx);
  } catch {
    // Ignore autoplay or Web Audio restrictions quietly.
  }
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Could not read image'));
      }
    };
    reader.onerror = () => reject(new Error('Could not read image'));
    reader.readAsDataURL(blob);
  });
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Invalid image file'));
    img.src = src;
  });
}

export async function prepareChatImageDataUrl(
  file: File,
): Promise<{ ok: true; dataUrl: string } | { ok: false; error: string }> {
  if (!file.type.startsWith('image/')) {
    return { ok: false, error: 'Error: Only image files can be attached' };
  }
  if (file.size > 15 * 1024 * 1024) {
    return { ok: false, error: 'Error: Image must be under 15 MB' };
  }

  let rawDataUrl: string;
  try {
    rawDataUrl = await readBlobAsDataUrl(file);
  } catch {
    return { ok: false, error: 'Error: Could not read image file' };
  }

  if (
    file.size <= MAX_RAW_PASSTHROUGH_BYTES &&
    rawDataUrl.length <= MAX_PROCESSED_IMAGE_CHARS
  ) {
    return { ok: true, dataUrl: rawDataUrl };
  }

  try {
    const img = await loadImageElement(rawDataUrl);
    const maxSide = Math.max(img.naturalWidth || 1, img.naturalHeight || 1);
    const scale = maxSide > MAX_IMAGE_DIMENSION ? MAX_IMAGE_DIMENSION / maxSide : 1;
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return { ok: false, error: 'Error: Could not process attached image' };
    }
    ctx.drawImage(img, 0, 0, width, height);

    let out = canvas.toDataURL('image/webp', 0.86);
    if (!out.startsWith('data:image/webp') || out.length > MAX_PROCESSED_IMAGE_CHARS) {
      out = canvas.toDataURL('image/jpeg', 0.86);
    }
    if (out.length > MAX_PROCESSED_IMAGE_CHARS) {
      out = canvas.toDataURL('image/jpeg', 0.68);
    }
    if (out.length > MAX_PROCESSED_IMAGE_CHARS) {
      return { ok: false, error: 'Error: Attached image is too large' };
    }
    return { ok: true, dataUrl: out };
  } catch {
    return { ok: false, error: 'Error: Could not decode image file' };
  }
}

export function openImageLightbox(
  imageSrc: string,
  altText = 'Attached image',
  opts?: { isVideo?: boolean; playbackSpeed?: number },
): void {
  const resolvedSrc = resolveMediaUrl(imageSrc);
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop modal-backdrop--deep';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-label', altText);

  const card = document.createElement('div');
  card.className = 'modal-card modal-card--image';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'modal-image-close';
  closeBtn.setAttribute('aria-label', 'Close image preview');
  closeBtn.appendChild(createCloseIconSvg(16));
  card.appendChild(closeBtn);

  if (opts?.isVideo || /\.(webm|mp4|m4v|mov|ogv)(\?|$)/i.test(resolvedSrc)) {
    const vid = document.createElement('video');
    vid.className = 'modal-image-full';
    vid.src = resolvedSrc;
    vid.autoplay = true;
    vid.loop = true;
    vid.muted = true;
    vid.playsInline = true;
    vid.controls = true;
    if (opts?.playbackSpeed && opts.playbackSpeed !== 1) {
      vid.playbackRate = opts.playbackSpeed;
      vid.addEventListener('loadedmetadata', () => {
        vid.playbackRate = opts.playbackSpeed ?? 1;
      });
    }
    card.appendChild(vid);
  } else {
    const img = document.createElement('img');
    img.className = 'modal-image-full';
    img.src = resolvedSrc;
    img.alt = altText;
    img.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const lightboxItems: ContextMenuItem[] = [
        {
          label: 'Copy Image',
          icon: 'copy',
          onSelect: () => {
            void copyImageToClipboard(resolvedSrc);
          },
        },
      ];
      if (!resolvedSrc.startsWith('blob:') && !resolvedSrc.startsWith('data:')) {
        lightboxItems.push({
          label: 'Copy Image URL',
          icon: 'link',
          onSelect: () => {
            void copyToClipboard(new URL(resolvedSrc, window.location.origin).href);
          },
        });
      }
      if (!resolvedSrc.startsWith('blob:')) {
        lightboxItems.push({
          label: 'Download Image',
          icon: 'download',
          onSelect: () => {
            const href = resolvedSrc.includes('/api/uploads/')
              ? `${resolvedSrc}?download=1`
              : resolvedSrc;
            triggerDownload(href, altText || 'image.png');
          },
        });
      }
      openContextMenu({
        clientX: e.clientX,
        clientY: e.clientY,
        minWidth: 186,
        items: lightboxItems,
      });
    });
    card.appendChild(img);
  }

  backdrop.appendChild(card);
  document.body.appendChild(backdrop);

  const close = () => {
    document.removeEventListener('keydown', onKeyDown);
    backdrop.classList.remove('modal-backdrop--visible');
    window.setTimeout(() => backdrop.remove(), 160);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };

  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) {
      close();
    }
  });
  document.addEventListener('keydown', onKeyDown);

  requestAnimationFrame(() => backdrop.classList.add('modal-backdrop--visible'));
}

const linkPreviewCache = new Map<string, LinkPreviewData | null>();
const inflightLinkPreviews = new Map<string, Promise<LinkPreviewData | null>>();

function loadLinkPreviewOnce(url: string): Promise<LinkPreviewData | null> {
  if (linkPreviewCache.has(url)) {
    return Promise.resolve(linkPreviewCache.get(url) ?? null);
  }
  const existing = inflightLinkPreviews.get(url);
  if (existing) {
    return existing;
  }
  const req = apiFetchLinkPreview(url)
    .then((res) => {
      const value = res.ok && res.preview ? res.preview : null;
      linkPreviewCache.set(url, value);
      return value;
    })
    .finally(() => {
      inflightLinkPreviews.delete(url);
    });
  inflightLinkPreviews.set(url, req);
  return req;
}

function buildLinkEmbedCard(preview: LinkPreviewData): HTMLAnchorElement {
  const card = document.createElement('a');
  card.className = 'msg-link-embed';
  card.href = preview.url;
  card.target = '_blank';
  card.rel = 'noopener noreferrer';

  const textCol = document.createElement('div');
  textCol.className = 'msg-link-embed-text';

  if (preview.siteName) {
    const site = document.createElement('div');
    site.className = 'msg-link-embed-site';
    site.textContent = preview.siteName;
    textCol.appendChild(site);
  }

  const title = document.createElement('div');
  title.className = 'msg-link-embed-title';
  title.textContent = preview.title;
  textCol.appendChild(title);

  if (preview.description) {
    const desc = document.createElement('div');
    desc.className = 'msg-link-embed-desc';
    desc.textContent = preview.description;
    textCol.appendChild(desc);
  }

  card.appendChild(textCol);

  if (preview.imageUrl) {
    const thumb = document.createElement('img');
    thumb.className = 'msg-link-embed-thumb';
    thumb.src = preview.imageUrl;
    thumb.alt = preview.title;
    thumb.loading = 'lazy';
    card.appendChild(thumb);
  }

  return card;
}

export interface CreateMessageOptions {
  message: ChatMessage;
  isGrouped: boolean;
  isOwn: boolean;
  selfUsernameLower: string;
  isEditing: boolean;
  resolveAvatar: (profile: { avatarPreset: number | null; avatarDataUrl?: string }) => string;
  formatFullTime: (ts: number) => string;
  onReply: (msg: ChatMessage) => void;
  onForward?: (msg: ChatMessage) => void;
  onJumpToMessage?: (messageId: string) => void;
  onOpenPinnedMessages?: () => void;
  onJoinCall?: (msg: ChatMessage) => void;
  isCallJoined?: boolean;
  onStartEdit: (msg: ChatMessage) => void;
  onCancelEdit: () => void;
  onSaveEdit: (msg: ChatMessage, nextContent: string) => Promise<void>;
  onDelete: (msg: ChatMessage) => Promise<void>;
  onTogglePin?: (msg: ChatMessage) => Promise<void>;
  onToggleSpoiler?: (msg: ChatMessage, attachmentId: string, nextSpoiler: boolean) => Promise<void>;
  onToggleReaction: (msg: ChatMessage, emoji: string) => Promise<void>;
  isGifFavorited?: (url: string) => boolean;
  onToggleFavoriteGif?: (gif: GifItem) => void;
  receiptStatus?: { kind: 'delivered' | 'seen'; label: string } | null;
}

function formatAudioSeconds(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '0:00';
  }
  const whole = Math.floor(seconds);
  const mins = Math.floor(whole / 60);
  const secs = whole % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function createVoicePlaySvg(size = 14): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');
  const poly = document.createElementNS(ns, 'polygon');
  poly.setAttribute('points', '6 4 20 12 6 20 6 4');
  svg.appendChild(poly);
  return svg;
}

function createVoicePauseSvg(size = 14): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');
  const r1 = document.createElementNS(ns, 'rect');
  r1.setAttribute('x', '6');
  r1.setAttribute('y', '4');
  r1.setAttribute('width', '4');
  r1.setAttribute('height', '16');
  const r2 = document.createElementNS(ns, 'rect');
  r2.setAttribute('x', '14');
  r2.setAttribute('y', '4');
  r2.setAttribute('width', '4');
  r2.setAttribute('height', '16');
  svg.appendChild(r1);
  svg.appendChild(r2);
  return svg;
}

const voiceDecodedCache = new Map<string, AudioBuffer>();
const voiceDecodeInflight = new Map<string, Promise<AudioBuffer>>();
const voiceSavedOffsetByUrl = new Map<string, number>();

interface ActiveVoicePlayback {
  url: string;
  buffer: AudioBuffer | null;
  fallbackAudio: HTMLAudioElement | null;
  ctx: AudioContext | null;
  ownsCtx: boolean;
  source: AudioBufferSourceNode | null;
  destStreamNode: MediaStreamAudioDestinationNode | null;
  sinkAudioEl: HTMLAudioElement | null;
  playing: boolean;
  loading: boolean;
  errorText: string | null;
  errorDetail: string | null;
  offsetSec: number;
  startedAtCtxTime: number;
  rate: 1 | 1.5 | 2;
  durationSec: number;
  tickId: number | null;
}

let activeVoicePlayback: ActiveVoicePlayback | null = null;
const voiceListenersByUrl = new Map<string, Set<() => void>>();

function notifyVoiceUrlListeners(url: string): void {
  const set = voiceListenersByUrl.get(url);
  if (!set) {
    return;
  }
  for (const fn of Array.from(set)) {
    fn();
  }
}

function stopCurrentVoiceSource(vp: ActiveVoicePlayback): void {
  if (vp.source) {
    try {
      vp.source.onended = null;
      vp.source.stop();
      vp.source.disconnect();
    } catch {
      // Ignore already stopped source.
    }
    vp.source = null;
  }
  if (vp.sinkAudioEl) {
    try {
      vp.sinkAudioEl.pause();
      vp.sinkAudioEl.srcObject = null;
      vp.sinkAudioEl.remove();
    } catch {
      // Ignore cleanup errors.
    }
    vp.sinkAudioEl = null;
  }
  if (vp.destStreamNode) {
    try {
      vp.destStreamNode.disconnect();
    } catch {
      // Ignore disconnect errors.
    }
    vp.destStreamNode = null;
  }
  if (vp.fallbackAudio) {
    try {
      vp.fallbackAudio.pause();
    } catch {
      // Ignore pause errors.
    }
  }
  if (vp.tickId !== null) {
    window.clearInterval(vp.tickId);
    vp.tickId = null;
  }
}

function getVoicePlaybackPosition(url: string, fallbackDuration: number): {
  currentSec: number;
  durationSec: number;
  playing: boolean;
  loading: boolean;
  errorText: string | null;
  errorDetail: string | null;
  rate: 1 | 1.5 | 2;
} {
  if (!activeVoicePlayback || activeVoicePlayback.url !== url) {
    const cachedBuf = voiceDecodedCache.get(url);
    const savedOffset = voiceSavedOffsetByUrl.get(url) ?? 0;
    const dur = cachedBuf && Number.isFinite(cachedBuf.duration) && cachedBuf.duration > 0
      ? cachedBuf.duration
      : fallbackDuration;
    return {
      currentSec: Math.min(dur, Math.max(0, savedOffset)),
      durationSec: dur,
      playing: false,
      loading: false,
      errorText: null,
      errorDetail: null,
      rate: 1,
    };
  }
  const vp = activeVoicePlayback;
  let cur = vp.offsetSec;
  if (vp.playing) {
    if (vp.fallbackAudio) {
      cur = vp.fallbackAudio.currentTime || 0;
    } else if (vp.ctx) {
      cur = vp.offsetSec + Math.max(0, vp.ctx.currentTime - vp.startedAtCtxTime) * vp.rate;
    }
  }
  const dur = vp.buffer && vp.buffer.duration > 0 ? vp.buffer.duration : vp.durationSec;
  return {
    currentSec: Math.min(dur, Math.max(0, cur)),
    durationSec: dur,
    playing: vp.playing,
    loading: vp.loading,
    errorText: vp.errorText,
    errorDetail: vp.errorDetail,
    rate: vp.rate,
  };
}

function pauseActiveVoicePlayback(savePosition = true): void {
  const vp = activeVoicePlayback;
  if (!vp) {
    return;
  }
  const pos = getVoicePlaybackPosition(vp.url, vp.durationSec);
  const url = vp.url;
  vp.offsetSec = pos.currentSec;
  vp.playing = false;
  vp.loading = false;
  if (savePosition) {
    voiceSavedOffsetByUrl.set(url, pos.currentSec);
  }
  stopCurrentVoiceSource(vp);
  notifyVoiceUrlListeners(url);
}

function buildWavTranscodeUrl(url: string): string | null {
  if (!url.includes('/api/uploads/') || url.includes('format=wav')) {
    return null;
  }
  return `${url}${url.includes('?') ? '&' : '?'}format=wav`;
}

async function fetchAndDecodeAudio(targetUrl: string, ctx: AudioContext): Promise<AudioBuffer> {
  const res = await fetch(targetUrl);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const rawBuf = await res.arrayBuffer();
  return await ctx.decodeAudioData(rawBuf.slice(0));
}

async function loadDecodedVoiceBuffer(url: string, ctx: AudioContext): Promise<AudioBuffer> {
  const existing = voiceDecodedCache.get(url);
  if (existing) {
    return existing;
  }
  const inflight = voiceDecodeInflight.get(url);
  if (inflight) {
    return inflight;
  }
  const promise = (async () => {
    try {
      const decoded = await fetchAndDecodeAudio(url, ctx);
      voiceDecodedCache.set(url, decoded);
      return decoded;
    } catch (primaryErr) {
      const wavFallbackUrl = buildWavTranscodeUrl(url);
      if (wavFallbackUrl) {
        try {
          const decoded = await fetchAndDecodeAudio(wavFallbackUrl, ctx);
          voiceDecodedCache.set(url, decoded);
          return decoded;
        } catch {
          // Preserve original error if WAV transcode unavailable or failed.
        }
      }
      throw primaryErr;
    }
  })();
  voiceDecodeInflight.set(url, promise);
  try {
    return await promise;
  } finally {
    if (voiceDecodeInflight.get(url) === promise) {
      voiceDecodeInflight.delete(url);
    }
  }
}

function startWebAudioBufferFromOffset(vp: ActiveVoicePlayback, startOffset: number): void {
  if (!vp.ctx || !vp.buffer) {
    return;
  }
  stopCurrentVoiceSource(vp);

  const dur = Math.max(0.05, vp.buffer.duration);
  const clampedStart = startOffset >= dur - 0.03 ? 0 : Math.max(0, startOffset);
  const src = vp.ctx.createBufferSource();
  src.buffer = vp.buffer;
  src.playbackRate.value = vp.rate;

  const outDeviceId = getUserPreferences().voiceOutputDeviceId;
  const ctxWithSink = vp.ctx as AudioContext & {
    sinkId?: string;
    setSinkId?: (id: string) => Promise<void>;
  };
  if (
    outDeviceId &&
    outDeviceId !== 'default' &&
    typeof ctxWithSink.setSinkId === 'function'
  ) {
    if ((ctxWithSink.sinkId ?? '') !== outDeviceId) {
      void ctxWithSink.setSinkId(outDeviceId).catch(() => {});
    }
    src.connect(vp.ctx.destination);
  } else if (
    outDeviceId &&
    outDeviceId !== 'default' &&
    typeof vp.ctx.createMediaStreamDestination === 'function'
  ) {
    const dest = vp.ctx.createMediaStreamDestination();
    src.connect(dest);
    const outEl = document.createElement('audio') as HTMLAudioElement & { playsInline?: boolean };
    outEl.autoplay = true;
    outEl.playsInline = true;
    outEl.hidden = true;
    outEl.srcObject = dest.stream;
    document.body.appendChild(outEl);
    applyAudioOutputDevice(outEl, outDeviceId);
    void outEl.play().catch(() => {});
    vp.destStreamNode = dest;
    vp.sinkAudioEl = outEl;
  } else {
    src.connect(vp.ctx.destination);
  }

  vp.source = src;
  vp.offsetSec = clampedStart;
  vp.durationSec = dur;
  vp.startedAtCtxTime = vp.ctx.currentTime;
  vp.playing = true;
  vp.loading = false;
  vp.errorText = null;
  vp.errorDetail = null;
  voiceSavedOffsetByUrl.set(vp.url, clampedStart);

  src.onended = () => {
    if (!activeVoicePlayback || activeVoicePlayback !== vp || vp.source !== src) {
      return;
    }
    vp.playing = false;
    vp.offsetSec = 0;
    voiceSavedOffsetByUrl.set(vp.url, 0);
    stopCurrentVoiceSource(vp);
    notifyVoiceUrlListeners(vp.url);
  };

  src.start(0, clampedStart);
  vp.tickId = window.setInterval(() => {
    if (!activeVoicePlayback || activeVoicePlayback !== vp || !vp.playing) {
      return;
    }
    notifyVoiceUrlListeners(vp.url);
  }, 60);
  notifyVoiceUrlListeners(vp.url);
}

function encodeAudioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numSamples = buffer.length;
  const ch0 = buffer.getChannelData(0);
  if (buffer.numberOfChannels <= 1) {
    return encodePcm16MonoWav(ch0, buffer.sampleRate);
  }
  const ch1 = buffer.getChannelData(1);
  const mono = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i += 1) {
    mono[i] = (ch0[i] + ch1[i]) * 0.5;
  }
  return encodePcm16MonoWav(mono, buffer.sampleRate);
}

function cleanupFallbackAudio(vp: ActiveVoicePlayback): void {
  if (vp.fallbackAudio) {
    try {
      vp.fallbackAudio.pause();
      if (vp.fallbackAudio.src.startsWith('blob:')) {
        URL.revokeObjectURL(vp.fallbackAudio.src);
        vp.fallbackAudio.removeAttribute('src');
        vp.fallbackAudio.load();
      }
      vp.fallbackAudio.remove();
    } catch {
      // Ignore cleanup errors.
    }
    vp.fallbackAudio = null;
  }
}

function closeOwnedContextIfAny(vp: ActiveVoicePlayback): void {
  if (vp.ownsCtx && vp.ctx) {
    try {
      void vp.ctx.close().catch(() => {});
    } catch {
      // Ignore close error.
    }
    vp.ctx = null;
    vp.ownsCtx = false;
  }
}

async function startOrResumeVoicePlayback(
  url: string,
  fallbackDuration: number,
  rate: 1 | 1.5 | 2,
  explicitOffset?: number,
): Promise<void> {
  if (activeVoicePlayback && activeVoicePlayback.url !== url) {
    pauseActiveVoicePlayback(true);
    cleanupFallbackAudio(activeVoicePlayback);
    closeOwnedContextIfAny(activeVoicePlayback);
    activeVoicePlayback = null;
  }

  const startAt =
    typeof explicitOffset === 'number'
      ? explicitOffset
      : activeVoicePlayback?.url === url
        ? activeVoicePlayback.offsetSec
        : voiceSavedOffsetByUrl.get(url) ?? 0;

  let ctx = getSharedVoiceAudioContext();
  const vp: ActiveVoicePlayback =
    activeVoicePlayback && activeVoicePlayback.url === url
      ? activeVoicePlayback
      : {
          url,
          buffer: voiceDecodedCache.get(url) ?? null,
          fallbackAudio: null,
          ctx,
          ownsCtx: false,
          source: null,
          destStreamNode: null,
          sinkAudioEl: null,
          playing: false,
          loading: false,
          errorText: null,
          errorDetail: null,
          offsetSec: startAt,
          startedAtCtxTime: 0,
          rate,
          durationSec: fallbackDuration,
          tickId: null,
        };

  if (!vp.ownsCtx) {
    vp.ctx = ctx;
  } else {
    ctx = vp.ctx;
  }
  vp.rate = rate;
  vp.errorText = null;
  vp.errorDetail = null;
  activeVoicePlayback = vp;

  let webAudioErr: unknown = null;
  const tryPlayWithContext = async (targetCtx: AudioContext) => {
    if (targetCtx.state === 'suspended') {
      await targetCtx.resume();
    }
    if (activeVoicePlayback !== vp) {
      return;
    }
    if (!vp.buffer) {
      vp.loading = true;
      notifyVoiceUrlListeners(url);
      vp.buffer = await loadDecodedVoiceBuffer(url, targetCtx);
      if (activeVoicePlayback !== vp) {
        return;
      }
    }
    vp.ctx = targetCtx;
    startWebAudioBufferFromOffset(vp, startAt);
  };

  if (ctx) {
    try {
      await tryPlayWithContext(ctx);
      return;
    } catch (err) {
      webAudioErr = err;
      vp.loading = false;
    }
  }

  // Retry once with a dedicated fresh AudioContext in case shared AudioContext was wedged.
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor) {
      closeOwnedContextIfAny(vp);
      const freshCtx = new Ctor();
      vp.ownsCtx = true;
      vp.ctx = freshCtx;
      await tryPlayWithContext(freshCtx);
      return;
    }
  } catch (err) {
    webAudioErr = err;
    vp.loading = false;
    closeOwnedContextIfAny(vp);
  }

  // Fallback path using HTMLAudioElement (preferring decoded PCM WAV blob or server ?format=wav).
  try {
    const resolveFallbackSrc = () => {
      if (vp.buffer) {
        return URL.createObjectURL(encodeAudioBufferToWavBlob(vp.buffer));
      }
      return buildWavTranscodeUrl(url) ?? url;
    };
    const audio = vp.fallbackAudio ?? document.createElement('audio');
    if (!vp.fallbackAudio) {
      audio.preload = 'auto';
      audio.hidden = true;
      audio.src = resolveFallbackSrc();
      document.body.appendChild(audio);
      applyAudioOutputDevice(audio, getUserPreferences().voiceOutputDeviceId);
      audio.addEventListener('ended', () => {
        if (activeVoicePlayback !== vp) {
          return;
        }
        vp.playing = false;
        vp.offsetSec = 0;
        voiceSavedOffsetByUrl.set(vp.url, 0);
        stopCurrentVoiceSource(vp);
        notifyVoiceUrlListeners(vp.url);
      });
      vp.fallbackAudio = audio;
    } else if (audio.error || (vp.buffer && !audio.src.startsWith('blob:'))) {
      const nextSrc = resolveFallbackSrc();
      if (audio.src.startsWith('blob:')) {
        URL.revokeObjectURL(audio.src);
      }
      audio.src = nextSrc;
      audio.load();
    }
    audio.playbackRate = rate;
    if (startAt > 0 && Number.isFinite(audio.duration) && startAt < audio.duration) {
      audio.currentTime = startAt;
    }
    vp.playing = true;
    await audio.play();
    vp.tickId = window.setInterval(() => notifyVoiceUrlListeners(url), 60);
    notifyVoiceUrlListeners(url);
  } catch (htmlErr) {
    vp.playing = false;
    vp.loading = false;
    const formatErr = (e: unknown): string => {
      if (e instanceof Error) {
        return e.message ? `${e.name}: ${e.message}` : e.name;
      }
      return String(e ?? 'Unknown error');
    };
    const waText = webAudioErr ? formatErr(webAudioErr) : 'none';
    const haText = formatErr(htmlErr);
    vp.errorDetail = `WebAudio(${waText}) | Audio(${haText})`;
    const primaryMsg = webAudioErr ? waText : haText;
    vp.errorText = primaryMsg.length > 42 ? `${primaryMsg.slice(0, 39)}...` : primaryMsg;
    console.error('[Redshift VoiceNote Playback Failed]', { url, webAudioErr, htmlErr });
    notifyVoiceUrlListeners(url);
  }
}

function createVoiceNotePlayerCard(
  att: DmAttachment,
  voiceMeta: VoiceNoteMeta,
  downloadHref: string,
): HTMLDivElement {
  const fallbackDur = Math.max(0.5, Number(voiceMeta.durationSec) || 1);
  const barsSource =
    Array.isArray(voiceMeta.waveform) && voiceMeta.waveform.length > 0
      ? voiceMeta.waveform
      : new Array(28).fill(0.32);

  const card = document.createElement('div');
  card.className = 'msg-voice-note-card';

  const playBtn = document.createElement('button');
  playBtn.type = 'button';
  playBtn.className = 'msg-voice-play-btn';
  playBtn.title = 'Play voice message';
  playBtn.setAttribute('aria-label', 'Play voice message');
  playBtn.appendChild(createVoicePlaySvg(15));

  const waveWrap = document.createElement('div');
  waveWrap.className = 'msg-voice-waveform';
  waveWrap.setAttribute('role', 'slider');
  waveWrap.setAttribute('aria-label', 'Voice message seek');
  waveWrap.setAttribute('aria-valuemin', '0');
  waveWrap.setAttribute('aria-valuemax', '100');
  waveWrap.setAttribute('aria-valuenow', '0');

  const barEls: HTMLSpanElement[] = [];
  for (const sample of barsSource) {
    const amp = Math.min(1, Math.max(0.08, Number(sample) || 0.1));
    const bar = document.createElement('span');
    bar.className = 'msg-voice-bar';
    bar.style.height = `${Math.round(amp * 100)}%`;
    waveWrap.appendChild(bar);
    barEls.push(bar);
  }

  const metaRight = document.createElement('div');
  metaRight.className = 'msg-voice-meta';

  const timeEl = document.createElement('span');
  timeEl.className = 'msg-voice-time';

  const speedSteps: Array<1 | 1.5 | 2> = [1, 1.5, 2];
  let speedIdx =
    activeVoicePlayback && activeVoicePlayback.url === att.url
      ? Math.max(0, speedSteps.indexOf(activeVoicePlayback.rate))
      : 0;
  const speedBtn = document.createElement('button');
  speedBtn.type = 'button';
  speedBtn.className = 'msg-voice-speed-btn';
  speedBtn.textContent = `${speedSteps[speedIdx]}x`;
  speedBtn.title = 'Change playback speed';

  let mounted = false;
  let listeners = voiceListenersByUrl.get(att.url);
  if (!listeners) {
    listeners = new Set();
    voiceListenersByUrl.set(att.url, listeners);
  }

  const syncUi = () => {
    if (card.isConnected) {
      mounted = true;
    } else if (mounted) {
      listeners?.delete(syncUi);
      return;
    }

    const snap = getVoicePlaybackPosition(att.url, fallbackDur);
    const pct = snap.durationSec > 0 ? snap.currentSec / snap.durationSec : 0;

    playBtn.replaceChildren(snap.playing ? createVoicePauseSvg(15) : createVoicePlaySvg(15));
    playBtn.title = snap.playing ? 'Pause voice message' : 'Play voice message';
    playBtn.setAttribute('aria-label', playBtn.title);
    card.classList.toggle('msg-voice-note-card--playing', snap.playing);

    if (snap.errorText) {
      timeEl.textContent = snap.errorText;
      timeEl.classList.add('msg-voice-time--error');
      timeEl.title = snap.errorDetail ?? snap.errorText;
    } else if (snap.loading) {
      timeEl.textContent = 'Loading...';
      timeEl.classList.remove('msg-voice-time--error');
      timeEl.title = '';
    } else if (snap.playing || snap.currentSec > 0.05) {
      timeEl.textContent = `${formatAudioSeconds(snap.currentSec)} / ${formatAudioSeconds(snap.durationSec)}`;
      timeEl.classList.remove('msg-voice-time--error');
      timeEl.title = '';
    } else {
      timeEl.textContent = formatAudioSeconds(snap.durationSec);
      timeEl.classList.remove('msg-voice-time--error');
      timeEl.title = '';
    }

    const activeCount = Math.round(pct * barEls.length);
    barEls.forEach((b, idx) => {
      b.classList.toggle('msg-voice-bar--played', idx < activeCount);
    });
    waveWrap.setAttribute('aria-valuenow', String(Math.round(pct * 100)));
  };

  listeners.add(syncUi);

  playBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const isPlayingThis = Boolean(
      activeVoicePlayback && activeVoicePlayback.url === att.url && activeVoicePlayback.playing,
    );
    if (isPlayingThis) {
      pauseActiveVoicePlayback(true);
    } else {
      void startOrResumeVoicePlayback(att.url, fallbackDur, speedSteps[speedIdx]);
    }
  });

  speedBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    speedIdx = (speedIdx + 1) % speedSteps.length;
    const nextRate = speedSteps[speedIdx];
    speedBtn.textContent = `${nextRate}x`;
    if (activeVoicePlayback && activeVoicePlayback.url === att.url) {
      const curPos = getVoicePlaybackPosition(att.url, fallbackDur).currentSec;
      activeVoicePlayback.rate = nextRate;
      if (activeVoicePlayback.playing) {
        if (activeVoicePlayback.fallbackAudio) {
          activeVoicePlayback.fallbackAudio.playbackRate = nextRate;
        } else if (activeVoicePlayback.buffer) {
          startWebAudioBufferFromOffset(activeVoicePlayback, curPos);
        }
      }
    }
  });

  waveWrap.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = waveWrap.getBoundingClientRect();
    if (rect.width <= 0) {
      return;
    }
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const snap = getVoicePlaybackPosition(att.url, fallbackDur);
    const targetSec = Math.min(snap.durationSec, Math.max(0, ratio * snap.durationSec));
    voiceSavedOffsetByUrl.set(att.url, targetSec);
    if (activeVoicePlayback && activeVoicePlayback.url === att.url) {
      if (activeVoicePlayback.playing) {
        void startOrResumeVoicePlayback(att.url, fallbackDur, speedSteps[speedIdx], targetSec);
      } else {
        activeVoicePlayback.offsetSec = targetSec;
        syncUi();
      }
    } else {
      void startOrResumeVoicePlayback(att.url, fallbackDur, speedSteps[speedIdx], targetSec);
    }
  });

  metaRight.appendChild(timeEl);
  metaRight.appendChild(speedBtn);

  if (!att.url.startsWith('blob:')) {
    const dlBtn = document.createElement('a');
    dlBtn.className = 'msg-media-download';
    dlBtn.href = downloadHref;
    dlBtn.download = att.name;
    dlBtn.title = 'Download voice message';
    dlBtn.setAttribute('aria-label', 'Download voice message');
    dlBtn.appendChild(createDownloadIconSvg(14));
    metaRight.appendChild(dlBtn);
  }

  card.appendChild(playBtn);
  card.appendChild(waveWrap);
  card.appendChild(metaRight);
  syncUi();
  return card;
}

export function formatCallDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 1) {
    return totalSeconds === 1 ? '1 second' : `${totalSeconds} seconds`;
  }

  const MIN_PER_HOUR = 60;
  const MIN_PER_DAY = 60 * 24;
  const MIN_PER_WEEK = 60 * 24 * 7;

  const weeks = Math.floor(totalMinutes / MIN_PER_WEEK);
  let rem = totalMinutes % MIN_PER_WEEK;
  const days = Math.floor(rem / MIN_PER_DAY);
  rem %= MIN_PER_DAY;
  const hours = Math.floor(rem / MIN_PER_HOUR);
  const minutes = rem % MIN_PER_HOUR;

  const parts: string[] = [];
  if (weeks > 0) {
    parts.push(`${weeks} ${weeks === 1 ? 'week' : 'weeks'}`);
  }
  if (days > 0) {
    parts.push(`${days} ${days === 1 ? 'day' : 'days'}`);
  }
  if (hours > 0) {
    parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
  }
  if (minutes > 0 || parts.length === 0) {
    parts.push(`${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`);
  }
  return parts.join(', ');
}

export function formatCallTimestamp(timestamp: number, use24HourTime: boolean): string {
  const d = new Date(timestamp);
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  const datePart = d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
  const timePart = d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: !use24HourTime,
  });
  return `${datePart} at ${timePart}`;
}

function createCallLogMessageElement(
  msg: ChatMessage,
  selfUsernameLower: string,
  onJoinCall?: (msg: ChatMessage) => void,
  isCallJoined = false,
): HTMLDivElement {
  const call = msg.callLog!;
  const prefs = getUserPreferences();
  const isSelfCaller = call.callerUsername.toLowerCase() === selfUsernameLower;
  const callerName = call.callerDisplayName || msg.authorName || call.callerUsername;
  const calledAtText = formatCallTimestamp(call.startedAt || msg.timestamp, prefs.use24HourTime);

  const row = document.createElement('div');
  row.className = `chat-message chat-message--call chat-message--call-${call.status}`;
  row.dataset.msgId = msg.id;

  const card = document.createElement('div');
  card.className = 'chat-call-card';

  const iconCircle = document.createElement('span');
  iconCircle.className = 'chat-call-icon';
  if (call.status === 'ringing') {
    iconCircle.classList.add(
      isSelfCaller || isCallJoined ? 'chat-call-icon--active' : 'chat-call-icon--incoming',
    );
    iconCircle.appendChild(createPhoneCallIconSvg(16));
  } else if (call.status === 'active') {
    iconCircle.classList.add('chat-call-icon--active');
    iconCircle.appendChild(createPhoneCallIconSvg(16));
  } else if (call.status === 'missed') {
    iconCircle.classList.add('chat-call-icon--missed');
    iconCircle.appendChild(createPhoneHangupIconSvg(16));
  } else {
    iconCircle.classList.add('chat-call-icon--ended');
    iconCircle.appendChild(createPhoneCallIconSvg(16));
  }
  card.appendChild(iconCircle);

  const body = document.createElement('div');
  body.className = 'chat-call-body';

  const titleEl = document.createElement('div');
  titleEl.className = 'chat-call-title';

  const subEl = document.createElement('div');
  subEl.className = 'chat-call-sub';

  if (call.status === 'ringing') {
    titleEl.textContent = isSelfCaller ? 'Outgoing call' : isCallJoined ? 'Connected' : 'Incoming call';
    subEl.textContent = isSelfCaller
      ? `Ringing • Called at ${calledAtText}`
      : `${callerName} is calling • Called at ${calledAtText}`;
  } else if (call.status === 'active') {
    titleEl.textContent = isCallJoined ? 'Connected to call' : 'Ongoing call';
    subEl.textContent = `Started by ${isSelfCaller ? 'you' : callerName} • Called at ${calledAtText}`;
  } else if (call.status === 'missed') {
    const missedAtText = formatCallTimestamp(
      call.endedAt ?? call.startedAt ?? msg.timestamp,
      prefs.use24HourTime,
    );
    titleEl.textContent = `Missed call at ${missedAtText}`;
    subEl.textContent = isSelfCaller
      ? `You called at ${calledAtText}`
      : `${callerName} called at ${calledAtText}`;
  } else {
    const durationStr = formatCallDuration(call.durationMs ?? 0);
    titleEl.textContent = `Call ended — ${durationStr}`;
    subEl.textContent = `Called at ${calledAtText} • Started by ${isSelfCaller ? 'you' : callerName}`;
  }

  body.appendChild(titleEl);
  body.appendChild(subEl);
  card.appendChild(body);

  if (call.status === 'ringing' || call.status === 'active') {
    if (isCallJoined) {
      const joinedBadge = document.createElement('span');
      joinedBadge.className = 'chat-call-joined-pill';
      joinedBadge.textContent = isSelfCaller && call.status === 'ringing' ? 'Calling...' : 'In Call';
      card.appendChild(joinedBadge);
    } else if (onJoinCall) {
      const joinBtn = document.createElement('button');
      joinBtn.type = 'button';
      joinBtn.className = 'chat-call-join-btn';
      joinBtn.textContent = 'Join Call';
      joinBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        onJoinCall(msg);
      });
      card.appendChild(joinBtn);
    }
  }

  row.appendChild(card);
  return row;
}

function appendBoldNamesList(container: HTMLElement, names: string[]): void {
  const cleanNames = names.filter((n) => Boolean(n && n.trim()));
  if (cleanNames.length === 0) {
    const strong = document.createElement('strong');
    strong.className = 'chat-system-actor';
    strong.textContent = 'someone';
    container.appendChild(strong);
    return;
  }
  cleanNames.forEach((name, idx) => {
    if (idx > 0) {
      if (cleanNames.length === 2) {
        container.appendChild(document.createTextNode(' and '));
      } else if (idx === cleanNames.length - 1) {
        container.appendChild(document.createTextNode(', and '));
      } else {
        container.appendChild(document.createTextNode(', '));
      }
    }
    const strong = document.createElement('strong');
    strong.className = 'chat-system-actor';
    strong.textContent = name;
    container.appendChild(strong);
  });
}

function createSystemEventMessageElement(
  msg: ChatMessage,
  formatFullTime: (ts: number) => string,
  onJumpToMessage?: (messageId: string) => void,
  onOpenPinnedMessages?: () => void,
): HTMLDivElement {
  const ev = msg.systemEvent!;
  const actorName = ev.actorDisplayName || msg.authorName || ev.actorUsername || 'Someone';

  const row = document.createElement('div');
  row.className = `chat-message chat-message--system chat-message--system-${ev.kind}`;
  row.dataset.msgId = msg.id;
  row.dataset.systemKind = ev.kind;

  const iconWrap = document.createElement('span');
  iconWrap.className = `chat-system-icon chat-system-icon--${ev.kind}`;
  if (ev.kind === 'pin') {
    iconWrap.appendChild(createPinIconSvg(15, true));
  } else if (ev.kind === 'group-add') {
    iconWrap.appendChild(createMenuIconSvg('user-plus', 15));
  } else if (ev.kind === 'group-remove' || ev.kind === 'group-leave') {
    iconWrap.appendChild(createMenuIconSvg('user-minus', 15));
  } else if (ev.kind === 'group-owner') {
    iconWrap.appendChild(createMenuIconSvg('crown', 15));
  }
  row.appendChild(iconWrap);

  const body = document.createElement('div');
  body.className = 'chat-system-body';

  const actorStrong = document.createElement('strong');
  actorStrong.className = 'chat-system-actor';
  actorStrong.textContent = actorName;

  if (ev.kind === 'pin') {
    body.appendChild(actorStrong);
    body.appendChild(document.createTextNode(' pinned '));
    const msgLink = document.createElement('button');
    msgLink.type = 'button';
    msgLink.className = 'chat-system-link';
    msgLink.textContent = 'a message';
    if (ev.pinnedMessageId && onJumpToMessage) {
      msgLink.addEventListener('click', () => onJumpToMessage(ev.pinnedMessageId!));
    } else {
      msgLink.disabled = true;
    }
    body.appendChild(msgLink);
    body.appendChild(document.createTextNode(' to this chat. '));
    if (onOpenPinnedMessages) {
      const seeAllBtn = document.createElement('button');
      seeAllBtn.type = 'button';
      seeAllBtn.className = 'chat-system-link';
      seeAllBtn.textContent = 'See all pinned messages.';
      seeAllBtn.addEventListener('click', () => onOpenPinnedMessages());
      body.appendChild(seeAllBtn);
    }
  } else if (ev.kind === 'group-add') {
    const targetNames =
      ev.targetDisplayNames && ev.targetDisplayNames.length > 0
        ? ev.targetDisplayNames
        : ev.targetUsernames && ev.targetUsernames.length > 0
          ? ev.targetUsernames
          : ev.targetDisplayName
            ? [ev.targetDisplayName]
            : ev.targetUsername
              ? [ev.targetUsername]
              : [];
    body.appendChild(actorStrong);
    body.appendChild(document.createTextNode(' added '));
    appendBoldNamesList(body, targetNames);
    body.appendChild(document.createTextNode(' to the group.'));
  } else if (ev.kind === 'group-remove') {
    const targetName = ev.targetDisplayName || ev.targetUsername || 'a member';
    body.appendChild(actorStrong);
    body.appendChild(document.createTextNode(' removed '));
    const targetStrong = document.createElement('strong');
    targetStrong.className = 'chat-system-actor';
    targetStrong.textContent = targetName;
    body.appendChild(targetStrong);
    body.appendChild(document.createTextNode(' from the group.'));
  } else if (ev.kind === 'group-leave') {
    body.appendChild(actorStrong);
    body.appendChild(document.createTextNode(' left the group.'));
  } else if (ev.kind === 'group-owner') {
    const targetName = ev.targetDisplayName || ev.targetUsername || 'a member';
    body.appendChild(actorStrong);
    body.appendChild(document.createTextNode(' made '));
    const targetStrong = document.createElement('strong');
    targetStrong.className = 'chat-system-actor';
    targetStrong.textContent = targetName;
    body.appendChild(targetStrong);
    body.appendChild(document.createTextNode(' the group owner.'));
  } else {
    body.textContent = msg.content || 'System update';
  }

  const timeEl = document.createElement('span');
  timeEl.className = 'chat-system-time';
  timeEl.textContent = formatFullTime(msg.timestamp);
  body.appendChild(timeEl);

  row.appendChild(body);
  return row;
}

function formatReplySnippetText(raw: string, maxChars = 110): string {
  const singleLine = raw.replace(/\s+/g, ' ').trim();
  if (singleLine.length <= maxChars) {
    return singleLine;
  }
  return `${singleLine.slice(0, Math.max(1, maxChars - 3)).trimEnd()}...`;
}

function formatCompactGutterTime(timestamp: number): string {
  const prefs = getUserPreferences();
  return new Date(timestamp).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: !prefs.use24HourTime,
  });
}

function createReactionBar(
  msg: ChatMessage,
  reactions: MessageReaction[],
  selfUsernameLower: string,
  onToggleReaction: (msg: ChatMessage, emoji: string) => Promise<void>,
): HTMLDivElement | null {
  if (!reactions || reactions.length === 0) {
    return null;
  }

  const bar = document.createElement('div');
  bar.className = 'msg-reactions';

  for (const r of reactions) {
    const pill = document.createElement('button');
    pill.type = 'button';
    const reacted = r.users.some((u) => u.toLowerCase() === selfUsernameLower);
    pill.className = `reaction-pill${reacted ? ' reaction-pill--active' : ''}`;
    pill.title = r.users.join(', ');

    const emojiSpan = document.createElement('span');
    emojiSpan.className = 'reaction-pill-emoji';
    setTwemojiText(emojiSpan, r.emoji);
    pill.appendChild(emojiSpan);

    const countSpan = document.createElement('span');
    countSpan.className = 'reaction-pill-count';
    countSpan.textContent = String(r.count);
    pill.appendChild(countSpan);

    pill.addEventListener('click', () => {
      void onToggleReaction(msg, r.emoji);
    });

    bar.appendChild(pill);
  }

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'reaction-add-btn';
  addBtn.title = 'Add Reaction';
  addBtn.setAttribute('aria-label', 'Add Reaction');
  addBtn.appendChild(createEmojiIconSvg(16));
  addBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openEmojiPicker({
      anchorEl: addBtn,
      onSelect: (emoji) => {
        void onToggleReaction(msg, emoji);
      },
    });
  });
  bar.appendChild(addBtn);

  return bar;
}

export function createChatMessageElement(opts: CreateMessageOptions): HTMLDivElement {
  if (opts.message.callLog) {
    return createCallLogMessageElement(
      opts.message,
      opts.selfUsernameLower,
      opts.onJoinCall,
      opts.isCallJoined,
    );
  }
  if (opts.message.systemEvent) {
    return createSystemEventMessageElement(
      opts.message,
      opts.formatFullTime,
      opts.onJumpToMessage,
      opts.onOpenPinnedMessages,
    );
  }

  const {
    message: msg,
    isGrouped,
    isOwn,
    selfUsernameLower,
    isEditing,
    resolveAvatar,
    formatFullTime,
    onReply,
    onForward,
    onJumpToMessage,
    onStartEdit,
    onCancelEdit,
    onSaveEdit,
    onDelete,
    onTogglePin,
    onToggleSpoiler,
    onToggleReaction,
    isGifFavorited,
    onToggleFavoriteGif,
    receiptStatus,
  } = opts;

  const isPending = Boolean(msg.isPending);
  const hasReply = Boolean(msg.replyTo);
  const effectiveGrouped = isGrouped && !hasReply;
  const legacyImages =
    msg.imageDataUrls && msg.imageDataUrls.length > 0
      ? msg.imageDataUrls
      : msg.imageDataUrl
        ? [msg.imageDataUrl]
        : [];
  const serverAttachments = (msg.attachments ?? []).map((att) => ({
    ...att,
    url: resolveMediaUrl(att.url),
  }));
  const imageItems: Array<{
    url: string;
    label: string;
    isGif?: boolean;
    attachmentId?: string;
    spoiler?: boolean;
  }> = [
    ...legacyImages.map((url, idx) => ({
      url,
      label: `${msg.authorName} image ${idx + 1}`,
    })),
    ...serverAttachments
      .filter((att) => att.kind === 'image')
      .map((att) => ({
        url: att.url,
        label: att.name,
        isGif: att.mime === 'image/gif' || att.name.toLowerCase().endsWith('.gif'),
        attachmentId: att.id,
        spoiler: Boolean(att.spoiler),
      })),
  ];
  const mediaAndFileAttachments = serverAttachments.filter((att) => att.kind !== 'image');

  const row = document.createElement('div');
  row.className = 'chat-message';
  row.dataset.msgId = msg.id;
  if (effectiveGrouped) {
    row.classList.add('chat-message--grouped');
  }
  if (isEditing) {
    row.classList.add('chat-message--editing');
  }
  if (isPending) {
    row.classList.add('chat-message--pending');
  }
  if (
    !isPending &&
    ((hasReply && msg.replyTo!.authorUsername.toLowerCase() === selfUsernameLower) ||
      containsSelfMention(msg.content, selfUsernameLower))
  ) {
    row.classList.add('chat-message--mention-reply');
  }
  if (hasReply) {
    row.classList.add('chat-message--has-reply');
  }

  if (msg.replyTo) {
    const replyRef = msg.replyTo;
    const replyContext = document.createElement('div');
    replyContext.className = 'msg-reply-context';

    const spine = document.createElement('span');
    spine.className = 'msg-reply-spine';
    spine.setAttribute('aria-hidden', 'true');
    replyContext.appendChild(spine);

    if (!replyRef.missing) {
      const miniAvatar = document.createElement('img');
      miniAvatar.className = 'msg-reply-avatar';
      miniAvatar.src = resolveAvatar({
        avatarPreset: replyRef.authorAvatarPreset,
        avatarDataUrl: replyRef.authorAvatarDataUrl,
      });
      miniAvatar.alt = `${replyRef.authorName} avatar`;
      replyContext.appendChild(miniAvatar);
    }

    const replyAuthor = document.createElement('span');
    replyAuthor.className = 'msg-reply-author';
    if (replyRef.authorUsername.toLowerCase() === selfUsernameLower) {
      replyAuthor.classList.add('msg-reply-author--self');
    }
    replyAuthor.textContent = `@${replyRef.authorName}`;
    replyContext.appendChild(replyAuthor);

    const snippetBtn = document.createElement('button');
    snippetBtn.type = 'button';
    snippetBtn.className = 'msg-reply-snippet-btn';

    if (replyRef.missing) {
      const deletedSpan = document.createElement('span');
      deletedSpan.className = 'msg-reply-italic';
      deletedSpan.textContent = 'Original message was deleted';
      snippetBtn.appendChild(deletedSpan);
      snippetBtn.disabled = true;
    } else if (replyRef.content) {
      const compactFull = replyRef.content.replace(/\s+/g, ' ').trim();
      const clampedSnippet = formatReplySnippetText(compactFull, 110);
      const textSpan = document.createElement('span');
      textSpan.className = 'msg-reply-snippet-text';
      setTwemojiText(textSpan, clampedSnippet);
      snippetBtn.title = compactFull;
      snippetBtn.appendChild(textSpan);
      if (replyRef.hasImage || replyRef.hasAttachment) {
        snippetBtn.appendChild(createSmallImageIconSvg(14));
      }
      snippetBtn.addEventListener('click', () => {
        onJumpToMessage?.(replyRef.messageId);
      });
    } else if (replyRef.hasImage || replyRef.hasAttachment) {
      const attachSpan = document.createElement('span');
      attachSpan.className = 'msg-reply-italic';
      attachSpan.textContent = 'Click to see attachment';
      snippetBtn.appendChild(attachSpan);
      snippetBtn.appendChild(createSmallImageIconSvg(14));
      snippetBtn.addEventListener('click', () => {
        onJumpToMessage?.(replyRef.messageId);
      });
    } else {
      const emptySpan = document.createElement('span');
      emptySpan.className = 'msg-reply-italic';
      emptySpan.textContent = 'Message';
      snippetBtn.appendChild(emptySpan);
      snippetBtn.addEventListener('click', () => {
        onJumpToMessage?.(replyRef.messageId);
      });
    }

    replyContext.appendChild(snippetBtn);
    row.appendChild(replyContext);
  }

  const mainLine = hasReply ? document.createElement('div') : row;
  if (hasReply) {
    mainLine.className = 'msg-main-line';
  }

  if (effectiveGrouped) {
    const gutter = document.createElement('span');
    gutter.className = 'chat-message-gutter-time';
    gutter.textContent = formatCompactGutterTime(msg.timestamp);
    mainLine.appendChild(gutter);
  } else {
    const avatar = document.createElement('img');
    avatar.className = 'chat-message-avatar';
    avatar.src = resolveAvatar({
      avatarPreset: msg.authorAvatarPreset,
      avatarDataUrl: msg.authorAvatarDataUrl,
    });
    avatar.alt = `${msg.authorName} profile picture`;
    mainLine.appendChild(avatar);
  }

  const body = document.createElement('div');
  body.className = 'chat-message-body';

  if (!effectiveGrouped) {
    const header = document.createElement('div');
    header.className = 'chat-message-header';

    const author = document.createElement('span');
    author.className = 'chat-message-author';
    author.textContent = msg.authorName;
    header.appendChild(author);

    const time = document.createElement('time');
    time.className = 'chat-message-time';
    time.dateTime = new Date(msg.timestamp).toISOString();
    time.textContent = formatFullTime(msg.timestamp);
    header.appendChild(time);

    if (msg.pinned) {
      const pinTag = document.createElement('span');
      pinTag.className = 'msg-pinned-badge';
      pinTag.title = msg.pinnedBy ? `Pinned by @${msg.pinnedBy}` : 'Pinned message';
      pinTag.appendChild(createPinIconSvg(11, true));
      pinTag.appendChild(document.createTextNode('Pinned'));
      header.appendChild(pinTag);
    }

    body.appendChild(header);
  } else if (msg.pinned) {
    const pinInline = document.createElement('div');
    pinInline.className = 'msg-pinned-badge msg-pinned-badge--inline';
    pinInline.title = msg.pinnedBy ? `Pinned by @${msg.pinnedBy}` : 'Pinned message';
    pinInline.appendChild(createPinIconSvg(11, true));
    pinInline.appendChild(document.createTextNode('Pinned'));
    body.appendChild(pinInline);
  }

  let contentHost: HTMLElement = body;
  if (msg.forwarded && !isEditing) {
    const fwdWrap = document.createElement('div');
    fwdWrap.className = 'msg-forwarded-card';
    const fwdHeader = document.createElement('div');
    fwdHeader.className = 'msg-forwarded-header';
    fwdHeader.appendChild(createForwardArrowSvg(13));
    const fwdLabel = document.createElement('span');
    fwdLabel.textContent = 'Forwarded';
    fwdHeader.appendChild(fwdLabel);
    fwdWrap.appendChild(fwdHeader);
    body.appendChild(fwdWrap);
    contentHost = fwdWrap;
  }

  if (isEditing) {
    const editWrap = document.createElement('div');
    editWrap.className = 'msg-inline-edit-wrap';

    const editBox = document.createElement('div');
    editBox.className = 'msg-inline-edit-box';

    const textarea = document.createElement('textarea');
    textarea.className = 'msg-inline-edit-input';
    textarea.rows = 1;
    textarea.value = msg.content;
    textarea.setAttribute('aria-label', 'Edit message');

    const syncEditHeight = () => {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 36), 220)}px`;
    };

    const editEmojiBtn = document.createElement('button');
    editEmojiBtn.type = 'button';
    editEmojiBtn.className = 'msg-inline-edit-emoji';
    editEmojiBtn.title = 'Emoji';
    editEmojiBtn.setAttribute('aria-label', 'Insert emoji');
    editEmojiBtn.appendChild(createEmojiIconSvg(18));
    editEmojiBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openEmojiPicker({
        anchorEl: editEmojiBtn,
        onSelect: (emoji) => {
          insertTextAtCursor(textarea, emoji);
        },
      });
    });

    editBox.appendChild(textarea);
    editBox.appendChild(editEmojiBtn);
    editWrap.appendChild(editBox);

    const hintRow = document.createElement('div');
    hintRow.className = 'msg-inline-edit-hint';

    const s1 = document.createElement('span');
    s1.textContent = 'escape to ';
    hintRow.appendChild(s1);

    const cancelLink = document.createElement('button');
    cancelLink.type = 'button';
    cancelLink.className = 'msg-inline-edit-link';
    cancelLink.textContent = 'cancel';
    cancelLink.addEventListener('click', () => onCancelEdit());
    hintRow.appendChild(cancelLink);

    const s2 = document.createElement('span');
    s2.textContent = ' • enter to ';
    hintRow.appendChild(s2);

    const saveLink = document.createElement('button');
    saveLink.type = 'button';
    saveLink.className = 'msg-inline-edit-link';
    saveLink.textContent = 'save';
    hintRow.appendChild(saveLink);

    editWrap.appendChild(hintRow);
    body.appendChild(editWrap);

    const editAutocomplete = attachEmojiAutocomplete({
      inputEl: textarea,
      anchorContainer: editWrap,
      onApplied: syncEditHeight,
    });

    let saving = false;
    const submitEdit = async () => {
      if (saving) {
        return;
      }
      const next = textarea.value.trim();
      if (!next && imageItems.length === 0 && mediaAndFileAttachments.length === 0 && !msg.gif) {
        return;
      }
      if (next === msg.content) {
        editAutocomplete.destroy();
        onCancelEdit();
        return;
      }
      saving = true;
      await onSaveEdit(msg, next);
      editAutocomplete.destroy();
      saving = false;
    };

    saveLink.addEventListener('click', () => {
      void submitEdit();
    });

    textarea.addEventListener('input', () => {
      replaceEmojiShortcodeBeforeCursor(textarea);
      syncEditHeight();
    });
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        editAutocomplete.destroy();
        onCancelEdit();
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        void submitEdit();
      }
    });

    requestAnimationFrame(() => {
      syncEditHeight();
      textarea.focus();
      const end = textarea.value.length;
      textarea.setSelectionRange(end, end);
    });
  } else if (msg.content) {
    const text = document.createElement('div');
    text.className = 'chat-message-text';
    const editedTag = msg.editedAt
      ? (() => {
          const el = document.createElement('span');
          el.className = 'msg-edited-tag';
          el.textContent = ' (edited)';
          return el;
        })()
      : undefined;

    if (isEmojiOnlyMessage(msg.content)) {
      text.classList.add('chat-message-text--jumbo');
      const contentSpan = document.createElement('span');
      setTwemojiText(contentSpan, msg.content);
      text.appendChild(contentSpan);
      if (editedTag) {
        text.appendChild(editedTag);
      }
    } else {
      renderFormattedMessageContent(text, msg.content, editedTag, selfUsernameLower);
    }
    contentHost.appendChild(text);

    const previewUrl =
      !isPending && !msg.gif && getUserPreferences().inlineMedia
        ? extractFirstPreviewableUrl(msg.content)
        : null;
    if (previewUrl) {
      if (linkPreviewCache.has(previewUrl)) {
        const cachedPreview = linkPreviewCache.get(previewUrl);
        if (cachedPreview) {
          contentHost.appendChild(buildLinkEmbedCard(cachedPreview));
        }
      } else {
        const embedSlot = document.createElement('div');
        embedSlot.className = 'msg-link-embed-slot';
        contentHost.appendChild(embedSlot);
        void loadLinkPreviewOnce(previewUrl).then((loadedPreview) => {
          if (loadedPreview && embedSlot.isConnected) {
            embedSlot.replaceWith(buildLinkEmbedCard(loadedPreview));
          } else {
            embedSlot.remove();
          }
        });
      }
    }
  } else if (msg.editedAt) {
    const editedOnly = document.createElement('div');
    editedOnly.className = 'msg-edited-tag msg-edited-tag--standalone';
    editedOnly.textContent = '(edited)';
    contentHost.appendChild(editedOnly);
  }

  const attachGifOverlays = (
    container: HTMLElement,
    gifItem: GifItem,
    showGifTag: boolean,
  ) => {
    if (showGifTag) {
      const badge = document.createElement('span');
      badge.className = 'msg-gif-badge';
      badge.textContent = 'GIF';
      container.appendChild(badge);
    }
    if (!onToggleFavoriteGif || gifItem.url.startsWith('blob:')) {
      return;
    }
    const isFav = Boolean(isGifFavorited?.(gifItem.url));
    const starBtn = document.createElement('button');
    starBtn.type = 'button';
    starBtn.className = isFav ? 'gif-fav-btn gif-fav-btn--active' : 'gif-fav-btn';
    starBtn.title = isFav ? 'Remove from Favorites' : 'Favorite GIF';
    starBtn.setAttribute('aria-label', starBtn.title);
    starBtn.appendChild(createFavoriteStarSvg(isFav, 14));
    starBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onToggleFavoriteGif(gifItem);
    });
    container.appendChild(starBtn);
  };

  interface MediaSpoilerController {
    isRevealed: () => boolean;
    reveal: () => void;
    hide: () => void;
  }

  const applyMediaSpoilerUi = (
    container: HTMLElement,
    optsMedia: {
      attachmentId?: string;
      isSpoiler: boolean;
      mediaClickEl?: HTMLElement;
      onOpenWhenRevealed?: () => void;
    },
  ): MediaSpoilerController => {
    const { isSpoiler, mediaClickEl, onOpenWhenRevealed } = optsMedia;
    let revealed = !isSpoiler;

    const mountOverlay = () => {
      if (container.querySelector('.msg-spoiler-overlay')) {
        return;
      }
      const overlay = document.createElement('button');
      overlay.type = 'button';
      overlay.className = 'msg-spoiler-overlay';
      overlay.dataset.action = 'reveal-spoiler';
      overlay.title = 'Click to reveal spoiler';
      const pill = document.createElement('span');
      pill.className = 'msg-spoiler-pill';
      pill.textContent = 'SPOILER';
      overlay.appendChild(pill);
      overlay.addEventListener('click', (e) => {
        e.stopPropagation();
        revealSpoiler();
      });
      container.appendChild(overlay);
    };

    const revealSpoiler = () => {
      if (revealed) {
        return;
      }
      revealed = true;
      container.classList.add('msg-media-spoiler--revealed');
      container.querySelector('.msg-spoiler-overlay')?.remove();
    };

    const hideSpoiler = () => {
      if (!isSpoiler || !revealed) {
        return;
      }
      revealed = false;
      container.classList.add('msg-media-spoiler');
      container.classList.remove('msg-media-spoiler--revealed');
      mountOverlay();
    };

    if (isSpoiler) {
      container.classList.add('msg-media-spoiler');
      mountOverlay();
    }

    if (mediaClickEl && onOpenWhenRevealed) {
      mediaClickEl.addEventListener('click', () => {
        if (!revealed) {
          revealSpoiler();
          return;
        }
        onOpenWhenRevealed();
      });
    }

    return {
      isRevealed: () => revealed,
      reveal: revealSpoiler,
      hide: hideSpoiler,
    };
  };

  const appendMediaElement = (label: string, renderMedia: () => HTMLElement) => {
    if (getUserPreferences().inlineMedia) {
      contentHost.appendChild(renderMedia());
      return;
    }
    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'msg-hidden-media-btn';
    toggleBtn.appendChild(createSmallImageIconSvg(15));
    toggleBtn.appendChild(document.createTextNode(`Show media (${label})`));
    toggleBtn.addEventListener('click', () => {
      toggleBtn.replaceWith(renderMedia());
    });
    contentHost.appendChild(toggleBtn);
  };

  interface MediaContextTarget {
    kind: 'gif' | 'image' | 'video' | 'audio' | 'file' | 'voice';
    url: string;
    label: string;
    attachmentId?: string;
    spoiler?: boolean;
    spoilerCtrl?: MediaSpoilerController;
    gif?: GifItem;
    downloadHref?: string;
    filename?: string;
  }
  const mediaTargets = new WeakMap<HTMLElement, MediaContextTarget>();
  const resolveImageDownloadHref = (url: string): string | undefined =>
    url.includes('/api/uploads/') ? `${url}?download=1` : undefined;

  if (msg.gif) {
    const gifData = msg.gif;
    const resolvedGifUrl = resolveMediaUrl(gifData.url);
    const isVideoGif =
      gifData.mediaKind === 'video' || /\.(webm|mp4|m4v|mov|ogv)(\?|$)/i.test(resolvedGifUrl);
    appendMediaElement(gifData.title || 'GIF', () => {
      const gifWrap = document.createElement('div');
      gifWrap.className = 'msg-image-wrap msg-gif-wrap';
      mediaTargets.set(gifWrap, {
        kind: 'gif',
        url: resolvedGifUrl,
        label: gifData.title || 'GIF',
        gif: gifData,
        downloadHref: resolveImageDownloadHref(resolvedGifUrl),
        filename: `${(gifData.title || 'redshift').replace(/[^a-z0-9_-]+/gi, '_')}.${isVideoGif ? 'webm' : 'gif'}`,
      });

      if (isVideoGif) {
        const gifVideo = document.createElement('video');
        gifVideo.className = 'msg-image msg-gif-img';
        gifVideo.src = resolvedGifUrl;
        gifVideo.autoplay = true;
        gifVideo.loop = true;
        gifVideo.muted = true;
        gifVideo.playsInline = true;
        gifVideo.preload = 'metadata';
        if (gifData.playbackSpeed && gifData.playbackSpeed !== 1) {
          gifVideo.playbackRate = gifData.playbackSpeed;
          gifVideo.addEventListener('loadedmetadata', () => {
            gifVideo.playbackRate = gifData.playbackSpeed ?? 1;
          });
        }
        gifVideo.addEventListener('click', () => {
          openImageLightbox(resolvedGifUrl, gifData.title || 'GIF', {
            isVideo: true,
            playbackSpeed: gifData.playbackSpeed,
          });
        });
        gifWrap.appendChild(gifVideo);
      } else {
        const gifImg = document.createElement('img');
        gifImg.className = 'msg-image msg-gif-img';
        gifImg.src = resolvedGifUrl;
        gifImg.alt = gifData.title || 'GIF';
        gifImg.loading = 'lazy';
        gifImg.addEventListener('click', () => {
          openImageLightbox(resolvedGifUrl, gifData.title || 'GIF');
        });
        gifWrap.appendChild(gifImg);
      }
      attachGifOverlays(gifWrap, gifData, true);
      return gifWrap;
    });
  }

  if (imageItems.length === 1) {
    appendMediaElement(imageItems[0].label, () => {
      const item = imageItems[0];
      const imgWrap = document.createElement('div');
      imgWrap.className = item.isGif ? 'msg-image-wrap msg-gif-wrap' : 'msg-image-wrap';
      const gifMeta = item.isGif
        ? { url: item.url, title: item.label.replace(/\.gif$/i, '') }
        : undefined;
      mediaTargets.set(imgWrap, {
        kind: item.isGif ? 'gif' : 'image',
        url: item.url,
        label: item.label,
        attachmentId: item.attachmentId,
        spoiler: Boolean(item.spoiler),
        gif: gifMeta,
        downloadHref: resolveImageDownloadHref(item.url),
        filename: item.label,
      });

      const img = document.createElement('img');
      img.className = 'msg-image';
      img.src = item.url;
      img.alt = item.label;
      img.loading = 'lazy';
      imgWrap.appendChild(img);
      if (gifMeta) {
        attachGifOverlays(imgWrap, gifMeta, true);
      }
      const spoilerCtrl = applyMediaSpoilerUi(imgWrap, {
        attachmentId: item.attachmentId,
        isSpoiler: Boolean(item.spoiler),
        mediaClickEl: img,
        onOpenWhenRevealed: () => openImageLightbox(item.url, item.label),
      });
      const targetRef = mediaTargets.get(imgWrap);
      if (targetRef) {
        targetRef.spoilerCtrl = spoilerCtrl;
      }
      return imgWrap;
    });
  } else if (imageItems.length > 1) {
    appendMediaElement(`${imageItems.length} images`, () => {
      const grid = document.createElement('div');
      grid.className =
        imageItems.length >= 5 ? 'msg-image-grid msg-image-grid--three' : 'msg-image-grid';

      imageItems.forEach((item) => {
        const tile = document.createElement('div');
        tile.className = 'msg-image-grid-tile';
        const img = document.createElement('img');
        img.className = 'msg-image-grid-item';
        img.src = item.url;
        img.alt = item.label;
        img.loading = 'lazy';
        const tileTarget: MediaContextTarget = {
          kind: item.isGif ? 'gif' : 'image',
          url: item.url,
          label: item.label,
          attachmentId: item.attachmentId,
          spoiler: Boolean(item.spoiler),
          gif: item.isGif
            ? { url: item.url, title: item.label.replace(/\.gif$/i, '') }
            : undefined,
          downloadHref: resolveImageDownloadHref(item.url),
          filename: item.label,
        };
        mediaTargets.set(tile, tileTarget);
        tile.appendChild(img);
        tileTarget.spoilerCtrl = applyMediaSpoilerUi(tile, {
          attachmentId: item.attachmentId,
          isSpoiler: Boolean(item.spoiler),
          mediaClickEl: img,
          onOpenWhenRevealed: () => openImageLightbox(item.url, item.label),
        });
        grid.appendChild(tile);
      });

      return grid;
    });
  }

  for (const att of mediaAndFileAttachments) {
    const downloadHref = att.url.startsWith('blob:') ? att.url : `${att.url}?download=1`;

    if (msg.voiceNote && (att.kind === 'audio' || att.kind === 'video')) {
      const voiceCard = createVoiceNotePlayerCard(att, msg.voiceNote, downloadHref);
      mediaTargets.set(voiceCard, {
        kind: 'voice',
        url: att.url,
        label: att.name,
        downloadHref,
        filename: att.name,
      });
      contentHost.appendChild(voiceCard);
    } else if (att.kind === 'video') {
      appendMediaElement(att.name, () => {
        const card = document.createElement('div');
        card.className = 'msg-video-card';
        mediaTargets.set(card, {
          kind: 'video',
          url: att.url,
          label: att.name,
          attachmentId: att.id,
          spoiler: Boolean(att.spoiler),
          downloadHref,
          filename: att.name,
        });

        const videoStage = document.createElement('div');
        videoStage.className = 'msg-video-stage';
        const video = document.createElement('video');
        video.className = 'msg-video-player';
        video.controls = true;
        video.preload = 'metadata';
        video.playsInline = true;

        const isServerUpload = att.url.includes('/api/uploads/');
        const isAlreadyWebm =
          att.mime === 'video/webm' || /\.webm(\?|$)/i.test(att.name || att.url);
        const supportsH264 = Boolean(
          typeof video.canPlayType === 'function' &&
            video.canPlayType('video/mp4; codecs="avc1.42E01E, mp4a.40.2"'),
        );
        const webmCompatUrl = isServerUpload
          ? `${att.url}${att.url.includes('?') ? '&' : '?'}format=webm`
          : null;

        let usingCompatWebm = Boolean(webmCompatUrl && !isAlreadyWebm && !supportsH264);
        let fallbackTriggered = usingCompatWebm;
        let stallTimer: number | null = null;

        const statusOverlay = document.createElement('div');
        statusOverlay.className = 'msg-video-status-overlay';
        statusOverlay.textContent = 'Preparing video for playback...';
        statusOverlay.hidden = !usingCompatWebm;

        const clearStallTimer = () => {
          if (stallTimer !== null) {
            window.clearTimeout(stallTimer);
            stallTimer = null;
          }
        };

        const switchToCompatWebm = (autoPlay: boolean) => {
          if (fallbackTriggered || !webmCompatUrl || isAlreadyWebm) {
            return;
          }
          fallbackTriggered = true;
          usingCompatWebm = true;
          clearStallTimer();
          const resumeAt = Number.isFinite(video.currentTime) ? video.currentTime : 0;
          statusOverlay.hidden = false;
          video.src = webmCompatUrl;
          video.load();
          video.addEventListener(
            'loadedmetadata',
            () => {
              if (resumeAt > 0.2 && Number.isFinite(video.duration) && resumeAt < video.duration) {
                try {
                  video.currentTime = resumeAt;
                } catch {}
              }
              if (autoPlay) {
                void video.play().catch(() => {});
              }
            },
            { once: true },
          );
        };

        video.addEventListener('canplay', () => {
          clearStallTimer();
          statusOverlay.hidden = true;
        });
        video.addEventListener('playing', () => {
          clearStallTimer();
          statusOverlay.hidden = true;
        });
        video.addEventListener('error', () => {
          if (!fallbackTriggered && webmCompatUrl && !isAlreadyWebm) {
            switchToCompatWebm(!video.paused);
          } else {
            statusOverlay.hidden = true;
          }
        });
        video.addEventListener('waiting', () => {
          if (fallbackTriggered || !webmCompatUrl || isAlreadyWebm) {
            return;
          }
          clearStallTimer();
          stallTimer = window.setTimeout(() => {
            if (!video.paused && video.readyState < 3) {
              switchToCompatWebm(true);
            }
          }, 2600);
        });
        video.addEventListener('stalled', () => {
          if (fallbackTriggered || !webmCompatUrl || isAlreadyWebm) {
            return;
          }
          clearStallTimer();
          stallTimer = window.setTimeout(() => {
            if (!video.paused && video.readyState < 3) {
              switchToCompatWebm(true);
            }
          }, 2600);
        });
        video.addEventListener('pause', clearStallTimer);
        video.addEventListener('ended', clearStallTimer);

        video.src = usingCompatWebm && webmCompatUrl ? webmCompatUrl : att.url;
        videoStage.appendChild(video);
        videoStage.appendChild(statusOverlay);
        const videoSpoilerCtrl = applyMediaSpoilerUi(videoStage, {
          attachmentId: att.id,
          isSpoiler: Boolean(att.spoiler),
        });
        const cardTarget = mediaTargets.get(card);
        if (cardTarget) {
          cardTarget.spoilerCtrl = videoSpoilerCtrl;
        }
        card.appendChild(videoStage);

        const metaBar = document.createElement('div');
        metaBar.className = 'msg-media-meta';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'msg-media-name';
        nameSpan.textContent = att.name;
        nameSpan.title = att.name;
        metaBar.appendChild(nameSpan);

        const sizeSpan = document.createElement('span');
        sizeSpan.className = 'msg-media-size';
        sizeSpan.textContent = formatFileSize(att.size);
        metaBar.appendChild(sizeSpan);

        if (!att.url.startsWith('blob:')) {
          const dlBtn = document.createElement('a');
          dlBtn.className = 'msg-media-download';
          dlBtn.href = downloadHref;
          dlBtn.download = att.name;
          dlBtn.title = `Download ${att.name}`;
          dlBtn.setAttribute('aria-label', `Download ${att.name}`);
          dlBtn.appendChild(createDownloadIconSvg(15));
          metaBar.appendChild(dlBtn);
        }

        card.appendChild(metaBar);
        return card;
      });
    } else if (att.kind === 'audio') {
      const card = document.createElement('div');
      card.className = 'msg-audio-card';
      mediaTargets.set(card, {
        kind: 'audio',
        url: att.url,
        label: att.name,
        downloadHref,
        filename: att.name,
      });

      const topRow = document.createElement('div');
      topRow.className = 'msg-audio-top';

      const iconWrap = document.createElement('span');
      iconWrap.className = 'msg-audio-badge';
      iconWrap.appendChild(createAudioIconSvg(16));
      topRow.appendChild(iconWrap);

      const textCol = document.createElement('div');
      textCol.className = 'msg-file-text';
      const nameEl = document.createElement('div');
      nameEl.className = 'msg-media-name';
      nameEl.textContent = att.name;
      nameEl.title = att.name;
      const sizeEl = document.createElement('div');
      sizeEl.className = 'msg-media-size';
      sizeEl.textContent = formatFileSize(att.size);
      textCol.appendChild(nameEl);
      textCol.appendChild(sizeEl);
      topRow.appendChild(textCol);

      if (!att.url.startsWith('blob:')) {
        const dlBtn = document.createElement('a');
        dlBtn.className = 'msg-media-download';
        dlBtn.href = downloadHref;
        dlBtn.download = att.name;
        dlBtn.title = `Download ${att.name}`;
        dlBtn.setAttribute('aria-label', `Download ${att.name}`);
        dlBtn.appendChild(createDownloadIconSvg(16));
        topRow.appendChild(dlBtn);
      }

      card.appendChild(topRow);

      const audio = document.createElement('audio');
      audio.className = 'msg-audio-player';
      audio.controls = true;
      audio.preload = 'metadata';
      audio.src = att.url;
      card.appendChild(audio);

      contentHost.appendChild(card);
    } else {
      const card = document.createElement('div');
      card.className = 'msg-file-card';

      const iconWrap = document.createElement('span');
      iconWrap.className = 'msg-file-badge';
      iconWrap.appendChild(createFileIconSvg(20));
      card.appendChild(iconWrap);

      const textCol = document.createElement('div');
      textCol.className = 'msg-file-text';

      const nameLink = document.createElement('a');
      nameLink.className = 'msg-file-link';
      nameLink.textContent = att.name;
      nameLink.title = att.name;
      if (!att.url.startsWith('blob:')) {
        nameLink.href = downloadHref;
        nameLink.download = att.name;
      }
      textCol.appendChild(nameLink);

      const sizeEl = document.createElement('div');
      sizeEl.className = 'msg-media-size';
      sizeEl.textContent = formatFileSize(att.size);
      textCol.appendChild(sizeEl);

      card.appendChild(textCol);

      if (!att.url.startsWith('blob:')) {
        const dlBtn = document.createElement('a');
        dlBtn.className = 'msg-media-download';
        dlBtn.href = downloadHref;
        dlBtn.download = att.name;
        dlBtn.title = `Download ${att.name}`;
        dlBtn.setAttribute('aria-label', `Download ${att.name}`);
        dlBtn.appendChild(createDownloadIconSvg(17));
        card.appendChild(dlBtn);
      }

      mediaTargets.set(card, {
        kind: 'file',
        url: att.url,
        label: att.name,
        downloadHref,
        filename: att.name,
      });
      contentHost.appendChild(card);
    }
  }

  if (isPending && msg.uploadStatusText) {
    const uploadPill = document.createElement('div');
    uploadPill.className = 'msg-upload-status';

    const statusLabel = document.createElement('div');
    statusLabel.className = 'msg-upload-status-text';
    statusLabel.textContent = msg.uploadStatusText;
    uploadPill.appendChild(statusLabel);

    if (typeof msg.uploadProgress === 'number') {
      const barTrack = document.createElement('div');
      barTrack.className = 'msg-upload-track';
      const barFill = document.createElement('div');
      barFill.className = 'msg-upload-fill';
      barFill.style.width = `${Math.min(100, Math.max(0, msg.uploadProgress))}%`;
      barTrack.appendChild(barFill);
      uploadPill.appendChild(barTrack);
    }

    body.appendChild(uploadPill);
  }

  if (!isPending) {
    const reactionBar = createReactionBar(
      msg,
      msg.reactions ?? [],
      selfUsernameLower,
      onToggleReaction,
    );
    if (reactionBar) {
      body.appendChild(reactionBar);
    }
  }

  if (receiptStatus) {
    const receiptRow = document.createElement('div');
    receiptRow.className = `msg-receipt-row msg-receipt-row--${receiptStatus.kind}`;
    const checkSvg = createSvg(
      receiptStatus.kind === 'seen'
        ? ['M2 12l5 5L18 6', 'M9 12l5 5L23 6']
        : ['M4 12l5 5L20 6'],
      '0 0 24 24',
      13,
      'msg-receipt-icon',
    );
    const labelSpan = document.createElement('span');
    labelSpan.textContent = receiptStatus.label;
    receiptRow.appendChild(checkSvg);
    receiptRow.appendChild(labelSpan);
    body.appendChild(receiptRow);
  }

  mainLine.appendChild(body);
  if (hasReply) {
    row.appendChild(mainLine);
  }

  if (!isEditing && !isPending) {
    const toolbar = document.createElement('div');
    toolbar.className = 'msg-hover-toolbar';

    const reactPickerBtn = document.createElement('button');
    reactPickerBtn.type = 'button';
    reactPickerBtn.className = 'msg-toolbar-btn';
    reactPickerBtn.title = 'Add Reaction';
    reactPickerBtn.setAttribute('aria-label', 'Add Reaction');
    reactPickerBtn.appendChild(createEmojiIconSvg(16));
    reactPickerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      row.classList.add('chat-message--picker-open');
      openEmojiPicker({
        anchorEl: reactPickerBtn,
        onSelect: (emoji) => {
          void onToggleReaction(msg, emoji);
        },
        onClose: () => {
          row.classList.remove('chat-message--picker-open');
        },
      });
    });
    toolbar.appendChild(reactPickerBtn);

    const replyBtn = document.createElement('button');
    replyBtn.type = 'button';
    replyBtn.className = 'msg-toolbar-btn';
    replyBtn.title = 'Reply';
    replyBtn.setAttribute('aria-label', 'Reply to message');
    replyBtn.appendChild(createReplyArrowSvg(16));
    replyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onReply(msg);
    });
    toolbar.appendChild(replyBtn);

    if (onForward) {
      const forwardBtn = document.createElement('button');
      forwardBtn.type = 'button';
      forwardBtn.className = 'msg-toolbar-btn';
      forwardBtn.dataset.action = 'forward';
      forwardBtn.title = 'Forward';
      forwardBtn.setAttribute('aria-label', 'Forward message');
      forwardBtn.appendChild(createForwardArrowSvg(16));
      forwardBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        onForward(msg);
      });
      toolbar.appendChild(forwardBtn);
    }

    if (onTogglePin) {
      const pinBtn = document.createElement('button');
      pinBtn.type = 'button';
      pinBtn.className = msg.pinned
        ? 'msg-toolbar-btn msg-toolbar-btn--pinned'
        : 'msg-toolbar-btn';
      pinBtn.title = msg.pinned ? 'Unpin Message' : 'Pin Message';
      pinBtn.setAttribute('aria-label', pinBtn.title);
      pinBtn.appendChild(createPinIconSvg(15, Boolean(msg.pinned)));
      pinBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        void onTogglePin(msg);
      });
      toolbar.appendChild(pinBtn);
    }

    if (isOwn) {
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'msg-toolbar-btn';
      editBtn.title = 'Edit';
      editBtn.setAttribute('aria-label', 'Edit message');
      editBtn.appendChild(createEditPencilSvg(15));
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        onStartEdit(msg);
      });
      toolbar.appendChild(editBtn);

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'msg-toolbar-btn msg-toolbar-btn--danger';
      deleteBtn.title = 'Delete';
      deleteBtn.setAttribute('aria-label', 'Delete message');
      deleteBtn.appendChild(createTrashSvg(15));
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        void onDelete(msg);
      });
      toolbar.appendChild(deleteBtn);
    }

    row.appendChild(toolbar);
  }

  if (!isEditing) {
    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();

      let matchedMedia: MediaContextTarget | undefined;
      let matchedNode: HTMLElement | undefined;
      let cur = e.target as HTMLElement | null;
      while (cur && cur !== row) {
        const hit = mediaTargets.get(cur);
        if (hit) {
          matchedMedia = hit;
          matchedNode = cur;
          break;
        }
        cur = cur.parentElement;
      }

      const items: ContextMenuItem[] = [];
      const selectedText = window.getSelection()?.toString().trim() ?? '';
      if (selectedText) {
        items.push({
          label: 'Copy Selected Text',
          icon: 'copy',
          onSelect: () => {
            void copyToClipboard(selectedText);
          },
        });
      }

      if (matchedMedia) {
        const media = matchedMedia;
        if (media.kind === 'gif' || media.kind === 'image') {
          items.push({
            label: media.kind === 'gif' ? 'Open GIF' : 'Open Image',
            icon: 'expand',
            dividerBefore: items.length > 0,
            onSelect: () =>
              openImageLightbox(media.url, media.label, {
                isVideo: media.gif?.mediaKind === 'video',
                playbackSpeed: media.gif?.playbackSpeed,
              }),
          });
          if (media.gif?.mediaKind !== 'video') {
            items.push({
              label: 'Copy Image',
              icon: 'copy',
              onSelect: () => {
                void copyImageToClipboard(media.url);
              },
            });
          }
          if (media.kind === 'gif' && media.gif) {
            const gifObj = media.gif;
            if (onToggleFavoriteGif && !gifObj.url.startsWith('blob:')) {
              const isFav = Boolean(isGifFavorited?.(gifObj.url));
              items.push({
                label: isFav ? 'Remove from Favorites' : 'Favorite GIF',
                icon: isFav ? 'star-filled' : 'star',
                onSelect: () => onToggleFavoriteGif(gifObj),
              });
            }
            if (!gifObj.url.startsWith('blob:')) {
              items.push({
                label: 'Copy GIF Link',
                icon: 'link',
                onSelect: () => {
                  void copyGifShareLinkToClipboard(gifObj);
                },
              });
            }
          } else if (!media.url.startsWith('blob:')) {
            items.push({
              label: 'Copy Image URL',
              icon: 'link',
              onSelect: () => {
                void copyToClipboard(new URL(media.url, window.location.origin).href);
              },
            });
          }
          if (media.spoiler && media.spoilerCtrl) {
            const ctrl = media.spoilerCtrl;
            const revealedNow = ctrl.isRevealed();
            items.push({
              label: revealedNow ? 'Hide Spoiler' : 'Reveal Spoiler',
              icon: revealedNow ? 'eye-off' : 'eye',
              onSelect: () => {
                if (revealedNow) {
                  ctrl.hide();
                } else {
                  ctrl.reveal();
                }
              },
            });
          }
          if (isOwn && !isPending && onToggleSpoiler && media.attachmentId) {
            const attId = media.attachmentId;
            const currentlySpoiler = Boolean(media.spoiler);
            items.push({
              label: currentlySpoiler ? 'Remove Spoiler Blur' : 'Mark as Spoiler',
              icon: currentlySpoiler ? 'eye' : 'eye-off',
              onSelect: () => {
                void onToggleSpoiler(msg, attId, !currentlySpoiler);
              },
            });
          }
          if (media.downloadHref && !media.downloadHref.startsWith('blob:')) {
            items.push({
              label: media.kind === 'gif' ? 'Download GIF' : 'Download Image',
              icon: 'download',
              onSelect: () =>
                triggerDownload(media.downloadHref!, media.filename || 'attachment'),
            });
          }
        } else if (media.kind === 'voice' && matchedNode) {
          const btns = Array.from(matchedNode.querySelectorAll<HTMLButtonElement>('button'));
          const playBtn = btns[0];
          const speedBtn = btns.find((b) => /\dx$/i.test(b.textContent?.trim() ?? ''));
          if (playBtn) {
            const isPlaying = playBtn.getAttribute('aria-label')?.toLowerCase().includes('pause');
            items.push({
              label: isPlaying ? 'Pause Voice Message' : 'Play Voice Message',
              icon: 'play',
              dividerBefore: items.length > 0,
              onSelect: () => playBtn.click(),
            });
          }
          if (speedBtn) {
            items.push({
              label: 'Cycle Playback Speed',
              icon: 'speed',
              hint: speedBtn.textContent?.trim() || '1x',
              onSelect: () => speedBtn.click(),
            });
          }
          if (media.downloadHref && !media.downloadHref.startsWith('blob:')) {
            items.push({
              label: 'Download Audio',
              icon: 'download',
              onSelect: () =>
                triggerDownload(media.downloadHref!, media.filename || 'voice-message.wav'),
            });
          }
        } else {
          if (media.kind === 'video' && media.spoiler && media.spoilerCtrl) {
            const ctrl = media.spoilerCtrl;
            const revealedNow = ctrl.isRevealed();
            items.push({
              label: revealedNow ? 'Hide Spoiler' : 'Reveal Spoiler',
              icon: revealedNow ? 'eye-off' : 'eye',
              dividerBefore: items.length > 0,
              onSelect: () => {
                if (revealedNow) {
                  ctrl.hide();
                } else {
                  ctrl.reveal();
                }
              },
            });
          }
          if (media.kind === 'video' && isOwn && !isPending && onToggleSpoiler && media.attachmentId) {
            const attId = media.attachmentId;
            const currentlySpoiler = Boolean(media.spoiler);
            items.push({
              label: currentlySpoiler ? 'Remove Spoiler Blur' : 'Mark as Spoiler',
              icon: currentlySpoiler ? 'eye' : 'eye-off',
              dividerBefore: items.length > 0 && !(media.spoiler && media.spoilerCtrl),
              onSelect: () => {
                void onToggleSpoiler(msg, attId, !currentlySpoiler);
              },
            });
          }
          if (media.downloadHref && !media.downloadHref.startsWith('blob:')) {
            items.push({
              label: 'Download Attachment',
              icon: 'download',
              dividerBefore: items.length > 0,
              onSelect: () =>
                triggerDownload(media.downloadHref!, media.filename || 'attachment'),
            });
          }
          if (!media.url.startsWith('blob:')) {
            items.push({
              label: 'Copy Attachment Link',
              icon: 'link',
              onSelect: () => {
                void copyToClipboard(new URL(media.url, window.location.origin).href);
              },
            });
          }
        }
      }

      if (!isPending) {
        items.push({
          label: 'Reply',
          icon: 'reply',
          dividerBefore: items.length > 0,
          onSelect: () => onReply(msg),
        });
        if (onForward) {
          items.push({
            label: 'Forward Message',
            icon: 'forward',
            onSelect: () => onForward(msg),
          });
        }
        if (onTogglePin) {
          items.push({
            label: msg.pinned ? 'Unpin Message' : 'Pin Message',
            icon: msg.pinned ? 'unpin' : 'pin',
            onSelect: () => {
              void onTogglePin(msg);
            },
          });
        }
        if (isOwn) {
          items.push({
            label: 'Edit Message',
            icon: 'edit',
            onSelect: () => onStartEdit(msg),
          });
        }
        if (msg.content.trim()) {
          items.push({
            label: 'Copy Text',
            icon: 'copy',
            onSelect: () => {
              void copyToClipboard(msg.content);
            },
          });
        }
        items.push({
          label: 'Copy Message ID',
          icon: 'copy',
          onSelect: () => {
            void copyToClipboard(msg.id);
          },
        });
        if (isOwn) {
          items.push({
            label: 'Delete Message',
            icon: 'trash',
            danger: true,
            dividerBefore: true,
            onSelect: () => {
              void onDelete(msg);
            },
          });
        }
      } else if (msg.content.trim()) {
        items.push({
          label: 'Copy Text',
          icon: 'copy',
          onSelect: () => {
            void copyToClipboard(msg.content);
          },
        });
      }

      let quickReactHeader: HTMLElement | undefined;
      if (!isPending) {
        const strip = document.createElement('div');
        strip.className = 'ctx-quick-react-strip';
        for (const emoji of ['👍', '❤️', '😂', '😮', '😢']) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'ctx-quick-react-btn';
          btn.title = `React with ${emoji}`;
          btn.setAttribute('aria-label', `React with ${emoji}`);
          setTwemojiText(btn, emoji);
          btn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            closeActiveContextMenu();
            void onToggleReaction(msg, emoji);
          });
          strip.appendChild(btn);
        }
        const moreBtn = document.createElement('button');
        moreBtn.type = 'button';
        moreBtn.className = 'ctx-quick-react-btn ctx-quick-react-btn--more';
        moreBtn.title = 'More Emojis...';
        moreBtn.setAttribute('aria-label', 'More Emojis');
        moreBtn.appendChild(createEmojiIconSvg(16));
        moreBtn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          closeActiveContextMenu();
          row.classList.add('chat-message--picker-open');
          openEmojiPicker({
            anchorEl: row,
            onSelect: (emoji) => {
              void onToggleReaction(msg, emoji);
            },
            onClose: () => {
              row.classList.remove('chat-message--picker-open');
            },
          });
        });
        strip.appendChild(moreBtn);
        quickReactHeader = strip;
      }

      row.classList.add('chat-message--context-open');
      openContextMenu({
        clientX: e.clientX,
        clientY: e.clientY,
        minWidth: 214,
        headerWidget: quickReactHeader,
        items,
        onClose: () => {
          row.classList.remove('chat-message--context-open');
        },
      });
    });
  }

  return row;
}

/** Creates a reusable three-dot vertical "More" icon SVG. */
export function createMoreVerticalSvg(size = 16): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');

  for (const cy of [5, 12, 19]) {
    const c = document.createElementNS(ns, 'circle');
    c.setAttribute('cx', '12');
    c.setAttribute('cy', String(cy));
    c.setAttribute('r', '2');
    svg.appendChild(c);
  }
  return svg;
}

/** Creates a themed drag-and-drop overlay banner for image drop targets. */
export function createImageDropOverlay(title: string, subtitle?: string): HTMLDivElement {
  const overlay = document.createElement('div');
  overlay.className = 'image-drop-overlay';
  overlay.hidden = true;

  const box = document.createElement('div');
  box.className = 'image-drop-overlay-card';

  const icon = document.createElement('div');
  icon.className = 'image-drop-overlay-icon';
  icon.appendChild(createSmallImageIconSvg(28));
  box.appendChild(icon);

  const heading = document.createElement('div');
  heading.className = 'image-drop-overlay-title';
  heading.textContent = title;
  box.appendChild(heading);

  if (subtitle) {
    const sub = document.createElement('div');
    sub.className = 'image-drop-overlay-sub';
    sub.textContent = subtitle;
    box.appendChild(sub);
  }

  overlay.appendChild(box);
  return overlay;
}

export interface ImageDropZoneOptions {
  overlayEl?: HTMLElement;
  activeClass?: string;
  onFiles: (files: File[]) => void;
}

/** Attaches a flicker-free file drag-and-drop image handler to an element. */
export function attachImageDropZone(
  targetEl: HTMLElement,
  options: ImageDropZoneOptions,
): () => void {
  const activeClass = options.activeClass ?? 'drop-zone--active';
  let dragDepth = 0;

  const hasFiles = (e: DragEvent): boolean =>
    Boolean(e.dataTransfer?.types && Array.from(e.dataTransfer.types).includes('Files'));

  const setActive = (active: boolean) => {
    targetEl.classList.toggle(activeClass, active);
    if (options.overlayEl) {
      options.overlayEl.hidden = !active;
    }
  };

  const reset = () => {
    dragDepth = 0;
    setActive(false);
  };

  const onDragEnter = (e: DragEvent) => {
    if (!hasFiles(e)) {
      return;
    }
    e.preventDefault();
    dragDepth += 1;
    if (dragDepth === 1) {
      setActive(true);
    }
  };

  const onDragOver = (e: DragEvent) => {
    if (!hasFiles(e)) {
      return;
    }
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
  };

  const onDragLeave = () => {
    if (dragDepth === 0) {
      return;
    }
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) {
      setActive(false);
    }
  };

  const onDrop = (e: DragEvent) => {
    if (!hasFiles(e)) {
      return;
    }
    e.preventDefault();
    reset();
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length > 0) {
      options.onFiles(files);
    }
  };

  targetEl.addEventListener('dragenter', onDragEnter);
  targetEl.addEventListener('dragover', onDragOver);
  targetEl.addEventListener('dragleave', onDragLeave);
  targetEl.addEventListener('drop', onDrop);
  window.addEventListener('blur', reset);

  return () => {
    reset();
    targetEl.removeEventListener('dragenter', onDragEnter);
    targetEl.removeEventListener('dragover', onDragOver);
    targetEl.removeEventListener('dragleave', onDragLeave);
    targetEl.removeEventListener('drop', onDrop);
    window.removeEventListener('blur', reset);
  };
}

/** Shows a centered rectangular confirmation modal over a dimmed backdrop. */
export function openConfirmPopup(options: {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop modal-backdrop--deep modal-backdrop--top';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');

    const card = document.createElement('div');
    card.className = 'modal-card modal-card--confirm';

    const title = document.createElement('h2');
    title.className = 'modal-title';
    title.textContent = options.title;
    card.appendChild(title);

    const msg = document.createElement('p');
    msg.className = 'modal-subtitle modal-confirm-text';
    msg.textContent = options.message;
    card.appendChild(msg);

    const footer = document.createElement('div');
    footer.className = 'button-row modal-footer';

    const finish = (confirmed: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      window.removeEventListener('keydown', onKeyDown, true);
      backdrop.classList.remove('modal-backdrop--visible');
      window.setTimeout(() => backdrop.remove(), 180);
      resolve(confirmed);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (!isTopmostModal(backdrop)) {
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        finish(false);
        return;
      }
      if (isModalConfirmShortcut(e, backdrop)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        finish(true);
      }
    };

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn-secondary';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => finish(false));

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = options.danger ? 'btn-danger' : 'btn-primary';
    confirmBtn.textContent = options.confirmLabel;
    confirmBtn.addEventListener('click', () => finish(true));

    footer.appendChild(cancelBtn);
    footer.appendChild(confirmBtn);
    card.appendChild(footer);

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        finish(false);
      }
    });
    backdrop.appendChild(card);
    document.body.appendChild(backdrop);
    window.addEventListener('keydown', onKeyDown, true);

    requestAnimationFrame(() => {
      if (!settled) {
        backdrop.classList.add('modal-backdrop--visible');
        confirmBtn.focus();
      }
    });
  });
}

export interface FloatingActionMenuItem {
  label: string;
  danger?: boolean;
  dividerBefore?: boolean;
  onSelect: () => void;
}

export interface FloatingActionMenuOptions {
  anchorEl?: HTMLElement;
  clientX?: number;
  clientY?: number;
  items: FloatingActionMenuItem[];
  onClose?: () => void;
}

let activeFloatingMenuCleanup: (() => void) | null = null;

/** Opens a fixed Redshift dark context/more menu anchored to a button or cursor position. */
export function openFloatingActionMenu(options: FloatingActionMenuOptions): () => void {
  activeFloatingMenuCleanup?.();

  const menu = document.createElement('div');
  menu.className = 'floating-action-menu';
  menu.setAttribute('role', 'menu');

  for (const item of options.items) {
    if (item.dividerBefore) {
      const divider = document.createElement('div');
      divider.className = 'floating-action-divider';
      divider.setAttribute('role', 'separator');
      menu.appendChild(divider);
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = item.danger
      ? 'floating-action-item floating-action-item--danger'
      : 'floating-action-item';
    btn.setAttribute('role', 'menuitem');
    btn.textContent = item.label;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      cleanup();
      item.onSelect();
    });
    menu.appendChild(btn);
  }

  document.body.appendChild(menu);

  const margin = 10;
  const menuRect = menu.getBoundingClientRect();
  let left = options.clientX ?? margin;
  let top = options.clientY ?? margin;

  if (options.anchorEl) {
    const rect = options.anchorEl.getBoundingClientRect();
    left = rect.right - menuRect.width;
    top = rect.bottom + 6;
    if (top + menuRect.height > window.innerHeight - margin) {
      top = Math.max(margin, rect.top - menuRect.height - 6);
    }
  } else {
    if (top + menuRect.height > window.innerHeight - margin) {
      top = Math.max(margin, window.innerHeight - menuRect.height - margin);
    }
  }

  left = Math.min(Math.max(margin, left), window.innerWidth - menuRect.width - margin);
  menu.style.left = `${Math.round(left)}px`;
  menu.style.top = `${Math.round(top)}px`;

  let closed = false;
  const onPointerDown = (e: Event) => {
    const target = e.target as Node | null;
    if (target && (menu.contains(target) || options.anchorEl?.contains(target))) {
      return;
    }
    cleanup();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      cleanup();
    }
  };

  const onViewportChange = () => cleanup();

  const cleanup = () => {
    if (closed) {
      return;
    }
    closed = true;
    window.removeEventListener('pointerdown', onPointerDown, true);
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('resize', onViewportChange);
    window.removeEventListener('scroll', onViewportChange, true);
    window.removeEventListener('redshift:close-floating-menus', onExternalMenu);
    menu.remove();
    if (activeFloatingMenuCleanup === cleanup) {
      activeFloatingMenuCleanup = null;
    }
    options.onClose?.();
  };

  const onExternalMenu = () => cleanup();

  activeFloatingMenuCleanup = cleanup;
  closeActiveContextMenu();
  window.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('resize', onViewportChange);
  window.addEventListener('scroll', onViewportChange, true);
  window.addEventListener('redshift:close-floating-menus', onExternalMenu);

  return cleanup;
}

/** Confirms and executes an unfriend or block action and applies the updated snapshot. */
export async function confirmFriendRelationAction(
  action: 'remove' | 'block',
  target: { username: string; displayName: string },
  onSnapshotUpdated: (snapshot: SocialSnapshot) => void,
): Promise<void> {
  const isBlock = action === 'block';
  const confirmed = await openConfirmPopup({
    title: isBlock ? `Block ${target.displayName}?` : `Remove '${target.displayName}'`,
    message: isBlock
      ? `Are you sure you want to block @${target.username}? This will remove them from your friends list and stop incoming messages or friend requests.`
      : `Are you sure you want to permanently remove @${target.username} from your friends?`,
    confirmLabel: isBlock ? 'Block' : 'Remove Friend',
    danger: true,
  });
  if (!confirmed) {
    return;
  }

  const res = isBlock
    ? await apiBlockUser(target.username)
    : await apiRemoveFriend(target.username);
  if (res.ok && res.snapshot) {
    onSnapshotUpdated(res.snapshot);
  }
}
