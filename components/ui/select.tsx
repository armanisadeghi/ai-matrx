// No "use client": this door only re-exports, and each package entry carries
// its own directive. A "use client" door re-exporting the package ROOT beside
// `/controls` crashes a production Turbopack build whose client graph uses only
// the `/controls` export ("ModuleId not found ... dist/index.js <locals>").
// Guard: `pnpm check:client-door-reexports`.

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
  SelectValue,
  selectTriggerVariants,
} from "@ai-matrx/design-system";

/**
 * THE ONE CONTROL (2026-10-05, wave 1B): the trigger is the controls' select capsule — 28px,
 * 13px value, 16px glyphs, geometry + colour locked, NO size (`size=` is gone; a call site's
 * className is placement only). Options: `variant="bare"` (the surrounding surface draws the
 * frame), `hideArrow`. Codemod + census: `scripts/ui-rollout/doors-codemod.mjs`.
 */
export { SelectTrigger } from "@ai-matrx/design-system/controls";
export type { SelectTriggerProps } from "@ai-matrx/design-system/controls";

/**
 * FROZEN — the pre-rollout trigger, for the areas the rollout may not touch (the agent
 * builder, other lanes' files) and the census sites it could not convert safely. Never import
 * it in new code; each importer is listed in `scripts/ui-rollout/doors-census.json`.
 */
export { SelectTrigger as SelectTriggerLegacy } from "@ai-matrx/design-system";
