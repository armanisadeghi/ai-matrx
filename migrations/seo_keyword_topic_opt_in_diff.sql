-- KI-050 / P30a THE DIFF LAW: "If we ever change it at the top level, it
-- needs to be presented to them as a diff that they can opt in or out of."
--
-- STEP 1 note: the write path (seo.gsc_set_keyword_topic) was already made
-- tier-aware by migrations/seo_keyword_topic_tier_aware_write.sql (a human
-- ruling made ON a site stamps scope_tier='site'; the agent/backfill writer
-- stamps 'system' -- fixed separately in aidream, see
-- packages/matrx-seo/matrx_seo/artifact_writers.py, which was inserting rows
-- with no scope_tier at all and would have failed every new agent placement
-- outright once scope_tier became NOT NULL). ONE gap found and closed here:
-- seo.gsc_topic_delete's cross-tier merge insert dropped scope_tier /
-- scope_site_id / scope_brand_id entirely, which would have thrown a NOT
-- NULL violation the moment a topic merge actually touched a scoped row.
--
-- STEP 2 -- the opt-in diff itself. DERIVED, no new table:
--   * "what changed" reads platform's own generic version ledger
--     (history.row_versions, entity_type='seo_keyword_topic') against the
--     CURRENT winning row for a keyword a site has never overridden itself
--     (no scope_tier='site' row of its own -- P29/P30, nearest wins).
--   * "opt in / out" needs no new state to remember a decision: BOTH
--     "Take it" and "Keep mine" call the SAME existing write door,
--     seo.gsc_set_keyword_topic -- Take it writes the topic the higher tier
--     now says; Keep mine writes the topic the site already had. Either way
--     the site ends up with its OWN scope_tier='site' row, which is exactly
--     what makes the keyword stop matching this query's "still inheriting"
--     clause -- the diff never nags twice for the same drift, and never
--     invents a second placement door.

-- 1. Close the scope_tier gap in the topic-merge path so a merge involving
--    any scoped row (site/brand) no longer NOT-NULL-violates.
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
    -- scope_tier/scope_site_id/scope_brand_id now ride along with the merge
    -- (previously dropped -- scope_tier is NOT NULL, so a merge touching any
    -- site/brand-scoped row failed outright before this fix). The ON
    -- CONFLICT arbiter stays the table-wide (keyword_id, topic_id) key, so a
    -- site's own row merges into the site's own row at the replacement
    -- topic, never demoted to a different tier by the merge.
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

-- 2. THE OPT-IN DIFF (P30a). Read-only, bounded to this site's own keyword
--    universe (seo.v_site_keyword_performance) and to keywords the site has
--    never itself ruled on. "Changed" means the row a site is CURRENTLY
--    inheriting (brand/organization/system, nearest tier above 'site' that
--    resolves) has a prior version in history.row_versions whose topic_id
--    differs from its current one -- i.e. the higher tier's opinion moved
--    while this site was silently inheriting it.
CREATE OR REPLACE FUNCTION seo.gsc_topic_placement_diff(p_site_id uuid, p_limit integer DEFAULT 50)
RETURNS TABLE(
  keyword_id uuid,
  phrase text,
  scope_tier text,
  old_topic_id uuid,
  old_topic_name text,
  new_topic_id uuid,
  new_topic_name text,
  changed_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'seo', 'web', 'history', 'iam', 'public', 'pg_temp'
AS $function$
DECLARE
  v_brand_id uuid;
  v_org_id uuid;
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);

  SELECT s.brand_id, s.organization_id INTO v_brand_id, v_org_id
    FROM web.site s
   WHERE s.id = p_site_id AND s.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'gsc_site_not_found: %', p_site_id USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY
  WITH site_keywords AS (
    SELECT DISTINCT vskp.keyword_id
      FROM seo.v_site_keyword_performance vskp
     WHERE vskp.site_id = p_site_id
  ),
  winners AS (
    -- The row this site is CURRENTLY inheriting -- excluded outright if the
    -- site already has its own scope_tier='site' row for this keyword
    -- (P29/P30: a site's own ruling is never shown as drift).
    SELECT kt.keyword_id, kt.id AS row_id, kt.topic_id, kt.scope_tier,
           kt.version, kt.updated_at
      FROM seo.keyword_topic kt
      JOIN site_keywords sk ON sk.keyword_id = kt.keyword_id
     WHERE kt.deleted_at IS NULL
       AND kt.is_primary
       AND (
            (kt.scope_tier = 'brand' AND v_brand_id IS NOT NULL AND kt.scope_brand_id = v_brand_id)
         OR (kt.scope_tier = 'organization' AND kt.organization_id = v_org_id)
         OR (kt.scope_tier = 'system')
       )
       AND NOT EXISTS (
         SELECT 1 FROM seo.keyword_topic s2
          WHERE s2.keyword_id = kt.keyword_id
            AND s2.scope_tier = 'site' AND s2.scope_site_id = p_site_id
            AND s2.deleted_at IS NULL
       )
  ),
  ranked AS (
    -- Nearest tier wins even among candidates (mirrors keyword_placement_resolve).
    SELECT w.*, row_number() OVER (
             PARTITION BY w.keyword_id
             ORDER BY CASE w.scope_tier WHEN 'brand' THEN 0 WHEN 'organization' THEN 1 ELSE 2 END,
                      w.updated_at DESC
           ) AS rn
      FROM winners w
  ),
  with_history AS (
    SELECT r.keyword_id, r.topic_id AS new_topic_id, r.scope_tier, r.updated_at AS changed_at,
           (
             SELECT (rv.row_data ->> 'topic_id')::uuid
               FROM history.row_versions rv
              WHERE rv.entity_type = 'seo_keyword_topic'
                AND rv.row_id = r.row_id
                AND rv.version < r.version
              ORDER BY rv.version DESC
              LIMIT 1
           ) AS old_topic_id
      FROM ranked r
     WHERE r.rn = 1
  )
  SELECT wh.keyword_id, k.phrase, wh.scope_tier,
         wh.old_topic_id, ot.name,
         wh.new_topic_id, nt.name,
         wh.changed_at
    FROM with_history wh
    JOIN seo.keyword k ON k.id = wh.keyword_id
    JOIN seo.topic nt ON nt.id = wh.new_topic_id
    LEFT JOIN seo.topic ot ON ot.id = wh.old_topic_id
   WHERE wh.old_topic_id IS NOT NULL
     AND wh.old_topic_id <> wh.new_topic_id
   ORDER BY wh.changed_at DESC
   LIMIT LEAST(GREATEST(p_limit, 1), 200);
END;
$function$;
