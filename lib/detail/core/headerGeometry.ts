// lib/detail/core/headerGeometry.ts
//
// 🚨 NEW-8 (VERIFY-U-P1-R3) — THE ONE PLACE THE DETAIL HEADER'S GEOMETRY IS
// NAMED, so a guard can hold the host and the primitive to the same words.
//
// D4's fix put the window title in flow between the two action zones, which
// made overlap impossible — and traded it for a squeeze: at the Detail window's
// own `minWidth={360}` the traffic-light spacer is 96px and the cluster
// (previous / counter / next / two presentation icons / copy / pop-out) is about
// 200px, leaving the record's NAME roughly 60px — four characters and an
// ellipsis. D2's law ("the name is the one thing the header always shows")
// therefore failed in the window at small sizes, where round 1 measured the page.
//
// The rule, and the order it holds in: the name has a FLOOR, and the action
// cluster collapses into an overflow menu BEFORE the name gives way. The
// breakpoint is a CONTAINER query on the window header, never a `sm:` viewport
// breakpoint — a window's width is not the screen's, which is the mistake that
// made D4 invisible on a 1440px screen. In the page and docked presentations no
// such container exists above the header, the max-width query never matches, and
// the full cluster shows: those shells are already wide or already wrap.
//
// 🚨 NO SCREEN HAS BEEN SEEN for any of this. The numbers above are arithmetic
// over the declared widths and the classes, not pixels: this container cannot
// sign in to any Matrx host. The structural guard is
// `features/window-panels/detail/__tests__/the-title-never-runs-under-the-actions.test.tsx`.
//
// THE LITERALS ARE WRITTEN OUT IN THE JSX AS WELL, because Tailwind generates a
// utility only for a class it can SEE in source — a class assembled from these
// constants at run time would never be compiled. The guard asserts the rendered
// className against these constants, so the two cannot drift apart silently.

/** The container the detail header's breakpoint reads — declared by the window chrome. */
export const DETAIL_HEADER_CONTAINER = "@container/window-header";

/** Below this container width the optional actions move into the overflow menu. */
export const DETAIL_HEADER_COMPACT_BELOW = "@max-[26rem]/window-header";

/** The floor under the record's name: ~96px, enough for a readable fragment. */
export const DETAIL_TITLE_MIN_WIDTH_CLASS = "min-w-[6rem]";
