-- A DRAWN SIGNATURE IS FILED ON ITS ENVELOPE (SPEC-ESIGN §4.3, adopt with kind = 'drawn').
--
-- `esign._act_adopt` takes a drawn signature as `p_image_file_id` — a `files.files` row. An outsider
-- has no account and no organization to own a file, so aidream's signing surface
-- (services/esign/signing.py) stores the drawn image as evidence ON THE ENVELOPE: owned by the
-- envelope's sender, in the envelope's organization. This read names that owner, and only after the
-- caller has shown they hold the signer's credential: a live outsider session, or (for a platform
-- user) the server has already resolved their own signer row through `esign_my_signer_row`.
-- SECURITY INVOKER and unreachable in practice from a client (no grant on the tables it reads).

create or replace function esign.signature_owner(p_session text, p_envelope_id uuid)
returns jsonb
language sql stable
set search_path to ''
as $fn$
  select jsonb_build_object('envelope_id', e.id, 'organization_id', e.organization_id,
                            'owner_id', e.created_by)
    from esign.envelope e
   where e.id = coalesce(
           p_envelope_id,
           (select s.envelope_id
              from platform.actor_session ses
              join platform.actor_token t on t.id = ses.actor_token_id and t.consumer_key = 'esign.signer'
              join esign.envelope_signer s on s.id = t.subject_id
             where ses.session_hash = encode(extensions.digest(coalesce(p_session, ''), 'sha256'), 'hex')
               and ses.revoked_at is null and ses.expires_at > now()));
$fn$;
