-- based-on: public.esign_resend_signer(uuid, text) 3416391eef83ab1645bbe30da01ff4abf48a8978321eca386fbf0f755aede2a5
--
-- A SENDER CAN CORRECT ANY UNSIGNED RECIPIENT'S ADDRESS (fix round 3, 2026-10-07; a loosening).
-- "Send again" with a new address for a later signer of an in-order envelope answered "That signer's
-- turn has not come yet." Now a signer still waiting for their turn gets the corrected address and
-- loses the old link, and nobody is notified: they hear when their turn comes (that path mints the
-- link when the signer holds none). Everything else about the function is unchanged.

CREATE OR REPLACE FUNCTION public.esign_resend_signer(p_signer_id uuid, p_email text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'esign', 'public'
AS $function$
declare s esign.envelope_signer%rowtype; e esign.envelope%rowtype; v_new_addr boolean; v_tok jsonb;
        v_link text; v_old uuid; v_can jsonb;
begin
  select * into s from esign.envelope_signer where id = p_signer_id;
  if not found then
    perform platform.refuse_not_found(format('esign_resend_signer: signer %s does not exist', p_signer_id));
  end if;
  select * into e from esign.envelope where id = s.envelope_id;
  if e.status not in ('sent','in_progress') then
    return jsonb_build_object('granted', false, 'reason', 'envelope_' || e.status);
  end if;
  v_can := esign._can_act(s.id);
  v_new_addr := p_email is not null and lower(p_email) is distinct from s.email;
  if not (v_can ->> 'can_act')::boolean then
    if v_can ->> 'reason' = 'waiting_on_earlier_position' and v_new_addr then
      perform esign._arm();
      v_old := s.actor_token_id;
      if v_old is not null then
        perform platform.revoke_outsider_token(v_old, 'signer email corrected before their turn');
      end if;
      update esign.envelope_signer set email = lower(btrim(p_email)), actor_token_id = null where id = s.id;
      perform esign._event(s.envelope_id, 'resent', esign._requester_actor_type(e.consumer_key),
                           p_signer_id => s.id, p_actor_user_id => auth.uid(),
                           p_payload => jsonb_build_object('address_changed', true, 'token_reissued', false,
                                                           'revoked_token_id', v_old, 'notified', false));
      perform esign._disarm();
      return jsonb_build_object('granted', true, 'signer_id', s.id, 'address_changed', true,
                                'token_reissued', false, 'notified', false);
    end if;
    return jsonb_build_object('granted', false, 'reason', v_can ->> 'reason');
  end if;

  perform esign._arm();
  if s.actor_type = 'external' and (v_new_addr or s.actor_token_id is null) then
    v_old := s.actor_token_id;
    if v_old is not null then
      perform platform.revoke_outsider_token(v_old, 'signer email corrected on resend');
      update esign.envelope_signer set actor_token_id = null where id = s.id;
    end if;
    v_tok := public.esign_mint_signer_token(s.id, coalesce(p_email, s.email));
    if not coalesce((v_tok ->> 'granted')::boolean, false) then
      perform esign._disarm();
      return v_tok;
    end if;
    v_link := '/x/sign#t=' || (v_tok ->> 'secret');
  end if;

  perform esign._notify(s.envelope_id, 'esign.signature_requested', s.id,
                        p_to_user => s.signer_user_id,
                        p_to_address => lower(coalesce(p_email, s.email)),
                        p_actor_token_id => coalesce((v_tok ->> 'actor_token_id')::uuid, s.actor_token_id),
                        p_subject => coalesce(e.title,'Signature requested'), p_deep_link => v_link);
  update esign.envelope_signer
     set last_notified_at = now(), notify_attempts = notify_attempts + 1,
         status = case when status = 'delivery_failed' then 'notified' else status end,
         delivery_error = null
   where id = s.id;
  perform esign._schedule_signer_notices(s.id, v_link);
  perform esign._event(s.envelope_id, 'resent', esign._requester_actor_type(e.consumer_key),
                       p_signer_id => s.id, p_actor_user_id => auth.uid(),
                       p_payload => jsonb_build_object('address_changed', v_new_addr,
                                                       'token_reissued', v_tok is not null,
                                                       'revoked_token_id', v_old));
  perform esign._disarm();
  return jsonb_build_object('granted', true, 'signer_id', s.id, 'address_changed', v_new_addr,
                            'token_reissued', v_tok is not null);
end $function$;
