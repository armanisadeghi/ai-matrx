-- based-on: esign._act_load(jsonb) 2eef1d1d5fe1c3f39504f1f7e365b5e4446b8dc8981b91162d83a93779d73b1d
--
-- A SIGNER SEES WHICH BOXES ARE ALREADY SIGNED (2026-10-04, owner's walk). The second signer saw
-- the first signer's finished boxes as grey "Other signer" placeholders. `other_signers` now carries
-- each row's id — never a name or address (§5.6 A) — so the page can mark a field whose signer has
-- signed.

CREATE OR REPLACE FUNCTION esign._act_load(p_ctx jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'esign', 'public'
AS $function$
declare e esign.envelope%rowtype; s esign.envelope_signer%rowtype; v_can jsonb; v_first boolean;
begin
  select * into s from esign.envelope_signer where id = (p_ctx ->> 'signer_id')::uuid;
  select * into e from esign.envelope where id = s.envelope_id;
  v_can := esign._can_act(s.id);
  if not (v_can ->> 'can_act')::boolean and e.status <> 'completed' then
    return jsonb_build_object('granted', false, 'reason', v_can ->> 'reason');
  end if;

  perform esign._arm();
  v_first := s.status in ('pending','notified');
  if v_first then
    update esign.envelope_signer set status = 'opened' where id = s.id;
  end if;
  -- `opened` fires on every load; only esign_signer_preview_ack writes `viewed` (DECISION 3 of 03).
  perform esign._event(s.envelope_id, 'opened', p_ctx ->> 'actor_type', p_signer_id => s.id,
                       p_actor_user_id => (p_ctx ->> 'actor_user_id')::uuid,
                       p_actor_token_id => (p_ctx ->> 'actor_token_id')::uuid,
                       p_actor_label => p_ctx ->> 'actor_label',
                       p_auth_method => p_ctx ->> 'auth_method',
                       p_ip => (p_ctx ->> 'ip')::inet, p_user_agent => p_ctx ->> 'user_agent');
  perform esign._disarm();

  return jsonb_build_object(
    'granted', true,
    'envelope', esign._project('esign_envelope', to_jsonb(e)),
    'me', esign._project('esign_envelope_signer',
            (select to_jsonb(r) from esign.envelope_signer r where r.id = s.id)),
    -- §5.6 A "Denied": other signers' rows, including their names beyond a display list. Their id
    -- (2026-10-04) only ties a placed field to its status, so a finished box reads as signed.
    'other_signers', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'order', o.position, 'role', o.role, 'status', o.status) order by o.position)
                                 from esign.envelope_signer o where o.envelope_id = e.id and o.id <> s.id), '[]'::jsonb),
    'documents', coalesce((select jsonb_agg(esign._project('esign_envelope_document', to_jsonb(d)) order by d.position)
                             from esign.envelope_document d where d.envelope_id = e.id), '[]'::jsonb),
    'consent', (select jsonb_build_object('disclosure_id', cd.id, 'version', cd.version_label,
                                          'title', cd.title, 'text', cd.body)
                  from esign.consent_disclosure cd
                 where cd.id = nullif(e.config_snapshot ->> 'consent_disclosure_id','')::uuid),
    'signature_options', jsonb_build_object('typed', e.config_snapshot -> 'allow_typed',
                                            'drawn', e.config_snapshot -> 'allow_drawn'),
    'branding', e.config_snapshot -> 'branding');
end $function$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('esign', '_act_load', 'p_ctx jsonb', array['jsonb'::regtype]::oid[],
        'p_ctx is the context esign._ctx_internal / esign._ctx_outsider already resolved and checked for the caller''s own signer row.',
        'esign_a_signer_sees_which_boxes_are_already_signed.sql',
        'internal: reached only from public.esign_sign_load and public.esign_signer_load after the context resolver admitted the caller; no client role holds EXECUTE.',
        false, false)
on conflict do nothing;
