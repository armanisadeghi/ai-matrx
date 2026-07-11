"use client";

/**
 * features/scopes/components/reference/ContextValueDisplay.tsx
 *
 * Read-only render of a `value_type="reference"` cell — parses the stored
 * ```matrx fence and hands the envelope to `MatrxEnvelopeBlock`, which routes
 * it through the SAME live reference-chip renderer used everywhere else a
 * fence appears (chat content, picklist selections). Never hand-render a
 * reference cell's chips — always through this component.
 */

import { Ban } from "lucide-react";
import MatrxEnvelopeBlock from "@/features/matrx-envelope/MatrxEnvelopeBlock";
import {
  MATRX_VERSION,
  type MatrxEnvelope,
} from "@/features/matrx-envelope/envelope";
import { parseReferenceCellValue } from "@/features/scopes/utils/referenceCell";

export interface ContextValueDisplayProps {
  /** The cell's raw `value_text` (a ```matrx fence, or null/empty when unset). */
  valueText: string | null | undefined;
  emptyLabel?: string;
  className?: string;
}

/** Renders a reference cell's fence as live chips, or a muted empty state. */
export function ContextValueDisplay({
  valueText,
  emptyLabel = "No value set",
  className,
}: ContextValueDisplayProps) {
  const parsed = parseReferenceCellValue(valueText);
  if (!parsed || parsed.items.length === 0) {
    return (
      <span
        className={
          className ??
          "inline-flex items-center gap-1.5 text-sm text-muted-foreground"
        }
      >
        <Ban className="h-3.5 w-3.5" />
        {emptyLabel}
      </span>
    );
  }

  const envelope: MatrxEnvelope = {
    matrx_version: MATRX_VERSION,
    kind: "reference",
    type: parsed.type,
    items: parsed.items,
  };

  return (
    <div className={className}>
      <MatrxEnvelopeBlock content={envelope} />
    </div>
  );
}

export default ContextValueDisplay;
