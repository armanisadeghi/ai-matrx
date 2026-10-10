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

import { Building2, Gauge, UserRound } from "lucide-react";
import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SettingsCallout } from "@/components/official/settings/layout/SettingsCallout";
import { SettingsSubHeader } from "@/components/official/settings/layout/SettingsSubHeader";
import { PlanUsagePanel } from "@/features/entitlements/components/PlanUsagePanel";
import { SpendBudgetCard } from "@/features/entitlements/guardrails/SpendBudgetCard";
import { MyUsageCard } from "@/features/entitlements/usage-gate/MyUsageCard";
import { RedeemCodeField } from "@/features/entitlements/coupons/RedeemCodeField";
import { BillingSummary } from "@/features/entitlements/components/BillingSummary";
import { UsageHistory } from "@/features/entitlements/usage-history/UsageHistory";
import { useUserOrganizations } from "@/features/organizations/hooks";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";

export function PlanUsageTab() {
  const userId = useAppSelector(selectUserId);
  const { organizations, loading: organizationsLoading } = useUserOrganizations();
  const [billingOrganizationId, setBillingOrganizationId] = useState<string | null>(null);
  const organizationId = billingOrganizationId;

  return (
    <div className="matrx-touch-targets space-y-3">
      <SettingsSubHeader
        title="Plan & usage"
        icon={Gauge}
      />
      {userId ? <BillingSummary scope={{ kind: "personal", userId }} /> : null}
      <SettingsSubHeader title="Effective usage" icon={UserRound} />
      <MyUsageCard />
      <UsageHistory />
      {/* Free-time coupons for this account (rule 18): POST /api/billing/coupons/redeem. */}
      <RedeemCodeField />
      <SettingsSubHeader
        title="Organization"
        icon={Building2}
      />
      <div className="rounded-md border border-border bg-card p-4">
        <label className="text-sm font-medium text-foreground" htmlFor="billing-organization">
          Organization billing account
        </label>
        <Select
          value={billingOrganizationId ?? undefined}
          onValueChange={setBillingOrganizationId}
          disabled={organizationsLoading}
        >
          <SelectTrigger id="billing-organization" width="xl" className="mt-2">
            <SelectValue placeholder={organizationsLoading ? "Loading organizations…" : "Choose an organization"} />
          </SelectTrigger>
          <SelectContent>
            {organizations.map((organization) => (
              <SelectItem key={organization.id} value={organization.id}>{organization.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {billingOrganizationId ? <BillingSummary scope={{ kind: "organization", organizationId: billingOrganizationId }} /> : null}
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
