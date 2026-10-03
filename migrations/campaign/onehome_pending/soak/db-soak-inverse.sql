-- =====================================================================================================
-- CLONE PROOF STATUS (2026-10-03 13:30Z): CLONE PROOF OWED. The main transaction (sections 0-3, 5-8) ran once on
-- the clone (~08:30Z, begin ... set constraints all immediate ... rollback; every statement succeeded) before the
-- clone started crash-looping; section 4-LAST and the inverse round-trip were NOT proven (4-LAST timed out on
-- auth.* locks; the round-trip hit the transaction timeout). Re-run all three once the roll-up says "clone quiet".
-- Production bodies of all 76 touched functions re-read 13:2xZ: md5 identical to the capture.
-- ONE-HOME wave 4 · SOAK · DATABASE — INVERSE of db-soak.sql.
-- Captured 2026-10-03 from PRODUCTION (pg_get_functiondef + owner + EXECUTE grants + comments, trigger def,
-- row images) through matrx_reader, BEFORE db-soak.sql was applied. Hazard "inverse files go stale": if any
-- function below was replaced on production after 2026-10-03, re-capture before running this.
-- =====================================================================================================
begin;
set local lock_timeout = '3s';
set local statement_timeout = '60s';
set local search_path = pg_catalog, public;
-- As pg_dump does: bodies that name each other (e.g. _final_switch_old_write_doors' regprocedure list) restore in any order.
set local check_function_bodies = off;

-- 8. knob custom.data_home_shell: row image before (archived_at/archived_reason/archived_by were null;
--    updated_at was 2026-10-01T20:03:34.146741+00).
update platform.feature_knob
   set archived_at = null, archived_reason = null, archived_by = null,
       updated_at = timestamptz '2026-10-01 20:03:34.146741+00'
 where feature = 'custom' and key = 'data_home_shell';

-- 7. seams: all five had retired_at = null before.
update platform.cutover_seam set retired_at = null
 where seam_key in ('final_switch', 'final_switch_copy_again', 'final_switch_undo', 'older_tables', 'data_screen');

-- 2,3,4,5,6. Every dropped function, as production defined it on 2026-10-03 (66 objects).
-- custom.table_copy_evaluation_state(uuid)
CREATE OR REPLACE FUNCTION custom.table_copy_evaluation_state(p_table_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_uid     uuid := auth.uid();
  v_claims  jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_org     uuid;
  v_live    boolean;
  v_lives   text;
  v_copy    boolean;
  v_writes  bigint; v_rows bigint; v_edited bigint; v_added bigint; v_settings bigint;
begin
  if v_uid is null and coalesce(v_claims ->> 'role', '') <> 'service_role' then
    raise exception 'Sign in to ask about a table.' using errcode = '42501';
  end if;
  if p_table_id is null then
    return jsonb_build_object('table_id', null, 'found', false);
  end if;
  -- The same answer for a table this person cannot open and a table that does not exist.
  if v_uid is not null and not custom.has_visibility(v_uid, 'record', p_table_id, 'viewer'::public.permission_level) then
    return jsonb_build_object('table_id', p_table_id, 'found', false);
  end if;
  -- SWITCH-STEP-TWO: the older tables are in the deprecated; no table is a test copy any more.
  select t.organization_id into v_org from custom.record t where t.id = p_table_id and t.data_class = 'table' limit 1;
  v_live  := false;
  v_lives := 'record';
  v_copy  := false;
  select coalesce(sum(e.writes), 0), count(*),
         count(*) filter (where e.data_class = 'record' and not e.created),
         count(*) filter (where e.data_class = 'record' and e.created),
         count(*) filter (where e.data_class <> 'record')
    into v_writes, v_rows, v_edited, v_added, v_settings
    from platform.cutover_evaluation_write e
   where e.organization_id = v_org and e.table_id = p_table_id and e.replaced_at is null;
  return jsonb_build_object(
    'table_id', p_table_id,
    'found', true,
    'test_copy', v_copy,
    'writable_by_people', true,
    'older_table_live', coalesce(v_live, false),
    'agents_write', coalesce(v_lives, 'record'),
    'evaluation_writes_since_copy', v_writes,
    'rows_touched', v_rows,
    'rows_edited', v_edited,
    'rows_added', v_added,
    'settings_changed', v_settings,
    'says', case when v_copy
                 then 'Test copy: your edits here are replaced by the older table at switch time.'
                 else null end,
    'detail', case when v_copy
                   then 'Agents, automations and integrations still write the older table until an owner switches Data tables in the organization''s settings. '
                        || case when v_rows = 0 then 'Nothing has been changed here yet.'
                                else format('%s %s changed here so far (%s edited, %s added, %s settings); the switch puts them back to the older table and archives the added ones, in a log.',
                                            v_rows, case when v_rows = 1 then 'row' else 'rows' end, v_edited, v_added, v_settings) end
                   else null end);
end;
$function$
;
alter function custom.table_copy_evaluation_state(uuid) owner to postgres;
revoke all on function custom.table_copy_evaluation_state(uuid) from public, anon, authenticated, service_role;
grant execute on function custom.table_copy_evaluation_state(uuid) to postgres;
grant execute on function custom.table_copy_evaluation_state(uuid) to authenticated;
grant execute on function custom.table_copy_evaluation_state(uuid) to service_role;
comment on function custom.table_copy_evaluation_state(uuid) is 'COPY-WRITABLE: the client door to "is this table a test copy, and what have people changed on it?" — test_copy (the same-id copy of a live older table whose organization''s Data tables switch is off), writable_by_people, older_table_live, agents_write (older | record), evaluation_writes_since_copy and row counts, and the sentence the table''s ⋯ menu shows. A table the caller cannot open answers found = false, exactly like a missing one.';

-- platform._final_switch_copy_again_state()
CREATE OR REPLACE FUNCTION platform._final_switch_copy_again_state()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_run uuid;
  v_out jsonb;
begin
  select (p.did ->> 'run')::uuid into v_run from platform.cutover_seam_press p
   where p.seam_key = 'final_switch_copy_again'
   order by p.pressed_at desc, p.id limit 1;
  if v_run is null then
    return null;
  end if;
  select jsonb_build_object(
    'run_id', v_run,
    'started_at', min(p.pressed_at),
    'by', (select coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), u.email::text) from auth.users u
            where u.id = (array_agg(p.pressed_by order by p.pressed_at))[1]),
    'finished', bool_or(p.did ->> 'event' = 'finish'),
    'finished_at', max(p.pressed_at) filter (where p.did ->> 'event' = 'finish'),
    'ok', coalesce(bool_and((p.did ->> 'ok')::boolean) filter (where p.did ->> 'event' in ('organization', 'finish')), true),
    'resumes', count(*) filter (where p.did ->> 'event' = 'resume'),
    'organizations_done', count(distinct p.organization_id) filter (where p.did ->> 'event' = 'organization'),
    'adopted', (select q.did -> 'report' -> 'adopted' from platform.cutover_seam_press q
                 where q.seam_key = 'final_switch_copy_again' and (q.did ->> 'run')::uuid = v_run
                   and q.did ->> 'event' in ('start', 'resume') and q.did -> 'report' ? 'adopted'
                 order by q.pressed_at desc limit 1),
    'organizations', (select coalesce(jsonb_agg(jsonb_build_object(
                         'id', z.organization_id, 'name', (select o.name::text from iam.organizations o where o.id = z.organization_id),
                         'ok', (z.did ->> 'ok')::boolean, 'says', z.says, 'at', z.pressed_at,
                         'ms', (z.did -> 'report' ->> 'ms')::bigint) order by z.pressed_at), '[]'::jsonb)
                        from (select distinct on (q.organization_id) q.* from platform.cutover_seam_press q
                               where q.seam_key = 'final_switch_copy_again' and (q.did ->> 'run')::uuid = v_run
                                 and q.did ->> 'event' = 'organization'
                               order by q.organization_id, q.pressed_at desc) z))
    into v_out
    from platform.cutover_seam_press p
   where p.seam_key = 'final_switch_copy_again' and (p.did ->> 'run')::uuid = v_run;
  return v_out;
end;
$function$
;
alter function platform._final_switch_copy_again_state() owner to postgres;
revoke all on function platform._final_switch_copy_again_state() from public, anon, authenticated, service_role;
grant execute on function platform._final_switch_copy_again_state() to postgres;
grant execute on function platform._final_switch_copy_again_state() to service_role;
grant execute on function platform._final_switch_copy_again_state() to dashboard_user;
grant execute on function platform._final_switch_copy_again_state() to svc_seo;
comment on function platform._final_switch_copy_again_state() is NULL;

-- platform._final_switch_old_write_doors()
CREATE OR REPLACE FUNCTION platform._final_switch_old_write_doors()
 RETURNS regprocedure[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select array[
    -- OLD-WRITE-DOORS-BEGIN
    'public.add_column_to_user_table(uuid, text, text, text, integer, boolean, jsonb, jsonb)',
    'public.add_data_row_to_user_table(uuid, jsonb)',
    'public.append_rows_to_user_table(uuid, jsonb)',
    'public.create_new_user_table_dynamic(text, text, boolean, uuid, jsonb)',
    'public.create_user_table_with_fields(text, text, boolean, uuid, uuid, uuid, jsonb)',
    'public.delete_data_row_from_user_table(uuid)',
    'public.delete_user_table(uuid)',
    'public.udt_backfill_autonumber(uuid, uuid)',
    'public.udt_bulk_write(uuid, jsonb)',
    'public.udt_change_field_type(uuid, uuid, public.field_data_type, text)',
    'public.udt_delete_field(uuid, uuid)',
    'public.udt_set_field_format(uuid, uuid, jsonb)',
    'public.udt_set_table_row_actions(uuid, jsonb)',
    'public.udt_set_table_row_label(uuid, jsonb)',
    'public.udt_set_table_style(uuid, text[], jsonb)',
    'public.udt_upsert_cell(uuid, uuid, text, jsonb)',
    'public.udt_upsert_row(uuid, uuid, jsonb)',
    'public.update_data_row_in_user_table(uuid, jsonb)',
    'public.update_field_metadata(uuid, text, boolean, integer, jsonb)',
    'public.update_user_table_config(uuid, jsonb, jsonb)',
    'public.update_user_table_default_sort(uuid, text, text)',
    'public.update_user_table_metadata(uuid, text, text, boolean, boolean)',
    'public.update_user_table_row_ordering(uuid, boolean, jsonb, text)'
    -- OLD-WRITE-DOORS-END
  ]::regprocedure[];
$function$
;
alter function platform._final_switch_old_write_doors() owner to postgres;
revoke all on function platform._final_switch_old_write_doors() from public, anon, authenticated, service_role;
grant execute on function platform._final_switch_old_write_doors() to postgres;
grant execute on function platform._final_switch_old_write_doors() to service_role;
grant execute on function platform._final_switch_old_write_doors() to dashboard_user;
grant execute on function platform._final_switch_old_write_doors() to svc_seo;
comment on function platform._final_switch_old_write_doors() is NULL;

-- platform._final_switch_orphan_lists()
CREATE OR REPLACE FUNCTION platform._final_switch_orphan_lists()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  with o as (
    select l.id, l.list_name, l.user_id
      from workbench.udt_structured_lists l
     where l.organization_id is null and l.deleted_at is null
  ), b as (
    -- PRESS-AT-SIZE (W12): the organizations of everything that chooses from each such list.
    select o.id, d.organization_id as org
      from o join agent.definition d
        on d.deleted_at is null and d.organization_id is not null
       and jsonb_path_exists(coalesce(d.variable_definitions, '[]'::jsonb),
                             '$[*].customComponent.picklist.listId ? (@ == $id)', jsonb_build_object('id', o.id::text))
    union
    select o.id, ds.organization_id
      from o join workbench.udt_dataset_fields f
        on f.deleted_at is null and f.metadata #>> '{format,options,structuredList,listId}' = o.id::text
      join workbench.udt_datasets ds on ds.id = f.table_id and ds.deleted_at is null and ds.organization_id is not null
    union
    select o.id, r.organization_id
      from o join custom.record r
        on r.table_id = custom.field_kernel_id() and r.data_class = 'field' and r.deleted_at is null
       and (r.data -> 'config' ->> 'options_table_id' = o.id::text
            or r.data #>> '{custom_component,picklist,listId}' = o.id::text)
  ), bo as (
    select b.id, count(distinct b.org)::int as n, (array_agg(distinct b.org))[1] as org
      from b join iam.organizations x on x.id = b.org and x.archived_at is null
     group by b.id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', l.id, 'name', coalesce(nullif(btrim(l.list_name), ''), 'Untitled list'),
           'maker', coalesce((select u.email::text from auth.users u where u.id = l.user_id), 'nobody'),
           'resolution', case when m.n = 1 or coalesce(c.n, 0) = 1 then 'organization' else 'no_owner' end,
           'organization_id', case when m.n = 1 then m.org when c.n = 1 then c.org end,
           'organization_name', (select x.name::text from iam.organizations x
                                  where x.id = case when m.n = 1 then m.org when c.n = 1 then c.org end),
           'why', case when m.n = 1 then 'its maker belongs to one organization'
                       when c.n = 1 then 'what chooses from it is in one organization'
                       when c.n > 1 then format('chosen from in %s organizations', c.n)
                       when l.user_id is null then 'it has no maker'
                       when m.n = 0 then 'its maker belongs to no organization'
                       else format('its maker belongs to %s organizations', m.n) end)
         order by l.list_name, l.id), '[]'::jsonb)
    from o l
    cross join lateral (
      select count(*)::int as n, (array_agg(x.organization_id))[1] as org
        from iam.organization_member x
        join iam.organizations z on z.id = x.organization_id and z.archived_at is null
       where x.user_id = l.user_id) m
    left join bo c on c.id = l.id;
$function$
;
alter function platform._final_switch_orphan_lists() owner to postgres;
revoke all on function platform._final_switch_orphan_lists() from public, anon, authenticated, service_role;
grant execute on function platform._final_switch_orphan_lists() to postgres;
grant execute on function platform._final_switch_orphan_lists() to service_role;
grant execute on function platform._final_switch_orphan_lists() to dashboard_user;
grant execute on function platform._final_switch_orphan_lists() to svc_seo;
comment on function platform._final_switch_orphan_lists() is NULL;

-- platform._final_switch_person_refusal()
CREATE OR REPLACE FUNCTION platform._final_switch_person_refusal()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_headers jsonb := nullif(current_setting('request.headers', true), '')::jsonb;
begin
  if auth.uid() is null or v_claims is null then
    return jsonb_build_object('reason', 'not_a_person',
      'says', 'The final switch is pressed by a platform administrator signed in on the Final switch page. A server, a script or a database connection cannot press it.');
  elsif coalesce(v_claims ->> 'role', '') <> 'authenticated' or coalesce(v_claims ->> 'session_id', '') = '' then
    return jsonb_build_object('reason', 'not_a_person',
      'says', 'The final switch is pressed by a platform administrator signed in on the Final switch page, not with a service key or a minted token.');
  elsif v_headers is null or coalesce(v_headers ->> 'origin', '') = '' then
    return jsonb_build_object('reason', 'not_from_the_screen',
      'says', 'The final switch is pressed from the Final switch page in a browser. This request did not come from a page.');
  elsif not public.is_admin() then
    return jsonb_build_object('reason', 'not_a_platform_admin',
      'says', 'Only a platform administrator presses the final switch, from Administration → Database → Final switch.');
  end if;
  return null;
end;
$function$
;
alter function platform._final_switch_person_refusal() owner to postgres;
revoke all on function platform._final_switch_person_refusal() from public, anon, authenticated, service_role;
grant execute on function platform._final_switch_person_refusal() to postgres;
grant execute on function platform._final_switch_person_refusal() to service_role;
grant execute on function platform._final_switch_person_refusal() to dashboard_user;
grant execute on function platform._final_switch_person_refusal() to svc_seo;
comment on function platform._final_switch_person_refusal() is NULL;

-- platform._final_switch_readiness()
CREATE OR REPLACE FUNCTION platform._final_switch_readiness()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_last platform.cutover_seam_press;
  v_state text;
  v_platform jsonb := '[]'::jsonb;
  v_orgs jsonb := '[]'::jsonb;
  v_orgs_a jsonb[] := '{}'::jsonb[];
  v_scopes_landed boolean;
  v_blocking jsonb := '[]'::jsonb;
  v_need jsonb := '[]'::jsonb;
  v_undo jsonb := '[]'::jsonb;
  v_pre_keys text[];
  o record;
  c jsonb;
  r jsonb;
  rc jsonb;
  rs jsonb;
  v_clears jsonb;
  v_cannot jsonb;
  v_ctx jsonb;
  v_ctx_left jsonb;
  v_ctx_at timestamptz;
  v_ctx_need jsonb := '[]'::jsonb;
  v_orgs_ctx int := 0;
  v_t_state text; v_c_state text;
  v_t_at timestamptz; v_c_at timestamptz;
  v_tl bigint; v_ll bigint; v_st bigint; v_lag bigint;
  v_n bigint; v_names text;
  v_scopes jsonb;
  v_scopes_code boolean;
  v_x jsonb;
  v_rr jsonb;
  v_now_press uuid;
  v_platform_ok boolean;
  v_copy_pending boolean := false;
  v_orphans jsonb;
  v_adopt int := 0;
  v_noowner int := 0;
  v_copy jsonb;
  v_orgs_blocked int := 0; v_orgs_need int := 0; v_orgs_ready int := 0; v_orgs_switch int := 0;
  v_sw jsonb;
begin
  v_last := platform._final_switch_last();
  v_state := coalesce(v_last.direction, 'old');

  -- ── the platform's own checks ─────────────────────────────────────────────────────────────────
  -- (a) The Data tables switch's measured facts (the cutover census): the same for every
  -- organization, so said once here and left out of each organization's list.
  select coalesce(array_agg(p ->> 'key'), '{}'::text[]) into v_pre_keys
    from platform.cutover_seam s, jsonb_array_elements(s.prerequisites) p
   where s.seam_key = 'older_tables';
  for c in select p from platform.cutover_seam s, jsonb_array_elements(s.prerequisites) p
            where s.seam_key = 'older_tables' loop
    v_platform := v_platform || jsonb_build_object(
      'key', c ->> 'key', 'says', c ->> 'says', 'met', coalesce((c ->> 'met')::boolean, false),
      'detail', c ->> 'evidence', 'measured_at', c ->> 'measured_at',
      'fix', 'The cutover census re-measures with every release (census.ts --record); it turns green when every place it names reads the switch.');
  end loop;

  -- (b) Older tables and pick lists that belong to no organization: no organization's switch
  -- reaches them, so they would stay live in the older store.
  -- FINAL-SWITCH (b): the press resolves them itself (coordinator ruling 2026-09-27). A list whose maker
  -- belongs to exactly one organization goes to that organization at Copy again (then it is copied and
  -- archived like the rest); every other one is archived by the press with no owner organization,
  -- named in its record and restorable by the Undo.
  v_orphans := platform._final_switch_orphan_lists();
  select count(*) filter (where x ->> 'resolution' = 'organization'), count(*) filter (where x ->> 'resolution' = 'no_owner')
    into v_adopt, v_noowner from jsonb_array_elements(v_orphans) x;
  v_platform := v_platform || jsonb_build_object(
    'key', 'orphan_lists', 'says', 'Every older pick list with no organization has somewhere to go',
    'met', v_adopt = 0, 'copy_again_clears', true,
    'detail', case when jsonb_array_length(v_orphans) = 0 then 'No older pick list is outside an organization.'
                   else concat_ws(' ',
                     case when v_adopt > 0 then format('%s %s to %s maker''s one organization at Copy again: %s.',
                       v_adopt, case when v_adopt = 1 then 'goes' else 'go' end, case when v_adopt = 1 then 'its' else 'their' end,
                       (select string_agg(format('%s → %s', x ->> 'name', x ->> 'organization_name'), '; ' order by x ->> 'name')
                          from jsonb_array_elements(v_orphans) x where x ->> 'resolution' = 'organization')) end,
                     case when v_noowner > 0 then format('%s %s archived by the press with no owner organization, restorable by Undo: %s.',
                       v_noowner, case when v_noowner = 1 then 'is' else 'are' end,
                       (select string_agg(format('%s (%s)', x ->> 'name', x ->> 'why'), '; ' order by x ->> 'name')
                          from jsonb_array_elements(v_orphans) x where x ->> 'resolution' = 'no_owner')) end) end,
    'fix', 'Copy again on this page gives each its maker''s organization; the press archives the rest.');
  select count(*), string_agg(coalesce(nullif(btrim(d.table_name), ''), 'Untitled table'), '; ' order by d.table_name)
    into v_n, v_names
    from workbench.udt_datasets d
   where d.organization_id is null and d.deleted_at is null;
  v_platform := v_platform || jsonb_build_object(
    'key', 'orphan_tables', 'says', 'Every older table belongs to an organization',
    'met', v_n = 0,
    'detail', case when v_n = 0 then 'No older table is outside an organization.'
                   else format('%s older %s no organization: %s.', v_n,
                               case when v_n = 1 then 'table belongs to' else 'tables belong to' end, v_names) end,
    'fix', 'Give each an organization or archive it.');

  -- (c) The scope and context screens switch (lane SCOPES-WRITE-THROUGH) has its code.
  v_scopes_code := platform._final_switch_scopes_code() <> 'none';
  v_platform := v_platform || jsonb_build_object(
    'key', 'scopes_seam_has_code', 'says', 'The scope and context screens switch has its code',
    'met', v_scopes_code,
    'detail', case platform._final_switch_scopes_code()
                   when 'landed' then 'The scope and context screens switch is pressed for every organization, through its own door; each organization''s scopes readiness is below.'
                   when 'rehearsal_stand_in' then 'Rehearsal on the dev clone: the scope and context screens switch is stood in for.'
                   else 'The scope and context screens switch has no code yet: every scope screen, picker, tag and template still writes the current tables, and the agents'' write-back still goes to them. Lane SCOPES-WRITE-THROUGH is building it; the final switch waits for it.' end,
    'fix', 'Lane SCOPES-WRITE-THROUGH lands its switch (the seam per organization, platform.cutover_seam_press_everyone).');

  -- (d) The last Copy again (its own step on the page, never inside the press) finished green.
  v_copy := platform._final_switch_copy_again_state();
  v_platform := v_platform || jsonb_build_object(
    'key', 'copy_again_finished', 'says', 'The last Step 1 (Copy again and the context copy) finished green',
    'met', v_copy is null or ((v_copy ->> 'finished')::boolean and (v_copy ->> 'ok')::boolean),
    'copy_again_clears', true,
    'detail', case when v_copy is null then 'Step 1 has not run from this page yet; it runs when something below needs it.'
                   when not (v_copy ->> 'finished')::boolean then
                     format('Step 1, started %s by %s, has not finished (%s of its organizations done). Resume it.',
                            to_char((v_copy ->> 'started_at')::timestamptz at time zone 'UTC', 'YYYY-MM-DD HH24:MI "UTC"'),
                            coalesce(v_copy ->> 'by', 'someone'), v_copy ->> 'organizations_done')
                   when not (v_copy ->> 'ok')::boolean then
                     format('The last Step 1 finished with refusals: %s. Run Step 1 again.',
                            coalesce((select string_agg(x ->> 'name' || ' — ' || coalesce(x ->> 'says', ''), '; ')
                                        from jsonb_array_elements(v_copy -> 'organizations') x where not (x ->> 'ok')::boolean), 'see its record'))
                   else format('The last Step 1 finished green at %s.',
                               to_char((v_copy ->> 'finished_at')::timestamptz at time zone 'UTC', 'YYYY-MM-DD HH24:MI "UTC"')) end,
    'fix', 'Step 1 on this page (it resumes where it stopped).');

  -- A platform check Copy again clears holds the press but is not a blocker a person must fix.
  v_platform_ok := not exists (select 1 from jsonb_array_elements(v_platform) p
                                where not (p ->> 'met')::boolean and not coalesce((p ->> 'copy_again_clears')::boolean, false));
  v_copy_pending := exists (select 1 from jsonb_array_elements(v_platform) p
                             where not (p ->> 'met')::boolean and coalesce((p ->> 'copy_again_clears')::boolean, false));
  for c in select p from jsonb_array_elements(v_platform) p
            where not (p ->> 'met')::boolean and not coalesce((p ->> 'copy_again_clears')::boolean, false) loop
    -- FINAL-SWITCH-2: a check's `says` is its met-form name; an unmet one is said as not true yet.
    v_blocking := v_blocking || to_jsonb(format('The platform — not yet: %s: %s',
      case when c ->> 'says' ~ '^[A-Z][a-z]' then lower(left(c ->> 'says', 1)) || substr(c ->> 'says', 2) else c ->> 'says' end,
      rtrim(coalesce(c ->> 'detail', ''), '.')));
  end loop;

  -- ── every organization with anything old, or a switch pressed ─────────────────────────────────
  -- FINAL-SWITCH-2: read in time. Once the scopes press listed every organization (1,635 on
  -- 2026-09-29) this function took 8.2–8.5 s on production, over the 8 s a signed-in page's statement
  -- may run, so the Final switch page failed to load one time in two. Every organization's own facts
  -- (both switches' last press, live counts, waiting edits) are read in this one statement instead of
  -- seven per organization, the scopes switch's code is asked once, and the list is built as an array
  -- (appending to a jsonb array copies it every time: 0.8 s for 1,635 rows).
  v_scopes_landed := platform._final_switch_scopes_code() = 'landed';
  -- READINESS-PARITY (2026-10-01, SAFETY-NET W1): an organization whose scopes are written in the store
  -- first has no scopes_screens readiness below (its writer is the store), so a write to context.*
  -- outside the doors left the two sides different while this read Ready (Alex Hart's Workspace →
  -- Classes, "Biology 101 — Live Test", 2026-10-01 05:03Z). Every store-writer organization's live
  -- scopes are compared with its live Records by id, both directions, per scope type, in ONE set-based
  -- read (platform.cutover_store_writer_scope_parity, ~0.2 s for every organization), keyed by organization.
  select coalesce(jsonb_object_agg(z.k, z.v), '{}'::jsonb) into v_sw
    from (select x ->> 'organization_id' as k, jsonb_agg(x order by x ->> 'scope_type', x ->> 'scope_type_id') as v
            from jsonb_array_elements(platform.cutover_store_writer_scope_parity()) x
           group by 1) z;
  for o in
    select x.id, x.name::text as name, x.created_at, x.archived_at,
           coalesce(lt.direction, 'old') as t_state, lt.pressed_at as t_at,
           coalesce(lc.direction, 'old') as c_state, lc.pressed_at as c_at,
           (select count(*) from workbench.udt_datasets d where d.organization_id = x.id and d.deleted_at is null) as tl,
           (select count(*) from workbench.udt_structured_lists l where l.organization_id = x.id and l.deleted_at is null) as ll,
           (select count(*) from context.scope_types t where t.organization_id = x.id and t.deleted_at is null) as st,
           (select count(*) from custom.io_outbox q
             where q.organization_id = x.id and q.event_key = 'context.follow'
               and not custom.io_outbox_consumed_by(q.id, 'context-follow', q.consumed_at) and q.deleted_at is null) as lag
      from iam.organizations x
      left join lateral platform._cutover_seam_last_done('older_tables', x.id) lt on true
      left join lateral platform._cutover_seam_last_done('agent_context', x.id) lc on true
     where exists (select 1 from workbench.udt_datasets d where d.organization_id = x.id and d.deleted_at is null)
        or exists (select 1 from workbench.udt_structured_lists l where l.organization_id = x.id and l.deleted_at is null)
        or exists (select 1 from context.scope_types t where t.organization_id = x.id and t.deleted_at is null)
        or exists (select 1 from platform.cutover_seam_press p
                    where p.organization_id = x.id and p.outcome = 'done'
                      and p.seam_key in ('older_tables', 'agent_context'))
     order by x.created_at, x.id
  loop
    v_t_state := o.t_state; v_t_at := o.t_at; v_c_state := o.c_state; v_c_at := o.c_at;
    v_tl := o.tl; v_ll := o.ll; v_st := o.st; v_lag := o.lag;
    v_clears := '[]'::jsonb; v_cannot := '[]'::jsonb; v_ctx := '[]'::jsonb; r := null; rc := null;
    -- FINAL-SWITCH (d): what Step 1's context copy for this organization LEFT the last time it ran
    -- (the checks still unmet when it read readiness back after copying), in the latest FINISHED run.
    -- A check the copy already ran and could not clear is not the copy's to clear again: it blocks.
    v_ctx_left := null; v_ctx_at := null;
    if v_copy is not null and (v_copy ->> 'finished')::boolean then
      select z.did -> 'report' -> 'context' -> 'left', (z.did -> 'report' -> 'context' ->> 'finished_at')::timestamptz
        into v_ctx_left, v_ctx_at
        from platform.cutover_seam_press z
       where z.seam_key = 'final_switch_copy_again' and (z.did ->> 'run')::uuid = (v_copy ->> 'run_id')::uuid
         and z.did ->> 'event' = 'organization' and z.organization_id = o.id
         and coalesce((z.did -> 'report' -> 'context' ->> 'ran')::boolean, false)
       order by z.pressed_at desc limit 1;
    end if;

    if v_tl + v_ll > 0 then
      r := platform._cutover_seam_readiness('older_tables', o.id);
      for c in select x from jsonb_array_elements(r -> 'checks') x
                where not (x ->> 'met')::boolean and not ((x ->> 'key') = any (v_pre_keys)) loop
        if coalesce((c ->> 'copy_again_clears')::bigint, 0) > 0 and coalesce((c ->> 'copy_again_leaves')::bigint, 0) = 0 then
          v_clears := v_clears || jsonb_build_object('switch', 'Data tables', 'key', c ->> 'key', 'says', c ->> 'says',
                                                     'detail', c ->> 'detail', 'clears', (c ->> 'copy_again_clears')::bigint);
        else
          v_cannot := v_cannot || jsonb_build_object('switch', 'Data tables', 'key', c ->> 'key', 'says', c ->> 'says',
                                                     'detail', c ->> 'detail',
                                                     'clears', coalesce((c ->> 'copy_again_clears')::bigint, 0),
                                                     'leaves', coalesce((c ->> 'copy_again_leaves')::bigint, 1));
        end if;
      end loop;
    end if;

    if v_c_state = 'old' and v_st > 0 then
      rc := platform._cutover_seam_readiness('agent_context', o.id);
      for c in select x from jsonb_array_elements(rc -> 'checks') x
                where not (x ->> 'met')::boolean and x ->> 'key' <> 'follow_current' loop
        -- FINAL-SWITCH (d): the context copy lands every scope type, scope and context field it is
        -- missing (the runner's --copy-context), so "not everything is copied" is Step 1's to clear.
        if c ->> 'key' = 'copied' and not coalesce(v_ctx_left ? 'agent_context.copied', false) then
          v_ctx := v_ctx || jsonb_build_object('switch', 'Where agents get their context', 'key', 'agent_context.copied',
                                               'says', c ->> 'says', 'detail', c ->> 'detail');
        else
          v_cannot := v_cannot || jsonb_build_object('switch', 'Where agents get their context', 'key', c ->> 'key',
                                                     'says', c ->> 'says',
                                                     'detail', rtrim(coalesce(c ->> 'detail', ''), '.')
                                                               || case when v_ctx_left ? 'agent_context.copied' and c ->> 'key' = 'copied'
                                                                       then format('. The context copy ran at %s and left it.', to_char(v_ctx_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI "UTC"')) else '' end,
                                                     'clears', 0, 'leaves', 1);
        end if;
      end loop;
    end if;
    -- The scope screens, once their switch has landed: each organization's own readiness.
    if v_scopes_landed and v_st > 0 then
      execute 'select case custom.context_writer($1) when ''store'' then null else platform._cutover_seam_readiness(''scopes_screens'', $1) end'
         into rs using o.id;
      for c in select x from jsonb_array_elements(coalesce(rs -> 'checks', '[]'::jsonb)) x
                where not (x ->> 'met')::boolean and x ->> 'key' <> 'follow_current' loop
        -- FINAL-SWITCH (d), from SCOPES-TAILS' own_words_copied (coordinator 2026-09-27): a scope
        -- type's or context field's own words not on its copy are brought by the context copy; the
        -- parity measurement is taken again by Step 1 right after that copy. Both are Step 1's to
        -- clear — unless Step 1 already copied this organization and the check was still unmet after.
        -- SCOPES-ROWS-COPIED (2026-09-28): a row with no store twin (rows_copied) is the context copy's
        -- to land, so it is Step 1's too, under the same rule.
        if ((c ->> 'key' in ('own_words_copied', 'rows_copied') and coalesce((c ->> 'copy_again_clears')::bigint, 0) > 0
                                               and coalesce((c ->> 'copy_again_leaves')::bigint, 0) = 0)
            or c ->> 'key' = 'parity')
           and not coalesce(v_ctx_left ? ('scopes_screens.' || (c ->> 'key')), false) then
          v_ctx := v_ctx || jsonb_build_object('switch', 'Scope and context screens', 'key', 'scopes_screens.' || (c ->> 'key'),
                                               'says', c ->> 'says', 'detail', c ->> 'detail');
        else
          v_cannot := v_cannot || jsonb_build_object('switch', 'Scope and context screens', 'key', c ->> 'key',
                                                     'says', c ->> 'says',
                                                     'detail', rtrim(coalesce(c ->> 'detail', ''), '.')
                                                               || case when v_ctx_left ? ('scopes_screens.' || (c ->> 'key'))
                                                                       then format('. The context copy ran at %s and left it.', to_char(v_ctx_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI "UTC"')) else '' end,
                                                     'clears', 0, 'leaves', 1);
        end if;
      end loop;
    end if;
    -- READINESS-PARITY: a store-writer organization whose two sides differ is blocked by name. It is not
    -- Step 1's to clear: the context copy takes the old side's word, and here the store is the writer, so
    -- which side is right is a person's call. The repair is the write-through door for each named scope
    -- (custom._ctx_bridge, the one the context.* trigger calls), run by the chair.
    if v_sw ? (o.id::text) then
      for c in select x from jsonb_array_elements(v_sw -> (o.id::text)) x loop
        v_cannot := v_cannot || jsonb_build_object('switch', 'Scope and context screens', 'key', 'store_image_parity',
          'says', 'Every live scope is live in both the store and the current scope tables',
          'detail', concat_ws('; ',
            case when (c ->> 'image_only')::bigint > 0 then format('%s: %s %s live in the current scope tables with no live record in the store (%s)',
              c ->> 'scope_type', c ->> 'image_only', case when (c ->> 'image_only')::bigint = 1 then 'scope is' else 'scopes are' end,
              (select string_agg(e, ', ') from jsonb_array_elements_text(c -> 'image_only_examples') e)) end,
            case when (c ->> 'store_only')::bigint > 0 then format('%s: %s %s live in the store with no live scope in the current scope tables (%s)',
              c ->> 'scope_type', c ->> 'store_only', case when (c ->> 'store_only')::bigint = 1 then 'record is' else 'records are' end,
              (select string_agg(e, ', ') from jsonb_array_elements_text(c -> 'store_only_examples') e)) end),
          'scope_type_id', c ->> 'scope_type_id',
          'clears', 0, 'leaves', (c ->> 'image_only')::bigint + (c ->> 'store_only')::bigint);
      end loop;
    end if;
    -- Edits waiting for the context copy hold everything: after the final switch every agent reads
    -- the copy, so a waiting edit is a wrong answer. Whichever side the organization is on.
    -- FINAL-SWITCH (d): Step 1's context copy claims them and carries them (the follow's own drain,
    -- for this one organization), so they are Step 1's to clear — unless it already ran and left them.
    if v_lag > 0 then
      v_x := jsonb_build_object('switch', 'Where agents get their context', 'key', 'follow_current',
        'says', 'No scope edit is waiting to be copied',
        'detail', format('%s %s made in the current scope screens %s waiting for the copy (the oldest since %s).',
                         v_lag, case when v_lag = 1 then 'edit' else 'edits' end, case when v_lag = 1 then 'is' else 'are' end,
                         (select to_char(min(x.created_at) at time zone 'UTC', 'YYYY-MM-DD HH24:MI "UTC"') from custom.io_outbox x
                           where x.organization_id = o.id and x.event_key = 'context.follow'
                             and not custom.io_outbox_consumed_by(x.id, 'context-follow', x.consumed_at) and x.deleted_at is null)));
      if coalesce(v_ctx_left ? 'follow_current', false) then
        v_cannot := v_cannot || (v_x || jsonb_build_object(
          'detail', rtrim(v_x ->> 'detail', '.') || format('. The context copy ran at %s and left them waiting.', to_char(v_ctx_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI "UTC"')),
          'clears', 0, 'leaves', v_lag));
      else
        v_ctx := v_ctx || v_x;
      end if;
    end if;

    for c in select x from jsonb_array_elements(v_cannot) x loop
      v_blocking := v_blocking || to_jsonb(format('%s — %s: not yet: %s: %s', o.name, c ->> 'switch',
        case when c ->> 'says' ~ '^[A-Z][a-z]' then lower(left(c ->> 'says', 1)) || substr(c ->> 'says', 2) else c ->> 'says' end,
        rtrim(coalesce(c ->> 'detail', ''), '.')));
    end loop;
    if jsonb_array_length(v_cannot) > 0 then v_orgs_blocked := v_orgs_blocked + 1; end if;
    if jsonb_array_length(v_clears) > 0 then
      v_need := v_need || to_jsonb(o.id);
      v_orgs_need := v_orgs_need + 1;
    end if;
    if jsonb_array_length(v_ctx) > 0 then
      v_ctx_need := v_ctx_need || to_jsonb(o.id);
      v_orgs_ctx := v_orgs_ctx + 1;
    end if;
    if jsonb_array_length(v_cannot) = 0 and jsonb_array_length(v_clears) = 0 and jsonb_array_length(v_ctx) = 0 then v_orgs_ready := v_orgs_ready + 1; end if;
    -- FINAL-SWITCH (c): the organizations the press itself switches (its plan names a step for them).
    if (v_t_state = 'old' and v_tl + v_ll > 0) or (v_t_state = 'new' and v_tl + v_ll > 0) or (v_c_state = 'old' and v_st > 0) then
      v_orgs_switch := v_orgs_switch + 1;
    end if;

    v_orgs_a := array_append(v_orgs_a, jsonb_build_object(
      'id', o.id, 'name', o.name, 'created_at', o.created_at, 'archived', o.archived_at is not null,
      'tables', jsonb_build_object(
          'live', v_tl,
          'copied', case when r is null then null else ((select x from jsonb_array_elements(r -> 'checks') x where x ->> 'key' = 'copied' limit 1) ->> 'detail') end,
          'state', v_t_state, 'switched_at', case when v_t_state = 'new' then v_t_at end),
      'lists', jsonb_build_object(
          'live', v_ll,
          'copied', case when r is null then null else ((select x from jsonb_array_elements(r -> 'checks') x where x ->> 'key' = 'lists_copied' limit 1) ->> 'detail') end),
      'scopes', jsonb_build_object(
          'types', v_st, 'state', v_c_state, 'switched_at', case when v_c_state = 'new' then v_c_at end,
          'parity', case when rc is not null then ((select x from jsonb_array_elements(rc -> 'checks') x where x ->> 'key' = 'copied' limit 1) ->> 'detail')
                         when v_c_state = 'new' then 'Agents read the copy.'
                         when v_st = 0 then 'No scopes.' end),
      'follow_lag', v_lag,
      'rerun_clears', v_clears,
      'cannot_clear', v_cannot,
      'needs_copy_again', jsonb_array_length(v_clears) > 0,
      'context_clears', v_ctx,
      'needs_context_copy', jsonb_array_length(v_ctx) > 0,
      'ready', jsonb_array_length(v_cannot) = 0 and jsonb_array_length(v_clears) = 0 and jsonb_array_length(v_ctx) = 0,
      'plan', jsonb_build_object(
          'press_tables', v_t_state = 'old' and v_tl + v_ll > 0,
          'sweep_tables', case when v_t_state = 'new' then v_tl else 0 end,
          'sweep_lists', case when v_t_state = 'new' then v_ll else 0 end,
          'press_context', v_c_state = 'old' and v_st > 0)));
  end loop;
  v_orgs := coalesce(to_jsonb(v_orgs_a), '[]'::jsonb);

  -- ── after a run: the undo's plan ──────────────────────────────────────────────────────────────
  if v_state = 'new' then
    for v_x in select x from jsonb_array_elements(coalesce(v_last.did -> 'organizations', '[]'::jsonb)) x
                where x ->> 'tables_press' is not null loop
      v_now_press := (platform._cutover_seam_last_done('older_tables', (v_x ->> 'id')::uuid)).id;
      if v_now_press is distinct from (v_x ->> 'tables_press')::uuid then
        v_undo := v_undo || jsonb_build_object('id', v_x ->> 'id', 'name', v_x ->> 'name',
          'skipped', 'Its Data tables were pressed again after the final switch, so the undo leaves them as they are.');
      else
        v_rr := platform._cutover_seam_reverse_readiness('older_tables', (v_x ->> 'id')::uuid);
        v_undo := v_undo || jsonb_build_object('id', v_x ->> 'id', 'name', v_x ->> 'name',
          'carries', coalesce(v_rr -> 'carries', '[]'::jsonb),
          'not_carried', coalesce(v_rr -> 'not_carried', '[]'::jsonb),
          'needs_confirm', coalesce((v_rr ->> 'needs_confirm')::boolean, false));
      end if;
    end loop;
  end if;

  return jsonb_build_object(
    'ok', true,
    'checked_at', clock_timestamp(),
    'state', v_state,
    'last_run', case when v_last.id is null then null else jsonb_build_object(
        'id', v_last.id, 'direction', v_last.direction, 'at', v_last.pressed_at, 'says', v_last.says,
        'by', (select coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), u.email::text) from auth.users u where u.id = v_last.pressed_by),
        'counts', v_last.did -> 'counts') end,
    'platform', v_platform,
    'organizations', v_orgs,
    -- ONE SET OF COUNTS, EACH NAMED (VERIFIER-27): 'organizations' is every organization listed (it has
    -- anything old, or a switch pressed); 'to_switch' is the ones the press itself switches;
    -- 'nothing_to_switch' the rest (already on the new system, or nothing old left); 'need_copy_again'
    -- and 'blocked' are subsets of the listed ones. 'ready' is kept for older readers: listed
    -- organizations with no difference at all.
    'totals', jsonb_build_object('organizations', jsonb_array_length(v_orgs), 'ready', v_orgs_ready,
                                 'to_switch', v_orgs_switch, 'nothing_to_switch', jsonb_array_length(v_orgs) - v_orgs_switch,
                                 'need_copy_again', v_orgs_need, 'need_context_copy', v_orgs_ctx, 'blocked', v_orgs_blocked),
    'needs_copy_again', v_need,
    'needs_context_copy', v_ctx_need,
    'blocking', v_blocking,
    'orphans', v_orphans,
    'adopt_orphans', v_adopt,
    'copy_again', v_copy,
    'copy_again_needed', v_orgs_need > 0 or v_orgs_ctx > 0 or v_adopt > 0 or (v_copy is not null and not ((v_copy ->> 'finished')::boolean and (v_copy ->> 'ok')::boolean)),
    'no_owner_archived', case when v_state = 'new' then coalesce(v_last.did -> 'orphans' -> 'no_owner', '[]'::jsonb) end,
    'ready', v_state = 'old' and v_platform_ok and v_orgs_blocked = 0 and v_orgs_need = 0 and v_orgs_ctx = 0 and not v_copy_pending,
    'ready_after_copy_again', v_state = 'old' and v_platform_ok and v_orgs_blocked = 0,
    'says', case when v_state = 'new' then 'Everything is on the new system (the final switch).'
                 when v_platform_ok and v_orgs_blocked = 0 and v_orgs_need = 0 and v_orgs_ctx = 0 and not v_copy_pending then
                   format('Ready: pressing switches %s %s at once.', v_orgs_switch,
                          case when v_orgs_switch = 1 then 'organization' else 'organizations' end)
                 when v_platform_ok and v_orgs_blocked = 0 then
                   case when v_orgs_need > 0 or v_orgs_ctx > 0 or v_adopt > 0
                        then format('Ready once Step 1 has run: %s. Run it first; the press stays off until it finishes green.',
                               concat_ws(', ',
                                 case when v_orgs_need > 0 then format('Copy again for %s %s', v_orgs_need, case when v_orgs_need = 1 then 'organization' else 'organizations' end) end,
                                 case when v_orgs_ctx > 0 then format('the context copy for %s %s', v_orgs_ctx, case when v_orgs_ctx = 1 then 'organization' else 'organizations' end) end,
                                 case when v_adopt > 0 then format('%s older pick %s given %s maker''s organization', v_adopt,
                                                                    case when v_adopt = 1 then 'list' else 'lists' end, case when v_adopt = 1 then 'its' else 'their' end) end))
                        else 'Ready once Step 1 finishes green: ' || coalesce((select p ->> 'detail' from jsonb_array_elements(v_platform) p
                                                                                 where p ->> 'key' = 'copy_again_finished'), 'run it first.') end
                 else format('Not ready: %s %s must be fixed first. Step 1 cannot fix %s.',
                             jsonb_array_length(v_blocking), case when jsonb_array_length(v_blocking) = 1 then 'thing' else 'things' end,
                             case when jsonb_array_length(v_blocking) = 1 then 'it' else 'them' end) end,
    'undo', case when v_state = 'new' then jsonb_build_object(
        'plan', v_undo,
        'needs_confirm', exists (select 1 from jsonb_array_elements(v_undo) u where coalesce((u ->> 'needs_confirm')::boolean, false))) end);
end;
$function$
;
alter function platform._final_switch_readiness() owner to postgres;
revoke all on function platform._final_switch_readiness() from public, anon, authenticated, service_role;
grant execute on function platform._final_switch_readiness() to postgres;
grant execute on function platform._final_switch_readiness() to service_role;
grant execute on function platform._final_switch_readiness() to dashboard_user;
grant execute on function platform._final_switch_readiness() to svc_seo;
comment on function platform._final_switch_readiness() is NULL;

-- platform._final_switch_record(text,text,text,text,jsonb,jsonb,text,uuid)
CREATE OR REPLACE FUNCTION platform._final_switch_record(p_direction text, p_outcome text, p_refusal text, p_says text, p_readiness jsonb, p_did jsonb, p_note text, p_id uuid)
 RETURNS void
 LANGUAGE sql
 SET search_path TO 'pg_catalog'
AS $function$
  insert into platform.cutover_seam_press
    (id, seam_key, organization_id, direction, outcome, refusal, says, pressed_by, readiness, did, note)
  values
    (p_id, 'final_switch', platform._final_switch_platform_org(), p_direction, p_outcome, p_refusal, p_says,
     auth.uid(), p_readiness, coalesce(p_did, '{}'::jsonb), p_note);
$function$
;
alter function platform._final_switch_record(text,text,text,text,jsonb,jsonb,text,uuid) owner to postgres;
revoke all on function platform._final_switch_record(text,text,text,text,jsonb,jsonb,text,uuid) from public, anon, authenticated, service_role;
grant execute on function platform._final_switch_record(text,text,text,text,jsonb,jsonb,text,uuid) to postgres;
grant execute on function platform._final_switch_record(text,text,text,text,jsonb,jsonb,text,uuid) to service_role;
grant execute on function platform._final_switch_record(text,text,text,text,jsonb,jsonb,text,uuid) to dashboard_user;
grant execute on function platform._final_switch_record(text,text,text,text,jsonb,jsonb,text,uuid) to svc_seo;
comment on function platform._final_switch_record(text,text,text,text,jsonb,jsonb,text,uuid) is NULL;

-- platform._final_switch_scopes(text,uuid,text,uuid[])
CREATE OR REPLACE FUNCTION platform._final_switch_scopes(p_to text, p_actor uuid, p_note text, p_orgs uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_code text := platform._final_switch_scopes_code();
  v jsonb;
begin
  if v_code = 'landed' then
    execute 'select platform.cutover_seam_press_everyone($1, $2, $3, false, $4, $5)'
       into v using 'scopes_screens', p_to, p_note, p_orgs, p_actor;
    if not coalesce((v ->> 'ok')::boolean, false) then
      raise exception '%', 'Scope and context screens: ' || coalesce(v ->> 'says', 'the switch refused.') using errcode = 'P0001';
    end if;
    return v;
  elsif v_code = 'rehearsal_stand_in' then
    return jsonb_build_object('ok', true, 'rehearsal_stand_in', true, 'to', p_to,
      'says', 'Rehearsal on the dev clone: lane SCOPES-WRITE-THROUGH''s step stood in for; nothing was pressed.');
  end if;
  raise exception 'The scope and context screens switch has no code yet (lane SCOPES-WRITE-THROUGH).' using errcode = 'P0001';
end;
$function$
;
alter function platform._final_switch_scopes(text,uuid,text,uuid[]) owner to postgres;
revoke all on function platform._final_switch_scopes(text,uuid,text,uuid[]) from public, anon, authenticated, service_role;
grant execute on function platform._final_switch_scopes(text,uuid,text,uuid[]) to postgres;
grant execute on function platform._final_switch_scopes(text,uuid,text,uuid[]) to service_role;
grant execute on function platform._final_switch_scopes(text,uuid,text,uuid[]) to dashboard_user;
grant execute on function platform._final_switch_scopes(text,uuid,text,uuid[]) to svc_seo;
comment on function platform._final_switch_scopes(text,uuid,text,uuid[]) is NULL;

-- platform._final_switch_scopes_code()
CREATE OR REPLACE FUNCTION platform._final_switch_scopes_code()
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select case
    when exists (select 1 from platform.cutover_seam s
                  where s.seam_key = 'scopes_screens' and s.retired_at is null
                    and s.per_organization and s.press_kind = 'owner_press')
     and to_regprocedure('platform.cutover_seam_press_everyone(text, text, text, boolean, uuid[], uuid)') is not null
      then 'landed'
    when to_regprocedure('platform._final_switch_scopes_rehearsal_stand_in()') is not null
     and not exists (select 1 from cron.job j where j.active)
      then 'rehearsal_stand_in'
    else 'none' end;
$function$
;
alter function platform._final_switch_scopes_code() owner to postgres;
revoke all on function platform._final_switch_scopes_code() from public, anon, authenticated, service_role;
grant execute on function platform._final_switch_scopes_code() to postgres;
grant execute on function platform._final_switch_scopes_code() to service_role;
grant execute on function platform._final_switch_scopes_code() to dashboard_user;
grant execute on function platform._final_switch_scopes_code() to svc_seo;
comment on function platform._final_switch_scopes_code() is NULL;

-- platform._final_switch_undo_retired_says(platform.cutover_seam_press)
CREATE OR REPLACE FUNCTION platform._final_switch_undo_retired_says(p_row platform.cutover_seam_press)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select format('The undo was retired on %s%s; the switch is final.',
                to_char(p_row.pressed_at at time zone 'UTC', 'Mon FMDD, YYYY'),
                coalesce(' by ' || (select coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), u.email::text)
                                      from auth.users u where u.id = p_row.pressed_by), ''));
$function$
;
alter function platform._final_switch_undo_retired_says(platform.cutover_seam_press) owner to postgres;
revoke all on function platform._final_switch_undo_retired_says(platform.cutover_seam_press) from public, anon, authenticated, service_role;
grant execute on function platform._final_switch_undo_retired_says(platform.cutover_seam_press) to postgres;
grant execute on function platform._final_switch_undo_retired_says(platform.cutover_seam_press) to service_role;
grant execute on function platform._final_switch_undo_retired_says(platform.cutover_seam_press) to dashboard_user;
grant execute on function platform._final_switch_undo_retired_says(platform.cutover_seam_press) to svc_seo;
comment on function platform._final_switch_undo_retired_says(platform.cutover_seam_press) is NULL;

-- platform.cutover_carry_removals(uuid,uuid[])
CREATE OR REPLACE FUNCTION platform.cutover_carry_removals(p_org uuid, p_tables uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_r       record;
  v_done    jsonb := '{}'::jsonb;
  v_refused text[] := '{}';
  v_at      timestamptz := clock_timestamp();
  v_mark    jsonb;
  v_grant   jsonb;
  v_n       integer := 0;
  v_f       record;
  v_word    jsonb;
  v_key     text;
  v_system  text := nullif(current_setting('app.actor_system', true), '');
begin
  -- FINAL-SWITCH-2: the mover's transactions are a server channel (tier code) that names no system,
  -- and archiving a whole Table or list through custom.record_delete also archives its edges in
  -- platform.associations, whose provenance rule refuses "an automated write with no name". The
  -- door caught that refusal per item, so every Copy again left a table or list the older side had
  -- archived live on its copy (admin's Workspace, 2026-09-29). The door names itself for its own
  -- writes when its caller named nothing, and puts the caller's declaration back before it returns.
  if v_system is null then
    perform set_config('app.actor_system', 'platform.cutover_carry_removals (Copy again)', true);
  end if;
  for v_r in select * from platform.cutover_older_removal_rows(p_org, p_tables)
              order by case when kind like '%\_back' escape '\' then 1 when kind in ('table', 'list') then 2 else 3 end, table_name, kind, record_id
  loop
    begin
      v_mark := jsonb_build_object('removed_on_older', jsonb_build_object(
                  'kind', v_r.kind, 'at', v_at,
                  'why', 'removed on the older side while it was the truth; copying again archived it here (lane MOVER-DELETIONS)'));
      if v_r.kind in ('row', 'choice') and v_r.kept_image then
        update platform.cutover_evaluation_write e
           set pre_image = jsonb_set(jsonb_set(e.pre_image, '{deleted_at}', to_jsonb(v_at)),
                                     '{metadata}', coalesce(e.pre_image -> 'metadata', '{}'::jsonb) || v_mark)
         where e.organization_id = p_org and e.record_id = v_r.record_id and e.replaced_at is null and not e.created;
      elsif v_r.kind in ('row', 'choice', 'table', 'list', 'column') then
        -- The mark goes on FIRST, while the record is live and its table still declares it: a retired
        -- column's record is no longer declared by its Table, and the field guard refuses any later
        -- write to it ("the table does not declare a field called truck" — the clone test, 2026-09-26).
        -- The savepoint takes the mark back if the door refuses.
        update custom.record set metadata = coalesce(metadata, '{}'::jsonb) || v_mark
         where organization_id = p_org and id = v_r.record_id;
        if v_r.kind = 'column' then
          perform custom.field_retire(p_org, v_r.record_id);
        else
          -- A table or list is archived with what it holds, as one archive event.
          perform custom.record_delete(p_org, v_r.record_id);
        end if;
      elsif v_r.kind = 'invented_choice' then
        -- LIST-COPY-PERMISSIVE. The copy never invents a choice: every column choosing from this
        -- list takes other values (the older lists did), the choice is archived (restorable, never
        -- deleted), and each cell that held it holds the words it came from, as an other value.
        -- Order matters: the setting first, so the rewritten cell is kept; the archive before the
        -- rewrite, so the words no longer resolve to a live choice.
        select coalesce(nullif(r.metadata ->> 'option_key', ''), '') , to_jsonb(coalesce(nullif(r.data ->> 'name', ''), r.data ->> 'title'))
          into v_key, v_word
          from custom.record r where r.organization_id = p_org and r.id = v_r.record_id;
        for v_f in
          select f.id, f.data ->> 'key' as k, (f.data ->> 'entity_definition_id')::uuid as tbl,
                 coalesce((f.data -> 'config' ->> 'allow_other')::boolean, false) as allows
            from custom.record f
           where f.organization_id = p_org and f.data_class = 'field' and f.deleted_at is null
             and f.data ->> 'type' = 'list'
             and f.data -> 'config' ->> 'options_table_id' = v_r.table_id::text
        loop
          if not v_f.allows then
            perform custom.field_update(p_org, v_f.id, jsonb_build_object('allow_other', true));
          end if;
        end loop;
        update custom.record set metadata = coalesce(metadata, '{}'::jsonb) || v_mark
         where organization_id = p_org and id = v_r.record_id;
        perform custom.record_delete(p_org, v_r.record_id);
        for v_f in
          select f.data ->> 'key' as k, (f.data ->> 'entity_definition_id')::uuid as tbl
            from custom.record f
           where f.organization_id = p_org and f.data_class = 'field' and f.deleted_at is null
             and f.data ->> 'type' = 'list'
             and f.data -> 'config' ->> 'options_table_id' = v_r.table_id::text
        loop
          update custom.record c
             set data = jsonb_set(c.data, array[v_f.k],
                   case when jsonb_typeof(c.data -> v_f.k) = 'array'
                        then (select jsonb_agg(case when e = to_jsonb(v_key) or e = to_jsonb(v_r.record_id::text) then v_word else e end order by o)
                                from jsonb_array_elements(c.data -> v_f.k) with ordinality x(e, o))
                        else v_word end)
           where c.organization_id = p_org and c.table_id = v_f.tbl and c.data_class = 'record'
             and v_key <> ''
             and (c.data -> v_f.k = to_jsonb(v_key) or c.data -> v_f.k = to_jsonb(v_r.record_id::text)
                  or (jsonb_typeof(c.data -> v_f.k) = 'array'
                      and (c.data -> v_f.k @> jsonb_build_array(v_key) or c.data -> v_f.k @> jsonb_build_array(v_r.record_id::text))));
        end loop;
      elsif v_r.kind = 'share' then
        select to_jsonb(p) into v_grant from iam.permissions p where p.id = v_r.record_id;
        perform custom.share_revoke(p_org, v_r.table_id, v_r.principal_kind,
                                    coalesce((v_grant ->> 'granted_to_user_id')::uuid, (v_grant ->> 'granted_to_organization_id')::uuid));
        update custom.record
           set metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{shares_taken_back}',
                                    coalesce(metadata -> 'shares_taken_back', '[]'::jsonb)
                                    || jsonb_build_array(v_grant || jsonb_build_object('taken_back_at', v_at,
                                         'why', 'the older table no longer shares with them (lane MOVER-DELETIONS)')))
         where organization_id = p_org and id = v_r.table_id and data_class = 'table';
      elsif v_r.kind = 'column_back' then
        perform custom.field_restore(p_org, v_r.record_id);
        update custom.record set metadata = metadata - 'removed_on_older' where organization_id = p_org and id = v_r.record_id;
      elsif v_r.kind like '%\_back' escape '\' then
        perform custom.record_restore(p_org, v_r.record_id);
        update custom.record set metadata = metadata - 'removed_on_older' where organization_id = p_org and id = v_r.record_id;
      end if;
      v_done := jsonb_set(v_done, array[v_r.kind], to_jsonb(coalesce((v_done ->> v_r.kind)::int, 0) + 1));
    exception when others then
      v_refused := v_refused || format('%s — %s: %s', coalesce(v_r.table_name, 'a table'), v_r.what, sqlerrm);
    end;
  end loop;

  -- Whom each copied table's older table shares with, now: what the next run compares against.
  update custom.record t
     set metadata = jsonb_set(coalesce(t.metadata, '{}'::jsonb), '{older_shares_seen}', coalesce((
           select jsonb_agg(distinct coalesce(q.granted_to_user_id, q.granted_to_organization_id)::text)
             from iam.permissions q
            where q.resource_type = 'dataset' and q.resource_id = t.id and q.status = 'active'
              and not coalesce(q.is_public, false)), '[]'::jsonb))
    from workbench.udt_datasets d
   where t.organization_id = p_org and t.id = d.id and t.data_class = 'table' and t.deleted_at is null
     and d.organization_id = p_org and d.deleted_at is null
     and (p_tables is null or d.id = any (p_tables))
     and (platform._cutover_seam_last_done('older_tables', p_org)).direction is distinct from 'new'
     and t.metadata -> 'older_shares_seen' is distinct from coalesce((
           select jsonb_agg(distinct coalesce(q.granted_to_user_id, q.granted_to_organization_id)::text)
             from iam.permissions q
            where q.resource_type = 'dataset' and q.resource_id = t.id and q.status = 'active'
              and not coalesce(q.is_public, false)), '[]'::jsonb);
  get diagnostics v_n = row_count;

  perform set_config('app.actor_system', coalesce(v_system, ''), true);
  return jsonb_build_object('carried', v_done, 'refused', to_jsonb(v_refused), 'share_marks', v_n, 'at', v_at);
end;
$function$
;
alter function platform.cutover_carry_removals(uuid,uuid[]) owner to postgres;
revoke all on function platform.cutover_carry_removals(uuid,uuid[]) from public, anon, authenticated, service_role;
grant execute on function platform.cutover_carry_removals(uuid,uuid[]) to postgres;
grant execute on function platform.cutover_carry_removals(uuid,uuid[]) to service_role;
grant execute on function platform.cutover_carry_removals(uuid,uuid[]) to dashboard_user;
grant execute on function platform.cutover_carry_removals(uuid,uuid[]) to svc_seo;
comment on function platform.cutover_carry_removals(uuid,uuid[]) is 'MOVER-DELETIONS: the mover rerun''s removal pass. Archives on the copy, through the store''s own doors, everything platform.cutover_older_removal_rows names (restores the *_back kinds), keeps a person''s test image instead of their visible row, takes back a share the mover carried whose older share is gone (custom.share_revoke; the grant kept on the Table record), and records whom each older table shares with. Store-owner connection only.';

-- platform.final_switch_acting()
CREATE OR REPLACE FUNCTION platform.final_switch_acting()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
begin
  -- PRESS-FENCE C. TRUE only inside the final switch's own run: platform.final_switch_press and
  -- platform.final_switch_undo set app.final_switch_step = 'on' transaction-local around their writes and
  -- clear it before returning (set_config is no client door), the caller is on the admin lane, and the
  -- caller is a platform administrator. Every wall that asks who the caller is answers through this one
  -- predicate during the press, so a platform-wide switch never depends on who pressed it.
  return coalesce(current_setting('app.final_switch_step', true), '') = 'on'
     and platform.admin_lane_open()
     and coalesce(public.is_admin(), false);
end;
$function$
;
alter function platform.final_switch_acting() owner to postgres;
revoke all on function platform.final_switch_acting() from public, anon, authenticated, service_role;
grant execute on function platform.final_switch_acting() to postgres;
grant execute on function platform.final_switch_acting() to authenticated;
grant execute on function platform.final_switch_acting() to service_role;
grant execute on function platform.final_switch_acting() to dashboard_user;
grant execute on function platform.final_switch_acting() to svc_seo;
comment on function platform.final_switch_acting() is NULL;

-- platform.final_switch_adopt_orphan_lists(uuid)
CREATE OR REPLACE FUNCTION platform.final_switch_adopt_orphan_lists(p_run uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_refused jsonb := platform._final_switch_person_refusal();
  v_out jsonb := '[]'::jsonb;
  v_choices int := 0;
  x jsonb;
begin
  if v_refused is not null then
    return jsonb_build_object('ok', false, 'reason', v_refused ->> 'reason', 'says', v_refused ->> 'says');
  end if;
  if coalesce((platform._final_switch_last()).direction, 'old') = 'new' then
    return jsonb_build_object('ok', false, 'reason', 'already_there', 'says', 'Everything is already on the new system.');
  end if;
  for x in select e from jsonb_array_elements(platform._final_switch_orphan_lists()) e
            where e ->> 'resolution' = 'organization' loop
    update workbench.udt_structured_lists
       set organization_id = (x ->> 'organization_id')::uuid,
           metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('final_switch_adopted', jsonb_build_object(
             'from', null, 'organization_id', x ->> 'organization_id', 'organization_name', x ->> 'organization_name',
             'why', x ->> 'why', 'run', p_run, 'at', clock_timestamp(), 'by', auth.uid()))
     where id = (x ->> 'id')::uuid and organization_id is null and deleted_at is null;
    v_out := v_out || jsonb_build_object('id', x ->> 'id', 'name', x ->> 'name', 'organization_id', x ->> 'organization_id',
                                         'organization_name', x ->> 'organization_name');
  end loop;
  -- ORPHAN-CHOICES (B0): a choice with no organization takes its list's, so Copy again copies it
  -- under that organization instead of refusing the whole organization. Archived choices too (the
  -- mover carries them, archived); never a list whose older rows already moved.
  update workbench.udt_structured_list_items i
     set organization_id = l.organization_id
    from workbench.udt_structured_lists l
   where l.id = i.list_id
     and i.organization_id is null
     and l.organization_id is not null
     and not platform._older_list_moved_by_switch(l.id);
  get diagnostics v_choices = row_count;
  return jsonb_build_object('ok', true, 'adopted', v_out, 'choices_given_their_list_organization', v_choices,
    'says', (case when jsonb_array_length(v_out) = 0 then 'No older pick list with no organization had a maker in exactly one organization.'
                  else format('Gave %s older pick %s %s maker''s organization: %s.', jsonb_array_length(v_out),
                              case when jsonb_array_length(v_out) = 1 then 'list' else 'lists' end,
                              case when jsonb_array_length(v_out) = 1 then 'its' else 'their' end,
                              (select string_agg(format('%s → %s', e ->> 'name', e ->> 'organization_name'), '; ') from jsonb_array_elements(v_out) e)) end)
            || case when v_choices = 0 then ''
                    else format(' %s %s with no organization took %s list''s.', v_choices,
                                case when v_choices = 1 then 'choice' else 'choices' end,
                                case when v_choices = 1 then 'its' else 'their' end) end);
end;
$function$
;
alter function platform.final_switch_adopt_orphan_lists(uuid) owner to postgres;
revoke all on function platform.final_switch_adopt_orphan_lists(uuid) from public, anon, authenticated, service_role;
grant execute on function platform.final_switch_adopt_orphan_lists(uuid) to postgres;
grant execute on function platform.final_switch_adopt_orphan_lists(uuid) to service_role;
grant execute on function platform.final_switch_adopt_orphan_lists(uuid) to dashboard_user;
grant execute on function platform.final_switch_adopt_orphan_lists(uuid) to svc_seo;
comment on function platform.final_switch_adopt_orphan_lists(uuid) is NULL;

-- platform.final_switch_copy_again_record(uuid,text,uuid,boolean,jsonb)
CREATE OR REPLACE FUNCTION platform.final_switch_copy_again_record(p_run uuid, p_event text, p_organization_id uuid, p_ok boolean, p_report jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_refused jsonb := platform._final_switch_person_refusal();
  v_id uuid := gen_random_uuid();
  v_says text := coalesce(p_report ->> 'says', case p_event when 'start' then 'Copy again started.' when 'resume' then 'Copy again resumed.'
                                                        when 'finish' then 'Copy again finished.' else 'Copied again.' end);
begin
  if v_refused is not null then
    return jsonb_build_object('ok', false, 'reason', v_refused ->> 'reason', 'says', v_refused ->> 'says');
  end if;
  if p_run is null or p_event is null or p_event not in ('start', 'resume', 'organization', 'finish') then
    return jsonb_build_object('ok', false, 'reason', 'bad_event', 'says', 'A Copy again record names its run and one of start, resume, organization, finish.');
  end if;
  insert into platform.cutover_seam_press
    (id, seam_key, organization_id, direction, outcome, refusal, says, pressed_by, did, note)
  values
    (v_id, 'final_switch_copy_again',
     case when p_event = 'organization' then p_organization_id else platform._final_switch_platform_org() end,
     'new', case when coalesce(p_ok, true) then 'done' else 'refused' end,
     case when coalesce(p_ok, true) then null else 'copy_again_refused' end,
     v_says, auth.uid(),
     jsonb_build_object('run', p_run, 'event', p_event, 'ok', coalesce(p_ok, true), 'report', coalesce(p_report, '{}'::jsonb)),
     'Copy again before the final switch');
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$function$
;
alter function platform.final_switch_copy_again_record(uuid,text,uuid,boolean,jsonb) owner to postgres;
revoke all on function platform.final_switch_copy_again_record(uuid,text,uuid,boolean,jsonb) from public, anon, authenticated, service_role;
grant execute on function platform.final_switch_copy_again_record(uuid,text,uuid,boolean,jsonb) to postgres;
grant execute on function platform.final_switch_copy_again_record(uuid,text,uuid,boolean,jsonb) to service_role;
grant execute on function platform.final_switch_copy_again_record(uuid,text,uuid,boolean,jsonb) to dashboard_user;
grant execute on function platform.final_switch_copy_again_record(uuid,text,uuid,boolean,jsonb) to svc_seo;
comment on function platform.final_switch_copy_again_record(uuid,text,uuid,boolean,jsonb) is NULL;

-- platform.final_switch_press(text,jsonb)
CREATE OR REPLACE FUNCTION platform.final_switch_press(p_note text DEFAULT NULL::text, p_copy_again jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_refused jsonb;
  v_run uuid := gen_random_uuid();
  v_note text;
  v_ready jsonb;
  v_last platform.cutover_seam_press;
  v_o jsonb;
  v_r jsonb;
  v_org uuid;
  v_orgs jsonb := '[]'::jsonb;
  v_entry jsonb;
  v_ids uuid[];
  v_lists uuid[];
  v_id uuid;
  v_values jsonb := '[]'::jsonb;
  v_scopes jsonb;
  v_doors jsonb := '[]'::jsonb;
  v_sig regprocedure;
  v_door record;
  v_before jsonb;
  v_sr_added boolean;
  v_cron jsonb;
  v_job bigint; v_active boolean;
  v_says text;
  v_t0 timestamptz := clock_timestamp();
  v_ts timestamptz;
  v_timings jsonb := '{}'::jsonb;
  v_counts jsonb;
  v_platform uuid := platform._final_switch_platform_org();
  v_list_door text;
  v_noowner jsonb := '[]'::jsonb;
  v_adopted jsonb;
begin
  v_refused := platform._final_switch_person_refusal();
  if v_refused is not null then
    if v_uid is not null then
      perform platform._final_switch_record('new', 'refused', v_refused ->> 'reason', v_refused ->> 'says', null, null, p_note, v_run);
    end if;
    return jsonb_build_object('ok', false, 'reason', v_refused ->> 'reason', 'says', v_refused ->> 'says');
  end if;

  -- One final switch at a time.
  perform pg_advisory_xact_lock(hashtextextended('final_switch', 0));
  v_last := platform._final_switch_last();
  if coalesce(v_last.direction, 'old') = 'new' then
    perform platform._final_switch_record('new', 'refused', 'already_there',
      'Everything is already on the new system (the final switch). Undo is on the same page.', null, null, p_note, v_run);
    return jsonb_build_object('ok', false, 'reason', 'already_there', 'says', 'Everything is already on the new system (the final switch).');
  end if;

  v_ts := clock_timestamp();
  v_ready := platform._final_switch_readiness();
  v_timings := v_timings || jsonb_build_object('readiness_ms', round(extract(epoch from clock_timestamp() - v_ts) * 1000));
  if not (v_ready ->> 'ready')::boolean then
    v_says := case when (v_ready ->> 'ready_after_copy_again')::boolean
                   then 'Not ready yet: ' || (v_ready ->> 'says')
                   else 'Not ready yet: ' || (select string_agg(x, '; ') from jsonb_array_elements_text(v_ready -> 'blocking') x) || '.' end;
    perform platform._final_switch_record('new', 'refused', 'not_ready', v_says, v_ready,
      jsonb_build_object('copy_again', p_copy_again), p_note, v_run);
    return jsonb_build_object('ok', false, 'reason', 'not_ready', 'says', v_says, 'press_id', v_run, 'readiness', v_ready);
  end if;

  v_note := format('the final switch (run %s)', v_run) || coalesce(': ' || nullif(btrim(p_note), ''), '');
  -- The per-organization press recognises its caller (it refuses anyone else while the final switch is on).
  perform set_config('app.final_switch_step', 'on', true);

  begin
    -- 1. Data tables, every organization on the old side with anything older, oldest first.
    v_ts := clock_timestamp();
    for v_o in select x from jsonb_array_elements(v_ready -> 'organizations') x order by x ->> 'created_at', x ->> 'id' loop
      v_org := (v_o ->> 'id')::uuid;
      v_entry := jsonb_build_object('id', v_org, 'name', v_o ->> 'name');
      if (v_o -> 'plan' ->> 'press_tables')::boolean then
        v_r := platform.cutover_seam_press('older_tables', v_org, 'new', v_note);
        if not coalesce((v_r ->> 'ok')::boolean, false) then
          raise exception '%', format('%s — Data tables: %s', v_o ->> 'name', v_r ->> 'says') using errcode = 'P0001';
        end if;
        v_entry := v_entry || jsonb_build_object(
          'tables_press', v_r ->> 'press_id',
          'tables_archived', jsonb_array_length(coalesce(v_r -> 'did' -> 'archived', '[]'::jsonb)),
          'lists_archived', jsonb_array_length(coalesce(v_r -> 'did' -> 'archived_lists', '[]'::jsonb)),
          'automations_rekeyed', jsonb_array_length(coalesce(v_r -> 'did' -> 'rekeyed', '[]'::jsonb)),
          'test_edits_replaced', jsonb_array_length(coalesce(v_r -> 'did' -> 'resynced', '[]'::jsonb)));
      end if;
      v_orgs := v_orgs || v_entry;
    end loop;
    v_timings := v_timings || jsonb_build_object('data_tables_ms', round(extract(epoch from clock_timestamp() - v_ts) * 1000));

    -- 2. Organizations already switched that still hold live older tables or lists: archived with
    -- the same pointer, recorded here so the undo brings back exactly these.
    v_ts := clock_timestamp();
    for v_o in select x from jsonb_array_elements(v_ready -> 'organizations') x
                where (x -> 'plan' ->> 'sweep_tables')::int + (x -> 'plan' ->> 'sweep_lists')::int > 0 loop
      v_org := (v_o ->> 'id')::uuid;
      v_ids := '{}'; v_lists := '{}';
      for v_id in select d.id from workbench.udt_datasets d where d.organization_id = v_org and d.deleted_at is null order by d.id loop
        perform workbench.udt_dataset_archive(v_id, v_id, v_note);
        v_ids := v_ids || v_id;
      end loop;
      for v_id in select l.id from workbench.udt_structured_lists l where l.organization_id = v_org and l.deleted_at is null order by l.id loop
        perform workbench.udt_structured_list_archive(v_id, v_id, v_note);
        v_lists := v_lists || v_id;
      end loop;
      v_orgs := (select jsonb_agg(case when t.e ->> 'id' = v_org::text
                                       then t.e || jsonb_build_object('swept_tables', to_jsonb(v_ids), 'swept_lists', to_jsonb(v_lists))
                                       else t.e end order by t.i)
                   from jsonb_array_elements(v_orgs) with ordinality as t(e, i));
    end loop;
    v_timings := v_timings || jsonb_build_object('leftovers_ms', round(extract(epoch from clock_timestamp() - v_ts) * 1000));

    -- 2b. Older pick lists with no organization whose maker is in none or several organizations
    -- (coordinator ruling 2026-09-27): archived with no owner organization and a pointer to nothing,
    -- named in the record, restorable only by the Undo while the final switch is on.
    for v_o in select x from jsonb_array_elements(coalesce(v_ready -> 'orphans', '[]'::jsonb)) x
                where x ->> 'resolution' = 'no_owner' order by x ->> 'name' loop
      update workbench.udt_structured_lists
         set deleted_at = now(),
             metadata = coalesce(metadata, '{}'::jsonb)
                        || jsonb_build_object('moved_to', null,
                             'final_switch_no_owner', jsonb_build_object('run', v_run, 'at', clock_timestamp(), 'why', v_o ->> 'why'))
       where id = (v_o ->> 'id')::uuid and organization_id is null and deleted_at is null;
      v_noowner := v_noowner || jsonb_build_object('id', v_o ->> 'id', 'name', v_o ->> 'name', 'maker', v_o ->> 'maker', 'why', v_o ->> 'why');
    end loop;
    select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'name', l.list_name,
                                                 'organization_id', l.organization_id,
                                                 'at', l.metadata -> 'final_switch_adopted' ->> 'at') order by l.list_name), '[]'::jsonb)
      into v_adopted
      from workbench.udt_structured_lists l where l.metadata ? 'final_switch_adopted';

    -- 3. Where agents get their context, every organization with scopes on the old side.
    v_ts := clock_timestamp();
    for v_o in select x from jsonb_array_elements(v_ready -> 'organizations') x
                where (x -> 'plan' ->> 'press_context')::boolean order by x ->> 'created_at', x ->> 'id' loop
      v_org := (v_o ->> 'id')::uuid;
      v_r := platform.cutover_seam_press('agent_context', v_org, 'new', v_note);
      if not coalesce((v_r ->> 'ok')::boolean, false) then
        raise exception '%', format('%s — Where agents get their context: %s', v_o ->> 'name', v_r ->> 'says') using errcode = 'P0001';
      end if;
      v_orgs := (select jsonb_agg(case when t.e ->> 'id' = v_org::text
                                       then t.e || jsonb_build_object('context_press', v_r ->> 'press_id')
                                       else t.e end order by t.i)
                   from jsonb_array_elements(v_orgs) with ordinality as t(e, i));
    end loop;
    v_timings := v_timings || jsonb_build_object('agent_context_ms', round(extract(epoch from clock_timestamp() - v_ts) * 1000));

    -- 4. The platform values: an organization made from now on is born on the new side.
    for v_o in select jsonb_build_object('feature', f, 'key', k) from (values
                  ('data_tables', 'older_tables_moved'), ('custom', 'agent_context_reads_the_copy')) as t(f, k) loop
      select k.value into v_before from platform.feature_knob k where k.feature = v_o ->> 'feature' and k.key = v_o ->> 'key';
      perform platform.feature_knob_set(v_o ->> 'feature', v_o ->> 'key', 'true'::jsonb);
      v_values := v_values || (v_o || jsonb_build_object('before', v_before, 'now', true));
    end loop;

    -- 5. Scope and context screens, every organization (lane SCOPES-WRITE-THROUGH's own door).
    v_ts := clock_timestamp();
    -- Every organization that holds scopes; the rest write in the store through the platform value (4).
    v_scopes := platform._final_switch_scopes('new', v_uid, v_note,
      (select coalesce(array_agg((x ->> 'id')::uuid), '{}'::uuid[]) from jsonb_array_elements(v_ready -> 'organizations') x
        where (x -> 'scopes' ->> 'types')::int > 0));
    -- 5b. Lane SCOPES-WRITE-THROUGH's setting's platform value, AFTER its press (the press reads each
    -- organization's writer from it): an organization with no scopes yet writes its first ones in the store.
    if platform._final_switch_scopes_code() = 'landed'
       and exists (select 1 from platform.feature_knob fk where fk.feature = 'custom' and fk.key = 'scopes_written_in_the_store') then
      select k.value into v_before from platform.feature_knob k where k.feature = 'custom' and k.key = 'scopes_written_in_the_store';
      perform platform.feature_knob_set('custom', 'scopes_written_in_the_store', 'true'::jsonb);
      v_values := v_values || jsonb_build_object('feature', 'custom', 'key', 'scopes_written_in_the_store',
                                                 'before', v_before, 'now', true, 'after_scopes', true);
    end if;
    v_timings := v_timings || jsonb_build_object('scopes_ms', round(extract(epoch from clock_timestamp() - v_ts) * 1000));

    -- 6. The Data page for everyone, recorded on the platform organization.
    insert into platform.cutover_seam_press (seam_key, organization_id, direction, outcome, says, pressed_by, did, note)
    values ('data_screen', v_platform, 'new', 'done', 'The Data page opens the new tables for everyone.', v_uid,
            jsonb_build_object('final_switch_run', v_run), v_note);

    -- 7. The older WRITE doors leave the browser's reach, through the door registry.
    v_ts := clock_timestamp();
    foreach v_sig in array platform._final_switch_old_write_doors() loop
      select d.id, d.signed_in_callers, d.anonymous_callers, d.anonymous_purpose, d.non_client_lane, d.reason
        into v_door
        from platform.client_callable_door d
        join pg_proc p on p.oid = v_sig
        join pg_namespace n on n.oid = p.pronamespace
       where d.schema_name = n.nspname and d.function_name = p.proname
         and d.identity_argtypes = platform.door_argtypes(p.proargtypes);
      v_before := jsonb_build_object(
        'door', v_sig::text,
        'row', case when v_door.id is null then null else jsonb_build_object(
                 'id', v_door.id, 'signed_in_callers', v_door.signed_in_callers, 'anonymous_callers', v_door.anonymous_callers,
                 'anonymous_purpose', v_door.anonymous_purpose, 'non_client_lane', v_door.non_client_lane) end,
        'public', has_function_privilege('public', v_sig, 'EXECUTE'),
        'anon', has_function_privilege('anon', v_sig, 'EXECUTE'),
        'authenticated', has_function_privilege('authenticated', v_sig, 'EXECUTE'),
        'service_role', has_function_privilege('service_role', v_sig, 'EXECUTE'));
      v_list_door := format('Closed to clients by the final switch (run %s): the older tables moved to the new system, where every client writes now. The server (service_role) and the switch''s own undo still reach it; the undo opens it again exactly as it was.', v_run);
      if v_door.id is not null then
        update platform.client_callable_door
           set signed_in_callers = false, anonymous_callers = false, anonymous_purpose = null,
               non_client_lane = v_list_door
         where id = v_door.id;
      else
        insert into platform.client_callable_door
          (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason,
           signed_in_callers, anonymous_callers, non_client_lane)
        select n.nspname, p.proname, iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes),
               'platform.final_switch_press (lane FINAL-SWITCH)',
               'An older-table write door, recorded here so no client may open it while the final switch is on.',
               false, false, v_list_door
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace where p.oid = v_sig
        returning id into v_id;
        v_before := v_before || jsonb_build_object('row_added', v_id);
      end if;
      v_doors := v_doors || v_before;
    end loop;
    execute 'revoke execute on function ' || (select string_agg(x::text, ', ') from unnest(platform._final_switch_old_write_doors()) x)
         || ' from public, anon, authenticated';
    -- service_role keeps what it had, even when it had it only through PUBLIC.
    v_doors := (select jsonb_agg(case when (t.d ->> 'service_role')::boolean
                                           and not has_function_privilege('service_role', (t.d ->> 'door')::regprocedure, 'EXECUTE')
                                      then t.d || jsonb_build_object('service_role_added', true) else t.d end order by t.i)
                  from jsonb_array_elements(v_doors) with ordinality as t(d, i));
    for v_before in select d from jsonb_array_elements(v_doors) d where coalesce((d ->> 'service_role_added')::boolean, false) loop
      execute format('grant execute on function %s to service_role', v_before ->> 'door');
    end loop;
    v_timings := v_timings || jsonb_build_object('doors_ms', round(extract(epoch from clock_timestamp() - v_ts) * 1000));

    -- 8. The weekly trim of older row history pauses, so the undo is lossless.
    select j.jobid, j.active into v_job, v_active from cron.job j where j.jobname = 'udt_dataset_row_versions_trim_weekly';
    if v_job is not null then
      perform cron.alter_job(v_job, active := false);
      v_cron := jsonb_build_object('job', 'udt_dataset_row_versions_trim_weekly', 'jobid', v_job, 'active_before', v_active, 'active_now', false);
    else
      v_cron := jsonb_build_object('job', 'udt_dataset_row_versions_trim_weekly', 'absent', true);
    end if;
  exception when others then
    perform set_config('app.final_switch_step', '', true);
    v_says := 'Nothing was changed: the final switch stopped part way and every organization was rolled back. ' || sqlerrm;
    perform platform._final_switch_record('new', 'refused', 'the_step_failed', v_says, v_ready,
      jsonb_build_object('copy_again', p_copy_again), p_note, v_run);
    return jsonb_build_object('ok', false, 'reason', 'the_step_failed', 'says', v_says, 'press_id', v_run);
  end;

  -- The press's own mark ends with the press: nothing else in this transaction passes as the final switch.
  perform set_config('app.final_switch_step', '', true);
  v_counts := jsonb_build_object(
    -- VERIFIER-27: 'organizations' is every organization the press looked at; 'switched' the ones it
    -- switched (a Data tables, leftovers or agent-context press, or its scope screens).
    'organizations', jsonb_array_length(v_orgs),
    'switched', (select count(*) from jsonb_array_elements(v_orgs) e
                  where e ? 'tables_press' or e ? 'context_press' or e ? 'swept_tables' or e ? 'swept_lists'
                     or (e ->> 'id') in (select x ->> 'organization_id' from jsonb_array_elements(coalesce(v_scopes -> 'pressed', '[]'::jsonb)) x)),
    'scopes_pressed', jsonb_array_length(coalesce(v_scopes -> 'pressed', '[]'::jsonb)),
    'data_tables_pressed', (select count(*) from jsonb_array_elements(v_orgs) e where e ? 'tables_press'),
    'tables_archived', (select coalesce(sum((e ->> 'tables_archived')::int), 0) + coalesce(sum(jsonb_array_length(coalesce(e -> 'swept_tables', '[]'::jsonb))), 0) from jsonb_array_elements(v_orgs) e),
    'lists_archived', (select coalesce(sum((e ->> 'lists_archived')::int), 0) + coalesce(sum(jsonb_array_length(coalesce(e -> 'swept_lists', '[]'::jsonb))), 0) from jsonb_array_elements(v_orgs) e),
    'automations_rekeyed', (select coalesce(sum((e ->> 'automations_rekeyed')::int), 0) from jsonb_array_elements(v_orgs) e),
    'agent_context_pressed', (select count(*) from jsonb_array_elements(v_orgs) e where e ? 'context_press'),
    'doors_closed', jsonb_array_length(v_doors),
    'no_owner_lists_archived', jsonb_array_length(v_noowner),
    'orphan_lists_adopted', jsonb_array_length(v_adopted));
  v_timings := v_timings || jsonb_build_object('total_ms', round(extract(epoch from clock_timestamp() - v_t0) * 1000));
  v_says := format('Switched everything to the new system: %s organizations switched (Data tables %s, agent context %s, scope screens %s), %s older tables and %s pick lists archived with their pointers, %s automations re-keyed, %s older write doors closed to clients.',
                   v_counts ->> 'switched', v_counts ->> 'data_tables_pressed', v_counts ->> 'agent_context_pressed', v_counts ->> 'scopes_pressed',
                   v_counts ->> 'tables_archived', v_counts ->> 'lists_archived', v_counts ->> 'automations_rekeyed', v_counts ->> 'doors_closed')
            || case when jsonb_array_length(v_adopted) > 0 then format(' Pick lists with no organization given their maker''s one organization: %s.',
                      (select string_agg(x ->> 'name', '; ') from jsonb_array_elements(v_adopted) x)) else '' end
            || case when jsonb_array_length(v_noowner) > 0 then format(' Archived with no owner organization (restorable by Undo): %s.',
                      (select string_agg(format('%s (%s)', x ->> 'name', x ->> 'why'), '; ') from jsonb_array_elements(v_noowner) x)) else '' end;

  perform platform._final_switch_record('new', 'done', null, v_says, v_ready,
    jsonb_build_object('organizations', v_orgs, 'values', v_values, 'scopes', v_scopes, 'doors', v_doors,
                       'orphans', jsonb_build_object('adopted', v_adopted, 'no_owner', v_noowner),
                       'cron', v_cron, 'copy_again', p_copy_again, 'counts', v_counts, 'timings', v_timings),
    p_note, v_run);
  return jsonb_build_object('ok', true, 'press_id', v_run, 'state', 'new', 'says', v_says, 'counts', v_counts, 'timings', v_timings);
end;
$function$
;
alter function platform.final_switch_press(text,jsonb) owner to postgres;
revoke all on function platform.final_switch_press(text,jsonb) from public, anon, authenticated, service_role;
grant execute on function platform.final_switch_press(text,jsonb) to postgres;
grant execute on function platform.final_switch_press(text,jsonb) to authenticated;
comment on function platform.final_switch_press(text,jsonb) is NULL;

-- platform.final_switch_readiness()
CREATE OR REPLACE FUNCTION platform.final_switch_readiness()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_out jsonb;
  v_retired platform.cutover_seam_press;
  v_last platform.cutover_seam_press;
begin
  if auth.uid() is null then
    if v_claims is not null and coalesce(v_claims ->> 'role', '') <> 'service_role' then
      return jsonb_build_object('ok', false, 'reason', 'not_signed_in', 'says', 'Sign in as a platform administrator to see the final switch.');
    end if;
  elsif not public.is_admin() then
    return jsonb_build_object('ok', false, 'reason', 'not_a_platform_admin',
      'says', 'Only a platform administrator sees the final switch, from Administration.');
  end if;
  -- SWITCH-STEP-TWO: a retired undo answers the retired board and never measures the older tables
  -- (they are in the archive once step two runs).
  v_retired := platform._final_switch_undo_retired();
  if v_retired.id is not null then
    v_last := platform._final_switch_last();
    return jsonb_build_object(
      'ok', true, 'checked_at', clock_timestamp(), 'state', 'new',
      'last_run', case when v_last.id is null then null else jsonb_build_object(
          'id', v_last.id, 'direction', v_last.direction, 'at', v_last.pressed_at, 'says', v_last.says,
          'by', (select coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), u.email::text) from auth.users u where u.id = v_last.pressed_by),
          'counts', v_last.did -> 'counts') end,
      'platform', '[]'::jsonb, 'organizations', '[]'::jsonb,
      'totals', jsonb_build_object('organizations', 0, 'ready', 0, 'to_switch', 0, 'nothing_to_switch', 0,
                                   'need_copy_again', 0, 'need_context_copy', 0, 'blocked', 0),
      'needs_copy_again', '[]'::jsonb, 'needs_context_copy', '[]'::jsonb, 'blocking', '[]'::jsonb,
      'orphans', '[]'::jsonb, 'copy_again', null, 'copy_again_needed', false,
      'ready', false, 'ready_after_copy_again', false,
      'says', 'Everything is on the new system. ' || platform._final_switch_undo_retired_says(v_retired),
      'undo', null,
      'undo_retired', jsonb_build_object('at', v_retired.pressed_at,
                                         'by', (select coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), u.email::text) from auth.users u where u.id = v_retired.pressed_by),
                                         'says', platform._final_switch_undo_retired_says(v_retired)),
      'may_press', false, 'may_undo', false, 'may_retire_undo', false);
  end if;
  v_out := platform._final_switch_readiness();
  return v_out || jsonb_build_object(
    'may_press', auth.uid() is not null and (v_out ->> 'ready')::boolean,
    'may_undo', auth.uid() is not null and v_out ->> 'state' = 'new',
    'may_retire_undo', auth.uid() is not null and v_out ->> 'state' = 'new',
    'undo_retired', null);
end;
$function$
;
alter function platform.final_switch_readiness() owner to postgres;
revoke all on function platform.final_switch_readiness() from public, anon, authenticated, service_role;
grant execute on function platform.final_switch_readiness() to postgres;
grant execute on function platform.final_switch_readiness() to authenticated;
comment on function platform.final_switch_readiness() is NULL;

-- platform.final_switch_retire_undo(text)
CREATE OR REPLACE FUNCTION platform.final_switch_retire_undo(p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_refused jsonb;
  v_last platform.cutover_seam_press;
  v_retired platform.cutover_seam_press;
  v_id uuid := gen_random_uuid();
  v_says text;
  v_reason text;
begin
  v_refused := platform._final_switch_person_refusal();
  if v_refused is not null then
    return jsonb_build_object('ok', false, 'reason', v_refused ->> 'reason', 'says', v_refused ->> 'says');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('final_switch', 0));
  v_retired := platform._final_switch_undo_retired();
  v_last := platform._final_switch_last();
  if v_retired.id is not null then
    v_reason := 'already_retired'; v_says := platform._final_switch_undo_retired_says(v_retired);
  elsif coalesce(v_last.direction, 'old') <> 'new' then
    v_reason := 'not_pressed'; v_says := 'The final switch is not pressed, so there is no undo to retire.';
  end if;
  if v_reason is not null then
    insert into platform.cutover_seam_press (id, seam_key, organization_id, direction, outcome, refusal, says, pressed_by, did, note)
    values (v_id, 'final_switch_undo', platform._final_switch_platform_org(), 'new', 'refused', v_reason, v_says, auth.uid(), '{}'::jsonb, p_note);
    return jsonb_build_object('ok', false, 'reason', v_reason, 'says', v_says);
  end if;
  insert into platform.cutover_seam_press (id, seam_key, organization_id, direction, outcome, says, pressed_by, did, note)
  values (v_id, 'final_switch_undo', platform._final_switch_platform_org(), 'new', 'done',
          'The undo is retired; the older tables move to the archive next.', auth.uid(),
          jsonb_build_object('final_switch_run', v_last.id), p_note);
  v_retired := platform._final_switch_undo_retired();
  return jsonb_build_object('ok', true, 'id', v_id, 'final_switch_run', v_last.id,
                            'says', platform._final_switch_undo_retired_says(v_retired));
end;
$function$
;
alter function platform.final_switch_retire_undo(text) owner to postgres;
revoke all on function platform.final_switch_retire_undo(text) from public, anon, authenticated, service_role;
grant execute on function platform.final_switch_retire_undo(text) to postgres;
grant execute on function platform.final_switch_retire_undo(text) to authenticated;
grant execute on function platform.final_switch_retire_undo(text) to service_role;
comment on function platform.final_switch_retire_undo(text) is NULL;

-- platform.final_switch_state()
CREATE OR REPLACE FUNCTION platform.final_switch_state()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_last platform.cutover_seam_press;
  v_org uuid := platform._final_switch_platform_org();
  v_retired platform.cutover_seam_press;
begin
  v_last := platform._final_switch_last();
  v_retired := platform._final_switch_undo_retired();
  return jsonb_build_object(
    'state', coalesce(v_last.direction, 'old'),
    'at', v_last.pressed_at,
    'by', (select coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), u.email::text)
             from auth.users u where u.id = v_last.pressed_by),
    'run_id', v_last.id,
    'data_screen', coalesce((platform._cutover_seam_last_done('data_screen', v_org)).direction, 'old'),
    'scopes_screens', coalesce((platform._cutover_seam_last_done('scopes_screens', v_org)).direction, 'old'),
    -- SWITCH-STEP-TWO: when the undo was retired (null while it still works).
    'undo_retired_at', v_retired.pressed_at);
end;
$function$
;
alter function platform.final_switch_state() owner to postgres;
revoke all on function platform.final_switch_state() from public, anon, authenticated, service_role;
grant execute on function platform.final_switch_state() to postgres;
grant execute on function platform.final_switch_state() to authenticated;
comment on function platform.final_switch_state() is NULL;

-- platform.final_switch_undo(text,boolean)
CREATE OR REPLACE FUNCTION platform.final_switch_undo(p_note text DEFAULT NULL::text, p_accept_not_carried boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_refused jsonb;
  v_run uuid := gen_random_uuid();
  v_note text;
  v_last platform.cutover_seam_press;
  v_ready jsonb;
  v_o jsonb;
  v_r jsonb;
  v_d jsonb;
  v_org uuid;
  v_id uuid;
  v_orgs jsonb := '[]'::jsonb;
  v_entry jsonb;
  v_not jsonb := '[]'::jsonb;
  v_says text;
  v_platform uuid := platform._final_switch_platform_org();
  v_roles text;
  v_t0 timestamptz := clock_timestamp();
  v_ts timestamptz;
  v_timings jsonb := '{}'::jsonb;
  v_counts jsonb;
  v_back_noowner int := 0;
  v_retired platform.cutover_seam_press;
begin
  v_refused := platform._final_switch_person_refusal();
  if v_refused is not null then
    if v_uid is not null then
      perform platform._final_switch_record('old', 'refused', v_refused ->> 'reason', v_refused ->> 'says', null, null, p_note, v_run);
    end if;
    return jsonb_build_object('ok', false, 'reason', v_refused ->> 'reason', 'says', v_refused ->> 'says');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('final_switch', 0));
  -- SWITCH-STEP-TWO: once the undo is retired the older tables leave the app; nothing is undone.
  v_retired := platform._final_switch_undo_retired();
  if v_retired.id is not null then
    v_says := platform._final_switch_undo_retired_says(v_retired);
    perform platform._final_switch_record('old', 'refused', 'undo_retired', v_says, null, null, p_note, v_run);
    return jsonb_build_object('ok', false, 'reason', 'undo_retired', 'says', v_says);
  end if;
  v_last := platform._final_switch_last();
  if coalesce(v_last.direction, 'old') <> 'new' then
    perform platform._final_switch_record('old', 'refused', 'nothing_to_undo',
      'The final switch has not been pressed, so there is nothing to undo.', null, null, p_note, v_run);
    return jsonb_build_object('ok', false, 'reason', 'nothing_to_undo', 'says', 'The final switch has not been pressed, so there is nothing to undo.');
  end if;

  v_ready := platform._final_switch_readiness();
  -- What cannot be carried back is named first; the undo waits for the person to confirm it.
  for v_o in select x from jsonb_array_elements(coalesce(v_ready -> 'undo' -> 'plan', '[]'::jsonb)) x
              where coalesce((x ->> 'needs_confirm')::boolean, false) loop
    v_not := v_not || to_jsonb(format('%s: %s', v_o ->> 'name',
                                      (select string_agg(t, ' ') from jsonb_array_elements_text(v_o -> 'not_carried') t)));
  end loop;
  if jsonb_array_length(v_not) > 0 and not coalesce(p_accept_not_carried, false) then
    v_says := 'Undoing leaves these in the new system: ' || (select string_agg(x, ' ') from jsonb_array_elements_text(v_not) x)
              || ' Confirm that they stay behind, then undo.';
    perform platform._final_switch_record('old', 'refused', 'confirm_not_carried', v_says, v_ready, null, p_note, v_run);
    return jsonb_build_object('ok', false, 'reason', 'confirm_not_carried', 'says', v_says, 'not_carried', v_not);
  end if;

  v_note := format('the final switch undone (run %s undoes %s)', v_run, v_last.id) || coalesce(': ' || nullif(btrim(p_note), ''), '');
  perform set_config('app.final_switch_step', 'on', true);
  perform set_config('app.final_switch_undoing', 'on', true);

  begin
    -- 8'. The trim runs again as it did.
    if coalesce((v_last.did -> 'cron' ->> 'jobid'), '') <> '' then
      perform cron.alter_job((v_last.did -> 'cron' ->> 'jobid')::bigint, active := (v_last.did -> 'cron' ->> 'active_before')::boolean);
    end if;

    -- 7'. The older write doors open again exactly as they were: the row first, then the grant.
    v_ts := clock_timestamp();
    for v_d in select x from jsonb_array_elements(coalesce(v_last.did -> 'doors', '[]'::jsonb)) x loop
      if v_d ? 'row_added' then
        delete from platform.client_callable_door where id = (v_d ->> 'row_added')::uuid;
      elsif v_d -> 'row' is not null and jsonb_typeof(v_d -> 'row') = 'object' then
        update platform.client_callable_door
           set signed_in_callers = (v_d -> 'row' ->> 'signed_in_callers')::boolean,
               anonymous_callers = (v_d -> 'row' ->> 'anonymous_callers')::boolean,
               anonymous_purpose = v_d -> 'row' ->> 'anonymous_purpose',
               non_client_lane = v_d -> 'row' ->> 'non_client_lane'
         where id = (v_d -> 'row' ->> 'id')::uuid;
      end if;
    end loop;
    -- One GRANT per set of roles (each GRANT is a DDL statement every event trigger reads).
    for v_roles, v_d in
      select g.roles, jsonb_agg(g.door)
        from (select x ->> 'door' as door,
                     (select string_agg(r, ', ') from (values ('public', (x ->> 'public')::boolean), ('anon', (x ->> 'anon')::boolean),
                                                              ('authenticated', (x ->> 'authenticated')::boolean)) as t(r, had) where had) as roles
                from jsonb_array_elements(coalesce(v_last.did -> 'doors', '[]'::jsonb)) x) g
       where g.roles is not null
       group by g.roles
    loop
      execute format('grant execute on function %s to %s',
                     (select string_agg(d, ', ') from jsonb_array_elements_text(v_d) d), v_roles);
    end loop;
    for v_d in select x from jsonb_array_elements(coalesce(v_last.did -> 'doors', '[]'::jsonb)) x
                where coalesce((x ->> 'service_role_added')::boolean, false) loop
      execute format('revoke execute on function %s from service_role', v_d ->> 'door');
    end loop;
    v_timings := v_timings || jsonb_build_object('doors_ms', round(extract(epoch from clock_timestamp() - v_ts) * 1000));

    -- 6'. The Data page goes back.
    insert into platform.cutover_seam_press (seam_key, organization_id, direction, outcome, says, pressed_by, did, note)
    values ('data_screen', v_platform, 'old', 'done', 'The Data page opens the older list again.', v_uid,
            jsonb_build_object('final_switch_run', v_run, 'undoes', v_last.id), v_note);

    -- 5b'. The scopes setting's platform value back first (it was set after the scopes press).
    for v_d in select x from jsonb_array_elements(coalesce(v_last.did -> 'values', '[]'::jsonb)) x
                where coalesce((x ->> 'after_scopes')::boolean, false) loop
      perform platform.feature_knob_set(v_d ->> 'feature', v_d ->> 'key', v_d -> 'before');
    end loop;

    -- 5'. Scope and context screens back, for exactly the organizations the run pressed.
    if jsonb_typeof(v_last.did -> 'scopes' -> 'pressed') = 'array' then
      perform platform._final_switch_scopes('old', v_uid, v_note,
        (select coalesce(array_agg((x ->> 'organization_id')::uuid), '{}'::uuid[])
           from jsonb_array_elements(v_last.did -> 'scopes' -> 'pressed') x));
    end if;

    -- 4'. The platform values as they were.
    for v_d in select x from jsonb_array_elements(coalesce(v_last.did -> 'values', '[]'::jsonb)) x
                where not coalesce((x ->> 'after_scopes')::boolean, false) loop
      perform platform.feature_knob_set(v_d ->> 'feature', v_d ->> 'key', v_d -> 'before');
    end loop;

    -- 3'. Agent context back, for exactly the organizations the run pressed.
    v_ts := clock_timestamp();
    for v_o in select x from jsonb_array_elements(coalesce(v_last.did -> 'organizations', '[]'::jsonb)) x
                where x ? 'context_press' loop
      v_org := (v_o ->> 'id')::uuid;
      v_entry := jsonb_build_object('id', v_org, 'name', v_o ->> 'name');
      if (platform._cutover_seam_last_done('agent_context', v_org)).id is distinct from (v_o ->> 'context_press')::uuid then
        v_entry := v_entry || jsonb_build_object('context_skipped', 'pressed again after the final switch');
      else
        v_r := platform.cutover_seam_press('agent_context', v_org, 'old', v_note);
        if not coalesce((v_r ->> 'ok')::boolean, false) then
          raise exception '%', format('%s — Where agents get their context: %s', v_o ->> 'name', v_r ->> 'says') using errcode = 'P0001';
        end if;
        v_entry := v_entry || jsonb_build_object('context_press', v_r ->> 'press_id');
      end if;
      v_orgs := v_orgs || v_entry;
    end loop;
    v_timings := v_timings || jsonb_build_object('agent_context_ms', round(extract(epoch from clock_timestamp() - v_ts) * 1000));

    -- 2b'. The pick lists the run archived with no owner organization come back.
    for v_d in select x from jsonb_array_elements(coalesce(v_last.did -> 'orphans' -> 'no_owner', '[]'::jsonb)) x loop
      update workbench.udt_structured_lists
         set deleted_at = null, metadata = (metadata - 'final_switch_no_owner') - 'moved_to'
       where id = (v_d ->> 'id')::uuid and metadata ? 'final_switch_no_owner';
      v_back_noowner := v_back_noowner + 1;
    end loop;

    -- 2'. The leftovers of already-switched organizations come back.
    for v_o in select x from jsonb_array_elements(coalesce(v_last.did -> 'organizations', '[]'::jsonb)) x
                where x ? 'swept_tables' or x ? 'swept_lists' loop
      for v_id in select (jsonb_array_elements_text(coalesce(v_o -> 'swept_tables', '[]'::jsonb)))::uuid loop
        perform workbench.udt_dataset_unarchive(v_id);
      end loop;
      for v_id in select (jsonb_array_elements_text(coalesce(v_o -> 'swept_lists', '[]'::jsonb)))::uuid loop
        perform workbench.udt_structured_list_unarchive(v_id);
      end loop;
      v_orgs := v_orgs || jsonb_build_object('id', v_o ->> 'id', 'name', v_o ->> 'name',
        'unswept_tables', coalesce(v_o -> 'swept_tables', '[]'::jsonb), 'unswept_lists', coalesce(v_o -> 'swept_lists', '[]'::jsonb));
    end loop;

    -- 1'. Data tables back, newest organization first; each Switch back carries what the new
    -- system wrote into its older tables (lane SWITCH-BACK-CARRIES).
    v_ts := clock_timestamp();
    for v_o in select t.x from jsonb_array_elements(coalesce(v_last.did -> 'organizations', '[]'::jsonb)) with ordinality as t(x, i)
                where t.x ? 'tables_press'
                order by t.i desc loop
      v_org := (v_o ->> 'id')::uuid;
      v_entry := jsonb_build_object('id', v_org, 'name', v_o ->> 'name');
      if (platform._cutover_seam_last_done('older_tables', v_org)).id is distinct from (v_o ->> 'tables_press')::uuid then
        v_entry := v_entry || jsonb_build_object('tables_skipped', 'pressed again after the final switch');
      else
        v_r := platform.cutover_seam_press('older_tables', v_org, 'old', v_note, coalesce(p_accept_not_carried, false));
        if not coalesce((v_r ->> 'ok')::boolean, false) then
          raise exception '%', format('%s — Data tables: %s', v_o ->> 'name', v_r ->> 'says') using errcode = 'P0001';
        end if;
        v_entry := v_entry || jsonb_build_object(
          'tables_press', v_r ->> 'press_id',
          'tables_unarchived', jsonb_array_length(coalesce(v_r -> 'did' -> 'unarchived', '[]'::jsonb)),
          'lists_unarchived', jsonb_array_length(coalesce(v_r -> 'did' -> 'unarchived_lists', '[]'::jsonb)),
          'automations_back', jsonb_array_length(coalesce(v_r -> 'did' -> 'rekeyed_back', '[]'::jsonb)),
          'carried_back', v_r -> 'did' -> 'carried_back' -> 'says');
      end if;
      v_orgs := v_orgs || v_entry;
    end loop;
    v_timings := v_timings || jsonb_build_object('data_tables_ms', round(extract(epoch from clock_timestamp() - v_ts) * 1000));
  exception when others then
    perform set_config('app.final_switch_step', '', true);
    perform set_config('app.final_switch_undoing', '', true);
    v_says := 'Nothing was changed: the undo stopped part way and was rolled back whole. ' || sqlerrm;
    perform platform._final_switch_record('old', 'refused', 'the_step_failed', v_says, v_ready, null, p_note, v_run);
    return jsonb_build_object('ok', false, 'reason', 'the_step_failed', 'says', v_says, 'press_id', v_run);
  end;

  perform set_config('app.final_switch_step', '', true);
  perform set_config('app.final_switch_undoing', '', true);
  v_counts := jsonb_build_object(
    'data_tables_switched_back', (select count(*) from jsonb_array_elements(v_orgs) e where e ? 'tables_unarchived'),
    'tables_unarchived', (select coalesce(sum((e ->> 'tables_unarchived')::int), 0) + coalesce(sum(jsonb_array_length(coalesce(e -> 'unswept_tables', '[]'::jsonb))), 0) from jsonb_array_elements(v_orgs) e),
    'lists_unarchived', (select coalesce(sum((e ->> 'lists_unarchived')::int), 0) + coalesce(sum(jsonb_array_length(coalesce(e -> 'unswept_lists', '[]'::jsonb))), 0) from jsonb_array_elements(v_orgs) e),
    'agent_context_switched_back', (select count(*) from jsonb_array_elements(v_orgs) e where e ? 'context_press'),
    'doors_opened', jsonb_array_length(coalesce(v_last.did -> 'doors', '[]'::jsonb)),
    'no_owner_lists_restored', v_back_noowner,
    'carried_back', (select coalesce(jsonb_agg(e ->> 'name' || ': ' || s), '[]'::jsonb)
                       from jsonb_array_elements(v_orgs) e, jsonb_array_elements_text(coalesce(e -> 'carried_back', '[]'::jsonb)) s
                      where s not like 'Nothing was written in the new tables since the switch%'),
    'nothing_to_carry', (select count(*) from jsonb_array_elements(v_orgs) e
                          where e ? 'tables_unarchived'
                            and not exists (select 1 from jsonb_array_elements_text(coalesce(e -> 'carried_back', '[]'::jsonb)) s
                                             where s not like 'Nothing was written in the new tables since the switch%')));
  v_timings := v_timings || jsonb_build_object('total_ms', round(extract(epoch from clock_timestamp() - v_t0) * 1000));
  v_says := format('Undid the final switch: %s organizations back on their older tables (%s tables and %s pick lists restored), agent context back for %s, %s older write doors open again, the Data page and the scope screens back.',
                   v_counts ->> 'data_tables_switched_back', v_counts ->> 'tables_unarchived', v_counts ->> 'lists_unarchived',
                   v_counts ->> 'agent_context_switched_back', v_counts ->> 'doors_opened')
            || case when v_back_noowner > 0 then format(' %s pick %s with no owner organization restored.', v_back_noowner,
                                                         case when v_back_noowner = 1 then 'list' else 'lists' end) else '' end
            || coalesce(' Carried back from the new system: ' || (select string_agg(s, ' ') from jsonb_array_elements_text(v_counts -> 'carried_back') s), '')
            || case when (v_counts ->> 'nothing_to_carry')::int > 0
                    then format(' %s %s had nothing written in the new system to carry back.', v_counts ->> 'nothing_to_carry',
                                case when (v_counts ->> 'nothing_to_carry')::int = 1 then 'organization' else 'organizations' end)
                    else '' end;

  perform platform._final_switch_record('old', 'done', null, v_says, v_ready,
    jsonb_build_object('undoes', v_last.id, 'organizations', v_orgs, 'counts', v_counts, 'timings', v_timings,
                       'accepted_not_carried', case when jsonb_array_length(v_not) > 0 then v_not end),
    p_note, v_run);
  return jsonb_build_object('ok', true, 'press_id', v_run, 'state', 'old', 'undoes', v_last.id, 'says', v_says,
                            'counts', v_counts, 'timings', v_timings);
end;
$function$
;
alter function platform.final_switch_undo(text,boolean) owner to postgres;
revoke all on function platform.final_switch_undo(text,boolean) from public, anon, authenticated, service_role;
grant execute on function platform.final_switch_undo(text,boolean) to postgres;
grant execute on function platform.final_switch_undo(text,boolean) to authenticated;
comment on function platform.final_switch_undo(text,boolean) is NULL;

-- platform.unified_data_ramp_exit()
CREATE OR REPLACE FUNCTION platform.unified_data_ramp_exit()
 RETURNS TABLE(id text, engine_old text, engine_new text, exit_trigger text, exit_date date, owner_name text, status text, note text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select e.id, e.engine_old, e.engine_new, e.exit_trigger, e.exit_date,
         e.owner_name, e.status, e.note
    from campaign_watch.dual_engine_exit e
   order by e.exit_date;
$function$
;
alter function platform.unified_data_ramp_exit() owner to postgres;
revoke all on function platform.unified_data_ramp_exit() from public, anon, authenticated, service_role;
grant execute on function platform.unified_data_ramp_exit() to postgres;
grant execute on function platform.unified_data_ramp_exit() to service_role;
comment on function platform.unified_data_ramp_exit() is 'CUT-N-3: the named exit for running two permission engines side by side — trigger, date and owner — as the switch screen reads it.';

-- platform.unified_data_ramp_exit(uuid)
CREATE OR REPLACE FUNCTION platform.unified_data_ramp_exit(p_organization_id uuid)
 RETURNS TABLE(id text, engine_old text, engine_new text, exit_trigger text, exit_date date, owner_name text, status text, note text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform platform.assert_may_operate_unified_data_ramp(p_organization_id, 'Reading the dual-engine exit plan');
  return query
    select e.id, e.engine_old, e.engine_new, e.exit_trigger, e.exit_date,
           e.owner_name, e.status, e.note
      from campaign_watch.dual_engine_exit e
     order by e.exit_date;
end;
$function$
;
alter function platform.unified_data_ramp_exit(uuid) owner to postgres;
revoke all on function platform.unified_data_ramp_exit(uuid) from public, anon, authenticated, service_role;
grant execute on function platform.unified_data_ramp_exit(uuid) to postgres;
grant execute on function platform.unified_data_ramp_exit(uuid) to authenticated;
comment on function platform.unified_data_ramp_exit(uuid) is NULL;

-- platform.unified_data_ramp_gate(text,uuid)
CREATE OR REPLACE FUNCTION platform.unified_data_ramp_gate(p_consumer text, p_organization_id uuid)
 RETURNS campaign_watch.ramp_gate_run
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- NO CLIENT REACHES THIS. Its platform.client_callable_door row declares it
  -- server_only, so the DDL guard revokes EXECUTE from anon and authenticated and
  -- the only caller is the admin API route, which verifies the signed-in person is
  -- a platform admin from THEIR OWN session before it uses the service key. The
  -- check lives where the identity is: is_platform_admin() reads auth.uid(), which
  -- is null under the service role, so asking it here would refuse every caller.
  return campaign_watch.consumer_gate(p_consumer, p_organization_id, null);
end;
$function$
;
alter function platform.unified_data_ramp_gate(text,uuid) owner to postgres;
revoke all on function platform.unified_data_ramp_gate(text,uuid) from public, anon, authenticated, service_role;
grant execute on function platform.unified_data_ramp_gate(text,uuid) to postgres;
grant execute on function platform.unified_data_ramp_gate(text,uuid) to service_role;
comment on function platform.unified_data_ramp_gate(text,uuid) is NULL;

-- platform.unified_data_ramp_set(text,uuid,boolean,uuid,text)
CREATE OR REPLACE FUNCTION platform.unified_data_ramp_set(p_consumer text, p_organization_id uuid, p_on boolean, p_user_id uuid DEFAULT NULL::uuid, p_note text DEFAULT NULL::text)
 RETURNS campaign_watch.ramp_gate_run
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  -- One line, and it is a delegation, not a copy. auth.uid() is null on the
  -- server lane that is the only lawful caller, so this arity now raises
  -- "no acting user" instead of running the gate and discarding the write.
  select platform.unified_data_ramp_set(p_consumer, p_organization_id, p_on, p_user_id, p_note, auth.uid());
$function$
;
alter function platform.unified_data_ramp_set(text,uuid,boolean,uuid,text) owner to postgres;
revoke all on function platform.unified_data_ramp_set(text,uuid,boolean,uuid,text) from public, anon, authenticated, service_role;
grant execute on function platform.unified_data_ramp_set(text,uuid,boolean,uuid,text) to postgres;
grant execute on function platform.unified_data_ramp_set(text,uuid,boolean,uuid,text) to service_role;
comment on function platform.unified_data_ramp_set(text,uuid,boolean,uuid,text) is 'The switch. Turning a consumer ON runs its Test 1 gate first and REFUSES on anything but green, quoting the verdict''s own sentence. Turning it OFF is never gated.';

-- platform.unified_data_ramp_set(text,uuid,boolean,uuid,text,uuid)
CREATE OR REPLACE FUNCTION platform.unified_data_ramp_set(p_consumer text, p_organization_id uuid, p_on boolean, p_user_id uuid DEFAULT NULL::uuid, p_note text DEFAULT NULL::text, p_acting_user_id uuid DEFAULT NULL::uuid)
 RETURNS campaign_watch.ramp_gate_run
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_consumer   campaign_watch.ramp_consumer%rowtype;
  v_gate       campaign_watch.ramp_gate_run%rowtype;
  v_actor      uuid := coalesce(p_acting_user_id, auth.uid());
  v_door       jsonb;
  v_written    jsonb;
  v_readback   jsonb;
  v_scope_kind text;
  v_scope_id   uuid;
begin
  -- NO CLIENT REACHES THIS. Its platform.client_callable_door row declares it
  -- server_only, so the DDL guard revokes EXECUTE from anon and authenticated
  -- and the only caller is the admin API route, which verifies the signed-in
  -- person is a platform admin from THEIR OWN session before it uses the
  -- service key — and then passes that person in as p_acting_user_id.
  if v_actor is null then
    raise exception 'platform.unified_data_ramp_set: no acting user. The caller must pass p_acting_user_id — the person it has already established is a platform admin — because auth.uid() is null on a server lane and the override would otherwise be written by nobody.'
      using errcode = 'P0001';
  end if;

  select * into v_consumer from campaign_watch.ramp_consumer where consumer_id = p_consumer;
  if not found then
    raise exception 'platform.unified_data_ramp_set: "%" is not a consumer', p_consumer
      using errcode = 'P0001';
  end if;

  -- TURNING IT OFF IS NEVER GATED. A rollback that needs a green gate is not a
  -- rollback, and the one thing this screen must always be able to do is put a
  -- consumer back on the old store.
  if p_on then
    v_gate := campaign_watch.consumer_gate(p_consumer, p_organization_id, v_actor);
    if v_gate.verdict <> 'green' then
      raise exception 'platform.unified_data_ramp_set: refusing to switch "%" ON for organization % — its Test 1 gate is %. %',
        p_consumer, p_organization_id, v_gate.verdict, v_gate.why
        using errcode = 'P0001',
              hint = 'CUT-3: Test 1 gates each consumer''s switch. Fix what the verdict names and run the gate again; the switch is not a place to overrule it.';
    end if;
  end if;

  v_scope_kind := case when p_user_id is null then 'organization' else 'user' end;
  v_scope_id   := coalesce(p_user_id, p_organization_id);

  -- THE DOOR QUESTION IS STILL ASKED. A key whose namespace names a different
  -- write door is refused here, exactly as platform.knob_override_set refuses it.
  v_door := platform.knob_write_door_for('custom.' || v_consumer.knob_key);
  if (v_door ->> 'ok')::boolean
     and (v_door ->> 'set_door') is distinct from 'platform.knob_override_set' then
    raise exception 'platform.unified_data_ramp_set: custom.% is written through %, not through the ramp. That is where its own permission gate and its own audit trail live.',
      v_consumer.knob_key, v_door ->> 'set_door'
      using errcode = 'P0001';
  end if;

  v_written := platform._knob_override_write(
    'custom', v_consumer.knob_key, v_scope_kind, v_scope_id, p_organization_id,
    to_jsonb(p_on),
    coalesce(p_note, 'Unified-data ramp, switch screen, ' || (case when p_on then 'ON' else 'OFF' end)),
    v_actor);

  if v_written is null or not coalesce((v_written ->> 'ok')::boolean, false) then
    raise exception 'platform.unified_data_ramp_set: the override was NOT written for custom.% — the knob writer answered %. Nothing has changed and no consumer has moved.',
      v_consumer.knob_key, coalesce(v_written::text, 'null')
      using errcode = 'P0001',
            hint = 'This is the failure the switch used to swallow: platform.knob_override_set RETURNS a refusal rather than raising one, so a discarded result looked exactly like success.';
  end if;

  -- READ IT BACK. The screen may only say "switched on" when the database agrees.
  v_readback := platform.knob_resolve('custom', v_consumer.knob_key, p_organization_id, p_user_id, null);
  if v_readback is distinct from to_jsonb(p_on) then
    raise exception 'platform.unified_data_ramp_set: wrote % for custom.% but platform.knob_resolve still answers % for organization %. The switch did not take.',
      to_jsonb(p_on), v_consumer.knob_key, coalesce(v_readback::text, 'null'), p_organization_id
      using errcode = 'P0001';
  end if;

  if p_on then
    return v_gate;
  end if;
  return campaign_watch.consumer_gate(p_consumer, p_organization_id, v_actor);
end;
$function$
;
alter function platform.unified_data_ramp_set(text,uuid,boolean,uuid,text,uuid) owner to postgres;
revoke all on function platform.unified_data_ramp_set(text,uuid,boolean,uuid,text,uuid) from public, anon, authenticated, service_role;
grant execute on function platform.unified_data_ramp_set(text,uuid,boolean,uuid,text,uuid) to postgres;
grant execute on function platform.unified_data_ramp_set(text,uuid,boolean,uuid,text,uuid) to service_role;
comment on function platform.unified_data_ramp_set(text,uuid,boolean,uuid,text,uuid) is NULL;

-- platform.unified_data_ramp_state(uuid)
CREATE OR REPLACE FUNCTION platform.unified_data_ramp_state(p_organization_id uuid)
 RETURNS TABLE(consumer_id text, label text, ramp_order integer, batch text, owning_lane text, landed_at timestamp with time zone, not_ready_why text, record_types text[], no_rollback boolean, knob_key text, switched_on boolean, gate_verdict text, gate_why text, gate_ran_at timestamp with time zone, gate_lost bigint, gate_gained bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- THE DECISION, BEFORE THE FIRST READ. Until 19 September this body decided
  -- nothing and relied on there being no client lane at all; the comment here
  -- said asking `is_platform_admin()` would refuse every caller, which was true
  -- of a service-key connection and is why the check was left out rather than
  -- written in a form that works for both lanes. The shared predicate is that
  -- form: the service role and the owner pass as they always did, and a
  -- signed-in person passes when they administer THIS organization.
  perform platform.assert_may_operate_unified_data_ramp(p_organization_id, 'Reading this organization''s ramp');

  return query
    select c.consumer_id, c.label, c.ramp_order, c.batch, c.owning_lane, c.landed_at,
           c.not_ready_why, c.record_types, c.no_rollback, c.knob_key,
           coalesce(platform.knob_resolve('custom', c.knob_key, p_organization_id, null, null) = 'true'::jsonb, false),
           g.verdict, g.why, g.ran_at, g.lost_count, g.gained_count
      from campaign_watch.ramp_consumer c
      left join lateral (
        select r.verdict, r.why, r.ran_at, r.lost_count, r.gained_count
          from campaign_watch.ramp_gate_run r
         where r.consumer_id = c.consumer_id and r.organization_id = p_organization_id
         order by r.ran_at desc limit 1
      ) g on true
     order by c.ramp_order;
end;
$function$
;
alter function platform.unified_data_ramp_state(uuid) owner to postgres;
revoke all on function platform.unified_data_ramp_state(uuid) from public, anon, authenticated, service_role;
grant execute on function platform.unified_data_ramp_state(uuid) to postgres;
grant execute on function platform.unified_data_ramp_state(uuid) to authenticated;
grant execute on function platform.unified_data_ramp_state(uuid) to service_role;
comment on function platform.unified_data_ramp_state(uuid) is NULL;

-- add_column_to_user_table(uuid,text,text,text,integer,boolean,jsonb,jsonb)
CREATE OR REPLACE FUNCTION public.add_column_to_user_table(p_table_id uuid, p_field_name text, p_display_name text, p_data_type text, p_field_order integer DEFAULT NULL::integer, p_is_required boolean DEFAULT false, p_default_value jsonb DEFAULT NULL::jsonb, p_validation_rules jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the deprecated; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'add_column_to_user_table was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$
;
alter function add_column_to_user_table(uuid,text,text,text,integer,boolean,jsonb,jsonb) owner to postgres;
revoke all on function add_column_to_user_table(uuid,text,text,text,integer,boolean,jsonb,jsonb) from public, anon, authenticated, service_role;
grant execute on function add_column_to_user_table(uuid,text,text,text,integer,boolean,jsonb,jsonb) to postgres;
grant execute on function add_column_to_user_table(uuid,text,text,text,integer,boolean,jsonb,jsonb) to service_role;
grant execute on function add_column_to_user_table(uuid,text,text,text,integer,boolean,jsonb,jsonb) to dashboard_user;
grant execute on function add_column_to_user_table(uuid,text,text,text,integer,boolean,jsonb,jsonb) to svc_seo;
comment on function add_column_to_user_table(uuid,text,text,text,integer,boolean,jsonb,jsonb) is NULL;

-- add_data_row_to_user_table(uuid,jsonb)
CREATE OR REPLACE FUNCTION public.add_data_row_to_user_table(p_table_id uuid, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the deprecated; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'add_data_row_to_user_table was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$
;
alter function add_data_row_to_user_table(uuid,jsonb) owner to postgres;
revoke all on function add_data_row_to_user_table(uuid,jsonb) from public, anon, authenticated, service_role;
grant execute on function add_data_row_to_user_table(uuid,jsonb) to postgres;
grant execute on function add_data_row_to_user_table(uuid,jsonb) to service_role;
comment on function add_data_row_to_user_table(uuid,jsonb) is NULL;

-- append_rows_to_user_table(uuid,jsonb)
CREATE OR REPLACE FUNCTION public.append_rows_to_user_table(p_table_id uuid, p_rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the deprecated; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'append_rows_to_user_table was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$
;
alter function append_rows_to_user_table(uuid,jsonb) owner to postgres;
revoke all on function append_rows_to_user_table(uuid,jsonb) from public, anon, authenticated, service_role;
grant execute on function append_rows_to_user_table(uuid,jsonb) to postgres;
grant execute on function append_rows_to_user_table(uuid,jsonb) to service_role;
grant execute on function append_rows_to_user_table(uuid,jsonb) to dashboard_user;
grant execute on function append_rows_to_user_table(uuid,jsonb) to svc_seo;
comment on function append_rows_to_user_table(uuid,jsonb) is NULL;

-- create_new_user_table_dynamic(text,text,boolean,uuid,jsonb)
CREATE OR REPLACE FUNCTION public.create_new_user_table_dynamic(p_table_name text, p_description text, p_is_public boolean, p_organization_id uuid, p_initial_fields jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the deprecated; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'create_new_user_table_dynamic was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$
;
alter function create_new_user_table_dynamic(text,text,boolean,uuid,jsonb) owner to postgres;
revoke all on function create_new_user_table_dynamic(text,text,boolean,uuid,jsonb) from public, anon, authenticated, service_role;
grant execute on function create_new_user_table_dynamic(text,text,boolean,uuid,jsonb) to postgres;
grant execute on function create_new_user_table_dynamic(text,text,boolean,uuid,jsonb) to service_role;
comment on function create_new_user_table_dynamic(text,text,boolean,uuid,jsonb) is NULL;

-- create_user_list(character varying,text,uuid,boolean,boolean,boolean,jsonb,uuid)
CREATE OR REPLACE FUNCTION public.create_user_list(p_list_name character varying, p_description text, p_user_id uuid, p_is_public boolean, p_authenticated_read boolean DEFAULT false, p_public_read boolean DEFAULT false, p_items jsonb DEFAULT '[]'::jsonb, p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the deprecated; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'create_user_list was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$
;
alter function create_user_list(character varying,text,uuid,boolean,boolean,boolean,jsonb,uuid) owner to postgres;
revoke all on function create_user_list(character varying,text,uuid,boolean,boolean,boolean,jsonb,uuid) from public, anon, authenticated, service_role;
grant execute on function create_user_list(character varying,text,uuid,boolean,boolean,boolean,jsonb,uuid) to postgres;
grant execute on function create_user_list(character varying,text,uuid,boolean,boolean,boolean,jsonb,uuid) to authenticated;
grant execute on function create_user_list(character varying,text,uuid,boolean,boolean,boolean,jsonb,uuid) to service_role;
comment on function create_user_list(character varying,text,uuid,boolean,boolean,boolean,jsonb,uuid) is NULL;

-- create_user_table_with_fields(text,text,boolean,uuid,uuid,uuid,jsonb)
CREATE OR REPLACE FUNCTION public.create_user_table_with_fields(p_table_name text, p_description text DEFAULT NULL::text, p_is_public boolean DEFAULT false, p_organization_id uuid DEFAULT NULL::uuid, p_project_id uuid DEFAULT NULL::uuid, p_task_id uuid DEFAULT NULL::uuid, p_fields jsonb DEFAULT '[]'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the deprecated; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'create_user_table_with_fields was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$
;
alter function create_user_table_with_fields(text,text,boolean,uuid,uuid,uuid,jsonb) owner to postgres;
revoke all on function create_user_table_with_fields(text,text,boolean,uuid,uuid,uuid,jsonb) from public, anon, authenticated, service_role;
grant execute on function create_user_table_with_fields(text,text,boolean,uuid,uuid,uuid,jsonb) to postgres;
grant execute on function create_user_table_with_fields(text,text,boolean,uuid,uuid,uuid,jsonb) to service_role;
comment on function create_user_table_with_fields(text,text,boolean,uuid,uuid,uuid,jsonb) is NULL;

-- delete_data_row_from_user_table(uuid)
CREATE OR REPLACE FUNCTION public.delete_data_row_from_user_table(p_row_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the deprecated; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'delete_data_row_from_user_table was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$
;
alter function delete_data_row_from_user_table(uuid) owner to postgres;
revoke all on function delete_data_row_from_user_table(uuid) from public, anon, authenticated, service_role;
grant execute on function delete_data_row_from_user_table(uuid) to postgres;
grant execute on function delete_data_row_from_user_table(uuid) to service_role;
grant execute on function delete_data_row_from_user_table(uuid) to dashboard_user;
grant execute on function delete_data_row_from_user_table(uuid) to svc_seo;
comment on function delete_data_row_from_user_table(uuid) is NULL;

-- delete_user_table(uuid)
CREATE OR REPLACE FUNCTION public.delete_user_table(p_table_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the deprecated; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'delete_user_table was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$
;
alter function delete_user_table(uuid) owner to postgres;
revoke all on function delete_user_table(uuid) from public, anon, authenticated, service_role;
grant execute on function delete_user_table(uuid) to postgres;
grant execute on function delete_user_table(uuid) to service_role;
grant execute on function delete_user_table(uuid) to dashboard_user;
grant execute on function delete_user_table(uuid) to svc_seo;
comment on function delete_user_table(uuid) is NULL;

-- export_user_table_as_csv(uuid)
CREATE OR REPLACE FUNCTION public.export_user_table_as_csv(p_table_id uuid)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the deprecated; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'export_user_table_as_csv was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$
;
alter function export_user_table_as_csv(uuid) owner to postgres;
revoke all on function export_user_table_as_csv(uuid) from public, anon, authenticated, service_role;
grant execute on function export_user_table_as_csv(uuid) to postgres;
grant execute on function export_user_table_as_csv(uuid) to authenticated;
grant execute on function export_user_table_as_csv(uuid) to service_role;
grant execute on function export_user_table_as_csv(uuid) to authenticator;
grant execute on function export_user_table_as_csv(uuid) to dashboard_user;
grant execute on function export_user_table_as_csv(uuid) to svc_seo;
grant execute on function export_user_table_as_csv(uuid) to cli_login_postgres;
grant execute on function export_user_table_as_csv(uuid) to matrx_provisioner;
comment on function export_user_table_as_csv(uuid) is NULL;

-- export_user_table_as_csv(uuid,text,text)
CREATE OR REPLACE FUNCTION public.export_user_table_as_csv(p_table_id uuid, p_sort_field text DEFAULT NULL::text, p_sort_direction text DEFAULT 'asc'::text)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the deprecated; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'export_user_table_as_csv was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$
;
alter function export_user_table_as_csv(uuid,text,text) owner to postgres;
revoke all on function export_user_table_as_csv(uuid,text,text) from public, anon, authenticated, service_role;
grant execute on function export_user_table_as_csv(uuid,text,text) to postgres;
grant execute on function export_user_table_as_csv(uuid,text,text) to authenticated;
grant execute on function export_user_table_as_csv(uuid,text,text) to service_role;
grant execute on function export_user_table_as_csv(uuid,text,text) to authenticator;
grant execute on function export_user_table_as_csv(uuid,text,text) to dashboard_user;
grant execute on function export_user_table_as_csv(uuid,text,text) to svc_seo;
grant execute on function export_user_table_as_csv(uuid,text,text) to cli_login_postgres;
grant execute on function export_user_table_as_csv(uuid,text,text) to matrx_provisioner;
comment on function export_user_table_as_csv(uuid,text,text) is NULL;

-- get_full_table(jsonb)
CREATE OR REPLACE FUNCTION public.get_full_table(ref jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the deprecated; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'get_full_table was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$
;
alter function get_full_table(jsonb) owner to postgres;
revoke all on function get_full_table(jsonb) from public, anon, authenticated, service_role;
grant execute on function get_full_table(jsonb) to postgres;
grant execute on function get_full_table(jsonb) to authenticated;
grant execute on function get_full_table(jsonb) to service_role;
grant execute on function get_full_table(jsonb) to authenticator;
grant execute on function get_full_table(jsonb) to dashboard_user;
grant execute on function get_full_table(jsonb) to svc_seo;
grant execute on function get_full_table(jsonb) to cli_login_postgres;
grant execute on function get_full_table(jsonb) to matrx_provisioner;
comment on function get_full_table(jsonb) is NULL;

-- get_table_cell(jsonb)
CREATE OR REPLACE FUNCTION public.get_table_cell(ref jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the deprecated; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'get_table_cell was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$
;
alter function get_table_cell(jsonb) owner to postgres;
revoke all on function get_table_cell(jsonb) from public, anon, authenticated, service_role;
grant execute on function get_table_cell(jsonb) to postgres;
grant execute on function get_table_cell(jsonb) to authenticated;
grant execute on function get_table_cell(jsonb) to service_role;
grant execute on function get_table_cell(jsonb) to authenticator;
grant execute on function get_table_cell(jsonb) to dashboard_user;
grant execute on function get_table_cell(jsonb) to svc_seo;
grant execute on function get_table_cell(jsonb) to cli_login_postgres;
grant execute on function get_table_cell(jsonb) to matrx_provisioner;
comment on function get_table_cell(jsonb) is NULL;

-- get_table_column(jsonb)
CREATE OR REPLACE FUNCTION public.get_table_column(ref jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the deprecated; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'get_table_column was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$
;
alter function get_table_column(jsonb) owner to postgres;
revoke all on function get_table_column(jsonb) from public, anon, authenticated, service_role;
grant execute on function get_table_column(jsonb) to postgres;
grant execute on function get_table_column(jsonb) to authenticated;
grant execute on function get_table_column(jsonb) to service_role;
grant execute on function get_table_column(jsonb) to authenticator;
grant execute on function get_table_column(jsonb) to dashboard_user;
grant execute on function get_table_column(jsonb) to svc_seo;
grant execute on function get_table_column(jsonb) to cli_login_postgres;
grant execute on function get_table_column(jsonb) to matrx_provisioner;
comment on function get_table_column(jsonb) is NULL;

-- get_table_row(jsonb)
CREATE OR REPLACE FUNCTION public.get_table_row(ref jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the deprecated; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'get_table_row was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$
;
alter function get_table_row(jsonb) owner to postgres;
revoke all on function get_table_row(jsonb) from public, anon, authenticated, service_role;
grant execute on function get_table_row(jsonb) to postgres;
grant execute on function get_table_row(jsonb) to authenticated;
grant execute on function get_table_row(jsonb) to service_role;
grant execute on function get_table_row(jsonb) to authenticator;
grant execute on function get_table_row(jsonb) to dashboard_user;
grant execute on function get_table_row(jsonb) to svc_seo;
grant execute on function get_table_row(jsonb) to cli_login_postgres;
grant execute on function get_table_row(jsonb) to matrx_provisioner;
comment on function get_table_row(jsonb) is NULL;

-- get_user_table_complete(uuid,text,text)
CREATE OR REPLACE FUNCTION public.get_user_table_complete(p_table_id uuid, p_sort_field text DEFAULT NULL::text, p_sort_direction text DEFAULT 'asc'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the deprecated; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'get_user_table_complete was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$
;
alter function get_user_table_complete(uuid,text,text) owner to postgres;
revoke all on function get_user_table_complete(uuid,text,text) from public, anon, authenticated, service_role;
grant execute on function get_user_table_complete(uuid,text,text) to postgres;
grant execute on function get_user_table_complete(uuid,text,text) to authenticated;
grant execute on function get_user_table_complete(uuid,text,text) to service_role;
comment on function get_user_table_complete(uuid,text,text) is NULL;

-- get_user_table_data_paginated(uuid,integer,integer,text,text,text)
CREATE OR REPLACE FUNCTION public.get_user_table_data_paginated(p_table_id uuid, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0, p_sort_field text DEFAULT NULL::text, p_sort_direction text DEFAULT 'asc'::text, p_search_term text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the deprecated; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'get_user_table_data_paginated was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$
;
alter function get_user_table_data_paginated(uuid,integer,integer,text,text,text) owner to postgres;
revoke all on function get_user_table_data_paginated(uuid,integer,integer,text,text,text) from public, anon, authenticated, service_role;
grant execute on function get_user_table_data_paginated(uuid,integer,integer,text,text,text) to postgres;
grant execute on function get_user_table_data_paginated(uuid,integer,integer,text,text,text) to authenticated;
grant execute on function get_user_table_data_paginated(uuid,integer,integer,text,text,text) to service_role;
grant execute on function get_user_table_data_paginated(uuid,integer,integer,text,text,text) to authenticator;
grant execute on function get_user_table_data_paginated(uuid,integer,integer,text,text,text) to dashboard_user;
grant execute on function get_user_table_data_paginated(uuid,integer,integer,text,text,text) to svc_seo;
grant execute on function get_user_table_data_paginated(uuid,integer,integer,text,text,text) to cli_login_postgres;
grant execute on function get_user_table_data_paginated(uuid,integer,integer,text,text,text) to matrx_provisioner;
comment on function get_user_table_data_paginated(uuid,integer,integer,text,text,text) is NULL;

-- get_user_table_data_paginated_v2(uuid,integer,integer,text,text,text)
CREATE OR REPLACE FUNCTION public.get_user_table_data_paginated_v2(p_table_id uuid, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_sort_field text DEFAULT NULL::text, p_sort_direction text DEFAULT 'asc'::text, p_search_term text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the deprecated; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'get_user_table_data_paginated_v2 was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$
;
alter function get_user_table_data_paginated_v2(uuid,integer,integer,text,text,text) owner to postgres;
revoke all on function get_user_table_data_paginated_v2(uuid,integer,integer,text,text,text) from public, anon, authenticated, service_role;
grant execute on function get_user_table_data_paginated_v2(uuid,integer,integer,text,text,text) to postgres;
grant execute on function get_user_table_data_paginated_v2(uuid,integer,integer,text,text,text) to authenticated;
grant execute on function get_user_table_data_paginated_v2(uuid,integer,integer,text,text,text) to service_role;
grant execute on function get_user_table_data_paginated_v2(uuid,integer,integer,text,text,text) to authenticator;
grant execute on function get_user_table_data_paginated_v2(uuid,integer,integer,text,text,text) to dashboard_user;
grant execute on function get_user_table_data_paginated_v2(uuid,integer,integer,text,text,text) to svc_seo;
grant execute on function get_user_table_data_paginated_v2(uuid,integer,integer,text,text,text) to cli_login_postgres;
grant execute on function get_user_table_data_paginated_v2(uuid,integer,integer,text,text,text) to matrx_provisioner;
comment on function get_user_table_data_paginated_v2(uuid,integer,integer,text,text,text) is NULL;

-- get_user_tables()
CREATE OR REPLACE FUNCTION public.get_user_tables()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the deprecated; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'get_user_tables was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$
;
alter function get_user_tables() owner to postgres;
revoke all on function get_user_tables() from public, anon, authenticated, service_role;
grant execute on function get_user_tables() to postgres;
grant execute on function get_user_tables() to authenticated;
grant execute on function get_user_tables() to service_role;
comment on function get_user_tables() is NULL;

-- list_table_columns(jsonb)
CREATE OR REPLACE FUNCTION public.list_table_columns(ref jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the deprecated; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'list_table_columns was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$
;
alter function list_table_columns(jsonb) owner to postgres;
revoke all on function list_table_columns(jsonb) from public, anon, authenticated, service_role;
grant execute on function list_table_columns(jsonb) to postgres;
grant execute on function list_table_columns(jsonb) to authenticated;
grant execute on function list_table_columns(jsonb) to service_role;
grant execute on function list_table_columns(jsonb) to authenticator;
grant execute on function list_table_columns(jsonb) to dashboard_user;
grant execute on function list_table_columns(jsonb) to svc_seo;
grant execute on function list_table_columns(jsonb) to cli_login_postgres;
grant execute on function list_table_columns(jsonb) to matrx_provisioner;
comment on function list_table_columns(jsonb) is NULL;

-- list_table_rows(jsonb,integer,integer,text,text)
CREATE OR REPLACE FUNCTION public.list_table_rows(ref jsonb, limit_rows integer DEFAULT 100, offset_rows integer DEFAULT 0, order_by text DEFAULT 'created_at'::text, order_dir text DEFAULT 'desc'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the deprecated; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'list_table_rows was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$
;
alter function list_table_rows(jsonb,integer,integer,text,text) owner to postgres;
revoke all on function list_table_rows(jsonb,integer,integer,text,text) from public, anon, authenticated, service_role;
grant execute on function list_table_rows(jsonb,integer,integer,text,text) to postgres;
grant execute on function list_table_rows(jsonb,integer,integer,text,text) to authenticated;
grant execute on function list_table_rows(jsonb,integer,integer,text,text) to service_role;
grant execute on function list_table_rows(jsonb,integer,integer,text,text) to authenticator;
grant execute on function list_table_rows(jsonb,integer,integer,text,text) to dashboard_user;
grant execute on function list_table_rows(jsonb,integer,integer,text,text) to svc_seo;
grant execute on function list_table_rows(jsonb,integer,integer,text,text) to cli_login_postgres;
grant execute on function list_table_rows(jsonb,integer,integer,text,text) to matrx_provisioner;
comment on function list_table_rows(jsonb,integer,integer,text,text) is NULL;

-- udt_backfill_autonumber(uuid,uuid)
CREATE OR REPLACE FUNCTION public.udt_backfill_autonumber(p_table_id uuid, p_field_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the deprecated; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'udt_backfill_autonumber was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$
;
alter function udt_backfill_autonumber(uuid,uuid) owner to postgres;
revoke all on function udt_backfill_autonumber(uuid,uuid) from public, anon, authenticated, service_role;
grant execute on function udt_backfill_autonumber(uuid,uuid) to postgres;
grant execute on function udt_backfill_autonumber(uuid,uuid) to service_role;
comment on function udt_backfill_autonumber(uuid,uuid) is NULL;

-- udt_bulk_write(uuid,jsonb)
CREATE OR REPLACE FUNCTION public.udt_bulk_write(p_table_id uuid, p_operations jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the deprecated; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'udt_bulk_write was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$
;
alter function udt_bulk_write(uuid,jsonb) owner to postgres;
revoke all on function udt_bulk_write(uuid,jsonb) from public, anon, authenticated, service_role;
grant execute on function udt_bulk_write(uuid,jsonb) to postgres;
grant execute on function udt_bulk_write(uuid,jsonb) to service_role;
comment on function udt_bulk_write(uuid,jsonb) is NULL;

-- udt_change_field_type(uuid,uuid,field_data_type,text)
CREATE OR REPLACE FUNCTION public.udt_change_field_type(p_table_id uuid, p_field_id uuid, p_new_type field_data_type, p_strategy text DEFAULT 'cast_or_null'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the deprecated; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'udt_change_field_type was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$
;
alter function udt_change_field_type(uuid,uuid,field_data_type,text) owner to postgres;
revoke all on function udt_change_field_type(uuid,uuid,field_data_type,text) from public, anon, authenticated, service_role;
grant execute on function udt_change_field_type(uuid,uuid,field_data_type,text) to postgres;
grant execute on function udt_change_field_type(uuid,uuid,field_data_type,text) to service_role;
comment on function udt_change_field_type(uuid,uuid,field_data_type,text) is 'Changes a user-defined table column''s declared type AND rewrites every row''s JSONB cell in one transaction, stamping `type_change:<from>→<to>` on the row history it produces and PROVING that history landed before it empties anything (DD-244). It is the ONE writer of udt_dataset_fields.data_type for a type change: a caller that flips the declared type first is REFUSED, because the from-type it would record would be a lie (DD-260).';

-- udt_column_facets(uuid,text,integer,text)
CREATE OR REPLACE FUNCTION public.udt_column_facets(p_table_id uuid, p_field_name text, p_limit integer DEFAULT 50, p_search_term text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the deprecated; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'udt_column_facets was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$
;
alter function udt_column_facets(uuid,text,integer,text) owner to postgres;
revoke all on function udt_column_facets(uuid,text,integer,text) from public, anon, authenticated, service_role;
grant execute on function udt_column_facets(uuid,text,integer,text) to postgres;
grant execute on function udt_column_facets(uuid,text,integer,text) to authenticated;
grant execute on function udt_column_facets(uuid,text,integer,text) to service_role;
grant execute on function udt_column_facets(uuid,text,integer,text) to authenticator;
grant execute on function udt_column_facets(uuid,text,integer,text) to dashboard_user;
grant execute on function udt_column_facets(uuid,text,integer,text) to svc_seo;
grant execute on function udt_column_facets(uuid,text,integer,text) to cli_login_postgres;
grant execute on function udt_column_facets(uuid,text,integer,text) to matrx_provisioner;
comment on function udt_column_facets(uuid,text,integer,text) is 'Distinct values + counts for one user-table column. Powers the value-picker column filter and pre-fills options when a choice format is declared. SECURITY INVOKER — udt_dataset_rows RLS is the gate.';

-- udt_delete_field(uuid,uuid)
CREATE OR REPLACE FUNCTION public.udt_delete_field(p_table_id uuid, p_field_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the deprecated; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'udt_delete_field was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$
;
alter function udt_delete_field(uuid,uuid) owner to postgres;
revoke all on function udt_delete_field(uuid,uuid) from public, anon, authenticated, service_role;
grant execute on function udt_delete_field(uuid,uuid) to postgres;
grant execute on function udt_delete_field(uuid,uuid) to service_role;
comment on function udt_delete_field(uuid,uuid) is 'Removes a column from a user data table and purges its key from every row. Refuses to delete the last remaining column. Requires owner or editor access.';

-- udt_list_example_tables()
CREATE OR REPLACE FUNCTION public.udt_list_example_tables()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the deprecated; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'udt_list_example_tables was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$
;
alter function udt_list_example_tables() owner to postgres;
revoke all on function udt_list_example_tables() from public, anon, authenticated, service_role;
grant execute on function udt_list_example_tables() to postgres;
grant execute on function udt_list_example_tables() to authenticated;
grant execute on function udt_list_example_tables() to service_role;
grant execute on function udt_list_example_tables() to dashboard_user;
grant execute on function udt_list_example_tables() to svc_seo;
comment on function udt_list_example_tables() is NULL;

-- udt_set_field_format(uuid,uuid,jsonb)
CREATE OR REPLACE FUNCTION public.udt_set_field_format(p_table_id uuid, p_field_id uuid, p_format jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the deprecated; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'udt_set_field_format was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$
;
alter function udt_set_field_format(uuid,uuid,jsonb) owner to postgres;
revoke all on function udt_set_field_format(uuid,uuid,jsonb) from public, anon, authenticated, service_role;
grant execute on function udt_set_field_format(uuid,uuid,jsonb) to postgres;
grant execute on function udt_set_field_format(uuid,uuid,jsonb) to service_role;
comment on function udt_set_field_format(uuid,uuid,jsonb) is 'Sets (or clears, with null) the display format on a user-table column: udt_dataset_fields.metadata.format = {id, options}. Purely additive — the stored data_type and values are untouched.';

-- udt_set_table_row_actions(uuid,jsonb)
CREATE OR REPLACE FUNCTION public.udt_set_table_row_actions(p_table_id uuid, p_row_actions jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the deprecated; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'udt_set_table_row_actions was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$
;
alter function udt_set_table_row_actions(uuid,jsonb) owner to postgres;
revoke all on function udt_set_table_row_actions(uuid,jsonb) from public, anon, authenticated, service_role;
grant execute on function udt_set_table_row_actions(uuid,jsonb) to postgres;
grant execute on function udt_set_table_row_actions(uuid,jsonb) to service_role;
comment on function udt_set_table_row_actions(uuid,jsonb) is NULL;

-- udt_set_table_row_label(uuid,jsonb)
CREATE OR REPLACE FUNCTION public.udt_set_table_row_label(p_table_id uuid, p_row_label jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the deprecated; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'udt_set_table_row_label was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$
;
alter function udt_set_table_row_label(uuid,jsonb) owner to postgres;
revoke all on function udt_set_table_row_label(uuid,jsonb) from public, anon, authenticated, service_role;
grant execute on function udt_set_table_row_label(uuid,jsonb) to postgres;
grant execute on function udt_set_table_row_label(uuid,jsonb) to service_role;
comment on function udt_set_table_row_label(uuid,jsonb) is NULL;

-- udt_set_table_style(uuid,text[],jsonb)
CREATE OR REPLACE FUNCTION public.udt_set_table_style(p_table_id uuid, p_path text[], p_value jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the deprecated; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'udt_set_table_style was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$
;
alter function udt_set_table_style(uuid,text[],jsonb) owner to postgres;
revoke all on function udt_set_table_style(uuid,text[],jsonb) from public, anon, authenticated, service_role;
grant execute on function udt_set_table_style(uuid,text[],jsonb) to postgres;
grant execute on function udt_set_table_style(uuid,text[],jsonb) to service_role;
comment on function udt_set_table_style(uuid,text[],jsonb) is NULL;

-- udt_table_profile(uuid,integer)
CREATE OR REPLACE FUNCTION public.udt_table_profile(p_table_id uuid, p_preview_values integer DEFAULT 12)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the deprecated; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'udt_table_profile was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$
;
alter function udt_table_profile(uuid,integer) owner to postgres;
revoke all on function udt_table_profile(uuid,integer) from public, anon, authenticated, service_role;
grant execute on function udt_table_profile(uuid,integer) to postgres;
grant execute on function udt_table_profile(uuid,integer) to authenticated;
grant execute on function udt_table_profile(uuid,integer) to service_role;
grant execute on function udt_table_profile(uuid,integer) to authenticator;
grant execute on function udt_table_profile(uuid,integer) to dashboard_user;
grant execute on function udt_table_profile(uuid,integer) to svc_seo;
grant execute on function udt_table_profile(uuid,integer) to cli_login_postgres;
grant execute on function udt_table_profile(uuid,integer) to matrx_provisioner;
comment on function udt_table_profile(uuid,integer) is 'Shape of every column in a user table in one call — fill rate, distinct count, type evidence, top values. Powers the column profile panel and format suggestions. SECURITY INVOKER — udt_dataset_rows RLS is the gate.';

-- udt_upsert_cell(uuid,uuid,text,jsonb)
CREATE OR REPLACE FUNCTION public.udt_upsert_cell(p_table_id uuid, p_row_id uuid, p_field_name text, p_value jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the deprecated; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'udt_upsert_cell was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$
;
alter function udt_upsert_cell(uuid,uuid,text,jsonb) owner to postgres;
revoke all on function udt_upsert_cell(uuid,uuid,text,jsonb) from public, anon, authenticated, service_role;
grant execute on function udt_upsert_cell(uuid,uuid,text,jsonb) to postgres;
grant execute on function udt_upsert_cell(uuid,uuid,text,jsonb) to service_role;
comment on function udt_upsert_cell(uuid,uuid,text,jsonb) is 'Surgical single-cell write. p_value NULL clears that ONE key (stored as JSON null) — never the whole row body; see the COALESCE guard.';

-- udt_upsert_row(uuid,uuid,jsonb)
CREATE OR REPLACE FUNCTION public.udt_upsert_row(p_table_id uuid, p_row_id uuid DEFAULT NULL::uuid, p_data jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the deprecated; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'udt_upsert_row was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$
;
alter function udt_upsert_row(uuid,uuid,jsonb) owner to postgres;
revoke all on function udt_upsert_row(uuid,uuid,jsonb) from public, anon, authenticated, service_role;
grant execute on function udt_upsert_row(uuid,uuid,jsonb) to postgres;
grant execute on function udt_upsert_row(uuid,uuid,jsonb) to service_role;
comment on function udt_upsert_row(uuid,uuid,jsonb) is NULL;

-- udt_validate_row(uuid,jsonb,jsonb)
CREATE OR REPLACE FUNCTION public.udt_validate_row(p_table_id uuid, p_data jsonb, p_prior jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the deprecated; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'udt_validate_row was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$
;
alter function udt_validate_row(uuid,jsonb,jsonb) owner to postgres;
revoke all on function udt_validate_row(uuid,jsonb,jsonb) from public, anon, authenticated, service_role;
grant execute on function udt_validate_row(uuid,jsonb,jsonb) to postgres;
grant execute on function udt_validate_row(uuid,jsonb,jsonb) to authenticated;
grant execute on function udt_validate_row(uuid,jsonb,jsonb) to service_role;
comment on function udt_validate_row(uuid,jsonb,jsonb) is NULL;

-- update_data_row_in_user_table(uuid,jsonb)
CREATE OR REPLACE FUNCTION public.update_data_row_in_user_table(p_row_id uuid, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the deprecated; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'update_data_row_in_user_table was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$
;
alter function update_data_row_in_user_table(uuid,jsonb) owner to postgres;
revoke all on function update_data_row_in_user_table(uuid,jsonb) from public, anon, authenticated, service_role;
grant execute on function update_data_row_in_user_table(uuid,jsonb) to postgres;
grant execute on function update_data_row_in_user_table(uuid,jsonb) to service_role;
grant execute on function update_data_row_in_user_table(uuid,jsonb) to dashboard_user;
grant execute on function update_data_row_in_user_table(uuid,jsonb) to svc_seo;
comment on function update_data_row_in_user_table(uuid,jsonb) is NULL;

-- update_field_metadata(uuid,text,boolean,integer,jsonb)
CREATE OR REPLACE FUNCTION public.update_field_metadata(p_field_id uuid, p_display_name text DEFAULT NULL::text, p_is_required boolean DEFAULT NULL::boolean, p_field_order integer DEFAULT NULL::integer, p_validation_rules jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the deprecated; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'update_field_metadata was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$
;
alter function update_field_metadata(uuid,text,boolean,integer,jsonb) owner to postgres;
revoke all on function update_field_metadata(uuid,text,boolean,integer,jsonb) from public, anon, authenticated, service_role;
grant execute on function update_field_metadata(uuid,text,boolean,integer,jsonb) to postgres;
grant execute on function update_field_metadata(uuid,text,boolean,integer,jsonb) to service_role;
grant execute on function update_field_metadata(uuid,text,boolean,integer,jsonb) to dashboard_user;
grant execute on function update_field_metadata(uuid,text,boolean,integer,jsonb) to svc_seo;
comment on function update_field_metadata(uuid,text,boolean,integer,jsonb) is NULL;

-- update_user_table_config(uuid,jsonb,jsonb)
CREATE OR REPLACE FUNCTION public.update_user_table_config(p_table_id uuid, p_table_updates jsonb DEFAULT NULL::jsonb, p_field_updates jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the deprecated; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'update_user_table_config was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$
;
alter function update_user_table_config(uuid,jsonb,jsonb) owner to postgres;
revoke all on function update_user_table_config(uuid,jsonb,jsonb) from public, anon, authenticated, service_role;
grant execute on function update_user_table_config(uuid,jsonb,jsonb) to postgres;
grant execute on function update_user_table_config(uuid,jsonb,jsonb) to service_role;
comment on function update_user_table_config(uuid,jsonb,jsonb) is NULL;

-- update_user_table_default_sort(uuid,text,text)
CREATE OR REPLACE FUNCTION public.update_user_table_default_sort(p_table_id uuid, p_sort_field text DEFAULT NULL::text, p_sort_direction text DEFAULT 'asc'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the deprecated; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'update_user_table_default_sort was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$
;
alter function update_user_table_default_sort(uuid,text,text) owner to postgres;
revoke all on function update_user_table_default_sort(uuid,text,text) from public, anon, authenticated, service_role;
grant execute on function update_user_table_default_sort(uuid,text,text) to postgres;
grant execute on function update_user_table_default_sort(uuid,text,text) to service_role;
comment on function update_user_table_default_sort(uuid,text,text) is NULL;

-- update_user_table_metadata(uuid,text,text,boolean,boolean)
CREATE OR REPLACE FUNCTION public.update_user_table_metadata(p_table_id uuid, p_table_name text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_is_public boolean DEFAULT NULL::boolean, p_authenticated_read boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the deprecated; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'update_user_table_metadata was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$
;
alter function update_user_table_metadata(uuid,text,text,boolean,boolean) owner to postgres;
revoke all on function update_user_table_metadata(uuid,text,text,boolean,boolean) from public, anon, authenticated, service_role;
grant execute on function update_user_table_metadata(uuid,text,text,boolean,boolean) to postgres;
grant execute on function update_user_table_metadata(uuid,text,text,boolean,boolean) to service_role;
comment on function update_user_table_metadata(uuid,text,text,boolean,boolean) is NULL;

-- update_user_table_row_ordering(uuid,boolean,jsonb,text)
CREATE OR REPLACE FUNCTION public.update_user_table_row_ordering(p_table_id uuid, p_enabled boolean, p_order jsonb DEFAULT NULL::jsonb, p_label_field text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the deprecated; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'update_user_table_row_ordering was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$
;
alter function update_user_table_row_ordering(uuid,boolean,jsonb,text) owner to postgres;
revoke all on function update_user_table_row_ordering(uuid,boolean,jsonb,text) from public, anon, authenticated, service_role;
grant execute on function update_user_table_row_ordering(uuid,boolean,jsonb,text) to postgres;
grant execute on function update_user_table_row_ordering(uuid,boolean,jsonb,text) to service_role;
comment on function update_user_table_row_ordering(uuid,boolean,jsonb,text) is 'Saves manual row order for a user data table. Merges into row_ordering_config (never replaces it) and records label_field — the column shown as each row''s label in the Reorder Rows dialog. Owner or editor.';

-- workbench._moved_older_table_restores_with_switch_back()
CREATE OR REPLACE FUNCTION workbench._moved_older_table_restores_with_switch_back()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  if old.deleted_at is not null and new.deleted_at is null
     and old.metadata ? 'moved_to'
     and (new.metadata ->> 'unarchived_at') is not distinct from (old.metadata ->> 'unarchived_at')
     and platform._older_table_moved_by_switch(old.id) then
    raise exception '"%" moved to the new system when this organization switched its Data tables, so it is not restored on its own. Switch back restores all of them together: organization settings, Data, Switch back.',
                    coalesce(nullif(btrim(old.table_name), ''), 'This older table')
      using errcode = '23514',
            hint = 'Its copy in the new system is the live table (same id, same address). To go back to the older tables, press Switch back on /organizations/' || old.organization_id || '/settings#data.';
  end if;
  return new;
end;
$function$
;
alter function workbench._moved_older_table_restores_with_switch_back() owner to postgres;
revoke all on function workbench._moved_older_table_restores_with_switch_back() from public, anon, authenticated, service_role;
grant execute on function workbench._moved_older_table_restores_with_switch_back() to public;
grant execute on function workbench._moved_older_table_restores_with_switch_back() to postgres;
comment on function workbench._moved_older_table_restores_with_switch_back() is 'SWITCH-AFTERMATH: refuses clearing deleted_at on an older table that moved with its organization''s Data tables switch unless the write is Switch back''s own (workbench.udt_dataset_unarchive stamps metadata.unarchived_at). One Trash restore must never bring back one older table beside the switch.';

-- 6b. the door rows of the dropped functions (39), row images of 2026-10-03.
insert into platform.client_callable_door
select (r).* from (select jsonb_populate_record(null::platform.client_callable_door,
         case when x->>'schema_name' = 'public' and x->>'function_name' = any(array['add_column_to_user_table','add_data_row_to_user_table','append_rows_to_user_table','create_new_user_table_dynamic','create_user_list','create_user_table_with_fields','delete_data_row_from_user_table','delete_user_table','export_user_table_as_csv','get_full_table','get_table_cell','get_table_column','get_table_row','get_user_table_complete','get_user_table_data_paginated','get_user_table_data_paginated_v2','get_user_tables','list_table_columns','list_table_rows','udt_backfill_autonumber','udt_bulk_write','udt_change_field_type','udt_column_facets','udt_delete_field','udt_list_example_tables','udt_set_field_format','udt_set_table_row_actions','udt_set_table_row_label','udt_set_table_style','udt_table_profile','udt_upsert_cell','udt_upsert_row','udt_validate_row','update_data_row_in_user_table','update_field_metadata','update_user_table_config','update_user_table_default_sort','update_user_table_metadata','update_user_table_row_ordering'])
              then x || '{"refusal_only": true}'::jsonb else x end) r
  from jsonb_array_elements('[{"id": "ac06e092-7644-4d46-b8c4-ee6ffb701678", "schema_name": "custom", "function_name": "table_copy_evaluation_state", "identity_args": "p_table_id uuid", "declared_by": "migrations/campaign/copywritable_people_test_the_copy_until_the_switch.sql (lane COPY-WRITABLE)", "reason": "The table page asks whether the table it shows is a test copy and how many rows people changed on it. A table the caller cannot open (custom.has_visibility viewer) answers found = false, the same as an id that does not exist; otherwise only counts and fixed sentences, never a row, a name or a person.", "declared_at": "2026-09-26T04:55:46.415605+00:00", "gate_predicate": null, "anonymous_callers": false, "anonymous_purpose": null, "signed_in_callers": true, "non_client_lane": null, "identity_argtypes": ["2950"], "probe_args": null, "argument_rules": null, "contract_probe": null, "refusal_only": false}, {"id": "541d9ff5-5eef-46ab-aa31-a2093e9cfbe4", "schema_name": "platform", "function_name": "final_switch_press", "identity_args": "p_note text, p_copy_again jsonb", "declared_by": "migrations/campaign/finalswitch_one_press_switches_every_organization_and_one_undo_reverses_it.sql (lane FINAL-SWITCH)", "reason": "Takes no id. The final switch itself: a platform administrator, signed in (authenticated with a session), from a page (an Origin), in the admin lane; everyone else is refused and the refusal recorded. It measures every organization''s readiness first and refuses while anything is not ready.", "declared_at": "2026-09-27T06:42:33.422841+00:00", "gate_predicate": null, "anonymous_callers": false, "anonymous_purpose": null, "signed_in_callers": true, "non_client_lane": null, "identity_argtypes": ["25", "3802"], "probe_args": null, "argument_rules": {"version": 1, "arguments": {"p_note": {"type": "text", "check": "free text kept on the press record", "position": 1}, "p_copy_again": {"type": "jsonb", "check": "the page''s Copy again report, kept on the press record as reported; the press measures readiness itself", "position": 2}}}, "contract_probe": null, "refusal_only": false}, {"id": "2c91f029-c085-4d9b-9d77-4dfcc2f07399", "schema_name": "platform", "function_name": "final_switch_readiness", "identity_args": "", "declared_by": "migrations/campaign/finalswitch_one_press_switches_every_organization_and_one_undo_reverses_it.sql (lane FINAL-SWITCH)", "reason": "Takes no argument. Platform administrators only (public.is_admin(), the admin lane) or the server: every organization''s readiness for the final switch, with its names and counts. Anyone else is told not_a_platform_admin and sees nothing.", "declared_at": "2026-09-27T06:42:33.422841+00:00", "gate_predicate": null, "anonymous_callers": false, "anonymous_purpose": null, "signed_in_callers": true, "non_client_lane": null, "identity_argtypes": [], "probe_args": null, "argument_rules": null, "contract_probe": null, "refusal_only": false}, {"id": "df9bae77-a1bf-4bc0-a621-5d4df59ca25f", "schema_name": "platform", "function_name": "final_switch_retire_undo", "identity_args": "p_note text", "declared_by": "migrations/campaign/switchsteptwo_a_the_undo_is_retired_by_name_before_the_older_tables_leave.sql (lane SWITCH-STEP-TWO)", "reason": "Takes no id. Retires the final switch''s undo: the same person rules as the press (a platform administrator, signed in, from the Final switch page); refuses unless the switch is pressed and the undo is not already retired; one row in the append-only press record.", "declared_at": "2026-10-01T20:06:29.201799+00:00", "gate_predicate": null, "anonymous_callers": false, "anonymous_purpose": null, "signed_in_callers": true, "non_client_lane": null, "identity_argtypes": ["25"], "probe_args": null, "argument_rules": {"version": 1, "arguments": {"p_note": {"type": "text", "check": "free text kept on the retirement record", "position": 1}}}, "contract_probe": null, "refusal_only": false}, {"id": "96d2abd4-8107-4e17-a1d3-84d051b24626", "schema_name": "platform", "function_name": "final_switch_state", "identity_args": "", "declared_by": "migrations/campaign/finalswitch_one_press_switches_every_organization_and_one_undo_reverses_it.sql (lane FINAL-SWITCH)", "reason": "Takes no argument. Answers whether the final switch is on (the platform''s one state, when and by whom) and the two platform switches it turns; every screen that must land on the new page reads it (the /data home, the older list managers). Nothing about any row.", "declared_at": "2026-09-27T06:42:33.422841+00:00", "gate_predicate": null, "anonymous_callers": false, "anonymous_purpose": null, "signed_in_callers": true, "non_client_lane": null, "identity_argtypes": [], "probe_args": null, "argument_rules": null, "contract_probe": null, "refusal_only": false}, {"id": "a2338b0b-5459-4709-ad6b-ce7fa4ec73e5", "schema_name": "platform", "function_name": "final_switch_undo", "identity_args": "p_note text, p_accept_not_carried boolean", "declared_by": "migrations/campaign/finalswitch_one_press_switches_every_organization_and_one_undo_reverses_it.sql (lane FINAL-SWITCH)", "reason": "Takes no id. The one undo of the final switch: the same person rules as the press; it reverses exactly the last run, in the same order backwards, and refuses while something cannot be carried back unless p_accept_not_carried confirms it.", "declared_at": "2026-09-27T06:42:33.422841+00:00", "gate_predicate": null, "anonymous_callers": false, "anonymous_purpose": null, "signed_in_callers": true, "non_client_lane": null, "identity_argtypes": ["25", "16"], "probe_args": null, "argument_rules": {"version": 1, "arguments": {"p_note": {"type": "text", "check": "free text kept on the undo record", "position": 1}, "p_accept_not_carried": {"type": "boolean", "check": "true confirms what Switch back leaves in the new system; otherwise the undo is refused as confirm_not_carried, naming each thing", "position": 2}}}, "contract_probe": null, "refusal_only": false}, {"id": "8ebcbec0-8152-495f-93a5-f9319ece31ad", "schema_name": "platform", "function_name": "unified_data_ramp_exit", "identity_args": "", "declared_by": "W7-OFF", "reason": "The dual-engine exit decision. It takes no argument and names no entity: it is one row about the platform, not about anybody''s data.", "declared_at": "2026-09-19T07:42:31.131936+00:00", "gate_predicate": null, "anonymous_callers": false, "anonymous_purpose": null, "signed_in_callers": false, "non_client_lane": "server_only: called only by the unified-data ramp API route, which verifies the signed-in person is a platform admin from their own session before using the service key. It reads the campaign ledger, which is an operator surface.", "identity_argtypes": [], "probe_args": null, "argument_rules": null, "contract_probe": null, "refusal_only": false}, {"id": "dcf06c7f-2970-486c-bbc8-2372c51bcaba", "schema_name": "platform", "function_name": "unified_data_ramp_exit", "identity_args": "p_organization_id uuid", "declared_by": "migrations/campaign/fieldadd_the_switch_screen_can_be_operated.sql (lane FIELD-ADD)", "reason": "The plan for leaving each pair of engines behind, read by the one screen that switches an organization between them. An owner or an administrator of the organization named here may read it; the predicate is decided before the first read, so an organization somebody does not administer answers exactly as an invented id does. The no-argument original stays server-only: which engine replaces which is campaign metadata and not one organization''s business, and this twin exists so a screen can ask the question with an organization attached.", "declared_at": "2026-09-19T17:51:07.452364+00:00", "gate_predicate": null, "anonymous_callers": false, "anonymous_purpose": null, "signed_in_callers": true, "non_client_lane": null, "identity_argtypes": ["2950"], "probe_args": null, "argument_rules": null, "contract_probe": null, "refusal_only": false}, {"id": "0af16b84-5e97-4df5-b248-50c499b6d973", "schema_name": "platform", "function_name": "unified_data_ramp_gate", "identity_args": "p_consumer text, p_organization_id uuid", "declared_by": "W7-OFF", "reason": "Runs one consumer Test 1 gate for one organization from the screen.", "declared_at": "2026-09-19T07:15:41.532395+00:00", "gate_predicate": null, "anonymous_callers": false, "anonymous_purpose": null, "signed_in_callers": false, "non_client_lane": "server_only: called only by the unified-data ramp API route, which verifies the signed-in person is a platform admin from their own session before using the service key.", "identity_argtypes": ["25", "2950"], "probe_args": null, "argument_rules": null, "contract_probe": null, "refusal_only": false}, {"id": "1721dc50-3b37-4e5c-8d29-79ad3586b765", "schema_name": "platform", "function_name": "unified_data_ramp_set", "identity_args": "p_consumer text, p_organization_id uuid, p_on boolean, p_user_id uuid, p_note text", "declared_by": "W7-OFF", "reason": "THE SWITCH. Turning a consumer on runs its gate and refuses on anything but green; turning it off is never gated. p_organization_id names the organization switched, p_user_id an optional per-user rung inside it.", "declared_at": "2026-09-19T07:15:41.532395+00:00", "gate_predicate": null, "anonymous_callers": false, "anonymous_purpose": null, "signed_in_callers": false, "non_client_lane": "server_only: called only by the unified-data ramp API route, which verifies the signed-in person is a platform admin from their own session before using the service key. This is the function that switches a whole organization onto a different data store.", "identity_argtypes": ["25", "2950", "16", "2950", "25"], "probe_args": null, "argument_rules": null, "contract_probe": null, "refusal_only": false}, {"id": "69947f9d-5b46-42d4-84b0-1f0e48243ae2", "schema_name": "platform", "function_name": "unified_data_ramp_set", "identity_args": "p_consumer text, p_organization_id uuid, p_on boolean, p_user_id uuid, p_note text, p_acting_user_id uuid", "declared_by": "W7-OFF", "reason": "THE SWITCH. Turning a consumer on runs its Test 1 gate and refuses on anything but green; turning it off is never gated. p_organization_id names the organization switched, p_user_id an optional per-user rung inside it, p_acting_user_id the platform admin the caller has already verified \u2014 it is stamped as the override''s actor and is required, because auth.uid() is null on the only lane that may call this.", "declared_at": "2026-09-19T07:37:06.874128+00:00", "gate_predicate": null, "anonymous_callers": false, "anonymous_purpose": null, "signed_in_callers": false, "non_client_lane": "server_only: called only by the unified-data ramp API route, which verifies the signed-in person is a platform admin from their own session before using the service key. This is the function that switches a whole organization onto a different data store.", "identity_argtypes": ["25", "2950", "16", "2950", "25", "2950"], "probe_args": null, "argument_rules": null, "contract_probe": null, "refusal_only": false}, {"id": "748546a3-bb9b-47f7-aa63-3f044949f814", "schema_name": "platform", "function_name": "unified_data_ramp_state", "identity_args": "p_organization_id uuid", "declared_by": "migrations/campaign/fieldadd_the_switch_doors_say_they_are_open.sql (lane FIELD-ADD)", "reason": "Where one organization stands on the ramp, consumer by consumer, with the verdict of each consumer''s last gate run. p_organization_id is checked by platform.assert_may_operate_unified_data_ramp before the first read - a signed-in administrator of this organization, and the owner and service-role lanes, the same way platform.assert_may_operate_unified_data_ramp already decides - so an organization somebody does not administer answers exactly as an invented id does. It was declared server-only while the only caller was an admin API route holding the service key; that route still works and a person who administers the organization can now read their own ramp, which is what the screen needed.", "declared_at": "2026-09-19T07:15:41.532395+00:00", "gate_predicate": null, "anonymous_callers": false, "anonymous_purpose": null, "signed_in_callers": true, "non_client_lane": null, "identity_argtypes": ["2950"], "probe_args": null, "argument_rules": null, "contract_probe": null, "refusal_only": false}, {"id": "849b3a75-4241-4537-a1a1-ea9440ee25ae", "schema_name": "public", "function_name": "add_column_to_user_table", "identity_args": "p_table_id uuid, p_field_name text, p_display_name text, p_data_type text, p_field_order integer, p_is_required boolean, p_default_value jsonb, p_validation_rules jsonb", "declared_by": "platform.final_switch_press (lane FINAL-SWITCH)", "reason": "An older-table write door, recorded here so no client may open it while the final switch is on.", "declared_at": "2026-10-01T19:57:04.742989+00:00", "gate_predicate": null, "anonymous_callers": false, "anonymous_purpose": null, "signed_in_callers": false, "non_client_lane": "Closed to clients by the final switch (run 23e18314-8dd2-4553-832a-f954a8b7f8a3): the older tables moved to the new system, where every client writes now. The server (service_role) and the switch''s own undo still reach it; the undo opens it again exactly as it was.", "identity_argtypes": ["2950", "25", "25", "25", "23", "16", "3802", "3802"], "probe_args": null, "argument_rules": null, "contract_probe": null, "refusal_only": false}, {"id": "9436e11d-8856-43f0-8679-8f6886be5810", "schema_name": "public", "function_name": "add_data_row_to_user_table", "identity_args": "p_table_id uuid, p_data jsonb", "declared_by": "DD-169 batch 3 / B-75", "reason": "Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 2 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `workbench.udt_dataset_access` \u2014 that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.", "declared_at": "2026-09-13T08:46:33.816567+00:00", "gate_predicate": "workbench.udt_dataset_access", "anonymous_callers": false, "anonymous_purpose": null, "signed_in_callers": false, "non_client_lane": "Closed to clients by the final switch (run 23e18314-8dd2-4553-832a-f954a8b7f8a3): the older tables moved to the new system, where every client writes now. The server (service_role) and the switch''s own undo still reach it; the undo opens it again exactly as it was.", "identity_argtypes": ["2950", "3802"], "probe_args": {"args": {"p_data": "literal:{}", "p_table_id": "other_row:workbench.udt_datasets"}, "note": "Adding a row to another organization user-defined table."}, "argument_rules": null, "contract_probe": null, "refusal_only": false}, {"id": "23b9925e-a5ec-46e0-bbe7-90c0df07e502", "schema_name": "public", "function_name": "append_rows_to_user_table", "identity_args": "p_table_id uuid, p_rows jsonb", "declared_by": "platform.final_switch_press (lane FINAL-SWITCH)", "reason": "An older-table write door, recorded here so no client may open it while the final switch is on.", "declared_at": "2026-10-01T19:57:04.742989+00:00", "gate_predicate": null, "anonymous_callers": false, "anonymous_purpose": null, "signed_in_callers": false, "non_client_lane": "Closed to clients by the final switch (run 23e18314-8dd2-4553-832a-f954a8b7f8a3): the older tables moved to the new system, where every client writes now. The server (service_role) and the switch''s own undo still reach it; the undo opens it again exactly as it was.", "identity_argtypes": ["2950", "3802"], "probe_args": null, "argument_rules": null, "contract_probe": null, "refusal_only": false}, {"id": "01e5e56b-fea3-436f-8d4e-d9866c0f3bbc", "schema_name": "public", "function_name": "create_new_user_table_dynamic", "identity_args": "p_table_name text, p_description text, p_is_public boolean, p_organization_id uuid, p_initial_fields jsonb", "declared_by": "DD-169 batch 3 / B-75", "reason": "Signed-in door (DD-169 batch 3, B-75; re-signed by lane DATA-CREATE-FIX 2026-09-20). SECURITY DEFINER; writes; the caller is resolved inside the body by `auth.uid()` \u2014 that literal is what D6 checks is still there. It now takes an EXPLICIT p_organization_id, refuses a NULL one with ORGANIZATION_REQUIRED rather than deriving one, and asks iam.has_org_access before its first INSERT. `anon` holds no EXECUTE on it.", "declared_at": "2026-09-13T08:46:33.816567+00:00", "gate_predicate": "auth.uid()", "anonymous_callers": false, "anonymous_purpose": null, "signed_in_callers": false, "non_client_lane": "Closed to clients by the final switch (run 23e18314-8dd2-4553-832a-f954a8b7f8a3): the older tables moved to the new system, where every client writes now. The server (service_role) and the switch''s own undo still reach it; the undo opens it again exactly as it was.", "identity_argtypes": ["25", "25", "16", "2950", "3802"], "probe_args": null, "argument_rules": null, "contract_probe": null, "refusal_only": false}, {"id": "19a9b4bf-7cc0-490e-b42f-5cdf3dbd1ed4", "schema_name": "public", "function_name": "create_user_list", "identity_args": "p_list_name character varying, p_description text, p_user_id uuid, p_is_public boolean, p_authenticated_read boolean, p_public_read boolean, p_items jsonb, p_organization_id uuid", "declared_by": "DD-169 batch 3 / B-75", "reason": "Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 3 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` \u2014 that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.", "declared_at": "2026-09-13T08:46:33.816567+00:00", "gate_predicate": "auth.uid()", "anonymous_callers": false, "anonymous_purpose": null, "signed_in_callers": true, "non_client_lane": null, "identity_argtypes": ["1043", "25", "2950", "16", "16", "16", "3802", "2950"], "probe_args": null, "argument_rules": {"version": 1, "arguments": {"p_user_id": {"foreign": {"note": "The list owner. The body requires this to equal auth.uid() unless the caller is service_role.", "bounded": true}}, "p_organization_id": {"foreign": {"note": "The initiating organization. The body requires iam.has_org_access before the insert, and refuses a null.", "bounded": true}}}, "declared_by": "0981_a_list_and_a_retrieval_audit_name_their_organization.sql"}, "contract_probe": null, "refusal_only": false}, {"id": "c9e4f413-6e48-4f03-82a6-a8bd73054b06", "schema_name": "public", "function_name": "create_user_table_with_fields", "identity_args": "p_table_name text, p_description text, p_is_public boolean, p_organization_id uuid, p_project_id uuid, p_task_id uuid, p_fields jsonb", "declared_by": "platform.final_switch_press (lane FINAL-SWITCH)", "reason": "An older-table write door, recorded here so no client may open it while the final switch is on.", "declared_at": "2026-10-01T19:57:04.742989+00:00", "gate_predicate": null, "anonymous_callers": false, "anonymous_purpose": null, "signed_in_callers": false, "non_client_lane": "Closed to clients by the final switch (run 23e18314-8dd2-4553-832a-f954a8b7f8a3): the older tables moved to the new system, where every client writes now. The server (service_role) and the switch''s own undo still reach it; the undo opens it again exactly as it was.", "identity_argtypes": ["25", "25", "16", "2950", "2950", "2950", "3802"], "probe_args": null, "argument_rules": null, "contract_probe": null, "refusal_only": false}, {"id": "32ec13b1-cd00-4287-a895-58e69c3e7c94", "schema_name": "public", "function_name": "delete_data_row_from_user_table", "identity_args": "p_row_id uuid", "declared_by": "platform.final_switch_press (lane FINAL-SWITCH)", "reason": "An older-table write door, recorded here so no client may open it while the final switch is on.", "declared_at": "2026-10-01T19:57:04.742989+00:00", "gate_predicate": null, "anonymous_callers": false, "anonymous_purpose": null, "signed_in_callers": false, "non_client_lane": "Closed to clients by the final switch (run 23e18314-8dd2-4553-832a-f954a8b7f8a3): the older tables moved to the new system, where every client writes now. The server (service_role) and the switch''s own undo still reach it; the undo opens it again exactly as it was.", "identity_argtypes": ["2950"], "probe_args": null, "argument_rules": null, "contract_probe": null, "refusal_only": false}, {"id": "d43b266f-3889-46f7-a692-aeffe87fdddf", "schema_name": "public", "function_name": "delete_user_table", "identity_args": "p_table_id uuid", "declared_by": "platform.final_switch_press (lane FINAL-SWITCH)", "reason": "An older-table write door, recorded here so no client may open it while the final switch is on.", "declared_at": "2026-10-01T19:57:04.742989+00:00", "gate_predicate": null, "anonymous_callers": false, "anonymous_purpose": null, "signed_in_callers": false, "non_client_lane": "Closed to clients by the final switch (run 23e18314-8dd2-4553-832a-f954a8b7f8a3): the older tables moved to the new system, where every client writes now. The server (service_role) and the switch''s own undo still reach it; the undo opens it again exactly as it was.", "identity_argtypes": ["2950"], "probe_args": null, "argument_rules": null, "contract_probe": null, "refusal_only": false}, {"id": "99ca2e75-210f-40f8-9067-1c7a061f3c70", "schema_name": "public", "function_name": "get_user_table_complete", "identity_args": "p_table_id uuid, p_sort_field text, p_sort_direction text", "declared_by": "DD-169 / B-64", "reason": "SIGNED-IN door (authenticated only; anon and PUBLIC revoked by this migration). Reader called from 9 signed-in call sites in the four repos. Its body takes its subject from its arguments and does not resolve a caller, which is exactly why an anonymous caller must not reach it. No anonymous caller exists for it in matrx-frontend, aidream, matrx-extend or matrx-local.", "declared_at": "2026-09-13T07:58:13.359949+00:00", "gate_predicate": null, "anonymous_callers": false, "anonymous_purpose": null, "signed_in_callers": true, "non_client_lane": null, "identity_argtypes": ["2950", "25", "25"], "probe_args": null, "argument_rules": null, "contract_probe": null, "refusal_only": false}, {"id": "00ad3cdb-7852-4267-a9f1-e2cbedcf4a39", "schema_name": "public", "function_name": "get_user_tables", "identity_args": "", "declared_by": "DD-169 batch 3 / B-75", "reason": "Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 10 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` \u2014 that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.", "declared_at": "2026-09-13T08:47:29.406936+00:00", "gate_predicate": "auth.uid()", "anonymous_callers": false, "anonymous_purpose": null, "signed_in_callers": true, "non_client_lane": null, "identity_argtypes": [], "probe_args": null, "argument_rules": null, "contract_probe": null, "refusal_only": false}, {"id": "d0c6cf46-aecc-4b73-99c2-11ff9d0a4859", "schema_name": "public", "function_name": "udt_backfill_autonumber", "identity_args": "p_table_id uuid, p_field_id uuid", "declared_by": "data-tables autonumber (2026-09-21)", "reason": "SIGNED-IN door (authenticated only). Numbers the existing rows of a user data table''s Autonumber column; the caller is resolved by auth.uid() and the body refuses anyone without editor access via workbench.udt_dataset_access.", "declared_at": "2026-09-21T03:10:44.621393+00:00", "gate_predicate": null, "anonymous_callers": false, "anonymous_purpose": null, "signed_in_callers": false, "non_client_lane": "Closed to clients by the final switch (run 23e18314-8dd2-4553-832a-f954a8b7f8a3): the older tables moved to the new system, where every client writes now. The server (service_role) and the switch''s own undo still reach it; the undo opens it again exactly as it was.", "identity_argtypes": ["2950", "2950"], "probe_args": null, "argument_rules": {"version": 1, "arguments": {"p_field_id": {"type": "uuid", "check": "DERIVED: the column is resolved only within table_id = p_table_id and only when it is an autonumber column; anything else returns the same ''That column is not an Autonumber column of this table.'' object an invented id returns.", "entity": "udt_dataset_fields", "foreign": {"note": "the same refusal object as an invented id", "not_a_leak": true, "same_as_invented": true}, "position": 2, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body"}, "p_table_id": {"type": "uuid", "check": "workbench.udt_dataset_access(p_table_id,''editor'') must be true or 42501, before the first read.", "access": "editor on the dataset", "entity": "dataset", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "position": 1, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body"}}, "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body", "declared_by": "argsruled_the_eighteen_that_reach_no_ladder.sql"}, "contract_probe": null, "refusal_only": false}, {"id": "9972be28-efe3-40d2-83e4-62661c25dc46", "schema_name": "public", "function_name": "udt_bulk_write", "identity_args": "p_table_id uuid, p_operations jsonb", "declared_by": "DD-169 batch 3 / B-75", "reason": "Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 8 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` \u2014 that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.", "declared_at": "2026-09-13T08:48:49.614866+00:00", "gate_predicate": "auth.uid()", "anonymous_callers": false, "anonymous_purpose": null, "signed_in_callers": false, "non_client_lane": "Closed to clients by the final switch (run 23e18314-8dd2-4553-832a-f954a8b7f8a3): the older tables moved to the new system, where every client writes now. The server (service_role) and the switch''s own undo still reach it; the undo opens it again exactly as it was.", "identity_argtypes": ["2950", "3802"], "probe_args": {"args": {"p_table_id": "other_row:workbench.udt_datasets", "p_operations": "literal:[]"}, "note": "An empty operation list still reaches the door own standing check on the table, which is the thing being measured. The earlier note claimed workbench.udt_datasets held no row across the boundary; it holds 144 (corrected 2026-09-14, V-102 F2)."}, "argument_rules": null, "contract_probe": null, "refusal_only": false}, {"id": "b9e51448-6ff7-4ba2-85d7-c9208a898093", "schema_name": "public", "function_name": "udt_change_field_type", "identity_args": "p_table_id uuid, p_field_id uuid, p_new_type field_data_type, p_strategy text", "declared_by": "DD-169 batch 3 / B-75", "reason": "Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 2 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` \u2014 that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.", "declared_at": "2026-09-13T08:48:49.614866+00:00", "gate_predicate": "auth.uid()", "anonymous_callers": false, "anonymous_purpose": null, "signed_in_callers": false, "non_client_lane": "Closed to clients by the final switch (run 23e18314-8dd2-4553-832a-f954a8b7f8a3): the older tables moved to the new system, where every client writes now. The server (service_role) and the switch''s own undo still reach it; the undo opens it again exactly as it was.", "identity_argtypes": ["2950", "2950", "1698974", "25"], "probe_args": {"args": {"p_field_id": "other_row:workbench.udt_dataset_fields", "p_new_type": "literal:string", "p_strategy": "literal:cast", "p_table_id": "other_row:workbench.udt_datasets"}, "note": "Retyping a column of another organization user-defined table is a destructive cross-boundary write; string is a real field_data_type label."}, "argument_rules": {"version": 1, "arguments": {"p_field_id": {"type": "uuid", "check": "p_field_id in statement comparing identity", "foreign": {"note": "decision found by the static reading with helper closure: p_field_id in statement comparing identity", "decided_before_read": true}, "optional": false, "position": 2, "verified": "static reading 2026-09-17", "null_rule": {}}, "p_new_type": {"type": "field_data_type", "foreign": {"not_an_id": true}, "optional": false, "position": 3, "null_rule": {}}, "p_strategy": {"type": "text", "foreign": {"not_an_id": true}, "optional": true, "position": 4, "null_rule": {}, "sql_default": "''cast_or_null''::text"}, "p_table_id": {"type": "uuid", "check": "p_table_id in statement comparing identity", "foreign": {"note": "decision found by the static reading with helper closure: p_table_id in statement comparing identity", "decided_before_read": true}, "optional": false, "position": 1, "verified": "static reading 2026-09-17", "null_rule": {}}}, "declared_by": "0851_every_door_names_every_argument.sql"}, "contract_probe": null, "refusal_only": false}, {"id": "f8c083e2-4c38-48bd-a058-7f33c25f555b", "schema_name": "public", "function_name": "udt_delete_field", "identity_args": "p_table_id uuid, p_field_id uuid", "declared_by": "DD-169 / B-63", "reason": "SIGNED-IN door (authenticated only; anon revoked by this migration). Called only from signed-in surfaces (1 call site).", "declared_at": "2026-09-13T07:34:35.434514+00:00", "gate_predicate": null, "anonymous_callers": false, "anonymous_purpose": null, "signed_in_callers": false, "non_client_lane": "Closed to clients by the final switch (run 23e18314-8dd2-4553-832a-f954a8b7f8a3): the older tables moved to the new system, where every client writes now. The server (service_role) and the switch''s own undo still reach it; the undo opens it again exactly as it was.", "identity_argtypes": ["2950", "2950"], "probe_args": null, "argument_rules": {"version": 1, "arguments": {"p_field_id": {"type": "uuid", "check": "read and deleted only where table_id = the gated table", "foreign": {"note": "read and deleted only where table_id = the gated table", "not_a_leak": true}, "optional": false, "position": 2, "verified": "static reading 2026-09-17", "null_rule": {}}, "p_table_id": {"type": "uuid", "check": "p_table_id -> public.udt_delete_field.p_table_id: p_table_id -> workbench.udt_dataset_access.p_table_id: p_table_id -> iam.has_access(...)", "foreign": {"note": "decision found by the static reading with helper closure: p_table_id -> public.udt_delete_field.p_table_id: p_table_id -> workbench.udt_dataset_access.p_table_id: p_table_id -> iam.has_access(...)", "decided_before_read": true}, "optional": false, "position": 1, "verified": "static reading 2026-09-17", "null_rule": {}}}, "declared_by": "0851_every_door_names_every_argument.sql"}, "contract_probe": null, "refusal_only": false}, {"id": "c3572d76-0491-469a-90fd-2279ea707b0a", "schema_name": "public", "function_name": "udt_list_example_tables", "identity_args": "", "declared_by": "data-tables colors (2026-09-14)", "reason": "SIGNED-IN door (authenticated only). Lists the platform example tables (Matrx System org datasets); SECURITY INVOKER, RLS decides what each caller sees.", "declared_at": "2026-09-15T02:48:52.824683+00:00", "gate_predicate": null, "anonymous_callers": false, "anonymous_purpose": null, "signed_in_callers": true, "non_client_lane": null, "identity_argtypes": [], "probe_args": null, "argument_rules": null, "contract_probe": null, "refusal_only": false}, {"id": "1dedfc67-46ff-49bb-aa5d-912e8c9398ce", "schema_name": "public", "function_name": "udt_set_field_format", "identity_args": "p_table_id uuid, p_field_id uuid, p_format jsonb", "declared_by": "DD-169 / B-63", "reason": "SIGNED-IN door (authenticated only; anon revoked by this migration). Called only from signed-in surfaces (1 call site).", "declared_at": "2026-09-13T07:34:35.434514+00:00", "gate_predicate": null, "anonymous_callers": false, "anonymous_purpose": null, "signed_in_callers": false, "non_client_lane": "Closed to clients by the final switch (run 23e18314-8dd2-4553-832a-f954a8b7f8a3): the older tables moved to the new system, where every client writes now. The server (service_role) and the switch''s own undo still reach it; the undo opens it again exactly as it was.", "identity_argtypes": ["2950", "2950", "3802"], "probe_args": null, "argument_rules": {"version": 1, "arguments": {"p_format": {"type": "jsonb", "foreign": {"not_an_id": true}, "optional": true, "position": 3, "null_rule": {}, "sql_default": "NULL::jsonb"}, "p_field_id": {"type": "uuid", "check": "updated only where table_id = the gated table", "foreign": {"note": "updated only where table_id = the gated table", "not_a_leak": true}, "optional": false, "position": 2, "verified": "static reading 2026-09-17", "null_rule": {}}, "p_table_id": {"type": "uuid", "check": "p_table_id -> public.udt_set_field_format.p_table_id: p_table_id -> workbench.udt_dataset_access.p_table_id: p_table_id -> iam.has_access(...)", "foreign": {"note": "decision found by the static reading with helper closure: p_table_id -> public.udt_set_field_format.p_table_id: p_table_id -> workbench.udt_dataset_access.p_table_id: p_table_id -> iam.has_access(...)", "decided_before_read": true}, "optional": false, "position": 1, "verified": "static reading 2026-09-17", "null_rule": {}}}, "declared_by": "0851_every_door_names_every_argument.sql"}, "contract_probe": null, "refusal_only": false}, {"id": "09d7518e-b140-42c7-9542-c703d0b48eec", "schema_name": "public", "function_name": "udt_set_table_row_actions", "identity_args": "p_table_id uuid, p_row_actions jsonb", "declared_by": "data-tables row actions (2026-09-21)", "reason": "SIGNED-IN door (authenticated only). Replaces the row actions (metadata->row_actions) of a user data table; the caller is resolved by auth.uid() and the body refuses anyone without editor access via workbench.udt_dataset_access.", "declared_at": "2026-09-21T18:01:24.606868+00:00", "gate_predicate": null, "anonymous_callers": false, "anonymous_purpose": null, "signed_in_callers": false, "non_client_lane": "Closed to clients by the final switch (run 23e18314-8dd2-4553-832a-f954a8b7f8a3): the older tables moved to the new system, where every client writes now. The server (service_role) and the switch''s own undo still reach it; the undo opens it again exactly as it was.", "identity_argtypes": ["2950", "3802"], "probe_args": null, "argument_rules": null, "contract_probe": null, "refusal_only": false}, {"id": "fdb3848b-b846-4fe9-9add-7fc845936de0", "schema_name": "public", "function_name": "udt_set_table_row_label", "identity_args": "p_table_id uuid, p_row_label jsonb", "declared_by": "data-tables row label (2026-09-21)", "reason": "SIGNED-IN door (authenticated only). Sets or clears the row label (metadata->row_label) of a user data table; the caller is resolved by auth.uid() and the body refuses anyone without editor access via workbench.udt_dataset_access.", "declared_at": "2026-09-21T15:21:57.706449+00:00", "gate_predicate": null, "anonymous_callers": false, "anonymous_purpose": null, "signed_in_callers": false, "non_client_lane": "Closed to clients by the final switch (run 23e18314-8dd2-4553-832a-f954a8b7f8a3): the older tables moved to the new system, where every client writes now. The server (service_role) and the switch''s own undo still reach it; the undo opens it again exactly as it was.", "identity_argtypes": ["2950", "3802"], "probe_args": null, "argument_rules": null, "contract_probe": null, "refusal_only": false}, {"id": "5367fd9a-08d6-4083-99f3-df4753ff8aea", "schema_name": "public", "function_name": "udt_set_table_style", "identity_args": "p_table_id uuid, p_path text[], p_value jsonb", "declared_by": "data-tables colors (2026-09-14)", "reason": "SIGNED-IN door (authenticated only). Writes one path of a user data table''s color style (metadata->style); body refuses anyone without editor access via workbench.udt_dataset_access.", "declared_at": "2026-09-15T02:48:52.824683+00:00", "gate_predicate": null, "anonymous_callers": false, "anonymous_purpose": null, "signed_in_callers": false, "non_client_lane": "Closed to clients by the final switch (run 23e18314-8dd2-4553-832a-f954a8b7f8a3): the older tables moved to the new system, where every client writes now. The server (service_role) and the switch''s own undo still reach it; the undo opens it again exactly as it was.", "identity_argtypes": ["2950", "1009", "3802"], "probe_args": null, "argument_rules": null, "contract_probe": null, "refusal_only": false}, {"id": "c61389c4-a4b6-4143-ac54-4117cbfd4a41", "schema_name": "public", "function_name": "udt_upsert_cell", "identity_args": "p_table_id uuid, p_row_id uuid, p_field_name text, p_value jsonb", "declared_by": "DD-169 batch 3 / B-75", "reason": "Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 4 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` \u2014 that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.", "declared_at": "2026-09-13T08:48:49.614866+00:00", "gate_predicate": "auth.uid()", "anonymous_callers": false, "anonymous_purpose": null, "signed_in_callers": false, "non_client_lane": "Closed to clients by the final switch (run 23e18314-8dd2-4553-832a-f954a8b7f8a3): the older tables moved to the new system, where every client writes now. The server (service_role) and the switch''s own undo still reach it; the undo opens it again exactly as it was.", "identity_argtypes": ["2950", "2950", "25", "3802"], "probe_args": {"args": {"p_value": "literal:{}", "p_row_id": "other_row:workbench.udt_dataset_rows", "p_table_id": "other_row:workbench.udt_datasets"}, "note": "Writing one cell of another organization user-defined table; p_field_name is left to ordinary derivation because the door checks the table before the field."}, "argument_rules": {"version": 1, "arguments": {"p_value": {"type": "jsonb", "foreign": {"not_an_id": true}, "optional": false, "position": 4, "null_rule": {}}, "p_row_id": {"type": "uuid", "check": "p_row_id in statement comparing identity", "foreign": {"note": "decision found by the static reading with helper closure: p_row_id in statement comparing identity", "decided_before_read": true}, "optional": false, "position": 2, "verified": "static reading 2026-09-17", "null_rule": {}}, "p_table_id": {"type": "uuid", "check": "p_table_id in statement comparing identity", "foreign": {"note": "decision found by the static reading with helper closure: p_table_id in statement comparing identity", "decided_before_read": true}, "optional": false, "position": 1, "verified": "static reading 2026-09-17", "null_rule": {}}, "p_field_name": {"type": "text", "foreign": {"not_an_id": true}, "optional": false, "position": 3, "null_rule": {}}}, "declared_by": "0851_every_door_names_every_argument.sql"}, "contract_probe": null, "refusal_only": false}, {"id": "42ac1e94-d4bd-48c4-b3f6-362ade03c124", "schema_name": "public", "function_name": "udt_upsert_row", "identity_args": "p_table_id uuid, p_row_id uuid, p_data jsonb", "declared_by": "DD-169 batch 3 / B-75", "reason": "Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 1 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` \u2014 that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.", "declared_at": "2026-09-13T08:48:49.614866+00:00", "gate_predicate": "auth.uid()", "anonymous_callers": false, "anonymous_purpose": null, "signed_in_callers": false, "non_client_lane": "Closed to clients by the final switch (run 23e18314-8dd2-4553-832a-f954a8b7f8a3): the older tables moved to the new system, where every client writes now. The server (service_role) and the switch''s own undo still reach it; the undo opens it again exactly as it was.", "identity_argtypes": ["2950", "2950", "3802"], "probe_args": {"args": {"p_data": "literal:{}", "p_row_id": "other_row:workbench.udt_dataset_rows", "p_table_id": "other_row:workbench.udt_datasets"}, "note": "Writing a row into another organization user-defined table. The earlier note claimed workbench.udt_datasets held no row across the boundary; it holds 144 (corrected 2026-09-14, V-102 F2)."}, "argument_rules": {"version": 1, "arguments": {"p_data": {"type": "jsonb", "foreign": {"not_an_id": true}, "optional": true, "position": 3, "null_rule": {}, "sql_default": "NULL::jsonb"}, "p_row_id": {"type": "uuid", "check": "p_row_id in statement comparing identity", "foreign": {"note": "decision found by the static reading with helper closure: p_row_id in statement comparing identity", "decided_before_read": true}, "optional": true, "position": 2, "verified": "static reading 2026-09-17", "null_rule": {}, "sql_default": "NULL::uuid"}, "p_table_id": {"type": "uuid", "check": "p_table_id in statement comparing identity", "foreign": {"note": "decision found by the static reading with helper closure: p_table_id in statement comparing identity", "decided_before_read": true}, "optional": false, "position": 1, "verified": "static reading 2026-09-17", "null_rule": {}}}, "declared_by": "0851_every_door_names_every_argument.sql"}, "contract_probe": null, "refusal_only": false}, {"id": "a7c7c938-2033-4e02-b408-b4c63f022272", "schema_name": "public", "function_name": "update_data_row_in_user_table", "identity_args": "p_row_id uuid, p_data jsonb", "declared_by": "platform.final_switch_press (lane FINAL-SWITCH)", "reason": "An older-table write door, recorded here so no client may open it while the final switch is on.", "declared_at": "2026-10-01T19:57:04.742989+00:00", "gate_predicate": null, "anonymous_callers": false, "anonymous_purpose": null, "signed_in_callers": false, "non_client_lane": "Closed to clients by the final switch (run 23e18314-8dd2-4553-832a-f954a8b7f8a3): the older tables moved to the new system, where every client writes now. The server (service_role) and the switch''s own undo still reach it; the undo opens it again exactly as it was.", "identity_argtypes": ["2950", "3802"], "probe_args": null, "argument_rules": null, "contract_probe": null, "refusal_only": false}, {"id": "f51c06aa-d0bd-4039-83a9-e11ebe9080d9", "schema_name": "public", "function_name": "update_field_metadata", "identity_args": "p_field_id uuid, p_display_name text, p_is_required boolean, p_field_order integer, p_validation_rules jsonb", "declared_by": "platform.final_switch_press (lane FINAL-SWITCH)", "reason": "An older-table write door, recorded here so no client may open it while the final switch is on.", "declared_at": "2026-10-01T19:57:04.742989+00:00", "gate_predicate": null, "anonymous_callers": false, "anonymous_purpose": null, "signed_in_callers": false, "non_client_lane": "Closed to clients by the final switch (run 23e18314-8dd2-4553-832a-f954a8b7f8a3): the older tables moved to the new system, where every client writes now. The server (service_role) and the switch''s own undo still reach it; the undo opens it again exactly as it was.", "identity_argtypes": ["2950", "25", "16", "23", "3802"], "probe_args": null, "argument_rules": null, "contract_probe": null, "refusal_only": false}, {"id": "b7802ac5-cfbd-4b70-9653-d0d45c2be5fd", "schema_name": "public", "function_name": "update_user_table_config", "identity_args": "p_table_id uuid, p_table_updates jsonb, p_field_updates jsonb", "declared_by": "DD-169 batch 3 / B-75", "reason": "Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 1 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `workbench.udt_dataset_access` \u2014 that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.", "declared_at": "2026-09-13T08:48:49.614866+00:00", "gate_predicate": "workbench.udt_dataset_access", "anonymous_callers": false, "anonymous_purpose": null, "signed_in_callers": false, "non_client_lane": "Closed to clients by the final switch (run 23e18314-8dd2-4553-832a-f954a8b7f8a3): the older tables moved to the new system, where every client writes now. The server (service_role) and the switch''s own undo still reach it; the undo opens it again exactly as it was.", "identity_argtypes": ["2950", "3802", "3802"], "probe_args": {"args": {"p_table_id": "other_row:workbench.udt_datasets", "p_field_updates": "literal:[]", "p_table_updates": "literal:{}"}, "note": "Reconfiguring another organization user-defined table."}, "argument_rules": null, "contract_probe": null, "refusal_only": false}, {"id": "aa9a8ff4-5883-4751-9d1d-a2f9f663cb07", "schema_name": "public", "function_name": "update_user_table_default_sort", "identity_args": "p_table_id uuid, p_sort_field text, p_sort_direction text", "declared_by": "DD-169 batch 3 / B-75", "reason": "Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 2 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` \u2014 that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.", "declared_at": "2026-09-13T08:48:49.614866+00:00", "gate_predicate": "auth.uid()", "anonymous_callers": false, "anonymous_purpose": null, "signed_in_callers": false, "non_client_lane": "Closed to clients by the final switch (run 23e18314-8dd2-4553-832a-f954a8b7f8a3): the older tables moved to the new system, where every client writes now. The server (service_role) and the switch''s own undo still reach it; the undo opens it again exactly as it was.", "identity_argtypes": ["2950", "25", "25"], "probe_args": {"args": {"p_table_id": "other_row:workbench.udt_datasets", "p_sort_direction": "literal:asc"}, "note": "Changing another organization user-defined table default sort."}, "argument_rules": null, "contract_probe": null, "refusal_only": false}, {"id": "27130a1d-d4b4-4cf0-a849-46d05eab0e7f", "schema_name": "public", "function_name": "update_user_table_metadata", "identity_args": "p_table_id uuid, p_table_name text, p_description text, p_is_public boolean, p_authenticated_read boolean", "declared_by": "DD-169 batch 3 / B-75", "reason": "Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 4 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `workbench.udt_dataset_access` \u2014 that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.", "declared_at": "2026-09-13T08:48:49.614866+00:00", "gate_predicate": "workbench.udt_dataset_access", "anonymous_callers": false, "anonymous_purpose": null, "signed_in_callers": false, "non_client_lane": "Closed to clients by the final switch (run 23e18314-8dd2-4553-832a-f954a8b7f8a3): the older tables moved to the new system, where every client writes now. The server (service_role) and the switch''s own undo still reach it; the undo opens it again exactly as it was.", "identity_argtypes": ["2950", "25", "25", "16", "16"], "probe_args": {"args": {"p_table_id": "other_row:workbench.udt_datasets"}, "note": "Renaming another organization user-defined table, or flipping it public \u2014 the visibility arguments make this the most dangerous door of the family."}, "argument_rules": null, "contract_probe": null, "refusal_only": false}, {"id": "213c0b4b-1ee5-4845-8bb2-80a192d6b142", "schema_name": "public", "function_name": "update_user_table_row_ordering", "identity_args": "p_table_id uuid, p_enabled boolean, p_order jsonb, p_label_field text", "declared_by": "DD-169 / B-63", "reason": "SIGNED-IN door (authenticated only; anon revoked by this migration). Called only from signed-in surfaces (1 call site).", "declared_at": "2026-09-13T07:34:35.434514+00:00", "gate_predicate": null, "anonymous_callers": false, "anonymous_purpose": null, "signed_in_callers": false, "non_client_lane": "Closed to clients by the final switch (run 23e18314-8dd2-4553-832a-f954a8b7f8a3): the older tables moved to the new system, where every client writes now. The server (service_role) and the switch''s own undo still reach it; the undo opens it again exactly as it was.", "identity_argtypes": ["2950", "16", "3802", "25"], "probe_args": null, "argument_rules": null, "contract_probe": null, "refusal_only": false}]'::jsonb) x) s;
-- The public tombstone doors come back marked refusal_only = true (their bodies are one RAISE; the door guard
-- platform.door_body_must_decide refuses a re-inserted client lane over a body that decides nothing otherwise).


-- 6c. Re-issue the client grants now that the door rows exist again (the definer guard revokes a client grant
--     on an undeclared definer, and DD-223 lets a door row exist only after its function).
grant execute on function custom.table_copy_evaluation_state(uuid) to postgres;
grant execute on function custom.table_copy_evaluation_state(uuid) to authenticated;
grant execute on function custom.table_copy_evaluation_state(uuid) to service_role;
grant execute on function platform._final_switch_copy_again_state() to postgres;
grant execute on function platform._final_switch_copy_again_state() to service_role;
grant execute on function platform._final_switch_copy_again_state() to dashboard_user;
grant execute on function platform._final_switch_copy_again_state() to svc_seo;
grant execute on function platform._final_switch_old_write_doors() to postgres;
grant execute on function platform._final_switch_old_write_doors() to service_role;
grant execute on function platform._final_switch_old_write_doors() to dashboard_user;
grant execute on function platform._final_switch_old_write_doors() to svc_seo;
grant execute on function platform._final_switch_orphan_lists() to postgres;
grant execute on function platform._final_switch_orphan_lists() to service_role;
grant execute on function platform._final_switch_orphan_lists() to dashboard_user;
grant execute on function platform._final_switch_orphan_lists() to svc_seo;
grant execute on function platform._final_switch_person_refusal() to postgres;
grant execute on function platform._final_switch_person_refusal() to service_role;
grant execute on function platform._final_switch_person_refusal() to dashboard_user;
grant execute on function platform._final_switch_person_refusal() to svc_seo;
grant execute on function platform._final_switch_readiness() to postgres;
grant execute on function platform._final_switch_readiness() to service_role;
grant execute on function platform._final_switch_readiness() to dashboard_user;
grant execute on function platform._final_switch_readiness() to svc_seo;
grant execute on function platform._final_switch_record(text,text,text,text,jsonb,jsonb,text,uuid) to postgres;
grant execute on function platform._final_switch_record(text,text,text,text,jsonb,jsonb,text,uuid) to service_role;
grant execute on function platform._final_switch_record(text,text,text,text,jsonb,jsonb,text,uuid) to dashboard_user;
grant execute on function platform._final_switch_record(text,text,text,text,jsonb,jsonb,text,uuid) to svc_seo;
grant execute on function platform._final_switch_scopes(text,uuid,text,uuid[]) to postgres;
grant execute on function platform._final_switch_scopes(text,uuid,text,uuid[]) to service_role;
grant execute on function platform._final_switch_scopes(text,uuid,text,uuid[]) to dashboard_user;
grant execute on function platform._final_switch_scopes(text,uuid,text,uuid[]) to svc_seo;
grant execute on function platform._final_switch_scopes_code() to postgres;
grant execute on function platform._final_switch_scopes_code() to service_role;
grant execute on function platform._final_switch_scopes_code() to dashboard_user;
grant execute on function platform._final_switch_scopes_code() to svc_seo;
grant execute on function platform._final_switch_undo_retired_says(platform.cutover_seam_press) to postgres;
grant execute on function platform._final_switch_undo_retired_says(platform.cutover_seam_press) to service_role;
grant execute on function platform._final_switch_undo_retired_says(platform.cutover_seam_press) to dashboard_user;
grant execute on function platform._final_switch_undo_retired_says(platform.cutover_seam_press) to svc_seo;
grant execute on function platform.cutover_carry_removals(uuid,uuid[]) to postgres;
grant execute on function platform.cutover_carry_removals(uuid,uuid[]) to service_role;
grant execute on function platform.cutover_carry_removals(uuid,uuid[]) to dashboard_user;
grant execute on function platform.cutover_carry_removals(uuid,uuid[]) to svc_seo;
grant execute on function platform.final_switch_acting() to postgres;
grant execute on function platform.final_switch_acting() to authenticated;
grant execute on function platform.final_switch_acting() to service_role;
grant execute on function platform.final_switch_acting() to dashboard_user;
grant execute on function platform.final_switch_acting() to svc_seo;
grant execute on function platform.final_switch_adopt_orphan_lists(uuid) to postgres;
grant execute on function platform.final_switch_adopt_orphan_lists(uuid) to service_role;
grant execute on function platform.final_switch_adopt_orphan_lists(uuid) to dashboard_user;
grant execute on function platform.final_switch_adopt_orphan_lists(uuid) to svc_seo;
grant execute on function platform.final_switch_copy_again_record(uuid,text,uuid,boolean,jsonb) to postgres;
grant execute on function platform.final_switch_copy_again_record(uuid,text,uuid,boolean,jsonb) to service_role;
grant execute on function platform.final_switch_copy_again_record(uuid,text,uuid,boolean,jsonb) to dashboard_user;
grant execute on function platform.final_switch_copy_again_record(uuid,text,uuid,boolean,jsonb) to svc_seo;
grant execute on function platform.final_switch_press(text,jsonb) to postgres;
grant execute on function platform.final_switch_press(text,jsonb) to authenticated;
grant execute on function platform.final_switch_readiness() to postgres;
grant execute on function platform.final_switch_readiness() to authenticated;
grant execute on function platform.final_switch_retire_undo(text) to postgres;
grant execute on function platform.final_switch_retire_undo(text) to authenticated;
grant execute on function platform.final_switch_retire_undo(text) to service_role;
grant execute on function platform.final_switch_state() to postgres;
grant execute on function platform.final_switch_state() to authenticated;
grant execute on function platform.final_switch_undo(text,boolean) to postgres;
grant execute on function platform.final_switch_undo(text,boolean) to authenticated;
grant execute on function platform.unified_data_ramp_exit() to postgres;
grant execute on function platform.unified_data_ramp_exit() to service_role;
grant execute on function platform.unified_data_ramp_exit(uuid) to postgres;
grant execute on function platform.unified_data_ramp_exit(uuid) to authenticated;
grant execute on function platform.unified_data_ramp_gate(text,uuid) to postgres;
grant execute on function platform.unified_data_ramp_gate(text,uuid) to service_role;
grant execute on function platform.unified_data_ramp_set(text,uuid,boolean,uuid,text) to postgres;
grant execute on function platform.unified_data_ramp_set(text,uuid,boolean,uuid,text) to service_role;
grant execute on function platform.unified_data_ramp_set(text,uuid,boolean,uuid,text,uuid) to postgres;
grant execute on function platform.unified_data_ramp_set(text,uuid,boolean,uuid,text,uuid) to service_role;
grant execute on function platform.unified_data_ramp_state(uuid) to postgres;
grant execute on function platform.unified_data_ramp_state(uuid) to authenticated;
grant execute on function platform.unified_data_ramp_state(uuid) to service_role;
grant execute on function add_column_to_user_table(uuid,text,text,text,integer,boolean,jsonb,jsonb) to postgres;
grant execute on function add_column_to_user_table(uuid,text,text,text,integer,boolean,jsonb,jsonb) to service_role;
grant execute on function add_column_to_user_table(uuid,text,text,text,integer,boolean,jsonb,jsonb) to dashboard_user;
grant execute on function add_column_to_user_table(uuid,text,text,text,integer,boolean,jsonb,jsonb) to svc_seo;
grant execute on function add_data_row_to_user_table(uuid,jsonb) to postgres;
grant execute on function add_data_row_to_user_table(uuid,jsonb) to service_role;
grant execute on function append_rows_to_user_table(uuid,jsonb) to postgres;
grant execute on function append_rows_to_user_table(uuid,jsonb) to service_role;
grant execute on function append_rows_to_user_table(uuid,jsonb) to dashboard_user;
grant execute on function append_rows_to_user_table(uuid,jsonb) to svc_seo;
grant execute on function create_new_user_table_dynamic(text,text,boolean,uuid,jsonb) to postgres;
grant execute on function create_new_user_table_dynamic(text,text,boolean,uuid,jsonb) to service_role;
grant execute on function create_user_list(character varying,text,uuid,boolean,boolean,boolean,jsonb,uuid) to postgres;
grant execute on function create_user_list(character varying,text,uuid,boolean,boolean,boolean,jsonb,uuid) to authenticated;
grant execute on function create_user_list(character varying,text,uuid,boolean,boolean,boolean,jsonb,uuid) to service_role;
grant execute on function create_user_table_with_fields(text,text,boolean,uuid,uuid,uuid,jsonb) to postgres;
grant execute on function create_user_table_with_fields(text,text,boolean,uuid,uuid,uuid,jsonb) to service_role;
grant execute on function delete_data_row_from_user_table(uuid) to postgres;
grant execute on function delete_data_row_from_user_table(uuid) to service_role;
grant execute on function delete_data_row_from_user_table(uuid) to dashboard_user;
grant execute on function delete_data_row_from_user_table(uuid) to svc_seo;
grant execute on function delete_user_table(uuid) to postgres;
grant execute on function delete_user_table(uuid) to service_role;
grant execute on function delete_user_table(uuid) to dashboard_user;
grant execute on function delete_user_table(uuid) to svc_seo;
grant execute on function export_user_table_as_csv(uuid) to postgres;
grant execute on function export_user_table_as_csv(uuid) to authenticated;
grant execute on function export_user_table_as_csv(uuid) to service_role;
grant execute on function export_user_table_as_csv(uuid) to authenticator;
grant execute on function export_user_table_as_csv(uuid) to dashboard_user;
grant execute on function export_user_table_as_csv(uuid) to svc_seo;
grant execute on function export_user_table_as_csv(uuid) to cli_login_postgres;
grant execute on function export_user_table_as_csv(uuid) to matrx_provisioner;
grant execute on function export_user_table_as_csv(uuid,text,text) to postgres;
grant execute on function export_user_table_as_csv(uuid,text,text) to authenticated;
grant execute on function export_user_table_as_csv(uuid,text,text) to service_role;
grant execute on function export_user_table_as_csv(uuid,text,text) to authenticator;
grant execute on function export_user_table_as_csv(uuid,text,text) to dashboard_user;
grant execute on function export_user_table_as_csv(uuid,text,text) to svc_seo;
grant execute on function export_user_table_as_csv(uuid,text,text) to cli_login_postgres;
grant execute on function export_user_table_as_csv(uuid,text,text) to matrx_provisioner;
grant execute on function get_full_table(jsonb) to postgres;
grant execute on function get_full_table(jsonb) to authenticated;
grant execute on function get_full_table(jsonb) to service_role;
grant execute on function get_full_table(jsonb) to authenticator;
grant execute on function get_full_table(jsonb) to dashboard_user;
grant execute on function get_full_table(jsonb) to svc_seo;
grant execute on function get_full_table(jsonb) to cli_login_postgres;
grant execute on function get_full_table(jsonb) to matrx_provisioner;
grant execute on function get_table_cell(jsonb) to postgres;
grant execute on function get_table_cell(jsonb) to authenticated;
grant execute on function get_table_cell(jsonb) to service_role;
grant execute on function get_table_cell(jsonb) to authenticator;
grant execute on function get_table_cell(jsonb) to dashboard_user;
grant execute on function get_table_cell(jsonb) to svc_seo;
grant execute on function get_table_cell(jsonb) to cli_login_postgres;
grant execute on function get_table_cell(jsonb) to matrx_provisioner;
grant execute on function get_table_column(jsonb) to postgres;
grant execute on function get_table_column(jsonb) to authenticated;
grant execute on function get_table_column(jsonb) to service_role;
grant execute on function get_table_column(jsonb) to authenticator;
grant execute on function get_table_column(jsonb) to dashboard_user;
grant execute on function get_table_column(jsonb) to svc_seo;
grant execute on function get_table_column(jsonb) to cli_login_postgres;
grant execute on function get_table_column(jsonb) to matrx_provisioner;
grant execute on function get_table_row(jsonb) to postgres;
grant execute on function get_table_row(jsonb) to authenticated;
grant execute on function get_table_row(jsonb) to service_role;
grant execute on function get_table_row(jsonb) to authenticator;
grant execute on function get_table_row(jsonb) to dashboard_user;
grant execute on function get_table_row(jsonb) to svc_seo;
grant execute on function get_table_row(jsonb) to cli_login_postgres;
grant execute on function get_table_row(jsonb) to matrx_provisioner;
grant execute on function get_user_table_complete(uuid,text,text) to postgres;
grant execute on function get_user_table_complete(uuid,text,text) to authenticated;
grant execute on function get_user_table_complete(uuid,text,text) to service_role;
grant execute on function get_user_table_data_paginated(uuid,integer,integer,text,text,text) to postgres;
grant execute on function get_user_table_data_paginated(uuid,integer,integer,text,text,text) to authenticated;
grant execute on function get_user_table_data_paginated(uuid,integer,integer,text,text,text) to service_role;
grant execute on function get_user_table_data_paginated(uuid,integer,integer,text,text,text) to authenticator;
grant execute on function get_user_table_data_paginated(uuid,integer,integer,text,text,text) to dashboard_user;
grant execute on function get_user_table_data_paginated(uuid,integer,integer,text,text,text) to svc_seo;
grant execute on function get_user_table_data_paginated(uuid,integer,integer,text,text,text) to cli_login_postgres;
grant execute on function get_user_table_data_paginated(uuid,integer,integer,text,text,text) to matrx_provisioner;
grant execute on function get_user_table_data_paginated_v2(uuid,integer,integer,text,text,text) to postgres;
grant execute on function get_user_table_data_paginated_v2(uuid,integer,integer,text,text,text) to authenticated;
grant execute on function get_user_table_data_paginated_v2(uuid,integer,integer,text,text,text) to service_role;
grant execute on function get_user_table_data_paginated_v2(uuid,integer,integer,text,text,text) to authenticator;
grant execute on function get_user_table_data_paginated_v2(uuid,integer,integer,text,text,text) to dashboard_user;
grant execute on function get_user_table_data_paginated_v2(uuid,integer,integer,text,text,text) to svc_seo;
grant execute on function get_user_table_data_paginated_v2(uuid,integer,integer,text,text,text) to cli_login_postgres;
grant execute on function get_user_table_data_paginated_v2(uuid,integer,integer,text,text,text) to matrx_provisioner;
grant execute on function get_user_tables() to postgres;
grant execute on function get_user_tables() to authenticated;
grant execute on function get_user_tables() to service_role;
grant execute on function list_table_columns(jsonb) to postgres;
grant execute on function list_table_columns(jsonb) to authenticated;
grant execute on function list_table_columns(jsonb) to service_role;
grant execute on function list_table_columns(jsonb) to authenticator;
grant execute on function list_table_columns(jsonb) to dashboard_user;
grant execute on function list_table_columns(jsonb) to svc_seo;
grant execute on function list_table_columns(jsonb) to cli_login_postgres;
grant execute on function list_table_columns(jsonb) to matrx_provisioner;
grant execute on function list_table_rows(jsonb,integer,integer,text,text) to postgres;
grant execute on function list_table_rows(jsonb,integer,integer,text,text) to authenticated;
grant execute on function list_table_rows(jsonb,integer,integer,text,text) to service_role;
grant execute on function list_table_rows(jsonb,integer,integer,text,text) to authenticator;
grant execute on function list_table_rows(jsonb,integer,integer,text,text) to dashboard_user;
grant execute on function list_table_rows(jsonb,integer,integer,text,text) to svc_seo;
grant execute on function list_table_rows(jsonb,integer,integer,text,text) to cli_login_postgres;
grant execute on function list_table_rows(jsonb,integer,integer,text,text) to matrx_provisioner;
grant execute on function udt_backfill_autonumber(uuid,uuid) to postgres;
grant execute on function udt_backfill_autonumber(uuid,uuid) to service_role;
grant execute on function udt_bulk_write(uuid,jsonb) to postgres;
grant execute on function udt_bulk_write(uuid,jsonb) to service_role;
grant execute on function udt_change_field_type(uuid,uuid,field_data_type,text) to postgres;
grant execute on function udt_change_field_type(uuid,uuid,field_data_type,text) to service_role;
grant execute on function udt_column_facets(uuid,text,integer,text) to postgres;
grant execute on function udt_column_facets(uuid,text,integer,text) to authenticated;
grant execute on function udt_column_facets(uuid,text,integer,text) to service_role;
grant execute on function udt_column_facets(uuid,text,integer,text) to authenticator;
grant execute on function udt_column_facets(uuid,text,integer,text) to dashboard_user;
grant execute on function udt_column_facets(uuid,text,integer,text) to svc_seo;
grant execute on function udt_column_facets(uuid,text,integer,text) to cli_login_postgres;
grant execute on function udt_column_facets(uuid,text,integer,text) to matrx_provisioner;
grant execute on function udt_delete_field(uuid,uuid) to postgres;
grant execute on function udt_delete_field(uuid,uuid) to service_role;
grant execute on function udt_list_example_tables() to postgres;
grant execute on function udt_list_example_tables() to authenticated;
grant execute on function udt_list_example_tables() to service_role;
grant execute on function udt_list_example_tables() to dashboard_user;
grant execute on function udt_list_example_tables() to svc_seo;
grant execute on function udt_set_field_format(uuid,uuid,jsonb) to postgres;
grant execute on function udt_set_field_format(uuid,uuid,jsonb) to service_role;
grant execute on function udt_set_table_row_actions(uuid,jsonb) to postgres;
grant execute on function udt_set_table_row_actions(uuid,jsonb) to service_role;
grant execute on function udt_set_table_row_label(uuid,jsonb) to postgres;
grant execute on function udt_set_table_row_label(uuid,jsonb) to service_role;
grant execute on function udt_set_table_style(uuid,text[],jsonb) to postgres;
grant execute on function udt_set_table_style(uuid,text[],jsonb) to service_role;
grant execute on function udt_table_profile(uuid,integer) to postgres;
grant execute on function udt_table_profile(uuid,integer) to authenticated;
grant execute on function udt_table_profile(uuid,integer) to service_role;
grant execute on function udt_table_profile(uuid,integer) to authenticator;
grant execute on function udt_table_profile(uuid,integer) to dashboard_user;
grant execute on function udt_table_profile(uuid,integer) to svc_seo;
grant execute on function udt_table_profile(uuid,integer) to cli_login_postgres;
grant execute on function udt_table_profile(uuid,integer) to matrx_provisioner;
grant execute on function udt_upsert_cell(uuid,uuid,text,jsonb) to postgres;
grant execute on function udt_upsert_cell(uuid,uuid,text,jsonb) to service_role;
grant execute on function udt_upsert_row(uuid,uuid,jsonb) to postgres;
grant execute on function udt_upsert_row(uuid,uuid,jsonb) to service_role;
grant execute on function udt_validate_row(uuid,jsonb,jsonb) to postgres;
grant execute on function udt_validate_row(uuid,jsonb,jsonb) to authenticated;
grant execute on function udt_validate_row(uuid,jsonb,jsonb) to service_role;
grant execute on function update_data_row_in_user_table(uuid,jsonb) to postgres;
grant execute on function update_data_row_in_user_table(uuid,jsonb) to service_role;
grant execute on function update_data_row_in_user_table(uuid,jsonb) to dashboard_user;
grant execute on function update_data_row_in_user_table(uuid,jsonb) to svc_seo;
grant execute on function update_field_metadata(uuid,text,boolean,integer,jsonb) to postgres;
grant execute on function update_field_metadata(uuid,text,boolean,integer,jsonb) to service_role;
grant execute on function update_field_metadata(uuid,text,boolean,integer,jsonb) to dashboard_user;
grant execute on function update_field_metadata(uuid,text,boolean,integer,jsonb) to svc_seo;
grant execute on function update_user_table_config(uuid,jsonb,jsonb) to postgres;
grant execute on function update_user_table_config(uuid,jsonb,jsonb) to service_role;
grant execute on function update_user_table_default_sort(uuid,text,text) to postgres;
grant execute on function update_user_table_default_sort(uuid,text,text) to service_role;
grant execute on function update_user_table_metadata(uuid,text,text,boolean,boolean) to postgres;
grant execute on function update_user_table_metadata(uuid,text,text,boolean,boolean) to service_role;
grant execute on function update_user_table_row_ordering(uuid,boolean,jsonb,text) to postgres;
grant execute on function update_user_table_row_ordering(uuid,boolean,jsonb,text) to service_role;
grant execute on function workbench._moved_older_table_restores_with_switch_back() to public;
grant execute on function workbench._moved_older_table_restores_with_switch_back() to postgres;


-- 4. the switch-back restore trigger, as it was (DISABLED).
-- Only when 4-LAST was applied (the trigger is gone); after the main transaction alone it still exists.
do $inv$ begin
  if not exists (select 1 from pg_trigger where tgrelid = 'deprecated.udt_datasets'::regclass
                  and tgname = '_moved_older_table_restores_with_switch_back') then
    CREATE TRIGGER _moved_older_table_restores_with_switch_back BEFORE UPDATE OF deleted_at ON deprecated.udt_datasets FOR EACH ROW WHEN (((old.deleted_at IS NOT NULL) AND (new.deleted_at IS NULL))) EXECUTE FUNCTION workbench._moved_older_table_restores_with_switch_back();
    alter table deprecated.udt_datasets disable trigger _moved_older_table_restores_with_switch_back;
  end if;
end $inv$;

-- 1. the 10 gated walls, production bodies of 2026-10-03 (gate included).
-- custom._field_write_door()
CREATE OR REPLACE FUNCTION custom._field_write_door()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me    uuid := auth.uid();
  v_level public.permission_level;
  v_key   text;
  v_field custom.record;
  v_old   jsonb := coalesce(case when tg_op = 'UPDATE' then old.data end, '{}'::jsonb);
begin
  -- THE FINAL SWITCH NEVER DEPENDS ON WHO PRESSED IT (PRESS-FENCE C): platform.final_switch_acting().
  if platform.final_switch_acting() then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  -- WHO THIS SKIPS, AND WHY IT IS NOT THE ROLE. Every write door into this store is
  -- SECURITY DEFINER and every server lane runs as the role that OWNS custom.record, so a
  -- role test here would skip the only write path that exists and DOOR-3 would be a law
  -- nothing ever enforced. What matters is whether a PERSON is being acted for: when the
  -- request carries one, that person's field-level security binds the write, whichever
  -- door and whichever role it arrived through. A write carrying no person at all is the
  -- store's own housekeeping and has no field-level answer to give.
  if v_me is null then
    return new;
  end if;
  if new.table_id is null or new.table_id = custom.field_kernel_id() then
    return new;
  end if;

  -- CREATING is not editing somebody else's field. `platform._stamp_actor` has already run
  -- (it sorts ahead of this trigger), so `created_by` is the person, and VIS-25 makes the
  -- creator the owner and therefore the top level on what they just made. Without this arm
  -- nobody could ever write a confidential field's first value, including its author — and
  -- it is also why the ladder below is only ever asked about a row that already exists.
  if tg_op = 'INSERT' and new.created_by = v_me then
    return new;
  end if;

  -- THE ONE LADDER'S LEVEL FORM. This used to be `iam.effective_level`, which is arm 2 of
  -- the one function rather than the one function: it cannot see the store's own carrying,
  -- so a person admitted to this record THROUGH its Table was masked out of every field on
  -- it. `custom.effective_level` is the same question the read door asks, so the fields a
  -- person may change are decided on the ladder that decided they may be here at all.
  v_level := custom.effective_level(v_me, new.organization_id, new.id, 'record');

  for v_key in
    select e.key from jsonb_each(coalesce(new.data, '{}'::jsonb)) e
     where left(e.key, 1) <> '_'
       and (v_old -> e.key) is distinct from e.value
  loop
    select f.* into v_field
      from custom.record f
     where f.organization_id = new.organization_id
       and f.table_id = custom.field_kernel_id()
       and f.deleted_at is null
       and (f.data ->> 'entity_definition_id')::uuid = new.table_id
       and f.data ->> 'key' = v_key;
    if not found then continue; end if;

    if not iam.may_touch_field(v_me, v_field.id, new.organization_id, v_level, 'edit') then
      raise exception 'You can see this record, but "%" is not yours to change.',
                      coalesce(v_field.data ->> 'label', v_key)
        using errcode = '42501',
              hint = 'DOOR-3: the store refuses an edit to a field you may not edit, whichever door you came through. '
                     || 'It would take ' || iam.level_label('record',
                          iam.field_sensitivity_level(v_field.data ->> 'sensitivity', 'edit', new.organization_id))
                     || ', or a share of this one field with you.';
    end if;
  end loop;
  return new;
end;
$function$
;
alter function custom._field_write_door() owner to postgres;
revoke all on function custom._field_write_door() from public, anon, authenticated, service_role;
grant execute on function custom._field_write_door() to postgres;
comment on function custom._field_write_door() is NULL;

-- custom._record_rule_uses()
CREATE OR REPLACE FUNCTION custom._record_rule_uses()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_type_field text;
  v_rtype      text;
  r            custom.record;
  v_run        jsonb;
  v_truth      boolean;
  v_key        text;
  v_computed   jsonb := '{}'::jsonb;
  v_prior      jsonb;
  v_retired    jsonb;
  v_stale      text;
  v_ctx        jsonb;
  v_me         uuid;
  v_level      public.permission_level;
  v_validate   custom.record[];
  v_fail       text;
  v_enforce    text;
  v_warned     jsonb := '[]'::jsonb;
  v_compute    custom.record[];
begin
  perform custom.assert_store_door(new.organization_id, 'custom.record');

  if new.data_class in ('kernel', 'relation')
     or new.table_id is null
     or new.table_id = custom.table_kernel_id()
     or new.table_id = custom.field_kernel_id()
     or new.table_id = custom.rule_kernel_id()
     or new.table_id = custom.merge_field_kernel_id() then
    return new;
  end if;

  v_type_field := custom.table_type_field(new.organization_id, new.table_id);
  if v_type_field is not null then
    v_rtype := new.data ->> v_type_field;
  end if;

  -- ── THE RULES THIS TABLE HAS, READ ONCE, BEFORE ANYTHING IS WORKED OUT FOR THEM. ──
  -- WRITE-PERF-2: exactly the two `custom.table_rules` calls this function always made, taken
  -- here so the answer can be looked at before the context below is built.
  select coalesce(array_agg(t), '{}'::custom.record[]) into v_validate
    from custom.table_rules(new.organization_id, new.table_id, 'validate', v_rtype) t;
  select coalesce(array_agg(t), '{}'::custom.record[]) into v_compute
    from custom.table_rules(new.organization_id, new.table_id, 'compute', v_rtype) t;

  -- ── PIPELINES: THE CONTEXT. ─────────────────────────────────────────────────────────
  -- What this write is replacing, what it is about, and who is making it. A Rule asks for
  -- these by name (`previous`, `stage_count`, `actor_at_least`) or never sees them.
  --
  -- 🚨 WRITE-PERF-2 (2026-09-20), MEASURED: `custom.effective_level` costs 16.77 ms A CALL on
  -- the main database — it halves the rung ladder with `custom.has_visibility`, which walks
  -- `platform.associations` — and this trigger called it ONCE PER ROW WRITTEN, on every table
  -- in the platform, whether or not any Rule existed to read the answer. On a 200-row insert
  -- that was 3,827 ms of the 7,313 ms the whole write cost: 19.1 ms of 36.6 ms PER ROW, more
  -- than every other trigger on `custom.record` put together, spent working out a number that
  -- `v_ctx` then handed to nobody. `v_ctx` is read in exactly one place — the `custom.rule_run`
  -- calls in the two loops below — so when this Table has no validate and no compute Rule it
  -- is never read at all. It is now built only when there is a Rule that can ask for it. A
  -- Table WITH rules pays exactly what it paid before, to the microsecond.
  if coalesce(array_length(v_validate, 1), 0) > 0 or coalesce(array_length(v_compute, 1), 0) > 0 then
    v_me := custom.query_principal();
    -- PRESS-FENCE C: during the final switch's own run the rules are judged as a server write (no person).
    if v_me is not null and not platform.final_switch_acting() then
      v_level := custom.effective_level(v_me, new.organization_id,
                                        case when tg_op = 'UPDATE' then new.id else new.table_id end,
                                        case when tg_op = 'UPDATE' then 'record' else 'table' end);
    end if;
    v_ctx := jsonb_build_object(
               'previous_values', case when tg_op = 'UPDATE' then old.data else 'null'::jsonb end,
               'record_id',       to_jsonb(new.id),
               'table_id',        to_jsonb(new.table_id),
               'actor_level',     to_jsonb(v_level));
  end if;

  -- ── USE 1: VALIDATE. A `false` answer refuses the write, naming the Rule. ──────────
  foreach r in array v_validate loop
    v_run   := custom.rule_run(new.organization_id, r.id, new.data, v_ctx);
    v_truth := custom.rule_truth(v_run -> 'answer');
    if v_truth is false then
      -- ── STAGE-RULES: WHAT A GATE DOES WHEN IT SAYS NO. ──────────────────────────────
      -- A Rule carries its own answer (`on_fail`); the organization carries the one knob
      -- that can soften a plain refusal into a warning. BOTH ARE READ ONLY AFTER A RULE HAS
      -- ACTUALLY FAILED, so a table whose rules all pass pays nothing for either — the same
      -- discipline WRITE-PERF-2 measured the context under.
      v_fail := lower(coalesce(nullif(r.data ->> 'on_fail', ''), 'refuse'));

      -- AN APPROVED EXCEPTION IS NOT A SECOND REFUSAL. `custom.work_approval_decide` names
      -- the record it is applying an approved change to, for the length of that one write;
      -- the gate that ASKED for the approval steps aside for exactly that write and for
      -- nothing else. Every plain refusal, every other validator and the whole value
      -- envelope still run, so an approver is never told yes over a write the store refuses.
      if v_fail = 'require_approval'
         and nullif(current_setting('custom.applying_approval_for', true), '') = new.id::text then
        continue;
      end if;

      if v_fail = 'require_approval' then
        raise exception '%', coalesce(nullif(r.data ->> 'message', ''), r.data ->> 'name')
          using errcode = 'PT428',
                detail = jsonb_build_object(
                           'rule_id',      r.id,
                           'rule',         r.data ->> 'name',
                           'rule_version', v_run -> 'rule_version',
                           'on_fail',      'require_approval',
                           'why',          coalesce(nullif(r.data ->> 'message', ''), r.data ->> 'name'))::text,
                hint = 'STAGE-RULES: this gate hands the change to the approvals queue instead of refusing it. custom.pipeline_move files the request and leaves the record where it is, and the card says it is waiting. A write that reaches this rule by another route is refused here rather than being let through unasked.';
      end if;

      -- THE ONE KNOB. Default `refuse`; an organization that would rather be told than
      -- stopped sets `warn`. It never softens `require_approval` — "ask somebody" and
      -- "carry on with a note" are different answers, and quietly turning one into the
      -- other is how an approval queue becomes decoration.
      v_enforce := custom.stage_rule_enforcement(new.organization_id);
      if v_enforce = 'warn' then
        v_warned := v_warned || jsonb_build_object(
          'rule_id',     r.id,
          'rule',        r.data ->> 'name',
          'why',         coalesce(nullif(r.data ->> 'message', ''), r.data ->> 'name'),
          'what_to_do',  'This organization asks to be warned instead of stopped. Set its "Stage rules" setting back to Refuse to have a write like this one refused.');
        continue;
      end if;

      raise exception '%', coalesce(nullif(r.data ->> 'message', ''), r.data ->> 'name')
        using errcode = '23514',
              hint = format('REC-15: the rule "%s" (version %s) is not satisfied by this record.',
                            r.data ->> 'name', v_run ->> 'rule_version');
    end if;
  end loop;

  -- NOTHING FAILS SILENTLY. A gate the organization's own knob overruled is carried OUT of
  -- the write in a transaction-local setting, so the door that made the write hands the
  -- sentence back to the person who made it. A write with nothing to say clears the setting
  -- rather than leaving the last write's warning lying about for the next one to find.
  perform set_config('custom.stage_rule_warnings',
                     case when v_warned = '[]'::jsonb then '' else v_warned::text end, true);

  -- ── USE 2: COMPUTE. ────────────────────────────────────────────────────────────────
  foreach r in array v_compute loop
    v_key := custom.rule_field_key(new.organization_id, (r.data ->> 'target_field_id')::uuid);
    if v_key is null then
      raise exception 'the rule % works out a field that is not there any more', r.data ->> 'name'
        using errcode = '23503',
              hint = 'REC-18: deleting a Field a Rule depends on is refused naming the Rule (W3-MIG). This is what the compute use says when it happens anyway.';
    end if;
    v_run := custom.rule_run(new.organization_id, r.id, new.data, v_ctx);
    v_computed := v_computed || jsonb_build_object(v_key, jsonb_build_object(
      'value',        v_run -> 'answer',
      'field_id',     r.data ->> 'target_field_id',
      'rule_id',      v_run ->> 'rule_id',
      'rule_version', (v_run -> 'rule_version'),
      'at',           to_jsonb(now())));
  end loop;

  if jsonb_typeof(new.data -> '_computed') = 'object' then
    v_prior := case when tg_op = 'UPDATE' then coalesce(old.data -> '_computed', '{}'::jsonb)
                    else '{}'::jsonb end;
    for v_stale in
      select k from jsonb_object_keys(new.data -> '_computed') k where not (v_computed ? k)
    loop
      if (v_prior -> v_stale) is distinct from (new.data -> '_computed' -> v_stale) then
        raise exception 'this record carries a worked-out answer for % that no rule works out', v_stale
          using errcode = '23514',
                hint = 'REC-15 / FLD-9: a worked-out answer belongs to the Rule that works it out, and it carries that Rule''s id and version. A value written here by hand would be served as if the system had worked it out.';
      end if;
      v_retired := coalesce(new.data -> '_retired', '[]'::jsonb) || jsonb_build_object(
        'key',    v_stale,
        'label',  coalesce(custom.rule_field_label(new.organization_id,
                             (v_prior -> v_stale ->> 'field_id')::uuid), v_stale),
        'value',  v_prior -> v_stale -> 'value',
        'reason', format('this record changed, and nothing works out %s for it any more',
                         coalesce(custom.rule_field_label(new.organization_id,
                                    (v_prior -> v_stale ->> 'field_id')::uuid), v_stale)),
        'rule_id',      v_prior -> v_stale -> 'rule_id',
        'rule_version', v_prior -> v_stale -> 'rule_version',
        'at',     to_jsonb(now()));
      new.data := jsonb_set(new.data, '{_retired}', v_retired);
    end loop;
  end if;

  if v_computed = '{}'::jsonb then
    new.data := new.data - '_computed';
  else
    new.data := jsonb_set(new.data, '{_computed}', v_computed);
  end if;

  return new;
end;
$function$
;
alter function custom._record_rule_uses() owner to postgres;
revoke all on function custom._record_rule_uses() from public, anon, authenticated, service_role;
grant execute on function custom._record_rule_uses() to postgres;
comment on function custom._record_rule_uses() is 'REC-15 and REC-19 on the store: every write of a record asks the Rules of its Table, in declared order, for the two uses this lane wires. VALIDATE refuses the write in the Rule''s own words. COMPUTE writes the answer into data -> _computed -> <field key> WITH the rule id and THE VERSION THAT PRODUCED IT — a STAND-IN for History, announced here with W3-HIST as the remedy, which stamps its row from these keys. FLD-10''s type field selects which Rules apply exactly as it selects which Fields do.';

-- custom.assert_client_may_change(uuid,uuid,text,permission_level,text)
CREATE OR REPLACE FUNCTION custom.assert_client_may_change(p_organization_id uuid, p_subject_id uuid, p_door text, p_required permission_level DEFAULT 'editor'::permission_level, p_subject_word text DEFAULT 'record'::text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me          uuid;
  v_subject_org uuid;
  v_held        public.permission_level;
begin
  -- THE FINAL SWITCH NEVER DEPENDS ON WHO PRESSED IT (PRESS-FENCE C): platform.final_switch_acting().
  if platform.final_switch_acting() then
    return;
  end if;
  -- ONE order, always: the organization wall first, then the row.
  perform custom.assert_client_may_reach(p_organization_id, p_door);

  -- Way through 1: the role that owns the store (every campaign and server lane).
  if custom.query_is_store_owner() then
    return;
  end if;

  if p_subject_id is null then
    return;
  end if;

  -- Way through 2: no signed-in person at all — the anonymous capture door, which has
  -- already decided this write against the form's own token.
  v_me := custom.query_principal();
  if v_me is null then
    return;
  end if;

  -- WHERE THE SUBJECT ACTUALLY LIVES, BY ITS ID AND NOTHING ELSE (2026-09-23). A subject
  -- outside p_organization_id used to be waved through on the promise that the door would
  -- filter by that organization; the same promise was broken on the read side
  -- (`custom.record_as_of`, a cross-organization leak proven live). Access is decided by the
  -- PERSON and the ROW (organization-is-the-container rule 5).
  select r.organization_id into v_subject_org
    from custom.record r
   where r.id = p_subject_id;

  -- Not there at all: the door raises its own 02000 a line later.
  if v_subject_org is null then
    return;
  end if;

  -- The globally readable platform tenant's kernel Tables: unchanged — the door decides.
  if v_subject_org is distinct from p_organization_id
     and exists (select 1 from iam.system_orgs s
                  where s.organization_id = v_subject_org and s.global_readable) then
    return;
  end if;

  if custom.has_visibility(v_me, 'record', p_subject_id, p_required) then
    return;
  end if;

  -- THE REFUSAL NAMES THE RUNG HELD, NOT ONLY THE RUNG NEEDED (lane TAILS, 2026-09-21).
  v_held := custom.effective_level(v_me, v_subject_org, p_subject_id, 'record');

  if v_held is null then
    raise exception 'You do not have access to this %, so % may not write to it.',
      coalesce(nullif(btrim(p_subject_word), ''), 'record'),
      coalesce(nullif(btrim(p_door), ''), 'that door')
      using errcode = '42501',
            hint = format(
              'DOOR-1 decides reading and writing with the SAME question: a %s you may not open is a %s you may not change. This needs the %s level (viewer < commenter < editor < admin) - ask whoever holds it to share it with you, or ask an owner of this organization. Being a member of the organization is not by itself permission to rewrite somebody else''s row.',
              coalesce(nullif(btrim(p_subject_word), ''), 'record'),
              coalesce(nullif(btrim(p_subject_word), ''), 'record'),
              p_required);
  end if;

  raise exception 'You hold the % level on this %, and % needs the % level.',
    v_held,
    coalesce(nullif(btrim(p_subject_word), ''), 'record'),
    coalesce(nullif(btrim(p_door), ''), 'that door'),
    p_required
    using errcode = '42501',
          hint = format(
            'DOOR-1 decides reading and writing with the SAME question, on ONE ladder: viewer < commenter < editor < admin. You hold %s on this %s and %s needs the %s level, so ask an admin of this %s - or an owner of this organization - to raise your level. Being a member of the organization is not by itself permission to rewrite somebody else''s row.',
            v_held,
            coalesce(nullif(btrim(p_subject_word), ''), 'record'),
            coalesce(nullif(btrim(p_door), ''), 'that door'),
            p_required,
            coalesce(nullif(btrim(p_subject_word), ''), 'record'));
end
$function$
;
alter function custom.assert_client_may_change(uuid,uuid,text,permission_level,text) owner to postgres;
revoke all on function custom.assert_client_may_change(uuid,uuid,text,permission_level,text) from public, anon, authenticated, service_role;
grant execute on function custom.assert_client_may_change(uuid,uuid,text,permission_level,text) to postgres;
comment on function custom.assert_client_may_change(uuid,uuid,text,permission_level,text) is NULL;

-- custom.assert_client_may_open(uuid,uuid,text,permission_level,text)
CREATE OR REPLACE FUNCTION custom.assert_client_may_open(p_organization_id uuid, p_subject_id uuid, p_door text, p_required permission_level DEFAULT 'viewer'::permission_level, p_subject_word text DEFAULT 'record'::text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me          uuid;
  v_subject_org uuid;
begin
  -- ONE order, always, and it is `custom.assert_client_may_change`'s order: the
  -- organization wall first, then the row.
  -- THE FINAL SWITCH NEVER DEPENDS ON WHO PRESSED IT (PRESS-FENCE B). While platform.final_switch_press or
  -- platform.final_switch_undo runs (app.final_switch_step = 'on', transaction-local, set and cleared only
  -- by them; set_config is no client door), a platform administrator on the admin lane passes this wall for
  -- every organization: the press is platform-wide, so the presser's own memberships never decide it.
  if platform.final_switch_acting() then
    return;
  end if;
  perform custom.assert_client_may_reach(p_organization_id, p_door);

  -- Way through 1: the role that owns the store (every campaign and server lane).
  if custom.query_is_store_owner() then
    return;
  end if;

  if p_subject_id is null then
    return;
  end if;

  -- Way through 2: no signed-in person at all — the anonymous doors, which have
  -- already decided the request against the form's own token.
  v_me := custom.query_principal();
  if v_me is null then
    return;
  end if;

  -- WHERE THE SUBJECT ACTUALLY LIVES, BY ITS ID AND NOTHING ELSE (2026-09-23).
  -- This used to look only inside p_organization_id and RETURN — let the call through —
  -- when the subject was elsewhere, trusting every door to filter by that organization a
  -- line later. Sixteen doors never did: `custom.record_as_of` handed a member of one
  -- organization the full, unmasked state of a record in an organization she does not
  -- belong to (proven live 2026-09-23 as test@test.com, rolled back). Access is a question
  -- about the PERSON and the ROW, never about which organization was passed in
  -- (organization-is-the-container rule 5).
  select r.organization_id into v_subject_org
    from custom.record r
   where r.id = p_subject_id;

  -- Not there at all: the door raises its own 02000, the same for an invented id.
  if v_subject_org is null then
    return;
  end if;

  -- The platform's globally readable tenants (the Matrx System kernel Tables every
  -- organization builds on) stay reachable exactly as before.
  if v_subject_org is distinct from p_organization_id
     and exists (select 1 from iam.system_orgs s
                  where s.organization_id = v_subject_org and s.global_readable) then
    return;
  end if;

  -- THE ONE LADDER, asked about the row wherever it lives.
  if custom.has_visibility(v_me, 'record', p_subject_id, p_required) then
    return;
  end if;

  raise exception 'You do not have access to this %, so % has nothing to show you.',
    coalesce(nullif(btrim(p_subject_word), ''), 'record'),
    coalesce(nullif(btrim(p_door), ''), 'that door')
    using errcode = '42501',
          hint = format(
            'DOOR-1 decides reading and writing with the SAME question: a %s you may not open is a %s you may not change. This needs the %s level (viewer < commenter < editor < admin) - ask whoever holds it to share it with you, or ask an owner of this organization.',
            coalesce(nullif(btrim(p_subject_word), ''), 'record'),
            coalesce(nullif(btrim(p_subject_word), ''), 'record'),
            p_required);
end;
$function$
;
alter function custom.assert_client_may_open(uuid,uuid,text,permission_level,text) owner to postgres;
revoke all on function custom.assert_client_may_open(uuid,uuid,text,permission_level,text) from public, anon, authenticated, service_role;
grant execute on function custom.assert_client_may_open(uuid,uuid,text,permission_level,text) to postgres;
comment on function custom.assert_client_may_open(uuid,uuid,text,permission_level,text) is NULL;

-- custom.assert_client_may_reach(uuid,text)
CREATE OR REPLACE FUNCTION custom.assert_client_may_reach(p_organization_id uuid, p_door text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_owner oid;
  v_who   name;
  v_memo  text := 'w:r:' || coalesce(p_organization_id::text, '-');
begin
  -- THE SAME YES, ALREADY GIVEN IN THIS TRANSACTION, TO THIS SEAT, ABOUT THIS ORGANIZATION.
  if platform.memo_k_get(v_memo) = '1' then
    return;
  end if;
  -- THE FINAL SWITCH NEVER DEPENDS ON WHO PRESSED IT (PRESS-FENCE B). While platform.final_switch_press or
  -- platform.final_switch_undo runs (app.final_switch_step = 'on', transaction-local, set and cleared only
  -- by them; set_config is no client door), a platform administrator on the admin lane passes this wall for
  -- every organization: the press is platform-wide, so the presser's own memberships never decide it.
  if platform.final_switch_acting() then
    return;
  end if;
  -- A PLATFORM CONTEXT READ IN PROGRESS (lane SCOPES-READS-ACCESS; chair ruling 2026-09-29 (1)). custom.context_scopes
  -- sets this for the length of ONE read of ONE platform context Table (custom.table_is_platform_context — a context
  -- Table of a global-readable system organization) the one ladder already lets the caller see, and clears it after;
  -- no client can set it (set_config is no client door). It admits nothing else: no memo is written, and every other
  -- door, Table and organization meets this wall as before.
  if nullif(current_setting('mx.platform_context_org', true), '') = p_organization_id::text then
    return;
  end if;
  v_who := custom.caller_role();

  -- The campaign's own lanes run as the role that owns the store. Read the owner from the
  -- catalogue, never as a role literal (rule 15), so this cannot drift from the table.
  select c.relowner into v_owner from pg_class c where c.oid = 'custom.record'::regclass;
  if pg_has_role(v_who, v_owner, 'member') then
    perform platform.memo_k_put(v_memo, '1');
    return;
  end if;

  if p_organization_id is null then
    raise exception 'custom: % was called without an organization, and the store is keyed (organization_id, id).',
      coalesce(nullif(btrim(p_door), ''), 'that door')
      using errcode = '22004',
            hint = 'Name the organization you are working in. A door that took null would be a door onto every organization at once.';
  end if;

  if iam.has_org_access(p_organization_id) then
    perform platform.memo_k_put(v_memo, '1');
    return;
  end if;

  -- VIS-31 / PORTAL (2026-09-20). A live portal principal of THIS organization may reach its
  -- doors. Not because she is a member — she is not, and nothing here says she is — but
  -- because the organization named her, through a portal, as somebody whose own records live
  -- here. The next line of every door is the ladder, and she holds exactly one grant.
  --
  -- ONE SENTENCE, ONE PLACE (lane SC-3', 2026-09-24). `custom.portal_admits` reads
  -- `custom/external_principal_enabled` itself for its portal and shared-table arms, so asking
  -- the knob here as well was a second copy of the same condition — and it is what kept a
  -- class student out: portal_admits' scope-membership arm is deliberately outside that knob.
  -- For every person the first two arms admit, this answer is unchanged.
  if custom.portal_admits(p_organization_id) then
    perform platform.memo_k_put(v_memo, '1');
    return;
  end if;

  raise exception 'You are not a member of that organization, so % has nothing to do there.',
    coalesce(nullif(btrim(p_door), ''), 'that door')
    using errcode = '42501',
          hint = 'REC-29 / T15: organizations are hard walls, and a door decides who may reach one before it decides anything else. Switch to an organization you belong to, or ask an owner of that one to add you.';
end $function$
;
alter function custom.assert_client_may_reach(uuid,text) owner to postgres;
revoke all on function custom.assert_client_may_reach(uuid,text) from public, anon, authenticated, service_role;
grant execute on function custom.assert_client_may_reach(uuid,text) to postgres;
comment on function custom.assert_client_may_reach(uuid,text) is 'W4-DOOR: the one membership decision every client-callable door in schema custom makes before its first read or write. The role that owns custom.record passes (the server lanes); everybody else must reach the organization through iam.has_org_access for auth.uid(). SECURITY DEFINER doors do not apply RLS, so without this a signed-in caller could name any organization id.';

-- custom.assert_may_know_table(uuid,uuid,text)
CREATE OR REPLACE FUNCTION custom.assert_may_know_table(p_organization_id uuid, p_table_id uuid, p_door text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me   uuid;
  v_pred text;
  v_any  boolean := false;
  v_memo text := 'w:k:' || coalesce(p_organization_id::text, '-') || ':' || coalesce(p_table_id::text, '-');
begin
  -- THE SAME YES, ALREADY GIVEN IN THIS TRANSACTION, TO THIS SEAT, ABOUT THIS TABLE. The wall
  -- below is part of that yes: this memo entry is only ever written after it has been passed.
  if platform.memo_k_get(v_memo) = '1' then
    return;
  end if;
  -- THE FINAL SWITCH NEVER DEPENDS ON WHO PRESSED IT (PRESS-FENCE B). While platform.final_switch_press or
  -- platform.final_switch_undo runs (app.final_switch_step = 'on', transaction-local, set and cleared only
  -- by them; set_config is no client door), a platform administrator on the admin lane passes this wall for
  -- every organization: the press is platform-wide, so the presser's own memberships never decide it.
  if platform.final_switch_acting() then
    return;
  end if;

  -- The wall first, always, and in the same order every other door asks it.
  perform custom.assert_client_may_reach(p_organization_id, p_door);

  -- WAY THROUGH 1: the Table record itself. Unchanged — this is the whole of what this
  -- function used to be, and it is still the answer under the shipped setting.
  if custom.query_is_store_owner() then
    perform platform.memo_k_put(v_memo, '1');
    return;
  end if;
  v_me := custom.query_principal();
  if v_me is null or p_table_id is null then
    perform platform.memo_k_put(v_memo, '1');
    return;
  end if;
  if custom.has_visibility(v_me, 'record', p_table_id, 'viewer'::public.permission_level) then
    perform platform.memo_k_put(v_memo, '1');
    return;
  end if;

  -- WAY THROUGH 2: anything IN it that she may see. The same ladder, asked set-wise over the
  -- table's own partition and stopped at the first row.
  v_pred := custom.visible_predicate_sql(v_me, p_organization_id, p_table_id,
                                         'viewer'::public.permission_level, 'r');
  execute format(
    'select exists (select 1 from custom.record r
                     where r.organization_id = %L::uuid
                       and r.table_id = %L::uuid
                       and r.deleted_at is null
                       and (%s)
                     limit 1)', p_organization_id, p_table_id, v_pred)
    into v_any;
  if v_any then
    perform platform.memo_k_put(v_memo, '1');
    return;
  end if;

  -- NEITHER. T10's refusal, word for word — and it is now true when it is said: there is
  -- nothing in this table she may see, so telling her it exists would be the leak.
  raise exception 'You do not have access to this table, so % has nothing to show you.',
    coalesce(nullif(btrim(p_door), ''), 'that door')
    using errcode = '42501',
          hint = 'VIS-5 / T10: you know a table if you may open the table itself, or if anything in it has been shared with you. Ask whoever owns it to share the table, or a record in it, with you.';
end;
$function$
;
alter function custom.assert_may_know_table(uuid,uuid,text) owner to postgres;
revoke all on function custom.assert_may_know_table(uuid,uuid,text) from public, anon, authenticated, service_role;
grant execute on function custom.assert_may_know_table(uuid,uuid,text) to postgres;
comment on function custom.assert_may_know_table(uuid,uuid,text) is 'VIS-5 / T10. The one question every door that DESCRIBES a Table asks before it describes it: may this caller know this Table exists at all.';

-- custom.assert_store_door(uuid,text)
CREATE OR REPLACE FUNCTION custom.assert_store_door(p_organization_id uuid, p_door text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_owner  oid;
  v_who    name;
  v_memo   text := 'w:d:' || coalesce(p_organization_id::text, '-');
  v_me     uuid;
  v_member boolean := true;
  v_say    text;
begin
  -- THE FINAL SWITCH NEVER DEPENDS ON WHO PRESSED IT (PRESS-FENCE C): platform.final_switch_acting().
  if platform.final_switch_acting() then
    return;
  end if;
  -- THE SAME YES, ALREADY GIVEN IN THIS TRANSACTION, TO THIS SEAT, ABOUT THIS ORGANIZATION.
  -- WRITE-PERF-4: out of its own slot (0.6 us) rather than out of the shared blob (8.25 us on
  -- a realistic blob). The stamp is a superset of the seat the blob checked, so this yes is
  -- reused in strictly fewer situations than before, never more.
  if platform.memo_k_get(v_memo) = '1' then
    return;
  end if;
  v_who := custom.caller_role();

  -- The campaign's own lanes run as the role that owns the store. Read the owner from the
  -- catalogue, never as a role literal (rule 15), so this cannot drift from the table.
  if custom.store_is_open(p_organization_id) then
    perform platform.memo_k_put(v_memo, '1');
    return;
  end if;

  select c.relowner into v_owner from pg_class c where c.oid = 'custom.record'::regclass;
  if pg_has_role(v_who, v_owner, 'member') then
    perform platform.memo_k_put(v_memo, '1');
    return;
  end if;

  -- ── S6 2026-09-25: A CLIENT HEARS IT IN HER OWN WORDS. ─────────────────────────────────
  -- Somebody who is not a member of this organization (a portal client, a person something was
  -- shared with) is told what her sign-in page tells her, never the owner's settings speech.
  begin
    v_me := custom.query_principal();
    if v_me is not null then
      v_member := iam.is_org_member(v_me, p_organization_id);
    end if;
    if not v_member then
      v_say := custom.store_off_sentence(p_organization_id);
    end if;
  exception when insufficient_privilege or undefined_function then
    v_member := true;  -- cannot tell from here: the member sentence below, exactly as before
  end;
  if not v_member and v_say is not null then
    raise exception '%', v_say using errcode = '42501';
  end if;

  -- ── STORE-ON 2026-09-23: "TURNED OFF", NEVER "NOT TURNED ON YET". ──────────────────────
  -- Owner ruling the same day: the record store's default is ON, and every active
  -- organization was switched on. "has not turned it on yet" described a world where being
  -- off was the starting state nobody had left; it is now a decision somebody in this
  -- organization made, and the sentence says so. The door is exactly as closed as it was.
  raise exception 'This organization has turned the record store off, so % is not taking writes.',
    coalesce(nullif(btrim(p_door), ''), 'it')
    using errcode = '42501',
          hint = 'The record store is on for every organization by default. Somebody with an owner''s or an administrator''s seat here switched it off: open Database Settings for this organization and turn it back on, and everything already made is kept and starts working again. While it is off, this store takes writes only from the role that owns custom.record, through every door: it is a closed door, not a quiet one.';
end;
$function$
;
alter function custom.assert_store_door(uuid,text) owner to postgres;
revoke all on function custom.assert_store_door(uuid,text) from public, anon, authenticated, service_role;
grant execute on function custom.assert_store_door(uuid,text) to postgres;
comment on function custom.assert_store_door(uuid,text) is 'The door every write in the record store passes. It returns when custom.store_is_open resolves true for this organization, or when the caller owns custom.record; otherwise it raises 42501. STORE-ON 2026-09-23 (owner ruling, Arman): the record store''s platform default is ON — custom/system_enabled and custom/code_paths_enabled both resolve true — and every active organization was switched on through platform.unified_data_store_set. So this refusal now says the organization HAS TURNED THE STORE OFF, which is the only way it can be off, and the hint says how to turn it back on. Guarded by scripts/campaign-tests/storeon_green.sql (release gate pnpm check:store-on-by-default) with its red twin storeon_red.sql.';

-- iam._guard_governance_columns()
CREATE OR REPLACE FUNCTION iam._guard_governance_columns()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  v_token   text := TG_ARGV[0];
  v_uid     uuid;
  v_old     jsonb := to_jsonb(OLD);
  v_new     jsonb := to_jsonb(NEW);
  v_cols    text[];
  v_col     text;
  v_is_owner boolean;
  v_is_admin boolean;
  v_row_id  uuid;
begin
  -- THE FINAL SWITCH NEVER DEPENDS ON WHO PRESSED IT (PRESS-FENCE C): platform.final_switch_acting().
  if platform.final_switch_acting() then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  -- The privileged lane governs by design (aidream's pool, migrations, service
  -- role, and every SECURITY DEFINER RPC — those carry their own gates, e.g.
  -- entity_soft_delete requires admin). Only the RLS-enforced lane is tiered,
  -- and aidream's acting_as_user posture lands HERE, which is correct: an agent
  -- is exactly its user.
  if current_user <> 'authenticated' then
    return NEW;
  end if;

  v_uid := coalesce(
    nullif(current_setting('app.user_id', true), '')::uuid,
    (select auth.uid())
  );
  if v_uid is null then
    return NEW;
  end if;

  v_cols := iam.governance_columns(v_token);
  if v_cols is null or cardinality(v_cols) = 0 then
    return NEW;
  end if;

  v_is_owner := (v_old ->> 'created_by') is not null
                and (v_old ->> 'created_by')::uuid = v_uid;
  v_row_id   := nullif(v_old ->> 'id', '')::uuid;

  foreach v_col in array v_cols loop
    if not (v_old ? v_col) then
      continue;
    end if;
    if (v_new -> v_col) is not distinct from (v_old -> v_col) then
      continue;
    end if;

    -- created_by is the access key itself. Rewriting it through a row UPDATE is
    -- ownership TRANSFER, and it escalates: the new value satisfies std_delete's
    -- owner arm. No level buys it in this lane — not editor, not admin, not the
    -- owner. Ownership transfer, if we ever want it, is a deliberate audited
    -- operation, never a column write.
    if v_col = 'created_by' then
      raise exception using
        errcode = '42501',
        message = format('Ownership of this %s cannot be transferred by editing it.', v_token),
        detail  = 'created_by is the access key for this row; changing it through an UPDATE would silently hand over every owner privilege, including delete.',
        hint    = 'Ownership transfer is a deliberate, audited operation — it is not a column write.';
    end if;

    -- ADOPTION is not re-homing. A row with no organization yet may be adopted
    -- by anyone who can edit it; moving a row that ALREADY belongs to a tenant
    -- is a governance act.
    if v_col = 'organization_id' and (v_old ->> 'organization_id') is null then
      continue;
    end if;

    -- RESTORING is not deleting. Clearing deleted_at brings something back and
    -- is ordinary editing — mirrors entity_undelete (editor) vs
    -- entity_soft_delete (admin). Only SETTING it is the destructive direction.
    if v_col = 'deleted_at' and (v_new ->> 'deleted_at') is null then
      continue;
    end if;

    if v_is_owner then
      continue;
    end if;

    if v_is_admin is null then
      v_is_admin := coalesce(iam.has_access(v_token, v_row_id, 'admin'::public.permission_level), false);
    end if;
    if v_is_admin then
      continue;
    end if;

    if v_col = 'deleted_at' then
      raise exception using
        errcode = '42501',
        message = format('Edit access does not include deleting this %s.', v_token),
        detail  = 'Edit access lets you change the content. Deleting someone else''s work needs full access, or the person who created it.',
        hint    = 'Ask the owner to delete it, or ask them for full access to this item.';
    end if;

    raise exception using
      errcode = '42501',
      message = format('Changing "%s" on this %s needs full access — edit access is not enough.', v_col, v_token),
      detail  = format('"%s" decides who this row belongs to. Edit access changes the content; it does not change ownership.', v_col),
      hint    = 'Ask the owner to make this change, or ask them for full access to this item.';
  end loop;

  return NEW;
end
$function$
;
alter function iam._guard_governance_columns() owner to postgres;
revoke all on function iam._guard_governance_columns() from public, anon, authenticated, service_role;
grant execute on function iam._guard_governance_columns() to public;
grant execute on function iam._guard_governance_columns() to postgres;
comment on function iam._guard_governance_columns() is 'THE GOVERNANCE-COLUMN TIER. BEFORE UPDATE guard for entity-family tables enforcing the EDIT/FULL boundary of the three share levels: an edit-level sharee may not delete (set deleted_at), may not re-home an owned organization_id, and may never rewrite created_by (refused at every level). Publishing (visibility) is deliberately NOT governed — it is an edit-level action. Restoring (clearing deleted_at) and adopting an org-less row are deliberately allowed. Skips the privileged lane. See common-docs/systems/access-architecture/SHARE_LEVELS.md.';

-- iam._guard_private_grant_owner_only()
CREATE OR REPLACE FUNCTION iam._guard_private_grant_owner_only()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'iam', 'platform', 'hr', 'public'
AS $function$
declare v_class text; t record; v_uid uuid := auth.uid();
begin
  -- THE FINAL SWITCH NEVER DEPENDS ON WHO PRESSED IT (PRESS-FENCE C): platform.final_switch_acting().
  if platform.final_switch_acting() then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  -- HR's tokens are guarded by HR's own door (public.hr_break_glass) and its own guard.
  if exists (select 1 from hr._door_spec(new.resource_type)) then
    return new;
  end if;
  -- The server (no signed-in caller) writes grants through iam.share_with_person's own rules.
  if v_uid is null then
    return new;
  end if;

  v_class := iam.class_gate_class(new.resource_type);
  if v_class is null or v_class not in ('private', 'confidential') then
    return new;
  end if;

  select * into t from iam._door_target(new.resource_type, new.resource_id);
  if t.o_subject is null or t.o_subject = v_uid then
    return new;                                     -- the owner sharing their own record
  end if;

  raise exception
    'owner_only: % is % data. Only its owner can share it; nobody else can write a grant on it.',
    new.resource_type, v_class
    using errcode = '42501',
          hint = 'There is no emergency door (access ladder T-16). An organization owner or admin''s only way into a member''s private data is taking over that account: public.org_admin_take_over_account — a written reason, the person told, audited. A person''s work leaves through offboarding''s transfer.';
end $function$
;
alter function iam._guard_private_grant_owner_only() owner to postgres;
revoke all on function iam._guard_private_grant_owner_only() from public, anon, authenticated, service_role;
grant execute on function iam._guard_private_grant_owner_only() to public;
grant execute on function iam._guard_private_grant_owner_only() to postgres;
comment on function iam._guard_private_grant_owner_only() is NULL;

-- platform._context_tag_copy_fence()
CREATE OR REPLACE FUNCTION platform._context_tag_copy_fence()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_org  uuid;
  v_on   boolean;
  v_what text;
begin
  -- THE FINAL SWITCH NEVER DEPENDS ON WHO PRESSED IT (PRESS-FENCE C): platform.final_switch_acting().
  if platform.final_switch_acting() then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  -- THE ONE WRITER: the store owner's own connection (the scopes mover and the follow), read
  -- from the catalogue exactly as custom._context_copy_fence does. (SECURITY DEFINER so the
  -- scope's organization and its knob are read whoever writes; custom.caller_role() reads the
  -- role GUC and session_user, which the definer boundary does not move.) A hard delete is
  -- never fenced: the old side's delete of an entity sweeps its edges, copies included.
  if pg_has_role(custom.caller_role(), (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass), 'member') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.role is distinct from 'context_tag' or new.target_type <> 'record' then
      return new;
    end if;
    v_what := 'make';
  else
    if coalesce(old.role, '') <> 'context_tag' and coalesce(new.role, '') <> 'context_tag' then
      return new;
    end if;
    if old.role is distinct from new.role then
      v_what := 'change the role of';
    elsif old.deleted_at is not null and new.deleted_at is null
          and old.deleted_via_id is not null and new.deleted_via_id is null
          and pg_trigger_depth() > 1 then
      -- lane TRASH-COVERAGE-2: the tagged item's own restore (platform._gc_entity_associations,
      -- running as a trigger on the item's table) bringing back exactly the edges its archive
      -- tombstoned — the mirror of the tombstone let through below. Without it no tagged file,
      -- conversation, note, project, task or war room could come back from Trash (42501 on
      -- every restore). A direct revive (trigger depth 1) is still refused.
      return new;
    elsif old.deleted_at is not null and new.deleted_at is null then
      v_what := 'revive';
    elsif new.target_type is distinct from old.target_type or new.target_id is distinct from old.target_id then
      v_what := 're-point';
    elsif new.deleted_at is null and (new.metadata is distinct from old.metadata
                                      or new.position is distinct from old.position
                                      or new.label is distinct from old.label) then
      v_what := 'edit';
    else
      -- A tombstone, or a source moved by a merge: the old side's own cascades, carried; the
      -- follow re-arms on it and puts the old side's word back at the next drain.
      return new;
    end if;
  end if;

  select s.organization_id into v_org from context.scopes s where s.id = new.target_id;
  if v_org is null then
    return new;
  end if;
  -- SCOPES-WRITE-THROUGH: in an organization whose store is the writer, the write-through (marked)
  -- carries each tag in the same statement as the tag itself.
  if custom._ctx_marked() and custom.context_writer(v_org) = 'store' then
    return new;
  end if;
  v_on := coalesce((platform.knob_resolve('custom', 'context_copy_following', v_org) #>> '{}')::boolean, true);
  if not v_on then
    return new;
  end if;

  raise exception 'This is the new system''s copy of a context tag; it follows the current tags until the switch, so nobody may % it here. Tag or untag the item in its Context section.', v_what
    using errcode = '42501',
          hint = 'SC-4 P4: while custom/context_copy_following is on for the scope''s organization, only the follow of the current screens writes the record store''s copied tags (role context_tag). Nothing was written.';
end;
$function$
;
alter function platform._context_tag_copy_fence() owner to postgres;
revoke all on function platform._context_tag_copy_fence() from public, anon, authenticated, service_role;
grant execute on function platform._context_tag_copy_fence() to public;
grant execute on function platform._context_tag_copy_fence() to postgres;
comment on function platform._context_tag_copy_fence() is 'SC-4 P4. Refuses every writer but the store owner''s connection making, reviving, re-pointing or editing a copied context tag (platform.associations role context_tag) while the scope''s organization follows the current screens. Tombstones, hard deletes and source moves (the old side''s cascades and merges) pass.';

-- 0. the additive press-history door and its door row.
delete from platform.client_callable_door where schema_name = 'platform' and function_name = 'cutover_press_history';
drop function if exists platform.cutover_press_history(integer);

commit;
