-- Working document rebuild — STEP 3: drop the legacy litter (idempotent).
-- The rebuild left `workbench.working_documents` with two unused legacy columns
-- (`conversation_id`, `user_id`) and the bespoke `chat.conversation_documents`
-- junction is fully retired (FE + aidream read platform.associations; no runtime
-- callers). Provenance now lives in metadata.origin_conversation_id; ownership is
-- `created_by`. The aidream writeback no longer selects `user_id` (context_writeback.py).
--
-- APPLY ORDER: this must be applied together with the aidream redeploy (the
-- deployed writeback must already be the workbench + created_by version).

-- Preserve provenance before dropping the identity column.
update workbench.working_documents
   set metadata = metadata || jsonb_build_object('origin_conversation_id', conversation_id)
 where conversation_id is not null
   and not (metadata ? 'origin_conversation_id');

alter table workbench.working_documents drop column if exists conversation_id;
alter table workbench.working_documents drop column if exists user_id;

-- Retire the bespoke junction (replaced by platform.associations). Recoverable.
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema='chat' and table_name='conversation_documents') then
    alter table chat.conversation_documents set schema graveyard;
  end if;
end $$;
