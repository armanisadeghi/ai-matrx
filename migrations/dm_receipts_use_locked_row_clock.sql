-- A statement can begin before waiting for another writer's row lock.
-- Clamp the incoming device value at trigger execution, then retain OLD's
-- confirmed boundary, so a delayed statement cannot reverse a newer receipt.
-- based-on: communication._bound_dm_read_receipt() a15ba57721239321c6bbaf398a40a783e8e0e331507c216ff24264b2669368a5
CREATE OR REPLACE FUNCTION communication._bound_dm_read_receipt()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.last_read_at IS NOT NULL THEN
    NEW.last_read_at := LEAST(NEW.last_read_at, clock_timestamp());
  END IF;
  IF TG_OP = 'UPDATE' THEN
    NEW.last_read_at := GREATEST(NEW.last_read_at, OLD.last_read_at);
  END IF;
  RETURN NEW;
END;
$$;
