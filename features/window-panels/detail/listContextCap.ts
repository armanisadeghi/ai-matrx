// features/window-panels/detail/listContextCap.ts
//
// THE ONE PLACE THIS APP TURNS `ui.detail.list_context_max_ids` INTO A NUMBER.
// Both surfaces that put a list into a URL read it here — the page href
// (`detailPageHref`) and the window's `?panels=` token (NEW-15) — so a cap
// change cannot reach one and miss the other, and the clamp the knob resolver
// applies (`detailListContextMax`, which never returns more than the byte
// budget can carry — NEW-12) is applied exactly once.
//
// The read is the cached session knob, so building a href stays synchronous; a
// cold cache uses the module default and warms itself for the next href, which
// is why `warmPresentation` asks for this key too.

import { DETAIL_LIST_CONTEXT_MAX_KNOB, detailListContextMax } from "@ai-matrx/detail";
import { getSessionKnob } from "@/lib/scoped-config/sessionKnob";

export function resolvedListContextMax(): number {
  return detailListContextMax(getSessionKnob(DETAIL_LIST_CONTEXT_MAX_KNOB));
}
