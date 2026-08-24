-- Delete a shared SEO topic without leaving keyword placements or a broken tree.
--
-- Topics are global catalog rows. The site id is therefore an authorization
-- context, not the scope of the delete: the preview tells the caller the full
-- cross-organization impact, and the mutation applies it atomically.

set lock_timeout = '8s';

create or replace function seo.gsc_topic_delete_impact(
  p_site_id uuid,
  p_topic_id uuid
)
returns table(
  topic_id uuid,
  topic_name text,
  associated_keywords bigint,
  keyword_links bigint,
  primary_keyword_links bigint,
  affected_organizations bigint,
  site_worth_rulings bigint,
  child_topics bigint,
  starter_pack_items bigint
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform seo.gsc_assert_site_editor(p_site_id);

  if not exists (
    select 1
    from seo.topic t
    where t.id = p_topic_id
      and t.deleted_at is null
  ) then
    raise exception 'seo_topic_not_found: no active topic %', p_topic_id
      using errcode = 'P0002';
  end if;

  return query
  select
    t.id,
    t.name,
    count(distinct kt.keyword_id)::bigint,
    count(kt.id)::bigint,
    count(kt.id) filter (where kt.is_primary)::bigint,
    count(distinct kt.organization_id)::bigint,
    (select count(*)::bigint
       from seo.site_topic_value stv
      where stv.topic_id = t.id and stv.deleted_at is null),
    (select count(*)::bigint
       from seo.topic child
      where child.parent_id = t.id and child.deleted_at is null),
    (select count(*)::bigint
       from seo.starter_pack_item spi
      where spi.topic_id = t.id and spi.deleted_at is null)
  from seo.topic t
  left join seo.keyword_topic kt
    on kt.topic_id = t.id
   and kt.deleted_at is null
  where t.id = p_topic_id
    and t.deleted_at is null
  group by t.id, t.name;
end;
$function$;

create or replace function seo.gsc_topic_delete(
  p_site_id uuid,
  p_topic_id uuid,
  p_replacement_topic_id uuid default null
)
returns table(
  topic_id uuid,
  topic_name text,
  associated_keywords bigint,
  keyword_links_removed bigint,
  keyword_links_reassigned bigint,
  affected_organizations bigint,
  child_topics_promoted bigint,
  site_worth_rulings_removed bigint,
  starter_pack_items_removed bigint
)
language plpgsql
security definer
set search_path = ''
as $function$
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

  -- Release the one-primary-per-keyword constraint before merging links into
  -- the replacement. The captured id array restores primary status there.
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
      visibility
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
      source.visibility
    from seo.keyword_topic source
    where source.topic_id = p_topic_id
      and source.deleted_at is null
    on conflict (keyword_id, topic_id) do update
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

  -- A deleted middle node never takes its subtree with it. Direct children
  -- move up one level, preserving every deeper relationship.
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

  -- Worth is site-specific judgment about this exact topic and must never be
  -- silently transplanted to a semantically different replacement.
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

  -- Starter-pack judgments are likewise removed, not guessed onto another
  -- topic. The preview makes this global consequence explicit before delete.
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

revoke all on function seo.gsc_topic_delete_impact(uuid, uuid) from public, anon;
grant execute on function seo.gsc_topic_delete_impact(uuid, uuid) to authenticated;

revoke all on function seo.gsc_topic_delete(uuid, uuid, uuid) from public, anon;
grant execute on function seo.gsc_topic_delete(uuid, uuid, uuid) to authenticated;
