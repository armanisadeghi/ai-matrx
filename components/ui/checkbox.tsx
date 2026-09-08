"use client";

/**
 * HOST BINDING ONLY — Checkbox lives in `@ai-matrx/design-system`. This app
 * uses the dense 14px box, so it binds `size="sm"`; the stock 16px control is
 * the package default.
 *
 * The indeterminate ruling this file used to carry moved into the package with
 * it: Radix renders the indicator for BOTH `checked` and `"indeterminate"`, so
 * the two states get DIFFERENT glyphs — a half-selected "select all" wearing a
 * full check states something false.
 */

import {
  Checkbox as PackageCheckbox,
  type CheckboxProps,
} from "@ai-matrx/design-system";
import * as React from "react";

export type { CheckboxProps, CheckboxSize } from "@ai-matrx/design-system";

const Checkbox = React.forwardRef<
  React.ComponentRef<typeof PackageCheckbox>,
  CheckboxProps
>(({ size = "sm", ...props }, ref) => (
  <PackageCheckbox ref={ref} size={size} {...props} />
));
Checkbox.displayName = "Checkbox";

export { Checkbox };
