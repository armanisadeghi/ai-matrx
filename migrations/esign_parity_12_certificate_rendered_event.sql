-- chair-step: the only DROP removes envelope_event_event_type_check and re-adds it in the same transaction with one more allowed value (a loosening); no data is touched.
-- based-on: esign.record_certificate_file(uuid, uuid) 3e33bda5f80992f3e1c7d2416c00a218762d45ade17ac591e7f00c934b906d6e
-- based-on: esign.finalize_inputs(uuid) ccc88b12e3cfac199e186357c8d6e14dcc9d42d4c0539835adcd0ef2c72d2f7d
-- e-sign parity wave C: the certificate row is immutable (_zz_guard_certificate_immutable), so its
-- PDF is recorded the ledger's way — an append-only `certificate_rendered` event — never an UPDATE.
alter table esign.envelope_event drop constraint envelope_event_event_type_check;
alter table esign.envelope_event add constraint envelope_event_event_type_check check (event_type = any (array[
  'created','document_frozen','sent','delivered','delivery_failed','opened','viewed','consent_shown','consent_given',
  'consent_withdrawn','signature_adopted','signed','declined','delegated','reminded','resent','voided','expired',
  'downloaded','certificate_generated','hash_verified','hash_mismatch','provider_dispatched','provider_status_received',
  'provider_completed','authenticated','signature_handoff_started','signature_handoff_completed','acknowledged',
  'signed_copy_made','certificate_rendered']));

create or replace function esign.record_certificate_file(p_certificate_id uuid, p_file_id uuid)
returns jsonb language plpgsql security definer set search_path = 'esign', 'public' as $$
declare c esign.envelope_certificate%rowtype;
begin
  select * into c from esign.envelope_certificate where id = p_certificate_id;
  if not found then return jsonb_build_object('granted', false, 'reason', 'unknown_certificate'); end if;
  perform esign._event(c.envelope_id, 'certificate_rendered', 'automation',
                       p_payload => jsonb_build_object('certificate_id', c.id, 'file_id', p_file_id,
                                                       'payload_hash', c.payload_hash));
  return jsonb_build_object('granted', true);
end $$;

CREATE OR REPLACE FUNCTION esign.finalize_inputs(p_envelope_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'envelope_id', e.id, 'status', e.status, 'title', e.title, 'organization_id', e.organization_id,
    'owner_id', e.created_by, 'completed_at', e.completed_at, 'config_snapshot', e.config_snapshot,
    'certificate', (select jsonb_build_object('id', c.id, 'payload', c.payload, 'payload_hash', c.payload_hash,
                                              'signature', c.signature, 'key_id', c.key_id,
                                              'rendered_file_id', coalesce(c.rendered_file_id,
                                (select (v.payload ->> 'file_id')::uuid from esign.envelope_event v
                                  where v.envelope_id = e.id and v.event_type = 'certificate_rendered'
                                  order by v.occurred_at desc limit 1)), 'generated_at', c.generated_at)
                      from esign.envelope_certificate c where c.envelope_id = e.id),
    'signed', coalesce((select jsonb_object_agg(x.signer_id, x.ev) from (
        select distinct on (v.signer_id) v.signer_id, jsonb_build_object('payload', v.payload, 'occurred_at', v.occurred_at) ev
          from esign.envelope_event v where v.envelope_id = e.id and v.event_type = 'signed'
         order by v.signer_id, v.occurred_at desc) x), '{}'::jsonb),
    'recipients', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'full_name', s.full_name, 'email', s.email,
                                       'role', s.role, 'status', s.status, 'color_index', s.color_index)
                                       order by s.position, s.created_at)
                              from esign.envelope_signer s where s.envelope_id = e.id), '[]'::jsonb))
  from esign.envelope e where e.id = p_envelope_id
$function$;
