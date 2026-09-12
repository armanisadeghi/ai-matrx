// features/settings/tabs/PlanUsageTab.tsx
//
// Settings → Plan & usage. The home of "where am I at right now".
//
// Scoped to the EFFECTIVE organization (the active one, falling back to the
// user's personal org) because a plan belongs to an account, and every user has
// a personal org — so this always resolves to a real plan rather than an empty
// state. Switching orgs here changes which account you're LOOKING at; it does
// not change anyone's access.

"use client";

import { useAppSelector } from "@/lib/redux/hooks";
import { selectEffectiveOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { Gauge } from "lucide-react";
import { SettingsCallout } from "@/components/official/settings/layout/SettingsCallout";
import { SettingsSubHeader } from "@/components/official/settings/layout/SettingsSubHeader";
import { PlanUsagePanel } from "@/features/entitlements/components/PlanUsagePanel";
import { SpendBudgetCard } from "@/features/entitlements/guardrails/SpendBudgetCard";

export function PlanUsageTab() {
  const organizationId = useAppSelector(selectEffectiveOrganizationId);

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
