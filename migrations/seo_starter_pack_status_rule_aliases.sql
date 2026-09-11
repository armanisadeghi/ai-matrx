-- Keep starter_pack_site_status as the one provenance read while exposing the
-- rule-row aliases the Rulebook needs after pack rules became meaning items.
-- The exact-source guards make this idempotent and fail closed if the owning
-- function changes shape before this migration is applied elsewhere.

do $migration$
declare
  v_definition text;
  v_updated text;
begin
  select pg_get_functiondef('seo.starter_pack_site_status(uuid,uuid)'::regprocedure)
  into v_definition;

  if position('''rule_row_ids''' in v_definition) > 0 then
    return;
  end if;

  if position($needle$
      'site_row_id', w.id,
      'pack', jsonb_build_object(
$needle$ in v_definition) = 0 then
    raise exception 'starter_pack_site_status site-row projection changed; update this migration explicitly';
  end if;

  if position($needle$
    left join lateral (
      -- Provenance: written by THIS pack, either by the current adopt path
$needle$ in v_definition) = 0 then
    raise exception 'starter_pack_site_status provenance join changed; update this migration explicitly';
  end if;

  v_updated := replace(
    v_definition,
    $needle$
      'site_row_id', w.id,
      'pack', jsonb_build_object(
$needle$,
    $replacement$
      'site_row_id', w.id,
      'rule_row_ids', coalesce(aliases.ids, '[]'::jsonb),
      'pack', jsonb_build_object(
$replacement$
  );

  v_updated := replace(
    v_updated,
    $needle$
    left join lateral (
      -- Provenance: written by THIS pack, either by the current adopt path
$needle$,
    $replacement$
    left join lateral (
      select coalesce(jsonb_agg(r.id order by r.id), '[]'::jsonb) as ids
      from seo.keyword_class_rule r
      where r.site_id = p_site_id
        and r.deleted_at is null
        and r.metadata->>'adopted_from_pack' = v_slug
        and r.metadata->>'template_rule_id' in (
          select jsonb_array_elements_text(
            coalesce(i.metadata->'converted_from_rules', '[]'::jsonb)
          )
        )
    ) aliases on true
    left join lateral (
      -- Provenance: written by THIS pack, either by the current adopt path
$replacement$
  );

  execute v_updated;
end;
$migration$;

comment on function seo.starter_pack_site_status(uuid, uuid) is
  'One provenance/status read for an adopted pack. Meaning items include rule_row_ids so legacy-adopted Rulebook rows retain pack comparison and reset identity.';
