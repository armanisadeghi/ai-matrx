-- edu_public_decks — exam-hub filter + card-count fix (curated exam libraries).
--
-- Two changes to the community-library listing read:
--   1. FIX: card_count now counts member edges by `a.role = 'member'` (the
--      canonical column fcService writes) instead of `a.label = 'member'`,
--      which was always NULL — every public deck reported 0 cards.
--   2. ADD: optional `p_exam_slug` filter on `metadata->>'exam_slug'` so the
--      exam-prep pages can surface only the curated decks for one exam, reusing
--      the SAME anon-safe RPC (never widens the visibility='public' gate).
--
-- The 3-arg signature is DROPPED so callers resolve to the 4-arg function (its
-- extra param defaults to null → the library's existing 3-named-arg call is
-- unchanged). Idempotent: safe to re-apply.

drop function if exists public.edu_public_decks(text, boolean, integer);

create or replace function public.edu_public_decks(
  p_search         text default null,
  p_certified_only boolean default false,
  p_limit          integer default 60,
  p_exam_slug      text default null
)
returns table (
  id             uuid,
  name           text,
  description    text,
  topic          text,
  difficulty     text,
  card_count     bigint,
  certified      boolean,
  certified_note text,
  updated_at     timestamptz
)
language sql stable security definer
set search_path to 'public','education','platform'
as $function$
  select
    s.id, s.name, s.description, s.topic, s.difficulty,
    (select count(*) from platform.associations a
       where a.target_type='fc_set' and a.target_id=s.id
         and a.source_type='fc_card' and a.role='member')::bigint as card_count,
    (cc.resource_id is not null) as certified,
    cc.note as certified_note,
    s.updated_at
  from education.fc_set s
  left join education.content_certification cc
    on cc.resource_type='fc_set' and cc.resource_id=s.id
  where s.visibility='public'
    and s.deleted_at is null
    and (
      p_search is null or btrim(p_search)=''
      or s.name ilike '%'||p_search||'%'
      or s.topic ilike '%'||p_search||'%'
      or s.description ilike '%'||p_search||'%'
    )
    and (not p_certified_only or cc.resource_id is not null)
    and (p_exam_slug is null or btrim(p_exam_slug)='' or s.metadata->>'exam_slug' = p_exam_slug)
  order by (cc.resource_id is not null) desc, s.updated_at desc
  limit greatest(1, least(coalesce(p_limit,60),200));
$function$;

grant execute on function public.edu_public_decks(text, boolean, integer, text) to anon, authenticated;
