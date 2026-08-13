-- Follow-up to kill_legacy_applet_app_builder.sql.
--
-- The media-durability DB-edge guard still carried registry rows for
-- public.custom_app_configs.image_url and public.custom_applet_configs.image_url.
-- Those tables now live in `graveyard`, so the rows protect nothing and make the
-- guard misreport its coverage — the same leftover class cleaned up for
-- site_metadata in the earlier public-schema triage batch.
--
-- Idempotent.

delete from public.mtx_public_url_guard
 where schema_name = 'public'
   and table_name in ('applet', 'custom_app_configs', 'custom_applet_configs');
