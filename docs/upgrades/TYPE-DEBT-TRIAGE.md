# Type-Debt Triage — the human-in-the-loop wave (Track B2-H)

> The strictness waves (STRICTNESS-WAVE-HANDOFF.md) grind errors **tsc can see**. This track
> grinds the debt tsc can NOT see: escape hatches and silent coercions that made errors
> disappear without fixing the data. These fixes are different in kind — many require a
> **human decision** (architecture, wire-contract, "what shape does Python actually need"),
> so the pipeline is triage → decision briefs → Arman decides → fix waves.
> Doctrine: the **`type-safety`** skill (`.claude/skills/type-safety/SKILL.md`).
>
> **Last updated:** 2026-07-01 · **Status:** first fleet run complete (see "Fleet run" below).

## Fleet run 2026-07-01 (wf_c21078c7-29c) — the pipeline works

14 Sonnet agents over disjoint scopes, in the `type-fleet` worktree, each under the
type-safety contract (fix mechanical, brief decisions, no tsc, no new hatches).
Results, independently verified by the ratchet:

- **~900 hatches removed** (total 7,753 → 6,851), **every category green**, zero growth.
  Biggest cuts: `: any` −261, `value!` −184, `as unknown as` −127, `as any` −101,
  `?? {}` −54, `Record<string, any>` −44 (the +2 red cleared).
- **27 decision briefs** escalated instead of silenced →
  [`type-debt/2026-07-01-fleet-briefs.md`](./type-debt/2026-07-01-fleet-briefs.md)
  (**PENDING Arman review**). Standouts: a hook calling two service methods that don't
  exist (`useContextItems` → phantom `contextService` contract), `useWakeWord` referencing
  an uninstalled Picovoice package (runtime ReferenceError, 3 live consumers), selectors
  reading a `brokerValues` Redux slice that is registered nowhere, and three RPCs tangled
  under one type alias in the legacy entity middleware.
- **Cost of blind fixing:** 61 residual tsc errors from ~906 fixes (~7%), repaired by a
  10-agent follow-up wave with exact error text; `@ts-nocheck` removals that didn't hold
  were reverted per the deletion-backlog policy.
- One agent (`ts-ignore-sweep`) lost to a provider rate-limit — its category was
  deprioritized to deletion-backlog anyway.

## The contract (non-negotiable)

- **Escalation is success; silencing is failure.** An agent that stops and files a decision
  brief has done its job. An agent that makes an error disappear with a cast/coercion and
  claims victory has caused damage.
- **Phase 1 agents make NO code changes.** Inventory and classification only.
- **Every brief traces to the terminal consumer** — the Python model / DB column / renderer
  where the data ends up (read the aidream code if that's the destination). A brief without
  "Consumed by" is incomplete. The shape question is answered at the destination.

## Current state (2026-07-01, post-fleet)

- `pnpm type-check`: **0 errors** (Wave 5 closed by the pilot deep fix; fleet residue
  repaired by the follow-up wave).
- Ratchet: total **~6,850** across 14 categories, baseline re-frozen post-fleet
  (down-only). Run `pnpm check:hatches` for live numbers.
- **Open:** 27 fleet briefs PENDING review (`type-debt/2026-07-01-fleet-briefs.md`);
  Wave-5-era `?? ""`/`|| []` additions partially audited by the regression agent —
  remainder rides future feature-scoped passes.

## Pipeline

### Phase 1 — Inventory (agents, read-only)

Per feature area: `pnpm check:hatches <path>` lists every occurrence (`file:line` + snippet).
For each occurrence the agent classifies:

- **(a) Mechanical** — a canonical fix exists and changes no behavior contract (e.g. delete
  a redundant cast, `Json` field → Pattern 4 guard, `!` → narrow-after-error-guard). Goes
  straight to a Phase 3 fix list. No decision needed.
- **(b) Decision-needed** — fixing requires choosing an architecture, changing a wire
  contract, a DB backfill, or deciding whether the current format works 100% of the time at
  the destination. The agent writes a **decision brief**:

```
### BRIEF: <file>:<line> — <category>
**Data:** what value/shape is in question
**Produced by:** every construction/write site found (paths)
**Consumed by:** terminal destination(s) — Python model / DB column / renderer (paths, incl. aidream)
**Conflict:** what the contract says vs what the code/data actually does
**Decision needed:** the specific question, as A-vs-B with implications
**Status:** PENDING
```

Briefs live in `docs/upgrades/type-debt/<feature-area>.md` (one file per area, briefs
appended, statuses inline: `PENDING → DECIDED: <verdict> → FIXED (<commit>)`).

### Phase 2 — Decision (Arman)

Review a brief file, write the verdict into each brief's `Status:` line. Batch-friendly:
a brief that is well-formed takes a minute to decide; a malformed one goes back with
`REJECTED: incomplete — trace the consumer`.

### Phase 3 — Fix (agents, deep-fix mode)

Execute DECIDED briefs + the mechanical lists per the `type-safety` skill (Required
Sequence: expose to the truth → fix code → validate ingress → backfill → audit). After each
area lands: `pnpm check:hatches --update` re-freezes the shrunk categories (never a grown
one). When a category hits 0 it graduates to a hard ESLint error and leaves the ratchet.

## Category strategy

| Category | Count | Strategy |
|---|---|---|
| `@ts-nocheck` 21 / `@ts-ignore` 51 / `@ts-expect-error` 6 | 78 | **Do NOT fix (Arman, 2026-07-01): deliberate markers on known-dead old code awaiting deletion.** The debt is the code's existence, not its types — the fix is deletion (Arman's call, per the no-legacy-code rule). The ratchet still blocks NEW ones; grinding existing ones is wasted effort. |
| `as any` 314 / `<any>` 175 | 489 | Full sweep, mostly mechanical; decision briefs for the rest. |
| `as unknown as` 685 | 685 | **Guard-aware triage**: DB-guarded RPC casts are sanctioned (supabase-patterns.md); whole-row Json nukes are the #1 target (→ Pattern 4). |
| `: any` 1,473 / `Record<string, any>` 240 | 1,713 | Feature-scoped sweeps; registries/handler maps may earn a documented `MATRX-EXCEPTION`. |
| `value!` 641 | 641 | Mechanical majority (narrow after error-guard); briefs where null is load-bearing. |
| `?? {}` / `|| {}` / `|| []` | 1,180 | The "empty shape pretending to be data" class — high decision density; destination-trace each. |
| `?? ""` / `|| ""` | 2,967 | Huge, mixed with legit display defaults. Do NOT full-sweep — fix opportunistically in touched files + ratchet holds the line; triage only at data boundaries (writes, wire calls). |

## Immediate queue (ordered)

1. ~~**AgentToolsManager.tsx — the 7 live errors.**~~ **DONE 2026-07-01** — the pilot deep
   fix. Typed `ParamRow` form state (advanced schema fields now round-trip instead of being
   destroyed on save), `description` always sent, converter casts → ingress validation
   (`parse-custom-tools.ts` + Error Inspector `data-shape` source), live DB audited (4/4
   tools conform, no backfill). Zero casts added; `pnpm type-check` = 0 → **Wave 5 closed.**
   Human decisions needed: **zero** (the DB audit + reading the Pydantic contract answered
   every shape question). See the pilot findings section below.
2. **`Record<string, any>` +2 red** — net growth from Wave 5 commits (candidates:
   `BasicMarkdownContent.tsx`, `features/text-diff/service/versionService.ts`,
   `components/matrx/matrx-record-list/*`, `lib/services/fingerprint-service.ts`). Fix or
   justify; ratchet must go green.
3. **Post-freeze growth from `da66a98e1`** (2026-07-01 16:34, "multiple type fixes…"):
   +7 `?? ""`, +2 `?? {}`, +1 `value!` above baseline — caught by the extended ratchet
   within minutes of landing. Verdict each, fix, then re-freeze.
4. **Wave-5 additions audit** — the 51 `?? ""` / 21 `|| []` / 8 `?? {}` added in the
   06-29/06-30 type-fix commits (diff-derived; regenerate with
   `git show <commits> | grep '^+'`). Verdict each: legit default vs silenced null-bug.
5. ~~**`@ts-nocheck` sweep**~~ **DROPPED (Arman, 2026-07-01)** — directive-marked files are
   deletion backlog, not repair backlog (see category strategy).
6. **Wave 6 `noImplicitAny`** (~1,420 errors) per the strictness handoff; then re-measure
   `strictPropertyInitialization`; then evaluate the umbrella `strict: true`.

## Pilot findings (AgentToolsManager, 2026-07-01)

What the first deep fix actually involved, as evidence for calibrating human involvement:

- **The eruption pattern held**: 1 hand-rolled type → 7 errors → every one was a real
  code-vs-contract disagreement (an optional `properties` treated as required, a loose
  `string` where the wire wants a literal union, a required `description` conditionally
  omitted, a second lookalike type in the registry detail panel).
- **The types exposed a latent data-loss bug**: the param form rebuilt schemas from its
  loose rows, silently destroying `enum`/`items`/nested `properties`/union types on every
  edit+save. Invisible under the old typing; unavoidable under the truth.
- **Human decisions needed: none.** The two candidate decisions (what may the form edit?
  what does the wire need?) were both answered by reading the destination (Pydantic
  contract) and auditing the live rows (4 tools, all conforming — no backfill). The
  agent-side rule that made this autonomous: preserve what you can't represent, validate
  at ingress, never coerce.
- **Where a human WOULD have been needed**: if the DB audit had found non-conforming rows
  (backfill approval), or if the wire contract itself had been wrong (aidream change).
  Neither occurred here; both are exactly what the decision-brief format captures.
