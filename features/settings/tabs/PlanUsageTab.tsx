// features/settings/tabs/PlanUsageTab.tsx
//
// Settings → Plan & usage. The home of "where am I at right now".
//
// AI points are per user first (USAGE-GATE.md), so the PRIMARY card is the
// person's own state — `billing.user_usage_state` via the usage gate's Redux
// answer — never an organization's numbers. The organization's spend budget
// and plan follow as a separate, labelled section, scoped to the EXPLICIT
// active organization (a write-side choice, never a stand-in): with none
// selected those cards say "Pick an organization" and offer the picker.

"use client";

import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { Building2, Gauge } from "lucide-react";
import { SettingsCallout } from "@/components/official/settings/layout/SettingsCallout";
import { SettingsSubHeader } from "@/components/official/settings/layout/SettingsSubHeader";
import { PlanUsagePanel } from "@/features/entitlements/components/PlanUsagePanel";
import { SpendBudgetCard } from "@/features/entitlements/guardrails/SpendBudgetCard";
import { MyUsageCard } from "@/features/entitlements/usage-gate/MyUsageCard";
import { RedeemCodeField } from "@/features/entitlements/coupons/RedeemCodeField";

export function PlanUsageTab() {
  const organizationId = useAppSelector(selectOrganizationId);

  return (
    <div className="space-y-3">
      <SettingsSubHeader
        title="Plan & usage"
        icon={Gauge}
      />
      <MyUsageCard />
      {/* Free-time coupons for this account (rule 18): POST /api/billing/coupons/redeem. */}
      <RedeemCodeField />
      <SettingsSubHeader
        title="Organization"
        icon={Building2}
      />
      <SettingsCallout tone="info">
        Limits marked Planning only help you plan ahead. They do not stop work.
      </SettingsCallout>
      {/* The organization's AI budget — its entitlement, its ceiling, and the
          lower one the person chooses for themselves inside it. */}
      <SpendBudgetCard organizationId={organizationId} mode="user" canEdit />
      <PlanUsagePanel organizationId={organizationId} />
    </div>
  );
}

export default PlanUsageTab;
