-- dd154 rollback-only live probes. Append these bytes after DD154 in the same
-- sanctioned ledgered apply transaction. This file deliberately has no
-- BEGIN/COMMIT: every probe opens and rolls back its own nested subtransaction.
-- It creates no persistent object and does not read or alter application rows.

DO $dd154_positive$
DECLARE
  v_rolled_back boolean := false;
BEGIN
  BEGIN
    CREATE TEMP TABLE dd154_probe_positive (organization_id uuid NOT NULL) ON COMMIT DROP;
    CREATE FUNCTION pg_temp.dd154_probe_validate() RETURNS trigger LANGUAGE plpgsql AS $fn$
    BEGIN
      IF NEW.organization_id IS NULL THEN
        RAISE EXCEPTION 'organization_id is required' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END
    $fn$;
    CREATE TRIGGER dd154_probe_validate BEFORE INSERT ON dd154_probe_positive
      FOR EACH ROW EXECUTE FUNCTION pg_temp.dd154_probe_validate();
    INSERT INTO dd154_probe_positive(organization_id)
      VALUES ('11111111-1111-1111-1111-111111111111'::uuid);
    IF (SELECT count(*) FROM dd154_probe_positive) <> 1 THEN
      RAISE EXCEPTION 'dd154 rollback probe: explicit writer was not persisted in its temporary relation';
    END IF;
    -- This sentinel is intentionally distinct from assertion failures (P0001)
    -- so a broken positive probe cannot catch and bless its own failure.
    RAISE EXCEPTION 'dd154 rollback-only positive probe complete' USING ERRCODE = 'PDD54';
  EXCEPTION WHEN SQLSTATE 'PDD54' THEN
    v_rolled_back := true;
  END;
  IF NOT v_rolled_back OR to_regclass('pg_temp.dd154_probe_positive') IS NOT NULL
     OR to_regprocedure('pg_temp.dd154_probe_validate()') IS NOT NULL THEN
    RAISE EXCEPTION 'dd154 rollback probe: positive temporary objects survived';
  END IF;
END
$dd154_positive$;

DO $dd154_new_default$
DECLARE
  v_rejected boolean := false;
BEGIN
  BEGIN
    CREATE TEMP TABLE dd154_probe_new_default (
      organization_id uuid NOT NULL DEFAULT gen_random_uuid()
    ) ON COMMIT DROP;
  EXCEPTION WHEN SQLSTATE '23514' THEN
    v_rejected := true;
  END;
  IF NOT v_rejected OR to_regclass('pg_temp.dd154_probe_new_default') IS NOT NULL THEN
    RAISE EXCEPTION 'dd154 rollback probe: new organization default was not rejected with 23514 and rolled back';
  END IF;
END
$dd154_new_default$;

DO $dd154_direct$
DECLARE
  v_rejected boolean := false;
BEGIN
  BEGIN
    CREATE FUNCTION pg_temp.dd154_probe_direct() RETURNS trigger LANGUAGE plpgsql AS $fn$
    BEGIN
      NEW.U&"organizat\0069on_id" := gen_random_uuid();
      RETURN NEW;
    END
    $fn$;
  EXCEPTION WHEN SQLSTATE '23514' THEN
    v_rejected := true;
  END;
  IF NOT v_rejected OR to_regprocedure('pg_temp.dd154_probe_direct()') IS NOT NULL THEN
    RAISE EXCEPTION 'dd154 rollback probe: Unicode direct assignment was not rejected with 23514 and rolled back';
  END IF;
END
$dd154_direct$;

DO $dd154_known_attachment$
DECLARE
  v_rejected boolean := false;
BEGIN
  BEGIN
    CREATE TEMP TABLE dd154_probe_known_attachment (organization_id uuid NOT NULL) ON COMMIT DROP;
    CREATE TRIGGER dd154_probe_known_attachment BEFORE INSERT ON dd154_probe_known_attachment
      FOR EACH ROW EXECUTE FUNCTION public._stamp_org_default();
  EXCEPTION WHEN SQLSTATE '23514' THEN
    v_rejected := true;
  END;
  IF NOT v_rejected OR to_regclass('pg_temp.dd154_probe_known_attachment') IS NOT NULL THEN
    RAISE EXCEPTION 'dd154 rollback probe: known assignment attachment was not rejected with 23514 and rolled back';
  END IF;
END
$dd154_known_attachment$;

DO $dd154_provisioner$
DECLARE
  v_refused boolean := false;
BEGIN
  BEGIN
    PERFORM platform.create_entity_table(
      'pg_temp', 'dd154_probe_provisioner_true', 'dd154_probe_provisioner_true', 'DD154 rollback probe',
      ARRAY[]::text[], 'entity', false, false, 'none', false, false, true, false, NULL
    );
  EXCEPTION WHEN OTHERS THEN
    v_refused := SQLERRM = 'create_entity_table: p_org_default=true is forbidden';
  END;
  IF NOT v_refused OR to_regclass('pg_temp.dd154_probe_provisioner_true') IS NOT NULL THEN
    RAISE EXCEPTION 'dd154 rollback probe: p_org_default=true did not refuse before a relation side effect';
  END IF;
END
$dd154_provisioner$;
