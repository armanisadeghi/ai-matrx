"use client";

/**
 * SqlInline — inline + overlay renderer for the `sql` and `db_query` tools.
 *
 * DESIGN DOCTRINE (owner-specified, 2026-07-14 — the reference for every
 * "unpredictable data" tool renderer):
 *
 *   • NO card chrome. The shell's folded line already frames the tool call
 *     ("Queried the database · Inserted 3 rows into `offering`"); the expanded
 *     body is FLUSH content — no border, no background, no padding box. A card
 *     inside the shell inside the batch produced the triple-nested look.
 *   • NO repetition. The shell line carries the intent (via the registry's
 *     `getHeaderSubtitle` → summarizeSql). The body never re-states it, never
 *     re-draws a Database icon, never re-announces the count the shell showed.
 *   • NO status icons. No CheckCircle, no spinner. State is tense + shimmer on
 *     the shell line.
 *   • NEVER a wall of UUIDs. Returned ids collapse to `IdListChip` ("3 ids" +
 *     copy-all). This falls out of ResultValue's idList shape automatically.
 *   • The raw SQL / payload stays available behind "Show SQL"/"Show payload".
 */

import React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

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
import { IdListChip } from "../../result-fields/ShortId";

// ─── helpers ─────────────────────────────────────────────────────────────────

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

/** The collapsed "Show SQL"/"Show payload" disclosure — quiet, borderless. */
const SourceDisclosure: React.FC<{
    label: string;
    children: React.ReactNode;
}> = ({ label, children }) => {
    const [open, setOpen] = React.useState(false);
    return (
        <Collapsible open={open} onOpenChange={setOpen}>
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

    // ── error ────────────────────────────────────────────────────────────────
    if (entry.status === "error") {
        return <ToolErrorCard entry={entry} onOpenOverlay={onOpenOverlay} toolGroupId={toolGroupId} />;
    }

    // ── running — the SQL (or payload) flush, nothing else. The shell line
    // shimmers with the intent; adding a spinner/card here would repeat it. ───
    if (!isTerminal(entry)) {
        return (
            <div className="min-w-0 animate-in fade-in">
                {queryStr ? (
                    <SqlCodeBlock sql={queryStr} />
                ) : rawData !== undefined ? (
                    <ResultValue value={normalizePayload(rawData)} density="inline" />
                ) : null}
            </div>
        );
    }

    // ── completed — only what the shell line does NOT already say ─────────────
    const result = resultAsObject(entry);
    const resultRows = result && Array.isArray(result.rows) ? (result.rows as unknown[]) : null;
    const writeOutcome = result && !resultRows ? asWriteOutcome(result) : null;

    // Ids that are all strings render as the count+copy chip; anything odd
    // falls through to ResultValue (which still catches all-UUID arrays).
    const idStrings =
        writeOutcome?.ids && writeOutcome.ids.every((v) => typeof v === "string")
            ? (writeOutcome.ids as string[])
            : null;

    return (
        <div className="min-w-0 space-y-2 animate-in fade-in">
            {/* Query result: quiet count line + the rows table, flush. */}
            {resultRows &&
                (resultRows.length > 0 ? (
                    <>
                        <p className="text-xs text-muted-foreground">
                            {resultRows.length} {rowWord(resultRows.length)}
                        </p>
                        <ResultValue value={resultRows} density="inline" />
                    </>
                ) : (
                    <p className="text-xs italic text-muted-foreground">No rows returned.</p>
                ))}

            {/* Write outcome: ONE quiet line — counts + ids chip. The shell line
                already announced the action; this is confirmation, not headline. */}
            {!resultRows && writeOutcome && (
                <>
                    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {writeOutcome.counts.map((c) => (
                            <span key={c.label}>
                                {c.label} {c.n} {rowWord(c.n)}
                            </span>
                        ))}
                        {writeOutcome.counts.length === 0 && <span>Write completed</span>}
                        {idStrings && idStrings.length > 0 && <IdListChip ids={idStrings} />}
                    </p>
                    {writeOutcome.data != null && (
                        <ResultValue value={writeOutcome.data} density="inline" />
                    )}
                    {!idStrings && writeOutcome.ids && writeOutcome.ids.length > 0 && (
                        <ResultValue value={writeOutcome.ids} density="inline" />
                    )}
                </>
            )}

            {/* Fallback: result exists but matches neither shape — never hide it. */}
            {!resultRows && !writeOutcome && entry.result != null && (
                <ResultValue value={entry.result} density="inline" />
            )}

            {/* Completed with no result body: the shell line is the whole story —
                render nothing but the source disclosure. */}

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
