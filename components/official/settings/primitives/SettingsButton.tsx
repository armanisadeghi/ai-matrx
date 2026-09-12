"use client";

import { useId } from "react";
import type { LucideIcon } from "lucide-react";
import { SettingsRow } from "../SettingsRow";
import { cn } from "@/lib/utils";
import type { SettingsCommonProps, SettingsControlSize } from "../types";

type ButtonKind = "default" | "outline" | "ghost" | "destructive";

const kindStyles: Record<ButtonKind, string> = {
  default:
    "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm",
  outline:
    "border border-border bg-card text-foreground hover:bg-accent shadow-sm",
  ghost:
    "bg-transparent text-foreground hover:bg-accent",
  destructive:
    "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm",
};

const sizeStyles: Record<SettingsControlSize, string> = {
  sm: "min-h-11 px-2.5 text-xs gap-1.5 sm:min-h-7",
  md: "min-h-11 px-3 text-sm gap-2 sm:min-h-8",
  lg: "min-h-11 px-4 text-base gap-2 sm:min-h-10",
};

export type SettingsButtonProps = SettingsCommonProps & {
  /** Action label shown on the button itself. */
  actionLabel: string;
  onClick: () => void;
  kind?: ButtonKind;
  size?: SettingsControlSize;
  actionIcon?: LucideIcon;
  /** Stacks the button below the label. Use when the action label is long. */
  stacked?: boolean;
  last?: boolean;
  /** Shows a confirmation spinner / loading state. */
  loading?: boolean;
};

/**
 * Renders a settings row whose control is an action button.
 * Good for: "Reset to defaults", "Clear cache", "Sign out", "Open in browser".
 */
export function SettingsButton({
  actionLabel,
  onClick,
  kind = "outline",
  size = "md",
  actionIcon: ActionIcon,
  stacked,
  loading,
  last,
  ...rowProps
}: SettingsButtonProps) {
  const generatedId = useId().replace(/:/g, "");
  const id = rowProps.id ?? `settings-${generatedId}`;

  return (
    <SettingsRow
      {...rowProps}
      id={id}
      variant={stacked ? "stacked" : "inline"}
      last={last}
    >
      <button
        id={id}
        type="button"
        onClick={onClick}
        disabled={rowProps.disabled || loading}
        className={cn(
          "inline-flex items-center justify-center rounded-md font-medium transition-all duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 active:scale-95",
          kindStyles[kind],
          sizeStyles[size],
          stacked && "w-full",
          loading && "animate-pulse",
        )}
      >
        {ActionIcon && <ActionIcon className="h-3.5 w-3.5 shrink-0" />}
        <span>{loading ? "Working…" : actionLabel}</span>
      </button>
    </SettingsRow>
  );
}
