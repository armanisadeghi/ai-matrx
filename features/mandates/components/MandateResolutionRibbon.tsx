"use client";

/**
 * MandateResolutionRibbon — the canonical, truthful agent-mandate precedence chain:
 * run-scope → your override → org override → platform-wide override → system
 * default. Highest precedence renders first. Pass `provenance` to highlight the
 * layer that actually decides the agent for the current viewer; omit it for a
 * pure precedence reference (no highlight). Surfaces with their own name for a
 * layer (research calls run-scope "Topic override") relabel via `labels`.
 *
 * 🚨 THIS COMPONENT MUST CARRY EVERY RUNG THE RUNTIME CAN NAME. It shipped with
 * four while the runtime stamps five: `global` — the GLOBAL BINDING rung, a row
 * somebody edits at runtime — was missing, so a `global` verdict highlighted
 * NOTHING and the reader was shown a chain that did not contain the answer they
 * had just been given. `global` and `system` are deliberately distinct
 * (V3-CORRECTNESS N1: collapsing them let a stale global binding pass for a
 * built-in default for a whole verification round), so the fix is a fifth link,
 * never a relabel of `system`. The rung vocabulary is frozen —
 * `ResolvedMandate["provenance"]` in `features/mandates/service.ts` and
 * `mandate.resolve`'s `rung` column are the same five words; when one gains a
 * rung, so does this.
 *
 * Shape absorbed from research's per-topic agents page; content is the ONE
 * platform precedence chain (SoR common-docs/systems/mandates/FEATURE.md,
 * ruling common-docs/projects/workflow-mandate-program/DESIGN-one-resolution.md)
 * — never restate the chain in prose beside this component.
 */

import { ArrowRight, Workflow } from "lucide-react";
import { cn } from "@/lib/utils";

export type MandateResolutionLayer =
  | "run"
  | "user"
  | "org"
  | "global"
  | "system";

/** Highest precedence first — the order the runtime consults layers. */
export const MANDATE_RESOLUTION_LAYERS: readonly MandateResolutionLayer[] = [
  "run",
  "user",
  "org",
  "global",
  "system",
];

const DEFAULT_LABELS: Record<MandateResolutionLayer, string> = {
  run: "Run scope",
  user: "Your override",
  org: "Org override",
  global: "Platform-wide override",
  system: "System default",
};

export function MandateResolutionRibbon({
  provenance,
  labels,
  className,
}: {
  /** The layer that decides the agent for this viewer. Omit for no highlight. */
  provenance?: MandateResolutionLayer;
  /** Per-surface relabels (e.g. research: `{ run: "Topic override" }`). */
  labels?: Partial<Record<MandateResolutionLayer, string>>;
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
        {MANDATE_RESOLUTION_LAYERS.map((layer, i) => {
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
