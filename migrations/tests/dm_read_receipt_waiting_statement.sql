-- Exercise the live trigger body with an OLD boundary newer than this statement.
-- This is the shape seen after a statement waits for a newer writer's row lock.
BEGIN;
CREATE TEMP TABLE delayed_receipt_probe (last_read_at timestamptz);
INSERT INTO delayed_receipt_probe VALUES (clock_timestamp());
CREATE TEMP TABLE delayed_receipt_before AS SELECT last_read_at FROM delayed_receipt_probe;
CREATE TRIGGER delayed_receipt_boundary BEFORE UPDATE OF last_read_at ON delayed_receipt_probe
FOR EACH ROW EXECUTE FUNCTION communication._bound_dm_read_receipt();
GRANT SELECT,UPDATE ON delayed_receipt_probe TO authenticated;
GRANT SELECT ON delayed_receipt_before TO authenticated;
SET LOCAL ROLE authenticated;
UPDATE delayed_receipt_probe SET last_read_at=statement_timestamp()-interval '1 minute';
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM delayed_receipt_probe p CROSS JOIN delayed_receipt_before b
   WHERE p.last_read_at IS DISTINCT FROM b.last_read_at) THEN
   RAISE EXCEPTION 'A delayed statement reversed a newer confirmed receipt';
 END IF;
END $$;
RESET ROLE;
ROLLBACK;
