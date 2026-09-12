-- access_gate_platform_admin_truth
--
-- THE GATE TOLD A PLATFORM ADMIN THEY HAD NO ACCESS TO A ROW THEY OWN OUTRIGHT.
--
-- `public.access_denied_context` is the ONE resolver every "couldn't open this"
-- surface asks before it says anything (`features/access-gate/`). It derives the
-- caller's level from `iam.has_access`, and `iam.has_access_for_base` has no
-- platform-admin clause: owner, org admin, permissions, memberships,
-- reachability, containment, library grants — and a super-admin branch that
-- fires ONLY when the row's organization is a `global_readable` system org.
--
-- The RLS ceiling says something different. `iam.apply_rls` puts a
-- `platform_admin_all` policy — `qual: (SELECT is_platform_admin())`, FOR ALL —
-- on 888 tables, one identical predicate on every one of them, covering 636 of
-- the 670 active `platform.entity_types`. A platform admin can SELECT, UPDATE
-- and DELETE any row in any of them.
--
-- So for essentially the whole platform the resolver returned
-- `exists=true, level='none'` for a platform admin, `deriveStatus` read that as
-- `denied`, and the gate said "You don't have access to this <thing>" to the one
-- person who has the most access to it. Proven on the live database
-- (2026-09-11): for admin@admin.com (87a6e699-3622-4869-8843-d0867456c0dd),
-- `is_platform_admin_for` = true while
-- `iam.has_access_for(uid,'sch_task','a7c1e2d3-0000-4e5f-9a00-000000000006','viewer')`
-- = false — the exact sentence reported on `/schedules/<id>`.
--
-- THIS CHANGES WHAT THE GATE SAYS, NOT WHO MAY DO WHAT. `iam.has_access` is the
-- authorizer and is deliberately left alone: widening it would widen real
-- access, which is not a screen's business and not an agent's call
-- (`docs/official/db-rules.md` §6). The resolver is the REPORTER, and its whole
-- job is to state the truth about the ceiling that is already there. With the
-- level reported honestly, `deriveStatus` returns `ok` — "you do have access;
-- something else went wrong" — which is the true story whenever an admin's read
-- came back empty for a reason that was never authorization.
--
-- Side effect, and the right one: `can_request` is computed from
-- `v_level = 'none'`, so a platform admin is no longer offered a button to ask
-- someone else for permission they already hold.
--
-- Deletion still wins. `payload.deleted` is tested before `level` in
-- `deriveStatus`, so an admin opening a deleted row still gets "deleted", not
-- "you have access, retry" — the 2026-08-25 ordering ruling is untouched.

CREATE OR REPLACE FUNCTION public.access_denied_context(p_type text, p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'platform', 'iam'
AS $function$
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
                              'level', 'none', 'disclosure', 'none',
                              'unresolvable', true);
  end if;

  select et.token, et.label, et.schema_name, et.table_name,
         coalesce(et.allow_preview, true)    as allow_preview,
         coalesce(et.has_soft_delete, false) as has_soft_delete
    into v_meta
  from platform.entity_types et
  where et.token = p_type
    and coalesce(et.is_active, true)
  limit 1;

  if v_meta.token is null then
    return jsonb_build_object('exists', false, 'deleted', false,
                              'level', 'none', 'disclosure', 'none',
                              'unresolvable', true);
  end if;

  select * into v_attrs
  from platform.entity_row_access_attrs(v_meta.schema_name, v_meta.table_name, p_id);

  if v_uid is null and coalesce(v_attrs.o_vis, 'personal'::platform.visibility)
       <> 'public'::platform.visibility then
    return jsonb_build_object(
      'exists', null, 'deleted', null, 'level', 'none',
      'is_owner', false, 'disclosure', 'anonymous', 'can_request', false,
      'entity', jsonb_build_object('token', v_meta.token, 'label', v_meta.label)
    );
  end if;

  if not coalesce(v_attrs.o_found, false) then
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

  if v_uid is not null then
    if iam.has_access(v_meta.token, p_id, 'admin'::public.permission_level) then
      v_level := 'admin';
    elsif iam.has_access(v_meta.token, p_id, 'editor'::public.permission_level) then
      v_level := 'edit';
    elsif iam.has_access(v_meta.token, p_id, 'viewer'::public.permission_level) then
      v_level := 'view';
    end if;

    -- THE RLS CEILING IS PART OF THE ANSWER. `iam.has_access` walks grants and
    -- containment; it does not know about the `platform_admin_all` policy that
    -- `iam.apply_rls` writes onto every canonical table, so on its own it
    -- reports 'none' for a platform admin who can read, update and delete this
    -- row. Reporting that as a denial is the lie this file exists to end.
    -- Only the SENTENCE changes: nothing here grants anything.
    if v_level = 'none' and public.is_platform_admin_for(v_uid) then
      v_level := 'admin';
    end if;

    v_is_owner := (v_attrs.o_owner is not null and v_attrs.o_owner = v_uid);
  else
    v_level := 'view';
  end if;

  if v_uid is null then
    v_disclosure := 'anonymous';
  elsif not v_meta.allow_preview then
    v_disclosure := 'kind_only';
  else
    v_disclosure := 'full';
  end if;

  v_entity_json := jsonb_build_object('token', v_meta.token, 'label', v_meta.label);

  if v_disclosure = 'full' then
    v_entity_json := v_entity_json
      || jsonb_build_object('title', platform.entity_title(v_meta.token, p_id));

    if v_attrs.o_owner is not null then
      select jsonb_build_object(
               'user_id', pr.id,
               'display_name', nullif(pr.display_name, ''),
               'avatar_url', nullif(pr.avatar_url, ''),
               'creator_handle', case when coalesce(pr.creator_public, false)
                                      then nullif(pr.creator_handle, '') end
             )
        into v_owner_json
      from users.profiles pr
      where pr.id = v_attrs.o_owner;

      v_owner_json := coalesce(
        v_owner_json,
        jsonb_build_object('user_id', v_attrs.o_owner, 'display_name', null,
                           'avatar_url', null, 'creator_handle', null)
      );
    end if;

    if v_attrs.o_org is not null then
      select jsonb_build_object(
               'id', o.id, 'name', o.name,
               'is_personal', coalesce(o.is_personal, false),
               'viewer_is_member', v_uid is not null
                                   and iam.has_org_access_for(v_uid, o.id)
             )
        into v_org_json
      from iam.organizations o
      where o.id = v_attrs.o_org;
    end if;

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

  if v_uid is not null then
    select jsonb_build_object(
             'id', ar.id, 'status', ar.status,
             'level', ar.requested_level, 'created_at', ar.created_at,
             'decision_note', ar.decision_note
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

  v_can_request :=
        v_uid is not null
    and v_level = 'none'
    and not v_deleted
    and exists (select 1 from iam.access_request_recipients(v_meta.token, p_id))
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
