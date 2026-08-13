-- Applied live 2026-08-12 via Supabase MCP (migration: entity_types_enforce_base_table).
-- Postgres-enforced: an ACTIVE entity_types registration must point at a base or
-- partitioned table. Views/matviews/foreign tables have no rows to own, no RLS,
-- and no base contract — registering one produces fake gate FAILs and fake UI
-- errors (the agent.card incident, 15 fake FAILs; the planner derived-view bug).
-- Enforcement over documentation: trying it now ERRORS instead of quietly rotting.
-- Deactivation (is_active=false) of a bad historical row remains allowed so
-- cleanup is never blocked.
CREATE OR REPLACE FUNCTION platform._enforce_entity_is_table()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_oid oid;
  v_relkind "char";
BEGIN
  IF NOT NEW.is_active THEN
    RETURN NEW;  -- deactivating/cleaning up is always allowed
  END IF;
  v_oid := to_regclass(format('%I.%I', NEW.schema_name, NEW.table_name));
  IF v_oid IS NULL THEN
    RETURN NEW;  -- unresolvable = stale-registry lane, not this guard's job
  END IF;
  SELECT relkind INTO v_relkind FROM pg_class WHERE oid = v_oid;
  IF v_relkind NOT IN ('r', 'p') THEN
    RAISE EXCEPTION
      'entity_types: % (%.%) is relkind "%" — only base/partitioned tables may be registered as active entities. Views have no rows to own and no RLS; register the underlying table instead, or leave the view out of the registry.',
      NEW.token, NEW.schema_name, NEW.table_name, v_relkind
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS _enforce_entity_is_table ON platform.entity_types;
CREATE TRIGGER _enforce_entity_is_table
  BEFORE INSERT OR UPDATE ON platform.entity_types
  FOR EACH ROW EXECUTE FUNCTION platform._enforce_entity_is_table();
