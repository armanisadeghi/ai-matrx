# Change Policy (C-18)

**Status:** Live
**Tier:** Platform (Dynamic Agent Graph program, slice S3)
**Last updated:** 2026-08-16

## Purpose

How an organization wants each kind of AI-proposed change handled — the
concrete screen for the "oversight as settings" decision (dynamic-agent-graph
design v2, Part 0.10). Every change the self-improvement machinery (Hindsight,
Internal Affairs, attribution, …) can make is a ROW in a catalogue; the org
picks a handling mode per row (or per risk tier); one SQL function —
`platform.resolve_change_handling(change_type_key, organization_id)` — is the
enforcement point every apply path consults. **The page is just that
function's editor.**

## The pieces

| Piece | Where | Owns |
|---|---|---|
| `catalogue.ts` | this dir | **THE SOURCE OF TRUTH.** 41 rows transcribed from design v2 Part 0.10 + consumer-registered rows (row 42 `outreach.attribution_credit`). Keys are the platform contract — never rename a shipped key. Tier metadata incl. D-13 timeout-expiry defaults. |
| `generate-seed.ts` | this dir | Emits the idempotent seed for `platform.change_type_default` FROM the catalogue (`pnpm tsx features/change-policy/generate-seed.ts`); `--check` diffs catalogue vs live DB and exits 1 on drift. Apply the seed via the Supabase MCP in the same session you edit the catalogue. |
| `service.ts` | this dir | Reads (direct Supabase, RLS) + the ONE write path `platform.set_org_change_policy` + `resolve_change_handling` + admin divergence RPC. All via `.schema("platform")`. |
| `components/ChangePolicySurface.tsx` | this dir | The org surface: tier presets first (D-16), advanced-overrides drawer (diverged-only by default), per-row timeout controls, floored row 38, non-admin request card. |
| `components/AdminChangePolicyView.tsx` | this dir | Admin twin: read view of platform defaults + per-org divergence, each org a door. |
| Org page | `app/(core)/organizations/[orgId]/settings/change-policy/page.tsx` | Any member can view + request; owners/admins edit. Summary SectionCard + nav entry in `OrgManage.tsx` (`id="change-policy"`). |
| Admin page | `app/(admin)/administration/users/change-policy/page.tsx` | Registered in `admin-categories.ts` + `admin-navigation.ts` (Users → Accounts & Access). |
| DB | `migrations/change_type_policy_c18.sql` + `change_type_default_seed_c18.sql` | `platform.change_type_default` (mirror of the catalogue) · `platform.org_change_policy` (org overrides; RLS member-read, NO authenticated write — the RPC is the only write path) · resolver · write RPC · divergence RPC. Applied live 2026-08-16, ledgered. |
| aidream consumer | `aidream/aidream/services/change_policy.py` | Thin `matrx_orm.call_function` shim; consulted by `services/hindsight/apply.py` (apply + revert) and `services/outcome_attribution/disposition.py`. |

## Resolver semantics (as implemented, live-verified)

1. **Row-38 structural floor first** (research finding #4): key
   `change_own_handling_mode` returns `off / floored / human_only /
   source=structural_floor` BEFORE any table read. A smuggled org row for that
   key is ignored (proven live). Any future `floor_human_only` row gets the
   same treatment as defense in depth.
2. **Org override beats platform default**; absent org row falls through to
   `platform.change_type_default` (seeded from the catalogue).
3. **Unknown key RAISES** (`P0002`, names the catalogue) — never a silent
   permissive default (loud-recovery law).
4. Timeout fields are only populated when the resolved mode is
   `review_with_timeout`; org rows may leave them null and inherit the
   platform window (2880 min) and the tier's D-13 expiry (proceed for Tier 1
   only, hold above).

## Write-path rules (`platform.set_org_change_policy`)

- Org **owner/admin only** (`iam.organization_member`).
- **Human actor tier only** — `platform.actor_tier()` (C-11 provenance session
  vars) must be `human`; writing a policy row IS change-type 38, so an `ai` or
  `code` actor is rejected outright, even an org owner's session.
- **Floored keys rejected for everyone**, including humans — row 38 has no
  legal override.
- `handling_mode = null` clears the override (back to platform default).
- Timeout params valid only with `review_with_timeout`.
- Returns `{success, cleared, resolved}` — the resolved policy is echoed so
  callers never guess.
- Provenance: `_stamp_actor_tier` + `_touch` triggers stamp
  `created_by_tier`/`updated_by_tier` on every row.

## Doctrine

- **The row list is CODE; org choices are DATA.** New change type → add a
  catalogue row, run the generator, apply the seed via MCP, done. Never
  hand-insert into `change_type_default`.
- **Never a second resolver.** Anything deciding "may this change proceed?"
  calls `platform.resolve_change_handling` (SQL) or
  `aidream.services.change_policy.resolve_change_handling` (Python). A local
  default beside a consumer is the fork D-W4-9 forbids.
- **Human-click applies are advisory consults** (provenance A-2: the click is
  the approval) — hindsight apply/revert consult + record
  `metadata.resolved_handling` / `metadata.revert_resolved_handling` but do
  not block. A future non-human apply path MUST gate on the resolved mode.

## Known deltas / notes

- **Row 25 doc correction** (03-ui-surfaces §2): the design doc's "(plus the
  existing context-starved code reviewer)" — that reviewer NOW EXISTS (D-18,
  built 2026-08-15, pinned version `1215a990-…`) but is **not wired into any
  apply path**, so row 25 ships as plain Review. When the reviewer is wired,
  update the row's note + this file.
- The advanced-overrides drawer uses tier-grouped settings primitives
  (SettingsSegmented rows) rather than a `MatrxDataTable` grid — an inline
  5-way segmented control per row is not usable inside a dense table on
  mobile (ios-mobile-first). `MatrxDataTable` carries the admin twin, where
  rows are read-only and density is the point.
- Modes vocabulary (`off | automatic | review | review_with_timeout |
  auto_with_audit`) is shared verbatim with aidream's
  `outcome_attribution/disposition.py` and the DB CHECK constraints — change
  it in all three places or not at all.

## Change log

- 2026-08-16 — Bounded the seed generator's dynamic `.env.local` filesystem
  root for Turbopack so importing the utility cannot trace the whole repository
  into a server bundle.
- 2026-08-16 — Built end-to-end (C-18): catalogue, DB (tables/RPCs/resolver,
  live + ledgered), org surface, admin twin, aidream consult wiring.
