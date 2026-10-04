# Pricing surfaces

The public `/pricing` page and every plan / upgrade UI (plan grid, plan card,
usage-limit dialog, upgrade modal, industry upgrade, upgrade nudges).

## Rules

- **Enterprise is never presented as Unlimited.** It has no catalog limits; its numbers are entered per organization in admin.
- **No plan name, price, discount, trial length, points amount or limit is
  written here.** Every plan figure comes from `billing.plan_catalog()` through
  `features/entitlements/catalog/` (reader, formatters, plan action) — see
  `features/entitlements/FEATURE.md` § Plans. Components take `CatalogPlan`.
- **Choosing a plan goes through `useChoosePlan()`** (`components/useChoosePlan.ts`),
  which runs `planAction()`: sign-up, contact, or the tracked Coming Soon
  `billing.plan-checkout`. A component's `onSelect` override exists for the
  `(dev)/demos/upgrade` gallery only.
- **No trial is promised.** No plan has a trial; copy that claims one is a defect.
- **Plan names are never typed in components.** Education cards, the capability gate and nudges
  say plan names from the catalog (`tierPlanName`, `defaultPlan`); a tier word appears only while
  the catalog is unavailable. Prices and listing are edited at `/administration/billing/plans`.
- **`/pricing` layout:** header → `PricingGrid` seeded by the server read
  (`readPlanCatalogServer`) → education plans (`education/`, their own DB read of
  `billing.capability_limit` + `billing.product/price`) → the pledge strip.
- The grid groups Personal (free + personal audiences) and Business (company +
  enterprise); the guest plan (`listed_on_pricing = false`) is never shown.
- **At most four cards per group.** A group with more listed plans turns its
  fourth card into a ladder: the card title is a switch over that plan and every
  higher one (Personal: Plus · Max · Max Plus). The group switch and the billing
  cycle share ONE control row (group left, cycle right).

## Change Log

- **2026-10-04** — Four-card grid with a laddered fourth card; group and cycle
  switches in one row (`PillSwitch`); Max Plus listed. Education cards, the capability gate and
  the sidebar promo read plan names from the catalog; plans are edited in admin.
- **2026-10-03** — Created. Plan surfaces moved off the hardcoded `data.ts` onto
  `billing.plan_catalog()`.
