const MODAL_ROOT_SELECTOR =
  '.modal-backdrop, .vc-screen-modal-backdrop, .settings-overlay';

/** Returns true when `modalRoot` is the topmost open dialog/overlay in the DOM. */
export function isTopmostModal(modalRoot: HTMLElement): boolean {
  const openModals = Array.from(
    document.querySelectorAll<HTMLElement>(MODAL_ROOT_SELECTOR),
  ).filter((el) => el.isConnected && !el.hidden);
  if (openModals.length === 0) {
    return true;
  }
  return openModals[openModals.length - 1] === modalRoot;
}

/**
 * Checks whether a keyboard event should trigger a modal's primary confirm / save action.
 * - Supports `Enter` (outside textareas/buttons/links/selects)
 * - Supports `Ctrl/Cmd+Enter` (even inside textareas)
 * - Optionally supports `Ctrl/Cmd+S` for save dialogs
 * - Ignores IME composition, child modals, and open floating menus/pickers.
 */
export function isModalConfirmShortcut(
  e: KeyboardEvent,
  modalRoot: HTMLElement,
  opts?: { allowCtrlS?: boolean },
): boolean {
  if (e.isComposing || e.altKey) {
    return false;
  }
  if (!isTopmostModal(modalRoot)) {
    return false;
  }
  if (
    document.querySelector(
      '.ctx-menu-panel, .status-dropdown-menu, .emoji-picker-square, .gif-picker-popover',
    )
  ) {
    return false;
  }

  const isCtrlOrMeta = e.ctrlKey || e.metaKey;
  if (opts?.allowCtrlS && isCtrlOrMeta && !e.shiftKey && e.key.toLowerCase() === 's') {
    return true;
  }

  if (e.key !== 'Enter' || e.shiftKey) {
    return false;
  }

  const target = (e.target instanceof HTMLElement ? e.target : document.activeElement) as
    | HTMLElement
    | null;

  if (isCtrlOrMeta) {
    return true;
  }

  if (target && modalRoot.contains(target)) {
    const tag = target.tagName;
    if (tag === 'TEXTAREA' || tag === 'A' || tag === 'SELECT') {
      return false;
    }
    if (
      tag === 'BUTTON' &&
      !target.classList.contains('btn-primary') &&
      !target.classList.contains('btn-danger')
    ) {
      return false;
    }
    if (target.isContentEditable) {
      return false;
    }
  }

  return true;
}
