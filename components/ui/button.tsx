"use client";

/**
 * HOST DOOR ONLY — THE control Button (`@ai-matrx/design-system/controls`).
 *
 * One 28px geometry, locked in `@layer matrx-tap-lock`; tone-only variants
 * (`primary` · `outline` · `quiet` · `danger` · `success` · `link`); NO `size`
 * prop — the type refuses it, so a straggler fails `pnpm type-check`. Icon-only
 * is `icon={<Glyph />}` + `aria-label`; a leading / trailing glyph is `icon` /
 * `iconEnd`. Call sites own placement only (ui-unification-plan §1b, §2.9;
 * common-docs/policies/one-ui-system.md).
 *
 * Wave 1A (2026-10-05) moved every importer here with
 * `scripts/ui-rollout/button-door-codemod.mjs`. Sites that are NOT a control —
 * multi-line rows, cards, tiles, hero CTAs — import the package-root legacy
 * Button as `SurfaceButton` and are listed in
 * `scripts/ui-rollout/button-door-census.json` (Wave 2 input).
 *
 * `buttonVariants` stays the package root's class recipe for its non-Button
 * users (calendar, pagination, link-styled anchors).
 *
 * Written as a re-export so `Button` / `buttonVariants` stay registered in
 * `scripts/package-twins.json`. Need a new tone or behaviour? Add it to the
 * PACKAGE as a named option and release.
 */

export { Button } from "@ai-matrx/design-system/controls";
export type { ButtonProps, ControlVariant } from "@ai-matrx/design-system/controls";
export { buttonVariants } from "@ai-matrx/design-system";
