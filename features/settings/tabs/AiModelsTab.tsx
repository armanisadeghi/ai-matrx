"use client";

import { Suspense } from "react";
import { Cpu, Loader2 } from "lucide-react";
import { SettingsSubHeader } from "@/components/official/settings/layout/SettingsSubHeader";
import AiModelsPreferences from "@/components/user-preferences/AiModelsPreferences";

export default function AiModelsTab() {
  return (
    <>
      <SettingsSubHeader
        title="AI Models"
        description="Choose which models are available in pickers."
        icon={Cpu}
      />
      <div className="pb-6">
        <div className="overflow-hidden rounded-md border border-border/40 bg-card/30">
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            }
          >
            <AiModelsPreferences />
          </Suspense>
        </div>
      </div>
    </>
  );
}
