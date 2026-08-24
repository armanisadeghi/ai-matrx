"use client";

/**
 * Platform keyword-value settings — the numbers every site starts from before
 * an organization, brand or site overrides them (KI-046). Top of the ladder:
 * platform → organization → brand → site.
 */

import { AutonomyModesEditor } from "@/features/marketing/seo/value-system/settings/AutonomyModesEditor";
import { ValueSettingsEditor } from "@/features/marketing/seo/value-system/settings/ValueSettingsEditor";

export default function SeoValueSettingsPage() {
  return (
    <div className="h-[calc(100dvh-2.5rem)] overflow-y-auto p-4">
      <div className="mx-auto max-w-4xl space-y-4">
        <ValueSettingsEditor scope="platform" id={null} />
        <AutonomyModesEditor scope="platform" id={null} />
      </div>
    </div>
  );
}
