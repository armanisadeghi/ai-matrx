-- chair-step: lane CUTOVER-CENSUS — one count of copied tables, platform.cutover_tables_copied(org), private; platform._cutover_seam_readiness's Data tables branch now reads it (sentences byte-identical), and the mover's census reads the same function, so "N of M tables copied" on the owner's settings page and the mover's report can never disagree. Nothing written to any row.
-- based-on: platform._cutover_seam_readiness(text, uuid) 90d78cca0caff349011dcbfd38fe4acdc2c5e37150f0b08d5901d38591e1832a
-- lane: CUTOVER-CENSUS
-- INVERSE: migrations/inverse/cutovercensus_the_switch_and_the_mover_count_copied_tables_one_way_down.sql
--
-- THE USE CASE. Arman opens his organization's settings page and reads "Data tables: 111 of 112
-- tables copied. Not yet: CIC Research." The mover's report for the same organization, the same
-- minute, said `source_datasets_live 112 -> store_tables 135`: 135 counted every live Table in the
-- organization, including the 24 option lists the app keeps behind choice columns and any table
-- born in the store. Two honest numbers counted two different ways read as a contradiction. There
-- is now one definition, in one function, and both read it:
--
--   older_live  = the organization's LIVE older tables (workbench.udt_datasets, deleted_at is null)
--   copied      = those whose same-id Table in custom.record is live and is not an option list
--                 the app keeps (data.kept_by_the_app)
--   not_yet     = the first five older tables not copied, by name
--   rows_missing / rows_stale = over the COPIED tables only: live older rows with no live same-id
--                 record, and live older rows edited after their record was written
--   archived_older / app_kept / archived_copies = what is excluded, so a report can say so
--
-- An archived older table is never counted (it is not something the switch archives); an option
-- list the app keeps is never a copy; an archived copy is not a copy.

set lock_timeout = '30s';
set statement_timeout = '120s';

create or replace function platform.cutover_tables_copied(p_org uuid)
returns jsonb
language sql
stable
set search_path to 'pg_catalog'
as $$
  with older as (
    select d.id, d.table_name,
           exists (select 1 from custom.record r
                    where r.organization_id = p_org and r.id = d.id
                      and r.data_class = 'table' and r.deleted_at is null
                      and coalesce((r.data ->> 'kept_by_the_app')::boolean, false) = false) as copied
      from workbench.udt_datasets d
     where d.organization_id = p_org and d.deleted_at is null
  ), rows_of_copies as (
    select count(*) filter (where r.id is null)                                   as missing,
           count(*) filter (where r.id is not null and w.updated_at > r.updated_at) as stale
      from older o
      join workbench.udt_dataset_rows w on w.table_id = o.id and w.deleted_at is null
      left join custom.record r on r.organization_id = p_org and r.id = w.id and r.deleted_at is null
     where o.copied
  )
  select jsonb_build_object(
    'organization_id', p_org,
    'older_live',      (select count(*) from older),
    'copied',          (select count(*) from older where copied),
    'not_yet',         coalesce((select jsonb_agg(x.table_name order by x.table_name)
                                   from (select table_name from older where not copied
                                          order by table_name limit 5) x), '[]'::jsonb),
    'rows_missing',    (select missing from rows_of_copies),
    'rows_stale',      (select stale from rows_of_copies),
    'archived_older',  (select count(*) from workbench.udt_datasets d
                         where d.organization_id = p_org and d.deleted_at is not null),
    'app_kept',        (select count(*) from custom.record r
                         where r.organization_id = p_org and r.data_class = 'table' and r.deleted_at is null
                           and coalesce((r.data ->> 'kept_by_the_app')::boolean, false)),
    'archived_copies', (select count(*) from custom.record r
                         where r.organization_id = p_org and r.data_class = 'table' and r.deleted_at is not null
                           and exists (select 1 from workbench.udt_datasets d
                                        where d.id = r.id and d.organization_id = p_org and d.deleted_at is null)),
    'counted_at',      now());
$$;

comment on function platform.cutover_tables_copied(uuid) is
  'THE count of copied tables for an organization: live older tables vs their live same-id Tables (option lists the app keeps and archived copies are not copies; archived older tables are not counted). Read by platform._cutover_seam_readiness (the Data tables switch) and by the mover''s census (matrx_records.movers.move.TheMove.census). Private: no client role may call it. Lane CUTOVER-CENSUS.';

revoke all on function platform.cutover_tables_copied(uuid) from public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION platform._cutover_seam_readiness(p_seam text, p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  s platform.cutover_seam;
  v_checks jsonb := '[]'::jsonb;
  v_n bigint; v_c bigint; v_missing bigint; v_stale bigint; v_lag bigint;
  v_tn bigint; v_tc bigint; v_sn bigint; v_sc bigint; v_in bigint; v_ic bigint;
  v_names text;
  v_pre jsonb;
  v_count jsonb;
begin
  select * into s from platform.cutover_seam where seam_key = p_seam and retired_at is null;
  if s.seam_key is null then
    return jsonb_build_object('ready', false, 'checked_at', now(), 'checks', jsonb_build_array(
      jsonb_build_object('key', 'known', 'says', 'This switch exists', 'met', false,
                         'detail', format('There is no switch called %s.', p_seam))));
  end if;

  if s.press_kind = 'platform_switch' then
    return jsonb_build_object('ready', false, 'checked_at', now(), 'checks', jsonb_build_array(
      jsonb_build_object('key', 'pressed_here', 'says', 'Switched for one organization', 'met', false,
                         'detail', 'This one switches for everyone at once, in its own rehearsed step, not from an organization''s settings.')));
  elsif s.press_kind = 'already_switched' then
    return jsonb_build_object('ready', false, 'checked_at', now(), 'checks', jsonb_build_array(
      jsonb_build_object('key', 'already', 'says', 'Already on the new system', 'met', true,
                         'detail', s.flip_does)));
  end if;

  if p_seam = 'older_tables' then
    -- ONE COUNT, shared with the mover's census (lane CUTOVER-CENSUS): the organization's live
    -- older tables against their live same-id copies; archived older tables and the option lists
    -- the app keeps are never counted on either side.
    v_count := platform.cutover_tables_copied(p_org);
    v_n := (v_count ->> 'older_live')::bigint;
    v_c := (v_count ->> 'copied')::bigint;
    v_missing := (v_count ->> 'rows_missing')::bigint;
    v_stale := (v_count ->> 'rows_stale')::bigint;
    select string_agg(x, ', ' order by x) into v_names
      from jsonb_array_elements_text(v_count -> 'not_yet') x;

    v_checks := v_checks || jsonb_build_object(
      'key', 'copied', 'says', 'Every table is copied into the new system', 'met', v_c = v_n,
      'detail', case when v_n = 0 then 'This organization has no older tables left.'
                     else format('%s of %s tables copied.', v_c, v_n)
                          || case when v_c < v_n then ' Not yet: ' || v_names || case when v_n - v_c > 5 then format(' and %s more', v_n - v_c - 5) else '' end || '.' else '' end end);

    v_checks := v_checks
      || jsonb_build_object('key', 'rows_present', 'says', 'No row is missing from a copy',
           'met', v_missing = 0,
           'detail', case when v_missing = 0 then 'Every row of every copied table is in its copy.'
                          else format('%s rows are not in their copies yet. Copying the table again brings them.', v_missing) end)
      || jsonb_build_object('key', 'rows_current', 'says', 'No row was edited in an older table after it was copied',
           'met', v_stale = 0,
           'detail', case when v_stale = 0 then 'Every copy is as current as its older table.'
                          else format('%s rows were edited in the older tables after they were copied. Copying again brings the edits.', v_stale) end);

  elsif p_seam = 'agent_context' then
    select count(*), count(*) filter (where r.id is not null and r.deleted_at is null)
      into v_tn, v_tc
      from context.scope_types t
      left join custom.record r on r.organization_id = p_org and r.id = t.id
     where t.organization_id = p_org and t.deleted_at is null;
    select count(*), count(*) filter (where r.id is not null and r.deleted_at is null)
      into v_sn, v_sc
      from context.scopes x
      join context.scope_types t on t.id = x.scope_type_id and t.deleted_at is null
      left join custom.record r on r.organization_id = p_org and r.id = x.id
     where x.organization_id = p_org and x.deleted_at is null;
    select count(*), count(*) filter (where r.id is not null and r.deleted_at is null)
      into v_in, v_ic
      from context.context_items i
      join context.scope_types t on t.id = i.scope_type_id and t.deleted_at is null
      left join custom.record r on r.organization_id = p_org and r.id = i.id
     where t.organization_id = p_org and i.deleted_at is null and i.is_active;

    v_checks := v_checks || jsonb_build_object(
      'key', 'copied', 'says', 'Every scope type, scope and context field is copied',
      'met', v_tc = v_tn and v_sc = v_sn and v_ic = v_in,
      'detail', case when v_tn = 0 then 'This organization has no scopes.'
                     else format('%s of %s scope types, %s of %s scopes, %s of %s context fields copied.',
                                 v_tc, v_tn, v_sc, v_sn, v_ic, v_in) end);

    select count(*) into v_lag
      from custom.io_outbox x
     where x.organization_id = p_org and x.event_key = 'context.follow'
       and x.consumed_at is null and x.deleted_at is null;

    v_checks := v_checks || jsonb_build_object(
      'key', 'follow_current', 'says', 'No edit is waiting to be copied', 'met', v_lag = 0,
      'detail', case when v_lag = 0 then 'The copy has every edit made in the current screens.'
                     else format('%s edits made in the current screens are waiting for the copy.', v_lag) end);
  end if;

  for v_pre in select * from jsonb_array_elements(s.prerequisites) loop
    v_checks := v_checks || jsonb_build_object(
      'key', v_pre ->> 'key', 'says', v_pre ->> 'says',
      'met', coalesce((v_pre ->> 'met')::boolean, false),
      'detail', v_pre ->> 'evidence');
  end loop;

  return jsonb_build_object(
    'ready', not exists (select 1 from jsonb_array_elements(v_checks) c where not (c ->> 'met')::boolean),
    'checked_at', now(),
    'checks', v_checks);
end;
$function$;
