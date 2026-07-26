/** Shared Matrx component sizing / density tokens. */

import type React from "react";

export type ComponentSize =
  "default" | "xs" | "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "icon";

export type ComponentDensity = "compact" | "normal" | "comfortable";

export type AnimationPreset =
  "none" | "subtle" | "smooth" | "energetic" | "playful" | "feedback" | "error";

export interface SelectOption<T extends string | number = string> {
  value: T;
  label: string;
  key?: string;
  disabled?: boolean;
  icon?: React.ReactNode;
  description?: string;
}
