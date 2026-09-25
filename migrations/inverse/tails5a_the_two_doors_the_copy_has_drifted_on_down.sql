-- INVERSE of migrations/campaign/tails5a_the_two_doors_the_copy_has_drifted_on.sql.
--
-- It restores `public.dissociate_from_task` and `public.set_entity_scopes` to the bodies that
-- ran `DELETE FROM platform.associations`. `platform.assoc_unset` is left standing for the
-- reason its sibling inverse gives.
-- ground-standing-ok: d
--
-- The two hashes below are the MAIN database's bodies after its sibling applied; this file
-- never runs anywhere else, which is the same reason the sibling is a second file at all.
-- based-on: public.dissociate_from_task(uuid, text, uuid) c4ead5ee8aac455e4a25296b2a696ad5b8dcf80af26976c844c796e8a5d623a1
-- based-on: public.set_entity_scopes(text, uuid, uuid[]) 42195f058a93f6256fa339984ebda084cec22f6c483ca86411fc577bc88cea51
--
-- chair-step: it replaces two live client doors.

set lock_timeout = '2s';

CREATE OR REPLACE FUNCTION public.dissociate_from_task(p_task_id uuid, p_entity_type text, p_entity_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := auth.uid(); v_deleted int;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;

  -- 0749: p_task_id was unchecked, so a stranger could strip attachments off any
  -- task whose id they knew, and read existence back out of {"deleted": bool}.
  -- Removing an attachment mutates the task => editor. The entity end needs
  -- nothing extra: the only edges reachable here are that task's own.
  if p_task_id is null
     or coalesce(iam.has_access_for(v_uid, 'task', p_task_id, 'editor'::public.permission_level), false) is not true then
    raise exception 'dissociate_from_task: no editor access to the task' using errcode = '42501';
  end if;

  delete from platform.associations
   where source_type = p_entity_type and source_id = p_entity_id
     and target_type = 'task' and target_id = p_task_id;
  get diagnostics v_deleted = row_count;
  return jsonb_build_object('deleted', v_deleted > 0);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.set_entity_scopes(p_entity_type text, p_entity_id uuid, p_scope_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_scope record; v_count int; v_result jsonb;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'set_entity_scopes: not authenticated' USING ERRCODE = '42501';
    END IF;

    -- 0749 (A16/A17): the ENTITY being tagged is a caller-supplied id and was
    -- never checked. Tagging someone's row changes what that row is filed
    -- under, so it takes `editor`. One message: a foreign id and an invented id
    -- are refused identically, and it names only the TYPE.
    IF p_entity_id IS NULL
       OR coalesce(iam.has_access_for(v_uid, p_entity_type, p_entity_id, 'editor'::public.permission_level), false) IS NOT true THEN
        RAISE EXCEPTION 'set_entity_scopes: no editor access to the % you are tagging', p_entity_type
            USING ERRCODE = '42501';
    END IF;

    IF EXISTS (
        SELECT 1 FROM context.scopes s
        WHERE s.id = ANY(p_scope_ids)
          AND NOT EXISTS (SELECT 1 FROM iam.organization_member om
                          WHERE om.organization_id = s.organization_id AND om.user_id = v_uid)
    ) THEN
        RAISE EXCEPTION 'set_entity_scopes: scope outside your organizations' USING ERRCODE = '42501';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM platform.associations_live a
        JOIN context.scopes s ON s.id = a.target_id
        WHERE a.target_type='scope' AND a.source_type = p_entity_type AND a.source_id = p_entity_id
          AND NOT EXISTS (SELECT 1 FROM iam.organization_member om
                          WHERE om.organization_id = s.organization_id AND om.user_id = v_uid)
    ) THEN
        RAISE EXCEPTION 'set_entity_scopes: entity is tagged with scopes outside your organizations' USING ERRCODE = '42501';
    END IF;

    FOR v_scope IN
        SELECT s.id, s.scope_type_id, st.max_assignments_per_entity, st.label_singular
        FROM context.scopes s JOIN context.scope_types st ON s.scope_type_id = st.id
        WHERE s.id = ANY(p_scope_ids)
    LOOP
        IF v_scope.max_assignments_per_entity IS NOT NULL THEN
            SELECT count(*) INTO v_count
            FROM unnest(p_scope_ids) sid JOIN context.scopes s ON s.id = sid
            WHERE s.scope_type_id = v_scope.scope_type_id;
            IF v_count > v_scope.max_assignments_per_entity THEN
                RAISE EXCEPTION 'Type "%" allows max % assignment(s) per entity, but % were provided',
                    v_scope.label_singular, v_scope.max_assignments_per_entity, v_count;
            END IF;
        END IF;
    END LOOP;

    delete from platform.associations
    WHERE source_type = p_entity_type AND source_id = p_entity_id AND target_type = 'scope';

    -- ON CONFLICT must name the FULL unique index (associations_unique is
    -- (source_type, source_id, target_type, target_id, role) NULLS NOT DISTINCT).
    -- Omitting `role` made every call fail with 42P10 before it could write.
    INSERT INTO platform.associations (source_type, source_id, target_type, target_id, organization_id, created_by)
    SELECT p_entity_type, p_entity_id, 'scope', sc.id, sc.organization_id, v_uid
    FROM unnest(p_scope_ids) AS sid JOIN context.scopes sc ON sc.id = sid
    ON CONFLICT (source_type, source_id, target_type, target_id, role) DO NOTHING;

    SELECT jsonb_agg(jsonb_build_object(
        'scope_id', a.target_id, 'scope_name', s.name,
        'type_label', st.label_singular, 'type_icon', st.icon, 'type_color', st.color))
    INTO v_result
    FROM platform.associations_live a
    JOIN context.scopes s ON a.target_id = s.id
    JOIN context.scope_types st ON s.scope_type_id = st.id
    WHERE a.target_type='scope' AND a.source_type = p_entity_type AND a.source_id = p_entity_id;

    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$function$
;
