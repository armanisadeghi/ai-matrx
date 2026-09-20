-- access_gate_resolver_every_level_is_a_real_read
-- based-on: public.access_denied_context(text, uuid) 8b931540f5cc3daa1b4d8d4e00996d60ae68b324d50b57109eac646306d9313b
--
-- THE RESOLVER NEVER REPORTS A LEVEL THE CALLER CANNOT ACTUALLY READ — AT ANY
-- LEVEL, THROUGH ANY PATH.
--
-- access_gate_resolver_reports_the_real_rls_ceiling.sql (2026-09-15) made the
-- platform-admin promotion answer to the row's live SELECT policies. The other
-- positive paths still did not: every `iam.has_access` answer (grant, share,
-- ownership, containment) went straight to the screen. Live the same day:
-- admin@admin.com opening credential attachment 98a6d21a-fb8a-48a0-a21c-2385ccfb7b14
-- (its own `created_by`) was answered `level: 'admin'`, while its real read
-- returned zero rows — `credential_attachments_parent_read` also requires the
-- parent `users.credential_items` row to be live, and that item was
-- soft-deleted on 2026-08-11. So the gate said "You do have access… something
-- went wrong on our side" about a row RLS refuses.
--
-- THE FIX: one check for every positive level. Each path now only proposes a
-- level (`iam.has_access` ladder; the platform-admin candidate; the anonymous
-- `view` on a public row); the answer survives only when THIS row passes the
-- table's live SELECT policies for the caller's role (`authenticated`, or
-- `anon` without a session), evaluated with the caller's JWT claims, AND the
-- role holds the SELECT privilege on `id` that a real read needs. Otherwise the level is
-- `none` and the gate renders its honest denial (`can_request` follows, as it
-- always has, from `level = 'none'`). `iam.has_access` is untouched; RLS is
-- untouched; nothing is granted — only the reported level can fall.
--
-- KNOWN LIMIT (measured, not hidden): the policy expressions are evaluated
-- inside this SECURITY DEFINER body, whose owner bypasses RLS, so a policy
-- sub-select on ANOTHER RLS table is judged without that table's own RLS.
-- A real read would apply it. Postgres forbids changing role inside a
-- SECURITY DEFINER function, so no body of this function can do better.
--
-- Hardening: `pg_temp` is pinned LAST on the search_path, so a caller's
-- temporary objects can never shadow a name this definer body resolves.
--
-- Guard: features/access-gate/service/accessDeniedContext.rlsCeiling.test.ts
-- (executes THIS file in a rolled-back transaction and compares each level with
-- a real read of the same live row under the same claims).

CREATE OR REPLACE FUNCTION public.access_denied_context(p_type text, p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'platform', 'iam', 'pg_temp'
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
  v_permissive     text;
  v_restrictive    text;
  v_rls_readable   boolean := false;
  v_read_role      text;
  v_row_security   boolean := false;
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

    -- `iam.has_access` has no platform-staff lane; that lane lives only in RLS
    -- and is NOT uniform (private tokens carry none; many `platform_admin_all`
    -- policies admit only `visibility >= 'internal'`). So a platform admin with
    -- no grant is only a CANDIDATE for `admin` — the real-read check below
    -- settles it, exactly as it settles every other level.
    if v_level = 'none' and public.is_platform_admin_for(v_uid) then
      v_level := 'admin';
    end if;

    v_is_owner := (v_attrs.o_owner is not null and v_attrs.o_owner = v_uid);
  else
    v_level := 'view';
  end if;

  -- EVERY LEVEL IS A REAL READ — THE ONE CHECK, FOR EVERY PATH ABOVE.
  -- A level survives only when the caller's role could actually read THIS row:
  -- the role holds SELECT on the `id` column, and the row passes the table's live
  -- SELECT policies for that role — evaluated here with the caller's own JWT
  -- claims, the same way `public.std_select_count_as` evaluates a policy. A
  -- table without row security needs only the privilege. Only the SENTENCE
  -- changes: nothing here grants anything. A policy that cannot be evaluated
  -- raises; the client then renders an honest resolver error, never a guess.
  if v_level <> 'none' then
    v_read_role := case when v_uid is null then 'anon' else 'authenticated' end;
    v_rls_readable := false;

    select c.relrowsecurity
      into v_row_security
    from pg_class c
    where c.oid = format('%I.%I', v_meta.schema_name, v_meta.table_name)::regclass;

    -- The privilege the real read needs: SELECT on `id`. Governed tables grant
    -- column by column, so a TABLE-level check would refuse rows the caller
    -- really reads (files.files, docproc.processed_documents, 2026-09-15).
    if has_column_privilege(v_read_role,
                            format('%I.%I', v_meta.schema_name, v_meta.table_name),
                            'id', 'select') then
      if not v_row_security then
        v_rls_readable := true;
      else
        select string_agg('(' || pg_get_expr(po.polqual, po.polrelid) || ')', ' or ')
                 filter (where po.polpermissive),
               string_agg('(' || pg_get_expr(po.polqual, po.polrelid) || ')', ' and ')
                 filter (where not po.polpermissive)
          into v_permissive, v_restrictive
        from pg_policy po
        where po.polrelid = format('%I.%I', v_meta.schema_name, v_meta.table_name)::regclass
          and po.polcmd in ('r', '*')
          and po.polqual is not null
          and (0::oid = any (po.polroles)
               or v_read_role::regrole::oid = any (po.polroles));

        if v_permissive is not null then
          execute format(
            'select exists (select 1 from %I.%I where id = $1 and (%s) and (%s))',
            v_meta.schema_name, v_meta.table_name,
            v_permissive, coalesce(v_restrictive, 'true'))
            into v_rls_readable using p_id;
        end if;
      end if;
    end if;

    if not v_rls_readable then
      v_level := 'none';
    end if;
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
