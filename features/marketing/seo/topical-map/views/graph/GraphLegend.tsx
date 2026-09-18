"use client";

// features/marketing/seo/topical-map/views/graph/GraphLegend.tsx
//
// THE LEGEND A PERSON CAN ACTUALLY READ. A drawing whose colours and sizes mean
// something undocumented is a drawing that means nothing, so this panel says —
// in sentences, right now, for the encoding actually in force — what size, fill,
// ring and hue are doing, and carries the switch between the two modes.
//
// It renders a plain element; `GraphViewImpl` puts it inside React Flow's
// `Panel` (this file must not import the canvas engine — eslint's
// reactFlowStaticImportBan, one gated module per surface).
//
// Two honesty rules live here:
//   1. An encoding value this build does not know gets its own line SAYING SO
//      (`encoding.ts` writes the sentence) — never a missing line, never a
//      silent "none".
//   2. In convergence mode the colours are a rollup of page intents, and until
//      every page is counted the panel says how far it has got. A partial
//      rollup presented as complete is the confident lie this feature exists
//      to kill.

import { useState } from "react";
import { ChevronDown, ChevronUp, Compass, Route } from "lucide-react";

import { cn } from "@/lib/utils";

import type { MapIntentColors } from "../../knobs";
import { intentColorClasses } from "../../ui/intentColorClasses";
import type { ConvergenceTone, GraphEncodingMode, ResolvedGraphEncoding } from "./encoding";

/** How far the convergence rollup has got. `total` is the server's own count. */
export interface ConvergenceProgress {
  loaded: number;
  total: number | null;
  complete: boolean;
}

export interface GraphLegendProps {
  encoding: ResolvedGraphEncoding;
  mode: GraphEncodingMode;
  onModeChange: (mode: GraphEncodingMode) => void;
  colors: MapIntentColors | null;
  progress: ConvergenceProgress;
  /** Nodes or edges `map_graph` returned in a shape this build cannot draw. */
  skipped: { nodes: number; edges: number };
}

const TONE_ORDER: readonly ConvergenceTone[] = [
  "in_place",
  "leaving",
  "arriving",
  "delete",
  "planned",
  "missing",
];

const TONE_TEXT: Record<ConvergenceTone, string> = {
  in_place: "Staying where it is",
  leaving: "Leaving this topic",
  arriving: "Arriving at this topic",
  delete: "Being deleted",
  planned: "No live page yet, one is planned",
  missing: "No live page and nothing planned",
};

function ModeButton({
  active,
  label,
  title,
  icon: Icon,
  onClick,
}: {
  active: boolean;
  label: string;
  title: string;
  icon: typeof Compass;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {label}
    </button>
  );
}

export function GraphLegend({
  encoding,
  mode,
  onModeChange,
  colors,
  progress,
  skipped,
}: GraphLegendProps) {
  // Keep the canvas clear; the same disclosure works on every screen size.
  const [expanded, setOpen] = useState(false);

  return (
    <div className="w-[248px] max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-card/95 p-2 text-xs shadow-md backdrop-blur">
      <div className="flex items-center gap-1">
        <ModeButton
          active={mode === "structure"}
          label="Structure"
          title="Colour the map by what each topic IS."
          icon={Compass}
          onClick={() => onModeChange("structure")}
        />
        <ModeButton
          active={mode === "convergence"}
          label="Convergence"
          title="Colour the map by where each topic's pages are going."
          icon={Route}
          onClick={() => onModeChange("convergence")}
        />
        <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={expanded}
            title={expanded ? "Hide what the colours mean" : "Show what the colours mean"}
            className="ml-auto rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {expanded ? (
              <ChevronUp className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" aria-hidden />
            )}
        </button>
      </div>

      {expanded ? (
        <div className="mt-2 space-y-1.5">
          {encoding.lines.map((line) => (
            <p
              key={line.channel}
              className={cn("leading-snug", line.known ? "text-muted-foreground" : "text-warning")}
            >
              {line.text}
            </p>
          ))}

          {mode === "convergence" ? (
            <div className="mt-2 border-t border-border pt-2">
              {colors ? (
                <ul className="space-y-1">
                  {TONE_ORDER.map((tone) => {
                    const classes = intentColorClasses(colors[tone]);
                    return (
                      <li key={tone} className="flex items-center gap-1.5">
                        <span
                          className={cn("h-2.5 w-2.5 shrink-0 rounded-full border", classes.dot)}
                          aria-hidden
                        />
                        <span className="text-muted-foreground">{TONE_TEXT[tone]}</span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-muted-foreground">
                  The colour settings for this map have not loaded, so no swatches are shown.
                </p>
              )}

              {/* NEVER A PARTIAL ROLLUP PRESENTED AS COMPLETE. */}
              {progress.complete ? (
                <p className="mt-2 text-muted-foreground">
                  Coloured from all{" "}
                  {(progress.total ?? progress.loaded).toLocaleString()} pages on this map.
                </p>
              ) : (
                <p className="mt-2 text-foreground" role="status" aria-live="polite">
                  Colouring {progress.loaded.toLocaleString()} of{" "}
                  {progress.total === null ? "…" : progress.total.toLocaleString()} pages…
                  {progress.loaded === 0
                    ? " No topic is coloured by intent yet."
                    : " Topics whose pages are still being counted keep their structural colour."}
                </p>
              )}
            </div>
          ) : null}

          {skipped.nodes > 0 || skipped.edges > 0 ? (
            <p className="mt-2 border-t border-border pt-2 text-warning">
              {skipped.nodes} node{skipped.nodes === 1 ? "" : "s"} and {skipped.edges} connection
              {skipped.edges === 1 ? "" : "s"} came back in a shape this app does not know, so they
              are not drawn.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
