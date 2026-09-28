-- based-on: platform.share_link_children(text, uuid) 76338a01c34170f758b37109c85f08f7f7ad41fc46219ac2960e6f8754dcaf4f
--
-- Access ladder T-19b — a shared AI chat shows its files, its tool results and
-- its decision / speech-script blocks, to the bar of Claude's and ChatGPT's
-- shared-chat pages.
--
-- T-19 (access_ladder_t19_shared_chat_shows_its_messages.sql) made an Anyone
-- link to a conversation serve its visible messages as `children`, but served
-- a tool step as its NAME only and a private attachment as a name with no
-- bytes. Children inherit their parent (common-docs/policies/access-ladder.md):
-- the chat's files and its tool results are part of what was shared.
--
-- Three pieces, still one sharing system:
--
-- 1. `platform.share_redact(jsonb)` — the one cleaner every tool argument and
--    tool output passes through before it can leave the database on a link.
--    Keys that name a secret (password, secret, token, api/private/access key,
--    authorization, cookie, credential, OTP/TOTP, SSN, env/environment, …)
--    have their values replaced; string values are scrubbed of provider-key
--    shapes (sk-…, AKIA…, ghp_…, xox?-…, AIza…, JWTs, Bearer headers, PEM
--    private keys), URL user-info passwords, and `SECRET_NAME=value`
--    environment assignments. Protected fields are never served.
--
-- 2. `platform.share_link_children('conversation', id)` now serves, per
--    message part:
--      * tool_call → the chat's tool record (chat.tool_call joined on
--        conversation + call id): name, status, error, timestamps, CLEANED
--        arguments and CLEANED output (output over 60,000 chars falls back to
--        the row's output_preview and says so). Tools whose whole purpose is a
--        credential or a raw coding-session log (credential_login, vault*,
--        secure_delivery*, *secret*, *credential*, coding_session*) are served
--        as name + status only, `withheld: true` — never their arguments or
--        output. Execution-event logs are never served.
--      * media → also `file_id` + `size_bytes`, so the page can fetch the
--        bytes through the token-scoped file route (piece 3).
--      * decision_questions / decision_answers / speech_script → their payload
--        for the read-only transcript views (decision_answers without
--        usage / cost).
--
-- 3. `public.share_link_child_file(token, file_id)` — the authorization for
--    the aidream byte route `GET /share/{token}/files/{file_id}`. It passes
--    ONLY when the token exists, is active, is not expired, its type is still
--    link-shareable, its use limit is not exceeded (a child fetch does not
--    consume a use — the page view did), the shared conversation still exists
--    and is not deleted, and the file is referenced by a media part of one of
--    that conversation's VISIBLE user/assistant messages (the same filter the
--    transcript uses). No other file is reachable with the token.
--    SECURITY DEFINER, callable by anon: it answers only yes/no plus the
--    file id it was asked about.

CREATE OR REPLACE FUNCTION platform.share_redact(p_value jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $function$
DECLARE
  v_out jsonb;
  v_key text;
  v_val jsonb;
  v_text text;
BEGIN
  IF p_value IS NULL THEN
    RETURN NULL;
  END IF;
  CASE jsonb_typeof(p_value)
    WHEN 'object' THEN
      v_out := '{}'::jsonb;
      FOR v_key, v_val IN SELECT e.key, e.value FROM jsonb_each(p_value) e LOOP
        IF v_key ~* '(^|[_\-. ])(pass(word|wd|phrase)?|secrets?|token|access_token|refresh_token|id_token|auth_token|bearer|api_?key|apikey|private_?key|access_?key|secret_?key|signing_?key|encryption_?key|client_?secret|authorization|cookies?|set-cookie|credentials?|otp|totp|mfa_?code|pin|ssn|social_security|env|environment|env_vars|environment_variables)($|[_\-. ])'
           AND jsonb_typeof(v_val) <> 'null' THEN
          v_out := v_out || jsonb_build_object(v_key, '[redacted]');
        ELSE
          v_out := v_out || jsonb_build_object(v_key, platform.share_redact(v_val));
        END IF;
      END LOOP;
      RETURN v_out;
    WHEN 'array' THEN
      SELECT COALESCE(jsonb_agg(platform.share_redact(e.value) ORDER BY e.ord), '[]'::jsonb)
        INTO v_out
        FROM jsonb_array_elements(p_value) WITH ORDINALITY AS e(value, ord);
      RETURN v_out;
    WHEN 'string' THEN
      v_text := p_value #>> '{}';
      -- PEM private keys.
      v_text := regexp_replace(v_text, '-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----', '[redacted private key]', 'gs');
      -- Bearer / Basic authorization values.
      v_text := regexp_replace(v_text, '((?:Bearer|Basic)\s+)[A-Za-z0-9._~+/=\-]{8,}', '\1[redacted]', 'gi');
      -- JWTs.
      v_text := regexp_replace(v_text, 'eyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}', '[redacted]', 'g');
      -- Provider key shapes.
      v_text := regexp_replace(v_text, '\m(sk|pk|rk)-(live-|test-|proj-|ant-|or-)?[A-Za-z0-9_\-]{16,}', '[redacted]', 'g');
      v_text := regexp_replace(v_text, '\m(sk|pk|rk)_(live|test)_[A-Za-z0-9]{12,}', '[redacted]', 'g');
      v_text := regexp_replace(v_text, '\m(AKIA|ASIA)[0-9A-Z]{16}\M', '[redacted]', 'g');
      v_text := regexp_replace(v_text, '\m(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}', '[redacted]', 'g');
      v_text := regexp_replace(v_text, '\mgithub_pat_[A-Za-z0-9_]{20,}', '[redacted]', 'g');
      v_text := regexp_replace(v_text, '\mxox[abposr]-[A-Za-z0-9\-]{10,}', '[redacted]', 'g');
      v_text := regexp_replace(v_text, '\mAIza[0-9A-Za-z_\-]{30,}', '[redacted]', 'g');
      -- Passwords in URL user-info (postgres://user:pass@host).
      v_text := regexp_replace(v_text, '([A-Za-z][A-Za-z0-9+.\-]*://[^/\s:@]+):[^/\s@]+@', '\1:[redacted]@', 'g');
      -- Environment assignments whose NAME says secret: FOO_API_KEY=value.
      v_text := regexp_replace(v_text, '\m([A-Z][A-Z0-9_]*(KEY|SECRET|TOKEN|PASSWORD|PASSWD|PASS|PWD|DSN|CREDENTIALS?|COOKIE|AUTH))(\s*[=:]\s*)("[^"]*"|''[^'']*''|\S+)', '\1\3[redacted]', 'g');
      RETURN to_jsonb(v_text);
    ELSE
      RETURN p_value;
  END CASE;
END;
$function$;

COMMENT ON FUNCTION platform.share_redact(jsonb) IS
  'The one cleaner for anything a share link serves beneath a record (tool arguments, tool outputs): secret-named keys lose their values; provider keys, JWTs, bearer values, PEM private keys, URL passwords and secret-named env assignments are scrubbed from strings. Protected fields are never served. Access ladder T-19b.';

-- Is this tool, by name, a credential or raw-log carrier whose arguments and
-- output are never served on a link at all?
CREATE OR REPLACE FUNCTION platform.share_tool_is_withheld(p_tool_name text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT COALESCE(p_tool_name, '') ~* '(^credential_login$|^vault|^secure_delivery|secret|credential|password|^coding_session|^env(ironment)?(_|$)|^get_env|^set_env)';
$function$;

COMMENT ON FUNCTION platform.share_tool_is_withheld(text) IS
  'True for a tool whose arguments and output a share link never serves (credential, vault, secure delivery, secrets, raw coding-session logs, environment). Such a step is served as name + status, withheld. Access ladder T-19b.';

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
                           WHEN platform.share_tool_is_withheld(COALESCE(tc.tool_name, b.blk->>'name')) THEN
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
                               'error_message', platform.share_redact(to_jsonb(tc.error_message)),
                               'started_at', tc.started_at,
                               'completed_at', tc.completed_at,
                               'arguments', platform.share_redact(
                                 CASE WHEN jsonb_typeof(tc.arguments) = 'object' AND tc.arguments <> '{}'::jsonb
                                      THEN tc.arguments
                                      ELSE COALESCE(b.blk->'arguments', '{}'::jsonb) END),
                               'output', CASE
                                 WHEN tc.output IS NULL THEN NULL
                                 WHEN length(tc.output) > v_output_cap THEN NULL
                                 ELSE platform.share_redact(to_jsonb(tc.output)) END,
                               'output_preview', CASE
                                 WHEN tc.output IS NOT NULL AND length(tc.output) > v_output_cap
                                 THEN platform.share_redact(tc.output_preview) END,
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
  'Per-type projection of what an Anyone-link holder sees beneath a shared record (children inherit their parent). SECURITY INVOKER: its reach beyond the caller''s RLS exists only inside public.resolve_share_token, after every token check. conversation → visible user/assistant messages: text; tool steps with CLEANED arguments/output (platform.share_redact; credential/raw-log tools withheld); media with file_id for the token-scoped byte route; decision / speech-script payloads. Access ladder T-19, T-19b.';

CREATE OR REPLACE FUNCTION public.share_link_child_file(p_token text, p_file_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_link record;
  v_shareable boolean;
  v_ok boolean := false;
BEGIN
  IF p_token IS NULL OR p_file_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;
  SELECT * INTO v_link FROM platform.share_links WHERE token = p_token;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'not_found'); END IF;
  IF NOT v_link.is_active THEN RETURN jsonb_build_object('success', false, 'error', 'revoked'); END IF;
  IF v_link.expires_at IS NOT NULL AND v_link.expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'expired');
  END IF;
  -- A child fetch never consumes a use (the page view did); it is refused
  -- only once the link is past its limit.
  IF v_link.max_uses IS NOT NULL AND v_link.use_count > v_link.max_uses THEN
    RETURN jsonb_build_object('success', false, 'error', 'exhausted');
  END IF;
  SELECT COALESCE(r.is_link_shareable, false) INTO v_shareable
    FROM platform.shareable_resource_registry r
   WHERE r.resource_type = v_link.resource_type;
  IF NOT COALESCE(v_shareable, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'disabled');
  END IF;

  IF v_link.resource_type = 'conversation' THEN
    SELECT EXISTS (
      SELECT 1
        FROM chat.conversation c
        JOIN chat.message m ON m.conversation_id = c.id
       WHERE c.id = v_link.resource_id
         AND c.deleted_at IS NULL
         AND m.deleted_at IS NULL
         AND COALESCE(m.is_visible_to_user, true)
         AND COALESCE(m.status, 'active') IN ('active', 'edited')
         AND m.role IN ('user', 'assistant')
         AND jsonb_typeof(m.content) = 'array'
         AND m.content @> jsonb_build_array(jsonb_build_object('type', 'media', 'file_id', p_file_id::text))
    ) INTO v_ok;
  END IF;

  IF NOT v_ok THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_a_child');
  END IF;
  RETURN jsonb_build_object(
    'success', true,
    'file_id', p_file_id,
    'resource_type', v_link.resource_type,
    'resource_id', v_link.resource_id);
END;
$function$;

-- The byte route is the ONLY caller (aidream, server side, on its own database
-- connection); no browser ever calls this, so it has no client grant.
INSERT INTO platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
VALUES
  ('public', 'share_link_child_file', 'p_token text, p_file_id uuid',
   ARRAY['text'::regtype, 'uuid'::regtype]::oid[],
   'Access ladder T-19b. p_token is checked against platform.share_links (must exist, be active, be unexpired, be within its use limit, and name a still link-shareable type); a NULL token answers not_found. p_file_id is checked against the media parts of the VISIBLE user/assistant messages of the one conversation that token shares (chat.message.content @> [{type:media, file_id}] and the conversation not deleted); a NULL file id answers not_found. It returns yes/no plus the ids it was asked about and never any file content or metadata.',
   'migrations/access_ladder_t19b_shared_chat_files_tools_blocks.sql',
   'server_only: the aidream public byte route GET /share/{token}/files/{file_id} calls it on its own database connection before streaming a shared chat''s attachment; no browser ever calls it.',
   false, false);

COMMENT ON FUNCTION public.share_link_child_file(text, uuid) IS
  'Authorizes the token-scoped byte route GET /share/{token}/files/{file_id}: true only when the link is live (active, unexpired, within its use limit, type link-shareable), the shared conversation exists, and the file is a media part of one of its visible user/assistant messages. Does not consume a use. Access ladder T-19b.';

