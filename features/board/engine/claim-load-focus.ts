/**
 * The board owns the keyboard from the moment it loads (FigJam / tldraw: ⌘A, Delete, ⌘Z work with no
 * click first). The shell chat beside it autofocuses its composer a beat after load (its focus runs
 * ~100 ms after the conversation exists), so the claim is a short WATCH, not one focus() call: until
 * the person presses, taps or types anywhere, a field OUTSIDE the board that takes focus on its own
 * hands it back to the board. After the first real input the person decides where focus is, always.
 */
export const LOAD_FOCUS_CLAIM_MS = 6000;

function isTextField(el: Element | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
  if (el instanceof HTMLInputElement) return !["button", "checkbox", "radio", "range", "color", "file", "submit", "reset", "image", "hidden"].includes(el.type);
  return el.isContentEditable || el.getAttribute("role") === "textbox";
}

/** Focuses `root` now and keeps it there against automatic focus from outside. Returns the stop. */
export function claimLoadFocus(root: HTMLElement, doc: Document = document, ms = LOAD_FOCUS_CLAIM_MS): () => void {
  let done = false;
  const stop = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    doc.removeEventListener("focusin", onFocusIn, true);
    for (const t of ["pointerdown", "keydown", "touchstart"]) doc.removeEventListener(t, stop, true);
  };
  const take = () => {
    const active = doc.activeElement;
    if (active === root || (active instanceof Node && root.contains(active))) return;
    if (active instanceof HTMLElement && active !== doc.body) active.blur();
    root.focus({ preventScroll: true });
  };
  const onFocusIn = (e: FocusEvent) => {
    const target = e.target as Element | null;
    if (!target || root.contains(target) || !isTextField(target)) return;
    take();
  };
  doc.addEventListener("focusin", onFocusIn, true);
  for (const t of ["pointerdown", "keydown", "touchstart"]) doc.addEventListener(t, stop, true);
  const timer = setTimeout(stop, ms);
  take();
  return stop;
}
