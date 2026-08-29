-- scfg_02_scope_kinds_and_override_store.sql
-- ============================================================================
-- SCOPED CONFIGURATION Phase 1b — the rung vocabulary and the ONE override
-- store for ALL settings.
--
-- platform.knob_scope_kind reconciles the three middle-rung vocabularies the
-- platform grew independently (HR: employer_profile/pay_group/location;
-- marketing settings-ladder: brand/site; mandates ONE-SYSTEM: generic "scope")
-- into one registered ladder. precedence is UNIQUE by construction so no two
-- kinds can ever tie; nearest-scope-wins = highest precedence present.
-- scope_schema/scope_table let the one write path verify scope-row tenancy
-- generically (every registered scope table carries organization_id +
-- deleted_at — verified live 2026-08-29).
--
-- platform.knob_override is ONE table for every setting, deliberately NOT a
-- canonical entity table — the same registry posture platform.feature_knob
-- recorded in migration 0410: composite text key, no owner semantics, nothing
-- shareable, and ≤2 ddl_guard sentinel columns. Its PK carries organization_id
-- because the user rung is org-qualified: the same person may run two
-- organizations with different policies, so (feature,key,'user',user_id) alone
-- would collide across their orgs.
--
-- Relationship to policies/settings-ladder.md rule 7 ("no new table per
-- setting; storage reuses existing settings columns"): this is one table for
-- ALL settings, not a table per setting — the rule's target was per-setting /
-- per-feature table proliferation (SPEC-DATA-MODEL §19 rejected an hr.config
-- table on exactly that ground). It does supersede the rule's LETTER (org
-- overrides move out of iam.organizations.settings jsonb into typed rows with
-- per-key audit, range validation, and counts), which is flagged to Arman in
-- the Phase 7 decision list.
--
-- RLS is HAND-WRITTEN here, deviating from iam.apply_config_rls deliberately:
-- that generator's cfg_* policies require visibility + created_by columns,
-- which would push this table over the ddl_guard sentinel budget and give a
-- registry row owner semantics it must not have. Posture mirrors feature_knob:
--   read  = org members, set-wise via iam.my_orgs() (per the D146 planner rule)
--   write = no client policy at all; platform.knob_override_set is the only
--           door. Note the accepted consequence, flagged for Arman: org
--           members can READ other members' user-scope config rows (config is
--           operational policy — consent and preference stores are excluded
--           from this system by design).
-- ============================================================================

create table if not exists platform.knob_scope_kind (
  kind         text primary key,
  precedence   integer not null unique,
  scope_schema text,
  scope_table  text,
  description  text not null,
  constraint knob_scope_kind_table_pair_check
    check ((scope_schema is null) = (scope_table is null))
);

insert into platform.knob_scope_kind (kind, precedence, scope_schema, scope_table, description) values
  ('organization',     10, null, null,
   'The organization itself. scope_id = organization_id.'),
  ('employer_profile', 20, 'hr', 'employer_profile',
   'HR employer profile within an organization (SPEC-DATA-MODEL §19 rung 3).'),
  ('brand',            22, 'web', 'brand',
   'Marketing brand within an organization (settings-ladder rung 3).'),
  ('pay_group',        30, 'hr', 'pay_group',
   'HR pay group within an employer (nearer than employer_profile).'),
  ('site',             32, 'web', 'site',
   'Marketing site within a brand (settings-ladder rung 4).'),
  ('location',         40, 'hr', 'location',
   'HR physical location (nearest HR scope).'),
  ('user',            100, null, null,
   'The individual, org-qualified: the same person may hold different values in different organizations. scope_id = user_id.')
on conflict (kind) do update
  set precedence = excluded.precedence,
      scope_schema = excluded.scope_schema,
      scope_table = excluded.scope_table,
      description = excluded.description;

create table if not exists platform.knob_override (
  feature         text not null,
  key             text not null,
  scope_kind      text not null references platform.knob_scope_kind(kind),
  scope_id        uuid not null,
  organization_id uuid not null references iam.organizations(id) on delete cascade,
  value           jsonb not null,
  set_note        text,
  updated_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (feature, key, scope_kind, scope_id, organization_id),
  constraint knob_override_org_scope_check
    check (scope_kind <> 'organization' or scope_id = organization_id),
  constraint knob_override_knob_fkey
    foreign key (feature, key) references platform.feature_knob (feature, key)
    on update cascade on delete cascade
);

create index if not exists knob_override_org_feature_idx
  on platform.knob_override (organization_id, feature);

alter table platform.knob_scope_kind enable row level security;
drop policy if exists knob_scope_kind_read on platform.knob_scope_kind;
create policy knob_scope_kind_read on platform.knob_scope_kind
  for select to anon, authenticated using (true);
drop policy if exists svc_all on platform.knob_scope_kind;
create policy svc_all on platform.knob_scope_kind
  for all to service_role using (true) with check (true);
grant select on platform.knob_scope_kind to anon, authenticated;

alter table platform.knob_override enable row level security;
drop policy if exists svc_all on platform.knob_override;
create policy svc_all on platform.knob_override
  for all to service_role using (true) with check (true);
drop policy if exists knob_override_read on platform.knob_override;
create policy knob_override_read on platform.knob_override
  for select to authenticated
  using (organization_id in (select iam.my_orgs()));
-- No client write policy: platform.knob_override_set (scfg_03) is the only door.
grant select on platform.knob_override to authenticated;
