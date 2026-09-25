-- based-on: mandate.guard_binding_containment() 6866fc5064854a77fc7aba18c39ffca003ba3e98a15b18ba217d6401528d758f
-- mandate_binding_follows_sharing.sql
--
-- SHARE ≠ MOVE, the binding half (2026-09-25). mandate.guard_binding_containment refused an
-- org binding on a mandate homed in another organization and a user binding for anybody
-- outside the home organization — so the only way to let another organization USE a
-- person's mandate was to MOVE it there. Now a share is enough:
--   * org binding  — allowed also when the mandate is granted to that organization
--                    (iam.permissions) or published (visibility public);
--   * user binding — allowed also when the subject can view the mandate through the platform
--                    kernel (iam.has_access_for … 'viewer': a grant to them or their
--                    organization, or published).
-- Every existing allow stays an allow and every refusal of an UNSHARED mandate stays a
-- refusal (global bindings untouched; runnability unchanged).
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

  IF NEW.principal_type = 'global' THEN
    IF NOT v_system THEN
      RAISE EXCEPTION USING
        errcode = '23514',
        message = format(
          'Mandate %L is homed in a single organization, so it cannot carry a GLOBAL binding.',
          v_key),
        detail  = format(
          'A global rung decides for every user in every organization; this mandate''s home is %L, not the system organization %L.',
          v_home, v_sys),
        hint    = 'Bind it for that organization instead (principal_type=''org''), or re-home the mandate in the system organization if it really is a platform mandate.';
    END IF;

  ELSIF NEW.principal_type = 'org' THEN
    -- SHARE ≠ MOVE (2026-09-25): an organization the mandate was SHARED with (an active
    -- iam.permissions grant — what ShareModal writes), or any organization when it is
    -- published, binds it at its own level without the mandate ever changing home.
    IF NOT v_system AND NEW.organization_id IS DISTINCT FROM v_home
       AND NOT coalesce(v_public, false)
       AND NOT EXISTS (
         SELECT 1 FROM iam.permissions p
          WHERE p.resource_type = 'mandate' AND p.resource_id = v_id
            AND p.granted_to_organization_id = NEW.organization_id
            AND p.status <> 'rejected'
            AND (p.expires_at IS NULL OR p.expires_at > now())) THEN
      RAISE EXCEPTION USING
        errcode = '23514',
        message = format(
          'Organization %L cannot bind mandate %L: the mandate is homed in another organization.',
          NEW.organization_id, v_key),
        detail  = format('The mandate''s home is %L; only that organization, an organization it was shared with, or any organization when it is system-homed or published, may set an org binding.', v_home),
        hint    = 'Ask its owner to share it with your organization (the Share dialog on the mandate), or duplicate it into your own organization and bind the copy.';
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

      IF NEW.principal_type = 'global' THEN
        RAISE EXCEPTION USING
          errcode = '23514',
          message = format(
            'A global binding on mandate %L must name a platform agent, and %L is not one.',
            v_key, coalesce(v_holder, NEW.holder_id::text)),
          detail  = 'A global rung decides for every user in every organization, so only a live system agent (agent_type=''builtin'') can hold it.',
          hint    = 'Promote the agent first (agx_duplicate_agent with p_as_system) and bind its system twin, or set this at the organization level instead.';
      ELSIF NEW.principal_type = 'org' THEN
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
