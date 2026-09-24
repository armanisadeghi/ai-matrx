-- chair-step: RC-A1 inverse of rcstore_h — drops the NOT VALID foreign keys rcstore_h attached (base contract + the §3.17 FKs into live shared tables), their covering indexes and tenancy triggers, and re-opens the base-contract debt rows so rcstore_h can attach them again. The tables stay.
-- window-class: trigger DDL on the new, empty rich-content tables freezes the 23-relation supautils set (auth/storage/realtime) for this short transaction; applied in the 1-4 AM PT window.

alter table content.document drop constraint document_document_type_id_fkey;
alter table content.document drop constraint document_folder_id_fkey;
drop trigger _same_org_folder_id on content.document;
alter table content.document drop constraint document_last_conversation_id_fkey;
drop index content.document_last_conversation_id_idx;
drop trigger _same_org_last_conversation_id on content.document;
alter table content.document_version drop constraint document_version_actor_id_fkey;
drop index content.document_version_actor_id_idx;
alter table content.document_version drop constraint document_version_conversation_id_fkey;
drop index content.document_version_conversation_id_idx;
drop trigger _same_org_conversation_id on content.document_version;

do $$
declare
  r record;
begin
  for r in
    select c.conrelid::regclass as rel, c.conname
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.conrelid in ('content.document'::regclass, 'content.document_version'::regclass,
                          'content.univer_payload'::regclass, 'skill.skill_detail'::regclass,
                          'agent.message_template_detail'::regclass)
       and c.contype = 'f'
       and a.attname in ('organization_id', 'created_by', 'updated_by')
  loop
    execute format('alter table %s drop constraint %I', r.rel, r.conname);
  end loop;
end $$;

update platform.provision_base_contract_pending
   set attached_at = null, validated_at = null
 where relation in ('content.document', 'content.document_version', 'content.univer_payload',
                    'skill.skill_detail', 'agent.message_template_detail');
