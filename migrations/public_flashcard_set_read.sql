-- get_public_flashcard_set — anon, id-addressed public read for the /p/e lane.
--
-- The indexable public viewer (app/(public)/p/e/fc_set/[id]) needs a flashcard
-- set + its ordered cards with NO sign-in, for SEO + the community-library
-- browse lane (P6-C). It is the id-addressed twin of resolve_share_token (which
-- is token-addressed): the authorization is the set's own visibility='public',
-- not a token. Returns nothing for private / soft-deleted / missing sets, so a
-- private set 404s at the route.
--
-- SECURITY DEFINER so it can read cards regardless of per-card visibility (a
-- public set owns its cards); it only ever exposes a set the OWNER marked public,
-- and strips nothing sensitive (flashcards have no secret columns). Anon-callable.

CREATE OR REPLACE FUNCTION public.get_public_flashcard_set(p_set_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'education', 'platform'
AS $function$
DECLARE
  v_set education.fc_set;
  v_cards jsonb;
BEGIN
  SELECT * INTO v_set
  FROM education.fc_set
  WHERE id = p_set_id
    AND deleted_at IS NULL
    AND visibility = 'public'::platform.visibility;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_public');
  END IF;

  SELECT COALESCE(jsonb_agg(card ORDER BY pos NULLS LAST, ord), '[]'::jsonb)
    INTO v_cards
  FROM (
    SELECT
      a.position AS pos,
      row_number() OVER (ORDER BY a.position NULLS LAST, a.created_at, c.id) AS ord,
      jsonb_build_object(
        'id', c.id,
        'front', c.front,
        'back', c.back,
        'card_kind', c.card_kind,
        'difficulty', c.difficulty,
        'topic', c.topic,
        'lesson', c.lesson,
        'position', a.position
      ) AS card
    FROM platform.associations a
    JOIN education.fc_card c
      ON c.id = a.source_id AND c.deleted_at IS NULL
    WHERE a.target_type = 'fc_set'
      AND a.target_id = p_set_id
      AND a.source_type = 'fc_card'
      AND a.role = 'member'
  ) sub;

  RETURN jsonb_build_object(
    'success', true,
    'set', jsonb_build_object(
      'id', v_set.id,
      'name', v_set.name,
      'description', v_set.description,
      'topic', v_set.topic,
      'lesson', v_set.lesson,
      'difficulty', v_set.difficulty,
      'created_at', v_set.created_at,
      'card_count', jsonb_array_length(v_cards)
    ),
    'cards', v_cards
  );
END
$function$;

REVOKE ALL ON FUNCTION public.get_public_flashcard_set(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_public_flashcard_set(uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.get_public_flashcard_set(uuid) IS
  'Anon id-addressed public read for the /p/e/fc_set/[id] indexable viewer. Returns a public flashcard set + ordered cards; nothing for private/deleted/missing. Twin of resolve_share_token (token-addressed).';
