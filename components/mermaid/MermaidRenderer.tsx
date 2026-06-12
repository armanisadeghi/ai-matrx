"use client";

/**
 * MermaidRenderer — source string in, live diagram out.
 *
 * Behavior contract:
 *  - Streaming: debounced (300ms) validate→render attempts; failures keep the
 *    last good render on screen silently (partial text is expected to fail).
 *  - Complete: full forgiving ladder (sanitize.ts). Success renders the fixed
 *    source; failure shows a rich error card with the engine message, the
 *    fixes attempted, and the original source — never a blank hole.
 *  - The original source is never mutated; fixes affect only what renders.
 */

import React, { useEffect, useRef, useState } from "react";
import { Copy, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { detectDiagramType, extractMermaidTitle } from "./diagram-type";
import { getCatalogEntry } from "./catalog";
import { MermaidViewport } from "./MermaidViewport";
import { preloadMermaid, renderMermaid, validateMermaid } from "./runtime";
import { parseWithLadder, type LadderResult } from "./sanitize";
import type { MermaidRenderOptions } from "./types";
import { renderOptionsKey } from "./types";

const STREAMING_DEBOUNCE_MS = 300;

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
}

export function MermaidRenderer({
  source,
  options,
  isStreamActive = false,
  className,
  hideViewportControls,
  onSvgMounted,
  onLadderResult,
}: MermaidRendererProps) {
  const [lastGoodSvg, setLastGoodSvg] = useState<string | null>(null);
  const [failure, setFailure] = useState<LadderResult | null>(null);
  const epochRef = useRef(0);
  const onLadderResultRef = useRef(onLadderResult);
  onLadderResultRef.current = onLadderResult;

  useEffect(() => {
    preloadMermaid();
  }, []);

  const optionsKey = renderOptionsKey(options);

  useEffect(() => {
    const trimmed = source.trim();
    if (!trimmed) {
      setLastGoodSvg(null);
      setFailure(null);
      return;
    }
    const epoch = ++epochRef.current;
    const timer = setTimeout(
      async () => {
        try {
          const ladder = await parseWithLadder(trimmed, validateMermaid, {
            streaming: isStreamActive,
          });
          if (epoch !== epochRef.current) return;
          onLadderResultRef.current?.(ladder);
          if (ladder.valid) {
            const { svg } = await renderMermaid(ladder.source, options);
            if (epoch !== epochRef.current) return;
            setLastGoodSvg(svg);
            setFailure(null);
          } else if (!isStreamActive) {
            setFailure(ladder);
          }
          // streaming + invalid → keep last good, stay quiet
        } catch (err) {
          // validate said ok but render threw (parse/render mismatch exists
          // for some grammars) — treat like a ladder failure on complete.
          if (epoch !== epochRef.current) return;
          if (!isStreamActive) {
            setFailure({
              source: trimmed,
              valid: false,
              fixes: [],
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      },
      isStreamActive ? STREAMING_DEBOUNCE_MS : 0,
    );
    return () => clearTimeout(timer);
  }, [source, optionsKey, isStreamActive]); // eslint-disable-line react-hooks/exhaustive-deps -- optionsKey is the stable identity of `options`

  const diagramType = detectDiagramType(source);
  const label = getCatalogEntry(diagramType).label;
  const title = extractMermaidTitle(source);

  if (failure && !isStreamActive && !lastGoodSvg) {
    return <MermaidErrorCard failure={failure} originalSource={source} className={className} />;
  }

  if (!lastGoodSvg) {
    return (
      <div className={cn("space-y-2 p-3", className)} aria-busy="true">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <figure
      role="img"
      aria-label={title ?? `${label} diagram`}
      className={cn("m-0", className)}
    >
      <MermaidViewport
        svg={lastGoodSvg}
        hideControls={hideViewportControls}
        onSvgMounted={onSvgMounted}
      />
      {failure && !isStreamActive && (
        // The final source failed but a partial render succeeded earlier —
        // keep the diagram visible and surface the problem under it.
        <figcaption className="mt-1">
          <MermaidErrorCard failure={failure} originalSource={source} />
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
          <p className="font-medium text-foreground">This diagram could not be drawn</p>
          {failure.error && (
            <p className="break-words text-xs text-muted-foreground">{failure.error}</p>
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
