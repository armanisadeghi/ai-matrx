-- WRITE-PERF-4 WAVE 2 — THE REFUSAL SET IS HASHED BEFORE AND AFTER, AND THE HASHES ARE EQUAL.
--
-- Wave 2 changes eight call sites inside six bodies on the write path. The claim is that not one
-- refusal moves. That claim is worth nothing asserted; here it is MEASURED. Fourteen illegal
-- writes are provoked against the same fixture, their `(sqlstate, message, detail, hint)` collected
-- verbatim, sorted and md5'd — first against the bodies wave 2 replaced, then against wave 2's own
-- bytes, inside ONE transaction that rolls back. The two hashes must be equal AND the set must not
-- be empty: a run where nothing refused would hash equal for the wrong reason, so the count is
-- asserted too, and every refusal is printed.
--
-- THE REAL USE CASE (2026-09-21 law — no fake test data). Harbor & Lowe Surveying is a four-crew
-- land-survey firm in Bellingham. It keeps one record per survey job: the parcel, the county, the
-- client, the survey type, the crew day rate, the field date and where the job stands. The writes
-- below are the ones a surveyor's office actually gets wrong — a column nobody declared, a status
-- that is not on the list, a date where a number belongs, a duplicate job number.
--
-- Run: binlocal/p.sh -f scripts/campaign-tests/writeperf4_refusals_are_identical.sql
\set ON_ERROR_STOP on
\set suite 'writeperf4_refusals_are_identical.sql'
\set requires 'exec:custom.record_write|exec:custom.table_declare'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local statement_timeout = '300s';
set local lock_timeout = '10s';

create temp table wp4r (phase text, n int, k text, sqlstate text, msg text, det text, hnt text) on commit drop;
create temp table wp4r_fx (k text primary key, v text) on commit drop;
grant all on wp4r, wp4r_fx to authenticated;

create or replace function pg_temp.harbor_and_lowe() returns void language plpgsql as $$
declare
  c_admin uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_org uuid; v_home uuid; v_jobs uuid;
begin
  insert into iam.organizations (name, slug, abbreviation, created_by)
  values ('Harbor & Lowe Surveying', 'harbor-lowe-surveying-' || substr(md5(random()::text),1,8), 'HLS', c_admin)
  returning id into v_org;
  insert into iam.memberships (organization_id, user_id, role, status, container_type, container_id)
  values (v_org, c_admin, 'owner', 'active', 'organization', v_org);
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value)
  values ('custom','system_enabled','organization', v_org, v_org, 'true');

  perform set_config('app.actor_system','campaign-test/writeperf4_refusals', true);
  perform set_config('request.jwt.claims',
                     jsonb_build_object('sub', c_admin, 'role','authenticated')::text, true);
  perform set_config('role','authenticated', true);

  v_home := custom.record_write(v_org, custom.person_kernel_id(),
              jsonb_build_object('name','Harbor & Lowe Surveying — Bellingham Office'));
  v_jobs := custom.table_declare(v_org, jsonb_build_object(
    'name','Survey Jobs','slug','surveyjobs_' || substr(md5(random()::text),1,8),'type','entity',
    'label_singular','Survey Job','label_plural','Survey Jobs','title_field','job_no','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','job_no')), 'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_jobs, jsonb_build_object('label','Job number','key','job_no','type','text',
    'rules', jsonb_build_array(jsonb_build_object('kind','unique'))));
  perform custom.field_declare(v_org, v_jobs, jsonb_build_object('label','Parcel','key','parcel','type','text'));
  perform custom.field_declare(v_org, v_jobs, jsonb_build_object('label','County','key','county','type','text'));
  perform custom.field_declare(v_org, v_jobs, jsonb_build_object('label','Crew day rate','key','day_rate','type','currency','unit','USD'));
  perform custom.field_declare(v_org, v_jobs, jsonb_build_object('label','Field date','key','field_date','type','datetime'));
  perform custom.field_declare(v_org, v_jobs, jsonb_build_object('label','Survey type','key','survey_type','type','select',
    'options', jsonb_build_array('ALTA/NSPS','Boundary','Topographic','Construction stakeout','Subdivision plat')));
  perform custom.field_declare(v_org, v_jobs, jsonb_build_object('label','Stage','key','stage','type','select',
    'options', jsonb_build_array('Requested','Scheduled','Field complete','Drafting','Delivered')));

  perform custom.record_write(v_org, v_jobs, jsonb_build_object(
    'job_no','HLS-26-0311','parcel','3803-142-094-0000','county','Whatcom',
    'day_rate', 1850.00,'field_date','2026-09-24T07:00:00','survey_type','Boundary','stage','Scheduled'));
  reset role;
  delete from wp4r_fx;
  insert into wp4r_fx values ('org', v_org::text), ('jobs', v_jobs::text), ('home', v_home::text);
end $$;

-- The fourteen illegal writes an office really makes, each provoked and its refusal captured.
create or replace function pg_temp.collect(p_phase text) returns int language plpgsql as $$
declare
  v_org uuid; v_jobs uuid; i int := 0; v_s text; v_m text; v_d text; v_h text;
  v_docs jsonb[] := array[
    jsonb_build_object('job_no','HLS-26-0401','monument_found','brass cap'),
    jsonb_build_object('job_no','HLS-26-0402','stage','Field complete-ish'),
    jsonb_build_object('job_no','HLS-26-0403','survey_type','Bathymetric'),
    jsonb_build_object('job_no','HLS-26-0404','day_rate','no charge'),
    jsonb_build_object('job_no','HLS-26-0405','field_date','next Tuesday'),
    jsonb_build_object('job_no','HLS-26-0311','parcel','3803-142-094-0000'),
    jsonb_build_object('job_no','HLS-26-0407','_values','not an envelope'),
    jsonb_build_object('job_no','HLS-26-0408','_actor','agent'),
    jsonb_build_object('job_no','HLS-26-0409','_on_behalf_of','someone'),
    jsonb_build_object('job_no','HLS-26-0410','_values', jsonb_build_object('parcel', jsonb_build_object('dated','[]'::jsonb))),
    jsonb_build_object('job_no','HLS-26-0411','crew_chief','R. Lowe'),
    jsonb_build_object('job_no','HLS-26-0412','stage','Delivered','deliverable_url','x'),
    jsonb_build_object('job_no','HLS-26-0413','county','Whatcom','acreage',12.4),
    jsonb_build_object('job_no','HLS-26-0414','parent_id','not-a-uuid')];
  d jsonb;
begin
  select v::uuid into v_org from wp4r_fx where k='org';
  select v::uuid into v_jobs from wp4r_fx where k='jobs';
  perform set_config('request.jwt.claims',
                     jsonb_build_object('sub','87a6e699-3622-4869-8843-d0867456c0dd','role','authenticated')::text, true);
  perform set_config('role','authenticated', true);
  foreach d in array v_docs loop
    i := i + 1;
    begin
      perform custom.record_write(v_org, v_jobs, d);
    exception when others then
      get stacked diagnostics v_s = returned_sqlstate, v_m = message_text,
                              v_d = pg_exception_detail, v_h = pg_exception_hint;
      insert into wp4r values (p_phase, i, d ->> 'job_no', v_s, v_m, coalesce(v_d,''), coalesce(v_h,''));
    end;
  end loop;
  reset role;
  return i;
end $$;

-- ═══ BEFORE — the bodies wave 2 replaced ════════════════════════════════════════════════════
\i migrations/inverse/writeperf4_the_field_set_is_read_once_per_row_down.sql
select pg_temp.harbor_and_lowe();
select pg_temp.collect('before');

-- ═══ AFTER — wave 2's own bytes ═════════════════════════════════════════════════════════════
\i migrations/campaign/writeperf4_the_field_set_is_read_once_per_row.sql
select pg_temp.harbor_and_lowe();
select pg_temp.collect('after');

select phase, n, sqlstate, left(msg, 78) as refusal from wp4r order by phase desc, n;

do $t$
declare
  v_before text; v_after text; v_nb int; v_na int;
begin
  select md5(string_agg(n::text||'|'||sqlstate||'|'||msg||'|'||det||'|'||hnt, E'\n' order by n)), count(*)
    into v_before, v_nb from wp4r where phase='before';
  select md5(string_agg(n::text||'|'||sqlstate||'|'||msg||'|'||det||'|'||hnt, E'\n' order by n)), count(*)
    into v_after,  v_na from wp4r where phase='after';
  if coalesce(v_nb,0) < 8 then
    raise exception 'REFUSAL HASH PROVES NOTHING: only % of 14 writes refused before the change', coalesce(v_nb,0);
  end if;
  if v_nb <> v_na then
    raise exception 'THE REFUSAL SET CHANGED SIZE: % before, % after', v_nb, v_na;
  end if;
  if v_before is distinct from v_after then
    raise exception 'THE REFUSAL SET CHANGED: % before, % after — a message, SQLSTATE, detail or hint moved', v_before, v_after;
  end if;
  raise notice 'REFUSALS IDENTICAL — % of 14 writes refused, sqlstate+message+detail+hint hash % on both sides.', v_nb, v_before;
end;
$t$;
rollback;
