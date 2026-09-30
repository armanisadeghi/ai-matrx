-- Read receipts are durable server-message boundaries, never device clocks.
-- Keep concurrent/stale clients from moving them backwards or into the future.
CREATE OR REPLACE FUNCTION communication._bound_dm_read_receipt()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.last_read_at IS NOT NULL THEN
    NEW.last_read_at := LEAST(
      GREATEST(NEW.last_read_at, OLD.last_read_at),
      statement_timestamp()
    );
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER bound_dm_read_receipt
BEFORE UPDATE OF last_read_at ON communication.dm_conversation_participants
FOR EACH ROW EXECUTE FUNCTION communication._bound_dm_read_receipt();
