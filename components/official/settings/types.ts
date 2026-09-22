import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Badge rendered next to a setting label.
 * Use variants — never free-form colors.
 */
export type SettingsBadge = {
  label: string;
  variant: "default" | "new" | "beta" | "experimental" | "deprecated" | "admin";
};

/**
 * Shared props every settings control accepts.
 * NO className anywhere — if you need a visual variation, add a variant prop
 * to the specific primitive. This is a hard rule that the library enforces.
 */
export type SettingsCommonProps = {
  /** The primary label shown on the left. Required. */
  label: string;
  /** Small muted text shown under the label. Optional. */
  description?: ReactNode;
  /**
   * Identity/provenance line shown under the label, ABOVE the description:
   * the thing an operator scans a long register for (a key, where a value
   * came from). Unlike `description` it is never truncated in the compact
   * variant, because a half-printed key is worse than none.
   */
  meta?: ReactNode;
  /** Yellow warning message shown under description. Optional. */
  warning?: ReactNode;
  /** Red error message shown under description. Optional. */
  error?: ReactNode;
  /** Badge shown inline with the label. Optional. */
  badge?: SettingsBadge;
  /** Icon shown to the left of the label. Optional. */
  icon?: LucideIcon;
  /** Disables the whole row. */
  disabled?: boolean;
  /** Marks the value as modified from default. Shows a dot indicator. */
  modified?: boolean;
  /** Unique id — optional, auto-generated from label if omitted. */
  id?: string;
  /** Tooltip or long-form help, shown via help icon. */
  helpText?: ReactNode;
};

/**
 * Row layout variant.
 * - "inline" (default): label left, control right. Collapses to stacked on mobile for large controls.
 * - "stacked": label above, control below. For sliders, long text, or multi-line.
 * - "block": full-width content region (no label column). For grids, lists.
 */
export type SettingsRowVariant = "inline" | "stacked" | "block";

/** Density preset for row height + padding. */
export type SettingsRowDensity = "compact" | "default" | "comfortable";

/** Size scale for form controls (select, input, button). */
export type SettingsControlSize = "sm" | "md" | "lg";

/** Option shape used by Select/RadioGroup/Segmented/MultiSelect. */
export type SettingsOption<T extends string = string> = {
  value: T;
  label: string;
  description?: string;
  icon?: LucideIcon;
  disabled?: boolean;
};
