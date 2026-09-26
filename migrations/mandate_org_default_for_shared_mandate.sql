-- based-on: mandate.guard_binding_containment() 30ed3e02845138b8217682f0ed5f32353182e70331694e8475aa1f37101b6d91
-- based-on: mandate._member_shared_org_ids(uuid, text, uuid) 1d12e442b5a123d2f4ee848877e970c86f5874eebddf558881c4a4a6a10abbb5
-- mandate_org_default_for_shared_mandate.sql
--
-- ORG DEFAULT FOR A SHARED MANDATE (Arman, 2026-09-25: "Org admins may set a mandate shared
-- with the org as the org's default" — yes).
--
-- Since SHARE-PEOPLE-ONLY (2026-09-23/25) a share names a PERSON; an organization grant exists
-- only as org AVAILABILITY. So `mandate.guard_binding_containment` — which allowed an org
-- binding on a mandate homed elsewhere only for an organization GRANT or a published mandate —
-- refused every org admin who had been handed a mandate by name: "the mandate is homed in
-- another organization". Now:
--
--   org binding on a mandate homed elsewhere is allowed also when the person writing it
--   (the request's user, else the row's updated_by / created_by — the server writes as its
--   operator and stamps the actor) is an OWNER or ADMIN of that organization AND can open the
--   mandate (iam.has_access_for … 'viewer': a share to them, their organization's
--   availability, or published).
--
-- A plain member cannot, and nobody can for a mandate that never reached them. Every existing
-- allow stays an allow; runnability of the Holder is unchanged.
--
-- `mandate._member_shared_org_ids` (the organizations a mandate reaches a person or an
-- organization seat through) now also counts an organization that ADOPTED it — a live org
-- binding — so the adopted mandate shows in that organization's own list and in its members'
-- Organizations tab. The list reads under RLS, so a member who cannot open it still does not
-- see it.
--
-- Proof (red before, green after): pnpm check:mandate-sharing-lanes

CREATE OR REPLACE FUNCTION mandate.guard_binding_containment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sys       uuid;
  v_home      uuid;
  v_key       text;
  v_system    boolean;
  v_runnable  boolean;
  v_holder    text;
  v_id        uuid;
  v_public    boolean;
  v_actor     uuid;
BEGIN
  SELECT so.organization_id INTO v_sys
  FROM iam.system_orgs so WHERE so.key = 'system';

  SELECT d.organization_id, d.mandate_key, d.id, (d.visibility = 'public')
    INTO v_home, v_key, v_id, v_public
  FROM mandate.definition d
  WHERE d.id = NEW.mandate_id;

  IF v_home IS NULL THEN
    RAISE EXCEPTION USING
      errcode = '23503',
      message = format('This binding names mandate %L, which does not exist.', NEW.mandate_id),
      hint    = 'Create the mandate definition before binding a holder to it.';
  END IF;

  v_system := (v_home = v_sys);
  -- Who is deciding: the signed-in request, else the actor the writer stamped on the row.
  v_actor  := coalesce((SELECT auth.uid()), NEW.updated_by, NEW.created_by);

  -- There is no 'global' rung (aidream 1041): the answer for everybody is the
  -- mandate's own default, and binding_no_live_global makes a live global row
  -- impossible. Only 'org' and 'user' bindings exist to contain.
  IF NEW.principal_type = 'org' THEN
    -- SHARE ≠ MOVE (2026-09-25): an organization the mandate is AVAILABLE to (an active
    -- iam.permissions organization grant), any organization when it is published, and — the
    -- org default for a shared mandate (2026-09-26) — an organization whose owner or admin
    -- is the one deciding and was handed the mandate, bind it at its own level without the
    -- mandate ever changing home.
    IF NOT v_system AND NEW.organization_id IS DISTINCT FROM v_home
       AND NOT coalesce(v_public, false)
       AND NOT EXISTS (
         SELECT 1 FROM iam.permissions p
          WHERE p.resource_type = 'mandate' AND p.resource_id = v_id
            AND p.granted_to_organization_id = NEW.organization_id
            AND p.status <> 'rejected'
            AND (p.expires_at IS NULL OR p.expires_at > now()))
       AND NOT (
         v_actor IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM iam.organization_member om
            WHERE om.organization_id = NEW.organization_id
              AND om.user_id = v_actor
              AND om.role IN ('owner'::org_role, 'admin'::org_role))
         AND iam.has_access_for(v_actor, 'mandate', v_id, 'viewer'::public.permission_level)) THEN
      RAISE EXCEPTION USING
        errcode = '23514',
        message = format(
          'Organization %L cannot bind mandate %L: the mandate is homed in another organization.',
          NEW.organization_id, v_key),
        detail  = format('The mandate''s home is %L; only that organization, an organization it is available to, an owner or admin of the organization who was given the mandate, or any organization when it is system-homed or published, may set an org binding.', v_home),
        hint    = 'Ask its owner to share it with you (the Share dialog on the mandate) — an owner or admin of your organization can then set it as the organization''s default — or duplicate it into your own organization and bind the copy.';
    END IF;

  ELSIF NEW.principal_type = 'user' THEN
    IF NEW.subject_user_id IS NULL THEN
      RAISE EXCEPTION USING
        errcode = '23502',
        message = 'A user binding must name the subject it decides for (subject_user_id is null).';
    END IF;
    -- SHARE ≠ MOVE: a person the mandate reaches — through a grant to them or to one of
    -- their organizations, or because it is published — binds it for themselves. Asked
    -- through the platform kernel, exactly as RLS asks it.
    IF NOT v_system AND NOT EXISTS (
      SELECT 1 FROM iam.organization_member om
      WHERE om.user_id = NEW.subject_user_id
        AND om.organization_id = v_home
    ) AND NOT iam.has_access_for(NEW.subject_user_id, 'mandate', v_id, 'viewer'::public.permission_level) THEN
      RAISE EXCEPTION USING
        errcode = '23514',
        message = format(
          'That person cannot be bound to mandate %L: they are not a member of the organization that owns it.',
          v_key),
        detail  = format('The mandate''s home is %L and subject %L is not a member of it.', v_home, NEW.subject_user_id),
        hint    = 'Ask its owner to share it with them or their organization, or bind them to a mandate they can see.';
    END IF;
  END IF;

  -- RUNNABILITY BY THE RUNG'S OWN PRINCIPAL. Only rows that DECIDE are judged:
  -- a disabled or soft-deleted binding decides nothing, so a row the platform
  -- turned off stays editable (a row you can never update again is a landmine).
  IF NEW.is_enabled AND NEW.deleted_at IS NULL THEN
    v_runnable := mandate.binding_holder_runnable(
      NEW.principal_type, NEW.organization_id, NEW.subject_user_id,
      NEW.holder_type, NEW.holder_id, NEW.holder_version_id);

    IF v_runnable IS FALSE THEN
      SELECT coalesce(a.name, NEW.holder_id::text) INTO v_holder
      FROM agent.definition a WHERE a.id = NEW.holder_id;

      IF NEW.principal_type = 'org' THEN
        RAISE EXCEPTION USING
          errcode = '23514',
          message = format(
            'Organization %L cannot bind %L to mandate %L: its members cannot open that Holder.',
            NEW.organization_id, coalesce(v_holder, NEW.holder_id::text), v_key),
          detail  = 'An org rung decides for EVERY member of the organization. A Holder only some members can open makes one binding answer two different agents for two members of the same organization — the rest silently fall to the rung below.',
          hint    = 'Share the agent with this organization (or make it a system agent), then bind it — or bind an agent the organization already has.';
      ELSE
        RAISE EXCEPTION USING
          errcode = '23514',
          message = format(
            'That person cannot be bound to %L on mandate %L: they cannot open that Holder.',
            coalesce(v_holder, NEW.holder_id::text), v_key),
          detail  = 'A user rung decides for that person, so a Holder they cannot open would be dropped on every run and the rung below would answer instead.',
          hint    = 'Share the agent with them, or bind an agent they already have.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION mandate._member_shared_org_ids(p_id uuid, p_level text, p_org_id uuid)
 RETURNS uuid[]
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select coalesce(array_agg(distinct x.org_id), '{}'::uuid[])
    from (
      -- available to the organization (an organization grant)
      select p.granted_to_organization_id as org_id
        from iam.permissions p
       where p.resource_type = 'mandate'
         and p.resource_id = p_id
         and p.granted_to_organization_id is not null
         and p.status <> 'rejected'
         and (p.expires_at is null or p.expires_at > now())
      union all
      -- adopted by the organization: a live org binding (its owner or admin set it as the
      -- organization's default — mandate_org_default_for_shared_mandate.sql)
      select b.organization_id
        from mandate.binding b
       where b.mandate_id = p_id
         and b.principal_type = 'org'
         and b.deleted_at is null
         and b.is_enabled
    ) x
   where (case when p_level = 'organization' then x.org_id = p_org_id
               else x.org_id in (select iam.my_orgs()) end)
$function$;
