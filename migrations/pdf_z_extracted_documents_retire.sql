-- Retire the deprecated extracted_documents view + legacy table.
--
-- The view was a thin facade over processed_documents (id, user_id←owner_id,
-- name, content, clean_content, source←storage_uri, timestamps; filtered to
-- initial_extract/legacy_import/re_extract). Zero live FE callers remain —
-- usePdfExtractor reads processed_documents directly; the only references
-- were comments. extracted_documents_legacy held 25 rows, none of which
-- exist in processed_documents — they migrate in here (conflict default:
-- straight insert, ids preserved; on-conflict skip + log).

-- 1. Migrate legacy rows into the canonical aggregate.
with skipped as (
  insert into public.pdf_consolidation_log (kind, chosen_id, detail)
  select 'legacy_import_id_conflict', l.id,
         jsonb_build_object('name', l.name)
  from public.extracted_documents_legacy l
  where exists (select 1 from public.processed_documents p where p.id = l.id)
  returning 1
)
insert into public.processed_documents (
    id, owner_id, name, content, clean_content, storage_uri,
    source_kind, source_id, source_hash, derivation_kind, mime_type, created_at, updated_at
)
select
    l.id,
    l.user_id,
    coalesce(l.name, 'Legacy document'),
    l.content,
    l.clean_content,
    l.source,
    'legacy',
    -- source_id is NOT NULL; legacy rows have no upstream record, so the
    -- row's own id is the stable self-referential source key (gated by
    -- source_kind='legacy', never joined against cld_files).
    l.id::text,
    -- source_hash is NOT NULL (dedupe key) — hash the content like
    -- compute_source_hash does server-side.
    encode(sha256(convert_to(coalesce(l.content, ''), 'UTF8')), 'hex'),
    'legacy_import',
    'application/pdf',
    coalesce(l.created_at, now()),
    coalesce(l.updated_at, now())
from public.extracted_documents_legacy l
on conflict (id) do nothing;

-- 2. Drop the facade view, then the drained legacy table.
drop view if exists public.extracted_documents;
drop table if exists public.extracted_documents_legacy;
