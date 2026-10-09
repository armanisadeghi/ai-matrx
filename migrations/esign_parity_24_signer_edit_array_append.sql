-- 23 let the trigger run for the first time; 'text[] || unknown literal' parses as array||array and raised
-- 'malformed array literal'. array_append states the intent.
-- based-on: esign._record_signer_changed() 015c0a1f6ecd0c374b5b5aca9cb2fed475d4963d1cfafa838ea2f5db87cea38a
CREATE OR REPLACE FUNCTION esign._record_signer_changed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'esign', 'public'
AS $function$
declare e esign.envelope%rowtype; v_changed text[] := '{}';
begin
  if coalesce(current_setting('esign.privileged_write', true), 'off') = 'on' then return new; end if;
  select * into e from esign.envelope where id = new.envelope_id;
  if not found or e.status = 'draft' then return new; end if;
  if new.full_name is distinct from old.full_name then v_changed := array_append(v_changed, 'full_name'); end if;
  if new.email is distinct from old.email then v_changed := array_append(v_changed, 'email'); end if;
  if new.typed_name is distinct from old.typed_name then v_changed := array_append(v_changed, 'typed_name'); end if;
  if new.field_values is distinct from old.field_values then v_changed := array_append(v_changed, 'field_values'); end if;
  if new.signature_image_file_id is distinct from old.signature_image_file_id then v_changed := array_append(v_changed, 'signature_image_file_id'); end if;
  if new.initials_image_file_id is distinct from old.initials_image_file_id then v_changed := array_append(v_changed, 'initials_image_file_id'); end if;
  if new.signature_kind is distinct from old.signature_kind then v_changed := array_append(v_changed, 'signature_kind'); end if;
  if new.role is distinct from old.role then v_changed := array_append(v_changed, 'role'); end if;
  if new.position is distinct from old.position then v_changed := array_append(v_changed, 'order'); end if;
  if new.is_required is distinct from old.is_required then v_changed := array_append(v_changed, 'is_required'); end if;
  if new.verification_factor is distinct from old.verification_factor then v_changed := array_append(v_changed, 'verification_factor'); end if;
  if cardinality(v_changed) = 0 then return new; end if;
  perform esign._event(new.envelope_id, 'signer_record_changed', esign._requester_actor_type(e.consumer_key),
    p_signer_id => new.id, p_actor_user_id => auth.uid(), p_actor_label => esign._direct_writer_label(),
    p_payload => jsonb_build_object(
      'changed', to_jsonb(v_changed),
      'had_signed', exists (select 1 from esign.envelope_event v where v.signer_id = new.id and v.event_type = 'signed'),
      'before', jsonb_build_object('full_name', old.full_name, 'email', old.email, 'typed_name', old.typed_name),
      'after', jsonb_build_object('full_name', new.full_name, 'email', new.email, 'typed_name', new.typed_name)));
  return new;
end $function$;
