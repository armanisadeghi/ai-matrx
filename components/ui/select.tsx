"use client";

/**
 * HOST DOOR ONLY — the Select implementation lives in
 * `@ai-matrx/design-system`. This file exists so ~400 import sites keep
 * saying `@/components/ui/select`, and for nothing else.
 *
 * The package body is the verbatim port of what used to be here: the same
 * `selectTriggerVariants` (sm/default/lg), the same `hideArrow` trigger prop,
 * the same `description` second line on `SelectItem` (rendered OUTSIDE Radix
 * `ItemText` on purpose, so the closed trigger stays one line), the same
 * scroll buttons, the same popper positioning, and the same unconditional
 * root — no hydration mount gate, which used to delete an always-visible form
 * control from SSR and the first client paint.
 *
 * The one seam: the host's `useNestedPortalContainer` (dialog/popout aware)
 * became the package's `PortalContainerProvider`, and the explicit
 * `container` prop on `SelectContent` still beats it, exactly as before.
 *
 * Need a new behavior? Add it to the PACKAGE and release. A body re-grown here
 * is the twin `pnpm check:package-twins` exists to catch.
 */

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
  selectTriggerVariants,
} from "@ai-matrx/design-system";
export type { SelectTriggerProps } from "@ai-matrx/design-system";
