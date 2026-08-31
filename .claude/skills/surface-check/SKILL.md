---
name: surface-check
description: Run THE full UI surface check on one assigned surface — fix every failed section, produce durable checklist evidence, and prove the real surface on desktop and mobile in light and dark. Use for a named surface check or a `surface-certification` Work Loop item. The independent verifier, never the builder, writes final certification. NOT for fleet selection or claims (use surface-certification-loop), or for building a brand-new surface from nothing (surface-authoring first).
---

# surface-check — the driver for THE UI SURFACE CHECKLIST

**Read [`CHECKLIST.md`](./CHECKLIST.md) once. It is the one list.** This file is
how you run it on a surface end to end without coming back with questions.

## The doctrine (Arman, 2026-08-22 — quoted)

- _"When a surface passes, then we know it absolutely meets all of these things."_ Every section gets a verdict; "didn't look" is a fail.
- _"These are agents who are gonna be empowered to also fix and improve and enhance."_ You fix. A finding without a fix is only acceptable when the fix is an ARMAN-class decision (product semantics) — then you log a chip / review row and keep going.
- _"If they come back to me with questions, that just kills the whole thing."_ The checklist's DECIDE rules exist so you never ask. Decide by the rule, log the decision, move on.
- _"Have a way to know which ones haven't been checked in a long time or have never been checked."_ Every verifier-passed run ends by writing the ledger row. An unlogged check did not happen; an unverified worker run is only a candidate.

## Invocation

`/surface-check <surfaceName | route | overlayId>` or a claimed
`surface-certification` Work Loop contract.

**This skill never selects or claims fleet work.** In an autonomous run, the
`work_loop(action="claim")` result is the sole claim authority. Do not query or
update `ui.ui_surface.check_claimed_*`; those columns are a legacy display aid,
not a lock. No target in the claimed contract means no work: return to the
coordinator for another atomic claim. A direct human request may name a surface
without Work Loop, but it still needs independent verification before it is
certified.

**Fleet eligibility comes first.** A rolling or live-UI fleet skips every
agent-native surface: Chat, Agents Hub, Agent Apps, Agent Build/Run/Battle,
mandate authoring, agent comparison/history, and agent/widget test harnesses.
Replace it with the next ordinary product surface. A direct user-requested UI
check may inspect one, but S5 is the agent-native exclusion—not authority to add
roles, bindings, disclosure, or agent UI.

## Step 1 — Gather, briefly (≤ 10 minutes)

1. Manifest (`features/surfaces/manifests/<x>.manifest.ts`) → label, readiness, inheritsFrom, values, writeTargets, urlPattern/overlayId.
2. The route (`route-to-surface.ts`) and the feature dir (`app/... → features/<name>/`); its `FEATURE.md` + Change Log; `docs/handoffs/*` mentioning it.
3. Claimed contract + last ledger entry: `select last_check from ui.ui_surface where name = …` — prior failures and the contract's required rule version first.
4. Open the page (`pnpm preview:start`, dev-login), desktop 1280×800, right-click once with the console open.

**Browser availability.** Live proof is a completion gate. If the isolated in-app
Browser is unavailable, finish safe static repairs, record the exact missing
proof, and settle the Work Loop item with `retry`; never complete it and never
write certification. The host has one machine-wide in-app Browser, so parallel
workers may share neither a tab nor browser state: the certification coordinator
serializes the live Browser lane while static audits, repairs, and tests remain
parallel. Use it only while the coordinator has granted this claim ownership.
Each live pass starts from a fresh isolated session, closes its tabs, and resets
Browser state before the next worker or verifier receives the lane. Evidence
captured during overlapping Browser use is invalid and must be rerun.

## Step 2 — Run S1 → S18 in order, fixing as you go

For each section in CHECKLIST.md: invoke the owning skill when you touch that area (they hold the rule bodies and the verification protocol), run the named check commands scoped to this surface's files, fix, re-run. Record one of:
`pass` · `fixed` (what, commit) · `na` (one-line why) · `deferred-visual` (code done + statically checked; name the exact eyes-on step) · `arman` (decision needed → chip id / review row) · `blocked` (what blocks, never "unclear").

`deferred-visual`, `arman`, or `blocked` is an honest worker verdict but not a
certification verdict. It settles as `retry` or `defer`, never `complete`.

Rules while fixing:

- Reuse → Extend → Compose → Create. Invoke `no-dead-ends` before building any surface; `context-docs` before editing any FEATURE.md; `code-splitting` before any dynamic import; `supabase-realtime` before any `.channel(`; `type-safety` for any type error.
- Never remove, rename, or hide a feature to make a section pass (THE LOSSLESS LAW). Never disable a check. Never `eslint-disable`.
- Batch commits per section (`git add <your files>` → `git commit --only -m "surface-check(<surface>): S6 context menu — …"`), push often. Shared checkout: never tree-wide git ops; never verify a variant by editing a production file in place.
- Periodic integration, type-sync, and release sweeps do not pause the check.
  Checkpoint the coherent owned set and continue immediately. Suspend only an
  exact overlapping path while it is isolated; keep all non-overlapping work moving.
- Mobile = in-app browser at 375×812 (`resize_window` mobile preset), both themes (`document.documentElement.classList.toggle('dark')`).

## Step 3 — Verify live (non-negotiable)

Use the real route or overlay with representative real data, never a manufactured
test-only state. Capture four fresh viewport/theme proofs: desktop light,
desktop dark, mobile light, mobile dark. The set also proves the top edge (S8),
desktop context menu (S6), and mobile long-press sheet (S9). Record the tested
URL/overlay, fixture identity, timestamp, commit, and a durable reference for
each artifact (file/attachment id, persisted browser artifact, or committed
path; never an expiring signed URL). Console: zero `INERT MENU` / `VALUE MAPPING
GAP` screams and zero hydration errors. `pnpm type-check` clean for your files.
Error Inspector clean on a normal load. Static analysis or a `deferred-visual`
verdict can support repair, but can never satisfy this step.

**A clean load is not a workflow proof.** For every primary user outcome and
each declared write target, run one representative real-data path end to end
(or the contract's safe restored canary), wait for every asynchronous action to
settle, and inspect the resulting UI, console, and Error Inspector again. A
button click, spinner, optimistic state, or session-complete shell is not proof
that the downstream agent/write succeeded. Record the terminal result and
restore the canary. If an unsafe side effect cannot be restored, the item
contract must provide a safe fixture; never silently skip the outcome.

The tested dependency graph must be reproducible from the recorded commit. A
workspace package build copied over `node_modules`, an unpublished package
subpath, a locally patched install, or any other future-only dependency overlay
may unblock diagnosis but is not certification evidence. Publish and adopt the
package (or use the released API), perform a clean install/preview, and rerun the
entire live matrix. Otherwise settle `retry` with the exact package boundary.

The preview must also prove it is serving that checkout, not merely answer on
the expected port. Before treating a route response as evidence, record the
preview checkout SHA, confirm Next's inferred workspace root is that checkout,
and confirm the generated app-path manifest contains the target. A parent
directory's unrelated lockfile can make Next infer the wrong root and return a
confident 404 for a real route. Move the clean checkout outside that poisoned
parent or repair the managed preview; never count the 404 or the repaired reload
until the served root and SHA match.

## Step 4 — Submit a certification candidate

```json
{
  "surfaceName": "matrx-user/<local-slug>",
  "checklistVersion": 2,
  "ruleVersion": "<required by claimed contract>",
  "commit": "<sha>",
  "worker": "agent:surface-check/<surface-local-slug>",
  "workerResult": "candidate-pass",
  "verificationDepth": "live",
  "sections": {
    "S1": {"status": "pass", "evidence": ["<durable ref>"]},
    "S2": {"status": "fixed", "note": "added 3 values, 1 always", "evidence": ["<durable ref>"]}
  },
  "liveProof": {
    "desktopLight": "<durable ref>",
    "desktopDark": "<durable ref>",
    "mobileLight": "<durable ref>",
    "mobileDark": "<durable ref>",
    "contextMenu": "<durable ref>",
    "longPress": "<durable ref>",
    "console": "clean at <timestamp>",
    "errorInspector": "clean at <timestamp>",
    "target": "<route or overlay + representative record>"
  },
  "notes": "<3 lines max>"
}
```

Every S1–S18 key is mandatory; `na` carries a reason. `candidate-pass` requires
only `pass`/`fixed`/`na`, checklist version 2, the contract's current rule
version, and all live-proof fields. Send this candidate through Work Loop
`complete`; the service creates the independent verifier. **The worker never
writes `last_checked_at`, `last_checked_by`, or a final `result: pass`.** For a
direct human-requested run, dispatch a fresh verifier before ledger promotion.

The verifier starts from a fresh Browser session and current checkout, reads the
original claimed contract plus worker candidate, attacks the changed surface,
and re-runs the live matrix. It does not repair its own finding. Rejection names
the failed section and durable evidence; Work Loop creates repair/retry work.
Only a passed verifier writes `ui.ui_surface.last_checked_*` with the candidate,
`verifier`, `verifiedAt`, and `result: "pass"`, then releases any legacy display
claim fields. This makes the ledger the durable per-surface checklist without
letting the builder certify itself.

Then: `agent-review-queue` row for anything Arman should sample; `spawn_task`
chips for tangential work; FEATURE.md Change Log line `surface-check <date>:
candidate (<n> fixes)` and, after verifier promotion, `certified r<ruleVersion>`.

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

1. ~~Ledger columns~~ — LIVE (`ui.ui_surface.last_checked_at / last_checked_by / last_check`; `check_claimed_*` is display-only, never lock authority).
2. ~~`/administration/ui/surfaces` Checked column + never/stale filter~~ — LIVE (sortable; never-checked first). Still missing: the per-section result popover reading `last_check.sections`.
3. `pnpm check:textareas` ratchet — non-Pro textarea count per feature, baseline only goes down (S7 has no guard today; ~528 sites).
4. Structural guards for S5 — (a) an eslint rule or test that every primary `launchAgentExecution`/`launchMandate` call inside an agent-native feature passes `surfaceName: null` (never `undefined` or a literal surface); an ordinary nested child must be explicitly classified as an eligible ordinary surface before it may pass its literal name; (b) a static candidate report that compares explicit Mandate/agent launch points with manifest roles and live bindings. Historical tool-call reduction still requires runtime telemetry, so the static report is a scout, not proof.
5. Add a structural campaign-eligibility guard so agent-native routes cannot enter rolling/live-UI fleets; until it lands, the explicit eligibility gate above is mandatory.
6. `create<X>Scope` builders are hand-written and drift silently — nothing validates that a builder's param keys match its manifest's value names. A generated `ValueNameOf<M>` type would make a rename a compile error.
