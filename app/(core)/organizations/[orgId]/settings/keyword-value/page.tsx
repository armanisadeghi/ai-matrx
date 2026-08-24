"use client";

/**
 * Organization keyword-value settings — what every brand and site in this
 * organization uses unless it overrides them. Second rung of the ladder
 * (KI-046): platform → organization → brand → site.
 */

import { useParams } from "next/navigation";
import { AutonomyModesEditor } from "@/features/marketing/seo/value-system/settings/AutonomyModesEditor";
import { ValueSettingsEditor } from "@/features/marketing/seo/value-system/settings/ValueSettingsEditor";

export default function OrgValueSettingsPage() {
  const params = useParams();
  const orgId = typeof params.orgId === "string" ? params.orgId : null;
  if (!orgId) return null;
  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mx-auto max-w-4xl space-y-4">
        <ValueSettingsEditor scope="org" id={orgId} />
        <AutonomyModesEditor scope="org" id={orgId} />
      </div>
    </div>
  );
}
