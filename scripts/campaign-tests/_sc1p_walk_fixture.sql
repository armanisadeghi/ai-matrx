-- LANE SC-1' — THE WALK FIXTURE for sc1p_where_it_lives_walk.mjs (dev clone ONLY; committed there,
-- and the next nightly clone refresh removes it). A fixture by the `_` convention: it asserts nothing.
--
-- THE USE CASE. Cascade Electronics Recovery's Tacoma Yard keeps "Scale tickets" — every inbound
-- load weighed at the scale house. The operations lead (admin@admin.com, owner of both yards)
-- moves it to the Portland Depot, which is taking over weighing. The yard's outside auditor
-- (test@test.com — a member of neither yard) was shared the table by name to check the weights.
-- Every hauler, ticket and weight is synthesized.
--
-- Prints one line: SC1P_WALK_IDS={"table":…,"tacoma":…,"portland":…}

\set ON_ERROR_STOP on
\set suite '_sc1p_walk_fixture.sql'
\set expect 'clone'
\set requires 'function:custom.table_home'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
do $f$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_auditor constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_tac     constant uuid := 'fb6eecaa-c0cf-4ac0-81d2-8ba11d6cea87';   -- Tacoma Yard
  c_pdx     constant uuid := '4352d061-ec13-4761-ae32-9c9bd52e7de3';   -- Portland Depot
  v_t uuid;
begin
  perform set_config('app.actor_system', 'campaign-test/sc1p-walk', true);
  perform set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
  select t.id into v_t from custom.record t
   where t.table_id = custom.table_kernel_id() and t.deleted_at is null and t.data ->> 'slug' = 'scale_tickets'
     and t.organization_id in (c_tac, c_pdx) limit 1;
  if v_t is null then
    v_t := custom.table_declare(c_tac, jsonb_build_object(
      'name', 'Scale tickets', 'slug', 'scale_tickets', 'type', 'entity',
      'label_singular', 'Scale ticket', 'label_plural', 'Scale tickets', 'title_field', 'ticket',
      'display', 'list', 'weight', 'light', 'ordered', true, 'row_order', 'sorted',
      'agent_writable', true, 'retention_days', 3650,
      'default_sort', jsonb_build_array(jsonb_build_object('field', 'ticket', 'direction', 'asc')),
      'parent_id', custom.organization_home_id(c_tac)::text,
      'fields', jsonb_build_array(jsonb_build_object('name', 'ticket'))));
    perform custom.field_declare(c_tac, v_t, jsonb_build_object('key', 'ticket', 'label', 'Ticket', 'type', 'text', 'sort', 10, 'required', true));
    perform custom.field_declare(c_tac, v_t, jsonb_build_object('key', 'hauler', 'label', 'Hauler', 'type', 'text', 'sort', 20));
    perform custom.field_declare(c_tac, v_t, jsonb_build_object('key', 'net_lbs', 'label', 'Net weight (lb)', 'type', 'number', 'sort', 30));
    perform custom.record_write(c_tac, v_t, jsonb_build_object('ticket', 'T-40812', 'hauler', 'Puget Sound Salvage', 'net_lbs', 18420));
    perform custom.record_write(c_tac, v_t, jsonb_build_object('ticket', 'T-40813', 'hauler', 'Rainier Scrap & Metal', 'net_lbs', 7260));
    perform custom.record_write(c_tac, v_t, jsonb_build_object('ticket', 'T-40814', 'hauler', 'Tideflats E-Waste', 'net_lbs', 2310));
    insert into iam.permissions (resource_type, resource_id, granted_to_user_id, permission_level, created_by, status)
    values ('record', v_t, c_auditor, 'viewer', c_admin, 'active');
  end if;
  raise notice 'SC1P_WALK_IDS={"table":"%","tacoma":"%","portland":"%"}', v_t, c_tac, c_pdx;
end
$f$;
commit;
