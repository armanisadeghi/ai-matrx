"use client";

/**
 * SqlInline — inline + overlay renderer for the `sql` and `db_query` tools.
 *
 * Database tools are "poor in richness": the raw payload is a SQL string and/or
 * a data blob. This renderer makes them a SHOWCASE:
 *
 *   • Running / not terminal — the plain-English intent line ("Querying
 *     `users`") + the raw SQL as a highlighted ```sql block, with a subtle
 *     inline "Running…" cue (small spinner, never a big one). Write modes with
 *     no SQL show the `data` payload via <ResultValue> instead.
 *   • Completed — the RESULT leads. Query rows render as a table via
 *     <ResultValue> with an "<n> rows" badge; write outcomes render a clean
 *     "Inserted N rows" line plus any returned data/ids. The raw SQL is tucked
 *     into a collapsed "Show SQL" disclosure so the "ugly SQL" is available but
 *     never dominates.
 *   • Error — <ToolErrorCard>.
 *
 * Everything reads the entry DEFENSIVELY: shapes vary (`{rows}`, `{inserted,
 * ids}`, `{inserted, data}`, plus updated/deleted counts), `data` may be a JSON
 * string, and any field may be missing.
 */

import React from "react";
import { CheckCircle2, ChevronDown, ChevronRight, Database, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { BasicMarkdownContent } from "@/components/mardown-display/chat-markdown/BasicMarkdownContent";

import type { ToolRendererProps } from "../../types";
import { getArg, isTerminal, resultAsObject } from "../_shared";
import { ResultValue } from "../../result-fields/ResultValue";
import { ToolErrorCard } from "../../result-fields/ToolErrorCard";
import { summarizeSql } from "./summarizeSql";

// ─── helpers ─────────────────────────────────────────────────────────────────

/**
 * Render the intent line as a single inline line. `summarizeSql` wraps table
 * names in backticks (`Querying \`users\``); we turn those spans into `font-mono`
 * code so the table reads as code WITHOUT pulling in the block-level markdown
 * renderer (which would add margins + force full width inside the flex header).
 */
const IntentLine: React.FC<{ text: string }> = ({ text }) => {
    const parts = text.split("`");
    return (
        <span className="min-w-0 truncate text-sm text-foreground">
            {parts.map((part, i) =>
                i % 2 === 1 ? (
                    <span key={i} className="font-mono text-[0.95em]">
                        {part}
                    </span>
                ) : (
                    <React.Fragment key={i}>{part}</React.Fragment>
                ),
            )}
        </span>
    );
};

/** Render a raw SQL string as a fenced ```sql block (reuses syntax highlight). */
const SqlCodeBlock: React.FC<{ sql: string }> = ({ sql }) => (
    <BasicMarkdownContent content={"```sql\n" + sql.trim() + "\n```"} showCopyButton={false} />
);

/** Render an arbitrary value as a fenced ```json block. */
const JsonCodeBlock: React.FC<{ value: unknown }> = ({ value }) => {
    let text: string;
    try {
        text = JSON.stringify(value, null, 2);
    } catch {
        text = String(value);
    }
    return <BasicMarkdownContent content={"```json\n" + text + "\n```"} showCopyButton={false} />;
};

/** Coerce a possibly-JSON-string payload into a value <ResultValue> can render. */
function normalizePayload(raw: unknown): unknown {
    if (typeof raw !== "string") return raw;
    const s = raw.trim();
    if (!s) return raw;
    try {
        return JSON.parse(s);
    } catch {
        return raw; // leave as-is; ResultValue handles plain strings.
    }
}

/** The collapsed "Show SQL"/"Show payload" disclosure. */
const SourceDisclosure: React.FC<{
    label: string;
    children: React.ReactNode;
}> = ({ label, children }) => {
    const [open, setOpen] = React.useState(false);
    return (
        <Collapsible open={open} onOpenChange={setOpen} className="border-t border-border pt-2">
            <CollapsibleTrigger
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
            >
                {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                {open ? `Hide ${label}` : `Show ${label}`}
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-1.5 min-w-0">{children}</CollapsibleContent>
        </Collapsible>
    );
};

// ─── write-result detection ──────────────────────────────────────────────────

interface WriteOutcome {
    /** Counts keyed by verb, in display order. */
    counts: Array<{ label: string; n: number }>;
    /** Echoed/returned rows, if any. */
    data: unknown;
    /** Returned ids, if any. */
    ids: unknown[] | null;
}

const COUNT_KEYS: Array<{ key: string; label: string }> = [
    { key: "inserted", label: "Inserted" },
    { key: "updated", label: "Updated" },
    { key: "deleted", label: "Deleted" },
    { key: "upserted", label: "Upserted" },
    { key: "affected", label: "Affected" },
    { key: "count", label: "Affected" },
];

/**
 * Interpret a result object as a write outcome. Returns null when the object
 * carries no write signal (so the caller falls back to row rendering).
 */
function asWriteOutcome(result: Record<string, unknown>): WriteOutcome | null {
    const counts: Array<{ label: string; n: number }> = [];
    for (const { key, label } of COUNT_KEYS) {
        const v = result[key];
        if (typeof v === "number") counts.push({ label, n: v });
    }
    const ids = Array.isArray(result.ids) ? (result.ids as unknown[]) : null;
    const data = "data" in result ? result.data : undefined;

    if (counts.length === 0 && !ids && data === undefined) return null;
    return { counts, data, ids };
}

/** Pluralize "row". */
function rowWord(n: number): string {
    return n === 1 ? "row" : "rows";
}

// ─── component ───────────────────────────────────────────────────────────────

export const SqlInline: React.FC<ToolRendererProps> = ({
    entry,
    onOpenOverlay,
    toolGroupId,
}) => {
    const query = (getArg<unknown>(entry, "query") ?? "") as unknown;
    const queryStr = typeof query === "string" ? query.trim() : "";
    const rawData = getArg<unknown>(entry, "data");
    const intent = summarizeSql({
        query,
        action: getArg<unknown>(entry, "action"),
        table: getArg<unknown>(entry, "table"),
        data: rawData,
    });

    // ── error ────────────────────────────────────────────────────────────────
    if (entry.status === "error") {
        return <ToolErrorCard entry={entry} onOpenOverlay={onOpenOverlay} toolGroupId={toolGroupId} />;
    }

    // ── running / not terminal — show the SQL (or payload) while we wait ───────
    if (!isTerminal(entry)) {
        return (
            <div className="rounded-lg border border-border bg-card p-3 space-y-2 animate-in fade-in">
                <div className="flex items-center gap-2 text-sm text-foreground">
                    <Database className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <IntentLine text={intent} />
                    <Loader2 className="ml-auto h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
                </div>
                {queryStr ? (
                    <div className="min-w-0">
                        <SqlCodeBlock sql={queryStr} />
                    </div>
                ) : rawData !== undefined ? (
                    <div className="min-w-0 border-t border-border pt-2">
                        <ResultValue value={normalizePayload(rawData)} density="inline" />
                    </div>
                ) : null}
            </div>
        );
    }

    // ── completed — the result leads ──────────────────────────────────────────
    const result = resultAsObject(entry);
    const resultRows = result && Array.isArray(result.rows) ? (result.rows as unknown[]) : null;
    const writeOutcome = result && !resultRows ? asWriteOutcome(result) : null;

    return (
        <div className="rounded-lg border border-border bg-card p-3 space-y-2.5 animate-in fade-in">
            {/* Query result: rows table + count badge */}
            {resultRows && (
                <>
                    <div className="flex items-center gap-2">
                        <Database className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <IntentLine text={intent} />
                        <Badge variant="secondary" className="ml-auto font-normal">
                            {resultRows.length} {rowWord(resultRows.length)}
                        </Badge>
                    </div>
                    {resultRows.length > 0 ? (
                        <div className="min-w-0 border-t border-border pt-2">
                            <ResultValue value={resultRows} density="inline" />
                        </div>
                    ) : (
                        <p className="border-t border-border pt-2 text-xs italic text-muted-foreground">
                            No rows returned.
                        </p>
                    )}
                </>
            )}

            {/* Write outcome: count line + returned data/ids */}
            {!resultRows && writeOutcome && (
                <>
                    <div className="flex flex-wrap items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                        {writeOutcome.counts.length > 0 ? (
                            writeOutcome.counts.map((c) => (
                                <span key={c.label} className="text-sm text-foreground">
                                    {c.label}{" "}
                                    <span className="font-medium">
                                        {c.n} {rowWord(c.n)}
                                    </span>
                                </span>
                            ))
                        ) : (
                            <span className="text-sm text-foreground">Write completed</span>
                        )}
                        {writeOutcome.ids && writeOutcome.ids.length > 0 && (
                            <Badge variant="secondary" className="ml-auto font-normal">
                                {writeOutcome.ids.length} {writeOutcome.ids.length === 1 ? "id" : "ids"}
                            </Badge>
                        )}
                    </div>
                    {writeOutcome.data != null && (
                        <div className="min-w-0 border-t border-border pt-2">
                            <ResultValue value={writeOutcome.data} density="inline" />
                        </div>
                    )}
                    {writeOutcome.ids && writeOutcome.ids.length > 0 && writeOutcome.data == null && (
                        <div className="min-w-0 border-t border-border pt-2">
                            <ResultValue value={writeOutcome.ids} density="inline" />
                        </div>
                    )}
                </>
            )}

            {/* Fallback: result exists but matches neither shape — never hide it. */}
            {!resultRows && !writeOutcome && entry.result != null && (
                <>
                    <div className="flex items-center gap-2">
                        <Database className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <IntentLine text={intent} />
                    </div>
                    <div className="min-w-0 border-t border-border pt-2">
                        <ResultValue value={entry.result} density="inline" />
                    </div>
                </>
            )}

            {/* Completed with no result body at all — confirm the intent ran. */}
            {entry.result == null && (
                <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                    <IntentLine text={intent} />
                </div>
            )}

            {/* The "ugly SQL" — available but tucked away. */}
            {queryStr ? (
                <SourceDisclosure label="SQL">
                    <SqlCodeBlock sql={queryStr} />
                </SourceDisclosure>
            ) : rawData !== undefined ? (
                <SourceDisclosure label="payload">
                    <JsonCodeBlock value={normalizePayload(rawData)} />
                </SourceDisclosure>
            ) : null}
        </div>
    );
};

export default SqlInline;
