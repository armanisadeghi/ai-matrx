// features/entitlements/components/CapabilityPaywallDialog.tsx
//
// The contextual cap-hit paywall — tone: helpful, never hostage (TRUST mandate).
// Maps an entitlement verdict onto the existing UsageLimitDialog. Shown ONLY
// when a metered action was blocked; it tells the user exactly what reset and
// when, and offers the upgrade — it never interrupts work already in progress.

"use client";

import { useRouter } from "next/navigation";
import { UsageLimitDialog } from "@/features/pricing/components/UsageLimitDialog";
import type { Plan } from "@/features/pricing/data";
import { getCapability, type Capability } from "../registry";
import type { EntitlementResult } from "../types";

const TIER_LABEL: Record<string, string> = {
  free: "Free",
  trial: "Free trial",
  premium: "Premium",
};

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
  const router = useRouter();
  const def = getCapability(capability);
  const binding = verdict.windows.find((w) => w.period === verdict.period);

  const onSelect = (_plan: Plan) => {
    onOpenChange(false);
    router.push("/pricing");
  };

  return (
    <UsageLimitDialog
      open={open}
      onOpenChange={onOpenChange}
      meter={def.label}
      used={verdict.used}
      limit={verdict.limit ?? binding?.limit ?? 0}
      resetsAt={binding?.resetsAt ?? undefined}
      currentPlan={TIER_LABEL[verdict.tier] ?? "Free"}
      onSelect={onSelect}
    />
  );
}
