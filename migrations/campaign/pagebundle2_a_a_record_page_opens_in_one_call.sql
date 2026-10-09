-- lane: PAGE-BUNDLE-2
--
-- PAGE-BUNDLE-2 (2026-10-07). A record page (/data/<table>/r/<record>) asked the store for the record,
-- its row controls, the caller's level on it, its history head, its comment thread, its computed
-- provenance and its header in separate calls after the table's own bundle (measured on production:
-- read_record twice, record_headers twice, my_levels, record_history, comment_thread,
-- computed_provenance, record_row_controls). custom.record_page_bundle answers them in ONE call.
--
-- IT DECIDES NOTHING (the same contract as custom.table_page_bundle). Each part is the existing door's
-- answer, called with the arguments the screen sends it, as the caller (SECURITY INVOKER: every inner
-- door is the one the browser would have reached and decides who is standing there itself). Every part
-- is {door, args, data}, `data` exactly what PostgREST returns for that door. A door that refuses
-- inside is answered {door, args, error: <sqlstate>} and the client asks that door itself, getting its
-- own refusal in its own words. The client uses a part once, only when its own call names the same
-- door with the same arguments. A new function only: no table, no column, no policy. Any hour.

set local statement_timeout = '60s';

CREATE OR REPLACE FUNCTION custom.record_page_bundle(p_organization_id uuid, p_record_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE
  v_parts jsonb := '[]'::jsonb;
  v_org   jsonb := to_jsonb(p_organization_id);
  v_rec   jsonb := to_jsonb(p_record_id);
  v_args  jsonb := jsonb_build_object('p_organization_id', to_jsonb(p_organization_id), 'p_record_id', to_jsonb(p_record_id));
  v_a     jsonb;
  v_data  jsonb;
BEGIN
  BEGIN
    v_parts := v_parts || jsonb_build_array(jsonb_build_object('door', 'read_record', 'args', v_args, 'data', custom.read_record(p_organization_id, p_record_id)));
  EXCEPTION WHEN OTHERS THEN
    v_parts := v_parts || jsonb_build_array(jsonb_build_object('door', 'read_record', 'args', v_args, 'error', SQLSTATE));
  END;

  BEGIN
    v_parts := v_parts || jsonb_build_array(jsonb_build_object('door', 'record_row_controls', 'args', v_args, 'data', custom.record_row_controls(p_organization_id, p_record_id)));
  EXCEPTION WHEN OTHERS THEN
    v_parts := v_parts || jsonb_build_array(jsonb_build_object('door', 'record_row_controls', 'args', v_args, 'error', SQLSTATE));
  END;

  v_a := jsonb_build_object('p_organization_id', v_org, 'p_ids', jsonb_build_array(v_rec), 'p_type', 'record');
  BEGIN
    SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) INTO v_data FROM custom.my_levels(p_organization_id, jsonb_build_array(v_rec), 'record') t;
    v_parts := v_parts || jsonb_build_array(jsonb_build_object('door', 'my_levels', 'args', v_a, 'data', v_data));
  EXCEPTION WHEN OTHERS THEN
    v_parts := v_parts || jsonb_build_array(jsonb_build_object('door', 'my_levels', 'args', v_a, 'error', SQLSTATE));
  END;

  v_a := v_args || jsonb_build_object('p_limit', 200, 'p_offset', 0);
  BEGIN
    SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) INTO v_data FROM custom.record_history(p_organization_id, p_record_id, 200, 0) t;
    v_parts := v_parts || jsonb_build_array(jsonb_build_object('door', 'record_history', 'args', v_a, 'data', v_data));
  EXCEPTION WHEN OTHERS THEN
    v_parts := v_parts || jsonb_build_array(jsonb_build_object('door', 'record_history', 'args', v_a, 'error', SQLSTATE));
  END;

  v_a := v_args || jsonb_build_object('p_include_resolved', false);
  BEGIN
    v_parts := v_parts || jsonb_build_array(jsonb_build_object('door', 'comment_thread', 'args', v_a, 'data', custom.comment_thread(p_organization_id, p_record_id, false)));
  EXCEPTION WHEN OTHERS THEN
    v_parts := v_parts || jsonb_build_array(jsonb_build_object('door', 'comment_thread', 'args', v_a, 'error', SQLSTATE));
  END;

  BEGIN
    SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) INTO v_data FROM custom.computed_provenance(p_organization_id, p_record_id) t;
    v_parts := v_parts || jsonb_build_array(jsonb_build_object('door', 'computed_provenance', 'args', v_args, 'data', v_data));
  EXCEPTION WHEN OTHERS THEN
    v_parts := v_parts || jsonb_build_array(jsonb_build_object('door', 'computed_provenance', 'args', v_args, 'error', SQLSTATE));
  END;

  v_a := jsonb_build_object('p_organization_id', v_org, 'p_ids', jsonb_build_array(v_rec));
  BEGIN
    SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) INTO v_data FROM custom.record_headers(p_organization_id, ARRAY[p_record_id]) t;
    v_parts := v_parts || jsonb_build_array(jsonb_build_object('door', 'record_headers', 'args', v_a, 'data', v_data));
  EXCEPTION WHEN OTHERS THEN
    v_parts := v_parts || jsonb_build_array(jsonb_build_object('door', 'record_headers', 'args', v_a, 'error', SQLSTATE));
  END;

  RETURN jsonb_build_object('v', 1, 'record_id', p_record_id, 'parts', v_parts);
END;
$function$;

COMMENT ON FUNCTION custom.record_page_bundle(uuid, uuid) IS
  'PAGE-BUNDLE-2: one record page (the record, its row controls, the caller''s level, history head, comment thread, computed provenance, header) in one call. Each part is the existing door''s own answer, asked as the caller; a refusing part says so and the client asks that door itself.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason,
   anonymous_callers, signed_in_callers)
values
  ('custom', 'record_page_bundle', 'p_organization_id uuid, p_record_id uuid',
   array['uuid'::regtype::oid, 'uuid'::regtype::oid],
   'migrations/campaign/pagebundle2_a_a_record_page_opens_in_one_call.sql (lane PAGE-BUNDLE-2)',
   'PAGE-BUNDLE-2: SECURITY INVOKER. It calls seven existing client doors (read_record, record_row_controls, my_levels, record_history, comment_thread, computed_provenance, record_headers) with the caller''s own privileges and returns each answer unchanged; every one of those doors already decides who is standing there, and a refusal inside is returned as that part''s error, never as an empty answer. It reads and writes nothing of its own.',
   false, true)
on conflict (schema_name, function_name, identity_argtypes) do update
  set signed_in_callers = excluded.signed_in_callers,
      reason = excluded.reason,
      declared_by = excluded.declared_by;

GRANT EXECUTE ON FUNCTION custom.record_page_bundle(uuid, uuid) TO authenticated;
