-- Applied live 2026-08-12 (hardening pass task_b4bd08d8, Arman-ratified in-session).
-- G2 of operations/db-hardening-proposals.md: an ACTIVE entity_types registration may
-- not point at the graveyard schema (doctrine §7: defect in both directions). Extends
-- platform._enforce_entity_is_table (the ratified relkind guard) — one trigger, one brain.
-- Grandfather: rows ALREADY active-in-graveyard stay editable and deactivatable
-- (4 live at apply time: cx_conversation_documents, share_link, skill_category,
-- shortcut_category — their keep-or-kill stays on their owners' queue).
-- Effect on the graveyard flow: DEACTIVATE the registration BEFORE the SET SCHEMA move
-- (the DDL-sync trigger's repoint into graveyard now errors on a still-active row).
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
  IF v_relkind NOT IN ('r', 'p') THEN
    RAISE EXCEPTION
      'entity_types: % (%.%) is relkind "%" — only base/partitioned tables may be registered as active entities. Views have no rows to own and no RLS; register the underlying table instead, or leave the view out of the registry.',
      NEW.token, NEW.schema_name, NEW.table_name, v_relkind
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
