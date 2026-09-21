-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: agent._seed_org_default_tools() 2bcbeb219b56d6abf8839c7d8346a4a70da6d536af9272320138244462dbe1ca
-- based-on: custom._checklist_watch_stmt_update() a509d896a50cf00db47cc442d93a70bf57d459579eb581b9a83421680a7e0e76
-- based-on: custom._entity_custom_fields_guard() feafba001d6dc2e73db09a5fa96c1c48eeae9830033032059052137da170a24a
-- based-on: custom._field_type_converts_values() e415f8c164a4588b4d50ce1602a61913f15e68414c9d3227ffae8a5f22b3e670
-- based-on: custom._resolve_choice_words() 1527c4a0893a462ee9b1a95ed904e9f9f9c44a87f606dc28bc54646504bfa88e
-- based-on: custom._table_shape_guard() f056de257d125ab408fcc935f9e0f4e67e9b5190eda8fbfbc988f1853a152158
-- based-on: custom.migrate_purge(uuid, uuid, boolean) 2eff4d374690e146d16c6a27719f78aacffcbf442c2da319eda1988ddb72dbc6
-- based-on: custom.trg_associations_bump_visibility() 940e8f650a896027eecee2b8ea4c28facf434f4c2d30f659ec660f6a479c0f82
-- based-on: history.migration_undo(uuid, uuid) 0a011e376afa3179aa73d58c5cf636699bcb3d2460f0eaa7b6c6bb858df66890
-- based-on: history.retention_days(uuid, uuid) 57d79e11cd532fe6014ac4b7723c8cc12f2585e0638be888d4a732f2403ab498
-- based-on: iam._one_owner_guard() e304bb34655fb458ed28b76243dde6e408b3e0912a009f17b9f3752f9454f366
-- based-on: iam._per_table_grant_guard() 3238af0fd8b9756ebbe4150b2c17322ff69eee1d22e3415a1c3809ce0deaeadd
-- based-on: iam.access_arms_from_sources(uuid, uuid, text, uuid, uuid) 74dea71b1c126400279885d8d0a475f76a31a4e66769fdee0ee3bbc4e8a0ad27
-- based-on: iam.member_lane_confers(uuid, uuid, text, uuid, uuid) b8fd870f818f1f7a480d263a027d96206d9b3addc5b7a71459c24bf78bd26cf2
-- based-on: iam.member_level_justified(uuid, uuid, uuid) 44c2a448bb330cf0872f7879d2f700119c2caf1d7828110c873076ab16347c2f
-- based-on: platform.unified_data_store_on(uuid) 2fb21b33777b0628a86646d1b7de750908403c263ae46ea12c635018c044d8af
-- based-on: platform.unified_data_store_state(uuid) 698cb7215fec052445c616b96b88539e8a1a6a6e1a8bc060280ac3ea2d772e5b
--
-- RED-SUITES — THE STORE HAS ONE SWITCH AGAIN, AND SEVENTEEN BODIES ASK IT.
--
-- THE DEFECT, MEASURED. `limitsfix_the_store_default_is_a_read_not_a_row.sql` (2026-09-21)
-- gave `custom.store_is_open` a second arm: an organization born after
-- 2026-09-21 01:30:44+00 with no override of its own reads the store as ON, because the
-- alternative — a row written at birth — collided with 129 suites' own INSERTs. That was the
-- right call. But the same four-line knob read had been COPIED into seventeen other bodies,
-- each of which says in a comment that it is "`custom.store_is_open`'s own body, spelled out
-- here", and none of which moved. From that instant the platform had TWO switches that
-- disagree for every organization anyone has made since:
--
--   $ select custom.store_is_open(o), iam.member_lane_confers(dana, o, 'record', rec);
--     t | (null)
--
-- WHAT THAT COST A PERSON, and it is not theoretical — it is `vis2_green` 1a failing on main
-- ("with the knob unset, a member does not see the record"):
--   · `iam.member_lane_confers`, `iam.access_arms_from_sources`, `iam.member_level_justified`
--     — the store is ON, writes land, and a plain MEMBER of that organization sees NOTHING,
--     because the membership lane reads the store closed and returns null.
--   · `platform.unified_data_store_state` / `unified_data_store_on` — the settings screen
--     TELLS the owner the store is off while her people are writing to it. A screen that
--     says the opposite of what the door does is the "screen never lies" law broken by a
--     copy-paste.
--   · `history.retention_days` — the Table's declared retention is ignored and the floor is
--     returned instead, silently.
--   · the guards `custom._table_shape_guard`, `custom._field_type_converts_values`,
--     `custom._entity_custom_fields_guard`, `custom._resolve_choice_words`,
--     `custom._checklist_watch_stmt_update`, `custom.trg_associations_bump_visibility`,
--     `iam._one_owner_guard`, `iam._per_table_grant_guard` — each returns on its first line
--     for an organization whose store is in fact open, so the store's own shape rules are
--     not enforced on the newest organizations at all.
--   · `custom.migrate_purge`, `history.migration_undo`, `agent._seed_org_default_tools`.
--
-- THE FIX IS THE CLASS, NOT THE INSTANCE. Every one of these bodies now CALLS
-- `custom.store_is_open(<organization>)`. One switch, one body, one answer; a future change
-- to what "the store is on" means cannot leave sixteen bodies behind again. Nothing else in
-- any body changes — each is its live definition with that one expression replaced, so the
-- OFF path is byte-for-byte what it is today and the ON path is what the door already says.
--
-- WHY THE COMMENTS SAID TO INLINE IT, AND WHY THAT REASON IS SPENT. Two of them cite the
-- runner's `guardUnreadBy` check: a guarded replacement whose body never NAMES its knob is
-- refused, and it is right to be. That check reads the WHOLE FILE, and `custom/system_enabled`
-- is named all through this one — including inside the bodies themselves, which still say in
-- their own words which switch holds them off. The other reason given was cost:
-- `custom.store_is_open` is STABLE and the planner caches it per transaction exactly as the
-- inlined `platform.knob_resolve` (itself memoised) was.
--
-- NOT CHANGED, DELIBERATELY: `public.prune_high_volume_logs` reads the knob at the PLATFORM
-- rung (`p_organization_id => null`), which is a different question from "is this
-- organization's store open" and has no per-organization default to inherit.
--
-- GUARDED BY `pnpm check:one-store-switch`, which fails on any function body that spells the
-- read out again instead of asking the door.

-- 🚨 APPLY `redsuites_the_store_door_is_reachable.sql` FIRST. Six of the bodies below are
-- SECURITY INVOKER (three of them triggers on live `iam`/`custom` tables), so they ask the
-- switch as whoever is writing. `platform.knob_resolve` is granted to seven roles and
-- `custom.store_is_open` to two, so without that file this change NARROWS who can write —
-- a `permission denied for function store_is_open` where `knob_resolve` answered. A GRANT is
-- refused by the production allow-list by name, so it is its own chair step.

-- ── agent._seed_org_default_tools() ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION agent._seed_org_default_tools()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
    v_defaults uuid[];
begin
    -- Only a writer who said nothing about tools gets the organization's default set.
    if new.tools is not null and cardinality(new.tools) > 0 then
        return new;
    end if;
    -- THE OFF SWITCH, READ HERE AND NOT ONLY INSIDE THE HELPER. With
    -- `custom/system_enabled` off for this organization there is nothing this seed can
    -- add, and the old path — an agent carrying exactly the tools its writer sent — is
    -- reached without touching a second function.
    if not custom.store_is_open(new.organization_id) then
        return new;
    end if;
    v_defaults := agent.default_tool_ids_for_organization(new.organization_id);
    if cardinality(v_defaults) > 0 then
        new.tools := v_defaults;
    end if;
    return new;
end;
$function$

;

-- ── custom._checklist_watch_stmt_update() ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION custom._checklist_watch_stmt_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  -- THE TWO ROWS ARE `custom.record` BY DECLARATION. A `record` variable holding a whole-row
  -- reference from a transition table carries the generic `record` type, which is what broke
  -- this; a declared composite cannot.
  k      record;
  nrow   custom.record;
  orow   custom.record;
  v_org  uuid := null;
  v_open boolean := false;
begin
  for k in
    select n.organization_id as org_id, n.id as rec_id
      from new_rows n
      join old_rows o on o.organization_id = n.organization_id and o.id = n.id
     where n.data_class = 'record' and n.deleted_at is null
       and (n.data ? 'run_id'
            or (n.table_id is not null and exists (
                  select 1 from custom.record c
                   where c.organization_id = n.organization_id
                     and c.data_class = 'checklist_template'
                     and c.deleted_at is null
                     and (c.data #>> '{trigger,table_id}') = n.table_id::text
                     and coalesce(c.data #>> '{trigger,kind}', 'manual') = 'status_reached')))
     order by n.id
  loop
    -- THE OFF SWITCH, once per organization. `order by n.id` does not group by organization,
    -- so the answer is cached against the last organization asked and re-asked whenever it
    -- changes — never once per row, and never assumed.
    if v_org is distinct from k.org_id then
      v_org := k.org_id;
      begin
        v_open := custom.store_is_open(k.org_id);
      exception when others then
        v_open := false;
      end;
    end if;
    if not v_open then
      continue;
    end if;
    select * into nrow from new_rows w where w.organization_id = k.org_id and w.id = k.rec_id;
    select * into orow from old_rows w where w.organization_id = k.org_id and w.id = k.rec_id;
    perform custom._checklist_watch_for('UPDATE', orow, nrow);
  end loop;
  return null;
end;
$function$

;

-- ── custom._entity_custom_fields_guard() ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION custom._entity_custom_fields_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_org     uuid;
  v_token   text := tg_argv[0];
  v_doc     jsonb;
  v_old     jsonb;
  v_actor   text;
  v_obo     text;
  v_fields  custom.record[];
  v_values  jsonb;
  v_keys    text[];
  v_key     text;
  v_refusal text;
  v_open    boolean;
begin
  -- GUARD-SWITCH (2026-09-19), B1's move, unchanged. This used to read
  -- `custom/entity_custom_fields_guard`, which was false platform-wide with no rung that
  -- could turn any on, so a `custom_fields` document on a standard Entity table was never
  -- validated for anybody. It follows the organization's own store switch: an organization
  -- whose store is OFF answers byte for byte as it does today.
  begin
    v_org := to_jsonb(new) ->> 'organization_id';
  exception when others then
    v_org := null;
  end;
  if v_org is null then
    return new;
  end if;
  -- THE SWITCH, READ BY NAME AND EXACTLY ONCE. This is `custom.store_is_open`'s own body,
  -- spelled out here rather than called: the runner refuses a guarded replacement whose
  -- body never NAMES the knob that is supposed to hold it off (`guardUnreadBy`, ATTACK-6
  -- finding 2), and it is right to — a switch a body never names is a comment. Spelling it
  -- out also keeps this to ONE knob read on a path that now fires on every INSERT into 643
  -- tables, some of them busy. The rule is the store's own and unchanged: a switch this
  -- writer cannot read is CLOSED, never open. While it answers false the row is written
  -- byte for byte as it is today.
  begin
    v_open := custom.store_is_open(v_org);
  exception when others then
    v_open := false;
  end;
  if not v_open then
    return new;
  end if;

  -- A ROW WITH NO CUSTOM FIELDS HAS NONE, AND THAT IS NOT A MALFORMED WRITE.
  -- `crm.party.custom_fields` — the one column that existed before this lane — is NULLABLE
  -- with no default, so `to_jsonb(new) -> 'custom_fields'` is JSON `null`, which `coalesce`
  -- does not catch because it is not SQL NULL. The first version of this guard therefore
  -- refused every INSERT into `crm.party` for a store-ON organization with "this write gives
  -- them as null" — trading one outage for another. Measured from the seat immediately after
  -- that apply, which is why it is a sentence here and not a story.
  -- Absent, SQL NULL and JSON null all mean the same thing and are read as the empty set.
  -- A value that is genuinely the wrong SHAPE — a string, a number, an array — is still
  -- refused by name, which is what that refusal was always for.
  v_doc := to_jsonb(new) -> 'custom_fields';
  if v_doc is null or jsonb_typeof(v_doc) = 'null' then
    v_doc := '{}'::jsonb;
  elsif jsonb_typeof(v_doc) <> 'object' then
    raise exception 'The custom fields of a % are a set of named values, and this write gives them as %.',
      v_token, jsonb_typeof(v_doc)
      using errcode = '22023',
            hint = 'REC-40: custom_fields is one jsonb object per row - {"key": value}. Nothing was written.';
  end if;
  v_old := case when tg_op = 'UPDATE' then to_jsonb(old) -> 'custom_fields' else null end;
  if v_old is null or jsonb_typeof(v_old) = 'null' then
    v_old := '{}'::jsonb;
  end if;

  -- A WRITE THAT CHANGES NO CUSTOM VALUE ASSERTS NOTHING AND HAS NO AUTHOR TO RECORD. This
  -- is `custom._value_envelope`'s own rule, for the same reason: an UPDATE touching only the
  -- row's real columns must not re-author values nobody touched.
  if tg_op = 'UPDATE' and v_old is not distinct from v_doc then
    return new;
  end if;

  -- 1. THE DEFINITIONS DECIDE. FLD-8: the Fields of a STANDARD table are the field-kernel
  -- records carrying this table's registry token, and there is no per-table list anywhere.
  perform custom.validate_custom_fields(v_token, v_org, v_doc);

  select array_agg(f) into v_fields
    from custom.record f
   where f.organization_id = v_org
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and f.data ->> 'table_token' = v_token;

  -- NOTHING DECLARED, NOTHING TO ENVELOPE. An organization that has added no custom field to
  -- this table gets exactly the document it wrote, byte for byte, as it does with the store
  -- off. Opening an envelope over a document with no Fields would invent provenance for
  -- values no Field describes.
  if v_fields is null then
    return new;
  end if;

  -- 2. THE CEILING, over what the writer supplied, before anything else touches it.
  v_refusal := custom.size_refusal(v_org, v_doc);
  if v_refusal is not null then
    raise exception '%', v_refusal
      using errcode = '23514',
            hint = 'The ceilings are custom/value_max_bytes and custom/document_max_bytes - organization-settable knobs with published defaults, not constants.';
  end if;

  -- 3. WHO WROTE IT (VAL-2 / AGT-N-4), the same two arms `custom._value_envelope` asks.
  v_actor := custom.actor_word(v_doc ->> '_actor');
  v_obo   := nullif(btrim(coalesce(v_doc ->> '_on_behalf_of', '')), '');
  if v_obo is not null and v_actor <> 'agent' then
    raise exception 'This write says it is on behalf of somebody, and its author is a %. Only an agent acts on behalf of a person.', v_actor
      using errcode = '22023';
  end if;
  if v_actor = 'agent' and v_obo is null then
    raise exception 'This write says an agent wrote it, and does not say who the agent is acting for. An agent always acts on behalf of a person.'
      using errcode = '22004',
            hint = 'Put "_on_behalf_of" in the custom fields with that person''s id.';
  end if;
  v_doc := v_doc - '_actor' - '_on_behalf_of';

  -- 4. THE ENVELOPE, over the declared Fields and never over anything else.
  v_values := coalesce(v_doc -> '_values', '{}'::jsonb);
  if jsonb_typeof(v_values) <> 'object' then
    v_values := '{}'::jsonb;       -- the envelope law below refuses the malformed block by name
  end if;
  select coalesce(array_agg(f.data ->> 'key'), '{}'::text[]) into v_keys from unnest(v_fields) f;
  foreach v_key in array v_keys loop
    if v_key is not null and v_doc ? v_key and not (v_values ? v_key) then
      v_values := v_values || jsonb_build_object(v_key, '{}'::jsonb);
    end if;
  end loop;
  if v_values <> '{}'::jsonb or v_doc ? '_values' then
    v_doc := jsonb_set(v_doc, '{_values}', v_values);
  end if;
  v_doc := custom.stamp_value_envelopes(v_doc, v_actor, v_obo, now());
  v_doc := custom.value_versions(v_old, v_doc);

  v_refusal := custom.value_envelope_refusal(v_doc);
  if v_refusal is not null then
    raise exception '%', v_refusal
      using errcode = '23514',
            hint = 'VAL-1..VAL-8: a value carries its source, its author, its reason for being missing and its other candidates, beside it in this row''s custom fields.';
  end if;
  perform custom.validate_value_envelope(v_org, v_fields, v_doc);

  new.custom_fields := v_doc;
  return new;
end;
$function$

;

-- ── custom._field_type_converts_values() ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION custom._field_type_converts_values()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_key       text;
  v_label     text;
  v_table     uuid;
  v_was       text;
  v_now       text;
  v_converted integer := 0;
  v_retired_n integer := 0;
  r           record;
  v_val       jsonb;
  v_new       jsonb;
  v_data      jsonb;
  v_retired   jsonb;
  v_alts      jsonb;
  v_keep_alts jsonb;
  v_alt       jsonb;
  v_conv_alt  jsonb;
  v_alts_retired integer := 0;
begin
  -- THE DOOR. custom.assert_store_door resolves custom/system_enabled and, while it is false,
  -- this store takes writes only from the role that owns custom.record. The switch never
  -- removes a check: everything below runs exactly as before.
  if not custom.store_is_open(new.organization_id) then
    perform custom.assert_store_door(new.organization_id, 'custom.record');
  end if;

  if new.table_id is distinct from custom.field_kernel_id() or new.data_class = 'kernel' then
    return null;
  end if;

  v_was := custom.field_behaviour(old.data);
  v_now := custom.field_behaviour(new.data);
  if v_was is not distinct from v_now then
    return null;                          -- the Field still asks for the same thing
  end if;

  v_key   := new.data ->> 'key';
  v_label := coalesce(nullif(new.data ->> 'label', ''), v_key, 'this field');
  v_table := nullif(new.data ->> 'entity_definition_id', '')::uuid;
  if v_key is null or v_table is null then
    return null;
  end if;

  for r in
    select x.id, x.data from custom.record x
     where x.organization_id = new.organization_id
       and x.table_id = v_table
       and x.deleted_at is null
       and x.data ? v_key
  loop
    v_val := r.data -> v_key;
    if v_val is null or jsonb_typeof(v_val) = 'null' then
      continue;
    end if;
    v_new := custom.field_value_convert(new.data, v_val);

    if v_new is not null then
      -- THE ALTERNATES COME TOO. VAL-3: an alternate is a candidate for the SAME field, so
      -- custom.validate_value_envelope judges it by the SAME behaviour — and a converted value
      -- sitting beside an unconverted alternate is a document that cannot be written at all.
      -- (Measured: converting Phone to a number while a merge's "222" alternate stayed a
      -- string failed the very write that was doing the converting.) One that does not convert
      -- is kept in _retired as what it was, with its rank and its source.
      v_data := r.data;
      v_alts := coalesce(v_data -> '_values' -> v_key -> 'alternates', '[]'::jsonb);
      if jsonb_typeof(v_alts) = 'array' and jsonb_array_length(v_alts) > 0 then
        v_keep_alts := '[]'::jsonb;
        v_retired   := coalesce(v_data -> '_retired', '[]'::jsonb);
        if jsonb_typeof(v_retired) <> 'array' then
          v_retired := '[]'::jsonb;
        end if;
        for v_alt in select e from jsonb_array_elements(v_alts) e loop
          v_conv_alt := custom.field_value_convert(new.data, v_alt -> 'value');
          if v_conv_alt is not null then
            v_keep_alts := v_keep_alts || jsonb_build_array(v_alt || jsonb_build_object('value', v_conv_alt));
          else
            v_retired := v_retired || jsonb_build_object(
              'key', v_key, 'label', v_label, 'value', v_alt -> 'value',
              'was_an_alternate_ranked', v_alt -> 'rank', 'envelope', v_alt -> 'src',
              'reason', format('%s changed what it holds and this other candidate for it does not convert, so it is kept here as it was (FLD-4 / T12)', v_label),
              'at', to_jsonb(now()));
            v_alts_retired := v_alts_retired + 1;
          end if;
        end loop;
        if jsonb_array_length(v_keep_alts) > 0 then
          v_data := jsonb_set(v_data, array['_values', v_key, 'alternates'], v_keep_alts);
        else
          v_data := jsonb_set(v_data, array['_values', v_key],
                              (v_data -> '_values' -> v_key) - 'alternates');
        end if;
        if jsonb_array_length(v_retired) > 0 then
          v_data := v_data || jsonb_build_object('_retired', v_retired);
        end if;
      end if;
      if v_new is distinct from v_val then
        v_data := v_data || jsonb_build_object(v_key, v_new);
        v_converted := v_converted + 1;
      end if;
      if v_data is distinct from r.data then
        update custom.record x set data = v_data
         where x.organization_id = new.organization_id and x.id = r.id;
      end if;
    else
      -- IT DOES NOT CONVERT. The same place, the same shape and the same reason T8's retype
      -- already uses: the value and its envelope are kept in `_retired`, and the key leaves
      -- the document so the record can be written again.
      v_data    := r.data;
      v_retired := coalesce(v_data -> '_retired', '[]'::jsonb);
      if jsonb_typeof(v_retired) <> 'array' then
        v_retired := '[]'::jsonb;
      end if;
      v_retired := v_retired || jsonb_build_object(
        'key',      v_key,
        'label',    v_label,
        'value',    v_val,
        'envelope', v_data -> '_values' -> v_key,
        'reason',   format('%s now holds %s, and %s is not one — this value was kept here when the field changed, neither coerced nor deleted (FLD-4 / T12)',
                           v_label,
                           case when new.data ->> 'type' = 'range'
                                     and custom.said(new.data -> 'config' ->> 'kind', 'number') in ('date','datetime')
                                then 'dates'
                                when new.data ->> 'type' = 'range' then 'numbers'
                                when new.data ->> 'type' = 'boolean' then 'a tick or nothing'
                                when new.data ->> 'type' = 'text' then 'words'
                                when new.data ->> 'type' = 'list' then 'one of its choices'
                                when new.data ->> 'type' = 'relation' then 'a link to a record'
                                else custom.said(new.data ->> 'type', 'something else') end,
                           coalesce('"' || (v_val #>> '{}') || '"', 'that value')),
        'at',       to_jsonb(now()));
      v_data := v_data - v_key;
      if jsonb_typeof(v_data -> '_values') = 'object' then
        v_data := jsonb_set(v_data, '{_values}', (v_data -> '_values') - v_key);
      end if;
      v_data := v_data || jsonb_build_object('_retired', v_retired);
      update custom.record x set data = v_data
       where x.organization_id = new.organization_id and x.id = r.id;
      v_retired_n := v_retired_n + 1;
    end if;
  end loop;

  -- 🚨 VIS-2 (2026-09-19) — AND IT WRITES ITS MIGRATION ROW, IN THIS SAME TRANSACTION.
  -- MEASURED: `custom.migrate_retype` records a `history.migration_log` row before it patches
  -- the Field, but the CONVERSION is this trigger's, and this trigger is what runs when the
  -- same Field is retyped through the ordinary write door. So a type change made the normal
  -- way rewrote every value of the table, moved what would not convert into `_retired`, and
  -- left NOTHING in the migration log: HIS-8's undo did not exist for it and the Migrations
  -- screen did not know it had happened. The row is written here, where the rewrite is, so
  -- both routes leave the same trace.
  --
  -- The inverse is the Field's own previous shape, which is a `patch` on the Field record -
  -- the identical inverse `custom.migrate_retype` stores, and `custom.record_update` on the
  -- Field is what puts it back, firing this trigger again to convert the values the other way.
  --
  -- ONE ROW, NOT TWO. When `custom.migrate_retype` is the caller it has already recorded its
  -- row a few statements earlier IN THIS TRANSACTION, and `now()` is the transaction
  -- timestamp, so `applied_at >= now()` is exactly "recorded by this transaction" - it cannot
  -- match an older row and there are no newer ones.
  if not exists (select 1 from history.migration_log m
                  where m.organization_id = new.organization_id
                    and m.verb = 'retype'
                    and m.target_kind = 'field'
                    and m.target_id = new.id
                    and m.applied_at >= now()) then
    perform history.migration_record(
      new.organization_id, 'retype', 'field', new.id,
      jsonb_build_object(
        'kind', 'patch',
        'record_id', new.id::text,
        'patch', jsonb_strip_nulls(jsonb_build_object(
                   'type',   old.data ->> 'type',
                   'config', old.data -> 'config'))),
      format('%s behaves as %s instead of %s; %s value(s) converted, %s kept in _retired with the reason, %s other candidate(s) kept too. Recorded by the conversion itself, so a retype through the ordinary write door leaves the same trace as one through custom.migrate_retype (FLD-4 / T12 / HIS-8).',
             v_label, v_now, v_was, v_converted, v_retired_n, v_alts_retired));
  end if;

  if v_converted > 0 or v_retired_n > 0 or v_alts_retired > 0 then
    raise notice 'custom: "%" changed what it holds (% -> %): % value(s) converted, % kept in _retired with the reason, % other candidate(s) kept too.',
      v_label, v_was, v_now, v_converted, v_retired_n, v_alts_retired;
  end if;
  return null;
end;
$function$

;

-- ── custom._resolve_choice_words() ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION custom._resolve_choice_words()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_on      boolean;
  v_map     jsonb;
  v_field   jsonb;
  v_key     text;
  v_label   text;
  v_val     jsonb;
  v_items   jsonb;
  v_one     jsonb;
  v_word    text;
  v_hit     text;
  v_out     jsonb;
  v_new     jsonb;
  v_before  text[];
  v_title   text;
  e         record;
begin
  -- THE SWITCH, BY NAME, BEFORE ANYTHING. While `custom/system_enabled` resolves false for this
  -- organization nothing of this store's product behaviour runs and the value is left exactly as
  -- the writer sent it. `custom._record_field_validation` already refuses a CLIENT write while
  -- the switch is off; this is the same rule for the owner-role writes it lets through — a
  -- backfill, a migration, a repair — so an organization whose store is off is byte-untouched by
  -- this lane. The read is the established one (`custom.store_is_open`,
  -- `custom._entity_custom_fields_guard` and `custom.containment_depth_ceiling` all make it):
  -- `platform.knob_resolve` answers jsonb and a switch this writer cannot read is CLOSED.
  begin
    v_on := custom.store_is_open(new.organization_id);
  exception when others then
    v_on := false;
  end;
  if not v_on then
    return new;
  end if;

  if new.data is null or jsonb_typeof(new.data) <> 'object' then
    return new;
  end if;

  -- ── AN OPTION RECORD IS BORN WITH ITS KEY ───────────────────────────────────────────
  -- The store's own bookkeeping, done where every write arrives — the panel, the import,
  -- the agent and the ordinary write door all pass through here. A RENAME NEVER TOUCHES IT:
  -- the key is set when it is missing and never recomputed, which is the whole point.
  -- IT LIVES IN `metadata`, WHICH IS WHAT THAT COLUMN IS FOR: system-owned, keyed system
  -- state, judged by `platform._metadata_guard` against a registry no client may add to. Two
  -- consequences, both deliberate. FLD-5 stays byte-true - a category is still a Record of a
  -- Table with ONE title field, and `w1_field_t4_t8.sql` asserts exactly that of the kernel's
  -- own choice tables. And a client CANNOT forge one: `_metadata_guard` sorts before
  -- `custom_record_choice_words`, so it judges what the CALLER sent (an unregistered key, which
  -- it refuses) and never what this trigger sets afterwards.
  -- ON UPDATE THE EXISTING KEY IS CARRIED, never recomputed: renaming an option must rewrite no
  -- row, and recomputing from the new title is exactly how that promise would be broken.
  if new.table_id is not null
     and coalesce(new.data_class, '') not in ('kernel', 'relation', 'field', 'table', 'rule')
     and exists (select 1 from custom.record f
                  where f.organization_id = new.organization_id
                    and f.table_id = custom.field_kernel_id()
                    and f.deleted_at is null
                    and f.data ->> 'type' = 'list'
                    and (f.data -> 'config' ->> 'options_table_id')::uuid = new.table_id) then
    -- WHAT THE CALLER SENT IS NEVER TRUSTED. `option_key` is a registered metadata key, which
    -- means `platform._metadata_guard` lets it through - so a client could put a word of their
    -- own in it. On a NEW option the key is always derived here and whatever arrived is
    -- overwritten; on an UPDATE the key the option was born with is carried, whatever arrived.
    -- Either way the caller has no say, which is what makes it stable.
    if tg_op = 'UPDATE' and coalesce(old.metadata ->> 'option_key', '') <> '' then
      new.metadata := coalesce(new.metadata, '{}'::jsonb)
                        || jsonb_build_object('option_key', old.metadata ->> 'option_key');
    else
      v_title := coalesce(nullif(new.data ->> 'title', ''), nullif(new.data ->> 'name', ''));
      if v_title is not null then
        new.metadata := coalesce(new.metadata, '{}'::jsonb)
                          || jsonb_build_object('option_key',
                               custom.choice_key_for(new.organization_id, new.table_id, v_title, new.id));
      else
        new.metadata := coalesce(new.metadata, '{}'::jsonb) - 'option_key';
      end if;
    end if;
  end if;

  -- Only ordinary records of an ordinary Table have choices of their own to resolve.
  if new.table_id is null or new.data_class = 'kernel'
     or new.table_id in (custom.field_kernel_id(), custom.table_kernel_id(),
                         custom.rule_kernel_id(), custom.merge_field_kernel_id()) then
    return new;
  end if;

  v_map := custom.choice_field_map(new.organization_id, new.table_id);
  if v_map = '{}'::jsonb then
    return new;
  end if;

  for e in select key as k, value as v from jsonb_each(v_map) loop
    v_key   := e.k;
    v_field := e.v;
    v_label := coalesce(nullif(v_field ->> 'label', ''), v_key);
    v_val   := new.data -> v_key;
    if v_val is null or jsonb_typeof(v_val) = 'null' then
      continue;
    end if;

    -- The keys this cell already held, so that a record carrying a RETIRED choice can still
    -- be saved when somebody edits a different column. Only a NEW retired choice is refused.
    if tg_op = 'UPDATE' then
      select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_before
        from jsonb_array_elements(
               case when jsonb_typeof(old.data -> v_key) = 'array' then old.data -> v_key
                    when old.data -> v_key is null then '[]'::jsonb
                    else jsonb_build_array(old.data -> v_key) end) x
       where jsonb_typeof(x) = 'string';
    else
      v_before := '{}'::text[];
    end if;

    v_items := case when jsonb_typeof(v_val) = 'array' then v_val else jsonb_build_array(v_val) end;
    v_out   := '[]'::jsonb;

    for v_one in select x from jsonb_array_elements(v_items) x loop
      if jsonb_typeof(v_one) <> 'string' then
        v_out := v_out || jsonb_build_array(v_one);
        continue;
      end if;
      v_word := btrim(v_one #>> '{}');
      if v_word = '' then
        v_out := v_out || jsonb_build_array(v_one);
        continue;
      end if;

      v_hit := custom.choice_key_of(v_field, v_word);

      if v_hit is null then
        -- REFUSED WITH THE CHOICES THEMSELVES, in the words a person reads.
        raise exception '% does not have a choice called "%".', v_label, v_word
          using errcode = '23514',
                hint = format('The choices for %s are %s. Pick one of those, or add "%s" to the column''s list of choices first.',
                              v_label,
                              coalesce(custom.choice_words(v_field), 'not set up yet'),
                              v_word);
      end if;

      if coalesce((v_field -> 'options' -> v_hit ->> 'retired')::boolean, false)
         and not (v_hit = any (v_before)) then
        raise exception '% is no longer one of the choices for %.',
                        coalesce(v_field -> 'options' -> v_hit ->> 'label', v_hit), v_label
          using errcode = '23514',
                hint = format('It was retired, so it can no longer be picked. Records that already hold it keep it and still read as "%s". The choices now are %s.',
                              coalesce(v_field -> 'options' -> v_hit ->> 'label', v_hit),
                              coalesce(custom.choice_words(v_field), 'none — add one first'));
      end if;

      v_out := v_out || jsonb_build_array(to_jsonb(v_hit));
    end loop;

    v_new := case when jsonb_typeof(v_val) = 'array' then v_out else v_out -> 0 end;
    if v_new is distinct from v_val then
      new.data := new.data || jsonb_build_object(v_key, v_new);
    end if;
  end loop;

  return new;
end;
$function$

;

-- ── custom._table_shape_guard() ──────────────────────────────────────────────────────────
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

  return new;
end;
$function$

;

-- ── custom.migrate_purge(p_organization_id uuid, p_table_id uuid, p_dry_run boolean) ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION custom.migrate_purge(p_organization_id uuid, p_table_id uuid DEFAULT NULL::uuid, p_dry_run boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_days   integer;
  v_cutoff timestamptz;
  v_count  bigint := 0;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.migrate_purge');
  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.migrate_purge', 'admin'::public.permission_level, 'table');
  perform custom.assert_store_door(p_organization_id, 'custom.migrate_purge');

  -- THE GUARD, NAMED AND READ IN THE BODY (§6b.2), and this is the one verb in the file that
  -- earns it: every other verb here is reversible from History, and this one is the hard
  -- delete. While `custom/system_enabled` resolves false the store belongs to the campaign
  -- that owns it, and nothing outside that campaign destroys a row in it.
  if not custom.store_is_open(p_organization_id)
     and not pg_has_role(custom.caller_role(),
                         (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass),
                         'member') then
    raise exception 'The custom data store is switched off, so nothing was purged.'
      using errcode = '42501',
            hint = 'custom/system_enabled resolves false and this caller does not own custom.record. Nothing was destroyed. The switch checklist turns the knob on; a caller never does.';
  end if;

  if p_organization_id is null then
    raise exception 'custom.migrate_purge: which organization''s deleted records?'
      using errcode = '22004',
            hint = 'REC-23: retention is resolved per organization, so a purge that spanned organizations would apply one organization''s window to another''s data.';
  end if;

  -- The window is the TABLE'S retention, read through W3-HIST's one reader, which never
  -- answers below the organization's floor. A deleted record is reversible for exactly as
  -- long as its Table says, and this function is the only thing that ends that.
  v_days := case when p_table_id is null
                 then history.retention_floor_days(p_organization_id)
                 else history.retention_days(p_organization_id, p_table_id) end;
  v_cutoff := now() - make_interval(days => v_days);

  with doomed as (
    select r.id
      from custom.record r
     where r.organization_id = p_organization_id
       and r.deleted_at is not null
       and r.deleted_at < v_cutoff
       and (p_table_id is null or r.table_id = p_table_id)
       -- REC-21: an id that resolves to a surviving record is never purged, whatever its age.
       -- Hard-deleting a merge loser would break "the losing id resolves to the winner
       -- forever" sixty days after the merge, silently, which is the worst time for it.
       and not exists (select 1 from custom.record_alias a
                        where a.organization_id = r.organization_id and a.old_id = r.id)
  ),
  gone as (
    delete from custom.record c
     using doomed d
     where not p_dry_run and c.organization_id = p_organization_id and c.id = d.id
    returning 1
  )
  select case when p_dry_run then (select count(*) from doomed)
              else (select count(*) from gone) end
    into v_count;

  return jsonb_build_object(
    'function', 'custom.migrate_purge',
    'organization_id', p_organization_id, 'table_id', p_table_id,
    'retention_days', v_days, 'cutoff', v_cutoff,
    'policy', 'a soft-deleted record is destroyed only after its Table''s retention, and never while an id still resolves to it (REC-21)',
    'dry_run', p_dry_run, 'rows_purged', v_count, 'at', now());
end;
$function$

;

-- ── custom.trg_associations_bump_visibility() ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION custom.trg_associations_bump_visibility()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_row   record := coalesce(new, old);
  v_org   uuid;
begin
  -- The row's organization is established FIRST, because the off switch below is an
  -- org-overridable knob and resolving it without an organization silently reads the
  -- platform value for every tenant.
  v_org := v_row.organization_id;

  -- THE OFF SWITCH, READ INSIDE THE BODY. A trigger's guard cannot live in the file header: the
  -- header is not consulted at run time and an UPDATE would still pay for this work while every
  -- additive check read green. So the knob is read here, and while it resolves false this trigger
  -- is a no-op on every write to platform.associations.
  if not custom.store_is_open(v_org) then
    return null;
  end if;

  -- THE SECOND GATE, AND THE REASON THIS TRIGGER IS INERT FOR TODAY'S WRITES: it does nothing at
  -- all unless the row's role is one of the new store's declared carrying roles. A trigger WHEN
  -- clause cannot carry a subquery, so the check lives here, one index lookup on a three-row table.
  if not exists (
    select 1 from custom.carrying_rule cr
    where cr.is_active and cr.role = v_row.role
  ) then
    return null;
  end if;

  -- The moved record's own epoch, and its container's. Two rows, never a subtree.
  perform custom.bump_epoch(v_row.source_type, v_row.source_id, v_org);
  perform custom.bump_epoch(v_row.target_type, v_row.target_id, v_org);

  -- The pair's cache entries go in the SAME COMMIT. This is the "invalidated in the same commit"
  -- half of VIS-7, and it is bounded: the pair, never the closure below it.
  delete from custom.visibility_cache c
   where (c.container_type = v_row.source_type and c.container_id = v_row.source_id)
      or (c.container_type = v_row.target_type and c.container_id = v_row.target_id)
      or (c.item_type      = v_row.source_type and c.item_id      = v_row.source_id)
      or (c.item_type      = v_row.target_type and c.item_id      = v_row.target_id);

  return null;
end;
$function$

;

-- ── history.migration_undo(p_organization_id uuid, p_log_id uuid) ──────────────────────────────────────────────────────────
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
$function$

;

-- ── history.retention_days(p_organization_id uuid, p_table_id uuid) ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION history.retention_days(p_organization_id uuid, p_table_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_floor integer := history.retention_floor_days(p_organization_id);
  v_declared integer;
begin
  -- The property is `retention_days` — the name W1-TABLE's `_table_shape_guard` requires on
  -- every Table (REC-1). This body's switch is `custom/system_enabled`; the history
  -- writer's is `custom/row_versions_guard`.
  -- THE GUARD, READ IN THE BODY. While `custom/system_enabled` resolves false the store is
  -- shut and a Table's declared property is not consulted at all — the answer is the
  -- platform floor, which is what every reader got before this lane existed.
  if not custom.store_is_open(p_organization_id) then
    return v_floor;
  end if;

  select nullif(t.data ->> 'retention_days', '')::integer into v_declared
    from custom.record t
   where t.organization_id = p_organization_id
     and t.id = p_table_id
     and t.data_class = 'table';

  if v_declared is null then
    return v_floor;
  end if;

  if v_declared < v_floor then
    raise warning 'history.retention_days: table % declares % days and this organization''s floor is % — keeping % days. Remedy: history.retention_set(organization, table, days) refuses anything below the floor; this row predates that door or was written around it.',
      p_table_id, v_declared, v_floor, v_floor;
    return v_floor;
  end if;

  return v_declared;
end;
$function$

;

-- ── iam._one_owner_guard() ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION iam._one_owner_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_others integer;
begin
  -- THE GUARD, READ HERE rather than inherited from a header: while
  -- custom/system_enabled resolves false this trigger returns on its first statement, so
  -- every write iam.organization_member takes today behaves exactly as it does today.
  if not custom.store_is_open(new.organization_id) then
    return new;
  end if;
  -- `iam.organization_member` is a VIEW over `iam.memberships`; the trigger goes on the
  -- base table, and this arm is the view's own predicate, written out.
  if new.container_type is distinct from 'organization'
     or new.status is distinct from 'active'
     or new.deleted_at is not null
     or new.role::text <> 'owner' then
    return new;
  end if;
  select count(*) into v_others
    from iam.organization_member om
   where om.organization_id = new.organization_id
     and om.role::text = 'owner'
     and om.user_id is distinct from new.user_id;
  if v_others > 0 then
    raise exception 'This organization already has an owner, and an organization has exactly one.'
      using errcode = '23514',
            hint = 'VIS-20: hand the organization over instead - the current owner transfers it, which makes them an admin.';
  end if;
  return new;
end;
$function$

;

-- ── iam._per_table_grant_guard() ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION iam._per_table_grant_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_table_id uuid;
  v_org      uuid;
begin
  if new.resource_type <> 'record' then return new; end if;
  select r.organization_id, r.table_id into v_org, v_table_id
    from custom.record r where r.id = new.resource_id;
  if v_org is null then return new; end if;
  -- THE GUARD, READ HERE: while custom/system_enabled resolves false every write
  -- iam.permissions takes returns on this line, unchanged.
  if not custom.store_is_open(v_org) then
    return new;
  end if;

  -- A grant on a TABLE record is the per-table grant, and it is only ever legitimate on a
  -- custom Table. Every other record is an ordinary per-thing grant and passes straight through.
  if v_table_id = custom.table_kernel_id() then
    if not exists (select 1 from custom.record t
                    where t.id = new.resource_id
                      and t.organization_id = v_org
                      and coalesce(t.data ->> 'origin', 'custom') <> 'standard') then
      raise exception 'You can share a custom table. This one is a standard table, and standard tables are shared through the thing they belong to.'
        using errcode = '23514', hint = 'VIS-24: per-table grants exist only on custom tables.';
    end if;
  end if;
  return new;
end;
$function$

;

-- ── iam.access_arms_from_sources(p_user_id uuid, p_organization_id uuid, p_type text, p_id uuid, p_table_id uuid) ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION iam.access_arms_from_sources(p_user_id uuid, p_organization_id uuid, p_type text, p_id uuid, p_table_id uuid DEFAULT NULL::uuid)
 RETURNS permission_level
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_addressed public.permission_level;
  v_best      public.permission_level;
  v_word      text;
  v_table     uuid := p_table_id;
  v_store_on  boolean;
begin
  if p_user_id is null or p_id is null then return null; end if;

  -- 1. Grants ADDRESSED to this person - to them, or to an organization they are in.
  select max(p.permission_level) into v_addressed
    from iam.permissions p
   where p.resource_type = p_type and p.resource_id = p_id
     and p.status <> 'rejected'
     and (p.expires_at is null or p.expires_at > now())
     and coalesce(p.is_public, false) = false
     and (p.granted_to_user_id = p_user_id
          or p.granted_to_organization_id in (select om.organization_id
                                                from iam.organization_member om
                                               where om.user_id = p_user_id));
  v_best := v_addressed;

  -- 2. Public grants on the thing, and the world lane. Both reach anybody signed in, so
  --    both are justified for a member too.
  v_best := greatest(v_best,
    (select max(p.permission_level) from iam.permissions p
      where p.resource_type = p_type and p.resource_id = p_id
        and p.status <> 'rejected' and (p.expires_at is null or p.expires_at > now())
        and coalesce(p.is_public, false)));
  if exists (select 1 from iam.content_lane c
              where c.resource_type = p_type and c.resource_id = p_id and c.lane is distinct from 'mine') then
    v_best := greatest(v_best, 'viewer'::public.permission_level);
  end if;

  -- 3. WHAT MEMBERSHIP ALONE JUSTIFIES - and only where no grant is addressed to this
  --    person on this thing (VIS-19: roles set a default, per-thing grants override it).
  if v_addressed is null
     and p_organization_id is not null
     and exists (select 1 from iam.organization_member om
                  where om.user_id = p_user_id and om.organization_id = p_organization_id) then
    begin
      v_store_on := custom.store_is_open(p_organization_id);
    exception when others then v_store_on := false; end;
    -- 🚨 AND THE RULE FOR AN ORGANIZATION WHOSE STORE IS OFF IS THE ONE THE PLATFORM HAS
    -- ALWAYS HAD. `levelfix_membership_confers_the_organizations_level.sql` gates its whole
    -- change on `custom/system_enabled`: where the store is off, `iam.has_access_for_base`
    -- keeps the 2026-08-12 editor cap untouched, so `editor` is what membership JUSTIFIES
    -- there and a census that said otherwise would report an overreach nobody can ever
    -- clear. The row's own `visibility` is the same wall the kernel applies: the member
    -- lanes require `>= internal` and a `personal` row is reached by its owner and by a
    -- grant, never by membership.
    if not v_store_on then
      if p_type <> 'record' or to_regclass('custom.record') is null
         or exists (select 1 from custom.record r
                     where r.organization_id = p_organization_id and r.id = p_id
                       and r.visibility >= 'internal'::platform.visibility) then
        v_best := greatest(v_best, 'editor'::public.permission_level);
      end if;
    end if;
    if v_store_on then
      begin
        v_word := platform.knob_resolve('custom', 'member_default_visibility', p_organization_id) #>> '{}';
      exception when others then v_word := 'all_records'; end;
      if coalesce(nullif(btrim(v_word), ''), 'all_records') <> 'shared_only' then
        begin
          v_word := platform.knob_resolve('custom', 'member_default_level', p_organization_id) #>> '{}';
        exception when others then v_word := 'viewer'; end;
        if v_table is null and p_type = 'record' and to_regclass('custom.record') is not null then
          select r.table_id into v_table from custom.record r
           where r.organization_id = p_organization_id and r.id = p_id;
        end if;
        if v_table is not null and to_regclass('custom.record') is not null then
          v_word := coalesce((select nullif(btrim(t.data ->> 'member_default_level'), '')
                                from custom.record t
                               where t.organization_id = p_organization_id and t.id = v_table
                                 and t.deleted_at is null), v_word);
          if exists (select 1 from custom.record f
                      where f.organization_id = p_organization_id
                        and f.table_id = custom.field_kernel_id()
                        and f.deleted_at is null
                        and (f.data ->> 'entity_definition_id')::uuid = v_table
                        and f.data ->> 'sensitivity' = 'restricted') then
            v_word := 'none';
          end if;
        end if;
        if v_word is not null and v_word <> 'none'
           and exists (select 1 from iam.content_levels() l where l.level::text = v_word)
           and (p_type <> 'record' or to_regclass('custom.record') is null
                or exists (select 1 from custom.record r
                            where r.organization_id = p_organization_id and r.id = p_id
                              and r.visibility >= 'internal'::platform.visibility)) then
          v_best := greatest(v_best, v_word::public.permission_level);
        end if;
      end if;
    end if;
  end if;

  return v_best;
end;
$function$

;

-- ── iam.member_lane_confers(p_user_id uuid, p_organization_id uuid, p_type text, p_id uuid, p_table_id uuid) ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION iam.member_lane_confers(p_user_id uuid, p_organization_id uuid, p_type text DEFAULT 'record'::text, p_id uuid DEFAULT NULL::uuid, p_table_id uuid DEFAULT NULL::uuid)
 RETURNS permission_level
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_table    uuid := p_table_id;
  v_store_on boolean;
begin
  if p_user_id is null or p_organization_id is null then
    return null;
  end if;

  -- Membership itself. Not a role check: `owner` and `admin` reach their own arms earlier and
  -- are not affected by anything here (VIS-20 is a different question from VIS-19).
  if not exists (select 1 from iam.organization_member om
                  where om.user_id = p_user_id and om.organization_id = p_organization_id) then
    return null;
  end if;

  -- THE CAMPAIGN'S OFF SWITCH, read the established way (`custom.store_is_open`'s own body,
  -- inlined so this file's guard is a line of code and not a sentence about one).
  begin
    v_store_on := custom.store_is_open(p_organization_id);
  exception when others then
    v_store_on := false;
  end;
  if not v_store_on then
    return null;
  end if;

  -- VIS-33. The organization may say that membership alone shows nothing at all.
  if not iam.member_lane_open(p_organization_id) then
    return null;
  end if;

  -- VIS-19, THE OVERRIDE. Somebody has decided about this person and this thing, so the role
  -- default is not the answer - the grant is, and it is admitted on its own arm.
  --
  -- IT IS THIS ROW AND NOT THE WHOLE SPECIFICITY LADDER, DELIBERATELY (LADDER-CAP). The Table
  -- and the homes are rungs too, and they are read by `custom.addressed_cap`, which
  -- `custom.reaches_directly` asks ONCE per question. Asking them here put a containment walk
  -- inside the access kernel's per-node loop and cost the page-read path 61%.
  if p_id is not null
     and iam.grant_addressed_level(p_user_id, p_type, p_id) is not null then
    return null;
  end if;

  -- AGT-5. The default is held PER REGISTERED TABLE, so the Table is read off the row rather
  -- than guessed. `to_regclass` keeps this callable before the store exists.
  if v_table is null and p_type = 'record' and p_id is not null
     and to_regclass('custom.record') is not null then
    select r.table_id into v_table
      from custom.record r
     where r.organization_id = p_organization_id and r.id = p_id;
  end if;

  return iam.member_default_level(p_organization_id, v_table);
end;
$function$

;

-- ── iam.member_level_justified(p_user_id uuid, p_organization_id uuid, p_record_id uuid) ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION iam.member_level_justified(p_user_id uuid, p_organization_id uuid, p_record_id uuid)
 RETURNS permission_level
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_created uuid;
  v_table   uuid;
  v_best    public.permission_level;
  v_anc     public.permission_level;
  a         record;
begin
  select r.created_by, r.table_id into v_created, v_table
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id;
  if not found then return null; end if;

  -- VIS-25 and VIS-20, the two rungs a role justifies on its own.
  if v_created = p_user_id then return iam.top_content_level(); end if;
  if public.is_org_admin_for(p_user_id, p_organization_id) then return iam.top_content_level(); end if;

  v_best := iam.access_arms_from_sources(p_user_id, p_organization_id, 'record', p_record_id, v_table);

  for a in select c.container_type, c.container_id, c.max_level
             from custom.visibility_ancestors('record', p_record_id) c
  loop
    v_anc := iam.access_arms_from_sources(p_user_id, p_organization_id, a.container_type, a.container_id, null);
    if v_anc is not null then
      v_best := greatest(v_best, least(a.max_level, v_anc));
    end if;
  end loop;

  -- THE FOURTH RUNG (SHARED-ONLY, taught to the census by LADDER-CAP). A Table you can see
  -- something inside is a Table you may KNOW. The three conditions are arm 4's own, character
  -- for character: the row must BE a Table, the person must actually reach something in it, and
  -- it justifies `viewer` and nothing above. It does not carry: this says only that the person
  -- may know THIS Table row, never that she may reach the rows inside it, which is what every
  -- clause above is for.
  -- It is gated on the store's OWN SWITCH, exactly as arm 4 is: where `custom/system_enabled`
  -- resolves false for this organization the store answers nobody anything and no arm of it
  -- runs, so this file changes NOTHING there.
  if custom.store_is_open(p_organization_id)
     and v_table = custom.table_kernel_id()
     and custom.table_has_a_visible_record(p_user_id, p_organization_id, p_record_id) then
    v_best := greatest(v_best, 'viewer'::public.permission_level);
  end if;

  return v_best;
end;
$function$

;

-- ── platform.unified_data_store_on(p_organization_id uuid) ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION platform.unified_data_store_on(p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_on boolean;
begin
  -- A person who has not picked an organization yet is not an error: they have
  -- no store to be on, and the sidebar asks this on every boot.
  if p_organization_id is null then
    return jsonb_build_object(
      'on', false,
      'organization_id', null,
      'why', 'No organization is picked yet, so there are no tables to show. Pick one and this answers for that organization.');
  end if;

  -- 🚨 THE DECISION, BEFORE THE FIRST READ — and it is THE SAME ONE the store makes.
  -- `iam.has_org_access` is the membership row; `custom.portal_admits` is the ladder,
  -- whose FIRST arm is that same membership and whose second is a live grant on one of
  -- this organization's tables. A person the store lets through a table's door cannot be
  -- told by this door that they are not here at all.
  if not (iam.has_org_access(p_organization_id) or custom.portal_admits(p_organization_id)) then
    raise exception 'You are not in that organization, so there is nothing here to tell you about its data.'
      using errcode = '42501',
            hint = 'Switch to an organization you are a member of and ask again.';
  end if;

  v_on := custom.store_is_open(p_organization_id);

  return jsonb_build_object(
    'on', v_on,
    'organization_id', p_organization_id,
    'why', case when v_on
                then 'This organization keeps its tables, fields and records in the unified record store, so its Records pages are open to everyone in it.'
                else 'This organization does not keep its data in the unified record store yet. An owner or an administrator of it turns that on once, for everybody, on the unified data ramp screen.' end);
end;
$function$

;

-- ── platform.unified_data_store_state(p_organization_id uuid) ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION platform.unified_data_store_state(p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_on   boolean;
  v_over boolean;
begin
  perform platform.assert_may_operate_unified_data_ramp(p_organization_id, 'Reading this organization''s data-store switch');

  v_on := custom.store_is_open(p_organization_id);
  select true into v_over from platform.knob_override o
   where o.feature = 'custom' and o.key = 'system_enabled'
     and o.scope_kind = 'organization' and o.scope_id = p_organization_id;
  return jsonb_build_object(
    'knob_key', 'system_enabled',
    'switched_on', v_on,
    'has_organization_override', coalesce(v_over, false),
    'why', case when v_on
                then 'This organization is on the unified record store. Its doors take writes from its own people; a field can be promoted here; relations between records are enforced, including the wall that refuses a link into another organization unless both organizations have turned cross-organization links on; custom fields on its standard tables are checked; and its changes are recorded so "who could see this on that day" can be answered. Every consumer knob is still separate: turning this on moved nobody onto the new store.'
                else 'This organization is not on the unified record store. Its doors take writes only from the role that owns custom.record; promoting a field is refused here; the relation rules, the custom-fields checks and its own change history are all switched off with it. Turning this on does not move any consumer — every consumer knob is separate and still off.' end);
end;
$function$

;
