"use client";

/**
 * The builder's small shared pieces — ONE spacing scale, ONE selected state,
 * ONE label treatment. Everything on the left pane is built from these so
 * alignment and rhythm are structural rather than something each row
 * remembers to get right.
 */

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** A numbered step of the build flow. */
export function Section({
  number,
  title,
  hint,
  action,
  children,
}: {
  number: number;
  title: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
          {number}
        </span>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {action ? <div className="ml-auto flex items-center">{action}</div> : null}
      </div>
      {hint ? (
        <p className="pl-7 text-xs leading-relaxed text-muted-foreground">{hint}</p>
      ) : null}
      <div className="space-y-2 pl-7">{children}</div>
    </section>
  );
}

/** The one field label treatment. */
export function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </span>
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

/** The one multiple-choice control: a single row of equal-weight segments. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T | null;
  options: readonly SegmentOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex w-full rounded-lg border border-border bg-muted/40 p-0.5"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
              selected
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** The one text input. 16px so iOS never zooms the page on focus. */
export function TextField({
  value,
  onChange,
  placeholder,
  ariaLabel,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      aria-label={ariaLabel}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "h-9 w-full rounded-lg border border-border bg-background px-2.5 text-[16px] text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none sm:text-sm",
        className,
      )}
    />
  );
}

/** The one dropdown. */
export function SelectField<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <select
      value={value}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value as T)}
      className={cn(
        "h-9 w-full rounded-lg border border-border bg-background px-2 text-sm text-foreground focus:border-primary focus:outline-none",
        className,
      )}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/** A selectable card — the one "pick this" affordance. */
export function ChoiceCard({
  title,
  detail,
  icon,
  selected,
  onClick,
}: {
  title: string;
  detail?: string;
  icon?: ReactNode;
  selected?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-2.5 rounded-lg border p-2.5 text-left transition-colors",
        selected
          ? "border-primary bg-primary/5"
          : "border-border bg-card hover:border-primary/40",
      )}
    >
      {icon ? (
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">
          {title}
        </span>
        {detail ? (
          <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
            {detail}
          </span>
        ) : null}
      </span>
    </button>
  );
}
