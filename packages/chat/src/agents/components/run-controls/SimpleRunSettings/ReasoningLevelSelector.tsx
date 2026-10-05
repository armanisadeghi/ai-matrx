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
import { cn } from '@ai-matrx/design-system';
import { SegmentedControl } from '@ai-matrx/design-system/controls';
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
      <SegmentedControl
        fill
        aria-label="How much should it think?"
        value={value}
        onValueChange={onChange}
        data={REASONING_LEVELS.map((level) => ({ value: level.id, label: level.label }))}
      />

      <p className="text-[11px] text-muted-foreground leading-snug min-h-[1.2em]">
        {currentHint}
      </p>
    </div>
  );
}
