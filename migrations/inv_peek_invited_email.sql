-- inv_peek_invited_email — the ONE anonymous-safe door that turns an invitation
-- token into the address that invitation was sent to, and nothing else.
--
-- WHY (DD-091, chair ruling 2026-09-11):
-- An invitation exists to reach someone who has no account yet, so the sign-up
-- page must be able to prefill the invited address while the visitor is still
-- anonymous. The first cut carried the address in the link itself (`?email=`).
-- That is below the bar every champion sets — GitHub, Slack, Notion, Google
-- Workspace and Supabase's own invite all carry a TOKEN and resolve the address
-- server-side — because a query string is stable PII in browser history and in
-- every edge/CDN access log the request passes through, long outliving the
-- token beside it. The link now carries the token only; this door resolves it.
--
-- WHY IT IS SAFE TO OPEN TO `anon`:
-- * The token IS the secret. It is `gen_random_uuid()::text` (122 bits, minted
--   by `inv_create` / `inv_resend`), so it cannot be guessed or enumerated, and
--   whoever holds it was handed the address already — it was mailed to them.
-- * It returns ONE scalar: the email. Not the organization, the role, the
--   inviter, the target, the id, or the invitation's existence in any other
--   form. An invalid, expired, accepted, revoked or soft-deleted token returns
--   NULL — indistinguishable from a token that never existed.
-- * It grants NOTHING. Acceptance still runs through `inv_accept`, and the
--   accept page still reads through `inv_get_by_token`, which stays
--   `authenticated`-only and gated to the invited identity. This door widens
--   no membership, no visibility, no write.
--
-- db-rules §6d-4: the `platform.client_callable_door` row is declared BEFORE
-- the GRANT, or `platform.enforce_definer_client_grants` revokes the client
-- EXECUTE inside the GRANT and writes a `ddl_guard_log` row.
--
-- Idempotent (CREATE OR REPLACE + ON CONFLICT DO NOTHING). Reversible: revoke
-- execute from anon, authenticated and drop the function; nothing depends on it
-- but the sign-up/login prefill, which degrades to an empty field.
--
-- Ledger: public._schema_migrations (source 'matrx-frontend').

CREATE OR REPLACE FUNCTION public.inv_peek_invited_email(p_token text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT i.email
  FROM iam.invitations i
  WHERE i.token = p_token
    AND i.deleted_at IS NULL
    AND i.status = 'pending'
    AND i.accepted_at IS NULL
    AND (i.expires_at IS NULL OR i.expires_at > now())
  LIMIT 1;
$function$;

COMMENT ON FUNCTION public.inv_peek_invited_email(text) IS
  'DD-091: resolves an invitation token to the address it was sent to, for the anonymous sign-up prefill. Returns NULL for anything not pending+unexpired. Grants nothing; acceptance still runs through inv_accept.';

-- ── Declare the client door BEFORE granting (db-rules §6d-4) ───────────────────

INSERT INTO platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason)
VALUES (
  'public', 'inv_peek_invited_email', 'p_token text',
  'DD-091 invite flow',
  'Anonymous sign-up prefill for an invitee who has no account yet. Definer because iam.invitations is RLS-gated and the caller has no session at all; the token (gen_random_uuid, 122 bits) is the identity here and is the secret that was mailed to the invited address. Returns ONLY the email, and only for a pending, unaccepted, unexpired, non-deleted invitation — every other token returns NULL, so it cannot confirm an invitation exists. Deliberately granted to anon: the whole point is the pre-account moment. Replaces carrying the address in the invitation URL, which put stable PII in browser history and edge logs.'
)
ON CONFLICT DO NOTHING;

REVOKE ALL ON FUNCTION public.inv_peek_invited_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.inv_peek_invited_email(text) TO anon;
GRANT EXECUTE ON FUNCTION public.inv_peek_invited_email(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inv_peek_invited_email(text) TO service_role;
