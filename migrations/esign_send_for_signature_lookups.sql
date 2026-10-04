-- SEND FOR SIGNATURE — two lookups for aidream's `/esign/envelopes` (services/esign/envelopes.py):
-- the envelope's document ids in position order (to pair each with the bytes the server froze),
-- and whether a signer row belongs to an envelope (a resend names both). SECURITY INVOKER.

create or replace function esign.envelope_document_ids(p_envelope_id uuid)
returns jsonb
language sql stable
set search_path to ''
as $fn$
  select coalesce(jsonb_agg(d.id order by d.position), '[]'::jsonb)
    from esign.envelope_document d where d.envelope_id = p_envelope_id;
$fn$;

create or replace function esign.signer_belongs_to(p_signer_id uuid, p_envelope_id uuid)
returns boolean
language sql stable
set search_path to ''
as $fn$
  select exists (select 1 from esign.envelope_signer s where s.id = p_signer_id and s.envelope_id = p_envelope_id);
$fn$;
