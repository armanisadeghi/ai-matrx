-- PDF data consolidation, step 1 — unify the two page families.
--
-- Two unrelated decompositions of the same PDF existed with no shared key:
--   processed_document_pages (extractor family — raw/clean text, blocks,
--   words, page boundaries, sections; the fidelity-rich canonical baseline)
--   file_pages (analysis family — user decisions: exclude/rotate/override,
--   thumbnails; everything the Analysis Studio hangs annotations off).
--
-- This migration makes identity shared WITHOUT breaking either family:
--   1. Backfills cld_files.canonical_processed_document_id (the bridge —
--      designed in the Phase-2.0 dedup handoff, never populated: 0/56).
--   2. Adds file_pages.processed_document_page_id (nullable link) +
--      backfills it via bridge + page index.
--   3. Keeps both fresh going forward with three small triggers.
--   4. Exposes ONE read perspective: public.pdf_unified_pages
--      (security_invoker view — RLS of the underlying tables applies).
--   5. Logs multi-candidate conflicts to pdf_consolidation_log
--      (conflict default: most-recently-updated wins, logged, not blocked).

-- ── 0. Conflict/ops log (service-level; not exposed to API roles) ─────────
create table if not exists public.pdf_consolidation_log (
    id           uuid primary key default gen_random_uuid(),
    kind         text not null,
    cld_file_id  uuid,
    chosen_id    uuid,
    detail       jsonb not null default '{}'::jsonb,
    created_at   timestamptz not null default now()
);
revoke all on public.pdf_consolidation_log from anon, authenticated;

-- ── 1. Backfill the bridge ────────────────────────────────────────────────
-- Candidate rule: prefer initial_extract, then legacy_import, then
-- re_extract; ties broken by updated_at desc (last-updated wins).
with candidates as (
  select
    c.id as cld_file_id,
    p.id as doc_id,
    row_number() over (
      partition by c.id
      order by
        case p.derivation_kind
          when 'initial_extract' then 0
          when 'legacy_import'   then 1
          when 're_extract'      then 2
          else 3
        end,
        p.updated_at desc
    ) as rn,
    count(*) over (partition by c.id) as n_candidates
  from public.cld_files c
  join public.processed_documents p
    on p.source_kind = 'cld_file'
   and p.source_id is not null
   and p.source_id::uuid = c.id
   and p.archived_at is null
  where c.canonical_processed_document_id is null
    and c.deleted_at is null
), conflicts as (
  insert into public.pdf_consolidation_log (kind, cld_file_id, chosen_id, detail)
  select 'bridge_backfill_multi_candidate',
         cld_file_id,
         (array_agg(doc_id) filter (where rn = 1))[1],
         jsonb_build_object('candidates', count(*))
  from candidates
  group by cld_file_id
  having max(n_candidates) > 1
  returning 1
)
update public.cld_files c
   set canonical_processed_document_id = candidates.doc_id
  from candidates
 where candidates.cld_file_id = c.id
   and candidates.rn = 1;

-- ── 2. The page-level link column ─────────────────────────────────────────
alter table public.file_pages
  add column if not exists processed_document_page_id uuid
    references public.processed_document_pages(id) on delete set null;

create index if not exists file_pages_pd_page_idx
  on public.file_pages (processed_document_page_id);

update public.file_pages fp
   set processed_document_page_id = pp.id
  from public.cld_files c
  join public.processed_document_pages pp
    on pp.processed_document_id = c.canonical_processed_document_id
 where fp.processed_document_page_id is null
   and c.id = fp.file_id
   and c.canonical_processed_document_id is not null
   and pp.page_index = fp.source_page_index;

-- ── 3. Keep it fresh going forward ────────────────────────────────────────

-- 3a. New processed_documents fill an empty bridge (never overwrite — the
--     dedup endpoints own canonical REPLACEMENT; this only covers first-link).
create or replace function public.pdf_set_canonical_bridge()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.source_kind = 'cld_file'
     and new.source_id is not null
     and new.derivation_kind in ('initial_extract', 'legacy_import') then
    update cld_files
       set canonical_processed_document_id = new.id
     where id = new.source_id::uuid
       and canonical_processed_document_id is null;
  end if;
  return new;
end $$;

drop trigger if exists trg_pdf_set_canonical_bridge on public.processed_documents;
create trigger trg_pdf_set_canonical_bridge
  after insert on public.processed_documents
  for each row execute function public.pdf_set_canonical_bridge();

-- 3b. New canonical pages link any existing file_pages rows for the file.
create or replace function public.pdf_link_file_pages_for_new_page()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update file_pages fp
     set processed_document_page_id = new.id
    from cld_files c
   where c.canonical_processed_document_id = new.processed_document_id
     and fp.file_id = c.id
     and fp.source_page_index = new.page_index
     and fp.processed_document_page_id is null;
  return new;
end $$;

drop trigger if exists trg_pdf_link_file_pages on public.processed_document_pages;
create trigger trg_pdf_link_file_pages
  after insert on public.processed_document_pages
  for each row execute function public.pdf_link_file_pages_for_new_page();

-- 3c. New file_pages rows resolve their link at insert time.
create or replace function public.pdf_resolve_file_page_link()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.processed_document_page_id is null then
    select pp.id into new.processed_document_page_id
      from cld_files c
      join processed_document_pages pp
        on pp.processed_document_id = c.canonical_processed_document_id
     where c.id = new.file_id
       and pp.page_index = new.source_page_index
     limit 1;
  end if;
  return new;
end $$;

drop trigger if exists trg_pdf_resolve_file_page_link on public.file_pages;
create trigger trg_pdf_resolve_file_page_link
  before insert on public.file_pages
  for each row execute function public.pdf_resolve_file_page_link();

-- ── 4. One unified page perspective (view, NOT a duplicate table) ─────────
create or replace view public.pdf_unified_pages
with (security_invoker = true) as
select
  pp.id                          as page_id,
  pp.processed_document_id,
  c.id                           as file_id,
  pp.page_number,
  pp.page_index,
  pp.raw_text,
  pp.cleaned_text,
  pp.section_kind,
  pp.section_title,
  pp.is_continuation,
  pp.width,
  pp.height,
  pp.rotation                    as extract_rotation,
  pp.used_ocr,
  pp.image_cld_file_id,
  fp.id                          as file_page_id,
  fp.status                      as user_status,
  fp.rotation                    as user_rotation,
  fp.excluded_at,
  fp.user_modified,
  fp.thumbnail_url
from public.processed_document_pages pp
left join public.cld_files c
  on c.canonical_processed_document_id = pp.processed_document_id
left join public.file_pages fp
  on fp.processed_document_page_id = pp.id;

comment on view public.pdf_unified_pages is
  'One page perspective across both PDF page families: extractor fidelity (processed_document_pages) + Analysis Studio user decisions (file_pages), joined via the cld_files canonical bridge. security_invoker — underlying RLS applies.';
