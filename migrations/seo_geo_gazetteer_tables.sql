-- ============================================================================
-- I3 — GEO GAZETTEER: the platform's places, as DATA.
--
-- Arman, 2026-08-22: "Make a list of the fifty United States and maybe the top
-- three hundred or five hundred or even one thousand names of cities across the
-- United States by population … and flagged those as all being local along with
-- words like near me and things like that."
--
-- REUSE CHECK (done before creating anything):
--   * `seo.location` (7 rows) is the PROVIDER location table — country/region/
--     city text + a DataForSEO `location_code`. It is not an entity table (no
--     base contract, no RLS variant, no registry token), it carries no
--     population, no aliases and no ambiguity model, and its rows exist to map
--     our requests onto a provider's location ids. Extending it would fuse two
--     unrelated jobs onto one table; D22 already rejected that same fusion for
--     keyword/market. NOT extended.
--   * `web.business_location` is a BUSINESS's own physical locations — the
--     multi-location (I4) side of the model, per tenant. A gazetteer is
--     platform-global reference data every tenant reads. Different owner,
--     different lifecycle. NOT extended; I4 will JOIN the two through
--     `seo.keyword_place`.
--
-- Two tables here:
--   seo.geo_place   — the gazetteer (states, cities, local-grammar tokens)
--   seo.keyword_place — DETECTIONS (keyword ↔ place). Places are not a closed
--                     vocabulary, so a place is never a facet VALUE; the
--                     dimension `local_intent` stays the closed fact and this
--                     table carries which place produced it. This is the bridge
--                     multi-location (I4) resolves "which location" through.
--
-- SoR: common-docs/systems/marketing/seo/seo-keywords/value-system.md
-- ============================================================================

-- ── The gazetteer ───────────────────────────────────────────────────────────
select platform.create_entity_table(
  p_schema     => 'seo',
  p_table      => 'geo_place',
  p_token      => 'seo_geo_place',
  p_label      => 'Geo Place',
  p_fields     => array[
    'place_kind text NOT NULL',
    'name text NOT NULL',
    'normalized_name text NOT NULL',
    'slug text NOT NULL',
    'country_code text NOT NULL DEFAULT ''US''',
    'state_code text',
    'parent_place_id uuid',
    'population integer',
    'latitude numeric(9,6)',
    'longitude numeric(9,6)',
    'aliases jsonb NOT NULL DEFAULT ''[]''::jsonb',
    'match_tokens jsonb NOT NULL DEFAULT ''[]''::jsonb',
    'ambiguity text NOT NULL DEFAULT ''safe''',
    'ambiguity_reason text',
    'is_active boolean NOT NULL DEFAULT true'
  ],
  p_variant    => 'system',
  p_versioned  => true,
  p_soft_delete=> true,
  p_visibility => 'public',
  p_category   => false,
  p_listed     => true,
  p_org_default=> true,
  p_gin_jsonb  => false
);

alter table seo.geo_place
  add constraint geo_place_kind_check
    check (place_kind in ('country','state','city','grammar')),
  add constraint geo_place_ambiguity_check
    check (ambiguity in ('safe','requires_qualifier')),
  add constraint geo_place_parent_fk
    foreign key (parent_place_id) references seo.geo_place(id);

create unique index geo_place_slug_key on seo.geo_place (slug) where deleted_at is null;
create index geo_place_norm_idx on seo.geo_place (normalized_name) where deleted_at is null;
create index geo_place_kind_idx on seo.geo_place (place_kind, is_active) where deleted_at is null;
create index geo_place_state_idx on seo.geo_place (state_code) where deleted_at is null;
create index geo_place_pop_idx on seo.geo_place (population desc nulls last) where deleted_at is null;

-- THE REGEX WALL, extended to the gazetteer. Every token here is interpolated
-- into a regex by the detector exactly like `site_geo_area.match_tokens` is by
-- the resolver, so one "(" in an admin-typed alias would take down detection.
-- Same predicate, same sentence, one round trip earlier.
create or replace function seo.geo_place_assert_safe_tokens()
returns trigger language plpgsql as $fn$
declare tok text;
begin
  if jsonb_typeof(new.match_tokens) <> 'array' then
    raise exception 'seo_geo_bad_tokens: a place''s match words must be a list.';
  end if;
  if jsonb_typeof(new.aliases) <> 'array' then
    raise exception 'seo_geo_bad_tokens: a place''s aliases must be a list.';
  end if;
  for tok in select jsonb_array_elements_text(new.match_tokens) loop
    perform seo.assert_safe_match_token(tok, 'place name');
  end loop;
  for tok in select jsonb_array_elements_text(new.aliases) loop
    perform seo.assert_safe_match_token(tok, 'place alias');
  end loop;
  new.normalized_name := lower(btrim(new.name));
  return new;
end $fn$;

create trigger _assert_safe_tokens before insert or update on seo.geo_place
  for each row execute function seo.geo_place_assert_safe_tokens();

comment on table seo.geo_place is
  'Platform gazetteer (I3): US states, the top ~1,000 cities by population, and the local-grammar tokens ("near me"). Platform-global system variant: public read, super-admin write. `ambiguity=requires_qualifier` means the name is also an ordinary English word and only matches when the search also carries its state or a local-grammar token.';

-- ── Detections ──────────────────────────────────────────────────────────────
select platform.create_entity_table(
  p_schema     => 'seo',
  p_table      => 'keyword_place',
  p_token      => 'seo_keyword_place',
  p_label      => 'Keyword Place',
  p_fields     => array[
    'keyword_id uuid NOT NULL REFERENCES seo.keyword(id) ON DELETE CASCADE',
    'place_id uuid NOT NULL REFERENCES seo.geo_place(id)',
    'match_kind text NOT NULL',
    'matched_text text',
    'confidence smallint NOT NULL DEFAULT 100',
    'source text NOT NULL DEFAULT ''gazetteer''',
    'detector_version text NOT NULL'
  ],
  p_variant    => 'system',
  p_versioned  => false,
  p_soft_delete=> true,
  p_visibility => 'public',
  p_category   => false,
  p_listed     => false,
  p_org_default=> true,
  p_gin_jsonb  => false
);

alter table seo.keyword_place
  add constraint keyword_place_match_kind_check
    check (match_kind in ('city','state','grammar')),
  add constraint keyword_place_source_check
    check (source in ('gazetteer','human','agent')),
  add constraint keyword_place_confidence_check
    check (confidence between 0 and 100);

create unique index keyword_place_unique
  on seo.keyword_place (keyword_id, place_id, match_kind) where deleted_at is null;
create index keyword_place_place_idx on seo.keyword_place (place_id) where deleted_at is null;

comment on table seo.keyword_place is
  'Which gazetteer places a keyword names (I3). Places are NOT a closed vocabulary, so a place is never stored as a facet value — the closed fact `local_intent` is stamped through seo.keyword_facet_set and this table records WHICH place produced it. I4 (multi-location) resolves a keyword to a business location through these rows.';

-- ── Areas can reference gazetteer places, not only hand-typed words ─────────
alter table seo.site_geo_area
  add column if not exists place_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

comment on column seo.site_geo_area.place_ids is
  'Gazetteer places this area covers (seo.geo_place.id). Preferred over match_tokens: a place carries its own aliases, its ambiguity rule and its state qualifier, so "columbus" stops meaning four cities. match_tokens stays for names the gazetteer does not have (neighbourhoods, custom radii).';

-- ── The place pass reuses the demand ledger rather than growing a second one ─
alter table seo.keyword_classification_queue
  add column if not exists place_scanned_at timestamptz,
  add column if not exists place_detector_version text,
  add column if not exists places_found smallint;

comment on column seo.keyword_classification_queue.place_scanned_at is
  'When the gazetteer place detector last ran over this keyword. Written ONLY by the place pass; the facet claim lifecycle (status/claimed_at/completed_at) never reads it. Reusing this ledger is deliberate — it already carries the measured GSC demand that orders both passes.';

create index if not exists keyword_classification_queue_place_pending_idx
  on seo.keyword_classification_queue (priority_clicks desc, priority_impressions desc)
  where place_scanned_at is null;
