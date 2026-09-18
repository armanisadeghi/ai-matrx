// features/settings/tabs/PlanUsageTab.tsx
//
// Settings → Plan & usage. The home of "where am I at right now".
//
// Scoped to the EXPLICIT active organization, never a personal-workspace
// stand-in: a plan belongs to an account, and showing one account's plan while
// the person believes they are looking at another is the whole defect. With no
// organization selected both cards say "Pick an organization" and offer the
// picker. Switching orgs here changes which account you're LOOKING at; it does
// not change anyone's access.

"use client";

import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { Gauge } from "lucide-react";
import { SettingsCallout } from "@/components/official/settings/layout/SettingsCallout";
import { SettingsSubHeader } from "@/components/official/settings/layout/SettingsSubHeader";
import { PlanUsagePanel } from "@/features/entitlements/components/PlanUsagePanel";
import { SpendBudgetCard } from "@/features/entitlements/guardrails/SpendBudgetCard";

export function PlanUsageTab() {
  const organizationId = useAppSelector(selectOrganizationId);

  return (
    <div className="space-y-3">
      <SettingsSubHeader
        title="Plan & usage"
        description="What your plan includes and how much you have used."
        icon={Gauge}
      />
      <SettingsCallout tone="info">
        Limits marked Planning only help you plan ahead. They do not stop work.
      </SettingsCallout>
      {/* The person's own AI budget — entitlement, the organization's
          ceiling, and the lower one they choose for themselves. */}
      <SpendBudgetCard organizationId={organizationId} mode="user" canEdit />
      <PlanUsagePanel organizationId={organizationId} />
    </div>
  );
}

export default PlanUsageTab;
