/**
 * Shared Tailwind class tokens for the VSCode-style workspace UI.
 *
 * Centralizing these keeps the Activity Bar, Side Panel, Editor, and Terminal
 * looking like one cohesive surface instead of three different opinions on
 * "what a neutral gray should be".
 */

/** The full-workspace background (slightly lighter than the page so the
 *  workspace reads as a contained widget). */
export const WORKSPACE_BG = "bg-background";

/** Activity-bar column background. */
export const ACTIVITY_BAR_BG = "bg-muted";

/** Side panel (file tree / search / etc.) background. */
export const SIDE_PANEL_BG = "bg-muted/30";

/** Tab strip background (above the editor). */
export const TAB_STRIP_BG = "bg-muted/50";

/** Editor background. Monaco paints its own background on top of this. */
export const EDITOR_BG = "bg-background";

/** Bottom panel background. */
export const BOTTOM_PANEL_BG = "bg-background";

/** Status bar background. */
export const STATUS_BAR_BG = "bg-muted text-muted-foreground";

/** Thin hairline border used between all major panes. */
export const PANE_BORDER = "border-border";

/** Header row height used across panel headers. */
export const HEADER_HEIGHT = "h-9";

/** Row height for items in the file tree + list-style panels. */
export const ROW_HEIGHT = "h-6";

export const TEXT_MUTED = "text-muted-foreground";
export const TEXT_BODY = "text-foreground";
export const TEXT_HEADER =
  "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

export const HOVER_ROW = "hover:bg-accent";

export const ACTIVE_ROW = "bg-accent text-accent-foreground";

/** Reserves horizontal space at the top-right of the rightmost panel so the
 *  app's floating user-menu avatar (rendered by `features/shell/...`) doesn't
 *  overlap panel content. The avatar sits roughly 2.25rem tall at the top-right
 *  of the viewport; we give ourselves a little breathing room. */
export const AVATAR_RESERVE = "pr-14";
