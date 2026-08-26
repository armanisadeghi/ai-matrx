-- KI-050 / P30a follow-up, found while live-proving the opt-in diff.
--
-- seo.keyword_topic carried a TABLE-WIDE UNIQUE (keyword_id, topic_id)
-- constraint (keyword_topic_keyword_id_topic_id_key), a leftover from before
-- the tier system existed. It silently defeated the single most common
-- "Take it" gesture in the P30a diff: a site adopting the EXACT topic a
-- higher tier already assigned it landed on the SAME (keyword_id, topic_id)
-- pair as that higher tier's own row, at a DIFFERENT scope_tier -- and the
-- table-wide constraint has no scope column, so it fired anyway.
-- seo.gsc_set_keyword_topic's blanket `EXCEPTION WHEN unique_violation`
-- handler then reported it as `seo_topic_tier_conflict`, telling a site that
-- agreeing with the system default is somehow a conflict.
--
-- Fix: replace the table-wide constraint with a SCOPE-AWARE one so two rows
-- may share (keyword_id, topic_id) as long as they are different rulings
-- (different scope_tier, or the same tier at a different site/brand).
-- COALESCE-to-nil-uuid keeps this a single ordinary unique index rather than
-- three overlapping partial ones, and keeps `gsc_topic_delete`'s merge
-- ON CONFLICT arbiter expressible in one clause.

ALTER TABLE seo.keyword_topic
  DROP CONSTRAINT IF EXISTS keyword_topic_keyword_id_topic_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_keyword_topic_scope
  ON seo.keyword_topic (
    keyword_id,
    topic_id,
    scope_tier,
    COALESCE(scope_site_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(scope_brand_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

-- gsc_topic_delete's cross-tier merge now targets the scope-aware arbiter
-- instead of the dropped table-wide one, so a merge that touches rows at
-- several tiers no longer collides them into one.
CREATE OR REPLACE FUNCTION seo.gsc_topic_delete(p_site_id uuid, p_topic_id uuid, p_replacement_topic_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(topic_id uuid, topic_name text, associated_keywords bigint, keyword_links_removed bigint, keyword_links_reassigned bigint, affected_organizations bigint, child_topics_promoted bigint, site_worth_rulings_removed bigint, starter_pack_items_removed bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
declare
  v_topic seo.topic%rowtype;
  v_primary_keyword_ids uuid[] := array[]::uuid[];
  v_associated_keywords bigint := 0;
  v_keyword_links bigint := 0;
  v_organizations bigint := 0;
  v_children bigint := 0;
  v_worth bigint := 0;
  v_pack_items bigint := 0;
begin
  perform seo.gsc_assert_site_editor(p_site_id);

  select t.*
    into v_topic
    from seo.topic t
   where t.id = p_topic_id
     and t.deleted_at is null
   for update;

  if not found then
    raise exception 'seo_topic_not_found: no active topic %', p_topic_id
      using errcode = 'P0002';
  end if;

  if p_replacement_topic_id = p_topic_id then
    raise exception 'seo_topic_invalid_replacement: a topic cannot replace itself';
  end if;

  if p_replacement_topic_id is not null
     and not exists (
       select 1
         from seo.topic replacement
        where replacement.id = p_replacement_topic_id
          and replacement.deleted_at is null
     ) then
    raise exception 'seo_topic_invalid_replacement: replacement topic is not active';
  end if;

  select
    count(distinct kt.keyword_id)::bigint,
    count(*)::bigint,
    count(distinct kt.organization_id)::bigint,
    coalesce(
      array_agg(kt.keyword_id) filter (where kt.is_primary),
      array[]::uuid[]
    )
    into
      v_associated_keywords,
      v_keyword_links,
      v_organizations,
      v_primary_keyword_ids
    from seo.keyword_topic kt
   where kt.topic_id = p_topic_id
     and kt.deleted_at is null;

  update seo.keyword_topic kt
     set is_primary = false,
         updated_at = now(),
         updated_by = auth.uid()
   where kt.topic_id = p_topic_id
     and kt.deleted_at is null
     and kt.is_primary;

  if p_replacement_topic_id is not null then
    insert into seo.keyword_topic as destination (
      organization_id,
      created_by,
      keyword_id,
      topic_id,
      is_primary,
      assigned_by,
      confidence,
      notes,
      metadata,
      visibility,
      scope_tier,
      scope_site_id,
      scope_brand_id
    )
    select
      source.organization_id,
      auth.uid(),
      source.keyword_id,
      p_replacement_topic_id,
      source.keyword_id = any(v_primary_keyword_ids),
      source.assigned_by,
      source.confidence,
      source.notes,
      source.metadata,
      source.visibility,
      source.scope_tier,
      source.scope_site_id,
      source.scope_brand_id
    from seo.keyword_topic source
    where source.topic_id = p_topic_id
      and source.deleted_at is null
    on conflict (
      keyword_id,
      topic_id,
      scope_tier,
      COALESCE(scope_site_id, '00000000-0000-0000-0000-000000000000'::uuid),
      COALESCE(scope_brand_id, '00000000-0000-0000-0000-000000000000'::uuid)
    ) do update
      set is_primary = destination.is_primary or excluded.is_primary,
          deleted_at = null,
          assigned_by = coalesce(excluded.assigned_by, destination.assigned_by),
          confidence = coalesce(excluded.confidence, destination.confidence),
          notes = coalesce(excluded.notes, destination.notes),
          updated_at = now(),
          updated_by = auth.uid();
  end if;

  update seo.keyword_topic kt
     set is_primary = false,
         deleted_at = now(),
         updated_at = now(),
         updated_by = auth.uid()
   where kt.topic_id = p_topic_id
     and kt.deleted_at is null;

  with moved as (
    update seo.topic child
       set parent_id = v_topic.parent_id,
           updated_at = now(),
           updated_by = auth.uid()
     where child.parent_id = p_topic_id
       and child.deleted_at is null
     returning 1
  )
  select count(*)::bigint into v_children from moved;

  with removed as (
    update seo.site_topic_value stv
       set deleted_at = now(),
           updated_at = now(),
           updated_by = auth.uid()
     where stv.topic_id = p_topic_id
       and stv.deleted_at is null
     returning 1
  )
  select count(*)::bigint into v_worth from removed;

  with removed as (
    update seo.starter_pack_item spi
       set deleted_at = now(),
           updated_at = now(),
           updated_by = auth.uid()
     where spi.topic_id = p_topic_id
       and spi.deleted_at is null
     returning 1
  )
  select count(*)::bigint into v_pack_items from removed;

  update seo.topic t
     set deleted_at = now(),
         updated_at = now(),
         updated_by = auth.uid()
   where t.id = p_topic_id;

  return query
  select
    v_topic.id,
    v_topic.name,
    v_associated_keywords,
    case when p_replacement_topic_id is null then v_keyword_links else 0 end,
    case when p_replacement_topic_id is null then 0 else v_keyword_links end,
    v_organizations,
    v_children,
    v_worth,
    v_pack_items;
end;
$function$;
