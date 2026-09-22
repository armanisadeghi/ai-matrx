-- INVERSE of migrations/campaign/tails5a_a_removal_archives_the_edge.sql.
--
-- It restores the four doors to the bodies that ran `DELETE FROM platform.associations` — the
-- shape in which taking a photo off a conversation, a resource off an agent or an assignment
-- off a class DESTROYED the row, so the thing a person put back was a different object that
-- had never been anywhere.
--
-- The primitive `platform.assoc_unset` and its `platform.client_callable_door` row are LEFT
-- STANDING on purpose. Dropping a function that four restored bodies no longer call would
-- gain nothing and would break any other adopter that arrived in the meantime — the exact
-- shape `pnpm check:inverses-leave-the-ground-standing` clause (d) exists to refuse. An
-- inverse undoes the BEHAVIOUR; it does not take the ground away.
-- ground-standing-ok: d
--
-- based-on: public.assoc_remove(text, uuid, text, uuid, text) bb9a081650fe2712cdc147299b3e4e661e2438940f8d06604c05ab353267a49e
-- based-on: public.conversation_file_remove(uuid, uuid) ca8d435802eee1b673dd9b4157bd088c6b5269a642d6d02677cee57e47e8b86f
-- based-on: public.agent_resource_remove(uuid, text, uuid) 8dad96a7dc3124ea53a3529b6d58aea6ba919b97a2fdafbdfdfb61f87104719f
-- based-on: public.edu_class_unassign(uuid, text, uuid) c34b927d36c4ee1a927c35b962bec1c1e610c1553a85a3a13a649f4048acbee9
--
-- With this applied, `scripts/campaign-tests/tails5a_archive_green.sql` fails at its first
-- clause — the photo comes back as a different edge — which is what makes the red-then-green
-- a measurement.
--
-- chair-step: it replaces four live client doors.

set lock_timeout = '4s';

CREATE OR REPLACE FUNCTION public.assoc_remove(p_source_type text, p_source_id uuid, p_target_type text, p_target_id uuid, p_role text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_container_side text;
    v_container_type text;
    v_container_id uuid;
    v_source_editor boolean;
    v_source_viewer boolean;
    v_target_editor boolean;
    v_target_viewer boolean;
begin
    if (select auth.uid()) is null then
        raise exception 'assoc_remove: authenticated user required'
            using errcode = '42501';
    end if;

    if p_source_type = 'file' and p_target_type = 'conversation' then
        if p_role is not null then
            raise exception 'file -> conversation supports only the canonical role-less attachment edge'
                using errcode = '42501';
        end if;
        perform public.conversation_file_remove(p_target_id, p_source_id);
        return;
    end if;

    select at.container_side
      into v_container_side
      from platform.association_types at
     where at.source_type = p_source_type
       and at.target_type = p_target_type
       and at.is_active;

    if v_container_side is distinct from 'none'
       and v_container_side is not null then
        if v_container_side = 'target' then
            v_container_type := p_target_type;
            v_container_id := p_target_id;
        elsif v_container_side = 'source' then
            v_container_type := p_source_type;
            v_container_id := p_source_id;
        else
            raise exception 'assoc_remove: unsupported container_side %', v_container_side
                using errcode = '23514';
        end if;

        if not iam.has_access(
            v_container_type,
            v_container_id,
            'editor'::public.permission_level
        ) then
            raise exception 'assoc_remove: editor access to the access-conveying container is required'
                using errcode = '42501';
        end if;
    else
        v_source_editor := iam.has_access(
            p_source_type, p_source_id, 'editor'::public.permission_level
        );
        v_source_viewer := iam.has_access(
            p_source_type, p_source_id, 'viewer'::public.permission_level
        );
        v_target_editor := iam.has_access(
            p_target_type, p_target_id, 'editor'::public.permission_level
        );
        v_target_viewer := iam.has_access(
            p_target_type, p_target_id, 'viewer'::public.permission_level
        );
        if coalesce((
            (v_source_editor and v_target_viewer)
            or (v_source_viewer and v_target_editor)
        ), false) is not true then
            raise exception 'assoc_remove: non-conveying edges require editor access to one endpoint and viewer access to the other'
                using errcode = '42501';
        end if;
    end if;

    delete from platform.associations
     where source_type = p_source_type
       and source_id = p_source_id
       and target_type = p_target_type
       and target_id = p_target_id
       and role is not distinct from p_role;
end
$function$
;
CREATE OR REPLACE FUNCTION public.conversation_file_remove(p_conversation_id uuid, p_file_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
    IF (SELECT auth.uid()) IS NULL THEN
        RAISE EXCEPTION 'conversation_file_remove: authenticated user required'
            USING ERRCODE = '42501';
    END IF;

    IF NOT iam.has_access('conversation', p_conversation_id, 'editor'::public.permission_level) THEN
        RAISE EXCEPTION 'conversation_file_remove: editor access to conversation required'
            USING ERRCODE = '42501';
    END IF;

    DELETE FROM platform.associations
    WHERE source_type = 'file'
      AND source_id = p_file_id
      AND target_type = 'conversation'
      AND target_id = p_conversation_id
      AND role IS NULL;
END
$function$
;
CREATE OR REPLACE FUNCTION public.agent_resource_remove(p_agent_id uuid, p_source_type text, p_source_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if (select auth.uid()) is null then
    raise exception 'agent_resource_remove: authenticated user required'
      using errcode = '42501';
  end if;

  if not iam.has_access('agent', p_agent_id, 'editor'::public.permission_level) then
    raise exception 'agent_resource_remove: editor access to agent required'
      using errcode = '42501';
  end if;

  delete from platform.associations a
   where a.source_type = p_source_type
     and a.source_id = p_source_id
     and a.target_type = 'agent'
     and a.target_id = p_agent_id
     and a.role = 'agent_resource';
end;
$function$
;
CREATE OR REPLACE FUNCTION public.edu_class_unassign(p_class uuid, p_token text, p_resource uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_scope context.scopes;
begin
  v_scope := public._edu_class(p_class);
  if not public._edu_is_owner(v_scope) then
    raise exception 'only the class owner can remove assignments' using errcode = '42501';
  end if;
  delete from platform.associations
  where source_type = p_token and source_id = p_resource
    and target_type = 'scope' and target_id = v_scope.id
    and role = 'assignment';
  return jsonb_build_object('status', 'unassigned', 'token', p_token, 'resource_id', p_resource);
end;
$function$
;
