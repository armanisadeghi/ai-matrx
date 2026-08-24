"use client";

/**
 * Site keyword-value settings — the last rung of the ladder (KI-046):
 * platform → organization → brand → SITE. What this one site uses, and what it
 * inherits from its brand when it says nothing.
 */

import { useParams } from "next/navigation";
import { AutonomyModesEditor } from "@/features/marketing/seo/value-system/settings/AutonomyModesEditor";
import { CopyMeaningFromSite } from "@/features/marketing/seo/value-system/settings/CopyMeaningFromSite";
import { ValueSettingsEditor } from "@/features/marketing/seo/value-system/settings/ValueSettingsEditor";

export default function SiteValueSettingsPage() {
  const params = useParams();
  const siteId = typeof params.siteId === "string" ? params.siteId : null;
  if (!siteId) return null;
  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mx-auto max-w-4xl space-y-4">
        <ValueSettingsEditor scope="site" id={siteId} />
        <AutonomyModesEditor scope="site" id={siteId} />
        <CopyMeaningFromSite siteId={siteId} />
      </div>
    </div>
  );
}
