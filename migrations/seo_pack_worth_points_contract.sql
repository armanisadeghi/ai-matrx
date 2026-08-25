-- KI-001, pack half — NEW PACKS SHIP POINTS BECAUSE THE PROPOSER SAYS SO.
--
-- What was already true: `seo.starter_pack_from_proposal` runs every proposed
-- rule through `seo._pack_convert_rules_to_meaning`, which turns a multiplier
-- into points with `add = (m - 1) * 100` unless a regex reads the value as a
-- relative qualifier. So pack CONTENT was already stored as points.
--
-- What was NOT true: the proposer agent still thinks in multipliers. Its output
-- schema knows only `value_multiplier`, its prompt never states P18, and the
-- regex fallback is the only thing deciding identity-vs-qualifier — on values
-- the agent itself understands far better than a word list ever will. So the
-- agent now DECLARES which it is, per rule, and the converter obeys it, falling
-- back to the regex only when the agent said nothing.
--
-- Adoption re-introduces no multipliers because adoption writes what the pack
-- item says, and a pack item is now written by a proposer that knows the law.

-- ── 1. The proposer declares identity-vs-qualifier on every rule ────────────
UPDATE agent.definition
   SET output_schema = jsonb_set(jsonb_set(jsonb_set(
         output_schema::jsonb,
         '{properties,rules,items,properties,worth_effect}',
         jsonb_build_object(
           'enum', jsonb_build_array('add', 'scale'),
           'type', 'string',
           'description',
             'WHAT THIS MATCH IS. `add` when it says what the keyword IS (an identity: '
             || 'a named service, a certification, an audience) — identity pays POINTS on an '
             || 'open scale. `scale` ONLY for a relative qualifier (free, cheap, DIY, discount) '
             || 'that modifies something else rather than being a thing in itself.'),
         true),
         '{properties,rules,items,properties,worth_amount}',
         jsonb_build_object(
           'type', 'number',
           'description',
             'For `add`: the points, positive or negative, around the baseline of 100 every '
             || 'keyword starts from — roughly -150 to +150 for a strong signal. For `scale`: '
             || 'the multiplier, between 0.05 and 5.'),
         true),
         '{properties,rules,items,required}',
         -- Strict providers require every declared property to be required, and
         -- the law is not optional anyway: a rule that will not say whether it
         -- is an identity or a qualifier has not finished thinking.
         (output_schema::jsonb->'properties'->'rules'->'items'->'required')
           || jsonb_build_array('worth_effect', 'worth_amount'),
         true)::json,
       messages = replace(
         messages::text,
         'Each rule carries a value_multiplier strictly greater than 0 and at most 100: below 1 demotes, above 1 promotes, and multipliers compound, so keep each one modest and defensible.',
         'Each rule carries a value_multiplier strictly greater than 0 and at most 100: below 1 demotes, above 1 promotes, and multipliers compound, so keep each one modest and defensible.\n\nWORTH IS POINTS, NOT MULTIPLIERS (the platform''s ruling; obey it on every single rule)\nA score is (baseline + points) x multipliers, and every keyword starts from a baseline of 100. Two different things can be true of a match, and they are NOT interchangeable:\n- It says WHAT THE KEYWORD IS: an ITAD search, a certification-seeking search, a business audience, a named procedure. An identity is worth POINTS on an open scale. Set worth_effect=''add'' and worth_amount to the points it is worth, positive or negative — roughly -150 to +150 for a strong signal. Points work even on a keyword nothing else has valued yet.\n- It is a RELATIVE QUALIFIER: free, cheap, DIY, discount, budget, coupon. These modify something else rather than being a thing in themselves, so they SCALE what the keyword already earned. Set worth_effect=''scale'' and worth_amount to the multiplier, between 0.05 and 5.\nWhen you are unsure, ask: could a keyword be ONLY this and nothing else? If yes it is an identity and it pays points. A multiplier does NOTHING to a keyword that has no worth yet, so an identity expressed as a multiplier is silently inert on exactly the keywords a new site most needs valued. Fill value_multiplier as well, for the same match, so an older reader still gets a sane number.'
       )::json,
       updated_at = now(),
       version = version + 1
 WHERE id = '6e30326f-6108-46ae-9c64-309946d2257d';


-- ── 2. The proposal carries the declaration through to the rule row ─────────
CREATE OR REPLACE FUNCTION seo.starter_pack_from_proposal(p_proposal jsonb, p_industry_id uuid DEFAULT NULL::uuid, p_source_corpus jsonb DEFAULT NULL::jsonb, p_source_site_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'seo', 'platform'
AS $function$
declare v_pack seo.starter_pack; v_lib uuid := public.system_org_id('library'); v_uid uuid := auth.uid(); v_slug text; r jsonb; v_n int := 0;
begin
  perform seo._pack_assert_creator(p_industry_id);
  if p_proposal->>'error' is not null and p_proposal->>'error' <> '' then
    raise exception 'seo_pack_proposal_error: %', p_proposal->>'error';
  end if;
  v_slug := coalesce(nullif(p_proposal->'pack'->>'slug',''), 'pack-' || left(gen_random_uuid()::text, 8));
  while exists (select 1 from seo.starter_pack where slug = v_slug) loop
    v_n := v_n + 1; v_slug := (p_proposal->'pack'->>'slug') || '-' || v_n::text;
  end loop;
  insert into seo.starter_pack (slug, name, industry, industry_id, summary, description, geo_model, guidelines, source_notes, source_corpus,
                                proposal, status, organization_id, visibility, created_by, updated_by, metadata)
  values (v_slug, p_proposal->'pack'->>'name', p_proposal->>'industry', p_industry_id, p_proposal->'pack'->>'summary',
          p_proposal->'pack'->>'description', coalesce(nullif(p_proposal->'pack'->>'geo_model',''), 'national'),
          p_proposal->'pack'->>'guidelines', p_proposal->>'demand_reading', p_source_corpus, p_proposal, 'draft', v_lib, 'internal', v_uid, v_uid,
          jsonb_build_object('proposer_version', p_proposal->>'proposer_version', 'confidence', p_proposal->'confidence',
                             'open_questions', coalesce(p_proposal->'open_questions', '[]'::jsonb),
                             'source_site_ids', coalesce(to_jsonb(p_source_site_ids), '[]'::jsonb)))
  returning * into v_pack;
  -- The proposer agent still speaks `rules` (its output contract is pinned).
  -- They land as template rows and are converted to meaning items in the same
  -- transaction, so nothing is ever STORED in the legacy shape.
  --
  -- KI-001: the agent now ALSO declares, per rule, whether the match is an
  -- identity (points) or a relative qualifier (a multiplier). That declaration
  -- rides on the rule's metadata so the converter can obey it instead of
  -- guessing from a word list.
  for r in select * from jsonb_array_elements(coalesce(p_proposal->'rules', '[]'::jsonb)) loop
    insert into seo.keyword_class_rule (name, description, pattern, match_kind, match_facet, match_facet_value, target_class, value_multiplier,
                                        notes, pack_id, is_template, auto_apply, site_id, organization_id, visibility, created_by, updated_by, metadata)
    values (r->>'name', r->>'description', nullif(r->>'pattern',''), nullif(r->>'match_kind',''), nullif(r->>'match_facet',''),
            nullif(r->>'match_facet_value',''), nullif(r->>'target_class',''), (r->>'value_multiplier')::numeric, r->>'rationale',
            v_pack.id, true, false, null, v_lib, 'internal', v_uid, v_uid,
            case when r->>'worth_effect' in ('add','scale') and (r->>'worth_amount') is not null
                 then jsonb_build_object('worth_effect', r->>'worth_effect',
                                         'worth_amount', (r->>'worth_amount')::numeric)
                 else '{}'::jsonb end);
  end loop;
  insert into seo.starter_pack_item (pack_id, item_kind, value, label, description, config, sort, notes, organization_id, visibility, created_by, updated_by)
  select v_pack.id, 'value_band', b->>'value', b->>'label', b->>'description', jsonb_build_object('min_score', (b->>'min_score')::numeric),
         ord, b->>'rationale', v_lib, 'internal', v_uid, v_uid
  from jsonb_array_elements(coalesce(p_proposal->'value_bands', '[]'::jsonb)) with ordinality as t(b, ord);
  insert into seo.starter_pack_item (pack_id, item_kind, value, label, description, config, sort, notes, organization_id, visibility, created_by, updated_by)
  select v_pack.id, 'geo_band', b->>'value', b->>'label', b->>'description', jsonb_build_object('multiplier', (b->>'multiplier')::numeric),
         ord, b->>'rationale', v_lib, 'internal', v_uid, v_uid
  from jsonb_array_elements(coalesce(p_proposal->'geo_bands', '[]'::jsonb)) with ordinality as t(b, ord);
  insert into seo.starter_pack_item (pack_id, item_kind, label, area_kind, match_tokens, geo_band, sort, notes, organization_id, visibility, created_by, updated_by)
  select v_pack.id, 'geo_area', a->>'label', coalesce(nullif(a->>'area_kind',''), 'city'), coalesce(a->'match_tokens', '[]'::jsonb),
         a->>'geo_band', ord, a->>'rationale', v_lib, 'internal', v_uid, v_uid
  from jsonb_array_elements(coalesce(p_proposal->'geo_areas', '[]'::jsonb)) with ordinality as t(a, ord);
  perform seo._pack_convert_rules_to_meaning(v_pack.id);
  perform public._library_audit(v_uid, 'pack_from_proposal', 'seo_starter_pack', v_pack.id, p_industry_id, null,
                                jsonb_build_object('slug', v_slug, 'proposer_version', p_proposal->>'proposer_version'));
  return to_jsonb(v_pack) - 'proposal';
end $function$;


-- ── 3. The converter obeys the declaration, and guesses only when silent ────
CREATE OR REPLACE FUNCTION seo._pack_convert_rules_to_meaning(p_pack_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'seo', 'platform'
AS $function$
declare
  v_values int := 0; v_class int := 0; v_retired int := 0;
begin
  -- (a) facet rules: worth on a value the classifier already stamps.
  with src as (
    select r.match_facet, r.match_facet_value,
           (array_agg(r.value_multiplier order by r.name))[1] as value_multiplier,
           (array_agg(r.metadata->>'worth_effect' order by r.name))[1] as declared_effect,
           (array_agg((r.metadata->>'worth_amount')::numeric order by r.name))[1] as declared_amount,
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
  ), ruled as (
    -- KI-001 — the proposer's own declaration wins; the word list is the
    -- fallback for rules written before the contract existed.
    select sh.*,
      case when sh.declared_effect in ('add','scale') and sh.declared_amount is not null
           then sh.declared_effect
           when sh.relative then 'scale' else 'add' end as effect,
      case when sh.declared_effect in ('add','scale') and sh.declared_amount is not null
           then sh.declared_amount
           when sh.relative then sh.value_multiplier
           else round((sh.value_multiplier - 1) * 100) end as amount
    from shaped sh
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
         sh.effect, sh.amount,
         100 + row_number() over (order by sh.dim_slug, sh.match_facet_value)::int,
         jsonb_build_object('converted_from_rules', to_jsonb(sh.rule_ids),
                            'converted_multiplier', sh.value_multiplier,
                            'worth_declared_by', case when sh.declared_effect in ('add','scale')
                                                        and sh.declared_amount is not null
                                                      then 'proposer' else 'word_list' end)
  from ruled sh
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
           (array_agg(r.metadata->>'worth_effect' order by r.name))[1] as declared_effect,
           (array_agg((r.metadata->>'worth_amount')::numeric order by r.name))[1] as declared_amount,
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
  ), ruled as (
    select sh.*,
      case when sh.declared_effect in ('add','scale') and sh.declared_amount is not null
           then sh.declared_effect
           when sh.relative then 'scale' else 'add' end as effect,
      case when sh.declared_effect in ('add','scale') and sh.declared_amount is not null
           then sh.declared_amount
           when sh.relative then sh.value_multiplier
           else round((sh.value_multiplier - 1) * 100) end as amount
    from shaped sh
  )
  insert into seo.starter_pack_item
    (pack_id, item_kind, dimension_scope, dimension_slug, dimension_label,
     value, label, description, notes, matchers, worth_effect, worth_amount, sort, metadata)
  select p_pack_id, 'meaning', 'site', 'qualifiers', 'Qualifiers',
         sh.value_slug, sh.base_name, sh.description, sh.notes, sh.matchers,
         sh.effect, sh.amount,
         200 + row_number() over (order by sh.base_name)::int,
         jsonb_build_object('converted_from_rules', to_jsonb(sh.rule_ids),
                            'converted_multiplier', sh.value_multiplier,
                            'worth_declared_by', case when sh.declared_effect in ('add','scale')
                                                        and sh.declared_amount is not null
                                                      then 'proposer' else 'word_list' end)
  from ruled sh
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
end $function$;

NOTIFY pgrst, 'reload schema';
