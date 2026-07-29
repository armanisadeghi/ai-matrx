-- Archive / restore RPCs for the universal keyword library (seo.keyword).
--
-- Context (2026-07-29, Arman ruling "autosave but make management easy"):
-- every keyword discovered by the research pipeline is auto-saved into
-- seo.keyword server-side (fn_ingest_keyword_research -> fn_upsert_keyword).
-- These RPCs are the ONE sanctioned client-side management path: soft-archive
-- (deleted_at) + restore. Authenticated users have SELECT-only on the table,
-- so writes MUST go through these SECURITY DEFINER functions.
--
-- Semantics:
--   * Archive = deleted_at + provenance breadcrumbs in metadata. Every
--     authenticated read already filters deleted_at IS NULL in the query
--     (never in authenticated RLS — the soft-delete class rule).
--   * Archive is durable memory: uq_keyword_identity is a FULL unique index
--     on (normalized_phrase, language), so fn_upsert_keyword's post-conflict
--     re-select returns the archived row (still archived). Research re-runs
--     do NOT resurrect an archived keyword. Explicit hand-entry paths restore
--     deliberately via fn_restore_keywords.

create or replace function seo.fn_archive_keywords(
  p_keyword_ids uuid[],
  p_reason text default null
)
returns integer
language plpgsql
security definer
set search_path to 'seo', 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_count integer := 0;
begin
  if v_uid is null then
    raise exception 'fn_archive_keywords requires an authenticated user';
  end if;
  if p_keyword_ids is null or array_length(p_keyword_ids, 1) is null then
    return 0;
  end if;

  update seo.keyword k
     set deleted_at = now(),
         updated_at = now(),
         updated_by = v_uid,
         metadata = coalesce(k.metadata, '{}'::jsonb) || jsonb_strip_nulls(
           jsonb_build_object(
             'archived_by', v_uid,
             'archived_at', now(),
             'archived_reason', p_reason
           )
         )
   where k.id = any(p_keyword_ids)
     and k.deleted_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

create or replace function seo.fn_restore_keywords(
  p_keyword_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path to 'seo', 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_count integer := 0;
begin
  if v_uid is null then
    raise exception 'fn_restore_keywords requires an authenticated user';
  end if;
  if p_keyword_ids is null or array_length(p_keyword_ids, 1) is null then
    return 0;
  end if;

  update seo.keyword k
     set deleted_at = null,
         updated_at = now(),
         updated_by = v_uid,
         metadata = coalesce(k.metadata, '{}'::jsonb)
           - 'archived_by' - 'archived_at' - 'archived_reason'
   where k.id = any(p_keyword_ids)
     and k.deleted_at is not null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

revoke all on function seo.fn_archive_keywords(uuid[], text) from public, anon;
revoke all on function seo.fn_restore_keywords(uuid[]) from public, anon;
grant execute on function seo.fn_archive_keywords(uuid[], text) to authenticated, service_role;
grant execute on function seo.fn_restore_keywords(uuid[]) to authenticated, service_role;
