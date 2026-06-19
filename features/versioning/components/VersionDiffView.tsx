'use client';

/**
 * VersionDiffView — Field-by-field diff renderer for two versions.
 *
 * Takes the `changed_fields` from `get_version_diff` and renders
 * each field with side-by-side comparison.
 */

import React, { useState } from 'react';
import { ChevronDown, ChevronRight, ArrowRight } from 'lucide-react';
import { InlineTextDiff } from '@/components/diff/adapters/InlineTextDiff';
import type { VersionDiff } from '../types';

interface VersionDiffViewProps {
    diff: VersionDiff;
    versionA: number;
    versionB: number;
    className?: string;
}

type DiffViewMode = 'side-by-side' | 'inline';

/**
 * Renders a diff for a single field.
 */
function FieldDiff({
    fieldName,
    valueA,
    valueB,
    viewMode,
}: {
    fieldName: string;
    valueA: unknown;
    valueB: unknown;
    viewMode: DiffViewMode;
}) {
    const [expanded, setExpanded] = useState(true);

    const strA = typeof valueA === 'string' ? valueA : JSON.stringify(valueA, null, 2);
    const strB = typeof valueB === 'string' ? valueB : JSON.stringify(valueB, null, 2);

    const isLong = (strA?.length ?? 0) > 100 || (strB?.length ?? 0) > 100;

    return (
        <div className="border border-border rounded-md overflow-hidden">
            {/* Field header */}
            <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-2 w-full px-3 py-2 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
            >
                {expanded ? (
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                )}
                <span className="text-sm font-medium">{fieldName.replace(/_/g, ' ')}</span>
            </button>

            {/* Diff content */}
            {expanded && (
                <div className="p-3">
                    {viewMode === 'side-by-side' ? (
                        <div className="overflow-auto max-h-48 rounded-md border border-border">
                            <InlineTextDiff
                                original={strA ?? 'null'}
                                modified={strB ?? 'null'}
                                view="split"
                            />
                        </div>
                    ) : (
                        /* Inline mode */
                        <div className="space-y-2">
                            {!isLong ? (
                                <div className="flex items-center gap-2 text-sm flex-wrap">
                                    <span className="font-mono text-xs bg-red-500/10 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded line-through">
                                        {strA ?? 'null'}
                                    </span>
                                    <ArrowRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                                    <span className="font-mono text-xs bg-green-500/10 text-green-600 dark:text-green-400 px-1.5 py-0.5 rounded">
                                        {strB ?? 'null'}
                                    </span>
                                </div>
                            ) : (
                                <div className="overflow-auto max-h-48 rounded-md border border-border">
                                    <InlineTextDiff
                                        original={strA ?? 'null'}
                                        modified={strB ?? 'null'}
                                        view="inline"
                                    />
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export function VersionDiffView({ diff, versionA, versionB, className = '' }: VersionDiffViewProps) {
    const [viewMode, setViewMode] = useState<DiffViewMode>('side-by-side');
    const fields = Object.entries(diff.changed_fields);

    return (
        <div className={`space-y-3 ${className}`}>
            {/* Header */}
            <div className="flex items-center justify-between pb-2 border-b border-border">
                <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold">
                        Diff: v{versionA} → v{versionB}
                    </h3>
                    <span className="text-xs text-muted-foreground">
                        {diff.total_changes} {diff.total_changes === 1 ? 'change' : 'changes'}
                    </span>
                </div>

                {/* View mode toggle */}
                <div className="flex items-center gap-1 bg-muted/50 rounded-md p-0.5">
                    <button
                        onClick={() => setViewMode('side-by-side')}
                        className={`text-xs px-2 py-1 rounded transition-colors ${
                            viewMode === 'side-by-side'
                                ? 'bg-background text-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        Side by Side
                    </button>
                    <button
                        onClick={() => setViewMode('inline')}
                        className={`text-xs px-2 py-1 rounded transition-colors ${
                            viewMode === 'inline'
                                ? 'bg-background text-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        Inline
                    </button>
                </div>
            </div>

            {/* Field diffs */}
            <div className="space-y-2">
                {fields.map(([fieldName, { version_a, version_b }]) => (
                    <FieldDiff
                        key={fieldName}
                        fieldName={fieldName}
                        valueA={version_a}
                        valueB={version_b}
                        viewMode={viewMode}
                    />
                ))}
            </div>

            {fields.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                    No differences between these versions.
                </p>
            )}
        </div>
    );
}
