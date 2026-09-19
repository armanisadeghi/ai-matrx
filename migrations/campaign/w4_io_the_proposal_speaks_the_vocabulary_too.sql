-- chair-step: replaces custom.io_proposal_accept, the fourth body stamping `_actor` with a word the store's closed actor vocabulary does not hold, so accepting a field proposal was refused at the write door; a replacement is judged by the allow-list, so the sanctioned route is a terminal-confirmed step
-- based-on: custom.io_proposal_accept(uuid, uuid, text, text, text) 22654883707966e1c9899a89b6b4731c5505990faf3f0e942defa914b06f4faf
--
-- W4-IO, file 11 — THE SAME CLOSED VOCABULARY, THE FOURTH CALLER.
--
-- File 10 fixed three bodies and the green suite moved one part further and found the fourth:
-- accepting a DOOR-14 proposal mints the Field through `custom.record_write`, and it too said
-- `_actor: import`. `custom.actor_vocabulary()` is `{user, agent, system}`.
--
-- THE CENSUS, so this is the last of them rather than the next one. Every `_actor` literal this
-- seat wrote, with what it is now:
--     custom.io_import_rows       system   (file 10)
--     custom.anon_clear           system   (file 10)
--     custom.anon_capture         user     (file 10)
--     custom.io_proposal_accept   system   (this file)
-- and nothing else in `custom.io_*` or `custom.anon_*` writes `_actor` at all — checked against
-- `pg_proc.prosrc`, not against memory.
--
-- The Field records where the proposal came from is still on the Field itself, in `source`
-- (`import_proposal`) and `source_config` (the run and the column), which is where "where did
-- this come from" belongs. `_actor` answers who authored the value, and the platform did.
--
-- THE INVERSE: `migrations/inverse/w4_io_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '600s';

CREATE OR REPLACE FUNCTION custom.io_proposal_accept(p_organization_id uuid, p_import_id uuid, p_column text, p_type text DEFAULT NULL::text, p_label text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_run      custom.io_import;
  v_proposal jsonb;
  v_type     text;
  v_key      text;
  v_field_id uuid;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.io_proposal_accept');
  select * into v_run from custom.io_import
   where organization_id = p_organization_id and id = p_import_id and deleted_at is null;
  if not found then
    raise exception 'custom.io_proposal_accept: no import run % for this organization', p_import_id
      using errcode = '23503';
  end if;

  select p into v_proposal
    from jsonb_array_elements(v_run.proposals) p
   where p ->> 'column' = p_column
   limit 1;
  if v_proposal is null then
    raise exception 'custom.io_proposal_accept: import run % proposed no column "%". Its proposals are %.',
      p_import_id, p_column, coalesce((select string_agg(p ->> 'column', ', ')
                                         from jsonb_array_elements(v_run.proposals) p), '(none)')
      using errcode = '23503';
  end if;
  if v_proposal ->> 'state' = 'accepted' then
    raise exception 'custom.io_proposal_accept: "%" was already accepted on this run. Accepting twice would mint a second Field with the same key.', p_column
      using errcode = '23505';
  end if;

  v_type := coalesce(nullif(btrim(coalesce(p_type, '')), ''), v_proposal ->> 'inferred_type', 'text');
  -- The key is the column's own name, lowered and de-spaced, because that is what the next
  -- import of the same file will match on without anyone authoring a mapping.
  v_key := regexp_replace(lower(btrim(p_column)), '[^a-z0-9]+', '_', 'g');
  v_key := btrim(v_key, '_');
  if v_key = '' then
    raise exception 'custom.io_proposal_accept: column "%" leaves no usable Field key', p_column
      using errcode = '22023';
  end if;

  -- THE SAME DOOR A HAND-MADE FIELD GOES THROUGH. An accepted proposal is a Field, not a
  -- second kind of Field, so nothing downstream ever has to ask where a Field came from.
  v_field_id := custom.record_write(
    p_organization_id, custom.field_kernel_id(),
    jsonb_build_object('key', v_key,
                       'label', coalesce(nullif(btrim(coalesce(p_label, '')), ''), btrim(p_column)),
                       'type', v_type,
                       'table_token', (select t.data ->> 'token' from custom.record t
                                        where t.organization_id = p_organization_id
                                          and t.id = v_run.table_id),
                       'source', 'import_proposal',
                       'source_config', jsonb_build_object('import_id', p_import_id,
                                                           'source_column', p_column),
                       '_actor', 'system'));

  update custom.io_import
     set proposals = (select jsonb_agg(case when p ->> 'column' = p_column
                                            then p || jsonb_build_object('state', 'accepted',
                                                                         'field_id', v_field_id)
                                            else p end)
                        from jsonb_array_elements(proposals) p),
         mapping   = mapping || jsonb_build_object(p_column, v_key)
   where organization_id = p_organization_id and id = p_import_id;

  return v_field_id;
end;
$function$;

revoke all on all tables in schema custom from public, anon, authenticated, service_role;
revoke all on all functions in schema custom from public, anon, authenticated, service_role;
