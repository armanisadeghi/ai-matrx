-- STORE-ASOF — THE GREEN SUITE. The four things this lane made answerable, asked out loud.
--
-- RUN IT (against the MAIN database — this is where the store lives):
--   PSQL="$(pnpm -s exec tsx scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the five SUPABASE_MATRIX_* values>" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/asof_green.sql
--
-- IT IS NOT A MIGRATION and never becomes one: it lives outside `migrations/` and is
-- discovered by no sweep.
--
-- WHY IT IS NOT ONE ROLLED-BACK TRANSACTION. Part 3 asks "who could see this on a date, and
-- for how long", and history stamps every row with the TRANSACTION timestamp. Inside one
-- transaction a share and its revocation share a timestamp to the microsecond and there is no
-- "between" to ask about. So this suite runs REAL transactions against ONE THROWAWAY
-- organization with fixed ids and deletes it at the end. Step 0 deletes it FIRST as well, so a
-- run that died half way leaves nothing for the next one, and the last block is a CENSUS that
-- fails unless every trace is gone.
--
-- THE IDENTITIES. `admin@admin.com` owns the throwaway organization; `test@test.com` (Dana) is
-- a plain MEMBER of it. Nobody's own records are touched: everything under test is created by
-- this file inside an organization this file created. It signs nobody in and reads no
-- credential.
--
-- ITS RED TWIN is `asof_red.sql`, which puts the pre-STORE-ASOF bodies back inside a
-- rolled-back transaction and proves each of these answers was wrong, missing or unaskable.

\set ON_ERROR_STOP on
\timing off

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'asof_green.sql'
\set requires 'relation:custom.io_outbox'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

\set ORG   '\'a50f0000-0000-4a00-8a00-000000000a01\''
\set ADMIN '\'87a6e699-3622-4869-8843-d0867456c0dd\''
\set DANA  '\'4060701e-706a-4c76-b3ca-0bbc69fa5a14\''
\set HQ    '\'a50f0000-0000-4a00-8a00-000000000101\''
\set TBL   '\'a50f0000-0000-4a00-8a00-000000000201\''
\set REC   '\'a50f0000-0000-4a00-8a00-000000000301\''
\set FLD   '\'a50f0000-0000-4a00-8a00-000000000701\''
\set DEEP1 '\'a50f0000-0000-4a00-8a00-000000001001\''
\set GRANT '\'a50f0000-0000-4a00-8a00-000000009901\''

-- NO TEMP TABLE CARRIES STATE BETWEEN THESE TRANSACTIONS: this database is reached through the
-- transaction-mode pooler, where every transaction may land on a different backend. Every
-- fixture id is FIXED, and the moments Part 3 asks about are read back out of history itself.

-- ══════════════════════════════════════════════════ STEP 0 — a clean slate, both ways
begin;
set local statement_timeout = '60s';
set local lock_timeout = '10s';
select set_config('app.actor_system', 'asof_green_suite', true);
delete from iam.permissions where id = :GRANT;
delete from iam.permissions where resource_type = 'record'
   and resource_id in (select id from custom.record where organization_id = :ORG);
delete from platform.reachability where origin = 'store-asof-test';
delete from platform.associations where organization_id = :ORG;
delete from custom.record where organization_id = :ORG;
delete from custom.field where organization_id = :ORG;
delete from custom.io_outbox where organization_id = :ORG;
delete from custom.io_comment where organization_id = :ORG;
delete from custom.record_alias where organization_id = :ORG;
delete from custom.merge_field_provenance where organization_id = :ORG;
delete from custom.visibility_epoch where organization_id = :ORG;
delete from custom.organization_visibility_version where organization_id = :ORG;
delete from custom.external_link where organization_id = :ORG;
delete from custom.external_source where organization_id = :ORG;
delete from history.migration_log where organization_id = :ORG;
-- this suite's own history, so a previous run's share is never counted as this one's
delete from history.row_versions where entity_type = 'iam.permissions' and row_id = :GRANT;
delete from history.row_versions where organization_id = :ORG;
delete from platform.knob_override where organization_id = :ORG;
delete from iam.memberships where organization_id = :ORG;
delete from iam.organizations where id = :ORG;

insert into iam.organizations (id, name, slug, abbreviation, created_by)
values (:ORG, 'Rincon Plumbing Co', 'rincon-plumbing-asof', 'RPC', :ADMIN);
insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
values (:ORG, 'organization', :ORG, :ADMIN, 'owner',  'active'),
       (:ORG, 'organization', :ORG, :DANA,  'member', 'active');
-- The store is ON for this organization, so history records what it does (GUARD-SWITCH).
-- Membership alone shows nothing, so a SHARE is the only thing that could ever have let Dana
-- see the record — which is what makes Part 3's "and then she lost it" mean anything.
-- And the containment ceiling is raised to 24, which REC-N-4 allows an organization to do and
-- which is exactly how a real path outruns the parity walk's 16 hops.
insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
values ('custom', 'system_enabled',             'organization', :ORG, :ORG, 'true'::jsonb,           'STORE-ASOF green suite'),
       ('custom', 'member_default_visibility',  'organization', :ORG, :ORG, '"shared_only"'::jsonb,  'STORE-ASOF green suite'),
       ('custom', 'containment_depth_ceiling',  'organization', :ORG, :ORG, '24'::jsonb,             'STORE-ASOF green suite');
commit;

-- ═══════════════════════════════════════════════════════ STEP 1 — the fixtures
begin;
set local statement_timeout = '60s';
set local lock_timeout = '10s';
select set_config('app.actor_system', 'asof_green_suite', true);
do $t$
declare
  v_org   constant uuid := 'a50f0000-0000-4a00-8a00-000000000a01';
  v_korg  constant uuid := '11111111-0000-4000-8000-000000000004';
  v_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_hq    constant uuid := 'a50f0000-0000-4a00-8a00-000000000101';
  v_tbl   constant uuid := 'a50f0000-0000-4a00-8a00-000000000201';
  v_rec   constant uuid := 'a50f0000-0000-4a00-8a00-000000000301';
  v_fld   constant uuid := 'a50f0000-0000-4a00-8a00-000000000701';
  t uuid; v_prev uuid; v_id uuid; i int;
begin
  insert into custom.record (id, organization_id, table_id, data_class, data, created_by)
  values (v_hq, v_org, v_korg, 'record', jsonb_build_object('name', 'STORE-ASOF HQ'), v_admin);

  t := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Contract', 'slug', 'asof_contract', 'label_singular', 'Contract', 'label_plural', 'Contracts',
    'type', 'entity', 'display', 'list', 'ordered', false, 'weight', 'light', 'retention_days', 30,
    'default_sort', '[]'::jsonb, 'row_order', 'sorted', 'agent_writable', true,
    'fields', jsonb_build_array(jsonb_build_object('name', 'title', 'kind', 'text'),
                                jsonb_build_object('name', 'terms', 'kind', 'text')),
    'title_field', 'title', 'parent_id', v_hq::text));
  -- The Table gets a FIXED id so later transactions need no lookup (the pooler gives this
  -- suite no session state to carry one in).
  if t is distinct from v_tbl then
    update custom.record set id = v_tbl where organization_id = v_org and id = t;
    update custom.record set data = data || jsonb_build_object('entity_definition_id', v_tbl::text)
     where organization_id = v_org and table_id = custom.field_kernel_id()
       and (data ->> 'entity_definition_id')::uuid = t;
    update custom.field set entity_definition_id = v_tbl where organization_id = v_org and entity_definition_id = t;
  end if;

  -- THE DATED FIELD. HIS-5 is opt-in per Field: without this, a period on `terms` is refused.
  -- 🚨 DECLARED THROUGH THE DOOR, then re-pointed to its fixed id (lane RED-SUITES-2,
  -- 2026-09-21). This used to INSERT the Field row straight into the `custom.field` view, and
  -- the document that produced no longer carries `dated`, so `custom._dated_values_guard`
  -- refused the very record this suite exists to write: "terms keeps a single value, so it
  -- cannot be given dates it was true between." The column was never dated at all. Declaring
  -- it through `custom.field_declare` — which builds the document with
  -- `custom._field_document_for`, the one builder — is what makes `dated` real, and it is the
  -- same repair the doorfix twins needed. The id is then moved to this suite's fixed one the
  -- same way the Table above moves to its own, because the pooler gives this suite no session
  -- state to carry a lookup in.
  declare v_made uuid;
  begin
    v_made := custom.field_declare(v_org, v_tbl, jsonb_build_object(
      'key','terms','label','Terms','plain','text','dated',true,'sort',10));
    if v_made is distinct from v_fld then
      update custom.record set id = v_fld
       where organization_id = v_org and id = v_made and table_id = custom.field_kernel_id();
    end if;
  end;
  -- Read straight off the row: this is fixture work as the connected role, before the seat is
  -- taken, and the point is what the STORE holds rather than what a door shows.
  if not coalesce((select (r.data ->> 'dated')::boolean from custom.record r
                    where r.organization_id = v_org and r.id = v_fld), false) then
    raise exception 'fixture: the Terms column was declared dated and the store does not say so — %',
      (select r.data from custom.record r where r.organization_id = v_org and r.id = v_fld);
  end if;

  -- T6's CONTRACT: storable today, in force 2027-01-01 .. 2029-01-01, and nothing else. Its
  -- title is an UNDATED key, which is the half that used to vanish from its own history.
  insert into custom.record (id, organization_id, table_id, data_class, data, created_by)
  values (v_rec, v_org, v_tbl, 'record',
          jsonb_build_object('title', 'ABC 2027 supply contract', 'terms', 'gold',
            '_values', jsonb_build_object('terms', jsonb_build_object('dated',
              jsonb_build_array(jsonb_build_object('from', '2027-01-01', 'to', '2029-01-01', 'value', 'gold'))))),
          v_admin);

  -- T1's DEEP CHAIN: eighteen records inside one another. REC-N-4 lets an organization raise
  -- its containment ceiling to 32, so this is a path a real organization can legally build —
  -- and it is two hops longer than the parity walk can see.
  v_prev := v_hq;
  for i in 1..18 loop
    v_id := ('a50f0000-0000-4a00-8a00-0000000010' || lpad(i::text, 2, '0'))::uuid;
    insert into custom.record (id, organization_id, table_id, data_class, data, created_by)
    values (v_id, v_org, v_tbl, 'record',
            jsonb_build_object('title', 'deep ' || i, 'parent_id', v_prev::text), v_admin);
    v_prev := v_id;
  end loop;
end $t$;
-- The stored closure has to name the top of the chain for the walk to enter it at all: the
-- parity walk starts from the containers `platform.reachability` already holds. One row,
-- stamped with this suite's own origin so teardown can find it by name.
insert into platform.reachability (container_type, container_id, item_type, item_id, depth, max_level, origin)
values ('record', :HQ, 'record', :DEEP1, 1, 'admin', 'store-asof-test')
on conflict do nothing;
commit;

-- ════════════════════════════════ PART 1 — T13: ONE RECORD IS ONE QUESTION
begin;
set local statement_timeout = '60s';
do $t$
declare
  v_org  constant uuid := 'a50f0000-0000-4a00-8a00-000000000a01';
  v_dana constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  v_rec  constant uuid := 'a50f0000-0000-4a00-8a00-000000000301';
  v_body text;
  v_bad  int;
begin
  -- 1a — THE ANSWER IS UNCHANGED, record by record. The cheap shape is only a fix if it
  --      agrees with the ladder on every row, so it is asked about every row.
  -- Dana is the principal for the next statement; the wall still admits this connection
  -- because it owns the store, so what is being compared is the LADDER's answer against the
  -- DOOR's answer for the same person, record by record.
  perform set_config('request.jwt.claims', '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14"}', true);
  select count(*) into v_bad
    from custom.record r
   where r.organization_id = v_org and r.deleted_at is null
     and custom.has_visibility(v_dana, 'record', r.id, 'viewer')
         is distinct from custom.query_can_see(v_org, r.id, 'viewer');
  perform set_config('request.jwt.claims', '', true);
  if v_bad > 0 then
    raise exception '1a FAILED — % record(s) where the one-record door and the ladder disagree.', v_bad;
  end if;

  -- 1b — AND IT NO LONGER ASKS ABOUT THE WHOLE ORGANIZATION. The shape claim, read out of the
  --      catalogue rather than promised in a comment: the body must not reach the
  --      list-everything door.
  v_body := regexp_replace(pg_get_functiondef('custom.query_can_see(uuid,uuid,text)'::regprocedure),
                           '--[^' || chr(10) || ']*', '', 'g');
  if v_body ~* 'custom\.query_visible_ids' then
    raise exception '1b FAILED — custom.query_can_see reaches custom.query_visible_ids again, so a question about one record is a walk of the whole organization again.';
  end if;
  if v_body !~* 'custom\.has_visibility' then
    raise exception '1b FAILED — custom.query_can_see no longer reaches the one ladder.';
  end if;

  raise notice 'PART 1 PASSED — T13: one record is one question, and it answers the same as the ladder on every row.';
end $t$;
commit;

-- ═══════════════════════ PART 2 — T6: THE TWO CLOCKS NEVER ANSWER FOR EACH OTHER
begin;
set local statement_timeout = '60s';
do $t$
declare
  v_org constant uuid := 'a50f0000-0000-4a00-8a00-000000000a01';
  v_rec constant uuid := 'a50f0000-0000-4a00-8a00-000000000301';
  d jsonb;
begin
  -- 2a — TODAY. The contract does not take effect until 2027, so today it is NOT the record's
  --      present terms — and the record says WHEN it starts instead of saying nothing.
  d := custom.query_record_as_of(v_org, v_rec, null, null);
  if d -> 'terms' <> 'null'::jsonb then
    raise exception '2a FAILED — a contract that starts in 2027 answers today as %.', d -> 'terms';
  end if;
  if d #>> '{_effective,terms,state}' is distinct from 'not_yet' then
    raise exception '2a FAILED — today the contract should read not_yet, it reads %.', d #>> '{_effective,terms,state}';
  end if;
  if d #>> '{_effective,terms,from}' is distinct from '2027-01-01' then
    raise exception '2a FAILED — the record is visible now but does not carry its effective date (got %).', d #>> '{_effective,terms,from}';
  end if;
  if d ->> 'title' is distinct from 'ABC 2027 supply contract' then
    raise exception '2a FAILED — the record lost its own name.';
  end if;

  -- 2b — AS OF 2027-03-01. The contract is in force, with both of its dates, and the record
  --      still has its own name: an undated key has no world clock, so a world date cannot
  --      blank it.
  d := custom.query_record_as_of(v_org, v_rec, null, '2027-03-01');
  if d ->> 'terms' is distinct from 'gold' then
    raise exception '2b FAILED — as of 2027-03-01 the terms read % rather than gold.', d ->> 'terms';
  end if;
  if d #>> '{_effective,terms,state}' is distinct from 'in_force'
     or d #>> '{_effective,terms,from}' is distinct from '2027-01-01'
     or d #>> '{_effective,terms,to}'   is distinct from '2029-01-01' then
    raise exception '2b FAILED — the in-force answer does not carry its period: %.', d -> '_effective';
  end if;
  if d ->> 'title' is distinct from 'ABC 2027 supply contract' then
    raise exception '2b FAILED — asking what was true on a date deleted the record''s own name from its own answer.';
  end if;

  -- 2c — BEFORE IT STARTS AND AFTER IT ENDS ARE DIFFERENT ANSWERS, and neither is the value.
  d := custom.query_record_as_of(v_org, v_rec, null, '2026-06-01');
  if d #>> '{_effective,terms,state}' is distinct from 'not_yet' or d -> 'terms' <> 'null'::jsonb then
    raise exception '2c FAILED — as of 2026-06-01 the contract is not yet in force and must answer so; it answered %.', d -> '_effective';
  end if;
  d := custom.query_record_as_of(v_org, v_rec, null, '2030-01-01');
  if d #>> '{_effective,terms,state}' is distinct from 'no_longer' or d -> 'terms' <> 'null'::jsonb then
    raise exception '2c FAILED — as of 2030-01-01 the contract has ended and must answer so; it answered %.', d -> '_effective';
  end if;
  if d #>> '{_effective,terms,to}' is distinct from '2029-01-01' then
    raise exception '2c FAILED — the ended answer does not say when it ended.';
  end if;

  raise notice 'PART 2 PASSED — T6: a 2027 contract is storable today, absent from every as-of query before 2027, in force in 2027, and the record keeps its name throughout.';
end $t$;
commit;

-- ══════════════ PART 3 — T15: A SHARE IS RECORDED, AND THE AUDIT SAYS HOW LONG
-- Three REAL transactions, because the interval is the point and a transaction has one clock.
begin;
set local statement_timeout = '60s';
select set_config('app.actor_system', 'asof_green_suite', true);
insert into iam.permissions (id, resource_type, resource_id, granted_to_user_id, permission_level, status, created_by)
values (:GRANT, 'record', :REC, :DANA, 'viewer', 'active', :ADMIN);
commit;

-- she can see it now, and only because of that share (membership alone shows nothing here)
do $t$
begin
  if not custom.has_visibility('4060701e-706a-4c76-b3ca-0bbc69fa5a14', 'record',
                               'a50f0000-0000-4a00-8a00-000000000301', 'viewer') then
    raise exception '3a FAILED — the share did not give her the record, so nothing that follows means anything.';
  end if;
end $t$;

begin;
set local statement_timeout = '60s';
select set_config('app.actor_system', 'asof_green_suite', true);
delete from iam.permissions where id = :GRANT;
commit;

begin;
set local statement_timeout = '60s';
do $t$
declare
  v_org   constant uuid := 'a50f0000-0000-4a00-8a00-000000000a01';
  v_rec   constant uuid := 'a50f0000-0000-4a00-8a00-000000000301';
  v_dana  constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  v_grant constant uuid := 'a50f0000-0000-4a00-8a00-000000009901';
  v_in    timestamptz;
  v_share timestamptz;
  v_rev   timestamptz;
  r       record;
  n       int;
begin
  -- 3b — SHE HAS SINCE LOST ACCESS. That is the premise of the question.
  if custom.has_visibility(v_dana, 'record', v_rec, 'viewer') then
    raise exception '3b FAILED — the revoke did not take her access away.';
  end if;

  -- 3c — BOTH HALVES OF THE SHARE REACHED HISTORY, filed under THIS organization. Before this
  --      lane the capture asked whether the PLATFORM's store switch was on — it is not, and
  --      cannot be turned on per organization — so the row was written under no organization
  --      at all when it was written at all.
  select count(*) into n from history.row_versions
   where entity_type = 'iam.permissions' and row_id = v_grant;
  if n <> 2 then raise exception '3c FAILED — the share and its revocation left % history row(s), expected 2.', n; end if;
  select count(*) into n from history.row_versions
   where entity_type = 'iam.permissions' and row_id = v_grant and organization_id = v_org;
  if n <> 2 then raise exception '3c FAILED — % of 2 grant history rows carry this organization.', n; end if;

  select min(occurred_at), max(occurred_at) into v_share, v_rev
    from history.row_versions where entity_type = 'iam.permissions' and row_id = v_grant;
  v_in := v_share + interval '1 microsecond';

  -- 3d — AND THE AUDIT NAMES HER, at the moment in between, WITH THE INTERVAL SHE HAD IT.
  select * into r from custom.visibility_as_of(v_org, v_rec, v_in) a
   where a.principal_id = v_dana and a.through_kind = 'grant';
  if r is null then
    raise exception '3d FAILED — "who could see this then" does not name the person who was shared on it and has since lost it. That is the whole of T15.';
  end if;
  if r.held_from is distinct from v_share then
    raise exception '3d FAILED — held_from is % and the share was written at %.', r.held_from, v_share;
  end if;
  if r.held_to is distinct from v_rev then
    raise exception '3d FAILED — held_to is % and the revocation was written at %.', r.held_to, v_rev;
  end if;
  if not r.replayed then raise exception '3d FAILED — the grant arm claims it was not replayed.'; end if;

  -- 3e — AND AN OPEN INTERVAL MEANS OPEN. The record's owner never lost it, so held_to is null.
  select * into r from custom.visibility_as_of(v_org, v_rec, v_in) a
   where a.through_kind = 'ownership';
  if r.held_to is not null then
    raise exception '3e FAILED — the owner''s reach is reported as having ended at %.', r.held_to;
  end if;

  raise notice 'PART 3 PASSED — T15: a share and its revocation are both recorded under this organization, and the audit names the person who has since lost access, from % to %.', v_share, v_rev;
end $t$;
commit;

-- ═════════ PART 4 — T1: THE CUTOVER DIFF IS HONEST ABOUT ITS DEPTH, AND A PERSON CAN RUN IT
begin;
set local statement_timeout = '60s';
do $t$
declare
  v_org   constant uuid := 'a50f0000-0000-4a00-8a00-000000000a01';
  v_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_dana  constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  v_reason text;
  n int;
  t0 timestamptz;
  ms numeric;
begin
  -- 4a — THE RUN STATES ITS OWN REACH, always, whatever it finds.
  select p.reason into v_reason from custom.visibility_parity() p where p.side = 'depth_measured';
  if v_reason is null then
    raise exception '4a FAILED — the diff does not say how deep it looked, so nobody can tell a clean answer from a short one.';
  end if;
  if v_reason !~ 'deepest derived path measured: 16' then
    raise exception '4a FAILED — an eighteen-deep chain exists and the run reports "%".', v_reason;
  end if;

  -- 4b — AND WHEN A REAL PATH OUTRUNS THE WALK, THAT IS A DIFFERENCE, NOT SILENCE. REC-N-4
  --      lets this organization raise its ceiling to 24 and it did; the chain is 18 deep; the
  --      walk stops at 16. The old body excused everything past depth 8 as
  --      `beyond_stored_ceiling` — "reported rather than counted as drift" — so this passed.
  select count(*) into n from custom.visibility_parity() p where p.side = 'depth_exceeded';
  if n <> 1 then
    raise exception '4b FAILED — a path 18 deep exists, the walk sees 16, and the diff reports % depth_exceeded row(s).', n;
  end if;

  -- 4c — NOTHING IS EXCUSED BY A LITERAL ANY MORE. Every derived row names its own depth and
  --      the depth the stored closure actually reaches.
  select count(*) into n from custom.visibility_parity() p
   where p.side = 'derived_only' and p.reason ~ 'beyond_stored_ceiling';
  if n <> 0 then
    raise exception '4c FAILED — % row(s) are still excused by the old hard-coded ceiling.', n;
  end if;

  -- 4d — AN ORGANIZATION ADMIN CAN RUN IT, on their own organization, inside its bound. The
  --      role is switched too, not only the claims: as the role that OWNS the store every
  --      caller is an owner, and a test that cannot fail 4e below is not a test.
  set local role authenticated;
  perform set_config('request.jwt.claims', format('{"sub":"%s"}', v_admin), true);
  t0 := clock_timestamp();
  select count(*) into n from custom.query_visibility_parity(v_org);
  ms := extract(epoch from (clock_timestamp() - t0)) * 1000;
  if n < 2 then
    raise exception '4d FAILED — the organization''s own diff returned % row(s); it should at least state its reach and its overrun.', n;
  end if;
  if ms > 20000 then
    raise exception '4d FAILED — the organization''s own diff took % ms, past its own twenty-second bound.', round(ms);
  end if;
  raise notice '  4d — the organization admin''s own cutover diff: % row(s) in % ms.', n, round(ms, 1);

  -- 4e — AND AN ORDINARY MEMBER IS REFUSED BY NAME, because it answers about everybody.
  perform set_config('request.jwt.claims', format('{"sub":"%s"}', v_dana), true);
  begin
    perform count(*) from custom.query_visibility_parity(v_org);
    raise exception '4e FAILED — an ordinary member ran the whole organization''s cutover diff.';
  exception when insufficient_privilege then
    null;   -- refused, by name, which is the pass
  end;
  perform set_config('request.jwt.claims', '', true);
  reset role;

  raise notice 'PART 4 PASSED — T1: the diff measures its own depth, reports a path it cannot reach as a difference, and an organization admin can run their own.';
end $t$;
commit;

-- ═════ PART 5 — T13 AGAIN, AS A COST: THE QUESTION DOES NOT GROW WITH THE ORGANIZATION
-- Part 1 proved the answer is right and the shape is right. This proves the thing the test is
-- actually about: asking about ONE record must cost the same in an organization of 20 records
-- and an organization of 420. It is measured rather than asserted from the body.
begin;
set local statement_timeout = '60s';
select set_config('app.actor_system', 'asof_green_suite', true);
do $t$
declare
  v_org  constant uuid := 'a50f0000-0000-4a00-8a00-000000000a01';
  v_tbl  constant uuid := 'a50f0000-0000-4a00-8a00-000000000201';
  v_rec  constant uuid := 'a50f0000-0000-4a00-8a00-000000000301';
  v_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_small numeric; v_large numeric; n_small int; n_large int;
  t0 timestamptz; i int; ok boolean;
begin
  perform set_config('request.jwt.claims', '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14"}', true);

  select count(*) into n_small from custom.record where organization_id = v_org and deleted_at is null;
  t0 := clock_timestamp();
  for i in 1..20 loop ok := custom.query_can_see(v_org, v_rec, 'viewer'); end loop;
  v_small := extract(epoch from (clock_timestamp() - t0)) * 1000 / 20;

  -- four hundred more records in the same organization, nothing else changed.
  --
  -- WITHOUT THE CLAIMS (lane RED-SUITES-2, 2026-09-21). This bulk INSERT is fixture volume for
  -- the measurement below, and it asserts nothing about what a person may do. With the claims
  -- set it now meets `custom._field_write_door` — "You can see this record, but "title" is not
  -- yours to change" — because the field write door applies to a direct INSERT too, and the
  -- person these claims name was never given that field. The door is right; the fixture had no
  -- business wearing a seat. The claims go back on immediately, so PART 5's actual clause —
  -- the cost of `custom.query_can_see` — is still asked as that person.
  perform set_config('request.jwt.claims', '', true);
  insert into custom.record (organization_id, table_id, data_class, data, created_by)
  select v_org, v_tbl, 'record', jsonb_build_object('title', 'bulk ' || g), v_admin
    from generate_series(1, 400) g;
  perform set_config('request.jwt.claims', '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14"}', true);

  select count(*) into n_large from custom.record where organization_id = v_org and deleted_at is null;
  t0 := clock_timestamp();
  for i in 1..20 loop ok := custom.query_can_see(v_org, v_rec, 'viewer'); end loop;
  v_large := extract(epoch from (clock_timestamp() - t0)) * 1000 / 20;
  perform set_config('request.jwt.claims', '', true);

  raise notice '  5 — one-record question: % ms at % records, % ms at % records.',
               round(v_small, 3), n_small, round(v_large, 3), n_large;
  -- The old shape asked the ladder about every live record, so twenty times the records cost
  -- about twenty times as much. Doubling is a generous ceiling for measurement noise and is
  -- nowhere near the growth the old shape had.
  if v_large > greatest(v_small, 0.5) * 2 then
    raise exception '5 FAILED — the one-record question grew from % ms at % records to % ms at % records, so it is still O(the organization).',
                    round(v_small, 3), n_small, round(v_large, 3), n_large;
  end if;
  raise notice 'PART 5 PASSED — T13: the cost of asking about one record does not follow the size of the organization.';
end $t$;
commit;

-- ═══════════════════════════════════ TEARDOWN — and a census that fails unless it is gone
begin;
set local statement_timeout = '60s';
set local lock_timeout = '10s';
select set_config('app.actor_system', 'asof_green_suite', true);
delete from iam.permissions where id = :GRANT;
delete from iam.permissions where resource_type = 'record'
   and resource_id in (select id from custom.record where organization_id = :ORG);
delete from platform.reachability where origin = 'store-asof-test';
delete from platform.associations where organization_id = :ORG;
delete from custom.record where organization_id = :ORG;
delete from custom.field where organization_id = :ORG;
delete from custom.io_outbox where organization_id = :ORG;
delete from custom.io_comment where organization_id = :ORG;
delete from custom.record_alias where organization_id = :ORG;
delete from custom.merge_field_provenance where organization_id = :ORG;
delete from custom.visibility_epoch where organization_id = :ORG;
delete from custom.organization_visibility_version where organization_id = :ORG;
delete from custom.external_link where organization_id = :ORG;
delete from custom.external_source where organization_id = :ORG;
delete from history.migration_log where organization_id = :ORG;
delete from platform.knob_override where organization_id = :ORG;
delete from iam.memberships where organization_id = :ORG;
delete from iam.organizations where id = :ORG;
-- HISTORY LAST, and that is not tidiness: deleting the memberships and the knob overrides is
-- itself a change, and their capture triggers write history rows in THIS transaction. Sweeping
-- history before them left five rows behind on the first run.
delete from history.row_versions where entity_type = 'iam.permissions' and row_id = :GRANT;
delete from history.row_versions where organization_id = :ORG;
do $t$
declare
  v_org constant uuid := 'a50f0000-0000-4a00-8a00-000000000a01';
  n int;
begin
  select (select count(*) from iam.organizations where id = v_org)
       + (select count(*) from iam.memberships where organization_id = v_org)
       + (select count(*) from custom.record where organization_id = v_org)
       + (select count(*) from custom.field where organization_id = v_org)
       + (select count(*) from platform.associations where organization_id = v_org)
       + (select count(*) from platform.knob_override where organization_id = v_org)
       + (select count(*) from platform.reachability where origin = 'store-asof-test')
       + (select count(*) from history.row_versions where organization_id = v_org)
       + (select count(*) from iam.permissions where id = 'a50f0000-0000-4a00-8a00-000000009901')
    into n;
  if n <> 0 then raise exception 'TEARDOWN FAILED — % row(s) of this suite are still on the database.', n; end if;
  raise notice 'TEARDOWN PASSED — census zero.';
  raise notice 'ALL PARTS PASSED.';
end $t$;
commit;
