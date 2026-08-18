-- edu_certification_human_verified.sql
--
-- RECORD of a change already applied live to Supabase (txzxabzwovsujtloxrus) on
-- 2026-08-17 via the Supabase MCP. Idempotent.
--
-- WP9 / IC-12 — make the "Certified" trust mark TRUE.
--
-- All 9 rows in education.content_certification carry the note "AI-generated
-- starter deck, curated by AI Matrx and pending human expert verification."
-- The DATA was honest; the BADGE was not — it rendered "Certified" with a check
-- mark and the tooltip "Editorially verified by AI Matrx", and the exam pages
-- headlined "every card and guide is editorially reviewed". No human had
-- reviewed any of it.
--
-- Editing nine rows would be true for a day. The state is therefore STRUCTURAL:
-- a certification row records whether a HUMAN verified it, and the UI renders
-- two distinct marks — so the mark stays meaningful as content scales.
--
--   human_verified_at IS NULL     -> "AI-built starter" (muted, honest)
--   human_verified_at IS NOT NULL -> "Certified"        (a person signed it)
--
-- Existing rows stay NULL. Never backfill this to true — that re-creates the lie.
--
-- The edu_public_decks drop+create runs in one transaction, so the function is
-- never absent to a live caller; the name is unchanged and only a column is added.

alter table education.content_certification
  add column if not exists human_verified_at timestamptz,
  add column if not exists human_verified_by uuid;

comment on column education.content_certification.human_verified_at is
  'When a HUMAN expert verified this content. NULL = AI-curated starter, not yet human-verified — the UI must NOT render it as "Certified". Set only via edu_verify_content.';
comment on column education.content_certification.human_verified_by is
  'The person who verified it. A trust mark nobody signed is not a trust mark.';

drop function if exists public.edu_public_decks(text, boolean, integer, text);

create function public.edu_public_decks(
  p_search text default null,
  p_certified_only boolean default false,
  p_limit integer default 60,
  p_exam_slug text default null
)
returns table(
  id uuid, name text, description text, topic text, difficulty text,
  card_count bigint, certified boolean, certified_note text,
  human_verified boolean, updated_at timestamptz
)
language sql
stable
security definer
set search_path to 'public', 'education', 'platform'
as $function$
  select
    s.id, s.name, s.description, s.topic, s.difficulty,
    (select count(*) from platform.associations_live a
       where a.target_type='fc_set' and a.target_id=s.id
         and a.source_type='fc_card' and a.role='member')::bigint as card_count,
    (cc.resource_id is not null) as certified,
    cc.note as certified_note,
    (cc.human_verified_at is not null) as human_verified,
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
  -- Human-verified content sorts above AI-curated starters.
  order by (cc.human_verified_at is not null) desc,
           (cc.resource_id is not null) desc,
           s.updated_at desc
  limit greatest(1, least(coalesce(p_limit,60),200));
$function$;

revoke execute on function public.edu_public_decks(text, boolean, integer, text) from public;
grant  execute on function public.edu_public_decks(text, boolean, integer, text) to anon, authenticated, service_role;

-- Human verification is an explicit, signed, revocable act.
create or replace function public.edu_verify_content(
  p_resource_type text,
  p_resource_id uuid,
  p_verified boolean default true,
  p_note text default null
)
returns education.content_certification
language plpgsql
security definer
set search_path to 'public', 'education'
as $function$
declare
  v_row education.content_certification;
  v_uid uuid := auth.uid();
begin
  if not public.is_super_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  update education.content_certification
     set human_verified_at = case when p_verified then now() else null end,
         human_verified_by = case when p_verified then v_uid else null end,
         note = coalesce(p_note, note)
   where resource_type = p_resource_type
     and resource_id = p_resource_id
  returning * into v_row;

  if not found then
    raise exception 'no certification row for % %', p_resource_type, p_resource_id
      using errcode = 'P0002';
  end if;
  return v_row;
end;
$function$;

comment on function public.edu_verify_content(text, uuid, boolean, text) is
  'A human expert signs (or withdraws) verification of certified content. This is what turns an "AI-built starter" into a "Certified" deck — super-admin only, and revocable.';

revoke execute on function public.edu_verify_content(text, uuid, boolean, text) from public, anon;
grant  execute on function public.edu_verify_content(text, uuid, boolean, text) to authenticated, service_role;
