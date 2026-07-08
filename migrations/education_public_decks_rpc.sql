-- edu_public_decks — the community-library listing read (P6 Phase C).
-- A single public read that returns every PUBLIC flashcard deck with its card
-- count (via platform.associations member edges) and Certified status, with
-- search + certified-only filtering, certified-first ordering. SECURITY DEFINER
-- but exposes ONLY visibility='public' decks, so it's safe for anon (the
-- signed-out community library). One round-trip instead of N+1.
--
-- Idempotent: safe to re-apply.

create or replace function public.edu_public_decks(
  p_search         text default null,
  p_certified_only boolean default false,
  p_limit          int default 60
) returns table (
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
language sql stable security definer set search_path = public, education, platform
as $$
  select
    s.id,
    s.name,
    s.description,
    s.topic,
    s.difficulty,
    (select count(*) from platform.associations a
       where a.target_type = 'fc_set' and a.target_id = s.id
         and a.source_type = 'fc_card' and a.label = 'member')::bigint as card_count,
    (cc.resource_id is not null) as certified,
    cc.note as certified_note,
    s.updated_at
  from education.fc_set s
  left join education.content_certification cc
    on cc.resource_type = 'fc_set' and cc.resource_id = s.id
  where s.visibility = 'public'
    and s.deleted_at is null
    and (
      p_search is null or btrim(p_search) = ''
      or s.name ilike '%' || p_search || '%'
      or s.topic ilike '%' || p_search || '%'
      or s.description ilike '%' || p_search || '%'
    )
    and (not p_certified_only or cc.resource_id is not null)
  order by (cc.resource_id is not null) desc, s.updated_at desc
  limit greatest(1, least(coalesce(p_limit, 60), 200));
$$;

grant execute on function public.edu_public_decks(text,boolean,int) to anon, authenticated;
