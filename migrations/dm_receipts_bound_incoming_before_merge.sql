-- A receipt request cannot have observed a message committed after it began.
-- Bound the incoming value at statement start, then retain an already-confirmed
-- OLD boundary. This also preserves newer receipts when a statement waited.
-- based-on: communication._bound_dm_read_receipt() 222030aa5f03216254984852ca9f746d982217f639dec26afcde1bb336c10d40
CREATE OR REPLACE FUNCTION communication._bound_dm_read_receipt()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.last_read_at IS NOT NULL THEN
    NEW.last_read_at := LEAST(NEW.last_read_at, statement_timestamp());
  END IF;
  IF TG_OP = 'UPDATE' THEN
    NEW.last_read_at := GREATEST(NEW.last_read_at, OLD.last_read_at);
  END IF;
  RETURN NEW;
END;
$$;
