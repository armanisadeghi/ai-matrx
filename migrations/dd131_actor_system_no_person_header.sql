-- dd131_actor_system_no_person_header — a person's write has NO system;
-- an agent/code write names its through the same header mechanism as the
-- tier (DD-131, chair ruling, B-56).
--
-- ═══ THE BUG THIS CLOSES ═══════════════════════════════════════════════
-- `platform.actor_system()` (provenance_actor_tier_phase_0_1.sql) reads the
-- `app.actor_system` GUC first, exactly like `platform.declared_actor_tier()`
-- reads `app.actor_tier` — that half is right. But when nothing is declared
-- it falls back to `app.user_id` / `auth.uid()`:
--
--     RETURN COALESCE(
--       NULLIF(current_setting('app.user_id', true), ''),
--       (SELECT auth.uid())::text
--     );
--
-- That stamps the PERSON'S OWN id into `created_by_system`/`updated_by_system`
-- on every undeclared client write — a system column holding a user id. The
-- chair's ruling: a person's write has no system at all. `created_by_system`
-- is NULL for an undeclared human write; only a client that DECLARES itself
-- agent/code (an agent id, `matrx-extend:scheduler`, `matrx-local:sync`, …)
-- gets to name one, and it names it through `x-matrx-actor-system` — read
-- exactly the way `platform.declared_actor_tier()` reads
-- `x-matrx-actor-tier`: the `app.actor_system` GUC on every channel (the
-- only declaration a SERVER channel honours), or the header on the CLIENT
-- channel (`current_user = 'authenticated'`) only. A forged header on a
-- server channel is inert, same as the tier header.
--
-- ═══ WHAT THIS FILE DOES ═══════════════════════════════════════════════
-- 1. `platform.declared_actor_system()` — the RAW declaration, sibling of
--    `platform.declared_actor_tier()`. NULL means UNDECLARED.
-- 2. `platform.actor_system()` — now returns `declared_actor_system()`
--    directly. NEVER `auth.uid()` / `app.user_id` again.
-- 3. Backfill: every live row where `*_by_system = *_by` (a user id sitting
--    in a system column, the exact shape of this bug) is set to NULL,
--    censused per table below. Read live before this file ran
--    (`brsgrqvjdzwihsvnfqkf`, 2026-09-12):
--      agent.definition_version.created_by_system    164
--      agent.definition.updated_by_system              27
--      content_ir.kind_instance.created_by_system      11
--      content_ir.kind_instance.updated_by_system      24
--      tool.definition.updated_by_system                4
--      tool.definition_version.created_by_system       18
--      workflow.definition.updated_by_system             1
--      workflow.definition_version.created_by_system     7
--    (`platform.org_change_policy` also carries `created_by_system` /
--    `updated_by_system` but has no `created_by`/`updated_by` column at
--    all to compare against — it cannot carry this bug shape and is left
--    alone.)
--
-- Client half (matrx-extend, matrx-local) sending `x-matrx-actor-system`
-- alongside their existing `x-matrx-actor-tier` header is done in the
-- SAME commit, not this file — this migration only fixes the database
-- contract those clients declare against.

-- ---------------------------------------------------------------------------
-- (1) platform.declared_actor_system() — the raw declaration.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION platform.declared_actor_system()
RETURNS text
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
  raw     text := NULLIF(current_setting('app.actor_system', true), '');
  hdr_raw text;
  hdr     text;
BEGIN
  -- 1. The GUC is the declaration on EVERY channel, and the only one a
  --    server channel honours — exactly platform.declared_actor_tier()'s
  --    rule 1.
  IF raw IS NOT NULL THEN
    RETURN raw;
  END IF;

  -- 2. The client channel only. `authenticated` is the role PostgREST sets
  --    for a signed-in browser/extension/desktop write under RLS. A forged
  --    header on any other role is skipped entirely — inert by construction,
  --    same as the tier header (R-B).
  IF current_user = 'authenticated' THEN
    hdr_raw := NULLIF(current_setting('request.headers', true), '');
    IF hdr_raw IS NOT NULL THEN
      BEGIN
        hdr := NULLIF(trim((hdr_raw::json) ->> 'x-matrx-actor-system'), '');
      EXCEPTION WHEN others THEN
        -- request.headers is set by PostgREST and is always JSON. Anything
        -- else is a host defect, not a client's problem.
        RAISE WARNING '[provenance] request.headers is not JSON — ignoring the client actor-system header for this write.';
        hdr := NULL;
      END;

      IF hdr IS NOT NULL THEN
        RETURN hdr;
      END IF;
    END IF;

    -- No header on the client channel: a person is typing, and a person's
    -- write has no system (chair ruling, DD-131/B-56).
    RETURN NULL;
  END IF;

  -- 3. A server channel that declared nothing. UNDECLARED, same as tier.
  RETURN NULL;
END
$function$;

COMMENT ON FUNCTION platform.declared_actor_system() IS
  'DD-131/B-56 chair ruling: the RAW system declaration, read exactly the way platform.declared_actor_tier() reads the tier — the app.actor_system GUC on any channel, or the x-matrx-actor-system request header on the client channel (role `authenticated`) only. NULL means no system was declared: a person is acting, or a server channel forgot.';

GRANT EXECUTE ON FUNCTION platform.declared_actor_system() TO authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- (2) platform.actor_system() — the resolver every stamp trigger calls.
--     Was: falls back to app.user_id / auth.uid(), stamping a PERSON'S id
--     into a SYSTEM column. Now: the raw declaration, full stop. A person's
--     write has no system.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION platform.actor_system()
RETURNS text
LANGUAGE plpgsql
STABLE
AS $function$
BEGIN
  -- A person's write has no system (chair ruling, DD-131/B-56). Never
  -- auth.uid() / app.user_id here again — that was the bug: it stamped the
  -- writing PERSON's id as the writing SYSTEM.
  RETURN platform.declared_actor_system();
END
$function$;

COMMENT ON FUNCTION platform.actor_system() IS
  'DD-131/B-56: resolves to platform.declared_actor_system() alone. Returns NULL for an undeclared human write — never the person''s own id (auth.uid()/app.user_id), which was the pre-2026-09-12 bug this replaces.';

GRANT EXECUTE ON FUNCTION platform.actor_system() TO authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- (3) Backfill — rows where the system column silently holds the actor's
--     own user id (the exact shape of the bug). Verified counts above.
-- ---------------------------------------------------------------------------
UPDATE agent.definition_version
   SET created_by_system = NULL
 WHERE created_by_system = created_by::text;

UPDATE agent.definition
   SET updated_by_system = NULL
 WHERE updated_by_system = updated_by::text;

UPDATE content_ir.kind_instance
   SET created_by_system = NULL
 WHERE created_by_system = created_by::text;

UPDATE content_ir.kind_instance
   SET updated_by_system = NULL
 WHERE updated_by_system = updated_by::text;

UPDATE tool.definition
   SET updated_by_system = NULL
 WHERE updated_by_system = updated_by::text;

UPDATE tool.definition_version
   SET created_by_system = NULL
 WHERE created_by_system = created_by::text;

UPDATE workflow.definition
   SET updated_by_system = NULL
 WHERE updated_by_system = updated_by::text;

UPDATE workflow.definition_version
   SET created_by_system = NULL
 WHERE created_by_system = created_by::text;

-- Verification in the same transaction. If any row still shows a system
-- column holding its own actor's id, this migration is wrong and must fail
-- HERE, not silently ship a half-backfill.
DO $$
DECLARE
  v_left bigint;
BEGIN
  SELECT
      (SELECT count(*) FROM agent.definition_version WHERE created_by_system = created_by::text)
    + (SELECT count(*) FROM agent.definition WHERE updated_by_system = updated_by::text)
    + (SELECT count(*) FROM content_ir.kind_instance WHERE created_by_system = created_by::text)
    + (SELECT count(*) FROM content_ir.kind_instance WHERE updated_by_system = updated_by::text)
    + (SELECT count(*) FROM tool.definition WHERE updated_by_system = updated_by::text)
    + (SELECT count(*) FROM tool.definition_version WHERE created_by_system = created_by::text)
    + (SELECT count(*) FROM workflow.definition WHERE updated_by_system = updated_by::text)
    + (SELECT count(*) FROM workflow.definition_version WHERE created_by_system = created_by::text)
  INTO v_left;

  IF v_left <> 0 THEN
    RAISE EXCEPTION 'dd131_actor_system_no_person_header: % rows still carry created_by_system/updated_by_system = the actor''s own id after backfill', v_left;
  END IF;
END
$$;
