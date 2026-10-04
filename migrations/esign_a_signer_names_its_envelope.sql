-- The envelope a signer row belongs to — what aidream needs to make the signed copy the moment the
-- last signature lands (the sign door answers with the signer, not the envelope).
create or replace function esign.signer_envelope(p_signer_id uuid)
 returns uuid
 language sql
 stable
 set search_path to ''
as $function$
  select s.envelope_id from esign.envelope_signer s where s.id = p_signer_id
$function$;
