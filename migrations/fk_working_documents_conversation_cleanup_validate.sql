-- fk_working_documents_conversation_cleanup_validate
-- User-authorized follow-up to fk_working_documents_conversation_not_valid.sql:
-- delete the 317 leaked orphan working documents (313 empty, 4 throwaway test
-- rows) whose conversation_id never resolved to a chat.conversation, then VALIDATE
-- both conversation_id FKs. After this the FKs are fully enforced, zero orphans.
DELETE FROM chat.conversation_documents cd
WHERE cd.conversation_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM chat.conversation c WHERE c.id = cd.conversation_id);

DELETE FROM chat.working_documents wd
WHERE wd.conversation_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM chat.conversation c WHERE c.id = wd.conversation_id);

ALTER TABLE chat.working_documents VALIDATE CONSTRAINT working_documents_conversation_id_fkey;
ALTER TABLE chat.conversation_documents VALIDATE CONSTRAINT conversation_documents_conversation_id_fkey;
