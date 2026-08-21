"use client";

/**
 * Keyword Value Workbench — variant A (ui-bakeoff seat A, 2026-08-21).
 * PLACEHOLDER: the bake-off agent for seat A replaces this file entirely.
 * Functional contract + data layer: features/marketing/seo/value-system/
 * (data.ts, types.ts) and the SoR doc referenced there.
 */

import { CircleDollarSign } from "lucide-react";

export function ValueWorkbenchA() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-2 text-muted-foreground">
        <CircleDollarSign className="h-8 w-8" />
        <p className="text-sm">Value workbench variant A is being built by its bake-off agent.</p>
      </div>
    </div>
  );
}
