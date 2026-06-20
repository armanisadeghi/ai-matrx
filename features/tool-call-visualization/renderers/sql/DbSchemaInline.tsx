"use client";

/**
 * DbSchemaInline — inline + overlay renderer for the `db_schema` tool.
 *
 * `db_schema` reads the column metadata for a table. Args: `{ table }`. Result:
 * `{ rows: [...] }` where each row is column metadata (table_name, column_name,
 * data_type, is_nullable, column_default). We render the column rows as a table
 * via <ResultValue> under a "Schema · `<table>`" header.
 *
 * Read DEFENSIVELY: `rows` may be missing or the result may be some other
 * object — in which case we surface whatever came back via <ResultValue> rather
 * than hide it.
 */

import React from "react";
import { Columns3, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";

import type { ToolRendererProps } from "../../types";
import { getArg, isTerminal, resultAsObject } from "../_shared";
import { ResultValue } from "../../result-fields/ResultValue";
import { ToolErrorCard } from "../../result-fields/ToolErrorCard";

export const DbSchemaInline: React.FC<ToolRendererProps> = ({
    entry,
    onOpenOverlay,
    toolGroupId,
}) => {
    const table = (getArg<string>(entry, "table") ?? "").trim();
    const tableLabel = table ? `\`${table}\`` : "table";

    // ── error ────────────────────────────────────────────────────────────────
    if (entry.status === "error") {
        return <ToolErrorCard entry={entry} onOpenOverlay={onOpenOverlay} toolGroupId={toolGroupId} />;
    }

    // ── running / not terminal ─────────────────────────────────────────────────
    if (!isTerminal(entry)) {
        return (
            <div className="flex items-center gap-2 py-1.5 text-xs text-muted-foreground animate-in fade-in">
                <Columns3 className="h-3.5 w-3.5 shrink-0" />
                <span className="inline-flex items-center gap-1">
                    Reading schema for{" "}
                    {table ? <span className="font-mono text-foreground">{table}</span> : "table"}
                </span>
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
            </div>
        );
    }

    // ── completed ──────────────────────────────────────────────────────────────
    const result = resultAsObject(entry);
    const rows = result && Array.isArray(result.rows) ? (result.rows as unknown[]) : null;

    return (
        <div className="rounded-lg border border-border bg-card p-3 space-y-2.5 animate-in fade-in">
            <div className="flex items-center gap-2">
                <Columns3 className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="text-sm text-foreground">
                    Schema · <span className="font-mono font-medium">{table || "table"}</span>
                </span>
                {rows && (
                    <Badge variant="secondary" className="ml-auto font-normal">
                        {rows.length} {rows.length === 1 ? "column" : "columns"}
                    </Badge>
                )}
            </div>

            {rows ? (
                rows.length > 0 ? (
                    <div className="min-w-0 border-t border-border pt-2">
                        <ResultValue value={rows} density="inline" />
                    </div>
                ) : (
                    <p className="border-t border-border pt-2 text-xs italic text-muted-foreground">
                        No columns found for {tableLabel}.
                    </p>
                )
            ) : entry.result != null ? (
                // Unexpected shape — surface it rather than hide it.
                <div className="min-w-0 border-t border-border pt-2">
                    <ResultValue value={entry.result} density="inline" />
                </div>
            ) : null}
        </div>
    );
};

export default DbSchemaInline;
