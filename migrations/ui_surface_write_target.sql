-- The WRITE half of the surface manifest, mirrored from code so the SERVER
-- (and therefore every surface-bound agent) can see what a surface accepts.
--
-- Read-only mirror of `SurfaceManifest.writeTargets` (features/surfaces/types.ts).
-- Code is truth; this table is the synced projection, exactly like
-- ui.ui_surface_value for the read half. Written by manifest-sync.service.ts,
-- read by aidream's surface manifest feed + injected surface context.
-- Same access shape as ui_surface_value: world-readable, super-admin writes.
--
-- APPLIED LIVE 2026-07-29 via Supabase MCP (project txzxabzwovsujtloxrus).
create table if not exists ui.ui_surface_write_target (
  surface_name  text        not null references ui.ui_surface(name) on delete cascade,
  name          text        not null,
  label         text        not null default '',
  description   text        not null default '',
  value_type    text        not null default 'string',
  mode          text        not null default 'draft',
  updates_value text,
  group_key     text        not null default 'general',
  sort_order    integer     not null default 1000,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint ui_surface_write_target_pkey primary key (surface_name, name),
  constraint ui_surface_write_target_mode_check check (mode in ('draft', 'entity', 'ui'))
);

comment on table ui.ui_surface_write_target is
  'Synced mirror of SurfaceManifest.writeTargets — what agents and rendered result components may WRITE into a surface. Code (matrx-frontend features/surfaces/manifests) is the source of truth; rows here are written by manifest-sync.service.ts and read by aidream''s surface manifest feed. Never hand-edit.';

alter table ui.ui_surface_write_target enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='ui' and tablename='ui_surface_write_target' and policyname='ui_surface_write_target_read') then
    create policy ui_surface_write_target_read on ui.ui_surface_write_target for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='ui' and tablename='ui_surface_write_target' and policyname='ui_surface_write_target_read_anon') then
    create policy ui_surface_write_target_read_anon on ui.ui_surface_write_target for select to anon using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='ui' and tablename='ui_surface_write_target' and policyname='ui_surface_write_target_service_role') then
    create policy ui_surface_write_target_service_role on ui.ui_surface_write_target for all to service_role using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='ui' and tablename='ui_surface_write_target' and policyname='ui_surface_write_target_write_admin') then
    create policy ui_surface_write_target_write_admin on ui.ui_surface_write_target for all to authenticated using (is_super_admin()) with check (is_super_admin());
  end if;
end $$;

grant select on ui.ui_surface_write_target to anon, authenticated;
grant all on ui.ui_surface_write_target to service_role;

create index if not exists ui_surface_write_target_surface_idx
  on ui.ui_surface_write_target (surface_name);

-- Who may apply a write target WITHOUT a human in the loop.
-- Default 'manual': nothing becomes agent-writable by omission. A user click
-- on a declared control is always allowed regardless of this value.
alter table ui.ui_surface_write_target
  add column if not exists apply_policy text not null default 'manual';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'ui.ui_surface_write_target'::regclass
      and conname = 'ui_surface_write_target_apply_policy_check'
  ) then
    alter table ui.ui_surface_write_target
      add constraint ui_surface_write_target_apply_policy_check
      check (apply_policy in ('manual', 'ask', 'auto'));
  end if;
end $$;

comment on column ui.ui_surface_write_target.apply_policy is
  'manual = agent-originated writes refused (user gesture only); ask = user is asked in place; auto = applied immediately. Mirrored from SurfaceWriteTarget.applyPolicy. Default manual — nothing becomes agent-writable by omission.';
