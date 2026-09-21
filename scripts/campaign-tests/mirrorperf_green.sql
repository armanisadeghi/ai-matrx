-- LANE MIRROR-PERF — THE GREEN SUITE, ONE SEAT PER CONNECTION.
--
-- RUN IT TWICE, ONCE PER SEAT, ON A FRESH CONNECTION EACH TIME — that is the point of the
-- `:seat` variable. A suite that walks two seats down one connection is still one backend with
-- one set of session state, one plan cache and one `request.jwt.claims` that the previous seat
-- set; the two seats a product actually has are two connections.
--
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<main DSN>" -v ON_ERROR_STOP=1 -v seat=admin -f scripts/campaign-tests/mirrorperf_green.sql
--   "$PSQL" "<main DSN>" -v ON_ERROR_STOP=1 -v seat=dana  -f scripts/campaign-tests/mirrorperf_green.sql
--
-- Each run builds its own disposable organization and ends in ROLLBACK, so the two runs share
-- nothing but the database they are measured on.
--
-- ITS RED TWIN is `scripts/campaign-tests/mirrorperf_red.sql`, which executes the REAL BYTES of
-- both inverses in a rolled-back transaction and shows every clause below going red.
--
-- WHAT MAKES IT FAIL — the production change, named, one per part:
--   PART 1 — put `custom.assert_client_may_open` back into `custom.record_table` in place of
--            `custom.assert_client_may_reach` + `custom.has_visibility`, and census 1 of
--            check:store-doors-decide names the door again (1c).
--   PART 2 — restore the per-row body of `custom.visible_record_ids`, and the set the RLS
--            mirror reaches stops coming from `custom.visible_set` (2a) and starts costing one
--            ladder walk per row that exists (2b, measured in the red twin).

\set ON_ERROR_STOP on
\timing off

begin;

-- psql does NOT expand a variable inside a dollar-quoted block, so the seat is handed to the
-- block through a transaction-local setting instead.
select set_config('mirrorperf.seat', :'seat', true);

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_seat    text := current_setting('mirrorperf.seat', true);
  v_org     uuid := gen_random_uuid();
  v_home    uuid;
  v_tbl     uuid;
  v_shared  uuid;
  v_private uuid;
  v_got     uuid;
  v_caught  text;
  v_msg     text;
  v_boss    text := current_user;   -- the connected role, for the steps no client door covers
  v_set     uuid[];
  v_ladder  uuid[];
begin
  if v_seat not in ('admin', 'dana') then
    raise exception 'mirrorperf_green.sql needs -v seat=admin or -v seat=dana, not %', v_seat;
  end if;
  if (select system_identifier from pg_control_system()) <> 7642734024280108049 then
    raise exception 'mirrorperf_green.sql runs on the MAIN database only, and this is %',
      (select system_identifier from pg_control_system());
  end if;

  ---------------------------------------------------------------------------------------------
  -- FIXTURES, as the connected role. A seat is a PERSON, and a person reaches an organization
  -- only through a membership; the store answers a person only where its switch is on.
  ---------------------------------------------------------------------------------------------
  perform set_config('app.actor_system', 'campaign-test/mirrorperf_green', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Meridian Software — Portland Studio', 'meridian-portland-' || substr(v_org::text, 1, 8), 'MSP', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_dana,  'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'mirrorperf_green');
  -- SHARED_ONLY IS THE SETTING THIS LANE IS JUDGED UNDER: under `all_records` every member
  -- reaches every row and a refusal clause could never go red for the right reason.
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','member_default_visibility','organization', v_org, v_org, '"shared_only"'::jsonb, 'mirrorperf_green');

  -- A HOME RECORD: no client door makes one (it is the root a Table hangs off), so this step is
  -- the connected role's and asserts nothing.
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Home')) returning id into v_home;

  v_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Work Items', 'slug', 'work_items', 'type', 'entity',
    'label_singular', 'Work Item', 'label_plural', 'Work Items', 'title_field', 'tname',
    'display', 'page', 'weight', 'light', 'ordered', false, 'row_order', 'sorted',
    'default_sort', '[]'::jsonb, 'agent_writable', true, 'retention_days', 365,
    'fields', jsonb_build_array(jsonb_build_object('name', 'tname')),
    'parent_id', v_home::text));

  -- THE FIELD ROW custom.table_declare does not write (SHARED-ONLY left this behind, and it is
  -- not this lane's door): the connected role writes it the way doorfix_green.sql does.
  insert into custom.record (organization_id, table_id, data_class, data) values
    (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
      'key','tname','label','Name','type','text','sort',10,'required',false,'multi',false,
      'dated',false,'source','manual','config','{}'::jsonb,'rules','[]'::jsonb,
      'depends_on','[]'::jsonb,'sensitivity','internal','source_config','{}'::jsonb,
      'context_policy','include','applies_to_types','[]'::jsonb,'entity_definition_id',v_tbl));

  v_shared  := custom.record_write(v_org, v_tbl, jsonb_build_object('tname', 'Shared with Dana'));
  v_private := custom.record_write(v_org, v_tbl, jsonb_build_object('tname', 'Nobody shared this'));
  perform custom.share_grant(v_org, v_shared, 'user', c_dana, 'viewer'::public.permission_level);

  ---------------------------------------------------------------------------------------------
  -- PART 0 — TAKE THE SEAT AND PROVE IT.
  ---------------------------------------------------------------------------------------------
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
  perform set_config('request.jwt.claims',
                     case when v_seat = 'admin' then c_admin_j else c_dana_j end, true);
  raise notice '0: seated as authenticated, claims = %', v_seat;

  ---------------------------------------------------------------------------------------------
  -- PART 1 — custom.record_table DECIDES THE ROW ON THE ONE LADDER, AT VIEWER, IN ITS OWN BODY.
  ---------------------------------------------------------------------------------------------
  if v_seat = 'admin' then
    -- 1a — the control: the owner opens a record nobody shared and the door names its Table.
    v_got := custom.record_table(v_org, v_private);
    if v_got is distinct from v_tbl then
      raise exception '1a: custom.record_table named % for a record in %', v_got, v_tbl;
    end if;
    raise notice '1a: the owner asks which Table a record is in and the door answers it.';

    -- 1b — A RECORD IN THE TRASH STILL LIVES IN A TABLE. The paired second input: a door that
    -- answered only for live rows would pass 1a and fail the restore question this door exists
    -- for.
    perform custom.record_delete(v_org, v_private);
    v_got := custom.record_table(v_org, v_private);
    if v_got is distinct from v_tbl then
      raise exception '1b: a deleted record lost its Table — custom.record_table said %', v_got;
    end if;
    raise notice '1b: a record in the trash still names the Table it would be put back into.';

    -- 1c — an id that is in no organization at all: the same 02000 a foreign id gets.
    begin
      perform custom.record_table(v_org, gen_random_uuid());
      raise exception '1c: custom.record_table answered for an id that is in no organization';
    exception when others then
      get stacked diagnostics v_caught = returned_sqlstate, v_msg = message_text;
      if v_caught <> '02000' then
        raise exception '1c: expected 02000 for an invented id, got % (%)', v_caught, v_msg;
      end if;
    end;
    raise notice '1c: an invented id is refused with 02000 — "%"', v_msg;
  else
    -- 1d — THE CONTROL SHE CAN DO. Without it, a door that refuses her everything would pass 1e.
    v_got := custom.record_table(v_org, v_shared);
    if v_got is distinct from v_tbl then
      raise exception '1d: the record shared with her at viewer did not name its Table — got %', v_got;
    end if;
    raise notice '1d: the one record shared with her at viewer names its Table through the door.';

    -- 1e — THE NEGATIVE, and the whole of census 1's complaint. She is a member of the
    -- organization and was shared nothing of this row, and the organization says shared_only.
    begin
      perform custom.record_table(v_org, v_private);
      raise exception '1e: custom.record_table named the Table of a record she may not open';
    exception when insufficient_privilege then
      get stacked diagnostics v_msg = message_text;
    end;
    if v_msg not like '%do not have access%' then
      raise exception '1e: the refusal did not say what it was — "%"', v_msg;
    end if;
    raise notice '1e: a record she may not open is refused at 42501 — "%"', v_msg;
  end if;

  ---------------------------------------------------------------------------------------------
  -- PART 2 — THE SET THE RLS MIRROR REACHES IS custom.visible_set's, AND IT IS THE SAME SET.
  --
  -- NO CLIENT DOOR COVERS THIS. `custom.visible_record_ids` carries no EXECUTE for
  -- `authenticated` (census 7 is what keeps it that way), and `custom.record` carries no SELECT
  -- for any client role, so the mirror's own arm cannot be asked from the seat at all. The
  -- suite steps OUT for these two clauses, says so, and asserts no product clause while out.
  ---------------------------------------------------------------------------------------------
  perform set_config('role', v_boss, true);

  -- 2a — the body reaches the set form, not the per-row ladder over the whole store.
  if (select pg_get_functiondef(p.oid) from pg_proc p
       where p.pronamespace = 'custom'::regnamespace and p.proname = 'visible_record_ids')
     not like '%visible_predicate_sql%' then
    raise exception '2a: custom.visible_record_ids does not reach custom.visible_set any more';
  end if;
  raise notice '2a: custom.visible_record_ids answers from custom.visible_set (via custom.visible_predicate_sql).';

  -- 2b — AND IT IS THE SAME ANSWER, on this organization's rows, for this seat's person, judged
  -- against the per-row ladder itself. One snapshot, both sides.
  select array_agg(x.id order by x.id) into v_set
    from custom.visible_record_ids(case when v_seat = 'admin' then c_admin else c_dana end,
                                   'viewer'::public.permission_level) x
   where x.id in (select r.id from custom.record r where r.organization_id = v_org);
  select array_agg(r.id order by r.id) into v_ladder
    from custom.record r
   where r.organization_id = v_org and r.deleted_at is null
     and custom.has_visibility(case when v_seat = 'admin' then c_admin else c_dana end,
                               'record', r.id, 'viewer'::public.permission_level);
  if coalesce(v_set, '{}'::uuid[]) is distinct from coalesce(v_ladder, '{}'::uuid[]) then
    raise exception '2b: the set form and the per-row ladder disagree for % — set has %, ladder has %',
      v_seat, coalesce(array_length(v_set,1),0), coalesce(array_length(v_ladder,1),0);
  end if;
  raise notice '2b: the set form and the per-row ladder name the same % row(s) for % in this organization.',
    coalesce(array_length(v_set,1),0), v_seat;

  raise notice 'MIRROR-PERF GREEN (seat %): ALL PARTS PASSED.', v_seat;
end;
$t$;

rollback;
