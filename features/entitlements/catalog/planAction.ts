// features/entitlements/catalog/planAction.ts
//
// What choosing a plan DOES, decided once for every surface. Plans have no
// Stripe prices and no checkout yet, so a paid plan never pretends to start
// one: it announces the tracked Coming Soon promise. A custom-priced plan goes
// to the contact page; the free plan goes to sign-up (signed out) or nowhere
// (a signed-in person already has it).

import { announceComingSoon } from "@/lib/coming-soon/announce";
import type { CatalogPlan } from "./types";

export const PLAN_CHECKOUT_COMING_SOON = "billing.plan-checkout";

export type PlanAction =
  | { kind: "signup"; label: string; href: string }
  | { kind: "contact"; label: string; href: string }
  | { kind: "included"; label: string }
  | { kind: "checkout-pending"; label: string };

export function planAction(plan: CatalogPlan, signedIn: boolean): PlanAction {
  if (plan.monthlyCents == null) return { kind: "contact", label: "Talk to sales", href: "/contact" };
  if (plan.monthlyCents === 0) {
    return signedIn
      ? { kind: "included", label: "Included with your account" }
      : { kind: "signup", label: "Start free", href: "/sign-up" };
  }
  return { kind: "checkout-pending", label: `Choose ${plan.name}` };
}

/** Run the honest half of a plan choice that has no destination yet. */
export function announcePlanCheckout(): void {
  void announceComingSoon(PLAN_CHECKOUT_COMING_SOON);
}
