// features/bindings/rail-height.ts
//
// 🚨 THE SPINE'S HEIGHT LAW (UI-STANDARD P1; V2 finding G4, 2026-08-31).
//
// P1 promises BOTH INVENTORIES ON SCREEN AT ONCE, PERMANENTLY. That promise is
// a lie the moment a rail is allowed to grow to its content: the adversary
// opened `podcast.solo_script` (27 offered values through the
// `podcast.script_stage` provision) and measured the three-column grid at
// 4,502px — the middle holding ~450px of match stretched to four and a half
// thousand, and the last offered value five screens below the row it feeds.
//
// Both rails already scroll internally (`overflow-y-auto` on their lists) — the
// bug was that nothing ever bounded them, so the scroll never engaged and the
// grid row simply grew. One shared ceiling is the whole fix, and it lives in
// one place so the two rails and the match can never drift apart.
//
// Viewport-relative, not a fixed pixel box: this workspace is hosted in a 3xl
// reading column, in the admin shell, and inside a draggable window panel, and
// a hard `max-h-[36rem]` would waste a tall monitor and overflow a short one.
export const RAIL_MAX_HEIGHT = "max-h-[calc(100vh-11rem)]";

/**
 * The header's honest line when a rail cannot show everything at once. A
 * scrollbar is not a sentence — the count is (P15).
 */
export function scrollHint(count: number): string | null {
  return count > 6
    ? `${count} in all — the list scrolls; nothing here is hidden.`
    : null;
}
