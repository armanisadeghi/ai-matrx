"use client";

/**
 * HOST RE-EXPORT ONLY — ToggleGroup lives in `@ai-matrx/design-system`,
 * in the same module as `Toggle` (see `components/ui/toggle.tsx` for why the
 * two could not stay apart: they share one React context).
 *
 * `size`/`variant` declared on the group are inherited by every item.
 *
 * Import from here or from the package — both are the same component.
 */

export {
  ToggleGroup,
  ToggleGroupItem,
  type ToggleGroupItemProps,
  type ToggleGroupProps,
} from "@ai-matrx/design-system";
