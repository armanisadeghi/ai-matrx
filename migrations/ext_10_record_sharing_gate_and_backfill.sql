-- ext_10_record_sharing_gate_and_backfill.sql
-- HRB-010 / C6 -- SPEC-EXTENSIBILITY 3.2 (allow_record_sharing) + 3.5 (backfill).
--
-- 🚨 RECORDED DECISION -- 3.2 and 6-C test 3 say "with allow_record_sharing = false, a
-- direct iam.has_access('custom_record', ...) grant confers nothing". Read against live
-- reality that is NOT achievable where the spec puts it: iam.apply_rls emits the
-- component std_select with an UNCONDITIONAL direct-grant arm (verified live on
-- workbench.udt_dataset_fields, which 3.2 cites as the precedent), and
-- iam.verify_canonical FAILs policies_canonical on ANY policy outside the generated set
-- -- so a hand-written companion policy would DECERTIFY the table. The gate therefore
-- lives at GRANT TIME: with allow_record_sharing = false the grant cannot be CREATED.
-- The observable outcome for a tenant is identical (no record is reachable below its
-- object) and the table stays canonical.
--
-- Note also verified live: workbench.udt_dataset_fields is NOT in
-- platform.shareable_resource_registry, so the "already demonstrates live" precedent 3.2
-- cites is currently INOPERATIVE -- db-rules 6c refuses any iam.permissions row for it.
-- ext_03 registers custom_record precisely so this lane does not inherit that dead end.
-- 3.2 owes both corrections.

CREATE OR REPLACE FUNCTION platform._custom_record_grant_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
AS $fn$
DECLARE v_allowed boolean; v_slug text;
BEGIN
  IF NEW.resource_type <> 'custom_record' THEN RETURN NEW; END IF;

  SELECT d.allow_record_sharing, d.slug INTO v_allowed, v_slug
    FROM platform.custom_record r
    JOIN platform.custom_entity_definition d ON d.id = r.entity_definition_id
   WHERE r.id = NEW.resource_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'iam.permissions: custom_record % does not exist', NEW.resource_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'iam.permissions: custom object % does not allow per-record sharing', v_slug
      USING ERRCODE = 'check_violation',
            HINT = 'Records track their custom object and hold no independent access identity. Share the OBJECT, or set allow_record_sharing = true on it first (SPEC-EXTENSIBILITY 3.2).';
  END IF;

  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS _custom_record_grant_guard_ins ON iam.permissions;
DROP TRIGGER IF EXISTS _custom_record_grant_guard_upd ON iam.permissions;
CREATE TRIGGER _custom_record_grant_guard_ins
  BEFORE INSERT ON iam.permissions FOR EACH ROW EXECUTE FUNCTION platform._custom_record_grant_guard();
CREATE TRIGGER _custom_record_grant_guard_upd
  BEFORE UPDATE OF resource_type, resource_id ON iam.permissions
  FOR EACH ROW EXECUTE FUNCTION platform._custom_record_grant_guard();

-- 3.5: editing a record_name_template does NOT rewrite history implicitly. It enqueues a
-- batched backfill; records written WHILE it runs already use the new template (the row
-- trigger renders on every write).
CREATE OR REPLACE FUNCTION platform._custom_entity_template_change()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF NEW.record_name_template IS DISTINCT FROM OLD.record_name_template THEN
    NEW.record_name_backfill_state := 'pending';
    NEW.record_name_backfill_done  := 0;
    NEW.record_name_backfill_error := NULL;
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS _template_change ON platform.custom_entity_definition;
CREATE TRIGGER _template_change
  BEFORE UPDATE OF record_name_template ON platform.custom_entity_definition
  FOR EACH ROW EXECUTE FUNCTION platform._custom_entity_template_change();

CREATE OR REPLACE FUNCTION platform.backfill_record_names(
  p_definition_id uuid, p_batch integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
AS $fn$
DECLARE
  v_defn  record;
  v_batch integer;
  v_first text;
  v_done  integer := 0;
  v_left  integer;
BEGIN
  SELECT * INTO v_defn FROM platform.custom_entity_definition WHERE id = p_definition_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'backfill_record_names: custom object % does not exist', p_definition_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  v_batch := COALESCE(p_batch, platform.extensibility_knob_int('custom_entities.record_name_backfill_batch'));

  SELECT d.field_key INTO v_first
    FROM platform.custom_field_definition d
   WHERE d.organization_id = v_defn.organization_id AND d.target_kind = 'custom_entity'
     AND d.target_definition_id = p_definition_id
     AND d.deleted_at IS NULL AND d.archived_at IS NULL
     AND d.field_type IN ('text','long_text')
   ORDER BY d.field_order, d.field_key LIMIT 1;

  WITH stale AS (
    SELECT r.id FROM platform.custom_record r
     WHERE r.entity_definition_id = p_definition_id
       AND r.deleted_at IS NULL
       AND r.record_name IS DISTINCT FROM
           platform.render_record_name(v_defn.record_name_template, r.data, v_first, r.id)
     ORDER BY r.id
     LIMIT v_batch
  )
  UPDATE platform.custom_record r
     SET record_name = platform.render_record_name(v_defn.record_name_template, r.data, v_first, r.id)
    FROM stale WHERE r.id = stale.id;
  GET DIAGNOSTICS v_done = ROW_COUNT;

  SELECT count(*) INTO v_left FROM platform.custom_record r
   WHERE r.entity_definition_id = p_definition_id AND r.deleted_at IS NULL
     AND r.record_name IS DISTINCT FROM
         platform.render_record_name(v_defn.record_name_template, r.data, v_first, r.id);

  UPDATE platform.custom_entity_definition
     SET record_name_backfill_state = CASE WHEN v_left = 0 THEN 'idle' ELSE 'running' END,
         record_name_backfill_done  = record_name_backfill_done + v_done
   WHERE id = p_definition_id;

  RETURN jsonb_build_object('definition_id', p_definition_id, 'updated', v_done,
                            'remaining', v_left, 'batch', v_batch);
END $fn$;

GRANT EXECUTE ON FUNCTION platform.backfill_record_names(uuid, integer) TO service_role;
