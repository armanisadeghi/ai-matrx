-- chair-step: lane V24-TAILS (chair ruling 2026-09-25, VERIFIER-24 item 10). Replaces public.access_denied_context's body (non-additive): a signed-in stranger to an object — no level, not its owner, not a member of the organization that holds it, no readable ancestor — receives the same answer as a missing id (exists false, disclosure none), so the no-access page cannot tell an unshared object from a random id and never names its owner or organization. Adds public.access_request_blind (one identical answer; files the existing access request and an in-app notice for a real object, nothing for a missing one) and declares the notice kind platform.access.request_received. Members of the object's organization, owners, and anyone with a level see exactly what they saw before. No data write beyond the event-type row.
-- lane: V24-TAILS
-- direct apply (owner 2026-09-24 ~17:30 PT). Chair ruling 2026-09-25 (V24-TAILS item 2): an unshared
-- object shows a stranger the SAME page as a missing id. public.access_denied_context answers a
-- signed-in stranger (no level, not the owner, not a member of the object's organization, no
-- readable ancestor) with the missing shape; public.access_request_blind files the existing access
-- request for a real object and an in-app notice for each recipient, and files nothing for a
-- missing id, with one identical answer either way. Not a fingerprinted body (public.*, no iam/custom
-- access kernel change).
-- based-on: public.access_denied_context(text, uuid) 9698c685d3873267a41e393ba03185edd0199f6d1787b75f4bfc5c50b2082215
-- INVERSE: migrations/inverse/v24tails_a_stranger_is_told_what_a_missing_id_is_told_down.sql

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

  -- THE STRANGER'S ANSWER IS THE MISSING ANSWER (lane V24-TAILS, chair ruling 2026-09-25,
  -- VERIFIER-24 item 10). A signed-in person with no level on this row, who does not own it, is
  -- not in the organization that holds it and reads no ancestor of it, is told exactly what a
  -- random id tells her: no existence, no owner, no organization, no deletion, no prior request.
  -- She may still ask (`public.access_request_blind`), which reaches the owner without naming them.
  -- A member of the object's organization keeps the full answer (the org admin's transfer offer,
  -- the roster's "no access" cells).
  if v_uid is not null
     and v_level = 'none'
     and not v_is_owner
     and v_ancestor_json is null
     and not (v_attrs.o_org is not null and iam.has_org_access_for(v_uid, v_attrs.o_org)) then
    return jsonb_build_object(
      'exists', false, 'deleted', false, 'level', 'none', 'disclosure', 'none',
      'entity', jsonb_build_object('token', v_meta.token, 'label', v_meta.label)
    );
  end if;

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

-- THE ASK THAT NAMES NOBODY. One answer whatever the id is: a real, unshared object files the
-- existing request (`access_request_create`, the owner's /settings/access-requests inbox) and puts
-- an in-app notice in each recipient's bell; a missing id, a deleted row, or an object the asker
-- can already read files nothing. The asker is never told which.
CREATE OR REPLACE FUNCTION public.access_request_blind(p_type text, p_id uuid, p_message text DEFAULT NULL::text, p_href text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'platform', 'iam', 'pg_temp'
AS $function$
declare
  v_uid      uuid := (select auth.uid());
  v_meta     record;
  v_attrs    record;
  v_deleted  boolean := false;
  v_res      jsonb;
  v_req      record;
  v_asker    text;
  v_title    text;
  v_note     text := nullif(btrim(coalesce(p_message, '')), '');
  v_rcpt     jsonb;
begin
  if v_uid is null then
    raise exception 'Sign in to ask for access.' using errcode = '42501';
  end if;

  begin
    select et.token, et.label, et.schema_name, et.table_name,
           coalesce(et.has_soft_delete, false) as has_soft_delete
      into v_meta
    from platform.entity_types et
    where et.token = p_type and coalesce(et.is_active, true)
    limit 1;

    if v_meta.token is not null and p_id is not null then
      select * into v_attrs
      from platform.entity_row_access_attrs(v_meta.schema_name, v_meta.table_name, p_id);

      if coalesce(v_attrs.o_found, false) and v_meta.has_soft_delete then
        execute format('select (deleted_at is not null) from %I.%I where id = $1',
                       v_meta.schema_name, v_meta.table_name)
          into v_deleted using p_id;
      end if;

      if coalesce(v_attrs.o_found, false)
         and not coalesce(v_deleted, false)
         and not iam.has_access(v_meta.token, p_id, 'viewer'::public.permission_level) then
        v_res := public.access_request_create(v_meta.token, p_id, 'viewer', v_note);

        if not coalesce((v_res ->> 'already')::boolean, false) then
          select ar.id, ar.organization_id into v_req
          from iam.access_requests ar
          where ar.id = (v_res ->> 'request_id')::uuid;

          select coalesce(nullif(pr.display_name, ''), u.email, 'Someone') into v_asker
          from auth.users u left join users.profiles pr on pr.id = u.id
          where u.id = v_uid;
          v_title := platform.entity_title(v_meta.token, p_id);

          for v_rcpt in select value from jsonb_array_elements(coalesce(v_res -> 'recipients', '[]'::jsonb)) loop
            insert into communication.notification
              (organization_id, event_key, recipient_user_id, recipient_kind, channel, payload,
               subject, body, target_kind, target_id, deep_link, dedupe_key, visibility, created_by)
            values
              (v_req.organization_id, 'platform.access.request_received',
               (v_rcpt ->> 'user_id')::uuid, 'user', 'in_app',
               jsonb_build_object('request_id', v_req.id, 'resource_type', v_meta.token,
                                  'resource_id', p_id, 'requested_by', v_uid, 'note', v_note,
                                  'href', p_href),
               format('%s asked for access to your %s', coalesce(v_asker, 'Someone'),
                      lower(coalesce(v_meta.label, 'item'))),
               format('%s asked to view your %s%s.%s Open your access requests to let them in or decline.',
                      coalesce(v_asker, 'Someone'), lower(coalesce(v_meta.label, 'item')),
                      case when v_title is null then '' else format(' "%s"', v_title) end,
                      case when v_note is null then '' else format(' Their note: "%s".', v_note) end),
               'access_request', v_req.id, '/settings/access-requests',
               format('access_request:%s:%s', v_req.id, v_rcpt ->> 'user_id') || ':in_app',
               'personal'::platform.visibility, v_uid)
            on conflict do nothing;
          end loop;
        end if;
      end if;
    end if;
  exception when others then
    -- The asker's answer never changes (a refusal would say the object exists); the failure is
    -- loud in the server log, with the id, so the owner's missing notice can be traced.
    raise warning 'access_request_blind: the ask about % % was not filed (% %).', p_type, p_id, sqlstate, sqlerrm;
  end;

  return jsonb_build_object('asked', true, 'says', 'If it exists, its owner has been asked.');
end;
$function$;


INSERT INTO platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
VALUES
  ('public', 'access_request_blind', 'p_type text, p_id uuid, p_message text, p_href text',
   ARRAY['text'::regtype, 'uuid'::regtype, 'text'::regtype, 'text'::regtype]::oid[],
   'SIGNED-IN door (authenticated only; anon and PUBLIC revoked). p_type must be an active platform.entity_types token; p_id is checked with platform.entity_row_access_attrs (the row must exist), the soft-delete column (a deleted row files nothing) and iam.has_access(p_type, p_id, viewer) (a caller who can already read it files nothing); the request itself is public.access_request_create as the caller. NULL p_type or p_id files nothing. The answer is identical in every case and names no owner.',
   'V24-TAILS v24tails_a_stranger_is_told_what_a_missing_id_is_told.sql', NULL, true, false);

GRANT EXECUTE ON FUNCTION public.access_request_blind(text, uuid, text, text) TO authenticated;

-- The notice's kind, declared so the bell and the settings know it (in-app only; it is never
-- an email to a stranger's guess).
INSERT INTO communication.notification_event_type
  (organization_id, event_key, label, description, enabled, default_channels, config, visibility)
SELECT '39c38960-d30c-4840-b0c1-c9960de95582', 'platform.access.request_received',
       'Someone asked for access to something of yours',
       'An access request filed through the no-access page (public.access_request_blind): the asker is not told who owns the object; the owner decides in /settings/access-requests.',
       true, '{"in_app": true}'::jsonb, '{}'::jsonb, 'internal'::platform.visibility
ON CONFLICT (event_key) DO UPDATE
   SET deleted_at = NULL, enabled = true, default_channels = EXCLUDED.default_channels,
       label = EXCLUDED.label, description = EXCLUDED.description, updated_at = now();
