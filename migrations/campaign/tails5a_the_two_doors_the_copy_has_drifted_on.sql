-- chair-step: it replaces two live client doors so they ARCHIVE the edge instead of destroying
--   it, the same change `tails5a_a_removal_archives_the_edge.sql` makes to the other four.
--   Additive in substance — two CREATE OR REPLACE, nothing dropped, nothing revoked — and both
--   bodies it overwrites are named by a `-- based-on:` line.
-- based-on: public.dissociate_from_task(uuid, text, uuid) 21f7dfaa5b661f6191bfe42f1452d91e1c87cb4d6b4ff020262453210994fd3c
-- based-on: public.set_entity_scopes(text, uuid, uuid[]) 72ad5d379891211fa6597977f55226b7cc7ca7eb225942c21240aee8b9e31d18
--
-- TAILS-5 (A), THE COMPANION — AND WHY IT IS A SECOND FILE RATHER THAN SIX DOORS IN ONE.
--
-- These two doors' bodies on the rehearsal copy have DRIFTED from the main database. Measured
-- 2026-09-21 by hashing `pg_get_functiondef` on both servers: `assoc_remove`,
-- `conversation_file_remove`, `agent_resource_remove` and `edu_class_unassign` are
-- byte-identical on the two, and `dissociate_from_task` and `set_entity_scopes` are not.
--
-- A `-- based-on:` line is keyed by the function it names — `scripts/migration-based-on.ts`
-- builds a Map from the live oid to ONE declared hash, so a second line for the same function
-- overwrites the first. One file therefore cannot speak to two different bodies, and the
-- honest answer is two files rather than a hash that is wrong at one of the two targets.
-- **This file is applied to the MAIN database only**; its four siblings rehearse.
--
-- What changes is the same one sentence in both: the DELETE becomes `platform.assoc_unset`,
-- the primitive the sibling file adds. Every authority decision above it is unchanged,
-- character for character — read the two bodies below against `pg_get_functiondef` and the
-- only difference is the removal itself.
--
-- 🚨 WHY `set_entity_scopes` IS SAFE UNDER THE REVIVE TRIGGER, which is the one thing to think
-- about here. It removes every scope edge and then re-inserts the scopes in the new set. With
-- the removal archived instead of destroyed, that re-insert meets a tombstone and TAILS-5's
-- revive trigger brings the row back — which is exactly right: a scope that stays on the
-- record keeps ONE edge with ONE history across every re-tagging, and a scope that was dropped
-- stays tombstoned because nothing re-inserts it. The closing read is over
-- `platform.associations_live`, so it sees the revived set and nothing else.
--
-- Inverse: migrations/inverse/tails5a_the_two_doors_the_copy_has_drifted_on_down.sql

set lock_timeout = '4s';

-- ════════════════════════════════════════════════════════════════════════════════════════
-- 1. public.dissociate_from_task — an attachment off a task
-- ════════════════════════════════════════════════════════════════════════════════════════

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

  -- TAILS-5: ARCHIVED, NOT DESTROYED. The answer's shape is unchanged — `{"deleted": bool}` is
  -- still "was there one to take off" — but the edge it took off is still there to put back.
  v_deleted := platform.assoc_unset(p_entity_type, p_entity_id, 'task', p_task_id, null,
                                    'task', p_task_id);
  return jsonb_build_object('deleted', v_deleted > 0);
end;
$function$;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- 2. public.set_entity_scopes — the scopes a record is filed under
-- ════════════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.set_entity_scopes(p_entity_type text, p_entity_id uuid, p_scope_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_scope record; v_count int; v_result jsonb; v_edge record;
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

    -- TAILS-5: ARCHIVED, NOT DESTROYED — one edge per scope, kept across every re-tagging.
    -- The set is re-stated exactly as before: every scope edge is withdrawn and the ones in the
    -- new set are written back. The difference is that writing one back REVIVES the row it
    -- always was (platform.revive_tombstoned_association), so a scope that keeps coming back
    -- keeps one identity and one history instead of a new row each time.
    FOR v_edge IN
        SELECT a.target_id
        FROM platform.associations_live a
        WHERE a.source_type = p_entity_type AND a.source_id = p_entity_id AND a.target_type = 'scope'
    LOOP
        PERFORM platform.assoc_unset(p_entity_type, p_entity_id, 'scope', v_edge.target_id, null,
                                     p_entity_type, p_entity_id);
    END LOOP;

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
$function$;
