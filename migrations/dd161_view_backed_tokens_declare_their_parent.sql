-- dd161_view_backed_tokens_declare_their_parent.sql
--
-- DD-161. THE FINDING THAT SENT THIS LANE WAS WRONG, AND THE MEASUREMENT IS THE POINT.
--
-- B-41b §FR1.12 reported `workflow.card` as a TABLE with "RLS OFF, an anon SELECT
-- grant, no policies -- readable by anyone on the internet", and
-- `content_ir.kind_conformance` as the same shape over 1,128 rows for any signed-in
-- user. Re-measured live on 2026-09-12:
--
--     select c.relkind, c.relrowsecurity, c.reloptions
--       from pg_class c join pg_namespace n on n.oid = c.relnamespace
--      where (n.nspname,c.relname) in (('workflow','card'),('content_ir','kind_conformance'),('agent','card'));
--     -- v | false | {security_invoker=true}   workflow.card
--     -- v | false | {security_invoker=true}   content_ir.kind_conformance
--     -- v | false | {security_invoker=false}  agent.card
--
-- All three are VIEWS. `relrowsecurity` is meaningless on a view -- Postgres never
-- sets it there -- so "RLS OFF" was reading a column that cannot be true. Two of the
-- three carry `security_invoker=true`, which means the underlying table's RLS is
-- evaluated AS THE CALLER, and that is exactly the protection the finding said was
-- absent. Proven with real roles, not inferred:
--
--     begin; set local role anon;
--     select count(*) from workflow.card;                                  -- 0
--     begin; set local role authenticated;
--     set local request.jwt.claims = '{"sub":"4060701e-...","role":"authenticated"}';  -- test@test.com, plain member
--     select count(*) from content_ir.kind_conformance;                    -- 1064
--     select count(*) from content_ir.kind_definition where deleted_at is null; -- 1064
--
-- 1064 = 1064: the view returns precisely what that user's RLS on the parent table
-- admits, row for row. Nothing is open. The postgres-role counts in the original
-- finding (0 and 1,128) were the view's output to a BYPASSRLS superuser, read as if
-- they were a client's.
--
-- WHAT IS ACTUALLY WRONG, AND IS FIXED HERE.
--
-- Three tokens in `platform.entity_types` point at views. `platform._enforce_entity_is_table`
-- refuses exactly that (see agent_card_registry_restore_d233.sql, which had to disable
-- the trigger to restore one), so the registry is holding three rows its own guard
-- would reject. `iam.apply_rls` cannot generate a policy for a view, and since
-- DD-137b10 `iam.class_lanes` walks composition parents and resolves a PARENTLESS
-- component to `private`. Measured before this migration:
--
--     agent_card                  -> organization  (it has an edge: agent_card -> agent, d233)
--     workflow_card               -> private       (no edge)
--     content_ir_kind_conformance -> private       (no edge)
--
-- `private` is not a decision anyone made about a workflow card; it is what an orphan
-- falls to. The honest declaration is the one `agent_card` already carries and the one
-- the view text proves: each card view is a projection of exactly one parent row, keyed
-- on `id`.
--
--     agent.card                  FROM agent.definition d            -> token `agent`                 (edge exists)
--     workflow.card               FROM workflow.definition d         -> token `workflow`
--     content_ir.kind_conformance FROM content_ir.kind_definition kd -> token `content_ir_kind`
--
-- This migration adds the two missing composition edges. It changes no policy, no grant
-- and no readable row -- it makes the registry say what the view already does, so the
-- class walk stops guessing. `pnpm check:rls-on` is the guard that keeps it true.
--
-- The permanent question of whether a view-backed token belongs in a table registry at
-- all is D233's open item and is NOT settled here.
--
-- Idempotent. Safe to re-run. No BEGIN/COMMIT: `pnpm db:apply` owns the transaction.

-- ---------------------------------------------------------------------------
-- Preconditions. If any of these is false the premise of the migration is gone
-- and it must not run.
-- ---------------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT v.token, v.nsp, v.rel, c.relkind
    FROM (VALUES ('workflow_card','workflow','card','workflow'),
                 ('content_ir_kind_conformance','content_ir','kind_conformance','content_ir_kind'))
           AS v(token, nsp, rel, parent)
    LEFT JOIN pg_namespace n ON n.nspname = v.nsp
    LEFT JOIN pg_class c ON c.relnamespace = n.oid AND c.relname = v.rel
  LOOP
    IF r.relkind IS NULL THEN
      RAISE EXCEPTION 'ABORT: %.% does not exist', r.nsp, r.rel;
    END IF;
    IF r.relkind <> 'v' THEN
      RAISE EXCEPTION 'ABORT: %.% is relkind %, not a view — this migration reasons about view-backed tokens and its premise no longer holds. Re-read it before changing anything.', r.nsp, r.rel, r.relkind;
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM platform.entity_types WHERE token = 'workflow' AND is_active) THEN
    RAISE EXCEPTION 'ABORT: parent token `workflow` is not registered and active';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM platform.entity_types WHERE token = 'content_ir_kind' AND is_active) THEN
    RAISE EXCEPTION 'ABORT: parent token `content_ir_kind` is not registered and active';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- The two edges. Same shape as the `agent_card -> agent` edge restored by d233:
-- composition, fk_column `id`, because the view is a one-to-one projection of
-- its parent row and carries the parent's own primary key as `id`.
-- ---------------------------------------------------------------------------
INSERT INTO platform.entity_relationships (child_type, parent_type, fk_column, kind)
SELECT 'workflow_card', 'workflow', 'id', 'composition'
WHERE NOT EXISTS (
  SELECT 1 FROM platform.entity_relationships
  WHERE child_type = 'workflow_card' AND parent_type = 'workflow'
);

INSERT INTO platform.entity_relationships (child_type, parent_type, fk_column, kind)
SELECT 'content_ir_kind_conformance', 'content_ir_kind', 'id', 'composition'
WHERE NOT EXISTS (
  SELECT 1 FROM platform.entity_relationships
  WHERE child_type = 'content_ir_kind_conformance' AND parent_type = 'content_ir_kind'
);

-- ---------------------------------------------------------------------------
-- AND THE ONE THING THE ORIGINAL FINDING WAS RIGHT TO BE UNEASY ABOUT.
--
-- `workflow.card` is the only registered view in the database carrying client
-- WRITE grants, and it carries the full set to BOTH client roles:
--
--     anon:DELETE, anon:INSERT, anon:SELECT, anon:UPDATE,
--     authenticated:DELETE, authenticated:INSERT, authenticated:SELECT, authenticated:UPDATE
--
-- It is a read projection of `workflow.definition` with a computed `step_count`
-- column. Nothing in any repo writes through it -- `from("card")` appears at
-- exactly three call sites (GlobalBindAgentGuard.tsx:115,
-- bind-agent-to-surface.service.ts:323, useDiagramAgents.ts:70) and all three read
-- `agent.card`. Nothing reads `workflow.card` from a client at all.
--
-- The grants are inert TODAY and only because of the parent's RLS. Measured live,
-- as `anon`, inside a rolled-back transaction:
--
--     update workflow.card set name = 'zz';   -- no error; rows affected = 0
--     delete from workflow.card;              -- no error; rows affected = 0
--     insert into workflow.card ...           -- 42501 new row violates row-level
--                                             --   security policy for table "definition"
--     -- workflow.definition live rows after: 225 (unchanged)
--
-- The UPDATE and DELETE did not RAISE. They matched nothing, because
-- `workflow.definition` has no write policy for `anon`, so a wide-open statement
-- from the internet returns success and touches no row. That is a grant whose
-- entire safety is one policy edit away, and it announces nothing when it stops
-- being safe. Revoked: a card view is read-only, and the SELECT grants stay.
-- ---------------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE ON workflow.card FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- Verify. Every registered token whose relation is a view now has a composition
-- parent, the class walk resolves through it instead of falling to `private`, and
-- no registered view is client-writable.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  n_orphan int;
  c_workflow text;
  c_kind text;
BEGIN
  SELECT count(*) INTO n_orphan
  FROM platform.entity_types et
  JOIN pg_namespace n ON n.nspname = et.schema_name
  JOIN pg_class c ON c.relnamespace = n.oid AND c.relname = et.table_name
  WHERE et.is_active
    AND c.relkind IN ('v','m')
    AND NOT EXISTS (
      SELECT 1 FROM platform.entity_relationships r
      WHERE r.child_type = et.token AND r.kind = 'composition'
    );

  IF n_orphan <> 0 THEN
    RAISE EXCEPTION 'ABORT: % registered view-backed token(s) still have no composition parent', n_orphan;
  END IF;

  SELECT (iam.class_lanes('workflow_card')).resolved_class::text INTO c_workflow;
  SELECT (iam.class_lanes('content_ir_kind_conformance')).resolved_class::text INTO c_kind;

  IF c_workflow = 'private' THEN
    RAISE EXCEPTION 'ABORT: workflow_card still resolves `private` — the edge did not take';
  END IF;
  IF c_kind = 'private' THEN
    RAISE EXCEPTION 'ABORT: content_ir_kind_conformance still resolves `private` — the edge did not take';
  END IF;

  RAISE NOTICE 'OK: workflow_card resolves %, content_ir_kind_conformance resolves % (both were `private` — an orphan default, not a decision)', c_workflow, c_kind;

  SELECT count(*) INTO n_orphan
  FROM platform.entity_types et
  JOIN pg_namespace n ON n.nspname = et.schema_name
  JOIN pg_class c ON c.relnamespace = n.oid AND c.relname = et.table_name
  WHERE et.is_active
    AND c.relkind IN ('v','m')
    AND (has_table_privilege('anon', c.oid, 'INSERT') OR has_table_privilege('anon', c.oid, 'UPDATE')
      OR has_table_privilege('anon', c.oid, 'DELETE') OR has_table_privilege('authenticated', c.oid, 'INSERT')
      OR has_table_privilege('authenticated', c.oid, 'UPDATE') OR has_table_privilege('authenticated', c.oid, 'DELETE'));

  IF n_orphan <> 0 THEN
    RAISE EXCEPTION 'ABORT: % registered view(s) still client-writable', n_orphan;
  END IF;

  RAISE NOTICE 'OK: no registered view carries a client INSERT/UPDATE/DELETE grant';
END $$;
