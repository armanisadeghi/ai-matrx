-- based-on: public.rag_library_list(integer, integer, text, text, text) 949f9ac50d885b09466f6e811c88d1d03cb77c5031c6a29eba292665e83d8e23
--
-- The Source's capture time becomes a real column: docproc.processed_documents.captured_at.
--
-- Supersedes the computed field docproc.source_captured_at(docproc.processed_documents) from
-- migrations/source_captured_at_orders_source_lists.sql (applied an hour earlier; nothing calls it
-- after this file — dropping it is a non-additive chair step left to the owning session):
--   * a whole-row argument needs SELECT on EVERY column, and `authenticated` may not read
--     storage_uri, so PostgREST refused the Sources list with 42501 the moment it asked for it;
--   * ordered by a function the list cost 3.4 s for one owner's 8,338 Sources (a SET search_path
--     function is never inlined), and rag_library_list paid it on every call.
-- The rule is unchanged — when the Source entered the person's world: metadata.captured_at (a
-- backfill carries the ORIGINAL capture's time), else for a background-materialized file
-- (intelligence_policy = 'materialize_only', stamped only by the backfills) the file's upload
-- time, else created_at; never later than created_at — but it is computed ONCE, when the row
-- lands (BEFORE INSERT trigger), stored, and every list orders by a plain column.
--
-- Backfill: one UPDATE of the new column with session_replication_role = replica, so NO row
-- trigger fires — writing a derived column is not a modification: _touch_row and the duplicate
-- trg_processed_documents_updated_at would otherwise stamp updated_at = now() on all ~10,700
-- Sources, and _stamp_actor would rewrite updated_by (the exact class the 2026-09-26 files
-- backfill caused). Set back to origin immediately after, inside this transaction.

-- NOT NULL DEFAULT now(): the add fills every row in one rewrite (no row trigger fires); the
-- replica-mode UPDATE below then writes each row's real value.
ALTER TABLE docproc.processed_documents ADD COLUMN captured_at timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN docproc.processed_documents.captured_at IS
  'When this Source entered the person''s world — the ONE time every Source list orders and shows by. '
  'Set on insert by docproc._stamp_source_captured_at(): metadata.captured_at (a backfill carries the original '
  'capture''s time), else for a background-materialized file the file''s upload time, else created_at; never later '
  'than created_at. Never written by the app.';

CREATE OR REPLACE FUNCTION docproc._source_captured_at_of(
    p_created_at timestamptz, p_metadata jsonb, p_intelligence_policy text, p_source_kind text, p_source_id text)
RETURNS timestamptz
LANGUAGE sql
STABLE
SET search_path = ''
AS $function$
  SELECT LEAST(
    p_created_at,
    COALESCE(
      CASE WHEN (p_metadata ->> 'captured_at') ~ '^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}'
           THEN (p_metadata ->> 'captured_at')::timestamptz END,
      CASE WHEN p_intelligence_policy = 'materialize_only'
            AND p_source_kind = 'cld_file'
            AND p_source_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           THEN (SELECT f.created_at FROM files.files f WHERE f.id = p_source_id::uuid) END,
      p_created_at))
$function$;

CREATE OR REPLACE FUNCTION docproc._stamp_source_captured_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
    NEW.captured_at := docproc._source_captured_at_of(
        coalesce(NEW.created_at, now()), NEW.metadata, NEW.intelligence_policy, NEW.source_kind, NEW.source_id);
    RETURN NEW;
END
$function$;

COMMENT ON FUNCTION docproc._stamp_source_captured_at() IS
  'BEFORE INSERT on docproc.processed_documents: stamps captured_at (see the column comment). '
  'matrx-frontend migrations/source_captured_at_column.sql.';

-- Runs as the inserting role, so the helper needs EXECUTE for every role that lands a Source.
GRANT EXECUTE ON FUNCTION docproc._source_captured_at_of(timestamptz, jsonb, text, text, text) TO authenticated, service_role;

CREATE TRIGGER _stamp_source_captured_at
    BEFORE INSERT ON docproc.processed_documents
    FOR EACH ROW
    EXECUTE FUNCTION docproc._stamp_source_captured_at();

SET LOCAL session_replication_role = replica;
UPDATE docproc.processed_documents p
   SET captured_at = docproc._source_captured_at_of(p.created_at, p.metadata, p.intelligence_policy, p.source_kind, p.source_id);
SET LOCAL session_replication_role = origin;


-- rag_library_list: order by the stored column (unchanged otherwise).
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
      pd.captured_at,
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
