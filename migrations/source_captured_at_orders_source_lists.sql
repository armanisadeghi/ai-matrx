-- based-on: public.rag_library_list(integer, integer, text, text, text) 55aa96b7c539566c5608588bcc293e394548e4d84650683f8589f1575d08d440
--
-- A Source's age is when it was captured, not when a backfill converged it.
--
-- 2026-09-26 the SOURCE-CONVERGENCE backfills (aidream scripts/backfill_*_to_sources.py) landed
-- ~12,000 existing captures, research pages, extension saves and files as Sources, every one with
-- created_at = the day of the backfill and intelligence_policy = 'materialize_only'. Every list that
-- orders Sources newest-first by created_at then put months-old material above everything the
-- person actually did: measured for one owner (4cf62e4e…), the Sources page's first 100 Saved rows
-- were 100/100 backfilled, and the "ready" pickers (flashcards, assessments: public.rag_library_list)
-- were 49/50 backfilled.
--
-- The rule (Notion/Drive import reference: an imported item keeps its original date): a Source's
-- list time is when the thing entered the person's world — the capture time the door records on
-- every landing (metadata.captured_at; a backfill carries the ORIGINAL capture's time, a live landing
-- its own), else for a file materialized after the fact (intelligence_policy = 'materialize_only',
-- which only the backfills stamp) the file's own upload time, else created_at. Never later than
-- created_at. The transcript backfill's 283 Sources were re-stamped policy 'always' after landing,
-- so the marker of a backfill is the recorded capture time, not the policy.
--
-- ONE declaration: docproc.source_captured_at(docproc.processed_documents), a PostgREST computed
-- field (select `captured_at:source_captured_at`, order `source_captured_at`) that every Source list
-- orders and shows by — the Sources page, a Library's catalogued Sources, and rag_library_list.

CREATE OR REPLACE FUNCTION docproc.source_captured_at(p docproc.processed_documents)
RETURNS timestamptz
LANGUAGE sql
STABLE
PARALLEL SAFE
SET search_path = ''
AS $function$
  SELECT LEAST(
    p.created_at,
    COALESCE(
      CASE WHEN (p.metadata ->> 'captured_at') ~ '^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}'
           THEN (p.metadata ->> 'captured_at')::timestamptz END,
      CASE WHEN p.intelligence_policy = 'materialize_only'
            AND p.source_kind = 'cld_file'
            AND p.source_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           THEN (SELECT f.created_at FROM files.files f WHERE f.id = p.source_id::uuid) END,
      p.created_at))
$function$;

COMMENT ON FUNCTION docproc.source_captured_at(docproc.processed_documents) IS
  'When a Source entered the person''s world: metadata.captured_at (a backfill carries the original capture''s '
  'time), else for a background-materialized file (materialize_only) the file''s upload time, else created_at; '
  'never later than created_at. The ONE order/display time for every Source list '
  '(PostgREST computed field). See matrx-frontend migrations/source_captured_at_orders_source_lists.sql.';

GRANT EXECUTE ON FUNCTION docproc.source_captured_at(docproc.processed_documents) TO authenticated, service_role;

-- rag_library_list (the "pick a ready document" pickers: flashcards from a source, assessments):
-- unchanged except its order — newest by docproc.source_captured_at, id as the total-order
-- tiebreaker — and each row now also carries `captured_at` (the time the list sorted by).
CREATE OR REPLACE FUNCTION public.rag_library_list(p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_search text DEFAULT NULL::text, p_status_filter text DEFAULT NULL::text, p_source_kind text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'docproc', 'rag'
AS $function$
declare
  v_uid    uuid := auth.uid();
  v_limit  int  := greatest(1, least(coalesce(p_limit, 50), 200));
  v_offset int  := greatest(0, coalesce(p_offset, 0));
  v_search text := case when p_search is not null and p_search <> ''
                        then '%' || p_search || '%' end;
  v_total  int;
  v_docs   jsonb;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  with base as (
    select
      pd.id, pd.name, pd.source_kind, pd.source_id, pd.mime_type,
      pd.total_pages, pd.derivation_kind, pd.parent_processed_id,
      pd.created_at, pd.updated_at,
      docproc.source_captured_at(pd) as captured_at,
      (pd.structured_json is not null) as has_structured_json,
      (select count(*) from docproc.processed_document_pages
         where processed_document_id = pd.id) as pages_persisted,
      (select count(*) from rag.kg_chunks
         where processed_document_id = pd.id) as chunks,
      (select count(*) from rag.kg_chunks c
         join rag.embeddings_voyage_4_large_1024 e on e.chunk_id = c.id
         where c.processed_document_id = pd.id) as embeddings_oai,
      (select count(*) from rag.kg_chunks c
         join rag.embeddings_voyage_code_3_1024 e on e.chunk_id = c.id
         where c.processed_document_id = pd.id) as embeddings_voyage,
      (select count(*) from rag.data_store_members m
         where m.source_kind = 'cld_file'
           and m.source_id   = pd.source_id
           and m.deleted_at is null) as data_store_count
    from docproc.processed_documents pd
    where (pd.created_by = v_uid
           or (pd.organization_id = public.system_org_id('library')
               and public.can_curate_library_document(pd.id, v_uid)))
      and pd.deleted_at is null
      and pd.parent_processed_id is null
      and (v_search is null or pd.name ilike v_search)
      and (p_source_kind is null or pd.source_kind = p_source_kind)
  ),
  scored as (
    select *,
      case
        when pages_persisted = 0        then 'pending'
        when chunks = 0                 then 'extracted'
        when embeddings_oai < chunks    then 'embedding'
        else 'ready'
      end as status
    from base
  ),
  filtered as (
    select * from scored
    where p_status_filter is null or status = p_status_filter
  )
  select
    count(*)::int,
    coalesce(
      (select jsonb_agg(row_to_json(d)::jsonb order by d.captured_at desc, d.id)
       from (
         select
           id::text, name, source_kind, source_id, mime_type, total_pages,
           pages_persisted::int, chunks::int, embeddings_oai::int,
           embeddings_voyage::int, data_store_count::int, has_structured_json,
           coalesce(derivation_kind, 'initial_extract') as derivation_kind,
           parent_processed_id::text,
           status,
           to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"+00:00"') as created_at,
           to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"+00:00"') as updated_at,
           to_char(captured_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"+00:00"') as captured_at
         from filtered
         -- `id` is the unique tiebreaker that makes this a TOTAL order. Do not remove it.
         order by filtered.captured_at desc, filtered.id
         limit v_limit offset v_offset
       ) d),
      '[]'::jsonb)
  into v_total, v_docs
  from filtered;

  return jsonb_build_object(
    'documents', coalesce(v_docs, '[]'::jsonb),
    'total',     coalesce(v_total, 0),
    'limit',     v_limit,
    'offset',    v_offset
  );
end;
$function$;
