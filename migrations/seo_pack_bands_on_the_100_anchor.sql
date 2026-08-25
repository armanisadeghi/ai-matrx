-- KI-030 — a pack's LEVELS were still cut for the old 0-100 score.
--
-- KI-002 re-cut the platform's level thresholds onto the 100 baseline
-- (minimal 0 · bronze 50 · silver 100 · gold 140 · platinum 200). Pack content
-- was never re-cut, so every pack still shipped the pre-anchor set
-- (0 / 15 / 40 / 65 / 85). Adopting one installed those thresholds on the site
-- — and because a site with no vocabulary of its own falls back to the platform
-- template, the review screen banded its projection against the template while
-- adoption wrote the pack's. Measured on prpinjectionmd.com: the screen
-- projected 797 Gold / 192 Platinum and 1,325 keywords landed in Platinum.
--
-- The re-cut is deterministic: each threshold is mapped through the anchors the
-- packs were authored against onto the anchors that are live now, piecewise
-- linear, extrapolating above the top anchor on the last segment's slope. Band
-- ORDER and the pack's own LABELS are untouched — those are the industry's
-- words, and they are the point.
--
-- Idempotent: a pack that has already been re-cut is stamped in metadata and
-- skipped.

create or replace function seo._pack_band_recut(p_old numeric)
returns numeric
language sql immutable
as $fn$
  -- old anchors: 0, 15, 40, 65, 85   ·   new anchors: 0, 50, 100, 140, 200
  select case
    when p_old is null then null
    when p_old <= 0  then 0
    when p_old <= 15 then round(p_old * (50.0 / 15.0))
    when p_old <= 40 then round(50 + (p_old - 15) * (50.0 / 25.0))
    when p_old <= 65 then round(100 + (p_old - 40) * (40.0 / 25.0))
    when p_old <= 85 then round(140 + (p_old - 65) * (60.0 / 20.0))
    else round(200 + (p_old - 85) * 3.0)
  end;
$fn$;

comment on function seo._pack_band_recut(numeric) is
  'KI-030 — maps a pre-KI-048 level threshold (0-100 score) onto the 100-baseline scale, through the anchors the packs were authored against.';

-- The reserved `negative` slug is a FLAG, never a threshold: the resolver emits
-- it for a never / floored-to-zero score. One pack shipped it as min_score 0,
-- which put it in the ladder underneath its own Minimal band.
update seo.starter_pack_item
   set config = (config - 'min_score') || jsonb_build_object('negative', true),
       updated_at = now()
 where item_kind = 'value_band' and deleted_at is null
   and value = 'negative'
   and config ? 'min_score';

update seo.starter_pack_item i
   set config = i.config || jsonb_build_object(
                  'min_score', seo._pack_band_recut((i.config->>'min_score')::numeric)),
       metadata = coalesce(i.metadata, '{}'::jsonb)
                  || jsonb_build_object('recut_from_min_score', (i.config->>'min_score')::numeric,
                                        'recut', 'KI-030 100-anchor'),
       updated_at = now()
 where i.item_kind = 'value_band' and i.deleted_at is null
   and i.config ? 'min_score'
   and not (coalesce(i.metadata, '{}'::jsonb) ? 'recut');

-- A level ladder starts at 0: the lowest non-negative band is the floor, and a
-- floor that starts above 0 leaves scores underneath it with no level at all.
update seo.starter_pack_item i
   set config = i.config || jsonb_build_object('min_score', 0), updated_at = now()
 where i.item_kind = 'value_band' and i.deleted_at is null
   and i.config ? 'min_score'
   and (i.config->>'min_score')::numeric > 0
   and not exists (
     select 1 from seo.starter_pack_item x
      where x.pack_id = i.pack_id and x.item_kind = 'value_band' and x.deleted_at is null
        and x.config ? 'min_score'
        and (x.config->>'min_score')::numeric < (i.config->>'min_score')::numeric);
