-- sharing_token_unification.sql
-- ---------------------------------------------------------------------------
-- Unify the sharing-grant token with the access-model token (steps 1-4).
--
-- THE BUG (proven): grants are stored under the table-name token (notes, agx_agent,
-- cx_conversation) while iam.has_access passes the entity token (note, agent,
-- conversation). has_permission matched resource_type literally, so a grant was
-- silently ignored the moment a table moved onto has_access. The sweep itself
-- introduced it (legacy RLS used has_permission(table_name) — self-consistent;
-- has_access uses the entity token).
--
-- THE FIX (structural — cannot resurface):
--  1. has_permission becomes TOKEN-AGNOSTIC: it resolves the passed token through
--     shareable_resource_registry and matches grants stored under EITHER the
--     canonical resource_type OR the table_name. So no policy, RPC, or grant can
--     ever again be "the wrong form" — every form resolves to the same grant.
--  2. The one hand-written has_access policy on the wrong token is fixed
--     (cx_conv_select: 'cx_conversation' -> 'conversation'); has_access is strict
--     on entity_types.token, so only the literal can be wrong, and apply_rls
--     always emits the right one.
--  3. Registry resource_type aligned to the entity token (canonical == entity token):
--     cx_conversation -> conversation, transcripts -> transcript.
--  4. permissions.resource_type validation accepts either registered form.
--  5. Guard: shareable_resource_registry.resource_type MUST equal entity_types.token
--     when the entity is access-governed — so the two registries can never drift.
--
-- Physical re-key of existing grant rows to the entity token + share-RPC token
-- cleanup is a SEPARATE, now-safe follow-up (normalization makes the stored form
-- irrelevant to correctness).
-- Idempotent.
-- ---------------------------------------------------------------------------

-- 3. align registry resource_type to the entity token (canonical == entity token)
UPDATE public.shareable_resource_registry SET resource_type = 'conversation'
 WHERE resource_type = 'cx_conversation' AND table_name = 'cx_conversation';
UPDATE public.shareable_resource_registry SET resource_type = 'transcript'
 WHERE resource_type = 'transcripts' AND table_name = 'transcripts';

-- 1. token-agnostic has_permission: resolve the token, match grants under any registered form
CREATE OR REPLACE FUNCTION public.has_permission(
  p_resource_type text, p_resource_id uuid, p_required_permission permission_level)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  with forms as (
    -- every registered spelling of this resource (canonical token + table_name);
    -- falls back to the raw input if it isn't registered
    select coalesce(
      (select array[r.resource_type, r.table_name]
         from shareable_resource_registry r
        where r.is_active
          and (r.resource_type = p_resource_type or r.table_name = p_resource_type)
        limit 1),
      array[p_resource_type]
    ) as spellings
  )
  select exists (
    select 1
    from permissions p, forms f
    where p.resource_type = any(f.spellings)
      and p.resource_id = p_resource_id
      and coalesce(p.status, 'active') <> 'rejected'
      and (p.expires_at is null or p.expires_at > now())
      and (
        p.granted_to_user_id = auth.uid()
        or (
          p.granted_to_organization_id is not null
          and p.granted_to_organization_id in (
            select om.organization_id from organization_members om where om.user_id = auth.uid()
          )
        )
      )
      and case p_required_permission
        when 'viewer' then p.permission_level in ('viewer', 'editor', 'admin')
        when 'editor' then p.permission_level in ('editor', 'admin')
        when 'admin'  then p.permission_level = 'admin'
      end
    limit 1
  );
$function$;

-- 2. fix the one hand-written has_access policy carrying the wrong token
DROP POLICY IF EXISTS cx_conv_select ON public.cx_conversation;
CREATE POLICY cx_conv_select ON public.cx_conversation FOR SELECT TO authenticated
USING (
  deleted_at IS NULL AND (
    created_by = (select auth.uid())
    OR iam.has_access('conversation', id, 'viewer')
    OR project_id IN (SELECT cid.cid FROM user_container_ids('project'::text) cid(cid))
  )
);

-- 4. permissions.resource_type validation: accept either registered form
CREATE OR REPLACE FUNCTION public.permissions_validate_resource_type()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.shareable_resource_registry r
    WHERE r.is_active = true
      AND (r.resource_type = NEW.resource_type OR r.table_name = NEW.resource_type)
  ) THEN
    RAISE EXCEPTION 'permissions.resource_type=% is not registered (canonical token or table_name). See features/sharing/FEATURE.md.', NEW.resource_type
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$function$;

-- 5. structural guard: registry resource_type MUST equal entity_types.token when governed
CREATE OR REPLACE FUNCTION public.shareable_registry_token_guard()
RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE v_token text;
BEGIN
  SELECT e.token INTO v_token
  FROM platform.entity_types e
  WHERE e.schema_name = 'public' AND e.table_name = NEW.table_name;
  IF v_token IS NOT NULL AND v_token <> NEW.resource_type THEN
    RAISE EXCEPTION 'shareable_resource_registry.resource_type (%) must equal entity_types.token (%) for governed table %. One token across both registries.',
      NEW.resource_type, v_token, NEW.table_name USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS shareable_registry_token_guard ON public.shareable_resource_registry;
CREATE TRIGGER shareable_registry_token_guard
  BEFORE INSERT OR UPDATE ON public.shareable_resource_registry
  FOR EACH ROW EXECUTE FUNCTION public.shareable_registry_token_guard();
