-- AP-4 — RED TWIN of ap4_back_links_green.sql: PROVES CLAUSE 3 CAN FAIL.
--
-- Inside its own rolled-back transaction it replaces custom.entity_back_links with the same body
-- minus the per-row access arm (the reader's right to open each linking custom row and to read the
-- linking Field), then builds clause 3's fixture — a Cedar Ridge Physical Therapy row (Marcus is not
-- a member there) that links to Greta Holloway — and REQUIRES Marcus to be shown that row. If the
-- weakened door does not leak, the green suite's clause 3 is not testing what it claims, and this
-- suite fails. Ends in ROLLBACK; the live body is untouched.

\set suite 'ap4_back_links_red.sql'
\set requires 'function:custom.entity_back_links|relation:custom.record|relation:platform.associations'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
begin;

do $$
declare
  c_owner  uuid := '87a6e699-3622-4869-8843-d0867456c0dd';  -- admin@admin.com
  c_member uuid := 'ab94c16c-b4a5-49f0-a068-e2a11db34a2c';  -- marcus.tillman@fixtures.aimatrx.com
  c_studio uuid := '2643e470-b275-47f3-95f3-ae275ad3ca47';  -- Oak Street Studio
  c_other  uuid := '0a54df90-eab8-4d07-ab29-81a45fb41e04';  -- Cedar Ridge Physical Therapy
  c_greta  uuid := 'c8b3345a-a0c3-4cd1-a3f2-b439458637ae';  -- hr_employee
  v_boss   text := current_user;
  v_def    text;
  v_weak   text;
  v_res    jsonb; v_n int;
  v_home   uuid; v_xtable uuid; v_xrow uuid;
begin
  perform set_config('app.actor_system', 'campaign.ap4_back_links_red', true);

  -- the live body, with its per-row access arm made always-true
  v_def  := pg_get_functiondef('custom.entity_back_links(uuid,text,uuid,integer,text)'::regprocedure);
  v_weak := replace(v_def, 'and (v_owner', 'and (true or v_owner');
  if v_weak = v_def then
    raise exception 'red: the live body no longer carries the access arm this twin removes — update the twin';
  end if;
  execute v_weak;

  perform set_config('request.jwt.claims', json_build_object('sub', c_owner::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
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

  perform set_config('request.jwt.claims', json_build_object('sub', c_member::text, 'role', 'authenticated')::text, true);
  v_res := custom.entity_back_links(c_studio, 'hr_employee', c_greta, 50, null);
  select count(*) into v_n from jsonb_array_elements(v_res -> 'items') i where (i -> 'record' ->> 'id')::uuid = v_xrow;
  if v_n <> 1 then
    raise exception 'red: with the access arm removed Marcus still does not see the Cedar Ridge row (% items) — the green clause 3 cannot fail', jsonb_array_length(v_res -> 'items');
  end if;

  perform set_config('role', v_boss, true);
  raise notice 'ap4_back_links_red: the weakened door leaked the Cedar Ridge row to Marcus, as it must — green clause 3 is a real check';
end $$;

rollback;
