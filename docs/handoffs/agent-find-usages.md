---
status: active
updated: 2026-07-07
repos: [matrx-frontend, aidream]
---

# Agent Find Usages + Drift Detection

Feature is shipped and wired end-to-end at the code/data layer. What remains is entirely
**production activation + real-world verification** — nothing here needs new design.

## Resources

- `features/agents/FEATURE.md` → "Find Usages & Drift" (line ~376 tracks the same pending items — keep the two in sync, detail lives there).
- Thunks: `features/agents/redux/usages/usages.thunks.ts` (calls `agx_usage_scan` / `agx_usage_report` RPCs).
- Engine UI: `features/agents/components/usages/AgentUsagesEngine.tsx`; windows in `features/window-panels/windows/agents/`.
- Routes: `/reports/agent-drift` + `/administration/reports/agent-drift`; `/agents/admin`, `/reports/admin` maps.
- DB: `agx_*` tables now live in the **`agent.*` schema** (post schema-reorg) — RPC names unchanged.
- aidream: `aidream/services/agent_usage/{registry_sync,weekly_scan,drift_dm}.py`, `aidream/api/routers/agent_usage_admin.py`, `matrx_ai/agents/usage_registry.py`.
- Drift surfacing on `/agents`: drift now **tints the AgentsListHeader link** — the old `AgentDriftBanner` was deliberately removed 2026-06-20. There is no banner; do not resurrect one.
- KNOWN_DEFECTS.md D3: DM sender is a personal super-admin account until a "Matrx System" bot user exists.

## Remaining work

1. **aidream prod deploy + activation.** Startup registry sync (lifespan), the weekly cron's first real fire (`agent_drift_weekly_scan`, Mondays 13:00 UTC — check `sch_run`), and the `/agent-usage/{sync,scan,registry,report}` HTTP endpoints have never run on prod (only exercised in-process).
2. **A real DM send has never landed.** Every scan test stubbed the DM step; `send_actionable_dm` → conversation create → `action_data` insert is unproven until one real DM with action chips appears in a recipient's `/messages`.
3. **Browser click-through never done:** Find Usages / Find Usages (Admin) windows from the agent menu, DM action chips in `MessageBubble`, "Update to active" / "Update all" remediation click→toast→row-clear, "Notify" / "Inform all" dialogs, header-link drift tint, mobile drawers. Seed drift by bumping an agent (rename a variable + context slot) that a pinned shortcut uses.

## Done

- Full feature built + data/RPC-layer verified live — scan/report/remediation RPCs, engine UI, reports routes, weekly-scan + registry-sync code. See `features/agents/FEATURE.md` "Find Usages & Drift".
- Drift surfacing moved from banner to AgentsListHeader link tint (banner removed 2026-06-20).
