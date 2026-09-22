/**
 * "Is this outside-click actually a re-click of the button that opened me?"
 *
 * THE DEFECT THIS CLOSES (live on www.aimatrx.com, 2026-09-22). A dialog's
 * trigger stays on screen, readable, UNDER the dialog's own full-screen
 * scrim. Clicking it again is an outside interaction, so it DISMISSES what it
 * opened. A person who does not notice the dialog and clicks the button again
 * closes it, and an even number of clicks leaves the page looking untouched:
 * the battle page's "Save as…" was reported dead after four clicks — no
 * dialog, no toast, no overlay — and click-by-click on the live site the
 * dialog count went 1 → 0 → 1.
 *
 * WHY GEOMETRY AND NOT A HIT TEST. The scrim swallows the event, so the
 * event's TARGET is the scrim, never the trigger — `contains(target)` is
 * always false. `document.elementsFromPoint` is no better: a modal Radix
 * dialog puts `pointer-events: none` on the body, and a hit test skips
 * elements that cannot be hit, so the trigger drops out of the stack
 * unpredictably (observed live: two re-clicks held, the third dismissed).
 * The opener's own rectangle is the one thing that is always true.
 */
export function isPointOnOpener(
  opener: HTMLElement | null,
  event: { clientX?: number; clientY?: number },
): boolean {
  if (!opener || !opener.isConnected) return false;
  const { clientX, clientY } = event;
  if (typeof clientX !== "number" || typeof clientY !== "number") return false;
  // A keyboard "click" reports 0,0; never treat that as a re-click.
  if (clientX === 0 && clientY === 0) return false;
  const rect = opener.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  return (
    clientX >= rect.left &&
    clientX <= rect.right &&
    clientY >= rect.top &&
    clientY <= rect.bottom
  );
}
