-- DD-116a — `public.get_published_app_with_prompt(text, uuid)` served an agent's PROMPT BODY to
-- anonymous callers for any published app, whatever its visibility, and even after it was deleted.
-- (B-15, Data Doctrine adoption program, 2026-09-11. Sub-step of DD-116 / dd116_.)
--
-- THE DEFECT: A MISSING PAIR OF FILTERS ITS OWN SIBLING ALREADY HAS
-- -----------------------------------------------------------------
-- Two anon-executable SECURITY DEFINER functions read `app.definition` for the public app page.
-- Their WHERE clauses, live, before this migration:
--
--   get_prompt_app_public_data   status='published' AND visibility='public' AND deleted_at IS NULL
--   get_published_app_with_prompt status='published'
--
-- The one missing both filters is the one that returns the SECRETS: `prompt_messages`,
-- `prompt_settings` and `prompt_variable_defaults`, joined from `agent.definition` /
-- `agent.definition_version`. The gap was not theoretical — it was reproduced end to end over the
-- real HTTPS door with the published anon key and no account at all:
--
--   POST https://db.matrxserver.com/rest/v1/rpc/get_published_app_with_prompt
--        {"p_slug":"<a published app with visibility='internal'>"}
--   -->  200  [{"id":"…","prompt_messages":[{"role":"system","content":"…"}],"prompt_settings":{…}}]
--   (the sibling get_prompt_app_public_data returned [] on the same slug, at the same moment)
--
-- and again with the row soft-deleted and `visibility='public'`: still 200, still the full payload,
-- because nothing tested `deleted_at`. Both probes ran against scratch rows carrying a fake prompt,
-- created and removed for the test, so no real prompt was ever transmitted.
--
-- WHY IT LEAKED NOTHING TODAY, AND WHY THAT IS NOT A REASON TO WAIT. Live `app.definition`:
--   published/public/alive  63   |   draft/public/alive  18   |   draft/internal/alive  16
-- Every published row happens to be public and alive right now, so the live leak set is 0 rows. The
-- first time anybody un-publishes to `internal`, or soft-deletes a published app, it becomes a real
-- one, silently. Row counts are never evidence for a design decision (Doctrine R15).
--
-- THE RULE, IDENTICAL TO dd116_ ON THE AGENT DOOR
-- -----------------------------------------------
--   anonymous caller -> `status='published'` AND `visibility='public'` AND `deleted_at IS NULL`.
--   signed-in caller -> the above, OR the platform resolver `iam.has_access('app', id, 'viewer')`
--                       on a non-deleted published row — never a hand-written membership or org
--                       test (db-rules §6d: one ladder, one resolver).
--   not visible      -> ZERO ROWS, never an error that confirms the app exists (access DECISIONS
--                       2026-08-11 disclosure ruling).
--
-- NOTE ON `visibility` vs `card_visibility`. On `app.definition`, `visibility='public'` is the right
-- and only gate — unlike `agent.definition`, which is CHECK-capped non-public and whose public face
-- is its CARD (see dd116_ and db-rules §6a: *"maps to visibility='public' when nothing bans it
-- (app.definition — an app IS its public face)"*). Live `app.definition` has 81 `public` rows, so
-- this filter is not the by-construction blackout the same clause would be on an agent.
--
-- THIS ONLY EVER NARROWS. Today every caller, signed in or not, sees every published row. After
-- this, an anonymous caller sees published+public+alive, and a signed-in caller sees that plus what
-- they can already view. No identity gains anything.
--
-- SCOPE HELD DELIBERATELY. Whether a signed-in *viewer* of an app should receive the agent's prompt
-- body at all is a product question about this function's whole reason for existing, and it is not
-- this migration's to answer: it is reported in the B-15 report instead. Likewise this function has
-- NO caller in any of the four repos (the public page uses `get_agent_app_public_data` then
-- `get_prompt_app_public_data`), so revoking `anon` outright is a defensible alternative — also
-- reported, not taken, because the instruction was to gate it, and gating is the change that stays
-- correct if a caller appears.
--
-- DOOR ROW. This function holds `anon` EXECUTE and had NO `platform.client_callable_door` row — it
-- was one of the 370 undeclared anonymous doors in `scripts/impl-doors/anon-definer-baseline.json`.
-- Declaring it is part of the fix, not paperwork: `check-impl-doors` D6 (the DD-116 gate guard) only
-- examines DECLARED doors, so an undeclared one is invisible to it forever. Declared + gated means
-- the guard watches it from now on. Grants are untouched.
--
-- Idempotent.

CREATE OR REPLACE FUNCTION public.get_published_app_with_prompt(
  p_slug text DEFAULT NULL::text,
  p_app_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE (
  id uuid, user_id uuid, prompt_id uuid, slug text, name text, tagline text, description text,
  category text, tags text[], preview_image_url text, favicon_url text, component_code text,
  component_language text, variable_schema jsonb, allowed_imports jsonb, layout_config jsonb,
  styling_config jsonb, status text, total_executions integer, success_rate numeric,
  prompt_messages jsonb, prompt_settings jsonb, prompt_variable_defaults jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'app', 'agent', 'pg_temp'
AS $function$
  SELECT a.id, a.created_by, a.agent_id AS prompt_id, a.slug, a.name, a.tagline, a.description,
    a.category, a.tags, a.preview_image_url, a.favicon_url, a.component_code, a.component_language,
    a.variable_schema, a.allowed_imports, a.layout_config, a.styling_config, a.status,
    a.total_executions, a.success_rate,
    COALESCE(av.messages, ag.messages), COALESCE(av.settings, ag.settings),
    COALESCE(av.variable_definitions, ag.variable_definitions)
  FROM app.definition a
  JOIN agent.definition ag ON ag.id = a.agent_id
  LEFT JOIN agent.definition_version av ON av.id = a.agent_version_id
  WHERE a.status = 'published'
    AND a.deleted_at IS NULL
    AND (
      a.visibility = 'public'::platform.visibility
      OR (
        auth.uid() IS NOT NULL
        AND iam.has_access('app', a.id, 'viewer'::public.permission_level)
      )
    )
    AND ((p_app_id IS NOT NULL AND a.id = p_app_id) OR (p_slug IS NOT NULL AND a.slug = p_slug))
  LIMIT 1;
$function$;

COMMENT ON FUNCTION public.get_published_app_with_prompt(text, uuid) IS
  'Published app + its agent prompt payload. Anonymous callers see published + visibility=''public'' '
  '+ not-deleted only; signed-in callers additionally see what iam.has_access(''app'', id, ''viewer'') '
  'admits. A row the caller may not see returns zero rows, never an error (access DECISIONS '
  '2026-08-11, disclosure). DD-116a / B-15.';

INSERT INTO platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason)
VALUES ('public', 'get_published_app_with_prompt', 'p_slug text, p_app_id uuid', 'DD-116a / B-15',
        'Public app-page read: anonymous callers get published + visibility=''public'' + not-deleted '
        'rows only; signed-in callers additionally get what iam.has_access(''app'', id, ''viewer'') '
        'admits. Not-visible returns zero rows, never an error. It carries the agent prompt payload, '
        'so the gate is load-bearing — before DD-116a it had no visibility and no deleted_at filter '
        'and served prompt_messages to anon over HTTPS for any published app.')
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- ASSERTIONS — a forcing test, not a text inspection. The migration builds a row that WOULD have
-- leaked before this change, proves it does not now, proves the public case still works, proves the
-- owner still gets it, and removes the rows again inside the same transaction. If any assertion
-- fails nothing is applied and no ledger row is written.
--
-- Identity is switched by clearing/setting the JWT claims rather than `SET LOCAL ROLE`: the apply
-- path is itself a SECURITY DEFINER function and Postgres refuses `SET ROLE` inside one (42501).
-- The role decides only who may EXECUTE (asserted below); inside the body the only thing separating
-- an anonymous caller from a signed-in one is `auth.uid()`. The role-carrying and real-HTTPS proofs
-- were run by hand — see the B-15 report.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_agent uuid := '00000b15-0000-4000-8000-0000000dd116';
  v_app   uuid := '00000b15-0000-4000-8000-0000000dd117';
  v_owner uuid;
  v_org   uuid;
  v_n     bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM platform.client_callable_door
    WHERE schema_name='public' AND function_name='get_published_app_with_prompt'
  ) THEN
    RAISE EXCEPTION 'dd116a: the door row was not created';
  END IF;

  IF NOT has_function_privilege('anon', 'public.get_published_app_with_prompt(text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'dd116a: get_published_app_with_prompt lost anon EXECUTE — this migration changes '
                    'the body, never the grant shape';
  END IF;

  -- A real org + a real user to own the scratch rows: the first app owner on the platform.
  SELECT a.created_by, a.organization_id INTO v_owner, v_org
    FROM app.definition a
   WHERE a.created_by IS NOT NULL AND a.organization_id IS NOT NULL
   LIMIT 1;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'dd116a: cannot prove the gate — no live app row to borrow an owner/org from';
  END IF;

  INSERT INTO agent.definition (id, name, description, agent_type, messages, settings,
                                variable_definitions, organization_id, created_by,
                                visibility, card_visibility)
  VALUES (v_agent, 'dd116a assertion agent', 'created and removed inside migration dd116a', 'user',
          '[{"role":"system","content":"dd116a assertion — never a real prompt"}]'::jsonb,
          '{}'::jsonb, '[]'::jsonb, v_org, v_owner,
          'internal'::platform.visibility, 'internal'::platform.visibility);

  INSERT INTO app.definition (id, slug, name, status, visibility, agent_id, organization_id,
                              created_by, component_code)
  VALUES (v_app, 'dd116a-assertion-app', 'dd116a assertion app', 'published',
          'internal'::platform.visibility, v_agent, v_org, v_owner, '// dd116a');

  -- 1. ANONYMOUS + published-but-INTERNAL -> nothing. (Before this migration: the full row,
  --    prompt_messages included.)
  PERFORM set_config('request.jwt.claims', '{}', true);
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'dd116a: could not simulate an anonymous caller — auth.uid() is %', auth.uid();
  END IF;
  SELECT count(*) INTO v_n FROM public.get_published_app_with_prompt(NULL, v_app);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'dd116a: an anonymous caller still reads a published INTERNAL app (and its prompt)';
  END IF;

  -- 2. ANONYMOUS + published + PUBLIC + alive -> still served. Over-tightening is a defect.
  UPDATE app.definition SET visibility = 'public'::platform.visibility WHERE id = v_app;
  SELECT count(*) INTO v_n FROM public.get_published_app_with_prompt(NULL, v_app);
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'dd116a: an anonymous caller can no longer read a published PUBLIC app — '
                    'over-tightening is a defect, not caution (db-rules §6)';
  END IF;

  -- 3. ANONYMOUS + published + public but SOFT-DELETED -> nothing. (Before: the full row.)
  UPDATE app.definition SET deleted_at = now() WHERE id = v_app;
  SELECT count(*) INTO v_n FROM public.get_published_app_with_prompt(NULL, v_app);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'dd116a: an anonymous caller still reads a SOFT-DELETED app (and its prompt)';
  END IF;

  -- 4. SIGNED-IN OWNER + published INTERNAL alive -> served, through the platform resolver.
  UPDATE app.definition SET deleted_at = NULL, visibility = 'internal'::platform.visibility
   WHERE id = v_app;
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO v_n FROM public.get_published_app_with_prompt(NULL, v_app);
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'dd116a: the owner can no longer read their own published app — the '
                    'iam.has_access arm is broken';
  END IF;

  -- 5. SIGNED-IN STRANGER -> nothing, and nothing that confirms it exists.
  SELECT u.id INTO v_owner
    FROM auth.users u
   WHERE NOT iam.has_access_for(u.id, 'app', v_app, 'viewer'::public.permission_level)
   LIMIT 1;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'dd116a: cannot prove the stranger case — every live user can view the scratch app';
  END IF;
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO v_n FROM public.get_published_app_with_prompt(NULL, v_app);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'dd116a: user % is not a viewer of the scratch app but still reads it', v_owner;
  END IF;
  PERFORM set_config('request.jwt.claims', '{}', true);

  -- Remove the scratch rows. Same transaction, so a failure above rolls them back too.
  DELETE FROM app.definition WHERE id = v_app;
  DELETE FROM agent.definition WHERE id = v_agent;
  IF EXISTS (SELECT 1 FROM app.definition WHERE id = v_app)
     OR EXISTS (SELECT 1 FROM agent.definition WHERE id = v_agent) THEN
    RAISE EXCEPTION 'dd116a: the assertion scratch rows survived — refusing to leave them behind';
  END IF;

  RAISE NOTICE 'dd116a: all assertions passed; scratch rows removed';
END $$;
