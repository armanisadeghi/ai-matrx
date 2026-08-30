-- Rename support for marketing URL keys (agency-model tree).
-- Old keys live in a per-row array — the resolver falls back to it and 308s to
-- the current key, so a renamed brand/site never dead-links. Chains collapse
-- naturally (every past key stays in the one array). No new table, no new RLS.
-- Design: docs/handoffs/marketing-agency-restructure.md (rename affordance).

alter table web.brand add column if not exists previous_slugs text[] not null default '{}';
alter table web.site  add column if not exists previous_slugs text[] not null default '{}';

comment on column web.brand.previous_slugs is 'Every URL key this brand has had before the current slug; resolver 308s these to slug.';
comment on column web.site.previous_slugs  is 'Every URL key this site has had before the current slug (per brand); resolver 308s these to slug.';

create index if not exists brand_previous_slugs_gin on web.brand using gin (previous_slugs);
create index if not exists site_previous_slugs_gin on web.site using gin (previous_slugs);

notify pgrst, 'reload schema';
