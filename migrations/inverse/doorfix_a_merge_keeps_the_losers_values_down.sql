-- chair-step: DOOR-FIX 2's inverse — custom.migrate_merge exactly as it stood before DOOR-FIX 2.

CREATE OR REPLACE FUNCTION custom.migrate_merge(p_organization_id uuid, p_winner_id uuid, p_loser_id uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_win  custom.record%rowtype;
  v_lose custom.record%rowtype;
  v_log  uuid;
  v_moved integer := 0;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.migrate_merge');

  if p_winner_id = p_loser_id then
    raise exception 'A record cannot be merged into itself.'
      using errcode = '22023', hint = 'REC-21: nothing was changed.';
  end if;

  select * into v_win  from custom.record r
   where r.organization_id = p_organization_id and r.id = p_winner_id and r.deleted_at is null;
  select * into v_lose from custom.record r
   where r.organization_id = p_organization_id and r.id = p_loser_id and r.deleted_at is null;
  if v_win.id is null or v_lose.id is null then
    raise exception 'Both records have to be here to merge them, and % is not.',
                    coalesce(case when v_win.id is null then p_winner_id else p_loser_id end)
      using errcode = '02000';
  end if;

  -- THE INVERSE, BEFORE ANYTHING MOVES: the loser's whole document, so undo can put both
  -- records and both ids back exactly (T5's last sentence).
  v_log := history.migration_record(p_organization_id, 'merge', v_lose.data_class, p_loser_id,
             jsonb_build_object('kind', 'restore', 'record_id', p_loser_id::text,
                                'unalias', p_loser_id::text,
                                'document', v_lose.data),
             coalesce(p_note, format('merged into %s', p_winner_id)));

  -- T5: the two phone numbers become ALTERNATES inside the winner's one document, each with
  -- its source — never a second record, and never a value quietly overwritten.
  declare
    v_data jsonb := v_win.data;
    v_key  text;
    v_val  jsonb;
    v_alts jsonb;
  begin
    for v_key, v_val in select * from jsonb_each(v_lose.data) loop
      if left(v_key, 1) = '_' or v_key in ('parent_id') then
        continue;
      end if;
      if not (v_data ? v_key) then
        v_data := v_data || jsonb_build_object(v_key, v_val);
        v_moved := v_moved + 1;
      elsif (v_data -> v_key) is distinct from v_val then
        v_alts := coalesce(v_data -> '_values' -> v_key -> 'alternates', '[]'::jsonb);
        -- VAL-4: THE RANK IS THE ARRIVAL ORDER, which is the only ordering a merge knows.
        -- The winner's own value is the trusted one and holds no rank; the first record
        -- merged in ranks 1, the next 2. Never a score, never a confidence.
        v_alts := v_alts || jsonb_build_array(jsonb_build_object(
                    'value', v_val,
                    'rank', jsonb_array_length(v_alts) + 1,
                    -- The SOURCE, written as a source. custom.intern_provenance interns it to
                    -- a pointer and files the description in _sources; a caller that wrote the
                    -- pointer itself would be naming something this store owns (VAL-1).
                    'src', jsonb_build_object('kind', 'record', 'id', p_loser_id::text)));
        v_data := jsonb_set(
                    jsonb_set(v_data, array['_values', v_key],
                              coalesce(v_data -> '_values' -> v_key, '{}'::jsonb), true),
                    array['_values', v_key, 'alternates'], v_alts, true);
        v_moved := v_moved + 1;
      end if;
    end loop;
    perform custom.record_update(p_organization_id, p_winner_id, v_data);
  end;

  -- Everything the loser contained now hangs off the winner, or the merge would orphan it.
  update custom.record r
     set data = r.data || jsonb_build_object('parent_id', p_winner_id::text)
   where r.organization_id = p_organization_id
     and r.deleted_at is null
     and nullif(r.data ->> 'parent_id', '')::uuid = p_loser_id;

  -- REC-21: FOREVER. The alias goes in BEFORE the loser is deleted, so there is no instant in
  -- which the id resolves to nothing.
  insert into custom.record_alias (organization_id, old_id, new_id, verb, reason, migration_id)
  values (p_organization_id, p_loser_id, p_winner_id, 'merge',
          coalesce(p_note, 'merged'), v_log)
  on conflict (organization_id, old_id) do update
        set new_id = excluded.new_id, verb = excluded.verb,
            reason = excluded.reason, migration_id = excluded.migration_id;

  perform custom.record_delete(p_organization_id, p_loser_id);

  return jsonb_build_object('verb', 'merge', 'winner', p_winner_id, 'loser', p_loser_id,
                            'migration_id', v_log, 'values_taken', v_moved,
                            'resolves_to', custom.resolve_id(p_organization_id, p_loser_id),
                            'at', now());
end;
$function$

;
