---
status: active
updated: 2026-08-15
repos: [matrx-frontend, aidream]
vision: [/Users/armanisadeghi/code/common-docs/systems/agents/agent-variable-binding/FEATURE.md]
---

# Agent Variable Binding — finish the system that stops a UI swap from breaking code

**The spec is NOT in this file.** It is the cross-repo system-of-record:
`/Users/armanisadeghi/code/common-docs/systems/agents/agent-variable-binding/FEATURE.md` — the
nine-scenario matrix, the mapping vocabulary, the blocking rules, and Arman's rulings. Read it
first. This handoff is only the work order.

**This is the second half of Mandates, not a separate feature.** The other half —
*which* agent runs a step — is `common-docs/systems/agents/mandates/FEATURE.md`, which carries
**THE UNIVERSAL LAW** (every repo, every package and sub-package, every surface; both the agent id
AND its definition) and **the exception policy** (Arman's written approval only; exactly one
exception exists — the conversation labeler). The cross-repo worklist of everything still
non-conforming is `common-docs/systems/agents/mandates/ROLLOUT.md`; the sibling work order is
`aidream/docs/handoffs/content-ir-slots.md`. These two handoffs share the admin console, the
code-truth API, and the `contract` column — coordinate before changing any of the three.

## THE DEFINITION OF DONE — one mandate, unprompted

🚨 **STATUS CORRECTION (2026-08-16) — read this before acting on the paragraph below.**
`podcast.deep_research` is **no longer silently broken, and you must NOT revert the fix.** On
2026-08-16 the delivery half was repaired platform-wide: `declare_slot(spill_variables=…)` now
exists, and this mandate declares one, so the topic is appended to the run's user text instead of
being silently DROPPED. Every topic-to-podcast run had been reaching the researcher blank
(commits `94a03f053`, `11de4b47e`; full account in
`aidream/docs/handoffs/content-ir-slots.md` § THE DELIVERY GUARANTEE).

**The acceptance test below still stands and is still unmet.** A spill is a *delivery guarantee,
not a contract waiver*: the variable stays in `required_variables`, so the console's drift verdict
still names this mandate on purpose. What must still be proven is the ORIGINAL goal — that the console
surfaces the mismatch **unprompted**, in plain language, with real options Arman can pick from.
Do not "fix" the mandate by removing the variable or silencing the verdict; that destroys the test.

The original framing, kept for intent:

`podcast.deep_research` was **deliberately left broken.** The code passes `user_request`; the bound
"Deep Web Research Agent" declares no variables. **Do not paper over the verdict.**

> **Arman, 2026-08-15:** "You have not achieved your goal until the system helps me see this bug
> about the deep research and tells me what to do and you and I fix it together, but only because
> the system guided us from A to Z."

This workstream is done when the admin console surfaces that mandate **without being asked**, states
the mismatch in plain language, offers the real options, and Arman picks one. If his pick needs
code, he pastes the generated brief into a session and we execute it. Not before.

**Why it matters more than the bug:** this console CREATED that bug. It suggested the rebind
(correctly — THE SYSTEM-AGENT LAW), Arman accepted, and nothing checked variables. An unchecked
suggestion is worse than no suggestion.

## Shipped and verified (do not rebuild)

| What | Where | Proof |
|---|---|---|
| Rebind pre-flight + fix brief | `features/admin/mandates/rebind-impact.ts`, `useGuardedRebind.tsx` | 9 unit tests; browser-verified on `podcast.deep_research`; live in `release-admin: v0.4.628` |
| Code-truth API | aidream `services/agent_slots/code_truth.py`, `GET /agent-slots/code-truth` | Live in prod (401 vs 404 on a bogus path); OpenAPI types already in `types/python-generated/api-types.ts` |
| Mapping vocabulary | `packages/matrx-ai/matrx_ai/agents/named.py` | `code_value` / `direct_value` / `unmapped`; `prompt_user` rejected server-side; full `VariableVerdictKind` enum |
| `validate()` guard hole closed | same file | now takes `source_override`, reports `validation_target="resolved"` vs `"seed"` |
| Bench + console cleanup | `MandateTestBench.tsx`, `mandate-health.ts`, `MandatesConsole.tsx` | live; see the mandates FEATURE.md changelog |

## The work, in dependency order

### 1. Expand code-truth coverage — ✅ **DONE 2026-08-15, verified 2026-08-16**

**The hardcoded allowlist no longer exists.** `code_truth.py` now exposes
`discover_code_truth_modules()`, which walks `CODE_TRUTH_PACKAGE_ROOTS` (every production agent
package), imports every module whose AST defines or dynamically builds a `NamedAgent` subclass, and
unions that with `DECLARING_MODULES` for import-time declaration factories. Failed imports are
retained in `MandateCodeTruthReport.import_failures` and statically-recoverable mandate keys resolve as
`code_exists_but_import_failed` rather than being misreported as DB-only. A guard
(`tests/test_code_truth.py`) fails if a new production package holds a `NamedAgent` outside the
known roots. **This no longer blocks the backfill — and the backfill itself is now closed** (see
the Live state table in `common-docs/systems/agents/mandates/FEATURE.md`).

*Original description, kept for context:*

`CODE_TRUTH_AGENT_MODULES` in `code_truth.py` was a hardcoded 3-module tuple. `NamedAgent`
subclasses also live in ~10 other modules (`conversation_labeler`, `podcast_stages`,
`agent_iteration/agents.py`, `services/rag_agents.py`, `auto_ingest/ner_agents.py`,
`human_decisions/agent.py`, `runtime/recovery_advisor.py`, `agent_factory/agent_builder_agent.py`,
`internal_agents/_generated/*`). Everything else reports "no code declaration found" — the report
looks cleaner than reality, which is the exact failure mode this system exists to kill.

Discover instead of listing; if a list survives, guard it with a test that fails when an
uncovered `NamedAgent` exists. Keep "not imported" distinct from "genuinely DB-only".

### 2. The code-truth surface — THE ACCEPTANCE TEST *(matrx-frontend, chip fired)*

Nothing consumes the endpoint yet. Build it into `/administration/agents/mandates`:

- Drift visible **without opening a mandate**, folded into the worst-first model in `mandate-health.ts`
  (extend it — do not start a parallel health system).
- Per-variable verdicts as labeled facts in the drawer, preserving facts-first order.
- Every breaking verdict ships its one-click remedy (THE DOOR LAW) plus the copy-paste brief —
  reuse `buildRebindFixBrief`, extend it rather than forking.
- Feed real code truth into `computeRebindImpact`'s `codeSuppliedVariables` seam (built for this),
  sharpening the guard from "what the current agent declares" to "what the code actually passes".

Loud, never blocking. No JSON fields. Verify in a real browser, then `./ship.sh --target admin`.

### 3. Backfill the contracts and output promises *(blocked on #1)*

Measured live 2026-08-15: **51 of 143** mandates carry an empty `contract` while their bound agent
declares variables; **57 of 143** report output "text" while the agent has an `output_schema`;
**7 of 22** code-backed contracts are narrower than what the code passes.

Arman's ruling: **an AI pass proposes, he approves** — as assist chips, one-click accept. Do NOT
bulk-copy agent declarations into contracts; that bakes in whatever an agent happens to declare
today. **Blocked until #1 lands**, because backfilling from a 3-module report would propose "no
code declaration" for most of the fleet.

Trap already recorded: `output_kind` is **code-owned** — `sync_declared_slots` rewrites it from
the code declaration on every aidream boot, so a DB-only edit reverts until the declaring code
deploys.

### 4. Kill the inline-agent bypass *(aidream, chip fired — queued once, did not land)*

`packages/matrx-ai/matrx_ai/tools/implementations/_summarize_helper.py` builds an agent inline via
`UnifiedConfig.from_dict({... "system_instruction": ...})` — a real prompt living in Python source,
with no agent row, no version, no admin visibility. Still present on `origin/main`.

Do **not** touch `agent_call.py` / `ctx.py` — those run a caller-supplied `agent_id` under access
checks and are legitimate.

### 5. Release-time truth verification *(not started, no chip)*

The doc requires that shipped code and reported truth are checked to match on every release. Two
proven patterns to extend, not reinvent: matrx-frontend's surface-manifest drift check
(`SurfaceValueDrift`) and aidream's `tests/test_no_off_funnel_anthropic.py`. Sequence this after
#1 and #2 — a verifier over a partial report would certify a fiction.

## Traps

- **Never hand-fix `podcast.deep_research`.** It is the acceptance test. Fixing it destroys the
  only end-to-end proof and, in Arman's words, sweeps the evidence under the rug.
- **Over-tightening is a defect here.** Only `missing_from_code`, `required_unmapped`, and a lossy
  `type_mismatch` may block. Renames, defaults, and deliberate blanks must save.
- **No JSON fields in the UI, ever** — ruled repeatedly. Settings use the canonical
  `instanceModelOverrides` + `RunConfigOverrides` layer.
- **"Overrides" is reserved** for `config_overrides` on a run. A `mandate_binding` is a **binding**.
- **Shared checkout:** `release.sh` commits the shared index. Commit with explicit pathspecs, and
  never blanket-stash.
