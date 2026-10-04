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
import { announcePlanCheckout, planAction } from "@/features/entitlements/catalog/planAction";
import type { CatalogPlan } from "@/features/entitlements/catalog/types";

export function useChoosePlan(): {
  signedIn: boolean;
  isPending: boolean;
  choose: (plan: CatalogPlan) => void;
} {
  const router = useRouter();
  const signedIn = useAppSelector(selectIsAuthenticated);
  const [isPending, startTransition] = useTransition();

  const choose = (plan: CatalogPlan) => {
    if (isPending) return;
    const action = planAction(plan, signedIn);
    if (action.kind === "checkout-pending") {
      announcePlanCheckout();
      return;
    }
    if (action.kind === "signup" || action.kind === "contact") {
      startTransition(() => router.push(action.href));
    }
  };

  return { signedIn, isPending, choose };
}
