"use client";

/**
 * HOST RE-EXPORT ONLY — the RadioGroup implementation lives in
 * `@ai-matrx/design-system`.
 *
 * `size="sm|md|lg"` is declared ONCE on the group and every item reads it from
 * context, so a group can no longer mix control sizes. The 16px control also
 * carries an invisible 44px target on coarse pointers, layout untouched.
 *
 * Import from here or from the package — both are the same component.
 */

export {
  RadioGroup,
  RadioGroupItem,
  type RadioGroupItemProps,
  type RadioGroupProps,
  type RadioGroupSize,
} from "@ai-matrx/design-system";
