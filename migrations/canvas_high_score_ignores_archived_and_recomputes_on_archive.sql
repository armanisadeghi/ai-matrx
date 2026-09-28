-- chair-step: replaces the trigger_canvas_high_score trigger (DROP + CREATE, same statement,
-- no window where neither exists) to add UPDATE OF deleted_at to its event list alongside the
-- existing AFTER INSERT — a bug fix for a trigger that never recomputed a canvas's high score /
-- average / attempt count when a score was archived or restored. The old trigger is fully
-- replaced, not run alongside a new one, so there is no unguarded old path left standing.
-- Bug: public.update_canvas_high_score() (trigger on canvas.canvas_scores) counted archived
-- scores (deleted_at set) into average_score/total_attempts/high_score, and the trigger only
-- fired AFTER INSERT — so archiving or restoring a score (canvas.set_canvas_like's sibling
-- pattern: archive-not-delete) never re-derived the canvas's stats at all, leaving a phantom
-- score baked into the average and, if it happened to be the top score, a dead high_score_user.
--
-- Fix: the function now recomputes high_score / high_score_user / total_attempts /
-- average_score from scratch over canvas.canvas_scores WHERE deleted_at IS NULL for the
-- affected canvas_id (same "skip Trash" pattern as update_canvas_like_count /
-- update_canvas_comment_count), and the trigger fires on INSERT or on UPDATE OF deleted_at so
-- archiving or restoring a score recomputes the canvas's stats.
--
-- based-on: public.update_canvas_high_score() 2475ad8f6491a76666f98096868db227d7c96f2673a4fb3fb8c1a0595ca3c5ea
-- based-on: trigger trigger_canvas_high_score on canvas.canvas_scores 42f0c8e6260607c97ffb7fd63298f73933095e6b7f35a844a7843d2aa38ec2ba

CREATE OR REPLACE FUNCTION public.update_canvas_high_score()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_canvas_id uuid := COALESCE(NEW.canvas_id, OLD.canvas_id);
    v_high_score integer;
    v_high_score_user uuid;
    v_total_attempts integer;
    v_average_score numeric;
BEGIN
    SELECT s.score, s.user_id
      INTO v_high_score, v_high_score_user
      FROM canvas.canvas_scores s
     WHERE s.canvas_id = v_canvas_id AND s.deleted_at IS NULL
     ORDER BY s.score DESC, s.created_at ASC
     LIMIT 1;

    SELECT COUNT(*), AVG(score)
      INTO v_total_attempts, v_average_score
      FROM canvas.canvas_scores
     WHERE canvas_id = v_canvas_id AND deleted_at IS NULL;

    UPDATE canvas.shared_canvas_items
       SET high_score = v_high_score,
           high_score_user = v_high_score_user,
           total_attempts = COALESCE(v_total_attempts, 0),
           average_score = v_average_score
     WHERE id = v_canvas_id;

    RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trigger_canvas_high_score ON canvas.canvas_scores;
CREATE TRIGGER trigger_canvas_high_score
    AFTER INSERT OR UPDATE OF deleted_at ON canvas.canvas_scores
    FOR EACH ROW EXECUTE FUNCTION update_canvas_high_score();
