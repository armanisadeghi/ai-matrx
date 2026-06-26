-- cx_conversation_visibility_expand.sql
-- Applied during the canonical-model cutover (via Supabase MCP apply_migration).
--
-- Completes an IN-PROGRESS canonicalization rather than forking it. cx_ already
-- has a canonical vocabulary + component model in platform.entity_types:
--   conversation -> public.cx_conversation (root, default_visibility='private')
--   artifact     -> public.cx_artifact     (component)
--   message      -> public.cx_message      (component)
-- But `conversation` was registered with default_visibility='private' while
-- public.cx_conversation has NO `visibility` column — so iam.has_access(
-- 'conversation', …) errors (reads a missing column). Add the column so the
-- existing registration actually resolves. Per docs/db_rebuild/03 §2.1:
-- is_public=true → 'public', false → 'private'. Also backfill created_by from
-- user_id (collapse prep). 100% additive; no RLS/enforcement change.
--
-- DEFERRED (DB-owner's active cx_/wf_ architecture — do NOT fork): registering
-- the other cx_ roots (working_documents / user_todo / agent_memory / agent_plan
-- / observational_memory) and wf_ uses the DB owner's token vocabulary +
-- root/component model; the cx_ RLS switch to has_access (live-chat semantics) and
-- the is_public/user_id contract drop are coupled, verified follow-ups. wf_ is not
-- yet in entity_types and its React FE is on the disconnected old system, so it
-- has no live consumer to benefit yet (server uses service-role / bypasses RLS).
-- cx_agent_task is excluded entirely — its `created_by` is a custom enum
-- (cx_agent_task_creator), not an actor uuid; remodeling it is a separate call.
-- Idempotent.

alter table public.cx_conversation add column if not exists visibility platform.visibility not null default 'private';
update public.cx_conversation set visibility = 'public' where is_public is true and visibility <> 'public';
update public.cx_conversation set created_by = user_id where created_by is null and user_id is not null;
