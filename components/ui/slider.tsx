"use client";

/**
 * HOST RE-EXPORT ONLY — the Slider implementation lives in
 * `@ai-matrx/design-system`.
 *
 * Two things the package fixed that this file could not do:
 * - it renders ONE THUMB PER VALUE, so a two-value range keeps both handles
 *   (this copy hardcoded a single Thumb and silently dropped the upper one);
 * - the 16px thumb carries an invisible 44px target on coarse pointers, so a
 *   slider that worked with a mouse also works with a thumb. Desktop density is
 *   unchanged.
 *
 * `size="sm|md|lg"` scales track and thumb together — a prop, not a fork.
 *
 * Import from here or from the package — both are the same component.
 */

export { Slider, type SliderProps, type SliderSize } from "@ai-matrx/design-system";
