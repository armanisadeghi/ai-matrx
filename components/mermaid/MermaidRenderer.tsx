"use client";

/**
 * MermaidRenderer — source string in, live diagram out.
 *
 * Behavior contract:
 *  - Streaming: debounced (300ms) validate→render attempts; failures keep the
 *    last good render on screen silently (partial text is expected to fail).
 *  - Complete: render valid source directly (Mermaid's render already parses
 *    it), then run the forgiving ladder only after a failure. This avoids the
 *    former double-parse cost on every valid diagram.
 *  - The original source is never mutated; fixes affect only what renders.
 */

import React, { useEffect, useId, useRef, useState } from "react";

console.log(
  "%c[MERMAID IMPORT TEST] components/mermaid/MermaidRenderer.tsx",
  "color: #fff; background: #7c3aed; font-weight: bold; padding: 2px 6px; border-radius: 3px;",
);
import { Copy, TriangleAlert } from "lucide-react";
import { toast } from "@/lib/toast";

import { Skeleton } from "@ai-matrx/design-system";
import { cn } from "@/lib/utils";

import { detectDiagramType, extractMermaidTitle } from "./diagram-type";
import { getCatalogEntry } from "./catalog";
import { MermaidViewport } from "./MermaidViewport";
import {
  MermaidRenderSupersededError,
  preloadMermaid,
  renderMermaid,
  supersedeMermaidRender,
  validateMermaid,
} from "./runtime";
import {
  humanizeMermaidError,
  parseWithLadder,
  type LadderResult,
} from "./sanitize";
import type { MermaidRenderOptions } from "./types";
import { renderOptionsKey } from "./types";

const STREAMING_DEBOUNCE_MS = 300;
const SETTLED_DEBOUNCE_MS = 250;

interface MermaidRendererProps {
  source: string;
  options: MermaidRenderOptions;
  isStreamActive?: boolean;
  className?: string;
  hideViewportControls?: boolean;
  /** Receives the live SVG element after each injection (visual-mode hook). */
  onSvgMounted?: (el: SVGSVGElement | null) => void;
  /** Called whenever a ladder pass finishes (diagnostics for editors). */
  onLadderResult?: (result: LadderResult) => void;
  /** Px cap on the diagram frame height (inline/chat). See MermaidViewport. */
  viewportMaxHeight?: number;
  /** Frame fills its parent's height (canvas workbench, fullscreen). */
  fillHeight?: boolean;
}

export function MermaidRenderer({
  source,
  options,
  isStreamActive = false,
  className,
  hideViewportControls,
  onSvgMounted,
  onLadderResult,
  viewportMaxHeight,
  fillHeight,
}: MermaidRendererProps) {
  const [lastGoodSvg, setLastGoodSvg] = useState<string | null>(null);
  const [failure, setFailure] = useState<LadderResult | null>(null);
  const epochRef = useRef(0);
  const rendererId = useId();
  const onLadderResultRef = useRef(onLadderResult);
  useEffect(() => {
    onLadderResultRef.current = onLadderResult;
  });

  useEffect(() => {
    preloadMermaid();
  }, []);

  const optionsKey = renderOptionsKey(options);

  useEffect(() => {
    const trimmed = source.trim();
    if (!trimmed) {
      // Don't clear state here (setState-in-effect) — the empty source is
      // handled by deriving `hasSource` below, which hides any stale render.
      return undefined;
    }
    const epoch = ++epochRef.current;
    const timer = setTimeout(
      async () => {
        try {
          if (!isStreamActive) {
            let directRenderError: unknown;
            try {
              const { svg } = await renderMermaid(trimmed, options, rendererId);
              if (epoch !== epochRef.current) return;
              setLastGoodSvg(svg);
              setFailure(null);
              return;
            } catch (err) {
              directRenderError = err;
              // Invalid LLM-authored diagrams take the repair ladder below.
              // Valid diagrams never pay for a separate parse pass.
            }
            const validation = await validateMermaid(trimmed);
            if (epoch !== epochRef.current) return;
            if (validation.ok) throw directRenderError;
          }
          const ladder = await parseWithLadder(trimmed, validateMermaid, {
            streaming: isStreamActive,
          });
          if (epoch !== epochRef.current) return;
          onLadderResultRef.current?.(ladder);
          if (ladder.valid) {
            const { svg } = await renderMermaid(
              ladder.source,
              options,
              rendererId,
            );
            if (epoch !== epochRef.current) return;
            setLastGoodSvg(svg);
            setFailure(null);
          } else if (!isStreamActive) {
            setFailure(ladder);
          }
          // streaming + invalid → keep last good, stay quiet
        } catch (err) {
          if (err instanceof MermaidRenderSupersededError) return;
          // validate said ok but render threw (parse/render mismatch exists
          // for some grammars) — treat like a ladder failure on complete.
          if (epoch !== epochRef.current) return;
          if (!isStreamActive) {
            console.warn(
              "[MermaidRenderer] render threw after validation passed:",
              err,
            );
            setFailure({
              source: trimmed,
              valid: false,
              fixes: [],
              error: humanizeMermaidError(
                err instanceof Error ? err.message : String(err),
              ),
            });
          }
        }
      },
      isStreamActive ? STREAMING_DEBOUNCE_MS : SETTLED_DEBOUNCE_MS,
    );
    return () => {
      clearTimeout(timer);
      supersedeMermaidRender(rendererId);
    };
  }, [source, optionsKey, isStreamActive, rendererId]);

  const diagramType = detectDiagramType(source);
  const label = getCatalogEntry(diagramType).label;
  const title = extractMermaidTitle(source);

  // Derive what to show: when the source is empty, hide any stale render/error
  // (avoids clearing state in the effect above).
  const hasSource = source.trim().length > 0;
  const showSvg = hasSource ? lastGoodSvg : null;
  const showFailure = hasSource ? failure : null;

  if (showFailure && !isStreamActive && !showSvg) {
    return (
      <MermaidErrorCard
        failure={showFailure}
        originalSource={source}
        className={className}
      />
    );
  }

  if (!showSvg) {
    return (
      <div
        className={cn("space-y-2 p-3", fillHeight && "h-full", className)}
        aria-busy="true"
      >
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <figure
      role="img"
      aria-label={title ?? `${label} diagram`}
      className={cn("m-0", fillHeight && "flex h-full flex-col", className)}
    >
      <MermaidViewport
        svg={showSvg}
        className={fillHeight ? "min-h-0 flex-1" : undefined}
        hideControls={hideViewportControls}
        onSvgMounted={onSvgMounted}
        maxFrameHeight={viewportMaxHeight}
        fillHeight={fillHeight}
      />
      {showFailure && !isStreamActive && (
        // The final source failed but a partial render succeeded earlier —
        // keep the diagram visible and surface the problem under it.
        <figcaption className="mt-1">
          <MermaidErrorCard failure={showFailure} originalSource={source} />
        </figcaption>
      )}
    </figure>
  );
}

function MermaidErrorCard({
  failure,
  originalSource,
  className,
}: {
  failure: LadderResult;
  originalSource: string;
  className?: string;
}) {
  const [showSource, setShowSource] = useState(false);

  const copyOriginal = async () => {
    await navigator.clipboard.writeText(originalSource);
    toast.success("Diagram source copied");
  };

  return (
    <div
      className={cn(
        "rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm",
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="font-medium text-foreground">
            This diagram could not be drawn
          </p>
          {humanizeMermaidError(failure.error) && (
            <p className="break-words text-xs text-muted-foreground">
              {humanizeMermaidError(failure.error)}
            </p>
          )}
          {failure.fixes.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Attempted repairs: {failure.fixes.map((f) => f.rule).join(", ")}
            </p>
          )}
          <div className="flex items-center gap-3 pt-0.5">
            <button
              type="button"
              className="text-xs font-medium text-primary hover:underline"
              onClick={() => setShowSource((v) => !v)}
            >
              {showSource ? "Hide source" : "Show source"}
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              onClick={copyOriginal}
            >
              <Copy className="h-3 w-3" />
              Copy source
            </button>
          </div>
          {showSource && (
            <pre className="mt-1 max-h-64 overflow-auto rounded bg-muted p-2 text-xs text-muted-foreground">
              {originalSource}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
