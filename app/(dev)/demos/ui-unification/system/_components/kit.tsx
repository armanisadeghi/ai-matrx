"use client";

/**
 * Shared pieces of the settled-system page. Every control here is the ONE
 * control (`uc-*` classes from `../../_components/one-control.tsx`), so it is
 * 28px tall and carries its own 3px half-gap; containers add no gap between
 * controls. Badge tints come from round 2's `TONE_CLASS`.
 */

import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { TONE_CLASS, type Tone } from "../../_components/round2";

/** A page section: hairline above, title, groups spaced apart, no box. */
export function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 border-b border-border py-6">
      <h2 id={`${id}-title`} className="mb-4 text-[0.8125rem] font-semibold text-foreground">
        {title}
      </h2>
      <div className="flex flex-col gap-6">{children}</div>
    </section>
  );
}

/** A group inside a section: an 11px label, then its content. */
export function Group({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      <div className="text-[0.6875rem] font-medium text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}

/** The settled badge: outline shape, 18px, 11px text, token tint. */
export function StatusBadge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex h-[1.125rem] shrink-0 items-center rounded-md border px-1.5 text-[0.6875rem] font-medium",
        TONE_CLASS[tone],
      )}
    >
      {children}
    </span>
  );
}

/** A real select in the one-control shape: the capsule opens a radio menu. */
export function UcSelect({
  value,
  options,
  onChange,
  label,
  width = "7.5rem",
}: {
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (v: string) => void;
  label: string;
  width?: string;
}) {
  const current = options.find((o) => o.value === value)?.label ?? value;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="uc-select" style={{ width }} aria-label={label}>
          <span className="truncate">{current}</span>
          <ChevronDown aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-40">
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          {options.map((o) => (
            <DropdownMenuRadioItem key={o.value} value={o.value}>
              {o.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Capsule segmented control for filters (controlled). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="uc-seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className="uc-seg-item"
          data-on={value === o.value ? "" : undefined}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Underline tabs for page sections (controlled). */
export function SectionTabs<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="tablist" aria-label={label} className={cn("flex items-end gap-4 overflow-x-auto border-b border-border", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "-mb-px h-8 shrink-0 border-b-2 text-[0.8125rem] font-medium",
            value === o.value ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const ROWS = [
  { id: "r1", name: "Quarterly client report", owner: "Ana Ruiz", updated: "2h ago", runs: 128, status: "draft" },
  { id: "r2", name: "Intake form — dental", owner: "Ben Ortiz", updated: "Yesterday", runs: 2140, status: "live" },
  { id: "r3", name: "Weekly check-in agenda", owner: "Ana Ruiz", updated: "3d ago", runs: 46, status: "review" },
  { id: "r4", name: "Old onboarding checklist", owner: "Dana Reyes", updated: "1w ago", runs: 9, status: "failed" },
  { id: "r5", name: "Referral letter template", owner: "Chris Lee", updated: "2w ago", runs: 311, status: "live" },
] as const;

export type Row = (typeof ROWS)[number];

export const STATUS: Record<Row["status"], { tone: Tone; label: string }> = {
  draft: { tone: "neutral", label: "Draft" },
  live: { tone: "success", label: "Live" },
  review: { tone: "warning", label: "In review" },
  failed: { tone: "destructive", label: "Failed" },
};
