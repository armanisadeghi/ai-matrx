"use client";

/**
 * StructuredValueView — THE FLOOR of the platform's structured rendering.
 *
 * The Shape System is a REGISTRY: a payload looks good only when three
 * independent things are all true — the producer declared a curated kind, that
 * kind has an ACTIVE web `kind_component`, and the payload validates. Miss any
 * one and the surface falls through. Until 2026-08-18 what it fell through TO
 * was `JSON.stringify` in a ```json fence (or a `JsonInspector` tree under an
 * "Unverified shape" warning) — a developer artifact handed to a
 * non-technical Subject Matter Expert. Measured on one real Study Pack run:
 * 2 of 23 steps rendered as components, 19 rendered as JSON.
 *
 * This component is that floor, rebuilt. It renders ANY JSON value as a human
 * document, so a curated `kind_component` becomes an UPGRADE rather than a
 * prerequisite. That is what makes the guarantee unconditional, the way
 * `MarkdownStream` is unconditional for text.
 *
 * THE CANONICAL COMPONENT LAW still wins, always: a registered kind's own
 * component renders it everywhere. This is only what happens BENEATH that —
 * never a second renderer for a shape that has one.
 *
 * It is not a new engine. The recursive value renderer already existed as the
 * tool-result field library (`features/tool-call-visualization/result-fields/`)
 * — shape detection, prose through the canonical markdown renderer, uniform
 * object arrays as a sortable/filterable table, `file_id` / media refs through
 * `InlineMediaRef`, humanized keys, UUID and enum treatment, recursion caps
 * that always carry an in-place escape. THE INVENTORY LAW: the defect was that
 * the Shape System's floor ignored it, not that it did not exist. This module
 * is the platform-wide door onto it, plus the document framing and the raw
 * escape hatch.
 *
 * Consumers (the floor, everywhere it is reached):
 *  - `components/mardown-display/blocks/generic/GenericStructuredBlock.tsx`
 *    — the R6 route for a KNOWN kind nothing render-trusted claims (chat,
 *      live runs, every `applyIrKindRoute` consumer).
 *  - `features/content-ir/studio/components/KindInstanceRender.tsx`
 *    — the unroutable path, i.e. all 15 surfaces that render a kind instance.
 *  - `features/workflow-runtime/components/readout-parts.tsx`
 *    — settled node output with no component.
 */

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  ResultValue,
  type ResultDensity,
} from "@/features/tool-call-visualization/result-fields/ResultValue";
import { ResultJson } from "@/features/tool-call-visualization/result-fields/ResultJson";
import {
  humanizeKey,
  isPlainObject,
} from "@/features/tool-call-visualization/result-fields/shape";
import { KIND_KEY } from "@ai-matrx/content-ir";

/**
 * Serialized-character budget above which the document renders in the CAPPED
 * density instead of expanding everything.
 *
 * This is the "sane size bound" — not a truncation. Capped density shows the
 * first fields / rows of every structure with a "+N more" that expands in
 * place, so nothing is unreachable; it exists so a 53 KB workflow `pack`
 * output does not mount ten thousand DOM nodes in a readout panel.
 */
const DOCUMENT_SIZE_BUDGET = 40_000;

export type StructuredValueDensity = "auto" | ResultDensity;

export interface StructuredValueViewProps {
  /** Any JSON value: object, array, scalar, null, undefined. */
  value: unknown;
  /**
   * `"auto"` (default) renders the full document, degrading to the capped
   * density past {@link DOCUMENT_SIZE_BUDGET}. Pass `"full"` / `"inline"` to
   * decide for a surface that knows better.
   */
  density?: StructuredValueDensity;
  /**
   * The kind slug this value claims, when the caller knows it. Only ever used
   * for the honesty line — never to pick a renderer (that decision belongs to
   * `applyIrKindRoute`, and this component is what happens after it declines).
   */
  kind?: string;
  /**
   * The muted footer: what this shape is, that it has no custom view yet, and
   * the raw-data escape. Default true. Pass false only where the HOST already
   * says both (the studio's own routing note).
   */
  footer?: boolean;
  /**
   * Why this shape has no custom view, in human words. Default "no custom view
   * yet"; the R6 route passes the refined reason when a component IS
   * registered but held inactive — naming a component is not the same as
   * having one, and that difference is real to us.
   */
  note?: string;
  className?: string;
}

/**
 * The `__kind` discriminator is how the platform ROUTES a payload; it is not
 * something the payload says. Rendering it puts a field reading
 * "Kind — action_io_docproc_ingest_from_media_refs_c6ee91fc_output" at the top
 * of a study document. Stripped recursively, by reference where nothing
 * changed so an untouched value never re-renders. It stays in the raw view.
 */
function stripKindKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((item) => {
      const stripped = stripKindKeys(item);
      if (stripped !== item) changed = true;
      return stripped;
    });
    return changed ? next : value;
  }
  if (!isPlainObject(value)) return value;

  let changed = false;
  const next: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === KIND_KEY) {
      changed = true;
      continue;
    }
    const stripped = stripKindKeys(item);
    if (stripped !== item) changed = true;
    next[key] = stripped;
  }
  return changed ? next : value;
}

/** Serialized size, treating an unserializable value as "too big". */
function estimateSize(value: unknown): number {
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return DOCUMENT_SIZE_BUDGET + 1;
  }
}

export function StructuredValueView({
  value,
  density = "auto",
  kind,
  footer = true,
  note = "no custom view yet",
  className,
}: StructuredValueViewProps) {
  const [showRaw, setShowRaw] = useState(false);

  const shown = useMemo(() => stripKindKeys(value), [value]);

  const resolved: ResultDensity = useMemo(() => {
    if (density !== "auto") return density;
    return estimateSize(shown) > DOCUMENT_SIZE_BUDGET ? "inline" : "full";
  }, [density, shown]);

  return (
    <div className={cn("min-w-0 space-y-2", className)}>
      <ResultValue value={shown} density={resolved} />

      {footer ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border/50 pt-1.5 text-[11px] text-muted-foreground">
          {kind ? (
            <span title={kind}>
              {humanizeKey(kind)}
              <span className="text-muted-foreground/70">{` — ${note}`}</span>
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => setShowRaw((open) => !open)}
            aria-expanded={showRaw}
            className="inline-flex items-center gap-0.5 font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            {showRaw ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            {showRaw ? "Hide the raw data" : "Show the raw data"}
          </button>
        </div>
      ) : null}

      {footer && showRaw ? <ResultJson data={value} /> : null}
    </div>
  );
}

export default StructuredValueView;
