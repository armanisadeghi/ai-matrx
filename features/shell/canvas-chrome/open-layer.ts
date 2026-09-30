/**
 * True while a Radix popper that HOLDS the pointer or the Escape key is open —
 * a menu, a popover (role="dialog") or a listbox. Tooltips are poppers too but
 * hold nothing, so they never count (a hovered button's tooltip must not keep
 * the nav overlay open or swallow the full-screen Escape).
 */
export function aMenuOrPopoverIsOpen(): boolean {
  return (
    document.querySelector(
      '[data-radix-popper-content-wrapper] :is([role="menu"],[role="dialog"],[role="listbox"])',
    ) !== null
  );
}

/**
 * FULL-SCREEN LAYERS — the one Escape rule for anything that takes over the
 * screen (the chat workspace's full screen, a board tile's full screen, …).
 *
 * Layers stack in the order they open. One Escape leaves only the TOP layer —
 * the most recently opened, which is the one covering the others — never two
 * at once. The listener is window capture phase, so it runs before any
 * content handler (a chat composer, an editor) can swallow the key; an open
 * menu, popover or listbox keeps its Escape (`aMenuOrPopoverIsOpen`).
 *
 * `pushFullScreenLayer(exit)` returns the pop; call it when the layer closes
 * (however it closed).
 */
const fullScreenLayers: Array<() => void> = [];

function onFullScreenEscape(e: KeyboardEvent): void {
  if (e.key !== "Escape" || e.defaultPrevented) return;
  const top = fullScreenLayers[fullScreenLayers.length - 1];
  if (!top || aMenuOrPopoverIsOpen()) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  top();
}

export function pushFullScreenLayer(exit: () => void): () => void {
  if (fullScreenLayers.length === 0) {
    window.addEventListener("keydown", onFullScreenEscape, true);
    // Marks the page so top toasts drop below the layer's exit bar
    // (app/globals.css, "FULL-SCREEN TOAST CLEARANCE") — nothing may cover it.
    document.documentElement.dataset.fullScreenLayer = "open";
  }
  fullScreenLayers.push(exit);
  return () => {
    const at = fullScreenLayers.lastIndexOf(exit);
    if (at >= 0) fullScreenLayers.splice(at, 1);
    if (fullScreenLayers.length === 0) {
      window.removeEventListener("keydown", onFullScreenEscape, true);
      delete document.documentElement.dataset.fullScreenLayer;
    }
  };
}
