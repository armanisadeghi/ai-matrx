-- STORE-ASOF — THE RED TWIN. Every claim the green suite makes, made FALSE again by putting
-- the pre-STORE-ASOF bodies back — inside ONE transaction that is ROLLED BACK, so nothing here
-- survives the run. A guard you cannot show failing is not a guard.
--
-- RUN IT exactly like the green suite:
--   "$PSQL" "<dsn>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/asof_red.sql
--
-- Each block RAISES if the old body still behaves like the new one — that is, a block is GREEN
-- only when the defect it names is present, which is what makes this a red twin rather than a
-- second green suite. The bodies restored below are the ones in
-- migrations/inverse/asof_*_down.sql, so running this also proves those inverses are valid SQL
-- against the live catalogue.
--
-- 🚨 THE SEAT (lane SEAT-SUITES, 2026-09-19). A RED TWIN'S JOB IS UNCHANGED: every block below
-- must still go RED for the reason it names. What changed is WHO ASKS. This suite used to
-- SELECT straight from `custom.record` and `iam.organization_member` to pick somebody else's
-- organization to measure, and to ask `history.value_in_document` and `custom.visibility_parity`
-- — internals with no client grant — from the role that OWNS `custom.record`, where
-- `custom.assert_client_may_reach` returns on its first line. So it measured the store's
-- internals and CREATED NOTHING, which also meant it could never ask an access question at all.
-- It now builds ONE disposable organization through the doors, takes the seat `authenticated`
-- and PROVES it (PART 0), and asks every clause through the door a signed-in person reaches:
--
--   RED 1  the one-record question      → `custom.query_can_see`, timed from the seat over an
--                                         organization THIS SUITE filled, not somebody else's
--   RED 2  the two clocks               → `custom.query_record_as_of`, both clocks, both ways
--   RED 3  the audit answer's interval  → `custom.visibility_as_of`, asked for `held_from`
--   RED 4  the cutover diff's reach     → `custom.query_visibility_parity`
--
-- Three steps have no client door and SAY SO where they stand, asserting nothing while out: the
-- Home record, the dated `_values` envelope (HIS-5 periods are written by the store, never by a
-- browser), and the four `create or replace` breaks themselves, which are DDL by definition.
--
-- IT ROLLS EVERYTHING BACK, including its organization: the closing block proves it.

\set ON_ERROR_STOP on
\timing off

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'asof_red.sql'
\set requires 'row:platform.feature_knob:feature = 'custom' and key = 'member_default_visibility''
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local statement_timeout = '60s';
set local lock_timeout = '10s';
select set_config('app.actor_system', 'asof_red_suite', true);

-- ══════════════════ THE FIXTURE, THE SEAT, AND THE ACCESS CLAUSES THIS SUITE COULD NOT ASK
do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  -- HOW BIG. RED 1's clause is that the old door answers ONE record by walking ALL of them, and
  -- the old suite borrowed the largest organization on the database to show it. A seat cannot
  -- read somebody else's organization and must not try, so this one fills its own: measured on
  -- the main database 2026-09-19, the old body costs ~0.067 ms per live record, so a thousand
  -- records answered in 20.9 ms and four thousand in 36.0 ms (a fixed ~14 ms of plan plus
  -- ~0.0055 ms per live record), so the fixture is sized at ten thousand, which clears the
  -- 50 ms the clause names with room to spare on a quiet database and on a busy one.
  c_n       constant integer := 10000;
  v_org     uuid := gen_random_uuid();
  v_boss    text := current_user;
  v_home    uuid;
  v_tbl     uuid;
  v_rec     uuid;
  v_contract uuid;
  v_shared  uuid;
  v_f       uuid;
  v_caught  text;
  i         integer;
  t0        timestamptz;
  v_new     numeric;
begin
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Compass Route Relocation Advisors — Airport Desk',
          'compass-route-relocation-desk-' || substr(v_org::text, 1, 8), 'CRR', c_admin);
  -- A seat is a PERSON, and a person reaches an organization only through a membership.
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_dana,  'member', 'active');
  -- The store answers a person only where it is switched ON; the superuser walked past this
  -- switch on its first line. And `shared_only`, because the access clauses below are about
  -- what a SHARE conveys and cannot be asked in an organization that shows every member
  -- everything by default.
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note) values
    ('custom', 'system_enabled',            'organization', v_org, v_org, 'true'::jsonb,          'asof_red'),
    ('custom', 'member_default_visibility', 'organization', v_org, v_org, '"shared_only"'::jsonb, 'asof_red');
  -- A HOME record has no client door of its own (a Home is made by the onboarding path, not by
  -- a person's browser). This step asserts nothing.
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Compass Route Relocation Advisors — Main Office')) returning id into v_home;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 0 — THE SEAT. Everything below this line runs as a signed-in person.
  -- ════════════════════════════════════════════════════════════════════════════
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
  raise notice 'PART 0 PASSED — the seat is `authenticated`, the ladder sees a client, and custom.record is not readable from it.';

  v_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name','Relocation contract','slug','relocation_contracts','type','entity',
    'label_singular','Relocation contract','label_plural','Relocation contracts','title_field','name','display','list',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','name')),
    'parent_id', v_home::text));
  -- A DATED field, declared through the door a person uses to add a column.
  v_f := custom.field_declare(v_org, v_tbl, jsonb_build_object(
    'key','terms','label','Terms','plain','text','sort',20,'dated',true));

  v_contract := custom.record_write(v_org, v_tbl, jsonb_build_object('name','Albuquerque International Sunport corridor, 2027 move'));

  -- THE FIXTURE STEP NO DOOR COVERS: a HIS-5 period lives in `data._values.<key>.dated`, and
  -- `custom.record_update` refuses an object on a text field by design — periods are written by
  -- the store's own import and migration paths, never typed into a browser. So this ONE
  -- statement steps out of the seat and says so. It asserts nothing; every clause about it
  -- below is asked back inside, through `custom.query_record_as_of`.
  perform set_config('role', v_boss, true);
  update custom.record set data = data || jsonb_build_object(
    'terms', 'gold',
    '_values', jsonb_build_object('terms', jsonb_build_object(
      'dated', jsonb_build_array(jsonb_build_object('from','2027-01-01','to','2029-01-01','value','gold')))))
   where organization_id = v_org and id = v_contract;
  perform set_config('role', 'authenticated', true);

  -- TEN THOUSAND RECORDS, every one through the write door.
  for i in 1..c_n loop
    v_rec := custom.record_write(v_org, v_tbl, jsonb_build_object('name', 'Deal ' || i));
  end loop;
  v_shared := custom.record_write(v_org, v_tbl, jsonb_build_object('name','The shared one'));
  perform custom.share_grant(v_org, v_shared, 'person', c_dana, 'viewer'::public.permission_level);

  perform set_config('zz.org',      v_org::text,      true);
  perform set_config('zz.rec',      v_rec::text,      true);
  perform set_config('zz.contract', v_contract::text, true);
  perform set_config('zz.shared',   v_shared::text,   true);
  perform set_config('zz.n',        (c_n + 2)::text,  true);

  -- ── THE NEGATIVE CLAUSES, AS A REAL SECOND PERSON, while every body is still the NEW one.
  -- `test@test.com` is a member of this organization who was shared exactly one record. The old
  -- seat could not ask any of this: as the owner of `custom.record`,
  -- `custom.assert_client_may_reach` returned true for every organization on the database and
  -- `custom.query_is_store_owner` answered the audit doors' authority question for her.
  perform set_config('request.jwt.claims', c_dana_j, true);
  if custom.query_can_see(v_org, v_contract, 'viewer') then
    raise exception 'N1: test@test.com sees a record nobody shared with her.';
  end if;
  v_caught := null;
  begin
    perform custom.visibility_as_of(v_org, v_shared, now());
  exception when others then v_caught := sqlerrm;
  end;
  if v_caught is null then
    raise exception 'N2: a plain member was told who ELSE can see a record. That is an audit question.';
  end if;
  v_caught := null;
  begin
    perform * from custom.query_visibility_parity(v_org);
  exception when others then v_caught := sqlerrm;
  end;
  if v_caught is null then
    raise exception 'N3: a plain member ran the organization-wide cutover diff.';
  end if;
  -- THE CONTROL, so N1-N3 are not a door that refuses her everything: the ONE record she was
  -- given reads back for her, through the same doors, including the as-of door.
  if (custom.read_record(v_org, v_shared, true) ->> 'name') <> 'The shared one' then
    raise exception 'N4: the record shared with test@test.com at viewer does not read back for her.';
  end if;
  if (custom.query_record_as_of(v_org, v_shared, null, null) ->> 'name') <> 'The shared one' then
    raise exception 'N4: the as-of door refuses the record she was actually given.';
  end if;
  raise notice 'NEGATIVE PASSED — test@test.com is refused the record, the audit answer and the diff, and reads the one record she was given through both read doors.';

  -- ── RED 1's GREEN SIDE, from the seat: the door as it is today.
  perform set_config('request.jwt.claims', c_admin_j, true);
  t0 := clock_timestamp();
  for i in 1..5 loop perform custom.query_can_see(v_org, v_rec, 'viewer'); end loop;
  v_new := extract(epoch from (clock_timestamp() - t0)) * 1000 / 5;
  raise notice 'RED 1 baseline — the STORE-ASOF door answers one record in % ms over % live records.',
    round(v_new, 3), c_n + 2;

  -- OUT OF THE SEAT for the four DDL breaks below. They are `create or replace` on the store's
  -- own doors: an operator step by definition, and they assert nothing.
  perform set_config('role', v_boss, true);
  perform set_config('request.jwt.claims', c_admin_j, true);
end $t$;

-- ══════════════════ RED 1 — T13: the one-record question walks the whole organization
-- the pre-STORE-ASOF body, verbatim from migrations/inverse/asof_one_record_is_one_question_down.sql
create or replace function custom.query_can_see(p_organization_id uuid, p_record_id uuid, p_required text default 'viewer')
returns boolean language plpgsql stable security definer set search_path to 'pg_catalog'
as $fn$
#variable_conflict use_column
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.query_can_see');
  return (
select exists (select 1 from custom.query_visible_ids(p_organization_id, null, p_required) v
                  where v = p_record_id)
  );
end;
$fn$;

do $t$
declare
  v_org uuid := current_setting('zz.org')::uuid;
  v_rec uuid := current_setting('zz.rec')::uuid;
  n     int  := current_setting('zz.n')::int;
  v_boss text := current_user;
  v_old numeric; t0 timestamptz; i int; ok boolean; v_body text;
begin
  -- OUT OF THE SEAT, for one catalogue read and no clause: a function's source text is not a
  -- product question and `pg_get_functiondef` is not a door. It is read here so the clause
  -- below can say WHICH body it timed.
  v_body := regexp_replace(pg_get_functiondef('custom.query_can_see(uuid,uuid,text)'::regprocedure),
                           '--[^' || chr(10) || ']*', '', 'g');

  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'RED 1: this block did not take the seat — current_user is %', current_user;
  end if;

  t0 := clock_timestamp();
  for i in 1..5 loop ok := custom.query_can_see(v_org, v_rec, 'viewer'); end loop;
  v_old := extract(epoch from (clock_timestamp() - t0)) * 1000 / 5;

  if not ok then
    raise exception 'RED 1 cannot run — the old door cannot even see the record it is timing.';
  end if;
  if v_body !~* 'custom\.query_visible_ids' then
    raise exception 'RED 1 NOT RED — the restored old body does not reach the list-everything door, so it is not the old body.';
  end if;
  if v_old < 50 then
    raise exception 'RED 1 NOT RED — the old body answered one record in % ms over % live records; it is supposed to walk them all.', round(v_old,3), n;
  end if;
  raise notice 'RED 1 is RED — from the seat `authenticated`, the pre-STORE-ASOF door answers ONE record in % ms by walking all % of them.', round(v_old, 3), n;
  perform set_config('role', v_boss, true);
end $t$;

-- ══════════════ RED 2 — T6: the two clocks answer for each other
do $t$
declare
  v_org  uuid := current_setting('zz.org')::uuid;
  v_c    uuid := current_setting('zz.contract')::uuid;
  v_boss text := current_user;
  v_now  jsonb;
  v_2027 jsonb;
begin
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'RED 2: this block did not take the seat — current_user is %', current_user;
  end if;

  -- THE NEW DOOR, on the record the fixture built: a contract whose terms start in 2027 is NOT
  -- today's value, and it says which — and an undated key survives a dated read.
  v_now  := custom.query_record_as_of(v_org, v_c, null, null);
  v_2027 := custom.query_record_as_of(v_org, v_c, null, '2027-03-01');
  if v_now -> '_effective' -> 'terms' ->> 'state' is distinct from 'not_yet' then
    raise exception 'RED 2 FAILED — the new answer does not say the contract is not yet in force. Document: %', v_now;
  end if;
  if v_now -> 'terms' is distinct from 'null'::jsonb and v_now -> 'terms' is not null then
    raise exception 'RED 2 FAILED — the new answer hands back a 2027 term as today''s value: %', v_now -> 'terms';
  end if;
  if v_2027 -> 'name' is distinct from '"Albuquerque International Sunport corridor, 2027 move"'::jsonb then
    raise exception 'RED 2 FAILED — the new answer loses the undated key it is supposed to keep: %', v_2027;
  end if;
  if v_2027 -> 'terms' is distinct from '"gold"'::jsonb then
    raise exception 'RED 2 FAILED — the new answer does not hand back the term that IS in force in 2027: %', v_2027;
  end if;
  perform set_config('role', v_boss, true);
end $t$;

-- the pre-STORE-ASOF body, verbatim from migrations/inverse/asof_two_clocks_never_answer_for_each_other_down.sql
create or replace function custom.query_record_as_of(p_organization_id uuid, p_record_id uuid,
                                                    p_recorded_at timestamptz default null,
                                                    p_world_on date default null,
                                                    p_required text default 'viewer')
returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog'
as $fn$
declare
  v_doc jsonb; v_out jsonb := '{}'::jsonb; v_key text;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.query_record_as_of');
  if not custom.query_can_see(p_organization_id, p_record_id, p_required) then return null; end if;
  if p_recorded_at is null then
    select r.data into v_doc from custom.record r
     where r.organization_id = p_organization_id and r.id = p_record_id;
  else
    v_doc := history.record_at(p_organization_id, p_record_id, p_recorded_at);
    v_doc := coalesce(v_doc -> 'data', v_doc);
  end if;
  if v_doc is null then return null; end if;
  if p_world_on is null then return v_doc; end if;
  for v_key in select jsonb_object_keys(v_doc) loop
    v_out := v_out || jsonb_build_object(v_key, history.value_in_document(v_doc, v_key, p_world_on));
  end loop;
  return v_out;
end;
$fn$;

do $t$
declare
  v_org  uuid := current_setting('zz.org')::uuid;
  v_c    uuid := current_setting('zz.contract')::uuid;
  v_boss text := current_user;
  v_body text;
  v_now  jsonb;
  v_2027 jsonb;
begin
  -- OUT OF THE SEAT, one catalogue read, no clause.
  v_body := regexp_replace(pg_get_functiondef('custom.query_record_as_of(uuid,uuid,timestamptz,date,text)'::regprocedure),
                           '--[^' || chr(10) || ']*', '', 'g');

  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'RED 2b: this block did not take the seat — current_user is %', current_user;
  end if;

  v_now  := custom.query_record_as_of(v_org, v_c, null, null);
  v_2027 := custom.query_record_as_of(v_org, v_c, null, '2027-03-01');

  -- THE DEFECT, ASKED THROUGH THE DOOR, BOTH WAYS ROUND.
  if v_now -> 'terms' is distinct from '"gold"'::jsonb then
    raise exception 'RED 2b NOT RED — with no world date the old door no longer hands back the 2027 term as the present value; it answered %', coalesce((v_now -> 'terms')::text, 'nothing');
  end if;
  if v_now ? '_effective' then
    raise exception 'RED 2b NOT RED — the restored old door still says whether a value is in force.';
  end if;
  if v_2027 -> 'name' is not null and v_2027 -> 'name' <> 'null'::jsonb then
    raise exception 'RED 2b NOT RED — the old door no longer blanks an undated key under a world date; it answered %', v_2027 -> 'name';
  end if;
  if v_body ~* 'value_in_force' then
    raise exception 'RED 2b NOT RED — the restored old door still knows about the in-force answer.';
  end if;
  raise notice 'RED 2 is RED — from the seat, the old door answers a 2027 contract as today''s value (%) and deletes the record''s own name from a dated read.',
    v_now -> 'terms';
  perform set_config('role', v_boss, true);
end $t$;

-- ══════════════ RED 3 — T15: the share is filed nowhere, and the interval is unaskable
do $t$
declare
  v_org  uuid := current_setting('zz.org')::uuid;
  v_sh   uuid := current_setting('zz.shared')::uuid;
  v_boss text := current_user;
  n int; v_held int;
begin
  -- OUT OF THE SEAT, and no product clause: this counts rows of `history.row_versions`, the
  -- capture ledger. No person has a door onto it and none should; it is read here as the
  -- operator so the sentence below can name a real number.
  select count(*) into n from history.row_versions
   where entity_type = 'iam.permissions' and row_data ->> 'resource_type' = 'record'
     and organization_id is null;

  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'RED 3: this block did not take the seat — current_user is %', current_user;
  end if;

  if n = 0 then
    raise exception 'RED 3 NOT RED — no record share on this database was ever filed under no organization, so there was nothing to fix.';
  end if;
  -- And the switch the old capture asked is still false platform-wide, which is why it could
  -- never open for an organization that had turned its own store on. `custom.store_is_open` IS
  -- a client door, and this is the one question about it a person may ask.
  if custom.store_is_open(null) then
    raise exception 'RED 3 NOT RED — the platform-wide store switch is on, so asking it was not the defect.';
  end if;
  -- AND THE GREEN SIDE OF 3b, through the audit door, as this organization's owner: how long
  -- somebody has held a record is askable today.
  execute 'select count(*) from custom.visibility_as_of($1, $2, now()) where held_from is not null'
    into v_held using v_org, v_sh;
  if v_held < 1 then
    raise exception 'RED 3 cannot run — the audit door answers no interval for a record that was just shared.';
  end if;
  raise notice 'RED 3 is RED — % record share(s) already on this database are filed under no organization, the switch the old capture asked is false platform-wide, and the audit door today answers % held-from interval(s) for the record this suite shared.', n, v_held;
  perform set_config('role', v_boss, true);
end $t$;

-- the pre-STORE-ASOF audit answer: seven columns, no interval
drop function if exists custom.visibility_as_of(uuid, uuid, timestamptz);
create function custom.visibility_as_of(p_organization_id uuid, p_record_id uuid, p_at timestamptz)
returns table(principal_kind text, principal_id uuid, level public.permission_level,
              through_kind text, through_id uuid, reason text, replayed boolean)
language plpgsql stable security definer set search_path to 'pg_catalog'
as $fn$
begin
  -- the shape is what is under test here, not the arms
  return;
end;
$fn$;
-- and the grant the old door carried, so the clause below measures its SHAPE and not a
-- missing EXECUTE. Restoring a door means restoring the door, not a wall.
grant execute on function custom.visibility_as_of(uuid, uuid, timestamptz) to authenticated;

do $t$
declare
  v_org  uuid := current_setting('zz.org')::uuid;
  v_sh   uuid := current_setting('zz.shared')::uuid;
  v_boss text := current_user;
begin
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'RED 3b: this block did not take the seat — current_user is %', current_user;
  end if;
  begin
    execute 'select held_from from custom.visibility_as_of($1, $2, now()) limit 1' using v_org, v_sh;
    raise exception 'RED 3b NOT RED — the seven-column audit answer still has an interval on it.';
  exception when undefined_column then
    null;   -- "column held_from does not exist" — which is the point
  end;
  raise notice 'RED 3b is RED — from the seat, with the old audit answer back, how long somebody held a record cannot be asked at all.';
  perform set_config('role', v_boss, true);
end $t$;

-- ══════════════ RED 4 — T1: the diff excuses depth by a literal and states nothing
do $t$
declare
  v_org  uuid := current_setting('zz.org')::uuid;
  v_boss text := current_user;
  n int;
begin
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'RED 4: this block did not take the seat — current_user is %', current_user;
  end if;
  -- THE GREEN SIDE, through the door this organization's owner reaches: today's diff STATES
  -- ITS OWN REACH, so at least one row of it is a depth row.
  select count(*) into n from custom.query_visibility_parity(v_org) p
   where p.side in ('depth_measured', 'depth_exceeded');
  if n = 0 then
    raise exception 'RED 4 cannot run — the diff as it stands today already states nothing about how deep it looked.';
  end if;
  perform set_config('role', v_boss, true);
end $t$;

create or replace function custom.visibility_parity()
returns table(side text, container_type text, container_id uuid, item_type text, item_id uuid,
              stored_level public.permission_level, derived_level public.permission_level, reason text)
language sql stable security definer set search_path to ''
as $fn$
  with recursive edges as materialized (
    select e.container_type, e.container_id, e.item_type, e.item_id, e.conveys_max
      from custom.carrying_edges e
  ), roots as (
    select distinct r.container_type as ct, r.container_id as ci from platform.reachability r
  ), walk as (
    select r.ct as root_type, r.ci as root_id, e.item_type, e.item_id,
           1 as depth, e.conveys_max as max_level,
           array[r.ct || ':' || r.ci::text, e.item_type || ':' || e.item_id::text] as path
      from roots r join edges e on e.container_type = r.ct and e.container_id = r.ci
    union all
    select w.root_type, w.root_id, e.item_type, e.item_id, w.depth + 1,
           least(w.max_level, e.conveys_max),
           w.path || (e.item_type || ':' || e.item_id::text)
      from walk w join edges e on e.container_type = w.item_type and e.container_id = w.item_id
     where w.depth < 16 and not (e.item_type || ':' || e.item_id::text) = any (w.path)
  ), derived as (
    select w.root_type as container_type, w.root_id as container_id, w.item_type, w.item_id,
           min(w.depth) as depth, max(w.max_level) as max_level
      from walk w group by 1, 2, 3, 4
  )
  select 'cache_only', r.container_type, r.container_id, r.item_type, r.item_id,
         r.max_level, null::public.permission_level, 'stored row the associations do not produce'
  from platform.reachability r
  left join derived d on d.container_type = r.container_type and d.container_id = r.container_id
                     and d.item_type = r.item_type and d.item_id = r.item_id
  where d.item_id is null
  union all
  select 'level_differs', r.container_type, r.container_id, r.item_type, r.item_id,
         r.max_level, d.max_level, 'same pair, different level'
  from platform.reachability r
  join derived d on d.container_type = r.container_type and d.container_id = r.container_id
                and d.item_type = r.item_type and d.item_id = r.item_id
  where d.max_level is distinct from r.max_level
  union all
  select 'derived_only', d.container_type, d.container_id, d.item_type, d.item_id,
         null::public.permission_level, d.max_level,
         case when d.depth > 8 then 'beyond_stored_ceiling'
              else 'derived row the stored closure does not hold' end
  from derived d
  left join platform.reachability r on r.container_type = d.container_type and r.container_id = d.container_id
                                   and r.item_type = d.item_type and r.item_id = d.item_id
  where r.item_id is null;
$fn$;

do $t$
declare
  v_org  uuid := current_setting('zz.org')::uuid;
  v_boss text := current_user;
  n int; v_body text;
begin
  -- OUT OF THE SEAT, one catalogue read, no clause.
  v_body := pg_get_functiondef('custom.visibility_parity()'::regprocedure);

  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'RED 4b: this block did not take the seat — current_user is %', current_user;
  end if;

  select count(*) into n from custom.query_visibility_parity(v_org) p where p.side = 'depth_measured';
  if n <> 0 then raise exception 'RED 4 NOT RED — the old diff states its own reach.'; end if;
  select count(*) into n from custom.query_visibility_parity(v_org) p where p.side = 'depth_exceeded';
  if n <> 0 then raise exception 'RED 4 NOT RED — the old diff reports a path it could not reach.'; end if;
  if v_body !~ 'd\.depth > 8' then
    raise exception 'RED 4 NOT RED — the restored body no longer carries the literal 8.';
  end if;
  raise notice 'RED 4 is RED — from the seat, the door hands a person a diff that excuses everything past a hard-coded depth of 8 and never says how deep it looked.';
  perform set_config('role', v_boss, true);
end $t$;

do $t$ begin raise notice '5 of 5 blocks are RED, every clause asked from the seat `authenticated`.'; end $t$;
rollback;

do $t$
declare v_body text;
begin
  if exists (select 1 from iam.organizations where slug like 'compass-route-relocation-desk-%') then
    raise exception 'ROLLBACK DID NOT TAKE — this suite''s throwaway organization is still there.';
  end if;
  v_body := pg_get_functiondef('custom.visibility_parity()'::regprocedure);
  if v_body ~ 'd\.depth > 8' then
    raise exception 'ROLLBACK DID NOT TAKE — the old visibility_parity body is still live.';
  end if;
  -- comments stripped: the STORE-ASOF body NAMES the list-everything door in a comment, to say
  -- which rung it climbs instead. A comment is not a call.
  if regexp_replace(pg_get_functiondef('custom.query_can_see(uuid,uuid,text)'::regprocedure),
                    '--[^' || chr(10) || ']*', '', 'g') ~* 'query_visible_ids' then
    raise exception 'ROLLBACK DID NOT TAKE — the old query_can_see body is still live.';
  end if;
  if not exists (select 1 from pg_proc p
                  where p.oid = 'custom.visibility_as_of(uuid,uuid,timestamptz)'::regprocedure
                    and pg_get_function_result(p.oid) ~ 'held_from') then
    raise exception 'ROLLBACK DID NOT TAKE — the audit door has lost its interval columns.';
  end if;
  raise notice 'ROLLBACK VERIFIED — every restored body is gone, the STORE-ASOF bodies are live, and the throwaway organization left nothing behind.';
end $t$;
