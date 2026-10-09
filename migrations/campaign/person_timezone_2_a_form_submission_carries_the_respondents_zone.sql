-- lock: custom
-- lane: PERSON-TIMEZONE-2
-- based-on: custom.form_submit(uuid, text, jsonb, text, text, text) 097d35320ca298739c89aa23e85b4c95f253fcaa753496deab2fc26b7258c8e8
-- based-on: custom.form_respondent_copy(uuid, uuid, uuid, uuid) eb4d65ff31631fa15a1805e7fb7e554a0025883e87a51d78047396a88dd7069b
--
-- A GUEST HAS NO SAVED PREFERENCES, so the public form page sends the device zone as the reserved key `_time_zone`
-- (beside `_hidden` / `_visit`). form_submit lifts it out of the answers, checks it is a real zone, and keeps it on the
-- submission as metadata.respondent_time_zone. The respondent's thank-you email reads the day in that zone.

set local lock_timeout = '2s';
set local statement_timeout = '60s';

do $do$
declare
  v_def text;
begin
  select pg_get_functiondef('custom.form_submit(uuid,text,jsonb,text,text,text)'::regprocedure) into v_def;
  if position('respondent_time_zone' in v_def) = 0 then
    if position(E'  v_hk       text;\nbegin' in v_def) = 0
       or position(E'p_payload := coalesce(p_payload, ''{}''::jsonb) - ''_hidden'' - ''_visit'';' in v_def) = 0
       or position(E'            ''ending'', v_route ->> ''ending'',' in v_def) = 0 then
      raise exception 'form_submit body drifted; not patched';
    end if;
    v_def := replace(v_def, E'  v_hk       text;\nbegin', E'  v_hk       text;\n  v_tzr      text;\nbegin');
    v_def := replace(v_def, E'p_payload := coalesce(p_payload, ''{}''::jsonb) - ''_hidden'' - ''_visit'';',
      E'v_tzr := nullif(btrim(coalesce(p_payload ->> ''_time_zone'', '''')), '''');\n'
      || E'  if v_tzr is not null and not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = v_tzr) then v_tzr := null; end if;\n'
      || E'  p_payload := coalesce(p_payload, ''{}''::jsonb) - ''_hidden'' - ''_visit'' - ''_time_zone'';');
    v_def := replace(v_def, E'            ''ending'', v_route ->> ''ending'',',
      E'            ''respondent_time_zone'', v_tzr,\n            ''ending'', v_route ->> ''ending'',');
    execute v_def;
  end if;

  select pg_get_functiondef('custom.form_respondent_copy(uuid,uuid,uuid,uuid)'::regprocedure) into v_def;
  if position('respondent_time_zone' in v_def) = 0 then
    if position(E'  v_body    text;\nbegin' in v_def) = 0
       or position(E'''submission_id'', p_submission_id, ''source'', ''form'')' in v_def) = 0 then
      raise exception 'form_respondent_copy body drifted; not patched';
    end if;
    v_def := replace(v_def, E'  v_body    text;\nbegin', E'  v_body    text;\n  v_tz      text;\nbegin');
    v_def := replace(v_def, E'  v_to := nullif(btrim(coalesce(v_values ->> v_key, '''')), '''');',
      E'  select s.metadata ->> ''respondent_time_zone'' into v_tz from custom.anon_submission s\n'
      || E'   where s.organization_id = p_organization_id and s.id = p_submission_id;\n'
      || E'  v_to := nullif(btrim(coalesce(v_values ->> v_key, '''')), '''');');
    v_def := replace(v_def, E'''submission_id'', p_submission_id, ''source'', ''form'')',
      E'''submission_id'', p_submission_id, ''source'', ''form'',\n'
      || E'                       ''time_zone'', v_tz,\n'
      || E'                       ''submitted_on'', case when v_tz is null then null\n'
      || E'                         else to_char(now() at time zone v_tz, ''FMDay, FMMonth FMDD, YYYY'') end)');
    execute v_def;
  end if;
end
$do$;
