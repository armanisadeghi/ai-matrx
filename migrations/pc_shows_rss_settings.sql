-- pc_shows_rss_settings
--
-- Adds the owner-authored RSS / podcast-directory distribution config to each
-- show. This is the "serious" feed metadata an owner sets before submitting the
-- show to Apple Podcasts / Spotify: Apple top-level category, owner name + email
-- (required by Apple), language, and the explicit flag.
--
-- Stored as a single JSONB column (not separate columns) because it is a small,
-- self-contained settings blob that travels together, is read as a unit by the
-- feed builder, and is expected to grow (sub-categories, additional iTunes tags)
-- without further migrations. The feed route + settings UI guard reads with
-- `?? {}` so the column being absent (pre-apply) or null is safe.
--
-- Shape (all optional; UI fills defaults):
--   {
--     "category":    "Technology",          -- Apple top-level category text
--     "owner_name":  "Jane Doe",
--     "owner_email": "jane@example.com",
--     "language":    "en-us",                -- BCP-47-ish language code
--     "explicit":    false                   -- iTunes explicit flag
--   }

alter table public.pc_shows
  add column if not exists rss_settings jsonb;

comment on column public.pc_shows.rss_settings is
  'Owner-authored RSS/podcast-directory distribution settings (Apple category, owner name/email, language, explicit). Read with ?? {} — see migrations/pc_shows_rss_settings.sql.';
