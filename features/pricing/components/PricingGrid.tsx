"use client";

// features/pricing/components/PricingGrid.tsx
//
// THE plan ladder: every listed plan from billing.plan_catalog(), grouped
// Personal (Free + personal plans) and Business (company + Enterprise). Used
// by the public /pricing page (seeded with the server read) and the demos.
// The guest plan is never listed (listed_on_pricing = false).

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { BillingToggle } from "./BillingToggle";
import { PlanCard } from "./PlanCard";
import { useChoosePlan } from "./useChoosePlan";
import { usePlanCatalog } from "@/features/entitlements/catalog/usePlanCatalog";
import {
  maxAnnualSavingsPercent,
  pricingGroups,
  type PricingGroupId,
} from "@/features/entitlements/catalog/format";
import type { BillingCycle, CatalogPlan } from "@/features/entitlements/catalog/types";
import { Spinner } from "@/components/ui/spinner";

interface PricingGridProps {
  /** A server read of the catalog — renders with no client fetch. */
  initialPlans?: CatalogPlan[];
  initialCycle?: BillingCycle;
  initialGroup?: PricingGroupId;
  /** Override what choosing a plan does (demos). Defaults to useChoosePlan. */
  onSelect?: (plan: CatalogPlan) => void;
  showHeader?: boolean;
  className?: string;
}

export function PricingGrid({
  initialPlans,
  initialCycle = "annual",
  initialGroup = "personal",
  onSelect,
  showHeader = true,
  className,
}: PricingGridProps) {
  const catalog = usePlanCatalog(initialPlans);
  const { signedIn, choose } = useChoosePlan();
  const [cycle, setCycle] = useState<BillingCycle>(initialCycle);
  const [groupId, setGroupId] = useState<PricingGroupId>(initialGroup);

  if (catalog.status === "error") {
    return (
      <div className={cn("flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground", className)}>
        <AlertTriangle className="h-4 w-4 text-destructive" />
        Plans could not be loaded. Refresh to try again.
      </div>
    );
  }
  if (catalog.status !== "ready") {
    return (
      <div className={cn("flex items-center justify-center py-12", className)}>
        <Spinner />
      </div>
    );
  }

  const groups = pricingGroups(catalog.plans);
  const group = groups.find((g) => g.id === groupId) ?? groups[0];
  const savings = maxAnnualSavingsPercent(catalog.plans.filter((p) => p.listedOnPricing));
  const visiblePlans = group?.plans ?? [];
  const handleSelect = onSelect ?? choose;

  return (
    <div className={cn("flex flex-col gap-8", className)}>
      {showHeader && (
        <div className="mx-auto flex flex-col items-center gap-4">
          <BillingToggle value={cycle} onChange={setCycle} savingsPercent={savings} />
          {groups.length > 1 && (
            <div className="inline-flex flex-wrap justify-center gap-1 rounded-full border border-border/60 bg-card/40 p-1 text-sm">
              {groups.map((g) => {
                const active = g.id === group?.id;
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setGroupId(g.id)}
                    className={cn(
                      "rounded-full px-4 py-1.5 font-medium transition-colors",
                      active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {g.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div
        className={cn(
          "grid gap-4",
          visiblePlans.length === 1 && "mx-auto max-w-md",
          visiblePlans.length === 2 && "mx-auto max-w-3xl sm:grid-cols-2",
          visiblePlans.length === 3 && "mx-auto max-w-5xl sm:grid-cols-2 lg:grid-cols-3",
          visiblePlans.length === 4 && "sm:grid-cols-2 lg:grid-cols-4",
          visiblePlans.length >= 5 && "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5",
        )}
      >
        {visiblePlans.map((plan) => (
          <PlanCard key={plan.planKey} plan={plan} cycle={cycle} signedIn={signedIn} onSelect={handleSelect} />
        ))}
      </div>
    </div>
  );
}
