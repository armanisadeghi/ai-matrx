"use client";

/**
 * THE ONE CONTROL (2026-10-05, wave 1B): Switch is the controls' switch — a 20px track inside
 * the 28px control box, so it lines up with every control beside it. NO size (`size=` is gone).
 * Codemod + census: `scripts/ui-rollout/doors-codemod.mjs`.
 *
 * `SwitchLegacy` is FROZEN — the pre-rollout compact 16px track (the package-root Switch bound
 * to `size="sm"`), for the areas the rollout may not touch (the agent builder, other lanes'
 * files). Never import it in new code; each importer is listed in the census.
 */

import { Switch as PackageSwitch, type SwitchProps as PackageSwitchProps } from "@ai-matrx/design-system";
import * as React from "react";

export { Switch } from "@ai-matrx/design-system/controls";
export type { SwitchProps } from "@ai-matrx/design-system/controls";

const SwitchLegacy = React.forwardRef<
  React.ComponentRef<typeof PackageSwitch>,
  PackageSwitchProps
>(({ size = "sm", ...props }, ref) => (
  <PackageSwitch ref={ref} size={size} {...props} />
));
SwitchLegacy.displayName = "SwitchLegacy";

export { SwitchLegacy };
