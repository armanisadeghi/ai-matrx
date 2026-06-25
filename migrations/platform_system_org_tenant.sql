-- platform_system_org_tenant.sql
-- Applied 2026-06-24 (Wave 3 foundation). Marks the canonical SYSTEM tenant.
--
-- Ownerless global/builtin/system rows (builtin agents, system templates, etc.) are OWNED
-- by the existing "Matrx System" org (id 39c38960-…, 0 members → invisible in users' org
-- lists) and stay visible to all via the is_public RLS branch. Keeps org_id NOT NULL
-- universal with no special-casing. (platform.retrofit_entity's 'personal' strategy falls
-- back to the is_system org for user_id IS NULL rows.) Idempotent.

alter table public.organizations add column if not exists is_system boolean not null default false;
update public.organizations set is_system = true where slug = 'matrx-system';
