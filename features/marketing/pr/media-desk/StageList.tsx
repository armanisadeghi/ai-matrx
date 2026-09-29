"use client";

/**
 * The live milestone list every media-desk run shows while it works — the
 * last line spins, earlier ones are ticked. A run of minutes never sits behind
 * a silent spinner.
 */

import { Check, Loader2 } from "lucide-react";

import type { Stage } from "./api";

export function StageList({ stages, running }: { stages: readonly Stage[]; running: boolean }) {
  if (stages.length === 0 && !running) return null;
  return (
    <ol className="space-y-1 text-xs" data-testid="media-desk-stages" aria-live="polite">
      {stages.map((stage, index) => {
        const live = running && index === stages.length - 1;
        return (
          <li key={`${stage.kind}-${index}`} className="flex items-start gap-2">
            {live ? (
              <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-primary" aria-hidden />
            ) : (
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" aria-hidden />
            )}
            <span className={live ? "text-foreground" : "text-muted-foreground"}>{stage.label}</span>
          </li>
        );
      })}
      {running && stages.length === 0 ? (
        <li className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" aria-hidden /> Starting…
        </li>
      ) : null}
    </ol>
  );
}
