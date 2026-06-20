"use client";

/**
 * CtxGetInline — inline + overlay renderer for the `ctx_get` tool call.
 *
 * `ctx_get` is the single most-used agent tool: it resolves one context
 * object by key. Result shape (server truth, handled defensively):
 *   {
 *     key: string, type: string, label: string, content: unknown,
 *     total_chars?: number,
 *     // page mode adds: offset, chars_returned, has_more
 *     // summary mode replaces `content` with: summary
 *   }
 *
 * Renders the resolved item as a single `CtxItemCard`. While the call is in
 * flight (status not terminal) it shows a slim "Looking up <key>" line — no
 * large spinner, because the card lives inline in the chat body.
 *
 * If the result doesn't match the expected object shape, we fall back to
 * `<ResultValue value={entry.result} />` so data is never hidden or lost.
 */

import React, { useMemo } from "react";
import { Search } from "lucide-react";

import type { ToolRendererProps } from "../../types";
import { getArg, isTerminal, resultAsObject } from "../_shared";
import { ResultValue, type ResultDensity } from "../../result-fields/ResultValue";
import { ToolErrorCard } from "../../result-fields/ToolErrorCard";
import { CtxItemCard, type CtxItem } from "./CtxItemCard";

/** Narrow an arbitrary result object to the CtxItem display shape. */
function toCtxItem(
  result: Record<string, unknown>,
  fallbackKey: string,
): CtxItem {
  return {
    key: typeof result.key === "string" ? result.key : fallbackKey || undefined,
    type: typeof result.type === "string" ? result.type : undefined,
    label: typeof result.label === "string" ? result.label : undefined,
    content: result.content,
    summary: typeof result.summary === "string" ? result.summary : undefined,
    total_chars:
      typeof result.total_chars === "number" ? result.total_chars : undefined,
    chars_returned:
      typeof result.chars_returned === "number"
        ? result.chars_returned
        : undefined,
    has_more: typeof result.has_more === "boolean" ? result.has_more : undefined,
  };
}

/** A result object only counts as a ctx item if it carries content or summary. */
function looksLikeCtxItem(result: Record<string, unknown>): boolean {
  return (
    "content" in result ||
    "summary" in result ||
    "label" in result ||
    "type" in result
  );
}

interface Props extends ToolRendererProps {
  density?: ResultDensity;
}

export const CtxGetInline: React.FC<Props> = ({
  entry,
  onOpenOverlay,
  toolGroupId,
  density = "inline",
}) => {
  const keyArg = (getArg<string>(entry, "key") ?? "").trim();

  const view = useMemo(() => {
    if (entry.status === "error") return { kind: "error" as const };
    if (!isTerminal(entry)) return { kind: "loading" as const };
    const result = resultAsObject(entry);
    if (result && looksLikeCtxItem(result)) {
      return { kind: "item" as const, item: toCtxItem(result, keyArg) };
    }
    return { kind: "raw" as const };
  }, [entry, keyArg]);

  if (view.kind === "error") {
    return (
      <ToolErrorCard
        entry={entry}
        onOpenOverlay={onOpenOverlay}
        toolGroupId={toolGroupId}
      />
    );
  }

  if (view.kind === "loading") {
    return (
      <div className="flex items-center gap-2 py-1.5 text-xs text-muted-foreground animate-in fade-in">
        <Search className="h-3.5 w-3.5 shrink-0" />
        <span>
          Looking up{" "}
          {keyArg ? (
            <span className="font-mono text-foreground">{keyArg}</span>
          ) : (
            "context"
          )}
        </span>
      </div>
    );
  }

  if (view.kind === "raw") {
    return <ResultValue value={entry.result} density={density} />;
  }

  return <CtxItemCard item={view.item} density={density} />;
};
