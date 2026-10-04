# Pricing surfaces

The public `/pricing` page and every plan / upgrade UI (plan grid, plan card,
usage-limit dialog, upgrade modal, industry upgrade, upgrade nudges).

## Rules

- **No plan name, price, discount, trial length, points amount or limit is
  written here.** Every plan figure comes from `billing.plan_catalog()` through
  `features/entitlements/catalog/` (reader, formatters, plan action) — see
  `features/entitlements/FEATURE.md` § Plans. Components take `CatalogPlan`.
- **Choosing a plan goes through `useChoosePlan()`** (`components/useChoosePlan.ts`),
  which runs `planAction()`: sign-up, contact, or the tracked Coming Soon
  `billing.plan-checkout`. A component's `onSelect` override exists for the
  `(dev)/demos/upgrade` gallery only.
- **No trial is promised.** No plan has a trial or a Stripe price yet; copy that
  claims one is a defect.
- **`/pricing` layout:** header → `PricingGrid` seeded by the server read
  (`readPlanCatalogServer`) → education plans (`education/`, their own DB read of
  `billing.capability_limit` + `billing.product/price`) → the pledge strip.
- The grid groups Personal (free + personal audiences) and Business (company +
  enterprise); the guest plan (`listed_on_pricing = false`) is never shown.

## Change Log

- **2026-10-03** — Created. Plan surfaces moved off the hardcoded `data.ts` onto
  `billing.plan_catalog()`.
