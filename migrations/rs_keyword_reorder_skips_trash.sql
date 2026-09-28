-- based-on: public.reorder_keywords(uuid, uuid[]) 69ef2622407c39da7318e5dada1111d40f135715dcff0f9d5e3ec99096dedb76
-- Delete means archive (Arman, 2026-09-27): a keyword moved to Trash keeps its
-- row, and with it its (topic_id, position) slot under the deferred unique
-- constraint rs_keyword_topic_position_unique. The Keywords list now shows only
-- live keywords, so the reorder it sends names only live ids; renumbering those
-- 1..N could land on a slot an archived keyword still holds and fail at commit.
-- Every keyword of the topic the caller did not name (archived ones) is moved to
-- the positions after the named ones, in its existing order, in the same call.
CREATE OR REPLACE FUNCTION public.reorder_keywords(p_topic_id uuid, p_keyword_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_n int;
BEGIN
  IF p_keyword_ids IS NULL OR array_length(p_keyword_ids, 1) IS NULL THEN
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(p_keyword_ids) WITH ORDINALITY AS u(id, ord)
      LEFT JOIN research.rs_keyword k ON k.id = u.id AND k.topic_id = p_topic_id
     WHERE k.id IS NULL
  ) THEN
    RAISE EXCEPTION 'reorder_keywords: one or more ids do not belong to topic %', p_topic_id;
  END IF;
  v_n := array_length(p_keyword_ids, 1);
  UPDATE research.rs_keyword k SET position = u.ord
    FROM unnest(p_keyword_ids) WITH ORDINALITY AS u(id, ord)
   WHERE k.id = u.id AND k.topic_id = p_topic_id;
  -- The keywords not named (those in Trash) follow the named ones, in order.
  UPDATE research.rs_keyword k SET position = v_n + r.rn
    FROM (
      SELECT id, row_number() OVER (ORDER BY position, created_at, id) AS rn
        FROM research.rs_keyword
       WHERE topic_id = p_topic_id
         AND NOT (id = ANY (p_keyword_ids))
    ) r
   WHERE k.id = r.id;
END;
$function$;
