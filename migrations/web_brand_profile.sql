-- Brand profile — structured editorial identity agents can't derive from crawl data.
-- One JSONB column on the anchor entity (simplicity doctrine: no new table, no service).
-- Shape is owned by `BrandProfile` in features/marketing/types.ts; the column stays
-- schemaless at the DB edge ('{}' default) so profile fields can evolve in code only.

alter table web.brand
  add column if not exists profile jsonb not null default '{}'::jsonb;

comment on column web.brand.profile is
  'Structured editorial brand profile (audience, voice, positioning, offerings, competitors, content guidelines). Shape owned by BrandProfile in matrx-frontend features/marketing/types.ts. Human-authored; agents read it via the marketing surface brand_context XML.';
