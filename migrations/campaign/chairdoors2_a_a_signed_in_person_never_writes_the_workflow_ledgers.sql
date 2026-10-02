-- chair-step: REVOKEs INSERT, UPDATE, DELETE and TRUNCATE on four workflow ledgers — workflow.run, workflow.trigger_fire, workflow.trigger_event, workflow.job — from `anon` and `authenticated`. SELECT stays, so every screen that reads runs (the studio, run pages, Masterwork, news monitor, cloud browser) reads exactly as before through the same RLS select policies. No function, policy, index, column or data row is touched; service_role and the server's own role keep every privilege.
-- lane: CHAIR-DOORS-2 (asked by v6 lane 11 AUTOMATIONS-AND-PAGES, need 7)
--
-- A SIGNED-IN PERSON NEVER WRITES THE WORKFLOW LEDGERS (WF-028). Before this file a member could
-- INSERT/UPDATE a run (its metadata, its status, its trigger stamp), a trigger fire, a trigger
-- event or a job straight through PostgREST, and the server trusts some of those fields.
--
-- WHY NOTHING A CLIENT DOES IS TAKEN (census, 2026-10-02):
--   · matrx-frontend (app, features, lib, packages, components, hooks), aidream/apps (workflow-studio,
--     dashboard, shared), matrx-extend, matrx-local: every `.from("run"|"trigger_fire"|"trigger_event"|"job")`
--     on the workflow schema is a SELECT; none inserts, updates, upserts or deletes.
--   · No SECURITY INVOKER function writes these four tables (the only database writer is the
--     trigger function workflow.emit_trigger_events, SECURITY DEFINER).
--   · The generic API writer custom.entity_row_write refuses all four tokens (api_reach none).
--   · The server writes them as its own role, never `SET LOCAL ROLE authenticated`.
-- The aidream admin dashboard's generic table editor reaches any table through the admin's own
-- session; its run/job edit buttons now get the database's refusal, as on every other closed table.
revoke insert, update, delete, truncate on table workflow.run           from anon, authenticated;
revoke insert, update, delete, truncate on table workflow.trigger_fire  from anon, authenticated;
revoke insert, update, delete, truncate on table workflow.trigger_event from anon, authenticated;
revoke insert, update, delete, truncate on table workflow.job           from anon, authenticated;
