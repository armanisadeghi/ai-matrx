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
import { PlanUsagePanel } from "@/features/entitlements/components/PlanUsagePanel";

export function PlanUsageTab() {
  const organizationId = useAppSelector(selectEffectiveOrganizationId);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        What your plan includes, and how much of it you&apos;ve used. Limits
        marked as not enforced are shown so you can plan ahead — they don&apos;t
        stop you yet.
      </p>
      <PlanUsagePanel organizationId={organizationId} />
    </div>
  );
}

export default PlanUsageTab;
