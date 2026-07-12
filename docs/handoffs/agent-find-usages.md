---
status: active
updated: 2026-07-08
repos: [matrx-frontend, aidream]
---

# Agent Find Usages + Drift Detection

Feature is shipped, live in prod, and mostly verified end-to-end. What remains is a short
browser-verification tail — nothing needs new design.

## Resources

- `features/agents/FEATURE.md` → "Find Usages & Drift" (canonical detail; Change log `2026-07-08` records the D3 close).
- Thunks: `features/agents/redux/usages/usages.thunks.ts` (calls `agx_usage_scan` / `agx_usage_report` RPCs).
- Engine UI: `features/agents/components/usages/AgentUsagesEngine.tsx`; windows in `features/window-panels/windows/agents/`.
- Routes: `/reports/agent-drift` + `/administration/reports/agent-drift`; `/agents/admin`, `/reports/admin` maps.
- DB: `agent.usage` / `agent.drift_alert` (post schema-reorg) — RPC names unchanged. Weekly cron = `scheduler.sch_task` "Agent drift weekly scan" (Mondays 13:00 UTC; check `scheduler.sch_run`).
- aidream: `aidream/services/agent_usage/{registry_sync,weekly_scan,drift_dm}.py`, `aidream/api/routers/agent_usage_admin.py` (`/agent-usage/{sync,scan,registry,report}`, super-admin bearer auth).
- DM identities (both env-overridable, defaults in `drift_dm.py` + registered in aidream `REQUIRED_ENV`): sender = "Matrx System" bot `71b55cc0-f333-462f-8176-f558f866ea5d` (`system@aimatrx.com`, `MATRX_SYSTEM_DM_SENDER_USER_ID`); ownerless-usage recipient = platform operator `4cf62e4e-…` (`MATRX_PLATFORM_OPERATOR_USER_ID`). Never point the sender var at a human, and never route recipients to the bot.
- Drift surfacing on `/agents`: severity-tinted `AgentsListHeader` link (the old banner was deliberately removed 2026-06-20; do not resurrect).
- Test login: `/login` → admin@admin.com / Password1234# (this user owns a breaking demo-shortcut alert on agent `42971fe0` "Cleanup Surface Demo Reporter" — a ready-made drift fixture).

## Remaining work

1. **Browser click-through tail:** remediation flows ("Update to active" / "Update all" click → toast → row-clear), "Notify" / "Inform all" dialogs, DM action chips in `MessageBubble`, mobile drawers. Blocked this pass by an unrelated `/messages` bug (conversation list renders empty when the `useConversations` realtime channel double-subscribes — spawned as its own task) and an unstable shared dev browser. The Find Usages window itself, the header drift tint, and `/reports/agent-drift` are browser-verified.
2. **Discrepancy to check:** `/reports/agent-drift` showed "0 agents with drift" for admin@admin.com while the AgentsListHeader tint showed a red count and `agent.drift_alert` holds a pending breaking alert for that user — the report page and the alert ledger may read different sources. Verify `agx_usage_report` vs `drift_alert` semantics before calling it a bug.

## Done

- Full feature built + data/RPC-layer verified live — see `features/agents/FEATURE.md` "Find Usages & Drift".
- Prod activation verified over real HTTP: `/agent-usage/report|registry|scan` (registry 48/48 in-code↔DB, 0 import failures); weekly cron live in `scheduler.sch_run` (real success runs; 28 real DMs landed 2026-06-15).
- FOUND_DEFECTS D3 closed: DM sender = "Matrx System" bot (aidream `b12d8c186` + `419dc9942`); operator-recipient split so ownerless alerts still reach a human.
- DM send path repaired AND verified live: `communication.dm_*` NOT NULL `organization_id` broke every server-side send post-reorg — explicit org stamping shipped (aidream `095310b92`); a prod scan then sent a real bot-authored drift DM end-to-end (`dm_messages` `5c7383b6-3644-4570-9d8b-16d3ace5bf30`, sender resolves as "Matrx System", `action_data.kind=agent_drift`, recipient admin@admin.com — reusable as the chip-click fixture).
- Stale `deprecated: "Stub"` flags removed from both Find Usages window registry entries (`features/window-panels/registry/windowRegistryMetadata.ts`).
