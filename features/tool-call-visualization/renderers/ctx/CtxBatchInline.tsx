"use client";

/**
 * CtxBatchInline — inline + overlay renderer for the `ctx_batch` tool call.
 *
 * `ctx_batch` resolves several context objects in one call. Result shape
 * (server truth, handled defensively):
 *   {
 *     count: number,
 *     requested: number,
 *     results: Array<{
 *       key: string,
 *       success: boolean,
 *       output?: <ctx_get shape>,
 *       error?: unknown,
 *     }>
 *   }
 *
 * Renders a compact "N of M retrieved" header, then a stack of `CtxItemCard`s
 * — one per successful result — with failures shown as a slim destructive line
 * carrying the key + error. Inline density caps the stack at ~4 items with a
 * "+N more" toggle; full density shows everything.
 *
 * Non-conforming results fall back to `<ResultValue value={entry.result} />`.
 */

import React, { useMemo, useState } from "react";
import { Layers, AlertCircle } from "lucide-react";

import type { ToolRendererProps } from "../../types";
import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";
import { isTerminal, resultAsObject } from "../_shared";
import { ResultValue, type ResultDensity } from "../../result-fields/ResultValue";
import { ToolErrorCard } from "../../result-fields/ToolErrorCard";
import { CtxItemCard, type CtxItem } from "./CtxItemCard";

const INLINE_ITEM_CAP = 4;

interface BatchResult {
  key: string;
  success: boolean;
  item: CtxItem | null;
  errorText: string | null;
}

interface ParsedBatch {
  count: number;
  requested: number;
  results: BatchResult[];
}

function toCtxItem(
  output: Record<string, unknown>,
  fallbackKey: string,
): CtxItem {
  return {
    key: typeof output.key === "string" ? output.key : fallbackKey || undefined,
    type: typeof output.type === "string" ? output.type : undefined,
    label: typeof output.label === "string" ? output.label : undefined,
    content: output.content,
    summary: typeof output.summary === "string" ? output.summary : undefined,
    total_chars:
      typeof output.total_chars === "number" ? output.total_chars : undefined,
    chars_returned:
      typeof output.chars_returned === "number"
        ? output.chars_returned
        : undefined,
    has_more: typeof output.has_more === "boolean" ? output.has_more : undefined,
  };
}

function errorToText(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === "string") return message;
    try {
      return JSON.stringify(error);
    } catch {
      return "Unknown error";
    }
  }
  return "Failed to resolve";
}

function parse(entry: ToolLifecycleEntry): ParsedBatch | null {
  const result = resultAsObject(entry);
  if (!result || !Array.isArray(result.results)) return null;

  const rawResults = result.results as unknown[];
  const results: BatchResult[] = rawResults.map((raw, i) => {
    const r = (raw && typeof raw === "object" ? raw : {}) as Record<
      string,
      unknown
    >;
    const key = typeof r.key === "string" ? r.key : `#${i + 1}`;
    const output =
      r.output && typeof r.output === "object"
        ? (r.output as Record<string, unknown>)
        : null;
    const success = r.success === true || (output != null && r.error == null);
    return {
      key,
      success,
      item: output ? toCtxItem(output, key) : null,
      errorText: success ? null : errorToText(r.error),
    };
  });

  const count =
    typeof result.count === "number"
      ? result.count
      : results.filter((r) => r.success).length;
  const requested =
    typeof result.requested === "number" ? result.requested : results.length;

  return { count, requested, results };
}

interface Props extends ToolRendererProps {
  density?: ResultDensity;
}

export const CtxBatchInline: React.FC<Props> = ({
  entry,
  onOpenOverlay,
  toolGroupId,
  density = "inline",
}) => {
  const [showAll, setShowAll] = useState(false);

  const parsed = useMemo(() => parse(entry), [entry]);

  if (entry.status === "error") {
    return (
      <ToolErrorCard
        entry={entry}
        onOpenOverlay={onOpenOverlay}
        toolGroupId={toolGroupId}
      />
    );
  }

  if (!isTerminal(entry)) {
    return (
      <div className="flex items-center gap-2 py-1.5 text-xs text-muted-foreground animate-in fade-in">
        <Layers className="h-3.5 w-3.5 shrink-0" />
        <span>Reviewing context</span>
      </div>
    );
  }

  if (!parsed) {
    return <ResultValue value={entry.result} density={density} />;
  }

  const cap =
    density === "inline" && !showAll ? INLINE_ITEM_CAP : parsed.results.length;
  const shown = parsed.results.slice(0, cap);
  const remaining = parsed.results.length - shown.length;

  return (
    <div className="space-y-2 animate-in fade-in">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Layers className="h-3.5 w-3.5 shrink-0" />
        <span>
          <span className="font-semibold tabular-nums text-foreground">
            {parsed.count}
          </span>{" "}
          of{" "}
          <span className="tabular-nums">{parsed.requested}</span> retrieved
        </span>
      </div>

      <div className="space-y-2">
        {shown.map((r, i) =>
          r.success && r.item ? (
            <CtxItemCard key={`${r.key}-${i}`} item={r.item} density={density} />
          ) : (
            <div
              key={`${r.key}-${i}`}
              className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive"
            >
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div className="min-w-0">
                <span className="font-mono font-medium">{r.key}</span>
                {r.errorText && (
                  <span className="text-destructive/80"> — {r.errorText}</span>
                )}
              </div>
            </div>
          ),
        )}
      </div>

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
