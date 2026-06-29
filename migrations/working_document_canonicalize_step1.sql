-- Working document rebuild — STEP 1: canonicalize the entity (idempotent).
-- Promotes cx_working_documents -> a first-class, versioned, owner-scoped entity
-- named `working_document`, living in workbench (canonical home, next to notes).
-- Applied via Supabase MCP on Matrx Main (txzxabzwovsujtloxrus).
--
-- Part of the working-document end-to-end rebuild. STEP 2 migrates the junction
-- links into platform.associations; STEP 3 drops legacy columns + graveyards the
-- junction; STEP 4 deletes the empty rows. See
-- features/agents/.../instance-working-document and aidream context_writeback.

-- 0. It is no longer a composition child of conversation (becomes first-class + M2M).
--    Must precede the token rename (the FK that referenced the old token).
delete from platform.entity_relationships where child_type='cx_working_documents';

-- 1a. Canonical token.
update platform.entity_types set token='working_document' where token='cx_working_documents';

-- 1b. Move to the canonical home (metadata-only; FKs/RLS/triggers/realtime follow by OID).
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema='chat' and table_name='working_documents') then
    alter table chat.working_documents set schema workbench;
  end if;
end $$;

update platform.entity_types set schema_name='workbench'
 where token='working_document' and table_name='working_documents';

-- 1c. Base columns the canonical standard needs.
alter table workbench.working_documents add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table workbench.working_documents add column if not exists deleted_at timestamptz;

-- 1d. Kill the redundant legacy trigger (_touch_row already sets updated_at + bumps version).
drop trigger if exists set_updated_at on workbench.working_documents;

-- 1e. Durable version history (exact form copied from workbench.notes).
drop trigger if exists _history on workbench.working_documents;
create trigger _history after insert or delete or update on workbench.working_documents
  for each row execute function platform._version_capture('working_document');

-- 1f. Registry flags: first-class, versioned, soft-deletable.
update platform.entity_types
   set is_component=false, is_versioned=true, has_soft_delete=true
 where token='working_document' and table_name='working_documents';

-- 1g. Re-apply RLS as the owner+org `entity` variant (was the `component` variant,
--     which deferred to the parent conversation via conversation_id — invalid for a
--     first-class doc shared across many conversations, and broken once conversation_id drops).
select iam.apply_rls('workbench','working_documents','working_document','entity');
