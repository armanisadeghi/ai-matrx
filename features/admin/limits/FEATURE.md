# Limits & Knobs (admin)

> 🚨 **Cross-repo system-of-record: `/Users/armanisadeghi/code/common-docs/systems/platform/feature-knobs/FEATURE.md`.**
> Read it before adding a limit anywhere, in any repo. The law behind it is
> `common-docs/policies/limits-are-knobs-agents-set-them.md` (Arman,
> 2026-08-20): *"Must be knobs not code and always per feature."* This file is
> the frontend contract only.

**Route:** `/administration/users/limits` (Users & Access → Limits & Knobs).

## Why this page exists

The policy says a limit is a row an admin can change. Without a surface, a row
is just a nicer place to hardcode a number — **if Arman cannot change it here
without a deploy, the limit is not done.** This page is that half of the rule.

## The three tabs are three different stores. Do not blur them.

| Tab | Store | The question it answers |
|---|---|---|
| **Plan allowances** | `billing.plan_limit` (write: `billing.plan_limit_set`, super-admin) | *"How much does every account on this PLAN get?"* |
| **Account add-ons** | `billing.account_addon` (write: `billing.addon_grant`, super-admin; read: platform admins under `platform_admin_all`) | *"How much MORE does this one ORG get than its plan?"* |
| **Feature knobs** | `platform.feature_knob` (write: `platform.feature_knob_set`, admin) | *"What does the PLATFORM absorb, or default to?"* |

The test is **whose number is it?** If a customer could pay to raise it, it is
an allowance (or, for one org, an add-on). Putting an allowance in a knob (or
the reverse) is how this platform grew five competing level ladders — see
`common-docs/systems/platform/entitlements-knobs/PLAN_MODEL.md`.

### An add-on only ever RAISES. A lower ceiling is a guardrail, and it is not here.

`billing.account_addon` lifts one org's limit for one capability above its
plan's row, for as long as the row is in effect (`effective_from <= now AND
(expires_at IS NULL OR expires_at > now)`). It cannot lower anything. A lower,
self-imposed ceiling is a **guardrail** the org or the person sets on their own
settings page (`features/settings/**`, `features/organizations/**` — owned
separately). This admin surface never writes a guardrail.

The add-ons tab must keep three facts on screen at once, per row: the add-on's
value, the plan's own value for that capability (`org_plan_list` → `plan_limit`),
and the difference ("raises by"). An **expired** row stays in the list and reads
as expired — it never vanishes. `org_plan_list` is super-admin only; when it
refuses, the list still renders and the plan column says *unreadable* with the
real error, never a blank.

## Rules this UI must keep

- 🚨 **Blank is UNLIMITED. `0` is "not included at all."** They are different
  facts and must never render the same way. A plan silently losing a capability
  because someone read a blank as a zero is the failure mode.
- 🚨 **A money dimension is stored in micro-dollars** (1 USD = 1,000,000),
  because `limit_value` is an integer and provider costs run to fractions of a
  cent. The admin enters dollars; the conversion lives in `types.ts` beside
  `MICRO_USD_CAPABILITIES`, once. Adding a money dimension means adding it to
  that set — nowhere else.
- 🚨 **`platform.points` is stored AND edited in points; dollars are a hint.**
  20,000 points = $1 of model spend (`POINTS_PER_USD` in `types.ts`, mirrored
  server-side in `aidream/services/billing/ai_points.py` — the two must agree).
  The admin types points; `pointsToUsdLabel()` renders "~$16.00 / month of AI"
  live beside the draft and beside the saved value. Never conflate it with
  `seo.provider_spend`, which is a different capability in micro-dollars.
- 🚨 **A capability with `enforced = false` is TRACKING ONLY, and says so in
  words** — "tracking only — does not stop anything yet" — wherever its number
  appears (`EnforcementBadge`, shared by the allowances and add-ons tabs).
  `platform.points` is tracking-only today; flipping `enforced` is Arman's call,
  never an agent's, and never this UI's.
- **Surface the reasoning, not just the number.** Every knob renders its
  `basis`, its default, its range and its review date. A limit whose reasoning
  is invisible gets "fixed" by the next person who finds it inconvenient.
- **An overdue review is rendered as a defect**, in red, with a count at the
  top. The policy says a knob past its review date still carrying an
  agent-set value IS a defect; this is where it is visible.
- **Never swallow the database's error.** Both setters validate type, range and
  enum membership server-side and return a message that names the knob and the
  bound. That message is the useful one — surface it verbatim.
- **Reset is always available.** `feature_knob_set(…, null)` restores the
  agent-set default, so an admin's experiment is reversible without a migration.

## Files

| Path | Role |
|---|---|
| [`types.ts`](./types.ts) | Row shapes, the micro-dollar declaration, the points↔dollar constant, `addonIsInEffect`. |
| [`service.ts`](./service.ts) | Client-direct Supabase reads; writes through the three admin-gated RPCs (`feature_knob_set`, `plan_limit_set`, `addon_grant`). |
| [`components/LimitsAdminClient.tsx`](./components/LimitsAdminClient.tsx) | The three-tab shell, with quiet links to the two usage surfaces (`/administration/knowledge/kg-cost`, `/administration/users/usage`) so this is never a disconnected third place. |
| [`components/PlanAllowancesPanel.tsx`](./components/PlanAllowancesPanel.tsx) | The grid that IS the free tier; exports `EnforcementBadge`. |
| [`components/AccountAddonsPanel.tsx`](./components/AccountAddonsPanel.tsx) | Per-org grants (list + grant dialog with searchable org picker) over `billing.account_addon` / `addon_grant` / `org_plan_list` / `iam.organizations`. |
| [`components/FeatureKnobsPanel.tsx`](./components/FeatureKnobsPanel.tsx) | Operational ceilings and defaults, with basis and review state. |

Read-only sibling: **Entitlements & Usage** (`/administration/users/entitlements`,
`features/admin/users/components/EntitlementsTableClient.tsx`) — enforcement
flags and the 30-day usage rollup.

## Propagation (2026-09-11)

A knob write publishes nothing from this UI. `platform.feature_knob.propagation` decides per key:
`next_load` (default) rides the 60s knob TTL; `instant` fires the platform client-directive
channel from a DB trigger, and `FeatureKnobsPanel` opts in with one
`registerDirectiveHandler("settings_changed", …)` so an open table re-reads without a reload.
Contract: `../../../../common-docs/systems/platform/realtime/CLIENT-DIRECTIVES.md`.

## Scoped configuration (2026-08-29)

Every knob row now shows **who may override it** — `overridable_by`
(platform-locked / org / org+user, with `override_direction`) — and a live
**override count** from `platform.knob_override_count`, merged into the same
load. The scoped system's SoR is
`../../../../common-docs/systems/platform/feature-knobs/FEATURE.md`; client
primitives live in [`lib/scoped-config/`](../../../lib/scoped-config/service.ts).
Overridability is CURATED in dedicated migrations (never a seed's on-conflict);
this panel edits values, not scopes.

## Complete-register reads (2026-08-29)

The knob list is the COMPLETE platform register (400+ rows and growing), so
`fetchFeatureKnobs` pages via `readAllRows` (`@ai-matrx/data/db`) — a bare
`.select()` silently caps at 1000 and would hide whole features (the D190
class). Ordered by the `(feature, key)` PK so pages never overlap.
