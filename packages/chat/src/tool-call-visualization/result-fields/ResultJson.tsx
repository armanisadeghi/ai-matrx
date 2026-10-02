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
import { JsonInspector } from "@host/components/official-candidate/json-inspector/JsonInspector";
import { KindDataGate } from "@host/components/official/structured-value/KindDataGate";
import { cn } from "@ai-matrx/design-system";

export interface ResultJsonProps {
    data: unknown;
    className?: string;
    /**
     * A deliberate source view (a "Raw" tab, a "Show the raw data" escape):
     * the tree shows kind data as written. Default false — kind data is drawn
     * as its kind (`AnswerValueView`) and the caller is reported.
     */
    showSource?: boolean;
}

export const ResultJson: React.FC<ResultJsonProps> = ({ data, className, showSource = false }) => (
    <KindDataGate component="ResultJson" data={data} showSource={showSource}>
        {/* JsonInspector is `h-full` with internally-scrolling panes, so an inline
            wrapper must give it a bounded height or it collapses to zero. A capped
            height keeps huge payloads scrollable instead of blowing out the page. */}
        <div className={cn("min-w-0 h-80 overflow-hidden rounded-md border border-border bg-card", className)}>
            <JsonInspector data={data} showSource />
        </div>
    </KindDataGate>
);
