-- SHARED-ONLY — THE RED TWIN. WITH THIS LANE'S INVERSES RUN, EVERY CLAUSE FAILS.
--
-- RUN IT FROM THE REPOSITORY ROOT (the `\i` paths are relative to it), against the MAIN
-- database, exactly like the green suite. It opens ONE transaction, builds the same throwaway
-- organization, EXECUTES THIS LANE'S FIVE INVERSE FILES inside it — which both proves those
-- files are valid SQL and puts the database back in the state the sixth independent pass
-- found — asks the green suite's questions, requires every one of them to FAIL, and ROLLS
-- BACK. Nothing it does survives the transaction; the last line proves that by re-asking.
--
-- A GUARD THAT CANNOT GO RED IS NOT A GUARD. The five blocks below are the five sentences of
-- the sixth pass's finding, in its own words:
--
--   1. "We shared one record with her at Editor... every screen and every read door answers no"
--   2. "We shared the whole table with her instead... at every level the table opens and
--      contains ZERO ROWS"
--   3. a record SHE created is in a table she cannot open
--   4. the table holding her record never appears in her table list
--   5. the RLS mirror admits every member of a `shared_only` organization to every internal row
--
-- 🚨 SEATED (lane ORG-DELETE, 2026-09-19). Blocks 1 to 4 are asked FROM `test@test.com`'s OWN
-- SEAT, as the role `authenticated`, THROUGH THE READ DOORS — `custom.my_level`,
-- `custom.read_record` and `custom.read_records` — instead of as the role that owns the store
-- through `custom.has_visibility` and `custom.visible_set`.
--
-- The old file said this was deliberate, and gave two reasons. Both are answered:
--
--   · "`custom.assert_may_know_table` asks EXACTLY block 1's question, so a false there IS the
--     refusal the sixth pass photographed." It is the same question only if the ladder is the
--     only thing between the person and the answer. From the owner's role it is: that seat
--     walks past `custom.assert_client_may_reach` on its first line, holds every EXECUTE grant
--     for free, and reads `custom.record` straight through. So the old blocks proved the
--     KERNEL disagrees with itself and never proved that a PERSON is refused — which is the
--     whole subject of this lane. The refusal the sixth pass photographed was a person's.
--
--   · "asking through a definer door inside a transaction that has just replaced eleven
--     function bodies underneath itself is fragile." Measured on the main database on
--     2026-09-19: the five inverse files `create or replace` six functions and drop four, and
--     NOT ONE of them is a door `authenticated` holds EXECUTE on. `custom.read_record`,
--     `custom.read_records` and `custom.my_level` keep their grants and their bodies; what the
--     inverses change is the visibility kernel UNDERNEATH them, which is exactly the thing
--     these blocks are about. Nothing is fragile and nothing is definer-boundary luck.
--
-- Block 5 is the only one that stays out of the seat, and it says so: it reads the TEXT of the
-- RLS policy expression out of `iam.entity_read_expr`, which is the store's own definition
-- rather than anything a person may ask, and it asserts nothing about what a person may do.
--
-- The FIXTURE is built as the connected role, before any clause is asserted: an organization,
-- two memberships, two knobs, a Home, a Table through `custom.table_declare`, four records,
-- one of them created BY test@test.com, and one share to her at editor. None of it asserts
-- anything.

\set ON_ERROR_STOP on
\timing off

\set ORG   '\'50a30000-0000-4a00-8a00-000000000001\''
\set ADMIN '\'87a6e699-3622-4869-8843-d0867456c0dd\''
\set DANA  '\'4060701e-706a-4c76-b3ca-0bbc69fa5a14\''

begin;
set local statement_timeout = '60s';
set local lock_timeout = '10s';
select set_config('app.actor_system', 'campaign-test/sharedonly_red', true);

-- ── the same fixture, in its own organization id ────────────────────────────────────────
insert into iam.organizations (id, name, slug, abbreviation, created_by)
values (:ORG, 'SHARED-ONLY Red Throwaway', 'sharedonly-red-throwaway', 'SOR', :ADMIN);
insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
values (:ORG, 'organization', :ORG, :ADMIN, 'owner',  'active'),
       (:ORG, 'organization', :ORG, :DANA,  'member', 'active');
insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
values ('custom', 'system_enabled',            'organization', :ORG, :ORG, 'true'::jsonb,          'SHARED-ONLY red twin'),
       ('custom', 'member_default_visibility', 'organization', :ORG, :ORG, '"shared_only"'::jsonb, 'SHARED-ONLY red twin');

do $t$
declare
  v_org   constant uuid := '50a30000-0000-4a00-8a00-000000000001';
  v_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_dana  constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  v_hq    constant uuid := '50a30000-0000-4a00-8a00-000000000011';
  v_a     constant uuid := '50a30000-0000-4a00-8a00-000000000021';
  t uuid;
begin
  if (select system_identifier from pg_control_system()) <> 7642734024280108049 then
    raise exception 'sharedonly_red.sql runs on the MAIN database only, and this is %',
      (select system_identifier from pg_control_system());
  end if;
  insert into custom.record (id, organization_id, table_id, data_class, data, created_by)
  values (v_hq, v_org, null, 'record', jsonb_build_object('name', 'SHARED-ONLY Red HQ'), v_admin);
  t := custom.table_declare(v_org, jsonb_build_object(
    'name','Case','slug','sor_case','label_singular','Case','label_plural','Cases',
    'type','entity','display','list','ordered',false,'weight','light','retention_days',30,
    'default_sort','[]'::jsonb,'row_order','sorted','agent_writable',true,
    'fields', jsonb_build_array(jsonb_build_object('name','title','kind','text')),
    'title_field','title','parent_id', v_hq::text));
  -- The Table is given a FIXED id so the block below, which runs in another `do`, can name it.
  update custom.record set id = v_a where organization_id = v_org and id = t;
  update custom.record set data = data || jsonb_build_object('entity_definition_id', v_a::text)
   where organization_id = v_org and table_id = custom.field_kernel_id()
     and (data ->> 'entity_definition_id')::uuid = t;
  update custom.field set entity_definition_id = v_a where organization_id = v_org and entity_definition_id = t;
  insert into custom.record (id, organization_id, table_id, data_class, data, created_by) values
    ('50a30000-0000-4a00-8a00-000000000031', v_org, v_a, 'record', jsonb_build_object('title','Case one'), v_admin),
    ('50a30000-0000-4a00-8a00-000000000032', v_org, v_a, 'record', jsonb_build_object('title','Case two'), v_admin),
    ('50a30000-0000-4a00-8a00-000000000033', v_org, v_a, 'record', jsonb_build_object('title','Case three'), v_admin);
  -- A record SHE created, and a record shared with her.
  insert into custom.record (id, organization_id, table_id, data_class, data, created_by) values
    ('50a30000-0000-4a00-8a00-000000000034', v_org, v_a, 'record', jsonb_build_object('title','Dana''s own'),
     '4060701e-706a-4c76-b3ca-0bbc69fa5a14');
  insert into iam.permissions (resource_type, resource_id, granted_to_user_id, permission_level, created_by)
  values ('record', '50a30000-0000-4a00-8a00-000000000031', '4060701e-706a-4c76-b3ca-0bbc69fa5a14', 'editor', v_admin);
end $t$;

-- ── THIS LANE, UNDONE, inside the transaction. Newest first, exactly as rule 27 runs them. ──
\i migrations/inverse/sharedonly_the_census_names_the_kind_of_disagreement_down.sql
\i migrations/inverse/sharedonly_the_carrying_table_is_the_organizations_own_down.sql
\i migrations/inverse/sharedonly_knowing_a_table_is_not_being_carried_by_it_down.sql
\i migrations/inverse/sharedonly_a_shared_table_shows_its_rows_down.sql
\i migrations/inverse/sharedonly_the_rls_mirror_knows_the_member_knob_down.sql

-- ── EVERY QUESTION THIS LANE ANSWERS, ASKED OF THE UNDONE DATABASE, FROM HER SEAT ───────
do $t$
declare
  v_org    constant uuid := '50a30000-0000-4a00-8a00-000000000001';
  v_dana   constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  v_a      constant uuid := '50a30000-0000-4a00-8a00-000000000021';
  v_rec1   constant uuid := '50a30000-0000-4a00-8a00-000000000031';
  v_mine   constant uuid := '50a30000-0000-4a00-8a00-000000000034';
  c_dana_j constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_red    text[] := '{}';
  v_holds  boolean;
  v_table_opens boolean;
  v_rows   integer;
  v_listed boolean;
  v_msg    text;
  v_boss   text := current_user;
begin
  -- ── HER SEAT, AND THE PROOF THAT IT IS ONE ───────────────────────────────────────────
  perform set_config('request.jwt.claims', c_dana_j, true);
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

  -- 1. SHE HOLDS THE RECORD AND THE TABLE IT LIVES IN IS INVISIBLE. `custom.my_level` is the
  --    door every screen asks "may this person open this, and at what level" — and it does not
  --    answer `null` for something she cannot reach, it REFUSES her by name. So the record
  --    answers `editor` and the Table answers "You do not have access to this record".
  v_holds := false;
  begin
    v_holds := custom.my_level(v_org, v_rec1, 'record') is not null;
  exception when others then
    v_holds := false;
  end;
  v_table_opens := true;
  begin
    perform custom.my_level(v_org, v_a, 'record');
  exception when others then
    get stacked diagnostics v_msg = message_text;
    v_table_opens := false;
  end;
  if v_holds and not v_table_opens then
    v_red := v_red || array[format(
      '1: she holds the record at editor and the table it lives in answers "%s", so every screen and every read door refuses her', v_msg)];
  end if;

  -- 2. THE WHOLE TABLE SHARED AT ADMIN, AND THE READ DOOR STILL CARRIES NOT ONE ROW.
  --    The share is made by the organization's owner, from the owner's seat, through the same
  --    door a person shares anything with.
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform custom.share_grant(v_org, v_a, 'user', v_dana, 'admin'::public.permission_level);
  perform set_config('request.jwt.claims', c_dana_j, true);

  -- With the whole table hers at ADMIN the TABLE now opens — and the read door carries not one
  -- of the rows the share was supposed to hand her. `Case two` and `Case three` are the two she
  -- holds by no other route; `Case one` was shared with her directly and `Dana's own` she made
  -- herself, and those two come back whether the table is shared or not. So the clause counts
  -- what the SHARE carried, which is the thing the sixth pass photographed.
  v_rows := -1;
  begin
    select count(*) into v_rows from custom.read_records(v_org, v_a, true, 200, 0) r
     where r.id in ('50a30000-0000-4a00-8a00-000000000032'::uuid,
                    '50a30000-0000-4a00-8a00-000000000033'::uuid);
  exception when others then
    get stacked diagnostics v_msg = message_text;
    v_rows := -1;
  end;
  if v_rows <= 0 then
    v_red := v_red || array[format(
      '2: the whole table shared at ADMIN and the read door hands her %s of the two rows she holds no other way',
      case when v_rows < 0 then 'nothing, refusing her outright,' else v_rows::text end)];
  end if;

  perform set_config('request.jwt.claims', c_admin_j, true);
  perform custom.share_revoke(v_org, v_a, 'user', v_dana);
  perform set_config('request.jwt.claims', c_dana_j, true);

  -- 3. A RECORD SHE CREATED, IN A TABLE THAT ANSWERS NO. The table share was revoked above, so
  --    this is the same pair of questions about a record she made herself.
  v_holds := false;
  begin
    v_holds := custom.my_level(v_org, v_mine, 'record') is not null;
  exception when others then
    v_holds := false;
  end;
  v_table_opens := true;
  begin
    perform custom.my_level(v_org, v_a, 'record');
  exception when others then
    v_table_opens := false;
  end;
  if v_holds and not v_table_opens then
    v_red := v_red || array['3: she created a row in this table, holds it, and the table still answers no'::text];
  end if;

  -- 4. AND SO THE TABLE IS NOT IN THE LIST THE SCREENS BUILD — her own list of Tables, read
  --    through the same door every other list is read through.
  v_listed := false;
  begin
    select exists (select 1 from custom.read_records(v_org, custom.table_kernel_id(), true, 500, 0) r
                    where r.id = v_a)
      into v_listed;
  exception when others then
    v_listed := false;
  end;
  if not v_listed then
    v_red := v_red || array['4: the table holding her shared record and her own record is not in her table list'::text];
  end if;

  -- 5. THE RLS MIRROR ADMITS EVERY MEMBER OF A shared_only ORGANIZATION TO EVERY INTERNAL ROW.
  --    This is the TEXT of a policy expression — the store's own definition, not anything a
  --    person may ask — so it steps OUT of the seat, says so, and asserts nothing about what a
  --    person may do.
  perform set_config('role', v_boss, true);
  if iam.entity_read_expr('custom', 'record', 'record') not like '%member_lane_open%' then
    v_red := v_red || array['5: the RLS policy text has no idea the organization said shared_only'::text];
  end if;
  perform set_config('role', 'authenticated', true);

  if array_length(v_red, 1) is distinct from 5 then
    raise exception 'THE RED TWIN IS NOT RED: only % of 5 blocks failed - %',
      coalesce(array_length(v_red, 1), 0), v_red;
  end if;
  raise notice '5 of 5 blocks are RED - %', array_to_string(v_red, ' | ');
end $t$;
rollback;

-- ── AND NOTHING SURVIVED IT. ────────────────────────────────────────────────────────────
do $t$
declare v_n integer;
begin
  select count(*) into v_n from iam.organizations where id = '50a30000-0000-4a00-8a00-000000000001';
  if v_n <> 0 then raise exception 'ROLLBACK FAILED: the red twin''s organization is still here'; end if;
  if iam.entity_read_expr('custom', 'record', 'record') not like '%member_lane_open%' then
    raise exception 'ROLLBACK FAILED: the RLS mirror is still the inverse''s version';
  end if;
  if to_regprocedure('custom.reaches_directly(uuid, text, uuid, public.permission_level)') is null then
    raise exception 'ROLLBACK FAILED: custom.reaches_directly is still dropped';
  end if;
  if to_regprocedure('custom.shared_only_disagreements(text)') is null then
    raise exception 'ROLLBACK FAILED: the census is still dropped';
  end if;
  raise notice 'ROLLBACK VERIFIED — the five inverse files ran as valid SQL and nothing they did survived.';
end $t$;
