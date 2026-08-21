-- D232 §B — the four post-doctrine `seo` tables that fail `iam.canonical_certify_ok`.
--
-- Live-verified 2026-08-21 before writing (per doctrine Trap 4: read the failing
-- check_name/detail, never the count):
--   seo.source_request  (entity, 0 rows)     base_org_not_null, base_org_fk,
--                                            base_created_by_fk, base_updated_by_fk,
--                                            trg_stamp_actor, policy_owner_shortcircuit
--   seo.story_angle     (entity, 15 rows)    same six
--   seo.landscape_brief (component, 8 rows)  base_created_by, base_updated_by, trg_stamp_actor
--   seo.page_measurement_health (component, 3846 rows)
--                                            base_created_by, base_updated_by, base_metadata,
--                                            base_version, base_org_fk, trg_stamp_actor, trg_touch_row
--
-- Everything here is ADDITIVE (doctrine §8d: do the additive half first, always).
-- No column is dropped, no writer has to change, and no existing insert can start
-- failing: every added column is nullable or defaulted.
--
-- Reserved-name preflight (doctrine §8d): `created_by`/`updated_by` are uuid wherever
-- they already exist on these four tables — no enum/numeric squatter, so attaching
-- `_stamp_actor` is safe.
--
-- Components carry the full base contract MINUS `visibility` (doctrine §5, verified
-- against four certified components) — so `created_by`/`updated_by` belong on
-- `landscape_brief` / `page_measurement_health`, and `visibility` deliberately does not
-- (db-rules §6d-1, THE COMPONENT OWNERSHIP LAW).
--
-- `organization_id NOT NULL` and its backstop trigger are ONE migration (db-rules §2).
-- Live count of org-null rows on both entities before the ALTER: 0.
--
-- Idempotent throughout.

-- ─────────────────────────────────────────────────────────────────────────────
-- seo.source_request  (entity)
-- ─────────────────────────────────────────────────────────────────────────────
alter table seo.source_request alter column organization_id set not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'seo.source_request'::regclass and conname = 'source_request_organization_id_fkey') then
    alter table seo.source_request add constraint source_request_organization_id_fkey
      foreign key (organization_id) references iam.organizations(id);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'seo.source_request'::regclass and conname = 'source_request_created_by_fkey') then
    alter table seo.source_request add constraint source_request_created_by_fkey
      foreign key (created_by) references auth.users(id);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'seo.source_request'::regclass and conname = 'source_request_updated_by_fkey') then
    alter table seo.source_request add constraint source_request_updated_by_fkey
      foreign key (updated_by) references auth.users(id);
  end if;
end $$;

drop trigger if exists _stamp_actor on seo.source_request;
create trigger _stamp_actor before insert or update on seo.source_request
  for each row execute function platform._stamp_actor();

-- site_id is NULLABLE here, so the org cannot be inherited from a parent: default it
-- from the creator (db-rules §2).
drop trigger if exists _stamp_org_default on seo.source_request;
create trigger _stamp_org_default before insert on seo.source_request
  for each row execute function public._stamp_org_default();

-- ─────────────────────────────────────────────────────────────────────────────
-- seo.story_angle  (entity)
-- ─────────────────────────────────────────────────────────────────────────────
alter table seo.story_angle alter column organization_id set not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'seo.story_angle'::regclass and conname = 'story_angle_organization_id_fkey') then
    alter table seo.story_angle add constraint story_angle_organization_id_fkey
      foreign key (organization_id) references iam.organizations(id);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'seo.story_angle'::regclass and conname = 'story_angle_created_by_fkey') then
    alter table seo.story_angle add constraint story_angle_created_by_fkey
      foreign key (created_by) references auth.users(id);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'seo.story_angle'::regclass and conname = 'story_angle_updated_by_fkey') then
    alter table seo.story_angle add constraint story_angle_updated_by_fkey
      foreign key (updated_by) references auth.users(id);
  end if;
end $$;

drop trigger if exists _stamp_actor on seo.story_angle;
create trigger _stamp_actor before insert or update on seo.story_angle
  for each row execute function platform._stamp_actor();

-- site_id is NOT NULL here, so the org inherits from web.site.
drop trigger if exists _inherit_org on seo.story_angle;
create trigger _inherit_org before insert on seo.story_angle
  for each row execute function platform.inherit_org_from_parent('web', 'site', 'site_id');

-- ─────────────────────────────────────────────────────────────────────────────
-- seo.landscape_brief  (component of web.site)
-- ─────────────────────────────────────────────────────────────────────────────
alter table seo.landscape_brief add column if not exists created_by uuid references auth.users(id);
alter table seo.landscape_brief add column if not exists updated_by uuid references auth.users(id);

drop trigger if exists _stamp_actor on seo.landscape_brief;
create trigger _stamp_actor before insert or update on seo.landscape_brief
  for each row execute function platform._stamp_actor();

-- ─────────────────────────────────────────────────────────────────────────────
-- seo.page_measurement_health  (component of web.page)
-- ─────────────────────────────────────────────────────────────────────────────
alter table seo.page_measurement_health add column if not exists created_by uuid references auth.users(id);
alter table seo.page_measurement_health add column if not exists updated_by uuid references auth.users(id);
alter table seo.page_measurement_health add column if not exists version integer not null default 1;
alter table seo.page_measurement_health add column if not exists metadata jsonb not null default '{}'::jsonb;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'seo.page_measurement_health'::regclass and conname = 'page_measurement_health_organization_id_fkey') then
    alter table seo.page_measurement_health add constraint page_measurement_health_organization_id_fkey
      foreign key (organization_id) references iam.organizations(id);
  end if;
end $$;

drop trigger if exists _stamp_actor on seo.page_measurement_health;
create trigger _stamp_actor before insert or update on seo.page_measurement_health
  for each row execute function platform._stamp_actor();

drop trigger if exists _touch_row on seo.page_measurement_health;
create trigger _touch_row before insert or update on seo.page_measurement_health
  for each row execute function platform._touch_row();

-- ─────────────────────────────────────────────────────────────────────────────
-- Regenerate the canonical policies (fixes `policy_owner_shortcircuit`: `std_select`
-- was missing the `created_by` short-circuit, a live 42501 risk for a row's own owner).
-- `iam.apply_rls` is the ONLY supported way to change canonical policies.
-- ─────────────────────────────────────────────────────────────────────────────
select iam.apply_rls('seo', 'source_request', 'seo_source_request', 'entity');
select iam.apply_rls('seo', 'story_angle', 'seo_story_angle', 'entity');
select iam.apply_rls('seo', 'landscape_brief', 'seo_landscape_brief', 'component');
select iam.apply_rls('seo', 'page_measurement_health', 'seo_page_measurement_health', 'component');

-- ─────────────────────────────────────────────────────────────────────────────
-- `visibility` on the two ENTITY tables (db-rules §2: the enum is part of the base
-- contract on `entity`/`system` variants; both were missing it, leaving a WARN that
-- alone kept them off certified).
--
-- Default justification (db-rules §6a-1 requires one in the migration): both tables
-- hold an organization's PR pipeline work product — journalist source requests matched
-- against the org's own site, and the generated/reviewed story angles behind them.
-- They are neither personal artifacts (`personal` would be the documented defect) nor
-- public-web content (`public` is for scraped/derived material). => `internal`.
-- ─────────────────────────────────────────────────────────────────────────────
alter table seo.source_request add column if not exists visibility platform.visibility not null default 'internal';
alter table seo.story_angle    add column if not exists visibility platform.visibility not null default 'internal';

update platform.entity_types set default_visibility = 'internal'
 where token in ('seo_source_request', 'seo_story_angle') and default_visibility is distinct from 'internal'::platform.visibility;

select iam.apply_rls('seo', 'source_request', 'seo_source_request', 'entity');
select iam.apply_rls('seo', 'story_angle', 'seo_story_angle', 'entity');
