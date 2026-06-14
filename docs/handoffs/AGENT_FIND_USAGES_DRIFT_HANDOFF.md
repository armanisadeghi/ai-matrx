# Handoff — Agent Find Usages + Drift Detection

**Date:** 2026-06-12 · **Branch:** `main` (pushed) · **Commits:** matrx-frontend `5af24c0ad` + `agx_usage_005` follow-up; aidream `6c12bbea`.

Canonical docs: [`features/agents/FEATURE.md`](../../features/agents/FEATURE.md) → "Find Usages & Drift"; [`features/reports/FEATURE.md`](../../features/reports/FEATURE.md); `/agents/admin` + `/reports/admin`; [`KNOWN_DEFECTS.md`](../../KNOWN_DEFECTS.md) D3.

This doc exists because the feature is **functionally complete and fully verified at the data/RPC layer, but has NOT been exercised in a browser or on production.** Everything below is the honest remainder.

---

## 1. Status — what is DONE and proven

Every requirement from the spec + interview is implemented:

| Requirement | State |
|---|---|
| Find all usages (user + admin), version-id resolution | ✅ `agx_usage_scan` / `_admin`, agent→versions→scan |
| Active-version vs pinned distinction; red-flags-first | ✅ RedFlagsStrip renders first |
| Drift severity model incl. the silent tier | ✅ `breaking / silent_breaking / warning / info` |
| Aggregate-only view of others' usage | ✅ enforced in RPC (`row_kind='aggregate'`) |
| DM notify (user + admin "inform all") + custom/default msg | ✅ `NotifyOwnerDialog` + `sendDirectActionMessage` |
| Actionable DM chips (flagged defect) | ✅ `action_data` + `messageActionRegistry` |
| Org-role-aware one-click update; else notify managers | ✅ RPC auth + UI flags |
| One/all remediation for permitted users | ✅ `agx_usage_update_to_active` / `_all_to_active` |
| Report (user + admin) + agent-system entry + reports module | ✅ `/reports`, `/reports/agent-drift`, nav, dashboard tile |
| Code-usage registry + startup sync (prod-gated) + admin API | ✅ `agx_usage_registry`, `services/agent_usage/registry_sync` |
| Weekly scheduled drift task → DM breaking | ✅ `agent_drift_weekly_scan` sch_task |
| Dismissible show-once banner on agents page | ✅ `AgentDriftBanner` |
| Fold into RAG/NER suggestions notification model? | ✅ Decided: **mirror, don't merge** (separate ledger, kg-suggestions semantics, future unified inbox can read both) |

**Server-side verified live against the shared DB (every RPC actually run):**
- `agx_usage_report` — deterministic, 3 agents with drift.
- `agx_usage_scan` (user, auth-gated) + `agx_usage_scan_admin` (super only; non-super correctly rejected `42501`).
- `agx_usage_history_counts` — works after the `agx_usage_005` fix (see §3.1).
- `agx_usage_update_to_active` — **repin actually succeeds** ("Translate to Spanish" v1→v3); `not_pinnable` / `code_managed` branches return graceful errors.
- `agx_usage_update_all_to_active` — runs, returns `{updated, by_type, skipped}`.
- aidream registry sync — 42 code usages upserted, 0 broken pins.
- aidream weekly scan — 30 alert groups, fingerprint dedup clean on re-run (DM send was **stubbed** — see §2).
- Frontend report UI — rendered real data (3 agents, Breaking badge) + engine drill-in (Shortcuts + Surface bindings + red-flags strip + historical section). Lint / typecheck / `check:doctrine` / `check:migrations` all clean.

---

## 2. NOT done — never executed in a browser or on production

These are not bugs; they are **unverified paths**. The code exists and typechecks; the side effects have never actually fired.

1. **The DM send has never actually run.** Every scan test STUBBED `_dm` to avoid spamming real users. So `send_actionable_dm` → `find_or_create_direct_conversation` → `DmMessages.create(action_data=…)` has not inserted a single real row. It is byte-for-byte the proven `feedback-assignment-notifier` flow, but treat it as unproven until one real DM lands.
2. **aidream is not deployed.** Startup registry sync (`run_startup_registry_sync` in lifespan), the weekly cron's first real fire (Mondays 13:00 UTC), and the `/agent-usage/{sync,scan,report}` HTTP endpoints (auth gate, FastAPI wiring) have only been exercised by calling the underlying functions in-process — never over a real request.
3. **The UI windows, banner, chips, and remediation clicks were never rendered in a browser.** The `AgentUsagesEngine` was verified through the report's detail pane (same component), but: the two window shells (`AgentFindUsagesWindow` / `Admin`, opened from the agent menu), the `AgentDriftBanner` on `/agents/all` (no live `agx_drift_alert` rows exist — test rows were cleaned up), the DM action chips in `MessageBubble`, the "Update to active" / "Update all" click→toast→row-clear flow, and the "Notify" / "Inform all" send dialog were not driven in a browser.
4. **Mobile not verified** (WindowPanel auto-drawer, report stacking, banner stacking).

→ See §5 for the exact post-deploy checklist.

---

## 3. Fixes applied during handoff review

### 3.1 `agx_usage_history_counts` text=uuid crash (FIXED — `agx_usage_005`)
`rs_analysis` / `rs_document` / `rs_synthesis` store `agent_id` as **TEXT** (every other historical table is uuid). The RPC compared `agent_id = p_agent_id` (uuid) and threw `operator does not exist: text = uuid` for **every** agent — the "Historical usage" expander failed 100%. Fixed by casting `p_agent_id::text` in the three research branches. Applied + re-verified live.

---

## 4. Known limitations / not-exactly-as-spec (documented, not fixed)

1. **Workflow-node drift is dormant.** The spec lists workflow nodes as a usage surface and the scan has a `workflow_node` branch matching `nodes[].data.config.agent_id`. **Real workflow definitions (49 in the DB) do NOT bind agents at the node level** — agent-ish nodes (`action.ai.chat.manual`, `action.content.structure`) carry a `model` string, not an `agent_id`. So the branch currently matches nothing (no false positives, no errors — correct-but-dormant). It's the forward-looking hook for when agent-pinning workflow nodes ship. **Action:** when workflow agent-nodes land, confirm the real JSON path and adjust the branch in `agx_usage_002_scan_rpcs.sql`.
2. **DM sender = the operator's personal super-admin account** (`4cf62e4e-…`, env `MATRX_SYSTEM_DM_SENDER_USER_ID`). Messages show a real human's name until a dedicated "Matrx System" bot auth-user exists. (KNOWN_DEFECTS D3.)
3. **`agx_purge_versions` doesn't protect every pin holder.** It now preserves shortcut / app / aga_versions / comparison-snapshot / prompt_app / code-registry pins, but **workflow-node version pins stored in `nodes` JSON are not in the preserved set** (can't easily `NOT IN` a JSON path). Edge case (workflow version-pinning is rare + currently nonexistent). Revisit with limitation #1.
4. **`is_usage_active` is hardcoded `true` for surface_binding / sms_line / derived_agent / comparison / code** — those tables have no active/enabled column the scan checks. An "inactive" SMS line still counts as an active usage. Minor.
5. **Surface bindings carry no `user_id` in current data** (both rows for the test agent had `user_id=NULL`), so a no-org surface binding is never "owned" — only org-managed or aggregate, and in the weekly scan routes to the operator. Working as designed, worth knowing.

---

## 5. Production verification checklist (do after aidream deploy)

1. **Startup sync:** boot aidream on a real deployment → confirm the lifespan log shows `[agent_usage] registry sync` with `applied: true`, `created/updated` counts, `broken_pins: []`.
2. **Admin endpoints** (super-admin token): `POST /agent-usage/sync` → RegistrySyncReport; `GET /agent-usage/registry` → code-vs-db diff; `POST /agent-usage/scan` → summary `{created, dms_sent, …}` AND **confirm a real DM with action chips lands** in a seeded recipient's `/messages`; `GET /agent-usage/report`.
3. **Windows:** `/agents/all` → agent card menu → **Find Usages** (red-flags strip, pinned-behind row, expand→diff, **click "Update to active" → row clears + toast**, "Update all" → confirm→bulk). **Find Usages (Admin)** appears only for super-admins (verify absent for a normal user, desktop + mobile drawer); filters narrow; "Inform all affected users" sends DMs.
4. **DM chips:** the drift DM in `/messages/[id]` renders "Review usages" (opens the window pre-bound) + "Drift report" chips.
5. **Report:** `/reports` landing, `/reports/agent-drift` rollup sort + drill-in; `/administration/reports/agent-drift` admin columns; sidebar + dashboard tile.
6. **Banner:** after a scan writes `agx_drift_alert` rows → banner appears once on `/agents/all`; `viewed_at` stamps; Dismiss writes `dismissed_at` and survives reload / another device.
7. **Weekly cron:** confirm the `agent_drift_weekly_scan` sch_task fires Monday 13:00 UTC (check `sch_run`) and re-running produces `unchanged` (no duplicate DMs).
8. **Mobile** (≤768px): windows render as drawers; report stacks; banner stacks.

Seed real drift to test: bump an agent (add/rename a variable + rename a context slot) that a pinned shortcut uses.

---

## 6. Improvement opportunities (prioritized — not blocking)

- **P1 — Report efficiency at scale.** `agx_usage_report()` runs `agx_usage_scan_core(NULL, viewer, 'all')` — a **full-platform scan of every agent's usages** — then filters to the caller's agents. Fine now (~sub-second, 517 agents / 399 usages) but O(all usages) per report load. Push the agent-ownership filter INTO the scan (scan only the caller's agents + agents they have usages of) before this grows.
- **P2 — No automated tests.** Zero coverage on the subtle logic: `agx_usage_eval` severity computation + effective-definition diff (SQL), the weekly-scan dedup state machine (Python), and the FE converters/severity/fingerprint. Add unit tests — the dedup state machine especially (changed/dismissed-same/dismissed-changed/cleared transitions).
- **P2 — Window virtualization.** `UsageGroupList` renders every row; a popular agent ("Get Gemini Image" has 79 usages) yields a long unvirtualized list. Add windowing or a per-group "show all" expander.
- **P3 — Realtime banner.** `AgentDriftBanner` reads `agx_drift_alert` on mount (dispatch-on-idle). A Supabase Broadcast/postgres-changes subscription would make a new alert appear without reload (consistent with kg-suggestions' current polling, so not urgent).
- **P3 — Consolidate the admin rollup.** `/agent-usage/report` re-aggregates `scan_core` rows in Python instead of calling `agx_usage_report_admin()` (the RPC's `is_super_admin()` gate is `auth.uid()`-bound; the router uses the service connection). Two rollup paths can drift. The frontend calls the RPC directly, so the router endpoint is a convenience — consider dropping it or routing it through the RPC with an explicit super-admin arg.
- **P3 — Dedicated system DM bot user** (see §4.2 / KNOWN_DEFECTS D3).

---

## 7. Where everything lives

- **DB:** `migrations/agx_usage_001`–`005`. Engine `agx_usage_scan_core`; user/admin `agx_usage_scan[_admin]`; report `agx_usage_report[_admin]`; remediation `agx_usage_update_to_active` / `_all_to_active`; history `agx_usage_history_counts`. Tables `agx_usage_registry`, `agx_drift_alert`; `dm_messages.action_data`.
- **Frontend:** `features/agents/redux/usages/` (slice `agentUsages`), `features/agents/components/usages/` (engine + parts + `severity.ts`), `features/agents/hooks/use{AgentUsages,DriftReport,DriftAlerts}.ts`, windows in `features/window-panels/windows/agents/`, `features/reports/`, messaging `action_data` in `features/messaging/` + `lib/supabase/messaging.ts`, banner `components/official/CalloutBanner.tsx`.
- **aidream:** `matrx_ai/agents/usage_registry.py` (declaration collector — 8 declaring modules), `aidream/db/agent_usage_managers.py`, `aidream/services/agent_usage/{registry_sync,weekly_scan,drift_dm}.py`, `aidream/api/routers/agent_usage_admin.py`, registration in `system_task_runner.py` + `app.py` lifespan. ORM config fix: `db/matrx_orm.yaml` `env_var_overrides: {NAME: SUPABASE_MATRIX_DATABASE_NAME}` (without it `db/generate.py` silently skips the DB).
