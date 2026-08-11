-- Access Gate — the denial-context resolver.
--
-- THE problem this closes: an RLS-filtered read returns zero rows for THREE
-- different situations — the row was deleted, the row never existed, and the
-- caller simply isn't allowed to see it. Every surface in the app collapsed
-- those into one guessed sentence ("this was deleted or is no longer
-- accessible"), which is wrong two times out of three and offers the user
-- nothing to do about it.
--
-- `public.access_denied_context` is the ONE thing a denied surface calls. For
-- any registered entity it answers, in human terms:
--   * does this exist, is it deleted, and what access do I actually have
--   * what KIND of thing is it (a pretty label, never a token)
--   * what is it CALLED
--   * who owns it, and in which organization
--   * the nearest ancestor I *can* open — the honest door back
--   * my own outstanding access request, if any
--
-- DISCLOSURE POLICY (owner ruling, 2026-08-11): a signed-in user who lands on a
-- record they cannot open may see kind + name + owner + org, so they know what
-- they are asking for and whom to ask. Anonymous callers get the kind only and
-- are invited to sign in. Per-entity opt-out lives in ONE place —
-- `platform.entity_types.deny_preview` — editable through the existing
-- `admin_upsert_entity_type` RPC. There is no second policy system.
--
-- Reuses rather than reimplements: `platform.entity_title` (unfiltered title
-- resolver), `platform.entity_row_access_attrs` (owner/org/visibility across
-- every row shape), `iam.has_access` (THE resolver),
-- `platform.entity_relationships` (the parent walk).
--
-- Row CONTENT is never returned — only identity, ownership, and the caller's
-- own state.

create or replace function public.access_denied_context(
  p_type text,
  p_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'platform', 'iam'
as $function$
declare
  v_uid            uuid := (select auth.uid());
  v_meta           record;
  v_attrs          record;
  v_deleted        boolean := false;
  v_level          text := 'none';
  v_is_owner       boolean := false;
  v_disclosure     text;
  v_owner_json     jsonb := null;
  v_org_json       jsonb := null;
  v_entity_json    jsonb;
  v_ancestor_json  jsonb := null;
  v_request_json   jsonb := null;
  v_can_request    boolean := false;
  v_parent_type    text;
  v_parent_id      uuid;
  v_fk             text;
  v_hops           int := 0;
  v_cur_type       text;
  v_cur_id         uuid;
  v_cur_schema     text;
  v_cur_table      text;
begin
  if p_type is null or p_id is null then
    return jsonb_build_object('exists', false, 'deleted', false,
                              'level', 'none', 'disclosure', 'none');
  end if;

  -- Resolve the token through the entity registry. An unregistered token is a
  -- programming error on the calling surface, not a user-facing state: we say
  -- "we can't identify this" rather than inventing a kind.
  select et.token, et.label, et.schema_name, et.table_name,
         coalesce(et.deny_preview, true)   as deny_preview,
         coalesce(et.has_soft_delete, false) as has_soft_delete
    into v_meta
  from platform.entity_types et
  where et.token = p_type
    and coalesce(et.is_active, true)
  limit 1;

  if v_meta.token is null then
    return jsonb_build_object('exists', false, 'deleted', false,
                              'level', 'none', 'disclosure', 'none');
  end if;

  select * into v_attrs
  from platform.entity_row_access_attrs(v_meta.schema_name, v_meta.table_name, p_id);

  -- Signed out: reveal nothing about a non-public row, not even whether it is
  -- here. The signed-out screen reads the same either way ("sign in to see
  -- whether you can open this"), so existence is withheld rather than handed
  -- out as an enumeration oracle.
  if v_uid is null and coalesce(v_attrs.o_vis, 'personal'::platform.visibility)
       <> 'public'::platform.visibility then
    return jsonb_build_object(
      'exists', null, 'deleted', null, 'level', 'none',
      'is_owner', false, 'disclosure', 'anonymous', 'can_request', false,
      'entity', jsonb_build_object('token', v_meta.token, 'label', v_meta.label)
    );
  end if;

  if not coalesce(v_attrs.o_found, false) then
    -- Genuinely absent. Telling "never existed" apart from "hard-deleted" is
    -- neither possible nor useful; both are "missing".
    return jsonb_build_object(
      'exists', false, 'deleted', false, 'level', 'none', 'disclosure', 'none',
      'entity', jsonb_build_object('token', v_meta.token, 'label', v_meta.label)
    );
  end if;

  if v_meta.has_soft_delete then
    begin
      execute format('select (deleted_at is not null) from %I.%I where id = $1',
                     v_meta.schema_name, v_meta.table_name)
        into v_deleted using p_id;
    exception when others then
      v_deleted := false;
    end;
  end if;

  -- The caller's REAL access, through THE resolver.
  if v_uid is not null then
    if iam.has_access(v_meta.token, p_id, 'admin'::public.permission_level) then
      v_level := 'admin';
    elsif iam.has_access(v_meta.token, p_id, 'editor'::public.permission_level) then
      v_level := 'edit';
    elsif iam.has_access(v_meta.token, p_id, 'viewer'::public.permission_level) then
      v_level := 'view';
    end if;
    v_is_owner := (v_attrs.o_owner is not null and v_attrs.o_owner = v_uid);
  else
    -- Only public rows reach here (the non-public anonymous case returned above).
    v_level := 'view';
  end if;

  if v_uid is null then
    v_disclosure := 'anonymous';   -- kind only, plus "sign in"
  elsif not v_meta.deny_preview then
    v_disclosure := 'kind_only';   -- per-entity opt-out
  else
    v_disclosure := 'full';        -- kind + name + owner + org
  end if;

  v_entity_json := jsonb_build_object('token', v_meta.token, 'label', v_meta.label);

  if v_disclosure = 'full' then
    v_entity_json := v_entity_json
      || jsonb_build_object('title', platform.entity_title(v_meta.token, p_id));

    if v_attrs.o_owner is not null then
      select jsonb_build_object(
               'user_id', pr.id,
               'display_name', nullif(pr.display_name, ''),
               'avatar_url', nullif(pr.avatar_url, '')
             )
        into v_owner_json
      from users.profiles pr
      where pr.id = v_attrs.o_owner;

      -- A missing profile row must not erase the fact that someone owns it.
      v_owner_json := coalesce(
        v_owner_json,
        jsonb_build_object('user_id', v_attrs.o_owner,
                           'display_name', null, 'avatar_url', null)
      );
    end if;

    if v_attrs.o_org is not null then
      select jsonb_build_object('id', o.id, 'name', o.name,
                                'is_personal', coalesce(o.is_personal, false))
        into v_org_json
      from iam.organizations o
      where o.id = v_attrs.o_org;
    end if;

    -- The honest door back: walk composition/containment parents and hand back
    -- the FIRST ancestor the caller can actually open. Depth-capped, so a cycle
    -- in the registry can never hang a page render.
    if v_uid is not null then
      v_cur_type   := v_meta.token;
      v_cur_id     := p_id;
      v_cur_schema := v_meta.schema_name;
      v_cur_table  := v_meta.table_name;

      while v_hops < 6 and v_ancestor_json is null loop
        v_hops := v_hops + 1;

        select er.parent_type, er.fk_column
          into v_parent_type, v_fk
        from platform.entity_relationships er
        where er.child_type = v_cur_type
          and er.kind in ('composition', 'containment')
        order by (er.kind = 'composition') desc
        limit 1;

        exit when v_parent_type is null or v_fk is null;

        begin
          execute format('select %I from %I.%I where id = $1',
                         v_fk, v_cur_schema, v_cur_table)
            into v_parent_id using v_cur_id;
        exception when others then
          v_parent_id := null;
        end;

        exit when v_parent_id is null;

        if iam.has_access(v_parent_type, v_parent_id,
                          'viewer'::public.permission_level) then
          v_ancestor_json := jsonb_build_object(
            'token', v_parent_type,
            'id',    v_parent_id,
            'label', (select label from platform.entity_types
                       where token = v_parent_type),
            'title', platform.entity_title(v_parent_type, v_parent_id)
          );
          exit;
        end if;

        select et.schema_name, et.table_name
          into v_cur_schema, v_cur_table
        from platform.entity_types et
        where et.token = v_parent_type;

        exit when v_cur_schema is null;

        v_cur_type := v_parent_type;
        v_cur_id   := v_parent_id;
      end loop;
    end if;
  end if;

  -- The caller's own outstanding request. Never anyone else's.
  if v_uid is not null then
    select jsonb_build_object(
             'id', ar.id, 'status', ar.status,
             'level', ar.requested_level, 'created_at', ar.created_at
           )
      into v_request_json
    from iam.access_requests ar
    where ar.resource_type = v_meta.token
      and ar.resource_id = p_id
      and ar.created_by = v_uid
      and ar.deleted_at is null
    order by ar.created_at desc
    limit 1;
  end if;

  -- Offer the request only where it can actually succeed: signed in, no access,
  -- the row is alive, somebody is there to receive it, and the caller has not
  -- been reported for this resource.
  v_can_request :=
        v_uid is not null
    and v_level = 'none'
    and not v_deleted
    and (v_attrs.o_owner is not null or v_attrs.o_org is not null)
    and coalesce(v_request_json ->> 'status', '') not in ('pending', 'reported');

  return jsonb_build_object(
    'exists', true,
    'deleted', v_deleted,
    'level', v_level,
    'is_owner', v_is_owner,
    'disclosure', v_disclosure,
    'entity', v_entity_json,
    'owner', v_owner_json,
    'organization', v_org_json,
    'ancestor', v_ancestor_json,
    'request', v_request_json,
    'can_request', v_can_request
  );
end;
$function$;

comment on function public.access_denied_context(text, uuid) is
  'Human-readable context for a record the caller cannot open: kind, name, owner, '
  'organization, nearest reachable ancestor, and the caller''s own access request. '
  'Disclosure is governed by platform.entity_types.deny_preview; anonymous callers '
  'get the kind only. Never returns row content.';

revoke all on function public.access_denied_context(text, uuid) from public;
grant execute on function public.access_denied_context(text, uuid) to anon, authenticated;
