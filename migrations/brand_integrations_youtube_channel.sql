-- brand_integrations_youtube_channel — the brand ↔ owned YouTube channel binding.
--
-- WHY THIS COLUMN EXISTS (google-native U-M3, chair ruling 2 of the dispatch).
-- `POST /google-sync/youtube/refresh` needs two facts before it can read a
-- single video: WHICH connected Google account (`connection_id`) and WHICH
-- owned channel (`channel_id`). Today neither is written down anywhere a brand
-- screen can find: the channel's authorization is a
-- `users.integration_connection_resources` row with
-- `resource_type = 'youtube_channel'`, discovered at connect time and never
-- bound to a brand (aidream `services/google_integrations/service.py`). So the
-- brand channel panel had nothing to refresh FROM, and `web.channel_analytics_daily`
-- could only ever be filled by a hand-built API call.
--
-- WHY IT MIRRORS `web.site.integrations` EXACTLY, rather than a new table or a
-- `settings` key. The Google Analytics 4 property binding of U-M1 already lives
-- on `web.site.integrations` as
--   {"marketing":{"providers":{"google_analytics_4":{"enabled",
--     "credential_authority","credential_ref","resource_ref"}}}}
-- read and written by the ONE schema module
-- (`features/marketing/data/integrations-schema.ts`). A channel binding is the
-- same three facts about a different provider on a different row, so it takes
-- the same column name, the same document shape and the same parser — one
-- reader, one writer, one place a person learns the shape. A second mechanism
-- (`settings` key, association pair, a `brand_integration` table) would be a
-- second answer to a question this platform has already answered, and the GA
-- editor could never be reused for it.
--
-- WHY NOT an association `web_brand ↔ youtube_channel`: the resource row is a
-- `users.integration_connection_resources` row, which is NOT a registered
-- entity and holds no `platform.entity_types` token, so there is no pair to
-- register. (0767 records the same fact for `web.channel_analytics_daily`'s
-- `ledger` variant.)
--
-- COST IF WRONG: one jsonb key to stop reading, and the same three facts move
-- to whatever replaces them. No data is moved, nothing is dropped, and every
-- row keeps working: the default is an empty document, which the parser already
-- reads as "no provider is bound".
--
-- ADDITIVE AND METADATA-ONLY. `ADD COLUMN … DEFAULT '{}'::jsonb` on a
-- non-volatile default is a catalog write in PostgreSQL 11+ — no table rewrite,
-- no scan. New columns inherit the table-level SELECT/UPDATE grants, so the
-- client sees it without a GRANT (every `GRANT` is refused by the migration
-- judgement).
--
-- Reversible: `ALTER TABLE web.brand DROP COLUMN integrations;` (a chair step,
-- since a DROP is non-additive by construction).
--
-- NOT APPLIED by the session that wrote it: apply with
--   pnpm db:apply migrations/brand_integrations_youtube_channel.sql
-- Ledger: public._schema_migrations (source 'matrx-frontend').
-- After applying, regenerate: pnpm db-types.

SET lock_timeout = '2s';

ALTER TABLE web.brand
  ADD COLUMN IF NOT EXISTS integrations jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN web.brand.integrations IS
  'Per-provider bindings for this brand, in the SAME document shape as web.site.integrations: {"marketing":{"providers":{"<provider>":{"enabled","credential_authority","credential_ref","resource_ref"}}}}. Today it carries youtube_channel — credential_ref is the users.integration_connections id and resource_ref is the YouTube channel id (UC…) — which is what POST /google-sync/youtube/refresh needs to refresh web.youtube_video and web.channel_analytics_daily for this brand. Parsed and written by the one module features/marketing/data/integrations-schema.ts; never a second shape (google-native U-M3).';
