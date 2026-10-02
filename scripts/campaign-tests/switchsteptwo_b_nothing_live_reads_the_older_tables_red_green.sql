-- LANE SWITCH-STEP-TWO (2026-10-01) — RED/GREEN for switchsteptwo_b_the_new_system_stops_asking_the_older_tables.sql.
-- CLONE ONLY, read-only, one transaction ROLLED BACK. RED on the bodies before file b: the 20 store bodies and the two
-- pick-list views still name the older tables (workbench.udt_datasets … udt_structured_list_items) outside a comment,
-- so moving those tables to the deprecated schema breaks them (measured: custom.record_write, the data home, the switches panel).
-- GREEN with file b: none of them names an older data-table or pick-list relation; each moved pick-list choice carries
-- its order (metadata.option_position) so the order survives the older items' created_at.
--   psql -f scripts/campaign-tests/switchsteptwo_b_nothing_live_reads_the_older_tables_red_green.sql
-- RED proof: run it inside `begin; \i migrations/inverse/switchsteptwo_b_…_down.sql; \i <this>; rollback;`.
\set ON_ERROR_STOP on
begin;
set local statement_timeout = '2min';
do $guard$ begin
  if (select count(*) from cron.job where active) <> 0 or exists (select 1 from pg_extension where extname = 'pg_net') then
    raise exception 'refused: not the quarantined clone';
  end if;
end $guard$;
do $t$
declare
  c_fns constant text[] := array[
    'platform.table_lives_in(uuid)', 'platform.list_lives_in(uuid)', 'platform._older_table_moved_by_switch(uuid)',
    'platform._older_list_moved_by_switch(uuid)', 'custom._older_table_copy_refusal(uuid)', 'custom._older_table_copy_verdict(uuid)',
    'custom.table_copy_evaluation_state(uuid)', 'custom.where_lists_live(uuid[])', 'custom.where_tables_live(uuid[])',
    'custom.table_list_everywhere(uuid)', 'custom.pick_list_index_everywhere()', 'custom._pick_list_index_of(uuid,uuid)',
    'platform._store_pick_list_document(uuid,uuid,text)', 'platform.custom_field_defs(text,uuid,text,uuid,boolean)',
    'platform._custom_field_definition_guard()', 'platform.data_tables_born_in_the_new_system_for_me()',
    'platform.resolve_id(uuid,text)', 'public._trash_kind_rows(uuid,uuid,uuid,text[],integer,integer)',
    'platform.cutover_seams(uuid)'];
  c_rel constant text := 'workbench\.udt_(datasets|dataset_fields|dataset_rows|dataset_row_versions|structured_lists|structured_list_items)\M';
  v_fn text; v_src text; v_fail text[] := '{}'; v_n int;
begin
  foreach v_fn in array c_fns loop
    select regexp_replace(p.prosrc, '--[^\n]*', '', 'g') into v_src from pg_proc p where p.oid = v_fn::regprocedure;
    if v_src ~ c_rel then v_fail := v_fail || (v_fn || ' still names an older table'); end if;
  end loop;
  -- cutover_seams may still ask the older readiness, but only when the undo is not retired:
  -- the test above covers the others; the seams' guard is checked by its branch.
  if pg_get_viewdef('workbench.pick_list_live'::regclass) ~ c_rel then v_fail := v_fail || 'workbench.pick_list_live still reads the older lists'::text; end if;
  if pg_get_viewdef('workbench.pick_list_item_live'::regclass) ~ c_rel then v_fail := v_fail || 'workbench.pick_list_item_live still reads the older items'::text; end if;
  -- The carried order: a moved list whose choices carry no option_position would reorder once the older items leave.
  select count(distinct c.table_id) into v_n
    from custom.record c join workbench.udt_structured_list_items oi on oi.id = c.id
   where c.data_class = 'record' and c.deleted_at is null and not (c.metadata ? 'option_position');
  if v_n > 0 then v_fail := v_fail || format('%s moved pick lists carry no choice order of their own', v_n); end if;
  if cardinality(v_fail) > 0 then
    raise notice 'RED (%):%', cardinality(v_fail), E'\n  ' || array_to_string(v_fail, E'\n  ');
  else
    raise notice 'GREEN: no store body or pick-list view names an older table, and every moved pick list carries its choice order';
  end if;
end $t$;
rollback;
