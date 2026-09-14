-- DD-209 (V-102 F1) — `public.agx_get_access_level` answers the LEVEL, not the row.
--
-- THE DEFECT, measured live and rolled back by V-102 on 2026-09-14, as test@test.com
-- against an `internal` agent owned by admin@admin.com:
--
--   direct RLS select on agent.definition 90178b45-47c6-4df6-beda-24a1ddbb55ba -> []
--   through the door ->
--     {"agent_id":"90178b45-…","agent_name":"Strunk Prose Writer TEST — Maker",
--      "owner_id":"87a6e699-…","owner_email":"admin@admin.com",
--      "access_level":"none","is_owner":false}
--
-- The door says "you have no access" and in the same breath hands over the row's NAME
-- and the owner's EMAIL ADDRESS. There is no gate on what it returns: the body reads
-- `agent.definition` as a definer, joins `auth.users` for the email, computes the level,
-- and returns all of it whatever the level turned out to be.
--
-- WHY NOTHING CAUGHT IT. `pnpm check:door-rows:strict` scored it PASS, and honestly so
-- by its own oracle: that oracle is UUID-ONLY — it harvests row identities out of an
-- answer and asks whether the caller can SELECT them. A name, a title, an email or a
-- phone number from a row the caller cannot read is structurally invisible to it. The
-- companion half of this fix is a DISCLOSURE ORACLE in `scripts/check-door-rows.ts`,
-- which fails exactly this shape by name; this migration is the door.
--
-- The platform already knows this shape is dangerous: `public.access_denied_context` sits
-- in `scripts/door-rows/by-design-allowlist.json` PRECISELY because it returns "a DISPLAY
-- NAME of a row the caller cannot SELECT", and its entry flags it as the one disclosure
-- the Data Doctrine chair should re-examine first. `agx_get_access_level` was doing the
-- same thing plus an email address, undeclared, in the lane that blocks.
--
-- THE FIX. The descriptive fields are gated through the same question the platform's own
-- kernel answers — can this caller read this row? — and nothing else changes:
--
--   access_level, is_owner, agent_id   ALWAYS. The caller already holds the id (they
--                                      passed it in) and the level is the answer they
--                                      asked for; a screen that cannot name what it was
--                                      denied is the no-dead-ends problem, but a LEVEL is
--                                      not a disclosure about the row's contents.
--   agent_name, owner_id               only when the caller may READ the row
--                                      (owner / admin / editor / viewer / public).
--   owner_email                        only when the caller holds a real grant or owns it.
--                                      A PUBLIC agent's page does not carry its author's
--                                      email address, so the public tier does not get one.
--
-- Nothing legitimate loses anything: the only consumer in this repo,
-- `fetchAgentAccessLevel` in features/agents/redux/agent-definition/thunks.ts, reads
-- `access_level` and `is_owner` and nothing else (it even comments that the sharer's email
-- is "not returned by this RPC"). Owner and shared-with paths are unchanged.
--
-- based-on: public.agx_get_access_level(uuid) 6a4be93b7e0d18a008e406883c7198fa3eeedf31a5f4c688b29a42e1a65acacf
create or replace function public.agx_get_access_level(p_agent_id uuid)
returns table(agent_id uuid, agent_name text, owner_id uuid, owner_email text, access_level text, is_owner boolean)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
DECLARE
  v_uid uuid := auth.uid();
  v_agent record;
  v_level text := NULL;
  v_email text;
  v_may_read boolean;
  v_may_see_owner_email boolean;
BEGIN
  SELECT a.id, a.name, a.created_by, a.organization_id, a.visibility INTO v_agent
    FROM agent.definition a WHERE a.id = p_agent_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF v_agent.created_by = v_uid THEN v_level := 'owner';
  ELSIF iam.has_access_for(v_uid, 'agent', p_agent_id, 'admin') THEN v_level := 'admin';
  ELSIF iam.has_access_for(v_uid, 'agent', p_agent_id, 'editor') THEN v_level := 'editor';
  ELSIF iam.has_access_for(v_uid, 'agent', p_agent_id, 'viewer') THEN v_level := 'viewer';
  ELSIF v_agent.visibility = 'public'::platform.visibility THEN v_level := 'public';
  ELSE v_level := 'none'; END IF;

  -- 🚨 DD-209 (V-102 F1). THE ANSWER IS THE LEVEL. Everything descriptive about the row
  -- is gated on the caller actually being able to read that row, and the owner's email
  -- address on their holding a real grant — never on the caller merely knowing an id.
  v_may_read := v_level <> 'none';
  v_may_see_owner_email := v_level IN ('owner', 'admin', 'editor', 'viewer');

  IF v_may_see_owner_email THEN
    SELECT u.email INTO v_email FROM auth.users u WHERE u.id = v_agent.created_by;
  ELSE
    v_email := NULL;
  END IF;

  RETURN QUERY SELECT
    v_agent.id,
    CASE WHEN v_may_read THEN v_agent.name ELSE NULL END,
    CASE WHEN v_may_read THEN v_agent.created_by ELSE NULL END,
    v_email,
    v_level,
    (v_agent.created_by = v_uid);
END;
$function$;

comment on function public.agx_get_access_level(uuid) is
  'DD-209 (V-102 F1). Answers the caller''s access LEVEL on an agent. Everything descriptive — the agent name and the owner id — is returned only when the caller may actually read that row, and the owner''s email only when they hold a real grant on it; before 2026-09-14 this door told any signed-in caller the name of an agent they cannot SELECT and the email address of its owner, while saying access_level = none.';
