"use client";

/**
 * HOST RE-EXPORT ONLY — the DropdownMenu implementation lives in
 * `@ai-matrx/design-system`, carrying both rulings this file used to hold:
 * the root renders unconditionally (no hydration mount gate, which used to
 * delete every `…` trigger from SSR and the first client paint), and an open
 * menu caps at the height Radix measured and scrolls past it, so a long menu
 * can never put its last items out of reach.
 *
 * The host `useNestedPortalContainer` wiring is now the package's
 * `usePortalContainer` seam, fed by `DialogContent` and by
 * `features/window-panels/popout/PopoutShell.tsx`. An explicit `container`
 * prop still wins, exactly as before.
 */

export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@ai-matrx/design-system";
export type { DropdownMenuContentProps } from "@ai-matrx/design-system";
