-- PLATFORM DEFAULT RULES — the editable 80/20 word rules every new site starts
-- from. Arman, 2026-08-25: "give me a UI where I can build this rule set… I can
-- create a rule where I could put as many words or phrases as I want, and then
-- I put the type of match… and then I put the effect."
--
-- A rule is ONE row in the existing `platform-defaults` starter pack
-- (item_kind='meaning'), so it rides the pack machinery already built
-- (copy-on-adopt per site, diffs when the default changes). No new table.
--   label         → what the rule is called
--   value         → the dimension value it stamps (slug)
--   match_tokens  → the phrases (as many as you like)
--   config        → { dimension_slug, match_kind, effect, amount, exclusions[] }
--
-- Deterministic end to end: phrases and exclusions are evaluated in SQL by
-- seo.fn_evaluate_matchers. No AI reads these.
-- Idempotent.

create or replace function seo.platform_default_rules()
returns table(
  id uuid, label text, dimension_slug text, value_slug text,
  match_kind text, phrases text[], exclusions text[],
  effect text, amount numeric, notes text, sort integer, updated_at timestamptz
)
language sql stable security definer
set search_path to 'seo','public','pg_temp'
as $$
  select i.id, i.label,
         coalesce(i.config->>'dimension_slug','')::text,
         coalesce(i.value,'')::text,
         coalesce(i.config->>'match_kind','word')::text,
         coalesce(array(select jsonb_array_elements_text(
           case when jsonb_typeof(i.match_tokens) = 'array' then i.match_tokens else '[]'::jsonb end)), '{}'::text[]),
         coalesce(array(select jsonb_array_elements_text(
           case when jsonb_typeof(i.config->'exclusions') = 'array' then i.config->'exclusions' else '[]'::jsonb end)), '{}'::text[]),
         coalesce(i.config->>'effect','add')::text,
         coalesce((i.config->>'amount')::numeric, 0),
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
  v_pack uuid;
  v_id uuid;
  v_org uuid;
begin
  if not public.is_admin() then
    raise exception 'seo_defaults_forbidden: platform defaults are an admin surface.';
  end if;
  if coalesce(trim(p_label),'') = '' then
    raise exception 'seo_defaults_no_label: a rule needs a name you will recognise later.';
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

  select id, organization_id into v_pack, v_org from seo.starter_pack
   where slug = 'platform-defaults' and deleted_at is null;
  if v_pack is null then
    raise exception 'seo_defaults_no_pack: the platform-defaults pack row is missing.';
  end if;

  if p_id is null then
    insert into seo.starter_pack_item (
      id, pack_id, item_kind, label, value, match_tokens, config, notes, sort,
      organization_id, created_by, updated_by)
    values (gen_random_uuid(), v_pack, 'meaning', trim(p_label), p_value_slug,
      to_jsonb(p_phrases),
      jsonb_build_object('dimension_slug', p_dimension_slug, 'match_kind', p_match_kind,
                         'effect', p_effect, 'amount', p_amount,
                         'exclusions', to_jsonb(coalesce(p_exclusions,'{}'::text[]))),
      p_notes, coalesce(p_sort,0), v_org, auth.uid(), auth.uid())
    returning id into v_id;
  else
    update seo.starter_pack_item set
      label = trim(p_label), value = p_value_slug, match_tokens = to_jsonb(p_phrases),
      config = jsonb_build_object('dimension_slug', p_dimension_slug, 'match_kind', p_match_kind,
                                  'effect', p_effect, 'amount', p_amount,
                                  'exclusions', to_jsonb(coalesce(p_exclusions,'{}'::text[]))),
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

grant execute on function seo.platform_default_rules() to authenticated;
grant execute on function seo.platform_default_rule_save(uuid,text,text,text,text,text[],text[],text,numeric,text,integer) to authenticated;
grant execute on function seo.platform_default_rule_delete(uuid) to authenticated;

notify pgrst, 'reload schema';
