-- Complete the durable receipt boundary for initial and nullable writes.
-- based-on: communication._bound_dm_read_receipt() 7a41cef3884163303c123ead6cda6941900f55038de31425cdd007f36abb3a10
CREATE OR REPLACE FUNCTION communication._bound_dm_read_receipt()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- NULL is not a confirmed earlier message boundary.
    NEW.last_read_at := COALESCE(NEW.last_read_at, OLD.last_read_at);
    IF NEW.last_read_at IS NOT NULL THEN
      NEW.last_read_at := GREATEST(NEW.last_read_at, OLD.last_read_at);
    END IF;
  END IF;
  IF NEW.last_read_at IS NOT NULL THEN
    NEW.last_read_at := LEAST(NEW.last_read_at, statement_timestamp());
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER bound_initial_dm_read_receipt
BEFORE INSERT ON communication.dm_conversation_participants
FOR EACH ROW EXECUTE FUNCTION communication._bound_dm_read_receipt();
