-- entity_types_projection_relation_kind.sql
--
-- Makes VIEW-backed permission tokens a first-class, supported thing, once,
-- instead of a per-view exception. Arman's ruling 2026-08-23: "instead of doing
-- something custom for this, create a system that will handle this and dozens of
-- other views the same way. Do it right one time."
--
-- THE CONTRADICTION THIS RESOLVES. A "card" view is a shareable projection of an
-- entity: agent.card is a security view over agent.definition, workflow.card the
-- same over workflow.definition. Their WHERE clauses end in
-- `has_permission('<token>', id, 'viewer')`, and public.has_permission_for()
-- opens with:
--     if not exists (select 1 from platform.entity_types e
--                    where e.token = p_resource_type and e.is_active)
--     then raise exception 'Unknown entity token: %...'
-- so the token MUST be registered and active. But platform._enforce_entity_is_table
-- refuses any active row whose relation is a view. Two correct rules that, together,
-- make these tokens impossible.
--
-- IT ALREADY BIT, TWICE:
--   * `agent_card` -- its registry row was deleted 2026-08-21 while clearing the
--     versioned-without-capture backlog. Every read of agent.card then raised
--     P0001, with the sharing registry still routing to it and 2 live grants.
--     Restored by agent_card_registry_restore_d233.sql -- but that restore had to
--     DISABLE the guard for one insert, leaving the row in a shape the guard would
--     reject. This migration makes that state legitimate instead of contraband.
--   * `workflow.card` -- never registered at all, so it has been broken the whole
--     time, silently. `select count(*) from workflow.card` raises
--     'Unknown entity token: workflow_card'. Nobody noticed because the feature
--     has not shipped -- it is granted to authenticated and anon and throws.
--
-- THE SYSTEM. `relation_kind` declares what a registry row points at:
--     'table'      (default) -- a base/partitioned table. Today's rule, unchanged.
--     'projection' -- a view or matview that projects another entity's rows and
--                     exists to carry its own permission scope.
-- `projects_token` names the entity it projects, so the registry is
-- self-describing: agent_card projects agent. A projection is required to be
-- audit_class='machinery', which is the EXISTING sanctioned way to sit outside the
-- certification universe (audit.refresh_static skips machinery rows and the written
-- reason lives on the row) -- deliberately reusing that hatch rather than adding a
-- parallel one. Projections are therefore visible and explained in the registry,
-- not silently absent from it.
--
-- WHY NOTHING ELSE NEEDS CHANGING -- every automatic sweeper over entity_types was
-- checked against a view-backed row and each is already safe by construction:
--   iam.sweep_governance_guards      filters on a `std_update` policy existing; a
--                                    view has no policies -> never selected.
--   public.component_created_by_report joins pg_policies -> no rows -> no offenders.
--   public.org_null_ratchet_snapshot  already guards on relkind.
--   platform.lifecycle_hot_reference_scan filters lifecycle_enlisted.
--   audit.refresh_static             skips audit_class='machinery' (enforced below).
--   iam.verify_canonical             not reached for machinery rows.
--   public.has_permission_for        needs only token + is_active -> works.
-- iam.apply_rls / iam.apply_table_grants are NOT modified: they are invoked
-- explicitly by migrations, never in a sweep, and Postgres already hard-stops a
-- policy or RLS change on a view. Rewriting two core access functions to add a
-- friendlier message is not worth the blast radius.
--
-- Idempotent. Safe to re-run.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. The columns
-- ---------------------------------------------------------------------------
ALTER TABLE platform.entity_types
  ADD COLUMN IF NOT EXISTS relation_kind text NOT NULL DEFAULT 'table',
  ADD COLUMN IF NOT EXISTS projects_token text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='entity_types_relation_kind_valid') THEN
    ALTER TABLE platform.entity_types
      ADD CONSTRAINT entity_types_relation_kind_valid
      CHECK (relation_kind IN ('table','projection'));
  END IF;

  -- A projection must say what it projects, and must sit outside the
  -- certification universe with a written reason (reusing audit_class='machinery',
  -- whose own CHECK already forces audit_class_reason to be non-null).
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='entity_types_projection_contract') THEN
    ALTER TABLE platform.entity_types
      ADD CONSTRAINT entity_types_projection_contract
      CHECK (
        relation_kind <> 'projection'
        OR (projects_token IS NOT NULL AND audit_class = 'machinery')
      );
  END IF;

  -- projects_token must name a real token (self-FK; ON UPDATE CASCADE so the
  -- token-rename path in db-rules §1 keeps working).
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='entity_types_projects_token_fkey') THEN
    ALTER TABLE platform.entity_types
      ADD CONSTRAINT entity_types_projects_token_fkey
      FOREIGN KEY (projects_token) REFERENCES platform.entity_types(token) ON UPDATE CASCADE;
  END IF;
END $$;

COMMENT ON COLUMN platform.entity_types.relation_kind IS
  '''table'' = a base/partitioned table that owns rows (the default and the norm). ''projection'' = a view/matview that projects another entity''s rows and exists to carry its own permission scope (e.g. agent.card over agent.definition). A projection owns no rows, gets no RLS, no triggers and no versioning; it must name projects_token and be audit_class=''machinery''. See db-rules §1.';

COMMENT ON COLUMN platform.entity_types.projects_token IS
  'For relation_kind=''projection'': the entity token whose rows this view projects. Ids match, so a permission granted on the projection token addresses the same row.';

-- ---------------------------------------------------------------------------
-- 2. Teach the guard about projections
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION platform._enforce_entity_is_table()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_oid oid;
  v_relkind "char";
BEGIN
  IF NOT NEW.is_active THEN
    RETURN NEW;  -- deactivating/cleaning up is always allowed
  END IF;

  IF NEW.schema_name = 'graveyard'
     AND NOT (TG_OP = 'UPDATE' AND OLD.schema_name = 'graveyard' AND OLD.is_active) THEN
    RAISE EXCEPTION
      'entity_types: % is ACTIVE but points at graveyard.% — a live feature cannot live in the graveyard. Either the feature is alive (move the table back to its feature schema) or it is dead (set is_active=false FIRST, then graveyard the table).',
      NEW.token, NEW.table_name
      USING ERRCODE = 'check_violation';
  END IF;

  v_oid := to_regclass(format('%I.%I', NEW.schema_name, NEW.table_name));
  IF v_oid IS NULL THEN
    RETURN NEW;  -- unresolvable = stale-registry lane, not this guard's job
  END IF;
  SELECT relkind INTO v_relkind FROM pg_class WHERE oid = v_oid;

  IF NEW.relation_kind = 'projection' THEN
    -- A projection must actually BE a view, or the label is a lie.
    IF v_relkind NOT IN ('v', 'm') THEN
      RAISE EXCEPTION
        'entity_types: % (%.%) is relation_kind=''projection'' but the relation is relkind "%" — a projection must be a view or materialized view. If it is a real table, set relation_kind=''table''.',
        NEW.token, NEW.schema_name, NEW.table_name, v_relkind
        USING ERRCODE = 'check_violation';
    END IF;
    -- What it projects must be a live, table-backed entity.
    IF NOT EXISTS (
      SELECT 1 FROM platform.entity_types b
      WHERE b.token = NEW.projects_token AND b.is_active AND b.relation_kind = 'table'
    ) THEN
      RAISE EXCEPTION
        'entity_types: % is a projection but projects_token=% is not an active table-backed entity.',
        NEW.token, coalesce(NEW.projects_token, '<null>')
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF v_relkind NOT IN ('r', 'p') THEN
    RAISE EXCEPTION
      'entity_types: % (%.%) is relkind "%" — only base/partitioned tables may be registered as active entities. Views have no rows to own and no RLS. Either register the underlying table instead, or — if this view exists to carry its own permission scope (a "card" surface) — register it as relation_kind=''projection'' with projects_token set and audit_class=''machinery''. See db-rules §1.',
      NEW.token, NEW.schema_name, NEW.table_name, v_relkind
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- 3. Adopt the two views that exist today
-- ---------------------------------------------------------------------------
UPDATE platform.entity_types
   SET relation_kind = 'projection',
       projects_token = 'agent',
       audit_class = 'machinery',
       audit_class_reason = COALESCE(audit_class_reason,
         'Projection: agent.card is a security view over agent.definition. It owns no rows — it exists to carry the agent_card permission scope (view a card without editing the agent). Versioning, RLS and the base contract belong to the agent token; agent definitions are versioned by the certified custom store agent.definition_version.'),
       is_versioned = false
 WHERE token = 'agent_card';

INSERT INTO platform.entity_types
  (token, schema_name, table_name, label, is_component, rls_variant,
   relation_kind, projects_token, audit_class, audit_class_reason, is_versioned)
SELECT 'workflow_card', 'workflow', 'card', 'Workflow Card', true, 'component',
       'projection', 'workflow', 'machinery',
       'Projection: workflow.card is a security view over workflow.definition. It owns no rows — it exists to carry the workflow_card permission scope. Registered 2026-08-23; before this, every read of workflow.card raised "Unknown entity token: workflow_card".',
       false
WHERE EXISTS (SELECT 1 FROM platform.entity_types WHERE token='workflow' AND is_active)
  AND to_regclass('workflow.card') IS NOT NULL
ON CONFLICT (token) DO UPDATE
  SET relation_kind = 'projection', projects_token = 'workflow',
      audit_class = 'machinery', is_active = true, is_versioned = false;

-- ---------------------------------------------------------------------------
-- 4. Verify
-- ---------------------------------------------------------------------------
DO $$
DECLARE n int; v_bad text;
BEGIN
  -- The guard must be ARMED (the D233 restore had to disable it; prove it is back).
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='platform.entity_types'::regclass
                   AND tgname='_enforce_entity_is_table' AND tgenabled='O') THEN
    RAISE EXCEPTION 'ABORT: _enforce_entity_is_table is not armed';
  END IF;

  -- Both card views must now read without raising. These were the actual bugs.
  SELECT count(*) INTO n FROM agent.card;
  SELECT count(*) INTO n FROM workflow.card;

  -- Every projection must be a view, name a live base entity, and be machinery.
  SELECT string_agg(et.token, ', ') INTO v_bad
  FROM platform.entity_types et
  LEFT JOIN pg_class c ON c.oid = to_regclass(format('%I.%I', et.schema_name, et.table_name))
  WHERE et.relation_kind='projection' AND et.is_active
    AND (c.relkind NOT IN ('v','m') OR et.audit_class <> 'machinery'
         OR NOT EXISTS (SELECT 1 FROM platform.entity_types b
                        WHERE b.token=et.projects_token AND b.is_active AND b.relation_kind='table'));
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'malformed projection rows: %', v_bad;
  END IF;

  -- No projection may carry RLS policies or triggers (it cannot, but prove it).
  IF EXISTS (
    SELECT 1 FROM platform.entity_types et
    JOIN pg_policies p ON p.schemaname=et.schema_name AND p.tablename=et.table_name
    WHERE et.relation_kind='projection'
  ) THEN
    RAISE EXCEPTION 'a projection carries RLS policies';
  END IF;

  RAISE NOTICE 'OK: projections registered and both card views readable';
END $$;

COMMIT;
