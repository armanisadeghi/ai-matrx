'use client';

/**
 * ComplexityBadge
 *
 * Pure presentation. Reads only `total` and `band` from the algorithm
 * result, renders a colored pill.
 */

import React from 'react';
import { cn } from '@/lib/utils';
import type { AlgorithmResult, ComplexityBand } from './algorithm';

const BAND_DOT: Record<ComplexityBand, string> = {
  low: 'bg-emerald-500',
  moderate: 'bg-amber-500',
  high: 'bg-orange-500',
  extreme: 'bg-red-500',
};

const BAND_LABEL: Record<ComplexityBand, string> = {
  low: 'Simple',
  moderate: 'Moderate',
  high: 'Demanding',
  extreme: 'Frontier',
};

const BAND_TINT: Record<ComplexityBand, string> = {
  low: 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-900/60',
  moderate: 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-900/60',
  high: 'bg-orange-50 dark:bg-orange-500/10 border-orange-200 dark:border-orange-900/60',
  extreme: 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-900/60',
};

export function ComplexityBadge({ result }: { result: AlgorithmResult }) {
  const { total, band } = result;
  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-3 py-1',
        BAND_TINT[band],
      )}
      title={`Complexity ${total} — ${BAND_LABEL[band]}`}
    >
      <span className={cn('h-2 w-2 rounded-full', BAND_DOT[band])} aria-hidden />
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
        Complexity
      </span>
      <span className="text-sm font-semibold tabular-nums text-foreground">
        {total}
      </span>
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {BAND_LABEL[band]}
      </span>
    </div>
  );
}
