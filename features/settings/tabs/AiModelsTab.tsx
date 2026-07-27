"use client";

import { lazy, Suspense } from "react";
import { Cpu, Loader2 } from "lucide-react";
import { SettingsSubHeader } from "@/components/official/settings/layout/SettingsSubHeader";
import { SettingsCallout } from "@/components/official/settings/layout/SettingsCallout";

/**
 * AI Models tab.
 *
 * The existing AiModelsPreferences is a bespoke dashboard UI (list + search +
 * filter chips + per-model toggles) rather than a form. Rebuilding it with
 * generic primitives would force a list primitive that doesn't yet exist.
 *
 * For Phase 6 we host the legacy component inside the new shell so users get
 * the full UI today. Phase 7 polish will decide whether to:
 *   (a) extract a shared SettingsModelList primitive and rebuild, or
 *   (b) formally bless this tab as a "custom" tab type in the registry.
 */
const LegacyAiModelsPreferences = lazy(
  () => import("@/components/user-preferences/AiModelsPreferences"),
);

export default function AiModelsTab() {
  return (
    <>
      <SettingsSubHeader
        title="AI Models"
        description="Choose which models are available in pickers."
        icon={Cpu}
      />
      <SettingsCallout tone="info">
        This tab still uses the legacy dashboard UI. It writes to the same Redux
        slice as every other tab and is slated for a primitive-based rewrite in
        a later phase.
      </SettingsCallout>
      <div className="px-4 pb-6">
        <div className="rounded-lg border border-border/40 bg-card/30 overflow-hidden">
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            }
          >
            <LegacyAiModelsPreferences />
          </Suspense>
        </div>
      </div>
    </>
  );
}
