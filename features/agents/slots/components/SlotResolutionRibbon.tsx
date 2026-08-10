"use client";

/**
 * SlotResolutionRibbon — the canonical, truthful agent-slot precedence chain:
 * run-scope → your override → org override → system default. Highest
 * precedence renders first. Pass `provenance` to highlight the layer that
 * actually decides the agent for the current viewer; omit it for a pure
 * precedence reference (no highlight). Surfaces with their own name for a
 * layer (research calls run-scope "Topic override") relabel via `labels`.
 *
 * Shape absorbed from research's per-topic agents page; content is the ONE
 * platform precedence chain (SoR common-docs/systems/agent-slots/FEATURE.md)
 * — never restate the chain in prose beside this component.
 */

import { ArrowRight, Workflow } from "lucide-react";
import { cn } from "@/lib/utils";

export type SlotResolutionLayer = "run" | "user" | "org" | "system";

/** Highest precedence first — the order the runtime consults layers. */
export const SLOT_RESOLUTION_LAYERS: readonly SlotResolutionLayer[] = [
  "run",
  "user",
  "org",
  "system",
];

const DEFAULT_LABELS: Record<SlotResolutionLayer, string> = {
  run: "Run scope",
  user: "Your override",
  org: "Org override",
  system: "System default",
};

export function SlotResolutionRibbon({
  provenance,
  labels,
  className,
}: {
  /** The layer that decides the agent for this viewer. Omit for no highlight. */
  provenance?: SlotResolutionLayer;
  /** Per-surface relabels (e.g. research: `{ run: "Topic override" }`). */
  labels?: Partial<Record<SlotResolutionLayer, string>>;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border/50 bg-muted/30 px-3.5 py-2.5",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11.5px]">
        <Workflow className="h-3 w-3 text-muted-foreground/70" />
        <span className="font-medium uppercase tracking-[0.08em] text-muted-foreground/70">
          Resolution
        </span>
        {SLOT_RESOLUTION_LAYERS.map((layer, i) => {
          const active = provenance === layer;
          return (
            <span key={layer} className="inline-flex items-center gap-x-1.5">
              {i > 0 ? (
                <ArrowRight className="h-2.5 w-2.5 text-muted-foreground/50" />
              ) : null}
              <span
                className={cn(
                  "rounded-md bg-card px-1.5 py-0.5 ring-1 ring-inset",
                  i === 0 && "ml-1",
                  active
                    ? "font-semibold text-primary ring-primary/30"
                    : "text-muted-foreground ring-border/40",
                )}
              >
                {labels?.[layer] ?? DEFAULT_LABELS[layer]}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
