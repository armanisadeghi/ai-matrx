---
status: active
updated: 2026-07-13
repos: [matrx-frontend, aidream]
---

# Agent Find Usages + Drift Detection

Feature is shipped, live in prod, and verified end-to-end at the data/RPC layer. What remains is a
short browser-verification tail — nothing needs new design.

## Resources

- `features/agents/FEATURE.md` → "Find Usages & Drift" (canonical detail).
- Thunks: `features/agents/redux/usages/usages.thunks.ts` (calls `agx_usage_scan` / `agx_usage_report` RPCs); drift-only row filter in `usages.selectors.ts` (`userRowHasDrift` / `adminRowHasDrift`).
- Engine UI: `features/agents/components/usages/AgentUsagesEngine.tsx`; windows in `features/window-panels/windows/agents/`.
- Routes: `/reports/agent-drift` + `/administration/reports/agent-drift`; `/agents/admin`, `/reports/admin` maps.
- DB: `agent.usage` / `agent.drift_alert` (post schema-reorg) — RPC names unchanged. Weekly cron = `scheduler.sch_task` "Agent drift weekly scan" (Mondays 13:00 UTC; check `scheduler.sch_run`).
- aidream: `aidream/services/agent_usage/{registry_sync,weekly_scan,drift_dm}.py`, `aidream/api/routers/agent_usage_admin.py` (`/agent-usage/{sync,scan,registry,report}`, super-admin bearer auth).
- DM identities (both env-overridable, defaults in `drift_dm.py` + registered in aidream `REQUIRED_ENV`): sender = "Matrx System" bot `71b55cc0-f333-462f-8176-f558f866ea5d` (`system@aimatrx.com`, `MATRX_SYSTEM_DM_SENDER_USER_ID`); ownerless-usage recipient = platform operator `4cf62e4e-…` (`MATRX_PLATFORM_OPERATOR_USER_ID`). Never point the sender var at a human, and never route recipients to the bot.
- Drift surfacing on `/agents`: severity-tinted `AgentsListHeader` link (the old banner was deliberately removed 2026-06-20; do not resurrect).
- Test login: `/login` → admin@admin.com / Password1234# (this user owns a breaking demo-shortcut alert on agent `42971fe0` "Cleanup Surface Demo Reporter" — a ready-made drift fixture).

## Remaining work

1. **Browser click-through tail:** remediation flows ("Update to active" / "Update all" click → toast → row-clear), "Notify" / "Inform all" dialogs, DM action chips in `MessageBubble`, mobile drawers. Blocked earlier by an unrelated `/messages` bug (conversation list renders empty when the `useConversations` realtime channel double-subscribes — spawned as its own task) and an unstable shared dev browser. The Find Usages window itself, the header drift tint, and `/reports/agent-drift` are browser-verified.
2. **Browser-confirm the drift-only rollup filter** (2026-07-13 change): `/reports/agent-drift` for admin@admin.com should now show exactly the drifted agents ("1 agent with drift" for the `42971fe0` fixture), matching the AgentsListHeader tint.

## Done

- Full feature built + data/RPC-layer verified live — see `features/agents/FEATURE.md` "Find Usages & Drift".
- Prod activation verified over real HTTP: `/agent-usage/report|registry|scan` (registry 48/48 in-code↔DB, 0 import failures); weekly cron live in `scheduler.sch_run` (real success runs; 28 real DMs landed 2026-06-15).
- FOUND_DEFECTS D3 closed: DM sender = "Matrx System" bot (aidream `b12d8c186` + `419dc9942`); operator-recipient split so ownerless alerts still reach a human.
- DM send path repaired AND verified live: explicit org stamping (aidream `095310b92`); real bot-authored drift DM landed end-to-end (`dm_messages` `5c7383b6-…`, reusable as the chip-click fixture).
- Report/tint discrepancy resolved 2026-07-13: `agx_usage_report` verified correct live (returns the `42971fe0` breaking row + pending alert join); the bug was the FE rollup, which listed EVERY in-scope agent and labeled the total "agents with drift" — selectors now filter to drifted rows (severity counts, stale pins, open alert, others-redflags) for both user and admin scopes.
- Stale `deprecated: "Stub"` flags removed from both Find Usages window registry entries.
