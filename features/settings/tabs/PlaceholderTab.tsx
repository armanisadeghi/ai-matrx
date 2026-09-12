"use client";

import { PartyPopper } from "lucide-react";
import { SettingsCallout } from "@/components/official/settings/layout/SettingsCallout";
import { SettingsSubHeader } from "@/components/official/settings/layout/SettingsSubHeader";

export default function PlaceholderTab() {
  return (
    <>
      <SettingsSubHeader
        title="No settings here yet"
        description="This category has no controls available yet."
        icon={PartyPopper}
      />
      <SettingsCallout tone="info">
        Settings for this category are not available yet.
      </SettingsCallout>
    </>
  );
}
