-- KI-049 — The run console: tiered schedule storage (STORAGE ONLY; no dispatcher in v1).
-- One row = "this engine runs on this cadence for this scope".
-- Resolution law: site > organization > system (nearest wins).
do $$
begin
  if to_regclass('seo.engine_schedule') is null then
    perform platform.create_entity_table(
      p_schema      => 'seo',
      p_table       => 'engine_schedule',
      p_token       => 'seo_engine_schedule',
      p_label       => 'SEO Engine Schedule',
      p_fields      => array[
        'engine_slug text NOT NULL',
        'scope_tier text NOT NULL',
        'scope_organization_id uuid REFERENCES iam.organizations(id)',
        'site_id uuid REFERENCES web.site(id)',
        'cadence text NOT NULL',
        'run_at_utc time',
        'day_of_week smallint',
        'max_keywords_per_run integer NOT NULL DEFAULT 50',
        'sites_per_run integer NOT NULL DEFAULT 3',
        'enabled boolean NOT NULL DEFAULT false',
        'notes text'
      ],
      p_variant     => 'entity',
      p_versioned   => true,
      p_soft_delete => true,
      p_visibility  => 'internal',
      p_category    => false,
      p_listed      => false,
      p_org_default => false,
      p_gin_jsonb   => false
    );
  end if;
end $$;

alter table seo.engine_schedule
  drop constraint if exists engine_schedule_scope_tier_check;
alter table seo.engine_schedule
  add constraint engine_schedule_scope_tier_check
  check (scope_tier in ('system','organization','site'));

alter table seo.engine_schedule
  drop constraint if exists engine_schedule_cadence_check;
alter table seo.engine_schedule
  add constraint engine_schedule_cadence_check
  check (cadence in ('hourly','daily','weekly'));

-- The tier decides which pointer the row must carry. A system row points at
-- nothing (it IS the fallback); an organization row names its org; a site row
-- names its site. Anything else is an unresolvable schedule.
alter table seo.engine_schedule
  drop constraint if exists engine_schedule_scope_shape_check;
alter table seo.engine_schedule
  add constraint engine_schedule_scope_shape_check
  check (
    (scope_tier = 'system'       and scope_organization_id is null and site_id is null)
    or (scope_tier = 'organization' and scope_organization_id is not null and site_id is null)
    or (scope_tier = 'site'         and site_id is not null)
  );

alter table seo.engine_schedule
  drop constraint if exists engine_schedule_day_of_week_check;
alter table seo.engine_schedule
  add constraint engine_schedule_day_of_week_check
  check (day_of_week is null or (day_of_week between 0 and 6));

-- One live schedule per (engine, scope). Two rows for the same scope would make
-- "nearest wins" ambiguous, which is the whole law.
create unique index if not exists engine_schedule_system_uniq
  on seo.engine_schedule (engine_slug)
  where deleted_at is null and scope_tier = 'system';
create unique index if not exists engine_schedule_org_uniq
  on seo.engine_schedule (engine_slug, scope_organization_id)
  where deleted_at is null and scope_tier = 'organization';
create unique index if not exists engine_schedule_site_uniq
  on seo.engine_schedule (engine_slug, site_id)
  where deleted_at is null and scope_tier = 'site';

create index if not exists engine_schedule_engine_idx
  on seo.engine_schedule (engine_slug) where deleted_at is null;
