-- WRITE-PERF-4 WAVE 1 — THE GREEN SUITE. THE MEMO IS FASTER AND IT IS STILL HONEST.
--
-- Wave 1 moved every memoised answer out of one shared 37 KB jsonb blob into one GUC per key.
-- A cache is only worth having if it is never wrong, so this suite asserts the SIX properties the
-- whole wave rests on. Everything happens inside ONE transaction which ROLLS BACK.
--
-- THE REAL USE CASE (2026-09-21 law — no fake test data). Cascade Dental Lab is a crown-and-bridge
-- laboratory in Portland. A case arrives from a dentist's practice with a chart reference, the
-- restoration being made, the shade, the due date and the technician on the bench, and it moves
-- through a short, real lifecycle: Received, Model poured, Waxed, Cast, Glazed, Shipped. The lab
-- adds a status to that list the day it needs one — "Remake requested" is the one this suite
-- adds — and the very next case it files uses it. That is clause 4, and it is not a contrivance:
-- it is what the memo has to survive.
--
-- Run: binlocal/p.sh -f scripts/campaign-tests/writeperf4_green.sql
\set ON_ERROR_STOP on
\set suite 'writeperf4_green.sql'
\set requires 'exec:custom.record_write|exec:custom.table_declare|function:platform.memo_k_get'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local statement_timeout = '120s';
set local lock_timeout = '10s';

-- ── 1 AND 2. THE SLOT ITSELF ────────────────────────────────────────────────────────────────
-- A slot answers inside the statement that wrote it; a NEW statement does not see it (the stamp
-- carries `statement_timestamp()`); and `platform.memo_clear()` empties every slot at once
-- through the generation term, which is the one thing a per-key store otherwise cannot do.
do $t$
declare
  v_same text;
begin
  -- ONE top-level statement: `statement_timestamp()` is the CLIENT statement's clock, so every
  -- SPI query inside this block shares one epoch. That is the design — the memo is scoped to the
  -- statement a person or a door actually issued, however many function calls it makes.
  v_same := platform.memo_k_get('wp4:probe')
              from (select platform.memo_k_put('wp4:probe', 'Cascade Dental Lab') as p) s;
  if v_same is distinct from 'Cascade Dental Lab' then
    raise exception 'CLAUSE 1 FAILED: a slot written and read in the SAME statement answered %', coalesce(v_same, '<null>');
  end if;
  raise notice 'CLAUSE 1a a slot answers inside the statement that wrote it.';
end;
$t$;

do $t$
declare
  v_after text := platform.memo_k_get('wp4:probe');
begin
  -- A NEW top-level statement. The stamp's statement term has moved, so the slot written by the
  -- statement above must not answer this one.
  if v_after is not null then
    raise exception 'CLAUSE 1 FAILED: a slot from the previous statement still answered "%" — the statement term of the stamp is not doing its job', v_after;
  end if;
  raise notice 'CLAUSE 1b and never outside it.';
end;
$t$;

do $t$
declare
  v_cleared text;
begin
  v_cleared := platform.memo_k_get('wp4:probe2')
                 from (select platform.memo_k_put('wp4:probe2','x') as p,
                              platform.memo_clear() as c) s;
  if v_cleared is not null then
    raise exception 'CLAUSE 2 FAILED: platform.memo_clear() did not empty the per-key slot — it still answered "%"', v_cleared;
  end if;
  raise notice 'CLAUSE 2  platform.memo_clear() empties every per-key slot at once.';
end;
$t$;

-- ── 3. THE DDL EVENT TRIGGER IS WHAT MAKES memo_col_flags HONEST ────────────────────────────
do $t$
declare
  v_before text;
  v_after  text;
begin
  create table pg_temp.cdl_bench (case_no text);
  v_before := platform.memo_col_flags('pg_temp.cdl_bench'::regclass, array['case_no','technician']);
  if v_before <> 'tf' then
    raise exception 'CLAUSE 3 SETUP FAILED: expected "tf", got "%"', v_before;
  end if;
  alter table pg_temp.cdl_bench add column technician text;
  v_after := platform.memo_col_flags('pg_temp.cdl_bench'::regclass, array['case_no','technician']);
  if v_after <> 'tt' then
    raise exception 'CLAUSE 3 FAILED: a column added in this transaction was not seen — memo_col_flags still answers "%". The DDL event trigger memo_ddl_forgets_the_shape is what this depends on.', v_after;
  end if;
  raise notice 'CLAUSE 3  a column added mid-transaction is seen: "%" -> "%".', v_before, v_after;
end;
$t$;

-- ── THE LAB ─────────────────────────────────────────────────────────────────────────────────
create temp table wp4_fx (k text primary key, v text) on commit drop;
grant all on wp4_fx to authenticated;

do $t$
declare
  c_admin uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_org uuid; v_home uuid; v_cases uuid; v_opts uuid;
begin
  insert into iam.organizations (name, slug, abbreviation, created_by)
  values ('Cascade Dental Lab', 'cascade-dental-lab-' || substr(md5(random()::text),1,8), 'CDL', c_admin)
  returning id into v_org;
  insert into iam.memberships (organization_id, user_id, role, status, container_type, container_id)
  values (v_org, c_admin, 'owner', 'active', 'organization', v_org);
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value)
  values ('custom','system_enabled','organization', v_org, v_org, 'true');

  perform set_config('app.actor_system','campaign-test/writeperf4_green', true);
  perform set_config('request.jwt.claims',
                     jsonb_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  perform set_config('role','authenticated', true);

  v_home := custom.record_write(v_org, custom.person_kernel_id(),
              jsonb_build_object('name','Cascade Dental Lab — Portland Bench'));

  v_cases := custom.table_declare(v_org, jsonb_build_object(
    'name','Crown & Bridge Cases','slug','cbcases_' || substr(md5(random()::text),1,8),'type','entity',
    'label_singular','Case','label_plural','Crown & Bridge Cases','title_field','case_no','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','case_no')), 'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_cases, jsonb_build_object('label','Case number','key','case_no','type','text'));
  perform custom.field_declare(v_org, v_cases, jsonb_build_object('label','Practice','key','practice','type','text'));
  perform custom.field_declare(v_org, v_cases, jsonb_build_object('label','Restoration','key','restoration','type','text'));
  perform custom.field_declare(v_org, v_cases, jsonb_build_object('label','Shade','key','shade','type','text'));
  perform custom.field_declare(v_org, v_cases, jsonb_build_object('label','Due','key','due','type','datetime'));
  perform custom.field_declare(v_org, v_cases, jsonb_build_object('label','Case status','key','status','type','select',
    'options', jsonb_build_array('Received','Model poured','Waxed','Cast','Glazed','Shipped')));

  -- read as the owner: `custom.record` is not a client table, and the seat above is right to be
  -- refused it. The lab's own writes below all go back through the door.
  reset role;
  select (f.data -> 'config' ->> 'options_table_id')::uuid into v_opts
    from custom.record f
   where f.organization_id = v_org
     and f.table_id = custom.field_kernel_id()
     and (f.data ->> 'entity_definition_id')::uuid = v_cases
     and f.data ->> 'key' = 'status';
  if v_opts is null then
    raise exception 'SETUP FAILED: the Case status field declared no options table';
  end if;

  insert into wp4_fx values ('org', v_org::text), ('home', v_home::text),
                            ('cases', v_cases::text), ('opts', v_opts::text);
end;
$t$;

-- ── 4. A FIELD DECLARED IN THIS TRANSACTION IS SEEN BY THE VERY NEXT WRITE ───────────────────
-- The class WRITE-PERF-3 broke and closed the hard way: a memo that outlives the structure row
-- that changes it refuses a legal write. Still closed, now with one slot per key.
do $t$
declare
  v_org uuid := (select v::uuid from wp4_fx where k='org');
  v_cases uuid := (select v::uuid from wp4_fx where k='cases');
  v_rec uuid;
begin
  perform set_config('request.jwt.claims',
                     jsonb_build_object('sub','87a6e699-3622-4869-8843-d0867456c0dd','role','authenticated')::text, true);
  perform set_config('role','authenticated', true);
  -- warm the memo for this Table, then add a column to it
  perform count(*) from custom.applicable_fields(v_org, v_cases, null);
  perform custom.field_declare(v_org, v_cases, jsonb_build_object('label','Technician','key','technician','type','text'));
  v_rec := custom.record_write(v_org, v_cases, jsonb_build_object(
             'case_no','CDL-2026-0411','practice','Alder Street Dental','restoration','Zirconia crown #14',
             'shade','A2','due','2026-09-29T09:00:00','status','Waxed','technician','Bench 3 — waxer'));
  if v_rec is null then
    raise exception 'CLAUSE 4 FAILED: the write returned nothing';
  end if;
  raise notice 'CLAUSE 4  a Field declared after the memo was warmed is seen by the next write.';
end;
$t$;

-- ── 5. A CHOICE ADDED IN ONE STATEMENT IS ACCEPTED BY NAME IN THAT SAME STATEMENT ────────────
-- THE `choice_options` GAP, PROVED CLOSED. `custom.choice_options` is memoised per options table
-- now, and every memo slot's stamp carries `statement_timestamp()` — which does NOT move between
-- the two writes below, because they are ONE statement. The only thing that saves this write is
-- `_aa_memo_clear` dropping the `co:` key for the options table as the option row goes in.
-- `scripts/campaign-tests/writeperf4_red.sql` is this same block with that drop taken out.
do $t$
declare
  v_org uuid := (select v::uuid from wp4_fx where k='org');
  v_cases uuid := (select v::uuid from wp4_fx where k='cases');
  v_opts uuid := (select v::uuid from wp4_fx where k='opts');
  v_rec uuid;
begin
  perform set_config('request.jwt.claims',
                     jsonb_build_object('sub','87a6e699-3622-4869-8843-d0867456c0dd','role','authenticated')::text, true);
  perform set_config('role','authenticated', true);
  -- warm the options memo for this options table first, so the test is about STALENESS
  -- ONE top-level statement, three writes in the lab's own order — a case on an existing status
  -- (which is what FILLS the options slot), then the new status, then a case that uses it. The
  -- subqueries run inside out, so the order is the lab's and not the planner's taste. The memo's
  -- statement term cannot save this: all three share one `statement_timestamp()`.
  select custom.record_write(v_org, v_cases, jsonb_build_object(
           'case_no','CDL-2026-0412','practice','Sellwood Family Dentistry',
           'restoration','PFM bridge #19-21','shade','B1','due','2026-10-02T09:00:00',
           'status','Remake requested'))
    into v_rec
    from (select custom.record_write(v_org, v_opts,
                   jsonb_build_object('title','Remake requested')) as o
            from (select custom.record_write(v_org, v_cases, jsonb_build_object(
                           'case_no','CDL-2026-0410','practice','Alder Street Dental',
                           'restoration','Emax veneer #8','shade','A1',
                           'due','2026-09-30T09:00:00','status','Waxed')) as a) t) s;
  if v_rec is null then
    raise exception 'CLAUSE 5 FAILED: the case write returned nothing';
  end if;
  raise notice 'CLAUSE 5  a choice added and used in ONE statement is accepted by name.';
end;
$t$;

-- ── 6. THE DOOR'S YES IS NOT SHARED BETWEEN SEATS ────────────────────────────────────────────
-- The slot's stamp carries role, request.jwt.claims, session_user AND current_user. A yes given
-- to the owner is never handed to somebody who is not a member.
do $t$
declare
  v_org uuid := (select v::uuid from wp4_fx where k='org');
  v_cases uuid := (select v::uuid from wp4_fx where k='cases');
  v_msg text;
begin
  -- ONE statement: the owner's yes is cached, then a stranger takes the seat. A memo slot lives
  -- for the statement that wrote it, so this has to be one block or it proves nothing.
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform custom.assert_client_may_reach(v_org, 'writeperf4_green');   -- the owner's yes, cached

  perform set_config('request.jwt.claims',
                     jsonb_build_object('sub', gen_random_uuid(), 'role','authenticated')::text, true);
  perform set_config('role','authenticated', true);
  begin
    -- through the client door, because `custom.assert_client_may_reach` is not a client function
    perform custom.record_write(v_org, v_cases, jsonb_build_object('case_no','CDL-2026-0413'));
    raise exception 'CLAUSE 6 FAILED: a stranger wrote into the organization — the owner''s cached yes was handed to another seat';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg like 'CLAUSE 6 FAILED%' then raise; end if;
    if v_msg not like '%not a member of that organization%' then
      raise exception 'CLAUSE 6 FAILED: refused, but with "%" rather than the membership refusal', v_msg;
    end if;
  end;
  reset role;
  raise notice 'CLAUSE 6  a yes cached for one seat is refused to another: "%"', v_msg;
end;
$t$;

do $t$ begin raise notice 'writeperf4_green: ALL 6 CLAUSES PASSED.'; end $t$;
rollback;
