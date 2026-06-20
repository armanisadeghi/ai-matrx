'use client';

import { cn } from '@/lib/utils';
import { SCRAPE_STATUS_CONFIG } from '../../constants';
import type { ScrapeStatus, TopicStatus } from '../../types';

const TOPIC_STATUS_CONFIG: Record<TopicStatus, { label: string; color: string; bgClass: string; textClass: string }> = {
    draft:     { label: 'Draft',    color: '#a1a1aa', bgClass: 'bg-zinc-200/60 dark:bg-zinc-700/40',         textClass: 'text-zinc-600 dark:text-zinc-400' },
    searching: { label: 'Search',   color: '#3b82f6', bgClass: 'bg-blue-100/60 dark:bg-blue-900/20',         textClass: 'text-blue-600 dark:text-blue-400' },
    scraping:  { label: 'Scrape',   color: '#8b5cf6', bgClass: 'bg-violet-100/60 dark:bg-violet-900/20',     textClass: 'text-violet-600 dark:text-violet-400' },
    curating:  { label: 'Curation', color: '#eab308', bgClass: 'bg-yellow-100/60 dark:bg-yellow-900/20',     textClass: 'text-yellow-600 dark:text-yellow-400' },
    analyzing: { label: 'Analysis', color: '#f97316', bgClass: 'bg-orange-100/60 dark:bg-orange-900/20',     textClass: 'text-orange-600 dark:text-orange-400' },
    complete:  { label: 'Complete', color: '#22c55e', bgClass: 'bg-green-100/60 dark:bg-green-900/20',       textClass: 'text-green-600 dark:text-green-400' },
};

interface StatusBadgeProps {
    status: ScrapeStatus | TopicStatus | string;
    className?: string;
}

/**
 * Restrained status marker: a small muted semantic dot + a monochrome label.
 * No bright pill — the dot carries the meaning, the text stays neutral so dense
 * tables read like a data console, not a tag cloud. Legible in light + dark via
 * theme tokens; the dot's hue is the only colour and it sits at low opacity.
 */
export function StatusBadge({ status, className }: StatusBadgeProps) {
    const config = TOPIC_STATUS_CONFIG[status as TopicStatus] ?? SCRAPE_STATUS_CONFIG[status as ScrapeStatus];

    if (!config) {
        return (
            <span className={cn('inline-flex items-center text-[10px] font-medium uppercase tracking-wide whitespace-nowrap text-muted-foreground', className)}>
                {status}
            </span>
        );
    }

    return (
        <span className={cn(
            'inline-flex items-center gap-1.5 text-[11px] font-medium whitespace-nowrap text-muted-foreground',
            className,
        )}>
            <span className="h-1.5 w-1.5 shrink-0 rounded-full opacity-80" style={{ backgroundColor: config.color }} />
            {config.label}
        </span>
    );
}
