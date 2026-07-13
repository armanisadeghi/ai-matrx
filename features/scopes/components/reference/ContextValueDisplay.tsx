"use client";

/**
 * features/scopes/components/reference/ContextValueDisplay.tsx
 *
 * THE canonical read-only render of a context item's cell — every `value_*`
 * type, not just `reference`. A `reference` cell's stored ```matrx fence is
 * parsed and handed to `MatrxEnvelopeBlock`, which routes it through the SAME
 * live reference-chip renderer used everywhere else a fence appears (chat
 * content, picklist selections). Every other type gets a small
 * type-appropriate render (boolean → Yes/No, document → clickable link, …).
 * Never hand-render a cell's value anywhere `context_item_values` rows are
 * listed — always through this component (the row wrapper is `ContextValueRow`
 * in the same folder).
 */

import type { ReactNode } from "react";
import { Ban, FileText, Mail, Phone, ExternalLink } from "lucide-react";
import MatrxEnvelopeBlock from "@/features/matrx-envelope/MatrxEnvelopeBlock";
import {
  MATRX_VERSION,
  type MatrxEnvelope,
} from "@/features/matrx-envelope/envelope";
import { cn } from "@/utils/cn";
import { parseReferenceCellValue } from "@/features/scopes/utils/referenceCell";
import { BasicMarkdownContent } from "@/components/mardown-display/chat-markdown/BasicMarkdownContent";
import type { ContextValueType } from "@/features/agent-context/types";
import type { Json } from "@/types/database.types";

export interface ContextValueDisplayCell {
  value_text?: string | null;
  value_number?: number | null;
  value_boolean?: boolean | null;
  value_date?: string | null;
  value_timestamp?: string | null;
  value_time?: string | null;
  value_json?: Json | null;
  value_document_url?: string | null;
  /** Legacy pre-fence column — read-only, zero current rows use it anymore. */
  value_reference_id?: string | null;
}

export interface ContextValueDisplayProps {
  value: ContextValueDisplayCell;
  /**
   * The item's declared type. Several types share `value_text` as storage
   * (email/url/phone/color/markdown), so the column alone can't tell them
   * apart — pass this to render them richly (mailto/link/swatch/rendered MD).
   * Optional: without it, display falls back to column-based rendering.
   */
  valueType?: ContextValueType | null;
  emptyLabel?: string;
  className?: string;
}

function EmptyState({
  emptyLabel,
  className,
}: {
  emptyLabel: string;
  className?: string;
}) {
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

/**
 * Rich rendering keyed on the declared value_type. Returns `undefined` when the
 * type has no special render (or the backing column is empty) so the caller
 * falls back to plain column-based rendering.
 */
function renderTyped(
  valueType: ContextValueType | null | undefined,
  value: ContextValueDisplayCell,
  className?: string,
): ReactNode | undefined {
  if (!valueType) return undefined;
  const text = value.value_text?.trim() || "";

  switch (valueType) {
    case "email":
      if (!text) return undefined;
      return (
        <a
          href={`mailto:${text}`}
          className={cn("inline-flex items-center gap-1 text-primary hover:underline", className)}
        >
          <Mail className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{text}</span>
        </a>
      );
    case "url":
      if (!text) return undefined;
      return (
        <a
          href={text}
          target="_blank"
          rel="noopener noreferrer"
          className={cn("inline-flex items-center gap-1 text-primary hover:underline", className)}
        >
          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{text}</span>
        </a>
      );
    case "phone":
      if (!text) return undefined;
      return (
        <a
          href={`tel:${text.replace(/[^\d+]/g, "")}`}
          className={cn("inline-flex items-center gap-1 text-primary hover:underline", className)}
        >
          <Phone className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{text}</span>
        </a>
      );
    case "color": {
      if (!text) return undefined;
      const isHex = /^#[0-9a-fA-F]{6}$/.test(text);
      return (
        <span className={cn("inline-flex items-center gap-1.5", className)}>
          <span
            className="h-4 w-4 shrink-0 rounded border border-border"
            style={isHex ? { backgroundColor: text } : undefined}
          />
          <code className="font-mono text-xs">{text}</code>
        </span>
      );
    }
    case "markdown":
      if (!text) return undefined;
      return (
        <div className={cn("prose-sm max-w-none", className)}>
          <BasicMarkdownContent content={text} />
        </div>
      );
    case "percent":
      if (value.value_number == null) return undefined;
      return <span className={className}>{value.value_number}%</span>;
    case "datetime": {
      if (!value.value_timestamp) return undefined;
      const d = new Date(value.value_timestamp);
      return (
        <span className={className}>
          {Number.isNaN(d.getTime()) ? value.value_timestamp : d.toLocaleString()}
        </span>
      );
    }
    case "time":
      if (!value.value_time) return undefined;
      return <span className={className}>{value.value_time}</span>;
    case "currency": {
      const j = value.value_json as { amount?: number; currency?: string } | null;
      if (!j || typeof j !== "object" || j.amount == null) return undefined;
      const currency = j.currency || "USD";
      let formatted: string;
      try {
        formatted = new Intl.NumberFormat(undefined, {
          style: "currency",
          currency,
        }).format(j.amount);
      } catch {
        formatted = `${j.amount} ${currency}`;
      }
      return <span className={className}>{formatted}</span>;
    }
    default:
      return undefined;
  }
}

/** Renders one context item cell — reference cells as live chips, everything else type-appropriately. */
export function ContextValueDisplay({
  value,
  valueType,
  emptyLabel = "No value set",
  className,
}: ContextValueDisplayProps) {
  const parsed = parseReferenceCellValue(value.value_text ?? null);
  if (parsed) {
    if (parsed.items.length === 0) {
      return <EmptyState emptyLabel={emptyLabel} className={className} />;
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

  // Type-driven rendering — several of these share value_text as storage, so the
  // declared valueType is what distinguishes them.
  const rendered = renderTyped(valueType, value, className);
  if (rendered !== undefined) return rendered;

  if (value.value_text != null) {
    return (
      <span className={cn("whitespace-pre-wrap break-words", className)}>
        {value.value_text}
      </span>
    );
  }
  if (value.value_number != null) {
    return <span className={className}>{value.value_number}</span>;
  }
  if (value.value_boolean != null) {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-md border border-border bg-muted px-1.5 py-0.5 text-xs font-medium",
          className,
        )}
      >
        {value.value_boolean ? "Yes" : "No"}
      </span>
    );
  }
  if (value.value_date != null) {
    return <span className={className}>{value.value_date}</span>;
  }
  if (value.value_document_url) {
    return (
      <a
        href={value.value_document_url}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "inline-flex items-center gap-1 text-primary hover:underline",
          className,
        )}
      >
        <FileText className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{value.value_document_url}</span>
      </a>
    );
  }
  // Legacy pre-fence column — kept defensively; every current row has been
  // backfilled to a fence (see FEATURE.md "Legacy pre-fence values"), so this
  // path should never actually render, but a restored old version could.
  if (value.value_reference_id) {
    return <span className={className}>→ {value.value_reference_id}</span>;
  }
  if (value.value_json != null) {
    return (
      <span className={cn("font-mono text-xs", className)}>
        {JSON.stringify(value.value_json)}
      </span>
    );
  }

  return <EmptyState emptyLabel={emptyLabel} className={className} />;
}

export default ContextValueDisplay;
