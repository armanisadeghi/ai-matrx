# Entitlements & Billing Integrity (P8)

> 🚨 **Cross-repo system-of-record: `/Users/armanisadeghi/code/common-docs/systems/platform/entitlements-knobs/FEATURE.md`.**
> Read it before writing ANY tier check, plan gate, quota, or "is this org allowed
> to…" branch in ANY repo. It holds THE NO-REGRESSION RULE, the org-tier model,
> and the aidream half. This file is the frontend contract only.

> **Status:** Day-1 contract shipped 2026-07-07 · backend + Stripe landing incrementally.
> **Spec:** [`common-docs/systems/education/STATE.md`](../../../common-docs/systems/education/STATE.md).
> **The education contract is live and permissive — but limits are VISIBLE and now DECREMENT.** Every
> `education.*` capability ships `enforced: false`, so nothing there is capped until Arman approves
> the free-tier matrix AND the backend limit + server re-check both exist. Plan dimensions enforce
> only as recorded in the canonical `PLAN_MODEL.md`. Since F1 (2026-07-10) the resolver
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
   capability, enforced or not. Neither `consumeEntitlement` nor `checkEntitlement` short-circuits:
   the client has no copy of `enforced` to short-circuit on. The RPC itself writes the ledger for
   un-enforced capabilities and only runs the advisory-locked cap check when enforced.

`commit()` auto-references the last `guard()` pre-check's `checkId`, so a check + a consume
are one accounted unit (idempotency + audit). It fails soft — a metered action that already
succeeded never surfaces a metering error; a failed write screams in dev and falls back to a
full snapshot refresh.

### Adding a metered capability

0. **Check it against D-5 first** (above): is this metering AI generation / depth /
   convenience, or is it metering the act of practicing? The second is forbidden, and
   `pnpm test features/entitlements` will tell you so.
1. Add the `billing.capability` row (`enforced = false`, `min_tier`, `period`) and the WORDS entry in
   `CAPABILITY_REGISTRY` ([`registry.ts`](./registry.ts): label, description, upgrade copy, scope).
2. Consumers call `useEntitlement("<your.capability>")`. Done — permissive until enforcement.
3. To ENFORCE: land the `billing.capability_limit` row + the aidream-side spend re-check, get
   the free-tier number approved, THEN `update billing.capability set enforced = true`. Never
   flip without both. No code change is part of a flip.

## Files

| Path | Role |
|---|---|
| [`types.ts`](./types.ts) | The verdict shape (`EntitlementResult`), tiers, reasons. Stable contract. |
| [`registry.ts`](./registry.ts) | Capability registry — the single source of truth for metered/gated actions. |
| [`__tests__/`](./__tests__) | The invariant guard rails: D-5 (core practice never metered), a visible limit must decrement, a spend path fails closed. |
| [`__tests__/studySpineVocabulary.ts`](./__tests__/studySpineVocabulary.ts) | Test-only. Derives the core-practice vocabulary by scanning the study spine's declared modes, so D-5 covers modes that do not exist yet. |
| [`hooks.ts`](./hooks.ts) | `useEntitlement(capability)` (day-1 read hook) + `useEntitlementConsume(capability)` → `commit()` (consume-on-success primitive). |
| [`service.ts`](./service.ts) | `checkEntitlement` (server-truth pre-action) + `consumeEntitlement` (records usage, never short-circuits on `enforced:false`) + `usageFromConsume` + `fetchEntitlementSnapshot` (boot). SQL resolver: `migrations/billing_plan_system.sql`, hardened by `billing_resolve_capability_optional_plan_guard.sql`. |
| [`state/entitlementsSlice.ts`](./state/entitlementsSlice.ts) | Session-boot state (tier + usage). Volatile, never persisted. `setCapabilityUsage` patches one capability after a consume so the meter re-renders. |
| [`state/selectors.ts`](./state/selectors.ts) | Per-capability memoized verdict selectors. |
| [`components/EntitlementMeter.tsx`](./components/EntitlementMeter.tsx) | "X of Y left" meter — the ONLY meter primitive. Drop beside any metered action. |
| [`components/useEntitlementGuard.tsx`](./components/useEntitlementGuard.tsx) | `guard(action)` — server-truth check before spend; opens the paywall on a cap-hit. `commit()` — records usage on the SUCCESS path (see the consume-on-success contract above). |
| [`components/CapabilityPaywallDialog.tsx`](./components/CapabilityPaywallDialog.tsx) | Contextual cap-hit paywall (helpful, never hostage). Never a `toast.error`. |
| [`components/CapabilityGate.tsx`](./components/CapabilityGate.tsx) | The TIER gate surface — tier held + tier required + one click there. Fails open while loading/on error. The ONLY tier-lock UI; never hand-roll a second. |
| [`usage-gate/`](./usage-gate) | THE USAGE GATE, client half — see the section below. |

## The usage gate — client half (2026-10-03)

Binding rules: `common-docs/systems/platform/entitlements-knobs/USAGE-GATE.md` (9-12). The client
never derives a state; every level is `billing.user_usage_state` as written.

- **Landing:** `app/(core)/layout.tsx` reads `user_usage_state` as a third leg of its existing
  `Promise.all` (session + admin), seeded as `initialReduxState.usageSnapshot` →
  `entitlements.usageGate`. Other shells: `UsageGateBridge` reads once in the background.
- **Request path:** `checkUsageBeforeAiCall` runs inside `runAiStream` (turns only — a resume or
  rejoin is the same running request) and in `callApi` for every call in the paid-AI census
  (`usage-gate/paidAiPaths.ts`: POSTs that start agent turns, mandate/workflow/test runs,
  speech, transcription, image/podcast generation and feature endpoints that run an agent; a
  `/v2` prefix is the same endpoint; `paid-ai-paths-are-real` checks each against the schema).
  Held `ok`/`unknown` → no read. Held `near`/`over` → one fresh read; only a fresh `over` with
  enforcement on stops the call (`usage_limit_reached`) and opens `UsageLimitDialog`.
- **Refusals reach ONE door:** `classifyUsageRefusal` (HTTP status or a stream `error` event)
  → `applyUsageRefusal`. `guest_ai_allowance_used`, a refusal naming the `guest` plan, or a 402
  with nobody signed in → the guest sign-up reminder only (`lib/guest/guest-ai-allowance.ts`),
  never the upgrade dialog, never a plan state in Redux. `usage_limit_reached` / a 402 for a
  signed-in person → `over` + `UsageLimitDialog`, never the reminder. Same in `runAiStream`
  (checked before its 403 branch), `callApi`, and mid-stream in `processStream`'s `error` branch.
- **After a call:** `noteAiCallEnded` marks stale and schedules one background read
  `REFRESH_AFTER_CALL_MS` (8 s) later — after the server banks the spend at settle; calls inside
  the window share it. The `usage_state_changed` directive (computed after settle) cancels it;
  the mid-stream `usage_state` info event (pre-spend) never does. Nothing awaits it.
- **Server notifications:** the directive, the `info` event (`metadata.usage`), and a refusal body
  all go through `parseUsageSnapshot`; the full state under `usage` wins over a refusal's flat
  top-level fields.
- **Notice:** one toast per `usageNoticeKey` per session — level + binding window, plus the reset
  for a fixed (day/week/month) window; a rolling window's moving reset is never part of the key.
  A held `over` shows it, never blocks.
- **Settings → Plan & usage:** the primary card is the person's own state (`MyUsageCard`, from
  `entitlements.usageGate`, refreshed once on open); the organization's budget and plan follow
  under a separate "Organization" header.
- **Guests:** no browser Supabase session, so no client read — they get only server notifications
  and refusals. Never invent a guest session for this.
- **Guards:** `__tests__/usage-gate-request-path.test.ts` (real `runAiStream`) and
  `__tests__/usage-refusal-reaches-the-right-door.test.ts` (guest vs person, HTTP and mid-stream,
  notice key, refresh timing, the census).

## Change Log

- **2026-10-03** — Usage gate review fixes: guest refusals reach only the guest reminder (HTTP 402/403 and mid-stream); a mid-stream `usage_limit_reached` error holds `over` + opens the dialog; notice keyed per window (rolling resets ignored); after-call refresh 8 s and cancelled by the settled directive; `callApi` pre-check covers the paid-AI census; Settings → Plan & usage leads with the person's own usage card.

- **2026-10-03** — Registry holds words only: removed `minTier`, `enforced` and `period` (copies of `billing.capability`). `checkEntitlement` always asks `entitlement_check` (un-enforced comes back `permissive_stub`; resolver error refuses for every capability); `CapabilityGate` and the `useOrgEntitlement` loading state read `requiredTier`/`period` from the verdict only. New guard `registry-holds-no-database-copies.test.ts` (red on the old registry, green now); fixture-state assertions dropped from three tests.

- **2026-10-03** — Usage gate client half: `entitlements.usageGate` seeded at landing by the (core) layout, near/over fresh-read pre-check in `runAiStream` + `callApi`, stale + background refresh after each call, `usage_state_changed` directive + `usage_state` info event + usage refusal handling, `UsageGateBridge` (notice + `UsageLimitDialog`).

- **2026-10-03** — Plan catalog: every plan surface reads `billing.plan_catalog()` via `catalog/`. `/pricing` shows the ladder (Personal / Business, exact cents, AI points per window) above the education section; paywall/upgrade/industry dialogs read the same rows; paid plans announce `billing.plan-checkout` (Coming Soon). Deleted `features/pricing/data.ts`, `PricingLandingRoute`, dead `fetchPublicPlans`; dropped registry `defaultFreeLimit` and the hardcoded points-rate sentence. Registry `minTier`/`enforced` still duplicate `billing.capability` (the resolver gate reads them) — closed the same day (next entry).

- **2026-09-27** — page-pass 2026-09-27: `/pricing`, type promotional, posture after Linear's pricing page (CTA directly under each price), fixed: Premium card no longer shows the internal test product name/description ("AI Matrx Premium (TEST)", "Test-mode … P8 checkout verification"); removed the false "Priority generation on capacity" line (no tier-aware priority exists) and the "We email before every renewal" line (the pledge marks renewal reminders Before paid launch); Free limits phrased as units ("30 flashcard decks / month") and now include the daily AI tutor and live-grading caps; a refused `capability_limit` read throws instead of rendering a limitless Free card; signed-out visitors are told every new account gets Premium free before launch and are sent to sign-up instead of a $10 checkout (`PRELAUNCH_COMPLIMENTARY_PREMIUM` in `features/pricing/education/loadEducationPricing.ts` — un-flip with the signup trigger); complimentary Premium says so; hand-styled buttons → design-system `Button`; plan CTAs above the fold. Phase B (live proof): "complimentary" now reads the person's own `billing.user_plan.source` via `readMyPlanSource()` (`plan-service.ts`) — `entitlement_snapshot().is_subscribed` is only `tier in (premium, trial)` and cannot tell a grant from a subscription; header links carry `data-tap-target` for the 44px phone floor. Iteration (blind judge "mediocre"): headline now states the offer, pledge moved below the plans as one section with one link each; Premium leads with "Everything in Free, plus" (7 true lines, no premium limit rows exist); current plan is a "Your plan" badge, never a button; signed-out Free and Premium both go to sign-up returning to /pricing; "Start free"/"Open study tools" are real links; "test pricing" caveat removed (internal wording; `isTest` dropped); shared `PublicHeader` Download is a 44px touch link (Button asChild, no <a><button>), `PublicFooter` is one row at xl and a grid below. Excellence pass: cards share a subgrid (header · action · features · footer aligned); Premium is the emphasized card via primary border/ring on `bg-card` (no inverted slab — it glared in dark); "Every plan includes" strip holds the shared lines once; 5-hour pacing is a real limit line from the `rolling_5h` row (`freePacing`); a Premium member's plan is first on phone; pledge links one style, pledge icons 20px in primary tiles. No surface: the public shell mounts no Agents menu or agent right-click runtime, so a manifest here could never be reached.

- **2026-08-30** — Advanced Stripe Connect creator payouts to Stripe's platform-review gate. Connect
  is enabled, the platform profile is complete, and the live/test standard webhook endpoints use
  the exact eight-event contract. Repaired the shared production webhook so
  it verifies both endpoint secrets while pinning the matching Stripe client to `event.livemode`;
  a live signature can never authorize a test event or vice versa. Added regression coverage for
  both valid ledgers and the cross-ledger rejection, installed the Stripe key matrix across all
  three Vercel projects, and released it. Saved AI Matrx branding and the corrected business website;
  live and test `account.updated` canaries both return HTTP 200. After the representative ceremony,
  Stripe reports a 2–3 day account review, disables Connect's identity/final-details controls, and
  still refuses live Express creation. The disposable live account canary follows Stripe clearance.

- **2026-08-22** — **THE EDUCATION FLIP (Q2, ruled 2026-08-19).** All 16 `education.*`
  capabilities are `enforced: true` — registry AND `billing.capability` rows flipped
  together. Live-verified both ways in the same session: a fresh (free-tier) user
  resolves 2 real windows per capability (rolling burst + monthly, e.g.
  `generate_cards` 10/5h + 30/month) with `allowed`/`cap_reached` semantics; every
  current account (336 complimentary-premium `user_plan` rows) has NO premium limit
  rows and resolves UNLIMITED — the cap lands after the aha-moment by construction and
  no existing user is touched. D-5 unbroken (core practice never metered — all 16 are
  AI generation/grading); suite 19/19, with the two "un-enforced example" fixtures
  repointed from `education.generate_cards` to `platform.points`.

- **2026-08-21** — Stripe credential resolution selects test/live by deployment identity and refuses cross-account fallback.

- **2026-08-20** — **The first tests this feature has ever had, and D-5 written down.**
  `features/entitlements/__tests__/` did not exist, in the most invariant-heavy feature in
  the stack (STATE.md §4.1 E item 16). Added: (1) **D-5, the core-practice law** — now a named
  law in this file with its source, guarded by `core-practice-never-metered.test.ts` over a
  vocabulary **derived** from the study spine (`studySpineVocabulary.ts` scans declared
  `study_session.mode` tokens), so a study mode shipped tomorrow is covered without editing the
  test; (2) **a visible limit must decrement** — `consumeEntitlement` round-trips even while
  `enforced: false`, and the consume result reaches the rendered verdict through the binding
  window; (3) **a spend path fails closed** — an enforced capability refuses on resolver error,
  no data, throw, and reject, while an un-enforced one stays permissive with no round trip.
  Enabling change: the duplicated, drifted `MODE_LABEL` maps in `sessionListDisplay.ts` and
  `SessionDetailView.tsx` were converged into one register,
  [`features/education/study/modes.ts`](../education/study/modes.ts) (which also picked up the
  eight modes both copies were missing). **No enforcement was flipped** — the free-tier numbers
  remain an open owner decision (STATE.md Q2).

- **2026-08-15** — **Fixed SQLSTATE 55000 in the shared plan resolver.**
  `billing_plan_system.sql` declared `v_lim record`, assigned it only for a
  non-NULL org plan, then referenced `v_lim.limit_value` in the condition that
  was supposed to keep user-only calls out of the plan branch. Authenticated
  `entitlement_snapshot` therefore failed at boot; `entitlement_consume` could
  also insert usage and then raise from the resolver, rolling the insert back.
  `billing_resolve_capability_optional_plan_guard.sql` replaces the conditional
  record with typed scalars and keeps every plan-only read inside the plan
  branch. Regression SQL covers user-only resolution, an org plan that has no
  opinion, a numeric plan limit, authenticated snapshot hydration, and retained
  usage after consume.
- **2026-08-14** — **The tier became a thing an ORG carries, and outreach became
  the platform's first gated capability.** Extended `billing` (never forked it):
  `billing.org_plan` (an org's tier + WHY: subscription / grant / internal /
  grandfathered), `tier_rank`/`tier_max`, `resolve_org_tier`,
  `resolve_effective_tier` (**monotonic** — THE NO-REGRESSION RULE as code),
  org-aware `resolve_capability` / `entitlement_check` (the old 2-arg forms
  delegate, behaviour byte-identical), `org_capability_status`, and super-admin
  `org_plan_set`/`org_plan_list`. Registry gained `scope`; added
  `useOrgEntitlement`, `CapabilityGate`, the per-org verdict cache
  (`setOrgCapabilityStatus`), and `requiredTier`/`organizationId` on the verdict.
  `outreach.send` registered (`minTier: trial`, `enforced: true`) and enforced in
  aidream's send gate at the capability — no outreach internals touched — with an
  `upgrade_plan` refusal that names the tier. Existing orgs mapped (AI Matrx +
  system org internal; live subs mirrored; sending-identity owners
  grandfathered). Verified live: 0 regressions across 6,660 users × 30 orgs,
  education still `permissive_stub`, free org refused with `required_tier=trial`,
  AI Matrx org allowed. Migration `billing_org_tier_authority.sql`.
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
  the bypassable `edu_class_purchase` stub. The Stripe-account activation and production webhook
  configuration landed 2026-08-30 (see §Creator payouts).
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
  the then-current Matrx Main (since retired; the live DB
is now `brsgrqvjdzwihsvnfqkf`). Flashcards consumers' `commit()` landed since (verified wired
  2026-08-17, WP12 — see capability table above).
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
