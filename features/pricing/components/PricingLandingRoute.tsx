"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { PricingLanding } from "./PricingLanding";
import { type Plan } from "@/features/pricing/data";

/**
 * Client entry point for the public /pricing route.
 *
 * page.tsx is a Server Component, so the interactive <PricingLanding/> (billing
 * toggle, category tabs, plan selection) is isolated here. Selecting a plan
 * routes the visitor into the appropriate acquisition flow:
 *   - Enterprise / custom  → /contact (talk to sales)
 *   - Everything else       → /sign-up (start the account, trial begins there)
 *
 * TODO(P8): once billing.product/price are seeded and Stripe checkout lands,
 * route paid selections straight into checkout with the chosen price id instead
 * of the generic /sign-up funnel.
 */
export function PricingLandingRoute() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleSelect = (plan: Plan) => {
    if (isPending) return;
    const isEnterprise =
      plan.id === "enterprise" || plan.category === "enterprise";
    const target = isEnterprise ? "/contact" : "/sign-up";
    startTransition(() => {
      router.push(target);
    });
  };

  return <PricingLanding onSelect={handleSelect} />;
}
