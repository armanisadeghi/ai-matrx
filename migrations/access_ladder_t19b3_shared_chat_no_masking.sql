-- based-on: platform.share_link_children(text, uuid) 727fdcb4336f82b1e3bd875507b6f1944ec042d9ba623105d013ca3f2c31337f
-- based-on: platform.share_redact(jsonb) 4ac3ec3771bc80bd4fd25f4cc10459f74df2e2b1be32758472049d31d82d36e0
-- chair-step: drops platform.share_redact, the masking function the access-ladder law forbids (no data, no table); its only caller, platform.share_link_children, is replaced earlier in this same file
--
-- Access ladder T-19b (step 3) — a shared chat serves its tool steps as
-- written; no masking pass.
--
-- T-19b step 1 added `platform.share_redact`, a regex / key-name scrubber over
-- tool arguments and outputs. The access-ladder law forbids exactly that
-- ("Known weakness: protected content in plain text": no scrubbing pass, no
-- masking regex; build the whole primitive — encrypt-before-write, T-23 — or
-- change nothing). This removes it. What stays is withholding BY TYPE, which
-- follows existing rules and never inspects content:
--   * credential / vault / secure-delivery / secret / environment tools
--     (platform.share_tool_is_withheld) → name + status only;
--   * every coding-session step (tool_type = 'coding_agent') → name + status
--     only; a coding session's raw log stays owner-only;
--   * only named columns of chat.tool_call are projected; protected
--     (hashed / encrypted) fields are never served.
-- The remaining exposure (secrets a person pastes into a chat, or a tool
-- prints into its output, are served as written) is named in
-- common-docs/operations/go-live-gates.md, "Protected content written in plain
-- text", closed by T-23.

CREATE OR REPLACE FUNCTION platform.share_link_children(p_resource_type text, p_resource_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE
  v_limit constant integer := 500;
  v_output_cap constant integer := 60000;
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
                       WHEN 'tool_call' THEN (
                         SELECT CASE
                           WHEN platform.share_tool_is_withheld(COALESCE(tc.tool_name, b.blk->>'name'))
                                OR tc.tool_type = 'coding_agent' THEN
                             jsonb_build_object(
                               'type', 'tool',
                               'call_id', COALESCE(b.blk->>'call_id', b.blk->>'id'),
                               'name', COALESCE(tc.tool_name, b.blk->>'name', 'tool'),
                               'name_as_called', tc.tool_name_as_called,
                               'status', COALESCE(tc.status, 'completed'),
                               'is_error', COALESCE(tc.is_error, false),
                               'started_at', tc.started_at,
                               'completed_at', tc.completed_at,
                               'withheld', true)
                           ELSE
                             jsonb_build_object(
                               'type', 'tool',
                               'call_id', COALESCE(b.blk->>'call_id', b.blk->>'id'),
                               'name', COALESCE(tc.tool_name, b.blk->>'name', 'tool'),
                               'name_as_called', tc.tool_name_as_called,
                               'status', COALESCE(tc.status, 'completed'),
                               'is_error', COALESCE(tc.is_error, false),
                               'error_type', tc.error_type,
                               'error_message', to_jsonb(tc.error_message),
                               'started_at', tc.started_at,
                               'completed_at', tc.completed_at,
                               'arguments', (
                                 CASE WHEN jsonb_typeof(tc.arguments) = 'object' AND tc.arguments <> '{}'::jsonb
                                      THEN tc.arguments
                                      ELSE COALESCE(b.blk->'arguments', '{}'::jsonb) END),
                               'output', CASE
                                 WHEN tc.output IS NULL THEN NULL
                                 WHEN length(tc.output) > v_output_cap THEN NULL
                                 ELSE to_jsonb(tc.output) END,
                               'output_preview', CASE
                                 WHEN tc.output IS NOT NULL AND length(tc.output) > v_output_cap
                                 THEN tc.output_preview END,
                               'output_truncated', tc.output IS NOT NULL AND length(tc.output) > v_output_cap,
                               'withheld', false)
                         END
                         FROM (SELECT 1) one
                         LEFT JOIN LATERAL (
                           SELECT t.*
                             FROM chat.tool_call t
                            WHERE t.conversation_id = p_resource_id
                              AND t.call_id = COALESCE(b.blk->>'call_id', b.blk->>'id')
                              AND t.deleted_at IS NULL
                            ORDER BY t.created_at DESC
                            LIMIT 1
                         ) tc ON true)
                       WHEN 'media' THEN
                         jsonb_build_object(
                           'type', 'media',
                           'kind', COALESCE(b.blk->>'kind', 'file'),
                           'title', COALESCE(b.blk->'metadata'->>'display_title', b.blk->>'file_name'),
                           'mime_type', b.blk->>'mime_type',
                           'size_bytes', b.blk->'size_bytes',
                           'width', b.blk->'width',
                           'height', b.blk->'height',
                           'file_id', CASE WHEN COALESCE(b.blk->>'file_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                                           THEN b.blk->>'file_id' END,
                           'url', (
                             SELECT u FROM unnest(ARRAY[b.blk->>'cdn_url', b.blk->>'url']) u
                              WHERE u LIKE 'https://cdn.matrxserver.com/%'
                              LIMIT 1))
                       WHEN 'decision_questions' THEN
                         jsonb_build_object('type', 'decision_questions',
                           'payload', b.blk - 'metadata')
                       WHEN 'decision_answers' THEN
                         jsonb_build_object('type', 'decision_answers',
                           'payload', b.blk - 'metadata' - 'usage' - 'cost_usd')
                       WHEN 'speech_script' THEN
                         jsonb_build_object('type', 'speech_script',
                           'payload', b.blk - 'metadata')
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
  'Per-type projection of what an Anyone-link holder sees beneath a shared record (children inherit their parent). SECURITY INVOKER: its reach beyond the caller''s RLS exists only inside public.resolve_share_token, after every token check. conversation → visible user/assistant messages: text; tool steps with arguments/output as written (no masking — access ladder law; credential/vault/secret/environment tools and every coding-session step withheld to name + status); media with file_id for the token-scoped byte route; decision / speech-script payloads. Access ladder T-19, T-19b.';

DROP FUNCTION platform.share_redact(jsonb);
