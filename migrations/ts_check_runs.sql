-- TypeScript error-check runs for the admin "TypeScript Errors" tool.
-- The check runs against a local/self-hosted codebase checkout; results are
-- persisted here so the UI (local or remote) shows the database as the single
-- source of truth. Idempotent + re-appliable.

create table if not exists public.ts_check_runs (
  id            uuid primary key default gen_random_uuid(),
  ran_at        timestamptz not null default now(),
  ran_by        uuid,
  codebase_path text not null,
  tsconfig      text not null default 'tsconfig.typecheck.json',
  status        text not null default 'success',            -- 'success' | 'error'
  error_count   integer not null default 0,
  duration_ms   integer,
  message       text,                                       -- populated on failure
  errors        jsonb not null default '[]'::jsonb
);

create index if not exists ts_check_runs_ran_at_idx
  on public.ts_check_runs (ran_at desc);

alter table public.ts_check_runs enable row level security;

-- Super admins only. Reads happen directly from the browser (RLS-gated);
-- writes happen from the super-admin-gated API route under the user session.
drop policy if exists ts_check_runs_super_admin_all on public.ts_check_runs;
create policy ts_check_runs_super_admin_all
  on public.ts_check_runs
  for all
  using (public.is_super_admin())
  with check (public.is_super_admin());
