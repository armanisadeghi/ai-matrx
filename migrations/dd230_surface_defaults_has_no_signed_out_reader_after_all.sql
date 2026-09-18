-- dd230_surface_defaults_has_no_signed_out_reader_after_all
-- (DD-230. db-rules §0/§6d/§9. GRANTS ONLY — no DDL, no policy, no row touched.)
--
-- `tool.surface_defaults` was the ONE relation DD-230 bounded rather than closed on the strength of
-- a reader it had not finished testing. Its row said: "the chrome-extension tool-drift guards read
-- it with the PUBLISHABLE key — 18 anon 200s in 24 h, every one these four columns — NOTE for the
-- next lane: those two guards should read with the service key, and when they do this bound goes to
-- zero." V-100 went and ran the guards instead of reading them, and the note was wrong in a better
-- way: NEITHER guard has a working anonymous path today, so the four columns protect nothing and
-- nothing has to change in either peer repo first.
--
-- ═══ MEASURED, over HTTPS with the publishable key and no Authorization header ════════════════
--   matrx-local  scripts/check_tool_db_drift.py
--     its surface_defaults read asks for `is_active`, which is NOT in the four-column bound:
--       surface_defaults?select=surface_name,always_include_tools,never_include_tools,is_active
--         -> 401 42501
--     and that is not even the first failure: its FIRST read, with raise_for_status() and no
--     fallback, is
--       binding?select=tool_id,executor_name,is_active  -> 401 42501
--     (`tool.binding` was closed to anon by an earlier lane, before DD-230.)
--   matrx-extend  scripts/check-tool-db-drift.ts
--     its surface_defaults read asks for exactly the four granted columns and DOES answer 200 with
--     two rows — but it is issued inside the same `Promise.all` as fetchOwnedTools(), whose
--     `tool.binding` read 401s, so the whole `try` throws and the script falls through to its
--     Supabase Management API path every single time (check-tool-db-drift.ts:356-373).
--
-- So the 18 anonymous 200s a day are a read whose own caller throws the answer away. A door held
-- open for a caller that cannot walk through it is just a door. The safe path beside the unsafe one
-- was never the fix: this closes it.
--
-- After this file `tool.surface_defaults` holds ZERO anon columns and is ABSENT from
-- ANON_COLUMN_SURFACE — an absent relation is the guard's own RED for a re-grant, because
-- `check:anon-column-surface` fails on an UNDECLARED live relation. Its PUBLIC_EXPOSURE_ALLOWED row
-- goes with it: the `ref_select` policy still reaches `anon`, and now grants nothing.
--
-- If either peer guard is ever repaired to a working publishable-key path, that is a publishing
-- decision with its own register row — and the right repair is the SERVICE key, which is what both
-- of those guards already prefer everywhere else.

do $$
declare
  r        record;
  v_col    record;
  v_before int;
  v_total  int;
  v_auth0  int;
  v_auth   int;
  v_after  int;
  v_names  text;
begin
  for r in
    select unnest(array[
      'tool.surface_defaults'
    ]) as rel
  loop
    select count(*) filter (where has_column_privilege('anon', a.attrelid, a.attnum, 'SELECT')),
           count(*),
           count(*) filter (where has_column_privilege('authenticated', a.attrelid, a.attnum, 'SELECT')),
           string_agg(a.attname, ', ' order by a.attnum)
             filter (where has_column_privilege('anon', a.attrelid, a.attnum, 'SELECT'))
      into v_before, v_total, v_auth0, v_names
      from pg_attribute a
     where a.attrelid = r.rel::regclass and a.attnum > 0 and not a.attisdropped;

    for v_col in
      select a.attname
        from pg_attribute a
       where a.attrelid = r.rel::regclass and a.attnum > 0 and not a.attisdropped
         and has_column_privilege('anon', a.attrelid, a.attnum, 'SELECT')
       order by a.attnum
    loop
      execute format('revoke select (%I) on %s from anon', v_col.attname, r.rel);
    end loop;
    execute format('revoke select on %s from anon', r.rel);

    select count(*) filter (where has_column_privilege('anon', a.attrelid, a.attnum, 'SELECT')),
           count(*) filter (where has_column_privilege('authenticated', a.attrelid, a.attnum, 'SELECT'))
      into v_after, v_auth
      from pg_attribute a
     where a.attrelid = r.rel::regclass and a.attnum > 0 and not a.attisdropped;

    if v_after <> 0 then
      raise exception 'dd230: anon still holds SELECT on % column(s) of %. The point of this file is '
                      'that the number is zero.', v_after, r.rel;
    end if;
    if has_table_privilege('anon', r.rel::regclass, 'SELECT') then
      raise exception 'dd230: anon still holds a table-level SELECT on %.', r.rel;
    end if;
    if v_auth <> v_auth0 then
      raise exception 'dd230: authenticated SELECT on % moved from % to % column(s). This file may '
                      'only close the signed-out door.', r.rel, v_auth0, v_auth;
    end if;

    raise notice 'dd230: % closed to anon — % of % columns revoked (%), authenticated keeps % (unchanged).',
                 r.rel, v_before, v_total, coalesce(v_names, '(none)'), v_auth;
  end loop;
end $$;
