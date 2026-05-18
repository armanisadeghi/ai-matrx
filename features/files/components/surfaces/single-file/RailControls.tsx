/**
 * features/files/components/surfaces/single-file/RailControls.tsx
 *
 * Primitive controls used by every rail panel. Kept small and consistent
 * so the rail reads top-to-bottom like one unified tool palette instead
 * of a mosaic of bespoke styles.
 */

"use client";

import { cn } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";

// ---------------------------------------------------------------------------
// Row button — full-width, icon + label, optional active state.
// ---------------------------------------------------------------------------

export function RailButton({
  icon,
  label,
  onClick,
  disabled,
  active,
  title,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs font-medium transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-50",
        active
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-transparent text-foreground hover:bg-accent",
      )}
    >
      <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
        {icon}
      </span>
      <span className="truncate">{label}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Two-column icon button row — used for grouped pairs (zoom in / out, rotate
// left / right) so we don't waste a full row on a 24px control.
// ---------------------------------------------------------------------------

export function RailIconRow({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-1">{children}</div>;
}

export function RailIconButton({
  icon,
  onClick,
  disabled,
  ariaLabel,
  title,
}: {
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  ariaLabel: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      title={title}
      className={cn(
        "flex h-7 flex-1 items-center justify-center rounded-md border border-transparent text-foreground transition-colors hover:bg-accent",
        "disabled:cursor-not-allowed disabled:opacity-50",
      )}
    >
      <span className="flex h-3.5 w-3.5 items-center justify-center">
        {icon}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Toggle pill — used for boolean settings (transparency grid, word-wrap).
// ---------------------------------------------------------------------------

export function RailToggle({
  label,
  active,
  onClick,
  title,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="switch"
      aria-checked={active}
      title={title}
      className={cn(
        "flex w-full items-center justify-between rounded-md border px-2 py-1.5 text-left text-xs font-medium transition-colors",
        active
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border/60 bg-background text-foreground hover:bg-accent",
      )}
    >
      <span className="truncate">{label}</span>
      <span
        className={cn(
          "ml-2 inline-flex h-3.5 w-6 shrink-0 items-center rounded-full border transition-colors",
          active ? "border-primary bg-primary" : "border-border bg-muted",
        )}
      >
        <span
          className={cn(
            "h-2.5 w-2.5 translate-x-0.5 rounded-full bg-background transition-transform",
            active && "translate-x-3",
          )}
        />
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Segmented toggle — used when there are 2–4 mutually-exclusive options
// (Rendered/Source, viewport picker, fit/actual, tab-size).
// ---------------------------------------------------------------------------

export interface RailSegmentedOption<T extends string | number> {
  value: T;
  label: string;
  icon?: React.ReactNode;
}

export function RailSegmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: ReadonlyArray<RailSegmentedOption<T>>;
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div className="flex w-full rounded-md border border-border/60 bg-background p-0.5">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            className={cn(
              "flex flex-1 items-center justify-center gap-1 rounded-sm px-1.5 py-1 text-[11px] font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            title={opt.label}
          >
            {opt.icon}
            <span className="truncate">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Slider + value badge — used for zoom, font size. Re-uses the shadcn
// Slider primitive for keyboard support / focus rings.
// ---------------------------------------------------------------------------

export function RailSlider({
  value,
  onChange,
  min,
  max,
  step,
  formatValue,
}: {
  value: number;
  onChange: (next: number) => void;
  min: number;
  max: number;
  step: number;
  formatValue?: (n: number) => string;
}) {
  const display = formatValue ? formatValue(value) : String(value);
  return (
    <div className="space-y-1.5 px-1">
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(next) => {
          if (next.length > 0) onChange(next[0]);
        }}
      />
      <div className="text-right text-[10px] font-mono text-muted-foreground">
        {display}
      </div>
    </div>
  );
}
