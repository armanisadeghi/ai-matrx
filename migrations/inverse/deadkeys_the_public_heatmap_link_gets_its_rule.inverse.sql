-- lane: DEAD-KEYS — inverse of deadkeys_the_public_heatmap_link_gets_its_rule.sql
-- chair-step: an inverse is non-additive by construction — it withdraws a declaration and lets the
-- generator drop the `pub_read` rule and revoke the anon key it issued. It exists to be run on the
-- rehearsal branch for rule 27; it is never meant for the main database.
-- Withdraws the declaration and regenerates, which drops `pub_read` and revokes the anon grant
-- (apply_table_grants' symmetric half takes a dead key on sight). The table returns to exactly the
-- state ANON-LANES measured minus the dead key itself, which is the state the census said was
-- broken -- so this is an undo, never a repair.
set local lock_timeout = '5s';

update platform.entity_types
   set client_anonymous_public_read = false,
       client_anonymous_public_read_reason = null,
       client_anonymous_excluded_columns = null
 where schema_name = 'workbench' and table_name = 'heatmap_saves' and is_active;

do $$
declare
  r record;
begin
  select et.schema_name, et.table_name, et.token, et.rls_variant
    into r
    from platform.entity_types et
   where et.schema_name = 'workbench' and et.table_name = 'heatmap_saves' and et.is_active;
  perform iam.apply_rls(r.schema_name, r.table_name, r.token, r.rls_variant);
end $$;
