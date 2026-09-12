---
status: active
updated: 2026-08-08
repos: [matrx-frontend, aidream]
---

# Pipeline streams + the surface 360 loop

## Vision — Arman's words

- Find the gap that let a hand-rolled keyword-research stream renderer get
  built despite the ban, and close it (done — `adoptForeignStream`).
- Extend surfaces so agents can not only READ a page but MODIFY it — "fully
  360". Unify user-facing and internal into ONE system; policy
  user-controllable from the binding.

## Resources

- Seam + policy machinery: `features/surfaces/runtime/surface-writeback.ts`
  (`applySurfaceWrite`, `listAgentWritableTargets`, `SURFACE_WRITE_TOOL_NAME`).
- Injection: `features/agents/redux/execution-system/utils/build-tool-injection.ts`
  (`buildSurfaceWriteInlineSpec`). Routing:
  `thunks/surface-delegated-tool-call.thunk.ts` → `thunks/dispatch-surface-write.thunk.ts`.
- Doctrine: `features/surfaces/FEATURE.md` §"The 360 loop" + §"Surface client tools".
- aidream server half: `aidream/services/conversation_context/surface_context.py`
  (`_write_targets_block`), `aidream/services/tooling/surface_resolver.py`,
  ORM model `db/managers/ui/ui_surface_write_target.py` (generated, deployed).
- Proving ground: any marketing page workspace
  (`/marketing/brands/<id>/sites/<id>/pages/<id>`), targets declared in
  `features/surfaces/manifests/marketing-page.manifest.ts`, handlers in
  `features/marketing/components/pages/MarketingPageWriteTargets.tsx`.
  Login: `/login` admin@admin.com / <see AI_ADMIN_PASSWORD in .env>; run an agent from the
  header "Agents for this page" popover.

## Avalanche campaign (Arman's directive, 2026-08-08)

Roll agent-writable targets across every surface where agent writes make
sense (judgment bar in the `surface-write-targets` skill — the campaign
recipe). Each agent: one surface (multiple data sets), live-agent verify,
then fire 3-5 self-replicating chips. Chips fired this session:
content-plan-node policy upgrade, notes editor, schedules form, CRM
create-party, marketing-page full coverage (the richest surface — nearly
every input should be agent-drivable; also spawns chips for the other
marketing surfaces). Later: specialized cheap agents per surface replace
Badass Agent for these writes.

## Closure plan — 2026-09-11 (owner: the session that wrote this; subagents per WP, lane named)

Arman's directive: close the write-back system for good — harden it to the
declared-kinds standard, fix every weakness found in the 2026-09 review, keep
docs + skills (Claude AND platform `skill.definition`) current, finish without
him. State at start: 371 targets / 109 manifests / 173 structured
(object|array) targets with NO declared value contract; approval is the inline
`requestApproval` card (2026-08-24), not `confirm()`.

| WP | Lane | Scope | Status |
|---|---|---|---|
| WP1 value contracts | standard/opus | `SurfaceWriteTarget.valueKind` (registered Kind slug — THE contract; no inline schemas, One-Type Law) → drift ratchet (advisory count of structured targets lacking a kind; unknown slug = error) → per-target kind schema in the `apply_surface_write` inline spec where aidream forwards it → `applySurfaceWrite` validates via `validateAgainstKind` BEFORE approval and handler → mirror column `ui.ui_surface_write_target.kind_key` (migration via `pnpm db:apply`, `pnpm db-types`, manifest-sync + SQL emitter) → aidream resolver + `<surface_write_targets>` print `kind=` → adopt on targets an existing Kind already fits → census of the rest | open |
| WP2 trap guard | standard/opus | code guard for the "structured-output mandate + write targets pauses forever" trap: no `apply_surface_write` / surface client-tool injection for a run whose agent carries an output contract; loud info line with remedy; forcing-function test; RUNTIME.md note | open |
| WP3 handler guard | standard/opus | `pnpm check:surface-write-handlers`: every declared target has a registered handler (AST over `getWriteHandlers` / `useSurfaceWriteHandlers`), self-test failing-then-passing, advisory in release gates; wire every fixable gap | open |
| WP4 platform skills | standard/opus (aidream) | `scripts/ingest_skills.py` across all repos (platform `skill.definition` reference skills frozen at 2026-07-16); delete merged `surface-registration` stub (dir + row); make ingest part of the existing doctrine sync path, never a new schedule | open |
| WP5 mirror hygiene | standard/opus | stale-row age in drift report; recency guard on global `deleteStale`; `synced_by`/`synced_from` provenance on the 4 mirror tables; unify `errorResponse` across `app/api/admin/surfaces/*` | open |
| WP6 small fixes | quick/sonnet | drop empty `writeTargets: []` (3 manifests); actorLabel fallback via the shared agent-name cache; FEATURE.md adopter paragraph → counts + exemplars; skill Step 3 matches the ApprovalCard flow | done (2026-09-11, `ad207e01aa`) — items 2-4 shipped as scoped; item 1's premise did not hold: agent-settings/mandates/pdf-extractor manifests all already declare real, non-empty `writeTargets`, and no `writeTargets: []` exists anywhere under `features/surfaces/manifests/` |
| WP7 independent verify | standard/opus | after WP1–6: live agent run on `/tasks` + a marketing page + admin drift page; adversarial re-verify of each WP's claim | open |

Rules for every WP: shared checkout — `git add <own files>` + `git commit -m … -- <own files>`, push `main`, never stash/reset; `pnpm type-check` before done; docs (FEATURE.md change log, this table) in the same commit; live verification only on the ONE dev server (`pnpm preview:start`, port 3001), one lane at a time.

## Remaining work

1. **aidream `block_stream.py` stays PARKED** — pipeline runs still stream
   bare chunks, not `render_block` envelopes. Four documented blockers at the
   top of `aidream/aidream/services/ai_execution/block_stream.py` (missing
   emitter-protocol methods called unguarded by providers; no turn-text
   accumulator; `blk_N` ids restart per instance; None-gated not
   capability-gated wrap). Fix all four with a forcing-function test asserting
   the protocol surface, then engage in `run_one_agent`. The FE does not need
   it (`StreamBlockAccumulator` builds envelopes client-side) — it is a server
   optimization.
2. **Page-agent pipeline surfaces not adopted** — 4 pipeline call sites emit
   render-block streams (`seo/keyword_research.py` ×2, `seo/page_agents.py`
   ×2) but the page-agent surfaces never call `adoptForeignStream`, so those
   events are ignored (degrades to saved artifact). Cheap, high value.
3. **Surface client tools: no adopter, no DB mirror, no
   `check:surface-drift` coverage** — the seam is fully wired
   (declare → register → inject → dispatch) but no manifest declares one.
4. **Agent-facing kind skills** — the three LSI kinds' teaching blocks don't
   mention the apply affordances, so agents don't describe them to users.
5. **`actorLabel` polish** — the ask dialog says "An agent wants…" when the
   agent definition isn't hydrated in the agent-definition slice
   (`dispatch-surface-write.thunk.ts` falls back). Consider a name lookup
   that doesn't depend on slice hydration.
6. **Cross-agent policy residual** — two agents launched on the SAME surface
   in one tab share the surface's policy resolution (documented in
   `surface-writeback.ts`); needs per-request policy scoping only if it bites.
7. Opportunistic: `listLiveWriteTargets()` runs in the Surface Context
   window's render body on a 400ms poll, re-invoking every provider's
   `getWriteHandlers()`.
8. Observed (pre-existing, delegated-resume class): server stream warning
   `request_context_changed` (`source_feature: 'ai-results' →
   'conversation_resume'`) fires once per delegated-tool resume.

## Done

- `adoptForeignStream` + `consumeStream` on `callApi` — pipeline streams render canonically; both bespoke renderers deleted; `matrx/no-bespoke-stream-renderer` ESLint at error.
- 360 loop v1 — `writeTargets`/`applySurfaceWrite`/UI-state reads/`applyPolicy` + per-binding `write_policies` (DB v2 payload, merge layers, launch registration, manual floor); editor UI everywhere the binding lives; shortcut storage under `__write_policies`.
- Marketing-page targets live (`page_meta_tags`, `page_target_keyword`, `page_supporting_keywords`, `page_draft_content`) + LSI kind components' user-origin buttons.
- **Agent-origin stream side wired (2026-08-08)** — `apply_surface_write` inline tool injected per turn from `listAgentWritableTargets()`, routed to `applySurfaceWrite(origin:"agent")`; decline = non-error result. **E2E-verified live** on the marketing-page workspace: agent call → ask confirm → Apply → `updatePageIntent` saved + fields updated + loop resumed.
- `pnpm type-check` green; aidream ORM model for `ui.ui_surface_write_target` generated and in the deployed build (`/health/version` SHA verified 2026-08-08).
- **Tasks surface agent-writable (2026-08-08)** — second adopter, 8 ask targets, handlers in `TaskEditorBody.tsx`; live-verified (4 targets one run). Campaign skill `.claude/skills/surface-write-targets/` written; 5 self-replicating chips fired.

## Decisions needed (Arman)

- **Ask-policy UX**: agent write approval is an inline `confirm()` at the
  moment of the write. If you want these queued in the same persistent inbox
  as proposed directives instead, say so — deliberate follow-up, not an
  oversight.
- **Write-target inheritance**: `writeTargets` do NOT inherit down the
  surface parent chain (values do). A child surface never implicitly gains
  the right to write its parent's fields. Say so if you want the opposite.
