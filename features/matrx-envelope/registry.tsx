"use client";

/**
 * Matrx Envelope — FE renderer registry (the client mirror of the backend's
 * shape registry). Recognize the OUTER canonical envelope once, then route the
 * INTERNAL parts through this registry by `(kind, type)`:
 *
 *   getEnvelopeRenderer(kind, type)
 *     → a `kind:type`-specific renderer, else a `kind`-default renderer, else null
 *
 * A null result is the graceful-fallback signal — `MatrxEnvelopeBlock` shows a
 * neutral card so an unknown shape is still displayed, never dropped.
 *
 * Add a renderer = one `registerEnvelopeRenderer(...)` call. No switch to edit.
 */

import type { ComponentType } from "react";
import { Link2 } from "lucide-react";

import { cn } from "@/lib/utils";
import type { MatrxEnvelope, ReferenceItem } from "@/features/matrx-envelope/envelope";

export interface EnvelopeRendererProps {
  envelope: MatrxEnvelope;
}

export type EnvelopeRenderer = ComponentType<EnvelopeRendererProps>;

const _registry = new Map<string, EnvelopeRenderer>();

/** Register a renderer for a whole `kind`, or a specific `kind:type` (type wins). */
export function registerEnvelopeRenderer(
  kind: string,
  renderer: EnvelopeRenderer,
  type?: string,
): void {
  _registry.set(type ? `${kind}:${type}` : kind, renderer);
}

/** The renderer for `(kind, type)`: type-specific → kind-default → null (fallback). */
export function getEnvelopeRenderer(kind: string, type: string): EnvelopeRenderer | null {
  return _registry.get(`${kind}:${type}`) ?? _registry.get(kind) ?? null;
}

// ── Built-in renderers ───────────────────────────────────────────────────────

function refLabel(item: ReferenceItem, fallback: string): string {
  const label = item?.display?.label;
  return typeof label === "string" && label.trim().length > 0 ? label : fallback;
}

/** `reference` kind — one chip per item (display.label, instant paint; no fetch in v1). */
const ReferenceRenderer: EnvelopeRenderer = ({ envelope }) => {
  const items = Array.isArray(envelope.items)
    ? (envelope.items as unknown as ReferenceItem[])
    : [];
  return (
    <span className="my-1 inline-flex flex-wrap items-center gap-1.5 align-middle">
      {items.map((item, i) => (
        <span
          key={i}
          className={cn(
            "inline-flex items-center gap-1 rounded-md border border-border",
            "bg-muted px-2 py-0.5 text-sm text-foreground align-middle",
          )}
        >
          <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{refLabel(item, envelope.type)}</span>
        </span>
      ))}
    </span>
  );
};

registerEnvelopeRenderer("reference", ReferenceRenderer);
