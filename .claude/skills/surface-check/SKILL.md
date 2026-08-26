---
name: surface-check
description: Run THE full UI surface check on one surface — registration, values, write targets, inheritance/identity, invoked-agent parity and cost, the agent-self-context boundary, the canonical context menu, ProTextarea + text-stats decisions, header clearance, mobile, theme, states, dead ends, UI standards, metadata, data flow, access, AI laws, docs — FIX what fails (you are empowered), verify live on desktop + mobile + both themes, then LOG the check on the surface's `ui.ui_surface` row so the rolling cycle knows when it was last done. Use whenever the task is "check surface X", "surface check", "full UI check on /route", "audit this page", "do the checklist on X", or a rolling-cycle dispatch with no name (pick the stalest). The checklist itself is CHECKLIST.md beside this file — one centralized list that points to the owning skill per section; this skill is the driver. NOT for building a brand-new surface from nothing (surface-authoring first).
---

# surface-check — the driver for THE UI SURFACE CHECKLIST

**Read [`CHECKLIST.md`](./CHECKLIST.md) once. It is the one list.** This file is
how you run it on a surface end to end without coming back with questions.

## The doctrine (Arman, 2026-08-22 — quoted)

- _"When a surface passes, then we know it absolutely meets all of these things."_ Every section gets a verdict; "didn't look" is a fail.
- _"These are agents who are gonna be empowered to also fix and improve and enhance."_ You fix. A finding without a fix is only acceptable when the fix is an ARMAN-class decision (product semantics) — then you log a chip / review row and keep going.
- _"If they come back to me with questions, that just kills the whole thing."_ The checklist's DECIDE rules exist so you never ask. Decide by the rule, log the decision, move on.
- _"Have a way to know which ones haven't been checked in a long time or have never been checked."_ Every run ends by writing the ledger row. An unlogged check did not happen.

## Invocation

`/surface-check <surfaceName | route | overlayId>` — or nothing: **pick the stalest**.

**Fleet eligibility comes first.** A rolling or live-UI fleet skips every
agent-native surface: Chat, Agents Hub, Agent Apps, Agent Build/Run/Battle,
mandate authoring, agent comparison/history, and agent/widget test harnesses.
Replace it with the next ordinary product surface. A direct user-requested UI
check may inspect one, but S5 is the agent-native exclusion—not authority to add
roles, bindings, disclosure, or agent UI.

```sql
-- stalest first: never-checked, then oldest; skip rows claimed in the last 6h
select name, label, readiness, last_checked_at, check_claimed_at
from ui.ui_surface
where is_active
  and (check_claimed_at is null or check_claimed_at < now() - interval '6 hours')
order by last_checked_at nulls first, sort_order, name
limit 5;
```

Run via Supabase MCP `execute_sql` (project `brsgrqvjdzwihsvnfqkf`). Pick the first; a dispatcher may hand you a slice (`name like 'matrx-user/marketing-%'`).

## Step 0 — Claim (first action)

```sql
update ui.ui_surface set check_claimed_at = now(), check_claimed_by = '<agent/session id>' where name = '<surface>';
```

A claim < 6h old by someone else → take the next row. Never two agents on one surface.

## Step 1 — Gather, briefly (≤ 10 minutes)

1. Manifest (`features/surfaces/manifests/<x>.manifest.ts`) → label, readiness, inheritsFrom, values, writeTargets, urlPattern/overlayId.
2. The route (`route-to-surface.ts`) and the feature dir (`app/... → features/<name>/`); its `FEATURE.md` + Change Log; `docs/handoffs/*` mentioning it.
3. Last ledger entry: `select last_check from ui.ui_surface where name = …` — prior failures first.
4. **If you have the browser** (see below): open the page (`pnpm preview:start`, dev-login), desktop 1280×800, right-click once with the console open. Most of the checklist is statically decidable, so a headless run still delivers most of the value — do not stall on this step.

**Browser availability.** ONE dev server + one browser pane exist machine-wide. If you were dispatched alongside other agents, assume you do NOT hold them: never `preview:start`/`stop`, do the static checks for S8/S9/S10, and record `deferred-visual` with the exact thing to look at. If you are the only agent, hold the lease and verify live.

## Step 2 — Run S1 → S18 in order, fixing as you go

For each section in CHECKLIST.md: invoke the owning skill when you touch that area (they hold the rule bodies and the verification protocol), run the named check commands scoped to this surface's files, fix, re-run. Record one of:
`pass` · `fixed` (what, commit) · `na` (one-line why) · `deferred-visual` (code done + statically checked; name the exact eyes-on step) · `arman` (decision needed → chip id / review row) · `blocked` (what blocks, never "unclear").

Rules while fixing:

- Reuse → Extend → Compose → Create. Invoke `no-dead-ends` before building any surface; `context-docs` before editing any FEATURE.md; `code-splitting` before any dynamic import; `supabase-realtime` before any `.channel(`; `type-safety` for any type error.
- Never remove, rename, or hide a feature to make a section pass (THE LOSSLESS LAW). Never disable a check. Never `eslint-disable`.
- Batch commits per section (`git add <your files>` → `git commit --only -m "surface-check(<surface>): S6 context menu — …"`), push often. Shared checkout: never tree-wide git ops; never verify a variant by editing a production file in place.
- Periodic integration, type-sync, and release sweeps do not pause the check.
  Checkpoint the coherent owned set and continue immediately. Suspend only an
  exact overlapping path while it is isolated; keep all non-overlapping work moving.
- Mobile = in-app browser at 375×812 (`resize_window` mobile preset), both themes (`document.documentElement.classList.toggle('dark')`).

## Step 3 — Verify live (non-negotiable)

Screenshots: desktop + mobile, light + dark, top edge of page visible (S8), context menu open (S6), long-press sheet (S9). Console: zero `INERT MENU` / `VALUE MAPPING GAP` screams, zero hydration errors. `pnpm type-check` clean for your files. Error Inspector clean on a normal load.

## Step 4 — Log it (the ledger)

```sql
update ui.ui_surface set
  last_checked_at   = now(),
  last_checked_by   = '<agent/session id>',
  last_check        = '{
    "checklistVersion": 1,
    "commit": "<sha>",
    "result": "pass" | "pass-with-arman-items" | "fail",
    "verificationDepth": "static" | "live",
    "sections": { "S1": {"status":"pass"}, "S2": {"status":"fixed","note":"added 3 values, 1 always"}, …, "S18": {"status":"pass"} },
    "armanItems": ["<chip/review id>: <one line>"],
    "notes": "<≤ 3 lines>"
  }'::jsonb,
  check_claimed_at  = null,
  check_claimed_by  = null
where name = '<surface>';
```

`result = pass` requires every section `pass`/`fixed`/`na`; any `deferred-visual` keeps the result but sets `verificationDepth: "static"` — so a green row never overstates what was actually seen. `last_checked_by` is `agent:surface-check/<surface-local-slug>` (one format, so the ledger is queryable). Then: `agent-review-queue` row for anything Arman must go see; `spawn_task` chips for tangential work; FEATURE.md Change Log line `surface-check <date>: <result> (<n> fixes)`.

Admin view of the ledger: `/administration/ui/surfaces` (Last checked column, never-checked filter — see the skill's open items if not yet built).

## What is ARMAN-class (log, don't ask)

Product semantics only: **creating a new parent surface or re-homing one in the hierarchy** (and anything that edits a SIBLING's manifest — you were scoped to one surface and other agents may be inside the others), whether a feature exists, a grouping of menu rows not yet approved, and whether a text field's length _matters_ when THE LENGTH RULE is genuinely ambiguous (default: ON if `typicalCharCount` ≥ 1,000, else OFF — log it). Agent-native exclusion is absolute, never ARMAN-class.

NOT Arman-class — decide these yourself: whether THIS surface's existing `inheritsFrom` is correct, its own label/readiness/groups, every value and write target it should declare, and every fix the sections name. Everything else has a rule — apply it.

## The blast-radius screamer — run it BEFORE you touch vocabulary

`pnpm check:surface-impact <surface>` is the only thing in the repo that can see
who is mapped to a Surface Value, because a value is a NAME that outside things
bind to by string and TypeScript never sees it. It reads the live DB and reports
five consumer kinds — agent bindings (`platform.associations`), shortcut
mappings (`agent.shortcut`, checked by nothing else), write twins
(`updates_value`), `data-surface-value` DOM attributes, and descendants — plus
`SHADOWED_VALUE` where a child re-declares what its parent conveys.

Per-value verdicts: `DO NOT RENAME/REMOVE` (live consumers) · `inherited —
changes ripple` (descendants depend on the name) · `safe to change`.

Rules: run it before AND after any vocabulary change; `--strict` exits 1 on
breakage; every consumer it lists is migrated in the SAME change. A baseline
name on a `skipBaselineValues` surface is a WARN (the launch floor fills it) —
never "fix" that by re-adding baselines to a surface that deliberately opted out.
It is also an advisory release gate ("Surface value blast radius").

## Open items for this system (build when you hit them; chip if out of scope)

1. ~~Ledger columns~~ — LIVE (`ui.ui_surface.last_checked_at / last_checked_by / last_check / check_claimed_at / check_claimed_by`).
2. ~~`/administration/ui/surfaces` Checked column + never/stale filter~~ — LIVE (sortable; never-checked first). Still missing: the per-section result popover reading `last_check.sections`.
3. `pnpm check:textareas` ratchet — non-Pro textarea count per feature, baseline only goes down (S7 has no guard today; ~528 sites).
4. Structural guards for S5 — (a) an eslint rule or test that every `launchAgentExecution`/`launchMandate` call inside an agent-purpose feature passes `surfaceName: null` or a literal string (never `undefined`); (b) a static candidate report that compares explicit Mandate/agent launch points with manifest roles and live bindings. Historical tool-call reduction still requires runtime telemetry, so the static report is a scout, not proof.
5. Add a structural campaign-eligibility guard so agent-native routes cannot enter rolling/live-UI fleets; until it lands, the explicit eligibility gate above is mandatory.
6. `create<X>Scope` builders are hand-written and drift silently — nothing validates that a builder's param keys match its manifest's value names. A generated `ValueNameOf<M>` type would make a rename a compile error.
