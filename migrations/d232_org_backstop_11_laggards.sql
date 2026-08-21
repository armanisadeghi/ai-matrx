-- D232 §C — organization_id NOT NULL with no backstop: the last 11 laggards.
--
-- db-rules FEATURE.md §2: `_stamp_org_default` is a REQUIRED backstop any time
-- `organization_id` is NOT NULL — without it an org-forgetting write 500s (23502).
-- Children take the parent's org via `platform.inherit_org_from_parent(parent_schema,
-- parent_table, fk_column)`; roots default from `created_by` -> `auth.uid()` via
-- `public._stamp_org_default()`.
--
-- Verified live 2026-08-21: all 11 carry `organization_id NOT NULL`, no default,
-- and no org-bearing BEFORE INSERT trigger. Every parent named below was confirmed
-- to carry `organization_id`.
--
-- Idempotent: every trigger is dropped-if-exists then created.

-- ── roots: org defaults from the creator ─────────────────────────────────────
drop trigger if exists _stamp_org_default on billing.account_addon;
create trigger _stamp_org_default before insert on billing.account_addon
  for each row execute function public._stamp_org_default();

drop trigger if exists _stamp_org_default on billing.org_plan;
create trigger _stamp_org_default before insert on billing.org_plan
  for each row execute function public._stamp_org_default();

drop trigger if exists _stamp_org_default on content_ir.io_contract;
create trigger _stamp_org_default before insert on content_ir.io_contract
  for each row execute function public._stamp_org_default();

drop trigger if exists _stamp_org_default on crm.outreach_acceptance;
create trigger _stamp_org_default before insert on crm.outreach_acceptance
  for each row execute function public._stamp_org_default();

drop trigger if exists _stamp_org_default on platform.org_change_policy;
create trigger _stamp_org_default before insert on platform.org_change_policy
  for each row execute function public._stamp_org_default();

drop trigger if exists _stamp_org_default on platform.org_module_config;
create trigger _stamp_org_default before insert on platform.org_module_config
  for each row execute function public._stamp_org_default();

drop trigger if exists _stamp_org_default on web.listing_publisher;
create trigger _stamp_org_default before insert on web.listing_publisher
  for each row execute function public._stamp_org_default();

-- ── children: org inherited from the composition parent ──────────────────────
-- crm.unsubscribe_token.contact_medium_id NOT NULL -> crm.contact_medium
drop trigger if exists _inherit_org on crm.unsubscribe_token;
create trigger _inherit_org before insert on crm.unsubscribe_token
  for each row execute function platform.inherit_org_from_parent('crm', 'contact_medium', 'contact_medium_id');

-- platform.masterwork_run.rulebook_id NOT NULL -> platform.rulebook
drop trigger if exists _inherit_org on platform.masterwork_run;
create trigger _inherit_org before insert on platform.masterwork_run
  for each row execute function platform.inherit_org_from_parent('platform', 'rulebook', 'rulebook_id');

-- seo.landscape_brief.site_id NOT NULL -> web.site
drop trigger if exists _inherit_org on seo.landscape_brief;
create trigger _inherit_org before insert on seo.landscape_brief
  for each row execute function platform.inherit_org_from_parent('web', 'site', 'site_id');

-- seo.page_measurement_health.page_id NOT NULL -> web.page
-- (site_id is nullable on this table, so page_id is the reliable inheritance edge)
drop trigger if exists _inherit_org on seo.page_measurement_health;
create trigger _inherit_org before insert on seo.page_measurement_health
  for each row execute function platform.inherit_org_from_parent('web', 'page', 'page_id');
