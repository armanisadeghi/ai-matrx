// features/spaces/editor/floating.ts — Notion's timing and placement for the editor's floating menus.
//
// BlockNote fades its popovers out over 250ms, and the slash menu uses autoPlacement, which opens
// upward whenever there is more room above — even with plenty below. Notion closes at once (Esc, a
// collapsed selection) and opens the "/" menu below the caret unless it truly does not fit.

import type { FloatingUIOptions } from "@blocknote/react";

type Middleware = NonNullable<NonNullable<FloatingUIOptions["useFloatingOptions"]>["middleware"]>[number];

/** Close instantly; open with a short fade. */
export const INSTANT_CLOSE: FloatingUIOptions = {
  useTransitionStylesProps: { duration: { open: 80, close: 0 } },
};

const GAP = 10;
const MIN_BELOW = 240;

/** The visible band the menu must fit in: the page's own scroll area (the app's bars sit outside it and
 *  clip whatever crosses them), else the window. */
export function visibleBand(reference: Element | { getBoundingClientRect(): DOMRect; contextElement?: Element }): { top: number; bottom: number } {
  const el = reference instanceof Element ? reference : reference.contextElement;
  // A caret's virtual reference has no element: the open page's scroll area is the band then.
  const scroller = ((el?.closest?.(".spaces-scroll, [data-matrx-page-scroll]") ?? document.querySelector(".spaces-scroll")) as HTMLElement | null);
  const r = scroller?.getBoundingClientRect();
  return { top: Math.max(0, r?.top ?? 0), bottom: Math.min(window.innerHeight, r?.bottom ?? window.innerHeight) };
}

/** Below the caret when it fits (or fits better), else above; the menu's height is capped to the room. */
const preferBelow: Middleware = {
  name: "spacesPreferBelow",
  fn: ({ y, placement, elements }) => {
    const ref = elements.reference.getBoundingClientRect();
    const band = visibleBand(elements.reference as Element);
    const below = band.bottom - ref.bottom - GAP * 2;
    const above = ref.top - band.top - GAP * 2;
    const want = below >= MIN_BELOW || below >= above ? "bottom-start" : "top-start";
    if (want !== placement) return { reset: { placement: want } };
    elements.floating.style.maxHeight = `${Math.max(120, want === "bottom-start" ? below : above)}px`;
    return { y: y + (want === "bottom-start" ? GAP : -GAP) };
  },
};

export const SLASH_MENU: FloatingUIOptions = {
  ...INSTANT_CLOSE,
  useFloatingOptions: { placement: "bottom-start", middleware: [preferBelow] },
};
