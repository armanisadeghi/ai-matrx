-- draft: after FTS-4 tags move — the tag readers move to platform.tag first (manager ruling 2026-10-05); the manager applies this file once FTS-4 lands. Proof below is green as of 2026-10-05 04:08Z.
-- chair-step: PERMISSION CHANGE (chair C1, wave 2 of SCOPES-ON-THE-STORE). It REVOKES every client privilege on the six old scope tables — SELECT, INSERT, UPDATE, DELETE (and so every column grant derived from them) from `authenticated` and `anon` on context.scopes, scope_types, context_items, context_item_values, context_value_refs, scope_dataset_instances. `postgres`, `service_role` and the Supabase-managed roles keep theirs: the lane-9 doors (SECURITY DEFINER), the image write, the follow and the movers run as the owner and are untouched. The reference tables (templates, template_*, system_context_item, user_active_context, context_access_log, scope_door_registry) are not touched. Reversible in milliseconds: the inverse re-grants the exact pre-image read from pg_class.relacl on production 2026-10-05 04:08Z (21 table grants, all to authenticated; no column ACLs; anon held nothing). `matrx_reader` holds no grant here but reads every table through its pg_read_all_data membership — a server read role, not a client path; left to the chair. Applying it starts the 48 h soak (W2-S).
-- lane: FINISH-THE-SWITCH (FTS-1, wave 2 W2-R of SCOPES-ON-THE-STORE)
-- lock: custom
--
-- Inverse: migrations/inverse/scopesw2_the_old_scope_tables_take_no_client_reads_down.sql.
-- Guard: scripts/campaign-tests/scopesw2_the_old_scope_tables_take_no_client_reads_red_green.sql (RED while a client role
-- holds any privilege on the six; a planted grant inside the guard's own rolled-back transaction turns it red).
--
-- PRE-FLIGHT (2026-10-05, production): 0 statements by authenticated/authenticator/anon/matrx_reader naming the six in
-- pg_stat_statements since its reset 2026-10-03 22:34Z; 0 client-executable SECURITY INVOKER functions reading them outside
-- the guard's allowlist (scopesw2_the_dead_image_readers_are_gone, applied 04:06Z); the five public suggestion views read
-- the store (no context.* dependency); 0 `contextDb(` / `.schema("context")` reads of the six in product code of
-- matrx-frontend, aidream, matrx-local, matrx-extend. Re-run the census before applying.
--
-- THE USE CASE. Cedar Ridge Physical Therapy's scopes, fields and values live only in the record store; a signed-in
-- person can no longer reach the old tables at all, so nothing can quietly read a stale copy.

revoke select, insert, update, delete on table
  context.scopes, context.scope_types, context.context_items, context.context_item_values,
  context.context_value_refs, context.scope_dataset_instances
  from authenticated, anon;

do $post$
declare v text;
begin
  select string_agg(r || ' ' || t || ' ' || p, ', ') into v
    from unnest(array['authenticated', 'anon']) r,
         unnest(array['scopes', 'scope_types', 'context_items', 'context_item_values', 'context_value_refs', 'scope_dataset_instances']) t,
         unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p
   where has_table_privilege(r, 'context.' || t, p);
  if v is not null then
    raise exception 'scopesw2 revoke: a client role still holds %', v;
  end if;
end $post$;
