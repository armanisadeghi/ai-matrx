-- Applied via Supabase MCP 2026-08-13 (agent_message_template_canonicalize).
-- agent.message_template (moved from public.content_template): metadata + updated_at NOT NULL,
-- and the 4 bespoke content_template_* policies replaced by canonical entity-variant policies.
-- WHY IT MATTERED: those policies gated on has_permission('content_template', ...) — a token that
-- exists in NEITHER registry (both say 'message_template') and holds zero grants, so every share
-- grant created today was silently ignored (the silent-closed token-mismatch class).
-- Data verified pre-flight: visibility fully migrated (8 public rows, ZERO is_public disagreement),
-- created_by complete (0 mismatch / 0 null), updated_at + metadata fully populated.
-- Live-proven post-apply: anon sees exactly the 8 public rows (/p/e/ lane intact), owner sees 10.
alter table agent.message_template alter column metadata set not null, alter column metadata set default '{}'::jsonb;
alter table agent.message_template alter column updated_at set not null, alter column updated_at set default now();
select iam.apply_rls('agent','message_template','message_template','entity');
