// features/entitlements/components/CapabilityPaywallDialog.tsx
//
// The contextual cap-hit paywall — tone: helpful, never hostage (TRUST mandate).
// Maps an entitlement verdict onto the existing UsageLimitDialog, whose plan
// offers come from billing.plan_catalog() and whose upgrade action is the
// tracked plan-checkout promise (no checkout exists yet). Shown ONLY
// when a metered action was blocked; it tells the user exactly what reset and
// when, and offers the upgrade — it never interrupts work already in progress.

"use client";

import { UsageLimitDialog } from "@/features/pricing/components/UsageLimitDialog";
import { usePlanCatalog } from "../catalog/usePlanCatalog";
import { defaultPlan } from "../catalog/format";
import { getCapability, type Capability } from "../registry";
import type { EntitlementResult } from "../types";

export function CapabilityPaywallDialog({
  open,
  onOpenChange,
  capability,
  verdict,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  capability: Capability;
  verdict: EntitlementResult;
}) {
  const def = getCapability(capability);
  const binding = verdict.windows.find((w) => w.period === verdict.period);
  // The verdict carries a tier, not a plan. A free-tier person is on the
  // catalog's default plan; for any other tier the plan is not known here, so
  // the dialog names none rather than guessing.
  const catalog = usePlanCatalog();
  const currentPlan =
    verdict.tier === "free" && catalog.status === "ready"
      ? defaultPlan(catalog.plans)?.name
      : undefined;

  return (
    <UsageLimitDialog
      open={open}
      onOpenChange={onOpenChange}
      meter={def.label}
      used={verdict.used}
      limit={verdict.limit ?? binding?.limit ?? 0}
      resetsAt={binding?.resetsAt ?? undefined}
      currentPlan={currentPlan}
    />
  );
}
