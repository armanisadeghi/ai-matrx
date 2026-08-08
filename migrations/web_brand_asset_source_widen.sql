-- Widen web.brand_asset.source provenance: AI-generated assets and assets
-- promoted from research join discovered/uploaded/manual.
-- Applied live 2026-08-08 via Supabase MCP (web_brand_asset_source_generated_research).
alter table web.brand_asset drop constraint if exists brand_asset_source_check;
alter table web.brand_asset add constraint brand_asset_source_check
  check (source = any (array['discovered'::text,'uploaded'::text,'manual'::text,'generated'::text,'research'::text]));
