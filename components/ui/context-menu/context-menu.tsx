"use client";

/**
 * HOST RE-EXPORT ONLY — the ContextMenu PRIMITIVE lives in
 * `@ai-matrx/design-system`. The v3 right-click menu SYSTEM (sections,
 * copy/export/convert actions, the surface registry) stays in this repo and
 * composes these parts; the package knows nothing about what an action is.
 *
 * The package carries the reasoning this file used to: the root renders
 * unconditionally, because a CLOSED ContextMenuTrigger emits no id at all —
 * there was never an SSR mismatch to defend against — and gating it deleted
 * the wrapped subtree from the server render, so a list of rows painted EMPTY
 * and filled in after hydration (D144). The same repo had ALREADY accumulated
 * two copies of this wrapper, one gated and one not, which is exactly why the
 * primitive belongs in a package.
 */

export {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuPortal,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@ai-matrx/design-system";
export type { ContextMenuContentProps } from "@ai-matrx/design-system";
