"use client";

/**
 * MatrxEnvelopeBlock — the in-content renderer for a ```matrx fence.
 *
 * Pipeline (mirrors the backend): recognize the OUTER canonical envelope first,
 * then route the INTERNAL parts through the renderer REGISTRY by `(kind, type)`,
 * and gracefully FALL BACK when nothing is registered — so a shape is always
 * displayed, never dropped:
 *
 *   1. parse + `isMatrxEnvelope` → recognize the outer `{matrx_version,kind,type,items}`.
 *      Not an envelope (bad JSON / missing key) → raw <pre> (never throws).
 *   2. `getEnvelopeRenderer(kind, type)` → a registered renderer (e.g. reference
 *      chips). Found → render it.
 *   3. None registered → a neutral muted card (kind/type + item count).
 *
 * Position decides capability: in content only reference/secret resolve; an
 * `output_directive` in prose is shown as a neutral card, never executed.
 *
 * Types + registry come from the canonical features/matrx-envelope modules.
 */

import React from "react";
import { Boxes } from "lucide-react";

import {
  isMatrxEnvelope,
  type MatrxEnvelope,
} from "@/features/matrx-envelope/envelope";
import { getEnvelopeRenderer } from "@/features/matrx-envelope/registry";

interface MatrxEnvelopeBlockProps {
  /** The raw fence body (JSON string) or an already-parsed envelope. */
  content: string | MatrxEnvelope;
}

function parseEnvelope(content: string | MatrxEnvelope): MatrxEnvelope | null {
  if (typeof content !== "string") {
    return isMatrxEnvelope(content) ? content : null;
  }
  try {
    const parsed: unknown = JSON.parse(content);
    return isMatrxEnvelope(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

const MatrxEnvelopeBlock: React.FC<MatrxEnvelopeBlockProps> = ({ content }) => {
  // 1. Recognize the outer canonical envelope.
  const envelope = parseEnvelope(content);
  if (!envelope) {
    const raw = typeof content === "string" ? content : JSON.stringify(content, null, 2);
    return (
      <pre className="my-3 overflow-x-auto rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
        {raw}
      </pre>
    );
  }

  // 2. Route the internal parts through the registry by (kind, type).
  const Renderer = getEnvelopeRenderer(envelope.kind, envelope.type);
  if (Renderer) {
    return <Renderer envelope={envelope} />;
  }

  // 3. Graceful fallback — unknown (kind, type) is still shown, never dropped.
  const count = Array.isArray(envelope.items) ? envelope.items.length : 0;
  return (
    <div className="my-3 inline-flex items-center gap-2 rounded-md border border-border bg-muted px-2.5 py-1 text-sm">
      <Boxes className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="text-foreground">{envelope.kind}</span>
      <span className="text-muted-foreground">/ {envelope.type}</span>
      <span className="text-muted-foreground">
        · {count} {count === 1 ? "item" : "items"}
      </span>
    </div>
  );
};

export default MatrxEnvelopeBlock;
