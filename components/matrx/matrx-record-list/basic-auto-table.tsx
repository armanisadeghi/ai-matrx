'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { ComponentDensity, ComponentSize } from '@/types/componentConfigTypes';
import type { JsonObject } from '@/types/json';

interface BasicAutoTableProps {
    /** Arbitrary, uniformly-shaped JSON objects — this is a generic "render any JSON as a table" primitive with no fixed schema. */
    data: JsonObject[];
    density?: ComponentDensity;
    size?: ComponentSize;
    showBorders?: boolean;
    className?: string;
    maxLength?: number;
}

const densityMap = {
    compact: 'py-1',
    normal: 'py-2',
    comfortable: 'py-3'
} as const;

const sizeMap = {
    xs: 'text-xs',
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
    xl: 'text-xl'
} as const;

export function MatrxBasicAutoTable({
                                        data,
                                        density = 'compact',
                                        size = 'xs',
                                        showBorders = true,
                                        className,
                                        maxLength = 100
                                    }: BasicAutoTableProps) {
    if (!Array.isArray(data) || data.length === 0) {
        return null;
    }

    const truncate = React.useCallback((text: string) => {
        if (!text || text.length <= maxLength) return text;
        return text.slice(0, maxLength) + '...';
    }, [maxLength]);

    const formatValue = React.useCallback((value: unknown): string => {
        if (value === null || value === undefined) return '-';
        if (typeof value === 'object') {
            try {
                return JSON.stringify(value);
            } catch {
                return '-';
            }
        }
        return String(value);
    }, []);

    const headers = React.useMemo(() =>
            Array.from(new Set(data.flatMap(obj => Object.keys(obj))))
        , [data]);

    return (
        <div className={cn("w-full overflow-x-auto rounded-md", className)}>
            <table className="w-full min-w-[400px]">
                <thead>
                <tr className={cn(
                    "border-b border-border",
                    sizeMap[size]
                )}>
                    {headers.map(header => (
                        <th key={header} className={cn(
                            "text-left font-medium text-muted-foreground",
                            densityMap[density],
                            "px-2 first:pl-4 last:pr-4"
                        )}>
                            {header}
                        </th>
                    ))}
                </tr>
                </thead>
                <tbody>
                {data.map((row, rowIndex) => (
                    <tr key={rowIndex} className={cn(
                        showBorders && "border-b border-border last:border-0",
                        sizeMap[size]
                    )}>
                        {headers.map(header => (
                            <td key={header} className={cn(
                                densityMap[density],
                                "px-2 first:pl-4 last:pr-4"
                            )}>
                                {truncate(formatValue(row[header]))}
                            </td>
                        ))}
                    </tr>
                ))}
                </tbody>
            </table>
        </div>
    );
}

export default MatrxBasicAutoTable;
