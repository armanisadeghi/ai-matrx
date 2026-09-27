-- based-on: public.resolve_share_token(text) eb3179fae79a7a87ad256256d22302ef88e37f364c8b98647643c90e317d5c44
--
-- Access ladder T-19 — a shared AI chat shows its messages.
--
-- An Anyone link to a `conversation` resolved through `resolve_share_token`
-- served only the registry's `public_columns` (title, description, …), so the
-- link holder saw a title and no conversation. Children inherit their parent
-- (common-docs/policies/access-ladder.md): the messages of a shared chat are
-- part of what was shared.
--
-- One extension point, no second sharing system: `resolve_share_token` keeps
-- every check it had (active, expiry, type still link-shareable, row exists,
-- not deleted, use limit) and, only after they all pass, attaches
-- `children` from `platform.share_link_children(type, id)` — a per-type
-- projection of what a link holder may see beneath the record.
--
-- The conversation projection is deliberately narrow:
--   * visible messages only (`is_visible_to_user`, status active/edited, not
--     deleted), roles user + assistant;
--   * text blocks verbatim; thinking blocks (and their provider signatures)
--     never; a tool call becomes {type:'tool', name} — never its arguments or
--     its result payload;
--   * media blocks carry kind/title/size and a URL ONLY when it is already a
--     public CDN URL (cdn.matrxserver.com); a private file is named, not served;
--   * capped at 500 messages with an honest `truncated` flag.
-- `platform.share_link_children` is SECURITY INVOKER, so it grants nothing by
-- itself: called directly by a client it runs under that caller's own RLS on
-- chat.message and returns only what the caller could already read. Its reach
-- beyond RLS exists only inside the SECURITY DEFINER resolver, after the token
-- checks.

CREATE OR REPLACE FUNCTION platform.share_link_children(p_resource_type text, p_resource_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO ''
AS $function$
DECLARE
  v_limit constant integer := 500;
  v_total integer;
  v_messages jsonb;
BEGIN
  IF p_resource_type = 'conversation' THEN
    SELECT count(*) INTO v_total
      FROM chat.message m
     WHERE m.conversation_id = p_resource_id
       AND m.deleted_at IS NULL
       AND COALESCE(m.is_visible_to_user, true)
       AND COALESCE(m.status, 'active') IN ('active', 'edited')
       AND m.role IN ('user', 'assistant');

    SELECT COALESCE(jsonb_agg(msg ORDER BY pos), '[]'::jsonb) INTO v_messages
    FROM (
      SELECT m.position AS pos,
             jsonb_build_object(
               'id', m.id,
               'role', m.role,
               'created_at', m.created_at,
               'blocks', COALESCE((
                 SELECT jsonb_agg(pb ORDER BY ord)
                 FROM (
                   SELECT b.ord,
                     CASE b.blk->>'type'
                       WHEN 'text' THEN
                         CASE WHEN COALESCE(b.blk->>'text', '') <> ''
                              THEN jsonb_build_object('type', 'text', 'text', b.blk->>'text') END
                       WHEN 'tool_call' THEN
                         jsonb_build_object('type', 'tool', 'name', COALESCE(b.blk->>'name', 'tool'))
                       WHEN 'media' THEN
                         jsonb_build_object(
                           'type', 'media',
                           'kind', COALESCE(b.blk->>'kind', 'file'),
                           'title', COALESCE(b.blk->'metadata'->>'display_title', b.blk->>'file_name'),
                           'mime_type', b.blk->>'mime_type',
                           'width', b.blk->'width',
                           'height', b.blk->'height',
                           'url', (
                             SELECT u FROM unnest(ARRAY[b.blk->>'cdn_url', b.blk->>'url']) u
                              WHERE u LIKE 'https://cdn.matrxserver.com/%'
                              LIMIT 1))
                       ELSE NULL
                     END AS pb
                   FROM jsonb_array_elements(
                          CASE WHEN jsonb_typeof(m.content) = 'array' THEN m.content ELSE '[]'::jsonb END
                        ) WITH ORDINALITY AS b(blk, ord)
                 ) projected
                 WHERE pb IS NOT NULL
               ), '[]'::jsonb)
             ) AS msg
        FROM chat.message m
       WHERE m.conversation_id = p_resource_id
         AND m.deleted_at IS NULL
         AND COALESCE(m.is_visible_to_user, true)
         AND COALESCE(m.status, 'active') IN ('active', 'edited')
         AND m.role IN ('user', 'assistant')
       ORDER BY m.position
       LIMIT v_limit
    ) rows;

    RETURN jsonb_build_object(
      'kind', 'conversation_messages',
      'messages', v_messages,
      'total', v_total,
      'truncated', v_total > v_limit);
  END IF;
  RETURN NULL;
END;
$function$;

COMMENT ON FUNCTION platform.share_link_children(text, uuid) IS
  'Per-type projection of what an Anyone-link holder sees beneath a shared record (children inherit their parent). SECURITY INVOKER: its reach beyond the caller''s RLS exists only inside public.resolve_share_token, after every token check. conversation → visible user/assistant messages: text, tool names (no arguments/results), public-CDN media. Access ladder T-19.';

CREATE OR REPLACE FUNCTION public.resolve_share_token(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_link record; v_resolved record; v_full jsonb; v_allowed text[]; v_row jsonb; v_newcount integer; v_shareable boolean; v_children jsonb;
BEGIN
  SELECT * INTO v_link FROM platform.share_links WHERE token = p_token;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'not_found', 'message', 'This link is invalid.'); END IF;
  IF NOT v_link.is_active THEN RETURN jsonb_build_object('success', false, 'error', 'revoked', 'message', 'This link has been turned off by its owner.'); END IF;
  IF v_link.expires_at IS NOT NULL AND v_link.expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'expired', 'message', 'This link has expired.'); END IF;
  BEGIN SELECT * INTO STRICT v_resolved FROM public.resolve_shareable_resource(v_link.resource_type);
  EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success', false, 'error', 'unknown_type', 'message', 'This item type can no longer be shared.'); END;
  SELECT COALESCE(is_link_shareable, false), COALESCE(public_columns, '{}') INTO v_shareable, v_allowed
    FROM platform.shareable_resource_registry WHERE resource_type = v_link.resource_type;
  IF NOT v_shareable THEN RETURN jsonb_build_object('success', false, 'error', 'disabled', 'message', 'Public sharing is turned off for this item type.'); END IF;
  EXECUTE format('SELECT to_jsonb(t) FROM %I.%I t WHERE t.%I = $1', v_resolved.schema_name, v_resolved.table_name, v_resolved.id_column) INTO v_full USING v_link.resource_id;
  IF v_full IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'gone', 'message', 'The shared item no longer exists.'); END IF;
  IF (v_full ? 'deleted_at') AND (v_full->>'deleted_at') IS NOT NULL THEN RETURN jsonb_build_object('success', false, 'error', 'gone', 'message', 'The shared item was deleted.'); END IF;
  v_allowed := array_append(v_allowed, v_resolved.id_column);
  SELECT COALESCE(jsonb_object_agg(e.key, e.value), '{}'::jsonb) INTO v_row FROM jsonb_each(v_full) e WHERE e.key = ANY(v_allowed);
  UPDATE platform.share_links SET use_count = use_count + 1, last_used_at = now()
   WHERE id = v_link.id AND (max_uses IS NULL OR use_count < max_uses) RETURNING use_count INTO v_newcount;
  IF v_newcount IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'exhausted', 'message', 'This link has reached its view limit.'); END IF;
  -- Children inherit their parent (access ladder T-19): only after every check above passed.
  v_children := platform.share_link_children(v_link.resource_type, v_link.resource_id);
  RETURN jsonb_build_object('success', true, 'resource_type', v_link.resource_type, 'resource_id', v_link.resource_id,
    'permission_level', v_link.permission_level, 'display_label', v_resolved.display_label,
    'url_path_template', v_resolved.url_path_template, 'resource', v_row, 'children', v_children);
END; $function$;
