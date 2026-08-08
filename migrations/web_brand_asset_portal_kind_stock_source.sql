-- Widen web.brand_asset: kind gains 'portal' (brand press-kit / media-portal
-- links surfaced in the media library), source gains 'stock' (saved from a
-- licensed-free stock provider, e.g. Unsplash).
-- Applied live 2026-08-08 via Supabase MCP (web_brand_asset_portal_kind_stock_source).
alter table web.brand_asset drop constraint if exists brand_asset_kind_check;
alter table web.brand_asset add constraint brand_asset_kind_check
  check (kind = any (array['logo'::text,'logo_dark'::text,'favicon'::text,'wordmark'::text,'hero_image'::text,'og_image'::text,'twitter_image'::text,'image'::text,'video'::text,'color'::text,'font'::text,'document'::text,'portal'::text,'other'::text]));
alter table web.brand_asset drop constraint if exists brand_asset_source_check;
alter table web.brand_asset add constraint brand_asset_source_check
  check (source = any (array['discovered'::text,'uploaded'::text,'manual'::text,'generated'::text,'research'::text,'stock'::text]));
