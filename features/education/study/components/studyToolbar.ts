// features/education/study/components/studyToolbar.ts
//
// The ONE style source for a study card's tool row (Listen · Talk · Explain ·
// Ask · Tutor · Memory · Split …). Every per-card affordance that owns its own
// trigger + expandable body (CardAudioHelp, CardDetailLayers, MemoryAidButton,
// the deck's Ask panel) renders in `variant="toolbar"` with these classes:
//
//   - the component's root is `display: contents`, so its trigger buttons
//     become direct children of the host's wrapping flex row;
//   - every expanded body takes `STUDY_TOOL_BODY` (`order-last basis-full`),
//     so it drops onto its own full-width line UNDER the whole row, in mount
//     order, instead of breaking the row.
//
// Result: one compact row of equal-height tool buttons, bodies below — never a
// vertical stack of full-width buttons (Arman, 2026-10-01: "rows of buttons").

/** The host row every toolbar-variant tool is mounted into. */
export const STUDY_TOOLBAR_ROW =
  "flex flex-wrap items-center justify-center gap-1";

/** One tool trigger: 36px desktop, 44px on touch (matrx-touch-targets). */
export const STUDY_TOOL_BUTTON =
  "h-9 shrink-0 gap-1.5 rounded-lg px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground";

/** The active (open) state of a toggle-style tool trigger. */
export const STUDY_TOOL_BUTTON_ACTIVE = "bg-accent text-foreground";

/** An expanded tool body: its own full-width line below the row. */
export const STUDY_TOOL_BODY = "order-last basis-full w-full min-w-0";
