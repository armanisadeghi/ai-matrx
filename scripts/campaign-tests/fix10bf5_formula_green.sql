-- FIX-10B-F5 — THE GREEN SUITE. A WORKED-OUT COLUMN ANSWERS, OR IT IS REFUSED BY NAME.
--
-- RUN IT (against the MAIN database, or the rehearsal branch — this is where the store lives):
--   "$PSQL" "<the five SUPABASE_MATRIX_* values>" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/fix10bf5_formula_green.sql
--
-- IT IS NOT A MIGRATION and never becomes one: it lives outside `migrations/`.
--
-- WHAT IT PROVES. VERIFIER-10's finding F5: on Rincon Plumbing Co's "Truck 1 dispatch
-- backlog", a column added through Add field -> "Worked out from other columns" -> "Join them
-- together" read `—` on all 100 rows, before a write, after a write to a source column, and
-- after a reload. The diagnosis (2026-09-22, on the main database) found the evaluator
-- innocent and two separate causes of the same silent blank:
--
--   · the PANEL stored `{"op":"concat","args":[{"const":""}]}` — a formula reading no column —
--     because `whatIsMissing` waved a worked-out column with nothing picked straight through.
--     That half belongs to the screen (only the screen knows a person was asked and answered
--     nothing; a trivial expression is legitimate here, because a compute Rule can be the
--     thing that fills the column) and is guarded in `@ai-matrx/records-ui` by
--     `src/a-worked-out-column-reads-the-columns-you-picked.test.tsx`.
--   · the STORE accepted a formula naming its columns BY NAME, or naming a column that is not
--     in the organization at all. `custom.rule_eval` then refuses it on every single read
--     (REC-17), `custom.derived_value` swallows that refusal into a server warning nobody
--     reads, and the column is `—` for the rest of its life. Three such columns were live on
--     the main database when this was written. THAT half is what this suite is about.
--
-- PARTS: 0 the seat · 1 a worked-out column built by id ANSWERS · 2 a column named by name is
-- refused · 3 a column not in this organization is refused · 4 the same refusal through the
-- retype door · 5 a trivial expression is still accepted, so a Rule-computed column still works.
--
-- ITS RED TWIN is `fix10bf5_formula_red.sql`, which executes the real bytes of
-- `migrations/inverse/fix10bf5_a_worked_out_column_names_columns_that_exist_down.sql` inside a
-- rolled-back transaction and requires parts 2, 3 and 4 to fail.
--
-- THE DATA IS A REAL USE CASE, throughout: Rincon Plumbing Co's office building the ticket
-- label their dispatcher reads down the Truck 1 board — the job number and the service address,
-- joined, on real Ventura-County streets. Nothing is committed and nobody's records are touched.

\set ON_ERROR_STOP on
\timing off

\set suite 'fix10bf5_formula_green.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

\set ORG   '\'7e10b5f0-0000-4a00-8a00-000000000001\''
\set ADMIN '\'87a6e699-3622-4869-8843-d0867456c0dd\''

begin;
set local statement_timeout = '60s';
set local lock_timeout = '10s';
select set_config('app.actor_system', 'campaign-test/fix10bf5_green', true);

delete from iam.permissions where resource_type = 'record'
   and resource_id in (select id from custom.record where organization_id = :ORG);
delete from platform.associations where organization_id = :ORG;
delete from custom.record where organization_id = :ORG;
delete from platform.knob_override where organization_id = :ORG;
delete from iam.memberships where organization_id = :ORG;
delete from iam.organizations where id = :ORG;

insert into iam.organizations (id, name, slug, abbreviation, created_by)
values (:ORG, 'FIX-10B-F5 Green Throwaway', 'fix10bf5-green-throwaway', 'F5G', :ADMIN);
insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
values (:ORG, 'organization', :ORG, :ADMIN, 'owner', 'active');
insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
values ('custom', 'system_enabled', 'organization', :ORG, :ORG, 'true'::jsonb, 'FIX-10B-F5 green suite');

do $t$
declare
  v_org     constant uuid := '7e10b5f0-0000-4a00-8a00-000000000001';
  v_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_admin_j text;
  v_home uuid; v_tbl uuid; v_job uuid; v_addr uuid; v_label uuid; v_rec uuid;
  v_seen text; v_msg text; v_hint text; v_ghost uuid := '3014b868-2c69-434c-87ed-d7bf9df14be3';
begin
  c_admin_j := json_build_object('sub', v_admin::text, 'role', 'authenticated', 'email', 'admin@admin.com')::text;

  -- ══════════════════════════════ PART 0 — take the seat and PROVE it
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this suite did not take the seat — current_user is %', current_user;
  end if;
  begin
    perform 1 from custom.record limit 1;
    raise exception '0: this seat can SELECT custom.record directly, so it is not a client seat';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PART 0 PASSED — seated as %, and custom.record refuses it directly', current_user;

  -- ══════════════════════════════ the fixture, through the product's own doors
  v_home := custom.record_write(v_org, custom.organization_kernel_id(),
                                jsonb_build_object('name', 'Rincon Plumbing Co'));
  v_tbl  := custom.table_declare(v_org, jsonb_build_object(
    'name','truck_1_dispatch_backlog','slug','truck_1_dispatch_backlog',
    'label_singular','Ticket','label_plural','Tickets',
    'type','entity','display','list','ordered',false,'weight','light','retention_days',30,
    'default_sort','[]'::jsonb,'row_order','sorted','agent_writable',true,
    'fields', jsonb_build_array(jsonb_build_object('name','title','kind','text')),
    'title_field','title','parent_id', v_home::text));
  v_job  := custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Job Number','type','text','sort',30));
  v_addr := custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Service Address','type','text','sort',40));
  v_rec  := custom.record_write(v_org, v_tbl, jsonb_build_object(
    'title','RPC-T1-7000', 'job_number','RPC-T1-7000', 'service_address','100 Ventura Ave, Ventura'));

  -- ══════════════════════════════ PART 1 — BUILT BY ID, IT ANSWERS.
  -- The positive control, and the one clause that would have caught F5 if it had existed: a
  -- worked-out column whose expression names its two columns by their ids reads the joined
  -- value off a real ticket, through the ordinary read door, with no write to it at all.
  v_label := custom.field_declare(v_org, v_tbl, jsonb_build_object(
    'label','Ticket label','parity_type','formula','compute_on','read','sort',50,
    'expr', jsonb_build_object('op','concat','args', jsonb_build_array(
              jsonb_build_object('field', v_job),
              jsonb_build_object('const', ' — '),
              jsonb_build_object('field', v_addr)))));
  select custom.read_record(v_org, v_rec, true) -> 'document' ->> 'ticket_label' into v_seen;
  if v_seen is distinct from 'RPC-T1-7000 — 100 Ventura Ave, Ventura' then
    raise exception '1: a worked-out column built from two real columns by id reads % on the read door, and the dispatcher should see "RPC-T1-7000 — 100 Ventura Ave, Ventura"',
                    custom.said(v_seen, 'nothing at all');
  end if;
  raise notice 'PART 1 PASSED — the column answers "%" on the read door', v_seen;

  -- ══════════════════════════════ PART 2 — NAMED BY NAME, IT IS REFUSED BY NAME.
  -- REC-17 has always said "by id, never by name" and `custom.rule_eval` has always enforced
  -- it — at EVALUATION, where the only person who can hear it is whoever reads the server log.
  begin
    perform custom.field_declare(v_org, v_tbl, jsonb_build_object(
      'label','Shouty','parity_type','formula','compute_on','read','sort',60,
      'expr', jsonb_build_object('op','concat','args', jsonb_build_array(
                jsonb_build_object('field','job_number')))));
    raise exception '2: a worked-out column naming its source column BY NAME was created; it would read — on every ticket forever and say so only in a server log';
  exception when others then
    get stacked diagnostics v_msg = message_text, v_hint = pg_exception_hint;
    if v_msg like '2:%' then raise; end if;
    if v_msg not like '%Shouty%' or v_msg not like '%name rather than a column%' then
      raise exception '2: it was refused, but not about this: %', v_msg;
    end if;
    if v_hint not like '%REC-17%' then
      raise exception '2: the refusal does not say how to fix it: %', custom.said(v_hint, 'no hint at all');
    end if;
  end;
  raise notice 'PART 2 PASSED — refused: %', v_msg;

  -- ══════════════════════════════ PART 3 — A COLUMN THAT IS NOT HERE IS REFUSED.
  -- The third live sibling the census found ("Doubled"): a well-formed id naming a Field that
  -- is not in this organization. `custom.rule_eval` raises 23503 on every read; the column is
  -- blank forever.
  begin
    perform custom.field_declare(v_org, v_tbl, jsonb_build_object(
      'label','Doubled','parity_type','formula','compute_on','read','sort',70,
      'expr', jsonb_build_object('op','concat','args', jsonb_build_array(
                jsonb_build_object('field', v_ghost)))));
    raise exception '3: a worked-out column naming a field that is not in this organization was created';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg like '3:%' then raise; end if;
    if v_msg not like '%Doubled%' or v_msg not like '%not in this organization%' then
      raise exception '3: it was refused, but not about this: %', v_msg;
    end if;
  end;
  raise notice 'PART 3 PASSED — refused: %', v_msg;

  -- ══════════════════════════════ PART 4 — AND THROUGH THE RETYPE DOOR TOO.
  -- The whole reason this guard is on the trigger and not inside `custom.field_declare`: a
  -- check in one door leaves every other writer open. `custom.field_update`'s behaviour arm
  -- rebuilds the document through `custom._field_document_for` and writes it, so it arrives
  -- here as well — as do a table spec's inline fields and an import's new columns.
  begin
    perform custom.field_update(v_org, v_label, jsonb_build_object(
      'parity_type','formula',
      'expr', jsonb_build_object('op','concat','args', jsonb_build_array(
                jsonb_build_object('field','service_address')))));
    raise exception '4: the retype door re-pointed a worked-out column at a NAME and the store took it';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg like '4:%' then raise; end if;
    if v_msg not like '%name rather than a column%' then
      raise exception '4: it was refused, but not about this: %', v_msg;
    end if;
  end;
  -- and the column it tried to break still answers exactly what it answered in part 1.
  select custom.read_record(v_org, v_rec, true) -> 'document' ->> 'ticket_label' into v_seen;
  if v_seen is distinct from 'RPC-T1-7000 — 100 Ventura Ave, Ventura' then
    raise exception '4: the refused retype left the column reading %', custom.said(v_seen, 'nothing');
  end if;
  raise notice 'PART 4 PASSED — the retype door refuses it too, and the column is untouched';

  -- ══════════════════════════════ PART 5 — AND NOTHING HONEST WAS REFUSED WITH IT.
  -- 🚨 THE CLAUSE THAT KEEPS THIS GUARD FROM BECOMING ITS OWN DEFECT. A formula column whose
  -- expression is trivial is LEGITIMATE: a compute Rule with `target_field_id` can be the
  -- thing that works it out, and `scripts/campaign-tests/w1_rule_apply.sql` declares exactly
  -- that pair deliberately. A guard that demanded a field leaf here would have turned this
  -- lane's fix into somebody else's outage — which is why the panel, not the store, refuses
  -- "the person picked no columns".
  if custom.field_declare(v_org, v_tbl, jsonb_build_object(
       'label','Filled by a rule','parity_type','formula','compute_on','write','sort',80,
       'expr', jsonb_build_object('const',''))) is null then
    raise exception '5: a worked-out column meant to be filled by a Rule could not be declared';
  end if;
  raise notice 'PART 5 PASSED — a Rule-filled worked-out column is still declarable';

  raise notice 'ALL PARTS PASSED (0 seat, 1 it answers, 2 by-name refused, 3 absent-column refused, 4 the retype door, 5 nothing honest refused)';
end $t$;

rollback;
