"use client";

/**
 * HOST DOOR ONLY — the Command palette lives in `@ai-matrx/design-system`.
 * This file exists so the existing import sites keep saying
 * `@/components/ui/command`, and for nothing else.
 *
 * `cmdk` (the filtering/scoring/keyboard engine) is a sanctioned real
 * dependency of the package — it IS the component's product. Every filtering
 * option the fork had is `cmdk`'s own and reaches the package body unchanged:
 * `filter`, `shouldFilter`, `value`/`onValueChange`, `loop`, and per-item
 * `keywords` all pass straight through.
 *
 * The package's `CommandDialog` is a superset of the fork's: same overlay,
 * same `sr-only` title, same `overflow-hidden p-0` content — plus a mobile
 * bottom-sheet geometry, the modal/non-modal context, and an explicit
 * `container` escape hatch the fork had to borrow from the host dialog module.
 *
 * Need a new behavior? Add it to the PACKAGE and release. A body re-grown here
 * is the twin `pnpm check:package-twins` exists to catch.
 */

export {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@ai-matrx/design-system";
export type { CommandDialogProps } from "@ai-matrx/design-system";
