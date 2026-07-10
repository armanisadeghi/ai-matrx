# Entitlements & Billing Integrity (P8)

> **Status:** Day-1 contract shipped 2026-07-07 · backend + Stripe landing incrementally.
> **Spec:** [`docs/proposals/education-projects/P8-entitlements-billing.md`](../../docs/proposals/education-projects/P8-entitlements-billing.md).
> **The contract is live and permissive — but limits are VISIBLE.** Every capability ships
> `enforced: false`, so nothing is capped until Arman approves the free-tier matrix AND the
> backend limit + server re-check both exist. Since F1 (2026-07-10) the resolver reports each
> capability's limits + windows regardless of enforcement, so meters render "X of Y left"
> ahead of the cap while enforcement stays off (TRUST mandate, pledge claim #3).

## What this is

The monetization layer AND the integrity stance as one product. The billing *experience* is a
marketed differentiator: a generous free tier, limits visible up front (never a mid-workflow
ambush), one-click cancel, pre-charge reminders, and comparison pages that weaponize the
incumbents' paywall resentment (Chegg's $7.5M FTC settlement, Quizlet's 1.4★).

## The contract (day 1) — what other projects consume

```ts
import { useEntitlement } from "@/features/entitlements/hooks";

const cards = useEntitlement("education.generate_cards");
// Show the limit BEFORE the action (TRUST mandate — no surprise caps):
cards.remaining;   // number | null (null = unlimited)
cards.limit;       // number | null
cards.tier;        // 'free' | 'trial' | 'premium'
cards.reason;      // 'allowed' | 'permissive_stub' | 'cap_reached' | 'tier_locked' | ...
cards.allowed;     // the one boolean to gate on

// Before SPENDING, await the server-truth re-check (never mid-generation ambush):
const verdict = await cards.check();
if (!verdict.allowed) return openPaywall(verdict);
await generate();
```

`useEntitlement` is REACTIVE (reads the boot-hydrated snapshot in Redux). `check()` is the
imperative, server-truth path — call it immediately before an action that spends.

### Adding a metered capability

1. Add an entry to `CAPABILITY_REGISTRY` in [`registry.ts`](./registry.ts) (`enforced: false`).
2. Consumers call `useEntitlement("<your.capability>")`. Done — permissive until enforcement.
3. To ENFORCE: land the `billing.capability_limit` row + the aidream-side spend re-check, get
   the free-tier number approved, THEN flip `enforced: true`. Never flip without both.

## Files

| Path | Role |
|---|---|
| [`types.ts`](./types.ts) | The verdict shape (`EntitlementResult`), tiers, reasons. Stable contract. |
| [`registry.ts`](./registry.ts) | Capability registry — the single source of truth for metered/gated actions. |
| [`hooks.ts`](./hooks.ts) | `useEntitlement(capability)` — the published day-1 hook. |
| [`service.ts`](./service.ts) | `checkEntitlement` (server-truth pre-action) + `fetchEntitlementSnapshot` (boot). |
| [`state/entitlementsSlice.ts`](./state/entitlementsSlice.ts) | Session-boot state (tier + usage). Volatile, never persisted. |
| [`state/selectors.ts`](./state/selectors.ts) | Per-capability memoized verdict selectors. |
| [`components/EntitlementMeter.tsx`](./components/EntitlementMeter.tsx) | "X of Y left" meter — the ONLY meter primitive. Drop beside any metered action. |
| [`components/useEntitlementGuard.tsx`](./components/useEntitlementGuard.tsx) | `guard(action)` — server-truth check before spend; opens the paywall on a cap-hit. |
| [`components/CapabilityPaywallDialog.tsx`](./components/CapabilityPaywallDialog.tsx) | Contextual cap-hit paywall (helpful, never hostage). Never a `toast.error`. |

## Metering model (Arman decisions, 2026-07-07)

- **Meter AI generation, NEVER saved content.** Storage + studying + keeping decks
  are free forever — capping what a user already made is the exact Quizlet/Chegg
  dark pattern we attack. The cost to protect is any AI path, especially multi-call
  ones (`education.card_enrichment` = one model call per card) and the live grader
  (`education.live_grade`).
- **Multi-window metering.** A capability is capped across several windows at once:
  a generous **monthly** cap PLUS a short **rolling burst** window (`rolling_5h`,
  `rolling_1h`) so one session can't torch the month's budget. The resolver denies
  if ANY window is exceeded and reports the **binding** (most-restrictive) window +
  the full window set (`verdict.windows`). Verified live: 10/10 in the 5h window
  blocks even with 20 left in the month.

### Approved free-tier matrix (encoded in `billing.capability_limit`, enforcement OFF)

| Capability | Monthly | Burst |
|---|---|---|
| generate_cards | 30 | 10 / 5h |
| card_enrichment (per card) | 500 | 150 / 5h |
| tutor_message | 30 / day | 15 / 5h |
| audio_generate | 3 | 1 / 5h |
| quiz_generate | 30 | 10 / 5h |
| practice_test_generate | 5 | 2 / 5h |
| mindmap_generate | 15 | 5 / 5h |
| notes_generate | 30 | 10 / 5h |
| ingest_document | 20 | 8 / 5h |
| live_grade | 30 / day | 10 / 1h |

Premium/trial = unlimited (no limit rows). Numbers activate per-capability once the
aidream spend re-check lands (`enforced` flips in `billing.capability`).

## Invariants

- **Features never read plan/subscription/usage tables directly.** They ask the resolver
  (`useEntitlement` / `checkEntitlement`). One central resolver, modeled on `iam.has_access`.
- **Server re-check is truth on every enforced action.** UI reads may fail open; the spend path
  fails closed (see `checkEntitlement`).
- **Entitlement state hydrates ONCE at session boot** (like `adminLevel`), never persisted.
- **Every metered action shows `remaining` BEFORE the cap.** The cap check happens before the
  action starts — mid-generation ambush is a defect (README §6). The mechanism: the snapshot /
  `resolve_capability` RPCs report limits + windows for EVERY registered capability, enforced or
  not, each with an `enforced` flag; un-enforced caps stay `allowed` but the meter still renders.
- **`billing.capability_limit` is the SINGLE SOURCE for every number.** The registry
  `defaultFreeLimit` is descriptive-only, read by nobody — never a second source of truth.
- **Consume the primitives, never hand-roll.** `EntitlementMeter` for the meter,
  `useEntitlementGuard` for the pre-spend check + paywall. A hand-rolled `remaining` line or a
  `toast.error` on a cap-hit is a defect (reuse-first doctrine).
- **Billing tables are protected resources** — RLS deny-by-default; writes only via webhooks /
  `SECURITY DEFINER` RPCs. (Backend, landing next.)

## Roadmap (this project)

- [x] Day-1 contract: `useEntitlement` + capability registry + Redux slice + selectors (permissive).
- [x] DB layer: `billing` schema (products/prices, subscriptions, customers, capability +
      capability_limit, usage_ledger) + `entitlement_check` / `entitlement_snapshot` /
      `entitlement_consume` resolver RPCs. Multi-window metering. Verified live.
- [x] Approved free-tier matrix encoded (enforcement OFF).
- [x] **F1 — limits VISIBLE pre-enforcement.** Snapshot + `resolve_capability` report limits +
      windows for every registered capability with an `enforced` flag; single source =
      `billing.capability_limit`. Verified live (admin snapshot returns all 10 metered caps).
- [x] Boot hydration wired (`DeferredSingletons`, keyed on user id — refetch on login, clear on logout).
- [x] Consume hardening: additive-quantity cap check, concurrency lock, `check_id` idempotency (verified live).
- [x] Paywall + usage-meter primitives (`EntitlementMeter`, `useEntitlementGuard`, `CapabilityPaywallDialog`).
- [x] Primitives CONSUMED (F4): flashcards, notes, mindmap, audio, onboard/start, assessment,
      tutor all render `EntitlementMeter` + guard/paywall. See consumer table below.
- [x] `/pricing/pledge` + `/pricing/compare` (education-specific, verified rendering).
- [x] `/pricing` education-first + DB-backed (F5) — Free caps from `billing.capability_limit`,
      Premium from `billing.product`/`price` (TEST row today). Generic harness `PLANS[]` +
      `PricingGrid`/`PricingLanding` retained ONLY for `(dev)/demos/upgrade`. Premium CTA starts
      real Stripe checkout. **Structure decision:** education plans are primary on `/pricing`
      because every inbound link is an education paywall; the generic SaaS grid lives on in the
      demos, not deleted.
- [x] Admin usage read surface (`/administration/entitlements`, super-admin) + `usage_admin_summary` / `usage_my_summary` (P5).
- [x] Stripe machinery: SDK, checkout, customer portal (one-click cancel), webhooks, lifecycle sync, idempotency + ordering guard.
- [x] Stripe TEST secret/publishable keys are in `.env.local` (`STRIPE_TEST_MODE_SECRET_KEY` /
      `STRIPE_TEST_MODE_PUBLISHABLE_KEY`, win over the live keys per `lib/stripe/server.ts`); a
      test `billing.product`/`price` row is seeded (`AI Matrx Premium (TEST)`, $10/mo).
- [ ] **Blocked on Arman:** `STRIPE_WEBHOOK_SECRET` is still unset (only remaining gap — run
      `stripe listen --forward-to localhost:3000/api/stripe/webhook` for a dev secret, or pull the
      endpoint secret from the Stripe dashboard once a real webhook endpoint exists) → then verify
      checkout→webhook→sub→entitlement end-to-end with the test keys already in place.
- [ ] **Blocked on Arman:** seed `billing.price` with the REAL Premium number (product decision).
      `/pricing` is already DB-backed off the TEST row — swapping the number needs no code change.
- [ ] **Blocked on Arman:** aidream-side spend re-check per capability → then flip `enforced` per
      capability (never flip without both the limit row and the re-check).
- [ ] **Blocked on Arman:** trial pre-renewal reminder email (wire the platform email path).
- [ ] **FYI-with-veto (Arman):** the free-tier matrix numbers get one look before enforcement flips.

## Capability consumers & ownership

Which registered capabilities have a live consumer, and who owns each. A capability with NO
consumer is not a bug — it's awaiting the feature that spends it — but it must be tracked here.

| Capability | Consumer surface | Owner |
|---|---|---|
| `education.generate_cards` | flashcards create-from-source/topic | flashcards agent |
| `education.card_enrichment` | flashcards enrich/enhance | flashcards agent |
| `education.live_grade` | flashcards live grader | flashcards agent |
| `education.notes_generate` | notes generation | notes agent |
| `education.ingest_document` | onboard `StartHero` | this feature |
| `education.mindmap_generate` | `MindMapNew` | this feature |
| `education.audio_generate` | `AudioStudyNew` | this feature |
| `education.quiz_generate` | `AssessmentCreate` (quiz) | this feature |
| `education.practice_test_generate` | `AssessmentCreate` (practice test) | this feature |
| `education.tutor_message` | `EducationTutorClient` | this feature |
| `education.game_room_size` | **NO consumer** — `HostSetupImpl` (engage) still hand-checks; wire to `useEntitlement` when P10 lands | engage/game agent |

## Change Log

- **2026-07-07** — Day-1 contract shipped: `features/entitlements/` (types, registry, hook,
  service, slice, selectors), registered `entitlements` reducer, permissive stub for all 10
  capabilities. Unblocks P1–P5/P9/P10.
- **2026-07-10** — F1: limits VISIBLE pre-enforcement — snapshot/`resolve_capability` report
  limits + windows for every registered capability with an `enforced` flag (single source =
  `billing.capability_limit`; registry `defaultFreeLimit` demoted to descriptive-only). F3:
  `resolve_capability` screams (WARNING + `unknown:true`) on an unknown capability id instead of
  failing open silently; client service logs a dev error. F4: mindmap/audio/onboard/assessment/
  tutor now consume `EntitlementMeter` + `useEntitlementGuard` (no more hand-rolled meters /
  `toast.error` cap-hits). F5: `/pricing` is education-first + DB-backed. Migration
  `billing_visible_limits_and_loud_unknown.sql`.
