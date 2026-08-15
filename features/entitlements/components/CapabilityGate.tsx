// features/entitlements/components/CapabilityGate.tsx
//
// THE GATE SURFACE. What a user sees when their organization's plan does not
// include something — and the reason this feature can be gated at all without
// violating the no-dead-ends doctrine.
//
// The rule it exists to keep: **a user who hits a gate must never see a dead
// end.** Not "403". Not "not allowed". Not a disabled button with no tooltip.
// They see, in one place: what they were trying to do, what their organization
// has today, what would unlock it, and a single click that gets them there.
//
// It is also deliberately NOT a wall around setup work. Wrap the ACTION that
// the plan gates (sending, launching a campaign) — never the pages where the
// user is learning, connecting, or verifying. Gating the teaching is how a
// non-technical expert's outreach career ends on day one.

"use client";

import { useState } from "react";
import { Lock, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UpgradeModal } from "@/features/pricing/components/UpgradeModal";
import { cn } from "@/lib/utils";
import { useOrgEntitlement } from "../hooks";
import type { Capability } from "../registry";
import type { EntitlementTier } from "../types";

const TIER_LABEL: Record<EntitlementTier, string> = {
  free: "Free",
  trial: "Trial",
  premium: "Premium",
};

export interface CapabilityGateProps {
  /** The capability the wrapped action needs. */
  capability: Capability;
  /**
   * The org that owns the record being acted on — never the active-org
   * selection. `null` while it loads; the gate shows a quiet placeholder rather
   * than guessing.
   */
  organizationId: string | null | undefined;
  /** The gated action. Rendered only when the plan includes it. */
  children: React.ReactNode;
  /**
   * Render the locked state inline and compact (beside a button) instead of as
   * a full card. Use inside dense toolbars.
   */
  compact?: boolean;
  className?: string;
}

/**
 * Renders `children` when the org's plan includes `capability`; otherwise
 * renders the explanation + the one-click way to unlock it.
 *
 * FAILS OPEN while loading and on a resolver error — a hiccup must never make a
 * paying customer stare at a paywall, and the ENFORCED refusal lives on the
 * server gate anyway. What this component protects is the user's understanding,
 * not the capability.
 */
export function CapabilityGate({
  capability,
  organizationId,
  children,
  compact = false,
  className,
}: CapabilityGateProps) {
  const entitlement = useOrgEntitlement(capability, organizationId);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  if (entitlement.isLoading) {
    return compact ? (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 text-xs text-muted-foreground",
          className,
        )}
      >
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
        Checking plan
      </span>
    ) : (
      <div className={cn("flex items-center gap-2 p-3 text-sm text-muted-foreground", className)}>
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Checking what your plan includes…
      </div>
    );
  }

  // Anything other than an explicit tier lock renders the action. A cap-hit, a
  // resolver error, an un-enforced capability — none of those are this
  // component's business, and swallowing them here would hide a real state.
  if (entitlement.allowed || entitlement.reason !== "tier_locked") {
    return <>{children}</>;
  }

  const required = entitlement.requiredTier ?? entitlement.definition.minTier;
  const requiredLabel = TIER_LABEL[required] ?? "a paid";
  const heldLabel = TIER_LABEL[entitlement.tier] ?? "Free";

  const upgrade = (
    <UpgradeModal
      open={upgradeOpen}
      onOpenChange={setUpgradeOpen}
      reason={entitlement.definition.upgradeMessage}
      onSelect={() => setUpgradeOpen(false)}
    />
  );

  if (compact) {
    return (
      <>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={className}
          onClick={() => setUpgradeOpen(true)}
        >
          <Lock className="h-3.5 w-3.5" aria-hidden />
          {entitlement.definition.label} needs {requiredLabel}
        </Button>
        {upgrade}
      </>
    );
  }

  return (
    <>
      <div
        className={cn(
          "rounded-lg border border-border bg-card p-4",
          className,
        )}
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
            <Lock className="h-4 w-4 text-muted-foreground" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">
              {entitlement.definition.label} isn&apos;t part of your{" "}
              {heldLabel} plan
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {entitlement.definition.upgradeMessage}
            </p>
            {/* Never a bare "upgrade": say which tier, so the choice is real. */}
            <p className="mt-2 text-xs text-muted-foreground">
              This organization is on {heldLabel}. {requiredLabel} unlocks it.
            </p>
            <Button
              type="button"
              size="sm"
              className="mt-3"
              onClick={() => setUpgradeOpen(true)}
            >
              See {requiredLabel} plans
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </div>
        </div>
      </div>
      {upgrade}
    </>
  );
}
