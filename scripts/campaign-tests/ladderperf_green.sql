-- LANE LADDER-PERF — THE GREEN SUITE, ONE SEAT PER CONNECTION.
--
-- The lane made the one ladder stop re-planning itself. Nothing it did may change an answer by
-- one row, so this suite asks the ladder's questions THROUGH THE DOORS a signed-in person
-- reaches, from both seats, and then asks the two censuses that keep the class closed.
--
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<main DSN>" -v ON_ERROR_STOP=1 -v seat=admin -f scripts/campaign-tests/ladderperf_green.sql
--   "$PSQL" "<main DSN>" -v ON_ERROR_STOP=1 -v seat=dana  -f scripts/campaign-tests/ladderperf_green.sql
--
-- Each run builds its own disposable organization at `shared_only` and ends in ROLLBACK.
--
-- ITS RED TWIN is `scripts/campaign-tests/ladderperf_red.sql`, which executes the REAL BYTES of
-- both inverses in a rolled-back transaction and shows PART 3 and PART 4 going red.
--
-- WHAT MAKES IT FAIL — the production change, named, one per part:
--   PART 1/2 — any arm of the ladder moved by the conversion: the doors would answer a
--              different row set from `custom.has_visibility` (they do not; PART 5 measures it).
--   PART 3   — put the twenty SQL-language bodies back and `custom.ladder_replanners()` names
--              all twenty; drop the generated probes and `platform.static_row_probes_stale()`
--              names both.
--   PART 4   — the generated probe stops agreeing with the dynamic chain it replaced.

\set ON_ERROR_STOP on
\timing off

begin;

select set_config('ladderperf.seat', :'seat', true);

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_seat    text := current_setting('ladderperf.seat', true);
  v_org     uuid := gen_random_uuid();
  v_home    uuid;
  v_tbl     uuid;
  v_shared  uuid;
  v_private uuid;
  v_me      uuid;
  v_row     jsonb;
  v_msg     text;
  v_caught  text;
  v_lvl     public.permission_level;
  v_boss    text := current_user;   -- the connected role, for the steps no client door covers
  v_door    uuid[];
  v_ladder  uuid[];
  v_n       integer;
  v_probe   record;
  v_ref_vis platform.visibility;
  v_ref_own uuid;
  v_ref_org uuid;
  v_ref_fnd boolean;
  v_got_vis platform.visibility;
  v_got_own uuid;
  v_got_org uuid;
  v_got_fnd boolean;
  rec       record;
  v_checked integer := 0;
begin
  if v_seat not in ('admin', 'dana') then
    raise exception 'ladderperf_green.sql needs -v seat=admin or -v seat=dana, not %', v_seat;
  end if;
  if (select system_identifier from pg_control_system()) <> 7642734024280108049 then
    raise exception 'ladderperf_green.sql runs on the MAIN database only, and this is %',
      (select system_identifier from pg_control_system());
  end if;
  v_me := case when v_seat = 'admin' then c_admin else c_dana end;

  ---------------------------------------------------------------------------------------------
  -- FIXTURES, as the connected role.
  ---------------------------------------------------------------------------------------------
  perform set_config('app.actor_system', 'campaign-test/ladderperf_green', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'ZZ LADDER-PERF Seats', 'zz-ladderperf-' || substr(v_org::text, 1, 8), 'ZLP', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_dana,  'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'ladderperf_green');
  -- SHARED_ONLY is the setting this lane is judged under: under `all_records` every member
  -- reaches every row and the refusal clause could never go red for the right reason.
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','member_default_visibility','organization', v_org, v_org, '"shared_only"'::jsonb, 'ladderperf_green');

  -- A HOME RECORD: no client door makes one, so this step is the connected role's and asserts
  -- no product clause.
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Home')) returning id into v_home;

  v_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name', 'ZZ Thing', 'slug', 'zz_ladderperf_thing', 'type', 'entity',
    'label_singular', 'Thing', 'label_plural', 'Things', 'title_field', 'tname',
    'display', 'page', 'weight', 'light', 'ordered', false, 'row_order', 'sorted',
    'default_sort', '[]'::jsonb, 'agent_writable', true, 'retention_days', 365,
    'fields', jsonb_build_array(jsonb_build_object('name', 'tname')),
    'parent_id', v_home::text));

  -- The Field row custom.table_declare does not write (SHARED-ONLY left it behind; it is not
  -- this lane's door): the connected role writes it, exactly as the sibling suites do.
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
  -- PART 1 — THE READ DOOR STILL ANSWERS WHAT THE LADDER SAYS, FOR THIS PERSON.
  ---------------------------------------------------------------------------------------------
  if v_seat = 'admin' then
    v_row := custom.read_record(v_org, v_private, true);
    if v_row is null or (v_row ->> 'tname') is distinct from 'Nobody shared this' then
      raise exception '1a: the owner could not read her own record through the door — %', v_row;
    end if;
    raise notice '1a: the owner reads a record nobody shared, through custom.read_record.';

    v_lvl := custom.my_level(v_org, v_private, 'record');
    if v_lvl is null or v_lvl < 'editor'::public.permission_level then
      raise exception '1b: custom.my_level said % for the owner of the record', v_lvl;
    end if;
    raise notice '1b: custom.my_level answers % for the owner — the halving still climbs.', v_lvl;
  else
    -- 1c — THE CONTROL SHE CAN DO. Without it, a door that refused her everything passes 1d.
    v_row := custom.read_record(v_org, v_shared, true);
    if v_row is null or (v_row ->> 'tname') is distinct from 'Shared with Dana' then
      raise exception '1c: the record shared with her at viewer did not read back — %', v_row;
    end if;
    raise notice '1c: the one record shared with her at viewer reads back through the door.';

    v_lvl := custom.my_level(v_org, v_shared, 'record');
    if v_lvl is distinct from 'viewer'::public.permission_level then
      raise exception '1d: custom.my_level said % where the share is viewer', v_lvl;
    end if;
    raise notice '1d: custom.my_level answers viewer on the record she was shared at viewer.';

    -- 1e — THE NEGATIVE. She is a member, the organization says shared_only, nobody shared this
    -- row with her.
    begin
      perform custom.read_record(v_org, v_private, true);
      raise exception '1e: the door read her a record nobody shared with her';
    exception when insufficient_privilege then
      get stacked diagnostics v_msg = message_text;
    end;
    if v_msg not like '%access%' then
      raise exception '1e: the refusal did not say what it was — "%"', v_msg;
    end if;
    raise notice '1e: a record she may not open is refused at 42501 — "%"', v_msg;

    -- 1f — AND THE SECOND DOOR REFUSES HER THE SAME WAY. `custom.my_level` decides on the one
    -- ladder before it will say anything, so a record she may not open has no level to show.
    begin
      v_lvl := custom.my_level(v_org, v_private, 'record');
      raise exception '1f: custom.my_level said % on a record nobody shared with her', v_lvl;
    exception when insufficient_privilege then
      get stacked diagnostics v_msg = message_text;
    end;
    raise notice '1f: custom.my_level refuses her the same record at 42501 — "%"', v_msg;
  end if;

  ---------------------------------------------------------------------------------------------
  -- PART 2 — AND THE LIST DOOR NAMES EXACTLY THE ROWS THE PER-ROW LADDER NAMES.
  -- This is census 13's question on one organization, from the seat, both seats.
  ---------------------------------------------------------------------------------------------
  -- The DOOR half is asked FROM THE SEAT, which is the half that matters.
  select array_agg(d.id order by d.id) into v_door
    from custom.read_records(v_org, v_tbl, true, 200, 0) d;

  -- The LADDER half steps out and says so: it reads `custom.record` itself, and
  -- `authenticated` holds no SELECT on that table (census 7 of check:store-doors-decide is what
  -- keeps it that way), so there is no client door for "what does the one ladder say about every
  -- row of this Table". No product clause is asserted while out.
  perform set_config('role', v_boss, true);
  select array_agg(r.id order by r.id) into v_ladder
    from custom.record r
   where r.organization_id = v_org and r.table_id = v_tbl and r.deleted_at is null
     and custom.has_visibility(v_me, 'record', r.id, 'viewer'::public.permission_level);
  perform set_config('role', 'authenticated', true);
  if coalesce(v_door, '{}'::uuid[]) is distinct from coalesce(v_ladder, '{}'::uuid[]) then
    raise exception '2: the list door and the one ladder disagree for % — door %, ladder %',
      v_seat, coalesce(array_length(v_door,1),0), coalesce(array_length(v_ladder,1),0);
  end if;
  if v_seat = 'dana' and coalesce(array_length(v_door,1),0) <> 1 then
    raise exception '2: dana should see exactly the one row shared with her, and she sees %',
      coalesce(array_length(v_door,1),0);
  end if;
  raise notice '2: the list door and the per-row ladder name the same % row(s) for %.',
    coalesce(array_length(v_door,1),0), v_seat;

  ---------------------------------------------------------------------------------------------
  -- PART 3 — THE TWO CENSUSES THAT KEEP THE CLASS CLOSED.
  --
  -- NO CLIENT DOOR COVERS THIS AND NONE SHOULD: both read the system catalogue, and
  -- `authenticated` holds no EXECUTE on either. The suite steps OUT, says so, and asserts no
  -- product clause while out.
  ---------------------------------------------------------------------------------------------
  perform set_config('role', v_boss, true);

  select count(*) into v_n from custom.ladder_replanners();
  if v_n <> 0 then
    raise exception '3a: % function(s) the one ladder reaches still re-plan on every call: %',
      v_n, (select string_agg(f.fn, ', ' order by f.fn) from custom.ladder_replanners() f);
  end if;
  raise notice '3a: functions on the one ladder that re-plan their body on every call - none.';

  select count(*) into v_n from platform.static_row_probes_stale();
  if v_n <> 0 then
    raise exception '3b: the generated probes are not current: %',
      (select string_agg(s.what || ' — ' || s.detail, '; ') from platform.static_row_probes_stale() s);
  end if;
  raise notice '3b: partitioned entity/registry tables without a current plan-cached probe - none.';

  ---------------------------------------------------------------------------------------------
  -- PART 4 — THE GENERATED PROBE ANSWERS WHAT THE DYNAMIC CHAIN ANSWERED.
  --
  -- The reference is not the new code: it is the SIX `EXECUTE format(...)` fallbacks that
  -- platform.entity_row_access_attrs ran before this lane, written out here in their original
  -- order, run against the same rows. Still stepped out — it is dynamic SQL over a catalogue.
  ---------------------------------------------------------------------------------------------
  for rec in
    select s.schema_name, s.table_name from platform.static_row_probe_spec() s where s.kind = 'entity'
  loop
    for v_probe in execute format(
      'select t.id from %I.%I t order by t.id limit 200', rec.schema_name, rec.table_name)
    loop
      v_ref_fnd := false; v_ref_vis := 'personal'::platform.visibility;
      v_ref_own := null;  v_ref_org := null;
      begin
        execute format('select visibility, created_by, organization_id, true from %I.%I where id = $1',
                       rec.schema_name, rec.table_name)
          into v_ref_vis, v_ref_own, v_ref_org, v_ref_fnd using v_probe.id;
      exception when others then v_ref_fnd := false;
      end;
      if not coalesce(v_ref_fnd, false) then
        begin
          execute format('select visibility, owner_id, organization_id, true from %I.%I where id = $1',
                         rec.schema_name, rec.table_name)
            into v_ref_vis, v_ref_own, v_ref_org, v_ref_fnd using v_probe.id;
        exception when others then v_ref_fnd := false;
        end;
      end if;
      if not coalesce(v_ref_fnd, false) then
        begin
          execute format('select ''personal''::platform.visibility, owner_id, organization_id, true from %I.%I where id = $1',
                         rec.schema_name, rec.table_name)
            into v_ref_vis, v_ref_own, v_ref_org, v_ref_fnd using v_probe.id;
        exception when others then v_ref_fnd := false;
        end;
      end if;
      if not coalesce(v_ref_fnd, false) then
        begin
          execute format('select ''personal''::platform.visibility, created_by, organization_id, true from %I.%I where id = $1',
                         rec.schema_name, rec.table_name)
            into v_ref_vis, v_ref_own, v_ref_org, v_ref_fnd using v_probe.id;
        exception when others then v_ref_fnd := false;
        end;
      end if;
      if not coalesce(v_ref_fnd, false) then
        begin
          execute format('select $2::platform.visibility, null::uuid, organization_id, true from %I.%I where id = $1',
                         rec.schema_name, rec.table_name)
            into v_ref_vis, v_ref_own, v_ref_org, v_ref_fnd
            using v_probe.id,
                  coalesce((select et.default_visibility from platform.entity_types et
                             where et.schema_name = rec.schema_name and et.table_name = rec.table_name
                             limit 1), 'personal'::platform.visibility);
        exception when others then v_ref_fnd := false;
        end;
      end if;

      select p.o_vis, p.o_owner, p.o_org, p.o_found
        into v_got_vis, v_got_own, v_got_org, v_got_fnd
        from platform.partitioned_row_attrs(rec.schema_name, rec.table_name, v_probe.id) p;
      if (v_got_vis, v_got_own, v_got_org, coalesce(v_got_fnd, false))
         is distinct from (v_ref_vis, v_ref_own, v_ref_org, coalesce(v_ref_fnd, false))
      then
        raise exception '4: the generated probe and the six fallbacks disagree on %.% id %',
          rec.schema_name, rec.table_name, v_probe.id;
      end if;
      v_checked := v_checked + 1;
    end loop;
  end loop;
  raise notice '4: the generated probe and the six EXECUTE fallbacks agree on % sampled row(s), '
               'across every partitioned entity table on this database.', v_checked;

  ---------------------------------------------------------------------------------------------
  -- TEARDOWN — the transaction rolls back, so this organization never existed.
  ---------------------------------------------------------------------------------------------
  if exists (select 1 from iam.organizations o where o.id = v_org) then
    raise notice 'TEARDOWN: the disposable organization is rolled back with this transaction.';
  end if;

  raise notice 'LADDER-PERF GREEN (seat %): ALL PARTS PASSED.', v_seat;
end;
$t$;

rollback;
