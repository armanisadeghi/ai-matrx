-- INVERSE of migrations/campaign/import_every_row_says_what_happened_to_it.sql (lane IMPORT).
--
-- It puts `custom.io_import_rows` back to the LIVE bytes it had before that file ran (read out
-- of the catalogue at 2026-09-20, not retyped) and drops the six functions the file added,
-- with their door rows.
--
-- RUN IT ONLY AFTER `import_a_file_lands_once_down.sql` HAS NOT YET RUN, or with it, in that
-- order: the restored `io_import_rows` reads none of the new columns, but `io_import_finish`
-- and the report doors do, so they go first.
--
-- WHAT IT DOES NOT UNDO, AND SAYS SO: the records any import wrote, the columns any finish
-- declared, and the approvals any finish filed. Those went through the store's own doors and
-- are the store's now — `custom.record_delete`, `custom.field_retire` and
-- `custom.work_approval_decide` are how a person undoes each of them, one deliberate act at a
-- time. A migration that deleted a person's imported records to tidy up after itself would be
-- the destructive thing this campaign never does.

begin;

drop function if exists custom.io_import_finish(uuid, uuid, text);
drop function if exists custom.io_import_report(uuid, uuid, text, integer, integer);
drop function if exists custom.io_imports(uuid, uuid, integer);
drop function if exists custom.io_import_forget(uuid, uuid);
drop function if exists custom.io_proposal_spec(jsonb);
drop function if exists custom.io_cell(uuid, jsonb, text, text);

delete from platform.client_callable_door
 where schema_name = 'custom'
   and function_name in ('io_import_finish', 'io_import_report', 'io_imports', 'io_import_forget');

CREATE OR REPLACE FUNCTION custom.io_import_rows(p_organization_id uuid, p_import_id uuid, p_rows jsonb, p_mapping jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_run       custom.io_import;
  v_row       jsonb;
  v_doc       jsonb;
  v_key       text;
  v_val       jsonb;
  v_mapped    text;
  v_seen      integer := 0;
  v_written   integer := 0;
  v_refusals  jsonb := '[]'::jsonb;
  v_unmapped  jsonb := '{}'::jsonb;
  v_proposals jsonb := '[]'::jsonb;
  v_fields    text[];
  v_id        uuid;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.io_import_rows');
  perform custom.assert_store_door(p_organization_id, 'custom.io_import_rows');
  select * into v_run from custom.io_import
   where organization_id = p_organization_id and id = p_import_id and deleted_at is null;
  if not found then
    raise exception 'custom.io_import_rows: no open import run % for this organization', p_import_id
      using errcode = '23503';
  end if;

  select coalesce(array_agg(f.key), array[]::text[]) into v_fields
    from custom.field f where f.organization_id = p_organization_id;

  for v_row in select value from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    v_seen := v_seen + 1;
    v_doc := '{}'::jsonb;
    for v_key, v_val in select key, value from jsonb_each(v_row) loop
      -- The mapping is authored (a person chose), or it is the identity (the header already
      -- spells a Field key). Both are the same row here: a mapped column is a mapped column.
      v_mapped := coalesce(p_mapping ->> v_key, v_run.mapping ->> v_key,
                           case when v_key = any (v_fields) then v_key else null end);
      if v_mapped is null then
        -- DOOR-14: not an error, an OFFER. Remember it with a sample so the proposal can say
        -- what the column actually looked like rather than merely that it existed.
        v_unmapped := v_unmapped || jsonb_build_object(
          v_key, coalesce(v_unmapped -> v_key, '[]'::jsonb) ||
                 case when jsonb_array_length(coalesce(v_unmapped -> v_key, '[]'::jsonb)) < 5
                      then jsonb_build_array(v_val) else '[]'::jsonb end);
      else
        v_doc := v_doc || jsonb_build_object(v_mapped, v_val);
      end if;
    end loop;

    begin
      -- THE ONE WRITE DOOR. Validation, the value envelope, provenance, the rules and the
      -- outbox all hang off this call; an INSERT here would skip every one of them.
      v_id := custom.record_write(p_organization_id, v_run.table_id,
                                  v_doc || jsonb_build_object('_actor', 'system'));
      v_written := v_written + 1;
    exception when others then
      -- A refusal is RECORDED, never swallowed and never fatal to the run. An import that
      -- half worked must be able to say which half, by row number and by reason.
      v_refusals := v_refusals || jsonb_build_array(
        jsonb_build_object('row', v_seen, 'sqlstate', sqlstate, 'reason', sqlerrm));
    end;
  end loop;

  -- The proposals, built once at the end from everything the run saw.
  select coalesce(jsonb_agg(jsonb_build_object(
           'column', u.key,
           'samples', u.value,
           'inferred_type', custom.io_infer_type(u.value),
           'state', 'proposed')), '[]'::jsonb)
    into v_proposals
    from jsonb_each(v_unmapped) u;

  update custom.io_import
     set rows_seen    = rows_seen + v_seen,
         rows_written = rows_written + v_written,
         refusals     = refusals || v_refusals,
         proposals    = case when v_proposals = '[]'::jsonb then proposals else v_proposals end,
         mapping      = mapping || coalesce(p_mapping, '{}'::jsonb),
         state        = 'written'
   where organization_id = p_organization_id and id = p_import_id;

  return jsonb_build_object('import_id', p_import_id, 'rows_seen', v_seen,
                            'rows_written', v_written, 'refusals', v_refusals,
                            'proposals', v_proposals);
end;
$function$

;

commit;
