-- ground-standing-ok: c — SIGNUP-DOOR, 2026-09-22. Clause (c) is CORRECT here and it is the
-- point of the file. `public.create_personal_organization` is a trigger body that NO trigger
-- runs — being attached to nothing is exactly the defect DEFAULT-ORG-3 closed ("an orphaned
-- second signup door"), so its inverse necessarily restores an inert body. The red twin beside
-- it does not claim the body FIRES; it asserts that the creation shape is back in the live
-- catalogue while nothing runs it, which is what `pg_get_functiondef` answers and what the
-- no-default-organization census reads. SIGNUP-DOOR closed the last sibling of this class,
-- `public.handle_new_dm_user`, the same way and its inverse carries the same line.
-- DEFAULT-ORG-3 inverse -- puts the three doors BACK to answering "which organization?"
-- with the caller's own personal workspace.
--
-- Running this restores public.cmt_add, public.create_personal_organization and
-- public.creator_claim_handle exactly as they stood on the main database on 2026-09-22
-- before migrations/campaign/dorg3_three_doors_name_the_organization_they_act_in.sql:
--   * cmt_add falls back to public.ensure_personal_organization(auth.uid()) for every entity
--     type that is not a task, and checks the entity/organization match for tasks only, so a
--     member of one organization can file a comment naming their own organization onto
--     another organization's record;
--   * create_personal_organization comes back as a live-looking second signup provisioner
--     attached to nothing;
--   * creator_claim_handle invents a workspace for a user whose signup provisioning failed.
-- That is the shape `pnpm check:no-default-organization-sql` names (rule 7) and the shape
-- CI's ORGANIZATION CONTEXT job goes red on, so this file re-breaks a guard on purpose.
--
-- It also removes the three-argument creator_claim_handle overload, the two platform
-- primitives and all three door rows, so nothing is left half-moved.
--
-- 🚨 ORDER. Run migrations/inverse/dorg3_the_creator_handle_has_one_signature.inverse.sql
-- FIRST if you are undoing the whole lane: that one puts the two-argument
-- public.creator_claim_handle back, and this file then restores its original body and drops
-- the three-argument one. Running this file alone leaves the three-argument function dropped
-- and no two-argument function at all, which is worse than either state.
--
-- Only run it to undo a change that broke something worse, and say what.

set local lock_timeout = '2s';

CREATE OR REPLACE FUNCTION public.cmt_add(p_entity_type text, p_entity_id uuid, p_body text, p_parent_id uuid DEFAULT NULL::uuid, p_org_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_org uuid := p_org_id; v_id uuid;
begin
  if v_org is null then
    if p_entity_type = 'task' then select organization_id into v_org from workspace.tasks where id = p_entity_id; end if;
  end if;
  if v_org is null then v_org := public.ensure_personal_organization(auth.uid()); end if;
  if not iam.has_org_access(v_org) then
    raise exception 'cmt_add: no org access (org=%, %/%)', v_org, p_entity_type, p_entity_id using errcode = '42501';
  end if;
  if p_entity_type = 'task' and not exists (
       select 1 from workspace.tasks t where t.id = p_entity_id and t.organization_id = v_org) then
    raise exception 'cmt_add: entity not found in this organization' using errcode = '22023';
  end if;
  if p_parent_id is not null and not exists (
       select 1 from platform.comments parent
        where parent.id = p_parent_id and parent.deleted_at is null
          and parent.entity_type = p_entity_type and parent.entity_id = p_entity_id
          and parent.organization_id = v_org) then
    raise exception 'cmt_add: parent comment not found' using errcode = '22023';
  end if;
  insert into platform.comments (organization_id, entity_type, entity_id, parent_id, body, created_by, updated_by)
  values (v_org, p_entity_type, p_entity_id, p_parent_id, p_body, (select auth.uid()), (select auth.uid()))
  returning id into v_id;
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.create_personal_organization()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    PERFORM public.ensure_personal_organization(NEW.id);
    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        BEGIN
            INSERT INTO iam.system_personal_org_failures
                (user_id, email, error_code, error_message, organization_id)
            VALUES
                (NEW.id, NEW.email, SQLSTATE, SQLERRM, public.system_org_id('system'));
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
        RAISE WARNING 'create_personal_organization failed for user %: % (%)',
            NEW.id, SQLERRM, SQLSTATE;
        RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.creator_claim_handle(p_handle text, p_display_name text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'users'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_handle text := public.creator_normalize_handle(p_handle);
  v_taken uuid;
  v_org uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select p.id into v_taken
  from users.profiles p
  where lower(p.creator_handle) = v_handle and p.deleted_at is null and p.id <> v_uid
  limit 1;
  if v_taken is not null then
    raise exception 'That handle is already taken' using errcode = '23505';
  end if;

  select organization_id into v_org from users.profiles where id = v_uid;
  if v_org is null then
    v_org := public.ensure_personal_organization(v_uid);
  end if;

  insert into users.profiles (id, organization_id, display_name, creator_handle)
  values (v_uid, v_org, coalesce(nullif(btrim(p_display_name), ''), 'Creator'), v_handle)
  on conflict (id) do update set
    creator_handle = v_handle,
    display_name = coalesce(nullif(btrim(p_display_name), ''), users.profiles.display_name),
    updated_at = now();

  return public.creator_get_mine();
end;
$function$;

drop function if exists public.creator_claim_handle(text, text, uuid);
drop function if exists platform.entity_organization_id(text, uuid);
drop function if exists platform.entity_is_org_scoped(text);

delete from platform.client_callable_door
 where (schema_name = 'platform' and function_name = 'entity_is_org_scoped'
        and identity_argtypes = array['text'::regtype]::oid[])
    or (schema_name = 'platform' and function_name = 'entity_organization_id'
        and identity_argtypes = array['text'::regtype, 'uuid'::regtype]::oid[])
    or (schema_name = 'public' and function_name = 'creator_claim_handle'
        and identity_argtypes = array['text'::regtype, 'text'::regtype, 'uuid'::regtype]::oid[]);
