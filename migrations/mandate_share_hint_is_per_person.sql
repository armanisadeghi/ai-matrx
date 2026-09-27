-- mandate_share_hint_is_per_person.sql
--
-- SHARING IS PER PERSON (access-ladder § Sharing; access-belongs-to-the-person).
-- aidream/services/mandates/bindings.py's Python-side refusal sentences were
-- already fixed (commit 2b4c04fb75) to stop telling anyone to "share it with
-- this organization" — a remedy that does not exist, since a share always
-- names a person, never an organization. These two trigger functions
-- (mandate.guard_binding_containment, mandate.guard_definition_holder) still
-- carried the old wording in three places: two `hint` fields and one
-- RAISE WARNING remedy sentence. This migration changes ONLY that text —
-- every other byte of both function bodies is unchanged.

-- based-on: mandate.guard_binding_containment() 20ff524c603f87c71302615ccc6cf62570e8913c74bf4b7b830fe91a361ccf90
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
          hint    = 'Share it with each member who cannot open it, then bind it — or bind an agent the organization already has.';
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
$function$
;

-- based-on: mandate.guard_definition_holder() 5a633ae4e4b79ec49aa9127f6e6caa2076f10a5852da53eeae576993a84a9635
CREATE OR REPLACE FUNCTION mandate.guard_definition_holder()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_shortcut  boolean;
  v_runnable  boolean;
  v_holder    text;
  v_org       text;
  v_sys       uuid;
  v_jwt_role  text;
BEGIN
  -- Only a row whose bottom rung actually MOVED is judged. The trigger is
  -- declared `UPDATE OF` the three columns, and this is the second half of the
  -- same promise: `sync_declared_mandates` rewrites definition rows on every
  -- boot (label, goal, contract, home) and must never trip a holder guard for
  -- touching none of them.
  IF NEW.default_holder_type      IS NOT DISTINCT FROM OLD.default_holder_type
     AND NEW.default_holder_id    IS NOT DISTINCT FROM OLD.default_holder_id
     AND NEW.default_holder_version_id IS NOT DISTINCT FROM OLD.default_holder_version_id
  THEN
    RETURN NEW;
  END IF;

  v_shortcut := coalesce(NEW.metadata ? 'shortcut_compat', false);

  -- ── (1) THE CLIENT LANE HAS NO ROAD HERE ────────────────────────────────
  -- 🚨 THE LANE IS READ FROM THE JWT, NOT FROM `current_user`. This function is
  -- SECURITY DEFINER, and inside a SECURITY DEFINER function `current_user` is
  -- the FUNCTION'S OWNER — measured: the guard shipped with
  -- `current_user = 'authenticated'` and a plain member's PostgREST PATCH sailed
  -- straight through it, HTTP 200, row changed. (`iam._guard_governance_columns`
  -- uses that test correctly because it is SECURITY INVOKER.)
  --
  -- `request.jwt.claims ->> 'role'` is a GUC: it survives the definer switch and
  -- says what the REQUEST is, not what the function is. PostgREST sets it for
  -- every signed-in call ('authenticated'), sets 'service_role' for the server
  -- key, and aidream's own pool sets no claims at all. aidream's acting_as_user
  -- posture DOES land here, on purpose — an agent is exactly its user.
  BEGIN
    v_jwt_role := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
  EXCEPTION WHEN others THEN
    -- A claims GUC that is not JSON is not a licence to write: an unreadable
    -- lane is treated as the client lane, which is the safe direction.
    v_jwt_role := 'authenticated';
  END;

  IF coalesce(v_jwt_role, '') = 'authenticated' AND NOT v_shortcut THEN
    RAISE EXCEPTION USING
      errcode = '42501',
      message = format(
        'The default holder of mandate %L cannot be changed from here.',
        NEW.mandate_key),
      detail  = 'This is the job''s SYSTEM rung — the floor every member of its home organization falls to when no other binding answers. It decides for people other than you, so it is set through the server door that checks who is asking and whether the holder can actually be run, never by writing the row.',
      hint    = 'Use PUT /mandates/{mandate_key}/default-holder — a platform administrator may set it on a system-homed job, and an owner or administrator of the home organization may set it on that organization''s own job. To change only what YOU run, set a personal binding instead.';
  END IF;

  -- ── (2) CONTAINMENT — the SAME predicate the door and the ladder ask ─────
  -- `principal_type='org'` with the mandate's HOME organization is exactly what
  -- `mandate._rungs` does for the system rung (0593), so this backstop and the
  -- sanctioned door cannot answer differently. The door asks first and turns
  -- `false` into a 409 with the reason; reaching this raise means something
  -- wrote around the door.
  IF NEW.is_enabled AND NEW.deleted_at IS NULL AND NEW.default_holder_id IS NOT NULL THEN
    v_runnable := mandate.binding_holder_runnable(
      'org', NEW.organization_id, NULL,
      NEW.default_holder_type, NEW.default_holder_id, NEW.default_holder_version_id);

    IF v_runnable IS FALSE THEN
      -- 🚨 A NAME, OR A PHRASE — NEVER AN ID (FIX-R6/F2). Both fallbacks are
      -- words a reader can act on. An unreadable agent row and an unreadable
      -- organization row are the same situation as far as the sentence is
      -- concerned: the refusal still has to make sense.
      SELECT a.name INTO v_holder
      FROM agent.definition a WHERE a.id = NEW.default_holder_id;
      v_holder := coalesce(nullif(btrim(coalesce(v_holder, '')), ''), 'the agent you chose');

      SELECT o.name INTO v_org
      FROM iam.organizations o WHERE o.id = NEW.organization_id;
      v_org := coalesce(nullif(btrim(coalesce(v_org, '')), ''), 'this organization');

      SELECT so.organization_id INTO v_sys FROM iam.system_orgs so WHERE so.key = 'system';

      IF v_shortcut THEN
        -- THE LOUD EXEMPTION. Not a silent pass: the row, the holder and the
        -- remedy go to the log every single time, and the read ladder already
        -- reports the same fact to the screen as `dropped_reason` / a
        -- `… rung dropped` health value. IDS STAY HERE: this is a server log,
        -- read by whoever is debugging, and there an id is the useful thing.
        RAISE WARNING
          '[mandate] SHORTCUT-COMPAT EXEMPTION: mandate % (%) now defaults to holder % (%), which organization % (%) cannot run — its members cannot all open that Holder, so this job answers differently for different members. Allowed because this row is the mandate.vw_shortcut compat bridge, which has no server door to route through. Remedy: share it with each member who cannot open it (or promote it to a system agent), or move the shortcut to a workspace whose only member is its owner.',
          NEW.mandate_key, NEW.id, v_holder,
          NEW.default_holder_id, v_org, NEW.organization_id;
      ELSIF NEW.organization_id = v_sys THEN
        RAISE EXCEPTION USING
          errcode = '23514',
          message = format(
            'The default holder of mandate %L must be a platform agent, and %L is not one.',
            NEW.mandate_key, v_holder),
          detail  = 'This job is homed in the system organization, so its default decides for every user on the platform — only a live system agent (agent_type=''builtin'') can hold it.',
          hint    = 'Promote the agent first (agx_duplicate_agent with p_as_system) and set its system twin as the default, or leave the default alone and bind this agent for yourself or your organization instead.';
      ELSE
        RAISE EXCEPTION USING
          errcode = '23514',
          message = format(
            '%L cannot make %L the default holder of mandate %L: its members cannot open that Holder.',
            v_org, v_holder, NEW.mandate_key),
          detail  = 'The default is this organization''s floor — it decides for EVERY member. A Holder only some members can open makes one job answer two different agents for two members of the same organization; the rest silently fall to the rung below.',
          hint    = 'Share it with each member who cannot open it, then set it — or set an agent the organization already has.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$
;
