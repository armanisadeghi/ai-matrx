-- Working document rebuild — STEP 1b: relax legacy columns to nullable (idempotent).
-- Lets canonical materialize-on-write INSERTs (id, content, organization_id, kind,
-- title, metadata) succeed before the full column drop in STEP 3. Provenance moves
-- to metadata.origin_conversation_id. Applied via Supabase MCP on Matrx Main.
alter table workbench.working_documents alter column conversation_id drop not null;
alter table workbench.working_documents alter column user_id drop not null;
