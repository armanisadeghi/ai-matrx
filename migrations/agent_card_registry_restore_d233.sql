-- agent_card_registry_restore_d233.sql
--
-- HOTFIX. Restores the `agent_card` row in platform.entity_types (and its
-- composition edge), which was DELETED on 2026-08-21 while clearing the
-- versioned-without-capture backlog. Deleting it took a live surface down.
--
-- WHAT BROKE. agent.card is a security VIEW over agent.definition whose own
-- WHERE clause ends in `has_permission('agent_card', id, 'viewer')`.
-- public.has_permission_for() opens with:
--     if not exists (select 1 from platform.entity_types e
--                    where e.token = p_resource_type and e.is_active)
--     then raise exception 'Unknown entity token: %...'
-- so with the row gone, EVERY read of agent.card raises P0001. Verified live:
--     select count(*) from agent.card;
--     ERROR: Unknown entity token: agent_card. Bare table names are not permission keys.
-- The surface is genuinely in use: platform.shareable_resource_registry still
-- carries an is_active=true row routing agent_card -> agent.card, and
-- iam.permissions still holds 2 live grants on resource_type='agent_card'.
--
-- WHY THE GUARD HAS TO BE STEPPED AROUND. platform._enforce_entity_is_table
-- refuses any ACTIVE row whose relation is relkind='v'. That guard is correct
-- in general and we are NOT weakening it -- but `agent_card` is not a new
-- registration, it is a pre-existing permission key that the permission
-- function requires to be registered AND active. Until that design question is
-- settled (see below), the only states available are "registered and working"
-- or "deregistered and throwing". This migration restores the former: it is a
-- REVERT to the state that ran in production for months, not a new design.
--
-- Values are the canonical ones from the original registration in
-- migrations/wave_d1_entity_types_register_and_token_renames.sql
-- (token/schema/table/label/is_component), everything else column defaults --
-- EXCEPT is_versioned, which is set FALSE. That part of the 2026-08-21 change
-- was right: a view cannot carry a capture trigger, and agent definitions are
-- already versioned by the certified custom store agent.definition_version.
--
-- STILL OPEN FOR ARMAN (matrx-frontend FOUND_DEFECTS D233): whether the
-- permanent answer is (a) teach has_permission_for to accept a token that is
-- registered as a pure permission surface, (b) repoint agent_card at
-- agent.definition (blocked today by UNIQUE(schema_name, table_name), which
-- `agent` already holds), or (c) drop the has_permission arm from the view and
-- accept the loss of explicit-share visibility on agent cards.
--
-- Idempotent. Safe to re-run.

BEGIN;

DO $$
DECLARE
  v_relkind "char";
BEGIN
  -- Only meaningful while agent.card is still a view; if it ever becomes a
  -- real table this whole dance is unnecessary and the plain insert works.
  SELECT c.relkind INTO v_relkind
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'agent' AND c.relname = 'card';

  IF v_relkind IS NULL THEN
    RAISE EXCEPTION 'ABORT: agent.card does not exist';
  END IF;

  IF v_relkind IN ('r','p') THEN
    INSERT INTO platform.entity_types (token, schema_name, table_name, label, is_component, rls_variant, is_versioned)
    VALUES ('agent_card','agent','card','Agent Card', true, 'component', false)
    ON CONFLICT (token) DO UPDATE SET is_active = true;
  ELSE
    -- View: step around platform._enforce_entity_is_table for this one insert.
    ALTER TABLE platform.entity_types DISABLE TRIGGER _enforce_entity_is_table;
    BEGIN
      INSERT INTO platform.entity_types (token, schema_name, table_name, label, is_component, rls_variant, is_versioned)
      VALUES ('agent_card','agent','card','Agent Card', true, 'component', false)
      ON CONFLICT (token) DO UPDATE SET is_active = true, is_versioned = false;
    EXCEPTION WHEN OTHERS THEN
      ALTER TABLE platform.entity_types ENABLE TRIGGER _enforce_entity_is_table;
      RAISE;
    END;
    ALTER TABLE platform.entity_types ENABLE TRIGGER _enforce_entity_is_table;
  END IF;
END $$;

-- Restore the composition edge deleted alongside the row
-- (original: agent_card -> agent on fk_column 'id', same source migration).
INSERT INTO platform.entity_relationships (child_type, parent_type, fk_column, kind)
SELECT 'agent_card', 'agent', 'id', 'composition'
WHERE NOT EXISTS (
  SELECT 1 FROM platform.entity_relationships
  WHERE child_type = 'agent_card' AND parent_type = 'agent'
);

-- ---------------------------------------------------------------------------
-- Verify: the guard must still be ARMED, and agent.card must read again.
-- ---------------------------------------------------------------------------
DO $$
DECLARE n int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM platform.entity_types WHERE token='agent_card' AND is_active) THEN
    RAISE EXCEPTION 'agent_card row not restored';
  END IF;

  IF EXISTS (SELECT 1 FROM platform.entity_types WHERE token='agent_card' AND is_versioned) THEN
    RAISE EXCEPTION 'agent_card must not be is_versioned (agent.card is a view)';
  END IF;

  -- tgenabled 'O' = enabled (origin). Anything else means we left it disabled.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'platform.entity_types'::regclass
      AND tgname = '_enforce_entity_is_table' AND tgenabled = 'O'
  ) THEN
    RAISE EXCEPTION 'ABORT: _enforce_entity_is_table left disabled';
  END IF;

  -- The actual regression test: this raised P0001 before the fix.
  SELECT count(*) INTO n FROM agent.card;
  RAISE NOTICE 'OK: agent.card readable again (% rows visible to this role)', n;
END $$;

COMMIT;
