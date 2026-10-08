-- e-sign parity §9: cancelling a signer's scheduled notices also cancels a row the render pass holds.
-- based-on: esign._cancel_scheduled_notices(uuid, uuid) 354d1d845fd24bcbecf16357aba52200275cddd5a244e1e300fae629cb735ebe
CREATE OR REPLACE FUNCTION esign._cancel_scheduled_notices(p_envelope_id uuid, p_signer_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'esign', 'public'
AS $function$
declare v_n int;
begin
  update communication.notification n
     set status = 'cancelled', error_code = 'superseded', updated_at = now()
   where n.target_kind = 'esign_envelope' and n.target_id = p_envelope_id
     -- A row the render pass has claimed is cancelled too: the pass stamps only rows still
     -- 'render_in_progress', so a cancelled one stays cancelled (found live: a resend raced the
     -- render pass and left one superseded reminder pending).
     and n.status in ('pending', 'render_pending', 'render_in_progress')
     and coalesce((n.metadata ->> 'esign_scheduled')::boolean, false)
     and (p_signer_id is null or n.payload ->> 'signer_id' = p_signer_id::text);
  get diagnostics v_n = row_count;
  return v_n;
end $function$;
