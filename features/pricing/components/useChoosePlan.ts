"use client";

// features/pricing/components/useChoosePlan.ts
//
// The one handler for "this person picked a plan", shared by the pricing grid
// and every upgrade dialog. It carries out planAction(): navigate to sign-up or
// contact, or announce the tracked plan-checkout promise (no checkout exists).

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsAuthenticated } from "@/lib/redux/selectors/userSelectors";
import { useLoginHref } from "@/hooks/auth/useLoginHref";
import { planAction } from "@/features/entitlements/catalog/planAction";
import type { BillingCycle, CatalogPlan } from "@/features/entitlements/catalog/types";
import { fetchWithOrganization } from "@/lib/organizations/fetchWithOrganization";
import { withAuthDestination } from "@/utils/auth/auth-destination";
import { toast } from "@/lib/toast";

export function useChoosePlan(): {
  signedIn: boolean;
  isPending: boolean;
  choose: (plan: CatalogPlan, cycle?: BillingCycle) => void;
} {
  const router = useRouter();
  const signedIn = useAppSelector(selectIsAuthenticated);
  const [isPending, startTransition] = useTransition();
  // Sign-up keeps the visitor's place (they come back to the plan they chose).
  const signUpHref = useLoginHref("/sign-up");

  const choose = (plan: CatalogPlan, cycle: BillingCycle = "monthly") => {
    if (isPending) return;
    const action = planAction(plan, signedIn);
    if (action.kind === "checkout") {
      const returnTo = `/pricing?plan=${encodeURIComponent(plan.planKey)}&cycle=${cycle}`;
      if (!signedIn) {
        router.push(withAuthDestination("/sign-up", returnTo));
        return;
      }
      startTransition(async () => {
        try {
          const response = await fetchWithOrganization("/api/stripe/checkout", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ planKey: plan.planKey, cycle }),
          });
          if (response.status === 401) {
            router.push(withAuthDestination("/login", returnTo));
            return;
          }
          const result: unknown = await response.json();
          if (!response.ok || !result || typeof result !== "object" || !("url" in result) || typeof result.url !== "string") {
            const message = result && typeof result === "object" && "error" in result && typeof result.error === "string" ? result.error : "Couldn't start checkout. Please try again.";
            throw new Error(message);
          }
          window.location.assign(result.url);
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Couldn't start checkout. Please try again.");
        }
      });
      return;
    }
    if (action.kind === "signup" || action.kind === "contact") {
      const href = action.kind === "signup" ? signUpHref : action.href;
      startTransition(() => router.push(href));
    }
  };

  return { signedIn, isPending, choose };
}
