"use client";

/**
 * HOST BINDING ONLY — Switch lives in `@ai-matrx/design-system`. This app uses
 * the compact 16px track with a visible border and an overhanging thumb, so it
 * binds `size="sm"`; the other three hosts use the 20px `md` track, which is
 * the package default.
 *
 * The OFF track now reads the `input` token in every host — one fork used the
 * surface token, which makes an off switch disappear into a muted panel.
 */

import { Switch as PackageSwitch, type SwitchProps } from "@ai-matrx/design-system";
import * as React from "react";

export type { SwitchProps, SwitchSize } from "@ai-matrx/design-system";

const Switch = React.forwardRef<
  React.ComponentRef<typeof PackageSwitch>,
  SwitchProps
>(({ size = "sm", ...props }, ref) => (
  <PackageSwitch ref={ref} size={size} {...props} />
));
Switch.displayName = "Switch";

export { Switch };
