"use client";

import { AlertTriangle, AlertCircle, HelpCircle } from "lucide-react";
import * as Popover from "@radix-ui/react-popover";
import { useId } from "react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type {
  SettingsCommonProps,
  SettingsRowVariant,
  SettingsRowDensity,
  SettingsBadge,
} from "./types";
import { useSettingsDesign } from "./SettingsDesignProvider";
import { useSettingsSectionTitle } from "./SettingsSectionContext";
import { SettingAnchor } from "@/features/settings/doors/SettingAnchor";
import { settingsControlSearchId } from "./searchIdentity";

type SettingsRowProps = SettingsCommonProps & {
  /** Layout variant. Defaults to "inline". */
  variant?: SettingsRowVariant;
  /** Row density. Defaults to "default". */
  density?: SettingsRowDensity;
  /** The control (switch, input, slider, etc.) rendered on the right or below. */
  children: React.ReactNode;
  /** Whether this row is the last in a section. Removes trailing border. */
  last?: boolean;
  /** Wide controls stack below their label on narrow screens. */
  controlLayout?: "compact" | "wide";
};

const densityStyles: Record<SettingsRowDensity, string> = {
  compact: "py-2.5",
  default: "py-3.5",
  comfortable: "py-4.5",
};

const badgeStyles: Record<SettingsBadge["variant"], string> = {
  default:
    "bg-muted text-muted-foreground border border-border",
  new: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20",
  beta: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20",
  experimental:
    "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20",
  deprecated:
    "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20",
  admin:
    "bg-zinc-800 text-zinc-100 dark:bg-zinc-200 dark:text-zinc-900 border border-zinc-700 dark:border-zinc-300",
};

function BadgePill({ badge }: { badge: SettingsBadge }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide leading-4",
        badgeStyles[badge.variant],
      )}
    >
      {badge.label}
    </span>
  );
}

/**
 * SettingsRow — base layout for every settings control.
 *
 * Rarely used directly by tab authors. Each primitive (SettingsSwitch,
 * SettingsSelect, etc.) composes this internally and exposes a flat prop API.
 *
 * Variants handle layout differences; NEVER accept a className.
 */
export function SettingsRow({
  label,
  description,
  warning,
  error,
  badge,
  icon: Icon,
  disabled,
  modified,
  id,
  helpText,
  variant = "inline",
  density = "default",
  children,
  last,
  controlLayout = "compact",
}: SettingsRowProps) {
  const { variant: designVariant } = useSettingsDesign();
  const sectionTitle = useSettingsSectionTitle();
  const reactId = useId().replace(/:/g, "");
  // Input ids are React-instance ids. Search/deep-link ids intentionally use
  // only the authored section + label, so they survive remounts and markup.
  const inputId = id ?? `settings-input-${reactId}`;
  const controlId = settingsControlSearchId(sectionTitle ?? "Settings", label);

  const labelBlock = (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-1.5 flex-wrap">
        {modified && (
          <span
            aria-label="Modified from default"
            className="h-1.5 w-1.5 rounded-full bg-primary shrink-0"
          />
        )}
        {Icon && (
          <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )}
        <label
          htmlFor={inputId}
          className={cn(
            "text-sm font-medium text-foreground leading-snug",
            disabled && "opacity-50",
          )}
        >
          {label}
        </label>
        {badge && <BadgePill badge={badge} />}
        {designVariant === "compact" && (description || helpText) && (
          <CompactHelpPopover label={label} description={description} helpText={helpText} />
        )}
        {helpText && designVariant !== "compact" && (
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="Help"
                  className="inline-flex items-center justify-center text-muted-foreground hover:text-foreground"
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs">
                {helpText}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      {description ? (
        <div className={cn("mt-0.5 text-xs leading-snug text-muted-foreground", designVariant === "compact" && "sm:truncate", disabled && "opacity-50")}>
          {description}
        </div>
      ) : null}
      {warning && (
        <div className="mt-1 flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span className="leading-snug">{warning}</span>
        </div>
      )}
      {error && (
        <div className="mt-1 flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span className="leading-snug">{error}</span>
        </div>
      )}
    </div>
  );

  if (variant === "block") {
    return (
      <SettingAnchor id={controlId}>
        <div
        className={cn(
          "px-4 border-b border-border/40",
          densityStyles[designVariant === "compact" && density === "default" ? "compact" : density],
          last && "border-b-0",
        )}
        >
          {children}
        </div>
      </SettingAnchor>
    );
  }

  if (variant === "stacked") {
    return (
      <SettingAnchor id={controlId}>
        <div
        className={cn(
          "px-4 border-b border-border/40",
          densityStyles[designVariant === "compact" && density === "default" ? "compact" : density],
          last && "border-b-0",
        )}
        >
          <div className="mb-2.5">{labelBlock}</div>
          <div className={cn(disabled && "opacity-50")}>{children}</div>
        </div>
      </SettingAnchor>
    );
  }

  return (
    <SettingAnchor id={controlId}>
      <div
      className={cn(
        controlLayout === "wide"
          ? "flex flex-col items-stretch gap-2 px-4 sm:flex-row sm:items-center sm:gap-4 border-b border-border/40"
          : "flex items-center gap-4 px-4 border-b border-border/40",
        densityStyles[designVariant === "compact" && density === "default" ? "compact" : density],
        last && "border-b-0",
      )}
      >
        {labelBlock}
        <div className={cn("min-w-0 max-w-full shrink-0 [&_button]:max-w-full [&_input]:max-w-full sm:self-auto", disabled && "opacity-50")}>{children}</div>
      </div>
    </SettingAnchor>
  );
}

function CompactHelpPopover({
  label,
  description,
  helpText,
}: Pick<SettingsCommonProps, "label" | "description" | "helpText">) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={`About ${label}`}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-6 sm:w-6"
        >
          <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={6}
          className="z-50 w-72 rounded-md border border-border bg-popover p-3 text-xs leading-snug text-popover-foreground shadow-md"
        >
          {description && <div>{description}</div>}
          {helpText && <div className={cn(description && "mt-2")}>{helpText}</div>}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
