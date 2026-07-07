# P8 — Billing Integrity & Entitlements (the Trust-Winning Funnel)

> **Status date:** 2026-07-07 (reframed + MOVED UP per the competitive research) ·
> **Wave 1, priority tier 1 — FOUNDATIONAL CONTRACT.** Publish `useEntitlement` on **day 1**.
> **Spec of record:**
> [`../ENTITLEMENTS_AND_BILLING_REQUIREMENTS.md`](../ENTITLEMENTS_AND_BILLING_REQUIREMENTS.md).
> **Why this moved up:** billing fury was the ONE theme in **9 of 9** competitor research passes —
> Chegg paid the FTC $7.5M for cancellation dark patterns, Quizlet's paywall ambush drove its
> consumer Trustpilot to 1.4★, StudyFetch/Quizizz/Turbolearn all bleed users over billing traps.
> Honest, generous, transparent billing is the cheapest, loudest, FTC-validated wedge we have —
> this project builds the monetization machinery AND the integrity stance as one product.

## Objective

Build the monetization layer from greenfield — DB-backed entitlements, usage metering with
enforced caps, Stripe — designed so that *the billing experience itself is a marketed
differentiator*: a genuinely generous free tier (finish a real study session free, limits visible
up front, never a mid-workflow ambush, no ads over the UI), a public no-dark-patterns pledge
(one-click cancel, pre-charge reminders, honest refunds), and comparison pages that weaponize the
incumbents' paywall resentment.

## Current state (verified 2026-07-07 — fully greenfield)

- **No Stripe:** no dependency, no `app/api/stripe`, keys only in `.env.dead`.
- **No commercial tables:** nothing for products/prices, subscriptions, billing customers,
  entitlements, usage ledger, or trials.
- **`features/pricing` is static UI consumed only by dev demos** (PricingGrid, PlanCard,
  BillingToggle, UpgradeModal, UsageLimitDialog, 5 nudges; hardcoded `PLANS[]`, `TRIAL_DAYS=14`,
  `ANNUAL_DISCOUNT=0.2`). No live `/pricing` route.
- **`account_tiers` is operational (compute quotas), not commercial** — confirmed separate; sole
  real consumer is `app/api/compute-targets/route.ts:195`. Leave it alone.
- **Seams in place:** `features/education` `AccessTier` type + `AccessTierBadge` +
  `AuthedWorkspaceCTA` — all display-only, awaiting this system.
- `user_usage_summary` computes cost in millicents but never charges — metering raw material.

## Scope

**IN — machinery**
- **DB layer:** products/prices (Stripe-mirrored), subscriptions (user + org), billing-customer
  mapping, entitlements/capability model, usage ledger (period windows), trial tracking. Treat as
  protected resources: RLS deny-by-default; writes only via webhooks / `SECURITY DEFINER` RPCs.
- **One central resolver** (RPC, modeled on `iam.has_access` per the requirements doc):
  capability × user/org × subscription × usage → `{allowed, remaining, tier, reason}`. Features
  never read plan tables directly.
- **The `useEntitlement(capability)` contract (day-1 publication):** typed hook + selector + a
  **capability registry** (`education.generate_cards`, `education.tutor_message`,
  `education.audio_generate`, `education.quiz_generate`, `education.game_room_size`, …).
  Permissive stub behind the real signature day 1; enforcement flips per capability as the
  backend lands. Server-side re-check on every enforced action (coordinate the aidream-side
  check where the spend happens — part of this project, not a follow-up).
- **Stripe:** SDK, checkout, customer portal, webhooks (`app/api/stripe/**` — legitimate API-route
  exception), full lifecycle sync (create/update/cancel/dunning), idempotent + signature-verified.
- **Metering + enforcement:** usage per capability per period; caps at the resolver; `remaining`
  exposed for nudges.

**IN — the integrity product (the reframe)**
- **Free-tier design as a deliverable:** propose the free/trial/premium capability matrix to
  Arman (generosity calibrated Knowt-over-StudyFetch; the aha-moment comes BEFORE any cap;
  discovery/learn/exam-hub content stays free + crawlable). This is a product decision surfaced
  for approval, not silently coded.
- **No-dark-patterns mechanics:** one-click cancel (portal-based, no retention maze), pre-charge
  reminder email before every renewal (trial→paid especially), visible limits ("X of Y this
  month" in-product before the cap, never a surprise), honest proration/refund policy page.
- **The pledge + comparison marketing:** a public billing-integrity pledge page and a
  "what they lock vs what's free here" comparison surface (Quizlet/Chegg/StudyFetch paywall
  facts are public record — keep claims cited + factual); coordinate copy/placement with P0's
  trust pages and P6's SEO machinery.
- **Two paywall surfaces:** the contextual cap-hit modal (wire `UsageLimitDialog`/`UpgradeModal`
  to real state — tone: helpful, never hostage) + a live `/pricing` route (promote
  `PricingLanding` from dev demos, DB-backed prices).
- Trial flow (14-day per data.ts): starts clearly, reminds before conversion, downgrades cleanly.

**OUT**
- The tools (consume the contract). Sharing (P7). `account_tiers`/compute quotas. Org
  seat-management UX beyond basic org subscriptions (Convergence C). Taxes/invoicing beyond
  Stripe defaults. Ads: **never** (explicit anti-feature).

## Deliverables / Definition of done

1. `useEntitlement` + capability registry shipped day 1; P1–P5/P9/P10 call sites resolve against
   it; enforcement is server-checked, not UI-only.
2. A free user exhausting a metered capability sees accurate remaining-counts *before* the cap
   and a respectful contextual paywall *at* it — demonstrably never mid-generation ambush
   (the cap check happens before the action starts).
3. Stripe test-mode end-to-end: checkout → webhook → subscription → entitlements flip live;
   **cancellation is genuinely one click** and takes effect as stated; a pre-renewal reminder
   email fires.
4. `/pricing` live with DB-backed plans; the pledge + comparison pages ship with cited claims.
5. The free-tier capability matrix is approved by Arman and encoded in the registry; trial
   start/expiry/downgrade proven.
6. Usage queryable per user/capability/period (admin + P5 can read); feature docs + admin map
   updated.

## Surfaces touched

- New billing/entitlements schema + migrations; new `features/entitlements/**` (resolver client,
  hook, registry, Redux state hydrated at session boot like `adminLevel`)
- `app/api/stripe/**` + Stripe SDK; transactional email for reminders (use the platform's
  existing email path — verify what exists; do not stand up a parallel sender)
- `features/pricing` → live `/pricing`; pledge/comparison pages (with P6's SEO layer)
- `features/education` seams (`AccessTierBadge`, `AuthedWorkspaceCTA`, tool AI-action sites)

## Dependencies & contracts

- Requirements doc (spec of record); `iam.has_access` as resolver design model.
- **Publishes (day 1):** `useEntitlement` + capability registry → every metered project.
- **Consumes:** nothing — fully parallel. Stripe test keys needed from Arman before checkout
  testing. Free-tier matrix needs Arman's approval (product decision).
- **Coordinates:** P0 (trust/integrity brand voice), P6 (pledge/comparison pages ride the SEO
  engine), P10 (room-size capability must not recreate the "Kahoot tax" resentment — generous
  default).

## Build guidance

- `protected-resources` skill before designing the RPC/RLS surface; one mutation path per table;
  webhook writes via service role in the API route; everything else deny.
- Webhooks idempotent (Stripe retries), signature-verified, every event logged.
- Entitlement state hydrates once at session boot; the resolver RPC is truth on enforced actions.
- The integrity mechanics are product code, not copy: cancel/reminder/visible-limits get the same
  engineering rigor as checkout.
- `db-change`, `type-safety`, `finalize-and-ship`.

## Verification

Stripe test mode end-to-end including the unhappy paths: cancel (count the clicks), renewal
reminder timing, cap-hit → upgrade → action unblocked, downgrade after cancellation. SQL-verify
ledger + subscription rows. Demonstrate one capability (`education.generate_cards`) enforced
through the full stack including the server-side re-check. Hand Arman the test script +
test-card numbers.
