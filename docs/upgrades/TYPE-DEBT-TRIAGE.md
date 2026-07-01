# Type-Debt Triage — the human-in-the-loop wave (Track B2-H)

> The strictness waves (STRICTNESS-WAVE-HANDOFF.md) grind errors **tsc can see**. This track
> grinds the debt tsc can NOT see: escape hatches and silent coercions that made errors
> disappear without fixing the data. These fixes are different in kind — many require a
> **human decision** (architecture, wire-contract, "what shape does Python actually need"),
> so the pipeline is triage → decision briefs → Arman decides → fix waves.
> Doctrine: the **`type-safety`** skill (`.claude/skills/type-safety/SKILL.md`).
>
> **Last updated:** 2026-07-01 · **Status:** pipeline defined, inventory not started.

## The contract (non-negotiable)

- **Escalation is success; silencing is failure.** An agent that stops and files a decision
  brief has done its job. An agent that makes an error disappear with a cast/coercion and
  claims victory has caused damage.
- **Phase 1 agents make NO code changes.** Inventory and classification only.
- **Every brief traces to the terminal consumer** — the Python model / DB column / renderer
  where the data ends up (read the aidream code if that's the destination). A brief without
  "Consumed by" is incomplete. The shape question is answered at the destination.

## Current state (2026-07-01)

- `pnpm type-check`: **7 errors**, all in `features/agents/components/tools-management/AgentToolsManager.tsx`
  — all the CustomTool / `JsonSchemaProperty` drift class (`type: string` vs the OpenAPI
  literal union). This is the worked example (`docs/type-drift-openapi-alias-example.md`)
  surfacing exactly as predicted after the api-types refresh. Wave 5 (`strictNullChecks`)
  is otherwise done: 1347 → 7.
- Ratchet (`pnpm check:hatches`, baseline 2026-07-01) — total **7,753**:
  cast/suppression categories 2,965 (flat-to-down through Wave 5), plus the six new
  silent-coercion categories frozen this date: `value!` 641 · `?? {}` 619 · `|| {}` 101 ·
  `|| []` 460 · `?? ""` 2,071 · `|| ""` 896.
- **Known red:** `Record<string, any>` 240 vs baseline 238 (+2 net added during Wave 5) —
  first fix item below.
- Wave-5-era additions to audit (from the 06-29/06-30 "type fixes" commits): 51× `?? ""`,
  21× `|| []`, 8× `?? {}`, 70× `: unknown` — some legitimate, each needs a verdict.

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
| `@ts-nocheck` 21 / `@ts-ignore` 51 / `@ts-expect-error` 6 | 78 | Small — full sweep first. Every `@ts-nocheck` file is a blind spot hiding unknown debt. |
| `as any` 314 / `<any>` 175 | 489 | Full sweep, mostly mechanical; decision briefs for the rest. |
| `as unknown as` 685 | 685 | **Guard-aware triage**: DB-guarded RPC casts are sanctioned (supabase-patterns.md); whole-row Json nukes are the #1 target (→ Pattern 4). |
| `: any` 1,473 / `Record<string, any>` 240 | 1,713 | Feature-scoped sweeps; registries/handler maps may earn a documented `MATRX-EXCEPTION`. |
| `value!` 641 | 641 | Mechanical majority (narrow after error-guard); briefs where null is load-bearing. |
| `?? {}` / `|| {}` / `|| []` | 1,180 | The "empty shape pretending to be data" class — high decision density; destination-trace each. |
| `?? ""` / `|| ""` | 2,967 | Huge, mixed with legit display defaults. Do NOT full-sweep — fix opportunistically in touched files + ratchet holds the line; triage only at data boundaries (writes, wire calls). |

## Immediate queue (ordered)

1. **AgentToolsManager.tsx — the 7 live errors.** The CustomTool deep fix per
   `docs/type-drift-openapi-alias-example.md`: alias from `components["schemas"]`, type the
   tool-builder state with the literal union, remove the boundary casts, validate ingress.
   Closes Wave 5 (type-check → 0). Decision density: high (UI state shape) — expect briefs.
2. **`Record<string, any>` +2 red** — net growth from Wave 5 commits (candidates:
   `BasicMarkdownContent.tsx`, `features/text-diff/service/versionService.ts`,
   `components/matrx/matrx-record-list/*`, `lib/services/fingerprint-service.ts`). Fix or
   justify; ratchet must go green.
3. **Wave-5 additions audit** — the 51 `?? ""` / 21 `|| []` / 8 `?? {}` added in the
   06-29/06-30 type-fix commits (diff-derived; regenerate with
   `git show <commits> | grep '^+'`). Verdict each: legit default vs silenced null-bug.
4. **`@ts-nocheck` sweep** (21 files) — open the blind spots before they hide Wave 6 debt.
5. **Wave 6 `noImplicitAny`** (~1,420 errors) per the strictness handoff; then re-measure
   `strictPropertyInitialization`; then evaluate the umbrella `strict: true`.
