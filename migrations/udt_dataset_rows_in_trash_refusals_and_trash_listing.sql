-- draft: udt-rows-soft-delete lane — archived Data table rows are listed and restored in /trash, and every row writer says "in Trash" instead of "not found" (rehearsed on the clone; the chair removes this line and applies)
-- based-on: public.udt_upsert_row(uuid, uuid, jsonb) 10e4ff3c30ca95c3d743f5c3b327e21ab46a23d9e4e0330b9632e6f90464e29f
-- based-on: public.udt_upsert_cell(uuid, uuid, text, jsonb) 2ed1510f38d02c239139e20073d15ae24ecf143cd40da664a994607589d97bf2
-- based-on: public.update_data_row_in_user_table(uuid, jsonb) 471e4005f9e8f8955ea262beb0fcac590155c3d72b1b548334531b8b9c94cdaf
-- based-on: public.udt_bulk_write(uuid, jsonb) cc78fd8c3518f49ea62f55fadf65ae7c540dd8fe0dda53ea724ee0c90b3f3cda
-- based-on: public._trash_kind_rows(uuid, uuid, uuid, text[], integer, integer) 1d84fc27f5f7f7c4a335520b2d3ec8db692cbd4a1d349fc8403ef8c1012b216b
--
-- THE LAW (Arman, via the chair, 2026-09-26): every delete archives through the table's
-- soft-delete column; readers skip archived rows; archived rows are restorable from /trash.
--
-- SUPERSEDES udt_dataset_rows_delete_archives_and_trash_restores.sql (deleted in the same
-- commit, never applied). Most of it shipped from another lane first:
-- delete_is_archive_udt_rows_and_columns.sql (matrx-frontend f3c27337e0, 2026-09-28) archives
-- the grid's row deletes (delete_data_row_from_user_table, udt_bulk_write 'delete'), makes 29 udt
-- RPCs skip archived rows and columns, and adds `deleted_at IS NULL` to every row writer's UPDATE.
-- This file carries ONLY what that one does not, rebased on the live bodies read 2026-09-28:
--
-- 1. /trash. THE trash registry is platform.entity_types.user_artifact_kind (public._trash_kind_rows
--    / _trash_kind_counts iterate it; public.entity_undelete restores through iam.has_access
--    'editor', which walks a row to its dataset). The udt_dataset_rows token becomes artifact kind
--    'dataset_row': archived rows list in the owner's Trash (created_by = the table's owner, set by
--    platform.component_created_by_from_parent) and in Organization Trash. _trash_kind_rows gets ONE
--    title rule for the kind, the row's words "(in <table>)" — a row has no title column.
--    No change is needed to trash_counts or entity_undelete: both are registry-driven.
-- 2. The row writers. Since f3c27337e0 an edit of an archived row matches nothing and answers
--    "row not found", which is not true — the row is in Trash. Each now says so, in its own shape:
--      udt_upsert_row / udt_upsert_cell  RAISE, errcode 55000, "This row is in Trash. Restore it from Trash to edit it."
--      update_data_row_in_user_table     {success:false, row_id, error: <that sentence>}
--      udt_bulk_write update|merge|cell  per-op {error:'row_in_trash', row_id, message}; the batch
--                                        continues, as row_not_found does (the grid reads
--                                        row_in_trash since matrx-frontend ffb7d7b0fc)
--    The UPDATEs keep f3c27337e0's `deleted_at IS NULL`, so a row archived between the check and
--    the write still answers not-found rather than being edited.
--
-- Census (pg_proc.prosrc over udt_dataset_rows, 2026-09-28): every reader and writer now handles
-- deleted_at except three that never read an existing row — _d31_impl_add_data_row_to_user_table
-- and create_new_user_table_dynamic (inserts) and cascade_table_security_settings (a trigger that
-- copies security columns). Nothing is missing on the read side.

-- ── public.udt_upsert_row — an edit of an archived row says it is in Trash
CREATE OR REPLACE FUNCTION public.udt_upsert_row(p_table_id uuid, p_row_id uuid DEFAULT NULL::uuid, p_data jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller  UUID := auth.uid();
  v_dataset workbench.udt_datasets%ROWTYPE;
  v_row     workbench.udt_dataset_rows%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'udt_upsert_row: not authenticated';
  END IF;
  IF p_data IS NULL THEN
    RAISE EXCEPTION 'udt_upsert_row: p_data is required';
  END IF;

  SELECT * INTO v_dataset FROM workbench.udt_datasets WHERE id = p_table_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'udt_upsert_row: table % not found', p_table_id;
  END IF;
  IF NOT workbench.udt_dataset_access(p_table_id, 'editor') THEN
    RAISE EXCEPTION 'udt_upsert_row: caller lacks editor permission on table %', p_table_id;
  END IF;

  IF p_row_id IS NULL THEN
    INSERT INTO workbench.udt_dataset_rows(table_id, data, user_id)
    VALUES (p_table_id, p_data, v_caller) RETURNING * INTO v_row;
  ELSE
    -- lane OLDER-DOORS-AFTER-SWITCH: an update MERGES p_data into the row (cells it does not name
    -- stay); it used to replace the whole row. A moved table refuses in the row guard.
    IF jsonb_typeof(p_data) <> 'object' THEN
      RAISE EXCEPTION 'udt_upsert_row: p_data must be an object' USING errcode = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM workbench.udt_dataset_rows
                WHERE id = p_row_id AND table_id = p_table_id AND deleted_at IS NOT NULL) THEN
      RAISE EXCEPTION 'This row is in Trash. Restore it from Trash to edit it.' USING errcode = '55000', hint = 'Open Trash, restore the row, then edit it.';
    END IF;
    UPDATE workbench.udt_dataset_rows SET data = COALESCE(data, '{}'::jsonb) || p_data, updated_at = now()
     WHERE id = p_row_id AND table_id = p_table_id AND deleted_at IS NULL RETURNING * INTO v_row;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'udt_upsert_row: row % not found in table %', p_row_id, p_table_id;
    END IF;
  END IF;
  RETURN to_jsonb(v_row);
END;
$function$;

-- ── public.udt_upsert_cell — an edit of an archived row says it is in Trash
CREATE OR REPLACE FUNCTION public.udt_upsert_cell(p_table_id uuid, p_row_id uuid, p_field_name text, p_value jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller UUID := auth.uid(); v_dataset workbench.udt_datasets%ROWTYPE; v_row workbench.udt_dataset_rows%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'udt_upsert_cell: not authenticated'; END IF;
  SELECT * INTO v_dataset FROM workbench.udt_datasets WHERE id = p_table_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'udt_upsert_cell: table % not found', p_table_id; END IF;
  IF NOT workbench.udt_dataset_access(p_table_id, 'editor') THEN
    RAISE EXCEPTION 'udt_upsert_cell: caller lacks editor permission';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM workbench.udt_dataset_fields WHERE table_id = p_table_id AND field_name = p_field_name AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'udt_upsert_cell: field % not in table %', p_field_name, p_table_id;
  END IF;
  IF EXISTS (SELECT 1 FROM workbench.udt_dataset_rows
              WHERE id = p_row_id AND table_id = p_table_id AND deleted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'This row is in Trash. Restore it from Trash to edit it.' USING errcode = '55000', hint = 'Open Trash, restore the row, then edit it.';
  END IF;
  UPDATE workbench.udt_dataset_rows
     SET data = jsonb_set(
                  COALESCE(data, '{}'::jsonb),
                  ARRAY[p_field_name],
                  -- SQL NULL here would make jsonb_set return NULL for the
                  -- WHOLE document. Clearing a cell means this key becomes
                  -- JSON null; every other field is untouched.
                  COALESCE(p_value, 'null'::jsonb),
                  true
                ),
         updated_at = now()
   WHERE id = p_row_id AND table_id = p_table_id AND deleted_at IS NULL RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'udt_upsert_cell: row % not found in table %', p_row_id, p_table_id; END IF;
  RETURN to_jsonb(v_row);
END;
$function$;

-- ── public.update_data_row_in_user_table — an edit of an archived row says it is in Trash (its own envelope)
CREATE OR REPLACE FUNCTION public.update_data_row_in_user_table(p_row_id uuid, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_result JSONB;
    v_updated BOOLEAN;
    v_data JSONB;
BEGIN
    -- lane OLDER-DOORS-AFTER-SWITCH: the patch MERGES into the row (the cells it names change,
    -- every other cell stays). It used to REPLACE the whole row, so a one-cell patch wiped the
    -- rest (VERIFIER-26, 2026-09-26). A table that moved with its organization's switch refuses
    -- the write in the row guard (workbench._moved_older_table_takes_no_writes) — never a
    -- success line over a table nothing reads.
    IF p_data IS NULL OR jsonb_typeof(p_data) <> 'object' THEN
        RAISE EXCEPTION 'update_data_row_in_user_table: p_data must be an object of the cells to change'
          USING errcode = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM workbench.udt_dataset_rows WHERE id = p_row_id AND deleted_at IS NOT NULL) THEN
        RETURN jsonb_build_object('success', false, 'row_id', p_row_id, 'error', 'This row is in Trash. Restore it from Trash to edit it.');
    END IF;
    UPDATE workbench.udt_dataset_rows
    SET data = COALESCE(data, '{}'::jsonb) || p_data, updated_at = NOW()
    WHERE id = p_row_id AND deleted_at IS NULL
    RETURNING true, data INTO v_updated, v_data;

    IF v_updated THEN
        v_result := jsonb_build_object(
            'success', true,
            'row_id', p_row_id,
            'data', v_data,
            'updated_at', NOW()
        );
    ELSE
        v_result := jsonb_build_object('success', false, 'error', 'Row not found or update failed');
    END IF;

    RETURN v_result;
END;
$function$;

-- ── public.udt_bulk_write — update / merge / cell on an archived row answer row_in_trash
CREATE OR REPLACE FUNCTION public.udt_bulk_write(p_table_id uuid, p_operations jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller UUID := auth.uid(); v_dataset workbench.udt_datasets%ROWTYPE;
  v_op JSONB; v_op_kind TEXT; v_row_id UUID;
  v_result JSONB; v_results JSONB := '[]'::jsonb;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'udt_bulk_write: not authenticated'; END IF;
  SELECT * INTO v_dataset FROM workbench.udt_datasets WHERE id = p_table_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'udt_bulk_write: table % not found', p_table_id; END IF;
  IF NOT workbench.udt_dataset_access(p_table_id, 'editor') THEN
    RAISE EXCEPTION 'udt_bulk_write: caller lacks editor permission';
  END IF;
  IF jsonb_typeof(p_operations) <> 'array' THEN
    RAISE EXCEPTION 'udt_bulk_write: p_operations must be a JSON array';
  END IF;

  FOR v_op IN SELECT * FROM jsonb_array_elements(p_operations) LOOP
    v_op_kind := v_op ->> 'op';
    v_row_id  := NULLIF(v_op ->> 'row_id', '')::uuid;

    IF v_op_kind = 'insert' THEN
      -- An op with no "data" is an empty row, never a NULL row body.
      INSERT INTO workbench.udt_dataset_rows(table_id, data, user_id)
      VALUES (p_table_id, COALESCE(v_op -> 'data', '{}'::jsonb), v_caller)
      RETURNING to_jsonb(workbench.udt_dataset_rows.*) INTO v_result;
      v_results := v_results || jsonb_build_array(v_result);

    ELSIF v_op_kind = 'update' THEN
      -- Refuse rather than silently blanking the row: "update with no data" is
      -- a caller mistake, and quietly emptying every field is the worst
      -- possible reading of it.
      IF v_op -> 'data' IS NULL OR jsonb_typeof(v_op -> 'data') <> 'object' THEN
        RAISE EXCEPTION 'udt_bulk_write: update op for row % needs a "data" object', v_row_id;
      END IF;
      IF EXISTS (SELECT 1 FROM workbench.udt_dataset_rows
                  WHERE id = v_row_id AND table_id = p_table_id AND deleted_at IS NOT NULL) THEN
        -- An archived row is not edited: it says so, and the rest of the batch continues.
        v_results := v_results || jsonb_build_array(jsonb_build_object(
          'error', 'row_in_trash', 'row_id', v_row_id, 'message', 'This row is in Trash. Restore it from Trash to edit it.'));
        CONTINUE;
      END IF;
      UPDATE workbench.udt_dataset_rows
         SET data = v_op -> 'data', updated_at = now()
       WHERE id = v_row_id AND table_id = p_table_id AND deleted_at IS NULL
       RETURNING to_jsonb(workbench.udt_dataset_rows.*) INTO v_result;
      v_results := v_results || jsonb_build_array(
        COALESCE(v_result, jsonb_build_object('error', 'row_not_found', 'row_id', v_row_id))
      );

    ELSIF v_op_kind = 'merge' THEN
      IF EXISTS (SELECT 1 FROM workbench.udt_dataset_rows
                  WHERE id = v_row_id AND table_id = p_table_id AND deleted_at IS NOT NULL) THEN
        -- An archived row is not edited: it says so, and the rest of the batch continues.
        v_results := v_results || jsonb_build_array(jsonb_build_object(
          'error', 'row_in_trash', 'row_id', v_row_id, 'message', 'This row is in Trash. Restore it from Trash to edit it.'));
        CONTINUE;
      END IF;
      UPDATE workbench.udt_dataset_rows
         SET data = COALESCE(data, '{}'::jsonb) || COALESCE(v_op -> 'data', '{}'::jsonb),
             updated_at = now()
       WHERE id = v_row_id AND table_id = p_table_id AND deleted_at IS NULL
       RETURNING to_jsonb(workbench.udt_dataset_rows.*) INTO v_result;
      v_results := v_results || jsonb_build_array(
        COALESCE(v_result, jsonb_build_object('error', 'row_not_found', 'row_id', v_row_id))
      );

    ELSIF v_op_kind = 'cell' THEN
      IF NOT EXISTS (
        SELECT 1 FROM workbench.udt_dataset_fields
         WHERE table_id = p_table_id AND field_name = v_op ->> 'field_name' AND deleted_at IS NULL
      ) THEN
        RAISE EXCEPTION 'udt_bulk_write: cell op references undeclared field % on table %',
          v_op ->> 'field_name', p_table_id;
      END IF;
      IF EXISTS (SELECT 1 FROM workbench.udt_dataset_rows
                  WHERE id = v_row_id AND table_id = p_table_id AND deleted_at IS NOT NULL) THEN
        -- An archived row is not edited: it says so, and the rest of the batch continues.
        v_results := v_results || jsonb_build_array(jsonb_build_object(
          'error', 'row_in_trash', 'row_id', v_row_id, 'message', 'This row is in Trash. Restore it from Trash to edit it.'));
        CONTINUE;
      END IF;
      UPDATE workbench.udt_dataset_rows
         SET data = jsonb_set(
                      COALESCE(data, '{}'::jsonb),
                      ARRAY[v_op ->> 'field_name'],
                      -- SQL NULL would null the WHOLE document, not the key.
                      COALESCE(v_op -> 'value', 'null'::jsonb),
                      true
                    ),
             updated_at = now()
       WHERE id = v_row_id AND table_id = p_table_id AND deleted_at IS NULL
       RETURNING to_jsonb(workbench.udt_dataset_rows.*) INTO v_result;
      v_results := v_results || jsonb_build_array(
        COALESCE(v_result, jsonb_build_object('error', 'row_not_found', 'row_id', v_row_id))
      );

    ELSIF v_op_kind = 'delete' THEN
      -- Delete means archive (2026-09-27): the row is archived, never removed.
      UPDATE workbench.udt_dataset_rows
         SET deleted_at = now(), updated_at = now()
       WHERE id = v_row_id AND table_id = p_table_id AND deleted_at IS NULL
       RETURNING to_jsonb(workbench.udt_dataset_rows.*) INTO v_result;
      v_results := v_results || jsonb_build_array(
        COALESCE(v_result, jsonb_build_object('error', 'row_not_found', 'row_id', v_row_id))
      );

    ELSE
      RAISE EXCEPTION 'udt_bulk_write: unknown op kind %', v_op_kind;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('table_id', p_table_id, 'count', jsonb_array_length(v_results), 'results', v_results);
END;
$function$;

-- ── public._trash_kind_rows — Trash titles an archived Data table row by its words, in its table
CREATE OR REPLACE FUNCTION public._trash_kind_rows(p_uid uuid, p_org uuid, p_member uuid, p_kinds text[], p_limit integer, p_offset integer)
 RETURNS TABLE(artifact_kind text, entity_token text, label text, id uuid, title text, deleted_at timestamp with time zone, organization_id uuid, is_mine boolean, owner_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- lane TRASH-2. The person (personal mode) or the organization (organization mode, gated by the
-- caller) is the filter; there is no per-row access check and no organization-wide walk here.
-- lane TRASH-TABLES: the record store's Tables and Records, after the registry kinds.
-- lane TRASH-COVERAGE-2: a row whose parent is archived (platform.archived_parent_of) is titled
-- "<title> (in <parent>)" — it is listed, never hidden, and its restore brings the parent back first.
-- A scope type's Field (context_item) carries no organization_id; in organization mode its
-- organization is its scope type's.
-- lane TRASH-COVERAGE-2 (second file): the "(in <parent>)" suffix is computed AFTER the page is cut —
-- an outer select over the limited rows — so it costs one parent lookup per LISTED row, never one per
-- candidate row (org_trash_list file for AI Matrx measured 890.7 ms with it inside the sort; ceiling 300).
-- lane TRASH-COVERAGE-2 (third file): Organization Trash reads a table that carries visibility as TWO
-- bounded index walks — the organization's shared rows, and the caller's own personal rows — instead
-- of one walk that filters out every member's personal row (AI Matrx: 75,540 archived personal files,
-- 3 shared; the one walk read all of them to find three).
-- lane STORE-RESTORE-DOORS: five more record-store kinds — a Field, a Rule, a link between Records, a
-- document template and a dashboard, each removed on its own — read through public._trash_store_children
-- (one predicate with the counts) and titled by public._trash_store_title; restored through their own
-- store door (public._trash_store_restore).
declare
  rec record;
  v_rel regclass;
  v_title text;
  v_org text;
  v_cols text;
  v_limit int := least(greatest(coalesce(p_limit, 200), 1), 1000);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_window int;
  v_title_expr text;
  v_parented boolean;
  v_q text;
  v_wrap text;
  v_kind text[];
begin
  if p_uid is null then return; end if;
  v_window := v_limit + v_offset;

  for rec in
    select e.token, e.user_artifact_kind as kind, e.label,
           e.schema_name as sch, e.table_name as tbl,
           coalesce(e.retention_owner_column, 'created_by') as owner_col,
           e.title_column, e.feature_owned_restore
      from platform.entity_types e
     where e.user_artifact_kind is not null
       and e.is_active
       and (p_kinds is null or e.user_artifact_kind = any(p_kinds))
     order by e.user_artifact_kind
  loop
    begin
      v_rel := to_regclass(format('%I.%I', rec.sch, rec.tbl));
      if v_rel is null then continue; end if;

      if rec.token = 'credential_item' and rec.feature_owned_restore then
        -- Vault credentials: the owner's own, only. Organization mode never lists them.
        if p_org is not null then continue; end if;
        return query execute format(
          'select %L::text, %L::text, %L::text, t.id, t.display_name::text,
                  t.deleted_at, t.organization_id, true, t.user_id
             from users.credential_items t
            where t.user_id = $1 and t.deleted_at is not null
            order by t.deleted_at desc, t.id
            limit %s offset %s',
          rec.kind, rec.token, rec.label, v_limit, v_offset)
          using p_uid;
        continue;
      end if;

      v_title := null;
      -- A scope type's own name is its plural label ("Service areas"); its title_column is the slug.
      select a.attname into v_title
        from pg_attribute a
       where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped
         and a.attname = any (array['label_plural', coalesce(rec.title_column, '')])
       order by (a.attname <> 'label_plural')
       limit 1;
      if v_title is null then
        select a.attname into v_title
          from pg_attribute a
         where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped
           and a.attname = any (array['name','title','label','display_name','file_name','folder_name','page_title','subject_value','target_domain','jurisdiction_key','path','code','label_plural','body','description'])
         order by array_position(array['name','title','label','display_name','file_name','folder_name','page_title','subject_value','target_domain','jurisdiction_key','path','code','label_plural','body','description'], a.attname::text)
         limit 1;
      end if;
      v_org := null;
      select a.attname into v_org
        from pg_attribute a
       where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped
         and a.attname = 'organization_id'
       limit 1;

      v_title_expr := case when v_title is null then 'null::text' else format('left(t.%I::text, 200)', v_title) end;
      -- The comment kind's title rule (a suggestion shows its replacement, a comment its body, else the quote).
      if rec.token = 'comment' then v_title_expr := 'left(platform.comment_trash_title(t), 200)'; end if;
      -- A Data table row has no title column: its own words, then the table it sits in.
      if rec.token = 'udt_dataset_rows' then
        v_title_expr := 'left(coalesce(nullif(btrim(coalesce(t.data ->> ''name'', t.data ->> ''title'', custom._first_words(t.data))), ''''), ''Untitled row'')'
          || ' || '' (in '' || coalesce((select nullif(btrim(d.table_name), '''') from workbench.udt_datasets d where d.id = t.table_id), ''a table'') || '')'', 200)';
      end if;
      v_parented := rec.token in ('folder', 'file', 'hr_employment', 'workflow_trigger', 'processed_document')
        or exists (select 1 from platform.soft_delete_edge s
                    where s.child_schema = rec.sch and s.child_table = rec.tbl and s.action = 'cascade');
      v_wrap := null;
      if v_parented then
        v_wrap := format(
          'select y.a, y.b, y.c, y.id, '
          || 'coalesce((select coalesce(nullif(btrim(y.t), ''''), ''Untitled'') || '' (in '' || '
          || 'coalesce(nullif(btrim(ap.parent_title), ''''), ''an archived item'') || '')'' '
          || 'from platform.archived_parent_of(%L, y.id) ap limit 1), y.t), '
          || 'y.d, y.o, y.m, y.w from (%%s) y(a, b, c, id, t, d, o, m, w) order by y.d desc, y.id',
          rec.token);
      end if;

      if rec.token = 'context_item' and p_org is not null then
        v_q := format(
          'select %L::text, %L::text, %L::text, t.id, %s, t.deleted_at, st.organization_id, (t.%I = $1), t.%I
             from context.context_items t
             join context.scope_types st on st.id = t.scope_type_id
            where st.organization_id = $2 and t.deleted_at is not null
              and ($3::uuid is null or t.%I = $3)
            order by t.deleted_at desc, t.id
            limit %s offset %s',
          rec.kind, rec.token, rec.label, v_title_expr, rec.owner_col, rec.owner_col, rec.owner_col,
          v_limit, v_offset);
        if v_wrap is not null then v_q := format(v_wrap, v_q); end if;
        return query execute v_q using p_uid, p_org, p_member;
        continue;
      end if;

      if p_org is not null and v_org is null then continue; end if;

      v_cols := format('%L::text, %L::text, %L::text, t.id, %s, t.deleted_at, %s, (t.%I = $1), t.%I',
        rec.kind, rec.token, rec.label,
        v_title_expr,
        case when v_org is null then 'null::uuid' else format('t.%I', v_org) end,
        rec.owner_col, rec.owner_col);

      if p_org is null then
        -- PERSONAL: what I own, plus what was named to me. Each branch is its own indexed read.
        v_q := format(
          'select * from (
             (select %1$s from %2$I.%3$I t
               where t.%4$I = $1 and t.deleted_at is not null
               order by t.deleted_at desc, t.id limit %5$s)
             union all
             (select %1$s from %2$I.%3$I t
               where t.deleted_at is not null
                 and t.%4$I is distinct from $1
                 and t.id in (select g.resource_id from iam.permissions g
                               where g.granted_to_user_id = $1
                                 and g.resource_type = %6$L
                                 and coalesce(g.status, ''active'') <> ''rejected''
                                 and (g.expires_at is null or g.expires_at > now()))
               order by t.deleted_at desc, t.id limit %5$s)
           ) x
           order by x.deleted_at desc, x.id
           limit %7$s offset %8$s',
          v_cols, rec.sch, rec.tbl, rec.owner_col, v_window, rec.token, v_limit, v_offset);
        if v_wrap is not null then v_q := format(v_wrap, v_q); end if;
        return query execute v_q using p_uid;
      else
        -- ORGANIZATION: this organization's archived rows, optionally one member's. The caller gated it.
        -- A PERSONAL row (visibility = personal) belongs to its owner alone — a member's private
        -- highlight or note never shows in the organization's Trash (verify RC-B11 round 3; access
        -- is personal, Arman 2026-09-23). Its owner still sees it in their own Trash.
        if iam.table_has_visibility(rec.sch, rec.tbl) then
          v_q := format(
            'select * from (
               (select %1$s from %2$I.%3$I t
                 where t.%4$I = $2 and t.deleted_at is not null
                   and ($3::uuid is null or t.%5$I = $3)
                   and t.visibility is distinct from ''personal''
                 order by t.deleted_at desc, t.id limit %8$s)
               union all
               (select %1$s from %2$I.%3$I t
                 where t.%5$I = $1 and t.deleted_at is not null
                   and t.%4$I = $2
                   and ($3::uuid is null or t.%5$I = $3)
                   and t.visibility = ''personal''
                 order by t.deleted_at desc, t.id limit %8$s)
             ) x
             order by x.deleted_at desc, x.id
             limit %6$s offset %7$s',
            v_cols, rec.sch, rec.tbl, v_org, rec.owner_col, v_limit, v_offset, v_window);
        else
          v_q := format(
            'select %1$s from %2$I.%3$I t
              where t.%4$I = $2 and t.deleted_at is not null
                and ($3::uuid is null or t.%5$I = $3)
              order by t.deleted_at desc, t.id
              limit %6$s offset %7$s',
            v_cols, rec.sch, rec.tbl, v_org, rec.owner_col, v_limit, v_offset);
        end if;
        if v_wrap is not null then v_q := format(v_wrap, v_q); end if;
        return query execute v_q using p_uid, p_org, p_member;
      end if;
    exception when undefined_table or undefined_column or insufficient_privilege then continue;
    end;
  end loop;

  -- ── THE RECORD STORE (lane TRASH-TABLES) ────────────────────────────────────────────────────
  -- One physical table (custom.record) holds every Table and Record, so the registry loop above
  -- cannot describe them. Same two modes, same person/organization filter, restored by
  -- custom.record_restore through entity_undelete / org_trash_restore (token `record`).
  -- ── PASSAGE LINKS (annotation trash) ─────────────────────────────────────────────────────────
  -- Only anchored_to associations the person made, removed on their own; personal Trash only (see
  -- the file header). The rest of platform.associations never reaches /trash.
  if p_kinds is null or 'passage_link' = any (p_kinds) then
    return query
    select 'passage_link'::text, 'passage_link'::text, 'Passage link'::text, a.id,
           left(platform.passage_link_trash_title(a), 200),
           a.deleted_at, a.organization_id, (a.created_by = p_uid), a.created_by
      from platform.associations a
     where a.role = 'anchored_to' and a.deleted_at is not null and a.deleted_via_type is null
       and p_org is null and a.created_by = p_uid
     order by a.deleted_at desc, a.id
     limit v_limit offset v_offset;
  end if;

  if to_regclass('custom.record') is null then return; end if;

  if p_kinds is null or 'table' = any (p_kinds) then
    if p_org is null then
      return query
      select 'table'::text, 'record'::text, 'Table'::text, x.id,
             coalesce(nullif(btrim(x.data ->> 'name'), ''), 'Untitled table'),
             x.deleted_at, x.organization_id, (x.created_by = p_uid), x.created_by
        from (
          (select t.id, t.data, t.deleted_at, t.organization_id, t.created_by
             from custom.record t
            where t.created_by = p_uid and t.data_class = 'table' and t.deleted_at is not null
            order by t.deleted_at desc, t.id limit v_window)
          union all
          (select t.id, t.data, t.deleted_at, t.organization_id, t.created_by
             from custom.record t
            where t.data_class = 'table' and t.deleted_at is not null
              and t.created_by is distinct from p_uid
              and t.id in (select g.resource_id from iam.permissions g
                            where g.granted_to_user_id = p_uid
                              and g.resource_type = 'record'
                              and coalesce(g.status, 'active') <> 'rejected'
                              and (g.expires_at is null or g.expires_at > now()))
            order by t.deleted_at desc, t.id limit v_window)
        ) x
       order by x.deleted_at desc, x.id
       limit v_limit offset v_offset;
    else
      return query
      select 'table'::text, 'record'::text, 'Table'::text, t.id,
             coalesce(nullif(btrim(t.data ->> 'name'), ''), 'Untitled table'),
             t.deleted_at, t.organization_id, (t.created_by = p_uid), t.created_by
        from custom.record t
       where t.organization_id = p_org and t.data_class = 'table' and t.deleted_at is not null
         and (p_member is null or t.created_by = p_member)
       order by t.deleted_at desc, t.id
       limit v_limit offset v_offset;
    end if;
  end if;

  if p_kinds is null or 'record' = any (p_kinds) then
    -- A Record archived on its own, while its Table is live. One inside an archived Table comes
    -- back with the Table, so it is not a second Trash row.
    return query
    select 'record'::text, 'record'::text, 'Record'::text, y.id,
           format('%s (in %s)',
                  coalesce(nullif(btrim(custom.record_words(y.organization_id, y.id)), ''), 'Untitled record'),
                  coalesce(nullif(btrim(y.table_name), ''), 'a table')),
           y.deleted_at, y.organization_id, (y.created_by = p_uid), y.created_by
      from (
        select x.id, x.deleted_at, x.organization_id, x.created_by, x.table_name
          from (
            (select r.id, r.deleted_at, r.organization_id, r.created_by, t.data ->> 'name' as table_name
               from custom.record r
               join custom.record t
                 on t.organization_id = r.organization_id and t.id = r.table_id
                and t.data_class = 'table' and t.deleted_at is null
              where p_org is null
                and r.created_by = p_uid and r.data_class = 'record' and r.deleted_at is not null
              order by r.deleted_at desc, r.id limit v_window)
            union all
            (select r.id, r.deleted_at, r.organization_id, r.created_by, t.data ->> 'name'
               from custom.record r
               join custom.record t
                 on t.organization_id = r.organization_id and t.id = r.table_id
                and t.data_class = 'table' and t.deleted_at is null
              where p_org is null
                and r.data_class = 'record' and r.deleted_at is not null
                and r.created_by is distinct from p_uid
                and r.id in (select g.resource_id from iam.permissions g
                              where g.granted_to_user_id = p_uid
                                and g.resource_type = 'record'
                                and coalesce(g.status, 'active') <> 'rejected'
                                and (g.expires_at is null or g.expires_at > now()))
              order by r.deleted_at desc, r.id limit v_window)
            union all
            (select r.id, r.deleted_at, r.organization_id, r.created_by, t.data ->> 'name'
               from custom.record r
               join custom.record t
                 on t.organization_id = r.organization_id and t.id = r.table_id
                and t.data_class = 'table' and t.deleted_at is null
              where p_org is not null
                and r.organization_id = p_org and r.data_class = 'record' and r.deleted_at is not null
                and (p_member is null or r.created_by = p_member)
              order by r.deleted_at desc, r.id limit v_window)
          ) x
         order by x.deleted_at desc, x.id
         limit v_limit offset v_offset
      ) y
     order by y.deleted_at desc, y.id;
  end if;

  -- ── THE STORE'S OWN THINGS, removed on their own (lane STORE-RESTORE-DOORS) ──────────────────
  foreach v_kind slice 1 in array array[['field','Field'],['rule','Rule'],['relation','Link'],['doc_template','Document template'],['dashboard','Dashboard']] loop
    continue when p_kinds is not null and not (v_kind[1] = any (p_kinds));
    return query
    select v_kind[1], 'record'::text, v_kind[2], y.id,
           coalesce(public._trash_store_title(y.organization_id, y.id), 'Untitled'),
           y.deleted_at, y.organization_id, (y.created_by = p_uid), y.created_by
      from (select c.id, c.organization_id, c.deleted_at, c.created_by
              from public._trash_store_children(p_uid, p_org, p_member, v_kind[1], v_window) c
             order by c.deleted_at desc, c.id
             limit v_limit offset v_offset) y
     order by y.deleted_at desc, y.id;
  end loop;
end;
$function$;

-- ── /trash: register archived Data table rows with THE trash registry
UPDATE platform.entity_types
   SET user_artifact_kind = 'dataset_row'
 WHERE token = 'udt_dataset_rows'
   AND user_artifact_kind IS NULL;
