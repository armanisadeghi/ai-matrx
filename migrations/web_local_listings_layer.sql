-- Local & Listings layer (marketing.local pillar). APPLIED LIVE 2026-08-18 via Supabase MCP.
-- Three tables via the canonical provisioner (db-rules §2):
--   web.business_location  — component of web_brand: the canonical NAP+ profile of one physical/service location.
--   web.listing_publisher  — system reference registry of directory/listing publishers (research-seeded).
--     Named listing_publisher (not provider) because web.provider's role is "an analysis service we call";
--     a publisher is a third-party surface we are listed ON — different role, distinct name per db-rules §1a.
--     Visibility 'public': shared reference data (db-rules §6a-1). Working label pending Arman naming ruling.
--   web.location_listing   — component of web_business_location: one location's presence on one publisher.
-- Not called "location": seo.location already means a geo/DataForSEO lookup (§1a — distinct name taken).

do $$
begin
if to_regclass('web.business_location') is null then
  perform platform.create_entity_table(
    'web','business_location','web_business_location','Business Location',
    ARRAY[
      'brand_id uuid NOT NULL REFERENCES web.brand(id) ON DELETE CASCADE',
      'name text NOT NULL',
      'status text NOT NULL DEFAULT ''active''',
      'is_primary boolean NOT NULL DEFAULT false',
      'street_address text',
      'address_line2 text',
      'locality text',
      'region text',
      'postal_code text',
      'country_code text',
      'phone text',
      'email text',
      'website_url text',
      'latitude double precision',
      'longitude double precision',
      'business_type text',
      'categories text[] NOT NULL DEFAULT ''{}''',
      'opening_hours jsonb NOT NULL DEFAULT ''[]''::jsonb',
      'special_hours jsonb NOT NULL DEFAULT ''[]''::jsonb',
      'attributes jsonb NOT NULL DEFAULT ''{}''::jsonb',
      'identifiers jsonb NOT NULL DEFAULT ''{}''::jsonb',
      'description text'
    ],
    'component', true, true, 'none', false, false, true, false,
    ARRAY['web_brand:brand_id']);
end if;

if to_regclass('web.listing_publisher') is null then
  perform platform.create_entity_table(
    'web','listing_publisher','web_listing_publisher','Listing Publisher',
    ARRAY[
      'slug text NOT NULL',
      'name text NOT NULL',
      'domain text',
      'tier text NOT NULL',
      'is_aggregator boolean NOT NULL DEFAULT false',
      'api_access text NOT NULL DEFAULT ''none''',
      'api_notes text',
      'manage_url text',
      'categories text[] NOT NULL DEFAULT ''{}''',
      'citation_weight smallint NOT NULL DEFAULT 50',
      'sort_rank integer NOT NULL DEFAULT 1000'
    ],
    'system', true, true, 'public', false, false, false, false);
end if;

if to_regclass('web.location_listing') is null then
  perform platform.create_entity_table(
    'web','location_listing','web_location_listing','Location Listing',
    ARRAY[
      'location_id uuid NOT NULL REFERENCES web.business_location(id) ON DELETE CASCADE',
      'publisher_id uuid NOT NULL REFERENCES web.listing_publisher(id) ON DELETE CASCADE',
      'status text NOT NULL DEFAULT ''unknown''',
      'listing_url text',
      'observed jsonb NOT NULL DEFAULT ''{}''::jsonb',
      'nap_match jsonb',
      'match_score smallint',
      'last_checked_at timestamptz',
      'source text NOT NULL DEFAULT ''manual''',
      'notes text'
    ],
    'component', false, true, 'none', false, false, true, false,
    ARRAY['web_business_location:location_id']);
end if;
end $$;

create unique index if not exists listing_publisher_slug_key on web.listing_publisher(slug);
create unique index if not exists location_listing_location_publisher_key on web.location_listing(location_id, publisher_id) where deleted_at is null;
create index if not exists business_location_brand_idx on web.business_location(brand_id);
create index if not exists location_listing_location_idx on web.location_listing(location_id);
create index if not exists location_listing_publisher_idx on web.location_listing(publisher_id);
