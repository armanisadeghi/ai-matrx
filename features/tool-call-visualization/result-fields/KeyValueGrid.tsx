"use client";

/**
 * KeyValueGrid — renders a plain object as a definition list. Each key is a
 * mono `text-muted-foreground` term; each value recurses through
 * {@link ResultValue} (so nested objects, tables, media, urls all render
 * richly). In inline density the entry count is capped with "+N more".
 *
 * Every key is reachable: nothing is dropped, only deferred behind a toggle.
 */

import React from "react";
import { cn } from "@/lib/utils";
import { humanizeKey } from "./shape";
import { ResultValue, type ResultDensity } from "./ResultValue";

export interface KeyValueGridProps {
    value: Record<string, unknown>;
    density?: ResultDensity;
    depth?: number;
    className?: string;
}

/** Inline cap on the number of object entries shown before "+N more". */
const INLINE_ENTRY_CAP = 8;

export const KeyValueGrid: React.FC<KeyValueGridProps> = ({
    value,
    density = "inline",
    depth = 0,
    className,
}) => {
    const [showAll, setShowAll] = React.useState(false);
    const entries = Object.entries(value);

    const cap = density === "inline" && !showAll ? INLINE_ENTRY_CAP : entries.length;
    const shown = entries.slice(0, cap);
    const remaining = entries.length - shown.length;

    return (
        <div className={cn("min-w-0", className)}>
            <dl className="grid grid-cols-[minmax(0,max-content)_minmax(0,1fr)] gap-x-3 gap-y-1.5">
                {shown.map(([key, val]) => (
                    <React.Fragment key={key}>
                        <dt
                            className="break-words pt-0.5 font-mono text-xs text-muted-foreground"
                            title={key}
                        >
                            {humanizeKey(key)}
                        </dt>
                        <dd className="min-w-0">
                            <ResultValue value={val} density={density} depth={depth + 1} />
                        </dd>
                    </React.Fragment>
                ))}
            </dl>
            {remaining > 0 && (
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        setShowAll(true);
                    }}
                    className="mt-1.5 text-xs font-medium text-primary hover:underline"
                >
                    +{remaining} more {remaining === 1 ? "field" : "fields"}
                </button>
            )}
        </div>
    );
};
