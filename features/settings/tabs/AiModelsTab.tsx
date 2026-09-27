"use client";

import { Cpu } from "lucide-react";
import { SettingsSubHeader } from "@/components/official/settings/layout/SettingsSubHeader";
import AiModelsPreferences from "@/components/user-preferences/AiModelsPreferences";

// One heading, then the list — no bordered card around the whole screen
// (page-pass 2026-09-27: it was a box holding a box).
export default function AiModelsTab() {
  return (
    <>
      <SettingsSubHeader
        title="Models"
        description="Switch a model off to leave it out of your model pickers. Only current models are listed; retired models never appear in pickers."
        icon={Cpu}
      />
      <AiModelsPreferences />
    </>
  );
}
