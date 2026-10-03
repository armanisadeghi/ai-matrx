-- INVERSE of migrations/campaign/chairalwayson_a_the_store_is_never_off.sql (lane CHAIR-ALWAYS-ON).
-- Puts the eight bodies back to what production held before the lane: custom.store_is_open reading the
-- knob (with its 2026-09-21 and 2026-10-01 patch paragraphs) and the seven bodies that read
-- custom/system_enabled by name. Restoring these makes the knob a live reader again; un-archive it
-- (platform.knob_unarchive) if the switch is to mean anything.
-- chair-step: restores the per-organization record-store switch the owner retired on 2026-10-03
-- based-on: custom.store_is_open(uuid) 747dcd73bb5b3c5badf76195aedbf7e83aa8b7c20455e5d0b0721c9c51a25b4b
-- based-on: custom._field_type_parity_guard() 6e67b8dc29758d9bbded64cd80ca333354484285b2ad94cf61607bd33f6199e4
-- based-on: custom._record_events_to_activity() 2c683fae423ae3c7d98f70c43fd4cf487876d077c864799ffe350a5de41c414d
-- based-on: custom._store_door() da0a4cce8945d5a17fa5c7c04a3c0d465a9badc1528a07dbfefb6bf498c19d59
-- based-on: custom._table_shape_guard() 1238461c4372d987b57dbbd962b3e8c107a9fa3bc931c2883b3d64c4de35a7d2
-- based-on: custom._value_envelope() 27dd5567479d7bde96c4d2d1e05166df7112884982496a445639bebe41beaae7
-- based-on: custom.migrate_purge(uuid, uuid, boolean) 826a278a177e68ec908e29edf86dd2e477c8f965724422c5a6d0ab3d2a156d19
-- based-on: public.prune_high_volume_logs() 5994b4716578d8c0bff04f8f4a83ea6267ec8b7fd657048752a2a298b1c4ac47

CREATE OR REPLACE FUNCTION custom.store_is_open(p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_open boolean;
begin
  -- The established read, unchanged from `custom._entity_custom_fields_guard` and
  -- `custom.containment_depth_ceiling`: `platform.knob_resolve(feature, key, rung)` answers
  -- jsonb and `#>> '{}'` takes the scalar out of it. Passing the organization id means an
  -- organization rung answers for that organization; `null` asks for the platform value,
  -- which is `coalesce(value, default_value)` and is what the runner asserts is false before
  -- it opens anything (§6b.2).
  begin
    v_open := coalesce((platform.knob_resolve('custom', 'system_enabled', p_organization_id) #>> '{}')::boolean,
                       false);

    -- ── LIMITS-FIX 2026-09-21: AN ORGANIZATION BORN AFTER THE RULING STARTS WITH THE
    -- STORE ON, AND NOTHING IS WRITTEN TO SAY SO. ─────────────────────────────────────────
    -- Measured the same day: 588 organizations, 73 carrying an override, so 515 resolve to
    -- the platform default of false — the store is off for every organization anyone made
    -- without knowing to ask, which is every organization the real-data crews made. Crew D
    -- followed the product's own tour and met a refusal several calls in.
    --
    -- WHY THIS IS A READ AND NOT A ROW. The first attempt was an AFTER INSERT trigger on
    -- `iam.organizations` writing the override at birth. It worked, and it broke 129
    -- campaign suites in one apply: every one of them creates an organization and then
    -- INSERTs this exact knob row, which now already existed —
    -- `duplicate key value violates unique constraint "knob_override_pkey"`. A default
    -- belongs in how the question is ANSWERED, not in a row that everyone else's INSERT
    -- then collides with. Nothing is written here, so nothing can collide.
    --
    -- AND AN EXISTING ORGANIZATION KEEPS ITS ANSWER. This only supplies a value where the
    -- organization has said nothing: an organization-scoped override, either way, is read
    -- above and wins untouched. The instant is when the ruling actually took effect on this
    -- database, so no organization that existed before it changes behaviour.
    if not v_open and p_organization_id is not null
       and not exists (select 1 from platform.knob_override k
                        where k.feature = 'custom' and k.key = 'system_enabled'
                          and k.scope_kind = 'organization'
                          and k.organization_id = p_organization_id)
       and exists (select 1 from iam.organizations o
                    where o.id = p_organization_id
                      and o.created_at >= timestamptz '2026-09-21 01:30:44+00') then
      v_open := true;
    end if;

    -- ── POST-PRESS-SENTENCES 2026-10-01: AFTER THE PRESS THE STORE IS THE ONLY SYSTEM. ──────
    -- Chair ruling (safety net C15 / W14): once an organization's tables have moved
    -- (data_tables/older_tables_moved, which the final switch's press sets for every
    -- organization and as the platform value), the older door refuses a new table ("born in
    -- the new system") — so an organization that had switched its record store off could make
    -- no table anywhere. Its switch means nothing after the press and is ignored here: births
    -- and every write go to the store. Read through the same knob reader as the switch above
    -- and as the web app's birth door (where-a-table-is-born.ts), so the two never disagree.
    -- The switch itself retires after the switch.
    if not v_open and p_organization_id is not null
       and coalesce((platform.knob_resolve('data_tables', 'older_tables_moved', p_organization_id) #>> '{}')::boolean,
                    false) then
      v_open := true;
    end if;
  exception when others then
    -- §6b.4b, and it is a real trap rather than defensive noise: `platform.knob_resolve` is
    -- SECURITY INVOKER, and `has_table_privilege('anon','platform.feature_knob','SELECT')`
    -- is false — so for a role that merely cannot SEE the row it RAISES `P0001 … is not
    -- seeded`, which reads like a missing knob and is not one. A switch this writer cannot
    -- read is CLOSED, never open, and the caller is what says so out loud.
    v_open := false;
  end;
  return v_open;
end;
$function$

;

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
  v_store_on := custom.store_is_open(new.organization_id)
                or coalesce((platform.knob_resolve('custom', 'system_enabled', new.organization_id) #>> '{}')::boolean,
                            false);

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
$function$

;

CREATE OR REPLACE FUNCTION custom._record_events_to_activity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  insert into platform.activity_log (organization_id, entity_type, entity_id, action, actor_id, metadata)
  select n.organization_id,
         custom.record_source_key(n.table_id),
         n.record_id,
         'record.' || case
           when n.operation = 'updated' then 'updated'
           when n.operation = 'created' and coalesce(r.version, 1) > 1 then 'restored'
           when n.operation = 'created' then 'created'
           when n.operation = 'deleted' and r.id is null then 'purged'
           when n.operation = 'deleted' then 'archived'
           else n.operation end,
         nullif(n.actor ->> 'user_id', '')::uuid,
         jsonb_build_object(
           'table_id',          n.table_id,
           'table_name',        t.data ->> 'name',
           'record_id',         n.record_id,
           'version',           r.version,
           'changed_field_ids', n.changed_field_ids,
           -- G8: the changed columns by KEY, the older store's `changed_fields` word, so the
           -- scheduler's `changed_fields` filter (scheduler.sch_match_event) reads both stores
           -- one way.
           'changed_fields',    coalesce((select jsonb_agg(f.data ->> 'key' order by f.data ->> 'key')
                                            from custom.record f
                                           where f.organization_id = n.organization_id
                                             and f.table_id = custom.field_kernel_id()
                                             and f.id::text in (select jsonb_array_elements_text(
                                                   case when jsonb_typeof(n.changed_field_ids) = 'array'
                                                        then n.changed_field_ids else '[]'::jsonb end))),
                                         '[]'::jsonb),
           'actor_tier',        n.actor ->> 'tier',
           'source',            'custom.io_outbox')
    from new_rows n
    left join custom.record r on r.organization_id = n.organization_id and r.id = n.record_id
    left join custom.record t on t.organization_id = n.organization_id and t.id = n.table_id
   where n.event_key = 'records.changed'
     and n.table_id is not null
     and (exists (select 1 from files.webhooks w
                   where w.is_active
                     and w.organization_id = n.organization_id
                     and w.resource_types && custom.record_source_keys(n.table_id))
          -- G8: ONE PATH FOR BOTH STORES. A schedule that runs an agent when a row changes
          -- (scheduler.sch_trigger type `event`) listens to the same activity spine the older
          -- store's workbench.udt_row_activity writes, and scheduler.sch_match_event fires it
          -- from there. A record-store table's changes now land on that spine whenever a live
          -- schedule listens for them, exactly as they do for a webhook.
          or exists (select 1 from scheduler.sch_trigger t
                      where t.type = 'event' and t.enabled and t.deleted_at is null
                        and t.organization_id = n.organization_id
                        and t.config ->> 'entity_type' = any (custom.record_source_keys(n.table_id))))
     -- The organization's own store switch (the guard this file names): a store that is off
     -- announces nothing, to a webhook or to a schedule.
     and platform.knob_resolve('custom', 'system_enabled', n.organization_id) is distinct from 'false'::jsonb;
  -- LANE SCOPES-SIDE-EFFECTS: the old scope tables' side effects ride this consumer's own statement
  -- (the search index, the suggestion-sweep wake, a scope's dataset table), for Tables kept for
  -- context only — custom._context_side_effects filters. No trigger of their own: creating one on
  -- custom.io_outbox would queue every store write behind its lock.
  perform custom._context_side_effects(
    (select jsonb_agg(jsonb_build_array(n.organization_id, n.record_id, n.table_id, n.operation))
       from new_rows n
      where n.event_key = 'records.changed' and n.table_id is not null));
  return null;
end
$function$

;

CREATE OR REPLACE FUNCTION custom._store_door()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_row     record := coalesce(new, old);  -- `new` is unassigned on DELETE; reading it raises
  v_door    text;
  v_owner   oid;
  v_root    oid;
  v_retired timestamptz;
  v_days    integer;
begin
  -- THE DOOR IS NAMED AFTER THE TABLE A PERSON KNOWS, NOT AFTER A PARTITION. `custom.record`
  -- is hash partitioned into sixteen children and a write on the parent is ROUTED, so it is
  -- the PARTITION's copy of this trigger that fires and `tg_table_name` is `record_p03`.
  -- Measured on the branch before this line existed: a refused delete read `... so
  -- custom.record_p03 is not taking writes from "zz_dd"`, which names something the caller
  -- never wrote and cannot look up. A screen - or an error - never lies. `pg_partition_root`
  -- answers NULL for a table that is neither a partition nor partitioned, so the coalesce
  -- covers `external_link` and `external_source` and every partitioned table a later lane
  -- adds to this schema.
  v_root := coalesce(pg_partition_root(tg_relid), tg_relid);
  select format('%I.%I', n.nspname, c.relname), c.relowner into v_door, v_owner
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where c.oid = v_root;

  -- One line, because there is one predicate. The door's own name is what the refusal
  -- carries, so a caller is told WHICH door said no rather than that "something" did.
  perform custom.assert_store_door(v_row.organization_id, v_door);

  if tg_op <> 'DELETE' then
    return new;
  end if;

  -- THE OPERATOR LANE, unchanged: read from the catalogue, never as a role literal (rule 15).
  if pg_has_role(custom.caller_role(), v_owner, 'member') then
    return old;
  end if;

  -- A TABLE MOVING TO ANOTHER ORGANIZATION IS NOT A DELETION (lane SC-1', custom.table_move).
  -- The store is hash-partitioned by organization, so re-keying a row's organization is,
  -- underneath, a DELETE from one partition and an INSERT of the SAME row (same id, same
  -- version, same history) into another, inside one statement. It passes only when BOTH hold:
  -- the statement runs as the store's owner — only definer code runs so, never a client — AND
  -- custom.table_move has marked this transaction as moving rows out of THIS row's organization.
  -- A definer door that deletes rows sets no such mark, so REC-23 still refuses it below.
  -- And only while the organization's record store is switched on (custom/system_enabled): with
  -- the switch off this arm is inert and the door is exactly what it was.
  if pg_has_role(current_user, v_owner, 'member')
     and nullif(current_setting('custom.table_move_from', true), '') = v_row.organization_id::text
     and coalesce((platform.knob_resolve('custom', 'system_enabled', v_row.organization_id) #>> '{}')::boolean, false) then
    return old;
  end if;

  -- REC-23, ASKED AS THE RULE IT IS. "A delete is soft within retention and reversible within
  -- it" — so what ends the protection is the WINDOW running out, not who is asking. A row
  -- retired for longer than its Table says has been reversible for its whole life and is now
  -- the retention job's to destroy; `custom.migrate_purge` is that job and is how a client
  -- reaches this line at all, after the organization wall, ADMIN on the Table and the switch.
  v_retired := (to_jsonb(v_row) ->> 'deleted_at')::timestamptz;
  if v_retired is not null and v_row.organization_id is not null then
    begin
      v_days := case when v_root = 'custom.record'::regclass
                     then history.retention_days(v_row.organization_id,
                                                 (to_jsonb(v_row) ->> 'table_id')::uuid)
                     else history.retention_floor_days(v_row.organization_id) end;
    exception when others then
      -- An unreadable retention is never a shorter one. The platform floor stands.
      v_days := 30;
    end;
    if v_retired < now() - make_interval(days => greatest(coalesce(v_days, 30), 30)) then
      return old;
    end if;
  end if;

  raise exception 'Records are not deleted for good here, so % did not take that deletion.', v_door
    using errcode = '42501',
          hint = 'REC-23: a delete is soft and reversible while the table keeps its history - thirty days at the very least, and each table says how long. Use custom.record_delete(organization, record), which marks it deleted and can be undone with custom.record_restore(organization, record); nothing is lost in between. Once that window has run out, custom.migrate_purge(organization, table) is what destroys it, and nothing else does - removing a row for good is the retention job''s, never a caller''s, switched on or off.';
end;
$function$

;

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
      -- CHAIR-ACCESS c: `when` is a condition in the saved-view where grammar - a flat {column: value}
      -- map over this table's own columns, or a Rule expression ({"op": ...}). Anything else, or a flat
      -- key that is not a column of this table, is refused here so a reveal rule never silently fails.
      elsif v_reader ? 'when' and jsonb_typeof(v_reader -> 'when') is distinct from 'object' then
        v_bad := array_append(v_bad, format('a reader''s when is a condition on the row, and %s''s is a %s', v_reader ->> 'field', jsonb_typeof(v_reader -> 'when')));
          v_bad_hints := array_append(v_bad_hints, ('readers[].when is {column: value, ...} over this table''s columns, or a Rule expression {"op": ..., "args": [...]} - the same grammar a saved view''s where uses.')::text);
      elsif v_reader ? 'when' and not custom.filter_is_rule(v_reader -> 'when')
            and exists (select 1 from jsonb_object_keys(v_reader -> 'when') k where v_names is null or not (k = any (v_names))) then
        v_bad := array_append(v_bad, format('a reader''s when names a column this table does not have: %s',
                   (select string_agg(k, ', ') from jsonb_object_keys(v_reader -> 'when') k where v_names is null or not (k = any (v_names)))));
          v_bad_hints := array_append(v_bad_hints, ('readers[].when: every key is one of this table''s column keys.')::text);
      end if;
    end loop;
  end if;

  -- CHAIR-DOORS-3A (2026-10-03): `maker_is_reader` says the Table belongs to the organization and the
  -- person who made it reads only what any reader reads (custom.confidential_answer). It is a state of
  -- a Confidential Table and nothing else: true, or left out.
  if d ? 'maker_is_reader' and (d -> 'maker_is_reader' is distinct from 'true'::jsonb
                                or d ->> 'level' is distinct from 'confidential') then
    v_bad := array_append(v_bad, format('only a Confidential table keeps its maker as a reader, and it says so with true or leaves it out'));
      v_bad_hints := array_append(v_bad_hints, ('Access ladder: maker_is_reader is true on a Confidential table, or absent.')::text);
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

  -- ── CHAIR-DOORS-3A: ONLY ARMAN TURNS "THE MAKER IS ONLY A READER" ON OR OFF, AND ONLY HE MOVES SUCH ──
  -- ── A TABLE BACK TO ORGANIZATION. The maker still holds the Table's own row; without this she ──
  -- ── could take the state off, or drop the level, and read every row again. The same approval, ──
  -- ── recorded in this transaction by the same door. ──
  if ((tg_op = 'INSERT' and d ? 'maker_is_reader')
      or (tg_op = 'UPDATE'
          and ((old.data -> 'maker_is_reader') is distinct from (d -> 'maker_is_reader')
               or (old.data -> 'maker_is_reader' = 'true'::jsonb
                   and d ->> 'level' is distinct from 'confidential'))))
     and not exists (select 1 from platform.class_approval_by_arman a
                      where a.token = 'custom.table:' || new.id::text
                        and a.txid = pg_current_xact_id()
                        and a.level = 'confidential'::platform.data_class) then
    raise exception 'Refused: % keeps the person who made it as only a reader, and only Arman turns that on or off or moves such a table back to Organization. The law: common-docs/policies/access-ladder.md. If Arman approved it in his own words, record them and make the change with custom.set_table_confidential_arman_explicitly_approved(p_table_id => %L, p_readers => null, p_arman_words => ''<his exact words>'', p_approved_on => ''<the date he said them>'', p_maker_is_reader => true or false).',
                    coalesce(nullif(d ->> 'name', ''), new.id::text), new.id
      using errcode = '42501';
  end if;

  return new;
end;
$function$

;

CREATE OR REPLACE FUNCTION custom._value_envelope()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_data     jsonb := coalesce(new.data, '{}'::jsonb);
  v_actor    text;
  v_obo      text;
  v_refusal  text;
  v_values   jsonb;
  v_key      text;
  v_declared boolean;
  v_type_fld text;
  v_rtype    text;
  v_src      text;
  v_agent    text[] := '{}'::text[];   -- ENRICH: the keys of this Table a model owns
  -- KINDS-GLUE N-C3: the platform Fields of a Table kept for agent outputs (config.kept_by = agent_output),
  -- key -> {label, default}, read in the same walk of the applicable Fields.
  v_platform jsonb := '{}'::jsonb;
  v_kept_by  text;
  v_flabel   text;
  v_fdefault jsonb;
  v_pkey     text;
  -- BIG-VALUES-WRITE: the text values over the ceiling this write carries into files.
  v_whole    jsonb := '{}'::jsonb;     -- key -> the whole text the writer supplied
  v_park     jsonb := '{}'::jsonb;     -- key -> the whole text that still needs its file
  v_ceiling  bigint;
  v_text     text;
  v_prior    jsonb;
  v_carry    jsonb;
begin
  -- THE DOOR. The thirteenth and last RETURNS trigger in this schema to read the ONE
  -- predicate, which judges custom.caller_role() and never current_user. custom/system_enabled
  -- decides WHO may write and never which check runs.
  perform custom.assert_store_door(new.organization_id, 'custom.record');

  -- A WRITE THAT ASSERTS NO VALUE HAS NO AUTHOR TO JUDGE (lane AGENT, 2026-09-19).
  -- MEASURED: a real agent turn wrote twenty records and could not delete ONE of them.
  -- custom.record_delete does `update custom.record set deleted_at = now()`, which fires
  -- this trigger over the UNCHANGED document; the document names no `_actor`, so
  -- custom.actor_word falls back to the connection's declaration ('agent'), and the
  -- forward arm below then refuses because nothing names the person the agent acts for —
  -- and nothing CAN, because a delete carries no document to put `_on_behalf_of` in and
  -- there is no GUC for it. So every agent delete, restore and reparent of a business
  -- record was refused, by a check about authorship, on a statement that authors nothing.
  --
  -- The condition is exactly that: an UPDATE whose `data` is not distinct from the row's
  -- existing `data` asserts no Value, so there is no new authorship to record and the
  -- authorship already stored stays exactly as it was. Every check below still runs, in
  -- full, on every statement that DOES change the document. This cannot widen anything:
  -- a write that changes no data could not have carried a value to mis-author.
  if TG_OP = 'UPDATE' and old.data is not distinct from new.data then
    return new;
  end if;

  -- A TEXT VALUE OF ANY SIZE SIMPLY SAVES (lane BIG-VALUES-WRITE, 2026-09-25). The owner:
  -- "Make sure that large data size is easy for users." A business record's text value over
  -- this organization's ceiling for one value (custom/value_max_bytes) is no longer refused:
  -- the cell keeps its first 1000 characters, and the whole text is carried into a file by
  -- the ONE rule the table mover already uses (matrx_records.big_values) - here it waits in
  -- custom.whole_value_parked until its file is written (below, and custom.whole_value_complete).
  -- The ceiling below then judges what the cell really holds. A definition row, a JSON value
  -- and a value on a key that is not one of the Table's Fields keep the refusal.
  if new.data_class = 'record'
     and new.table_id is not null
     and new.table_id <> custom.table_kernel_id()
     and new.table_id <> custom.field_kernel_id() then
    v_ceiling := custom.whole_value_ceiling(new.organization_id);
    for v_key, v_text in
      select e.key, e.value #>> '{}'
        from jsonb_each(v_data) e
       where left(e.key, 1) <> '_' and jsonb_typeof(e.value) = 'string'
         and octet_length(e.value::text) > v_ceiling
    loop
      -- Held OFF by the store's own switch (custom/system_enabled): an organization whose store
      -- is not on keeps the refusal below, exactly as before this file.
      exit when not coalesce((platform.knob_resolve('custom', 'system_enabled', new.organization_id) #>> '{}')::boolean, false);
      v_whole := v_whole || jsonb_build_object(v_key, v_text);
      v_data := jsonb_set(v_data, array[v_key], to_jsonb(custom.whole_value_head(v_text)));
    end loop;
  end if;

  -- THE CEILING (finding 4), over what the WRITER supplied, before anything else touches
  -- the document.
  v_refusal := custom.size_refusal(new.organization_id, v_data);
  if v_refusal is not null then
    raise exception '%', v_refusal
      using errcode = '23514',
            hint = 'The ceilings are custom/value_max_bytes and custom/document_max_bytes - organization-settable knobs with published defaults, not constants. A value too big to live in the record lives as a record of this store''s File table, and the value points at it.';
  end if;

  v_declared := v_data ? '_values' or v_data ? '_sources' or v_data ? '_actor' or v_data ? '_on_behalf_of';

  -- WHO OPENS THE ENVELOPE (finding 2). A business document always gets one, whether or not
  -- its writer opened it; a DEFINITION row (kernel, table, field, rule, merge_field,
  -- relation) is the shape of the store rather than a set of asserted Values, and keeps its
  -- prior behaviour exactly - nothing to do unless it declared something itself.
  if new.data_class is distinct from 'record' and not v_declared then
    return new;
  end if;

  v_actor := custom.actor_word(v_data ->> '_actor');
  v_obo   := nullif(btrim(coalesce(v_data ->> '_on_behalf_of', '')), '');
  -- DATA-V2-BASICS-2 (2026-09-29): AN AGENT ACTING FOR A PERSON CARRIES THAT PERSON. When the document
  -- does not say who wrote it, the author is the connection's declaration (custom.actor_word above)
  -- — and so is the person: the connection is signed in AS the person the agent acts for (the server's
  -- acting_as, the same principal the held-write card carries). The records a store door writes for an
  -- agent (a choice column's choices, a board's rules) used to be refused "does not say who the agent is
  -- acting for" whenever custom/agent_schema_changes let the agent write without asking. A document that
  -- DECLARES itself an agent still names its person itself.
  if v_obo is null and v_actor = 'agent' and nullif(btrim(coalesce(v_data ->> '_actor', '')), '') is null then
    v_obo := nullif(btrim(coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')), '');
  end if;
  if v_obo is not null and v_actor <> 'agent' then
    raise exception 'This write says it is on behalf of somebody, and its author is a %. Only an agent acts on behalf of a person.', v_actor
      using errcode = '22023';
  end if;
  -- THE FORWARD ARM (finding 3). The converse above was built; this one was not, so an agent
  -- write naming nobody landed unremarked.
  if v_actor = 'agent' and v_obo is null then
    raise exception 'This write says an agent wrote it, and does not say who the agent is acting for. An agent always acts on behalf of a person.'
      using errcode = '22004',
            hint = 'Put "_on_behalf_of" in the record with that person''s id. Work the platform does for nobody in particular is written by "system" - that is what the third word in the vocabulary is for. The vocabulary is exactly user, agent, system.';
  end if;

  -- The declaration is a fact about the WRITE, not content of the record.
  v_data := v_data - '_actor' - '_on_behalf_of';

  -- A VALUE IS A FIELD'S VALUE. The envelope is opened over the APPLICABLE FIELDS of this
  -- record's Table - the same set custom._record_field_validation validates against, chosen
  -- by the record's own type field where the Table has one - and never over the document's
  -- other keys, which carry structure rather than assertions. custom.validate_value_envelope
  -- refuses an envelope on a key that is not a declared Field, and it is right to.
  if new.data_class = 'record'
     and new.table_id is not null
     and new.table_id <> custom.table_kernel_id()
     and new.table_id <> custom.field_kernel_id() then
    v_type_fld := custom.table_type_field(new.organization_id, new.table_id);
    if v_type_fld is not null then
      v_rtype := v_data ->> v_type_fld;
    end if;
    v_values := coalesce(v_data -> '_values', '{}'::jsonb);
    if jsonb_typeof(v_values) <> 'object' then
      v_values := '{}'::jsonb;        -- the envelope law below refuses the malformed block by name
    end if;
    -- ENRICH, 2026-09-20: THE SAME LOOP NOW ALSO ANSWERS "WHO OWNS THIS COLUMN".
    -- A Field whose `source` is `agent` is a column an enrichment fills (AGT-6). Reading it
    -- here costs nothing - the Field rows are already being walked - and it is what lets the
    -- rule below pin a cell the moment a PERSON types over one of them.
    for v_key, v_src, v_kept_by, v_flabel, v_fdefault in
                        select f.data ->> 'key', f.data ->> 'source', f.data -> 'config' ->> 'kept_by',
                               coalesce(nullif(btrim(f.data ->> 'label'), ''), f.data ->> 'key'), f.data -> 'default'
                          from custom.applicable_fields(new.organization_id, new.table_id, v_rtype) f
    loop
      if v_key is not null and v_data ? v_key and not (v_values ? v_key) then
        v_values := v_values || jsonb_build_object(v_key, '{}'::jsonb);
      end if;
      if v_key is not null and v_src = 'agent' then
        v_agent := v_agent || v_key;
      end if;
      if v_key is not null and v_kept_by = 'agent_output' then
        v_platform := v_platform || jsonb_build_object(v_key, jsonb_build_object('label', v_flabel, 'default', v_fdefault));
      end if;
    end loop;

    -- KINDS-GLUE N-C3 (CHAIR-DOORS-2): ON A TABLE KEPT FOR AGENT OUTPUTS, A PERSON NEVER WRITES THE
    -- PLATFORM FIELDS, AND A PERSON'S EDIT MARKS THE ROW KEPT. The platform Fields (output_state,
    -- output_chain, output_generation, output_replaced_by, output_reason, ...) say where an output stands
    -- in its chain; only the chain door custom.record_write_graph_superseding moves them, and it opens
    -- itself for exactly its own transaction (custom.output_chain_door = this transaction's id), so a
    -- person's Make current / Keep both through that door is the door's write, not hers. The one
    -- platform Field a person sets herself is output_kept = true: keeping is the owner's own mark.
    -- Any other value a person writes on such a row (or a row she adds) marks it kept, so the next
    -- regeneration never hides or overwrites her work (knob records/agent_outputs.keep_on_person_edit,
    -- default on, per organization and Table). A person's own import counts as hers: the importer
    -- stamps imported values `system` (they came from a file), so a row it adds in a person's browser
    -- session (the connection says user, the document says it came via import) is judged as her write.
    if v_platform <> '{}'::jsonb
       and (v_actor = 'user'
            or (v_data -> '_source' ->> 'via' = 'import' and platform.declared_actor_tier() is not distinct from 'user'))
       and coalesce(current_setting('custom.output_chain_door', true), '') is distinct from txid_current()::text then
      for v_pkey in select k from jsonb_object_keys(v_platform) k loop
        if v_pkey = 'output_kept' and (v_data -> v_pkey) = 'true'::jsonb then
          continue;
        end if;
        if (tg_op = 'UPDATE' and (v_data -> v_pkey) is distinct from (old.data -> v_pkey))
           or (tg_op = 'INSERT' and coalesce(v_data -> v_pkey, 'null'::jsonb) <> 'null'::jsonb
               and (v_data -> v_pkey) is distinct from (v_platform -> v_pkey -> 'default')) then
          raise exception '"%" is kept by the app, so it is not yours to change.', v_platform -> v_pkey ->> 'label'
            using errcode = '42501',
                  hint = 'Nothing was saved. Where an output stands in its chain changes only through its own actions (Make current, Keep both, It replaces...). Edit the output''s values instead, and it is kept as yours.';
        end if;
      end loop;
      if v_platform ? 'output_kept'
         and (v_data -> 'output_kept') is distinct from 'true'::jsonb
         and (tg_op = 'INSERT'
              or exists (select 1 from jsonb_each(v_data) e
                          where left(e.key, 1) <> '_' and not (v_platform ? e.key)
                            and (old.data -> e.key) is distinct from e.value))
         and coalesce((platform.knob_resolve('records', 'agent_outputs.keep_on_person_edit', new.organization_id, null,
                         jsonb_build_array(jsonb_build_object('kind', 'table', 'id', new.table_id))) #>> '{}')::boolean, true) then
        v_data := v_data || jsonb_build_object('output_kept', true);
        if not (v_values ? 'output_kept') then
          v_values := v_values || jsonb_build_object('output_kept', '{}'::jsonb);
        end if;
      end if;
    end if;
    if v_values <> '{}'::jsonb or v_data ? '_values' then
      v_data := jsonb_set(v_data, '{_values}', v_values);
    end if;
  end if;

  -- BIG-VALUES-WRITE: each carried value's envelope names its whole text. The SAME whole text
  -- the cell's file already holds (same SHA-256) keeps that pointer, so re-saving it is not a
  -- new version; any other text gets a pending pointer and waits for its file.
  for v_key, v_text in select e.key, e.value #>> '{}' from jsonb_each(v_whole) e loop
    if coalesce(jsonb_typeof(v_data -> '_values' -> v_key), '') <> 'object' then
      raise exception '%', custom.size_refusal(new.organization_id,
                                               jsonb_build_object(v_key, v_whole -> v_key))
        using errcode = '23514',
              hint = 'Only a Field of this Table carries a big text into a file. Declare the Field, then write it again.';
    end if;
    v_prior := null;
    if tg_op = 'UPDATE' then
      v_prior := old.data -> '_sources' -> (old.data -> '_values' -> v_key ->> 'src');
    end if;
    v_carry := custom.whole_value_source(v_text, v_data -> '_values' -> v_key -> 'src');
    if v_prior is not null and v_prior ->> 'kind' = 'whole_value_in_file'
       and v_prior ->> 'sha256' = v_carry ->> 'sha256' then
      v_data := jsonb_set(v_data, array[v_key], old.data -> v_key);
      v_data := jsonb_set(v_data, array['_values', v_key, 'src'], v_prior);
    else
      v_data := jsonb_set(v_data, array['_values', v_key, 'src'], v_carry);
      v_park := v_park || jsonb_build_object(v_key, v_text);
    end if;
  end loop;

  v_data := custom.intern_provenance(v_data);
  v_data := custom.stamp_value_envelopes(v_data, v_actor, v_obo, now());
  v_data := custom.value_versions(case when tg_op = 'UPDATE' then old.data else '{}'::jsonb end, v_data);
  -- ENRICH: A PERSON'S EDIT OF AN AGENT-OWNED CELL PINS IT, THROUGH EVERY DOOR AT ONCE —
  -- AND ONLY THE CELL THEY ACTUALLY EDITED. This runs AFTER custom.value_versions on
  -- purpose: `custom.stamp_value_envelopes` puts the writer's word on EVERY envelope in the
  -- document, so before the version is decided there is no way to tell the value a person
  -- just typed from the forty others the same write left alone. The version IS that
  -- distinction, already computed, and asking it a second way is how the two would drift.
  v_data := custom.pin_agent_cells(v_data,
              case when tg_op = 'UPDATE' then old.data else '{}'::jsonb end, v_agent);
  -- ENRICH: AND A VALUE NOBODY RE-ASSERTED KEEPS ITS OWN MOMENT AND ITS OWN AUTHOR.
  v_data := custom.carry_unchanged_value_stamps(
              case when tg_op = 'UPDATE' then old.data else '{}'::jsonb end, v_data);

  v_refusal := custom.value_envelope_refusal(v_data);
  if v_refusal is not null then
    raise exception '%', v_refusal
      using errcode = '23514', hint = 'VAL-1..VAL-8: a value carries its source, its author, its reason for being missing and its other candidates, inside this record''s one document.';
  end if;

  new.data := v_data;

  -- BIG-VALUES-WRITE: the whole texts that still need their file wait beside the record, in
  -- the same transaction - so a refused write leaves nothing waiting.
  if v_park <> '{}'::jsonb then
    perform custom.whole_value_park(new.organization_id, new.table_id, new.id,
                                    coalesce(new.created_by, custom.query_principal()),
                                    new.visibility, v_data, v_park);
  end if;
  return new;
end;
$function$

;

CREATE OR REPLACE FUNCTION custom.migrate_purge(p_organization_id uuid, p_table_id uuid DEFAULT NULL::uuid, p_dry_run boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  -- WHAT ONE CALL TAKES ON. A client call goes through PostgREST, which cancels at ~8 s, so
  -- the budget is the honest number and the answer says what is left. Calling again carries on.
  c_budget constant integer := 200;
  v_left     integer := c_budget;
  v_archived integer := 0;
  v_table    uuid;
  v_res      jsonb;
  v_live     bigint;
  v_arch     bigint;
  v_id       uuid;
  v_name     text;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.migrate_purge');
  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.migrate_purge',
                                          'admin'::public.permission_level, 'table');
  perform custom.assert_store_door(p_organization_id, 'custom.migrate_purge');

  if p_organization_id is null then
    raise exception 'custom.migrate_purge: which organization''s records?'
      using errcode = '22004',
            hint = 'A null organization would archive the whole store.';
  end if;

  -- THE SWITCH, NAMED AND READ IN THE BODY (§6b.2). While `custom/system_enabled` resolves
  -- false the store belongs to the campaign that owns it.
  if not coalesce((platform.knob_resolve('custom', 'system_enabled', p_organization_id) #>> '{}')::boolean, false)
     and not pg_has_role(custom.caller_role(),
                         (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass),
                         'member') then
    raise exception 'The custom data store is switched off, so nothing was archived.'
      using errcode = '42501',
            hint = 'custom/system_enabled resolves false and this caller does not own custom.record. Nothing was changed.';
  end if;

  select o.name into v_name from iam.organizations o where o.id = p_organization_id;

  if not coalesce(p_dry_run, true) then
    -- ── EVERY TABLE IN SCOPE, THROUGH THE ONE CHUNKED PATH. `custom.table_archive` is
    --    FIX-10B's resumable archive: it soft-deletes through `custom.record_delete`, so every
    --    guard, every history capture and every outbox row still happens, and it answers how
    --    much is left. Nothing here issues a delete of its own.
    for v_table in
      select r.id from custom.record r
       where r.organization_id = p_organization_id
         and r.data_class = 'table'
         and r.deleted_at is null
         and (p_table_id is null or r.id = p_table_id)
       order by r.created_at, r.id
    loop
      exit when v_left <= 0;
      -- A Table may already have gone with an earlier one (a Table that lives in another
      -- Table's Home). Asking again is cheaper than guessing the order.
      if exists (select 1 from custom.record r
                  where r.organization_id = p_organization_id and r.id = v_table and r.deleted_at is null) then
        v_res := custom.table_archive(p_organization_id, v_table, v_left, true);
        v_archived := v_archived + coalesce((v_res ->> 'archived')::integer, 0);
        v_left     := v_left - coalesce((v_res ->> 'archived')::integer, 0);
      end if;
    end loop;

    -- Anything live this organization holds that no Table owned — a stranded row, the
    -- organization's Home — goes the same way, through the same soft-delete door.
    if p_table_id is null then
      for v_id in
        select r.id from custom.record r
         where r.organization_id = p_organization_id and r.deleted_at is null
         order by r.created_at, r.id
         limit greatest(v_left, 0)
      loop
        exit when v_left <= 0;
        if exists (select 1 from custom.record r
                    where r.organization_id = p_organization_id and r.id = v_id and r.deleted_at is null) then
          perform custom.record_delete(p_organization_id, v_id);
          v_archived := v_archived + 1;
          v_left     := v_left - 1;
        end if;
      end loop;
    end if;
  end if;

  select count(*) filter (where r.deleted_at is null),
         count(*) filter (where r.deleted_at is not null)
    into v_live, v_arch
    from custom.record r
   where r.organization_id = p_organization_id
     and (p_table_id is null or r.table_id = p_table_id or r.id = p_table_id);

  return jsonb_build_object(
    'function', 'custom.migrate_purge',
    'organization_id', p_organization_id, 'table_id', p_table_id,
    'organization', v_name,
    'dry_run', coalesce(p_dry_run, true),
    'archived', v_archived,            -- what THIS call archived
    'remaining', v_live,               -- live records still to archive in scope
    'archived_total', v_arch,
    'done', v_live = 0,
    'budget', c_budget,
    -- KEPT DELIBERATELY, AND HONEST. An older caller that read this key is told the number
    -- rather than left to find the key missing and read null as zero by accident.
    'rows_purged', 0,
    'policy', 'Nothing is destroyed here. Every record is archived and can be brought back. Destroying records for good is custom.migrate_purge_hard, a separate compliance door that needs a written reason and 30 days.',
    'message', case
      when coalesce(p_dry_run, true) and v_live > 0 then
        format('%s record%s would be archived. Nothing has been changed.',
               v_live, case when v_live = 1 then '' else 's' end)
      when coalesce(p_dry_run, true) then
        'There is nothing left to archive. Nothing has been changed.'
      when v_live = 0 and v_archived = 0 then
        'Everything here is already archived. Nothing was changed.'
      when v_live = 0 then
        format('%s record%s archived. Everything here can still be brought back.',
               v_archived, case when v_archived = 1 then '' else 's' end)
      else
        format('%s record%s archived, %s to go. Call again to carry on — it picks up where this left off.',
               v_archived, case when v_archived = 1 then '' else 's' end, v_live)
    end,
    'at', now());
end;
$function$

;

CREATE OR REPLACE FUNCTION public.prune_high_volume_logs()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  removed integer;
  verdict jsonb;
begin
  -- ops.api_request_log: keep 30 days. Bounded to 200k rows per run; hourly cron
  -- easily keeps pace with steady-state (~46k new rows/day cross the window).
  delete from ops.api_request_log
  where ctid in (
    select ctid from ops.api_request_log
    where created_at < now() - interval '30 days'
    limit 200000
  );
  get diagnostics removed = row_count;
  raise log 'prune_high_volume_logs: ops.api_request_log removed=%', removed;

  -- ops.app_log: keep 30 days.
  delete from ops.app_log
  where ctid in (
    select ctid from ops.app_log
    where created_at < now() - interval '30 days'
    limit 200000
  );
  get diagnostics removed = row_count;
  raise log 'prune_high_volume_logs: ops.app_log removed=%', removed;

  -- custom.merge_field_provenance: kept for custom.provenance_retention_days(org), which is
  -- the organization's knob floored by the store's own history floor. The most recent row
  -- for every merge field is kept at any age. THE CAMPAIGN'S OFF SWITCH IS READ HERE AND
  -- AGAIN INSIDE: while `custom/system_enabled` is false at every rung this block deletes
  -- nothing and says so, and `custom.provenance_prune` separately skips any organization
  -- whose own store is closed.
  if coalesce((platform.knob_resolve('custom', 'system_enabled', null) #>> '{}')::boolean, false)
     or exists (select 1 from platform.knob_override o
                 where o.feature = 'custom' and o.key = 'system_enabled'
                   and coalesce((o.value #>> '{}')::boolean, false))
  then
    verdict := custom.provenance_prune(null, false, 200000);
    raise log 'prune_high_volume_logs: custom.merge_field_provenance removed=% over % organization(s)',
      verdict ->> 'rows_pruned', verdict ->> 'organizations_considered';
  else
    raise log 'prune_high_volume_logs: custom.merge_field_provenance skipped — custom/system_enabled is off at every rung';
  end if;
end;
$function$

;

comment on function custom.store_is_open(uuid) is null;
