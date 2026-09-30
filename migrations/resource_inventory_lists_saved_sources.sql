-- resource_inventory_lists_saved_sources.sql
--
-- lane: A3-F follow-up, "one source input" campaign (follows resource_inventory_hides_child_and_system_files.sql).
-- based-on: platform._inventory_filter(text, uuid, uuid, boolean, boolean) 103fda78c19224c62f03d9edc92c6fe6db4fc07b7890d1e139ab2dd33796df06
-- (first executed through the Supabase MCP on 2026-09-29 against the A5-P body; this hash is that result, so a
-- re-run through db:apply is a no-op that records the ledger row.)
--
-- "Use existing" in the Source input offered files, notes, transcripts, documents, tables and workbooks,
-- so a person's own pasted text, saved web pages, YouTube captions and recordings (Sources in
-- docproc.processed_documents, landed through the door) could not be picked again. The processed_document
-- kind now joins the Source input, and the one inventory filter (counts AND lists) narrows it to the
-- Sources a person saved, one row per Source:
--   * saved: kept_at set, or (as the Sources page's Saved rule) pasted/legacy text from before Save existed
--     that no backfill materialized;
--   * never the text read out of a stored file (cld_file, code_file) or of a transcript row — those are
--     picked as Files / Transcripts, so they are not listed twice;
--   * originals and recaptures only (never derived copies, edits, chunks), and a Source whose newer saved
--     recapture exists lists that recapture only.
-- A filter only — row security and grants are unchanged.

set local lock_timeout = '2s';

CREATE OR REPLACE FUNCTION platform._inventory_filter(p_token text, p_uid uuid, p_organization_id uuid DEFAULT NULL::uuid, p_mine boolean DEFAULT false, p_by_ids boolean DEFAULT false)
 RETURNS TABLE(schema_name text, table_name text, title_column text, recent_column text, where_sql text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
-- Returns the FROM target and a WHERE clause (alias t) for "rows of this kind this viewer has".
-- The clause may reference $1 = platform.shown_to_context(p_token) (jsonb); every caller executes it
-- with that one USING argument. Internal: only the definer doors below call it.
declare
  v_row platform.entity_types%rowtype;
  v_cols text[];
  v_access text;
  v_where text;
  v_predicate record;
  v_recent text;
begin
  select * into v_row
  from platform.entity_types e
  where e.token = p_token and e.is_active;

  if not found then
    raise exception 'unknown or inactive entity token "%"', p_token;
  end if;
  if not v_row.reference_pickable or v_row.title_column is null then
    raise exception 'entity "%" is not reference-pickable with a title column — enable it at /administration/relationships/entity-types', p_token;
  end if;

  select coalesce(array_agg(c.column_name::text), '{}')
    into v_cols
  from information_schema.columns c
  where c.table_schema = v_row.schema_name
    and c.table_name = v_row.table_name;

  if p_token = 'file' then
    if p_by_ids then
      v_access := format(
        'files.has_access_for(%L, t.id, %L::public.permission_level)', p_uid, 'viewer');
    else
      -- Machine files are hidden set-based (the rules files.is_listable_for applies through
      -- files.is_crawl_artifact, spelled as anti-joins so a large library is not one plpgsql call per
      -- row), plus every file that is a CHILD of another record (a chat's tool image, a coding
      -- session's artifact, a browser profile's login capture, a recording's chunks — the access
      -- ladder made these children; they are reached through their parent, never picked alone) and
      -- every file the system marked as its own artifact (any artifact_domain). The viewer's own
      -- files need nothing more; anyone else's go through the canonical check.
      v_access := format(
        't.parent_file_id is null'
        ' and t.parent_record_type is null'
        ' and not public.is_system_path(t.file_path)'
        ' and not (t.metadata @> %L::jsonb)'
        ' and not (t.metadata @> ''{"system_artifact": true}''::jsonb)'
        ' and not exists (select 1 from web.snapshot s where s.body_file_id = t.id)'
        ' and not exists (select 1 from web.snapshot s where s.markdown_file_id = t.id)'
        ' and not exists (select 1 from web.screenshot s where s.file_id = t.id)'
        ' and (t.created_by = %L or files.is_listable_for(%L, t.id))',
        '{"system_artifact": true, "artifact_domain": "web_crawl"}', p_uid, p_uid);
    end if;
  elsif p_by_ids then
    -- By-id TITLE RESOLUTION (not enumeration): the caller already holds the ids; the only question is
    -- "may this viewer read these rows?" — exactly iam.has_access, the verdict row security gives.
    v_access := format(
      'iam.has_access(%L, t.id, %L::public.permission_level)', p_token, 'viewer');
  elsif 'created_by' = any(v_cols) and 'organization_id' = any(v_cols) then
    if v_row.data_class = 'private' then
      -- A Private record opens to its owner alone (access ladder).
      v_access := format('t.created_by = %L', p_uid);
    elsif 'shown_to' = any(v_cols) then
      -- $1 holds only the viewer's live organizations, so "? organization" is the membership test.
      v_access := format(
        't.created_by = %L or (t.organization_id is not null and $1 ? t.organization_id::text'
        ' and platform.shown_to_lists(t.shown_to, null, t.created_by, t.organization_id, %L, $1))',
        p_uid, p_uid);
    else
      v_access := format(
        't.created_by = %L or (t.organization_id is not null and $1 ? t.organization_id::text)',
        p_uid);
    end if;
  elsif 'created_by' = any(v_cols) then
    v_access := format('t.created_by = %L', p_uid);
  elsif 'organization_id' = any(v_cols) then
    v_access := '(t.organization_id is not null and $1 ? t.organization_id::text)';
  else
    v_access := 'true';
  end if;

  v_where := '(' || v_access || ')';

  if p_token = 'processed_document' and not p_by_ids then
    -- The Sources a person saved, one row per Source (the Sources page's Saved + one-row rules). The
    -- text read out of a stored file or a transcript row is picked as that File / Transcript instead.
    v_where := v_where
      || ' and t.source_kind not in (''cld_file'', ''code_file'', ''transcript'')'
      || ' and (t.kept_at is not null'
      ||      ' or (t.source_kind in (''inline'', ''legacy'') and t.origin_client is null'
      ||          ' and t.intelligence_policy is distinct from ''materialize_only''))'
      || ' and (t.parent_processed_id is null or t.derivation_kind = ''recapture'')'
      || ' and not exists (select 1 from docproc.processed_documents c'
      ||      ' where c.parent_processed_id = t.id and c.derivation_kind = ''recapture'''
      ||      ' and c.kept_at is not null and c.deleted_at is null and c.archived_at is null)';
  end if;

  -- Scope filters. Filters only: they narrow what the access clause above already admits.
  if coalesce(p_mine, false) then
    if not ('created_by' = any(v_cols)) then
      raise exception 'entity "%" has no created_by column, so it cannot be filtered to "mine"', p_token;
    end if;
    v_where := v_where || format(' and t.created_by = %L', p_uid);
  end if;
  if p_organization_id is not null then
    if not ('organization_id' = any(v_cols)) then
      raise exception 'entity "%" has no organization_id column, so it cannot be filtered to an organization', p_token;
    end if;
    v_where := v_where || format(' and t.organization_id = %L', p_organization_id);
  end if;

  if 'deleted_at' = any(v_cols) then
    v_where := v_where || ' and t.deleted_at is null';
  end if;
  if 'canonical_id' = any(v_cols) then
    v_where := v_where || ' and t.canonical_id is null';
  end if;
  if not p_by_ids then
    -- Archived items leave lists (archived-items law); a held id still resolves its title.
    if 'is_archived' = any(v_cols) then
      v_where := v_where || ' and t.is_archived is not true';
    end if;
    if 'archived_at' = any(v_cols) then
      v_where := v_where || ' and t.archived_at is null';
    end if;
  end if;

  for v_predicate in
    select p.key, p.value
    from pg_catalog.jsonb_each(v_row.reference_candidate_predicates) as p(key, value)
  loop
    if not (v_predicate.key = any(v_cols)) then
      raise exception
        'entity "%" candidate predicate names missing column "%.%.%"',
        p_token, v_row.schema_name, v_row.table_name, v_predicate.key;
    end if;
    if v_predicate.value = 'null'::jsonb then
      v_where := v_where || format(' and t.%I is null', v_predicate.key);
    elsif jsonb_typeof(v_predicate.value) in ('string', 'number', 'boolean') then
      v_where := v_where || format(' and t.%I::text = %L', v_predicate.key, v_predicate.value #>> '{}');
    else
      raise exception 'entity "%" candidate predicate "%" must be a scalar or null', p_token, v_predicate.key;
    end if;
  end loop;

  v_recent := case
    when 'updated_at' = any(v_cols) then 'updated_at'
    when 'created_at' = any(v_cols) then 'created_at'
    else null
  end;

  return query select v_row.schema_name, v_row.table_name, v_row.title_column, v_recent, v_where;
end
$function$;

-- The Source input offers a person's saved Sources under Use existing.
update platform.entity_types
set source_input_pickable = true
where token = 'processed_document' and source_input_pickable is distinct from true;
