-- scripts/campaign-tests/tidy_green.sql — LANE TIDY.
--
-- CONTEXT-PERF's four closing concerns, proved. Every asserted clause in PART 1 runs as
-- `authenticated`, through the doors a signed-in person reaches, and PART 0 proves the
-- seat is real before anything is claimed. PART 2 steps OUT and says so: the retention
-- functions are `server_only` by declaration — they are run by the platform's own hourly
-- log-retention job, and no client door exists or should.
--
-- The suite makes its own organization, its own Table, its own records and its own
-- provenance rows, and ROLLS THE WHOLE THING BACK. It leaves nothing behind and asserts
-- nothing about anybody else's data.
--
-- Run: <scratchpad>/tidy/p.sh -f scripts/campaign-tests/tidy_green.sql
-- The red twin is scripts/campaign-tests/tidy_red.sql.

\set ON_ERROR_STOP on

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'tidy_green.sql'
\set requires 'function:custom.organization_kernel_id'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

-- SUITES-TIDY 2026-09-22: the preamble's own verdict, handed to the DO blocks below. psql does
-- not interpolate :variables inside dollar-quoted bodies, and clause 3d needs to know whether
-- it is on the quarantined clone.
select set_config('matrx.db', :'matrx_db', false)
\g (tuples_only=on format=unaligned) /dev/null
begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

do $suite$
declare
  c_admin   uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_boss    text := current_user;
  v_org     uuid := gen_random_uuid();
  v_home    uuid;
  v_tbl     uuid;
  v_fld     uuid;
  v_rec     uuid;
  v_row     record;
  v_msg     text;
  v_n       integer;
  v_days    integer;
  v_out     jsonb;
  v_at      timestamptz;
  v_i       integer;
begin
  -- ══ FIXTURE, as the connected role ════════════════════════════════════════════════════
  perform set_config('app.actor_system', 'campaign-test/tidy_green.sql', true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'TIDY green suite', 'tidy-green-' || replace(v_org::text,'-',''), 'TGS', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
         (v_org, 'organization', v_org, c_dana,  'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value)
  values ('custom','system_enabled','organization', v_org, v_org, 'true');

  insert into custom.record (organization_id, table_id, data_class, data, created_by)
  values (v_org, custom.organization_kernel_id(), 'record',
          jsonb_build_object('name','Workspace'), c_admin)
  returning id into v_home;

  perform set_config('request.jwt.claims', c_admin_j, true);

  -- ══ PART 0 — TAKE THE SEAT AND PROVE IT ════════════════════════════════════════════════
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this suite did not take the seat — current_user is %', current_user;
  end if;
  if pg_has_role(current_user,
                 (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass),
                 'member') then
    raise exception '0: this seat is a member of the role that owns custom.record, so every wall would open on its first line';
  end if;
  begin
    perform 1 from custom.record limit 1;
    raise exception '0: this seat can SELECT custom.record directly, so it is not a client seat';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PART 0 PASSED — the seat is authenticated and cannot read custom.record directly';

  -- ══ PART 1 — ONE FRESHNESS CEILING, SEEN FROM THE SEAT ═════════════════════════════════
  -- The door a person reaches that shows a value's age is `custom.enrich_due`: "which rows
  -- need this column filled in again". Before lane TIDY it derived the age and wrote its own
  -- sentence, in two places that could disagree with each other AND with the two copies
  -- CONTEXT-PERF had already named. It now asks `custom.freshness_verdict`, and this part
  -- asserts the sentence a PERSON reads is that function's, character for character.
  v_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name','Policies','slug','policies','description','','type','entity','display','list',
    'ordered', false, 'weight','light','retention_days',30,'row_order','sorted',
    'default_sort', jsonb_build_array(jsonb_build_object('field','title','direction','asc')),
    'agent_writable', true, 'label_singular','Policy','label_plural','Policies',
    'title_field','title',
    'fields', jsonb_build_array(jsonb_build_object('name','title')),
    'parent_id', v_home));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Name','key','title','type','text'));
  v_fld := custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Summary','key','summary','type','text'));
  perform custom.enrich_declare(v_org, v_fld, jsonb_build_object(
    'instruction', 'summarise this policy in one sentence',
    'inputs', jsonb_build_array('title'),
    'review_interval_days', 90));
  v_rec := custom.record_write(v_org, v_tbl, jsonb_build_object('title','Refunds','summary','Thirty days.'));

  -- ── A STEP NO DOOR COVERS: making a value OLD, un-pinned, and keeping it that way.
  -- There is no client verb for "pretend this was written four hundred days ago", and there
  -- should not be. Two things make this awkward and both are the store working properly:
  --   * a value a PERSON typed is `pinned`, and `custom.enrich_due` never offers a pinned
  --     cell as work — somebody decided it. What is under test is an AGENT-filled column
  --     going stale, so the fixture un-pins it.
  --   * the value-envelope trigger on `custom.record` re-stamps `_values.<key>.at` on every
  --     UPDATE, so a plain backdating UPDATE is undone by the store in the same statement.
  --     `session_replication_role = replica` is transaction-local and turns the triggers off
  --     for this one fixture write; the suite rolls back regardless.
  -- Nothing is asserted while the seat is out.
  perform set_config('role', v_boss, true);
  set local session_replication_role = 'replica';
  update custom.record
     set data = jsonb_set(
                  jsonb_set(data, '{_values,summary,at}',
                            to_jsonb((now() - interval '400 days')::text)),
                  '{_values,summary,pinned}', 'false'::jsonb)
   where organization_id = v_org and id = v_rec;
  set local session_replication_role = 'origin';
  select (data -> '_values' -> 'summary' ->> 'at')::timestamptz into v_at
    from custom.record where organization_id = v_org and id = v_rec;
  if v_at > now() - interval '399 days' then
    raise exception 'FIXTURE: the backdating did not stick — the value reads as written %', v_at;
  end if;
  perform set_config('role', 'authenticated', true);

  -- BACK IN THE SEAT. Everything below is what a signed-in person gets.
  select count(*) into v_n from custom.enrich_due(v_org, v_fld, 50, false);
  if v_n <> 1 then
    raise exception '1a: the 400-day-old row is not listed as due (% rows). The WHERE clause and custom.freshness_verdict disagree.', v_n;
  end if;

  select * into v_row from custom.enrich_due(v_org, v_fld, 50, false) limit 1;
  v_msg := v_row.reason;
  if v_msg not like 'last written % day(s) ago, past the 90-day freshness this field declares%' then
    raise exception '1b: the sentence a person reads is not the one freshness ceiling''s: %', v_msg;
  end if;
  if v_msg not like '%delivered anyway and marked stale rather than dropped' then
    raise exception '1c: the sentence stops short of saying the value is still delivered: %', v_msg;
  end if;
  raise notice 'PART 1 PASSED — custom.enrich_due speaks the one ceiling''s sentence: %', v_msg;

  -- A FRESH VALUE IS NOT WORK, decided by the SAME verdict that writes the sentence.
  perform set_config('role', v_boss, true);
  set local session_replication_role = 'replica';
  update custom.record
     set data = jsonb_set(
                  jsonb_set(data, '{_values,summary,at}', to_jsonb((now() - interval '2 days')::text)),
                  '{_values,summary,pinned}', 'false'::jsonb)
   where organization_id = v_org and id = v_rec;
  set local session_replication_role = 'origin';
  perform set_config('role', 'authenticated', true);
  select count(*) into v_n from custom.enrich_due(v_org, v_fld, 50, false);
  if v_n <> 0 then
    raise exception '1d: a two-day-old value inside a 90-day ceiling is listed as due (% rows)', v_n;
  end if;
  raise notice 'PART 1b PASSED — a value inside its ceiling is not work';

  -- ── THE SEAT CANNOT REACH THE ONE FUNCTION, and should not: it is declared server_only
  -- and a person gets its answer inside the door's own reply, never on its own.
  begin
    perform custom.freshness_verdict(now(), 90 * 86400);
    raise exception '1e: a signed-in person reached custom.freshness_verdict directly. It is declared server_only.';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PART 1c PASSED — the seat reaches the ceiling only through a door';

  -- ══ PART 2 — THE PROVENANCE LOG IS KEPT, NOT HOARDED ═══════════════════════════════════
  -- OUT OF THE SEAT ON PURPOSE, and this is the point rather than a shortcut.
  -- `custom.merge_field_provenance` revokes ALL from anon, authenticated and service_role:
  -- it is a server-lane log, not a door, and `custom.provenance_write` /
  -- `custom.provenance_prune` / `custom.provenance_retention_days` are all declared
  -- `server_only` in platform.client_callable_door. A seat that could reach them would be
  -- the defect. PART 2c asserts exactly that from the seat before stepping out.
  begin
    perform custom.provenance_prune(v_org, true, 10);
    raise exception '2c: a signed-in person reached custom.provenance_prune. The retention job is not a door.';
  exception when insufficient_privilege or undefined_function then null;
  end;
  raise notice 'PART 2c PASSED — the seat cannot reach the retention functions';

  perform set_config('role', v_boss, true);

  -- THE SENTENCE THE PERSON READ IS THE ONE FUNCTION'S, character for character. Asserted
  -- here rather than in PART 1 because the seat cannot call it (PART 1c proved that).
  if v_msg is distinct from (custom.freshness_verdict(v_at, 90 * 86400) ->> 'stale_note') then
    raise exception '2z: custom.enrich_due said %, custom.freshness_verdict says % — two implementations again',
      v_msg, custom.freshness_verdict(v_at, 90 * 86400) ->> 'stale_note';
  end if;
  raise notice 'PART 1d PASSED — the door''s sentence IS custom.freshness_verdict''s, character for character';

  v_days := custom.provenance_retention_days(v_org);
  if v_days < history.retention_floor_days(v_org) then
    raise exception '2a: provenance retention (% days) is BELOW the store''s own history floor (% days) — the explanation of a value would be dropped while the value''s history is still kept',
      v_days, history.retention_floor_days(v_org);
  end if;
  raise notice 'PART 2a PASSED — provenance retention is % days, floored by history''s own % days', v_days, history.retention_floor_days(v_org);

  -- Three resolutions of the SAME merge field, and one of another.
  perform custom.provenance_write(v_org, null, 'turn-1',
    jsonb_build_array(
      jsonb_build_object('merge_field_key','refund_policy','declared_source','record','outcome','resolved','freshness','live','tier','direct','rendered','thirty days','candidates','[]'::jsonb,'resolved_at',(now() - interval '400 days')::text),
      jsonb_build_object('merge_field_key','company_name','declared_source','scope','outcome','resolved','freshness','live','tier','direct','rendered','All Green','candidates','[]'::jsonb,'resolved_at',(now() - interval '400 days')::text)));
  perform custom.provenance_write(v_org, null, 'turn-2',
    jsonb_build_array(
      jsonb_build_object('merge_field_key','refund_policy','declared_source','record','outcome','resolved','freshness','live','tier','direct','rendered','sixty days','candidates','[]'::jsonb,'resolved_at',(now() - interval '300 days')::text)));
  perform custom.provenance_write(v_org, null, 'turn-3',
    jsonb_build_array(
      jsonb_build_object('merge_field_key','refund_policy','declared_source','record','outcome','resolved','freshness','live','tier','direct','rendered','ninety days','candidates','[]'::jsonb,'resolved_at',(now() - interval '200 days')::text)));

  select count(*) into v_n from custom.merge_field_provenance where organization_id = v_org;
  if v_n <> 4 then
    raise exception '2b: custom.provenance_write landed % rows, not 4', v_n;
  end if;

  v_out := custom.provenance_prune(v_org, false, 1000);
  if (v_out ->> 'rows_pruned')::int <> 2 then
    raise exception '2d: the prune took % rows, not the 2 that are past retention and not the last of their item — %', v_out ->> 'rows_pruned', v_out;
  end if;

  select count(*) into v_n from custom.merge_field_provenance where organization_id = v_org;
  if v_n <> 2 then
    raise exception '2e: % rows survived, not the 2 last-per-item rows', v_n;
  end if;

  -- "WHAT DID IT RESOLVE TO LAST" STILL ANSWERS, for every item, at any age.
  select rendered into v_msg from custom.merge_field_provenance
   where organization_id = v_org and merge_field_key = 'refund_policy';
  if v_msg is distinct from 'ninety days' then
    raise exception '2f: the surviving refund_policy row is %, not the MOST RECENT one', coalesce(v_msg,'gone');
  end if;
  select count(*) into v_n from custom.merge_field_provenance
   where organization_id = v_org and merge_field_key = 'company_name';
  if v_n <> 1 then
    raise exception '2g: company_name resolved once, 400 days ago, and its only row was deleted. A log with no last row cannot answer DYN-24.';
  end if;
  raise notice 'PART 2 PASSED — 4 rows past retention became 2, one per merge field, each the most recent';

  -- ══ PART 3 — THE JOB THAT ALREADY RUNS APPLIES IT, AND NO NEW SCHEDULE WAS ADDED ═══════
  if pg_get_functiondef('public.prune_high_volume_logs()'::regprocedure) not like '%custom.provenance_prune%' then
    raise exception '3a: public.prune_high_volume_logs does not prune the provenance log, so the retention policy has nobody to run it';
  end if;
  if pg_get_functiondef('public.prune_high_volume_logs()'::regprocedure) not like '%system_enabled%' then
    raise exception '3b: the job does not read custom/system_enabled, so the campaign''s OFF switch does not hold this block';
  end if;
  -- NO NEW SCHEDULE. `no-unapproved-schedules`: a cron job exists only by Arman's approval,
  -- by name and interval. The retention policy joined a job that was already approved and
  -- already running, and added none of its own.
  select count(*) into v_n from cron.job where command ilike '%provenance%';
  if v_n <> 0 then
    raise exception '3c: % cron job(s) name the provenance log. No schedule was approved for it and none should exist.', v_n;
  end if;
  -- SUITES-TIDY 2026-09-22: the JOB and its INTERVAL are the approval, and they are asserted
  -- on every target. Its `active` flag is asserted only where `active` means anything: the
  -- nightly dev clone DEACTIVATES every cron job on purpose — that is what the quarantine IS,
  -- and a clone that kept its parent's schedules running would be a second production sending
  -- real mail. Verified 2026-09-22: production `active = true`, clone `active = false`, same
  -- job, same `7 * * * *`. Keying the clause on `active` made this the only one of the 209
  -- suites that could never pass on a clone, for ever.
  select count(*) into v_n from cron.job
   where jobname = 'prune-high-volume-logs' and schedule = '7 * * * *'
     and (active or current_setting('matrx.db', true) = 'DEV CLONE');
  if v_n <> 1 then
    raise exception '3d: the approved hourly log-retention job is not where it was (jobname prune-high-volume-logs, schedule 7 * * * *, active on every target but the quarantined clone). Nothing runs the policy.';
  end if;
  raise notice 'PART 3 PASSED — the approved hourly job applies the policy and no new schedule exists';

  -- ══ TEARDOWN ══════════════════════════════════════════════════════════════════════════
  -- CATALOG-DRIVEN, not a hand list: `custom.table_declare` and `custom.enrich_declare`
  -- write rows in tables this suite never names (`custom.io_outbox` was the one that
  -- caught it), and a hand list is one feature behind forever. `custom.record` and
  -- `history.migration_log` go LAST because the rest point at them.
  -- TWICE, and that is not superstition: deleting a `custom.record` FIRES THE OUTBOX, so a
  -- single pass that clears `custom.io_outbox` before `custom.record` finds it refilled.
  for v_i in 1..2 loop
  for v_row in
    select rn.nspname as s, rc.relname as t
      from pg_constraint con
      join pg_class rc on rc.oid = con.conrelid
      join pg_namespace rn on rn.oid = rc.relnamespace
     where con.contype = 'f' and con.confrelid = 'iam.organizations'::regclass
       and rn.nspname in ('custom', 'history')
       and rc.relkind in ('r', 'p') and rc.relispartition = false
     order by case when rn.nspname || '.' || rc.relname
                        in ('custom.record', 'history.migration_log') then 1 else 0 end, 1, 2
  loop
    execute format('delete from %I.%I where organization_id = $1', v_row.s, v_row.t) using v_org;
  end loop;
  end loop;
  delete from platform.knob_override where organization_id = v_org;
  delete from iam.memberships where organization_id = v_org;
  delete from iam.organizations where id = v_org;
  select (select count(*) from custom.record where organization_id = v_org)
       + (select count(*) from custom.merge_field_provenance where organization_id = v_org)
       + (select count(*) from iam.organizations where id = v_org) into v_n;
  if v_n <> 0 then
    raise exception 'TEARDOWN: % rows left behind', v_n;
  end if;
  raise notice 'TEARDOWN PASSED — census zero';
  raise notice 'ALL PARTS PASSED';
end;
$suite$;

rollback;
