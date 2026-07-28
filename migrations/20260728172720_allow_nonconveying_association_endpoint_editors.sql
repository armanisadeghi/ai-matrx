-- A non-access-conveying association edits the relationship, not necessarily
-- the source row. Reusable public/catalog sources (for example seo_keyword)
-- are intentionally viewer-only for ordinary users. Authorize these edges
-- symmetrically: editor(source)+viewer(target) OR viewer(source)+editor(target).
-- Access-conveying associations keep the stricter editor-on-both rule.

create or replace function public.assoc_add(
    p_source_type text,
    p_source_id uuid,
    p_target_type text,
    p_target_id uuid,
    p_org_id uuid default null,
    p_label text default null,
    p_metadata jsonb default '{}'::jsonb,
    p_role text default null,
    p_position integer default null,
    p_payload_kind text default null,
    p_payload jsonb default null
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
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
        p_payload_kind, p_payload, auth.uid()
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
$function$;

create or replace function public.assoc_remove(
    p_source_type text,
    p_source_id uuid,
    p_target_type text,
    p_target_id uuid,
    p_role text default null
) returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
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
$function$;
