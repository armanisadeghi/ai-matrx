-- chair-step: the INVERSE of storetails3_an_undo_counts_what_came_back_with_it.sql. Puts
--   `history.migration_undo` back to the exact body that file was written against (the count of
--   `also` rows the loop itself restored).
-- lock: custom
-- lane: STORE-TAILS-3
-- based-on: history.migration_undo(uuid, uuid) ca62c23a1799964a2df75356f72c275b841d9f9c27fd50460e5e80c018551819

set local lock_timeout = '30s';
set local statement_timeout = '120s';

CREATE OR REPLACE FUNCTION history.migration_undo(p_organization_id uuid, p_log_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  m        history.migration_log%rowtype;
  v_kind   text;
  v_target uuid;
  v_patch  jsonb;
  v_ver    integer;
  v_also   uuid;
  v_back   integer := 0;
  v_unalias uuid;
  v_revoked integer := 0;
  v_back_tbl uuid;
begin
  -- THE SWITCH, READ HERE. This function lives in `history`, not in `custom`, so it is not
  -- covered by the schema's own closed-door posture and says out loud which knob holds it off:
  -- while custom/system_enabled resolves false for this organization the record store takes
  -- writes only from the role that owns custom.record, and an undo is a write.
  if not custom.store_is_open(p_organization_id) then
    perform custom.assert_store_door(p_organization_id, 'history.migration_log');
  end if;

  select * into m from history.migration_log l
   where l.organization_id = p_organization_id and l.id = p_log_id;
  if m.id is null then
    raise exception 'There is no Migration % on the record for this organization.', p_log_id
      using errcode = '02000';
  end if;
  if m.undone_at is not null then
    raise exception 'That Migration was already undone, on %.', m.undone_at
      using errcode = '22023',
            hint = 'HIS-8: undoing it twice would apply the same inverse to values that are already back. Nothing was changed. The undo itself is on the record too, so you can see what it did.';
  end if;

  -- MERGE-HISTORY: THE UNDO SAYS ITS OWN NAME. Every other compound verb is stamped through
  -- `history.migration_record`, because HIS-8 makes it record its inverse before it writes.
  -- An undo records none — it IS the inverse — so it marks the statement itself, and the
  -- versions it writes read "undo of merge" instead of "UPDATE" and "RESTORE".
  if coalesce(nullif(current_setting('history.mark_at', true), ''), '') <> statement_timestamp()::text then
    perform set_config('history.mark_at',   statement_timestamp()::text, true);
    perform set_config('history.mark_id',   p_log_id::text,              true);
    perform set_config('history.mark_verb', 'undo of ' || m.verb,        true);
  end if;

  v_kind   := m.inverse ->> 'kind';
  v_target := coalesce(nullif(m.inverse ->> 'record_id', '')::uuid, m.target_id);

  if v_kind = 'none' then
    raise exception 'The Migration "%" cannot be undone, and said so when it ran.', m.verb
      using errcode = '0A000',
            hint = format('HIS-8: it was recorded as one-way deliberately. What it did is still fully on the record — %s — so the state before it is readable even though it cannot be put back automatically.', coalesce(m.note, 'see the Migration log entry'));
  end if;

  -- THE SAME WRITE PATH, and that is the law rather than a convenience.
  if v_kind = 'restore' then
    perform custom.record_restore(p_organization_id, v_target);
    -- EVERYTHING THE DELETE TOOK WITH IT. A delete that cascaded and an undo that put one
    -- record back is not an undo; it is a smaller version of the same data loss.
    for v_also in select (x #>> '{}')::uuid
                    from jsonb_array_elements(coalesce(m.inverse -> 'also', '[]'::jsonb)) x loop
      if exists (select 1 from custom.record r
                  where r.organization_id = p_organization_id and r.id = v_also
                    and r.deleted_at is not null) then
        perform custom.record_restore(p_organization_id, v_also);
        v_back := v_back + 1;
      end if;
    end loop;
  else
    v_patch := m.inverse -> 'patch';
    if v_patch is null or jsonb_typeof(v_patch) <> 'object' then
      raise exception 'The undo stored for "%" says it is a patch and carries none.', m.verb
        using errcode = '22023', hint = 'HIS-8: nothing was changed.';
    end if;
    -- ── SEAT-SUITES, 2026-09-19: A RETYPE COULD BE LOGGED AND NEVER UNDONE. ───────────
    -- `custom.migrate_retype` moves a record to another Table and records an inverse that
    -- ALREADY carries the Table it came from (`inverse.table_id`) together with the whole
    -- document, misfit values and all. This function read the patch and ignored the table —
    -- so the undo tried to write `phone` back onto a record still sitting on a Table that has
    -- no `phone`, and `custom.validate_value_envelope` refused it by name. Measured from the
    -- seat `authenticated` on the main database on 2026-09-19: "This record carries where
    -- "phone" came from, and this table has no field called "phone"." Every retype in the
    -- system was therefore recorded as reversible and was not: the misfit values a person was
    -- promised were "in History, neither coerced nor deleted" could never come back.
    --
    -- THE RECORD GOES BACK TO ITS TABLE FIRST, and the patch then lands on a Table that has
    -- the columns it names. Nothing else changes: an inverse without `table_id` — which is
    -- every other verb, and every retype logged before this — behaves exactly as before.
    v_back_tbl := nullif(m.inverse ->> 'table_id', '')::uuid;
    if v_back_tbl is not null then
      update custom.record r
         set table_id = v_back_tbl
       where r.organization_id = p_organization_id
         and r.id = v_target
         and r.table_id is distinct from v_back_tbl;
    end if;
    v_ver := custom.record_update(p_organization_id, v_target, v_patch);
  end if;

  -- THE ID HAS TO STOP RESOLVING (T5). A merge sends the loser's id to the winner forever;
  -- undoing the merge puts the loser back, and an id still pointing at the winner lands every
  -- relation to the restored record on the WRONG record. The alias is revoked rather than
  -- deleted: the merge happened, and the record of it stays.
  v_unalias := nullif(m.inverse ->> 'unalias', '')::uuid;
  if v_unalias is not null then
    update custom.record_alias a
       set revoked_at = now()
     where a.organization_id = p_organization_id and a.old_id = v_unalias
       and a.revoked_at is null;
    get diagnostics v_revoked = row_count;
    if v_revoked = 0 then
      raise exception 'The undo of "%" says the id % must stop resolving, and there is no live alias for it. Nothing here is half done — the restore above is in this same transaction and goes back with this refusal.', m.verb, v_unalias
        using errcode = '02000',
              hint = 'HIS-8 / T5: an undo that could not put the id back would leave every relation to the restored record pointing at the record it was merged into.';
    end if;
  end if;

  update history.migration_log l
     set undone_at = now(),
         undone_by = coalesce(nullif(current_setting('app.user_id', true), '')::uuid, (select auth.uid()))
   where l.organization_id = p_organization_id and l.id = p_log_id;

  return jsonb_build_object('undone', p_log_id, 'verb', m.verb, 'kind', v_kind,
                            'record_id', v_target, 'version_after', v_ver,
                            'also_restored', v_back, 'ids_unaliased', v_revoked, 'at', now());
end;
$function$;

