-- Industry starter packs (D36) — schema, reads, and THE ONE adoption path.
--
-- A pack is the meaning layer a brand-new site in one industry adopts on day
-- one: suggested topic worth, qualifier/value rules, and the site's band
-- vocabularies. Packs are TEMPLATE ROWS, never code and never per-tenant.
-- Adoption is a copy-insert into the site-scoped tables (the dig-rule pattern)
-- and is additive + idempotent: it never overwrites a ruling the site has made.
--
-- Rules live in THE ONE rules engine (D34): seo.keyword_class_rule gains
-- pack_id, and a pack's rules are is_template rows there. There is no second
-- rule table. Everything else a pack carries has no existing template home, so
-- it lives in seo.starter_pack_item, typed by item_kind.
--
-- Packs are platform-global content: `system` RLS variant (public read,
-- super-admin/service write), so every user-facing read and the one write go
-- through SECURITY DEFINER RPCs — the same posture as gsc_value_vocabulary.
--
-- SoR: common-docs/systems/marketing/seo/seo-keywords/value-system.md.
-- Applied live 2026-08-21; both tables certify via iam.canonical_certify_ok.

do $$
begin
  if to_regclass('seo.starter_pack') is null then
    perform platform.create_entity_table(
      p_schema => 'seo', p_table => 'starter_pack', p_token => 'seo_starter_pack',
      p_label => 'SEO Industry Starter Pack',
      p_fields => ARRAY[
        'slug text NOT NULL',
        'name text NOT NULL',
        'industry text NOT NULL',
        'summary text',
        'description text',
        $f$status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('draft','proposed','ratified','retired'))$f$,
        -- The kw_guidelines skeleton this pack seeds onto a site (D35).
        'guidelines text',
        $f$geo_model text NOT NULL DEFAULT 'regional' CHECK (geo_model IN ('local_radius','metro','regional','national','global'))$f$,
        -- Provenance: which real corpora informed the proposal, and the raw
        -- agent proposal it came from. Never a tenant dependency - domains only.
        'source_notes text',
        $f$source_corpus jsonb NOT NULL DEFAULT '[]'::jsonb$f$,
        'proposal jsonb',
        'ratified_at timestamptz',
        'ratified_by uuid REFERENCES auth.users(id)',
        'ratification_notes text'
      ],
      p_variant => 'system', p_versioned => true, p_soft_delete => true,
      p_visibility => 'public',
      p_category => false, p_listed => true, p_org_default => false,
      p_gin_jsonb => false);
  end if;
end $$;

create unique index if not exists starter_pack_slug_uq
  on seo.starter_pack (slug) where deleted_at is null;

do $$
begin
  if to_regclass('seo.starter_pack_item') is null then
    perform platform.create_entity_table(
      p_schema => 'seo', p_table => 'starter_pack_item', p_token => 'seo_starter_pack_item',
      p_label => 'SEO Starter Pack Item',
      p_fields => ARRAY[
        'pack_id uuid NOT NULL REFERENCES seo.starter_pack(id) ON DELETE CASCADE',
        $f$item_kind text NOT NULL CHECK (item_kind IN ('topic','value_band','geo_band','geo_area'))$f$,
        -- item_kind = topic: the suggested tree node + its default worth.
        'topic_id uuid REFERENCES seo.topic(id) ON DELETE CASCADE',
        'weight numeric CHECK (weight IS NULL OR (weight >= 0 AND weight <= 100))',
        'lead_quality text',
        'service_match text',
        -- item_kind = value_band | geo_band: the meaning vocabulary defaults.
        'value text',
        'label text',
        'description text',
        $f$config jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        -- item_kind = geo_area: an archetype the site fills in with real places.
        'area_kind text',
        $f$match_tokens jsonb NOT NULL DEFAULT '[]'::jsonb$f$,
        'geo_band text',
        'sort integer NOT NULL DEFAULT 0',
        -- The expert ruling that produced this row, in the expert own words.
        'notes text'
      ],
      p_variant => 'system', p_versioned => false, p_soft_delete => true,
      p_visibility => 'public',
      p_category => false, p_listed => false, p_org_default => false,
      p_gin_jsonb => false);
  end if;
end $$;

alter table seo.starter_pack_item
  drop constraint if exists starter_pack_item_kind_shape_chk;
alter table seo.starter_pack_item add constraint starter_pack_item_kind_shape_chk check (
  (item_kind = 'topic'     and topic_id is not null)
  or (item_kind in ('value_band','geo_band') and value is not null and label is not null)
  or (item_kind = 'geo_area' and label is not null and geo_band is not null)
);

create unique index if not exists starter_pack_item_topic_uq
  on seo.starter_pack_item (pack_id, topic_id)
  where item_kind = 'topic' and deleted_at is null;
create unique index if not exists starter_pack_item_vocab_uq
  on seo.starter_pack_item (pack_id, item_kind, value)
  where item_kind in ('value_band','geo_band') and deleted_at is null;
create index if not exists starter_pack_item_pack_idx
  on seo.starter_pack_item (pack_id, item_kind, sort) where deleted_at is null;

-- THE ONE RULES ENGINE (D34): pack rules are template rows in the rule ledger,
-- never a second table. pack_id NULL on a template = the universal template set.
alter table seo.keyword_class_rule
  add column if not exists pack_id uuid references seo.starter_pack(id) on delete cascade;
create index if not exists keyword_class_rule_pack_idx
  on seo.keyword_class_rule (pack_id) where deleted_at is null;

-- ── Reads ───────────────────────────────────────────────────────────────────

create or replace function seo.starter_pack_catalog(p_status text default null)
returns table(
  id uuid, slug text, name text, industry text, summary text, description text,
  status text, geo_model text, guidelines text, source_notes text,
  source_corpus jsonb, ratified_at timestamptz, ratification_notes text,
  topic_count integer, rule_count integer, value_band_count integer,
  geo_band_count integer, geo_area_count integer
)
language sql stable security definer set search_path to 'seo','platform','pg_temp'
as $$
  select p.id, p.slug, p.name, p.industry, p.summary, p.description,
         p.status, p.geo_model, p.guidelines, p.source_notes,
         p.source_corpus, p.ratified_at, p.ratification_notes,
         count(*) filter (where i.item_kind = 'topic')::int,
         (select count(*)::int from seo.keyword_class_rule r
           where r.pack_id = p.id and r.is_template and r.deleted_at is null),
         count(*) filter (where i.item_kind = 'value_band')::int,
         count(*) filter (where i.item_kind = 'geo_band')::int,
         count(*) filter (where i.item_kind = 'geo_area')::int
  from seo.starter_pack p
  left join seo.starter_pack_item i on i.pack_id = p.id and i.deleted_at is null
  where p.deleted_at is null
    and (p_status is null or p.status = p_status)
  group by p.id
  order by p.status, p.name;
$$;

create or replace function seo.starter_pack_detail(p_pack_id uuid)
returns jsonb
language sql stable security definer set search_path to 'seo','platform','pg_temp'
as $$
  select jsonb_build_object(
    'pack', to_jsonb(p) - 'proposal',
    'topics', coalesce((
      select jsonb_agg(jsonb_build_object(
        'item_id', i.id, 'topic_id', t.id, 'name', t.name, 'slug', t.slug,
        'node_type', t.node_type, 'parent_id', t.parent_id,
        'description', t.description,
        'weight', i.weight, 'lead_quality', i.lead_quality,
        'service_match', i.service_match, 'notes', i.notes, 'sort', i.sort)
        order by i.sort, t.name)
      from seo.starter_pack_item i
      join seo.topic t on t.id = i.topic_id and t.deleted_at is null
      where i.pack_id = p.id and i.item_kind = 'topic' and i.deleted_at is null), '[]'::jsonb),
    'value_bands', coalesce((
      select jsonb_agg(jsonb_build_object(
        'item_id', i.id, 'value', i.value, 'label', i.label,
        'description', i.description, 'config', i.config,
        'notes', i.notes, 'sort', i.sort) order by i.sort)
      from seo.starter_pack_item i
      where i.pack_id = p.id and i.item_kind = 'value_band' and i.deleted_at is null), '[]'::jsonb),
    'geo_bands', coalesce((
      select jsonb_agg(jsonb_build_object(
        'item_id', i.id, 'value', i.value, 'label', i.label,
        'description', i.description, 'config', i.config,
        'notes', i.notes, 'sort', i.sort) order by i.sort)
      from seo.starter_pack_item i
      where i.pack_id = p.id and i.item_kind = 'geo_band' and i.deleted_at is null), '[]'::jsonb),
    'geo_areas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'item_id', i.id, 'label', i.label, 'area_kind', i.area_kind,
        'match_tokens', i.match_tokens, 'geo_band', i.geo_band,
        'notes', i.notes, 'sort', i.sort) order by i.sort)
      from seo.starter_pack_item i
      where i.pack_id = p.id and i.item_kind = 'geo_area' and i.deleted_at is null), '[]'::jsonb),
    'rules', coalesce((
      select jsonb_agg(jsonb_build_object(
        'rule_id', r.id, 'name', r.name, 'description', r.description,
        'pattern', r.pattern, 'match_kind', r.match_kind,
        'match_facet', r.match_facet, 'match_facet_value', r.match_facet_value,
        'target_class', r.target_class, 'value_multiplier', r.value_multiplier,
        'notes', r.notes) order by r.value_multiplier nulls last, r.name)
      from seo.keyword_class_rule r
      where r.pack_id = p.id and r.is_template and r.deleted_at is null), '[]'::jsonb)
  )
  from seo.starter_pack p
  where p.id = p_pack_id and p.deleted_at is null;
$$;

-- ── THE adoption path ───────────────────────────────────────────────────────
-- Copy-insert into the site-scoped tables. Additive and idempotent: nothing a
-- site already decided is ever overwritten, and re-adopting writes only what is
-- missing. gsc_site_kw_guidelines / gsc_set_site_kw_guidelines RETURN TABLE, so
-- the guidelines arm selects a column out of them rather than calling them as
-- scalars (which raised at runtime on the first adoption).

create or replace function seo.adopt_starter_pack(
  p_site_id uuid,
  p_pack_id uuid,
  p_include text[] default null,        -- null = everything
  p_topic_ids uuid[] default null,      -- null = every topic in the pack
  p_seed_guidelines boolean default true
) returns jsonb
language plpgsql security definer set search_path to 'seo','platform','web','pg_temp'
as $$
declare
  v_org uuid;
  v_uid uuid := auth.uid();
  v_pack seo.starter_pack%rowtype;
  v_topics int := 0; v_bands int := 0; v_geo_bands int := 0;
  v_areas int := 0; v_rules int := 0; v_guidelines boolean := false;
  v_existing text;
  v_want text[] := coalesce(p_include, array['topics','value_bands','geo_bands','geo_areas','rules']);
begin
  perform seo.gsc_assert_site_access(p_site_id);

  select * into v_pack from seo.starter_pack where id = p_pack_id and deleted_at is null;
  if not found then
    raise exception 'seo_pack_not_found: %', p_pack_id;
  end if;

  select organization_id into v_org from web.site where id = p_site_id and deleted_at is null;
  if v_org is null then
    raise exception 'seo_site_not_found: %', p_site_id;
  end if;

  if 'topics' = any(v_want) then
    with ins as (
      insert into seo.site_topic_value
        (site_id, topic_id, weight, lead_quality, service_match, notes,
         organization_id, created_by, updated_by)
      select p_site_id, i.topic_id, i.weight, i.lead_quality, i.service_match,
             i.notes, v_org, v_uid, v_uid
      from seo.starter_pack_item i
      where i.pack_id = p_pack_id and i.item_kind = 'topic' and i.deleted_at is null
        and (p_topic_ids is null or i.topic_id = any(p_topic_ids))
      on conflict (site_id, topic_id) do nothing
      returning 1)
    select count(*)::int into v_topics from ins;
  end if;

  if 'value_bands' = any(v_want) then
    with ins as (
      insert into seo.site_vocabulary
        (site_id, vocab_kind, value, label, description, sort, config,
         organization_id, created_by, updated_by)
      select p_site_id, 'value_band', i.value, i.label, i.description, i.sort, i.config,
             v_org, v_uid, v_uid
      from seo.starter_pack_item i
      where i.pack_id = p_pack_id and i.item_kind = 'value_band' and i.deleted_at is null
      on conflict do nothing
      returning 1)
    select count(*)::int into v_bands from ins;
  end if;

  if 'geo_bands' = any(v_want) then
    with ins as (
      insert into seo.site_vocabulary
        (site_id, vocab_kind, value, label, description, sort, config,
         organization_id, created_by, updated_by)
      select p_site_id, 'geo_band', i.value, i.label, i.description, i.sort, i.config,
             v_org, v_uid, v_uid
      from seo.starter_pack_item i
      where i.pack_id = p_pack_id and i.item_kind = 'geo_band' and i.deleted_at is null
      on conflict do nothing
      returning 1)
    select count(*)::int into v_geo_bands from ins;
  end if;

  if 'geo_areas' = any(v_want) then
    with ins as (
      insert into seo.site_geo_area
        (site_id, label, area_kind, match_tokens, geo_band, notes,
         organization_id, created_by, updated_by)
      select p_site_id, i.label, coalesce(i.area_kind, 'city'), i.match_tokens,
             i.geo_band, i.notes, v_org, v_uid, v_uid
      from seo.starter_pack_item i
      where i.pack_id = p_pack_id and i.item_kind = 'geo_area' and i.deleted_at is null
      on conflict do nothing
      returning 1)
    select count(*)::int into v_areas from ins;
  end if;

  if 'rules' = any(v_want) then
    with ins as (
      insert into seo.keyword_class_rule
        (name, description, pattern, match_kind, target_class, value_multiplier,
         match_facet, match_facet_value, notes, site_id, organization_id,
         is_template, auto_apply, created_by, updated_by, metadata)
      select r.name, r.description, r.pattern, r.match_kind, r.target_class,
             r.value_multiplier, r.match_facet, r.match_facet_value, r.notes,
             p_site_id, v_org, false, false, v_uid, v_uid,
             jsonb_build_object('adopted_from_pack', v_pack.slug, 'template_rule_id', r.id)
      from seo.keyword_class_rule r
      where r.pack_id = p_pack_id and r.is_template and r.deleted_at is null
        and not exists (
          select 1 from seo.keyword_class_rule x
          where x.site_id = p_site_id and x.deleted_at is null
            and x.metadata->>'template_rule_id' = r.id::text)
      returning 1)
    select count(*)::int into v_rules from ins;
  end if;

  if p_seed_guidelines and v_pack.guidelines is not null then
    select g.guidelines into v_existing from seo.gsc_site_kw_guidelines(p_site_id) g;
    if coalesce(btrim(v_existing), '') = '' then
      perform 1 from seo.gsc_set_site_kw_guidelines(p_site_id, v_pack.guidelines);
      v_guidelines := true;
    end if;
  end if;

  return jsonb_build_object(
    'pack', v_pack.slug, 'site_id', p_site_id,
    'topics', v_topics, 'value_bands', v_bands, 'geo_bands', v_geo_bands,
    'geo_areas', v_areas, 'rules', v_rules, 'guidelines_seeded', v_guidelines);
end;
$$;

revoke all on function seo.starter_pack_catalog(text) from public;
revoke all on function seo.starter_pack_detail(uuid) from public;
revoke all on function seo.adopt_starter_pack(uuid, uuid, text[], uuid[], boolean) from public;
grant execute on function seo.starter_pack_catalog(text) to authenticated, service_role;
grant execute on function seo.starter_pack_detail(uuid) to authenticated, service_role;
grant execute on function seo.adopt_starter_pack(uuid, uuid, text[], uuid[], boolean) to authenticated, service_role;

notify pgrst, 'reload schema';
