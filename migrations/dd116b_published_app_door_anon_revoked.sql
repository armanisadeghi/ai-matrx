-- DD-116b — `public.get_published_app_with_prompt(text, uuid)` loses `anon` EXECUTE entirely.
-- (B-15 round 2, chair's ruling 1, 2026-09-11. Follows dd116a_, which gated the body.)
--
-- WHY A REVOKE AND NOT JUST THE GATE
-- ----------------------------------
-- dd116a_ made the body honest: anonymous callers saw `status='published'` AND `visibility='public'`
-- AND `deleted_at IS NULL`, signed-in callers additionally what `iam.has_access('app', id, 'viewer')`
-- admits. That closed the leak. It did not answer the prior question: does an anonymous caller need
-- this function AT ALL?
--
-- Measured, not assumed — the function has **zero callers across five repos** (matrx-frontend,
-- aidream, matrx-sandbox, matrx-extend, matrx-local; swept for `rpc("…")` call sites, bare-name
-- occurrences, RLS policy bodies and invoker-function callers). The public app page does NOT use it:
-- `app/(public)/p/[slug]/page.tsx:100` calls `get_aga_public_data`, not this one. (Note for the next
-- reader: `features/agents/migration/DECISIONS.md:115` says that page resolves through
-- `get_agent_app_public_data` — **that function does not exist on this database at all**; the live
-- name is `get_aga_public_data`. An earlier draft of this migration asserted the doc's name and was
-- refused with 42883, which is how it was found. Reported, not fixed here.) B-14's sweep and this
-- lane's own grep across five repos reached the zero-callers conclusion independently.
--
-- By B-14/DD-110's own classification an anon-callable definer with no anonymous caller is class N or
-- U, never L — and this one returns `prompt_messages`, `prompt_settings` and
-- `prompt_variable_defaults`, the agent's prompt body. An unused door onto secrets is exactly the
-- shape that becomes a leak the next time someone changes an unrelated filter. **A gate you rely on
-- is weaker than a door that is not there.**
--
-- `authenticated` IS DELIBERATELY KEPT, and the reason is a question, not an oversight. Whether a
-- signed-in *viewer* of an app should receive that app's agent prompt body is a product decision
-- about why this function exists at all — `get_prompt_app_execution_payload` already serves the
-- execution path — and it is the chair's to make, not this lane's. Until it is made, the signed-in
-- surface stays exactly as dd116a_ left it: narrower than it was before DD-116, and gated by the
-- platform resolver. The question is recorded in the B-15 report.
--
-- THE GATE IN THE BODY IS NOT REMOVED. Revoking `anon` and gating the body are belt and braces on
-- purpose: a future `GRANT` (a fresh CREATE after a DROP, a hand-written grant, a default) would
-- otherwise re-open an UNGATED door, and §6d-4's event trigger only takes a client grant back for a
-- function that is not a declared door — this one is declared.
--
-- The door row is KEPT (it is still a client-callable door, for `authenticated`) and its reason is
-- rewritten so it stops describing an anonymous surface that no longer exists.
--
-- Idempotent.

-- 🚨 REVOKING `anon` ALONE DOES NOTHING HERE, AND THE FIRST ATTEMPT PROVED IT. The function's ACL is
--    `{=X/postgres, postgres=X/postgres, anon=X/postgres, authenticated=X/postgres, service_role=X/postgres}`
-- and the FIRST entry — `=X/postgres` — is the default EXECUTE grant to **PUBLIC** that every new
-- function gets. With that present, `anon` still executes through PUBLIC and
-- `has_function_privilege('anon', …)` stays true. The migration's own assertion caught exactly that
-- and refused to commit (`dd116b: anon still holds EXECUTE`), which is what an assertion is for.
-- So: take the PUBLIC grant away too, and then say explicitly who may still execute, rather than
-- leaving `authenticated` depending on a grant we just removed.
REVOKE EXECUTE ON FUNCTION public.get_published_app_with_prompt(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_published_app_with_prompt(text, uuid) TO authenticated, service_role;

UPDATE platform.client_callable_door
   SET reason = 'Published app + its agent prompt payload. ANON WAS REVOKED (DD-116b): the function '
                'has zero callers in all five repos and returns prompt_messages/prompt_settings/'
                'prompt_variable_defaults, so no anonymous caller ever needed it. `authenticated` is '
                'kept pending the chair''s product ruling on whether an app VIEWER should receive the '
                'agent prompt body at all. The body gate from DD-116a stays as defence in depth: '
                'published + not-deleted + (visibility=''public'' OR iam.has_access(''app'', id, '
                '''viewer'')); not-visible returns zero rows, never an error.'
 WHERE schema_name = 'public'
   AND function_name = 'get_published_app_with_prompt'
   AND identity_args = 'p_slug text, p_app_id uuid';

COMMENT ON FUNCTION public.get_published_app_with_prompt(text, uuid) IS
  'Published app + its agent prompt payload. NOT anon-callable (DD-116b — zero callers, returns the '
  'prompt body). Signed-in callers get published + not-deleted + (visibility=''public'' OR '
  'iam.has_access(''app'', id, ''viewer'')); anything else returns zero rows, never an error '
  '(access DECISIONS 2026-08-11, disclosure). DD-116a / DD-116b / B-15.';

DO $$
DECLARE
  v_pub_app uuid;
  v_owner   uuid;
  v_n       bigint;
BEGIN
  -- 1. anon is gone; authenticated and service_role are untouched.
  IF has_function_privilege('anon', 'public.get_published_app_with_prompt(text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'dd116b: anon still holds EXECUTE on get_published_app_with_prompt';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.get_published_app_with_prompt(text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'dd116b: authenticated LOST EXECUTE — this revoke is anon-only';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.get_published_app_with_prompt(text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'dd116b: service_role LOST EXECUTE — the server must keep reaching it';
  END IF;

  -- 2. The sibling that the public page DOES use is untouched and still anon-callable. Revoking the
  --    wrong one of the two would take the public app page down, and that is an access denial, which
  --    db-rules §6 weighs exactly as heavily as a leak.
  IF NOT has_function_privilege('anon', 'public.get_prompt_app_public_data(text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'dd116b: get_prompt_app_public_data lost anon EXECUTE — wrong function revoked';
  END IF;
  IF NOT has_function_privilege('anon', 'public.get_aga_public_data(text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'dd116b: get_aga_public_data lost anon EXECUTE — wrong function revoked';
  END IF;

  -- 3. The door row survived and still describes a real (authenticated) door.
  IF NOT EXISTS (
    SELECT 1 FROM platform.client_callable_door
    WHERE schema_name='public' AND function_name='get_published_app_with_prompt'
      AND reason LIKE '%ANON WAS REVOKED%'
  ) THEN
    RAISE EXCEPTION 'dd116b: the door row was not updated';
  END IF;

  -- 4. The signed-in path still works on a real published public app, through the gate dd116a added.
  SELECT a.id, a.created_by INTO v_pub_app, v_owner
    FROM app.definition a
   WHERE a.status = 'published' AND a.visibility = 'public'::platform.visibility
     AND a.deleted_at IS NULL AND a.created_by IS NOT NULL
   LIMIT 1;
  IF v_pub_app IS NULL THEN
    RAISE EXCEPTION 'dd116b: cannot prove the signed-in path — no live published public app';
  END IF;
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO v_n FROM public.get_published_app_with_prompt(NULL, v_pub_app);
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'dd116b: a signed-in caller can no longer read a published PUBLIC app (%)', v_pub_app;
  END IF;
  PERFORM set_config('request.jwt.claims', '{}', true);

  RAISE NOTICE 'dd116b: all assertions passed';
END $$;
