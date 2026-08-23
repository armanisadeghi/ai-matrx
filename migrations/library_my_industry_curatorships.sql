-- migrations/library_my_industry_curatorships.sql
--
-- THE CURATOR'S FRONT DOOR — the one read that was missing.
--
-- `iam.industry_curators` already grants real authoring rights (seo.starter_pack_save /
-- _item_save / _rule_save / _set_status(draft<->proposed) / _new_version / _from_proposal all
-- accept a curator of the pack's industry while the pack is draft/proposed, via
-- seo._pack_assert_author / _pack_assert_creator), and `seo.starter_pack_catalog` already
-- returns a curator their industry's packs with can_author=true. What did not exist was a way
-- for a signed-in curator to ask "which industries do I curate?" — `public.industry_curator_list`
-- is admin-only (it answers the inverse question, for one industry).
--
-- This adds exactly that one narrow read. No new rights: it reports rows that already exist and
-- that `iam.industry_curators`' own RLS already lets the user SELECT (`user_id = auth.uid()`).
-- SECURITY DEFINER only so the join to seo.starter_pack (Library-org rows, invisible to a
-- curator through RLS) can carry the per-status counts the front door lists.
--
-- deleted_at is filtered to match `public.is_pack_curator` (which filters it) rather than
-- `public.is_industry_curator` (which does not). Today the two agree because
-- `public.industry_curator_revoke` hard-deletes; if a soft-delete path is ever added,
-- is_industry_curator must gain the same filter or a revoked curator keeps creation rights.
--
-- SoR: common-docs/systems/platform/library/STATE.md

create or replace function public.my_industry_curatorships()
returns table (
  industry_id uuid,
  slug text,
  name text,
  facet text,
  description text,
  is_active boolean,
  granted_at timestamptz,
  draft_count integer,
  proposed_count integer,
  ratified_count integer
)
language sql
stable
security definer
set search_path to 'public', 'iam', 'seo', 'pg_temp'
as $$
  select
    ind.id,
    ind.slug,
    ind.name,
    ind.facet,
    ind.description,
    ind.is_active,
    ic.created_at,
    (select count(*)::int from seo.starter_pack p
      where p.industry_id = ind.id and p.deleted_at is null and p.status = 'draft'),
    (select count(*)::int from seo.starter_pack p
      where p.industry_id = ind.id and p.deleted_at is null and p.status = 'proposed'),
    (select count(*)::int from seo.starter_pack p
      where p.industry_id = ind.id and p.deleted_at is null and p.status = 'ratified')
  from iam.industry_curators ic
  join iam.industries ind on ind.id = ic.industry_id
  where ic.user_id = auth.uid()
    and ic.deleted_at is null
  order by ind.name;
$$;

comment on function public.my_industry_curatorships() is
  'Industries the signed-in user curates, with their pack counts. The curator front door''s one read (/knowledge/library-curate). Admin-side inverse: public.industry_curator_list(industry).';

revoke all on function public.my_industry_curatorships() from public;
grant execute on function public.my_industry_curatorships() to authenticated, service_role;

notify pgrst, 'reload schema';
