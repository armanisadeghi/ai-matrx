"use client";

/**
 * ResultJson — wraps the canonical {@link JsonTreeViewer} (collapsible,
 * syntax-highlighted). This is the UNIVERSAL FALLBACK for any shape the
 * field library can't render more richly, and the engine behind the "Raw I/O"
 * tab. It hides nothing: every key, index, and value is reachable.
 *
 * We never dump raw `JSON.stringify` into a `<pre>` — this component is the
 * answer to "but what about weird data?".
 */

import React from "react";
import { JsonTreeViewer } from "@/components/official/json-explorer/JsonTreeViewer";
import { cn } from "@/lib/utils";

export interface ResultJsonProps {
    data: unknown;
    className?: string;
}

export const ResultJson: React.FC<ResultJsonProps> = ({ data, className }) => (
    <div className={cn("min-w-0 overflow-x-auto rounded-md border border-border bg-card p-2", className)}>
        <JsonTreeViewer data={data} />
    </div>
);
