-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- based-on: custom.migrate_merge(uuid, uuid, uuid, text) d627f4e4ae9da1aae39256f0bdd6d834da877d207476a14edc0611ddb79676dd
--
-- DOOR-FIX 2 — T5. A MERGE KEEPS THE LOSER'S VALUES, AND WHAT POINTS AT THE LOSER.
--
-- THE ROOT CAUSE, AND IT IS A CLASS
-- ---------------------------------
-- The merge built the loser's value into the winner's envelope with
--
--     jsonb_set(jsonb_set(v_data, '{_values,<key>}', …, true), '{_values,<key>,alternates'} …)
--
-- and `jsonb_set` CANNOT CREATE AN INTERMEDIATE OBJECT: when the winner's document had no
-- `_values` at all, both calls returned the document unchanged and the alternate vanished —
-- while `values_taken` still counted it. Measured on the main database 2026-09-19: two Chens
-- with different phone numbers, merged, `values_taken: 1`, and the winner's document came back
-- byte-identical, with no alternate and no source. Silent, and counted as success.
--
-- THE FIX: the envelope is BUILT, never poked. `_values` is read (or started), the one key's
-- envelope is read (or started), the alternates list is appended, and the whole thing is put
-- back with `||`. Nothing depends on a path already existing.
--
-- AND THE HALF THAT COULD NOT BE AN ALTERNATE. VAL-1 says an envelope belongs to a DECLARED
-- Field of the table, and `custom.validate_value_envelope` refuses one on a key that is not.
-- So a loser value on an undeclared key cannot become an alternate — and dropping it silently
-- is exactly the defect. It goes into `_retired` with its reason, the same place and the same
-- shape T8's retype already uses for a value that stops applying. Nothing is lost and nothing
-- is invented.
--
-- WHAT POINTS AT THE LOSER NOW POINTS AT THE WINNER. REC-21 says the loser's id resolves to
-- the winner forever, and until now that was true only for a reader that thought to ask
-- `custom.resolve_id`. Every LIVE relation whose target was the loser is retargeted to the
-- winner in the same transaction; one that would become a duplicate of a relation the winner
-- already has is detached instead, because the same edge twice is not a relation. This is also
-- what lets the merge's own delete through now that the delete door honours `restrict`.
--
-- THE READ-BACK. The merge asserts, against the stored document, that every value it says it
-- took is actually there. A merge that reports `values_taken: 1` and wrote nothing is the
-- defect above; it cannot happen again without raising.
--
-- INVERSE: migrations/inverse/doorfix_a_merge_keeps_the_losers_values_down.sql

set lock_timeout = '3s';
set statement_timeout = '5min';

create or replace function custom.migrate_merge(p_organization_id uuid, p_winner_id uuid, p_loser_id uuid, p_note text default null)
returns jsonb
language plpgsql
set search_path to 'pg_catalog'
as $function$
declare
  v_win      custom.record%rowtype;
  v_lose     custom.record%rowtype;
  v_log      uuid;
  v_moved    integer := 0;
  v_alts_n   integer := 0;
  v_copied   integer := 0;
  v_retired_n integer := 0;
  v_retargeted integer := 0;
  v_detached integer := 0;
  v_data     jsonb;
  v_vals     jsonb;
  v_env      jsonb;
  v_alts     jsonb;
  v_retired  jsonb;
  v_key      text;
  v_val      jsonb;
  v_declared text[];
  v_rtype    text;
  v_typefld  text;
  v_after    jsonb;
  v_checked  text[] := '{}';
  a          record;
begin
  -- THE SWITCH. custom.assert_store_door resolves custom/system_enabled and, while it is
  -- false, this store takes writes only from the role that owns custom.record.
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
  -- records and both ids back exactly (T5's last sentence). `unalias` is what
  -- history.migration_undo revokes, so the loser's id stops resolving to the winner.
  v_log := history.migration_record(p_organization_id, 'merge', v_lose.data_class, p_loser_id,
             jsonb_build_object('kind', 'restore', 'record_id', p_loser_id::text,
                                'unalias', p_loser_id::text,
                                'document', v_lose.data),
             coalesce(p_note, format('merged into %s', p_winner_id)));

  -- WHICH KEYS MAY CARRY AN ENVELOPE. VAL-1: a declared Field of the winner's table, chosen
  -- by the winner's own type field where its table has one.
  v_typefld := custom.table_type_field(p_organization_id, v_win.table_id);
  if v_typefld is not null then
    v_rtype := v_win.data ->> v_typefld;
  end if;
  select coalesce(array_agg(f.data ->> 'key'), '{}') into v_declared
    from custom.applicable_fields(p_organization_id, v_win.table_id, v_rtype) f;

  v_data    := v_win.data;
  v_retired := coalesce(v_data -> '_retired', '[]'::jsonb);
  if jsonb_typeof(v_retired) <> 'array' then
    v_retired := '[]'::jsonb;
  end if;

  for v_key, v_val in select * from jsonb_each(v_lose.data) loop
    if left(v_key, 1) = '_' or v_key in ('parent_id') then
      continue;
    end if;

    if not (v_data ? v_key) then
      -- The winner did not hold this at all: it simply moves across.
      v_data := v_data || jsonb_build_object(v_key, v_val);
      v_copied := v_copied + 1;
      v_moved := v_moved + 1;
      v_checked := v_checked || v_key;

    elsif (v_data -> v_key) is distinct from v_val then
      if v_key = any (v_declared) then
        -- T5: the two phone numbers become ALTERNATES inside the winner's one document, each
        -- with its source — never a second record, and never a value quietly overwritten.
        -- BUILT, not poked: jsonb_set cannot create `_values` when it is absent, which is how
        -- this value used to disappear while being counted as taken.
        v_vals := coalesce(v_data -> '_values', '{}'::jsonb);
        if jsonb_typeof(v_vals) <> 'object' then
          v_vals := '{}'::jsonb;
        end if;
        v_env := coalesce(v_vals -> v_key, '{}'::jsonb);
        if jsonb_typeof(v_env) <> 'object' then
          v_env := '{}'::jsonb;
        end if;
        v_alts := coalesce(v_env -> 'alternates', '[]'::jsonb);
        if jsonb_typeof(v_alts) <> 'array' then
          v_alts := '[]'::jsonb;
        end if;
        -- VAL-4: THE RANK IS THE ARRIVAL ORDER, which is the only ordering a merge knows. The
        -- winner's own value is the trusted one and holds no rank; the first record merged in
        -- ranks 1, the next 2. Never a score, never a confidence.
        v_alts := v_alts || jsonb_build_array(jsonb_build_object(
                    'value', v_val,
                    'rank', jsonb_array_length(v_alts) + 1,
                    -- The SOURCE, written as a source. custom.intern_provenance interns it to
                    -- a pointer and files the description in _sources; a caller that wrote the
                    -- pointer itself would be naming something this store owns (VAL-1).
                    'src', jsonb_build_object('kind', 'record', 'id', p_loser_id::text)));
        v_env  := v_env  || jsonb_build_object('alternates', v_alts);
        v_vals := v_vals || jsonb_build_object(v_key, v_env);
        v_data := v_data || jsonb_build_object('_values', v_vals);
        v_alts_n := v_alts_n + 1;
        v_moved := v_moved + 1;
        v_checked := v_checked || v_key;
      else
        -- NOT A DECLARED FIELD OF THIS TABLE, so it cannot carry an envelope (VAL-1) and
        -- cannot become an alternate. It is kept with its reason rather than dropped.
        v_retired := v_retired || jsonb_build_object(
          'key', v_key,
          'value', v_val,
          'envelope', v_lose.data -> '_values' -> v_key,
          'reason', format('merged from record %s; "%s" is not a declared field of this table, so its other value is kept here rather than as an alternate (VAL-1)', p_loser_id, v_key),
          'at', to_jsonb(now()));
        v_retired_n := v_retired_n + 1;
        v_moved := v_moved + 1;
      end if;
    end if;
  end loop;

  if jsonb_array_length(v_retired) > 0 then
    v_data := v_data || jsonb_build_object('_retired', v_retired);
  end if;

  perform custom.record_update(p_organization_id, p_winner_id, v_data);

  -- THE READ-BACK. A merge that says it took a value and wrote nothing is the exact defect
  -- this file exists to close, so it is asserted against the stored document rather than
  -- trusted.
  select r.data into v_after from custom.record r
   where r.organization_id = p_organization_id and r.id = p_winner_id;
  foreach v_key in array v_checked loop
    if not (v_after ? v_key) then
      raise exception 'The merge says it took "%" from the other record and the winner does not hold it. Nothing was merged.', v_key
        using errcode = '23514',
              hint = 'T5 / VAL-4: a value taken in a merge is in the winner''s one document — as the value itself, or as a ranked alternate with its source.';
    end if;
  end loop;
  foreach v_key in array v_checked loop
    if (v_win.data ? v_key) and (v_win.data -> v_key) is distinct from (v_lose.data -> v_key)
       and (v_lose.data ? v_key)
       and v_key = any (v_declared)
       and not exists (select 1 from jsonb_array_elements(
                         coalesce(v_after -> '_values' -> v_key -> 'alternates', '[]'::jsonb)) x
                        where x -> 'value' = v_lose.data -> v_key) then
      raise exception 'The merge says "%" had another value on the other record and the winner carries no alternate for it. Nothing was merged.', v_key
        using errcode = '23514',
              hint = 'T5 / VAL-4: the losing value is kept as a ranked alternate with its source, never overwritten and never dropped.';
    end if;
  end loop;

  -- Everything the loser contained now hangs off the winner, or the merge would orphan it —
  -- and, since the delete door honours containment, would take it with the loser.
  update custom.record r
     set data = r.data || jsonb_build_object('parent_id', p_winner_id::text)
   where r.organization_id = p_organization_id
     and r.deleted_at is null
     and nullif(r.data ->> 'parent_id', '')::uuid = p_loser_id;

  -- WHAT POINTED AT THE LOSER POINTS AT THE WINNER. REC-21's "forever" for relations, not
  -- only for readers who remember to resolve the id.
  for a in
    select x.id, x.source_type, x.source_id, x.role
      from platform.associations x
     where x.organization_id = p_organization_id
       and x.target_id = p_loser_id and x.deleted_at is null
  loop
    if exists (select 1 from platform.associations y
                where y.source_type = a.source_type and y.source_id = a.source_id
                  and y.target_id = p_winner_id and y.role is not distinct from a.role
                  and y.id <> a.id) then
      update platform.associations set deleted_at = now() where id = a.id;
      v_detached := v_detached + 1;
    else
      update platform.associations set target_id = p_winner_id where id = a.id;
      v_retargeted := v_retargeted + 1;
    end if;
  end loop;

  -- REC-21: FOREVER. The alias goes in BEFORE the loser is deleted, so there is no instant in
  -- which the id resolves to nothing. `revoked_at` is cleared, because an id merged again
  -- after an undo resolves again.
  insert into custom.record_alias (organization_id, old_id, new_id, verb, reason, migration_id)
  values (p_organization_id, p_loser_id, p_winner_id, 'merge',
          coalesce(p_note, 'merged'), v_log)
  on conflict (organization_id, old_id) do update
        set new_id = excluded.new_id, verb = excluded.verb,
            reason = excluded.reason, migration_id = excluded.migration_id,
            revoked_at = null;

  perform custom.record_delete(p_organization_id, p_loser_id);

  return jsonb_build_object('verb', 'merge', 'winner', p_winner_id, 'loser', p_loser_id,
                            'migration_id', v_log, 'values_taken', v_moved,
                            'values_copied', v_copied, 'alternates_added', v_alts_n,
                            'values_retired', v_retired_n,
                            'relations_retargeted', v_retargeted,
                            'relations_detached_as_duplicates', v_detached,
                            'resolves_to', custom.resolve_id(p_organization_id, p_loser_id),
                            'at', now());
end;
$function$;
