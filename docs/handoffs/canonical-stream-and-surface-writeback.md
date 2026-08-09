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
  Login: `/login` admin@admin.com / Password1234#; run an agent from the
  header "Agents for this page" popover.

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

## Decisions needed (Arman)

- **Ask-policy UX**: agent write approval is an inline `confirm()` at the
  moment of the write. If you want these queued in the same persistent inbox
  as proposed directives instead, say so — deliberate follow-up, not an
  oversight.
- **Write-target inheritance**: `writeTargets` do NOT inherit down the
  surface parent chain (values do). A child surface never implicitly gains
  the right to write its parent's fields. Say so if you want the opposite.
