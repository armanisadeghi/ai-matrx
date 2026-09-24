-- LANE SC-1-TAILS — THE WALK FIXTURE for sc1t_show_everything_walk.mjs (dev clone ONLY; the next
-- nightly clone refresh removes it). A fixture by the `_` convention: it asserts nothing.
--
-- THE USE CASE. Cascade Electronics Recovery's Tacoma Yard (SC-1''s walk organization) keeps
-- "Scale tickets"; the store keeps "Material choices" for the yard's Material column — a table the
-- app keeps, which the yard's hub and tables list show only behind "Show everything".
-- Idempotent. Prints one line: SC1T_WALK_IDS={"tacoma":…,"kept":…,"table":…}

\set ON_ERROR_STOP on
\set suite '_sc1t_walk_fixture.sql'
\set expect 'clone'
\set requires 'function:custom.table_home'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
do $f$
declare
  c_tac constant uuid := 'fb6eecaa-c0cf-4ac0-81d2-8ba11d6cea87';   -- Tacoma Yard (SC-1' fixture)
  v_home uuid; v_kept uuid; v_t uuid;
begin
  perform set_config('app.actor_system', 'campaign-test/sc1t-walk', true);
  perform set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
  select h.id into v_home from custom.record h
   where h.organization_id = c_tac and h.table_id = custom.organization_kernel_id() and h.deleted_at is null
   order by h.created_at limit 1;
  select t.id into v_kept from custom.record t
   where t.organization_id = c_tac and t.table_id = custom.table_kernel_id() and t.deleted_at is null
     and t.data ->> 'slug' = 'material_choices';
  if v_kept is null then
    v_kept := custom.table_declare(c_tac, jsonb_build_object(
      'name', 'Material choices', 'slug', 'material_choices', 'type', 'entity',
      'label_singular', 'Material', 'label_plural', 'Materials', 'title_field', 'label',
      'display', 'list', 'weight', 'light', 'ordered', true, 'row_order', 'sorted',
      'agent_writable', true, 'retention_days', 3650, 'kept_by_the_app', true, 'kept_for', 'choices',
      'default_sort', jsonb_build_array(jsonb_build_object('field', 'label', 'direction', 'asc')),
      'parent_id', v_home::text,
      'fields', jsonb_build_array(jsonb_build_object('name', 'label'))));
  end if;
  select t.id into v_t from custom.record t
   where t.table_id = custom.table_kernel_id() and t.deleted_at is null and t.data ->> 'slug' = 'scale_tickets'
     and t.organization_id = c_tac limit 1;
  raise notice 'SC1T_WALK_IDS={"tacoma":"%","kept":"%","table":"%"}', c_tac, v_kept, v_t;
end
$f$;
commit;
