-- access_request_decide_container_grants_membership.sql
--
-- The decide half of Arman's 2026-08-30 access-gate ruling.
--
-- Companion to access_request_recipients_container_and_component_lanes.sql.
-- With recipients fixed, a no-standing user CAN finally ask an organization's
-- admin for access -- and the admin's "Grant" button then died on a CHECK:
--
--   permissions.resource_type=organization is not a registered sharing TOKEN.
--
-- That constraint is not in the way; it is the platform telling us the answer.
-- `platform.shareable_resource_registry` holds 121 tokens and `organization` is
-- deliberately NOT one of them, while `project` and `scope` are. You do not get
-- a permission row on a company -- YOU JOIN IT. Writing an iam.permissions row
-- for an organization would have created a person who can open the org but does
-- not appear on its member list: an invisible member, which is a worse defect
-- than the one being fixed.
--
-- So a granted access request against a MEMBERSHIP CONTAINER creates a
-- MEMBERSHIP, through the canonical writer `public.mbr_add` -- never a
-- hand-rolled INSERT. mbr_add carries the rules this path must not restate:
-- the container advisory lock, iam._container_authz (personal orgs immutable,
-- admins may only seat members/admins), and its own idempotence.
--
-- LEVEL -> ROLE. An organization has three roles (owner / admin / member), not
-- the four permission levels, so: admin -> 'admin', everything else -> 'member'.
-- *** An access request can never mint an OWNER. *** The requester asked to be
-- let in; nobody asked to hand over the company.
--
-- SCOPE, measured live 2026-08-30: exactly ONE registered token is a membership
-- container and not shareable -- `organization`. `project` and `scope` are both
-- shareable and keep the iam.permissions path they use today, byte-identical.
-- The third arm refuses honestly instead of letting a CHECK violation reach a
-- user as a raw Postgres error (THE LAW: never show anyone an RLS error, a
-- PostgREST code, a schema name, a token, or a bare uuid).
--
-- Patched by exact-substring replacement so the rest of the function is provably
-- unchanged. Idempotent. Safe to re-run.

begin;

do $do$
declare
  v_def text;
  v_old text :=
'    v_level := coalesce(nullif(p_level, ''''), v_req.requested_level)::public.permission_level;
    insert into iam.permissions
      (resource_type, resource_id, granted_to_user_id, permission_level,
       status, created_by)
    values
      (v_req.resource_type, v_req.resource_id, v_req.created_by, v_level,
       ''active'', v_uid)
    on conflict (resource_type, resource_id, granted_to_user_id)
      do update set permission_level = excluded.permission_level,
                    status = ''active'',
                    expires_at = null;';
  v_new text :=
'    v_level := coalesce(nullif(p_level, ''''), v_req.requested_level)::public.permission_level;

    -- A shareable resource takes an ordinary grant; a membership container takes
    -- a membership. See access_request_decide_container_grants_membership.sql.
    if exists (select 1 from platform.shareable_resource_registry sr
                where sr.resource_type = v_req.resource_type) then
      insert into iam.permissions
        (resource_type, resource_id, granted_to_user_id, permission_level,
         status, created_by)
      values
        (v_req.resource_type, v_req.resource_id, v_req.created_by, v_level,
         ''active'', v_uid)
      on conflict (resource_type, resource_id, granted_to_user_id)
        do update set permission_level = excluded.permission_level,
                      status = ''active'',
                      expires_at = null;
    elsif exists (select 1 from iam.memberships m
                   where m.container_type = v_req.resource_type
                     and m.deleted_at is null) then
      perform public.mbr_add(
        v_req.resource_type,
        v_req.resource_id,
        v_req.created_by,
        (select c.resource_org_id
           from iam._container_authz(v_req.resource_type, v_req.resource_id, v_uid) c),
        case when v_level = ''admin''::public.permission_level then ''admin''
             else ''member'' end,
        ''active'',
        jsonb_build_object(''grant_source'', ''access_request'',
                           ''request_id'', p_request_id));
    else
      raise exception ''Access to this % cannot be granted from a request.'',
        lower(coalesce((select label from platform.entity_types
                         where token = v_req.resource_type), ''item''))
        using errcode = ''42501'';
    end if;';
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'access_request_decide'
    and pg_get_function_identity_arguments(p.oid)
        = 'p_request_id uuid, p_decision text, p_level text, p_note text';

  if v_def is null then
    raise exception 'public.access_request_decide(uuid,text,text,text) not found';
  end if;

  if position('shareable_resource_registry' in v_def) > 0 then
    raise notice 'access_request_decide: container-membership lane already present - skipping';
    return;
  end if;

  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception
      'access_request_decide: expected exactly one grant block to patch, found %',
      (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  end if;

  execute replace(v_def, v_old, v_new);
end;
$do$;

commit;
