"use client";

/**
 * HOST RE-EXPORT ONLY — Toggle and ToggleGroup live in
 * `@ai-matrx/design-system`, in ONE module.
 *
 * They had to merge: `ToggleGroupItem` reads both `toggleVariants` and the
 * group's variant CONTEXT, and a host copy of a React context is the quiet twin
 * — `useContext` matches by object identity, so two look-alike contexts never
 * see each other. One module, one context.
 *
 * `Toggle` is not `Switch` (a Switch states a setting; a Toggle is a pressed
 * button in a toolbar) and not `SegmentedControl` (which is for labelled
 * choices).
 *
 * Import from here or from the package — both are the same component.
 */

export { Toggle, toggleVariants, type ToggleProps } from "@ai-matrx/design-system";
