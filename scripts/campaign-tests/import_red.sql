-- scripts/campaign-tests/import_red.sql — LANE IMPORT's RED TWIN
--
-- RUN IT ON PURPOSE AND EXPECT EVERY BLOCK TO BE RED:
--   <scratchpad>/imp/p.sh -f scripts/campaign-tests/import_red.sql
--
-- Each block PLANTS THE REAL PRE-FIX BYTES of one thing this lane changed — read out of the
-- live catalogue BEFORE each fix was applied and put back verbatim, not paraphrased — and
-- then asserts what `import_green.sql` now asserts. A block that is GREEN means this lane
-- changed nothing there. Everything is inside one transaction that ends in ROLLBACK, so the
-- planted bodies never outlive the run.
--
-- RED 1  the relation arm that could never fire (`v_parity is null`, and v_parity is never null)
-- RED 4  `custom.io_relation_candidate` excluding a NULL table, so a new table finds nothing
-- RED 2  W4-IO's `custom.io_import_rows`: no coercion, no duplicate key, no per-row outcome
-- RED 3  no file identity at all — the same file, twice, writes it twice
-- RED 5  THE CONTROL, which must be GREEN, so the twin cannot pass by refusing everything


-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'import_red.sql'
\set requires 'grant:authenticated:custom.person_kernel_id'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

do $suite$
declare
  c_admin   uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_admin_j text := jsonb_build_object('sub','87a6e699-3622-4869-8843-d0867456c0dd','role','authenticated')::text;
  v_boss    text := current_user;
  v_org     uuid;
  v_home    uuid;
  v_acct    uuid;
  v_tbl     uuid;
  v_imp     uuid;
  v_r       jsonb;
  v_n       integer;
  v_said    text;
begin
  perform set_config('app.actor_system', 'campaign-test/import_red.sql', true);

  insert into iam.organizations (name, slug, abbreviation, created_by)
  values ('Blue Ridge Recycling',
          'blue-ridge-recycling-red-' || substr(md5(random()::text), 1, 8), 'BRD', c_admin)
  returning id into v_org;
  insert into iam.memberships (organization_id, user_id, role, status, container_type, container_id)
  values (v_org, c_admin, 'owner', 'active', 'organization', v_org);
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value)
  values ('custom', 'system_enabled', 'organization', v_org, v_org, 'true');
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('role', 'authenticated', true);

  v_home := custom.record_write(v_org, custom.person_kernel_id(), jsonb_build_object('name','RED Home'));
  v_acct := custom.table_declare(v_org, jsonb_build_object(
    'name','Accounts','slug','accounts','type','entity',
    'label_singular','Account','label_plural','Accounts','title_field','title','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','title')),
    'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_acct, jsonb_build_object('label','Title','key','title','type','text'));
  perform custom.record_write(v_org, v_acct, jsonb_build_object('title','Northwind Trading'));
  v_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name','Deals','slug','deals','type','entity',
    'label_singular','Deal','label_plural','Deals','title_field','deal','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','deal')),
    'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Deal','key','deal','type','text'));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Amount','key','amount','type','currency','unit','USD'));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Account','key','account','type','relation','relation_target', v_acct::text));
  perform set_config('role', v_boss, true);

  -- ══ RED 1 — THE RELATION ARM AS IT WAS ═══════════════════════════════════════════
  perform set_config('role', v_boss, true);
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
  if v_parity is null and (p_field ->> 'type') = 'relation' then
    v_target := nullif(p_field ->> 'relation_target', '')::uuid;
  end if;
  if v_target is not null then
    if v_word ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
      return jsonb_build_object('ok', true, 'value', to_jsonb(v_word));
    end if;
    select r.data ->> 'title_field' into v_title
      from custom.record r
     where r.organization_id = p_organization_id and r.id = v_target and r.deleted_at is null;
    if v_title is null then
      return jsonb_build_object('ok', false, 'reason',
        format('"%s" points at a table that has no name column, so "%s" cannot be looked up.', v_label, v_word));
    end if;
    select array_agg(r.id) into v_ids
      from custom.record r
     where r.organization_id = p_organization_id
       and r.table_id = v_target
       and r.data_class = 'record'
       and r.deleted_at is null
       and r.data ->> v_title = v_word;
    if v_ids is null or cardinality(v_ids) = 0 then
      return jsonb_build_object('ok', false, 'reason',
        format('There is no "%s" for "%s" to point at yet. Import that table first, or add it there.', v_word, v_label));
    end if;
    if cardinality(v_ids) > 1 then
      return jsonb_build_object('ok', false, 'reason',
        format('There are %s records called "%s", so "%s" cannot tell which one this row means.', cardinality(v_ids), v_word, v_label));
    end if;
    return jsonb_build_object('ok', true, 'value', to_jsonb(v_ids[1]::text));
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
  perform set_config('role', 'authenticated', true);

  v_imp := (custom.io_import_begin(v_org, v_tbl, 'csv', 'red.csv', '[]'::jsonb,
              'red-hash-1', '{}'::jsonb, 'deal', null, false) ->> 'import_id')::uuid;
  v_r := custom.io_import_rows(v_org, v_imp, jsonb_build_array(
           jsonb_build_object('deal','Roof job','amount','$1,250.00','account','Northwind Trading')),
         '{}'::jsonb);
  if (v_r ->> 'rows_written')::int <> 1 then
    raise notice 'RED 1 IS RED — an account that plainly exists was refused: %',
      (select o ->> 'reason' from jsonb_array_elements(v_r -> 'outcomes') o limit 1);
  else
    raise exception 'RED 1 IS GREEN — the pre-fix relation arm wrote the row, so this lane fixed nothing';
  end if;

  -- ══ RED 4 — "NOT THIS TABLE" WHEN THERE IS NO TABLE ══════════════════════════════
  perform set_config('role', v_boss, true);
CREATE OR REPLACE FUNCTION custom.io_relation_candidate(p_organization_id uuid, p_table_id uuid, p_words text[])
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_t      record;
  v_title  text;
  v_hits   integer;
  v_words  integer := cardinality(coalesce(p_words, array[]::text[]));
begin
  if v_words < 2 then
    return null;
  end if;
  for v_t in
    select r.id, r.data ->> 'title_field' as title_field
      from custom.record r
     where r.organization_id = p_organization_id
       and r.table_id = custom.table_kernel_id()
       and r.data_class = 'table'
       and r.deleted_at is null
       and r.id <> p_table_id
       and nullif(r.data ->> 'title_field', '') is not null
     order by r.created_at desc
     limit 40
  loop
    -- THE WALL, PER CANDIDATE. A Table this person cannot open is not a suggestion this
    -- person gets, and the refusal is swallowed here rather than ending the inference:
    -- "you may not see that one" is not an error in an answer about a file.
    begin
      perform custom.assert_may_know_table(p_organization_id, v_t.id, 'custom.io_relation_candidate');
    exception when others then
      continue;
    end;
    v_title := v_t.title_field;
    select count(distinct r.data ->> v_title) into v_hits
      from custom.record r
     where r.organization_id = p_organization_id
       and r.table_id = v_t.id
       and r.data_class = 'record'
       and r.deleted_at is null
       and r.data ->> v_title = any (p_words);
    if v_hits = v_words then
      return v_t.id;
    end if;
  end loop;
  return null;
end;
$function$;
  perform set_config('role', 'authenticated', true);

  -- THROUGH THE DOOR, because `io_relation_candidate` is an internal this seat holds no
  -- grant on — which is the design. What a person actually sees is the PLAN.
  select c ->> 'type' into v_said
    from jsonb_array_elements(
           custom.io_import_plan(v_org, null, jsonb_build_array(
             jsonb_build_object('header','Account','samples',
               jsonb_build_array('Northwind Trading','Northwind Trading')))) -> 'columns') c
   where c ->> 'header' = 'Account';
  if v_said is distinct from 'relation' then
    raise notice 'RED 4 IS RED — with no table, the pre-fix candidate loop saw ZERO tables, so a column of real account names came back as "%" instead of a pointer.', v_said;
  else
    raise exception 'RED 4 IS GREEN — the pre-fix NULL comparison found a relation, so this lane fixed nothing';
  end if;

  -- ══ RED 2 — W4-IO's ROW ENGINE ═══════════════════════════════════════════════════
  perform set_config('role', v_boss, true);
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
$function$;
  perform set_config('role', 'authenticated', true);

  v_imp := (custom.io_import_begin(v_org, v_tbl, 'csv', 'red2.csv', '[]'::jsonb,
              'red-hash-2', '{}'::jsonb, 'deal', null, false) ->> 'import_id')::uuid;
  v_r := custom.io_import_rows(v_org, v_imp, jsonb_build_array(
           jsonb_build_object('deal','Money job','amount','$1,250.00'),
           jsonb_build_object('deal','Twice job','amount','1'),
           jsonb_build_object('deal','Twice job','amount','2')),
         '{}'::jsonb);
  -- The new engine writes two of these and calls the third a duplicate. The old one
  -- handed every cell to the write door as the STRING the file held, so a money column
  -- refused "$1,250.00" AND refused "1" — not one of the three rows could land. There is
  -- also no `rows_duplicate` and no `outcomes` in its answer at all: a duplicate was not a
  -- thing it could notice and a row was not a thing it could report on.
  if (v_r ->> 'rows_written')::int = 0
     and (v_r -> 'rows_duplicate') is null
     and (v_r -> 'outcomes') is null then
    raise notice 'RED 2 IS RED — not one of three rows could land ("%"), and the answer has no duplicate count and no per-row outcome at all.',
      (select left(x ->> 'reason', 60) from jsonb_array_elements(v_r -> 'refusals') x limit 1);
  else
    raise exception 'RED 2 IS GREEN — W4-IO''s engine coerced, deduplicated or reported per row, so this lane added nothing: %', v_r;
  end if;

  -- ══ RED 3 — NO FILE IDENTITY ═════════════════════════════════════════════════════
  -- Only the title column, because the engine planted above cannot coerce anything and
  -- this block is about the FILE, not about a cell.
  select count(*) into v_n from custom.read_records(v_org, v_tbl, false, 200, 0);
  v_imp := (custom.io_import_begin(v_org, v_tbl, 'csv', 'red3.csv', '[]'::jsonb,
              null, '{}'::jsonb, null, null, false) ->> 'import_id')::uuid;
  perform custom.io_import_rows(v_org, v_imp,
            jsonb_build_array(jsonb_build_object('deal','Doubled job')), '{}'::jsonb);
  v_imp := (custom.io_import_begin(v_org, v_tbl, 'csv', 'red3.csv', '[]'::jsonb,
              null, '{}'::jsonb, null, null, false) ->> 'import_id')::uuid;
  perform custom.io_import_rows(v_org, v_imp,
            jsonb_build_array(jsonb_build_object('deal','Doubled job')), '{}'::jsonb);
  if (select count(*) from custom.read_records(v_org, v_tbl, false, 200, 0)) = v_n + 2 then
    raise notice 'RED 3 IS RED — a file with no identity was imported twice and wrote every row twice.';
  else
    raise exception 'RED 3 IS GREEN — a run with no file hash somehow refused the second import';
  end if;

  -- ══ RED 5 — THE CONTROL, WHICH MUST BE GREEN ═════════════════════════════════════
  -- SUITES-TIDY 2026-09-22: the control used to open the same file twice and never import a
  -- row. `custom.io_import_begin` has since been NARROWED on purpose, and its own body says
  -- why: a run that wrote nothing and matched nothing "is not the time this file was imported
  -- — it is a run that FAILED", and remembering it turned a guard against DOUBLE writing into
  -- a guard against ANY writing, so the file that created a table's columns on its first pass
  -- could never be imported again. Under that rule the old control's first call is a failed
  -- run and the second is correctly answered `already: false` — the control was asserting a
  -- behaviour the platform deliberately removed. It now IMPORTS A ROW on the first pass,
  -- which is what "this file was already imported" means, and then re-opens the same file.
  v_imp := (custom.io_import_begin(v_org, v_tbl, 'csv', 'red5.csv', '[]'::jsonb,
              'red-hash-5', '{}'::jsonb, null, null, false) ->> 'import_id')::uuid;
  perform custom.io_import_rows(v_org, v_imp,
            jsonb_build_array(jsonb_build_object('deal', 'Blue Ridge baler retrofit')), '{}'::jsonb);
  v_r := custom.io_import_begin(v_org, v_tbl, 'csv', 'red5.csv', '[]'::jsonb,
            'red-hash-5', '{}'::jsonb, null, null, false);
  if not (v_r ->> 'already')::boolean then
    raise exception 'RED 5 CONTROL FAILED — the file hash did not recognise the same file, so this twin proves nothing';
  end if;
  raise notice 'RED 5 CONTROL — with a hash, the second run of the same file writes nothing. The twin is not refusing everything.';

  perform set_config('role', v_boss, true);
  raise notice 'ALL FOUR BLOCKS ARE RED (1, 4, 2, 3) AND THE CONTROL (5) HOLDS.';
end $suite$;

rollback;
