"use client";

/**
 * GenericEmitRenderer — the universal body for any `node_emitted` payload
 * WITHOUT a custom renderer. The emit equivalent of the tool feature's
 * `GenericRenderer`, but PAYLOAD-shaped (it takes `EmitRendererProps`, not a
 * tool-call `entry`).
 *
 * It leans on the same type-aware result-field library the tool generic
 * renderer uses — `ResultValue` (density="full", HIDE NOTHING) — so a payload
 * of any shape (text/markdown/list/table/object/media/json) renders truthfully
 * and beautifully without per-shape code here.
 *
 *   confirmation → a single inline confirmation line (title / payload.message),
 *                  with the rest of the payload shown below when present.
 *   summary | full | restructured → the title (markdown) + the full payload.
 */

import React from "react";
import { CheckCircle2 } from "lucide-react";

import MarkdownStream from "@/components/MarkdownStream";
import { ResultValue } from "@/features/tool-call-visualization/result-fields/ResultValue";
import type { EmitRendererProps } from "./types";

/** Pull a human confirmation line from the payload's `message`, if present. */
function extractMessage(payload: unknown): string | null {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const message = (payload as Record<string, unknown>).message;
    if (typeof message === "string" && message.trim().length > 0) {
      return message;
    }
  }
  return null;
}

/**
 * True when the payload is the `{ value }` wrapper the backend uses for a
 * non-dict emission — we unwrap it so a scalar/list/string renders as itself.
 */
function unwrapValue(payload: unknown): unknown {
  if (
    payload &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    Object.keys(payload as Record<string, unknown>).length === 1 &&
    "value" in (payload as Record<string, unknown>)
  ) {
    return (payload as Record<string, unknown>).value;
  }
  return payload;
}

export const GenericEmitRenderer: React.FC<EmitRendererProps> = ({
  mode,
  payload,
  title,
}) => {
  const value = unwrapValue(payload);

  // ─── Confirmation ─────────────────────────────────────────────────────────
  // A single, calm inline line. Prefer the node's title, then payload.message.
  // Anything else in the payload renders below so nothing is hidden.
  if (mode === "confirmation") {
    const message = extractMessage(payload);
    const line = title ?? message ?? "Done.";
    const hasExtra = message ? value !== message : value != null;

    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
          <span className="min-w-0 break-words">{line}</span>
        </div>
        {hasExtra && (
          <div className="pl-6">
            <ResultValue value={value} density="full" />
          </div>
        )}
      </div>
    );
  }

  // ─── Summary / full / restructured ────────────────────────────────────────
  return (
    <div className="space-y-2">
      {title && (
        <div className="text-sm font-semibold text-foreground">
          <MarkdownStream content={title} />
        </div>
      )}
      <ResultValue value={value} density="full" />
    </div>
  );
};

export default GenericEmitRenderer;
