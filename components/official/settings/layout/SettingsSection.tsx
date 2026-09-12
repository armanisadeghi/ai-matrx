"use client";

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSettingsDesign } from "../SettingsDesignProvider";
import { SettingsSectionProvider } from "../SettingsSectionContext";

export type SettingsSectionProps = {
  title: string;
  description?: string;
  icon?: LucideIcon;
  /** Makes the section expand/collapse with a chevron header. */
  collapsible?: boolean;
  /** When collapsible, controls initial state. Defaults to expanded. */
  defaultOpen?: boolean;
  /** Section header emphasis. Defaults to "default". */
  emphasis?: "subtle" | "default" | "strong";
  /** Optional action node rendered to the right of the title (e.g. reset button). */
  action?: React.ReactNode;
  children: React.ReactNode;
};

export type SettingsGroupProps = SettingsSectionProps;

const emphasisTitleClass = {
  subtle: "text-xs font-semibold uppercase tracking-wide text-muted-foreground",
  default: "text-sm font-semibold text-foreground",
  strong: "text-base font-semibold text-foreground",
};

/**
 * SettingsSection groups related rows under a common header.
 * Sections are the primary organizing unit inside a settings tab.
 */
export function SettingsSection({
  title,
  description,
  icon: Icon,
  collapsible,
  defaultOpen = true,
  emphasis = "default",
  action,
  children,
}: SettingsSectionProps) {
  const { variant } = useSettingsDesign();
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId().replace(/:/g, "");
  const isOpen = collapsible ? open : true;

  return (
    <section className={cn(variant === "compact" ? "mb-4" : "mb-6")}>
      <header className="flex items-center gap-2 px-4 mb-2">
        {collapsible ? (
          <button
            type="button"
            className="-mx-2 flex min-w-0 items-center gap-2 rounded px-2 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-expanded={isOpen}
            aria-controls={contentId}
            onClick={() => setOpen((value) => !value)}
          >
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
                !isOpen && "-rotate-90",
              )}
              aria-hidden="true"
            />
            {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
            <span className={emphasisTitleClass[emphasis]}>{title}</span>
          </button>
        ) : (
          <>
            {Icon && <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
            <h3 className={emphasisTitleClass[emphasis]}>{title}</h3>
          </>
        )}
        <div className="flex-1" />
        {action && <div className="shrink-0">{action}</div>}
      </header>
      {description && isOpen && (
        <p className="px-4 text-xs text-muted-foreground mb-2 leading-snug">
          {description}
        </p>
      )}
      {isOpen && (
        <div id={contentId} className={cn("border border-border/40 bg-card/30", variant === "compact" ? "rounded-md" : "rounded-lg")}>
          <SettingsSectionProvider title={title}>{children}</SettingsSectionProvider>
        </div>
      )}
    </section>
  );
}

/** A named reusable settings group with the exact SettingsSection contract. */
export function SettingsGroup(props: SettingsGroupProps) {
  return <SettingsSection {...props} />;
}
