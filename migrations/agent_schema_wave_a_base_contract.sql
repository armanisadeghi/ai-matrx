-- Applied via Supabase MCP 2026-08-12 (agent_schema_wave_a_base_contract).
-- WAVE A (agent schema): additive base-contract completion. No cuts, no behavior change.
-- Pre-verified live: 0 FK orphans everywhere; cmp_sets fully canonical.
-- NOTE: agent.card is a VIEW (relkind 'v') — excluded; its gate FAILs are a registry/gate relkind question.

alter table agent.definition             add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table agent.template               add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table agent.shortcut               add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table agent.usage                  add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table agent.drift_alert            add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table agent.cmp_comparison_entries add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table agent.definition_version     add column if not exists metadata jsonb not null default '{}'::jsonb;

-- agent.definition_version — base plumbing (append-only publication snapshots)
alter table agent.definition_version add column if not exists created_at timestamptz;
alter table agent.definition_version add column if not exists updated_at timestamptz;
alter table agent.definition_version add column if not exists created_by uuid;
alter table agent.definition_version add column if not exists updated_by uuid;
alter table agent.definition_version add column if not exists organization_id uuid;
alter table agent.definition_version add column if not exists version integer;
update agent.definition_version set created_at = coalesce(created_at, changed_at, now()) where created_at is null;
update agent.definition_version set updated_at = coalesce(updated_at, changed_at, now()) where updated_at is null;
update agent.definition_version v set organization_id = d.organization_id from agent.definition d where d.id = v.agent_id and v.organization_id is null;
update agent.definition_version set version = 1 where version is null;
alter table agent.definition_version
  alter column created_at set not null, alter column created_at set default now(),
  alter column updated_at set not null, alter column updated_at set default now(),
  alter column organization_id set not null,
  alter column version set not null, alter column version set default 1;
do $$ begin
  if not exists (select 1 from pg_constraint where conname='definition_version_organization_id_fkey' and conrelid='agent.definition_version'::regclass) then
    alter table agent.definition_version add constraint definition_version_organization_id_fkey foreign key (organization_id) references iam.organizations(id);
  end if;
  if not exists (select 1 from pg_constraint where conname='definition_version_created_by_fkey' and conrelid='agent.definition_version'::regclass) then
    alter table agent.definition_version add constraint definition_version_created_by_fkey foreign key (created_by) references auth.users(id);
  end if;
  if not exists (select 1 from pg_constraint where conname='definition_version_updated_by_fkey' and conrelid='agent.definition_version'::regclass) then
    alter table agent.definition_version add constraint definition_version_updated_by_fkey foreign key (updated_by) references auth.users(id);
  end if;
end $$;

-- agent.usage — base plumbing (pin-scan registry, component of agent)
alter table agent.usage add column if not exists created_at timestamptz;
alter table agent.usage add column if not exists updated_at timestamptz;
alter table agent.usage add column if not exists created_by uuid;
alter table agent.usage add column if not exists updated_by uuid;
alter table agent.usage add column if not exists organization_id uuid;
alter table agent.usage add column if not exists version integer;
update agent.usage set created_at = coalesce(created_at, first_seen_at, now()) where created_at is null;
update agent.usage set updated_at = coalesce(updated_at, last_seen_at, first_seen_at, now()) where updated_at is null;
update agent.usage u set organization_id = d.organization_id from agent.definition d where d.id = u.agent_id and u.organization_id is null;
update agent.usage set organization_id = '39c38960-d30c-4840-b0c1-c9960de95582' where organization_id is null; -- builtin platform pins: genuine global content -> Matrx System org
update agent.usage set version = 1 where version is null;
alter table agent.usage
  alter column created_at set not null, alter column created_at set default now(),
  alter column updated_at set not null, alter column updated_at set default now(),
  alter column organization_id set not null,
  alter column version set not null, alter column version set default 1;
do $$ begin
  if not exists (select 1 from pg_constraint where conname='usage_organization_id_fkey' and conrelid='agent.usage'::regclass) then
    alter table agent.usage add constraint usage_organization_id_fkey foreign key (organization_id) references iam.organizations(id);
  end if;
  if not exists (select 1 from pg_constraint where conname='usage_created_by_fkey' and conrelid='agent.usage'::regclass) then
    alter table agent.usage add constraint usage_created_by_fkey foreign key (created_by) references auth.users(id);
  end if;
  if not exists (select 1 from pg_constraint where conname='usage_updated_by_fkey' and conrelid='agent.usage'::regclass) then
    alter table agent.usage add constraint usage_updated_by_fkey foreign key (updated_by) references auth.users(id);
  end if;
end $$;

-- agent.drift_alert — base plumbing
alter table agent.drift_alert add column if not exists created_by uuid;
alter table agent.drift_alert add column if not exists updated_by uuid;
alter table agent.drift_alert add column if not exists updated_at timestamptz;
alter table agent.drift_alert add column if not exists organization_id uuid;
alter table agent.drift_alert add column if not exists version integer;
update agent.drift_alert set created_by = user_id where created_by is null;
update agent.drift_alert set updated_at = coalesce(updated_at, created_at, now()) where updated_at is null;
update agent.drift_alert a set organization_id = d.organization_id from agent.definition d where d.id = a.agent_id and a.organization_id is null;
update agent.drift_alert set version = 1 where version is null;
alter table agent.drift_alert
  alter column updated_at set not null, alter column updated_at set default now(),
  alter column organization_id set not null,
  alter column version set not null, alter column version set default 1;
do $$ begin
  if not exists (select 1 from pg_constraint where conname='drift_alert_organization_id_fkey' and conrelid='agent.drift_alert'::regclass) then
    alter table agent.drift_alert add constraint drift_alert_organization_id_fkey foreign key (organization_id) references iam.organizations(id);
  end if;
  if not exists (select 1 from pg_constraint where conname='drift_alert_created_by_fkey' and conrelid='agent.drift_alert'::regclass) then
    alter table agent.drift_alert add constraint drift_alert_created_by_fkey foreign key (created_by) references auth.users(id);
  end if;
  if not exists (select 1 from pg_constraint where conname='drift_alert_updated_by_fkey' and conrelid='agent.drift_alert'::regclass) then
    alter table agent.drift_alert add constraint drift_alert_updated_by_fkey foreign key (updated_by) references auth.users(id);
  end if;
end $$;

-- agent.cmp_comparison_entries — base plumbing (component of comparison_set)
alter table agent.cmp_comparison_entries add column if not exists created_by uuid;
alter table agent.cmp_comparison_entries add column if not exists updated_by uuid;
alter table agent.cmp_comparison_entries add column if not exists updated_at timestamptz;
alter table agent.cmp_comparison_entries add column if not exists organization_id uuid;
alter table agent.cmp_comparison_entries add column if not exists version integer;
alter table agent.cmp_comparison_entries add column if not exists deleted_at timestamptz;
update agent.cmp_comparison_entries e set
  created_by = coalesce(e.created_by, s.created_by, s.user_id),
  organization_id = coalesce(e.organization_id, s.organization_id)
from agent.cmp_comparison_sets s where s.id = e.comparison_set_id
  and (e.created_by is null or e.organization_id is null);
update agent.cmp_comparison_entries set updated_at = coalesce(updated_at, created_at, now()) where updated_at is null;
update agent.cmp_comparison_entries set version = 1 where version is null;
alter table agent.cmp_comparison_entries
  alter column updated_at set not null, alter column updated_at set default now(),
  alter column organization_id set not null,
  alter column version set not null, alter column version set default 1;
do $$ begin
  if not exists (select 1 from pg_constraint where conname='cmp_entries_organization_id_fkey' and conrelid='agent.cmp_comparison_entries'::regclass) then
    alter table agent.cmp_comparison_entries add constraint cmp_entries_organization_id_fkey foreign key (organization_id) references iam.organizations(id);
  end if;
  if not exists (select 1 from pg_constraint where conname='cmp_entries_created_by_fkey' and conrelid='agent.cmp_comparison_entries'::regclass) then
    alter table agent.cmp_comparison_entries add constraint cmp_entries_created_by_fkey foreign key (created_by) references auth.users(id);
  end if;
  if not exists (select 1 from pg_constraint where conname='cmp_entries_updated_by_fkey' and conrelid='agent.cmp_comparison_entries'::regclass) then
    alter table agent.cmp_comparison_entries add constraint cmp_entries_updated_by_fkey foreign key (updated_by) references auth.users(id);
  end if;
end $$;

-- Canonical trigger pair on the four table children
do $$
declare t text;
begin
  foreach t in array array['usage','drift_alert','definition_version','cmp_comparison_entries'] loop
    if not exists (select 1 from pg_trigger tr where tr.tgrelid=('agent.'||t)::regclass and tr.tgname='_stamp_actor') then
      execute format('create trigger _stamp_actor before insert or update on agent.%I for each row execute function platform._stamp_actor()', t);
    end if;
    if not exists (select 1 from pg_trigger tr where tr.tgrelid=('agent.'||t)::regclass and tr.tgname='_touch_row') then
      execute format('create trigger _touch_row before insert or update on agent.%I for each row execute function platform._touch_row()', t);
    end if;
  end loop;
end $$;
