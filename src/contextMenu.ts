import {
  apiGetGifShareLink,
  apiMuteThread,
  getDeterministicGifShareUrl,
  resolveMediaUrl,
} from './apiClient';
import { getDesktopBridge } from './desktopBridge';
import { formatMuteRemaining, getThreadMuteUntil, THREAD_MUTE_OPTIONS } from './muteUtils';
import type { GifItem, SocialSnapshot } from './types';

export type MenuIconName =
  | 'reply'
  | 'forward'
  | 'edit'
  | 'pin'
  | 'unpin'
  | 'trash'
  | 'copy'
  | 'cut'
  | 'paste'
  | 'link'
  | 'download'
  | 'expand'
  | 'shrink'
  | 'star'
  | 'star-filled'
  | 'play'
  | 'speed'
  | 'bell'
  | 'bell-off'
  | 'eye'
  | 'eye-off'
  | 'check'
  | 'check-double'
  | 'phone'
  | 'phone-off'
  | 'user'
  | 'user-plus'
  | 'user-minus'
  | 'block'
  | 'settings'
  | 'mic'
  | 'mic-off'
  | 'headphones'
  | 'headphones-off'
  | 'camera'
  | 'screen'
  | 'pip'
  | 'message'
  | 'gif'
  | 'crown'
  | 'reset';

const MENU_ICON_PATHS: Record<MenuIconName, { d: string[]; fillCurrent?: boolean }> = {
  reply: { d: ['M9 14L4 9l5-5', 'M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11'] },
  forward: { d: ['M15 14l5-5-5-5', 'M20 9H9.5a5.5 5.5 0 0 0-5.5 5.5v0A5.5 5.5 0 0 0 9.5 20H13'] },
  edit: { d: ['M12 20h9', 'M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z'] },
  pin: { d: ['M12 17v5', 'M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6z'] },
  unpin: { d: ['M12 17v5', 'M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6z', 'M3 3l18 18'] },
  trash: {
    d: [
      'M3 6h18',
      'M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6',
      'M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2',
    ],
  },
  copy: {
    d: [
      'M9 9h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V11a2 2 0 0 1 2-2z',
      'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
    ],
  },
  cut: {
    d: [
      'M6 6a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
      'M6 12a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
      'M20 4L8.12 15.88',
      'M14.47 14.48L20 20',
      'M8.12 8.12L12 12',
    ],
  },
  paste: {
    d: [
      'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
      'M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z',
    ],
  },
  link: {
    d: [
      'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71',
      'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
    ],
  },
  download: { d: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M7 10l5 5 5-5', 'M12 15V3'] },
  expand: {
    d: ['M15 3h6v6', 'M9 21H3v-6', 'M21 3l-7 7', 'M3 21l7-7'],
  },
  shrink: {
    d: ['M4 14h6v6', 'M20 10h-6V4', 'M14 10l7-7', 'M3 21l7-7'],
  },
  star: {
    d: ['M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z'],
  },
  'star-filled': {
    d: ['M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z'],
    fillCurrent: true,
  },
  play: { d: ['M6 4l14 8-14 8V4z'] },
  speed: { d: ['M12 13l4-4', 'M5.6 18.4A9 9 0 1 1 18.4 18.4'] },
  bell: { d: ['M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9', 'M13.73 21a2 2 0 0 1-3.46 0'] },
  'bell-off': {
    d: [
      'M13.73 21a2 2 0 0 1-3.46 0',
      'M18.63 13A17.9 17.9 0 0 1 18 8',
      'M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14',
      'M18 8a6 6 0 0 0-9.33-5',
      'M2 2l20 20',
    ],
  },
  eye: {
    d: [
      'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z',
      'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    ],
  },
  'eye-off': {
    d: [
      'M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94',
      'M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19',
      'M1 1l22 22',
    ],
  },
  check: { d: ['M5 13l4 4L19 7'] },
  'check-double': { d: ['M2 12l5 5L18 6', 'M9 12l5 5L23 6'] },
  phone: {
    d: [
      'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.58 2.81.7A2 2 0 0 1 22 16.92z',
    ],
  },
  'phone-off': {
    d: [
      'M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.58 2.81.7A2 2 0 0 1 22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07',
      'M14.5 2.5h.01',
      'M2 2l20 20',
      'M5.09 5.09A19.79 19.79 0 0 0 2 13.5 2 2 0 0 0 4 15.5',
    ],
  },
  user: { d: ['M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2', 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'] },
  'user-plus': {
    d: [
      'M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2',
      'M8.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
      'M20 8v6',
      'M23 11h-6',
    ],
  },
  'user-minus': {
    d: [
      'M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2',
      'M8.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
      'M23 11h-6',
    ],
  },
  block: { d: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M4.93 4.93l14.14 14.14'] },
  settings: {
    d: [
      'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
      'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.78 1 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
    ],
  },
  mic: { d: ['M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z', 'M19 10v2a7 7 0 0 1-14 0v-2', 'M12 19v3'] },
  'mic-off': {
    d: [
      'M9 9v3a3 3 0 0 0 5.12 2.12',
      'M15 9.34V5a3 3 0 0 0-5.94-.6',
      'M17 16.95A7 7 0 0 1 5 12v-2',
      'M19 10v2c0 .84-.15 1.65-.42 2.4',
      'M12 19v3',
      'M2 2l20 20',
    ],
  },
  headphones: {
    d: ['M3 18v-6a9 9 0 0 1 18 0v6', 'M21 19a2 2 0 0 1-2 2h-1v-6h3v4z', 'M3 19a2 2 0 0 0 2 2h1v-6H3v4z'],
  },
  'headphones-off': {
    d: ['M3 18v-6a9 9 0 0 1 14.5-7', 'M21 12v6', 'M3 19a2 2 0 0 0 2 2h1v-6H3v4z', 'M2 2l20 20'],
  },
  camera: {
    d: ['M23 7l-7 5 7 5V7z', 'M14 5H3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z'],
  },
  screen: {
    d: ['M20 3H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z', 'M8 21h8', 'M12 18v3'],
  },
  pip: {
    d: ['M21 3H3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z', 'M12 12h7v5h-7v-5z'],
  },
  message: { d: ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'] },
  gif: {
    d: ['M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z', 'M7 10h2v4H7', 'M12 10v4', 'M15 10h2', 'M15 12h1.5'],
  },
  crown: {
    d: ['M3 18h18l-2-10-4.5 4L12 5l-2.5 7L5 8l-2 10z'],
  },
  reset: { d: ['M3 12a9 9 0 1 0 3-6.7L3 8', 'M3 3v5h5'] },
};

/** Builds a clean 15px SVG icon for context menu items. */
export function createMenuIconSvg(name: MenuIconName, size = 15): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const def = MENU_ICON_PATHS[name];
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', def.fillCurrent ? 'currentColor' : 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of def.d) {
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
  }
  return svg;
}

/** Copies text to the clipboard with Electron native + fallback support. */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) {
    return false;
  }
  const bridge = getDesktopBridge();
  if (bridge?.writeClipboardText) {
    try {
      const res = await bridge.writeClipboardText(text);
      if (res?.ok) {
        return true;
      }
    } catch {
      // Fall through to web clipboard.
    }
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to execCommand fallback.
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    ta.style.pointerEvents = 'none';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

/** Reads plain text from the clipboard (Electron native IPC first, then browser Clipboard API). */
export async function readTextFromClipboard(): Promise<string> {
  const bridge = getDesktopBridge();
  if (bridge?.readClipboardText) {
    try {
      const text = await bridge.readClipboardText();
      if (typeof text === 'string') {
        return text;
      }
    } catch {
      // Fall through to web clipboard.
    }
  }
  try {
    if (navigator.clipboard?.readText) {
      return await navigator.clipboard.readText();
    }
  } catch {
    // Ignore permission errors.
  }
  return '';
}

/** Reads a pasted image from the clipboard as a File if available. */
export async function readImageFileFromClipboard(): Promise<File | null> {
  const bridge = getDesktopBridge();
  if (bridge?.readClipboardImageDataUrl) {
    try {
      const dataUrl = await bridge.readClipboardImageDataUrl();
      if (dataUrl && dataUrl.startsWith('data:image/')) {
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        if (blob.size > 0) {
          return new File([blob], `pasted-image-${Date.now()}.png`, {
            type: blob.type || 'image/png',
          });
        }
      }
    } catch {
      // Fall through to web clipboard.
    }
  }
  try {
    if (navigator.clipboard?.read) {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imgType = item.types.find((t) => t.startsWith('image/'));
        if (imgType) {
          const blob = await item.getType(imgType);
          if (blob.size > 0) {
            const ext = imgType.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'png';
            return new File([blob], `pasted-image-${Date.now()}.${ext}`, { type: imgType });
          }
        }
      }
    }
  } catch {
    // Ignore permission errors.
  }
  return null;
}

/** Copies the actual image bitmap to the OS clipboard (works in Electron & modern browsers). */
export async function copyImageToClipboard(rawUrl: string): Promise<boolean> {
  const resolved = resolveMediaUrl(rawUrl);
  if (!resolved) {
    return false;
  }
  const absUrl = resolved.startsWith('data:') || resolved.startsWith('blob:')
    ? resolved
    : new URL(resolved, window.location.origin).href;

  const bridge = getDesktopBridge();
  if (bridge?.copyImageFromUrl && !absUrl.startsWith('blob:')) {
    try {
      const res = await bridge.copyImageFromUrl(absUrl);
      if (res?.ok) {
        return true;
      }
    } catch {
      // Fall through to canvas clipboard copy.
    }
  }

  try {
    const resp = await fetch(absUrl);
    if (!resp.ok) {
      return false;
    }
    const rawBlob = await resp.blob();
    if (rawBlob.type === 'image/png' && typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': rawBlob })]);
      return true;
    }
    const bitmapUrl = URL.createObjectURL(rawBlob);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.crossOrigin = 'anonymous';
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('Image decode failed'));
        el.src = bitmapUrl;
      });
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width || 1;
      canvas.height = img.naturalHeight || img.height || 1;
      const ctx = canvas.getContext('2d');
      if (!ctx) return false;
      ctx.drawImage(img, 0, 0);
      const pngBlob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/png'),
      );
      if (!pngBlob) return false;
      if (bridge?.copyImageFromUrl) {
        const dataUrl = canvas.toDataURL('image/png');
        const res = await bridge.copyImageFromUrl(dataUrl);
        if (res?.ok) return true;
      }
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
        return true;
      }
    } finally {
      URL.revokeObjectURL(bitmapUrl);
    }
  } catch {
    // Ignore failures.
  }
  return false;
}

function isEditableTextControl(el: EventTarget | null): el is HTMLInputElement | HTMLTextAreaElement {
  if (el instanceof HTMLTextAreaElement) {
    return !el.disabled;
  }
  if (el instanceof HTMLInputElement) {
    const t = (el.type || 'text').toLowerCase();
    return (
      !el.disabled &&
      (t === 'text' || t === 'search' || t === 'email' || t === 'password' || t === 'url' || t === 'tel')
    );
  }
  return false;
}

/** Attaches a Redshift right-click context menu (Cut, Copy, Paste, Select All) to all text boxes. */
export function attachGlobalEditableContextMenu(): () => void {
  const onContextMenu = (e: MouseEvent) => {
    if (e.defaultPrevented) {
      return;
    }
    const target = e.target;
    if (!isEditableTextControl(target)) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();

    const start = target.selectionStart ?? 0;
    const end = target.selectionEnd ?? 0;
    const selectedText = end > start ? target.value.slice(start, end) : '';
    const canEdit = !target.readOnly && !target.disabled;
    const items: ContextMenuItem[] = [];

    if (selectedText && canEdit) {
      items.push({
        label: 'Cut',
        icon: 'cut',
        hint: 'Ctrl+X',
        onSelect: () => {
          void copyToClipboard(selectedText);
          target.focus();
          target.setRangeText('', start, end, 'end');
          target.dispatchEvent(new Event('input', { bubbles: true }));
        },
      });
    }

    if (selectedText) {
      items.push({
        label: 'Copy',
        icon: 'copy',
        hint: 'Ctrl+C',
        onSelect: () => {
          void copyToClipboard(selectedText);
          target.focus();
        },
      });
    }

    if (canEdit) {
      items.push({
        label: 'Paste',
        icon: 'paste',
        hint: 'Ctrl+V',
        onSelect: async () => {
          target.focus();
          const text = await readTextFromClipboard();
          if (text) {
            const curStart = target.selectionStart ?? start;
            const curEnd = target.selectionEnd ?? end;
            target.setRangeText(text, curStart, curEnd, 'end');
            target.dispatchEvent(new Event('input', { bubbles: true }));
            return;
          }
          const imgFile = await readImageFileFromClipboard();
          if (imgFile) {
            target.dispatchEvent(
              new CustomEvent('redshift:paste-file', {
                bubbles: true,
                detail: { file: imgFile },
              }),
            );
          }
        },
      });
    }

    if (target.value.length > 0) {
      items.push({
        label: 'Select All',
        icon: 'check',
        hint: 'Ctrl+A',
        dividerBefore: items.length > 0,
        onSelect: () => {
          target.focus();
          target.select();
        },
      });
    }

    if (items.length === 0) {
      return;
    }

    openContextMenu({
      clientX: e.clientX,
      clientY: e.clientY,
      minWidth: 186,
      items,
    });
  };

  document.addEventListener('contextmenu', onContextMenu);
  return () => {
    document.removeEventListener('contextmenu', onContextMenu);
  };
}

/** Triggers a browser download for a file or media attachment URL. */
export function triggerDownload(href: string, filename: string): void {
  const link = document.createElement('a');
  link.href = href;
  link.download = filename || 'attachment';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/** Copies a GIF's unique Redshift /gif/<code> shareable URL to the clipboard. */
export async function copyGifShareLinkToClipboard(gif: GifItem): Promise<string | null> {
  const direct = getDeterministicGifShareUrl(gif);
  if (direct) {
    const copied = await copyToClipboard(direct);
    return copied ? direct : null;
  }
  const res = await apiGetGifShareLink(gif);
  if (!res.ok || !res.url) {
    return null;
  }
  const copied = await copyToClipboard(res.url);
  return copied ? res.url : null;
}

export interface ContextMenuItem {
  label: string;
  icon?: MenuIconName | SVGElement;
  hint?: string;
  checked?: boolean;
  disabled?: boolean;
  danger?: boolean;
  dividerBefore?: boolean;
  closeOnSelect?: boolean;
  children?: ContextMenuItem[];
  onSelect?: (buttonEl: HTMLButtonElement) => void;
}

export interface ContextMenuOptions {
  anchorEl?: HTMLElement;
  clientX?: number;
  clientY?: number;
  minWidth?: number;
  headerWidget?: HTMLElement;
  items: ContextMenuItem[];
  onClose?: () => void;
}

let activeContextMenuCleanup: (() => void) | null = null;

/** Closes any currently open rich right-click context menu. */
export function closeActiveContextMenu(): void {
  if (activeContextMenuCleanup) {
    activeContextMenuCleanup();
  }
}

function clampMenuPosition(
  panel: HTMLElement,
  desiredLeft: number,
  desiredTop: number,
  margin = 10,
): { left: number; top: number } {
  const rect = panel.getBoundingClientRect();
  let left = desiredLeft;
  let top = desiredTop;

  if (left + rect.width > window.innerWidth - margin) {
    left = Math.max(margin, window.innerWidth - rect.width - margin);
  }
  if (top + rect.height > window.innerHeight - margin) {
    top = Math.max(margin, window.innerHeight - rect.height - margin);
  }
  if (left < margin) {
    left = margin;
  }
  if (top < margin) {
    top = margin;
  }
  return { left, top };
}

/** Builds standardized "Mute Notifications ▶" + "Unmute Notifications" menu entries for DMs and Groups. */
export function buildMuteMenuEntries(
  snapshot: SocialSnapshot | null | undefined,
  threadKey: string,
  onSnapshotUpdated: (snapshot: SocialSnapshot) => void,
): ContextMenuItem[] {
  const activeMute = getThreadMuteUntil(snapshot, threadKey);
  const isMentionsOnly = activeMute === -2;
  const isFullyMuted = activeMute !== null && !isMentionsOnly;
  const applyMute = (muteUntil: number | null) => {
    void apiMuteThread(threadKey, muteUntil).then((res) => {
      if (res.ok && res.snapshot) {
        onSnapshotUpdated(res.snapshot);
      }
    });
  };

  const durationChildren: ContextMenuItem[] = THREAD_MUTE_OPTIONS.map((opt) => ({
    label: opt.label,
    checked: opt.id === 'forever' && activeMute === -1,
    onSelect: () => applyMute(opt.computeUntil()),
  }));

  const result: ContextMenuItem[] = [];
  if (activeMute !== null) {
    result.push({
      label: 'Turn On Notifications',
      icon: 'bell',
      hint: formatMuteRemaining(activeMute),
      onSelect: () => applyMute(null),
    });
  }
  result.push({
    label: 'Only @mentions',
    icon: isMentionsOnly ? 'check' : 'message',
    checked: isMentionsOnly,
    onSelect: () => applyMute(isMentionsOnly ? null : -2),
  });
  result.push({
    label: isFullyMuted ? 'Mute Duration' : 'Mute Notifications',
    icon: 'bell-off',
    hint: isFullyMuted ? formatMuteRemaining(activeMute!) : undefined,
    children: durationChildren,
  });
  return result;
}

/**
 * Opens a Discord-style floating context menu with icons, checked toggles, hints,
 * custom header widgets (quick-react bar, volume slider), cascading submenus, and keyboard navigation.
 */
export function openContextMenu(options: ContextMenuOptions): () => void {
  closeActiveContextMenu();
  window.dispatchEvent(new CustomEvent('redshift:close-floating-menus'));

  let closed = false;
  const openPanels: HTMLElement[] = [];
  let activeSubmenuPanel: HTMLElement | null = null;
  let activeSubmenuTrigger: HTMLButtonElement | null = null;
  let hoverOpenTimer: number | null = null;
  let hoverCloseTimer: number | null = null;

  const clearHoverTimers = () => {
    if (hoverOpenTimer !== null) {
      window.clearTimeout(hoverOpenTimer);
      hoverOpenTimer = null;
    }
    if (hoverCloseTimer !== null) {
      window.clearTimeout(hoverCloseTimer);
      hoverCloseTimer = null;
    }
  };

  const closeSubmenu = () => {
    clearHoverTimers();
    if (activeSubmenuTrigger) {
      activeSubmenuTrigger.classList.remove('floating-action-item--submenu-open');
      activeSubmenuTrigger.setAttribute('aria-expanded', 'false');
      activeSubmenuTrigger = null;
    }
    if (activeSubmenuPanel) {
      const idx = openPanels.indexOf(activeSubmenuPanel);
      if (idx >= 0) {
        openPanels.splice(idx, 1);
      }
      activeSubmenuPanel.remove();
      activeSubmenuPanel = null;
    }
  };

  const renderPanel = (
    items: ContextMenuItem[],
    isSubmenu: boolean,
    headerWidget?: HTMLElement,
  ): { panel: HTMLDivElement; buttons: HTMLButtonElement[] } => {
    const panel = document.createElement('div');
    panel.className = isSubmenu
      ? 'floating-action-menu floating-action-submenu'
      : 'floating-action-menu ctx-menu-panel';
    panel.setAttribute('role', 'menu');
    if (options.minWidth) {
      panel.style.minWidth = `${options.minWidth}px`;
    }

    if (!isSubmenu && headerWidget) {
      const widgetHost = document.createElement('div');
      widgetHost.className = 'ctx-menu-header-widget';
      widgetHost.appendChild(headerWidget);
      panel.appendChild(widgetHost);
      if (items.length > 0) {
        const div = document.createElement('div');
        div.className = 'floating-action-divider';
        panel.appendChild(div);
      }
    }

    const buttons: HTMLButtonElement[] = [];

    items.forEach((item, index) => {
      if (item.dividerBefore && index > 0) {
        const divider = document.createElement('div');
        divider.className = 'floating-action-divider';
        panel.appendChild(divider);
      }

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'floating-action-item ctx-menu-item';
      btn.setAttribute('role', item.checked !== undefined ? 'menuitemcheckbox' : 'menuitem');
      if (item.checked !== undefined) {
        btn.setAttribute('aria-checked', String(Boolean(item.checked)));
      }
      if (item.danger) {
        btn.classList.add('floating-action-item--danger');
      }
      if (item.disabled) {
        btn.disabled = true;
        btn.classList.add('ctx-menu-item--disabled');
      }

      const iconSlot = document.createElement('span');
      iconSlot.className = 'ctx-menu-item-icon';
      if (item.icon) {
        iconSlot.appendChild(
          typeof item.icon === 'string' ? createMenuIconSvg(item.icon, 15) : item.icon,
        );
      } else if (item.checked) {
        iconSlot.appendChild(createMenuIconSvg('check', 15));
      }
      btn.appendChild(iconSlot);

      const labelEl = document.createElement('span');
      labelEl.className = 'ctx-menu-item-label';
      labelEl.textContent = item.label;
      btn.appendChild(labelEl);

      if (item.hint) {
        const hintEl = document.createElement('span');
        hintEl.className = 'ctx-menu-item-hint';
        hintEl.textContent = item.hint;
        btn.appendChild(hintEl);
      }

      if (item.children && item.children.length > 0) {
        btn.setAttribute('aria-haspopup', 'menu');
        btn.setAttribute('aria-expanded', 'false');
        const arrow = document.createElement('span');
        arrow.className = 'ctx-menu-item-arrow';
        arrow.textContent = '▸';
        btn.appendChild(arrow);

        const openThisSubmenu = (focusFirstChild = false) => {
          if (closed || item.disabled) {
            return;
          }
          if (activeSubmenuTrigger === btn && activeSubmenuPanel) {
            if (focusFirstChild) {
              const firstEnabled = activeSubmenuPanel.querySelector<HTMLButtonElement>(
                '.ctx-menu-item:not(:disabled)',
              );
              firstEnabled?.focus();
            }
            return;
          }
          closeSubmenu();
          activeSubmenuTrigger = btn;
          btn.classList.add('floating-action-item--submenu-open');
          btn.setAttribute('aria-expanded', 'true');

          const sub = renderPanel(item.children!, true);
          activeSubmenuPanel = sub.panel;
          openPanels.push(sub.panel);
          document.body.appendChild(sub.panel);

          const triggerRect = btn.getBoundingClientRect();
          const subRect = sub.panel.getBoundingClientRect();
          const margin = 10;
          let left = triggerRect.right + 4;
          if (left + subRect.width > window.innerWidth - margin) {
            left = Math.max(margin, triggerRect.left - subRect.width - 4);
          }
          let top = triggerRect.top - 4;
          const clamped = clampMenuPosition(sub.panel, left, top, margin);
          sub.panel.style.left = `${clamped.left}px`;
          sub.panel.style.top = `${clamped.top}px`;

          sub.panel.addEventListener('pointerenter', () => {
            if (hoverCloseTimer !== null) {
              window.clearTimeout(hoverCloseTimer);
              hoverCloseTimer = null;
            }
          });
          sub.panel.addEventListener('pointerleave', () => {
            if (hoverCloseTimer !== null) {
              window.clearTimeout(hoverCloseTimer);
            }
            hoverCloseTimer = window.setTimeout(() => {
              if (!activeSubmenuTrigger?.matches(':hover')) {
                closeSubmenu();
              }
            }, 140);
          });

          if (focusFirstChild) {
            const firstEnabled = sub.buttons.find((b) => !b.disabled);
            firstEnabled?.focus();
          }
        };

        btn.addEventListener('pointerenter', () => {
          clearHoverTimers();
          hoverOpenTimer = window.setTimeout(() => openThisSubmenu(false), 65);
        });
        btn.addEventListener('pointerleave', () => {
          if (hoverOpenTimer !== null) {
            window.clearTimeout(hoverOpenTimer);
            hoverOpenTimer = null;
          }
          hoverCloseTimer = window.setTimeout(() => {
            if (!activeSubmenuPanel?.matches(':hover') && !btn.matches(':hover')) {
              closeSubmenu();
            }
          }, 140);
        });
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          openThisSubmenu(true);
        });
        (btn as HTMLButtonElement & { _openSubmenu?: (f: boolean) => void })._openSubmenu =
          openThisSubmenu;
      } else {
        if (!isSubmenu) {
          btn.addEventListener('pointerenter', () => {
            if (hoverOpenTimer !== null) {
              window.clearTimeout(hoverOpenTimer);
              hoverOpenTimer = null;
            }
            if (activeSubmenuPanel) {
              hoverCloseTimer = window.setTimeout(() => closeSubmenu(), 80);
            }
          });
        }

        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (item.disabled) {
            return;
          }
          const shouldClose = item.closeOnSelect !== false;
          if (shouldClose) {
            cleanup();
          }
          item.onSelect?.(btn);
          if (!shouldClose && item.checked !== undefined) {
            item.checked = !item.checked;
            btn.setAttribute('aria-checked', String(item.checked));
            if (!item.icon) {
              iconSlot.replaceChildren(
                ...(item.checked ? [createMenuIconSvg('check', 15)] : []),
              );
            }
          }
        });
      }

      buttons.push(btn);
      panel.appendChild(btn);
    });

    return { panel, buttons };
  };

  const root = renderPanel(options.items, false, options.headerWidget);
  openPanels.push(root.panel);
  document.body.appendChild(root.panel);

  const margin = 10;
  let desiredLeft = options.clientX ?? margin;
  let desiredTop = options.clientY ?? margin;
  if (options.anchorEl) {
    const aRect = options.anchorEl.getBoundingClientRect();
    desiredLeft = aRect.left;
    desiredTop = aRect.bottom + 6;
    const pRect = root.panel.getBoundingClientRect();
    if (desiredTop + pRect.height > window.innerHeight - margin && aRect.top - pRect.height - 6 >= margin) {
      desiredTop = aRect.top - pRect.height - 6;
    }
  }
  const pos = clampMenuPosition(root.panel, desiredLeft, desiredTop, margin);
  root.panel.style.left = `${pos.left}px`;
  root.panel.style.top = `${pos.top}px`;

  const onPointerDown = (e: PointerEvent) => {
    const target = e.target as Node | null;
    if (target && openPanels.some((p) => p.contains(target))) {
      return;
    }
    cleanup();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const focused = document.activeElement as HTMLButtonElement | null;
    const inSub = Boolean(focused && activeSubmenuPanel?.contains(focused));
    const activeContainer = inSub && activeSubmenuPanel ? activeSubmenuPanel : root.panel;
    const btns = Array.from(
      activeContainer.querySelectorAll<HTMLButtonElement>('.ctx-menu-item:not(:disabled)'),
    );

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (inSub && activeSubmenuTrigger) {
        const parentBtn = activeSubmenuTrigger;
        closeSubmenu();
        parentBtn.focus();
      } else {
        cleanup();
      }
      return;
    }

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (btns.length === 0) {
        return;
      }
      e.preventDefault();
      const idx = focused ? btns.indexOf(focused) : -1;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      const nextIdx =
        idx < 0 ? (step > 0 ? 0 : btns.length - 1) : (idx + step + btns.length) % btns.length;
      btns[nextIdx].focus();
      return;
    }

    if (e.key === 'ArrowRight' && focused) {
      const opener = (focused as HTMLButtonElement & { _openSubmenu?: (f: boolean) => void })
        ._openSubmenu;
      if (opener) {
        e.preventDefault();
        opener(true);
      }
      return;
    }

    if (e.key === 'ArrowLeft' && inSub && activeSubmenuTrigger) {
      e.preventDefault();
      const parentBtn = activeSubmenuTrigger;
      closeSubmenu();
      parentBtn.focus();
    }
  };

  const onViewportScroll = (e: Event) => {
    const target = e.target as Node | null;
    if (target && openPanels.some((p) => p.contains(target))) {
      return;
    }
    cleanup();
  };

  const onViewportResize = () => cleanup();

  const cleanup = () => {
    if (closed) {
      return;
    }
    closed = true;
    clearHoverTimers();
    closeSubmenu();
    window.removeEventListener('pointerdown', onPointerDown, true);
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('resize', onViewportResize);
    window.removeEventListener('scroll', onViewportScroll, true);
    for (const p of openPanels) {
      p.remove();
    }
    openPanels.length = 0;
    if (activeContextMenuCleanup === cleanup) {
      activeContextMenuCleanup = null;
    }
    options.onClose?.();
  };

  const scrollBindTimer = window.setTimeout(() => {
    if (!closed) {
      window.addEventListener('scroll', onViewportScroll, true);
    }
  }, 120);

  const origCleanup = cleanup;
  activeContextMenuCleanup = () => {
    window.clearTimeout(scrollBindTimer);
    origCleanup();
  };
  window.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('resize', onViewportResize);

  return activeContextMenuCleanup;
}
