-- fk_coverage_medium_intra_schema_batch1
-- Adds the orphan-free, MEDIUM-confidence intra-schema FKs surfaced by
-- iam.fk_coverage_gaps. ON DELETE chosen to match the existing sibling-FK
-- convention into each parent table (CASCADE for subordinate runtime/telemetry
-- records, SET NULL for loose references). Verified zero orphan rows before apply.
-- Idempotent: guarded by pg_constraint existence checks.
DO $f$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='observational_memory_event_conversation_id_fkey' AND connamespace='chat'::regnamespace) THEN
    ALTER TABLE chat.observational_memory_event ADD CONSTRAINT observational_memory_event_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES chat.conversation(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='observational_memory_event_user_request_id_fkey' AND connamespace='chat'::regnamespace) THEN
    ALTER TABLE chat.observational_memory_event ADD CONSTRAINT observational_memory_event_user_request_id_fkey FOREIGN KEY (user_request_id) REFERENCES chat.user_request(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tool_trace_conversation_id_fkey' AND connamespace='chat'::regnamespace) THEN
    ALTER TABLE chat.tool_trace ADD CONSTRAINT tool_trace_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES chat.conversation(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='structure_file_id_fkey' AND connamespace='files'::regnamespace) THEN
    ALTER TABLE files.structure ADD CONSTRAINT structure_file_id_fkey FOREIGN KEY (file_id) REFERENCES files.files(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='uploads_inflight_file_id_fkey' AND connamespace='files'::regnamespace) THEN
    ALTER TABLE files.uploads_inflight ADD CONSTRAINT uploads_inflight_file_id_fkey FOREIGN KEY (file_id) REFERENCES files.files(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='derive_runs_processed_document_id_fkey' AND connamespace='public'::regnamespace) THEN
    ALTER TABLE public.derive_runs ADD CONSTRAINT derive_runs_processed_document_id_fkey FOREIGN KEY (processed_document_id) REFERENCES public.processed_documents(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='job_checkpoint_id_fkey' AND connamespace='workflow'::regnamespace) THEN
    ALTER TABLE workflow.job ADD CONSTRAINT job_checkpoint_id_fkey FOREIGN KEY (checkpoint_id) REFERENCES workflow.checkpoint(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='node_events_checkpoint_id_fkey' AND connamespace='workflow'::regnamespace) THEN
    ALTER TABLE workflow.node_events ADD CONSTRAINT node_events_checkpoint_id_fkey FOREIGN KEY (checkpoint_id) REFERENCES workflow.checkpoint(id) ON DELETE SET NULL;
  END IF;
END $f$;
