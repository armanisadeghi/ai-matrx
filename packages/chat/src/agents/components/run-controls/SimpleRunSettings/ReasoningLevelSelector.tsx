'use client';

/**
 * ReasoningLevelSelector
 *
 * Segmented 5-pill control for "how much should it think?" with a
 * contextual hint line that updates with the selected level.
 *
 * Visual shorthand: the pills are ordered left→right with a subtle
 * gradient background suggesting "faster → deeper". The hint line below
 * translates the level into plain language.
 */

import React from 'react';
import { cn } from '@/lib/utils';
import {
  REASONING_LEVELS,
  findReasoningLevel,
  type ReasoningLevelId,
} from './capabilities';

export interface ReasoningLevelSelectorProps {
  value: ReasoningLevelId;
  onChange: (id: ReasoningLevelId) => void;
  className?: string;
}

export function ReasoningLevelSelector({
  value,
  onChange,
  className,
}: ReasoningLevelSelectorProps) {
  const currentHint = findReasoningLevel(value)?.hint ?? '';

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div
        role="radiogroup"
        aria-label="How much should it think?"
        className={cn(
          'flex items-center rounded-lg border border-border bg-muted/40 p-0.5',
          // left-to-right gradient: easy → deep
          'bg-gradient-to-r from-muted/40 via-muted/40 to-muted/70',
        )}
      >
        {REASONING_LEVELS.map((level) => {
          const selected = level.id === value;
          return (
            <button
              key={level.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(level.id)}
              className={cn(
                'relative flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-all',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                selected
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {level.label}
            </button>
          );
        })}
      </div>

      <p className="text-[11px] text-muted-foreground leading-snug min-h-[1.2em]">
        {currentHint}
      </p>
    </div>
  );
}
