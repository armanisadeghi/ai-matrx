-- based-on: esign.signed_copy_inputs(uuid) 84cbb7b978ce9bdd0e9bc342a4944736b92d3a794a461c450bc663dc7bedb7a6
-- A SIGNATURE IS DATED IN THE SIGNER'S TIME ZONE (2026-10-05, owner's walk). The signed copy
-- stamped "Date signed" in UTC, so a signature made at 11:21 PM on Oct 4 in California printed
-- as Oct 05. The signing page now sends the browser's IANA zone with the Sign press; aidream
-- stores it here (a metadata key, never an evidence column — `signed_at` stays the instant) and
-- the stamp prints the date in it. Server-only: aidream calls it after the sign door succeeded.
create or replace function esign.record_signer_time_zone(p_signer_id uuid, p_time_zone text)
 returns boolean
 language sql
 set search_path to ''
as $function$
  update esign.envelope_signer
     set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('time_zone', p_time_zone)
   where id = p_signer_id
  returning true
$function$;

-- The stamp reads it with the rest of what it needs.
create or replace function esign.signed_copy_inputs(p_envelope_id uuid)
 returns jsonb
 language sql
 stable
 set search_path to ''
as $function$
  select jsonb_build_object(
    'envelope_id', e.id, 'status', e.status, 'title', e.title,
    'organization_id', e.organization_id, 'owner_id', e.created_by, 'completed_at', e.completed_at,
    'documents', coalesce((select jsonb_agg(jsonb_build_object(
        'id', d.id, 'name', d.name, 'position', d.position,
        'content_file_id', d.content_file_id, 'content_file_version', d.content_file_version,
        'content_hash', d.content_hash, 'field_map', d.field_map,
        'signed_copy_file_id', d.metadata ->> 'signed_copy_file_id') order by d.position)
      from esign.envelope_document d where d.envelope_id = e.id), '[]'::jsonb),
    'signers', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'full_name', s.full_name, 'email', s.email, 'status', s.status,
        'signature_kind', s.signature_kind, 'typed_name', s.typed_name, 'typed_style', s.typed_style,
        'signature_image_file_id', s.signature_image_file_id, 'signed_at', s.signed_at,
        'time_zone', s.metadata ->> 'time_zone') order by s.position)
      from esign.envelope_signer s where s.envelope_id = e.id), '[]'::jsonb))
  from esign.envelope e where e.id = p_envelope_id
$function$;
