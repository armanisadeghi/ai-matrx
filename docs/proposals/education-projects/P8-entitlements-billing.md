# P8 — Entitlements & Billing (monetization + conversion funnel)

> **Status date:** 2026-07-07 · **Wave 1, priority tier 2 — FOUNDATIONAL CONTRACT.**
> Publish the `useEntitlement` interface on **day 1**; every tool gates against it immediately.
> **Spec of record:**
> [`docs/proposals/ENTITLEMENTS_AND_BILLING_REQUIREMENTS.md`](../ENTITLEMENTS_AND_BILLING_REQUIREMENTS.md)
> — read it in full; this brief operationalizes it, it does not replace it.

## Objective

Build the platform's monetization layer from greenfield: DB-backed control of free-vs-paid per
capability, trials, usage metering with enforced caps, and Stripe payments — converting without
hard-walling the free experience (meter AI, not core; cap after the aha-moment; Knowt-generous
over StudyFetch-stingy). Every expensive AI action across the education hub (and eventually the
platform) gates through one resolver and one hook.

## Current state (verified 2026-07-07 — fully greenfield, confirmed)

- **No Stripe:** no `stripe`/`@stripe/*` dependency, no `app/api/stripe`, keys only in
  `.env.dead`.
- **No commercial tables:** nothing for products/prices, subscriptions, billing customers,
  entitlements, usage-credit ledger, or trial columns.
- **`features/pricing` is static UI consumed only by dev demos:** full component set (PricingGrid,
  PlanCard, BillingToggle, UpgradeModal, UsageLimitDialog, 5 nudge components) with hardcoded
  `PLANS[]`, `TRIAL_DAYS = 14`, `ANNUAL_DISCOUNT = 0.2` in `features/pricing/data.ts`. Every
  import resolves to `app/(dev)/demos/upgrade/**`. **There is no live `/pricing` route.**
- **`account_tiers` is operational, not commercial** — `user_account.tier_id` +
  `account_tiers.features` enforce compute/storage quotas (sole real consumer:
  `app/api/compute-targets/route.ts:195`). Confirmed decision: keep separate; billing
  entitlements are new (README flag 5).
- **Named seams already in place:** `features/education/types.ts` `AccessTier =
  "free"|"trial"|"premium"` + `AccessTierBadge` (both explicitly display-only) and
  `AuthedWorkspaceCTA` — your enforcement lights these up.
- **Usage raw material:** `user_usage_summary` computes cost in millicents but never charges.

## Scope

**IN**
- **DB layer:** products/prices (Stripe-mirrored), subscriptions (user AND org),
  billing-customer mapping, an entitlements/capability model, usage ledger with period windows,
  trial tracking. Canonical schema conventions (base columns, RLS deny-by-default; writes only
  via webhooks/`SECURITY DEFINER` RPCs — treat billing tables as protected resources).
- **The entitlements resolver:** one central resolver (RPC modeled on the `iam.has_access`
  philosophy — the requirements doc names this explicitly): capability × user/org × subscription
  × usage → `{allowed, remaining, tier, reason}`. Features NEVER read plan tables directly.
- **The `useEntitlement(capability)` contract (day-1 publication):** typed hook + selector + a
  **capability registry** (typed ids: `education.generate_cards`, `education.tutor_message`,
  `education.audio_generate`, `education.quiz_generate`, …). Day 1 it returns permissive values
  behind the real signature; enforcement flips capability-by-capability as the backend lands.
- **Metering + enforcement:** record usage per capability per period; enforce caps at the
  resolver; expose `remaining` for nudge UI.
- **Stripe:** SDK, checkout sessions, customer portal, webhooks (`app/api/stripe/webhooks` — a
  legitimate Next.js API-route exception per CLAUDE.md), subscription lifecycle sync
  (create/update/cancel/dunning) into the DB.
- **Paywall surfaces:** (a) the contextual cap-hit modal (wire the existing `UsageLimitDialog`/
  `UpgradeModal` to real state) and (b) a live `/pricing` route (promote `PricingLanding` out of
  dev demos), plus the nudges (`AccessTierBadge` becomes enforcement-driven).
- Trial flow: 14-day trial per `data.ts`, tracked in DB, downgrades cleanly.

**OUT**
- The tools (they consume). Sharing (P7). Compute quotas / `account_tiers` (stays as-is).
  Discovery/learn content gating (stays free + crawlable — funnel model). Org seat-management UX
  beyond basic org subscriptions (Convergence C). Taxes/invoicing beyond Stripe defaults.

## Deliverables / Definition of done

1. `useEntitlement(capability)` shipped + documented + capability registry populated for every
   metered education action; P1–P5 call sites resolve against it.
2. A free user exhausting a metered capability hits the contextual paywall with accurate
   `remaining`/`reason`; the action is actually blocked server-side (resolver, not just UI).
3. Stripe checkout → webhook → subscription row → entitlements flip live (no redeploy), verified
   in test mode end-to-end; cancellation downgrades correctly.
4. `/pricing` is a live route rendering real plan data (DB-backed, Stripe-priced).
5. Trial start/expiry works; `AccessTierBadge` reflects real tier everywhere it's mounted.
6. Usage is queryable per user/capability/period (P5's dashboards and admin can read it).
7. Feature docs (a new `features/entitlements/FEATURE.md` or equivalent) + admin map.

## Surfaces touched

- New billing/entitlements DB schema + migrations (Supabase MCP + ledger + `pnpm db-types`)
- New `features/entitlements/**` (resolver client, `useEntitlement`, capability registry, Redux
  state hydrated at session boot alongside auth)
- `app/api/stripe/**` (webhooks/checkout) + Stripe SDK dependency
- `features/pricing` (wire to real data; promote to a live `/pricing` route)
- `features/education` seams (`AccessTierBadge`, `AuthedWorkspaceCTA`, tool AI-action sites)

## Dependencies & contracts

- The requirements doc (spec of record). `iam.has_access` as the resolver design model.
- **Publishes (day 1):** `useEntitlement` signature + capability registry → P1–P5, P3's audio
  generation, P2's tutor sends.
- **Consumes:** nothing from the other projects — fully parallel.
- Stripe account/keys needed from Arman before checkout testing (test mode first).

## Build guidance

- Billing tables are sensitive: invoke the `protected-resources` skill before designing the RPC/
  RLS surface; one mutation path per table; webhook writes via service role in the API route,
  everything else deny.
- Webhooks must be idempotent (Stripe retries) and verified (signing secret); log every event.
- Entitlement state in Redux via the existing session-boot hydration chain (like `adminLevel`) —
  don't refetch per component; the resolver RPC is the server-side truth on every enforced
  action.
- Never trust the client for enforcement: expensive actions re-check server-side (RPC or the
  Python execution layer where the spend happens — coordinate the aidream-side check as part of
  this project, not a follow-up).
- `db-change` skills for schema; `type-safety`; `finalize-and-ship`.

## Verification

Stripe test mode end-to-end: checkout, webhook delivery (CLI), subscription row, entitlement
flip, cap exhaustion → paywall → upgrade → action unblocked; cancellation → downgrade. SQL-verify
ledger rows. Demonstrate one real capability (e.g. `education.generate_cards`) enforced through
the whole stack. Hand Arman the test script + test-card numbers.
