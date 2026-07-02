'use client';

import React from 'react';
import {cn} from '@/lib/utils';
import {Check, X} from 'lucide-react';

interface MetricRowProps {
    label: string;
    /** Arbitrary JSON-ish value — formatted defensively (string/number/boolean/object/null all handled). */
    value: unknown;
    showIcon?: boolean;
    className?: string;
}

export function MatrxMetricRow(
    {
        label,
        value,
        showIcon = false,
        className
    }: MetricRowProps) {
    const formattedValue = React.useMemo(() => {
        if (value === null || value === undefined) return '-';
        if (typeof value === 'object') {
            try {
                return JSON.stringify(value);
            } catch {
                return '-';
            }
        }
        return String(value);
    }, [value]);

    const shouldShowIcon = showIcon && typeof value === 'boolean';

    return (
        <div className={cn(
            "flex items-center justify-between py-0.5 border-b border-border last:border-0",
            className
        )}>
            <span className="text-xs text-muted-foreground">{label}</span>
            <div className="flex items-center gap-1">
                <span className={cn(
                    "text-xs font-medium",
                    shouldShowIcon ? '' : 'text-foreground'
                )}>
                    {shouldShowIcon ? '' : formattedValue}
                </span>
                {shouldShowIcon && (
                    value ? <Check className="h-4 w-4 text-green-500 dark:text-green-400"/>
                          : <X className="h-4 w-4 text-red-500 dark:text-red-400"/>
                )}
            </div>
        </div>
    );
}

export default MatrxMetricRow;
