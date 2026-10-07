-- lane: PAGE-BUNDLE
--
-- PAGE-BUNDLE (2026-10-07). A table page asked the store for what it needs to draw its shape in
-- five waves, one after another (measured on production, /data/<table>: table_kernel_id and
-- applicable_fields, then the table row, then views / my_levels / io_imports, then
-- table_decorations / grid_layout / row_actions / reverse_columns) - about fifteen calls, three of
-- them waiting on the one before. custom.table_page_bundle answers all of them in ONE call.
--
-- IT DECIDES NOTHING. Each part is the answer of the existing door, called here with the arguments
-- the screen sends it, as the caller (SECURITY INVOKER: the inner doors see the same person, ask the
-- same access ladder, mask the same fields). Every part is {door, args, data} where `data` is exactly
-- what PostgREST returns for that door (a row set is an array of row objects, a scalar is a scalar).
-- A door that refuses inside the bundle is answered {door, args, error: <sqlstate>} and the client
-- asks that one door itself, getting its own refusal in its own words - the bundle never turns a
-- refusal into an empty answer. The client uses the parts once, and only when its own call names the
-- same door with the same arguments; anything else goes to the door as before.
--
-- The rows themselves are NOT in the bundle: the page's rows depend on the sort and filter the screen
-- derives from these answers, and the rows must never wait on the parts that follow them.
-- A new function only: no table, no column, no policy. Any hour.

set local statement_timeout = '60s';

CREATE OR REPLACE FUNCTION custom.table_page_bundle(p_organization_id uuid, p_table_id uuid, p_view_id uuid DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE
  v_parts  jsonb := '[]'::jsonb;
  v_kernel uuid;
  v_org    jsonb := to_jsonb(p_organization_id);
  v_tbl    jsonb := to_jsonb(p_table_id);
  v_args   jsonb;
  v_data   jsonb;
BEGIN
  -- table_kernel_id takes no arguments and is the same for everyone: asked first, it also names the
  -- Table kernel the table's own row is read from.
  BEGIN
    v_kernel := custom.table_kernel_id();
    v_parts := v_parts || jsonb_build_array(jsonb_build_object('door', 'table_kernel_id', 'args', '{}'::jsonb, 'data', to_jsonb(v_kernel)));
  EXCEPTION WHEN OTHERS THEN
    v_parts := v_parts || jsonb_build_array(jsonb_build_object('door', 'table_kernel_id', 'args', '{}'::jsonb, 'error', SQLSTATE));
  END;

  -- the table's own row
  IF v_kernel IS NOT NULL THEN
    v_args := jsonb_build_object('p_organization_id', v_org, 'p_table_id', to_jsonb(v_kernel), 'p_record_ids', jsonb_build_array(v_tbl));
    BEGIN
      SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) INTO v_data FROM custom.read_records_by_ids(p_organization_id, v_kernel, ARRAY[p_table_id]) t;
      v_parts := v_parts || jsonb_build_array(jsonb_build_object('door', 'read_records_by_ids', 'args', v_args, 'data', v_data));
    EXCEPTION WHEN OTHERS THEN
      v_parts := v_parts || jsonb_build_array(jsonb_build_object('door', 'read_records_by_ids', 'args', v_args, 'error', SQLSTATE));
    END;
  END IF;

  v_args := jsonb_build_object('p_organization_id', v_org, 'p_table_id', v_tbl);

  BEGIN
    SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) INTO v_data FROM custom.applicable_fields(p_organization_id, p_table_id) t;
    v_parts := v_parts || jsonb_build_array(jsonb_build_object('door', 'applicable_fields', 'args', v_args, 'data', v_data));
  EXCEPTION WHEN OTHERS THEN
    v_parts := v_parts || jsonb_build_array(jsonb_build_object('door', 'applicable_fields', 'args', v_args, 'error', SQLSTATE));
  END;

  BEGIN
    SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) INTO v_data FROM custom.views(p_organization_id, p_table_id) t;
    v_parts := v_parts || jsonb_build_array(jsonb_build_object('door', 'views', 'args', v_args, 'data', v_data));
  EXCEPTION WHEN OTHERS THEN
    v_parts := v_parts || jsonb_build_array(jsonb_build_object('door', 'views', 'args', v_args, 'error', SQLSTATE));
  END;

  BEGIN
    v_parts := v_parts || jsonb_build_array(jsonb_build_object('door', 'view_look_read', 'args', v_args, 'data', custom.view_look_read(p_organization_id, p_table_id)));
  EXCEPTION WHEN OTHERS THEN
    v_parts := v_parts || jsonb_build_array(jsonb_build_object('door', 'view_look_read', 'args', v_args, 'error', SQLSTATE));
  END;

  BEGIN
    v_parts := v_parts || jsonb_build_array(jsonb_build_object('door', 'record_change_actions', 'args', v_args, 'data', custom.record_change_actions(p_organization_id, p_table_id)));
  EXCEPTION WHEN OTHERS THEN
    v_parts := v_parts || jsonb_build_array(jsonb_build_object('door', 'record_change_actions', 'args', v_args, 'error', SQLSTATE));
  END;

  BEGIN
    v_parts := v_parts || jsonb_build_array(jsonb_build_object('door', 'table_decorations', 'args', v_args, 'data', custom.table_decorations(p_organization_id, p_table_id)));
  EXCEPTION WHEN OTHERS THEN
    v_parts := v_parts || jsonb_build_array(jsonb_build_object('door', 'table_decorations', 'args', v_args, 'error', SQLSTATE));
  END;

  BEGIN
    v_parts := v_parts || jsonb_build_array(jsonb_build_object('door', 'row_actions', 'args', v_args, 'data', custom.row_actions(p_organization_id, p_table_id)));
  EXCEPTION WHEN OTHERS THEN
    v_parts := v_parts || jsonb_build_array(jsonb_build_object('door', 'row_actions', 'args', v_args, 'error', SQLSTATE));
  END;

  BEGIN
    SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) INTO v_data FROM custom.reverse_columns(p_organization_id, p_table_id) t;
    v_parts := v_parts || jsonb_build_array(jsonb_build_object('door', 'reverse_columns', 'args', v_args, 'data', v_data));
  EXCEPTION WHEN OTHERS THEN
    v_parts := v_parts || jsonb_build_array(jsonb_build_object('door', 'reverse_columns', 'args', v_args, 'error', SQLSTATE));
  END;

  -- the grid's layout, for the view the screen opens (none named = the table's own)
  BEGIN
    v_parts := v_parts || jsonb_build_array(jsonb_build_object('door', 'grid_layout',
      'args', jsonb_build_object('p_organization_id', v_org, 'p_table_id', v_tbl, 'p_view_id', to_jsonb(p_view_id)),
      'data', custom.grid_layout(p_organization_id, p_table_id, p_view_id)));
  EXCEPTION WHEN OTHERS THEN
    v_parts := v_parts || jsonb_build_array(jsonb_build_object('door', 'grid_layout',
      'args', jsonb_build_object('p_organization_id', v_org, 'p_table_id', v_tbl, 'p_view_id', to_jsonb(p_view_id)), 'error', SQLSTATE));
  END;

  BEGIN
    SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) INTO v_data FROM custom.my_levels(p_organization_id, jsonb_build_array(v_tbl), 'record') t;
    v_parts := v_parts || jsonb_build_array(jsonb_build_object('door', 'my_levels',
      'args', jsonb_build_object('p_organization_id', v_org, 'p_ids', jsonb_build_array(v_tbl), 'p_type', 'record'), 'data', v_data));
  EXCEPTION WHEN OTHERS THEN
    v_parts := v_parts || jsonb_build_array(jsonb_build_object('door', 'my_levels',
      'args', jsonb_build_object('p_organization_id', v_org, 'p_ids', jsonb_build_array(v_tbl), 'p_type', 'record'), 'error', SQLSTATE));
  END;

  BEGIN
    v_parts := v_parts || jsonb_build_array(jsonb_build_object('door', 'io_imports',
      'args', jsonb_build_object('p_organization_id', v_org, 'p_table_id', v_tbl, 'p_limit', 5),
      'data', custom.io_imports(p_organization_id, p_table_id, 5)));
  EXCEPTION WHEN OTHERS THEN
    v_parts := v_parts || jsonb_build_array(jsonb_build_object('door', 'io_imports',
      'args', jsonb_build_object('p_organization_id', v_org, 'p_table_id', v_tbl, 'p_limit', 5), 'error', SQLSTATE));
  END;

  RETURN jsonb_build_object('v', 1, 'table_id', p_table_id, 'parts', v_parts);
END;
$function$;

COMMENT ON FUNCTION custom.table_page_bundle(uuid, uuid, uuid) IS
  'PAGE-BUNDLE: the shape of one table page (its row, fields, views, look, decorations, row actions, reverse columns, layout, the caller''s level, recent imports) in one call. Each part is the existing door''s own answer, asked as the caller; a refusing part says so and the client asks that door itself.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason,
   anonymous_callers, signed_in_callers)
values
  ('custom', 'table_page_bundle', 'p_organization_id uuid, p_table_id uuid, p_view_id uuid',
   array['uuid'::regtype::oid, 'uuid'::regtype::oid, 'uuid'::regtype::oid],
   'migrations/campaign/pagebundle_a_a_table_opens_in_one_call.sql (lane PAGE-BUNDLE)',
   'PAGE-BUNDLE: SECURITY INVOKER. It calls twelve existing client doors (table_kernel_id, read_records_by_ids, applicable_fields, views, view_look_read, record_change_actions, table_decorations, row_actions, reverse_columns, grid_layout, my_levels, io_imports) with the caller''s own privileges and returns each answer unchanged; every one of those doors already decides who is standing there, and a refusal inside is returned as that part''s error, never as an empty answer. It reads and writes nothing of its own.',
   false, true)
on conflict (schema_name, function_name, identity_argtypes) do update
  set signed_in_callers = excluded.signed_in_callers,
      anonymous_callers = excluded.anonymous_callers,
      non_client_lane   = null,
      reason            = excluded.reason,
      declared_by       = excluded.declared_by;

grant execute on function custom.table_page_bundle(uuid, uuid, uuid) to authenticated;
