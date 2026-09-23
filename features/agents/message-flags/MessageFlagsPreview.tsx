"use client";

/**
 * The request preview for message flags — one dense row: prompt size, example
 * tokens, and (on a route with cache breakpoints) the cached-read saving per
 * repeat run from the catalog's input vs cached-input price. Estimates are
 * labelled as estimates; nothing here is a promise the run did not make.
 */

import { DatabaseZap } from "lucide-react";
import type { FlagPreview, MessageFlagProfile } from "./flags";
import { ANTHROPIC_MIN_CACHEABLE_TOKENS } from "./flags";

function usd(value: number): string {
  if (value === 0) return "$0";
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(3)}`;
}

export function MessageFlagsPreview({
  preview,
  profile,
}: {
  preview: FlagPreview;
  profile: MessageFlagProfile | null;
}) {
  const hasCache = preview.cachedPrefixTokens > 0;
  if (!hasCache && preview.exampleTokens === 0) return null;
  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-md border border-border bg-card px-2 py-1 text-[11px] text-muted-foreground"
      data-testid="message-flags-preview"
    >
      <span className="tabular-nums">
        Messages ≈{preview.totalTokens.toLocaleString()} tokens
      </span>
      {preview.exampleTokens > 0 && (
        <span className="tabular-nums" data-testid="message-flags-preview-examples">
          Examples ≈{preview.exampleTokens.toLocaleString()}
          {preview.examplePairs > 0
            ? ` (${preview.examplePairs} ${preview.examplePairs === 1 ? "pair" : "pairs"})`
            : ""}
        </span>
      )}
      {hasCache && (
        <span className="inline-flex items-center gap-1 tabular-nums">
          <DatabaseZap className="h-3 w-3" />
          Cached ≈{preview.cachedPrefixTokens.toLocaleString()}
        </span>
      )}
      {hasCache &&
        preview.fullInputCost !== null &&
        preview.cachedInputCost !== null && (
          <span className="tabular-nums text-foreground" data-testid="message-flags-preview-savings">
            Repeat run input {usd(preview.fullInputCost)} → {usd(preview.cachedInputCost)}
            {preview.savingsPercent !== null ? ` (−${preview.savingsPercent}%)` : ""}
          </span>
        )}
      {hasCache && profile && profile.wire_format !== "anthropic_chat" && (
        <span>This model caches automatically; the boundary changes nothing on its bill.</span>
      )}
      {preview.belowCacheMinimum && (
        <span className="text-amber-600 dark:text-amber-400">
          Under {ANTHROPIC_MIN_CACHEABLE_TOKENS.toLocaleString()} tokens — Claude does not
          cache a prefix this short.
        </span>
      )}
    </div>
  );
}
