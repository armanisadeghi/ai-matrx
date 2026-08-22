"use client";

/**
 * The OFFICIAL fallback renderer for a resolved `__kind` block that has no
 * registered component (Shape System ruling R6).
 *
 * Before this block existed, a kind the platform fully understood — schema in
 * `content_ir.kind_definition`, envelope parsed, fields validated — but which
 * no component claimed would fall through the unified renderer's switch and
 * land on a raw code block.
 *
 * R6's disposition, implemented here: render the shape READABLY, and say —
 * quietly, in human words — that no custom view is registered for it yet.
 * Never an error. Never hidden content. The user always sees their data.
 *
 * 🚨 **What "readably" means changed on 2026-08-18.** This block used to show
 * a `JsonInspector` tree under a warning-tinted "Unverified shape — no
 * renderer is registered for this shape" banner. That is a developer artifact,
 * and our reader is a non-technical Subject Matter Expert: on one real Study
 * Pack run, 19 of 23 steps rendered exactly like that. The body is now
 * {@link StructuredValueView} — the platform-wide floor that renders any JSON
 * value as a human document (prose through the canonical markdown renderer,
 * uniform object arrays as a real table, media through `InlineMediaRef`,
 * humanized keys, nested objects as titled sections). The honesty did not go
 * away; it moved into that component's muted footer, beside the raw-data
 * escape hatch — which is where WE read it and where the SME does not have to.
 *
 * Naming a component is still not the same as having one: the footer appears
 * whether R6 fired (`marker.by === "generic"`) or a `kind_component` row names
 * `generic_structured` as the kind's web output component (`marker.by ===
 * "db"`), because both mean "no custom view".
 *
 * ## Bare by construction (THE WRAPPER LAW)
 *
 * Every host that routes a block here already draws chrome — a chat message
 * surface, a workflow readout step box, the studio's preview card. This block
 * used to add a card of its own on top, which on `/shapes/<kind>` produced the
 * literal two-border, two-`p-3` box-in-a-box. It contributes flow spacing and
 * nothing else; the host owns the frame.
 */

import React from "react";
import { Braces } from "lucide-react";

import { cn } from "@/lib/utils";
import { StructuredValueView } from "@/components/official/structured-value/StructuredValueView";
import { readEnvelope } from "@/features/content-ir/redux/render-block-envelope";
import { reconstructRegionValue } from "@ai-matrx/content-ir";
import { readObjectKind } from "@ai-matrx/content-ir";
import { readIrRouteMarker } from "@/features/content-ir/react/kind-route";

export interface GenericStructuredBlockProps {
  /** The raw region source — the zero-loss floor when no envelope survived. */
  content: string;
  /** Carries `__ir` (the parsed envelope) and `__ir_route` (the seam marker). */
  metadata?: Record<string, unknown>;
  className?: string;
}

/**
 * Best-effort value recovery, in descending fidelity. The envelope is the
 * source of truth (it merges residues back, so unknown keys survive); a bare
 * `JSON.parse` is the floor; the raw text is the never-lose-content backstop.
 */
function readStructuredValue(
  content: string,
  metadata: Record<string, unknown> | undefined,
): { value: unknown; recovered: boolean } {
  const envelope = readEnvelope(metadata);
  if (envelope) return { value: reconstructRegionValue(envelope), recovered: true };

  try {
    return { value: JSON.parse(content) as unknown, recovered: true };
  } catch {
    return { value: null, recovered: false };
  }
}

const GenericStructuredBlock: React.FC<GenericStructuredBlockProps> = ({
  content,
  metadata,
  className,
}) => {
  const envelope = readEnvelope(metadata);
  const status = envelope?.root.status ?? "complete";
  const { value, recovered } = readStructuredValue(content, metadata);
  // The envelope is the authority; a block that arrived without one still
  // names its own kind inside the payload.
  const kind =
    envelope?.root.kind ??
    (typeof value === "object" && value !== null && !Array.isArray(value)
      ? readObjectKind(value as Record<string, unknown>)
      : null) ??
    "";
  const marker = readIrRouteMarker(metadata);
  const note =
    marker?.reason === "inactive"
      ? "a custom view is registered but held inactive"
      : "no custom view yet";

  return (
    <div className={cn("my-2 min-w-0", className)}>
      {status === "streaming" ? (
        <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Braces className="h-3.5 w-3.5 shrink-0 animate-pulse" />
          <span>Still arriving…</span>
        </div>
      ) : null}

      {recovered ? (
        <StructuredValueView
          value={value}
          kind={kind || undefined}
          note={note}
        />
      ) : (
        // Zero-data-loss backstop: the region never parsed, so show the
        // source verbatim rather than swallowing it.
        <pre className="max-h-96 overflow-auto font-mono text-xs leading-relaxed text-muted-foreground">
          {content}
        </pre>
      )}
    </div>
  );
};

export default GenericStructuredBlock;
