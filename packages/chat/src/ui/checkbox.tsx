"use client";

/** The chat package's Checkbox: the design-system control bound to the dense 14px box (`size="sm"`). */
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
