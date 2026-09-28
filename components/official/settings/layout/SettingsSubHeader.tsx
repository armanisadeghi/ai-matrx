"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSettingsDesign } from "../SettingsDesignProvider";
import { CompactHelpPopover } from "../SettingsRow";

export type SettingsSubHeaderProps = {
  title: string;
  description?: string;
  icon?: LucideIcon;
  /** Renders a bottom border as a divider. Defaults to true. */
  divider?: boolean;
};

/**
 * Page-level header for a settings tab. The `description` opens from a help
 * icon beside the title rather than sitting under it.
 * Render once at the top of each tab component — above any SettingsSection.
 */
export function SettingsSubHeader({
  title,
  description,
  icon: Icon,
  divider = true,
}: SettingsSubHeaderProps) {
  const { variant } = useSettingsDesign();
  return (
    <div
      data-settings-subheader=""
      className={cn(
        "px-4",
        variant === "compact" ? "pb-3 mb-3" : "pb-4 mb-4",
        divider && "border-b border-border/40",
      )}
    >
      <div className="flex items-center gap-2">
        {Icon && <Icon className="h-5 w-5 text-foreground" />}
        <h2 className={cn("font-semibold text-foreground leading-tight", variant === "compact" ? "text-base" : "text-lg")}>
          {title}
        </h2>
        {/* The title stands alone (page-pass core 3): what the tab is for is
            one tap away, never a sentence parked under every heading. */}
        {description && <CompactHelpPopover label={title} description={description} />}
      </div>
    </div>
  );
}
