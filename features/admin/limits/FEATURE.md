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

## The two tabs are two different stores. Do not blur them.

| Tab | Store | The question it answers |
|---|---|---|
| **Plan allowances** | `billing.plan_limit` (write: `billing.plan_limit_set`, super-admin) | *"How much does this ACCOUNT get?"* |
| **Feature knobs** | `platform.feature_knob` (write: `platform.feature_knob_set`, admin) | *"What does the PLATFORM absorb, or default to?"* |

The test is **whose number is it?** If a customer could pay to raise it, it is
an allowance. Putting an allowance in a knob (or the reverse) is how this
platform grew five competing level ladders — see
`common-docs/systems/platform/entitlements-knobs/PLAN_MODEL.md`.

## Rules this UI must keep

- 🚨 **Blank is UNLIMITED. `0` is "not included at all."** They are different
  facts and must never render the same way. A plan silently losing a capability
  because someone read a blank as a zero is the failure mode.
- 🚨 **A money dimension is stored in micro-dollars** (1 USD = 1,000,000),
  because `limit_value` is an integer and provider costs run to fractions of a
  cent. The admin enters dollars; the conversion lives in `types.ts` beside
  `MICRO_USD_CAPABILITIES`, once. Adding a money dimension means adding it to
  that set — nowhere else.
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
| [`types.ts`](./types.ts) | Row shapes + the micro-dollar declaration. |
| [`service.ts`](./service.ts) | Client-direct Supabase reads; writes through the two admin-gated RPCs. |
| [`components/LimitsAdminClient.tsx`](./components/LimitsAdminClient.tsx) | The two-tab shell. |
| [`components/PlanAllowancesPanel.tsx`](./components/PlanAllowancesPanel.tsx) | The grid that IS the free tier. |
| [`components/FeatureKnobsPanel.tsx`](./components/FeatureKnobsPanel.tsx) | Operational ceilings and defaults, with basis and review state. |

Read-only sibling: **Entitlements & Usage** (`/administration/users/entitlements`,
`features/admin/users/components/EntitlementsTableClient.tsx`) — enforcement
flags and the 30-day usage rollup.
