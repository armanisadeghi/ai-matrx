-- LEAK-T10 — THE GREEN SUITE. TWO HOMES, ONE TABLE, AND THE LISTS SAY WHAT THE RECORD SAYS.
--
-- RUN IT (against the MAIN database — this is where the store lives):
--   "$PSQL" "<the five SUPABASE_MATRIX_* values>" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/leakt10_green.sql
--
-- IT IS NOT A MIGRATION and never becomes one: it lives outside `migrations/`.
--
-- WHAT IT PROVES. The seventh independent pass's only launch-stopping finding: under "people
-- only see what is shared with them", a member shared ONE Home of a Table that lives in more
-- than one Home was handed EVERY record of that Table in every other Home — with its contents —
-- by `custom.read_records`, `custom.query_visible_ids`, `custom.query_across_homes` and
-- `custom.io_export`, while `custom.read_record` refused her the same row. Two doors of one
-- store, the same row, opposite answers, and the list was the one that leaked.
--
-- EVERY ASSERTED CLAUSE RUNS FROM THE SEAT `authenticated`, through the doors a signed-in
-- person's browser reaches, carrying that person's own claims. `admin@admin.com` owns the
-- throwaway organization; `test@test.com` (Dana) is a plain MEMBER of it and is shared exactly
-- one Project. Nobody's own records are touched and the whole thing ends in ROLLBACK.
--
-- PARTS: 0 the seat · 1 T10, every list door against the record door · 2 T7's last clause,
-- a column a formula depends on · 3 the comment refusal says what is true · 4 the two censuses
-- read zero.
--
-- ITS RED TWIN is `leakt10_red.sql`, which executes the real inverse bodies inside a rolled-back
-- transaction and requires every clause below to fail.

\set ON_ERROR_STOP on
\timing off

\set ORG   '\'7e100000-0000-4a00-8a00-000000000001\''
\set ADMIN '\'87a6e699-3622-4869-8843-d0867456c0dd\''
\set DANA  '\'4060701e-706a-4c76-b3ca-0bbc69fa5a14\''

begin;
set local statement_timeout = '600s';
set local lock_timeout = '20s';
select set_config('app.actor_system', 'campaign-test/leakt10_green', true);

delete from iam.permissions where resource_type = 'record'
   and resource_id in (select id from custom.record where organization_id = :ORG);
delete from platform.associations where organization_id = :ORG;
delete from custom.record where organization_id = :ORG;
delete from platform.knob_override where organization_id = :ORG;
delete from iam.memberships where organization_id = :ORG;
delete from iam.organizations where id = :ORG;

insert into iam.organizations (id, name, slug, abbreviation, created_by)
values (:ORG, 'LEAK-T10 Green Throwaway', 'leakt10-green-throwaway', 'LTG', :ADMIN);
insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
values (:ORG, 'organization', :ORG, :ADMIN, 'owner',  'active'),
       (:ORG, 'organization', :ORG, :DANA,  'member', 'active');
insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
values ('custom', 'system_enabled',            'organization', :ORG, :ORG, 'true'::jsonb,          'LEAK-T10 green suite'),
       ('custom', 'member_default_visibility', 'organization', :ORG, :ORG, '"shared_only"'::jsonb, 'LEAK-T10 green suite');

do $t$
declare
  v_org   constant uuid := '7e100000-0000-4a00-8a00-000000000001';
  v_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_dana  constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  c_admin_j text; c_dana_j text; v_boss text := current_user;
  v_home uuid; v_tproj uuid; v_hx uuid; v_hy uuid; v_trisk uuid; v_rx uuid; v_ry uuid;
  v_num uuid; v_dbl uuid; v_item uuid; v_titems uuid;
  n int; v_opened boolean; v_msg text;
begin
  if (select system_identifier from pg_control_system()) <> 7642734024280108049 then
    raise exception 'leakt10_green.sql runs on the MAIN database only, and this is %',
      (select system_identifier from pg_control_system());
  end if;
  c_admin_j := json_build_object('sub', v_admin::text, 'role', 'authenticated', 'email', 'admin@admin.com')::text;
  c_dana_j  := json_build_object('sub', v_dana::text,  'role', 'authenticated', 'email', 'test@test.com')::text;

  -- ══════════════════════════════ PART 0 — take the seat and PROVE it
  perform set_config('request.jwt.claims', c_admin_j, true);
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
  raise notice 'PART 0 PASSED — seated as %, and custom.record refuses it directly', current_user;

  -- ══════════════════════════════ the fixture, through the product's own doors
  v_home  := custom.record_write(v_org, custom.organization_kernel_id(), jsonb_build_object('name', 'green home'));
  v_tproj := custom.table_declare(v_org, jsonb_build_object(
    'name','ltg_projects','slug','ltg_projects','label_singular','Project','label_plural','Projects',
    'type','entity','display','list','ordered',false,'weight','light','retention_days',30,
    'default_sort','[]'::jsonb,'row_order','sorted','agent_writable',true,
    'fields', jsonb_build_array(jsonb_build_object('name','title','kind','text')),
    'title_field','title','parent_id', v_home::text));
  perform custom.field_declare(v_org, v_tproj, jsonb_build_object('label','Title','type','text'));
  v_hx := custom.record_write(v_org, v_tproj, jsonb_build_object('title','Project X'));
  v_hy := custom.record_write(v_org, v_tproj, jsonb_build_object('title','Project Y'));
  v_trisk := custom.table_declare(v_org, jsonb_build_object(
    'name','ltg_risks','slug','ltg_risks','label_singular','Risk','label_plural','Risks',
    'type','entity','display','list','ordered',false,'weight','light','retention_days',30,
    'default_sort','[]'::jsonb,'row_order','sorted','agent_writable',true,
    'fields', jsonb_build_array(jsonb_build_object('name','title','kind','text')),
    'title_field','title','parent_id', v_home::text));
  perform custom.field_declare(v_org, v_trisk, jsonb_build_object('label','Title','type','text'));
  -- ONE TABLE, TWO HOMES — acceptance test 10's shape.
  perform custom.home_add(v_org, v_trisk, v_hx);
  perform custom.home_add(v_org, v_trisk, v_hy);
  v_rx := custom.record_write(v_org, v_trisk, jsonb_build_object('title','risk in X'));
  v_ry := custom.record_write(v_org, v_trisk, jsonb_build_object('title','risk in Y'));
  perform custom.record_reparent(v_org, v_rx, v_hx);
  perform custom.record_reparent(v_org, v_ry, v_hy);
  -- SHE IS GIVEN PROJECT X AND NOTHING ELSE.
  perform custom.share_grant(v_org, v_hx, 'user', v_dana, 'viewer'::public.permission_level);

  -- ══════════════════════════════ PART 1 — T10, from HER seat
  perform set_config('request.jwt.claims', c_dana_j, true);

  -- 1a. the record door opens X's risk …
  if custom.read_record(v_org, v_rx, true) is null then
    raise exception '1a: custom.read_record would not open the risk in the project she WAS shared';
  end if;
  -- 1b. … and refuses Y's.
  v_opened := true;
  begin
    perform custom.read_record(v_org, v_ry, true);
  exception when insufficient_privilege then v_opened := false;
  end;
  if v_opened then
    raise exception '1b: custom.read_record opened the risk in the project she was never given';
  end if;

  -- 1c-1f. AND EVERY LIST DOOR SAYS THE SAME THING — one row, and it is X's.
  select count(*) into n from custom.read_records(v_org, v_trisk, true, 200, 0) d where d.id = v_ry;
  if n <> 0 then raise exception '1c: custom.read_records handed her the other project''s risk'; end if;
  select count(*) into n from custom.read_records(v_org, v_trisk, true, 200, 0);
  if n <> 1 then raise exception '1c: custom.read_records returned % rows where exactly one is hers', n; end if;

  select count(*) into n from custom.query_visible_ids(v_org, v_trisk, 'viewer') d where d = v_ry;
  if n <> 0 then raise exception '1d: custom.query_visible_ids handed her the other project''s risk'; end if;

  select count(*) into n from custom.query_across_homes(v_org, v_trisk, 200, 0, 'viewer') d
   where d.record_id = v_ry;
  if n <> 0 then raise exception '1e: custom.query_across_homes handed her the other project''s risk'; end if;

  if jsonb_array_length(custom.io_export(v_org, v_trisk, null, 200, 'viewer') -> 'rows') <> 1 then
    raise exception '1f: custom.io_export gave her % row(s) where exactly one is hers',
      jsonb_array_length(custom.io_export(v_org, v_trisk, null, 200, 'viewer') -> 'rows');
  end if;

  -- 1g. the control: the Table she reaches through Project X is still KNOWN to her (T10's other
  -- half — refusing her the table entirely was the sixth pass's defect, not this one's).
  if (select count(*) from custom.applicable_fields(v_org, v_trisk, null)) = 0 then
    raise exception '1g: she can see a record in this table and the table describes no columns to her';
  end if;
  raise notice 'PART 1 PASSED — T10: the record door and all four list doors agree, one row, hers';

  -- ══════════════════════════════ PART 2 — T7's last clause
  perform set_config('request.jwt.claims', c_admin_j, true);
  v_titems := custom.table_declare(v_org, jsonb_build_object(
    'name','ltg_items','slug','ltg_items','label_singular','Item','label_plural','Items',
    'type','entity','display','list','ordered',false,'weight','light','retention_days',30,
    'default_sort','[]'::jsonb,'row_order','sorted','agent_writable',true,
    'fields', jsonb_build_array(jsonb_build_object('name','title','kind','text')),
    'title_field','title','parent_id', v_home::text));
  perform custom.field_declare(v_org, v_titems, jsonb_build_object('label','Title','type','text'));
  v_num := custom.field_declare(v_org, v_titems, jsonb_build_object('label','Number','type','number'));
  v_dbl := custom.field_declare(v_org, v_titems, jsonb_build_object('label','Double','type','number',
    'parity','formula',
    'config', jsonb_build_object('expr', jsonb_build_object('op','multiply','args',
      jsonb_build_array(jsonb_build_object('field', v_num::text), jsonb_build_object('const', 2))))));

  -- 2a. the store can already NAME the formula …
  if not exists (select 1 from custom.field_dependants(v_org, v_num) d where d.dependant_id = v_dbl) then
    raise exception '2a: custom.field_dependants does not name the formula that reads this column';
  end if;
  -- 2b. … so retiring the column it reads is refused, with the formula's own name in it.
  v_msg := null;
  begin
    perform custom.field_retire(v_org, v_num);
  exception when others then v_msg := sqlerrm;
  end;
  if v_msg is null then
    raise exception '2b: custom.field_retire removed a column a formula depends on, in silence';
  end if;
  if position('Double' in v_msg) = 0 then
    raise exception '2b: the refusal does not name the formula — it said "%"', v_msg;
  end if;
  -- 2c. the control: a column nothing depends on still retires.
  if not custom.field_retire(v_org, v_dbl) then
    raise exception '2c: a column nothing depends on was not retired';
  end if;
  raise notice 'PART 2 PASSED — T7: "%"', v_msg;

  -- ══════════════════════════════ PART 3 — the comment refusal says what is true
  v_item := custom.record_write(v_org, v_titems, jsonb_build_object('title','an item'));
  perform set_config('request.jwt.claims', c_dana_j, true);
  -- 3a. she holds NOTHING on it: she is not told she may read it.
  v_msg := null;
  begin
    perform custom.io_comment_write(v_org, v_item, 'hello');
  exception when others then v_msg := sqlerrm;
  end;
  if v_msg is null then
    raise exception '3a: somebody who holds nothing on the record commented on it';
  end if;
  if position('You may read this record' in v_msg) > 0 then
    raise exception '3a: she was told she may read a record she may not — "%"', v_msg;
  end if;
  -- 3b. shared at VIEWER, the sentence is the true one.
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform custom.share_grant(v_org, v_item, 'user', v_dana, 'viewer'::public.permission_level);
  perform set_config('request.jwt.claims', c_dana_j, true);
  v_msg := null;
  begin
    perform custom.io_comment_write(v_org, v_item, 'hello');
  exception when others then v_msg := sqlerrm;
  end;
  if v_msg is null or position('You may read this record but not comment on it' in v_msg) = 0 then
    raise exception '3b: a viewer was not told the true thing — "%"', coalesce(v_msg, '<she commented>');
  end if;
  -- 3c. the control: at COMMENTER the comment lands.
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform custom.share_grant(v_org, v_item, 'user', v_dana, 'commenter'::public.permission_level);
  perform set_config('request.jwt.claims', c_dana_j, true);
  if custom.io_comment_write(v_org, v_item, 'hello') is null then
    raise exception '3c: a commenter could not comment';
  end if;
  raise notice 'PART 3 PASSED — the refusal matches the fact at every rung';

  -- ══════════════════════════════ PART 4 — the two censuses, over the WHOLE database
  -- NO CLIENT DOOR COVERS A CENSUS: both are server-only by declaration
  -- (platform.client_callable_door). The seat steps OUT to run them and asserts no product
  -- clause while out.
  perform set_config('role', v_boss, true);
  select count(*) into n from custom.list_door_disagreements();
  if n <> 0 then
    raise exception '4a: census 13 names % (member, record, door) row(s) where a list door and custom.read_record disagree', n;
  end if;
  select count(*) into n from custom.refusals_claiming_a_level_never_asked();
  if n <> 0 then
    raise exception '4b: census 14 names % door(s) telling a caller they may read a record the door never asked about', n;
  end if;
  raise notice 'PART 4 PASSED — census 13 and census 14 both read zero on the whole database';

  raise notice 'ALL PARTS PASSED (0 seat, 1 T10 a-g, 2 T7 a-c, 3 refusal a-c, 4 censuses a-b)';
end $t$;

rollback;
