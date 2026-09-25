-- LANE SUITE-HEALTH-3 — THE GREEN SUITE for the three doors that decide or retire, the write path
-- that plans once, and the hand-order page that asks the page-size door.
--
-- THE USE CASE (_gridprim_clinic.sql): Dr. Ana Whitfield (admin@admin.com), practice manager at
-- Cedar Ridge Veterinary Clinic, keeps a personal older table, "Controlled substances log", whose
-- COPY in the record store the mover made; the clinic's Data tables switch is still off, so the
-- older table is the one in use. Marisol Vega (test@test.com) runs the front desk — a member of
-- the clinic, but the log is not shared with her until Ana names her on its copy. A signed-in
-- stranger and a visitor filling in the clinic's public form must learn nothing about it.
-- Every name here is synthesized.
--
-- WHAT MAKES IT FAIL (each is RED on the bodies before the SUITE-HEALTH-3 files, and after their
-- inverses):
--   1  custom.context_resolve(uuid, jsonb, text) — the retired shape — still exists or is declared
--   2  where_tables_live tells a stranger, or a member the log is not shared with, `older` (the
--      existence oracle), or answers them anything but what an id nobody minted answers
--   3  the copy fence's sentence names the log to a visitor, to a stranger or to a member who may
--      not open the copy — or does NOT name it to Ana, or to Marisol once Ana names her on it
--   4  read_records_in_view_order serves a page outside the store's page-size door silently
--   5  a write-path helper this lane moved is LANGUAGE sql again (re-planned on every call)
--
-- RUN IT (clone, or production rolled back):
--   psql "<DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/suitehealth3_green.sql

\set ON_ERROR_STOP on
\timing off
\set suite 'suitehealth3_green.sql'
\set requires 'function:custom.table_declare|function:custom.where_tables_live|function:custom._older_table_copy_refusal|function:custom.share_grant|function:custom.view_record_order_set'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '180s';
\i scripts/campaign-tests/_gridprim_clinic.sql

-- A visitor's public form reaches the copy fence through a SECURITY DEFINER door, as the copy
-- fence's register row says. This rolled-back probe is that door: it runs as its owner while the
-- request's role stays `anon`, exactly as a real form door does.
create function public.zz_suitehealth3_form_door(p uuid) returns text
  language sql security definer set search_path = pg_catalog
  as $$ select custom._older_table_copy_refusal(p) $$;
insert into platform.client_callable_door (schema_name, function_name, identity_args, identity_argtypes,
  reason, anonymous_callers, anonymous_purpose, signed_in_callers, declared_by)
values ('public', 'zz_suitehealth3_form_door', 'p uuid', '{2950}',
  'SUITE-HEALTH-3 rolled-back probe: a definer door a visitor reaches, the way a public form reaches the copy fence.',
  true, 'Rolled-back probe only: stands in for a public form door that runs the copy fence as its writer.', false,
  'scripts/campaign-tests/suitehealth3_green.sql (rolled back)');
grant execute on function public.zz_suitehealth3_form_door(uuid) to anon;

do $t$
declare
  c_admin      constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana       constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j    constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j     constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  c_stranger_j constant text := '{"sub":"000eaa28-cf5d-402a-8f01-5e2c24191323","role":"authenticated"}';
  v_org uuid; v_home uuid; v_appts uuid; v_log uuid; v_never uuid := gen_random_uuid();
  v_queue uuid; v_r1 uuid; v_r2 uuid;
  v_a text; v_b text; v_msg text; v_detail text; n integer;
begin
  select v into v_org from gp where k = 'org'; select v into v_home from gp where k = 'home';
  select v into v_appts from gp where k = 'appts';
  select v into v_r1 from gp where k = 'r1'; select v into v_r2 from gp where k = 'r2';

  -- ── 1. THE RETIRED SHAPE IS GONE ──────────────────────────────────────────────────────────
  if to_regprocedure('custom.context_resolve(uuid,jsonb,text)') is not null then
    raise exception '1: custom.context_resolve(uuid, jsonb, text) still exists — a door that ignored its organization and decided nothing, standing beside its replacement';
  end if;
  if exists (select 1 from platform.client_callable_door where schema_name = 'custom'
               and function_name = 'context_resolve' and identity_args like 'p_organization_id%') then
    raise exception '1: the retired context_resolve overload is still declared in platform.client_callable_door';
  end if;
  if to_regprocedure('custom.context_resolve(jsonb)') is null then
    raise exception '1: the one-argument custom.context_resolve(jsonb) is gone — the retirement took the door every caller uses';
  end if;
  raise notice '1 PASS — only custom.context_resolve(jsonb) answers a turn''s context';

  -- ── FIXTURE, as the store's owner (asserts nothing) ───────────────────────────────────────
  -- The copy the mover made: a record-store Table, personal to Ana, and the older table under
  -- the same id, still live because the clinic's switch is off.
  perform set_config('request.jwt.claims', c_admin_j, true);
  v_log := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Controlled substances log', 'slug', 'controlled_substances_log', 'type', 'entity',
    'label_singular', 'Dispensing', 'label_plural', 'Dispensings', 'title_field', 'drug',
    'display', 'list', 'weight', 'light',
    'ordered', true, 'row_order', 'sorted', 'agent_writable', false, 'retention_days', 3650,
    'default_sort', jsonb_build_array(jsonb_build_object('field', 'drug', 'direction', 'asc')),
    'parent_id', v_home::text,
    'fields', jsonb_build_array(jsonb_build_object('name', 'drug'))));
  update custom.record set visibility = 'personal'
   where organization_id = v_org and id = v_log;
  update workbench.udt_datasets set deleted_at = now()
   where deleted_at is null and user_id = c_admin and table_name = 'Controlled substances log';
  insert into workbench.udt_datasets (id, table_name, description, user_id, organization_id, created_by, visibility)
  values (v_log, 'Controlled substances log', 'DEA schedule II–V dispensing, Dr. Whitfield only',
          c_admin, v_org, c_admin, 'personal');
  if platform.table_lives_in(v_log) is distinct from 'older' then
    raise exception 'FIXTURE: the log should live in the older store while the switch is off, but table_lives_in says %', platform.table_lives_in(v_log);
  end if;

  -- ── 2. WHERE A TABLE LIVES IS TOLD ONLY TO WHO MAY OPEN IT ────────────────────────────────
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  select w.lives_in into v_a from custom.where_tables_live(array[v_log]) w;
  if v_a is distinct from 'older' then
    raise exception '2a: Ana, who owns the log, was told it lives in % — she must be sent to the older table she works in', v_a;
  end if;

  perform set_config('request.jwt.claims', c_stranger_j, true);
  select w.lives_in || '|' || w.why into v_a from custom.where_tables_live(array[v_log]) w;
  select w.lives_in || '|' || w.why into v_b from custom.where_tables_live(array[v_never]) w;
  if v_a is distinct from v_b then
    raise exception '2b: a stranger asking about Ana''s log heard "%" but an id nobody minted answers "%" — the answer tells her the log exists', v_a, v_b;
  end if;

  perform set_config('request.jwt.claims', c_dana_j, true);
  select w.lives_in || '|' || w.why into v_a from custom.where_tables_live(array[v_log]) w;
  select w.lives_in || '|' || w.why into v_b from custom.where_tables_live(array[v_never]) w;
  if v_a is distinct from v_b then
    raise exception '2c: Marisol, a member the log is not shared with, heard "%" — not the answer an id nobody minted gets ("%")', v_a, v_b;
  end if;
  raise notice '2 PASS — Ana is sent to the older table; a stranger and Marisol hear exactly what an id nobody minted hears';

  -- ── 3. THE COPY FENCE NAMES THE LOG ONLY TO WHO MAY OPEN THE COPY ─────────────────────────
  perform set_config('request.jwt.claims', c_admin_j, true);
  v_a := custom._older_table_copy_refusal(v_log);
  if v_a is null or v_a not like '%copy of Controlled substances log;%' then
    raise exception '3a: Ana''s refusal does not name her own log: %', v_a;
  end if;
  perform set_config('request.jwt.claims', c_dana_j, true);
  v_a := custom._older_table_copy_refusal(v_log);
  if v_a is null or v_a not like '%copy of this table;%' then
    raise exception '3b: Marisol may not open the copy, and the fence told her: %', v_a;
  end if;
  perform set_config('request.jwt.claims', c_stranger_j, true);
  v_a := custom._older_table_copy_refusal(v_log);
  if v_a is null or v_a not like '%copy of this table;%' then
    raise exception '3c: a stranger was told: %', v_a;
  end if;
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true);
  v_a := public.zz_suitehealth3_form_door(v_log);
  perform set_config('role', 'postgres', true);
  if v_a is null or v_a not like '%copy of this table;%' then
    raise exception '3d: a visitor whose form reached the copy fence was told: % (the register row promises "never its name", and the write must still be refused)', v_a;
  end if;

  -- Ana names Marisol on the log: now she may open the copy, so the fence names it and she is
  -- sent to the older table like Ana.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform custom.share_grant(v_org, v_log, 'person', c_dana, 'viewer'::public.permission_level);
  perform set_config('request.jwt.claims', c_dana_j, true);
  v_a := custom._older_table_copy_refusal(v_log);
  if v_a is null or v_a not like '%copy of Controlled substances log;%' then
    raise exception '3e: Marisol, now named on the copy, is still not told its name: %', v_a;
  end if;
  select w.lives_in into v_a from custom.where_tables_live(array[v_log]) w;
  if v_a is distinct from 'older' then
    raise exception '3f: Marisol, now named on the copy, was told the log lives in %', v_a;
  end if;
  raise notice '3 PASS — the log is named to Ana and, once shared, to Marisol; a member it is not shared with, a stranger and a visitor get "this table", and every one of them is still refused the write';

  -- ── 4. THE HAND-ORDER PAGE ASKS THE PAGE-SIZE DOOR ────────────────────────────────────────
  perform set_config('role', 'postgres', true);
  select count(*) into n from custom.silent_page_doors();
  if n <> 0 then
    raise exception '4a: % door(s) still take p_limit and choose a page size of their own: %', n,
      (select string_agg(door, ', ') from custom.silent_page_doors());
  end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', c_dana_j, true);
  v_queue := custom.view_declare(v_org, v_appts, jsonb_build_object('name', 'Check-in queue'));
  perform custom.view_record_order_set(v_org, v_queue, array[v_r2, v_r1]);
  select count(*) into n from custom.read_records_in_view_order(v_org, v_queue, false, 2, 0);
  if n <> 2 then
    raise exception '4b: a page of 2 of the check-in queue returned % rows', n;
  end if;
  begin
    perform custom.read_records_in_view_order(v_org, v_queue, false, custom.page_ceiling(v_org) + 1, 0);
    raise exception '4c: a page one row past the ceiling was served instead of refused';
  exception when invalid_parameter_value then
    get stacked diagnostics v_msg = message_text, v_detail = pg_exception_detail;
    if v_msg not like '%read_records_in_view_order%' or v_detail not like '%"ceiling"%' then
      raise exception '4c: the refusal does not name the door and the ceiling: % / %', v_msg, v_detail;
    end if;
  end;
  begin
    perform custom.read_records_in_view_order(v_org, v_queue, false, 0, 0);
    raise exception '4d: a page of 0 rows was quietly served as 1';
  exception when invalid_parameter_value then null;
  end;
  raise notice '4 PASS — the hand-ordered queue pages through custom.page_size, and a page past the ceiling is refused by name: %', v_msg;

  -- ── 5. THE WRITE-PATH HELPERS PLAN ONCE ───────────────────────────────────────────────────
  perform set_config('role', 'postgres', true);
  select count(*) into n from custom.ladder_replanners(array[
    'custom.entity_reference_kinds', 'custom.field_inputs_of', 'custom.field_input_closure', 'iam.is_org_member']);
  if n <> 0 then
    raise exception '5: % of the four write-path helpers is re-planned on every call again: %', n,
      (select string_agg(fn, ', ') from custom.ladder_replanners(array[
        'custom.entity_reference_kinds', 'custom.field_inputs_of', 'custom.field_input_closure', 'iam.is_org_member']));
  end if;
  raise notice '5 PASS — entity_reference_kinds, field_inputs_of, field_input_closure and is_org_member plan once per session';

  raise notice 'SUITEHEALTH3 GREEN — every part passed.';
end;
$t$;

rollback;
