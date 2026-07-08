"use client";

/**
 * The OFFICIAL fallback renderer for a resolved `__kind` block that has no
 * registered component (Shape System ruling R6).
 *
 * Before this block existed, a kind the platform fully understood — schema in
 * `content_ir.kind_definition`, envelope parsed, fields validated — but which
 * no component claimed would fall through the unified renderer's switch and
 * land on a raw code block. That is the "no-component root" trap that kept
 * `q_and_a_set`, `study_pack_set` and `schema_showcase` permanently red.
 *
 * R6's disposition, implemented here: render the shape readably, and SAY OUT
 * LOUD that no renderer is registered for it. Never an error. Never hidden
 * content. The user always sees their data.
 *
 * The tree itself is NOT hand-rolled — it is `JsonInspector`, the repo's
 * canonical application-wide JSON display (tree / raw / explorer views, copy,
 * expand-depth), pulled in through `next/dynamic` so its panes never enter the
 * chat chunk. This component owns only the chrome and the honesty.
 */

import React from "react";
import dynamic from "next/dynamic";
import { AlertTriangle, Braces } from "lucide-react";

import { cn } from "@/lib/utils";
import { readEnvelope } from "@/features/content-ir/redux/render-block-envelope";
import { reconstructRegionValue } from "@/features/content-ir/core/envelope-value";
import { readIrRouteMarker } from "@/features/content-ir/react/kind-route";

const JsonInspector = dynamic(
  () =>
    import("@/components/official-candidate/json-inspector/JsonInspector").then(
      (m) => ({ default: m.JsonInspector }),
    ),
  {
    ssr: false,
    loading: () => (
      <div className="p-3 text-xs text-muted-foreground">
        Loading structured view…
      </div>
    ),
  },
);

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
  const marker = readIrRouteMarker(metadata);
  const kind = envelope?.root.kind ?? "";
  const status = envelope?.root.status ?? "complete";
  const { value, recovered } = readStructuredValue(content, metadata);

  // The affordance is UNCONDITIONAL, by construction. This component is only
  // ever reached two ways, and no bespoke renderer exists on either:
  //   1. the R6 fallback fired (marker.by === "generic"), or
  //   2. a `kind_component` row names `generic_structured` as the kind's web
  //      output component (marker.by === "db").
  // Gating the banner on `marker.unverified` would make case 2 render the
  // generic tree while silently claiming the shape has a renderer. The marker
  // therefore only refines the SENTENCE, never whether we tell the truth.
  const reasonText =
    marker?.reason === "inactive"
      ? "a component is registered for this shape but is held inactive, so it is not yet trusted to render"
      : "no renderer is registered for this shape";

  return (
    <div
      className={cn(
        "my-2 overflow-hidden rounded-lg border border-border bg-card",
        className,
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <Braces className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="text-sm font-medium text-foreground">
            Structured content
          </span>
          {kind ? (
            <span className="truncate rounded bg-muted px-1.5 py-0.5 font-mono text-xs font-medium text-muted-foreground">
              {kind}
            </span>
          ) : null}
          {status === "streaming" ? (
            <span className="shrink-0 text-xs text-muted-foreground">
              streaming…
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex items-start gap-2 border-t border-border/40 bg-warning/5 px-3 py-2">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Unverified shape</span>
          {" — "}
          {reasonText}
          {kind ? (
            <>
              {" for "}
              <span className="font-mono text-foreground">{kind}</span>
            </>
          ) : null}
          . Showing every field exactly as it arrived.
        </p>
      </div>

      <div className="min-h-0 border-t border-border/40">
        {recovered ? (
          <div className="h-96 min-h-0">
            <JsonInspector
              data={value}
              defaultView="tree"
              defaultExpandDepth={2}
              className="rounded-none bg-transparent"
            />
          </div>
        ) : (
          // Zero-data-loss backstop: the region never parsed, so show the
          // source verbatim rather than swallowing it.
          <pre className="max-h-96 overflow-auto px-3 py-2 font-mono text-xs leading-relaxed text-muted-foreground">
            {content}
          </pre>
        )}
      </div>
    </div>
  );
};

export default GenericStructuredBlock;
