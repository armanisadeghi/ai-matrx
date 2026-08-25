-- KI-030 — pack CONTENT flips to the stamp system's shape.
--
-- Until now a pack carried its meaning as template `keyword_class_rule` rows:
-- a pattern or a facet plus a multiplier. Since C1/C2 the resolver scores from
-- STAMPS (seo.dimension_value_matcher -> seo.keyword_facet) times WORTH
-- (seo.site_value_worth), so a pack's rules only reached a score through the
-- rule->meaning translation trigger. This migration makes a pack carry the
-- canonical shape directly: one item per DIMENSION VALUE, carrying its
-- MATCHERS and its WORTH.
--
-- Worth follows KI-001: "what it is" values ADD +/-points around the 100
-- baseline; only relative qualifiers (free, cheap, DIY, discount) keep a
-- xfactor. A multiplier m converts to round((m - 1) * 100) points, which is
-- the same answer as xm for a keyword sitting on the bare baseline.
--
-- Idempotent. Safe to re-apply.

begin;

-- ── 1. The shape ────────────────────────────────────────────────────────────

alter table seo.starter_pack_item
  add column if not exists dimension_slug  text,
  add column if not exists dimension_label text,
  add column if not exists dimension_scope text,
  add column if not exists worth_effect    text,
  add column if not exists worth_amount    numeric,
  add column if not exists matchers        jsonb not null default '[]'::jsonb;

comment on column seo.starter_pack_item.dimension_slug is
  'meaning items: the dimension this value lives on. platform scope = the registry slug (audience_type, traffic_class); site scope = the STANDARD KEY (qualifiers, geo), resolved to this site''s own dimension on adopt.';
comment on column seo.starter_pack_item.matchers is
  'meaning items: [{kind, pattern, enabled}] — the text matchers that stamp this value. A pack never carries place/fact/condition matchers: those are one site''s own facts.';
comment on column seo.starter_pack_item.worth_effect is
  'add (+/-points, the default for "what it is") | scale (xfactor, only for relative qualifiers) | never. NULL = the value is stamped but says nothing about worth.';

alter table seo.starter_pack_item drop constraint if exists starter_pack_item_item_kind_check;
alter table seo.starter_pack_item add constraint starter_pack_item_item_kind_check
  check (item_kind = any (array['topic','value_band','geo_band','geo_area','meaning']));

alter table seo.starter_pack_item drop constraint if exists starter_pack_item_kind_shape_chk;
alter table seo.starter_pack_item add constraint starter_pack_item_kind_shape_chk check (
     (item_kind = 'topic' and topic_id is not null)
  or (item_kind = any (array['value_band','geo_band']) and value is not null and label is not null)
  or (item_kind = 'geo_area' and label is not null and geo_band is not null)
  or (item_kind = 'meaning'  and value is not null and label is not null
      and dimension_slug is not null
      and dimension_scope = any (array['platform','site'])
      and jsonb_typeof(matchers) = 'array'
      and (worth_effect is null
           or (worth_effect = 'add'   and worth_amount is not null)
           or (worth_effect = 'scale' and worth_amount is not null
               and worth_amount >= 0.05 and worth_amount <= 5)
           or (worth_effect = 'never' and worth_amount is null)))
);

create unique index if not exists starter_pack_item_meaning_uq
  on seo.starter_pack_item (pack_id, dimension_slug, value)
  where item_kind = 'meaning' and deleted_at is null;

-- THE REGEX WALL, same guard the live matcher table uses: a pack may not ship
-- a pattern a site could not have typed itself.
create or replace function seo.starter_pack_item_assert_matchers()
returns trigger language plpgsql as $fn$
declare m jsonb;
begin
  if new.item_kind <> 'meaning' then
    return new;
  end if;
  for m in select value from jsonb_array_elements(coalesce(new.matchers, '[]'::jsonb)) loop
    if coalesce(m->>'kind','') not in ('exact','word','contains','starts_with','ends_with') then
      raise exception 'seo_pack_matcher_kind: % (a pack carries text matchers only)', m->>'kind';
    end if;
    if coalesce(btrim(m->>'pattern'), '') = '' then
      raise exception 'seo_pack_matcher_pattern: a % matcher needs a phrase', m->>'kind';
    end if;
    perform seo.assert_safe_match_token(m->>'pattern', 'pack matcher phrase');
  end loop;
  -- normalise: lower-cased phrases, enabled defaults to true
  select coalesce(jsonb_agg(jsonb_build_object(
           'kind', e->>'kind',
           'pattern', lower(btrim(e->>'pattern')),
           'enabled', coalesce((e->>'enabled')::boolean, true))), '[]'::jsonb)
    into new.matchers
    from jsonb_array_elements(coalesce(new.matchers, '[]'::jsonb)) e;
  return new;
end $fn$;

drop trigger if exists _assert_matchers on seo.starter_pack_item;
create trigger _assert_matchers before insert or update on seo.starter_pack_item
  for each row execute function seo.starter_pack_item_assert_matchers();

-- ── 2. The converter — legacy rule rows become meaning items ────────────────
-- Used by this migration for the shipped packs, and by starter_pack_from_proposal
-- so the proposer agent's contract (which speaks `rules`) keeps working while
-- everything it lands is stored in the new shape.

-- THE RELATIVE SET (KI-001). "What it is" values express themselves as
-- +/-points around the 100 baseline; only the price/effort qualifiers Arman
-- named — free, cheap, DIY, discount — keep a xfactor.
create or replace function seo._pack_is_relative_value(p_dimension_slug text, p_value text, p_label text)
returns boolean language sql immutable as $fn$
  select lower(coalesce(p_value,'') || ' ' || coalesce(p_label,''))
           ~ '(free|cheap|diy|discount|coupon|budget|lowest price)';
$fn$;

comment on function seo._pack_is_relative_value(text,text,text) is
  'KI-001 shape test: TRUE for the relative qualifiers that keep a xfactor. Everything else is "what it is" and expresses itself as +/-points.';

create or replace function seo._pack_convert_rules_to_meaning(p_pack_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','seo','platform'
as $fn$
declare
  v_values int := 0; v_class int := 0; v_retired int := 0;
begin
  -- (a) facet rules: worth on a value the classifier already stamps.
  with src as (
    select r.match_facet, r.match_facet_value,
           (array_agg(r.value_multiplier order by r.name))[1] as value_multiplier,
           min(r.name) as name, min(r.notes) as notes, min(r.description) as description,
           array_agg(r.id::text) as rule_ids
    from seo.keyword_class_rule r
    where r.pack_id = p_pack_id and r.is_template and r.deleted_at is null
      and r.match_facet is not null and r.match_facet_value is not null
      and r.value_multiplier is not null
    group by r.match_facet, r.match_facet_value
  ), shaped as (
    select
      case when s.match_facet like 'site\_%' then 'site' else 'platform' end as scope,
      case when s.match_facet like 'site\_%' then split_part(s.match_facet, '_', 2)
           else s.match_facet end as dim_slug,
      s.*,
      seo._pack_is_relative_value(
        case when s.match_facet like 'site\_%' then split_part(s.match_facet, '_', 2)
             else s.match_facet end, s.match_facet_value, s.name) as relative
    from src s
  )
  insert into seo.starter_pack_item
    (pack_id, item_kind, dimension_scope, dimension_slug, dimension_label,
     value, label, description, notes, matchers, worth_effect, worth_amount, sort, metadata)
  select p_pack_id, 'meaning', sh.scope, sh.dim_slug,
         coalesce((select c.name from platform.categories c
                    where c.dimension = 'seo_facet' and c.parent_id is null
                      and c.slug = sh.match_facet and c.deleted_at is null),
                  initcap(replace(sh.dim_slug, '_', ' '))),
         sh.match_facet_value,
         coalesce((select c.name from platform.categories c
                    where c.dimension = 'seo_facet'
                      and c.slug = sh.match_facet || ':' || sh.match_facet_value
                      and c.deleted_at is null),
                  sh.name),
         sh.description, sh.notes, '[]'::jsonb,
         case when sh.relative then 'scale' else 'add' end,
         case when sh.relative then sh.value_multiplier
              else round((sh.value_multiplier - 1) * 100) end,
         100 + row_number() over (order by sh.dim_slug, sh.match_facet_value)::int,
         jsonb_build_object('converted_from_rules', to_jsonb(sh.rule_ids),
                            'converted_multiplier', sh.value_multiplier)
  from shaped sh
  where not exists (
    select 1 from seo.starter_pack_item x
    where x.pack_id = p_pack_id and x.item_kind = 'meaning' and x.deleted_at is null
      and x.dimension_slug = sh.dim_slug and x.value = sh.match_facet_value);
  get diagnostics v_values = row_count;

  -- (b) phrase rules: a Qualifiers value the pack invents, with its matchers.
  --     Companion rules ("Paper shredding" + "Paper shredding (paper wording)")
  --     merge into ONE value carrying both phrases — which is exactly what the
  --     new shape is for.
  with src as (
    select regexp_replace(r.name, '\s*\(.*\)\s*$', '') as base_name,
           (array_agg(r.value_multiplier order by r.name))[1] as value_multiplier,
           jsonb_agg(distinct jsonb_build_object(
             'kind', coalesce(r.match_kind, 'contains'),
             'pattern', lower(btrim(r.pattern)),
             'enabled', true)) as matchers,
           min(r.notes) as notes, min(r.description) as description,
           array_agg(r.id::text) as rule_ids
    from seo.keyword_class_rule r
    where r.pack_id = p_pack_id and r.is_template and r.deleted_at is null
      and nullif(btrim(r.pattern), '') is not null
      and r.value_multiplier is not null
    group by 1
  ), shaped as (
    select distinct on (seo._slugify(s.base_name))
           s.*, seo._slugify(s.base_name) as value_slug,
           seo._pack_is_relative_value('qualifiers', seo._slugify(s.base_name), s.base_name) as relative
    from src s
    order by seo._slugify(s.base_name), s.base_name
  )
  insert into seo.starter_pack_item
    (pack_id, item_kind, dimension_scope, dimension_slug, dimension_label,
     value, label, description, notes, matchers, worth_effect, worth_amount, sort, metadata)
  select p_pack_id, 'meaning', 'site', 'qualifiers', 'Qualifiers',
         sh.value_slug, sh.base_name, sh.description, sh.notes, sh.matchers,
         case when sh.relative then 'scale' else 'add' end,
         case when sh.relative then sh.value_multiplier
              else round((sh.value_multiplier - 1) * 100) end,
         200 + row_number() over (order by sh.base_name)::int,
         jsonb_build_object('converted_from_rules', to_jsonb(sh.rule_ids),
                            'converted_multiplier', sh.value_multiplier)
  from shaped sh
  where not exists (
    select 1 from seo.starter_pack_item x
    where x.pack_id = p_pack_id and x.item_kind = 'meaning' and x.deleted_at is null
      and x.dimension_slug = 'qualifiers' and x.value = sh.value_slug);
  get diagnostics v_class = row_count;
  v_values := v_values + v_class;

  -- (c) class rules: matchers on the shared traffic_class values. They ship
  --     DISABLED, exactly as C3 left class-rule matchers that no site ever
  --     switched on — adopting a pack must not silently re-class a corpus.
  with src as (
    select r.target_class,
           jsonb_agg(distinct jsonb_build_object(
             'kind', coalesce(r.match_kind, 'contains'),
             'pattern', lower(btrim(r.pattern)),
             'enabled', false)) as matchers,
           array_agg(r.id::text) as rule_ids
    from seo.keyword_class_rule r
    where r.pack_id = p_pack_id and r.is_template and r.deleted_at is null
      and r.target_class in ('money','educational','brand','mismatch')
      and nullif(btrim(r.pattern), '') is not null
    group by r.target_class
  )
  insert into seo.starter_pack_item
    (pack_id, item_kind, dimension_scope, dimension_slug, dimension_label,
     value, label, description, matchers, worth_effect, worth_amount, sort, metadata)
  select p_pack_id, 'meaning', 'platform', 'traffic_class', 'Traffic class',
         s.target_class,
         coalesce((select c.name from platform.categories c
                    where c.dimension = 'seo_facet'
                      and c.slug = 'traffic_class:' || s.target_class
                      and c.deleted_at is null), initcap(s.target_class)),
         'Phrases this industry reads as ' || s.target_class || ' traffic.',
         s.matchers, null, null,
         300 + row_number() over (order by s.target_class)::int,
         jsonb_build_object('converted_from_rules', to_jsonb(s.rule_ids))
  from src s
  where not exists (
    select 1 from seo.starter_pack_item x
    where x.pack_id = p_pack_id and x.item_kind = 'meaning' and x.deleted_at is null
      and x.dimension_slug = 'traffic_class' and x.value = s.target_class);
  get diagnostics v_class = row_count;

  -- (d) the legacy template rows retire. Site rows that were adopted from them
  --     keep their provenance (metadata.template_rule_id) and are reconciled by
  --     starter_pack_site_status through metadata.converted_from_rules.
  update seo.keyword_class_rule
     set deleted_at = now(), updated_at = now(),
         metadata = coalesce(metadata, '{}'::jsonb)
                    || jsonb_build_object('retired_by', 'KI-030 pack content flip')
   where pack_id = p_pack_id and is_template and deleted_at is null;
  get diagnostics v_retired = row_count;

  return jsonb_build_object('pack_id', p_pack_id, 'meaning_items', v_values,
                            'class_items', v_class, 'rules_retired', v_retired);
end $fn$;

comment on function seo._pack_convert_rules_to_meaning(uuid) is
  'KI-030 — turns a pack''s legacy template rules into meaning items (dimension value + matchers + worth) and retires the rules. Idempotent.';

-- ── 3. Convert the shipped packs ───────────────────────────────────────────

do $$
declare p record;
begin
  for p in select id, slug from seo.starter_pack where deleted_at is null loop
    perform seo._pack_convert_rules_to_meaning(p.id);
  end loop;
end $$;

-- Re-applying this file also re-settles worth on anything converted by an
-- earlier run of it, so the file and the database can never disagree.
update seo.starter_pack_item i
   set worth_effect = 'scale',
       worth_amount = (i.metadata->>'converted_multiplier')::numeric,
       updated_at = now()
 where i.item_kind = 'meaning' and i.deleted_at is null
   and i.worth_effect = 'add' and i.metadata ? 'converted_multiplier'
   and seo._pack_is_relative_value(i.dimension_slug, i.value, i.label)
   and (i.metadata->>'converted_multiplier')::numeric between 0.05 and 5;

update seo.starter_pack_item i
   set worth_effect = 'add',
       worth_amount = round(((i.metadata->>'converted_multiplier')::numeric - 1) * 100),
       updated_at = now()
 where i.item_kind = 'meaning' and i.deleted_at is null
   and i.worth_effect = 'scale' and i.metadata ? 'converted_multiplier'
   and not seo._pack_is_relative_value(i.dimension_slug, i.value, i.label);

commit;
