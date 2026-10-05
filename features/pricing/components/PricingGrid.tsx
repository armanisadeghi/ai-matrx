"use client";

// features/pricing/components/PricingGrid.tsx
//
// THE plan ladder: every listed plan from billing.plan_catalog(), grouped
// Personal (Free + personal plans) and Business (company + Enterprise), at
// most four cards per group — the fourth card steps up through every higher
// plan (Plus → Max → Max Plus) with a switch in its title. Used
// by the public /pricing page (seeded with the server read) and the demos.
// The guest plan is never listed (listed_on_pricing = false).

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { BillingToggle, PillSwitch } from "./BillingToggle";
import { PlanCard } from "./PlanCard";
import { useChoosePlan } from "./useChoosePlan";
import { usePlanCatalog } from "@/features/entitlements/catalog/usePlanCatalog";
import {
  maxAnnualSavingsPercent,
  pricingGroups,
  type PricingGroupId,
} from "@/features/entitlements/catalog/format";
import type {
  BillingCycle,
  CatalogPlan,
} from "@/features/entitlements/catalog/types";
import { Spinner } from "@/components/ui/spinner";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { CheckoutFeedback } from "./CheckoutFeedback";
import { planSlots, pricingSelectionFromSearch } from "./pricingSelection";

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
  initialCycle = "monthly",
  initialGroup = "personal",
  onSelect,
  showHeader = true,
  className,
}: PricingGridProps) {
  const catalog = usePlanCatalog(initialPlans);
  const searchParams = useSearchParams();

  if (catalog.status === "error") {
    return (
      <div
        className={cn(
          "flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground",
          className,
        )}
      >
        <AlertTriangle className="h-4 w-4 text-destructive" />
        Plans could not be loaded. Refresh to try again.
        <ErrorAlchemyMenu />
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

  const selection = pricingSelectionFromSearch(catalog.plans, searchParams, {
    cycle: initialCycle,
    groupId: initialGroup,
  });
  return (
    <PricingGridReady
      key={searchParams.toString()}
      plans={catalog.plans}
      selection={selection}
      onSelect={onSelect}
      showHeader={showHeader}
      className={className}
    />
  );
}

interface PricingGridReadyProps {
  plans: CatalogPlan[];
  selection: ReturnType<typeof pricingSelectionFromSearch>;
  onSelect?: (plan: CatalogPlan) => void;
  showHeader: boolean;
  className?: string;
}

function PricingGridReady({
  plans,
  selection,
  onSelect,
  showHeader,
  className,
}: PricingGridReadyProps) {
  const { signedIn, choose, isPending } = useChoosePlan();
  const [cycle, setCycle] = useState<BillingCycle>(selection.cycle);
  const [groupId, setGroupId] = useState<PricingGroupId>(selection.groupId);
  /** Per laddered slot (keyed by its first plan): the plan the switch is on. */
  const [ladderPick, setLadderPick] = useState<Record<string, string>>(
    selection.ladderPick,
  );

  const groups = pricingGroups(plans);
  const group = groups.find((g) => g.id === groupId) ?? groups[0];
  const savings = maxAnnualSavingsPercent(
    plans.filter((p) => p.listedOnPricing),
  );
  const handleSelect = onSelect ?? choose;
  const slots = planSlots(group?.plans ?? []);

  return (
    <div className={cn("flex flex-col gap-6", className)}>
      <CheckoutFeedback />
      {showHeader && (
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
          {groups.length > 1 ? (
            <PillSwitch
              value={group?.id ?? groupId}
              onChange={setGroupId}
              options={groups.map((g) => ({ value: g.id, label: g.label }))}
              aria-label="Plan type"
            />
          ) : (
            <span />
          )}
          <BillingToggle
            value={cycle}
            onChange={setCycle}
            savingsPercent={savings}
          />
        </div>
      )}

      <div
        className={cn(
          "grid gap-4",
          slots.length === 1 && "mx-auto w-full max-w-md",
          slots.length === 2 && "mx-auto w-full max-w-3xl sm:grid-cols-2",
          slots.length === 3 &&
            "mx-auto w-full max-w-5xl sm:grid-cols-2 lg:grid-cols-3",
          slots.length >= 4 && "sm:grid-cols-2 lg:grid-cols-4",
        )}
      >
        {slots.map((slot) => {
          const chosenKey = ladderPick[slot[0].planKey];
          const plan = slot.find((p) => p.planKey === chosenKey) ?? slot[0];
          return (
            <PlanCard
              key={slot[0].planKey}
              plan={plan}
              cycle={cycle}
              signedIn={signedIn}
              pending={isPending}
              onSelect={handleSelect}
              titleSlot={
                slot.length > 1 ? (
                  <PillSwitch
                    value={plan.planKey}
                    onChange={(key) =>
                      setLadderPick((prev) => ({
                        ...prev,
                        [slot[0].planKey]: key,
                      }))
                    }
                    options={slot.map((p) => ({
                      value: p.planKey,
                      label: p.name,
                    }))}
                    aria-label={`${slot[0].name} level`}
                    size="sm"
                    equal={false}
                    className="w-full"
                  />
                ) : undefined
              }
            />
          );
        })}
      </div>
    </div>
  );
}
