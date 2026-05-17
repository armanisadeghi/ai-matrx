"use client";

import { TestTube } from "lucide-react";

/**
 * Column 5 — Playground (stub).
 *
 * Placeholder for the live-test surface. Will let the user execute the
 * agent against the selected binding to verify mappings end-to-end.
 * Wired in later — for now this column reserves the space and proves
 * the panel toggle works.
 */
export function PlaygroundColumn() {
  return (
    <div className="h-full flex flex-col bg-muted pt-[var(--shell-header-h)]">
      <div className="shrink-0 px-3 pt-1.5 pb-2 border-b border-border">
        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
          <TestTube className="h-3 w-3" />
          Playground
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto px-3 py-3">
        <p className="text-[11px] text-muted-foreground italic">
          Live test environment lands here — execute the agent against the
          selected binding, inspect resolved values, replay with different
          surface inputs.
        </p>
      </div>
    </div>
  );
}
