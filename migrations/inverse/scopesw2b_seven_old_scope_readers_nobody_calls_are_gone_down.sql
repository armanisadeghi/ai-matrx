-- chair-step: INVERSE of migrations/campaign/scopesw2b_seven_old_scope_readers_nobody_calls_are_gone.sql (lane FINISH-THE-SWITCH, FTS-1b): recreates the seven functions, owners and EXECUTE grants as production held them on 2026-10-05.

CREATE OR REPLACE FUNCTION public._edu_class(p_class uuid)
 RETURNS context.scopes
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_scope context.scopes;
begin
  select s.* into v_scope
  from context.scopes s
  join context.scope_types st on st.id = s.scope_type_id
  where s.id = p_class and st.slug = 'class';
  if v_scope.id is null then
    perform platform.refuse_not_found(format('class %s not found', p_class));
  end if;
  return v_scope;
end;
$function$
;


CREATE OR REPLACE FUNCTION public.accept_context_item_suggestion(p_suggestion_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid       UUID := auth.uid();
  v_sugg      RECORD;
  v_type_org  UUID;
  v_item_id   UUID;
  v_created   BOOLEAN := false;
  v_answer    JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code','unauthorized','message','no acting user'));
  END IF;

  SELECT * INTO v_sugg
    FROM rag.context_item_suggestions
   WHERE id = p_suggestion_id AND user_id = v_uid
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code','not_found','message','suggestion not found'));
  END IF;
  IF v_sugg.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code','invalid_argument',
        'message','suggestion is not pending (status=' || v_sugg.status || ')'));
  END IF;

  SELECT organization_id INTO v_type_org
    FROM context.scope_types WHERE id = v_sugg.scope_type_id;
  IF v_type_org IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code','not_found','message','scope type not found'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM iam.organization_member om
                  WHERE om.organization_id = v_type_org AND om.user_id = v_uid
                    AND om.role IN ('owner','admin')) THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code','forbidden_org',
        'message','only an org owner/admin may add context items'));
  END IF;

  SELECT id INTO v_item_id FROM context.context_items
   WHERE scope_type_id = v_sugg.scope_type_id AND key = v_sugg.suggested_key
   LIMIT 1;
  IF v_item_id IS NULL THEN
    v_answer := custom.context_item_write(NULL, v_sugg.scope_type_id, jsonb_build_object(
      'key', v_sugg.suggested_key,
      'display_name', v_sugg.display_name,
      'description', COALESCE(v_sugg.rationale, ''),
      'sort_order', 0));
    v_item_id := (v_answer -> 'row' ->> 'id')::uuid;
    PERFORM custom.context_item_write(v_item_id, v_sugg.scope_type_id, jsonb_build_object('status', 'stub'));
    v_created := true;
  END IF;

  UPDATE rag.context_item_suggestions
     SET status = 'accepted', decided_at = now(), decided_by = v_uid
   WHERE id = v_sugg.id;

  RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object(
    'context_item_id', v_item_id,
    'created', v_created));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.accept_scope_suggestion(p_suggestion_id uuid, p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid           UUID := auth.uid();
  v_sugg          RECORD;
  v_org           UUID;
  v_type_id       UUID;
  v_scope_id      UUID;
  v_seeded        INT  := 0;
  v_key           TEXT;
  v_val           TEXT;
  v_item_id       UUID;
  v_answer        JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code','unauthorized','message','no acting user'));
  END IF;

  SELECT * INTO v_sugg
    FROM rag.scope_suggestions
   WHERE id = p_suggestion_id AND user_id = v_uid
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code','not_found','message','suggestion not found'));
  END IF;
  IF v_sugg.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code','invalid_argument',
        'message','suggestion is not pending (status=' || v_sugg.status || ')'));
  END IF;

  v_org := COALESCE(p_organization_id, v_sugg.organization_id);
  IF v_org IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code','invalid_argument',
        'message','no organization: pass p_organization_id'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM iam.organization_member om
                  WHERE om.organization_id = v_org AND om.user_id = v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code','forbidden_org',
        'message','caller is not a member of this organization'));
  END IF;

  IF v_sugg.scope_type_id IS NOT NULL THEN
    SELECT id INTO v_type_id FROM context.scope_types
     WHERE id = v_sugg.scope_type_id AND organization_id = v_org;
  END IF;
  IF v_type_id IS NULL THEN
    SELECT id INTO v_type_id FROM context.scope_types
     WHERE organization_id = v_org
       AND (lower(label_singular) = lower(v_sugg.scope_type_label)
            OR lower(label_plural) = lower(v_sugg.scope_type_label))
     ORDER BY created_at LIMIT 1;
  END IF;
  IF v_type_id IS NULL THEN
    v_answer := custom.context_type_write(v_org, NULL, jsonb_build_object(
      'label_singular', v_sugg.scope_type_label,
      'label_plural', v_sugg.scope_type_label || 's'));
    v_type_id := (v_answer -> 'row' ->> 'id')::uuid;
  END IF;

  v_answer := custom.context_scope_write(v_org, NULL, v_type_id,
    jsonb_build_object('name', v_sugg.suggested_name));
  v_scope_id := (v_answer -> 'row' ->> 'id')::uuid;

  PERFORM context._assert_scope_readable(v_scope_id, 'editor');

  FOR v_key, v_val IN
    SELECT key, value FROM jsonb_each_text(COALESCE(v_sugg.suggested_slot_values, '{}'::jsonb))
  LOOP
    SELECT id INTO v_item_id FROM context.context_items
     WHERE scope_type_id = v_type_id AND key = v_key
       AND is_active IS DISTINCT FROM false
     LIMIT 1;
    IF v_item_id IS NOT NULL AND v_val IS NOT NULL THEN
      v_answer := custom.context_value_write(jsonb_build_object(
        'context_item_id', v_item_id,
        'scope_id', v_scope_id,
        'value_text', v_val,
        'source_type', 'ai_enriched',
        'change_summary', 'Seeded from scope suggestion ' || v_sugg.id));
      IF coalesce((v_answer ->> 'ok')::boolean, false) IS NOT TRUE THEN
        RAISE EXCEPTION 'The suggestion''s value for "%" could not be written: %', v_key,
          coalesce(v_answer #>> '{error,message}', 'the value door refused it')
          USING ERRCODE = CASE v_answer #>> '{error,code}' WHEN 'forbidden' THEN '42501'
                                                          WHEN 'invalid_argument' THEN '22023'
                                                          ELSE 'P0001' END;
      END IF;
      v_seeded := v_seeded + 1;
    END IF;
  END LOOP;

  UPDATE rag.scope_suggestions
     SET status = 'accepted', decided_at = now(), decided_by = v_uid
   WHERE id = v_sugg.id;

  RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object(
    'scope_id', v_scope_id,
    'scope_type_id', v_type_id,
    'seeded_value_count', v_seeded));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_entity_scopes(p_entity_type text, p_entity_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
declare v_result jsonb;
begin
    select jsonb_agg(
        jsonb_build_object(
            'scope_id', s.id, 'scope_name', s.name, 'scope_description', s.description,
            'parent_scope_id', s.parent_scope_id, 'type_id', st.id,
            'type_label', st.label_singular, 'type_label_plural', st.label_plural,
            'type_icon', st.icon, 'type_color', st.color, 'type_sort_order', st.sort_order
        )
        order by st.sort_order, s.sort_order, s.name
    ) into v_result
    from platform.associations_live a
    join context.scopes s on a.target_id = s.id
    join context.scope_types st on s.scope_type_id = st.id
    where a.target_type = 'scope' and a.source_type = p_entity_type and a.source_id = p_entity_id
      and s.deleted_at is null and st.deleted_at is null;
    return coalesce(v_result, '[]'::jsonb);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_org_structure(p_org_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_types jsonb; v_scopes jsonb;
begin
  if (auth.role() = 'service_role' or iam.has_org_access(p_org_id)) is not true then
    raise exception 'not authorized for organization %', p_org_id using errcode = '42501';
  end if;
  select jsonb_agg(
    to_jsonb(st.*) || jsonb_build_object('parent_type_label', pt.label_singular)
    order by st.sort_order
  ) into v_types
  from context.scope_types st
  left join context.scope_types pt on st.parent_type_id = pt.id
  where st.organization_id = p_org_id and st.deleted_at is null;

  select jsonb_agg(
    jsonb_build_object(
      'id', s.id,
      'name', s.name,
      'description', s.description,
      'scope_type_id', s.scope_type_id,
      'parent_scope_id', s.parent_scope_id,
      'type_label', st.label_singular,
      'type_icon', st.icon,
      'type_color', st.color
    ) order by st.sort_order, s.name
  ) into v_scopes
  from context.scopes s
  join context.scope_types st on s.scope_type_id = st.id
  where s.organization_id = p_org_id
    and s.deleted_at is null and st.deleted_at is null;

  return jsonb_build_object(
    'types', coalesce(v_types, '[]'::jsonb),
    'scopes', coalesce(v_scopes, '[]'::jsonb)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_scopes(p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid; v_result jsonb;
begin
    v_uid := coalesce(p_user_id, auth.uid());
    if v_uid is null then return jsonb_build_object('organizations', '[]'::jsonb); end if;
    with user_orgs as (
        select o.id, o.name, o.slug, om.role::text as role
        from iam.organizations o
        join iam.organization_member om on om.organization_id = o.id and om.user_id = v_uid
    ),
    type_scopes as (
        select s.scope_type_id,
            jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'sort_order', s.sort_order, 'parent_scope_id', s.parent_scope_id)
                order by s.sort_order, s.name) as scopes
        from context.scopes s
        where s.organization_id in (select id from user_orgs) and s.deleted_at is null
        group by s.scope_type_id
    ),
    org_types as (
        select st.organization_id,
            jsonb_agg(jsonb_build_object(
                'id', st.id, 'label_singular', st.label_singular, 'label_plural', st.label_plural,
                'icon', st.icon, 'color', st.color, 'sort_order', st.sort_order, 'parent_type_id', st.parent_type_id,
                'max_assignments_per_entity', st.max_assignments_per_entity,
                'scopes', coalesce(ts.scopes, '[]'::jsonb)
            ) order by st.sort_order, st.label_plural) as scope_types
        from context.scope_types st
        left join type_scopes ts on ts.scope_type_id = st.id
        where st.organization_id in (select id from user_orgs) and st.deleted_at is null
        group by st.organization_id
    )
    select jsonb_build_object('organizations',
        coalesce(jsonb_agg(jsonb_build_object(
            'id', uo.id, 'name', uo.name, 'slug', uo.slug, 'role', uo.role,
            'scope_types', coalesce(ot.scope_types, '[]'::jsonb)
        ) order by uo.name asc), '[]'::jsonb)
    ) into v_result
    from user_orgs uo left join org_types ot on ot.organization_id = uo.id;
    return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_value_history(p_scope_id uuid, p_context_item_id uuid, p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_result jsonb;
  v_org_id uuid;
begin
  select s.organization_id
  into v_org_id
  from context.scopes s
  where s.id = p_scope_id
    and s.deleted_at is null;

  if v_org_id is null then
    return '[]'::jsonb;
  end if;

  perform context._assert_scope_readable(p_scope_id, 'viewer');

  select jsonb_agg(
    jsonb_build_object(
      'id', civ.id,
      'version', civ.version,
      'is_current', civ.is_current,
      'value_text', civ.value_text,
      'value_number', civ.value_number,
      'value_boolean', civ.value_boolean,
      'value_json', civ.value_json,
      'change_summary', civ.change_summary,
      'authored_by', civ.authored_by,
      'created_at', civ.created_at
    )
    order by civ.version desc
  )
  into v_result
  from (
    select *
    from context.context_item_values
    where scope_id = p_scope_id
      and context_item_id = p_context_item_id
    order by version desc
    limit greatest(1, least(coalesce(p_limit, 20), 100))
  ) civ;

  return coalesce(v_result, '[]'::jsonb);
end;
$function$
;

-- THEIR DOOR ROWS, exactly as production held them (a door follows its function; declared before the grants).
insert into platform.client_callable_door select * from jsonb_populate_record(null::platform.client_callable_door, '{"id": "5acc3b4b-5c3f-4439-af27-69d0d10183ff", "reason": "Declared, not changed, by lane ERRORS-HONEST: provision_shape_guard requires every SECURITY DEFINER body that is replaced to say in data who may call it. This body changed only in how it raises a not-found (platform.refuse_not_found). It is not a client door, and no client role holds EXECUTE on it.", "probe_args": null, "declared_at": "2026-09-25T00:43:04.571062+00:00", "declared_by": "migrations/campaign/errorshonest_s2_the_public_doors_say_not_found.sql (lane ERRORS-HONEST)", "schema_name": "public", "refusal_only": false, "function_name": "_edu_class", "identity_args": "p_class uuid", "argument_rules": null, "contract_probe": null, "gate_predicate": null, "non_client_lane": "internal: neither a client role nor service_role holds EXECUTE; it is reached only from inside public.edu_class_approve, public.edu_class_assign, public.edu_class_assignments, public.edu_class_confer_purchase, public.edu_class_grant, public.edu_class_join and 11 more, which decide access before they call it. Declared by lane ERRORS-HONEST (2026-09-24) when its not-found raise moved to platform.refuse_not_found; its grants are unchanged.", "anonymous_callers": false, "anonymous_purpose": null, "identity_argtypes": ["2950"], "signed_in_callers": false}'::jsonb);
insert into platform.client_callable_door select * from jsonb_populate_record(null::platform.client_callable_door, '{"id": "b782e61b-e1fc-4cf4-a546-768918b45833", "reason": "p_suggestion_id is read only as a suggestion the acting user owns (user_id = auth.uid(), pending); the field is made only when that person is an owner or admin of the suggestion''s scope type''s organization (iam.organization_member role owner/admin), and through custom.context_item_write, whose create_context_item checks the same organization again.", "probe_args": null, "declared_at": "2026-09-30T02:51:50.536116+00:00", "declared_by": "migrations/campaign/scopesoldwriters_the_old_writers_write_through_the_scope_doors.sql (lane SCOPES-OLD-WRITERS)", "schema_name": "public", "refusal_only": false, "function_name": "accept_context_item_suggestion", "identity_args": "p_suggestion_id uuid", "argument_rules": null, "contract_probe": null, "gate_predicate": null, "non_client_lane": "server_only: service_role alone holds EXECUTE; the knowledge system''s accept path on the server calls it with the acting person''s claims (auth.uid()), and no client grant exists.", "anonymous_callers": false, "anonymous_purpose": null, "identity_argtypes": ["2950"], "signed_in_callers": false}'::jsonb);
insert into platform.client_callable_door select * from jsonb_populate_record(null::platform.client_callable_door, '{"id": "253edcf9-62d5-4c28-a811-f98f7c6e8739", "reason": "Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 1 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.", "probe_args": null, "declared_at": "2026-09-13T08:46:33.816567+00:00", "declared_by": "DD-169 batch 3 / B-75", "schema_name": "public", "refusal_only": false, "function_name": "accept_scope_suggestion", "identity_args": "p_suggestion_id uuid, p_organization_id uuid", "argument_rules": {"version": 1, "arguments": {"p_suggestion_id": {"type": "uuid", "check": "p_suggestion_id in statement comparing identity", "foreign": {"note": "decision found by the static reading with helper closure: p_suggestion_id in statement comparing identity", "decided_before_read": true}, "optional": false, "position": 1, "verified": "static reading 2026-09-17", "null_rule": {}}, "p_organization_id": {"type": "uuid", "check": "p_organization_id in statement comparing identity", "foreign": {"note": "decision found by the static reading with helper closure: p_organization_id in statement comparing identity", "decided_before_read": true}, "optional": true, "position": 2, "verified": "static reading 2026-09-17", "null_rule": {}, "sql_default": "NULL::uuid"}}, "declared_by": "0851_every_door_names_every_argument.sql"}, "contract_probe": null, "gate_predicate": "auth.uid()", "non_client_lane": null, "anonymous_callers": false, "anonymous_purpose": null, "identity_argtypes": ["2950", "2950"], "signed_in_callers": true}'::jsonb);
insert into platform.client_callable_door select * from jsonb_populate_record(null::platform.client_callable_door, '{"id": "83650161-182c-44c1-84f4-47f3862344a2", "reason": "Declared, not widened, by access-ladder T-3 (body replaced to drop the deprecated organization flag or its narration). p_user_id is the person whose organizations and scope types are listed; compared to iam.organization_member.user_id. NULL lists nothing.", "probe_args": null, "declared_at": "2026-09-26T20:10:13.295736+00:00", "declared_by": "migrations/access_ladder_t3_no_object_branches_on_an_org_type.sql (lane access-ladder T-3)", "schema_name": "public", "refusal_only": false, "function_name": "get_user_scopes", "identity_args": "p_user_id uuid", "argument_rules": null, "contract_probe": null, "gate_predicate": null, "non_client_lane": "server_only: only postgres and service_role hold EXECUTE; the server builds a persons scope tree with it for that persons own request.", "anonymous_callers": false, "anonymous_purpose": null, "identity_argtypes": ["2950"], "signed_in_callers": false}'::jsonb);
-- Three of them had no door row on production (they predate the guard); a recreated definer must be declared, so
-- the inverse declares them as what they were: server-only, service_role alone holds EXECUTE.
insert into platform.client_callable_door (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers) values
  ('public', 'get_entity_scopes', 'p_entity_type text, p_entity_id uuid', array['text'::regtype, 'uuid'::regtype]::oid[], 'Restored by the inverse of FTS-1b''s drop: p_entity_type/p_entity_id name the entity whose scopes are listed; no access decision is taken inside, so only the server may call it.', 'migrations/inverse/scopesw2b_seven_old_scope_readers_nobody_calls_are_gone_down.sql', 'server_only: only postgres and service_role hold EXECUTE; no code calls it (census 2026-10-05).', false, false),
  ('public', 'get_org_structure', 'p_org_id uuid', array['uuid'::regtype]::oid[], 'Restored by the inverse of FTS-1b''s drop: p_org_id is the organization whose scope types and scopes are listed; no access decision is taken inside, so only the server may call it.', 'migrations/inverse/scopesw2b_seven_old_scope_readers_nobody_calls_are_gone_down.sql', 'server_only: only postgres and service_role hold EXECUTE; no code calls it (census 2026-10-05).', false, false),
  ('public', 'get_value_history', 'p_scope_id uuid, p_context_item_id uuid, p_limit integer', array['uuid'::regtype, 'uuid'::regtype, 'integer'::regtype]::oid[], 'Restored by the inverse of FTS-1b''s drop: p_scope_id/p_context_item_id name the value whose history is listed; no access decision is taken inside, so only the server may call it.', 'migrations/inverse/scopesw2b_seven_old_scope_readers_nobody_calls_are_gone_down.sql', 'server_only: only postgres and service_role hold EXECUTE; no code calls it (census 2026-10-05).', false, false);

-- OWNERS AND GRANTS as production held them.
ALTER FUNCTION public._edu_class(uuid) OWNER TO postgres;
ALTER FUNCTION public.accept_context_item_suggestion(uuid) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.accept_context_item_suggestion(uuid) TO service_role;
ALTER FUNCTION public.accept_scope_suggestion(uuid,uuid) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.accept_scope_suggestion(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_scope_suggestion(uuid,uuid) TO service_role;
ALTER FUNCTION public.get_entity_scopes(text,uuid) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.get_entity_scopes(text,uuid) TO service_role;
ALTER FUNCTION public.get_org_structure(uuid) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.get_org_structure(uuid) TO service_role;
ALTER FUNCTION public.get_user_scopes(uuid) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.get_user_scopes(uuid) TO service_role;
ALTER FUNCTION public.get_value_history(uuid,uuid,integer) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.get_value_history(uuid,uuid,integer) TO service_role;
