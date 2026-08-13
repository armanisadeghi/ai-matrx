-- content_ir.kind_component_incident: complete the canonical base contract.
-- The table was hand-built as a component (parent: content_ir_kind via
-- kind_definition_id) with correct child-token membrane RLS, but missing the
-- base columns/FKs/trigger. 0 rows at time of change — purely additive.
-- Applied live 2026-08-12 (downtime session). Certified after:
--   iam.canonical_certify_ok('content_ir','kind_component_incident','content_ir_kind_component_incident') = true
alter table content_ir.kind_component_incident
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists version integer not null default 1,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists deleted_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='kind_component_incident_organization_id_fkey') then
    alter table content_ir.kind_component_incident
      add constraint kind_component_incident_organization_id_fkey
        foreign key (organization_id) references iam.organizations(id);
  end if;
  if not exists (select 1 from pg_constraint where conname='kind_component_incident_created_by_fkey') then
    alter table content_ir.kind_component_incident
      add constraint kind_component_incident_created_by_fkey
        foreign key (created_by) references auth.users(id);
  end if;
  if not exists (select 1 from pg_constraint where conname='kind_component_incident_updated_by_fkey') then
    alter table content_ir.kind_component_incident
      add constraint kind_component_incident_updated_by_fkey
        foreign key (updated_by) references auth.users(id);
  end if;
  if not exists (select 1 from pg_trigger where tgrelid='content_ir.kind_component_incident'::regclass and tgname='_touch_row') then
    create trigger _touch_row before insert or update on content_ir.kind_component_incident
      for each row execute function platform._touch_row();
  end if;
end $$;

update platform.entity_types set has_soft_delete = true
  where token = 'content_ir_kind_component_incident';
