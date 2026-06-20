'use client';

import { cn } from '@/lib/utils';

type DeltaType = 'new' | 'changed' | 'stale';

/** Delta hints get a muted semantic dot + monochrome micro-label — never a
 *  bright pill. `new` is additive (green), `changed` is informational (blue,
 *  not an alarm colour), `stale` is an absence of freshness so it stays fully
 *  neutral. The dot carries the meaning; the label stays muted. */
const CONFIG: Record<DeltaType, { label: string; dotClass: string }> = {
    new:     { label: 'New',     dotClass: 'bg-emerald-500/70' },
    changed: { label: 'Changed', dotClass: 'bg-blue-500/70' },
    stale:   { label: 'Stale',   dotClass: 'bg-muted-foreground/50' },
};

interface DeltaBadgeProps {
    type: DeltaType;
    className?: string;
}

export function DeltaBadge({ type, className }: DeltaBadgeProps) {
    const config = CONFIG[type];
    return (
        <span className={cn(
            'inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide whitespace-nowrap text-muted-foreground',
            className,
        )}>
            <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', config.dotClass)} />
            {config.label}
        </span>
    );
}
