-- chair-step: RC-A1 inverse of rcstore_g — detaches the store's behaviour (triggers, guards, capture, doors, soft-delete edges, hard-delete protection, the published-version pin) and flips `document` back to unversioned. The five tables stay, empty. Refuses if content.document holds a row.
-- window-class: trigger DDL on the new, empty rich-content tables freezes the 23-relation supautils set (auth/storage/realtime) for this short transaction; applied in the 1-4 AM PT window.

do $$
begin
  if exists (select 1 from content.document) then
    raise exception 'content.document holds rows; this inverse only detaches behaviour from an EMPTY store';
  end if;
end $$;

-- registry back to what rcstore_b's provision wrote
update platform.entity_types
   set is_versioned = false, version_store = 'history', version_store_ref = null
 where token = 'document';

-- the doors go with their functions (a door follows its function)
delete from platform.client_callable_door
 where schema_name = 'content'
   and function_name in ('univer_save', 'version_publish', 'version_unpublish', 'version_restore');

-- soft-delete edges and the triggers declare_soft_delete_edge attached
delete from platform.soft_delete_edge where parent_schema = 'content' and parent_table = 'document';
drop trigger if exists _cascade_softdelete on content.document;
drop trigger if exists _guard_soft_delete_parent on skill.skill_detail;
drop trigger if exists _guard_soft_delete_parent on agent.message_template_detail;

-- hard-delete protection
drop trigger _refuse_client_hard_delete on content.document;
drop trigger _refuse_client_hard_delete on skill.skill_detail;
drop trigger _refuse_client_hard_delete on agent.message_template_detail;

-- triggers BEFORE their functions
drop trigger _a_refuse_client_derived on content.document;
drop trigger _b_derive_document on content.document;
drop trigger _c_bump_content_version on content.document;
drop trigger _d1_guard_document_type on content.document;
drop trigger _d2_guard_data_class on content.document;
drop trigger _d3_guard_sealed on content.document;
drop trigger _d4_guard_univer on content.document;
drop trigger _d5_guard_folder_access on content.document;
drop trigger _d6_guard_publish on content.document;
drop trigger _d7_refuse_inline_data_uri on content.document;
drop trigger _capture_version on content.document;
drop trigger _notify_auto_ingest on content.document;
drop trigger _same_org_published_pin on content.document;
drop trigger _a_version_immutable on content.document_version;
drop trigger _a_univer_payload_insert_only on content.univer_payload;

alter table content.document drop constraint document_published_fk;
drop index content.document_published_pin_idx;

drop function content.univer_save(uuid, integer, jsonb, text, text);
drop function content.version_publish(uuid, integer);
drop function content.version_unpublish(uuid);
drop function content.version_restore(uuid, integer, integer);
drop function content._document_refuse_client_derived();
drop function content._document_derive();
drop function content._document_bump_content_version();
drop function content._document_guard_type();
drop function content._document_guard_data_class();
drop function content._document_guard_sealed();
drop function content._document_guard_univer();
drop function content._document_guard_folder();
drop function content._document_guard_publish();
drop function content._document_refuse_inline_data_uri();
drop function content._capture_version();
drop function content._document_version_immutable();
drop function content._univer_payload_insert_only();
drop function content._document_notify_auto_ingest();
