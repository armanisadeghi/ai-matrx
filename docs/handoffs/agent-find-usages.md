---
status: active
updated: 2026-07-28
repos: [matrx-frontend, aidream]
---

# Agent Find Usages + Drift Detection

Shipped and live in prod; verified end-to-end at the data/RPC layer. What remains is a browser
click-through tail — no new design needed.

## Resources

- `features/agents/FEATURE.md` → "Find Usages & Drift" (canonical detail + change log).
- Thunks: `features/agents/redux/usages/usages.thunks.ts` (`agx_usage_scan[_admin]` / `agx_usage_report[_admin]` / `agx_usage_history_counts` + the two remediation RPCs); drift-only row filter in `usages.selectors.ts` (`userRowHasDrift` / `adminRowHasDrift`, applied in `makeSelectReportSorted` + `makeSelectReportTotals`).
- Engine UI: `features/agents/components/usages/AgentUsagesEngine.tsx`; windows in `features/window-panels/windows/agents/`.
- Routes: `app/(core)/reports/agent-drift/` + `app/(admin)/administration/agents/reports/agent-drift/`; `/agents/admin`, `/reports/admin` maps.
- DB: `agent.usage` / `agent.drift_alert` (post schema-reorg) — RPC names unchanged. Weekly cron = `scheduler.sch_task` "Agent drift weekly scan" (Mondays 13:00 UTC; check `scheduler.sch_run`).
- aidream: `aidream/aidream/services/agent_usage/{registry_sync,weekly_scan,drift_dm}.py`, `aidream/aidream/api/routers/agent_usage_admin.py` (`/agent-usage/{sync,scan,registry,report}`, super-admin bearer auth).
- DM identities (env-overridable, defaults in `drift_dm.py`, registered in aidream `REQUIRED_ENV`): sender = "Matrx System" bot `71b55cc0-f333-462f-8176-f558f866ea5d` (`MATRX_SYSTEM_DM_SENDER_USER_ID`); ownerless-usage recipient = platform operator `4cf62e4e-…` (`MATRX_PLATFORM_OPERATOR_USER_ID`). Never point the sender var at a human; never route recipients to the bot.
- Drift surfacing on `/agents`: severity-tinted `AgentsListHeader` link (the old banner was deliberately removed 2026-06-20; do not resurrect).
- Test login: `/login` → admin@admin.com / Password1234# (owns a breaking demo-shortcut alert on agent `42971fe0` "Cleanup Surface Demo Reporter" — a ready-made drift fixture). DM chip fixture: `dm_messages` `5c7383b6-…`.

## Remaining work

1. **Browser click-through tail:** remediation flows ("Update to active" / "Update all" → toast → row clears), "Notify" / "Inform all" dialogs, DM action chips in `MessageBubble`, mobile drawers. The Find Usages window, the header drift tint, and `/reports/agent-drift` are already browser-verified.
2. **Browser-confirm the drift-only rollup filter:** `/reports/agent-drift` for admin@admin.com should show exactly the drifted agents ("1 agent with drift" for the `42971fe0` fixture), matching the `AgentsListHeader` tint.
3. **Fix the stale window-panels inventory doc.** `features/window-panels/docs/inventory/agents-debug.md` still asserts the Find Usages registry entries "say deprecated-stub" and prescribes clearing them — that was done 2026-07-08 and the code is clean (`windowRegistryMetadata.ts` `agent-find-usages-window` / `agent-admin-find-usages-window` carry no `deprecated` key). Correct the doc; also drop the "(new)" labels in `tools-grid/toolsGridTiles.ts:483,807` if still wanted.

**Trap while browser-testing:** `/messages` can render an empty conversation list. Partially fixed 2026-07-15 (`a07e8b9ff`: own-send skip + 750 ms debounced reload in `hooks/useSupabaseMessaging.ts`), but `useConversations` still subscribes **per mount** across 5 consumers and manual broadcast still double-delivers — open backlog recorded in `.claude/skills/supabase-realtime/SKILL.md`. Not this handoff's work; don't chase it here.

## Done

- Full feature built + data/RPC-layer verified live — see `features/agents/FEATURE.md` "Find Usages & Drift".
- Prod activation verified over real HTTP: `/agent-usage/report|registry|scan` (registry 48/48 in-code↔DB, 0 import failures); weekly cron live in `scheduler.sch_run` (28 real DMs landed 2026-06-15).
- FOUND_DEFECTS D3 closed: DM sender = "Matrx System" bot (aidream `b12d8c186` + `419dc9942`); operator-recipient split so ownerless alerts still reach a human.
- DM send path repaired + verified live: explicit org stamping (aidream `095310b92`); real bot-authored drift DM landed end-to-end.
- Drift-only rollup filter landed 2026-07-13 — `agx_usage_report` was correct; the bug was the FE rollup listing every in-scope agent.
- Stale `deprecated: "Stub"` flags removed from both Find Usages window registry entries (code verified clean).
- Drift-alert access no longer depends on `project_id` (2026-07-28).
