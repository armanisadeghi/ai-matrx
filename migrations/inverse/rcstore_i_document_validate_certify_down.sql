-- chair-step: RC-A1 inverse of rcstore_i — returns every foreign key rcstore_i validated to NOT VALID (drop and re-add NOT VALID, catalogue-only on the empty tables) and clears the validated stamp, which is the state rcstore_h left.

do $$
declare
  r record;
begin
  for r in
    select c.conrelid::regclass as rel, c.conname, pg_get_constraintdef(c.oid) as def
      from pg_constraint c
     where c.conrelid in ('content.document'::regclass, 'content.document_version'::regclass,
                          'content.univer_payload'::regclass, 'skill.skill_detail'::regclass,
                          'agent.message_template_detail'::regclass)
       and c.contype = 'f' and c.convalidated
       and c.conname in (
         'document_document_type_id_fkey', 'document_folder_id_fkey', 'document_last_conversation_id_fkey',
         'document_version_actor_id_fkey', 'document_version_conversation_id_fkey',
         'document_organization_id_fkey', 'document_created_by_fkey', 'document_updated_by_fkey',
         'document_version_organization_id_fkey', 'document_version_created_by_fkey', 'document_version_updated_by_fkey',
         'univer_payload_organization_id_fkey', 'univer_payload_created_by_fkey', 'univer_payload_updated_by_fkey',
         'skill_detail_organization_id_fkey', 'skill_detail_created_by_fkey', 'skill_detail_updated_by_fkey',
         'message_template_detail_organization_id_fkey', 'message_template_detail_created_by_fkey', 'message_template_detail_updated_by_fkey')
  loop
    execute format('alter table %s drop constraint %I', r.rel, r.conname);
    execute format('alter table %s add constraint %I %s not valid', r.rel, r.conname, r.def);
  end loop;
end $$;

update platform.provision_base_contract_pending
   set validated_at = null
 where relation in ('content.document', 'content.document_version', 'content.univer_payload',
                    'skill.skill_detail', 'agent.message_template_detail');
