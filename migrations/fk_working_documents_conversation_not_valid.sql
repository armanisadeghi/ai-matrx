-- fk_working_documents_conversation_not_valid
-- chat.working_documents / conversation_documents leaked 317 rows whose
-- conversation_id never resolved to a chat.conversation: a working-doc/scratchpad
-- was toggled on a NEW chat before its first message persisted the conversation,
-- so the client provisioned a durable row against a conversation_id that
-- chat.conversation never got. (313 empty, 4 throwaway test rows.)
--
-- Add the conversation_id FKs NOT VALID: every FUTURE insert is enforced (a bad
-- conversation_id now fails with 23503, so the class cannot recur) while the
-- inert legacy orphans are tolerated. CASCADE so a deleted conversation takes
-- its working docs + junctions with it.
--
-- Code side (same change): features/agents/hooks/useWorkingDocument.ts now gates
-- provisioning on `!selectIsCacheOnly(conversationId)` (server-confirmed), and
-- cx-working-document.service.ts surfaces the 23503 race loudly. The 317 legacy
-- orphans can be deleted + the FK VALIDATEd in a follow-up once approved.
DO $f$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='working_documents_conversation_id_fkey' AND connamespace='chat'::regnamespace) THEN
    ALTER TABLE chat.working_documents ADD CONSTRAINT working_documents_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES chat.conversation(id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='conversation_documents_conversation_id_fkey' AND connamespace='chat'::regnamespace) THEN
    ALTER TABLE chat.conversation_documents ADD CONSTRAINT conversation_documents_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES chat.conversation(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $f$;
