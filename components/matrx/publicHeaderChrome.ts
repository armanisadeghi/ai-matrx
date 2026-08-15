/**
 * PUBLIC HEADER SIZING — one place, so the bar cannot drift again.
 *
 * The public header used to stand at 48px with 44px controls inside it, while
 * the app's own shell header is `--header-height` (2.5rem / 40px). On a
 * marketing page that 8px is pure waste at the very top of the fold, and the
 * mismatch made the public bar look heavier than the product's.
 *
 * The reason it was 48px is real, though: the ios-mobile-first rule puts a 44px
 * floor under every touch target. So the size is RESPONSIVE rather than simply
 * smaller — full 44px targets on touch, tightened to the shell's own header
 * height once there is a pointer.
 *
 * Anything that renders inside `[data-public-header]` uses these. Never
 * hand-write `h-11 w-11` in a public header child again.
 */

/** The header row itself: 48px on touch, the shell's 40px on pointer. */
export const PUBLIC_HEADER_ROW = "h-12 sm:h-[var(--header-height)]";

/** A square icon control in the public header: 44px on touch, 36px on pointer. */
export const PUBLIC_HEADER_ICON_BUTTON = "h-11 w-11 sm:h-9 sm:w-9";
