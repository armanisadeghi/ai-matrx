-- STORE-DOORS-DECIDE-RED — THE GREEN SUITE (2026-09-26). The three Data Tables comment doors and
-- the personal-settings reader, called THROUGH THE DOOR from the seat a signed-in person has
-- (`authenticated`), as admin@admin.com (an owner) and test@test.com (a member of one
-- organization, a stranger to the other).
--
-- THE REAL USE CASE THIS DATA IS. Northgate Mechanical is a 22-person commercial HVAC service
-- contractor in Portland. The dispatcher keeps every service call in a Work Orders Table, and the
-- office talks about a call in its comments — "compressor contactor pitted, quote a replacement" —
-- then resolves the thread when the part is ordered. Cascade Property Group is a property manager
-- Northgate invoices: it has its own Matrx organization and its own tenant Service Requests, and a
-- Northgate dispatcher has no business reading or writing its discussions. Dana (test@test.com) is
-- Northgate's dispatcher: a member there, a stranger at Cascade.
--
-- RUN IT (production read-only proof or the dev clone; the transaction ends in ROLLBACK):
--   PSQL="$(pnpm -s exec tsx scripts/lib/psql-path.ts --print)"
--   "$PSQL" <connection> -v ON_ERROR_STOP=1 -f scripts/campaign-tests/doorsdecide_green.sql
--
-- WHAT IT PROVES, and which clauses only pass after
-- migrations/campaign/storedoorsdecidered_record_comment_doors_and_the_knob_reader_decide_in_their_own_body.sql:
--   1  the seat is `authenticated` and does not own the store, so the wall is real.
--   2  AUTHORISED CALLERS ANSWER AS BEFORE: the owner writes a comment, reads it back, resolves it,
--      reads it again with resolved included; the member dispatcher reads the same thread.
--   3  custom.io_comments REFUSES a stranger with 42501 and the wall's sentence naming the door.
--      RED before: it answered her with an empty thread, a door that trusted its argument.
--   4  custom.io_comment_write REFUSES a stranger with the wall's sentence naming the door.
--      RED before: the refusal was the record ladder's, the organization was never decided.
--   5  custom.io_comment_resolve REFUSES a stranger with the wall's sentence naming the door.
--      RED before: same as 4.
--   6  platform.knob_person_for, from a direct (trusted-backend) seat: the person named, NULL for
--      nobody — and it is plpgsql (RED before: sql, re-planned on every call). The colleague half
--      is PostgREST-only; see the note in part 6.

\set ON_ERROR_STOP on
\timing off

\set suite 'doorsdecide_green.sql'
\set requires 'grant:authenticated:custom.io_comments|grant:authenticated:custom.io_comment_write|grant:authenticated:custom.io_comment_resolve|grant:authenticated:platform.knob_person_for|exec:custom.table_declare'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local statement_timeout = '120s';

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  j_admin   constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  j_dana    constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_north   uuid := gen_random_uuid();   -- Northgate Mechanical — Dana is a member
  v_cascade uuid := gen_random_uuid();   -- Cascade Property Group — Dana is a stranger
  v_home_n uuid; v_home_c uuid;
  v_wo uuid; v_c_sr uuid;
  v_call uuid; v_req uuid;
  v_cmt uuid; v_c_cmt uuid;
  v_n integer; v_ok boolean; v_body text; v_res timestamptz; v_who uuid;
  v_caught text; v_state text;
  r record;
begin
  perform set_config('app.actor_system', 'campaign-test/doorsdecide_green', true);
  perform set_config('request.jwt.claims', j_admin, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by, settings) values
    (v_north,   'Northgate Mechanical', 'northgate-mechanical-'||left(v_north::text,8), 'NGM', c_admin,
     '{"test_fixture": true}'::jsonb),
    (v_cascade, 'Cascade Property Group', 'cascade-property-'||left(v_cascade::text,8), 'CPG', c_admin,
     '{"test_fixture": true}'::jsonb);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status, created_by) values
    (v_north,   'organization', v_north,   c_admin, 'owner',  'active', c_admin),
    (v_north,   'organization', v_north,   c_dana,  'member', 'active', c_admin),
    (v_cascade, 'organization', v_cascade, c_admin, 'owner',  'active', c_admin);
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note, updated_by) values
    ('custom','system_enabled','organization',v_north,  v_north,  'true'::jsonb,'STORE-DOORS-DECIDE-RED proof', c_admin),
    ('custom','system_enabled','organization',v_cascade,v_cascade,'true'::jsonb,'STORE-DOORS-DECIDE-RED proof', c_admin)
  on conflict (feature, key, scope_kind, scope_id, organization_id) do update set value = 'true'::jsonb;

  v_home_n := custom.record_write(v_north, custom.organization_kernel_id(),
                jsonb_build_object('name','Northgate Mechanical','description','Portland commercial HVAC service','_actor','user'));
  v_home_c := custom.record_write(v_cascade, custom.organization_kernel_id(),
                jsonb_build_object('name','Cascade Property Group','description','property manager, Northgate customer','_actor','user'));

  v_wo := custom.table_declare(v_north, jsonb_build_object(
      'name','Work Orders','slug','work_orders','description','every service call, open and closed out',
      'type','entity','display','list','ordered',false,'weight','light','row_order','sorted',
      'agent_writable',true,'retention_days',365,'label_singular','Work Order','label_plural','Work Orders',
      'title_field','wo_number','default_sort',jsonb_build_array(jsonb_build_object('field','wo_number','direction','desc')),
      'fields',jsonb_build_array(jsonb_build_object('name','wo_number')),'parent_id',v_home_n));
  perform custom.field_declare(v_north, v_wo, jsonb_build_object('label','WO number','key','wo_number','type','text','required',true));
  perform custom.field_declare(v_north, v_wo, jsonb_build_object('label','Unit tag','key','unit_tag','type','text'));
  perform custom.field_declare(v_north, v_wo, jsonb_build_object('label','Reported fault','key','fault','type','text'));
  v_call := custom.record_write(v_north, v_wo, jsonb_build_object(
      'wo_number','WO-24117','unit_tag','RTU-3 (Alder Court Medical Plaza)',
      'fault','Compressor short-cycling on hot afternoons','_actor','user'));

  v_c_sr := custom.table_declare(v_cascade, jsonb_build_object(
      'name','Service Requests','slug','service_requests','description','what tenants have asked us to fix',
      'type','entity','display','list','ordered',false,'weight','light','row_order','sorted',
      'agent_writable',true,'retention_days',365,'label_singular','Service Request','label_plural','Service Requests',
      'title_field','summary','default_sort',jsonb_build_array(jsonb_build_object('field','summary','direction','asc')),
      'fields',jsonb_build_array(jsonb_build_object('name','summary')),'parent_id',v_home_c));
  perform custom.field_declare(v_cascade, v_c_sr, jsonb_build_object('label','Summary','key','summary','type','text','required',true));
  v_req := custom.record_write(v_cascade, v_c_sr, jsonb_build_object('summary','Lobby vestibule heater blowing cold','_actor','user'));

  -- ── PART 1 — THE SEAT ────────────────────────────────────────────────────────────────────
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '1: this suite did not take the seat — current_user is %', current_user;
  end if;
  if pg_has_role(current_user, (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass), 'member') then
    raise exception '1: the seat is still a member of the role that owns custom.record — the wall would never run';
  end if;
  raise notice '1 PASSED — the seat is %, and it does not own the store.', current_user;

  -- ── PART 2 — AUTHORISED CALLERS ANSWER AS BEFORE ─────────────────────────────────────────
  perform set_config('request.jwt.claims', j_admin, true);
  v_cmt := custom.io_comment_write(v_north, v_call, 'Compressor contactor is pitted — quote a replacement before the next heat wave.',
                                   jsonb_build_object('field_key','fault'), null);
  if v_cmt is null then raise exception '2a: the owner wrote a comment and got no id back'; end if;
  select count(*), min(c.body) into v_n, v_body from custom.io_comments(v_north, v_call, false) c;
  if v_n <> 1 or v_body !~ 'contactor is pitted' then
    raise exception '2b: the owner read the thread back and got % comment(s): %', v_n, v_body;
  end if;
  v_ok := custom.io_comment_resolve(v_north, v_cmt, true);
  if v_ok is distinct from true then raise exception '2c: resolving the owner''s own comment answered %', v_ok; end if;
  select count(*) into v_n from custom.io_comments(v_north, v_call, false);
  if v_n <> 0 then raise exception '2d: a resolved comment still shows in the default thread (% rows)', v_n; end if;
  select c.resolved_at, c.resolved_by into v_res, v_who from custom.io_comments(v_north, v_call, true) c where c.id = v_cmt;
  if v_res is null or v_who is distinct from c_admin then
    raise exception '2e: the resolved comment did not come back resolved by the owner (% / %)', v_res, v_who;
  end if;
  v_ok := custom.io_comment_resolve(v_north, v_cmt, false);
  if v_ok is distinct from true then raise exception '2f: reopening answered %', v_ok; end if;

  perform set_config('request.jwt.claims', j_dana, true);
  select count(*) into v_n from custom.io_comments(v_north, v_call, false);
  if v_n <> 1 then
    raise exception '2g: Northgate''s dispatcher read her own organization''s thread and got % comment(s)', v_n;
  end if;
  raise notice '2 PASSED — the owner writes, reads, resolves and reopens; the member dispatcher reads the thread.';

  -- the stranger's target: a comment on Cascade's own request, written by Cascade's owner
  perform set_config('request.jwt.claims', j_admin, true);
  v_c_cmt := custom.io_comment_write(v_cascade, v_req, 'Tenant in suite 110 says it started after the filter change.', '{}'::jsonb, null);
  perform set_config('request.jwt.claims', j_dana, true);

  -- ── PART 3 — custom.io_comments REFUSES A STRANGER BY NAME ───────────────────────────────
  v_caught := null; v_state := null;
  begin
    select count(*) into v_n from custom.io_comments(v_cascade, v_req, true);
    raise exception '3: Dana is not a member of Cascade and custom.io_comments answered her with % row(s) instead of refusing', v_n;
  exception when others then
    v_caught := sqlerrm; v_state := sqlstate;
  end;
  if v_state <> '42501' or v_caught !~ 'not a member of that organization' or v_caught !~ 'custom\.io_comments' then
    raise exception '3: the stranger was not refused by the wall naming custom.io_comments: % (%)', v_caught, v_state;
  end if;
  raise notice '3 PASSED — "%"', v_caught;

  -- ── PART 4 — custom.io_comment_write REFUSES A STRANGER BY NAME ──────────────────────────
  v_caught := null; v_state := null;
  begin
    perform custom.io_comment_write(v_cascade, v_req, 'Northgate can be on site Thursday morning.', '{}'::jsonb, null);
    raise exception '4: Dana wrote a comment into Cascade''s discussion';
  exception when others then
    v_caught := sqlerrm; v_state := sqlstate;
  end;
  if v_state <> '42501' or v_caught !~ 'not a member of that organization' or v_caught !~ 'custom\.io_comment_write' then
    raise exception '4: the stranger was not refused by the wall naming custom.io_comment_write: % (%)', v_caught, v_state;
  end if;
  raise notice '4 PASSED — "%"', v_caught;

  -- ── PART 5 — custom.io_comment_resolve REFUSES A STRANGER BY NAME ────────────────────────
  v_caught := null; v_state := null;
  begin
    perform custom.io_comment_resolve(v_cascade, v_c_cmt, true);
    raise exception '5: Dana resolved a comment in Cascade''s discussion';
  exception when others then
    v_caught := sqlerrm; v_state := sqlstate;
  end;
  if v_state <> '42501' or v_caught !~ 'not a member of that organization' or v_caught !~ 'custom\.io_comment_resolve' then
    raise exception '5: the stranger was not refused by the wall naming custom.io_comment_resolve: % (%)', v_caught, v_state;
  end if;
  raise notice '5 PASSED — "%"', v_caught;

  -- ── PART 6 — THE KNOB READER ────────────────────────────────────────────────────────────
  -- A psql seat is a DIRECT connection, so iam.is_trusted_backend() is true here by design
  -- (session_user <> 'authenticator'): the server may name anybody. The browser half — a colleague
  -- asking for somebody else's rung gets NULL — only exists behind PostgREST and is proven through
  -- the REST seat by aidream db/tests/test_rca8_personal_settings_are_personal.py; the decision
  -- below is the same expression in both languages, so this part pins what a psql seat CAN see.
  if not iam.is_trusted_backend() then
    raise exception '6: expected a direct connection to be the trusted backend (session_user = %)', session_user;
  end if;
  if platform.knob_person_for(c_admin) is distinct from c_admin or platform.knob_person_for(c_dana) is distinct from c_dana then
    raise exception '6a: the trusted backend named a person and got % / %', platform.knob_person_for(c_admin), platform.knob_person_for(c_dana);
  end if;
  if platform.knob_person_for(null) is not null then
    raise exception '6b: asking for nobody answered somebody';
  end if;
  if (select l.lanname from pg_proc p join pg_language l on l.oid = p.prolang
       where p.oid = 'platform.knob_person_for(uuid)'::regprocedure) <> 'plpgsql' then
    raise exception '6c: platform.knob_person_for is still LANGUAGE sql — re-planned on every call the ladder makes';
  end if;
  raise notice '6 PASSED — the knob reader answers the trusted backend for the person named, nobody for nobody, and it is plpgsql.';

  raise notice 'STORE-DOORS-DECIDE-RED GREEN — all six parts passed from the authenticated seat.';
end
$t$;

rollback;
