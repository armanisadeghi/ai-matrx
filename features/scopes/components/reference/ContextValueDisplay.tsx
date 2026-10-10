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
import { Ban, Mail, Phone, ExternalLink } from "lucide-react";
import MatrxEnvelopeBlock from "@/features/matrx-envelope/MatrxEnvelopeBlock";
import {
  buildDirectiveSlug,
  buildKindDirective,
} from "@ai-matrx/content-ir";
import { cn } from "@/utils/cn";
import { parseReferenceCellValue } from "@/features/scopes/utils/referenceCell";
import { BasicMarkdownContent } from "@ai-matrx/rich-content/display/chat-markdown/BasicMarkdownContent";
import { AnswerValueView } from "@/components/official/structured-value/AnswerValueView";
import { hasKindKeyAnySpelling } from "@/features/content-ir/surfaces/json-kind-signal";
import { referenceFence, type ContextFieldKind } from "@ai-matrx/records/scopes";
import type { ContextCellLike } from "@/features/scopes/utils/referenceCell";

/** What the display reads: a value's kind, its cell and its decoded references. */
export type ContextValueDisplayCell = ContextCellLike;

export interface ContextValueDisplayProps {
  value: ContextValueDisplayCell | null | undefined;
  /**
   * The field's kind when the caller knows it better than the cell (else the cell's own): several
   * kinds share a text cell (email/url/phone/color/markdown), so the kind renders them richly.
   */
  kind?: ContextFieldKind | null;
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
  kind: ContextFieldKind | null | undefined,
  cell: unknown,
  className?: string,
): ReactNode | undefined {
  if (!kind) return undefined;
  const text = typeof cell === "string" ? cell.trim() : "";
  const num = typeof cell === "number" ? cell : null;

  switch (kind) {
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
      // A kind is drawn as its kind, never as JSON (kind-never-raw O2).
      if (hasKindKeyAnySpelling(text)) {
        return (
          <div className={className}>
            <AnswerValueView text={text} />
          </div>
        );
      }
      return (
        <div className={cn("prose-sm max-w-none", className)}>
          <BasicMarkdownContent imagePolicy="other" content={text} />
        </div>
      );
    case "percent":
      if (num == null) return undefined;
      return <span className={className}>{num}%</span>;
    case "datetime": {
      if (!text) return undefined;
      const d = new Date(text);
      return (
        <span className={className}>
          {Number.isNaN(d.getTime()) ? text : d.toLocaleString()}
        </span>
      );
    }
    case "time":
      if (!text) return undefined;
      return <span className={className}>{text}</span>;
    case "currency": {
      const j = cell as { amount?: number; currency?: string } | null;
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
  kind,
  emptyLabel = "No value set",
  className,
}: ContextValueDisplayProps) {
  const k = kind ?? value?.kind ?? null;
  const references = value?.references ?? [];
  if (k === "reference" || k === "document" || references.length > 0) {
    const parsed = references.length > 0 ? parseReferenceCellValue(referenceFence(references)) : null;
    if (!parsed || parsed.items.length === 0) {
      return <EmptyState emptyLabel={emptyLabel} className={className} />;
    }
    return (
      <div className={className}>
        <MatrxEnvelopeBlock content={buildKindDirective(buildDirectiveSlug("reference", parsed.type), parsed.items)} />
      </div>
    );
  }

  const cell = value?.value ?? null;
  const rendered = renderTyped(k, cell, className);
  if (rendered !== undefined) return rendered;

  if (typeof cell === "string") {
    if (cell === "") return <EmptyState emptyLabel={emptyLabel} className={className} />;
    const fenced = parseReferenceCellValue(cell);
    if (fenced && fenced.items.length > 0) {
      return (
        <div className={className}>
          <MatrxEnvelopeBlock content={buildKindDirective(buildDirectiveSlug("reference", fenced.type), fenced.items)} />
        </div>
      );
    }
    if (hasKindKeyAnySpelling(cell)) {
      return (
        <div className={className}>
          <AnswerValueView text={cell} />
        </div>
      );
    }
    return <span className={cn("whitespace-pre-wrap break-words", className)}>{cell}</span>;
  }
  if (typeof cell === "number") {
    return <span className={className}>{cell}</span>;
  }
  if (typeof cell === "boolean") {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-md border border-border bg-muted px-1.5 py-0.5 text-xs font-medium",
          className,
        )}
      >
        {cell ? "Yes" : "No"}
      </span>
    );
  }
  if (cell !== null && cell !== undefined) {
    return (
      <div className={className}>
        <AnswerValueView value={cell} density="inline" />
      </div>
    );
  }

  return <EmptyState emptyLabel={emptyLabel} className={className} />;
}

export default ContextValueDisplay;
