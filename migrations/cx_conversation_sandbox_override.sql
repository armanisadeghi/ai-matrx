-- Per-conversation sandbox override (power-user "use a different box just here").
--
-- The product model is one shared "active agent sandbox" per user (stored in
-- user_preferences) that every conversation binds to by default. This column
-- lets a single conversation pin a DIFFERENT box. NULL → fall back to the
-- user-active sandbox. The matching proxy_url is mirrored into
-- cx_conversation.metadata.sandbox_override_proxy_url by the write path so the
-- binding resolves on reload with no extra fetch.
--
-- ON DELETE SET NULL: when a sandbox row is deleted/reaped, the conversation
-- auto-unbinds rather than dangling at a dead box.

alter table public.cx_conversation
  add column if not exists sandbox_instance_id uuid
    references public.sandbox_instances(id) on delete set null;

comment on column public.cx_conversation.sandbox_instance_id is
  'Per-conversation sandbox override (power-user). NULL → fall back to the user-active sandbox preference. ON DELETE SET NULL so a deleted/expired sandbox row auto-unbinds.';
