# P10 — Type suppression debt

## Approved batch follow-up — 2026-08-12

### Scope scanned

- Re-verified the first/full pass and its open P10 sighting, then changed only
  the five repairs Arman explicitly approved: 10 `as any` casts across six
  source files. No generated file, suppression, test, or chunk boundary changed.
- The former `TEMP-RT-DEBUG` cast in `features/tasks/hooks/useTaskManager.ts`
  was already gone; its ledger entry is checked as `resolved-before-batch`.
- Reviewed the approved guidance documents in full and encoded item-scoped
  approval routing in the Pattern Patrol constitution/operator brief, P10 row,
  and repo-local patrol skill.

### Auto-approved and fixed

- Auto-approved this run: **0**. This was the first human-approved P10 batch.
- Manually approved and fixed: **5 findings / 10 cast occurrences / 6 files**.
  - Six JSX label casts removed by preserving `TabDefinition`'s default string
    contract while allowing `FullScreenOverlay` and `UtilitiesOverlay` to opt
    into `ReactNode` labels.
  - Readonly special-variable membership now uses equality-based `some`.
  - Request-access user type selection now resolves through
    `USER_TYPE_OPTIONS` and rejects an unknown value with a clear error.
  - The redundant casted CX-filter property deletion is gone; the existing
    serializer continues to omit `undefined` values.
  - PageSpeed LLM format selection now accepts only `markdown` or `json`.

### Manual approval requested

- None in this follow-up. The remaining first-pass debt stays in the ranked
  chips below and was not included in Arman's approval.

### Excluded as uncertain

- All generated-boundary casts, whole-file disables, hook suppressions, and
  other data/control-flow contracts remain report-only. None matched a proven
  behavior-preserving recipe.

### Approved-batch verification and certifier verdict

- **CERTIFIED** — the second adversarial agent confirmed exactly 10 cast
  removals, no new/widened suppression, no changed chunk boundary, and no
  target-file TypeScript diagnostic.
- `pnpm check:hatches --strict` ran and remained red only on the existing
  repository-wide growth categories; `as any` is now **94** versus the frozen
  baseline of 136. The approved patch itself accounts for exactly 10 removals.
- Full `pnpm type-check` ran. It reported only unrelated concurrent
  `organization_id` contract failures in four API routes; none of the approved
  files produced a diagnostic. Targeted semantic probes passed for special
  variables and CX query serialization.
- Targeted ESLint passed five files. `FullScreenOverlay.tsx` retains two
  pre-existing `react-hooks/set-state-in-effect` findings outside the changed
  lines; this P10 batch did not suppress or alter them.
- Live checks passed request-access selection and CX filters across desktop and
  mobile plus light and dark. The managed preview exhausted memory before the
  remaining overlay/demo routes could be reopened; the certifier audited their
  unchanged runtime contracts and still returned **CERTIFIED**.

### New baseline for the next run

| Category | Current | Frozen baseline | Delta |
|---|---:|---:|---:|
| `: any` | 470 | 565 | -95 |
| `as any` | 94 | 136 | -42 |
| `as unknown as` | 653 | 530 | +123 |
| `<any>` | 62 | 86 | -24 |
| `Record<string, any>` | 82 | 107 | -25 |
| `@ts-ignore` | 24 | 34 | -10 |
| `@ts-nocheck` | 5 | 14 | -9 |
| `@ts-expect-error` raw | 6 | 2 | +4 |
| `value!` assertion | 347 | 317 | +30 |
| `?? {}` | 835 | 567 | +268 |
| `|| {}` | 72 | 84 | -12 |
| `|| []` | 347 | 415 | -68 |
| `?? ""` | 3,141 | 2,070 | +1,071 |
| `|| ""` | 834 | 854 | -20 |

- The next run repeats the full-repository count and active-disable scan; no
  reduction above authorizes offsetting growth in another category.
- Cadence health: this is still the first P10 cycle, so no longer-cadence
  proposal or repeated-rejection pause applies.
- Candidates noticed: none. No exception was proposed or approved.

---

## Initial first/full pass — retained baseline

- Run date: 2026-08-11
- Run kind: first run; required full-repository pass
- Registry tier: R (report, rank, and chip only)
- Prior-month loop health: no prior P10 report or automation memory existed

## Scope scanned

- Full repository count across tracked `.ts` / `.tsx` source using the same universe as `scripts/check-type-hatches.ts`: generated types, declarations, scripts, `__tests__`, and `*.test.ts(x)` were excluded.
- The scan covered 11,060 eligible tracked files. The worktree already contained unrelated user/agent changes; during the run, one of those changes added an unguarded `as unknown as` at `features/tasks/hooks/useTaskManager.ts:150`, which is ranked below and remains open in the ledger.
- Registry detection ran through `pnpm check:hatches`, plus a separate active-directive scan for `eslint-disable`, which the hatch script does not track.
- The P10 sighting ledger had no open P10 entry before this run. The newly observed uncommitted debug cast is now recorded as an open P10 sighting for the next run to re-verify.
- This first run is the required full pass. No generated file, source suppression, test, build boundary, or product behavior was changed.

## Outcome

- Findings: **6 ratchet category breaches**. Five are current debt-growth categories; the `@ts-expect-error` breach is detector-inflated by an intentional negative contract test and two prose matches, but remains loud until the detector class is handled honestly.
- Fixed: **0**. P10 is Tier R and never edits suppression debt.
- Certifier verdict: **NOT APPLICABLE** — report-only Tier R run; no mutation batch existed.
- Exceptions: none proposed or approved. Existing `MATRX-EXCEPTION` annotations remain counted and were not treated as human approval.

## Verification

- `pnpm type-check` — PASS on the final rerun. The first attempt caught an unrelated in-progress `CodeInlinePreview.tsx` edit; its owning session completed the line before the rerun, and P10 did not touch it.
- `pnpm check:hatches --strict` — expected FAIL on the five built-in growth categories. This is the patrol finding, not a missing check.
- `pnpm check:migrations` — exit 0 with one pre-existing non-blocking drift warning for `web_page_list_url_shape_resource_class.sql`; P10 made no database change.
- `git diff --check -- .matrx/PATROL_SIGHTINGS.md .matrx/patrol-reports/type-suppression-debt.md` — PASS.
- Type generation was intentionally not run because P10's hard rules forbid touching generated files; no type or API contract changed.

## Repository hatch ratchet

Baseline is `scripts/type-escape-baseline.json`, frozen 2026-07-02 at commit `cd822cabf4f520e6dffbb1df1d43963aedb34161`.

| Category | Current | Baseline | Delta | Verdict |
|---|---:|---:|---:|---|
| `: any` | 485 | 565 | -80 | down |
| `as any` | 107 | 136 | -29 | down |
| `as unknown as` | 659 | 530 | **+129** | breach |
| `<any>` | 62 | 86 | -24 | down |
| `Record<string, any>` | 83 | 107 | -24 | down |
| `@ts-ignore` | 24 | 34 | -10 | down |
| `@ts-nocheck` | 5 | 14 | -9 | down |
| `@ts-expect-error` (raw detector) | 6 | 2 | **+4** | breach; false-positive inflation |
| `value!` assertion | 355 | 317 | **+38** | breach |
| `?? {}` | 831 | 567 | **+264** | breach |
| `|| {}` | 73 | 84 | -11 | down |
| `|| []` | 354 | 415 | -61 | down |
| `?? ""` | 3,060 | 2,070 | **+990** | breach |
| `|| ""` | 832 | 854 | -22 | down |

- Built-in hatch total: 6,936 current versus 5,781 baseline, net **+1,155**.
- Five built-in categories grew; category-level reductions may not offset growth in another category.
- `as unknown as` appears in 346 files. Seventeen files mention `DbRpcRow` and may contain the one sanctioned guarded RPC-row cast; 329 files do not mention that guard. This is a ranking signal, not automatic proof for or against an individual line.

## Explicit suppression baseline and false-positive triage

The exact active-directive comparison below uses the 2026-07-02 hatch-baseline commit as the historical reference.

| Signature | Current active | Current files | Historical active | Delta |
|---|---:|---:|---:|---:|
| executable `as any` detector matches | 107 | 56 | 136 | -29 |
| `@ts-ignore` directives | 24 | 20 | 34 | -10 |
| `@ts-nocheck` directives | 5 | 5 | 14 | -9 |
| `@ts-expect-error` directives | 4 | 2 | 2 | **+2** |
| active `eslint-disable*` directives | 496 | 363 | 480 | **+16** |

- Exact active explicit total: 636 now versus 666 historically, net -30. The total improved, but `eslint-disable` still grew and the ratchet is category-specific.
- `eslint-disable` also spread from 343 to 363 files (**+20 files**). Only 62 of 496 directives carry an inline `-- reason`; 434 lack an inline reason. Some have an adjacent rationale and need per-file review, so the 434 count is a triage queue rather than an automatic violation verdict.
- Active ESLint rule concentrations: 217 `react-hooks/exhaustive-deps`, 119 `no-console`, 51 `@next/next/no-img-element`, 38 `@typescript-eslint/no-explicit-any`, 27 `react-hooks/set-state-in-effect`, and 25 `no-restricted-syntax`.
- Seven raw `eslint-disable` text matches were comments, documentation, a string, or commented-out code and were removed from the active count.
- Five `as any` detector matches are prose/JSDoc/JSX false positives: `app/(public)/privacy-policy/page.tsx:158`, `components/animated/glare-card.tsx:5`, `features/transcripts/service/audioStorageService.ts:5`, `features/agents/redux/shared/field-flags.ts:53`, and `features/content-ir/admin/KindTryInputTab.tsx:7`. Verified executable `as any` debt is therefore 102 occurrences.
- `lib/api/typed-client.contract-test.ts` contributes five raw `@ts-expect-error` matches: two prose mentions and three intentional negative compile-time assertions. The three directives are a false-positive class for suppression debt. After excluding those, the only current production `@ts-expect-error` is the pre-existing annotated `webkitdirectory` line at `features/files/components/surfaces/desktop/NewMenu.tsx:279`; the earlier production suppression in `CleanedMarkdownPane.tsx` was removed. Production `@ts-expect-error` debt therefore fell from 2 to 1 even though the raw detector category rose.
- After the verified prose/negative-test exclusions, the production explicit-suppression inventory is 628 occurrences across 425 files.

## Ranked high-risk baseline

### Rank 0 — newly observed working-tree cast

- `features/tasks/hooks/useTaskManager.ts:150` adds `(window as unknown as { __rtTaskTest?: unknown }).__rtTaskTest` inside a `TEMP-RT-DEBUG` block.
- The line is uncommitted work owned by another active task. P10 did not alter it; it remains an open sighting and must not enter the ratchet baseline silently.

### Rank 1 — whole-file TypeScript disable (5 files)

- `components/ui/chart.tsx:1`
- `features/agent-apps/components/AgentAppRenderer.tsx:1`
- `features/agents/redux/agent-apps/slice.ts:1`
- `lib/redux/app-builder/selectors/appletSelectors.ts:1`
- `utils/idle-scheduler/examples.tsx:1`

The production agent-app Redux slice is highest risk: it combines whole-file type checking removal with four `as any` indexed writes and four matching ESLint suppressions.

### Rank 2 — unguarded generated-boundary casts

- `features/agents/redux/agent-definition/converters.ts` — 30 `as unknown as` casts across DB JSON reads and insert/update writes.
- `features/ai-models/service.ts` — 20 `as unknown as` casts directly after Supabase reads/writes, with no `DbRpcRow` guard in the file.
- `features/dictionary/service/dictionaryService.ts` — 9 casts.
- `features/transcript-studio/service/studioService.ts` — 8 casts.
- `features/agents/redux/execution-system/thunks/process-stream.ts` — 8 casts.

### Rank 3 — executable `as any` concentrations

- `features/agent-context/hooks/useHierarchy.ts` — 11
- `features/cx-dashboard/service.ts` — 8
- `features/scraper/utils/data-utils.ts` — 7
- `features/quick-actions/components/UtilitiesOverlay.tsx` — 6
- `components/crud/CrudTable.tsx` — 4
- `features/agents/redux/agent-apps/slice.ts` — 4
- `features/math/components/MathGo.tsx` — 4
- `features/message-templates/admin/MessageTemplateManager.tsx` — 4

### Rank 4 — type-lint disables

- 38 active `@typescript-eslint/no-explicit-any` disables.
- Seven cohesive full-file disables sit in the sync engine: `lib/sync/engine/remoteFetch.ts`, `autoSaveScheduler.ts`, `remoteWrite.ts`, `boot.ts`, `middleware.ts`, `applyPrePaint.ts`, and `lib/sync/components/SyncBootScript.tsx`.
- Those seven files carry `MATRX-EXCEPTION` rationales about invariant heterogeneous `Policy<TState>` values. The annotations are evidence, not approval, and the lines remain in the baseline.

### Rank 5 — React lifecycle suppressions

- 246 active React-hook disables: 217 `exhaustive-deps`, 27 `set-state-in-effect`, and 2 `rules-of-hooks`.
- Highest concentrations: `lib/entity-list/useEntityList.ts` (5), `features/agents/components/diff/AgentVersionDiffPage.tsx` (4), `features/education/engage/data/useGamePlay.ts` (4), `features/pdf-extractor/studio/PdfStudioReader.tsx` (4), and `features/transcription-cleanup/components/CleanupPad.tsx` (4).
- These require behavioral review; no hook dependency list may be changed mechanically by P10.

## Precise Tier-R chips

### Chip P10-1 — restore type checking to the agent-app Redux slice

Start at `features/agents/redux/agent-apps/slice.ts:1` and trace `AgentApp`, `AgentAppRecord`, field history, reducers, selectors, and every consumer. Remove `@ts-nocheck` only by replacing the dynamically indexed writes with a key/value-correlated typed helper or another generated-contract-preserving design. Do not cast or widen. Run `pnpm type-check` and `pnpm check:hatches`; escalate with the type-safety decision-brief format if Redux/Immer variance requires an architecture decision.

### Chip P10-2 — validate AI-model Supabase rows instead of asserting them

Audit all 20 casts in `features/ai-models/service.ts` (first at line 111; last at line 687). Alias database rows/inserts/updates from `types/database.types.ts`; use the sanctioned `DbRpcRow` compile-time guard only for an RPC row, and validate JSON interiors at ingress. Trace every `AiModel` / provider / endpoint / offering / setting consumer and repair stored data if it violates the generated contract. No `as unknown as`, shadow interfaces, or hand-widening.

### Chip P10-3 — make agent-definition JSON conversion honest end to end

Audit the 30 casts in `features/agents/redux/agent-definition/converters.ts` across `dbRowToAgentDefinition`, insert construction, and update construction. Trace each JSON field to the generated DB column and its terminal renderer/server consumer; add field-level runtime guards or schemas, correct every writer, and backfill malformed rows if found. The normal fix must remove the casts because the data conforms, not replace them with a different assertion.

### Chip P10-4 — type the hierarchy mutation and thunk-dispatch boundaries

Audit the 11 `as any` uses in `features/agent-context/hooks/useHierarchy.ts`, including Redux thunk dispatches and organization/project/task update payloads. Reuse the typed app dispatch and correlate the mutation discriminator with its generated payload type. Trace the three hierarchy-service update endpoints before choosing a union/overload. Verify create, update, delete, and move paths without changing UI behavior.

### Chip P10-5 — decide the heterogeneous sync-policy type boundary

Audit the seven full-file `no-explicit-any` disables under `lib/sync/engine/` plus `lib/sync/components/SyncBootScript.tsx`, starting from `lib/sync/registry.ts` and `lib/sync/types.ts`. Test whether a read-only erased policy view or a typed visitor can represent the heterogeneous registry without breaking `Policy<TState>` invariance. If not, produce the required type-safety decision brief; do not convert the existing annotation into an approved exception or widen the suppression.

### Chip P10-6 — review the highest-risk React-hook suppressions

Create one behavior trace per file for `lib/entity-list/useEntityList.ts`, `features/agents/components/diff/AgentVersionDiffPage.tsx`, `features/education/engage/data/useGamePlay.ts`, `features/pdf-extractor/studio/PdfStudioReader.tsx`, and `features/transcription-cleanup/components/CleanupPad.tsx`. For every suppressed dependency, identify the captured value, event that should rerun the effect, and loop/staleness risk. Propose file-specific repairs; do not batch-edit dependency arrays.

### Chip P10-7 — remove the temporary task-debug cast honestly

Re-verify `features/tasks/hooks/useTaskManager.ts:150` after the owning task finishes. If the debug hook remains necessary, define a reusable typed debug-harness window augmentation at the established diagnostics boundary and assign through that declared contract; if it is temporary, delete the entire `TEMP-RT-DEBUG` block. Do not replace the cast with `any`, a lint disable, or a broader global type.

## Baseline for the next run

- Scan-start commit: `986cb7201d1fc015c76af96439779ce6a22acdf3` (the worktree also contained the open uncommitted debug cast named above).
- Eligible tracked-file set: 11,060 files; sorted path-list SHA-256 `05ff4b07b1c2579b0a4b1b40b0fb5149d145bc77c003a2250162bfaa2b872859`.
- Explicit-suppression detector set: 430 files; sorted path-list SHA-256 `90eaf09a004c9def1b8fb4f8c44770bacd22568b2dc33ceefbe0f12509ca0cbd`.
- `as any` detector set: 56 files; sorted path-list SHA-256 `cf6b2f2d097b28ab4e63993c7f4d1df63fe552f3bb65ed74a845c1ad8761ddec`.
- `as unknown as` set: 346 files; sorted path-list SHA-256 `937ec6655af896924c981cf2fd183f5beada2f222020573e1db77f62d0e21f40`.
- Active `eslint-disable` set: 363 files; sorted path-list SHA-256 `331095494ad92240c021b51239f73dc2b4180c4714e9409594099e902417b5d1`.
- Type-directive set: 27 files; sorted path-list SHA-256 `dca2631557beca9db2d4b5e99c332d376db45a0583674f342591a00f523c1baf`.
- Next run repeats the full-repository count, compares every category independently, verifies any P10 ledger entries, and reranks only new or still-high-risk concentrations. Do not scope by git churn.

## Cadence health and candidates

- This is the first P10 run, so there is no preceding month of clean runs and no cadence-lengthening proposal.
- P10 is report-only; no certifier verdict history or repeated rejection pattern exists, and no mutation pause is needed.
- No recurring unregistered class was observed. The negative contract-test overcount is a P10 detector false-positive class, not a new patrol candidate; it stays visible in this report for a future detector correction.
