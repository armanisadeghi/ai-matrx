-- PLATFORM DEFAULT RULES — the editable 80/20 word rules every new site starts
-- from. Arman, 2026-08-25: "give me a UI where I can build this rule set… I can
-- create a rule where I could put as many words or phrases as I want, and then
-- I put the type of match… and then I put the effect."
--
-- A rule is ONE meaning row in the existing `platform-defaults` starter pack,
-- so it rides the pack machinery already built (copy-on-adopt per site, diffs
-- when a default changes). No new table. Written to the REAL columns:
--   dimension_slug / value  → what the words MEAN
--   matchers[]              → the phrases, each {kind, pattern, enabled, exclusions[]}
--   worth_effect / amount   → add N points, scale by N, or never
--
-- Deterministic end to end: phrases and exclusions are evaluated in SQL by
-- seo.fn_evaluate_matchers. No AI reads these. Idempotent.

create or replace function seo.platform_default_rules()
returns table(
  id uuid, label text, dimension_slug text, dimension_scope text, value_slug text,
  match_kind text, phrases text[], exclusions text[],
  effect text, amount numeric, notes text, sort integer, updated_at timestamptz
)
language sql stable security definer
set search_path to 'seo','public','pg_temp'
as $$
  select i.id, i.label, i.dimension_slug, i.dimension_scope, i.value,
         coalesce(i.matchers->0->>'kind','word')::text,
         coalesce(array(select m->>'pattern' from jsonb_array_elements(coalesce(i.matchers,'[]'::jsonb)) m
                        where m->>'pattern' is not null), '{}'::text[]),
         coalesce(array(select jsonb_array_elements_text(
           case when jsonb_typeof(i.matchers->0->'exclusions') = 'array'
                then i.matchers->0->'exclusions' else '[]'::jsonb end)), '{}'::text[]),
         i.worth_effect, i.worth_amount,
         i.notes, coalesce(i.sort, 0), i.updated_at
  from seo.starter_pack_item i
  join seo.starter_pack p on p.id = i.pack_id and p.slug = 'platform-defaults'
  where i.deleted_at is null and i.item_kind = 'meaning'
  order by coalesce(i.sort,0), i.label;
$$;

create or replace function seo.platform_default_rule_save(
  p_id uuid, p_label text, p_dimension_slug text, p_value_slug text,
  p_match_kind text, p_phrases text[], p_exclusions text[],
  p_effect text, p_amount numeric, p_notes text default null, p_sort integer default 0
) returns uuid
language plpgsql security definer
set search_path to 'seo','public','pg_temp'
as $$
declare
  v_pack uuid; v_org uuid; v_id uuid; v_matchers jsonb;
begin
  if not public.is_admin() then
    raise exception 'seo_defaults_forbidden: platform defaults are an admin surface.';
  end if;
  if coalesce(trim(p_label),'') = '' then
    raise exception 'seo_defaults_no_label: a rule needs a name you will recognize later.';
  end if;
  if coalesce(trim(p_dimension_slug),'') = '' or coalesce(trim(p_value_slug),'') = '' then
    raise exception 'seo_defaults_no_meaning: a rule must say what the words MEAN (a dimension and one of its answers).';
  end if;
  if coalesce(array_length(p_phrases,1),0) = 0 then
    raise exception 'seo_defaults_no_phrases: a rule with no words matches nothing.';
  end if;
  if p_match_kind not in ('exact','word','contains','starts_with','ends_with') then
    raise exception 'seo_defaults_bad_match: % is not a match type.', p_match_kind;
  end if;
  if p_effect not in ('add','scale','never') then
    raise exception 'seo_defaults_bad_effect: % is not add, scale or never.', p_effect;
  end if;
  if p_effect = 'scale' and (p_amount is null or p_amount < 0.05 or p_amount > 5) then
    raise exception 'seo_defaults_bad_scale: a multiplier must be between 0.05 and 5.';
  end if;
  if p_effect = 'add' and p_amount is null then
    raise exception 'seo_defaults_bad_add: an add rule needs a number of points.';
  end if;

  select id, organization_id into v_pack, v_org from seo.starter_pack
   where slug = 'platform-defaults' and deleted_at is null;
  if v_pack is null then
    raise exception 'seo_defaults_no_pack: the platform-defaults pack row is missing.';
  end if;

  -- Every phrase becomes a matcher; the exclusion list rides each one, because
  -- the engine cancels per matcher.
  select jsonb_agg(jsonb_build_object(
           'kind', p_match_kind, 'pattern', trim(ph), 'enabled', true,
           'exclusions', to_jsonb(coalesce(p_exclusions,'{}'::text[]))))
    into v_matchers
    from unnest(p_phrases) ph where coalesce(trim(ph),'') <> '';

  if p_id is null then
    insert into seo.starter_pack_item (
      id, pack_id, item_kind, label, value, dimension_slug, dimension_scope,
      matchers, worth_effect, worth_amount, notes, sort, organization_id, created_by, updated_by)
    values (gen_random_uuid(), v_pack, 'meaning', trim(p_label), trim(p_value_slug),
      trim(p_dimension_slug), 'platform', v_matchers, p_effect,
      case when p_effect = 'never' then null else p_amount end,
      p_notes, coalesce(p_sort,0), v_org, auth.uid(), auth.uid())
    returning id into v_id;
  else
    update seo.starter_pack_item set
      label = trim(p_label), value = trim(p_value_slug), dimension_slug = trim(p_dimension_slug),
      dimension_scope = 'platform', matchers = v_matchers, worth_effect = p_effect,
      worth_amount = case when p_effect = 'never' then null else p_amount end,
      notes = p_notes, sort = coalesce(p_sort,0), updated_by = auth.uid(), updated_at = now()
    where id = p_id and pack_id = v_pack and deleted_at is null
    returning id into v_id;
    if v_id is null then
      raise exception 'seo_defaults_missing: that rule is gone — reload before saving.';
    end if;
  end if;
  return v_id;
end;
$$;

create or replace function seo.platform_default_rule_delete(p_id uuid)
returns void
language plpgsql security definer
set search_path to 'seo','public','pg_temp'
as $$
begin
  if not public.is_admin() then
    raise exception 'seo_defaults_forbidden: platform defaults are an admin surface.';
  end if;
  update seo.starter_pack_item i set deleted_at = now(), updated_by = auth.uid()
  from seo.starter_pack p
  where i.id = p_id and i.pack_id = p.id and p.slug = 'platform-defaults' and i.deleted_at is null;
end;
$$;

-- The pack normaliser rebuilt every matcher from three keys, SILENTLY DROPPING
-- `exclusions` on write. Carried and validated now, or a rule saved with guards
-- comes back without them and says nothing.
create or replace function seo.starter_pack_item_assert_matchers()
 returns trigger
 language plpgsql
as $function$
declare m jsonb; ex text;
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
    if jsonb_typeof(m->'exclusions') = 'array' then
      for ex in select jsonb_array_elements_text(m->'exclusions') loop
        if coalesce(btrim(ex),'') = '' then
          raise exception 'seo_pack_matcher_exclusion: an exclusion cannot be blank';
        end if;
        perform seo.assert_safe_match_token(ex, 'pack matcher exclusion');
      end loop;
    end if;
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object(
           'kind', e->>'kind',
           'pattern', lower(btrim(e->>'pattern')),
           'enabled', coalesce((e->>'enabled')::boolean, true),
           'exclusions', coalesce((
             select jsonb_agg(lower(btrim(x)))
             from jsonb_array_elements_text(
               case when jsonb_typeof(e->'exclusions') = 'array' then e->'exclusions' else '[]'::jsonb end) x
           ), '[]'::jsonb))), '[]'::jsonb)
    into new.matchers
    from jsonb_array_elements(coalesce(new.matchers, '[]'::jsonb)) e;
  return new;
end $function$;

grant execute on function seo.platform_default_rules() to authenticated;
grant execute on function seo.platform_default_rule_save(uuid,text,text,text,text,text[],text[],text,numeric,text,integer) to authenticated;
grant execute on function seo.platform_default_rule_delete(uuid) to authenticated;

notify pgrst, 'reload schema';
