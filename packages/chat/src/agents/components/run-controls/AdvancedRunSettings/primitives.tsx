'use client';

/**
 * AdvancedRunSettings primitives
 *
 * Visual building blocks for the settings panel. Every control is:
 *   - full-width in its row (stretches to fill available space)
 *   - high-contrast in the selected state (blue fill, never just a shadow)
 *   - stateless (parent owns the value + onChange)
 *
 * Components:
 *   <SectionHeader>          colored stripe + title + optional right slot
 *   <SectionRow>             label on the left, controls fill the right
 *   <LevelPillGroup>         5 equal-width pills for the Level scale
 *   <EndpointSlider>         5-dot track with fixed-width endpoint labels
 *   <PillChoiceGroup>        single/multi select pill row, no wrap
 *   <StructuredCheckboxGrid> aligned grid of checkbox rows (no pills)
 */

import React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LEVELS, type Level } from './constants';

// ── Accent colors per section ────────────────────────────────────────────────

export type SectionAccent =
  | 'blue'
  | 'violet'
  | 'amber'
  | 'emerald'
  | 'rose'
  | 'indigo';

const STRIPE_CLASS: Record<SectionAccent, string> = {
  blue: 'bg-blue-500',
  violet: 'bg-violet-500',
  amber: 'bg-amber-500',
  emerald: 'bg-emerald-500',
  rose: 'bg-rose-500',
  indigo: 'bg-indigo-500',
};

// ── Section header ───────────────────────────────────────────────────────────

export function SectionHeader({
  title,
  accent,
  right,
}: {
  title: string;
  accent: SectionAccent;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <span className={cn('h-5 w-1 rounded-full', STRIPE_CLASS[accent])} />
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

// ── Section row ──────────────────────────────────────────────────────────────

export function SectionRow({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-4 whitespace-nowrap min-w-0',
        className,
      )}
    >
      <div className="w-44 shrink-0 text-xs font-medium text-foreground">
        {label}
      </div>
      <div className="flex-1 min-w-0 flex items-center">{children}</div>
    </div>
  );
}

// ── Level pill group ─────────────────────────────────────────────────────────
// Full-width, equal-size pills. Selected = vivid blue fill.

export function LevelPillGroup({
  value,
  onChange,
  className,
}: {
  value: Level;
  onChange: (v: Level) => void;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      className={cn(
        'flex w-full rounded-md border border-border bg-muted/30 p-0.5',
        className,
      )}
    >
      {LEVELS.map((l) => {
        const selected = l.id === value;
        return (
          <button
            key={l.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(l.id)}
            className={cn(
              'flex-1 rounded-[5px] px-2 py-1.5 text-xs font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              selected
                ? 'bg-blue-600 text-white dark:bg-blue-500 shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/60',
            )}
          >
            {l.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Endpoint slider ──────────────────────────────────────────────────────────
// 5-dot track with fixed-width endpoint labels so sliders align column-wise.

export function EndpointSlider({
  value,
  onChange,
  startLabel,
  endLabel,
  className,
}: {
  value: Level;
  onChange: (v: Level) => void;
  startLabel: string;
  endLabel: string;
  className?: string;
}) {
  const idx = LEVELS.findIndex((l) => l.id === value);
  const filledPct = (idx / (LEVELS.length - 1)) * 100;

  return (
    <div className={cn('flex items-center gap-3 w-full', className)}>
      <span className="shrink-0 w-[90px] text-right text-[10px] font-medium tracking-wide uppercase text-muted-foreground">
        {startLabel}
      </span>

      <div className="relative flex-1 h-6 flex items-center">
        {/* Unfilled track */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[3px] rounded-full bg-border" />
        {/* Filled portion */}
        <div
          className="absolute left-0 top-1/2 -translate-y-1/2 h-[3px] rounded-full bg-blue-600 dark:bg-blue-500 transition-all"
          style={{ width: `${filledPct}%` }}
        />
        {/* Dots */}
        <div className="relative w-full flex justify-between items-center">
          {LEVELS.map((l, i) => {
            const selected = l.id === value;
            const filled = i <= idx;
            return (
              <button
                key={l.id}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={l.label}
                onClick={() => onChange(l.id)}
                className={cn(
                  'h-4 w-4 rounded-full transition-all z-10 border-2 border-background',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  selected
                    ? 'bg-blue-600 dark:bg-blue-500 scale-125'
                    : filled
                      ? 'bg-blue-500/60 dark:bg-blue-400/60'
                      : 'bg-muted-foreground/30 hover:bg-muted-foreground/50',
                )}
              />
            );
          })}
        </div>
      </div>

      <span className="shrink-0 w-[60px] text-[10px] font-medium tracking-wide uppercase text-muted-foreground">
        {endLabel}
      </span>
    </div>
  );
}

// ── Pill choice group (single or multi select) ──────────────────────────────

export function PillChoiceGroup<T extends string>({
  options,
  value,
  onChange,
  mode = 'single',
  className,
}: {
  options: readonly { id: T; label: string }[];
  value: T | T[];
  onChange: (next: T | T[]) => void;
  mode?: 'single' | 'multi';
  className?: string;
}) {
  const isSelected = (id: T): boolean =>
    mode === 'single' ? value === id : Array.isArray(value) && value.includes(id);

  const handleClick = (id: T) => {
    if (mode === 'single') {
      onChange(id);
      return;
    }
    const current = Array.isArray(value) ? value : [];
    onChange(
      current.includes(id) ? current.filter((v) => v !== id) : [...current, id],
    );
  };

  return (
    <div
      role={mode === 'single' ? 'radiogroup' : 'group'}
      className={cn('flex items-center gap-1.5 min-w-0', className)}
    >
      {options.map((o) => {
        const selected = isSelected(o.id);
        return (
          <button
            key={o.id}
            type="button"
            role={mode === 'single' ? 'radio' : 'checkbox'}
            aria-checked={selected}
            onClick={() => handleClick(o.id)}
            className={cn(
              'shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              selected
                ? 'border-transparent bg-blue-600 text-white dark:bg-blue-500'
                : 'border-border bg-card text-muted-foreground hover:text-foreground hover:bg-accent/50',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Structured checkbox grid ─────────────────────────────────────────────────
// Aligned grid of checkbox rows. Used for long lists where pills would wrap
// into visual soup (e.g. the 24 artifact skills).

export function StructuredCheckboxGrid<T extends string>({
  options,
  value,
  onChange,
  columns = 3,
  className,
}: {
  options: readonly { id: T; label: string }[];
  value: T[];
  onChange: (next: T[]) => void;
  columns?: 2 | 3 | 4;
  className?: string;
}) {
  const toggle = (id: T) => {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  };

  const gridColsClass = {
    2: 'grid-cols-2',
    3: 'grid-cols-2 md:grid-cols-3',
    4: 'grid-cols-2 md:grid-cols-4',
  }[columns];

  return (
    <div role="group" className={cn('grid gap-x-4 gap-y-1', gridColsClass, className)}>
      {options.map((o) => {
        const selected = value.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            role="checkbox"
            aria-checked={selected}
            onClick={() => toggle(o.id)}
            className={cn(
              'flex items-center gap-2 px-1 py-1 rounded text-left transition-colors',
              'hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            )}
          >
            <span
              className={cn(
                'flex h-4 w-4 items-center justify-center rounded-sm border shrink-0 transition-colors',
                selected
                  ? 'bg-blue-600 border-blue-600 dark:bg-blue-500 dark:border-blue-500'
                  : 'border-border bg-card',
              )}
            >
              {selected && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
            </span>
            <span
              className={cn(
                'text-xs truncate',
                selected ? 'text-foreground font-medium' : 'text-muted-foreground',
              )}
            >
              {o.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
