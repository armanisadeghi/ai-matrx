-- chair-step: lane CUTOVER-CENSUS — the Data tables switch's "every feature that reads or writes tables uses the new store" fact stops being a sentence a lane types and becomes the census script's measured output: one append-only table of census runs (platform.cutover_census_run), one private door the script calls over a direct database connection (platform.cutover_census_record), and a guard on platform.cutover_seam that refuses any other change to a census-measured fact by name. The fact is reset to "not measured yet" (met false) until the first run records it. No client role gains anything.
-- lane: CUTOVER-CENSUS
-- INVERSE: migrations/inverse/cutovercensus_the_integrations_fact_is_what_the_census_measured_down.sql
--
-- THE USE CASE. The owner's settings page offers "Switch to the new system" for Data tables only
-- when every check is met. One check — "every feature that reads or writes tables uses the new
-- store (the agents' dataset tool, the workflow steps, save-as-a-table, row-change automations,
-- the browser extension)" — was a jsonb value FLIP-SEAMS typed ("Not yet: 44 of the places …"),
-- to be flipped to true by whichever lane finished last. A typed `true` is an assertion, and the
-- "44" was already stale the day it was written (INTEG-CLIENTS and INTEG-SERVER had repointed most
-- of them). Now the value is whatever `scripts/cutover-census/census.ts` measured the last time it
-- ran across matrx-frontend, aidream and matrx-extend (72 places from CUTOVER-PLAN rev 3 plus any
-- the scan finds that the plan did not list): every place proven by a code check it runs (an
-- import, a call site, a released tag) or a live read of this database, or named as changing at
-- the switch itself by design, or named as needing nothing — and `met` is TRUE only when no place
-- is open and no runtime file names an older door outside the list. The door computes `met` and
-- the sentence the owner reads from the rows the script sends; it does not take a `met` argument.
--
-- WHO CAN CALL THE DOOR. Nobody through the API: EXECUTE is revoked from public, anon,
-- authenticated (and never granted to service_role). The script connects directly as the database
-- owner, like `pnpm db:apply`. A signed-in person is refused even if the function were granted.

set lock_timeout = '30s';
set statement_timeout = '120s';

-- ── 1. THE RUNS (append-only) ────────────────────────────────────────────────────────────────────
create table if not exists platform.cutover_census_run (
  id                uuid primary key default gen_random_uuid(),
  seam_key          text not null references platform.cutover_seam(seam_key),
  prerequisite_key  text not null,
  ran_at            timestamptz not null default clock_timestamp(),
  -- Which database the census's live reads were made on (the script's --target).
  target            text not null check (target in ('production', 'clone', 'branch')),
  -- {"matrx-frontend": "<sha>", "aidream": "<sha>", "matrx-extend": "<sha>", ...}: the code measured.
  repos             jsonb not null,
  script_sha256     text not null,
  places            integer not null,
  proven            integer not null,
  flip_time         integer not null,
  nothing           integer not null,
  open              integer not null,
  unlisted          integer not null,
  met               boolean not null,
  evidence          text not null,
  rows              jsonb not null,
  unlisted_findings jsonb not null default '[]'::jsonb,
  recorded_by       text not null default current_user,
  -- A catalogue-side log row, like platform.cutover_seam: the platform's own organization holds it.
  organization_id   uuid not null references iam.organizations(id)
);

comment on table platform.cutover_census_run is
  'Every run of the cutover census (matrx-frontend scripts/cutover-census/census.ts), append-only: which code and which database it measured, every integration''s status, and the fact it wrote into platform.cutover_seam.prerequisites. Written only by platform.cutover_census_record. Lane CUTOVER-CENSUS.';

create index if not exists cutover_census_run_latest on platform.cutover_census_run (seam_key, prerequisite_key, ran_at desc);
create index if not exists cutover_census_run_organization_id on platform.cutover_census_run (organization_id);

alter table platform.cutover_census_run enable row level security;
revoke all on platform.cutover_census_run from anon, authenticated;

create or replace function platform._cutover_census_run_is_append_only()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $$
begin
  raise exception 'a census run is a record of what was measured and is never changed or removed'
    using errcode = '42501',
          hint = 'Run the census again (scripts/cutover-census/census.ts --record); that is a new row.';
end;
$$;

drop trigger if exists cutover_census_run_is_append_only on platform.cutover_census_run;
create trigger cutover_census_run_is_append_only
  before update or delete on platform.cutover_census_run
  for each row execute function platform._cutover_census_run_is_append_only();

revoke all on function platform._cutover_census_run_is_append_only() from public, anon, authenticated, service_role;

-- ── 2. THE FACT IS MARKED AS MEASURED, AND RESET UNTIL THE FIRST RUN ──────────────────────────────
update platform.cutover_seam s
   set prerequisites = (
     select coalesce(jsonb_agg(
              case when e ->> 'key' = 'integrations_repointed'
                   then e || jsonb_build_object(
                          'met', false,
                          'measured_by', 'census',
                          'evidence', 'Not measured yet: the census of every place that reads or writes tables has not run since it became the thing that decides this.')
                   else e end order by ord), '[]'::jsonb)
       from jsonb_array_elements(s.prerequisites) with ordinality as t(e, ord))
 where s.seam_key = 'older_tables';

do $$
begin
  if not exists (select 1 from platform.cutover_seam s, jsonb_array_elements(s.prerequisites) e
                  where s.seam_key = 'older_tables' and e ->> 'key' = 'integrations_repointed'
                    and e ->> 'measured_by' = 'census') then
    raise exception 'the Data tables switch has no integrations_repointed fact to hand to the census';
  end if;
end;
$$;

-- ── 3. THE GUARD: a census-measured fact changes only through the door ───────────────────────────
create or replace function platform._cutover_seam_census_facts_are_measured()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $$
declare
  e jsonb;
  n jsonb;
begin
  if coalesce(current_setting('matrx.cutover_census_door', true), '') = 'on' then
    return new;
  end if;
  for e in select * from jsonb_array_elements(old.prerequisites) loop
    if e ->> 'measured_by' = 'census' then
      select x into n from jsonb_array_elements(new.prerequisites) x where x ->> 'key' = e ->> 'key';
      if n is distinct from e then
        raise exception 'the fact "%" on the switch "%" is measured by the cutover census and is never set by hand',
                        e ->> 'key', old.seam_key
          using errcode = '42501',
                hint = 'Run the census: (matrx-frontend) npx tsx scripts/cutover-census/census.ts --target production --record. It writes the fact through platform.cutover_census_record.';
      end if;
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists cutover_seam_census_facts_are_measured on platform.cutover_seam;
create trigger cutover_seam_census_facts_are_measured
  before update on platform.cutover_seam
  for each row execute function platform._cutover_seam_census_facts_are_measured();

revoke all on function platform._cutover_seam_census_facts_are_measured() from public, anon, authenticated, service_role;

-- ── 4. THE DOOR ──────────────────────────────────────────────────────────────────────────────────
create or replace function platform.cutover_census_record(p_seam text, p_key text, p_census jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
declare
  s platform.cutover_seam;
  v_pre jsonb;
  v_rows jsonb := coalesce(p_census -> 'rows', 'null'::jsonb);
  v_unlisted jsonb := coalesce(p_census -> 'unlisted', '[]'::jsonb);
  v_repos jsonb := coalesce(p_census -> 'repos', 'null'::jsonb);
  v_target text := p_census ->> 'target';
  v_places int; v_proven int; v_flip int; v_nothing int; v_open int; v_unl int; v_plan_rows int;
  v_bad text;
  v_met boolean;
  v_open_words text;
  v_evidence text;
  v_run uuid;
  v_repo text;
begin
  if auth.uid() is not null then
    raise exception 'the cutover census is recorded by the census script over a direct database connection, never by a signed-in person'
      using errcode = '42501';
  end if;

  select * into s from platform.cutover_seam where seam_key = p_seam and retired_at is null;
  if s.seam_key is null then
    raise exception 'there is no switch called %', p_seam using errcode = '22023';
  end if;
  select e into v_pre from jsonb_array_elements(s.prerequisites) e where e ->> 'key' = p_key;
  if v_pre is null or v_pre ->> 'measured_by' is distinct from 'census' then
    raise exception 'the switch % has no census-measured fact called %', p_seam, p_key using errcode = '22023';
  end if;

  -- The shape the script sends; anything else is refused whole, never half-recorded.
  if jsonb_typeof(v_rows) is distinct from 'array' or jsonb_array_length(v_rows) = 0 then
    raise exception 'a census carries its rows (one per place that reads or writes tables)' using errcode = '22023';
  end if;
  if jsonb_typeof(v_unlisted) is distinct from 'array' then
    raise exception 'a census carries its unlisted findings as a list (empty when there are none)' using errcode = '22023';
  end if;
  if v_target is null or v_target not in ('production', 'clone', 'branch') then
    raise exception 'a census names the database its live reads were made on (production, clone or branch)' using errcode = '22023';
  end if;
  if jsonb_typeof(v_repos) is distinct from 'object' then
    raise exception 'a census names the commit of every repository it read' using errcode = '22023';
  end if;
  foreach v_repo in array array['matrx-frontend', 'aidream', 'matrx-extend'] loop
    if coalesce(v_repos ->> v_repo, '') !~ '^[0-9a-f]{7,40}$' then
      raise exception 'a census that did not read % (at a commit) cannot say every integration is repointed', v_repo
        using errcode = '22023';
    end if;
  end loop;
  select string_agg(coalesce(r ->> 'id', '?'), ', ') into v_bad
    from jsonb_array_elements(v_rows) r
   where coalesce(r ->> 'id', '') = ''
      or coalesce(r ->> 'status', '') not in ('proven', 'flip_time', 'nothing', 'open')
      or (r ->> 'status' = 'open' and coalesce(r ->> 'plain', '') = '');
  if v_bad is not null then
    raise exception 'census rows without an id, a known status, or (when open) the sentence that says what is left: %', v_bad
      using errcode = '22023';
  end if;
  if (select count(*) from jsonb_array_elements(v_rows) r) <> (select count(distinct r ->> 'id') from jsonb_array_elements(v_rows) r) then
    raise exception 'a census lists every place once' using errcode = '22023';
  end if;
  -- The 72 places CUTOVER-PLAN rev 3 lists are all present (F1–F30, A1–A22, E1–E4, L1, D1–D15).
  select count(*) into v_plan_rows from jsonb_array_elements(v_rows) r
   where r ->> 'id' ~ '^(F([1-9]|[12][0-9]|30)|A([1-9]|1[0-9]|2[0-2])|E[1-4]|L1|D([1-9]|1[0-5]))$';
  if v_plan_rows <> 72 then
    raise exception 'a census must answer for all 72 places the cutover plan lists; this one answers for %', v_plan_rows
      using errcode = '22023';
  end if;

  select count(*),
         count(*) filter (where r ->> 'status' = 'proven'),
         count(*) filter (where r ->> 'status' = 'flip_time'),
         count(*) filter (where r ->> 'status' = 'nothing'),
         count(*) filter (where r ->> 'status' = 'open')
    into v_places, v_proven, v_flip, v_nothing, v_open
    from jsonb_array_elements(v_rows) r;
  v_unl := jsonb_array_length(v_unlisted);
  v_met := v_open = 0 and v_unl = 0;

  select string_agg(r ->> 'plain', '; ' order by r ->> 'id') into v_open_words
    from jsonb_array_elements(v_rows) r where r ->> 'status' = 'open';

  v_evidence := format('Measured %s across the web app, the server and the browser extension: ',
                       to_char(now() at time zone 'UTC', 'YYYY-MM-DD HH24:MI "UTC"'))
    || case when v_met then
         format('every one of the %s places that read or write tables is ready — %s proven to use the new store, %s change at the switch itself, %s need nothing.',
                v_places, v_proven, v_flip, v_nothing)
       else
         format('%s of %s places are proven to use the new store, %s change at the switch itself and %s need nothing; ',
                v_proven, v_places, v_flip, v_nothing)
         || case when v_open > 0 then format('%s %s not yet: %s.', v_open, case when v_open = 1 then 'is' else 'are' end, v_open_words) else '' end
         || case when v_unl > 0 then format(' %s %s that the list does not name still %s the older tables directly.',
                                            v_unl, case when v_unl = 1 then 'file' else 'files' end,
                                            case when v_unl = 1 then 'reaches' else 'reach' end) else '' end
       end;

  insert into platform.cutover_census_run
    (seam_key, prerequisite_key, target, repos, script_sha256, places, proven, flip_time, nothing,
     open, unlisted, met, evidence, rows, unlisted_findings, organization_id)
  values
    (p_seam, p_key, v_target, v_repos, coalesce(p_census ->> 'script_sha256', ''), v_places, v_proven, v_flip,
     v_nothing, v_open, v_unl, v_met, v_evidence, v_rows, v_unlisted, s.organization_id)
  returning id into v_run;

  perform set_config('matrx.cutover_census_door', 'on', true);
  update platform.cutover_seam c
     set prerequisites = (
       select jsonb_agg(
                case when e ->> 'key' = p_key
                     then e || jsonb_build_object('met', v_met, 'evidence', v_evidence,
                                                  'census_run', v_run, 'measured_at', now(),
                                                  'measured_on', v_target)
                     else e end order by ord)
         from jsonb_array_elements(c.prerequisites) with ordinality as t(e, ord))
   where c.seam_key = p_seam;
  perform set_config('matrx.cutover_census_door', '', true);

  return jsonb_build_object('ok', true, 'run', v_run, 'met', v_met, 'places', v_places,
                            'proven', v_proven, 'flip_time', v_flip, 'nothing', v_nothing,
                            'open', v_open, 'unlisted', v_unl, 'evidence', v_evidence);
end;
$$;

comment on function platform.cutover_census_record(text, text, jsonb) is
  'The one writer of a census-measured switch fact (platform.cutover_seam.prerequisites[*].measured_by = census): takes the census script''s rows, computes met (no open place, no unlisted file) and the sentence the owner reads, appends a platform.cutover_census_run row and writes the fact. Direct database connection only. Lane CUTOVER-CENSUS.';

revoke all on function platform.cutover_census_record(text, text, jsonb) from public, anon, authenticated, service_role;

-- The access decision, in data (provision_shape_guard): no client, signed in or not, ever calls it.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('platform', 'cutover_census_record', 'p_seam text, p_key text, p_census jsonb',
   array['text'::regtype, 'text'::regtype, 'jsonb'::regtype]::oid[],
   'p_seam must name a live platform.cutover_seam and p_key one of its prerequisites marked measured_by=census; no entity-id argument; refused when auth.uid() is not null.',
   'cutovercensus_the_integrations_fact_is_what_the_census_measured.sql',
   'server_only: called only by matrx-frontend scripts/cutover-census/census.ts --record over a direct database connection as the database owner; EXECUTE is revoked from public, anon, authenticated and service_role, and a signed-in caller is refused inside.',
   false, false)
on conflict (schema_name, function_name, identity_argtypes) do nothing;
