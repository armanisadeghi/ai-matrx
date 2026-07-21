// Selected/unselected classes for header-level mode navs (RouteModeNav and the
// per-feature mode controllers that predate it).
//
// These MUST NOT be written as `bg-[var(--matrx-glass-bg-active)]` at the
// callsite — that is a low-alpha tint that reads in dark mode and disappears
// entirely against light-mode glass, which is how the selected route became
// invisible in light. The --shell-nav-selected-* / --shell-nav-unselected-text
// tokens (styles/shell.css) resolve per theme: a solid raised pill in light,
// the glass tint in dark.
//
// Import these instead of restating the classes. Four identical copies had
// already drifted into the repo before this was extracted (2026-07-20).

export const NAV_ITEM_SELECTED =
  "bg-[var(--shell-nav-selected-bg)] text-[var(--shell-nav-selected-text)] shadow-[var(--shell-nav-selected-shadow)] font-semibold";

export const NAV_ITEM_UNSELECTED =
  "text-[var(--shell-nav-unselected-text)] hover:text-[var(--shell-nav-text-hover)] hover:bg-[var(--matrx-glass-bg-hover)]";
