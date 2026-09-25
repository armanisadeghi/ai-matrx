-- INVERSE of migrations/campaign/tails5_a_revive_is_an_update_of_the_tombstone.sql.
--   CORRECTED INVERSE (lane BRANCH-REFRESH-4, 2026-09-25): byte for byte tails5_a_revive_is_an_update_of_the_tombstone_down.sql, whose header
--   this is, except ONLY its stale `-- based-on:` hashes: platform.revive_tombstoned_association() a1d24b9a… -> c60df9ab…. The ledgered
--   inverse declared bodies that never stood live: the up-file's own bytes produce the new hashes
--   (measured on the dev clone, each function's block from tails5_a_revive_is_an_update_of_the_tombstone.sql alone in a rolled-back
--   transaction) and production holds exactly them, so DD-220 would refuse the old inverse the one
--   time it is needed. The old file is never edited; THIS is the inverse to run. Its up-file is not
--   found by name — pass `--up` with tails5_a_revive_is_an_update_of_the_tombstone.sql. Found by scripts/night/body-drift-inverses.py.
-- supersedes-inverse: tails5_a_revive_is_an_update_of_the_tombstone_down.sql
--
-- It restores the four bodies exactly as they stood before that file:
--
--   * `platform.revive_tombstoned_association()` back to the out-of-band UPDATE that clears
--     `deleted_at` on the tombstone and then lets the INSERT proceed — the shape whose later
--     command id makes the revived tuple invisible to the inserting statement's own snapshot,
--     so an `ON CONFLICT DO UPDATE` onto a tombstoned edge dies
--     `21000 ON CONFLICT DO UPDATE command cannot affect row a second time`.
--   * `public.assoc_add`, `public.agent_resource_add` and `public.conversation_file_add` back
--     to reading the edge id straight off `RETURNING` with no read-back.
--
-- With this applied, `scripts/campaign-tests/tails5_relink_red.sql` goes GREEN again — that is
-- to say, the dispatcher can no longer put a customer back on a job she just took them off —
-- which is what makes the red-then-green a measurement and not a story.
--
-- based-on: platform.revive_tombstoned_association() c60df9ab7a072cc3daceb57c4fd9d6f05746938db5ece98f8825a35ac2f65a6d
-- based-on: public.assoc_add(text, uuid, text, uuid, uuid, text, jsonb, text, integer, text, jsonb) 0a9b5675d5a27d4cde137f57eda9c5c6f5661d742c272cfdda935a54527cf53c
-- based-on: public.agent_resource_add(uuid, text, uuid, text, jsonb) 42038a8ae484edc74b12485de6b11afad499d13c6677937aada75abe2f6bd2f9
-- based-on: public.conversation_file_add(uuid, uuid, text, jsonb, boolean) 8604c4afc0b718fdf5b95d4ff6cd41beabf5dd6067fc6d17c7a204b3009b11dc
--
-- The four hashes above are the bodies TAILS-5's own migration installs — this inverse only
-- ever runs on a database that already carries them, so they are the same on the rehearsal
-- copy and on the main database.
-- chair-step: it replaces four live bodies, one of them a trigger function on
-- platform.associations.

set lock_timeout = '4s';

CREATE OR REPLACE FUNCTION platform.revive_tombstoned_association()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  update platform.associations
     set deleted_at       = null,
         deleted_via_type = null,
         deleted_via_id   = null
   where deleted_at is not null
     and source_type = new.source_type and source_id = new.source_id
     and target_type = new.target_type and target_id = new.target_id
     and role is not distinct from new.role;
  return new;
end
$function$
;
CREATE OR REPLACE FUNCTION public.assoc_add(p_source_type text, p_source_id uuid, p_target_type text, p_target_id uuid, p_org_id uuid DEFAULT NULL::uuid, p_label text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb, p_role text DEFAULT NULL::text, p_position integer DEFAULT NULL::integer, p_payload_kind text DEFAULT NULL::text, p_payload jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_org uuid;
    v_id uuid;
    v_container_side text;
    v_container_type text;
    v_container_id uuid;
    v_org_from_fallback boolean := false;
    v_source_editor boolean;
    v_source_viewer boolean;
    v_target_editor boolean;
    v_target_viewer boolean;
begin
    if (select auth.uid()) is null then
        raise exception 'assoc_add: authenticated user required'
            using errcode = '42501';
    end if;

    if p_source_type = 'file' and p_target_type = 'conversation' then
        if p_role is not null or p_position is not null
           or p_payload_kind is not null or p_payload is not null then
            raise exception 'file -> conversation supports only the canonical role-less attachment edge'
                using errcode = '42501';
        end if;
        return public.conversation_file_add(
            p_target_id,
            p_source_id,
            p_label,
            coalesce(p_metadata, '{}'::jsonb),
            coalesce(p_metadata, '{}'::jsonb) ? 'resource_policy'
        );
    end if;

    select at.container_side
      into v_container_side
      from platform.association_types at
     where at.source_type = p_source_type
       and at.target_type = p_target_type
       and at.is_active;

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

    if v_container_side is distinct from 'none'
       and v_container_side is not null then
        if v_source_editor is not true or v_target_editor is not true then
            raise exception 'assoc_add: editor access to both endpoints is required for an access-conveying edge'
                using errcode = '42501';
        end if;

        if v_container_side = 'target' then
            v_container_type := p_target_type;
            v_container_id := p_target_id;
        elsif v_container_side = 'source' then
            v_container_type := p_source_type;
            v_container_id := p_source_id;
        else
            raise exception 'assoc_add: unsupported container_side %', v_container_side
                using errcode = '23514';
        end if;

        v_org := private.association_container_organization_id(
            v_container_type,
            v_container_id
        );
        if v_org is null then
            raise exception 'assoc_add: access-conveying container has no organization'
                using errcode = '23514';
        end if;
    else
        if coalesce((
            (v_source_editor and v_target_viewer)
            or (v_source_viewer and v_target_editor)
        ), false) is not true then
            raise exception 'assoc_add: non-conveying edges require editor access to one endpoint and viewer access to the other'
                using errcode = '42501';
        end if;

        -- Derive the edge org from a real endpoint. A caller-supplied org is
        -- only a fallback for registered endpoint types with no org column.
        v_org := private.association_container_organization_id(
            p_source_type,
            p_source_id
        );
        if v_org is null then
            v_org := private.association_container_organization_id(
                p_target_type,
                p_target_id
            );
        end if;
        if v_org is null then
            v_org := p_org_id;
            v_org_from_fallback := true;
        end if;
    end if;

    if v_org is null or (
        v_org_from_fallback and not iam.has_org_access(v_org)
    ) then
        raise exception
            'assoc_add: no org access (org=%, %/% -> %/% role=%)',
            v_org, p_source_type, p_source_id, p_target_type, p_target_id, p_role
            using errcode = '42501';
    end if;

    insert into platform.associations (
        source_type, source_id, target_type, target_id, organization_id,
        role, label, position, metadata, payload_kind, payload, created_by
    ) values (
        p_source_type, p_source_id, p_target_type, p_target_id, v_org,
        p_role, p_label, p_position, coalesce(p_metadata, '{}'::jsonb),
        p_payload_kind, p_payload, (select auth.uid())
    )
    on conflict (source_type, source_id, target_type, target_id, role)
    do update set
        label = coalesce(excluded.label, platform.associations.label),
        position = coalesce(excluded.position, platform.associations.position),
        metadata = excluded.metadata,
        payload_kind = coalesce(
            excluded.payload_kind,
            platform.associations.payload_kind
        ),
        payload = case
            when excluded.payload_kind is not null then excluded.payload
            else platform.associations.payload
        end
    returning id into v_id;

    return v_id;
end
$function$
;
CREATE OR REPLACE FUNCTION public.agent_resource_add(p_agent_id uuid, p_source_type text, p_source_id uuid, p_label text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid;
  v_org uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'agent_resource_add: authenticated user required'
      using errcode = '42501';
  end if;

  if not iam.has_access('agent', p_agent_id, 'editor'::public.permission_level) then
    raise exception 'agent_resource_add: editor access to agent required'
      using errcode = '42501';
  end if;

  if not iam.has_access(p_source_type, p_source_id, 'editor'::public.permission_level) then
    raise exception 'agent_resource_add: editor access to source resource required'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from platform.association_types at
    where at.source_type = p_source_type
      and at.target_type = 'agent'
      and at.container_side = 'target'
      and at.is_active
  ) then
    raise exception 'agent_resource_add: unsupported resource type %', p_source_type
      using errcode = '23514';
  end if;

  select d.organization_id
    into v_org
    from agent.definition d
   where d.id = p_agent_id;

  if v_org is null then
    raise exception 'agent_resource_add: agent has no organization'
      using errcode = '23514';
  end if;

  insert into platform.associations (
    source_type,
    source_id,
    target_type,
    target_id,
    organization_id,
    role,
    label,
    metadata,
    created_by
  ) values (
    p_source_type,
    p_source_id,
    'agent',
    p_agent_id,
    v_org,
    'agent_resource',
    p_label,
    coalesce(p_metadata, '{}'::jsonb),
    (select auth.uid())
  )
  on conflict (source_type, source_id, target_type, target_id, role)
  do update set
    label = coalesce(excluded.label, platform.associations.label),
    metadata = excluded.metadata
  returning id into v_id;

  return v_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.conversation_file_add(p_conversation_id uuid, p_file_id uuid, p_label text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb, p_replace_metadata boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
    v_id uuid;
    v_org uuid;
    v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
begin
    if (select auth.uid()) is null then
        raise exception 'conversation_file_add: authenticated user required'
            using errcode = '42501';
    end if;
    if jsonb_typeof(v_metadata) <> 'object' then
        raise exception 'conversation_file_add: metadata must be a JSON object'
            using errcode = '22023';
    end if;
    if not exists (
        select 1 from files.files f
        where f.id = p_file_id and f.deleted_at is null
    ) then
        raise exception 'conversation_file_add: file is no longer available'
            using errcode = 'P0002';
    end if;
    if not iam.has_access('conversation', p_conversation_id, 'editor'::public.permission_level) then
        raise exception 'conversation_file_add: editor access to conversation required'
            using errcode = '42501';
    end if;
    if not iam.has_access('file', p_file_id, 'editor'::public.permission_level) then
        raise exception 'conversation_file_add: editor access to file required'
            using errcode = '42501';
    end if;
    select c.organization_id into v_org
    from chat.conversation c
    where c.id = p_conversation_id and c.deleted_at is null;
    if v_org is null then
        raise exception 'conversation_file_add: conversation has no organization'
            using errcode = '23514';
    end if;
    insert into platform.associations (
        source_type, source_id, target_type, target_id, organization_id,
        role, label, metadata, created_by
    ) values (
        'file', p_file_id, 'conversation', p_conversation_id, v_org,
        null, p_label, v_metadata || jsonb_build_object('file_id', p_file_id),
        (select auth.uid())
    )
    on conflict (source_type, source_id, target_type, target_id, role)
    do update set
        label = coalesce(excluded.label, platform.associations.label),
        metadata = case
            when p_replace_metadata then excluded.metadata
            else platform.associations.metadata
        end
    returning id into v_id;
    return v_id;
end
$function$
;
