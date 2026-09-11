-- DD-116 — `public.get_agent_public(uuid)` returned ANY agent to an anonymous caller.
-- (B-15, Data Doctrine adoption program, 2026-09-11.)
--
-- THE DEFECT, PROVEN LIVE AS `anon` IN A ROLLED-BACK TRANSACTION BEFORE THIS MIGRATION
-- -----------------------------------------------------------------------------------
--   begin;
--   set local role anon;
--   select count(*), min(name) from public.get_agent_public('8d02d271-f007-4db3-90f2-3cc596190db0');
--   -->  1 | "AI Model Config Sync"     (card_visibility='internal', org 3e790542-…)
--   rollback;
--
-- The body was `where d.id = p_agent_id and d.deleted_at is null` — no visibility test of any
-- kind. Anyone holding the published anon key and an agent UUID read that agent's name,
-- description, launch variables, context policies, category and tags. Live population at the time:
-- 1,040 non-deleted agents, of which 628 are `card_visibility='internal'` — 628 rows that no
-- anonymous caller was ever meant to see. B-14/DD-110 declared this function an anonymous door
-- (`platform.client_callable_door`) on the strength of its being a public-page read, and named the
-- missing filter as a defect to be fixed here rather than closing a door the product needs.
--
-- WHICH COLUMN IS THE GATE — AND WHY IT IS *NOT* `visibility`
-- ----------------------------------------------------------
-- `agent.definition` carries `agent_definition_body_not_public_chk`:
--     CHECK (visibility <> 'public'::platform.visibility)
-- An agent BODY is never public — prompt/messages/tools are secrets. So a `visibility='public'`
-- filter here would match ZERO rows BY CONSTRUCTION: a total blackout of the public agent surface,
-- not a fix. The public face of an agent is its CARD, gated by `card_visibility`
-- (db-rules FEATURE.md §6a, the `is_public` retirement ruling: "agent.definition carries
-- agent_definition_body_not_public_chk … the CARD is the public face, via card_visibility").
-- The same reasoning is already load-bearing elsewhere and is copied, not invented:
--   * `public.wfx_list_scoped` — "THE PUBLIC SCOPE LISTS CARDS, NOT BODIES … keying this arm on
--     d.visibility made the Public tab empty BY CONSTRUCTION — not a data gap, a modelling bug."
--   * `migrations/surface_binding_scope_integrity.sql:257` — `d.card_visibility = 'public'`.
--   * `migrations/sharing_registry_canonical_owner_column_fix.sql:249` — "card_visibility wins
--     (body visibility on agent.definition is CHECK-capped non-public)".
--
-- THE DOOR AFTER THIS MIGRATION
-- -----------------------------
--   anonymous caller   -> only `card_visibility = 'public'` (412 of 1,040 rows today; all 412 are
--                         `agent_type='builtin'`, i.e. the platform's own catalog).
--   signed-in caller   -> `card_visibility = 'public'` OR the platform's own resolver,
--                         `iam.has_access('agent', id, 'viewer')`. Never a hand-written membership
--                         or org test — db-rules §6d: one ladder, one resolver.
--
-- NOTHING IS DISCLOSED BY REFUSAL. A row the caller may not see returns ZERO ROWS — byte-identical
-- to a missing or soft-deleted id. That is the access DECISIONS ruling of 2026-08-11: "a signed-in
-- user may be told kind + name + owner + org; an anonymous caller learns nothing about a non-public
-- row, not even that it exists." An error naming the agent would itself be the leak.
--
-- `auth.uid() IS NOT NULL` short-circuits the resolver for anonymous callers, so the anon path stays
-- a single primary-key lookup plus an enum compare and never enters the access walk.
--
-- LINK SHARING IS DELIBERATELY NOT ADDED HERE. This door takes no token argument, so a `link`-
-- visibility agent cannot be reached through it by construction; token-bearing access is
-- `public.resolve_share_token`'s job, and a signed-in holder of an explicit `iam.permissions` grant
-- is already resolved by `iam.has_access`. Widening this signature is a product decision, not a
-- security fix.
--
-- BLAST RADIUS ON CONSUMERS: none measurable. The only caller in any of the four repos is
-- `matrx-frontend/lib/agents/publicAgent.ts:46` (`getAgentPublic()`), which has zero call sites of
-- its own today (`docs/handoffs/SHARING_GUEST_FEATURES_HANDOFF.md:11` says the same). No server
-- path calls it; aidream resolves agents through its own ORM.
--
-- The door row from DD-110 is KEPT — this function is still an anonymous door, it is now an honest
-- one. Its grant shape (`anon`, `authenticated`, `service_role`) is unchanged; `CREATE OR REPLACE`
-- preserves existing grants, and the assertions below prove it rather than assuming it.
--
-- Idempotent. Returns 0 rows for a missing / soft-deleted / not-visible id.

CREATE OR REPLACE FUNCTION public.get_agent_public(p_agent_id uuid)
RETURNS TABLE (
  id                    uuid,
  name                  text,
  description           text,
  variable_definitions  jsonb,
  context_policies      jsonb,
  agent_type            text,
  category              text,
  tags                  text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'agent', 'public'
AS $$
  SELECT
    d.id,
    d.name,
    d.description,
    d.variable_definitions,
    d.context_policies,
    d.agent_type,
    d.category,
    d.tags
  FROM agent.definition d
  WHERE d.id = p_agent_id
    AND d.deleted_at IS NULL
    AND (
      d.card_visibility = 'public'::platform.visibility
      OR (
        auth.uid() IS NOT NULL
        AND iam.has_access('agent', d.id, 'viewer'::public.permission_level)
      )
    );
$$;

COMMENT ON FUNCTION public.get_agent_public(uuid) IS
  'Public (non-secret) read of ONE agent. Anonymous callers see only card_visibility=''public'' '
  'rows; signed-in callers additionally see anything iam.has_access(''agent'', id, ''viewer'') '
  'admits. A row the caller may not see returns zero rows, never an error (access DECISIONS '
  '2026-08-11, disclosure). DD-116 / B-15.';

-- The DD-110 door row stays, but its reason was written when the body had no filter at all.
UPDATE platform.client_callable_door
   SET reason = 'Public-page read of ONE agent: anonymous callers get card_visibility=''public'' '
                'rows only (agent BODY visibility is CHECK-capped non-public, so the card is the '
                'public face); signed-in callers additionally get anything iam.has_access(''agent'', '
                'id, ''viewer'') admits. Not-visible returns zero rows, never an error. DD-116.'
 WHERE schema_name = 'public'
   AND function_name = 'get_agent_public'
   AND identity_args = 'p_agent_id uuid';

-- ─────────────────────────────────────────────────────────────────────────────
-- ASSERTIONS — this migration refuses to commit unless the door actually behaves.
-- Every one is measured against the LIVE table, with the real roles.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_pub   uuid;
  v_int   uuid;
  v_owner uuid;
  v_n     bigint;
BEGIN
  -- 1. The door row survived, and the grant shape is unchanged.
  IF NOT EXISTS (
    SELECT 1 FROM platform.client_callable_door
    WHERE schema_name='public' AND function_name='get_agent_public'
      AND identity_args='p_agent_id uuid'
  ) THEN
    RAISE EXCEPTION 'dd116: the get_agent_public door row is missing — the door must stay declared';
  END IF;

  IF NOT has_function_privilege('anon', 'public.get_agent_public(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.get_agent_public(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'dd116: get_agent_public lost a client EXECUTE grant — this migration changes the '
                    'body, never the grant shape';
  END IF;

  -- 2. Pick real rows. If either class is empty the assertions below would pass vacuously, which is
  --    exactly the silent-green failure forcing-function tests exist to prevent — so refuse.
  SELECT d.id INTO v_pub
    FROM agent.definition d
   WHERE d.deleted_at IS NULL AND d.card_visibility = 'public'::platform.visibility
   LIMIT 1;
  SELECT d.id, d.created_by INTO v_int, v_owner
    FROM agent.definition d
   WHERE d.deleted_at IS NULL
     AND d.card_visibility <> 'public'::platform.visibility
     AND d.created_by IS NOT NULL
   LIMIT 1;

  IF v_pub IS NULL OR v_int IS NULL THEN
    RAISE EXCEPTION 'dd116: cannot prove the gate — no live % agent to test with',
      CASE WHEN v_pub IS NULL THEN 'card_visibility=public' ELSE 'non-public' END;
  END IF;

  -- 3. ANONYMOUS CALLER: the non-public agent is gone, the public one is still there.
  --
  --    The identity is switched by CLEARING the JWT claims, not by `SET LOCAL ROLE anon`. The
  --    apply path (`pnpm db:apply` → `public.execute_admin_query`) is itself a SECURITY DEFINER
  --    function, and Postgres refuses `SET ROLE` inside one (42501) — a role switch here would make
  --    this migration unappliable, not safer. It loses nothing: the role decides only whether the
  --    caller may EXECUTE the function (asserted in step 1 and enforced by the §6d-4 grant guard);
  --    inside the body the ONLY thing that separates an anonymous caller from a signed-in one is
  --    `auth.uid()`, and with no `sub` claim that is NULL exactly as it is for `anon`. The
  --    role-carrying proof was additionally run by hand as the real `anon` role in a rolled-back
  --    transaction, before and after this migration — see the B-15 report.
  PERFORM set_config('request.jwt.claims', '{}', true);
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'dd116: could not simulate an anonymous caller — auth.uid() is still %', auth.uid();
  END IF;
  SELECT count(*) INTO v_n FROM public.get_agent_public(v_int);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'dd116: an anonymous caller still reads a non-public agent (%) — the gate does '
                    'not hold', v_int;
  END IF;
  SELECT count(*) INTO v_n FROM public.get_agent_public(v_pub);
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'dd116: an anonymous caller can no longer read the PUBLIC agent (%) — '
                    'over-tightening is a defect, not caution (db-rules §6 THE SECURITY PHILOSOPHY)',
                    v_pub;
  END IF;

  -- 4. SIGNED-IN OWNER: still reads their own non-public agent, through the platform resolver.
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO v_n FROM public.get_agent_public(v_int);
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'dd116: the owner of agent % can no longer read it — the iam.has_access arm is '
                    'broken', v_int;
  END IF;

  -- 5. SIGNED-IN STRANGER: a user with no grant on that agent gets nothing back — and gets it as
  --    ZERO ROWS, not as an error that would confirm the agent exists.
  SELECT u.id INTO v_owner
    FROM auth.users u
   WHERE u.id <> (SELECT d.created_by FROM agent.definition d WHERE d.id = v_int)
     AND NOT iam.has_access_for(u.id, 'agent', v_int, 'viewer'::public.permission_level)
   LIMIT 1;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'dd116: cannot prove the stranger case — every live user can already view agent %',
      v_int;
  END IF;
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO v_n FROM public.get_agent_public(v_int);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'dd116: user % is not a viewer of agent % but still reads it', v_owner, v_int;
  END IF;
  PERFORM set_config('request.jwt.claims', '{}', true);

  RAISE NOTICE 'dd116: all assertions passed (public=%, non-public=%)', v_pub, v_int;
END $$;
