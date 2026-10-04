// features/entitlements/catalog/planAction.ts
//
// One action contract shared by pricing and every upgrade dialog.
import type { CatalogPlan } from "./types";

export type PlanAction =
  | { kind: "signup"; label: string; href: string }
  | { kind: "contact"; label: string; href: string }
  | { kind: "included"; label: string }
  | { kind: "checkout"; label: string };

export function planAction(plan: CatalogPlan, signedIn: boolean): PlanAction {
  if (plan.monthlyCents == null) return { kind: "contact", label: "Talk to sales", href: "/contact" };
  if (plan.monthlyCents === 0) {
    return signedIn
      ? { kind: "included", label: "Included with your account" }
      : { kind: "signup", label: "Start free", href: "/sign-up" };
  }
  return { kind: "checkout", label: `Choose ${plan.name}` };
}
