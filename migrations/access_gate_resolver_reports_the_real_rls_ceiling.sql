-- access_gate_resolver_reports_the_real_rls_ceiling
-- based-on: public.access_denied_context(text, uuid) 0049bcc392d06cad33e252afbbfe6764b36cda84fd704fb45fa33ef2423ad3f0
--
-- THE GATE TOLD A SUPER ADMIN "YOU DO HAVE ACCESS" TO A PRIVATE CONVERSATION
-- THEIR OWN READ HAD JUST BEEN REFUSED.
--
-- Live 2026-09-15: admin@admin.com opening /chat/48ace2e1-… (a PERSONAL
-- conversation owned by another account) saw "We couldn't load this
-- conversation — You do have access to it — something went wrong on our side."
-- The SSR read of chat.conversation under RLS returned zero rows (its policies
-- are owner / public / grants only — no platform-staff lane), while this
-- resolver answered `level: 'admin'`, because `access_gate_platform_admin_truth`
-- promoted EVERY platform admin on the belief that `platform_admin_all` sits
-- unconditionally on every canonical table. Census on the live DB the same day:
-- 332 of 812 active entity types carry no `platform_admin_all` at all, and 217
-- of the 609 that do admit only `visibility >= 'internal'` rows. Every one of
-- those told the same lie to a platform admin about a row RLS refuses them.
--
-- RULING (not a question): a super admin has no standing read of a person's
-- private data — the audited emergency door is the only way in
-- (common-docs/systems/platform/access/DECISIONS.md, 2026-09-12 row "Admin on
-- everything the organization owns — a person's private data was never in
-- it"; STATE.md: is_super_admin "does not grant blanket read of ordinary user
-- rows"). So the gate must refuse honestly, and the reporter must state the
-- ceiling that actually exists for THIS row.
--
-- THE FIX: the platform-admin promotion now fires only when the row passes the
-- table's live SELECT policies for `authenticated`, evaluated with the caller's
-- JWT claims. `iam.has_access` (the authorizer) is untouched; RLS is untouched;
-- nothing is granted. The 2026-09-11 case (an internal scheduler task a
-- platform admin really can read) still reports `admin`.
--
-- Guard: features/access-gate/service/accessDeniedContext.rlsCeiling.test.ts
-- (executes THIS file in a rolled-back transaction and compares the level with
-- a real RLS read of four live rows; red on the previous body).

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
  v_permissive     text;
  v_restrictive    text;
  v_rls_readable   boolean := false;
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

    -- THE RLS CEILING IS PART OF THE ANSWER — THE REAL ONE, FOR THIS ROW.
    -- `iam.has_access` walks grants and containment and has no platform-staff
    -- lane. The platform-staff lane lives only in RLS, and it is NOT uniform:
    -- private tokens (a `conversation`) carry none at all (the privacy wall),
    -- and many `platform_admin_all` policies admit only `visibility >=
    -- 'internal'` rows. So a platform admin is reported `admin` only when THIS
    -- row passes the table's live SELECT policies for `authenticated` —
    -- evaluated here with the caller's own JWT claims, the same way
    -- `public.std_select_count_as` evaluates a policy. Only the SENTENCE
    -- changes: nothing here grants anything. A policy that cannot be evaluated
    -- raises; the client then renders an honest resolver error, never a guess.
    if v_level = 'none' and public.is_platform_admin_for(v_uid) then
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
             or 'authenticated'::regrole::oid = any (po.polroles));

      if v_permissive is not null then
        execute format(
          'select exists (select 1 from %I.%I where id = $1 and (%s) and (%s))',
          v_meta.schema_name, v_meta.table_name,
          v_permissive, coalesce(v_restrictive, 'true'))
          into v_rls_readable using p_id;
      end if;

      if v_rls_readable then
        v_level := 'admin';
      end if;
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
