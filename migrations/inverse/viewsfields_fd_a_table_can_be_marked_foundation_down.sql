-- chair-step: the inverse of migrations/campaign/viewsfields_fd_a_table_can_be_marked_foundation.sql. It puts custom._table_shape_guard, custom.table_placement and custom.data_home back byte for byte as they stood before it, re-makes the view custom.table without its `foundation` column (drop and re-make: a view cannot lose a column in place; nothing depends on it; its comment is set again and the schema's default privilege gives service_role its read back), re-makes custom.table_facts(uuid) without its `foundation` result column with EXECUTE granted again to exactly the roles that held it, then drops custom.table_is_foundation(jsonb), which nothing reads any more. A Table document that still says `foundation: true` keeps the key; nothing reads it.
-- lane: VIEWS-AND-FIELDS
-- lock: custom
-- window-class: function bodies, one view re-made, one function re-made in place; no DDL on any table.
-- based-on: custom._table_shape_guard() 8766eb559976431acc622a4a61f162faa232bcafe3b2bad0b380191c6b88c7c9
-- based-on: custom.table_placement(uuid, uuid, jsonb, boolean) 9c5211b9fb5638371b22f7b4ea472bd3043b0cd879cdc730bb34b67d276741ff
-- based-on: custom.data_home(uuid, text, boolean) 51b005bc0b36317c6fe903a5264fef4f9ae2e9a9e1920e185db546b50166c81a
-- based-on: custom.table_facts(uuid) 99dfa9feb0382a3991ad4632857bd0123b5585be19e4811880c8be8e98eedd45
-- based-on: view custom.table 2a746d83a63e782bbe2b3883e575f446697cc803ea5bbbcf2c82e9f43370bbe4

set local lock_timeout = '2s';
set local statement_timeout = '60s';

CREATE OR REPLACE FUNCTION custom._table_shape_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  d            jsonb := new.data;
  -- ── LIMITS-FIX 2026-09-21: EVERY PROBLEM WITH THIS TABLE, IN ONE ANSWER. ───────────────
  -- This guard used to stop at the FIRST thing wrong, so declaring one table meant a
  -- round trip per missing key against the live database. Real-data crew D hit four in a
  -- row (retention_days, default_sort, agent_writable, and a name on each field) declaring
  -- a podcast episode pipeline on 2026-09-21; reproducing it for this fix cost five more
  -- (type, slug, label, display, weight) before the row was even written. A person filling
  -- in a form is told everything that is wrong with it at once, and so is a caller here.
  --
  -- ONE problem still raises the EXACT sentence and hint it always did, byte for byte, so
  -- nothing that asserts on those messages changes. Only TWO OR MORE are combined.
  v_bad        text[] := '{}';
  v_bad_hints  text[] := '{}';
  v_i          integer;
  v_all        text;
  v_type       text;
  v_title      text;
  v_fields     jsonb;
  v_home       uuid;
  v_home_type  text;
  v_names      text[];
  v_reader     jsonb;   -- CHAIR-CONFIDENTIAL-STORE
begin
  -- THE DOOR. One call to the ONE predicate (`custom.assert_store_door`), which
  -- judges `custom.caller_role()` - the identity the caller actually held - and not
  -- `current_user`, which a SECURITY DEFINER door has already rewritten to itself.
  -- The switch never removes a check: everything below runs exactly as before.
  perform custom.assert_store_door(new.organization_id, 'custom.record');

  -- A RETIREMENT IS NOT A CHANGE OF SHAPE (the shared rule DOOR-FIX and TABLE-DELETE built,
  -- now asked as ONE question). The only change in this update is `deleted_at` going from
  -- nothing to a time: the document is byte-for-byte what it was, so there is no new shape
  -- to judge. This is what lets a dependent field retire in the SAME operation as the
  -- relation it reads through - the sweep, the cascade and the door all arrive here.
  if tg_op = 'UPDATE'
     and custom.is_a_retirement(old.deleted_at, new.deleted_at,
                                old.data, new.data,
                                old.table_id, new.table_id,
                                old.organization_id, new.organization_id,
                                old.data_class, new.data_class) then
    return new;
  end if;

  -- Only Tables, and only Tables an organization DECLARED. REC-27: the kernel's nine are
  -- "defined in code, not data" — W1-STORE wrote eight of them before this guard existed
  -- and W1-FIELD adds the ninth, so a `kernel` row is exempt and the view supplies its
  -- defaults. THE BOUND OF THAT EXEMPTION, named rather than left implied: the only writer
  -- that can set data_class at all is the schema owner, because schema `custom` is revoked
  -- from PUBLIC, anon, authenticated and service_role and the one client door
  -- (custom.record_write) cannot set data_class. A tenant cannot reach this branch.
  if new.table_id is distinct from custom.table_kernel_id() or new.data_class = 'kernel' then
    return new;
  end if;

  v_type := d ->> 'type';
  if v_type is null or v_type not in ('entity', 'detail') then
    v_bad := array_append(v_bad, format('a table is an entity or a detail, and this one says %s', custom.said(v_type, 'nothing')));
      v_bad_hints := array_append(v_bad_hints, ('REC-66: type ∈ {entity, detail}.')::text);
  end if;
  if v_type = 'detail' and coalesce(d ->> 'parent_token', '') = '' then
    v_bad := array_append(v_bad, format('a detail table has to say what it is a detail of'));
      v_bad_hints := array_append(v_bad_hints, ('REC-66: parent_token is required when type is detail.')::text);
  end if;
  if v_type <> 'detail' and d ? 'parent_token' then
    v_bad := array_append(v_bad, format('only a detail table has a parent table'));
      v_bad_hints := array_append(v_bad_hints, ('REC-66: parent_token belongs to type detail and to nothing else.')::text);
  end if;

  if coalesce(d ->> 'name', '') = '' then
    v_bad := array_append(v_bad, format('a table needs a name'));
      v_bad_hints := array_append(v_bad_hints, ('REC-1.')::text);
  end if;
  if coalesce(d ->> 'slug', '') !~ '^[a-z][a-z0-9_]*$' then
    v_bad := array_append(v_bad, format('a table needs a slug made of lower-case letters, digits and underscores'));
      v_bad_hints := array_append(v_bad_hints, ('REC-66: slug.')::text);
  end if;
  if coalesce(d ->> 'label_singular', '') = '' or coalesce(d ->> 'label_plural', '') = '' then
    v_bad := array_append(v_bad, format('a table needs both of its labels - one thing and many things'));
      v_bad_hints := array_append(v_bad_hints, ('REC-66: label_singular and label_plural.')::text);
  end if;

  if coalesce(d ->> 'display', '') not in ('list', 'page') then
    v_bad := array_append(v_bad, format('a table shows its records as a list or as a page, and this one says %s',
                    custom.said(d ->> 'display', 'nothing')));
      v_bad_hints := array_append(v_bad_hints, ('REC-1: display. T4 turns a list into a page and migrates nothing.')::text);
  end if;
  if jsonb_typeof(d -> 'ordered') is distinct from 'boolean' then
    v_bad := array_append(v_bad, format('a table has to say whether its records are ordered'));
      v_bad_hints := array_append(v_bad_hints, ('REC-1: ordered.')::text);
  end if;
  if coalesce(d ->> 'weight', '') not in ('heavy', 'light') then
    v_bad := array_append(v_bad, format('a table is heavy or light, and this one says %s', custom.said(d ->> 'weight', 'nothing')));
      v_bad_hints := array_append(v_bad_hints, ('REC-1: heavy|light.')::text);
  end if;
  if jsonb_typeof(d -> 'retention_days') is distinct from 'number' then
    v_bad := array_append(v_bad, format('a table has to say how long it keeps its history'));
      v_bad_hints := array_append(v_bad_hints, ('REC-1: retention.')::text);
  end if;
  -- W3-HIST (HIS-3): the floor is READ, never a literal (rule 15). Thirty days is the
  -- PLATFORM floor, and an organization that raised its own is entitled to have that
  -- honoured here too — the knob is `extensibility / user_tables.history_retention_floor_days`,
  -- raise-only, min 30. With a literal here an organization at sixty days could still declare
  -- a thirty-day table and lose thirty days of history it had already decided to keep.
  -- This body's own switch is `custom/system_enabled`, read through custom.assert_store_door
  -- above; the history writer's is `custom/row_versions_guard`.
  declare
    v_floor integer;
  begin
    -- THE GUARD, READ IN THE BODY. While `custom/system_enabled` resolves false this
    -- comparison is byte-for-byte the behaviour it has always had — the literal thirty — so
    -- the OFF path answers identically and §6.6's requirement for touching a live body is
    -- something a verifier can execute rather than something this lane asserts. Switched ON,
    -- the organization's own floor is honoured here too.
    if custom.store_is_open(new.organization_id) then
      v_floor := history.retention_floor_days(new.organization_id);
    else
      v_floor := 30;
    end if;
    -- Only ask the floor question when a NUMBER was actually given: collecting the
    -- type problem above instead of raising means this line is now reached with a
    -- non-number, and `::numeric` would abort with a cast error nobody asked for.
    if jsonb_typeof(d -> 'retention_days') = 'number'
       and (d ->> 'retention_days')::numeric < v_floor then
      v_bad := array_append(v_bad, format('History here is kept for at least %s days, so this table cannot keep only %s.',
                      v_floor, d ->> 'retention_days'));
      v_bad_hints := array_append(v_bad_hints, (format('REC-1 / T14 / HIS-3: %s days is the retention floor — thirty is the platform minimum and an organization may only ever raise it. Give this table %s or more.', v_floor, v_floor))::text);
    end if;
  end;

  -- REC-N-17: a default sort AND a manual row order, both load-bearing.
  if jsonb_typeof(d -> 'default_sort') is distinct from 'array' then
    v_bad := array_append(v_bad, format('a table has to say how its records are sorted by default'));
      v_bad_hints := array_append(v_bad_hints, ('REC-N-17: default_sort is an array of {field, direction}.')::text);
  end if;
  if coalesce(d ->> 'row_order', '') not in ('manual', 'sorted') then
    v_bad := array_append(v_bad, format('a table orders its rows by hand or by its sort, and this one says %s',
                    custom.said(d ->> 'row_order', 'nothing')));
      v_bad_hints := array_append(v_bad_hints, ('REC-N-17: manual row order.')::text);
  end if;

  if jsonb_typeof(d -> 'agent_writable') is distinct from 'boolean' then
    v_bad := array_append(v_bad, format('a table has to say whether an agent may write to it'));
      v_bad_hints := array_append(v_bad_hints, ('REC-66: agent_writable, default true, is declared rather than guessed.')::text);
  end if;

  -- REC-1: its fields. REC-2: exactly one of them is the title.
  v_fields := d -> 'fields';
  if jsonb_typeof(v_fields) is distinct from 'array' or jsonb_array_length(v_fields) = 0 then
    v_bad := array_append(v_bad, format('a table has to declare its fields'));
      v_bad_hints := array_append(v_bad_hints, ('REC-1: fields.')::text);
  end if;
  -- Same reason: `jsonb_array_elements` on a non-array aborts, so the questions that
  -- read the list are asked only when there is a list to read. The missing-fields problem
  -- is already collected above, and the caller is told about it in the same answer.
  if jsonb_typeof(v_fields) = 'array' then
    select array_agg(f ->> 'name') into v_names from jsonb_array_elements(v_fields) f;
  end if;
  if v_names is not null and array_position(v_names, null) is not null then
    v_bad := array_append(v_bad, format('every field of a table needs a name'));
      v_bad_hints := array_append(v_bad_hints, ('REC-1: fields.')::text);
  end if;
  v_title := d ->> 'title_field';
  if v_title is null then
    v_bad := array_append(v_bad, format('a table needs a title field, or its records cannot be shown as chips'));
      v_bad_hints := array_append(v_bad_hints, ('REC-2.')::text);
  end if;
  if v_title is not null and v_names is not null and not (v_title = any (v_names)) then
    v_bad := array_append(v_bad, format('the title field %s is not one of this table''s fields', v_title));
      v_bad_hints := array_append(v_bad_hints, ('REC-2: the title field names one of the table''s own fields.')::text);
  end if;

  -- REC-1 and REC-14: exactly ONE Home, and the Home IS the parent, so "exactly one Home"
  -- and "zero or one parent" are ONE stored fact and the Home tree is REC-7's tree.
  v_home := custom.containment_parent(d);
  if v_home is null then
    v_bad := array_append(v_bad, format('a table has to live somewhere - give it a home'));
      v_bad_hints := array_append(v_bad_hints, ('REC-1: exactly one Home, stored as this record''s parent_id. Additional Homes are relations (REC-3, REC-26).')::text);
  end if;
  -- REC-11: a detail Table's records inherit only and cannot be Homes.
  select t.data ->> 'type' into v_home_type
    from custom.record h
    join custom.record t
      on t.organization_id = h.organization_id and t.id = h.table_id
   where h.organization_id = new.organization_id and h.id = v_home;
  if v_home_type = 'detail' then
    v_bad := array_append(v_bad, format('a detail record cannot be a home'));
      v_bad_hints := array_append(v_bad_hints, ('REC-11: a detail table inherits only - its records take no direct shares and cannot be Homes.')::text);
  end if;

  -- ── SC-1 PLACEMENT (2026-09-23): WHO KEEPS THIS TABLE, AND WHETHER THE PICKER OFFERS IT. ──
  -- `kept_by_the_app` is the store's one flag for a Table the app or one of its features keeps
  -- (custom._options_table_for has always stamped it). Beside it, optionally, `kept_for` names
  -- WHICH feature in one lower-case word (context, education, dictionary, …) — only on a Table
  -- that is kept — and `offered_as_context` says whether the context picker offers the Table.
  -- Each is judged only when present; absent is the default (custom.table_placement).
  -- Judged only while the organization's store is switched on (custom/system_enabled), exactly
  -- like the rest of the store's own shape rules; switched off, the document is stored as written.
  if coalesce((platform.knob_resolve('custom', 'system_enabled', new.organization_id) #>> '{}')::boolean, false) then
    if d ? 'kept_by_the_app' and jsonb_typeof(d -> 'kept_by_the_app') is distinct from 'boolean' then
      v_bad := array_append(v_bad, format('a table says yes or no to being kept by the app'));
        v_bad_hints := array_append(v_bad_hints, ('SC-1: kept_by_the_app is true or false.')::text);
    end if;
    if d ? 'kept_for' and (jsonb_typeof(d -> 'kept_for') is distinct from 'string'
                           or coalesce(d ->> 'kept_for', '') !~ '^[a-z][a-z_]*$') then
      v_bad := array_append(v_bad, format('the feature that keeps a table is named in one lower-case word, and this one says %s',
                      custom.said(d ->> 'kept_for', 'nothing')));
        v_bad_hints := array_append(v_bad_hints, ('SC-1: kept_for is a word such as context, education or dictionary.')::text);
    end if;
    if d ? 'kept_for' and d ->> 'kept_by_the_app' is distinct from 'true' then
      v_bad := array_append(v_bad, format('only a table the app keeps says which feature keeps it'));
        v_bad_hints := array_append(v_bad_hints, ('SC-1: say kept_by_the_app = true beside kept_for, or take kept_for off.')::text);
    end if;
    if d ? 'offered_as_context' and jsonb_typeof(d -> 'offered_as_context') is distinct from 'boolean' then
      v_bad := array_append(v_bad, format('a table says yes or no to being offered in the context picker'));
        v_bad_hints := array_append(v_bad_hints, ('SC-1: offered_as_context is true or false.')::text);
    end if;
  end if;

  -- ── CHAIR-CONFIDENTIAL-STORE (2026-10-02): THE TABLE'S LEVEL AND THE PEOPLE ITS RULES NAME. ──
  -- `level` is absent (Organization, the default) or "confidential". `readers` is the record's own
  -- rules: a list of {field, level} where `field` is one of this Table's fields whose value names a
  -- person (a Person record, a person's id) or a team, and `level` is viewer (the default),
  -- commenter or editor. Only a Confidential Table names readers. Who may SET either is decided
  -- after the shape below: only the Arman-approved door.
  if d ? 'level' and (jsonb_typeof(d -> 'level') is distinct from 'string' or d ->> 'level' <> 'confidential') then
    v_bad := array_append(v_bad, format('a table is Confidential or it leaves its level out, and this one says %s', custom.said(d ->> 'level', 'nothing')));
      v_bad_hints := array_append(v_bad_hints, ('Access ladder: level is "confidential", or absent for Organization.')::text);
  end if;
  if d ? 'readers' and d ->> 'level' is distinct from 'confidential' then
    v_bad := array_append(v_bad, format('only a Confidential table names the people who may read its records'));
      v_bad_hints := array_append(v_bad_hints, ('Access ladder: readers belong to a Confidential table; take them off, or make the table Confidential.')::text);
  elsif d ? 'readers' and jsonb_typeof(d -> 'readers') is distinct from 'array' then
    v_bad := array_append(v_bad, format('a table names its readers as a list'));
      v_bad_hints := array_append(v_bad_hints, ('readers is a list of {field, level}.')::text);
  elsif d ? 'readers' then
    for v_reader in select x from jsonb_array_elements(d -> 'readers') x loop
      if jsonb_typeof(v_reader) is distinct from 'object'
         or coalesce(v_reader ->> 'field', '') = ''
         or v_names is null or not ((v_reader ->> 'field') = any (v_names)) then
        v_bad := array_append(v_bad, format('a reader is one of this table''s own fields, and %s is not', custom.said(coalesce(v_reader ->> 'field', v_reader #>> '{}'), 'nothing')));
          v_bad_hints := array_append(v_bad_hints, ('readers: {field: <a field of this table naming a person or a team>, level: viewer|commenter|editor}.')::text);
      elsif v_reader ? 'level' and coalesce(v_reader ->> 'level', '') not in ('viewer', 'commenter', 'editor') then
        v_bad := array_append(v_bad, format('a reader reads, comments or edits, and %s says %s', v_reader ->> 'field', custom.said(v_reader ->> 'level', 'nothing')));
          v_bad_hints := array_append(v_bad_hints, ('readers[].level is viewer, commenter or editor; owner and admin are not given by a field.')::text);
      end if;
    end loop;
  end if;

  -- ── THE ONE ANSWER. ───────────────────────────────────────────────────────────────────
  -- Exactly one problem raises the sentence and the hint this guard has always raised, so
  -- every suite and every screen that reads those words is unchanged. Two or more are
  -- numbered into a single refusal, each with its own meaning, so a caller fixes the whole
  -- table in one more attempt instead of one attempt per key.
  if array_length(v_bad, 1) = 1 then
    raise exception '%', v_bad[1] using errcode = '23514', hint = v_bad_hints[1];
  elsif array_length(v_bad, 1) > 1 then
    v_all := '';
    for v_i in 1 .. array_length(v_bad, 1) loop
      v_all := v_all || format('%s. %s (%s)', v_i, v_bad[v_i], v_bad_hints[v_i]);
      if v_i < array_length(v_bad, 1) then v_all := v_all || '  '; end if;
    end loop;
    raise exception 'This table cannot be declared yet - % things need fixing: %',
                    array_length(v_bad, 1), v_all
      using errcode = '23514',
            hint = 'Every problem with the table is listed above, so one more attempt can fix all of them. Nothing was created.';
  end if;

  -- ── CHAIR-CONFIDENTIAL-STORE: ONLY ARMAN MAKES A TABLE CONFIDENTIAL, AND ONLY HE CHANGES WHOM ──
  -- ── IT NAMES. The same rule as a standard table (platform.strict_class_refusal): the change is ──
  -- ── refused unless an approval in his own words was recorded for this Table in THIS transaction ──
  -- ── (platform.class_approval_by_arman, token custom.table:<id>). Leaving Confidential for ──
  -- ── Organization needs no approval. ──
  if d ->> 'level' = 'confidential'
     and (tg_op = 'INSERT'
          or old.data ->> 'level' is distinct from 'confidential'
          or (old.data -> 'readers') is distinct from (d -> 'readers'))
     and not exists (select 1 from platform.class_approval_by_arman a
                      where a.token = 'custom.table:' || new.id::text
                        and a.txid = pg_current_xact_id()
                        and a.level = 'confidential'::platform.data_class) then
    raise exception 'Refused: % would become Confidential%. Every table is Organization by default, and Confidential locks people out of their own organization''s work, so only Arman approves it. The law: common-docs/policies/access-ladder.md. If Arman approved this table in his own words, record them and make the change with custom.set_table_confidential_arman_explicitly_approved(p_table_id => %L, p_readers => ''[{"field": "<a person field>", "level": "viewer"}]'', p_arman_words => ''<his exact words>'', p_approved_on => ''<the date he said them>''). Moving a table back to Organization never needs approval.',
                    coalesce(nullif(d ->> 'name', ''), new.id::text),
                    case when tg_op = 'UPDATE' and old.data ->> 'level' = 'confidential' then ' with different readers' else '' end,
                    new.id
      using errcode = '42501';
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.table_placement(p_organization_id uuid, p_table_id uuid, p_data jsonb, p_is_kernel boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  -- WHO KEEPS A TABLE, AND WHETHER THE CONTEXT PICKER OFFERS IT (lane SC-1 PLACEMENT).
  --   kept_by_the_app     the store's one flag: true = the app or one of its features keeps it,
  --                       false = the organization's own. Stored, or read off the older facts.
  --   kept_for            WHICH feature: the stored word (context, education, dictionary, …),
  --                       else the one the older facts say, else `app`. Null when not kept.
  --   offered_as_context  whether the context picker offers the Table. Stored, else false: only
  --                       a Table somebody marked (a scope type the mover lands) is a context.
  select jsonb_build_object(
           'kept_by_the_app', d.kept,
           'kept_for', case when d.kept then coalesce(nullif(btrim(p_data ->> 'kept_for'), ''), d.word, 'app') end,
           'offered_as_context',
             case when jsonb_typeof(p_data -> 'offered_as_context') = 'boolean'
                  then (p_data ->> 'offered_as_context')::boolean else false end)
    from (select w.word,
                 (w.word is not null
                  or coalesce(p_data ->> 'kept_by_the_app', '') = 'true'
                  or coalesce(btrim(p_data ->> 'kept_for'), '') <> '') as kept
            from (select custom.table_kept_for_derived(
                           p_data, p_is_kernel,
                           case when p_is_kernel then false
                                -- the Field graph, asked here and not through custom.table_is_options_table: that
                                -- function is WRITE-PERF-4's and its inverse removes it
                                -- (check:inverses-leave-the-ground-standing, clause d).
                                else exists (select 1 from custom.record f
                                              where f.organization_id = p_organization_id
                                                and f.table_id = custom.field_kernel_id()
                                                and f.deleted_at is null
                                                and f.data ->> 'type' = 'list'
                                                and f.data -> 'config' ->> 'options_table_id' = p_table_id::text) end) as word) w) d
$function$;

CREATE OR REPLACE FUNCTION custom.data_home(p_organization_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_include_app_tables boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
-- THE DATA HOME IN ONE CALL (lane DATA-HOME-2, chair ruling 2026-09-29). The page asked three doors —
-- custom.data_home_tables, custom.data_home_items, custom.data_home_changed_by — and each paid the
-- walk of which Tables she may open (custom.tables_seen_once_per_group). This door asks the walk ONCE, for all
-- the person's organizations (or the one named), and then calls those three doors in this same
-- statement: each finds its organizations already answered in the statement memo and does not walk
-- them again. The rows are therefore the three doors' own, unchanged:
--   tables      = custom.data_home_tables(p_organization_id), every column
--   items       = custom.data_home_items(p_organization_id), every column
--   changed_by  = custom.data_home_changed_by(asks) where asks names, per organization, every row
--                 the page shows who-changed-it for: Tables and dashboards, digests, checklists and
--                 boards as 'structure', forms and booking pages as 'form', portals as 'portal'
--                 (outside shares have none), at most 500 ids an ask and 200 asks a call.
-- SEARCHED (lane DATA-HOME-3B, 2026-10-01): p_search narrows those same rows to the ones that match and
-- ranks them (see the campaign file's header); unsearched, nothing below the walk changes.
-- APP TABLES (lane CHAIR-DOORS-2, v6 N-C8, 2026-10-02): a Table the app keeps out of every default
-- list (custom.table_kept_out_of_lists — today the outputs an agent lands, kept_for agent_output) is
-- not among the tables unless p_include_app_tables is true — the page's "Show app tables" switch.
-- It is handed to custom.data_home_tables as is; it narrows, never widens, and searched rows obey it.
declare
  v_me      uuid := custom.query_principal();
  v_q       text := nullif(btrim(coalesce(p_search, '')), '');
  v_qid     uuid;
  v_tables  jsonb;
  v_items   jsonb;
  v_asks    jsonb;
  v_changed jsonb := '[]'::jsonb;
  v_part    jsonb;
  v_n       integer;
  v_i       integer := 0;
begin
  -- THE DOOR DECIDES, FIRST, IN ITS OWN NAME: an organization named is one the caller may reach, or
  -- the call is refused here, naming this door. Named nobody, the doors below admit only
  -- organizations the caller reaches.
  if p_organization_id is not null then
    perform custom.assert_client_may_reach(p_organization_id, 'custom.data_home');
  end if;
  if v_q is not null and length(v_q) > 200 then
    raise exception 'custom.data_home searches at most 200 characters; this search has %.', length(v_q)
      using errcode = '22023', hint = 'Search for a shorter phrase. Nothing was read.';
  end if;
  if v_me is null then
    return jsonb_build_object('tables', '[]'::jsonb, 'items', '[]'::jsonb, 'changed_by', '[]'::jsonb);
  end if;

  -- THE ONE WALK, for every organization of hers at once (the same organizations the three doors ask).
  perform count(*)
     from custom.tables_seen_once_per_group(v_me, array(
            select m.organization_id
              from iam.organization_member m
              join iam.organizations o on o.id = m.organization_id and o.archived_at is null
             where m.user_id = v_me
               and (p_organization_id is null or m.organization_id = p_organization_id)));

  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_tables
    from custom.data_home_tables(p_organization_id, p_include_app_tables) t;
  select coalesce(jsonb_agg(to_jsonb(i)), '[]'::jsonb) into v_items
    from custom.data_home_items(p_organization_id) i;

  if v_q is not null then
    -- A WHOLE ID PASTED IN finds its row outright; any shorter run of hex never matches an id.
    if v_q ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      v_qid := v_q::uuid;
    end if;

    -- THE TABLES SHE MAY OPEN (above), ranked on title, description and Fields.
    with t as (
      select e as row_, (e ->> 'table_id')::uuid as id, (e ->> 'organization_id')::uuid as org,
             coalesce(e ->> 'table_name', '') as nm, (e ->> 'updated_at')::timestamptz as at
        from jsonb_array_elements(v_tables) e
    ), d as (
      -- the Table's own description, read from the very Table record listed above
      select r.id, nullif(btrim(r.data ->> 'description'), '') as descr
        from t
        join custom.record r
          on r.organization_id = t.org
         and r.id = t.id
         and r.table_id = custom.table_kernel_id()
    ), f as (
      -- its live Fields (custom.applicable_fields' own rule: data.entity_definition_id = the Table)
      select (fr.data ->> 'entity_definition_id') as tid,
             array_agg(coalesce(nullif(btrim(fr.data ->> 'label'), ''), fr.data ->> 'key')
                       order by (fr.data ->> 'sort') nulls last, fr.id) as labels,
             array_agg(coalesce(fr.data ->> 'key', '') order by (fr.data ->> 'sort') nulls last, fr.id) as keys
        from custom.record fr
       where fr.organization_id = any (array(select distinct t.org from t))
         and fr.table_id = custom.field_kernel_id()
         and fr.deleted_at is null
         and (fr.data ->> 'entity_definition_id') in (select t.id::text from t)
       group by 1
    ), s as (
      select t.row_, t.nm, t.at, d.descr, f.labels, f.keys,
             public.mtx_search_score(v_q, case when v_qid is not null then t.id end, t.nm, d.descr,
                                     null, null, coalesce(f.labels, '{}'), coalesce(f.keys, '{}')) as rank,
             (v_qid is not null and t.id = v_qid) as by_id
        from t
        left join d on d.id = t.id
        left join f on f.tid = t.id::text
    ), hit as (
      select s.*,
             case
               when s.by_id then 'id'
               when public.mtx_search_score(v_q, null, s.nm, null, null, null) > 0 then 'name'
               when public.mtx_search_score(v_q, null, null, s.descr, null, null) > 0 then 'description'
               when public.mtx_search_score(v_q, null, null, null, null, null, coalesce(s.labels, '{}'), coalesce(s.keys, '{}')) > 0 then 'field'
               -- several words spread over title, description and Fields: say where the first word is
               when position(split_part(lower(v_q), ' ', 1) in lower(s.nm)) > 0 then 'name'
               when position(split_part(lower(v_q), ' ', 1) in lower(coalesce(s.descr, ''))) > 0 then 'description'
               else 'field'
             end as matched_in
        from s
       where s.rank > 0
    )
    select coalesce(jsonb_agg(
             h.row_ || jsonb_build_object(
               'match_rank', h.rank,
               'matched_in', h.matched_in,
               'matched_field', case when h.matched_in = 'field' then
                  (select coalesce(l.label, k.key)
                     from unnest(coalesce(h.labels, '{}')) with ordinality as l(label, o)
                     full join unnest(coalesce(h.keys, '{}')) with ordinality as k(key, o) using (o)
                    where position(split_part(lower(v_q), ' ', 1) in lower(coalesce(l.label, ''))) > 0
                       or position(split_part(lower(v_q), ' ', 1) in lower(coalesce(k.key, ''))) > 0
                    -- the Field that holds the whole search first, then the first that holds its first word
                    order by (position(lower(v_q) in lower(coalesce(l.label, ''))) > 0) desc,
                             (position(lower(v_q) in lower(coalesce(k.key, ''))) > 0) desc,
                             o
                    limit 1) end)
             order by h.rank desc, length(h.nm), h.at desc nulls last, h.nm), '[]'::jsonb)
      into v_tables
      from hit h;

    -- THE REST THE HOME LISTS (forms, booking pages, portals, dashboards, digests, checklists,
    -- automations, outside shares), ranked on their own title and description.
    with i as (
      select e as row_,
             coalesce(e -> 'item_row' ->> 'title', e -> 'item_row' ->> 'name', e -> 'item_row' ->> 'label', '') as nm,
             nullif(btrim(e -> 'item_row' ->> 'description'), '') as descr,
             (e ->> 'item_id')::uuid as id
        from jsonb_array_elements(v_items) e
    ), s as (
      select i.*,
             public.mtx_search_score(v_q, case when v_qid is not null then i.id end, i.nm, i.descr, null, null) as rank,
             (v_qid is not null and i.id = v_qid) as by_id
        from i
    )
    select coalesce(jsonb_agg(
             s.row_ || jsonb_build_object(
               'match_rank', s.rank,
               'matched_in', case when s.by_id then 'id'
                                  when public.mtx_search_score(v_q, null, null, s.descr, null, null) > 0
                                   and public.mtx_search_score(v_q, null, s.nm, null, null, null) = 0 then 'description'
                                  else 'name' end,
               'matched_field', null)
             order by s.rank desc, length(s.nm), s.nm), '[]'::jsonb)
      into v_items
      from s
     where s.rank > 0;
  end if;

  -- THE MAKER, BY NAME (lane DATA-HOME-3B2, 2026-10-01). Every Table row gains created_by_name: the
  -- name custom.history_people gives its maker (created_by) in the Table's own organization — the
  -- same door that names who changed a row on this page (custom.hub_changed_by), so Owner and
  -- Changed by never disagree about a person's name. Only a member of that organization is named;
  -- a maker who is not one (left, or never was) is null and the page shows its dash. One
  -- history_people call per organization, after any search narrowing; row order is kept.
  with mk as (
    select (e ->> 'organization_id')::uuid as org, array_agg(distinct (e ->> 'created_by')::uuid) as ids
      from jsonb_array_elements(v_tables) e
     where e ->> 'created_by' is not null
     group by 1
  ), people as materialized (
    -- asked once per organization (materialized: never once per row)
    select mk.org, custom.history_people(mk.org, mk.ids) as m from mk
  )
  select coalesce(jsonb_agg(t.e || jsonb_build_object('created_by_name', p.m #>> array[t.e ->> 'created_by', 'name'])
                  order by t.o), '[]'::jsonb)
    into v_tables
    from jsonb_array_elements(v_tables) with ordinality as t(e, o)
    left join people p on p.org = (t.e ->> 'organization_id')::uuid;

  with ids as (
    select x.organization_id as org, 'structure'::text as k, x.table_id as id
      from jsonb_to_recordset(v_tables) as x(organization_id uuid, table_id uuid)
    union
    select x.organization_id,
           case x.kind when 'form' then 'form' when 'booking' then 'form' when 'portal' then 'portal'
                       else 'structure' end,
           x.item_id
      from jsonb_to_recordset(v_items) as x(kind text, organization_id uuid, item_id uuid)
     where x.kind <> 'share'
  ), chunked as (
    select org, k, id, (row_number() over (partition by org, k order by id) - 1) / 500 as c from ids
  )
  select jsonb_agg(jsonb_build_object('organization_id', org, 'kind', k, 'ids', ids) order by org, k, c)
    into v_asks
    from (select org, k, c, jsonb_agg(id order by id) as ids from chunked group by org, k, c) q;

  v_n := coalesce(jsonb_array_length(v_asks), 0);
  while v_i < v_n loop
    select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) into v_part
      from custom.data_home_changed_by(
             (select jsonb_agg(e order by o) from jsonb_array_elements(v_asks) with ordinality as a(e, o)
               where o > v_i and o <= v_i + 200)) c;
    v_changed := v_changed || v_part;
    v_i := v_i + 200;
  end loop;

  if v_q is null then
    return jsonb_build_object('tables', v_tables, 'items', v_items, 'changed_by', v_changed);
  end if;
  return jsonb_build_object('tables', v_tables, 'items', v_items, 'changed_by', v_changed, 'search', v_q);
end;
$function$;

drop view custom.table;
create view custom.table
with (security_invoker = true) as
 SELECT id,
    organization_id,
    COALESCE(data ->> 'slug'::text, lower(data ->> 'name'::text)) AS slug,
    data ->> 'name'::text AS name,
    COALESCE(data ->> 'label_singular'::text, data ->> 'name'::text) AS label_singular,
    COALESCE(data ->> 'label_plural'::text, custom.plural_of(data ->> 'name'::text)) AS label_plural,
    data ->> 'icon'::text AS icon,
    data ->> 'color'::text AS color,
    COALESCE(data ->> 'type'::text, 'entity'::text) AS type,
    COALESCE(data ->> 'type'::text, 'entity'::text) = 'detail'::text AS detail,
    data ->> 'parent_token'::text AS parent_token,
    COALESCE((data ->> 'agent_writable'::text)::boolean, true) AS agent_writable,
    COALESCE(data ->> 'display'::text, 'list'::text) AS display,
    COALESCE((data ->> 'ordered'::text)::boolean, false) AS ordered,
    COALESCE(data ->> 'weight'::text, 'light'::text) AS weight,
    COALESCE((data ->> 'retention_days'::text)::integer, 30) AS retention_days,
    data ->> 'title_field'::text AS title_field,
    COALESCE(data -> 'fields'::text, '[]'::jsonb) AS fields,
    COALESCE(data -> 'default_sort'::text, '[]'::jsonb) AS default_sort,
    COALESCE(data ->> 'row_order'::text, 'sorted'::text) AS row_order,
    custom.containment_parent(data) AS home_id,
    data_class = 'kernel'::text AS is_kernel,
    created_by,
    updated_by,
    created_at,
    updated_at,
    version,
    metadata,
    visibility,
    data,
    (custom.table_placement(organization_id, id, data, data_class = 'kernel'::text) ->> 'kept_by_the_app'::text)::boolean AS kept_by_the_app,
    custom.table_placement(organization_id, id, data, data_class = 'kernel'::text) ->> 'kept_for'::text AS kept_for,
    (custom.table_placement(organization_id, id, data, data_class = 'kernel'::text) ->> 'offered_as_context'::text)::boolean AS offered_as_context
   FROM custom.record r
  WHERE table_id = custom.table_kernel_id() AND deleted_at IS NULL;
comment on view custom.table is 'REC-1, REC-25, REC-66, REC-N-17. A PROJECTION over custom.record, never a second relation: a Table IS a Record, so its id is its record id and its base contract is custom.record''s own certified columns. REC-1''s `detail` and REC-66''s `type` are ONE stored property - `type` is stored, `detail` is derived - so no row can say both. security_invoker: every caller reads it under their own row-level security.';

create temp table _fd_facts_acl on commit drop as
  select a.grantee::regrole::text as grantee
    from pg_proc p, aclexplode(p.proacl) a
   where p.oid = 'custom.table_facts(uuid)'::regprocedure and a.privilege_type = 'EXECUTE'
     and a.grantee <> p.proowner;
drop function custom.table_facts(uuid);
CREATE FUNCTION custom.table_facts(p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(table_id uuid, visibility text, mine boolean, kept_by_the_app boolean, kept_for text, offered_as_context boolean, keeper_group text, keeper_says text, used_in_kind text, used_in_id uuid, used_in_table_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me uuid := custom.query_principal();
  v_org uuid;
begin
  -- NO ORGANIZATION NAMED = the optional organization FILTER left off (org-filter sweep, 2026-09-29):
  -- the facts of every Table the caller may open in every organization she belongs to, each
  -- organization asked through this same door with its name (its own wall, its own ladder). A
  -- refusing organization (42501) contributes nothing. No permission is changed by this branch.
  if p_organization_id is null then
    if v_me is null then
      return;
    end if;
    for v_org in
      select m.organization_id
        from iam.organization_member m
        join iam.organizations o on o.id = m.organization_id and o.archived_at is null
       where m.user_id = v_me
    loop
      begin
        return query select * from custom.table_facts(v_org);
      exception when insufficient_privilege then
        continue;
      end;
    end loop;
    return;
  end if;

  perform custom.assert_client_may_reach(p_organization_id, 'custom.table_facts');
  return query
    with t as (
      select r.id, r.visibility, r.created_by, r.data,
             custom.table_placement(r.organization_id, r.id, r.data, r.data_class = 'kernel') as p
        from custom.record r
       where r.organization_id = p_organization_id
         and r.table_id = custom.table_kernel_id()
         and r.deleted_at is null
         and r.id in (select v from custom.query_visible_ids(p_organization_id,
                                                             custom.table_kernel_id()) v)
    ),
    -- WHICH COLUMN USES EACH CHOICES TABLE: the list Field whose config names it. The first
    -- one made, when several share it.
    uses as (
      select distinct on (nullif(f.data -> 'config' ->> 'options_table_id', '')::uuid)
             nullif(f.data -> 'config' ->> 'options_table_id', '')::uuid as options_table_id,
             coalesce(nullif(f.data ->> 'label', ''), f.data ->> 'key') as column_label,
             nullif(f.data ->> 'entity_definition_id', '')::uuid as of_table
        from custom.record f
       where f.organization_id = p_organization_id
         and f.table_id = custom.field_kernel_id()
         and f.deleted_at is null
         and f.data ->> 'type' = 'list'
         and nullif(f.data -> 'config' ->> 'options_table_id', '') is not null
       order by nullif(f.data -> 'config' ->> 'options_table_id', '')::uuid, f.created_at
    )
    select t.id,
           t.visibility::text,
           (v_me is not null and t.created_by = v_me),
           (t.p ->> 'kept_by_the_app')::boolean,
           t.p ->> 'kept_for',
           (t.p ->> 'offered_as_context')::boolean,
           s.keeper_group,
           s.keeper_says,
           case when not (t.p ->> 'kept_by_the_app')::boolean then null else coalesce(s.used_in_kind, 'table') end,
           case when not (t.p ->> 'kept_by_the_app')::boolean then null else coalesce(s.used_in_id, t.id) end,
           case when not (t.p ->> 'kept_by_the_app')::boolean then null
                else coalesce(s.used_in_table_id, case when coalesce(s.used_in_kind, 'table') = 'table' then coalesce(s.used_in_id, t.id) end) end
      from t
      left join lateral (
        select t.p ->> 'kept_for' as word,
               case t.p ->> 'kept_for'
                 when 'context'  then nullif(t.data -> 'scope_binding' ->> 'scope_id', '')
                 when 'workflow' then nullif(t.data ->> 'parent_id', '')
                 when 'app'      then substring(coalesce(t.data ->> 'slug', '') from '^records_ui_([a-z]+)')
               end as ref
      ) kw on true
      left join uses u on u.options_table_id = t.id
      left join t ut on ut.id = u.of_table                     -- only a table the caller can open is named
      left join t wt on kw.word = 'workflow' and wt.id::text = kw.ref
      -- SCOPES-READS-REST (2026-09-29): the scope a context Table belongs to is a live Record of the store.
      left join lateral (select r.id, r.data ->> 'name' as name
                           from custom.record r
                          where kw.word = 'context' and r.organization_id = p_organization_id
                            and r.id::text = kw.ref and r.data_class = 'record' and r.deleted_at is null) sc on true
      left join lateral (
        select
          case
            when not (t.p ->> 'kept_by_the_app')::boolean then null
            when kw.word = 'choices' then 'The choices behind your columns'
            when kw.word = 'context' then 'The context system'
            when kw.word = 'checklists' then 'Checklists'
            when kw.word = 'bookings' then 'Bookings'
            when kw.word = 'workflow' then 'Workflows'
            when kw.word = 'store' then 'The store itself'
            when kw.word = 'app' then 'The app'
            else initcap(replace(kw.word, '_', ' '))
          end as keeper_group,
          case
            when not (t.p ->> 'kept_by_the_app')::boolean then null
            when kw.word = 'choices' and u.options_table_id is not null and ut.id is not null
              then format('Kept by the %s column of %s: it holds that column''s choices and opens from there.',
                          u.column_label, coalesce(nullif(ut.data ->> 'name', ''), 'a table'))
            when kw.word = 'choices' and u.options_table_id is not null
              then format('Kept by the %s column of a table you cannot open: it holds that column''s choices.', u.column_label)
            when kw.word = 'choices'
              then 'Kept for a column''s choices. No column uses it now, so only its own page opens it.'
            when kw.word = 'context' and sc.id is not null
              then format('Kept by the context system: it belongs to %s and opens from there.', sc.name)
            when kw.word = 'context' and coalesce((t.p ->> 'offered_as_context')::boolean, false)
              then format('Kept by the context system: each %s in it is a context you can pick for an agent, and opens on its own page.',
                          lower(coalesce(nullif(t.data ->> 'label_singular', ''), 'record')))
            when kw.word = 'context'
              then 'Kept by the context system.'
            when kw.word = 'checklists'
              then 'Kept by checklists: the steps of every checklist run in this organization.'
            when kw.word = 'bookings'
              then format('Kept by bookings: the times people are holding on %s.',
                          coalesce(nullif(regexp_replace(coalesce(t.data ->> 'name', ''), '^Slots for ', ''), ''), 'a booking page'))
            when kw.word = 'workflow' and wt.id is not null
              then format('Kept by the workflow of %s: the states its records move through.', coalesce(nullif(wt.data ->> 'name', ''), 'a table'))
            when kw.word = 'workflow'
              then 'Kept by a table''s workflow: the states its records move through.'
            when kw.word = 'store'
              then 'Part of the store itself: every table is built on it.'
            when kw.word = 'app' and kw.ref is not null
              then 'Kept by the app: ' || case kw.ref
                     when 'view' then 'the saved views of the tables here.'
                     when 'comment' then 'the comments people leave on records.'
                     when 'form' then 'the forms made on the tables here.'
                     when 'dashboard' then 'the dashboards made on the tables here.'
                     when 'action' then 'the action inbox.'
                     when 'checklist' then 'the checklist runs.'
                     when 'slots' then 'the times people are holding on a booking page.'
                     when 'demo' then 'a demonstration of the app''s screens.'
                     when 'shapeproof' then 'a demonstration of the app''s screens.'
                     else 'its own bookkeeping.' end
            when kw.word = 'app' then 'Kept by the app.'
            else format('Kept by %s.', replace(kw.word, '_', ' '))
          end as keeper_says,
          case
            when kw.word = 'context' and sc.id is not null then 'scope'
            when kw.word = 'choices' and ut.id is not null then 'table'
            when kw.word = 'workflow' and wt.id is not null then 'table'
          end as used_in_kind,
          case
            when kw.word = 'context' and sc.id is not null then sc.id
            when kw.word = 'choices' and ut.id is not null then ut.id
            when kw.word = 'workflow' and wt.id is not null then wt.id
          end as used_in_id,
          case
            when kw.word = 'choices' and ut.id is not null then ut.id
            when kw.word = 'workflow' and wt.id is not null then wt.id
          end as used_in_table_id
      ) s on true;
end;
$function$;
comment on function custom.table_facts(uuid) is 'Per Table the caller can already open: who can see it (visibility), whether the CALLER made it (mine), and — SC-1 PLACEMENT — whether the app keeps it (kept_by_the_app) and for which feature (kept_for), whether the context picker offers it, the plain sentence that says who keeps it (keeper_says, grouped by keeper_group) and where it is used (used_in_kind table|scope + used_in_id, used_in_table_id). A table the organization keeps answers null for the last five.';
do $$
declare r record;
begin
  for r in select grantee from _fd_facts_acl loop
    execute format('grant execute on function custom.table_facts(uuid) to %I', r.grantee);
  end loop;
end $$;

drop function custom.table_is_foundation(jsonb);
