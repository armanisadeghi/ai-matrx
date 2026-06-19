"use client";

/**
 * MatrxEnvelopeBlock — the in-content renderer for a ```matrx fence.
 *
 * A ```matrx fence carries exactly one Matrx Envelope
 * (`{ matrx_version, kind, type, items: [...] }`). This component takes the
 * raw fence body (a JSON string) — or an already-parsed envelope — parses it
 * FAIL-SAFE, and renders by `kind`:
 *
 *   - `reference` → a compact inline chip per item, using the item's
 *     `display.label` (fallback the envelope `type`). No fetch in v1 — the
 *     `display` hint is for instant paint (see MATRX_REFERENCES.md).
 *   - any other kind → a minimal muted card (kind/type + item count).
 *
 * Position decides capability: in content only reference/secret resolve; an
 * `output_directive` in prose is shown as a neutral card, never executed.
 *
 * NEVER throws: invalid JSON / a missing `matrx_version` renders the raw body
 * in a muted <pre> instead of dropping or crashing.
 *
 * Reuses the chip visual language from features/item-presentation; types come
 * from the canonical features/matrx-envelope/envelope module (not duplicated).
 */

import React from "react";
import { Link2 } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  isMatrxEnvelope,
  type MatrxEnvelope,
  type ReferenceItem,
} from "@/features/matrx-envelope/envelope";

interface MatrxEnvelopeBlockProps {
  /** The raw fence body (JSON string) or an already-parsed envelope. */
  content: string | MatrxEnvelope;
}

/** Parse the fence body fail-safe → an envelope, or null when not one. */
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

function isReferenceItem(item: unknown): item is ReferenceItem {
  return typeof item === "object" && item !== null;
}

function referenceLabel(item: ReferenceItem, fallback: string): string {
  const label = item.display?.label;
  return typeof label === "string" && label.trim().length > 0
    ? label
    : fallback;
}

const ReferenceChip: React.FC<{ label: string }> = ({ label }) => (
  <span
    className={cn(
      "inline-flex items-center gap-1 rounded-md border border-border",
      "bg-muted px-2 py-0.5 text-sm text-foreground align-middle",
    )}
  >
    <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
    <span className="truncate">{label}</span>
  </span>
);

const MatrxEnvelopeBlock: React.FC<MatrxEnvelopeBlockProps> = ({ content }) => {
  const envelope = parseEnvelope(content);

  // Fail-safe: not a valid envelope → show the raw body, never throw / drop.
  if (!envelope) {
    const raw =
      typeof content === "string" ? content : JSON.stringify(content, null, 2);
    return (
      <pre className="my-3 overflow-x-auto rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
        {raw}
      </pre>
    );
  }

  const items = Array.isArray(envelope.items) ? envelope.items : [];

  if (envelope.kind === "reference") {
    return (
      <span className="my-1 inline-flex flex-wrap items-center gap-1.5 align-middle">
        {items.map((item, i) => (
          <ReferenceChip
            key={i}
            label={
              isReferenceItem(item)
                ? referenceLabel(item, envelope.type)
                : envelope.type
            }
          />
        ))}
      </span>
    );
  }

  // Any other kind (output_directive / secret / validation / unknown) → a
  // minimal muted card. Secrets carry no resolved value in content, and an
  // action here is informational only (never executed in-content).
  return (
    <div className="my-3 inline-flex items-center gap-2 rounded-md border border-border bg-muted px-2.5 py-1 text-sm">
      <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="text-foreground">{envelope.kind}</span>
      <span className="text-muted-foreground">/ {envelope.type}</span>
      <span className="text-muted-foreground">
        · {items.length} {items.length === 1 ? "item" : "items"}
      </span>
    </div>
  );
};

export default MatrxEnvelopeBlock;
