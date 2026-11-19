import { validateAvatarFile } from './apiClient';
import { attachImageDropZone, createImageDropOverlay } from './chatUi';
import { isModalConfirmShortcut, isTopmostModal } from './modalShortcuts';

export interface AvatarChangeResult {
  avatarPreset: number | null;
  avatarUrl: string;
}

export interface BannerChangeResult {
  bannerColor?: string;
  bannerDataUrl?: string;
}

interface AvatarFlowOptions {
  currentPresetIndex: number | null;
  currentAvatarUrl: string;
  presetAvatars: string[];
  onApply: (result: AvatarChangeResult) => void;
}

interface BannerFlowOptions {
  currentBannerColor?: string;
  currentBannerDataUrl?: string;
  onApply: (result: BannerChangeResult) => void;
}

interface CropStepOptions {
  backdrop: HTMLDivElement;
  title: string;
  subtitle: string;
  imageSrc: string;
  viewW: number;
  viewH: number;
  exportW: number;
  exportH: number;
  maskShape: 'circle' | 'rect';
  zoomAriaLabel: string;
  wideModal?: boolean;
  onCancel: () => void;
  onError: (msg: string) => void;
  onAcceptCropped: (dataUrl: string, transformed: boolean) => void;
}

const AVATAR_CROP_SIZE = 220;
const AVATAR_EXPORT_SIZE = 256;
const BANNER_CROP_W = 330;
const BANNER_CROP_H = 110;
const BANNER_EXPORT_W = 840;
const BANNER_EXPORT_H = 280;
const MAX_BANNER_EXPORT_CHARS = 2_200_000;

export const DEFAULT_BANNER_GRADIENT =
  'linear-gradient(135deg, #2d161b 0%, #521922 50%, #221723 100%)';

export const PRESET_BANNER_COLORS = [
  '#4b1821',
  '#c92a35',
  '#d95b43',
  '#c78d20',
  '#1f8a5b',
  '#2672b8',
  '#4f46b5',
  '#8e3ea3',
  '#2b2e3a',
];

export function applyBannerBackground(
  el: HTMLElement,
  banner: { bannerColor?: string; bannerDataUrl?: string },
): void {
  el.style.backgroundSize = '';
  el.style.backgroundPosition = '';
  el.style.backgroundRepeat = '';

  if (banner.bannerDataUrl) {
    el.style.backgroundColor = '#1b1d24';
    el.style.backgroundImage = `url("${banner.bannerDataUrl}")`;
    el.style.backgroundSize = 'cover';
    el.style.backgroundPosition = 'center';
    el.style.backgroundRepeat = 'no-repeat';
    return;
  }

  if (banner.bannerColor) {
    el.style.backgroundColor = banner.bannerColor;
    el.style.backgroundImage =
      'linear-gradient(180deg, rgba(255, 255, 255, 0.08) 0%, rgba(0, 0, 0, 0.24) 100%)';
    return;
  }

  el.style.backgroundColor = '#2d161b';
  el.style.backgroundImage = DEFAULT_BANNER_GRADIENT;
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(Math.max(val, min), max);
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image'));
    img.src = src;
  });
}

function computeRectCropGeometry(
  imgW: number,
  imgH: number,
  viewW: number,
  viewH: number,
  zoom: number,
  offsetX: number,
  offsetY: number,
) {
  const safeW = Math.max(1, imgW);
  const safeH = Math.max(1, imgH);
  // Cover-fit ensures even tall/square images fill the crop box without gaps outside image bounds.
  const baseScale = Math.max(viewW / safeW, viewH / safeH);
  const scale = baseScale * zoom;
  const dispW = safeW * scale;
  const dispH = safeH * scale;
  const maxOffsetX = Math.max(0, (dispW - viewW) / 2);
  const maxOffsetY = Math.max(0, (dispH - viewH) / 2);
  const clampedX = clamp(offsetX, -maxOffsetX, maxOffsetX);
  const clampedY = clamp(offsetY, -maxOffsetY, maxOffsetY);
  const left = (viewW - dispW) / 2 + clampedX;
  const top = (viewH - dispH) / 2 + clampedY;

  return { dispW, dispH, left, top, clampedX, clampedY };
}

function encodeCroppedCanvas(
  canvas: HTMLCanvasElement,
  maskShape: 'circle' | 'rect',
): string {
  if (maskShape === 'circle') {
    return canvas.toDataURL('image/png');
  }
  let out = canvas.toDataURL('image/webp', 0.9);
  if (!out.startsWith('data:image/webp') || out.length > MAX_BANNER_EXPORT_CHARS) {
    out = canvas.toDataURL('image/jpeg', 0.88);
  }
  if (out.length > MAX_BANNER_EXPORT_CHARS) {
    out = canvas.toDataURL('image/jpeg', 0.72);
  }
  return out;
}

async function runImageCropStep(opts: CropStepOptions): Promise<void> {
  let loadedImg: HTMLImageElement;
  try {
    loadedImg = await loadImageElement(opts.imageSrc);
  } catch {
    opts.onError('Error: Could not load image for cropping');
    return;
  }

  if (!opts.backdrop.isConnected) {
    return;
  }

  opts.backdrop.classList.add('modal-backdrop--deep');
  opts.backdrop.replaceChildren();

  const card = document.createElement('div');
  card.className = opts.wideModal
    ? 'modal-card modal-card--crop modal-card--banner-crop'
    : 'modal-card modal-card--crop';

  const titleEl = document.createElement('h2');
  titleEl.className = 'modal-title';
  titleEl.textContent = opts.title;
  card.appendChild(titleEl);

  const subtitleEl = document.createElement('p');
  subtitleEl.className = 'modal-subtitle';
  subtitleEl.textContent = opts.subtitle;
  card.appendChild(subtitleEl);

  const cropWrap = document.createElement('div');
  cropWrap.className = opts.wideModal ? 'crop-stage crop-stage--wide' : 'crop-stage';

  const canvas = document.createElement('canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = opts.viewW * dpr;
  canvas.height = opts.viewH * dpr;
  canvas.className = opts.wideModal ? 'crop-canvas crop-canvas--wide' : 'crop-canvas';
  cropWrap.appendChild(canvas);
  card.appendChild(cropWrap);

  let zoom = 1;
  let offsetX = 0;
  let offsetY = 0;

  const imgW = loadedImg.naturalWidth || loadedImg.width;
  const imgH = loadedImg.naturalHeight || loadedImg.height;

  const sliderRow = document.createElement('div');
  sliderRow.className = 'crop-slider-row';

  const minLabel = document.createElement('span');
  minLabel.className = 'crop-zoom-label';
  minLabel.textContent = '1.0x';

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '1';
  slider.max = '3';
  slider.step = '0.01';
  slider.value = '1';
  slider.className = 'crop-slider';
  slider.setAttribute('aria-label', opts.zoomAriaLabel);

  const valueLabel = document.createElement('span');
  valueLabel.className = 'crop-zoom-value';
  valueLabel.textContent = '1.0x';

  sliderRow.appendChild(minLabel);
  sliderRow.appendChild(slider);
  sliderRow.appendChild(valueLabel);
  card.appendChild(sliderRow);

  const drawPreview = () => {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    const geom = computeRectCropGeometry(
      imgW,
      imgH,
      opts.viewW,
      opts.viewH,
      zoom,
      offsetX,
      offsetY,
    );
    offsetX = geom.clampedX;
    offsetY = geom.clampedY;

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, opts.viewW, opts.viewH);
    ctx.fillStyle = '#0f1014';
    ctx.fillRect(0, 0, opts.viewW, opts.viewH);

    ctx.drawImage(loadedImg, geom.left, geom.top, geom.dispW, geom.dispH);

    if (opts.maskShape === 'circle') {
      const center = opts.viewW / 2;
      const radius = center - 4;
      ctx.beginPath();
      ctx.rect(0, 0, opts.viewW, opts.viewH);
      ctx.arc(center, center, radius, 0, Math.PI * 2, true);
      ctx.fillStyle = 'rgba(10, 11, 15, 0.68)';
      ctx.fill('evenodd');

      ctx.beginPath();
      ctx.arc(center, center, radius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(1, 1, opts.viewW - 2, opts.viewH - 2);
    }

    ctx.restore();
  };

  slider.addEventListener('input', () => {
    zoom = Number.parseFloat(slider.value) || 1;
    valueLabel.textContent = `${zoom.toFixed(1)}x`;
    drawPreview();
  });

  let activePointerId: number | null = null;
  let lastClientX = 0;
  let lastClientY = 0;

  canvas.addEventListener('pointerdown', (e) => {
    activePointerId = e.pointerId;
    lastClientX = e.clientX;
    lastClientY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('crop-canvas--dragging');
  });

  canvas.addEventListener('pointermove', (e) => {
    if (activePointerId !== e.pointerId) {
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width > 0 ? opts.viewW / rect.width : 1;
    const scaleY = rect.height > 0 ? opts.viewH / rect.height : 1;
    const dx = (e.clientX - lastClientX) * scaleX;
    const dy = (e.clientY - lastClientY) * scaleY;
    lastClientX = e.clientX;
    lastClientY = e.clientY;
    offsetX += dx;
    offsetY += dy;
    drawPreview();
  });

  const stopDrag = (e: PointerEvent) => {
    if (activePointerId !== e.pointerId) {
      return;
    }
    activePointerId = null;
    canvas.classList.remove('crop-canvas--dragging');
  };

  canvas.addEventListener('pointerup', stopDrag);
  canvas.addEventListener('pointercancel', stopDrag);

  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.12 : -0.12;
      zoom = clamp(zoom + delta, 1, 3);
      slider.value = zoom.toFixed(2);
      valueLabel.textContent = `${zoom.toFixed(1)}x`;
      drawPreview();
    },
    { passive: false },
  );

  const footer = document.createElement('div');
  footer.className = 'button-row modal-footer';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn-secondary';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', opts.onCancel);

  const acceptBtn = document.createElement('button');
  acceptBtn.type = 'button';
  acceptBtn.className = 'btn-primary';
  acceptBtn.textContent = 'Accept';
  acceptBtn.addEventListener('click', () => {
    const transformed =
      Math.abs(zoom - 1) >= 0.01 || Math.abs(offsetX) >= 1 || Math.abs(offsetY) >= 1;

    const outCanvas = document.createElement('canvas');
    outCanvas.width = opts.exportW;
    outCanvas.height = opts.exportH;
    const outCtx = outCanvas.getContext('2d');
    if (!outCtx) {
      opts.onAcceptCropped(opts.imageSrc, false);
      return;
    }

    const scaleX = opts.exportW / opts.viewW;
    const scaleY = opts.exportH / opts.viewH;
    const geom = computeRectCropGeometry(
      imgW,
      imgH,
      opts.exportW,
      opts.exportH,
      zoom,
      offsetX * scaleX,
      offsetY * scaleY,
    );
    outCtx.drawImage(loadedImg, geom.left, geom.top, geom.dispW, geom.dispH);

    const croppedDataUrl = encodeCroppedCanvas(outCanvas, opts.maskShape);
    opts.onAcceptCropped(croppedDataUrl, transformed);
  });

  footer.appendChild(cancelBtn);
  footer.appendChild(acceptBtn);
  card.appendChild(footer);

  opts.backdrop.appendChild(card);
  drawPreview();
}

function readImageFileForCrop(
  file: File,
  onSuccess: (dataUrl: string) => void,
  onError: (msg: string) => void,
): void {
  const validation = validateAvatarFile(file);
  if (!validation.ok) {
    onError(validation.error ?? 'Error: Invalid image file');
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = typeof reader.result === 'string' ? reader.result : '';
    if (!dataUrl) {
      onError('Error: Could not read selected image');
      return;
    }
    loadImageElement(dataUrl)
      .then(() => onSuccess(dataUrl))
      .catch(() => onError('Error: Selected file is not a valid image'));
  };
  reader.onerror = () => onError('Error: Could not read selected image');
  reader.readAsDataURL(file);
}

function createModalBackdrop(): { backdrop: HTMLDivElement; cleanup: () => void } {
  let closed = false;
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');

  const cleanup = () => {
    if (closed) {
      return;
    }
    closed = true;
    window.removeEventListener('keydown', onKeyDown, true);
    backdrop.classList.remove('modal-backdrop--visible');
    window.setTimeout(() => backdrop.remove(), 180);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!isTopmostModal(backdrop)) {
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      cleanup();
      return;
    }
    if (isModalConfirmShortcut(e, backdrop, { allowCtrlS: true })) {
      const primaryBtn = backdrop.querySelector<HTMLButtonElement>(
        '.modal-footer .btn-primary:not(:disabled)',
      );
      if (primaryBtn) {
        e.preventDefault();
        e.stopImmediatePropagation();
        primaryBtn.click();
      }
    }
  };

  window.addEventListener('keydown', onKeyDown, true);
  document.body.appendChild(backdrop);

  requestAnimationFrame(() => {
    if (!closed) {
      backdrop.classList.add('modal-backdrop--visible');
    }
  });

  return { backdrop, cleanup };
}

export function openAvatarChangeFlow(options: AvatarFlowOptions): void {
  let selectedPreset: number | null = options.currentPresetIndex;
  let selectedUrl: string = options.currentAvatarUrl;
  let errorText: string | null = null;
  const { backdrop, cleanup } = createModalBackdrop();

  const renderPickerStep = () => {
    backdrop.classList.remove('modal-backdrop--deep');
    backdrop.replaceChildren();

    const card = document.createElement('div');
    card.className = 'modal-card';

    const title = document.createElement('h2');
    title.className = 'modal-title';
    title.textContent = 'Change Profile Picture';
    card.appendChild(title);

    const previewWrap = document.createElement('div');
    previewWrap.className = 'avatar-preview-wrap avatar-preview-wrap--modal';

    const previewCircle = document.createElement('div');
    previewCircle.className = 'avatar-preview-circle';

    const previewImg = document.createElement('img');
    previewImg.className = 'avatar-preview-img';
    previewImg.src = selectedUrl;
    previewImg.alt = 'Selected profile picture preview';
    previewCircle.appendChild(previewImg);

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.hidden = true;

    const uploadBtn = document.createElement('button');
    uploadBtn.type = 'button';
    uploadBtn.className = 'avatar-upload-btn';
    uploadBtn.setAttribute('aria-label', 'Choose image file');
    uploadBtn.textContent = '+';
    uploadBtn.addEventListener('click', () => {
      fileInput.value = '';
      fileInput.click();
    });

    previewWrap.appendChild(previewCircle);
    previewWrap.appendChild(uploadBtn);
    previewWrap.appendChild(fileInput);
    card.appendChild(previewWrap);

    const presetsGrid = document.createElement('div');
    presetsGrid.className = 'avatar-presets-grid avatar-presets-grid--modal';
    const presetButtons: HTMLButtonElement[] = [];

    options.presetAvatars.forEach((url, index) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'avatar-preset-btn';
      if (selectedPreset === index) {
        btn.classList.add('avatar-preset-btn--active');
      }
      btn.setAttribute('aria-label', `Profile preset ${index + 1}`);

      const img = document.createElement('img');
      img.className = 'avatar-preset-img';
      img.src = url;
      img.alt = `Profile preset ${index + 1}`;
      btn.appendChild(img);

      btn.addEventListener('click', () => {
        selectedPreset = index;
        selectedUrl = url;
        errorText = null;
        previewImg.src = url;
        presetButtons.forEach((b, idx) =>
          b.classList.toggle('avatar-preset-btn--active', idx === index),
        );
        syncError();
      });

      presetButtons.push(btn);
      presetsGrid.appendChild(btn);
    });

    card.appendChild(presetsGrid);

    const errorSlot = document.createElement('div');
    errorSlot.className = 'modal-error-slot';
    const syncError = () => {
      errorSlot.replaceChildren();
      if (errorText) {
        const banner = document.createElement('div');
        banner.className = 'feedback-banner feedback-banner--error';
        banner.textContent = errorText;
        errorSlot.appendChild(banner);
      }
    };
    syncError();
    card.appendChild(errorSlot);

    const handlePickedAvatar = (file: File) => {
      readImageFileForCrop(
        file,
        (dataUrl) => {
          selectedPreset = null;
          selectedUrl = dataUrl;
          errorText = null;
          previewImg.src = dataUrl;
          presetButtons.forEach((b) => b.classList.remove('avatar-preset-btn--active'));
          syncError();
        },
        (msg) => {
          errorText = msg;
          syncError();
        },
      );
    };

    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (file) {
        handlePickedAvatar(file);
      }
    });

    const dropOverlay = createImageDropOverlay('Drop image to set avatar');
    card.appendChild(dropOverlay);
    attachImageDropZone(card, {
      overlayEl: dropOverlay,
      activeClass: 'modal-card--dragover',
      onFiles: (files) => {
        if (files[0]) {
          handlePickedAvatar(files[0]);
        }
      },
    });

    const footer = document.createElement('div');
    footer.className = 'button-row modal-footer';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn-secondary';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', cleanup);

    const acceptBtn = document.createElement('button');
    acceptBtn.type = 'button';
    acceptBtn.className = 'btn-primary';
    acceptBtn.textContent = 'Accept';
    acceptBtn.addEventListener('click', () => {
      void runImageCropStep({
        backdrop,
        title: 'Adjust Profile Picture',
        subtitle: 'Drag to position and use the slider to zoom.',
        imageSrc: selectedUrl,
        viewW: AVATAR_CROP_SIZE,
        viewH: AVATAR_CROP_SIZE,
        exportW: AVATAR_EXPORT_SIZE,
        exportH: AVATAR_EXPORT_SIZE,
        maskShape: 'circle',
        zoomAriaLabel: 'Zoom profile picture',
        onCancel: cleanup,
        onError: (msg) => {
          errorText = msg;
          renderPickerStep();
        },
        onAcceptCropped: (croppedDataUrl, transformed) => {
          if (selectedPreset !== null && !transformed) {
            options.onApply({ avatarPreset: selectedPreset, avatarUrl: selectedUrl });
          } else {
            options.onApply({ avatarPreset: null, avatarUrl: croppedDataUrl });
          }
          cleanup();
        },
      });
    });

    footer.appendChild(cancelBtn);
    footer.appendChild(acceptBtn);
    card.appendChild(footer);

    backdrop.appendChild(card);
  };

  renderPickerStep();
}

export function openBannerChangeFlow(options: BannerFlowOptions): void {
  let selectedColor: string | undefined = options.currentBannerColor;
  let selectedImageUrl: string | undefined = options.currentBannerDataUrl;
  let errorText: string | null = null;
  const { backdrop, cleanup } = createModalBackdrop();

  const renderPickerStep = () => {
    backdrop.classList.remove('modal-backdrop--deep');
    backdrop.replaceChildren();

    const card = document.createElement('div');
    card.className = 'modal-card modal-card--banner';

    const title = document.createElement('h2');
    title.className = 'modal-title';
    title.textContent = 'Change Profile Banner';
    card.appendChild(title);

    const subtitle = document.createElement('p');
    subtitle.className = 'modal-subtitle';
    subtitle.textContent = 'Choose a banner color or drop / upload a wide image to crop.';
    card.appendChild(subtitle);

    const previewBox = document.createElement('div');
    previewBox.className = 'banner-preview-rect';
    const syncPreviewBox = () => {
      applyBannerBackground(previewBox, {
        bannerColor: selectedColor,
        bannerDataUrl: selectedImageUrl,
      });
    };
    syncPreviewBox();

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.hidden = true;

    const previewActions = document.createElement('div');
    previewActions.className = 'banner-preview-actions';

    const uploadBtn = document.createElement('button');
    uploadBtn.type = 'button';
    uploadBtn.className = 'banner-overlay-btn';
    uploadBtn.textContent = selectedImageUrl ? 'Change Image' : '+ Upload Image';
    uploadBtn.addEventListener('click', () => {
      fileInput.value = '';
      fileInput.click();
    });
    previewActions.appendChild(uploadBtn);

    if (selectedImageUrl) {
      const clearImgBtn = document.createElement('button');
      clearImgBtn.type = 'button';
      clearImgBtn.className = 'banner-overlay-btn banner-overlay-btn--muted';
      clearImgBtn.textContent = 'Remove Image';
      clearImgBtn.addEventListener('click', () => {
        selectedImageUrl = undefined;
        errorText = null;
        renderPickerStep();
      });
      previewActions.appendChild(clearImgBtn);
    }

    previewBox.appendChild(previewActions);
    previewBox.appendChild(fileInput);
    card.appendChild(previewBox);

    const colorSection = document.createElement('div');
    colorSection.className = 'banner-color-section';

    const colorHeader = document.createElement('div');
    colorHeader.className = 'banner-color-header';

    const colorLabel = document.createElement('span');
    colorLabel.className = 'profile-section-label';
    colorLabel.textContent = 'Banner Color';
    colorHeader.appendChild(colorLabel);

    const resetColorBtn = document.createElement('button');
    resetColorBtn.type = 'button';
    resetColorBtn.className = 'banner-reset-link';
    resetColorBtn.textContent = 'Reset Default';
    resetColorBtn.addEventListener('click', () => {
      selectedColor = undefined;
      selectedImageUrl = undefined;
      errorText = null;
      renderPickerStep();
    });
    colorHeader.appendChild(resetColorBtn);
    colorSection.appendChild(colorHeader);

    const swatchesRow = document.createElement('div');
    swatchesRow.className = 'banner-color-swatches';

    const swatchBtns: HTMLButtonElement[] = [];
    for (const hex of PRESET_BANNER_COLORS) {
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = 'banner-swatch-btn';
      swatch.style.backgroundColor = hex;
      swatch.title = hex;
      swatch.setAttribute('aria-label', `Select banner color ${hex}`);
      if (!selectedImageUrl && selectedColor?.toLowerCase() === hex.toLowerCase()) {
        swatch.classList.add('banner-swatch-btn--active');
      }
      swatch.addEventListener('click', () => {
        selectedColor = hex;
        selectedImageUrl = undefined;
        errorText = null;
        renderPickerStep();
      });
      swatchBtns.push(swatch);
      swatchesRow.appendChild(swatch);
    }

    const customWrap = document.createElement('label');
    customWrap.className = 'banner-custom-color-wrap';
    customWrap.title = 'Pick custom color';

    const customInput = document.createElement('input');
    customInput.type = 'color';
    customInput.className = 'banner-custom-color-input';
    customInput.value = selectedColor ?? '#4b1821';
    customInput.setAttribute('aria-label', 'Pick custom banner color');
    customInput.addEventListener('input', () => {
      selectedColor = customInput.value.toLowerCase();
      selectedImageUrl = undefined;
      errorText = null;
      swatchBtns.forEach((b) => b.classList.remove('banner-swatch-btn--active'));
      syncPreviewBox();
    });

    const customText = document.createElement('span');
    customText.className = 'banner-custom-color-label';
    customText.textContent = 'Custom';

    customWrap.appendChild(customInput);
    customWrap.appendChild(customText);
    swatchesRow.appendChild(customWrap);

    colorSection.appendChild(swatchesRow);
    card.appendChild(colorSection);

    const errorSlot = document.createElement('div');
    errorSlot.className = 'modal-error-slot';
    const syncError = () => {
      errorSlot.replaceChildren();
      if (errorText) {
        const banner = document.createElement('div');
        banner.className = 'feedback-banner feedback-banner--error';
        banner.textContent = errorText;
        errorSlot.appendChild(banner);
      }
    };
    syncError();
    card.appendChild(errorSlot);

    const handlePickedBanner = (file: File) => {
      readImageFileForCrop(
        file,
        (dataUrl) => {
          selectedImageUrl = dataUrl;
          errorText = null;
          void openBannerCropStep(dataUrl);
        },
        (msg) => {
          errorText = msg;
          syncError();
        },
      );
    };

    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (file) {
        handlePickedBanner(file);
      }
    });

    const dropOverlay = createImageDropOverlay('Drop image for banner');
    card.appendChild(dropOverlay);
    attachImageDropZone(card, {
      overlayEl: dropOverlay,
      activeClass: 'modal-card--dragover',
      onFiles: (files) => {
        if (files[0]) {
          handlePickedBanner(files[0]);
        }
      },
    });

    const footer = document.createElement('div');
    footer.className = 'button-row modal-footer';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn-secondary';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', cleanup);

    const acceptBtn = document.createElement('button');
    acceptBtn.type = 'button';
    acceptBtn.className = 'btn-primary';
    acceptBtn.textContent = 'Accept';
    acceptBtn.addEventListener('click', () => {
      if (selectedImageUrl) {
        void openBannerCropStep(selectedImageUrl);
        return;
      }
      options.onApply({
        bannerColor: selectedColor,
        bannerDataUrl: undefined,
      });
      cleanup();
    });

    footer.appendChild(cancelBtn);
    footer.appendChild(acceptBtn);
    card.appendChild(footer);

    backdrop.appendChild(card);
  };

  const openBannerCropStep = (imageSrc: string) =>
    runImageCropStep({
      backdrop,
      title: 'Adjust Profile Banner',
      subtitle: 'Drag to frame your 3:1 wide banner and use the slider to zoom.',
      imageSrc,
      viewW: BANNER_CROP_W,
      viewH: BANNER_CROP_H,
      exportW: BANNER_EXPORT_W,
      exportH: BANNER_EXPORT_H,
      maskShape: 'rect',
      zoomAriaLabel: 'Zoom profile banner',
      wideModal: true,
      onCancel: cleanup,
      onError: (msg) => {
        errorText = msg;
        renderPickerStep();
      },
      onAcceptCropped: (croppedDataUrl) => {
        options.onApply({
          bannerColor: selectedColor,
          bannerDataUrl: croppedDataUrl,
        });
        cleanup();
      },
    });

  renderPickerStep();
}
