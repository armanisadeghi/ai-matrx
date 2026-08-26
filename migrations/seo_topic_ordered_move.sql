-- One atomic hierarchy move for the offering tree: reparent the complete
-- subtree, then persist the exact destination sibling order in topic metadata.
-- Idempotent. Applied via Supabase MCP; ledgered in public._schema_migrations.

SET lock_timeout = '8s';

CREATE OR REPLACE FUNCTION seo.gsc_topic_move(
  p_site_id uuid,
  p_topic_id uuid,
  p_sibling_order uuid[],
  p_parent_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = seo, web, iam, platform, public, pg_temp
AS $$
DECLARE
  v_expected uuid[];
  v_supplied uuid[];
BEGIN
  -- The existing pinning function remains the single cycle, existence, and
  -- site-editor guard. A later exception rolls this change back atomically.
  PERFORM seo.gsc_topic_set_parent(p_site_id, p_topic_id, p_parent_id);

  IF p_sibling_order IS NULL OR cardinality(p_sibling_order) = 0 THEN
    RAISE EXCEPTION
      'seo_topic_order_invalid: sibling order is required';
  END IF;

  SELECT array_agg(t.id ORDER BY t.id)
  INTO v_expected
  FROM seo.topic t
  WHERE t.deleted_at IS NULL
    AND t.parent_id IS NOT DISTINCT FROM p_parent_id;

  SELECT array_agg(item.id ORDER BY item.id)
  INTO v_supplied
  FROM unnest(p_sibling_order) AS item(id);

  IF v_expected IS DISTINCT FROM v_supplied THEN
    RAISE EXCEPTION
      'seo_topic_order_invalid: sibling order must contain every destination sibling exactly once';
  END IF;

  WITH ranked AS (
    SELECT item.id, item.ordinality::integer AS tree_order
    FROM unnest(p_sibling_order) WITH ORDINALITY AS item(id, ordinality)
  )
  UPDATE seo.topic AS topic
  SET metadata = jsonb_set(
        COALESCE(topic.metadata, '{}'::jsonb),
        '{tree_order}',
        to_jsonb(ranked.tree_order),
        true
      ),
      updated_at = now(),
      updated_by = (SELECT auth.uid())
  FROM ranked
  WHERE topic.id = ranked.id;

  RETURN p_topic_id;
END;
$$;

REVOKE ALL ON FUNCTION seo.gsc_topic_move(uuid, uuid, uuid[], uuid) FROM public;
GRANT EXECUTE ON FUNCTION seo.gsc_topic_move(uuid, uuid, uuid[], uuid) TO authenticated;

COMMENT ON FUNCTION seo.gsc_topic_move(uuid, uuid, uuid[], uuid) IS
  'Cycle-guarded offering-tree move that keeps descendants attached and persists the complete destination sibling order in metadata.tree_order.';
