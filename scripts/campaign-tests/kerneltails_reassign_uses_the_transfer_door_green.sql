-- LANE KERNEL-TAILS — THE BULK OFFBOARDING REASSIGNMENT HANDS PERSONAL TABLES OVER THROUGH THE
-- AUDITED TRANSFER DOOR (custom.table_transfer_owner), one Table at a time.
--
-- THE REAL USE CASE: Cedar Hollow Veterinary. admin@admin.com owns the practice. Jordan Pike, a
-- kennel technician who is leaving (a suite-only seat created and rolled back inside this
-- transaction), kept two Tables to himself: "My boarding checklists" and "Kennel supply orders",
-- both "Only people I share it with", plus an ordinary Table "Kennel cleaning rota" nobody set a
-- lane on, and a note in each. The owner reassigns Jordan's work to Dr. Reyes (test@test.com).
--   R1  the call answers a personal_table row of 2, and the ordinary record rows still move.
--   R2  two table.transfer_owner audit rows (one per Table, each with the offboarding reason), and
--       the one summary resources.reassign row still written.
--   R3  four notices (custom.table.ownership_transferred): Jordan and Dr. Reyes, for each Table.
--   R4  both personal Tables now belong to Dr. Reyes, are still personal, and Jordan is named
--       editor on each; the ordinary Table and the notes moved exactly as the bulk call always did.
--   R5  unchanged contract: naming yourself is still refused (DD-140); an archived personal Table
--       keeps its owner (it is not silently handed over).
--
-- RUN IT (clone or production; ONE rolled-back transaction; the psql -f needs the sandbox disabled):
--   psql "<DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/kerneltails_reassign_uses_the_transfer_door_green.sql
-- ITS RED: before kerneltails_bulk_reassignment_uses_the_transfer_door.sql (and after its inverse)
-- R1 fails (no personal_table row), R2 finds 0 transfer audit rows, R3 finds 0 notices.

\set ON_ERROR_STOP on
\timing off

\set suite 'kerneltails_reassign_uses_the_transfer_door_green.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local statement_timeout = '180s';
set local lock_timeout = '20s';
select set_config('app.actor_system', 'kerneltails_reassign_green_suite', true);

-- ── fixtures
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values ('5ba5aa1e-0000-4a00-8a00-00000000a0d1', '00000000-0000-0000-0000-000000000000', 'authenticated',
        'authenticated', 'jordan.pike.kerneltails-suite@aimatrx.com',
        '{"display_name": "Jordan Pike"}'::jsonb, now(), now());
insert into iam.organizations (id, name, slug, abbreviation, created_by)
values ('5ba5aa1e-0000-4a00-8a00-000000000d01', 'Cedar Hollow Veterinary', 'cedar-hollow-vet-kernel-tails',
        'CHV', '87a6e699-3622-4869-8843-d0867456c0dd');
insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
 ('5ba5aa1e-0000-4a00-8a00-000000000d01', 'organization', '5ba5aa1e-0000-4a00-8a00-000000000d01',
  '87a6e699-3622-4869-8843-d0867456c0dd', 'owner', 'active'),
 ('5ba5aa1e-0000-4a00-8a00-000000000d01', 'organization', '5ba5aa1e-0000-4a00-8a00-000000000d01',
  '4060701e-706a-4c76-b3ca-0bbc69fa5a14', 'member', 'active'),
 ('5ba5aa1e-0000-4a00-8a00-000000000d01', 'organization', '5ba5aa1e-0000-4a00-8a00-000000000d01',
  '5ba5aa1e-0000-4a00-8a00-00000000a0d1', 'member', 'active');
insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
values ('custom', 'system_enabled', 'organization', '5ba5aa1e-0000-4a00-8a00-000000000d01',
        '5ba5aa1e-0000-4a00-8a00-000000000d01', 'true'::jsonb, 'KERNEL-TAILS reassign green suite');

create temp table kt_probe (k text primary key, v uuid) on commit drop;
grant select on kt_probe to authenticated;

do $t$
declare
  v_org constant uuid := '5ba5aa1e-0000-4a00-8a00-000000000d01';
  v_hq  constant uuid := '5ba5aa1e-0000-4a00-8a00-000000000d02';
  v_adm constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_jp  constant uuid := '5ba5aa1e-0000-4a00-8a00-00000000a0d1';
  t uuid; b uuid; k text; nm text;
  f jsonb := jsonb_build_array(jsonb_build_object('name', 'title', 'kind', 'text'));
begin
  insert into custom.record (id, organization_id, table_id, data_class, data, created_by)
  values (v_hq, v_org, '11111111-0000-4000-8000-000000000004', 'record', jsonb_build_object('name', 'Kennel'), v_adm);
  foreach k in array array['checklists', 'supplies', 'rota', 'oldlog'] loop
    nm := case k when 'checklists' then 'My boarding checklists' when 'supplies' then 'Kennel supply orders'
                 when 'rota' then 'Kennel cleaning rota' else 'Old intake log' end;
    t := custom.table_declare(v_org, jsonb_build_object(
      'name', nm, 'slug', 'kt_' || k, 'label_singular', 'Entry', 'label_plural', 'Entries',
      'type', 'entity', 'display', 'list', 'ordered', false, 'weight', 'light', 'retention_days', 30,
      'default_sort', '[]'::jsonb, 'row_order', 'sorted', 'agent_writable', true,
      'fields', f, 'title_field', 'title', 'parent_id', v_hq::text));
    update custom.record set created_by = v_jp where id = t;
    insert into custom.record (organization_id, table_id, data_class, data, created_by)
    values (v_org, t, 'record', jsonb_build_object('title', case k
      when 'checklists' then 'Biscuit (beagle) - evening meds 6pm, check water bowl'
      when 'supplies' then 'Order 4 bags of kibble and a case of puppy pads'
      when 'rota' then 'Run 3 deep clean - Tuesday'
      else 'Intake: Mochi (shih tzu), arrived 9:15' end), v_jp)
    returning id into b;
    insert into kt_probe values (k, t), (k || '_row', b);
  end loop;
end $t$;

-- Jordan keeps three Tables to himself; the fourth ("Old intake log") he later archives.
select set_config('request.jwt.claims', '{"sub":"5ba5aa1e-0000-4a00-8a00-00000000a0d1","role":"authenticated"}', true);
set local role authenticated;
select custom.share_lane_set('5ba5aa1e-0000-4a00-8a00-000000000d01', (select v from kt_probe where k = 'checklists'), 'mine') ->> 'message' as said;
select custom.share_lane_set('5ba5aa1e-0000-4a00-8a00-000000000d01', (select v from kt_probe where k = 'supplies'), 'mine') ->> 'message' as said;
select custom.share_lane_set('5ba5aa1e-0000-4a00-8a00-000000000d01', (select v from kt_probe where k = 'oldlog'), 'mine') ->> 'message' as said;
reset role;
update custom.record set deleted_at = now()
 where organization_id = '5ba5aa1e-0000-4a00-8a00-000000000d01' and id = (select v from kt_probe where k = 'oldlog');

do $t$
begin
  if (select count(*) from custom.record where organization_id = '5ba5aa1e-0000-4a00-8a00-000000000d01'
        and id in (select v from kt_probe where k in ('checklists', 'supplies', 'oldlog'))
        and visibility < 'internal'::platform.visibility) <> 3 then
    raise exception 'FIXTURE FAILED — the three Tables Jordan kept to himself are not personal';
  end if;
end $t$;

-- ── the reassignment, as the practice owner. Scoped to the record kind (p_resource_types) so the
-- suite rewrites one partition of custom.record, not every registered table on a shared database.
select set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
create temp table kt_out on commit drop as
select * from public.org_admin_reassign_member_resources(
  '5ba5aa1e-0000-4a00-8a00-000000000d01', '5ba5aa1e-0000-4a00-8a00-00000000a0d1',
  '4060701e-706a-4c76-b3ca-0bbc69fa5a14', array['record']);

do $t$
declare
  v_org constant uuid := '5ba5aa1e-0000-4a00-8a00-000000000d01';
  v_jp  constant uuid := '5ba5aa1e-0000-4a00-8a00-00000000a0d1';
  v_dr  constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  n int;
begin
  -- R1
  if coalesce((select reassigned from kt_out where resource_type = 'personal_table'), 0) <> 2 then
    raise exception 'R1 FAILED — the call did not report two personal Tables transferred: %',
      (select jsonb_agg(to_jsonb(o)) from kt_out o);
  end if;
  if coalesce((select reassigned from kt_out where resource_type = 'record'), 0) < 1 then
    raise exception 'R1 FAILED — the ordinary records no longer moved: %', (select jsonb_agg(to_jsonb(o)) from kt_out o);
  end if;
  raise notice 'R1 PASSED — personal_table 2, and the other kinds still reported (%)',
    (select string_agg(resource_type || ' ' || reassigned, ', ' order by resource_type) from kt_out);

  -- R2
  select count(*) into n from iam.org_admin_audit a
   where a.organization_id = v_org and a.action = 'table.transfer_owner'
     and a.detail->>'reason' like 'Offboarding reassignment: Jordan Pike''s work%';
  if n <> 2 then
    raise exception 'R2 FAILED — % table.transfer_owner audit row(s), expected 2 (one per personal Table)', n;
  end if;
  if (select count(*) from iam.org_admin_audit a where a.organization_id = v_org and a.action = 'resources.reassign'
        and (a.detail->>'personal_tables_transferred')::int = 2) <> 1 then
    raise exception 'R2 FAILED — the one summary resources.reassign row is missing or does not count the Tables';
  end if;
  raise notice 'R2 PASSED — two transfer audit rows with the offboarding reason, and the summary row';

  -- R3
  select count(*) into n from communication.notification nt
   where nt.organization_id = v_org and nt.event_key = 'custom.table.ownership_transferred';
  if n <> 4 or (select count(distinct recipient_user_id) from communication.notification nt
                 where nt.organization_id = v_org and nt.event_key = 'custom.table.ownership_transferred') <> 2 then
    raise exception 'R3 FAILED — % notice(s), expected 4 (Jordan and Dr. Reyes, for each Table)', n;
  end if;
  raise notice 'R3 PASSED — four notices, two per person';

  -- R4
  select count(*) into n from custom.record t
   where t.organization_id = v_org and t.id in (select v from kt_probe where kt_probe.k in ('checklists', 'supplies'))
     and t.created_by = v_dr and t.visibility < 'internal'::platform.visibility;
  if n <> 2 then
    raise exception 'R4 FAILED — % of the two personal Tables belong to Dr. Reyes and are still personal', n;
  end if;
  select count(*) into n from custom.record t
   where t.organization_id = v_org and t.id in (select v from kt_probe where kt_probe.k in ('checklists', 'supplies'))
     and iam.has_access_for(v_jp, 'record', t.id, 'editor'::public.permission_level);
  if n <> 2 then
    raise exception 'R4 FAILED — Jordan is editor on % of the two Tables he handed over, expected 2', n;
  end if;
  if (select created_by from custom.record where organization_id = v_org and id = (select v from kt_probe where kt_probe.k = 'rota')) <> v_dr
     or (select count(*) from custom.record where organization_id = v_org
           and id in (select v from kt_probe where kt_probe.k in ('checklists_row', 'supplies_row', 'rota_row'))
           and created_by = v_dr) <> 3 then
    raise exception 'R4 FAILED — the ordinary Table or the notes did not move as the bulk call always moved them';
  end if;
  raise notice 'R4 PASSED — both personal Tables are Dr. Reyes''s and still personal, Jordan named editor; the rest moved as before';

  -- R5
  if (select created_by from custom.record where organization_id = v_org and id = (select v from kt_probe where kt_probe.k = 'oldlog')) <> v_jp then
    raise exception 'R5 FAILED — the archived personal Table was handed over silently';
  end if;
  begin
    perform public.org_admin_reassign_member_resources(v_org, v_jp, '87a6e699-3622-4869-8843-d0867456c0dd', array['record']);
    raise exception 'R5 FAILED — an admin reassigned a member''s work to themselves';
  exception when sqlstate '42501' then null;
  end;
  raise notice 'R5 PASSED — the archived personal Table kept its owner; naming yourself is still refused';
end $t$;

\echo 'ALL PASSED — kerneltails_reassign_uses_the_transfer_door_green'
rollback;
