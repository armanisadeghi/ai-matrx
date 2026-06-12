"use client";

// app/(core)/podcast/studio/create-c/_components/SettingPill.tsx
//
// A compact, glassy "settings chip" that opens a popover with its full option
// set. This is the core move of the create-c redesign: every secondary option
// (language, format, hosts, show, processing, advanced) collapses into one
// horizontal row of these pills, so the page opens calm but nothing is hidden.

import * as React from "react";
import { ChevronDown } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface SettingPillProps {
  icon: React.ComponentType<{ className?: string }>;
  /** Top label, e.g. "Language" */
  label: string;
  /** Current selection summary, e.g. "English" */
  value: React.ReactNode;
  /** Optional accent so a customized pill (e.g. processing applied) stands out. */
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
  width = "w-72",
  children,
}: SettingPillProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "group flex items-center gap-2 rounded-xl border px-3 py-2 text-left transition-colors",
            "bg-glass border-glass-edge backdrop-blur-glass backdrop-saturate-glass shadow-glass",
            "hover:bg-glass-hover",
            active && "border-primary/40 ring-1 ring-primary/25",
          )}
        >
          <Icon
            className={cn(
              "h-4 w-4 shrink-0",
              active ? "text-primary" : "text-muted-foreground",
            )}
          />
          <span className="min-w-0">
            <span className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {label}
            </span>
            <span className="block truncate text-sm font-medium text-foreground">
              {value}
            </span>
          </span>
          <ChevronDown className="ml-1 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn("p-0 overflow-hidden rounded-xl", width)}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}

/** A header row used inside every pill popover. */
export function PillHeader({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}) {
  return (
    <div className="border-b border-border px-3 py-2.5">
      <div className="text-sm font-semibold text-foreground">{title}</div>
      {hint ? (
        <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>
      ) : null}
    </div>
  );
}
