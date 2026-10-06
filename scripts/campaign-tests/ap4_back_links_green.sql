-- AP-4 — custom.entity_back_links READS AS THE CALLER, ACROSS ORGANIZATIONS, AND PAGES CLEANLY.
--
-- THE USE CASE (no fake data): Oak Street Studio, a design studio whose HR lives on the platform
-- (Greta Holloway is an hr_employee there). Its owner (admin@admin.com) keeps an "Onboarding
-- checklist" custom Table whose Employee field is an entity reference to hr_employee; three
-- onboarding steps point at Greta. Marcus Tillman (a persona-factory member of the studio, tagged
-- test_fixture) may open Greta's employee record. test@test.com is NOT a member of the studio.
-- The fixture is the live AP-4 proof data (left in place on purpose); this suite only reads it,
-- plus one Cedar Ridge table it makes inside its own rolled-back transaction.
--
-- 0 · the seats are what the clauses need (Marcus reads Greta; test@test.com does not).
-- 1 · the owner sees the three steps, from ANOTHER organization's context (the active organization
--     never narrows a read) — and labels, table, field and organization are right.
-- 2 · PAGING: limit 1 walks three pages, no repeat, no skip, and the last page says there is no next.
--     (All three edges share one linked_at — written in one statement — so the id tie-break is what
--     is under test.)
-- 3 · A CALLER WITHOUT READ ON A LINKING ROW DOES NOT SEE IT: a row in Cedar Ridge (the owner's
--     other organization; Marcus is not a member) also links to Greta. The owner sees 4 links across
--     both organizations; Marcus, who opens Greta, sees the studio's 3 and never the Cedar Ridge row.
-- 4 · A SECOND ORGANIZATION'S READER SEES NOTHING: Elfrieda Weber (persona factory, her own
--     organization, no tie to the studio) asking about Greta gets the same 02000 sentence as an
--     invented id, is refused in the studio's name, and sees none of the studio's party fields;
--     test@test.com (two studio scopes, not an organization member) is refused Greta's links.
--
-- RED TWIN: ap4_back_links_red.sql removes the per-row access check inside its own rolled-back
-- transaction and requires clause 3 to fail. Ends in ROLLBACK; leaves nothing behind.

\set suite 'ap4_back_links_green.sql'
\set requires 'function:custom.entity_back_links|relation:custom.record|relation:platform.associations'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
begin;

do $$
declare
  c_owner  uuid := '87a6e699-3622-4869-8843-d0867456c0dd';  -- admin@admin.com, studio owner
  c_member uuid := 'ab94c16c-b4a5-49f0-a068-e2a11db34a2c';  -- marcus.tillman@fixtures.aimatrx.com
  c_stranger uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14'; -- test@test.com: two studio scopes, not an org member
  c_outsider uuid := 'c62de98e-46e2-4bc4-bfe3-8b19e7909e32'; -- elfrieda.weber.859b00@fixtures.aimatrx.com
  c_outsider_org uuid := '92f75c84-3df2-4b36-b570-01c4d170b470'; -- Elfrieda's Org
  c_studio uuid := '2643e470-b275-47f3-95f3-ae275ad3ca47';  -- Oak Street Studio
  c_other  uuid := '0a54df90-eab8-4d07-ab29-81a45fb41e04';  -- Cedar Ridge Physical Therapy (owner + test@test.com)
  c_greta  uuid := 'c8b3345a-a0c3-4cd1-a3f2-b439458637ae';  -- hr_employee
  c_table  uuid := '459fc731-3224-442d-b5eb-6134a9ded1fe';  -- Onboarding checklist
  c_field  uuid := '023c491f-0c21-422d-bece-49c4c1a18e95';  -- its Employee field
  c_steps  uuid[] := array['b2f2c660-cb14-42af-9fe7-f666a31b3e44', '2925c123-1127-4305-b24a-af5ec908d849',
                           '8596f220-c7fa-4279-88e2-fb18612af742']::uuid[];
  v_boss   text := current_user;
  v_res    jsonb; v_cursor text; v_seen uuid[] := '{}'; v_pages int := 0; v_n int;
  v_state  text; v_msg text; v_state2 text; v_msg2 text;
  v_home   uuid; v_xtable uuid; v_xrow uuid;
begin
  perform set_config('app.actor_system', 'campaign.ap4_back_links_suite', true);

  -- ══ 0 · THE SEATS ═════════════════════════════════════════════════════════════════════════
  if not iam.has_access_for(c_member, 'hr_employee', c_greta, 'viewer') then
    raise exception '0: Marcus cannot open Greta''s employee record, so clause 3 would test nothing';
  end if;
  if iam.has_access_for(c_stranger, 'hr_employee', c_greta, 'viewer')
     or iam.has_access_for(c_outsider, 'hr_employee', c_greta, 'viewer') then
    raise exception '0: test@test.com or the outsider can open Greta, so clause 4 would test nothing';
  end if;
  if exists (select 1 from iam.memberships m where m.user_id = c_outsider and m.organization_id = c_studio) then
    raise exception '0: the outsider holds a membership in the studio, so clause 4 would test nothing';
  end if;

  -- ══ 1 · THE OWNER, FROM ANOTHER ORGANIZATION'S CONTEXT ═══════════════════════════════════════
  perform set_config('request.jwt.claims', json_build_object('sub', c_owner::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  v_res := custom.entity_back_links(c_other, 'hr_employee', c_greta, 50, null);
  select count(*) into v_n from jsonb_array_elements(v_res -> 'items') i
   where (i -> 'record' ->> 'id')::uuid = any (c_steps)
     and (i ->> 'table_id')::uuid = c_table and (i ->> 'field_id')::uuid = c_field
     and i ->> 'table_label' = 'Onboarding checklist' and i ->> 'field_label' = 'Employee'
     and i ->> 'field_key' = 'employee' and (i ->> 'organization_id')::uuid = c_studio
     and i -> 'record' ->> 'token' = 'record' and nullif(i -> 'record' ->> 'label', '') is not null;
  if v_n <> 3 or v_res -> 'target' ->> 'label' <> 'Greta Holloway' then
    raise exception '1: the owner should see the three onboarding steps on Greta from Cedar Ridge''s context, saw %', v_res;
  end if;

  -- ══ 2 · PAGING: THREE PAGES, NO REPEAT, NO SKIP ═════════════════════════════════════════════
  loop
    v_res := custom.entity_back_links(c_other, 'hr_employee', c_greta, 1, v_cursor);
    v_pages := v_pages + 1;
    exit when jsonb_array_length(v_res -> 'items') = 0;
    if (v_res -> 'items' -> 0 -> 'record' ->> 'id')::uuid = any (v_seen) then
      raise exception '2: page % repeated a row already shown: %', v_pages, v_res;
    end if;
    v_seen := v_seen || (v_res -> 'items' -> 0 -> 'record' ->> 'id')::uuid;
    v_cursor := v_res ->> 'next_cursor';
    exit when v_cursor is null or v_pages > 10;
  end loop;
  if v_pages <> 3 or not (v_seen @> c_steps and c_steps @> v_seen) then
    raise exception '2: limit 1 should walk exactly 3 pages over the 3 steps; walked % pages and saw %', v_pages, v_seen;
  end if;
  begin
    perform custom.entity_back_links(c_other, 'hr_employee', c_greta, 1, 'not-a-cursor');
    raise exception '2b: a forged cursor was accepted';
  exception when invalid_parameter_value then null;
  end;

  -- ══ 3 · A READER WITHOUT READ ON A LINKING ROW DOES NOT SEE IT ════════════════════════════
  -- The owner also runs Cedar Ridge Physical Therapy, where Marcus is NOT a member; she keeps a
  -- "New hire paperwork" Table there whose row points at Greta too (made through the store's own
  -- doors, inside this transaction only). The owner now sees 4 links across two organizations;
  -- Marcus, who opens Greta but may not open the Cedar Ridge row, sees exactly the studio's 3.
  v_home := custom.record_write(c_other, '11111111-0000-4000-8000-000000000005', '{"name":"Front desk"}'::jsonb);
  v_xtable := custom.table_declare(c_other, jsonb_build_object(
    'name', 'New hire paperwork', 'slug', 'new_hire_paperwork_ap4', 'type', 'entity',
    'label_singular', 'Paperwork item', 'label_plural', 'Paperwork items', 'display', 'list',
    'ordered', false, 'weight', 'light', 'retention_days', 365,
    'default_sort', jsonb_build_array(jsonb_build_object('field', 'item', 'direction', 'asc')),
    'row_order', 'manual', 'agent_writable', true, 'fields', jsonb_build_array(jsonb_build_object('name', 'item')),
    'title_field', 'item', 'parent_id', v_home));
  perform custom.field_declare(c_other, v_xtable, '{"label":"Item","key":"item","type":"text"}'::jsonb);
  perform custom.field_declare(c_other, v_xtable, '{"label":"Employee","key":"employee","type":"entity_reference","allowed_types":["hr_employee"]}'::jsonb);
  v_xrow := custom.record_write(c_other, v_xtable, jsonb_build_object('item', 'Confirm direct-deposit form',
              'employee', jsonb_build_object('token', 'hr_employee', 'id', c_greta)));
  v_res := custom.entity_back_links(c_studio, 'hr_employee', c_greta, 50, null);
  if jsonb_array_length(v_res -> 'items') <> 4
     or not exists (select 1 from jsonb_array_elements(v_res -> 'items') i
                     where (i -> 'record' ->> 'id')::uuid = v_xrow and (i ->> 'organization_id')::uuid = c_other) then
    raise exception '3: the owner should see 4 links (3 in the studio, 1 in Cedar Ridge), saw %', v_res -> 'items';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', c_member::text, 'role', 'authenticated')::text, true);
  if not iam.has_access('hr_employee', c_greta, 'viewer') then
    raise exception '3: Marcus cannot open Greta, so this clause tests nothing';
  end if;
  if iam.has_org_access(c_other) then
    raise exception '3: Marcus is a member of Cedar Ridge, so this clause tests nothing';
  end if;
  v_res := custom.entity_back_links(c_studio, 'hr_employee', c_greta, 50, null);
  select count(*) into v_n from jsonb_array_elements(v_res -> 'items') i where (i -> 'record' ->> 'id')::uuid = v_xrow;
  if v_n <> 0 then
    raise exception '3: LEAK — Marcus may not open Cedar Ridge''s paperwork row yet the back-link door listed it: %', v_res -> 'items';
  end if;
  if jsonb_array_length(v_res -> 'items') <> 3 then
    raise exception '3: Marcus should still see the studio''s 3 steps, saw %', v_res -> 'items';
  end if;

  -- ══ 4 · A SECOND ORGANIZATION'S READER SEES NOTHING ═════════════════════════════════════════
  -- Elfrieda Weber (persona factory) runs her own organization and holds no membership of any kind
  -- in the studio.
  perform set_config('request.jwt.claims', json_build_object('sub', c_outsider::text, 'role', 'authenticated')::text, true);
  begin
    perform custom.entity_back_links(c_outsider_org, 'hr_employee', c_greta, 50, null);
    v_state := 'returned';
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  begin
    perform custom.entity_back_links(c_outsider_org, 'hr_employee', gen_random_uuid(), 50, null);
    v_state2 := 'returned';
  exception when others then v_state2 := sqlstate; v_msg2 := sqlerrm;
  end;
  if v_state <> '02000' or v_state is distinct from v_state2 or v_msg is distinct from v_msg2 then
    raise exception '4a: EXISTENCE ORACLE — Greta answered % "%", an invented id answered % "%"', v_state, v_msg, v_state2, v_msg2;
  end if;
  begin
    perform custom.entity_back_links(c_studio, 'hr_employee', c_greta, 50, null);
    raise exception '4b: an outsider asked in the studio''s name and was not refused';
  exception when insufficient_privilege then null;
  end;
  begin
    perform custom.entity_fields(c_studio, 'party');
    raise exception '4c: an outsider read the studio''s party fields';
  exception when insufficient_privilege then null;
  end;
  select count(*) into v_n from custom.entity_fields(c_outsider_org, 'party') f where f.organization_id = c_studio;
  if v_n <> 0 then
    raise exception '4d: an outsider sees % of the studio''s party fields through her own organization', v_n;
  end if;
  select count(*) into v_n
    from jsonb_array_elements(platform.drill_describe(c_outsider_org, '{"kind":"entity","token":"party","api":true}'::jsonb) -> 'api' -> 'columns') c
   where c ->> 'organization_id' = c_studio::text;
  if v_n <> 0 then
    raise exception '4e: an outsider sees % of the studio''s custom columns on party (drill_describe)', v_n;
  end if;
  -- test@test.com belongs to two of the studio's scopes (not the organization): the wall admits her
  -- to the studio's read doors, and the target check still refuses — she cannot open Greta.
  perform set_config('request.jwt.claims', json_build_object('sub', c_stranger::text, 'role', 'authenticated')::text, true);
  begin
    perform custom.entity_back_links(c_studio, 'hr_employee', c_greta, 50, null);
    raise exception '4f: test@test.com (a scope member, not an organization member) was shown Greta''s links';
  exception when sqlstate '02000' then null;
  end;

  perform set_config('role', v_boss, true);
  raise notice 'ap4_back_links_green: all clauses passed — owner sees 3 across organizations, 3 clean pages, a reader without read on a linking row never sees it, a stranger sees nothing';
end $$;

rollback;
