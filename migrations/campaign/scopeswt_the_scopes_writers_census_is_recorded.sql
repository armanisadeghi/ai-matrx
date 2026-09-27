-- chair-step: lane SCOPES-WRITE-THROUGH — the scopes switch's fact "every place that writes scopes and context is listed" (seam scopes_screens, prerequisite writers_listed) gets its one writer: platform.cutover_scopes_census_record, called only by the scopes writers census (matrx-frontend scripts/cutover-census/scopes-writers.ts --record) over a server connection. It checks the census's shape, records one row in platform.cutover_census_run beside the tables census, computes met (nothing open, nothing unlisted) and the owner's sentence itself, and writes the fact through the census marker exactly as platform.cutover_census_record does. New function only; nothing replaced. Needs scopeswt_the_scopes_switch_presses_for_one_organization_or_all.sql first (the fact it writes).
-- lane: SCOPES-WRITE-THROUGH
-- INVERSE: migrations/inverse/scopeswt_the_scopes_writers_census_is_recorded_down.sql
--
-- THE USE CASE. Before the final switch presses "Scope and context screens" for every organization,
-- the census reads the web app, the server, the extension, the desktop app and the database's own
-- catalogue, and says every scope writer is either on the store's doors or carried by the
-- write-through. A new writer nobody listed turns the fact false and the switch holds, named.

create or replace function platform.cutover_scopes_census_record(p_census jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
declare
  s platform.cutover_seam;
  v_rows jsonb := coalesce(p_census -> 'rows', 'null'::jsonb);
  v_unlisted jsonb := coalesce(p_census -> 'unlisted', '[]'::jsonb);
  v_repos jsonb := coalesce(p_census -> 'repos', 'null'::jsonb);
  v_target text := p_census ->> 'target';
  v_places int; v_proven int; v_carried int; v_flip int; v_nothing int; v_open int; v_unl int;
  v_bad text; v_repo text; v_met boolean; v_open_words text; v_evidence text; v_run uuid;
begin
  if auth.uid() is not null then
    raise exception 'the scopes writers census is recorded by its script over a server connection, never by a signed-in person'
      using errcode = '42501';
  end if;
  select * into s from platform.cutover_seam where seam_key = 'scopes_screens' and retired_at is null;
  if s.seam_key is null or not exists (select 1 from jsonb_array_elements(s.prerequisites) e
                                        where e ->> 'key' = 'writers_listed' and e ->> 'measured_by' = 'census') then
    raise exception 'the scopes switch has no census-measured fact called writers_listed (apply scopeswt_the_scopes_switch_presses_for_one_organization_or_all.sql first)'
      using errcode = '22023';
  end if;
  if jsonb_typeof(v_rows) is distinct from 'array' or jsonb_array_length(v_rows) = 0 then
    raise exception 'a census carries its rows (one per place that writes scopes)' using errcode = '22023';
  end if;
  if jsonb_typeof(v_unlisted) is distinct from 'array' then
    raise exception 'a census carries its unlisted findings as a list (empty when there are none)' using errcode = '22023';
  end if;
  if v_target is null or v_target not in ('production', 'clone') then
    raise exception 'a census names the database its catalogue was read on (production or clone)' using errcode = '22023';
  end if;
  if jsonb_typeof(v_repos) is distinct from 'object' then
    raise exception 'a census names the commit of every repository it read' using errcode = '22023';
  end if;
  foreach v_repo in array array['matrx-frontend', 'aidream', 'matrx-extend'] loop
    if coalesce(v_repos ->> v_repo, '') !~ '^[0-9a-f]{7,40}$' then
      raise exception 'a census that did not read % (at a commit) cannot say every scope writer is listed', v_repo
        using errcode = '22023';
    end if;
  end loop;
  select string_agg(coalesce(r ->> 'id', '?'), ', ') into v_bad
    from jsonb_array_elements(v_rows) r
   where coalesce(r ->> 'id', '') = ''
      or coalesce(r ->> 'status', '') not in ('proven', 'carried', 'flip_time', 'nothing', 'open')
      or (r ->> 'status' = 'open' and coalesce(r ->> 'plain', '') = '');
  if v_bad is not null then
    raise exception 'census rows without an id, a known status, or (when open) the sentence that says what is left: %', v_bad
      using errcode = '22023';
  end if;
  if (select count(*) from jsonb_array_elements(v_rows)) <> (select count(distinct r ->> 'id') from jsonb_array_elements(v_rows) r) then
    raise exception 'a census lists every place once' using errcode = '22023';
  end if;

  select count(*),
         count(*) filter (where r ->> 'status' = 'proven'),
         count(*) filter (where r ->> 'status' = 'carried'),
         count(*) filter (where r ->> 'status' = 'flip_time'),
         count(*) filter (where r ->> 'status' = 'nothing'),
         count(*) filter (where r ->> 'status' = 'open')
    into v_places, v_proven, v_carried, v_flip, v_nothing, v_open
    from jsonb_array_elements(v_rows) r;
  v_unl := jsonb_array_length(v_unlisted);
  v_met := v_open = 0 and v_unl = 0;
  select string_agg(r ->> 'plain', '; ' order by r ->> 'id') into v_open_words
    from jsonb_array_elements(v_rows) r where r ->> 'status' = 'open';

  v_evidence := format('Measured %s across the web app, the server, the extension, the desktop app and the database''s own catalogue: ',
                       to_char(now() at time zone 'UTC', 'YYYY-MM-DD HH24:MI "UTC"'))
    || case when v_met then
         format('every one of the %s places that write scopes is listed — %s write through the store''s scope doors, %s are carried into the store in the same save, %s change at the final switch, %s write nothing.',
                v_places, v_proven, v_carried, v_flip, v_nothing)
       else
         format('%s of %s places write through the store''s doors, %s are carried, %s change at the final switch; ', v_proven, v_places, v_carried, v_flip)
         || case when v_open > 0 then format('%s %s not yet: %s.', v_open, case when v_open = 1 then 'is' else 'are' end, v_open_words) else '' end
         || case when v_unl > 0 then format(' %s %s that the list does not name still %s scopes.',
                                            v_unl, case when v_unl = 1 then 'place' else 'places' end,
                                            case when v_unl = 1 then 'writes' else 'write' end) else '' end
       end;

  insert into platform.cutover_census_run
    (seam_key, prerequisite_key, target, repos, script_sha256, places, proven, flip_time, nothing,
     open, unlisted, met, evidence, rows, unlisted_findings, recorded_by, organization_id)
  values
    ('scopes_screens', 'writers_listed', v_target, v_repos, coalesce(p_census ->> 'script_sha256', ''), v_places,
     v_proven + v_carried, v_flip, v_nothing, v_open, v_unl, v_met, v_evidence, v_rows, v_unlisted,
     'scripts/cutover-census/scopes-writers.ts', s.organization_id)
  returning id into v_run;

  perform set_config('matrx.cutover_census_door', 'on', true);
  update platform.cutover_seam c
     set prerequisites = (
       select jsonb_agg(case when e ->> 'key' = 'writers_listed'
                             then e || jsonb_build_object('met', v_met, 'evidence', v_evidence, 'census_run', v_run,
                                                          'measured_at', now(), 'measured_on', v_target)
                             else e end order by ord)
         from jsonb_array_elements(c.prerequisites) with ordinality as t(e, ord))
   where c.seam_key = 'scopes_screens';
  perform set_config('matrx.cutover_census_door', '', true);

  return jsonb_build_object('ok', true, 'run', v_run, 'met', v_met, 'places', v_places, 'proven', v_proven,
                            'carried', v_carried, 'flip_time', v_flip, 'nothing', v_nothing, 'open', v_open,
                            'unlisted', v_unl, 'evidence', v_evidence);
end;
$function$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
values ('platform', 'cutover_scopes_census_record', 'p_census jsonb', array['jsonb'::regtype]::oid[],
        'p_census is the census the script measured: its rows, unlisted findings, the repositories'' commits and the database it read. No id in it opens anything; a signed-in caller is refused 42501.',
        'scopeswt_the_scopes_writers_census_is_recorded.sql',
        'server_only: matrx-frontend scripts/cutover-census/scopes-writers.ts --record, over the server''s own database connection, records the scopes writers census; no client ever calls it.',
        false, false)
on conflict do nothing;
revoke all on function platform.cutover_scopes_census_record(jsonb) from public, anon, authenticated;
grant execute on function platform.cutover_scopes_census_record(jsonb) to service_role;
