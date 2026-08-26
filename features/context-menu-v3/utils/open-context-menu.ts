/**
 * Opens the canonical context menu from an explicit overflow control.
 *
 * Touch surfaces cannot rely on a discoverable right-click. Dispatching the
 * same bubbling event keeps the overflow button on the exact desktop/mobile
 * ContextMenuV3 path instead of creating a second action menu.
 */
export function openContextMenuForElement(element: HTMLElement | null): void {
  if (!element) return;

  const rect = element.getBoundingClientRect();
  element.dispatchEvent(
    new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      view: element.ownerDocument.defaultView ?? window,
      button: 2,
      buttons: 2,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    }),
  );
}
