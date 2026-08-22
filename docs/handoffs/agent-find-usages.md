---
status: active
updated: 2026-08-22
repos: [matrx-frontend]
scope: feature
feature: Agents
vision: []
---

# Agent Usage & Relationships

**What this is:** Make every Agent expose a complete, navigable inventory of its executable bindings, platform relationships, lineage, history, and drift, plus one all-Agent inventory.
**Scope:** Feature
**Feature:** Agents
**Vision:** VISION MISSING — Arman supplied the direction in the 2026-08-22 Codex task, but it has no durable document link yet.

## Resources

- Canonical feature doc: `features/agents/FEATURE.md` → Find Usages & Drift.
- Existing engine: `features/agents/components/usages/AgentUsagesEngine.tsx`.
- Existing data layer: `features/agents/redux/usages/` and live `agx_usage_*` RPCs.
- Existing compact windows: `features/window-panels/windows/agents/`.
- Existing drift routes: `/reports/agent-drift` and `/administration/agents/reports/agent-drift`.
- Canonical association reader: `features/scopes/service/associationsService.ts` → `public.assoc_for_entity` → `platform.associations_live`.
- Canonical Agent action registry: `features/agents/browse/agentActionRegistry.tsx`.

## Remaining work

1. Obtain approval for the 2026-08-22 deep-dive plan before changing product code or the database.
2. Extend the canonical usage scan to classify current executable bindings: Mandate defaults and bindings, modern Workflow input bindings, Apps, Shortcuts, Schedules, Surface roles/preferences/bindings, Approaches, and other known agent-reference sources.
3. Extend the canonical association edge shape to return `payload_kind` and `payload`; show every live edge touching an Agent, in either direction, without conflating associations with execution drift.
4. Add a server-paged all-Agent inventory RPC/service with counts and worst-drift summaries; do not perform per-row association queries.
5. Build `/agents/usages` with the canonical entity-list system and `/agents/[id]/usages` as the durable per-Agent detail page; keep `/reports/agent-drift` as the attention-only filtered view.
6. Make usage types open-ended: known presentation metadata plus a generic fallback grouped under Other, so new relationship/binding types remain visible.
7. Wire every Agent door: canonical and legacy menus, Agent detail mode tabs/mobile navigation, system/classic surfaces, drift chips, and compact windows. Fix the current singleton-window retarget bug.
8. Add coverage/drift ratchets, focused tests, browser verification, feature documentation, review registration, and commit/push through the normal completion workflow.

## Done

- Audited current frontend routes, menus, windows, selectors, accessibility, and reusable list/navigation primitives.
- Audited the live database scanner and reference graph. The current scanner misses Mandates, modern Workflow bindings, generic Agent associations, and several current binding sources; its closed frontend type model also hides unknown future categories.
