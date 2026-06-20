"use client";

/**
 * ResultValue — the recursive heart of the result-field library.
 *
 * Given ANY value, it runs `detectResultShape` and delegates to the right
 * field component. Two densities:
 *
 *   "inline"  — compact preview for the chat body. Caps recursion depth (~2),
 *               list rows (~5), and table rows (~5), with "+N more" / "View
 *               all" affordances. Long text clamps with "Show more".
 *   "full"    — the overlay/window tab. Nothing is truncated; very long text
 *               gets a collapsible toggle but is never omitted.
 *
 * HIDE NOTHING is the contract. Truncation only ever happens in `inline`
 * density, and always with a clearly-labelled escape hatch.
 */

import React from "react";
import { cn } from "@/lib/utils";
import { detectResultShape } from "./shape";
import { ResultScalar } from "./ResultScalar";
import { ResultMarkdown } from "./ResultMarkdown";
import { ResultMedia } from "./ResultMedia";
import { ResultJson } from "./ResultJson";
import { UrlChip } from "./UrlChips";
import { EmptyResult } from "./EmptyResult";
import { KeyValueGrid } from "./KeyValueGrid";
import { ResultTable } from "./ResultTable";
import { ShortId } from "./ShortId";

export type ResultDensity = "inline" | "full";

export interface ResultValueProps {
    value: unknown;
    density?: ResultDensity;
    /** Current recursion depth (internal). */
    depth?: number;
    className?: string;
}

/** Depth past which inline rendering collapses to a JSON tree to stay compact. */
const INLINE_MAX_DEPTH = 2;
/** Inline list/table row cap before "+N more". */
const INLINE_ROW_CAP = 3;
/** Plain-text (non-markdown) inline line clamp. */
const INLINE_TEXT_LINES = 6;

/** Inline plain-text block with a "Show more" toggle (no markdown parsing). */
const InlineText: React.FC<{ value: string }> = ({ value }) => {
    const [expanded, setExpanded] = React.useState(false);
    const lines = value.split("\n");
    const isLong = lines.length > INLINE_TEXT_LINES || value.length > 600;

    if (!isLong) {
        return <p className="whitespace-pre-wrap break-words text-sm text-foreground">{value}</p>;
    }

    const shown = expanded ? value : lines.slice(0, INLINE_TEXT_LINES).join("\n");
    return (
        <div>
            <p className="whitespace-pre-wrap break-words text-sm text-foreground">{shown}</p>
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    setExpanded((v) => !v);
                }}
                className="mt-1 text-xs font-medium text-primary hover:underline"
            >
                {expanded ? "Show less" : "Show more"}
            </button>
        </div>
    );
};

/** A bullet list of scalars, capped in inline density. */
const ScalarList: React.FC<{ items: Array<string | number | boolean | null>; density: ResultDensity }> = ({
    items,
    density,
}) => {
    const [showAll, setShowAll] = React.useState(false);
    const cap = density === "inline" && !showAll ? INLINE_ROW_CAP : items.length;
    const shown = items.slice(0, cap);
    const remaining = items.length - shown.length;

    return (
        <div className="space-y-1">
            <ul className="space-y-0.5">
                {shown.map((item, i) => (
                    <li key={i} className="flex gap-2 text-sm text-foreground">
                        <span className="select-none text-muted-foreground">•</span>
                        <span className="min-w-0 break-words">
                            {item === null ? (
                                <span className="italic text-muted-foreground">null</span>
                            ) : (
                                String(item)
                            )}
                        </span>
                    </li>
                ))}
            </ul>
            {remaining > 0 && (
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        setShowAll(true);
                    }}
                    className="text-xs font-medium text-primary hover:underline"
                >
                    +{remaining} more
                </button>
            )}
        </div>
    );
};

export const ResultValue: React.FC<ResultValueProps> = ({
    value,
    density = "inline",
    depth = 0,
    className,
}) => {
    const shape = detectResultShape(value);

    // In inline density, once we recurse too deep, stop expanding structures
    // and hand off to the JSON tree (which has its own collapse). This keeps
    // the chat body compact while still exposing everything.
    if (density === "inline" && depth > INLINE_MAX_DEPTH && (shape.kind === "object" || shape.kind === "table")) {
        return <ResultJson data={value} className={className} />;
    }

    const content = (() => {
        switch (shape.kind) {
            case "empty":
                return <EmptyResult density={density} />;

            case "scalar":
                return <ResultScalar value={shape.value} type={shape.type} />;

            case "uuid":
                return <ShortId value={shape.value} />;

            case "url":
                return <UrlChip url={shape.value} />;

            case "media":
                return <ResultMedia refValue={shape.ref} alt={shape.alt} density={density} />;

            case "text":
                return shape.markdown ? (
                    <ResultMarkdown content={shape.value} density={density} />
                ) : density === "full" ? (
                    <p className="whitespace-pre-wrap break-words text-sm text-foreground">{shape.value}</p>
                ) : (
                    <InlineText value={shape.value} />
                );

            case "list":
                return <ScalarList items={shape.items} density={density} />;

            case "table":
                return <ResultTable rows={shape.rows} columns={shape.columns} density={density} depth={depth} />;

            case "object":
                return <KeyValueGrid value={shape.value} density={density} depth={depth} />;

            case "json":
                return <ResultJson data={shape.value} />;

            default: {
                // Exhaustiveness guard — if a new ResultShape kind is added and
                // not handled, TS flags this assignment.
                const _exhaustive: never = shape;
                return <ResultJson data={_exhaustive} />;
            }
        }
    })();

    return <div className={cn("min-w-0", className)}>{content}</div>;
};
