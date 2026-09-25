-- lock: custom
-- lane: S2-PRIME
-- based-on: custom._rule_shape_guard() c4260ebb20eb10c9c3b376d67c16a623e9375a64e4e22f66d78693c367df6068
-- chair-step: the inverse of filtergroups_the_rule_guard_checks_every_depth.sql. It puts back, byte
-- for byte, the body of custom._rule_shape_guard() whose three jsonpath walks stop at twelve JSON
-- steps. What it undoes: a Rule whose field id or node sits more than six groups down is stored
-- without being checked again.

set local lock_timeout = '2s';
set local statement_timeout = '60s';

CREATE OR REPLACE FUNCTION custom._rule_shape_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  d        jsonb := new.data;
  v_name   text;
  v_kind   text;
  v_uses   jsonb;
  v_scope  uuid;
  v_use    text;
  v_leaf   jsonb;
  v_fid    uuid;
  v_fkey   text;
  v_tgt    uuid;
  v_names  text[];
  v_sib    text;
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

  -- Only Rules an organization DECLARED. The kernel `Rule` row is the kernel Table itself
  -- (REC-27: defined in code, not data) and is exempt, exactly as W1-TABLE and W1-FIELD
  -- exempt theirs.
  if new.table_id is distinct from custom.rule_kernel_id() or new.data_class = 'kernel' then
    return new;
  end if;

  v_name := nullif(d ->> 'name', '');
  if v_name is null then
    raise exception 'a rule needs a name - it is what a person reads when it stops them'
      using errcode = '23514', hint = 'REC-15: name.';
  end if;

  -- A Rule''s KIND is what its test ANSWERS, and it is a closed set of two. A predicate can
  -- serve all four uses; an expression can only be computed, because there is nothing for
  -- validate, membership or applicability to be true about.
  v_kind := d ->> 'kind';
  if v_kind is null or v_kind not in ('predicate', 'expression') then
    raise exception 'the rule % has to say whether it answers yes-or-no or works out a value, and it says %',
                    v_name, custom.said(v_kind, 'nothing')
      using errcode = '23514',
            hint = 'REC-15: kind is `predicate` (a truth, usable by all four uses) or `expression` (a value, usable by compute alone).';
  end if;

  -- REC-15: the four uses, as a non-empty subset of the closed set.
  v_uses := d -> 'uses';
  if jsonb_typeof(v_uses) is distinct from 'array' or jsonb_array_length(v_uses) = 0 then
    raise exception 'the rule % has to say what it is for', v_name
      using errcode = '23514',
            hint = 'REC-15: uses is a non-empty list drawn from validate, compute, membership and applicability. One Rule object, four uses.';
  end if;
  for v_use in select u #>> '{}' from jsonb_array_elements(v_uses) u loop
    if v_use is null or not (v_use = any (custom.rule_uses())) then
      raise exception 'the rule % says it is used to %, and there is no such use',
                      v_name, custom.said(v_use, 'do nothing')
        using errcode = '23514',
              hint = 'REC-15: select unnest(custom.rule_uses()) is the whole list, and it is closed.';
    end if;
    if v_kind = 'expression' and v_use <> 'compute' then
      raise exception 'the rule % works out a value, so it cannot also decide %', v_name, v_use
        using errcode = '23514',
              hint = 'REC-15: only a `predicate` can be true or false. To use this test for validate, membership or applicability, write it as a yes-or-no question.';
    end if;
  end loop;

  -- The Table it speaks about. A Rule is scoped to a Table and names that Table''s Fields by
  -- id, which is what lets ONE object serve four uses (a use that speaks about a RECORD
  -- cannot hang off a single column).
  v_scope := nullif(d ->> 'scope_table_id', '')::uuid;
  if v_scope is null then
    raise exception 'the rule % has to say what it is a rule about', v_name
      using errcode = '23514',
            hint = 'REC-15: scope_table_id names the Table record whose records this Rule speaks about.';
  end if;
  select array_agg(f ->> 'name') into v_names
    from custom.record t, jsonb_array_elements(coalesce(t.data -> 'fields', '[]'::jsonb)) f
   where t.organization_id = new.organization_id
     and t.id = v_scope
     and t.table_id = custom.table_kernel_id()
     and t.deleted_at is null;
  if v_names is null then
    raise exception 'the rule % says it is about a table this organization does not have', v_name
      using errcode = '23514', hint = 'REC-15: scope_table_id names a Table record of the same organization.';
  end if;

  if jsonb_typeof(d -> 'applies_to_types') is distinct from 'array' then
    raise exception 'the rule % has to say which kinds of record it applies to, even when that is all of them',
                    v_name
      using errcode = '23514',
            hint = 'FLD-10 / T8: a type field selects which Fields AND RULES apply. An empty list means every kind.';
  end if;

  -- REC-15's per-use narrowing, checked rather than trusted: a key that is not one of this
  -- Rule's own uses, or a kind the Rule does not apply to at all, is refused by name.
  if d ? 'use_types' then
    if jsonb_typeof(d -> 'use_types') <> 'object' then
      raise exception 'the rule % has to say its narrower uses as a set of lists, one per use', v_name
        using errcode = '23514',
              hint = 'REC-15: use_types is {"<use>": ["<kind>", …]} and narrows ONE use of this Rule.';
    end if;
    for v_use in select k from jsonb_object_keys(d -> 'use_types') k loop
      if not (v_uses ? v_use) then
        raise exception 'the rule % narrows its % use, and it is not used to % at all', v_name, v_use, v_use
          using errcode = '23514',
                hint = 'REC-15: a narrowing belongs to a use the Rule declares. Add the use, or drop the narrowing.';
      end if;
      if jsonb_typeof(d -> 'use_types' -> v_use) <> 'array'
         or jsonb_array_length(d -> 'use_types' -> v_use) = 0 then
        raise exception 'the rule % narrows its % use to nothing at all', v_name, v_use
          using errcode = '23514',
                hint = 'REC-15: a narrowing lists the kinds of record that use applies to. To switch the use off, remove it from uses.';
      end if;
      if jsonb_array_length(coalesce(d -> 'applies_to_types', '[]'::jsonb)) > 0
         and exists (select 1 from jsonb_array_elements_text(d -> 'use_types' -> v_use) t
                      where not (d -> 'applies_to_types') ? t) then
        raise exception 'the rule % narrows its % use to a kind of record the rule does not apply to', v_name, v_use
          using errcode = '23514',
                hint = 'REC-15: a narrowing can only ever be smaller than the Rule itself. Widen applies_to_types first.';
      end if;
    end loop;
  end if;

  if jsonb_typeof(d -> 'expr') is distinct from 'object' then
    raise exception 'the rule % has to carry the test it makes', v_name
      using errcode = '23514',
            hint = 'REC-15: expr is one expression node — select * from custom.rule_node_kinds().';
  end if;

  -- REC-17, AT SAVE TIME. Every Field a Rule reaches for is checked to be a live Field OF
  -- THE SCOPE TABLE, by id. A name-shaped reference anywhere in the expression is refused
  -- here as well as at evaluation, so a Rule that breaks REC-17 cannot be STORED.
  for v_leaf in
    select jsonb_path_query(d -> 'expr',
             '$.**{0 to 12} ? (exists(@.field) || exists(@.parent_field) || exists(@.field_name) || exists(@.field_key) || exists(@.field_label))')
  loop
    if v_leaf ?| array['field_name', 'field_key', 'field_label'] then
      raise exception 'the rule % names a field instead of pointing at it', v_name
        using errcode = '23514',
              hint = 'REC-17: a Rule references Fields by id, never by name — {"field": "<the field''s id>"}. A name changes and the rule would stop resolving; an id does not.';
    end if;
    v_fid := null;
    if jsonb_typeof(v_leaf -> 'field') = 'string' then
      if (v_leaf ->> 'field') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'the rule % points at a field with % instead of with its id', v_name, v_leaf ->> 'field'
          using errcode = '23514',
                hint = 'REC-17: {"field": "<the field''s id>"}. What is written here is not an id at all, so it is a name by another route.';
      end if;
      v_fid := (v_leaf ->> 'field')::uuid;
    elsif jsonb_typeof(v_leaf -> 'parent_field') = 'string' then
      -- REC-16 is W1-RULE-APPLY's: the node is STORABLE today (so an applicability Rule can
      -- be written before its evaluator lands) and refused by name when evaluated.
      continue;
    end if;
    if v_fid is null then
      continue;
    end if;
    select f.data ->> 'key' into v_fkey
      from custom.record f
     where f.organization_id = new.organization_id
       and f.id = v_fid
       and f.table_id = custom.field_kernel_id()
       and f.deleted_at is null
       and (f.data ->> 'entity_definition_id')::uuid = v_scope;
    if v_fkey is null then
      raise exception 'the rule % points at a field that is not one of that table''s fields', v_name
        using errcode = '23514',
              hint = 'REC-17 / FLD-8: a Rule reaches a Field by its id, and the Field has to be a live field OF the table the Rule is about. One source of truth, checked at save time rather than discovered at evaluation.';
    end if;
  end loop;

  -- THE VOCABULARY IS CHECKED AT SAVE TIME TOO, not only at evaluation. A Rule nobody can
  -- work out is refused when it is written, in the words of the person writing it, rather
  -- than at three in the morning on somebody else's record. `parent_field` IS in the
  -- vocabulary, so REC-16's Rules stay storable tonight (W1-RULE-APPLY evaluates them).
  for v_leaf in
    select jsonb_path_query(d -> 'expr', '$.**{0 to 12} ? (exists(@.op))')
  loop
    if not (v_leaf ->> 'op' = any (select n.node from custom.rule_node_kinds() n)) then
      raise exception 'the rule % asks the system to %, and it does not know how',
                      v_name, v_leaf ->> 'op'
        using errcode = '23514',
              hint = 'REC-15: select * from custom.rule_node_kinds() is the closed list of what a Rule can do. A node outside it is refused when the Rule is SAVED, not discovered when it runs.';
    end if;
  end loop;

  -- ── STAGE-RULES: WHAT THIS RULE DOES WHEN IT SAYS NO. ──────────────────────────────
  -- A gate that can only refuse is half a policy. Salesforce's validation rules refuse;
  -- Pipedrive's required-fields-per-stage refuse; the thing neither of them has is the
  -- third answer a real business gives — "not without somebody senior saying yes". That is
  -- `require_approval`, and it is the Rule's own property rather than a second engine.
  if d ? 'on_fail' then
    if not (lower(coalesce(d ->> 'on_fail', '')) = any (select k.behaviour from custom.stage_rule_on_fail_kinds() k)) then
      raise exception 'the rule % says that when it stops something it should %, and there is no such answer',
                      v_name, custom.said(d ->> 'on_fail', 'do nothing')
        using errcode = '23514',
              hint = 'STAGE-RULES: on_fail is `refuse` (say no, in this rule''s own words) or `require_approval` (hand the change to the approvals queue with this rule as the reason). select * from custom.stage_rule_on_fail_kinds() is the whole list.';
    end if;
    if not (v_uses ? 'validate') then
      raise exception 'the rule % says what to do when it stops something, and it never stops anything', v_name
        using errcode = '23514',
              hint = 'STAGE-RULES: on_fail belongs to the validate use, which is the only use that can stop a write. Add validate to uses, or drop on_fail.';
    end if;
  end if;

  -- ── STAGE-RULES: REC-17 FOR THE CROSS-RECORD COUNT. ────────────────────────────────
  -- `sibling_count` names its Fields in `same` and `differs` rather than in a `field` leaf,
  -- so the REC-17 sweep above never sees them. They are checked HERE, at save time, exactly
  -- as hard: live Fields OF THE SCOPE TABLE, by id. Without this a new leaf key would have
  -- slipped past a check that already exists, which is the one thing REC-17 is for.
  for v_leaf in select jsonb_path_query(d -> 'expr', '$.**{0 to 12} ? (@.op == "sibling_count")')
  loop
    if jsonb_typeof(coalesce(v_leaf -> 'same', '[]'::jsonb)) <> 'array'
       or jsonb_typeof(coalesce(v_leaf -> 'differs', '[]'::jsonb)) <> 'array'
       or jsonb_array_length(coalesce(v_leaf -> 'same', '[]'::jsonb))
        + jsonb_array_length(coalesce(v_leaf -> 'differs', '[]'::jsonb)) = 0 then
      raise exception 'the rule % counts records like this one, and never says what "like this one" means', v_name
        using errcode = '23514',
              hint = 'STAGE-RULES: {"op":"sibling_count","same":["<field id>"],"differs":["<field id>"]}. `same` are the Fields a sibling has to match, `differs` the Fields it has to answer differently.';
    end if;
    for v_sib in select e #>> '{}'
                   from jsonb_array_elements(coalesce(v_leaf -> 'same', '[]'::jsonb)
                                          || coalesce(v_leaf -> 'differs', '[]'::jsonb)) e
    loop
      if v_sib is null
         or v_sib !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'the rule % counts records like this one and points at a field with % instead of with its id',
                        v_name, custom.said(v_sib, 'nothing')
          using errcode = '23514',
                hint = 'REC-17 applies to sibling_count too: Fields by id, never by name.';
      end if;
      select f.data ->> 'key' into v_fkey
        from custom.record f
       where f.organization_id = new.organization_id
         and f.id = v_sib::uuid
         and f.table_id = custom.field_kernel_id()
         and f.deleted_at is null
         and (f.data ->> 'entity_definition_id')::uuid = v_scope;
      if v_fkey is null then
        raise exception 'the rule % counts records like this one by a field that is not one of that table''s fields', v_name
          using errcode = '23514',
                hint = 'REC-17 / FLD-8: a sibling is a record of the SAME Table, so the Fields it is compared on are that Table''s own live Fields.';
      end if;
    end loop;
  end loop;

  -- The compute use has to say WHICH Field receives the Value, by id, and that Field has to
  -- be a formula - a computed Value landing on a hand-filled field is how two writers end up
  -- fighting over one column.
  v_tgt := nullif(d ->> 'target_field_id', '')::uuid;
  if v_uses ? 'compute' then
    if v_tgt is null then
      raise exception 'the rule % works something out, so it has to say which field holds the answer', v_name
        using errcode = '23514',
              hint = 'REC-15 / FLD-9: target_field_id names the Field, by id, that this Rule computes.';
    end if;
    select f.data ->> 'type' into v_fkey
      from custom.record f
     where f.organization_id = new.organization_id
       and f.id = v_tgt
       and f.table_id = custom.field_kernel_id()
       and f.deleted_at is null
       and (f.data ->> 'entity_definition_id')::uuid = v_scope;
    if v_fkey is null then
      raise exception 'the rule % puts its answer in a field that is not one of that table''s fields', v_name
        using errcode = '23514', hint = 'REC-17: target_field_id is a Field id of the scope table.';
    end if;
    if v_fkey <> 'formula' then
      raise exception 'the rule % puts its answer in %, and that field is filled in by hand',
                      v_name, custom.rule_field_label(new.organization_id, v_tgt)
        using errcode = '23514',
              hint = 'FLD-9: a Rule computes a formula field. A field somebody types into cannot also be worked out by the system, or the two would overwrite each other with nobody told.';
    end if;
  elsif v_tgt is not null then
    raise exception 'the rule % is not used to work anything out, so it has nothing to put anywhere', v_name
      using errcode = '23514', hint = 'REC-15: target_field_id belongs to the compute use and to nothing else.';
  end if;

  return new;
end;
$function$;
