-- draft: VISION-REACH clone proof pending
-- target: branch,production
-- additive: yes
--   It ADDS three functions — custom.relation_name_key(text), custom._relation_names_resolve(uuid,
--   uuid, text[]) (EXECUTE to postgres only, as the store's event trigger leaves every new custom
--   function) and the client door custom.relation_names_match(uuid, uuid, text[]) (declared in
--   platform.client_callable_door, EXECUTE to authenticated) — and REPLACES three bodies, each
--   declared below with the body it was written against. No table, column, trigger, policy or row
--   of anybody's data is touched. Locks: pg_proc row locks and one platform.client_callable_door row.
--   Inverse: migrations/inverse/visionreach_g1_a_relation_is_filled_by_its_name_down.sql
-- guard: custom/system_enabled
-- lock: custom
-- lane: VISION-REACH
-- based-on: custom.io_cell(uuid, jsonb, text, text) fab2a3310f2ce891eb467562a6e45b27b7ff4e688d7bb5a12938768281d625c3
-- based-on: custom._relation_kernel_targets() d046862424fe068a616a06cb55b74ca10ab64145ddda9f25fd2644e3f039cc0f
-- based-on: custom._io_declare_unmapped(uuid, uuid, jsonb, jsonb) fa91d89861160db025f4c0013d5f36aa04cea472245dadcd571503687efd8b53
--
-- LANE 5 VISION-REACH, G1 + G4 — A RELATION IS FILLED FROM THE NAME OF THE RECORD IT POINTS AT.
--
-- THE DEFECT (the sitting dry run, 2026-10-02, stop 9): a clinic's 200-visit export named every
-- patient and every referring physician by name, and every one of them matched a record exactly —
-- yet import and paste refused all 200 ("points at another record, so it is chosen rather than
-- typed"), leaving 264 hand picks. Measured on the clone the same day:
--   · custom.io_cell DID resolve a name for an import, but only byte-exactly ("dr. marisol
--     gutierrez" matched nothing) and a column allowing several records took the whole cell as
--     one name;
--   · every OTHER door — the grid's paste (custom.record_change_many), the records agent tool,
--     the table API and the MCP (custom.record_write / custom.record_update) — refused a name
--     outright, because nothing between the writer and custom.validate_values turned it into the
--     record; and no door let a screen ask "which record is this name?" before writing.
-- ONE CLASS: a relation value given as the name a person reads, with no shared matcher.
--
-- THE FIX: ONE matcher (custom._relation_names_resolve: the target's name column, case and
-- spacing ignored through custom.relation_name_key, only records the writer may see), used by
-- the import cell (custom.io_cell), by the write trigger every door passes through
-- (custom._relation_kernel_targets, which already turned a member's user id into a Person record
-- the same way) and by a client door (custom.relation_names_match) the import panel and the paste
-- ask BEFORE they write, so a name matching nothing or two records is shown with a choice. Exactly
-- one match is that record; none, or two of the same name, is refused BY NAME — a link is never
-- guessed. And (G4) custom._io_declare_unmapped judges a new column on up to 2,000 of its values
-- instead of 12, so a column of last names is no longer "a few repeating words".
--
-- PROOF: scripts/campaign-tests/visionreach_g1_a_relation_is_filled_by_its_name.sql (RED on the
-- bodies before this file, GREEN after).

-- ──────────────────────────────────────────────────────────────────────────────────────────
-- 1. THE ONE NAME KEY. How two spellings of one name are told to be the same name: case and
--    runs of spacing do not count. Nothing else is folded — "Dr. Lee" and "Lee" are different
--    names, and an accent is part of a name.
-- ──────────────────────────────────────────────────────────────────────────────────────────
create function custom.relation_name_key(p_text text)
 returns text
 language sql
 immutable parallel safe
 set search_path to 'pg_catalog'
as $function$
  select nullif(lower(regexp_replace(btrim(coalesce(p_text, '')), '\s+', ' ', 'g')), '')
$function$;

revoke execute on function custom.relation_name_key(text) from public;

comment on function custom.relation_name_key(text) is
  'VISION-REACH G1: the key two spellings of one record name share — lower case, spacing collapsed and trimmed; null for an empty name. Used by custom._relation_names_resolve and nothing else should invent a second one.';

-- ──────────────────────────────────────────────────────────────────────────────────────────
-- 2. THE ONE NAME MATCHER. Which records of one Table carry each of these names in its name
--    column (the Table's `title_field`), keyed by custom.relation_name_key. Only records the
--    caller may see at viewer when there is a caller (custom.query_principal); the store's own
--    lanes see the organization's records. NULL means the Table has no name column (or is not
--    this organization's), which every caller says in its own words. Server lane: the client
--    door below and the two write paths (custom.io_cell, custom._relation_kernel_targets) call it.
-- ──────────────────────────────────────────────────────────────────────────────────────────
create function custom._relation_names_resolve(p_organization_id uuid, p_target uuid, p_names text[])
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog'
as $function$
declare
  v_title text;
  v_me    uuid;
  v_keys  text[];
  v_pred  text;
  v_memo  text;
  v_out   jsonb;
begin
  if p_organization_id is null or p_target is null then
    return null;
  end if;
  select nullif(t.data ->> 'title_field', '') into v_title
    from custom.record t
   where t.organization_id = p_organization_id and t.id = p_target and t.deleted_at is null;
  if v_title is null then
    return null;
  end if;
  v_keys := array(select distinct k
                    from (select custom.relation_name_key(n) as k from unnest(coalesce(p_names, '{}'::text[])) n) x
                   where k is not null);
  if cardinality(v_keys) = 0 then
    return '{}'::jsonb;
  end if;

  -- WHO IS ASKING DECIDES WHAT CAN BE MATCHED: the read doors' own predicate for this person on
  -- this Table (custom.visible_predicate_sql), built once per transaction and seat — an import of
  -- 250 rows asks it once, not 250 times. The store's own lanes (no person) match every record.
  v_me := custom.query_principal();
  if v_me is null then
    v_pred := 'true';
  else
    v_memo := 'rnm:' || v_me::text || ':' || p_organization_id::text || ':' || p_target::text;
    v_pred := platform.memo_s_get(v_memo);
    if v_pred is null then
      v_pred := custom.visible_predicate_sql(v_me, p_organization_id, p_target, 'viewer'::public.permission_level, 'r');
      perform platform.memo_s_put(v_memo, v_pred);
    end if;
  end if;

  execute format($q$
    select coalesce(jsonb_object_agg(g.k, g.matches), '{}'::jsonb)
      from (select custom.relation_name_key(r.data ->> $3) as k,
                   jsonb_agg(jsonb_build_object('id', r.id, 'words', r.data ->> $3) order by r.created_at, r.id) as matches
              from custom.record r
             where r.organization_id = $1
               and r.table_id = $2
               and r.data_class = 'record'
               and r.deleted_at is null
               and custom.relation_name_key(r.data ->> $3) = any ($4)
               and (%s)
             group by 1) g
  $q$, v_pred)
    into v_out
    using p_organization_id, p_target, v_title, v_keys;
  return coalesce(v_out, '{}'::jsonb);
end
$function$;

comment on function custom._relation_names_resolve(uuid, uuid, text[]) is
  'VISION-REACH G1: the ONE matcher from a record''s name to the record. {name key: [{id, words}…]} for the records of p_target whose name column matches each name (custom.relation_name_key), only those the caller''s read predicate admits at viewer when there is a caller; null when the Table has no name column. Server lane.';

-- ──────────────────────────────────────────────────────────────────────────────────────────
-- 3. THE CLIENT DOOR. What a screen asks before it writes names into a relation column — the
--    import panel and the grid's paste — so a name that matches nothing, or two records, is shown
--    to the person with a choice BEFORE anything is written. One call for a whole column.
-- ──────────────────────────────────────────────────────────────────────────────────────────
create function custom.relation_names_match(p_organization_id uuid, p_table_id uuid, p_names text[])
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog'
as $function$
declare
  v_tname text;
  v_title text;
  v_hits  jsonb;
  v_n     integer := coalesce(cardinality(p_names), 0);
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.relation_names_match');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.relation_names_match');
  if v_n > 5000 then
    raise exception 'That is % names at once, and one call matches up to 5,000.', v_n
      using errcode = '54000',
            hint = 'Send the names in groups of 5,000 or fewer.';
  end if;
  select coalesce(nullif(t.data ->> 'name', ''), 'That table'), nullif(t.data ->> 'title_field', '')
    into v_tname, v_title
    from custom.record t
   where t.organization_id = p_organization_id and t.id = p_table_id;
  v_hits := custom._relation_names_resolve(p_organization_id, p_table_id, p_names);
  if v_hits is null then
    raise exception '% has no name column, so its records cannot be matched by name.', coalesce(v_tname, 'That table')
      using errcode = '22023',
            hint = 'Give the table a name column, or pick each record by hand.';
  end if;
  return jsonb_build_object(
    'table_id',   p_table_id,
    'table_name', v_tname,
    'title_field', v_title,
    'names', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', u.n,
               'matches', coalesce(v_hits -> custom.relation_name_key(u.n), '[]'::jsonb)) order by u.o)
        from unnest(p_names) with ordinality as u(n, o)
       where custom.relation_name_key(u.n) is not null), '[]'::jsonb));
end
$function$;

comment on function custom.relation_names_match(uuid, uuid, text[]) is
  'VISION-REACH G1: which records of a Table each of these names names (its name column; case and spacing ignored) — {table_id, table_name, title_field, names:[{name, matches:[{id, words}]}]}. Zero matches and two or more are the screen''s to show before it writes; only records the caller may see are ever matched. Up to 5,000 names a call.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, declared_by, reason,
   signed_in_callers, anonymous_callers, non_client_lane, identity_argtypes)
values
  ('custom', 'relation_names_match', 'p_organization_id uuid, p_table_id uuid, p_names text[]',
   'migrations/campaign/visionreach_g1_a_relation_is_filled_by_its_name.sql (lane VISION-REACH)',
   'custom.assert_client_may_reach decides the organization wall and custom.assert_may_know_table decides the caller may know the Table before anything is read. It answers ids and name-column words only for records the caller may see at viewer (the read doors'' own predicate, custom.visible_predicate_sql, inside custom._relation_names_resolve), so a name the caller may not see matches nothing and is indistinguishable from a name that is not there. No other column of any record is read or returned. Capped at 5,000 names a call.',
   true, false, null, '{2950,2950,1009}')
on conflict do nothing;

update platform.client_callable_door
   set argument_rules = jsonb_build_object(
         'version', 1,
         'declared_by', 'visionreach_g1_a_relation_is_filled_by_its_name.sql',
         'declared_at', '2026-10-02 lane VISION-REACH, read from this body',
         'arguments', jsonb_build_object(
           'p_organization_id', jsonb_build_object('type', 'uuid', 'position', 1, 'entity', 'organization',
             'check', 'this body decides it with custom.assert_client_may_reach(arg1), custom.assert_may_know_table(arg1) — the organization wall — a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.',
             'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true),
             'verified', '2026-10-02 lane VISION-REACH — read from this body'),
           'p_table_id', jsonb_build_object('type', 'uuid', 'position', 2, 'entity', 'custom_record',
             'check', 'this body decides it with custom.assert_may_know_table(arg2) — the Table''s own ladder — and that call stands before every other use of this argument in the body.',
             'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true),
             'verified', '2026-10-02 lane VISION-REACH — read from this body'),
           'p_names', jsonb_build_object('type', 'text[]', 'position', 3,
             'check', 'A FILTER, AND NOT A LEAK. The names only narrow the records of a Table the caller may already know to those whose name column matches, and each match is kept only when the read doors'' own predicate (custom.visible_predicate_sql) admits it for the caller at viewer; a name the caller may not see matches nothing.',
             'foreign', jsonb_build_object('not_a_leak', true, 'same_as_invented', true),
             'verified', '2026-10-02 lane VISION-REACH — read from this body')))
 where schema_name = 'custom' and function_name = 'relation_names_match';

grant execute on function custom.relation_names_match(uuid, uuid, text[]) to authenticated;

-- ──────────────────────────────────────────────────────────────────────────────────────────
-- 4. THE IMPORT CELL.
-- ──────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION custom.io_cell(p_organization_id uuid, p_field jsonb, p_word text, p_date_order text DEFAULT 'mdy'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_parity text := coalesce(custom.parity_type(p_field), p_field ->> 'type');
  v_label  text := coalesce(nullif(p_field ->> 'label', ''), p_field ->> 'key');
  v_word   text := btrim(coalesce(p_word, ''));
  v_num    text;
  v_user   uuid;
  v_person uuid;
  v_target uuid;
  v_title  text;
  v_ids    uuid[];
  v_parts  text[];
  v_out    jsonb;
  v_part   text;
  v_tname  text;
  v_hits   jsonb;
  v_m      jsonb;
  v_n      integer;
begin
  -- AN EMPTY CELL IS NOT A VALUE AND IT IS NOT AN ERROR. It is left out of the document
  -- entirely, so the Field's own default and the store's own "never asked" absence stand.
  -- Writing '' into a money column instead would be a value nobody entered.
  if v_word = '' then
    return jsonb_build_object('ok', true, 'skip', true);
  end if;

  -- A COLUMN THAT IS WORKED OUT CANNOT BE IMPORTED, AND SAYING SO IS THE WHOLE ANSWER.
  -- Silently dropping it would leave a person convinced their totals came across.
  if v_parity in ('formula', 'lookup', 'rollup') then
    return jsonb_build_object('ok', false, 'reason',
      format('"%s" is worked out from other columns, so it cannot be imported — it will fill itself in.', v_label));
  end if;
  if v_parity = 'attachment' then
    return jsonb_build_object('ok', false, 'reason',
      format('"%s" holds files, and a spreadsheet cell is not a file. Attach the files to the records after the import.', v_label));
  end if;

  -- A TICK. A spreadsheet writes yes, no, TRUE, 1, 0, Y, N or a check mark, and the store
  -- holds a real boolean. A word that is none of those is refused BY NAME rather than read
  -- as "not ticked": a box silently left empty because a cell said "n/a" is the quiet half
  -- of the defect this type exists to close.
  if v_parity = 'checkbox' then
    if lower(v_word) in ('true', 't', 'yes', 'y', '1', 'on', 'x', '✓', '✔') then
      return jsonb_build_object('ok', true, 'value', to_jsonb(true));
    end if;
    if lower(v_word) in ('false', 'f', 'no', 'n', '0', 'off', '☐') then
      return jsonb_build_object('ok', true, 'value', to_jsonb(false));
    end if;
    return jsonb_build_object('ok', false, 'reason',
      format('"%s" is a yes/no column and "%s" is neither. Yes, no, true, false, 1, 0 and a check mark all work; an empty cell stays unanswered.', v_label, v_word));
  end if;

  -- A PERSON. The store already knows this organization's roster, so an email address in a
  -- person column is resolved to the person rather than refused as "not a uuid".
  if v_parity = 'member' then
    if v_word ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
      return jsonb_build_object('ok', true, 'value', to_jsonb(v_word));
    end if;
    select m.user_id into v_user
      from iam.organization_member m
      join auth.users u on u.id = m.user_id
     where m.organization_id = p_organization_id
       and lower(u.email::text) = lower(v_word)
     limit 1;
    if v_user is null then
      return jsonb_build_object('ok', false, 'reason',
        format('"%s" is not somebody in this organization, so "%s" has nobody to point at. Invite them first, or leave the cell empty.', v_word, v_label));
    end if;
    v_person := custom.work_person(p_organization_id, v_user, true);
    return jsonb_build_object('ok', true, 'value', to_jsonb(v_person::text));
  end if;

  -- A POINTER AT ANOTHER TABLE. The cell holds the record's NAME, because that is what a
  -- spreadsheet holds; the store turns it into the record. An ambiguous name is refused BY
  -- NAME rather than resolved to whichever row happened to be first.
  -- MEASURED 2026-09-20, on the main database, by running a real import: this arm never
  -- fired. `custom.parity_type` answers NOTHING for a relation that points at one of the
  -- organization's own Tables — `member` and `attachment` are the only two relations it
  -- names — so `v_parity` is `coalesce(null, 'relation')` = 'relation', and the condition
  -- `v_parity is null` was false for exactly the case it was written for. Every "Account"
  -- cell went to the write door as the literal string "Northwind Trading" and the store
  -- refused it, correctly, with "Account points at something that is not there" — telling a
  -- person their file was wrong when the file was right. It is the condition that was wrong.
  if v_parity = 'relation' then
    v_target := nullif(p_field ->> 'relation_target', '')::uuid;
    if v_target is null then
      return jsonb_build_object('ok', false, 'reason',
        format('"%s" points at other records and does not say which table, so "%s" cannot be looked up.', v_label, v_word));
    end if;
  end if;
  if v_target is not null then
    -- VISION-REACH G1 (2026-10-02): A NAME IS MATCHED THE WAY A PERSON READS IT. The cell is
    -- matched to the target's name column by custom._relation_names_resolve — the ONE name
    -- matcher every door shares (this cell, the write trigger, custom.relation_names_match) —
    -- with case and spacing ignored, so "dr. marisol  gutierrez" is Dr. Marisol Gutierrez. It
    -- was an exact, case-sensitive match, and a column that allows several records took the
    -- whole cell as ONE name. A column that allows several is split the way every list cell
    -- of an import is split (; , |). An id passes through; the store decides it is there.
    -- Ambiguous and unmatched names are still refused BY NAME — never a guess.
    if coalesce((p_field ->> 'multi')::boolean, false) then
      v_parts := array(select btrim(x) from unnest(regexp_split_to_array(v_word, '\s*[;,|]\s*')) x
                        where btrim(x) <> '');
    else
      v_parts := array[v_word];
    end if;
    if cardinality(v_parts) = 0 then
      return jsonb_build_object('ok', true, 'skip', true);
    end if;
    v_hits := custom._relation_names_resolve(p_organization_id, v_target,
                array(select x from unnest(v_parts) x
                       where x !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'));
    if v_hits is null then
      return jsonb_build_object('ok', false, 'reason',
        format('"%s" points at a table that has no name column, so "%s" cannot be looked up.', v_label, v_word));
    end if;
    select coalesce(nullif(r.data ->> 'name', ''), 'that table') into v_tname
      from custom.record r
     where r.organization_id = p_organization_id and r.id = v_target;
    v_out := '[]'::jsonb;
    foreach v_part in array v_parts loop
      if v_part ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
        v_out := v_out || jsonb_build_array(to_jsonb(lower(v_part)));
        continue;
      end if;
      v_m := coalesce(v_hits -> custom.relation_name_key(v_part), '[]'::jsonb);
      v_n := jsonb_array_length(v_m);
      if v_n = 0 then
        return jsonb_build_object('ok', false, 'reason',
          format('There is no "%s" in %s for "%s" to point at yet. Import that table first, or add it there.', v_part, v_tname, v_label));
      end if;
      if v_n > 1 then
        return jsonb_build_object('ok', false, 'reason',
          format('There are %s records called "%s" in %s, so "%s" cannot tell which one this row means.', v_n, v_part, v_tname, v_label));
      end if;
      if not v_out @> jsonb_build_array(v_m -> 0 -> 'id') then
        v_out := v_out || jsonb_build_array(v_m -> 0 -> 'id');
      end if;
    end loop;
    if coalesce((p_field ->> 'multi')::boolean, false) then
      return jsonb_build_object('ok', true, 'value', v_out);
    end if;
    return jsonb_build_object('ok', true, 'value', v_out -> 0);
  end if;

  -- MONEY, PERCENTAGES AND PLAIN NUMBERS. A spreadsheet writes `$1,250.00`, `(45.00)` for a
  -- negative and `12%`; the store holds a number. The symbols, the thousands separators, the
  -- accountant's brackets and the trailing currency code all come off here, once.
  if v_parity in ('currency', 'percent') or (p_field ->> 'type') = 'range' then
    v_num := regexp_replace(v_word, '[$€£¥%,\s]', '', 'g');
    v_num := regexp_replace(v_num, '(?i)(USD|EUR|GBP|CAD|AUD)$', '');
    if v_num ~ '^[(].*[)]$' then
      v_num := '-' || btrim(v_num, '()');
    end if;
    if v_parity = 'datetime' or (p_field -> 'config' ->> 'kind') in ('date', 'datetime') then
      -- A DATE IS NOT A NUMBER and falls through to the date arm below.
      null;
    elsif v_num ~ '^[+-]?[0-9]+([.][0-9]+)?$' then
      return jsonb_build_object('ok', true, 'value', to_jsonb(v_num::numeric));
    else
      return jsonb_build_object('ok', false, 'reason',
        format('"%s" is a number column and "%s" is not a number.', v_label, v_word));
    end if;
  end if;

  -- A DATE. ISO goes straight through. The slashed forms are read in the order this run was
  -- opened with — never guessed per row, because a file whose first rows happen to have a day
  -- above 12 would otherwise be read one way at the top and another way at the bottom.
  if v_parity = 'datetime' or (p_field -> 'config' ->> 'kind') in ('date', 'datetime') then
    if v_word ~ '^\d{4}-\d{2}-\d{2}' then
      return jsonb_build_object('ok', true, 'value', to_jsonb(v_word));
    end if;
    if v_word ~ '^\d{1,2}/\d{1,2}/\d{2,4}$' then
      begin
        return jsonb_build_object('ok', true, 'value',
          to_jsonb(to_char(to_date(v_word, case when lower(coalesce(p_date_order, 'mdy')) = 'dmy'
                                                then 'DD/MM/YYYY' else 'MM/DD/YYYY' end), 'YYYY-MM-DD')));
      exception when others then
        return jsonb_build_object('ok', false, 'reason',
          format('"%s" is a date column and "%s" is not a date this store can read.', v_label, v_word));
      end;
    end if;
    return jsonb_build_object('ok', false, 'reason',
      format('"%s" is a date column and "%s" is not a date. Dates written year-month-day always work.', v_label, v_word));
  end if;

  -- A CHOICE. The word goes in as the word: `custom._resolve_choice_words` turns a label, a
  -- key or an option''s id into the one key the store keeps, and refuses a word that names no
  -- choice with the choices listed. Doing it a second time here would be a second vocabulary.
  if v_parity = 'multi_select' or coalesce((p_field ->> 'multi')::boolean, false) then
    v_parts := array(select btrim(x) from unnest(regexp_split_to_array(v_word, '\s*[;,|]\s*')) x
                      where btrim(x) <> '');
    if cardinality(v_parts) = 0 then
      return jsonb_build_object('ok', true, 'skip', true);
    end if;
    v_out := '[]'::jsonb;
    foreach v_part in array v_parts loop
      v_out := v_out || jsonb_build_array(to_jsonb(v_part));
    end loop;
    return jsonb_build_object('ok', true, 'value', v_out);
  end if;

  return jsonb_build_object('ok', true, 'value', to_jsonb(v_word));
end;
$function$;

-- ──────────────────────────────────────────────────────────────────────────────────────────
-- 5. THE WRITE TRIGGER EVERY DOOR PASSES THROUGH.
-- ──────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION custom._relation_kernel_targets()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_on    boolean;
  f       record;
  v_val   jsonb;
  v_items jsonb;
  v_out   jsonb;
  v_one   jsonb;
  v_to    uuid;
  v_new   jsonb;
  v_org   text;
  v_key   text;
  v_flds  jsonb;
  v_hits  jsonb;
  v_m     jsonb;
  v_name  text;
  v_tname text;
begin
  -- Only an ordinary, live record of an ordinary Table holds cells to resolve.
  if new.data_class is distinct from 'record' or new.table_id is null
     or new.deleted_at is not null
     or new.data is null or jsonb_typeof(new.data) <> 'object' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.data is not distinct from new.data
     and old.table_id is not distinct from new.table_id then
    return new;
  end if;

  -- THIS TABLE'S RELATION FIELDS, READ ONCE PER STATEMENT. The same statement memo
  -- `custom.record_relation_edges` keeps (WRITE-PERF-3b), under its own key, cleared by the same
  -- structure triggers — so a 250-row import asks the catalogue once, and a Table with no
  -- relation column stops here without reading the switch at all.
  v_key  := 'rkt:' || new.organization_id::text || ':' || new.table_id::text;
  v_flds := platform.memo_s_get(v_key)::jsonb;
  if v_flds is null then
    select coalesce(jsonb_agg(jsonb_build_object(
             'k', x.k, 'label', x.label, 'tgt', x.tgt, 'is_kernel', x.is_kernel) order by x.k), '[]'::jsonb)
      into v_flds
      from (
    select coalesce(nullif(fd.data ->> 'key', ''), fd.data ->> 'name')        as k,
           coalesce(nullif(fd.data ->> 'label', ''), fd.data ->> 'name')      as label,
           case when (fd.data ->> 'relation_target') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                then (fd.data ->> 'relation_target')::uuid end                as tgt,
           coalesce(fd.data ->> 'relation_target' in (custom.person_kernel_id()::text,
                                                      custom.file_kernel_id()::text), false)
                                                                              as is_kernel
      from custom.record fd
     where fd.table_id = custom.field_kernel_id()
       and fd.data_class <> 'kernel'
       and fd.deleted_at is null
       and fd.organization_id = new.organization_id
       and nullif(fd.data ->> 'entity_definition_id', '')::uuid = new.table_id
       and fd.data ->> 'type' = 'relation'
      ) x;
    perform platform.memo_s_put(v_key, v_flds::text);
  end if;
  if v_flds = '[]'::jsonb then
    return new;
  end if;

  -- THE SWITCH, as custom._resolve_choice_words reads it: while the store is off for this
  -- organization the document is left exactly as the writer sent it.
  begin
    v_on := custom.store_is_open(new.organization_id);
  exception when others then
    v_on := false;
  end;
  if not v_on then
    return new;
  end if;

  for f in
    select * from jsonb_to_recordset(v_flds) as j(k text, label text, tgt uuid, is_kernel boolean)
  loop
    v_val := new.data -> f.k;
    if v_val is null or jsonb_typeof(v_val) not in ('string', 'array') then
      continue;
    end if;
    -- An ordinary relation has only one thing to normalize — a repeated id — so it is looked
    -- at only when the cell is a list and the writer actually sent it. A cell nobody touched
    -- is left byte-for-byte as it stands.
    -- VISION-REACH G1 (2026-10-02): an ordinary relation cell is also looked at when the writer
    -- sent a record's NAME rather than its id — a paste, an agent, the table API and the MCP all
    -- hand over what a person reads. A single id, or a cell nobody touched, is left as it stands.
    if not f.is_kernel
       and ((tg_op = 'UPDATE' and old.data -> f.k is not distinct from v_val)
            or (jsonb_typeof(v_val) = 'string'
                and ((v_val #>> '{}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                     or btrim(v_val #>> '{}') = ''))) then
      continue;
    end if;

    v_items := case when jsonb_typeof(v_val) = 'array' then v_val else jsonb_build_array(v_val) end;
    v_out   := '[]'::jsonb;

    for v_one in select x from jsonb_array_elements(v_items) x loop
      -- A RECORD'S NAME, ON AN ORDINARY RELATION (VISION-REACH G1). Matched by the ONE name matcher
      -- (custom._relation_names_resolve: the target's name column, case and spacing ignored, only
      -- records this writer may see). Exactly one match is that record; none, or two with the same
      -- name, is refused BY NAME — a link is never guessed. A target with no name column leaves
      -- the word for custom.validate_values to refuse in its own words, as before.
      if not f.is_kernel and f.tgt is not null and jsonb_typeof(v_one) = 'string'
         and btrim(v_one #>> '{}') <> ''
         and (v_one #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        v_name := btrim(v_one #>> '{}');
        v_hits := custom._relation_names_resolve(new.organization_id, f.tgt, array[v_name]);
        if v_hits is not null then
          v_m := coalesce(v_hits -> custom.relation_name_key(v_name), '[]'::jsonb);
          if jsonb_array_length(v_m) <> 1 then
            select coalesce(nullif(t.data ->> 'name', ''), 'that table') into v_tname
              from custom.record t
             where t.organization_id = new.organization_id and t.id = f.tgt;
            if jsonb_array_length(v_m) = 0 then
              raise exception '% has no record called "%" in %.', f.label, v_name, v_tname
                using errcode = '23514',
                      hint = format('Pick the record for %s, or add "%s" to %s first.', f.label, v_name, v_tname);
            end if;
            raise exception '% has % records called "%" in %, so it cannot tell which one you mean.',
                  f.label, jsonb_array_length(v_m), v_name, v_tname
              using errcode = '23514',
                    hint = format('Pick the one you mean for %s.', f.label);
          end if;
          v_one := v_m -> 0 -> 'id';
        end if;
      end if;

      -- Not an id at all: custom.validate_values refuses it in its own words.
      if jsonb_typeof(v_one) <> 'string'
         or (v_one #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        v_out := v_out || jsonb_build_array(v_one);
        continue;
      end if;

      if not f.is_kernel then
        v_to := (v_one #>> '{}')::uuid;
      else
        v_to := custom.relation_kernel_record(new.organization_id, f.tgt, (v_one #>> '{}')::uuid);
      end if;

      if v_to is null then
        select coalesce(nullif(o.name, ''), 'this organization') into v_org
          from iam.organizations o where o.id = new.organization_id;
        -- A kernel record of this organization that has been REMOVED is a different sentence
        -- from a stranger: the person (or file) was here, and somebody took their record away.
        if exists (select 1 from custom.record t
                    where t.organization_id = new.organization_id
                      and t.id = (v_one #>> '{}')::uuid
                      and t.table_id = f.tgt) then
          raise exception '% names % that was removed from %.', f.label,
                case when f.tgt = custom.person_kernel_id() then 'a person' else 'a file' end,
                coalesce(v_org, 'this organization')
            using errcode = '23514',
                  hint = format('Pick %s again for %s, or restore the removed record first — the store never points a column at something that is gone.',
                                case when f.tgt = custom.person_kernel_id() then 'who it is now' else 'the file' end,
                                f.label);
        end if;
        if f.tgt = custom.person_kernel_id() then
          raise exception '% names someone who is not a member of %.', f.label, coalesce(v_org, 'this organization')
            using errcode = '23514',
                  hint = format('%s holds a member of this organization — pick them from the list, or give their user id and the store finds their Person record. Somebody who is not a member has to be invited first.', f.label);
        end if;
        raise exception '% names a file % does not have.', f.label, coalesce(v_org, 'this organization')
          using errcode = '23514',
                hint = format('%s holds a file of this organization — upload it here first, then give its id and the store makes its File record. A file that belongs to another organization cannot be attached here.', f.label);
      end if;

      -- ONE RECORD, ONCE, IN THE ORDER IT WAS FIRST NAMED. A relation that names the same record
      -- twice states one fact twice; the association beside it is one row per (target, role),
      -- so the value keeps the first mention and drops the repeat — and a member named by user
      -- id AND by Person record id is the same person, caught here after resolution.
      if v_out @> jsonb_build_array(to_jsonb(v_to::text)) then
        continue;
      end if;
      v_out := v_out || jsonb_build_array(to_jsonb(v_to::text));
    end loop;

    v_new := case when jsonb_typeof(v_val) = 'array' then v_out else v_out -> 0 end;
    if v_new is distinct from v_val then
      new.data := new.data || jsonb_build_object(f.k, v_new);
    end if;
  end loop;

  return new;
end;
$function$;

-- ──────────────────────────────────────────────────────────────────────────────────────────
-- 6. A NEW COLUMN IS JUDGED ON THE WHOLE FILE (G4).
-- ──────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION custom._io_declare_unmapped(p_organization_id uuid, p_table_id uuid, p_rows jsonb, p_mapping jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_map    jsonb := coalesce(p_mapping, '{}'::jsonb);
  v_fields jsonb := '{}'::jsonb;
  v_f      record;
  v_row    jsonb;
  v_key    text;
  v_val    jsonb;
  v_new    jsonb := '{}'::jsonb;
  v_made   jsonb := '[]'::jsonb;
  v_prop   jsonb;
  v_inf    jsonb;
  v_spec   jsonb;
  v_fid    uuid;
begin
  for v_f in select f.data as data from custom.applicable_fields(p_organization_id, p_table_id, null) f
  loop
    v_fields := v_fields || jsonb_build_object(v_f.data ->> 'key', v_f.data);
  end loop;

  for v_row in select value from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    for v_key, v_val in select key, value from jsonb_each(v_row) loop
      if (v_map ? v_key) or (v_fields ? v_key) then
        continue;
      end if;
      v_new := v_new || jsonb_build_object(
        v_key, coalesce(v_new -> v_key, '[]'::jsonb) ||
               case when jsonb_array_length(coalesce(v_new -> v_key, '[]'::jsonb)) < 2000
                      and coalesce(v_val #>> '{}', '') <> ''
                    then jsonb_build_array(v_val) else '[]'::jsonb end);
    end loop;
  end loop;

  for v_key in select k from jsonb_object_keys(v_new) k loop
    v_inf  := custom.io_infer_column(p_organization_id, p_table_id, v_key, v_new -> v_key);
    -- VISION-REACH G4 (2026-10-02): the column is judged on up to 2,000 of its values, not the
    -- first 12 — twelve last names are "a few repeating words" and became a choice list; the
    -- whole file is not. The proposal still carries twelve, for the screen to show.
    v_prop := jsonb_build_object('column', v_key,
                                 'samples', coalesce((select jsonb_agg(s.value order by s.ordinality)
                                                        from jsonb_array_elements(v_new -> v_key) with ordinality s
                                                       where s.ordinality <= 12), '[]'::jsonb))
              || (v_inf - 'header' - 'matched')
              || jsonb_build_object('state', 'proposed');
    -- A HEADER THAT ALREADY NAMES A COLUMN IS A MAPPING, NOT A NEW COLUMN.
    if coalesce((v_inf ->> 'matched')::boolean, false) then
      v_map := v_map || jsonb_build_object(v_key, v_prop ->> 'field_key');
      continue;
    end if;
    v_spec := custom.io_proposal_spec(v_prop);
    begin
      v_fid  := custom.field_declare(p_organization_id, p_table_id, v_spec);
      v_map  := v_map || jsonb_build_object(v_key, v_spec ->> 'key');
      v_made := v_made || jsonb_build_array(v_prop || jsonb_build_object('state', 'accepted', 'field_id', v_fid));
    exception when others then
      -- NINETEEN GOOD COLUMNS ARE NOT LOST BECAUSE THE TWENTIETH COLLIDED.
      v_made := v_made || jsonb_build_array(v_prop || jsonb_build_object('state', 'refused', 'reason', sqlerrm));
    end;
  end loop;

  return jsonb_build_object('mapping', v_map, 'columns_added', v_made);
end
$function$;
