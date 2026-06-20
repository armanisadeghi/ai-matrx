'use client';

import { cn } from '@/lib/utils';
import { ORIGIN_CONFIG } from '../../constants';
import type { SourceOrigin } from '../../types';

interface OriginBadgeProps {
    origin: SourceOrigin;
    className?: string;
}

/**
 * Origin is provenance metadata, not a status — so it gets the quietest
 * treatment of all: a thin-bordered, monochrome micro-label, no semantic colour.
 * Reads as a subtle qualifier next to the row, never competing for attention.
 */
export function OriginBadge({ origin, className }: OriginBadgeProps) {
    const config = ORIGIN_CONFIG[origin];
    if (!config) return null;

    return (
        <span className={cn(
            'inline-flex items-center rounded border border-border px-1.5 py-px text-[10px] font-medium uppercase tracking-wide whitespace-nowrap text-muted-foreground',
            className,
        )}>
            {config.label}
        </span>
    );
}
