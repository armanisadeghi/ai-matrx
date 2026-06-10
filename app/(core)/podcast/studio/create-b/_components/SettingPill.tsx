"use client";

// create-b — a compact "settings bar" pill that opens a popover.
//
// The core move of this redesign: instead of stacking 6 full-width sections
// (language / format / hosts / show / processing / advanced) down the page, each
// collapses to a single pill that shows its CURRENT value inline and reveals the
// full set of options in a popover. Every option stays one click away; the page
// stays calm.

import type { LucideIcon } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface SettingPillProps {
  icon: LucideIcon;
  label: string;
  /** The current selection, shown as the pill's value. */
  value: string;
  /** True when the user has changed this away from its default — gets an accent. */
  active?: boolean;
  /** Popover width class. */
  width?: string;
  children: React.ReactNode;
}

export function SettingPill({
  icon: Icon,
  label,
  value,
  active,
  width = "w-80",
  children,
}: SettingPillProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "group inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-all",
            "bg-glass border-glass-edge backdrop-blur-glass backdrop-saturate-glass shadow-glass",
            "hover:bg-glass-hover hover:shadow-glass-lg",
            active && "ring-1 ring-primary/40",
          )}
        >
          <Icon
            className={cn(
              "h-4 w-4 shrink-0",
              active ? "text-primary" : "text-muted-foreground",
            )}
          />
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
          <span className="max-w-[10rem] truncate font-medium text-foreground">
            {value}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn(
          "p-0",
          width,
          "bg-glass border-glass-edge backdrop-blur-glass backdrop-saturate-glass shadow-glass-lg",
        )}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}

/** Header row inside a setting popover. */
export function PopoverHeader({
  icon: Icon,
  title,
  hint,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex items-start gap-2.5 border-b border-border/60 px-4 py-3">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        {hint && (
          <div className="text-[11px] leading-snug text-muted-foreground">
            {hint}
          </div>
        )}
      </div>
    </div>
  );
}
