"use client";

/**
 * ResultJson — wraps the canonical {@link JsonInspector} (multi-view:
 * formatted JSON, path explorer, tree, truncator). This is the UNIVERSAL
 * FALLBACK for any shape the field library can't render more richly, and the
 * engine behind the Raw tab. It hides nothing: every key, index, and value is
 * reachable.
 *
 * We never dump raw `JSON.stringify` into a `<pre>` — this component is the
 * answer to "but what about weird data?".
 */

import React from "react";
import { JsonInspector } from "@/components/official-candidate/json-inspector/JsonInspector";
import { cn } from "@/lib/utils";

export interface ResultJsonProps {
    data: unknown;
    className?: string;
}

export const ResultJson: React.FC<ResultJsonProps> = ({ data, className }) => (
    // JsonInspector is `h-full` with internally-scrolling panes, so an inline
    // wrapper must give it a bounded height or it collapses to zero. A capped
    // height keeps huge payloads scrollable instead of blowing out the page.
    <div className={cn("min-w-0 h-80 overflow-hidden rounded-md border border-border bg-card", className)}>
        <JsonInspector data={data} />
    </div>
);
