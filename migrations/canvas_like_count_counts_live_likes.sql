-- based-on: public.update_canvas_like_count() c4c1315e10e3e208f7eef43c4df25e48f977f8f890b92068d91f02e499f09bec
-- Delete means archive (Arman, 2026-09-27): unliking a canvas now moves the
-- canvas.canvas_likes row to Trash (deleted_at) and liking again revives it
-- (upsert on the full (canvas_id, user_id) unique index with deleted_at null).
-- The denormalized shared_canvas_items.like_count must follow LIVE likes:
-- INSERT of a live like +1, DELETE of a live like -1, and an UPDATE that moves
-- deleted_at from null to set -1, from set to null +1.
CREATE OR REPLACE FUNCTION public.update_canvas_like_count()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.deleted_at IS NULL THEN
            UPDATE canvas.shared_canvas_items SET like_count = like_count + 1 WHERE id = NEW.canvas_id;
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        IF OLD.deleted_at IS NULL THEN
            UPDATE canvas.shared_canvas_items SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.canvas_id;
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
            UPDATE canvas.shared_canvas_items SET like_count = GREATEST(like_count - 1, 0) WHERE id = NEW.canvas_id;
        ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
            UPDATE canvas.shared_canvas_items SET like_count = like_count + 1 WHERE id = NEW.canvas_id;
        END IF;
    END IF;
    RETURN NULL;
END;
$function$;

CREATE OR REPLACE TRIGGER trigger_canvas_like_count
  AFTER INSERT OR DELETE OR UPDATE OF deleted_at ON canvas.canvas_likes
  FOR EACH ROW EXECUTE FUNCTION public.update_canvas_like_count();
