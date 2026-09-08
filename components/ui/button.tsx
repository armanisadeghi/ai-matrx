"use client";

/**
 * HOST DOOR ONLY — `Button` lives in `@ai-matrx/design-system`.
 *
 * There used to be a second button in this folder (`ButtonMine.tsx`, 17 call
 * sites), and it existed because the package's size scale stopped at `sm`/`lg`
 * while a dense toolbar needed something smaller. design-system 0.6.0 ships
 * ONE scale — `xs sm default/md lg xl 2xl 3xl` plus `icon`, `icon-sm`,
 * `roundIcon` — and the variants that fork carried (`primary`, `success`), so
 * the fork was deleted on 2026-09-07.
 *
 * Written as a re-export, not `const Button = PackageButton`, so that
 * `Button` / `buttonVariants` can be registered in `scripts/package-twins.json`
 * and any re-grown local body fails `pnpm check:package-twins`.
 *
 * Need a new size, variant, or behavior? Add it to the PACKAGE and release.
 */

export {
  Button,
  buttonVariants,
} from "@ai-matrx/design-system";
export type { ButtonProps } from "@ai-matrx/design-system";
