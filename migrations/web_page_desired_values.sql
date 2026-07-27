-- web.page.desired_values — the per-area desired-state mirror for the page
-- workspace (social card, h1/headings outline, canonical/robots, image plan,
-- notes…). Follows the seo_metrics_desired jsonb precedent; keys are added by
-- the client without further migrations. Writes go through the ONE
-- read-merge-write service fn (updatePageDesiredValues) guarded by version.
alter table web.page
  add column if not exists desired_values jsonb not null default '{}'::jsonb;

comment on column web.page.desired_values is
  'Per-area desired-state mirror (social_card, h1, headings_outline, canonical_url, meta_robots, image_plan, image_alts, structured_data_notes, additional_content_notes…). Merge-written by the frontend updatePageDesiredValues path.';
