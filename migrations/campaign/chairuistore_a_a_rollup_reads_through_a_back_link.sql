-- additive: yes
--   It ADDS one function, custom._back_link_relation(uuid, uuid, text) (a STABLE SQL helper, no
--   client lane: EXECUTE revoked from public/anon/authenticated, called only from the store's own
--   definer bodies), and REPLACES three bodies — custom._field_type_parity_guard (the trigger
--   function on custom.record; the trigger itself is untouched), custom.rollup_value and
--   custom.relation_targets. No table, column, trigger, policy, grant to a client or stored row is
--   touched. Locks: pg_proc row locks only.
--   Inverse: migrations/inverse/chairuistore_a_a_rollup_reads_through_a_back_link_down.sql
--
-- chair-step: it REPLACES the body of the field-shape trigger function custom._field_type_parity_guard
--   (one new arm: a roll-up's `via` may name a reverse column of its table) and of the read door
--   custom.relation_targets (a key the record does not carry may be a reverse column, read by its
--   edges and narrowed to the linking records the reader may see). Nothing is dropped or revoked
--   from a client.
--
-- guard: custom/system_enabled
-- lock: custom
-- lane: CHAIR-UI-STORE
-- based-on: custom._field_type_parity_guard() 9c8700dbbcbc6d4e3ba5d70bc3dac26b3357141faefec3e1376066178367781e
-- based-on: custom.rollup_value(uuid, uuid, jsonb) 4071bf73fa9fb5f7ec56b882a8cbeaf980f7b599d95d3dc93a0f9be83ddc1f71
-- based-on: custom.relation_targets(uuid, uuid, text) 2a3f0c564e6399f4320118df3bd5eed267660a4d1192334970aeb03f0450a0f1
--
-- CHAIR-UI-STORE (Unified Data System v6), item 2 — A ROLL-UP READS THROUGH A BACK-LINK.
--
-- THE GAP (browser pass, 2026-10-03, records-ui 0.95.10). Harbor Dental's Appointments table links
-- each visit to its patient ("Patient", one record). Since lane 10's back-links went live, Patients
-- shows the reverse column "Appointments" — virtual (REL-9: the reverse is not a second Field), keyed
-- by the linking Field's inverse_key or `linked_<field id>`. "Booked visits per patient" is a count
-- over exactly that column, and the store could not build it: custom._field_type_parity_guard looked
-- for a Field row named by `via` on the same table and refused ("this table has no field called
-- appointments"), and custom.relation_targets read only the record's own document, where a reverse
-- column is never stored.
--
-- THE FIX, one meaning in three places:
--   custom._back_link_relation(org, table, key) answers a reverse column as the relation it mirrors
--     from this end: {type: relation, multi: true, relation_target: <linking table>, back_link_of:
--     <linking Field id>} — the same key custom.reverse_columns publishes.
--   custom._field_type_parity_guard: a ROLL-UP whose `via` names no Field of its table may name a
--     reverse column; it is then a many-relation to the linking table, so `of` and `filter` are
--     checked against the linking table's columns exactly as for a forward link. (A lookup is not
--     opened: a back-link holds many records, and a lookup reads one.)
--   custom.relation_targets: a key the record does not carry, that is one of its table's reverse
--     columns, answers the linking records whose edge (platform.associations, relation_field_id =
--     the linking Field) points at this record — only those the reader may see
--     (custom.visible_predicate_sql, as custom.reverse_links_many counts them). Every forward key
--     answers exactly as before.
--   custom.rollup_value: the far table of a back-link roll-up (for its filter) is the linking table.
--
-- GUARD: scripts/campaign-tests/chairuistore_a_green.sql — RED before this file (the declaration is
-- refused: "this table has no field called patient_visits"), GREEN after (3 booked visits, 2 of them
-- open, fee total 545; a filter naming a column the linking table lacks is refused by sentence).

CREATE OR REPLACE FUNCTION custom._back_link_relation(p_organization_id uuid, p_table_id uuid, p_key text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  -- THE REVERSE COLUMN `p_key` OF TABLE `p_table_id`, AS THE RELATION IT IS FROM THIS END (REL-9).
  -- custom.reverse_columns keys a reverse column by its linking Field's inverse_key, else
  -- `linked_<field id without dashes>`; this answers that same key with the shape a relation Field
  -- has where a roll-up reads it: a relation of MANY records whose target is the linking table,
  -- plus the linking Field (`back_link_of`) whose edges are the links. Null when no relation of
  -- this organization links to the table under that key. No client lane: called
  -- only from the store's own definer bodies (the field guard, custom.rollup_value, custom.relation_targets).
  select jsonb_build_object(
           'type', 'relation',
           'multi', true,
           'key', p_key,
           'relation_target', f.data ->> 'entity_definition_id',
           'back_link_of', f.id::text,
           'back_link_field_key', coalesce(nullif(f.data ->> 'key', ''), f.data ->> 'name'),
           'label', coalesce(nullif(btrim(f.data ->> 'label'), ''), f.data ->> 'key'))
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.data_class = 'field'
     and f.deleted_at is null
     and f.data ->> 'type' = 'relation'
     and p_table_id is not null
     and (case coalesce(nullif(f.data -> 'config' ->> 'target_mode', ''), 'one')
            when 'one' then f.data ->> 'relation_target' = p_table_id::text
            when 'several' then coalesce(f.data -> 'config' -> 'target_tables', '[]'::jsonb) ? p_table_id::text
            else false end)
     and (nullif(f.data ->> 'inverse_key', '') = p_key
          or (nullif(f.data ->> 'inverse_key', '') is null and 'linked_' || replace(f.id::text, '-', '') = p_key))
   order by f.id
   limit 1
$function$;

revoke all on function custom._back_link_relation(uuid, uuid, text) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION custom._field_type_parity_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  d          jsonb := new.data;
  v_label    text;
  v_declared text;
  v_derived  text;
  v_type     text;
  v_edef     uuid;
  v_via      text;
  v_via_fld  jsonb;
  v_far      uuid;
  v_far_lbl  text;
  v_filter   jsonb;
  v_fkey     text;
  v_leaf     text;
  v_store_on boolean;
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

  -- Only field definitions, and never the kernel `Field` row itself (REC-27).
  if new.table_id is distinct from custom.field_kernel_id() or new.data_class = 'kernel' then
    return new;
  end if;

  v_label    := coalesce(nullif(d ->> 'label', ''), d ->> 'key', 'this field');
  v_type     := d ->> 'type';
  v_declared := nullif(d ->> 'parity_type', '');
  v_derived  := custom.parity_type(d);
  v_edef     := nullif(d ->> 'entity_definition_id', '')::uuid;

  -- LANE 10 P4: A STATUS'S GROUPS ARE KEYED BY EACH CHOICE'S STORED KEY (verifier V8 #3): every
  -- name the write used (words, an option id, a key) becomes the key a rename never changes; a name
  -- that is no choice of the column is refused; a removed choice's group is dropped.
  if d ->> 'format' = 'status' and jsonb_typeof(d -> 'config' -> 'status_groups') = 'object' then
    new.data := jsonb_set(new.data, '{config,status_groups}',
                  custom.status_groups_keyed(new.organization_id,
                                             nullif(d -> 'config' ->> 'options_table_id', '')::uuid,
                                             d -> 'config' -> 'status_groups',
                                             case when tg_op = 'UPDATE' then old.data -> 'config' -> 'status_groups' end,
                                             v_label));
    d := new.data;
  end if;
  -- LANE 10 P4: what a column of one of the nine newer kinds has to say about itself (a rating's
  -- top star, a duration's seconds, a status's groups, a barcode's symbology …), asked in one place.
  perform custom._field_kind_shape_ok(d, v_label);

  -- (a) A NAME NOBODY SHIPS. Refused with the list, so a typo is not a silent plain field.
  if v_declared is not null
     and not exists (select 1 from custom.parity_field_types() t
                      where t.parity_type = v_declared) then
    raise exception 'the field % says it is a % and that is not one of the field types this system ships',
                    v_label, v_declared
      using errcode = '23514',
            hint = format('FLD-11: select parity_type from custom.parity_field_types() - %s.', custom._parity_types_sentence());
  end if;

  -- A Field that CALLS itself the formula parity type and carries no expression of its own.
  -- (A behaviour-`formula` Field whose answer comes from a compute Rule derives NULL above
  -- and never reaches here — it is W1-RULE's, and this lane does not demand anything of it.)
  if v_declared = 'formula' and jsonb_typeof(d -> 'config' -> 'expr') is distinct from 'object' then
    raise exception 'the field % is worked out and does not say how', v_label
      using errcode = '23514',
            hint = 'FLD-11 / REC-15: config.expr is a Rule expression - the same shape and the same evaluator a Rule uses (select node from custom.rule_node_kinds()).';
  end if;

  -- ── FIX-10B-F5, 2026-09-22: AND IT HAS TO SAY IT WITH COLUMNS THAT ARE ACTUALLY THERE. ──
  --
  -- The check above asks whether a worked-out column says HOW. This one asks whether what it
  -- says can ever be answered. VERIFIER-10, on Rincon Plumbing Co's "Truck 1 dispatch
  -- backlog": a "Ticket label" column built from the Add-field panel read `—` on all 100
  -- rows, before a write, after a write to a source column, and after a reload. Its stored
  -- expression was `{"op":"concat","args":[{"const":""}]}` — a formula reading no column at
  -- all. That particular shape is the PANEL's to refuse (only the screen knows it asked a
  -- person which columns and was answered with none; a trivial expression is legitimate here,
  -- because a compute Rule with `target_field_id` can be the thing that fills the column —
  -- `scripts/campaign-tests/w1_rule_apply.sql` declares exactly that pair on purpose). So
  -- that half is closed in `@ai-matrx/records-ui`'s FieldEditor and NOT here.
  --
  -- WHAT IS THE STORE'S TO REFUSE IS THE SIBLING THE SAME CENSUS FOUND, WHICH NO SCREEN CAN
  -- SEE. Measured on the main database, 2026-09-22, over every live formula column:
  --
  --     "Worked out"  expr {"op":"concat","args":[{"field":"title"}]}   -> NOT AN ID
  --     "Shouty"      expr {"node":"field","field":"serial"}            -> NOT AN ID
  --     "Doubled"     expr {"op":"concat","args":[{"field":"3014b868-…"}]} -> NO SUCH FIELD
  --
  -- `custom.rule_eval` refuses each of those BY NAME at evaluation — REC-17, "by id, never by
  -- name" — and `custom.derived_value` catches the refusal, writes a `raise warning` no
  -- person will ever read, and answers null. The column is therefore `—` on every record of
  -- that table forever, and the only place the reason exists is a server log. That is the
  -- same defect as F5 wearing a different hat, and it is exactly what a declaration-time
  -- guard is for: the column is refused when somebody writes it, naming the column and what
  -- is wrong with it, instead of going quiet for the rest of its life.
  --
  -- HERE, RATHER THAN IN A DOOR, BECAUSE EVERY WRITER PASSES THROUGH HERE. field_declare,
  -- field_update's behaviour arm, a table spec's inline fields, an import's new columns and
  -- any direct write to custom.record all fire this trigger; a check in one door would leave
  -- the other four open. Rows already saved are untouched until something writes them again.
  -- HELD OFF BY THE CAMPAIGN'S OWN SWITCH, READ BY NAME. `custom.store_is_open` is the one
  -- reader of `custom/system_enabled` and is what `custom.assert_store_door` above already
  -- obeyed — but it reads the knob through a function call, and an OFF proof that rests on a
  -- lane's word about what a function does is not a proof. So the knob is ALSO read here by
  -- its own name: while the switch resolves false for this organization, this new refusal
  -- does not exist and the path is exactly what it was. The two readings differ in one case
  -- and the OR is what keeps it honest — `custom.store_is_open` also answers true for an
  -- organization born after 2026-09-21 01:30:44+00, which has the store on with no override
  -- row to resolve, and a guard that went quiet for every new organization would be worse
  -- than the defect.
  -- CHAIR-ALWAYS-ON 2026-10-03: the per-organization store switch is retired and custom.store_is_open answers
  -- true for every organization, so the by-name knob read beside it is gone with the knob.
  v_store_on := custom.store_is_open(new.organization_id);

  if v_declared = 'formula' and v_store_on then
    for v_leaf in
      select distinct l #>> '{}'
        from jsonb_path_query(coalesce(d -> 'config' -> 'expr', '{}'::jsonb),
                              '$.**.field') l
       where jsonb_typeof(l) = 'string'
       union
      select distinct l #>> '{}'
        from jsonb_path_query(coalesce(d -> 'config' -> 'expr', '{}'::jsonb),
                              '$.**.parent_field') l
       where jsonb_typeof(l) = 'string'
    loop
      if v_leaf !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'the field % works its answer out from %, and that is a name rather than a column',
                        v_label, coalesce(v_leaf, 'nothing')
          using errcode = '23514',
                hint = 'REC-17: a worked-out column points at a Field BY ITS ID - {"field": "<the field''s id>"}. A name changes and the column would stop resolving, so the store never accepts one. Nothing was written.';
      end if;
      if custom.rule_field_key(new.organization_id, v_leaf::uuid) is null then
        raise exception 'the field % works its answer out from a column that is not in this organization', v_label
          using errcode = '23503',
                hint = 'REC-17 / REC-18: every {"field": …} in config.expr names a live Field of this organization. Open the table and use the id of the column you meant. Nothing was written.';
      end if;
    end loop;
  end if;

  -- (b) THE DECLARATION AND WHAT IT ACTUALLY DECLARES HAVE TO AGREE. This is the whole of
  -- ruling 1 as a refusal: a parity type is made of a behaviour and its modifiers, so a
  -- field that CALLS itself a currency while declaring no unit is refused naming BOTH words.
  if v_declared is not null and v_derived is distinct from v_declared then
    raise exception 'the field % calls itself a %, and what it actually says it is is %',
                    v_label, v_declared, coalesce(v_derived, 'a plain ' || custom.said(v_type, 'field'))
      using errcode = '23514',
            hint = format('FLD-11: %s is made of %s. A parity type is a behaviour plus its modifiers, never a behaviour of its own - fix the declaration, not the name.',
                          v_declared,
                          coalesce((select t.made_of from custom.parity_field_types() t
                                     where t.parity_type = v_declared), 'a behaviour'));
  end if;

  -- (c) THE FOUR WITH NO LIVE IMPLEMENTATION have declarations of their own, and each one
  -- is refused BY THE FIELD'S NAME rather than by an evaluator failing later.
  if v_derived in ('lookup', 'rollup') then
    v_via := nullif(d -> 'config' ->> 'via', '');
    if v_via is null then
      raise exception 'the field % has to say which relation it reads through', v_label
        using errcode = '23514',
              hint = 'FLD-11: a lookup and a rollup both travel along a relation. config.via names a relation Field of this same table, by its key.';
    end if;
    if v_edef is not null then
      select f.data into v_via_fld
        from custom.record f
       where f.organization_id = new.organization_id
         and f.table_id = custom.field_kernel_id()
         and f.deleted_at is null
         and (f.data ->> 'entity_definition_id')::uuid = v_edef
         and f.data ->> 'key' = v_via
       limit 1;
      -- CHAIR-UI-STORE (2026-10-03): A ROLL-UP MAY READ THROUGH A BACK-LINK. "Booked visits per
      -- patient" reads the Appointments that link here — the reverse column REL-9 shows on this
      -- table, which is virtual (no Field row). custom._back_link_relation answers it as the
      -- relation it mirrors seen from this end: many records, of the linking table.
      if v_via_fld is null and v_derived = 'rollup' then
        v_via_fld := custom._back_link_relation(new.organization_id, v_edef, v_via);
      end if;
      if v_via_fld is null then
        raise exception 'the field % reads through a relation called %, and this table has no field called %',
                        v_label, v_via, v_via
          using errcode = '23514', hint = 'FLD-11: config.via names a field of the SAME table, by key.';
      end if;
      if v_via_fld ->> 'type' <> 'relation' then
        raise exception 'the field % reads through %, and % is not a relation - it is a %',
                        v_label, v_via, v_via, v_via_fld ->> 'type'
          using errcode = '23514',
                hint = 'FLD-11: a lookup reads a value through a RELATION and a rollup aggregates along one. A value on this same record is a formula, not a lookup.';
      end if;
      if v_derived = 'rollup' and not coalesce((v_via_fld ->> 'multi')::boolean, false) then
        raise exception 'the field % adds up % and % points at one thing at a time', v_label, v_via, v_via
          using errcode = '23514',
                hint = 'FLD-11: a rollup aggregates MANY records. Give the relation the multi modifier, or read the one value with a lookup.';
      end if;
    end if;
  end if;

  if v_derived = 'lookup' and nullif(d -> 'config' ->> 'pick', '') is null then
    raise exception 'the field % has to say which value it reads on the other side', v_label
      using errcode = '23514', hint = 'FLD-11: config.pick names a field key of the related record.';
  end if;

  if v_derived = 'rollup' then
    if nullif(d -> 'config' ->> 'agg', '') not in ('sum', 'count', 'min', 'max', 'avg') then
      raise exception 'the field % says it works out % of the records it points at, and it adds them up, counts them, or takes the smallest, the largest or the average',
                      v_label, custom.said(d -> 'config' ->> 'agg', 'nothing')
        using errcode = '23514', hint = 'FLD-11: config.agg is sum, count, min, max or avg.';
    end if;
    if (d -> 'config' ->> 'agg') <> 'count'
       and nullif(d -> 'config' ->> 'of', '') is null then
      raise exception 'the field % has to say which value of the records it points at it works out', v_label
        using errcode = '23514',
              hint = 'FLD-11: config.of names a field key on the far side. Only count needs no field, because it counts the records themselves.';
    end if;
    -- CHAIR-MATH (b): THE FILTER IS CHECKED WHERE THE FIELD IS DECLARED, never at read time.
    -- config.filter narrows the linked records the roll-up adds up, in the SAME grammar a saved
    -- view's filter uses (custom.record_filter_sql over the far table: {"status": "open"}, a
    -- window {"due": {"before": …}}, or a Rule expression {"op": "eq", "args": [{"field": "<far
    -- field id>"}, {"const": "open"}]}). An unknown column, an unknown op or a shape the far table
    -- cannot answer is refused here, by the field's name, with the compiler's own sentence.
    if d -> 'config' ? 'filter' and jsonb_typeof(d -> 'config' -> 'filter') <> 'null' then
      v_filter := d -> 'config' -> 'filter';
      if jsonb_typeof(v_filter) <> 'object' then
        raise exception 'the field % narrows the records it adds up with a filter, and a filter is a set of conditions like {"status": "open"}, not a %',
                        v_label, jsonb_typeof(v_filter)
          using errcode = '23514',
                hint = 'FLD-11 / CHAIR-MATH: config.filter uses the same shape a saved view''s filter does, written against the columns of the table the relation points at.';
      end if;
      if v_via_fld is not null then
        v_far := nullif(v_via_fld ->> 'relation_target', '')::uuid;
        if v_far is null then
          raise exception 'the field % narrows the records it adds up, but the relation it reads through (%) does not say which table it points at',
                          v_label, v_via
            using errcode = '23514', hint = 'FLD-11: give the relation a relation_target first.';
        end if;
        select coalesce(nullif(t.data ->> 'label_plural', ''), nullif(t.data ->> 'name', ''), 'linked')
          into v_far_lbl
          from custom.record t where t.organization_id = new.organization_id and t.id = v_far;
        if not custom.filter_is_rule(v_filter) then
          for v_fkey in select split_part(k, '.', 1) from jsonb_object_keys(v_filter) k loop
            if not exists (select 1 from custom.record f
                            where f.organization_id = new.organization_id
                              and f.table_id = custom.field_kernel_id()
                              and f.deleted_at is null
                              and f.data ->> 'entity_definition_id' = v_far::text
                              and f.data ->> 'key' = v_fkey) then
              raise exception 'the field % narrows the records it adds up by "%", and the % table has no column with that key',
                              v_label, v_fkey, coalesce(v_far_lbl, 'linked')
                using errcode = '23514',
                      hint = 'FLD-11 / CHAIR-MATH: config.filter names columns of the table the relation points at, by key — {"status": "open"} — or points at them by id in a Rule expression.';
            end if;
          end loop;
        end if;
        begin
          perform custom.record_filter_sql(new.organization_id, v_far,
                    case when custom.filter_is_rule(v_filter) then v_filter
                         else custom.choice_filter_normalize(custom.choice_field_map(new.organization_id, v_far), v_filter) end);
        exception when others then
          raise exception 'the field % narrows the records it adds up with a filter the % table cannot answer: %',
                          v_label, coalesce(v_far_lbl, 'linked'), sqlerrm
            using errcode = '23514',
                  hint = 'FLD-11 / CHAIR-MATH: config.filter is read exactly as a saved view''s filter on that table is; fix it the way that sentence says.';
        end;
      end if;
    end if;
    -- ANNOUNCED, NOT SILENT (rule 16). A rollup stamped at write time goes stale the moment
    -- a contained record moves, and nothing in this campaign yet propagates a child's write
    -- to its parents. So the declaration is refused rather than quietly wrong.
    if (d ->> 'compute_on') = 'write' then
      raise exception 'the field % adds up other records and says it works itself out when this record is saved, and it would then be out of date the moment one of them changed',
                      v_label
        using errcode = '23514',
              hint = 'FLD-11 / FLD-9: declare compute_on read for a rollup - it is then worked out from the contained records every time it is read, and is never stale. Stamping one at write time needs a child-to-parent recompute that no lane has built; W3-MIG/W3-HIST is where it belongs when somebody wants the cache.';
    end if;
  end if;

  -- (d) THE NINE THAT DO EXIST, each refused on the one thing that makes it that type.
  if v_derived = 'attachment'
     and coalesce(d ->> 'on_target_delete', '') = 'cascade' then
    raise exception 'the field % says deleting the file deletes the record that shows it', v_label
      using errcode = '23514',
            hint = 'REC-31: a picture is a File record reached through a relation. Removing the file removes the attachment, never the record it was attached to - set_null or restrict.';
  end if;

  if v_derived in ('url', 'email', 'phone')
     and not exists (select 1 from custom.field_rules(d) r where r.kind = 'pattern') then
    raise exception 'the field % holds a % and nothing says what a % looks like', v_label, v_derived, v_derived
      using errcode = '23514',
            hint = 'FLD-3 / FLD-11: the format says how to SHOW it; what makes it enforceable is an attached validation Rule of kind pattern. A format with no rule is a label on an empty box.';
  end if;

  if v_derived = 'percent'
     and not exists (select 1 from custom.field_rules(d) r where r.kind in ('min', 'max')) then
    raise exception 'the field % holds a percentage and nothing says the range it lives in', v_label
      using errcode = '23514',
            hint = 'FLD-3 / FLD-11: attach min and max Rules. A percent field that takes -40 is a percent in name only.';
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.rollup_value(p_organization_id uuid, p_record_id uuid, p_field_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_via     text := p_field_data -> 'config' ->> 'via';
  v_of      text := p_field_data -> 'config' ->> 'of';
  v_agg     text := p_field_data -> 'config' ->> 'agg';
  v_filter  jsonb := p_field_data -> 'config' -> 'filter';
  v_nums    numeric[] := array[]::numeric[];
  v_n       integer := 0;
  v_one     jsonb;
  v_t       uuid;
  v_targets uuid[];
  v_table   uuid;
  v_far     uuid;
  v_where   text;
begin
  -- The linked records, once each (custom.relation_targets is DISTINCT), never the record itself.
  select coalesce(array_agg(t), '{}'::uuid[]) into v_targets
    from custom.relation_targets(p_organization_id, p_record_id, v_via) t
   where t <> p_record_id;         -- a record is never one of the things it adds up.

  -- CHAIR-MATH (b): WHICH OF THEM. config.filter is a saved view's filter written against the far
  -- table (custom.record_filter_sql: the one grammar — a flat map of column keys, windows, or a
  -- Rule expression over field ids), compiled once per roll-up and asked of the linked records in
  -- ONE statement. It is asked as this reader: a column the reader may not read refuses here as it
  -- refuses on the view (custom.derived_value turns that into an empty column, warned), and a Rule
  -- filter treats a hidden column as undecided — the roll-up counts what THIS reader may see.
  if v_filter is not null and jsonb_typeof(v_filter) = 'object' and v_filter <> '{}'::jsonb
     and cardinality(v_targets) > 0 then
    v_table := coalesce(nullif(p_field_data ->> 'entity_definition_id', '')::uuid,
                        (select r.table_id from custom.record r
                          where r.organization_id = p_organization_id and r.id = p_record_id));
    select nullif(f.data ->> 'relation_target', '')::uuid into v_far
      from custom.record f
     where f.organization_id = p_organization_id
       and f.table_id = custom.field_kernel_id()
       and f.deleted_at is null
       and f.data ->> 'entity_definition_id' = v_table::text
       and f.data ->> 'key' = v_via
     limit 1;
    -- CHAIR-UI-STORE: a roll-up through a back-link adds up records of the LINKING table.
    if v_far is null then
      v_far := nullif(custom._back_link_relation(p_organization_id, v_table, v_via) ->> 'relation_target', '')::uuid;
    end if;
    if v_far is null then
      raise exception 'The column "%" narrows the records it adds up, but the relation it reads through (%) points at no table, so it is left empty.',
        coalesce(nullif(p_field_data ->> 'label', ''), p_field_data ->> 'key', 'this column'), v_via
        using errcode = '23514', hint = 'FLD-11: give the relation a relation_target.';
    end if;
    v_where := custom.record_filter_sql(p_organization_id, v_far,
                 case when custom.filter_is_rule(v_filter) then v_filter
                      else custom.choice_filter_normalize(custom.choice_field_map(p_organization_id, v_far), v_filter) end);
    execute format('select coalesce(array_agg(r.id), ''{}''::uuid[]) from custom.record r '
                   'where r.organization_id = $1 and r.table_id = $2 and r.id = any ($3) '
                   'and r.deleted_at is null and %s', v_where)
       into v_targets
      using p_organization_id, v_far, v_targets;
  end if;

  foreach v_t in array v_targets loop
    v_n := v_n + 1;                                    -- count counts RECORDS, once each.
    if v_of is not null then
      -- STORE-TAILS-3: the one column it adds up, never the far record whole.
      v_one := custom.far_value(p_organization_id, v_t, v_of, p_field_data);
      if v_one is not null and jsonb_typeof(v_one) = 'number' then
        v_nums := v_nums || (v_one #>> '{}')::numeric;
      end if;
    end if;
  end loop;

  if v_agg = 'count' then
    return to_jsonb(v_n);
  end if;
  if array_length(v_nums, 1) is null then
    return null;                    -- nothing to work out is an absence, never a zero.
  end if;
  return case v_agg
    when 'sum' then to_jsonb((select sum(x) from unnest(v_nums) x))
    when 'min' then to_jsonb((select min(x) from unnest(v_nums) x))
    when 'max' then to_jsonb((select max(x) from unnest(v_nums) x))
    when 'avg' then to_jsonb((select avg(x) from unnest(v_nums) x))
  end;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.relation_targets(p_organization_id uuid, p_record_id uuid, p_via_key text)
 RETURNS SETOF uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
declare
  v_table uuid;
  v_back  jsonb;
  v_me    uuid;
  v_pred  text;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.relation_targets');
  -- LANE 12 P7: the links of the row a Confidential Table's reader rule is being worked out for
  -- (custom.confidential_answer marks it for that one evaluation): the rule reads them with no reader seat.
  if nullif(current_setting('mx.confidential_rule_row', true), '') is distinct from p_record_id::text then
    perform custom.assert_client_may_open(p_organization_id, p_record_id, 'custom.relation_targets', 'viewer'::public.permission_level, 'record');
  end if;
  -- CHAIR-UI-STORE (2026-10-03): A BACK-LINK IS READ BY ITS EDGES. A key this record does not
  -- carry may be one of its table's reverse columns (REL-9, virtual): then the linked records are
  -- the linking records whose relation edge points here — the same platform.associations rows
  -- custom.reverse_links_many reads — and only the ones this reader may see, as that door counts.
  if not exists (select 1 from custom.record r
                  where r.organization_id = p_organization_id and r.id = p_record_id
                    and r.data ? p_via_key) then
    select r.table_id into v_table from custom.record r
     where r.organization_id = p_organization_id and r.id = p_record_id and r.deleted_at is null;
    v_back := custom._back_link_relation(p_organization_id, v_table, p_via_key);
    if v_back is not null then
      v_me := custom.query_principal();
      v_pred := case when v_me is null then 'true'
                     else custom.visible_predicate_sql(v_me, p_organization_id,
                            (v_back ->> 'relation_target')::uuid, 'viewer'::public.permission_level, 'r') end;
      return query execute format($q$
        select distinct r.id
          from platform.associations a
          join custom.record r
            on r.organization_id = $1 and r.id = a.source_id and r.table_id = $3
           and r.data_class = 'record' and r.deleted_at is null
         where a.organization_id = $1
           and a.target_type = 'record' and a.target_id = $2
           and a.relation_field_id = $4
           and a.deleted_at is null
           and (%s)
      $q$, v_pred)
      using p_organization_id, p_record_id, (v_back ->> 'relation_target')::uuid, (v_back ->> 'back_link_of')::uuid;
      return;
    end if;
  end if;
  return query
-- DISTINCT is the whole of "no double counting": a record listed twice in the same
  -- relation is one related record, whatever the document says.
  select distinct (t #>> '{}')::uuid
    from custom.record r
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(r.data -> p_via_key) = 'array' then r.data -> p_via_key
           when r.data ? p_via_key and jsonb_typeof(r.data -> p_via_key) = 'string'
                then jsonb_build_array(r.data -> p_via_key)
           else '[]'::jsonb end) t
   where r.organization_id = p_organization_id
     and r.id = p_record_id
     and r.deleted_at is null
     and (t #>> '{}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
end;
$function$;
