# Entitlements & Billing Integrity (P8)

> **Status:** Day-1 contract shipped 2026-07-07 · backend + Stripe landing incrementally.
> **Spec:** [`docs/proposals/education-projects/P8-entitlements-billing.md`](../../docs/proposals/education-projects/P8-entitlements-billing.md).
> **The contract is live and permissive — but limits are VISIBLE and now DECREMENT.** Every
> capability ships `enforced: false`, so nothing is capped until Arman approves the free-tier
> matrix AND the backend limit + server re-check both exist. Since F1 (2026-07-10) the resolver
> reports each capability's limits + windows regardless of enforcement, so meters render "X of
> Y left" ahead of the cap; since F6 (2026-07-13) every metered action records real usage on
> success, so that meter actually counts down (usage is captured even while enforcement stays
> off — the honesty half of the TRUST mandate, pledge claim #3).

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

### Recording usage — the consume-on-success contract (makes the meter honest)

A visible limit is only honest if it actually **decrements**. Every metered action must
record real usage on its SUCCESS path via `useEntitlementGuard`'s `commit()` (or
`useEntitlementConsume` where there's no `guard(action)` wrapper). `commit()` calls the
race-safe `billing.entitlement_consume` RPC (writes a `usage_ledger` row) and patches the
Redux snapshot so the meter re-renders the new remaining immediately.

```ts
const gen = useEntitlementGuard("education.memory_generate");
// gate the START (paywall on a cap-hit), then record usage only on real success:
await gen.guard(async () => {
  const media = await generate();          // the metered work
  if (media.error) { toast.error(...); return; }   // FAILURE branch: no commit → no quota burned
  await gen.commit();                      // SUCCESS: usage_ledger row lands, meter 15→14
  router.push(...);
});
<gen.Paywall />
<EntitlementMeter capability="education.memory_generate" />
```

**Two rules that make this correct:**

1. **Consume on SUCCESS, never on start.** `guard()` only gates the start; it does NOT
   record usage. Call `commit()` at the genuine success point so a failed/aborted generation
   never burns quota. Where success lives inside a `Promise<void>` hook that swallows errors,
   have the hook return a `boolean` and `commit()` on `true` (see `useAudioStudyCreate`,
   `useSpokenPractice.start`, `useKitGeneration.run`, `ConvertContentDialog#runConvert`).
2. **Consume regardless of `enforced`.** `enforced` gates only whether a cap BLOCKS at the
   limit — usage recording (and thus a truthful decrementing meter) happens for EVERY metered
   capability, enforced or not. `consumeEntitlement` never short-circuits on `enforced:false`
   (unlike `checkEntitlement`, which does); the RPC itself writes the ledger for un-enforced
   capabilities and only runs the advisory-locked cap check when enforced.

`commit()` auto-references the last `guard()` pre-check's `checkId`, so a check + a consume
are one accounted unit (idempotency + audit). It fails soft — a metered action that already
succeeded never surfaces a metering error; a failed write screams in dev and falls back to a
full snapshot refresh.

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
| [`hooks.ts`](./hooks.ts) | `useEntitlement(capability)` (day-1 read hook) + `useEntitlementConsume(capability)` → `commit()` (consume-on-success primitive). |
| [`service.ts`](./service.ts) | `checkEntitlement` (server-truth pre-action) + `consumeEntitlement` (records usage, never short-circuits on `enforced:false`) + `usageFromConsume` + `fetchEntitlementSnapshot` (boot). |
| [`state/entitlementsSlice.ts`](./state/entitlementsSlice.ts) | Session-boot state (tier + usage). Volatile, never persisted. `setCapabilityUsage` patches one capability after a consume so the meter re-renders. |
| [`state/selectors.ts`](./state/selectors.ts) | Per-capability memoized verdict selectors. |
| [`components/EntitlementMeter.tsx`](./components/EntitlementMeter.tsx) | "X of Y left" meter — the ONLY meter primitive. Drop beside any metered action. |
| [`components/useEntitlementGuard.tsx`](./components/useEntitlementGuard.tsx) | `guard(action)` — server-truth check before spend; opens the paywall on a cap-hit. `commit()` — records usage on the SUCCESS path (see the consume-on-success contract above). |
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

## Creator payouts (Stripe Connect Express) — real money to creators

The monetization layer also moves **real money to creators**: a student buys a paid
class, the platform takes a cut, and the rest is paid out to the creator. Built on
**Stripe Connect Express** (Stripe hosts onboarding, KYC, payouts, tax — we link, we
never rebuild). Live in TEST mode as far as the Stripe account allows; the money
paths are **blocked on Arman enabling Connect** (see below).

**Split model — ONE source: [`lib/stripe/connect.ts`](../../lib/stripe/connect.ts).**
`PLATFORM_FEE_BPS = 2000` → **platform 20% / creator 80%**. `platformFeeAmount()` /
`creatorAmount()` compute the cents; every surface (checkout, ledger, dashboard, docs)
reads them from here. `MIN_CLASS_PRICE_CENTS = 100` ($1 floor). `formatPriceCents()` is
the display formatter.

**The flow (destination charge):**
1. Creator connects an Express account on the dashboard → `POST /api/stripe/connect/onboard`
   (`ensureConnectAccount` + a hosted onboarding link). Status: `GET /api/stripe/connect/status`
   (refreshes from Stripe); Express dashboard link: `POST /api/stripe/connect/dashboard`.
2. Creator sets a class to **paid** + a price in the class form → `scope.settings.price_cents`.
3. Student buys → `POST /api/stripe/class-checkout`: a Stripe Checkout session in `payment`
   mode with `application_fee_amount` (the 20%) + `transfer_data.destination` = the creator's
   Connect account. Price is read **authoritatively server-side** from the class scope (never
   trusted from the client). A pending `billing.class_purchase` row is written.
4. `checkout.session.completed` (webhook) → `fulfillClassPurchase` marks the sale paid and
   confers the enrolment via **`edu_class_confer_purchase`** (service_role-only RPC).
5. Refund/chargeback (`charge.refunded` / `charge.dispute.created`) → `revokeClassPurchaseByPaymentIntent`
   → `edu_class_revoke_purchase` soft-removes access. `account.updated` keeps Connect status fresh.

**The paid gate is WEBHOOK-ONLY (the load-bearing security invariant).** `edu_class_confer_purchase`
/ `_revoke_purchase` have EXECUTE **revoked from anon + authenticated**, granted to `service_role`
alone — so the ONLY path to `active` paid membership is the signature-verified Stripe webhook via
the admin client. A client can never self-grant paid access (the exact bypass the security review
flagged on the deleted `edu_class_purchase` stub). Verified live.

**DB (`migrations/stripe_connect_creator_payouts.sql`):** `billing.connect_account` (one row per
creator; `charges_enabled` = the "can receive payouts" gate) + `billing.class_purchase` (sales
ledger + refund lookup by payment_intent), both RLS deny-by-default (service_role writes only).
`creator_connect_status()` (authed self-read) exposes a creator's own status. Idempotency reuses
`billing.stripe_event`.

**Files:** [`lib/stripe/connect.ts`](../../lib/stripe/connect.ts) (split config, pure) ·
[`stripe/connect.ts`](./stripe/connect.ts) (server DB-sync: connect accounts + purchase confer/revoke) ·
`app/api/stripe/connect/{onboard,status,dashboard}/route.ts` · `app/api/stripe/class-checkout/route.ts` ·
webhook handlers in `app/api/stripe/webhook/route.ts`. FE consumers:
`features/education/classes/{ClassAccessPanel,ClassFormDialog}` + `service.startClassCheckout`,
`features/education/creators/{EnrollButton,CreatorPayoutsPanel}`.

**Blocked on Arman (Stripe dashboard) — exact list:**
1. **Enable Connect** at `https://dashboard.stripe.com/connect` (verified: account creation currently
   fails "you can only create new accounts if you've signed up for Connect"). Fill the **platform
   profile** (business name, support email, statement descriptor) Connect requires.
2. **Set `STRIPE_WEBHOOK_SECRET`** (still unset) — from `stripe listen --forward-to
   localhost:3000/api/stripe/webhook` for dev, or the dashboard endpoint secret in prod. Subscribe
   the endpoint to `checkout.session.completed`, `charge.refunded`, `charge.dispute.created`,
   `account.updated` (+ the existing subscription events).
3. **Connect `client_id` is NOT needed** for Express (that's for Standard OAuth). Express uses the
   platform account + `accounts.create({type:'express'})` — already wired.
4. Then verify end-to-end: connect a test Express account → set a class paid + priced → buy with a
   test card → confirm the webhook confers the `active` membership and the split lands in the
   payment intent's `application_fee_amount` + transfer.

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
  `useEntitlementGuard` for the pre-spend check + paywall + `commit()`. A hand-rolled
  `remaining` line, a `toast.error` on a cap-hit, or a direct `billing.entitlement_consume`
  RPC call is a defect (reuse-first doctrine).
- **A visible meter MUST decrement — record usage on success.** Every metered action calls
  `commit()` on its genuine success branch; a metered action with a meter but no consume is a
  defect (the meter would read "X of Y left" forever — the exact dishonesty P8 kills). Usage
  is recorded regardless of `enforced` (see the consume-on-success contract). `enforced`
  gates only the BLOCK, never the record.
- **Gate capabilities (`period: null`) have no meter and no snapshot limit.** The snapshot/selector
  plumb only metered *windows*, so a gate always resolves `limit: null` and `EntitlementMeter`
  renders nothing for it (correct — a gate has no "X of Y left"). A gate consumer shows its limit
  inline from the hook's `tier` + its own feature default (e.g. `HostSetupImpl` renders "Up to N
  players · <tier>"). That inline render is NOT a hand-rolled duplicate of `EntitlementMeter` —
  it's the only surface for a gate limit until a gate-limit primitive is warranted (only one gate
  capability exists today; don't build a speculative abstraction for it).
- **Billing tables are protected resources** — RLS deny-by-default; writes only via webhooks /
  `SECURITY DEFINER` RPCs.
- **Paid access is WEBHOOK-ONLY.** The only path to a paid `active` class membership is the
  signature-verified Stripe webhook (`edu_class_confer_purchase`, service_role-only). No client
  code — no RPC, no direct write — may confer paid access. A client-callable "grant myself access"
  path is the exact bypass this design kills (the deleted `edu_class_purchase` stub). Price is
  read server-side from the class scope, never trusted from the client.

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
- [x] **F6 — the meter is HONEST (consume-on-success).** `useEntitlementGuard.commit()` +
      `useEntitlementConsume` + `consumeEntitlement` land: every education metered consumer now
      records real usage in `billing.usage_ledger` on its success path, so "X of Y left"
      decrements (verified live: `entitlement_consume` on an un-enforced capability writes a
      ledger row per call → resolver reports 15→14→13 month / 5→4→3 burst). Usage is recorded
      regardless of `enforced`. Wired: memory, mindmap, audio, quiz/practice-test, notes-convert,
      spoken-practice, ingest, image-grade. Flashcards (generate/enrich/live-grade) still need
      their `commit()` — the primitive is ready.
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
- [ ] **Needs Arman sign-off — `/pricing/pledge` final wording.** Two of the six pledge bullets are
      forward COMMITMENTS, not live capabilities, and are now marked "Before paid launch" on the page
      rather than claimed present-tense (a trust page over-promising is the inverted dark pattern P8
      kills). Arman owns the final copy + the underlying product/legal calls:
      1. **Pre-charge reminder email** — no `invoice.upcoming` handler / email dispatch exists (email
         path blocked on Arman, above). Ship the reminder before flipping paid billing on.
      2. **Refunds & proration** — no refund policy page anywhere and no in-app plan-change path yet
         (checkout mints a NEW subscription so proration is N/A; plan-switch proration is a Stripe
         *portal dashboard* config, not a `proration_behavior` code param — nothing honest to wire in
         code today). Refund policy = product/legal (Arman); post the written terms before paid launch.

## Capability consumers & ownership

Which registered capabilities have a live consumer, and who owns each. A capability with NO
consumer is not a bug — it's awaiting the feature that spends it — but it must be tracked here.
Every metered consumer below now `commit()`s on its success path, so the meter decrements for
real (F6, 2026-07-13).

| Capability | Consumer surface | Owner |
|---|---|---|
| `education.generate_cards` | flashcards create-from-source/topic — guard wired; **commit pending** | flashcards agent |
| `education.card_enrichment` | flashcards enrich/enhance — guard wired; **commit pending** (meter by card count via `commit({ quantity })`) | flashcards agent |
| `education.live_grade` | flashcards live grader (`FastFireSetup`) — guard wired; **commit pending** | flashcards agent |
| `education.notes_generate` | notes generation (shared `ConvertContentDialog`) — commit on success | notes agent |
| `education.ingest_document` | onboard `StartHero` (`useKitGeneration.run` → bool) — commit on success | this feature |
| `education.mindmap_generate` | `MindMapNew` — commit on success | this feature |
| `education.audio_generate` | `AudioStudyNew` (`useAudioStudyCreate.create` → bool) — commit on success | this feature |
| `education.quiz_generate` | `AssessmentCreate` (quiz) — commit on success | this feature |
| `education.practice_test_generate` | `AssessmentCreate` (practice test) — commit on success | this feature |
| `education.memory_generate` | `MemoryNew` — commit on success | this feature |
| `education.spoken_practice` | `PracticeSetup` (`useSpokenPractice.start` → bool) — commit on success | spoken-practice agent |
| `education.image_grade` | `GradeWorkSurface` (grade handwritten work) — commit on success | assessment/image-grade agent |
| `education.tutor_message` | `EducationTutorClient` — commit per USER message via a count-delta effect (the composer is agents-owned with no submit hook; the delta baseline re-inits per mount so history is never re-metered and it can only under-count, never double-charge). A composer `onSubmit` hook would make it exact — tracked as a follow-up. | this feature |
| `education.game_room_size` | `HostSetupImpl` (engage lobby) — `useEntitlement` gate, max room size shown before hosting (no meter/consume — a gate) | engage/game agent |

## Change Log

- **2026-07-15** — **Creator payouts (Stripe Connect Express) — real money movement.** Added the
  full marketplace path: `billing.connect_account` + `billing.class_purchase`, the webhook-only paid
  gate (`edu_class_confer_purchase`/`_revoke_purchase`, service_role-only — verified anon/authenticated
  cannot execute), `creator_connect_status()`, and `creator_public_page` single-sourcing a class's
  live price/access mode. Split model (20/80) in `lib/stripe/connect.ts`; server DB-sync in
  `stripe/connect.ts`; routes `api/stripe/connect/{onboard,status,dashboard}` +
  `api/stripe/class-checkout`; webhook extended (`checkout.session.completed` for class purchases,
  `charge.refunded`/`dispute.created` revoke, `account.updated`). FE: real "Enroll — $X" checkout on
  the class hub + creator page, a price field in the class form, and a creator earnings panel.
  Migration `stripe_connect_creator_payouts.sql` applied + ledgered; grant path verified live. Deleted
  the bypassable `edu_class_purchase` stub. **Blocked on Arman:** enable Connect + platform profile +
  `STRIPE_WEBHOOK_SECRET` (see §Creator payouts).
- **2026-07-13** — **F6: the meter is now honest — consume-on-success wired platform-wide.**
  Before this, `entitlement_consume` had ZERO callers, so every meter read "X of Y left"
  forever (a TRUST-mandate violation + no usage captured). Added the consume primitive:
  `service.consumeEntitlement` (calls the race-safe `billing.entitlement_consume` RPC; NEVER
  short-circuits on `enforced:false` — usage is recorded regardless of enforcement) +
  `usageFromConsume`; `hooks.useEntitlementConsume` → `commit()` (patches the snapshot via the
  purpose-built `setCapabilityUsage` reducer so the meter re-renders instantly);
  `useEntitlementGuard` now exposes `commit()` (auto-threads the pre-check `checkId`). Wired
  `commit()` into every education metered consumer's SUCCESS branch (memory, mindmap, audio,
  quiz/practice-test, notes-convert, spoken-practice, ingest, image-grade); the three hooks
  whose success is swallowed internally now return a `boolean` so the callsite commits only on
  real success (failed generation burns no quota). Tutor meters per user message via a
  count-delta effect (composer is agents-owned, no submit hook). Verified live against
  `txzxabzwovsujtloxrus`. Flashcards consumers await their `commit()` (flashcards agent).
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
- **2026-07-10** — Convergence-A gap closure: confirmed `education.game_room_size` is consumed by
  `HostSetupImpl` (P10) via `useEntitlement` (consumer table updated); documented the gate-capability
  display rule (gates have no snapshot limit / no meter — inline render from hook tier + feature
  default is canonical). Reworded the two over-claiming `/pricing/pledge` bullets (pre-charge reminder,
  refunds/proration) to honest "Before paid launch" commitments; final wording pending Arman sign-off
  (roadmap). No code change to the entitlement contract.
