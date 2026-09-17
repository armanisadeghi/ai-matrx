-- target: branch
-- based-on: custom._containment_guard() 3bf209c1f5f1fc260f79b58065206ffd9b62686b8df437bf26681ca432dd29c7
-- based-on: custom._derived_fields() 8da20479de223b78bf5c82810ceb444e079b4e35ed63b208a5231fac851c2a9b
-- based-on: custom._field_definition_write() 0fabd5eb36a16f2e8d21ce83648b70a0a93911a64ca673c64a0f8c6804df0c49
-- based-on: custom._field_shape_guard() afa430d83e4db4eadcca4ccb4be091d3897bd7c5de34241d51a53301627966e4
-- based-on: custom._field_type_parity_guard() f27074c5ca6a7da61e42b79d7ce649a6100167a81cec19064d4023ee186fa10a
-- based-on: custom._merge_field_shape_guard() 97450af60f8aa7b5109b63cc5e612af0159664a00b6e1169257bc2f4f139fc08
-- based-on: custom._record_field_validation() 090f5e8b95ac780b068e3754eb4c3be017e33821329e1a2a2688c511f58ad115
-- based-on: custom._record_rule_uses() 2f50c4ea9a4d33fe6a10bdc7bd4493c3c377437a0772ab7ec0038e6de0e6bf8f
-- based-on: custom._rule_definition_write() 88015aca80ffd9ecab4446084849b681c71ce12ed4c402c0300f0710fa644dc7
-- based-on: custom._rule_shape_guard() 1ee8a8b65147ebbb8c70a2aab069993c8ee5e648ff88b71ed2cdbe8be1990638
-- based-on: custom._rule_topology_guard() c52a9687f356e23d3f531d4868abdaa232510a996e9c367d28ed06a7099d504a
-- based-on: custom._table_shape_guard() 30c0dd9b05a924593f59910b19a9a43e940ae1661ce82e3f9ea468412cadc602
--
-- THE INVERSE of `migrations/campaign/w1_v1_fixes_every_trigger_reads_its_guard.sql`
-- (§4.13, rule 27). It restores the prior state exactly: the twelve bodies below are the
-- definitions that file's own `-- based-on:` hashes name - the three that carried their own
-- copy-pasted door block have it back, and the nine that had no door have none. After this
-- file, `encode(sha256(convert_to(pg_get_functiondef(oid),'utf8')),'hex')` reads those
-- twelve hashes again, which is what makes "the inverse restores the prior state" a
-- measurement rather than a claim.
--
-- Branch-only: schema `custom` does not exist on production at all (measured SELECT-only,
-- 2026-09-17), so there is nothing there to reverse.

set lock_timeout = '5s';
set statement_timeout = '300s';

CREATE OR REPLACE FUNCTION custom._containment_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_parent   uuid;
  v_ceiling  integer;
  v_depth    integer;
  v_org_set  boolean;
  v_exists   boolean;
begin
  v_parent := custom.containment_parent(new.data);   -- REC-7 refuses two parents in here
  if v_parent is null then
    return new;
  end if;

  -- REC-8, the shortest cycle there is.
  if v_parent = new.id then
    raise exception 'this would put it inside itself'
      using errcode = '23514',
            hint = 'REC-8: containment is a tree, and a record cannot be its own container.';
  end if;

  select true into v_exists
    from custom.record r
   where r.organization_id = new.organization_id and r.id = v_parent;
  if v_exists is not true then
    raise exception 'that container is not in this organization'
      using errcode = '23503',
            hint = 'REC-8 / T15: containment never crosses an organization. The route across organizations is a relation the Table allows, never a parent.';
  end if;

  -- REC-8 / T3: reparenting under one's own descendant. Walking UP from the new parent and
  -- meeting this record is exactly that, and it is the same walk the cycle check needs.
  if exists (select 1 from custom.containment_chain(new.organization_id, v_parent) c
              where c.ancestor_id = new.id) then
    raise exception 'this would put it inside itself'
      using errcode = '23514',
            hint = 'REC-8: that container is already inside this one, so containment would stop being a tree.';
  end if;

  -- REC-N-4: the ceiling, read out of the function.
  v_ceiling := custom.containment_depth_ceiling(new.organization_id);
  select coalesce(max(c.depth), 0) into v_depth
    from custom.containment_chain(new.organization_id, v_parent) c;
  v_depth := v_depth + 2;   -- + the parent itself, + this record
  if v_depth > v_ceiling then
    select platform.knob_resolve('custom', 'containment_depth_ceiling', new.organization_id) is distinct from
           platform.knob_resolve('custom', 'containment_depth_ceiling', null)
      into v_org_set;
    if v_org_set then
      raise exception 'that is more things inside things than this organization allows, which is %', v_ceiling
        using errcode = '23514',
              hint = 'REC-N-4: the organization set this limit and can raise it, up to the platform maximum.';
    else
      raise exception 'that is more things inside things than this organization allows'
        using errcode = '23514',
              hint = 'REC-N-4: no number is quoted because the organization did not set one. Move it somewhere less deeply nested, or raise the limit for this organization.';
    end if;
  end if;

  return new;
end;
$function$
;


CREATE OR REPLACE FUNCTION custom._derived_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_rtype    text;
  v_tf       text;
  f          custom.record;
  v_derived  jsonb := '{}'::jsonb;
  v_prior    jsonb;
  v_stale    text;
  v_retired  jsonb;
  v_owner    oid;
begin
  -- THE DOOR, identical to the validation trigger's (W1-RULE-APPLY's ruling): the switch
  -- decides WHO may write, never which check runs.
  if not custom.store_is_open(new.organization_id) then
    select c.relowner into v_owner from pg_class c where c.oid = 'custom.record'::regclass;
    if not pg_has_role(current_user, v_owner, 'member') then
      raise exception 'The custom data store is switched off, so it is not taking writes from "%".', current_user
        using errcode = '42501',
              hint = 'custom/system_enabled resolves false. While it does, this store takes writes only from the role that owns custom.record. The switch checklist turns the knob on; a lane never does.';
    end if;
  end if;

  if new.data_class in ('kernel', 'relation')
     or new.table_id is null
     or new.table_id = custom.table_kernel_id()
     or new.table_id = custom.field_kernel_id()
     or new.table_id = custom.rule_kernel_id()
     or new.table_id = custom.merge_field_kernel_id() then
    return new;
  end if;

  v_tf := custom.table_type_field(new.organization_id, new.table_id);
  if v_tf is not null then
    v_rtype := new.data ->> v_tf;
  end if;

  for f in select * from custom.applicable_fields(new.organization_id, new.table_id, v_rtype) loop
    if custom.parity_type(f.data) in ('lookup', 'rollup', 'formula')
       and coalesce(f.data ->> 'compute_on', '') = 'write' then
      v_derived := v_derived || jsonb_build_object(f.data ->> 'key', jsonb_build_object(
        'value',    custom.derived_value(new.organization_id, new.id, f.data,
                                         new.data - '_computed' - '_retired' - '_values'
                                                  - '_sources' - '_derived'),
        'field_id', f.id,
        'parity',   custom.parity_type(f.data),
        'at',       to_jsonb(now())));
    end if;
  end loop;

  -- A WORKED-OUT ANSWER NOBODY WORKS OUT is told apart the same two ways W1-RULE tells
  -- them apart, because a reader cannot tell a forged one from a real one and would serve
  -- both. ARRIVING IN THIS WRITE is a forgery and is refused by name; ALREADY THERE and no
  -- longer applicable is a retype and is RETIRED with its reason (a stand-in for History,
  -- announced: W3-HIST owns the real store).
  if jsonb_typeof(new.data -> '_derived') = 'object' then
    v_prior := case when tg_op = 'UPDATE' then coalesce(old.data -> '_derived', '{}'::jsonb)
                    else '{}'::jsonb end;
    for v_stale in
      select k from jsonb_object_keys(new.data -> '_derived') k where not (v_derived ? k)
    loop
      if (v_prior -> v_stale) is distinct from (new.data -> '_derived' -> v_stale) then
        raise exception 'this record carries a worked-out answer for % that nothing works out', v_stale
          using errcode = '23514',
                hint = 'FLD-9 / FLD-11: a worked-out Value belongs to the field that works it out and carries that field''s id and the moment. A value written here by hand would be served as if the system had worked it out.';
      end if;
      v_retired := coalesce(new.data -> '_retired', '[]'::jsonb) || jsonb_build_object(
        'key',    v_stale,
        'value',  v_prior -> v_stale -> 'value',
        'reason', format('this record changed, and nothing works out %s for it any more', v_stale),
        'field_id', v_prior -> v_stale -> 'field_id',
        'at',     to_jsonb(now()));
      new.data := jsonb_set(new.data, '{_retired}', v_retired);
    end loop;
  end if;

  if v_derived = '{}'::jsonb then
    new.data := new.data - '_derived';
  else
    new.data := jsonb_set(new.data, '{_derived}', v_derived);
  end if;
  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION custom._field_definition_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_data jsonb;
  v_id   uuid;
begin
  if tg_op = 'DELETE' then
    update custom.record
       set deleted_at = now()
     where organization_id = old.organization_id and id = old.id
       and table_id = custom.field_kernel_id();
    return old;
  end if;

  -- The view''s columns are assembled back into the ONE stored document, so a write through
  -- the projection and a write into the store produce the same row and the SAME guard fires.
  v_data := coalesce(new.data, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
    'entity_definition_id', new.entity_definition_id,
    'table_token',          new.table_token,
    'key',                  new.key,
    'label',                new.label,
    'type',                 new.type,
    'relation_target',      new.relation_target,
    'relation_max',         new.relation_max,
    'on_target_delete',     new.on_target_delete,
    'inverse_key',          new.inverse_key,
    'source',               new.source,
    'compute_on',           new.compute_on,
    'unit',                 new.unit,
    'format',               new.format,
    'sensitivity',          new.sensitivity,
    'context_policy',       new.context_policy,
    'review_interval_days', new.review_interval_days))
    || jsonb_build_object(
    'config',           coalesce(new.config, '{}'::jsonb),
    'source_config',    coalesce(new.source_config, '{}'::jsonb),
    'rules',            coalesce(new.rules, '[]'::jsonb),
    'depends_on',       coalesce(new.depends_on, '[]'::jsonb),
    'applies_to_types', coalesce(new.applies_to_types, '[]'::jsonb),
    'required',         coalesce(new.required, false),
    'multi',            coalesce(new.multi, false),
    'dated',            coalesce(new.dated, false),
    'sort',             coalesce(new.sort, 0));
  if new."default" is not null then
    v_data := jsonb_set(v_data, '{default}', new."default");
  end if;

  if tg_op = 'INSERT' then
    insert into custom.record (id, organization_id, table_id, data_class, data)
    values (coalesce(new.id, gen_random_uuid()), new.organization_id,
            custom.field_kernel_id(), 'field', v_data)
    returning id into v_id;
    new.id := v_id;
    return new;
  end if;

  update custom.record
     set data = v_data, updated_at = now(), version = version + 1
   where organization_id = new.organization_id and id = new.id
     and table_id = custom.field_kernel_id();
  return new;
end;
$function$
;


CREATE OR REPLACE FUNCTION custom._field_shape_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  d           jsonb := new.data;
  v_type      text;
  v_key       text;
  v_label     text;
  v_edef      uuid;
  v_token     text;
  v_opts      uuid;
  v_display   text;
  v_source    text;
  v_names     text[];
  v_rule      jsonb;
  v_kind      text;
begin
  -- Only field definitions. A `kernel` row is the kernel Table `Field` itself (REC-27:
  -- defined in code, not data) and is exempt, exactly as W1-TABLE exempts the kernel Tables.
  if new.table_id is distinct from custom.field_kernel_id() or new.data_class = 'kernel' then
    return new;
  end if;

  v_label := nullif(d ->> 'label', '');
  v_key   := d ->> 'key';
  if v_key is null or v_key !~ '^[a-z][a-z0-9_]*$' then
    raise exception 'a field needs a key made of lower-case letters, digits and underscores, and this one says %',
                    coalesce(v_key, 'nothing')
      using errcode = '23514', hint = 'FLD-13: key.';
  end if;
  if v_label is null then
    raise exception 'the field % needs a label - it is what a person reads', v_key
      using errcode = '23514', hint = 'FLD-13: label.';
  end if;

  -- FLD-8 / FLD-13: ONE definitions surface for standard and custom tables alike. Exactly
  -- one of the two identifiers, never both and never neither — which is what makes it one
  -- surface rather than two tables sharing a name.
  v_edef  := nullif(d ->> 'entity_definition_id', '')::uuid;
  v_token := nullif(d ->> 'table_token', '');
  if (v_edef is null) = (v_token is null) then
    raise exception 'the field % has to say what it is a field OF - a custom table or a standard one, and exactly one of them',
                    v_label
      using errcode = '23514',
            hint = 'FLD-8 / FLD-13: entity_definition_id names a custom Table record; table_token names a standard table''s registry token. One definitions table holds both, so exactly one of the two is set.';
  end if;
  if v_token is not null
     and not exists (select 1 from platform.entity_types e
                      where e.token = v_token and e.is_active) then
    raise exception 'the field % says it belongs to a standard table called %, and no such table is registered',
                    v_label, v_token
      using errcode = '23514', hint = 'FLD-8: table_token names a live platform.entity_types token.';
  end if;

  -- FLD-1: exactly ONE behavior, from a CLOSED set. An array is refused by name, so
  -- "exactly one" is unrepresentable rather than merely unwritten.
  if jsonb_typeof(d -> 'type') = 'array' then
    raise exception 'the field % has more than one behavior, and a field has exactly one', v_label
      using errcode = '23514',
            hint = 'FLD-1: one of list, range, text, relation, formula. What looks like a second behavior is a modifier (FLD-2) or a Rule (FLD-3).';
  end if;
  v_type := d ->> 'type';
  if v_type is null or v_type not in ('list', 'range', 'text', 'relation', 'formula') then
    raise exception 'the field % says its behavior is %, and a field behaves as a list, a range, text, a relation or a formula',
                    v_label, coalesce(v_type, 'nothing')
      using errcode = '23514', hint = 'FLD-1: the set is closed.';
  end if;

  -- FLD-2: modifiers are SEPARATE from behavior. Three distinct stored keys.
  if jsonb_typeof(d -> 'multi') is distinct from 'boolean' then
    raise exception 'the field % has to say whether it holds one value or many', v_label
      using errcode = '23514', hint = 'FLD-2: multi is a modifier, never a behavior of its own.';
  end if;
  if jsonb_typeof(d -> 'dated') is distinct from 'boolean' then
    raise exception 'the field % has to say whether its values are dated', v_label
      using errcode = '23514', hint = 'FLD-2: dated is a modifier, never a behavior of its own.';
  end if;
  if jsonb_typeof(d -> 'rules') is distinct from 'array' then
    raise exception 'the field % has to carry its rules as a list, even an empty one', v_label
      using errcode = '23514', hint = 'FLD-2 / FLD-3: any number of attached validation Rules.';
  end if;

  -- FLD-3: a constraint is a Rule, not a behavior — and not a config key either. This is
  -- the only shape in which the law can actually be broken, so it is the shape refused.
  for v_rule in select r from jsonb_array_elements(d -> 'rules') r loop
    v_kind := v_rule ->> 'kind';
    if v_kind is null or v_kind not in ('min', 'max', 'pattern', 'length', 'equals_field', 'differs_from_field') then
      raise exception 'the field % carries a rule of kind %, which this validator cannot execute',
                      v_label, coalesce(v_kind, 'nothing')
        using errcode = '23514',
              hint = 'FLD-3: an attached validation Rule declares its kind. The general Rule object, its versions and its four uses are W1-RULE''s (REC-15, REC-17, REC-19).';
    end if;
  end loop;
  if d -> 'config' ?| array['min', 'max', 'pattern', 'length', 'required_if', 'validation', 'constraint'] then
    raise exception 'the field % writes a constraint into its behavior, and a constraint is a Rule', v_label
      using errcode = '23514',
            hint = 'FLD-3: move it into rules, where it is an attached validation Rule with a kind.';
  end if;

  -- FLD-N-1: unit and format change what a value MEANS, so they live on the Field and reach
  -- the agent''s context. Only layout, colour and conditional formatting are presentation —
  -- and a presentation blob carrying either is the one way this law actually fails.
  if d -> 'presentation' ?| array['unit', 'format'] then
    raise exception 'the field % puts its unit or its format in presentation, and those change what the value MEANS',
                    v_label
      using errcode = '23514',
            hint = 'FLD-N-1: unit and format are the Field''s own columns and reach the agent''s context; presentation carries layout, colour and conditional formatting.';
  end if;
  if d ? 'unit' and jsonb_typeof(d -> 'unit') not in ('string', 'null') then
    raise exception 'the field % has to say its unit as a word', v_label
      using errcode = '23514', hint = 'FLD-N-1: unit.';
  end if;
  if d ? 'format' and jsonb_typeof(d -> 'format') not in ('string', 'null') then
    raise exception 'the field % has to say its format as a word', v_label
      using errcode = '23514', hint = 'FLD-N-1: format.';
  end if;

  -- FLD-7: where the value comes from.
  v_source := d ->> 'source';
  if v_source is null or v_source not in ('manual', 'formula', 'agent', 'synced') then
    raise exception 'the field % says its values come from %, and a field is filled in by hand, computed, written by an agent, or synced from somewhere else',
                    v_label, coalesce(v_source, 'nothing')
      using errcode = '23514', hint = 'FLD-7: manual, formula, agent, synced.';
  end if;

  -- FLD-9: a Formula declares whether it computes on read or on write — and only a formula
  -- may declare it, or the choice stops meaning anything.
  if v_type = 'formula' or v_source = 'formula' then
    if coalesce(d ->> 'compute_on', '') not in ('read', 'write') then
      raise exception 'the formula % has to say whether it works out its answer when somebody reads it or when somebody saves',
                      v_label
        using errcode = '23514', hint = 'FLD-9: compute_on is read or write.';
    end if;
  elsif d ? 'compute_on' and jsonb_typeof(d -> 'compute_on') <> 'null' then
    raise exception 'the field % is not a formula, so it has nothing to work out', v_label
      using errcode = '23514', hint = 'FLD-9: compute_on belongs to a formula and to nothing else.';
  end if;

  -- FLD-5 / FLD-6: a list field''s options are the records of a Table with display: list.
  if v_type = 'list' then
    v_opts := nullif(d -> 'config' ->> 'options_table_id', '')::uuid;
    if v_opts is null then
      raise exception 'the list field % has to say which table its choices come from', v_label
        using errcode = '23514',
              hint = 'FLD-5 / FLD-6: every pick-list is already a Table, so a list field names one rather than carrying an enum.';
    end if;
    select t.data ->> 'display' into v_display
      from custom.record t
     where t.organization_id = new.organization_id
       and t.id = v_opts
       and t.table_id = custom.table_kernel_id()
       and t.deleted_at is null;
    if v_display is null then
      raise exception 'the list field % points at something that is not a table of this organization', v_label
        using errcode = '23514', hint = 'FLD-5: options_table_id names a Table record.';
    end if;
    if v_display <> 'list' then
      raise exception 'the list field % takes its choices from a table that shows its records as a page, not as a list',
                      v_label
        using errcode = '23514',
              hint = 'FLD-5: a category is a Record of a Table with display: list. A table that grew up (T4) keeps serving the fields that already point at it — this refusal is about DECLARING a new one.';
    end if;
  elsif d -> 'config' ? 'options_table_id' then
    raise exception 'the field % is not a list, so it has no choices to take from a table', v_label
      using errcode = '23514', hint = 'FLD-1 / FLD-5.';
  end if;

  -- FLD-12 / FLD-13: the relation properties, and they belong to a relation.
  if v_type = 'relation' then
    if nullif(d ->> 'relation_target', '') is null then
      raise exception 'the relation field % has to say what it points at', v_label
        using errcode = '23514', hint = 'FLD-13: relation_target.';
    end if;
    if coalesce((d ->> 'relation_max')::integer, 0) < 1 then
      raise exception 'the relation field % has to say how many things it can point at, and it is at least one',
                      v_label
        using errcode = '23514', hint = 'FLD-13: relation_max, where 1 is a foreign key.';
    end if;
    if coalesce(d ->> 'on_target_delete', '') not in ('cascade', 'set_null', 'restrict') then
      raise exception 'the relation field % has to say what happens to it when the thing it points at is deleted',
                      v_label
        using errcode = '23514', hint = 'FLD-13: on_target_delete is cascade, set_null or restrict.';
    end if;
  elsif d ?| array['relation_target', 'relation_max', 'on_target_delete', 'inverse_key']
        and (nullif(d ->> 'relation_target', '') is not null
             or nullif(d ->> 'relation_max', '') is not null
             or nullif(d ->> 'on_target_delete', '') is not null
             or nullif(d ->> 'inverse_key', '') is not null) then
    raise exception 'the field % is not a relation, so it has no relation properties', v_label
      using errcode = '23514', hint = 'FLD-13: relation_target, relation_max, on_target_delete and inverse_key belong to a relation.';
  end if;

  -- FLD-12: the four properties the live system declares and enforces nowhere.
  if coalesce(d ->> 'sensitivity', '') not in ('public', 'internal', 'confidential', 'restricted') then
    raise exception 'the field % has to say how sensitive its values are, and it says %',
                    v_label, coalesce(d ->> 'sensitivity', 'nothing')
      using errcode = '23514', hint = 'FLD-12: sensitivity is public, internal, confidential or restricted.';
  end if;
  if coalesce(d ->> 'context_policy', '') not in ('include', 'summarize', 'exclude', 'on_request') then
    raise exception 'the field % has to say whether an agent may see its values, and it says %',
                    v_label, coalesce(d ->> 'context_policy', 'nothing')
      using errcode = '23514', hint = 'FLD-12: context_policy is include, summarize, exclude or on_request.';
  end if;
  if d ? 'review_interval_days' and jsonb_typeof(d -> 'review_interval_days') = 'number'
     and (d ->> 'review_interval_days')::numeric <= 0 then
    raise exception 'the field % says it is reviewed every % days, and a review interval is at least one day',
                    v_label, d ->> 'review_interval_days'
      using errcode = '23514', hint = 'FLD-12: review_interval_days.';
  end if;
  if jsonb_typeof(d -> 'depends_on') is distinct from 'array' then
    raise exception 'the field % has to list what it depends on, even when the list is empty', v_label
      using errcode = '23514', hint = 'FLD-12: depends_on.';
  end if;

  -- FLD-10: which record types this field applies to.
  if jsonb_typeof(d -> 'applies_to_types') is distinct from 'array' then
    raise exception 'the field % has to say which kinds of record it applies to, even when that is all of them',
                    v_label
      using errcode = '23514', hint = 'FLD-10: applies_to_types, empty meaning every kind.';
  end if;

  -- ONE SOURCE OF TRUTH, both ways. A custom Table declares WHICH fields it has (REC-1,
  -- W1-TABLE''s guard); this record declares WHAT one of them is. They can never disagree,
  -- because a definition for a field the Table never declared is refused here by name.
  if v_edef is not null then
    select array_agg(f ->> 'name') into v_names
      from custom.record t, jsonb_array_elements(coalesce(t.data -> 'fields', '[]'::jsonb)) f
     where t.organization_id = new.organization_id
       and t.id = v_edef
       and t.table_id = custom.table_kernel_id()
       and t.deleted_at is null;
    if v_names is null then
      raise exception 'the field % says it belongs to a table this organization does not have', v_label
        using errcode = '23514', hint = 'FLD-8: entity_definition_id names a Table record of the same organization.';
    end if;
    if not (v_key = any (v_names)) then
      raise exception 'the table does not declare a field called % - declare it there first', v_key
        using errcode = '23514',
              hint = 'REC-1 / FLD-8: a Table declares its fields and custom.field defines them. A definition for a field the table never declared would be a second source of truth.';
    end if;
  end if;

  return new;
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
  v_owner    oid;
begin
  -- THE DOOR, and it is the same door W1-RULE-APPLY put on the validation trigger: while
  -- `custom/system_enabled` is false this store takes writes only from the role that owns
  -- it, and every other writer is told which switch is off and who turns it on. The parity
  -- checks below are NOT conditional on it — the switch never removes a check.
  if not custom.store_is_open(new.organization_id) then
    select c.relowner into v_owner from pg_class c where c.oid = 'custom.record'::regclass;
    if not pg_has_role(current_user, v_owner, 'member') then
      raise exception 'The custom data store is switched off, so it is not taking writes from "%".', current_user
        using errcode = '42501',
              hint = 'custom/system_enabled resolves false. While it does, this store takes writes only from the role that owns custom.record. The switch checklist turns the knob on; a lane never does.';
    end if;
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
            hint = 'FLD-11: select parity_type from custom.parity_field_types() - select, multi_select, member, attachment, lookup, rollup, formula, url, email, phone, currency, percent, datetime.';
  end if;

  -- A Field that CALLS itself the formula parity type and carries no expression of its own.
  -- (A behaviour-`formula` Field whose answer comes from a compute Rule derives NULL above
  -- and never reaches here — it is W1-RULE's, and this lane does not demand anything of it.)
  if v_declared = 'formula' and jsonb_typeof(d -> 'config' -> 'expr') is distinct from 'object' then
    raise exception 'the field % is worked out and does not say how', v_label
      using errcode = '23514',
            hint = 'FLD-11 / REC-15: config.expr is a Rule expression - the same shape and the same evaluator a Rule uses (select node from custom.rule_node_kinds()).';
  end if;

  -- (b) THE DECLARATION AND WHAT IT ACTUALLY DECLARES HAVE TO AGREE. This is the whole of
  -- ruling 1 as a refusal: a parity type is made of a behaviour and its modifiers, so a
  -- field that CALLS itself a currency while declaring no unit is refused naming BOTH words.
  if v_declared is not null and v_derived is distinct from v_declared then
    raise exception 'the field % calls itself a %, and what it actually says it is is %',
                    v_label, v_declared, coalesce(v_derived, 'a plain ' || coalesce(v_type, 'field'))
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
                      v_label, coalesce(d -> 'config' ->> 'agg', 'nothing')
        using errcode = '23514', hint = 'FLD-11: config.agg is sum, count, min, max or avg.';
    end if;
    if (d -> 'config' ->> 'agg') <> 'count'
       and nullif(d -> 'config' ->> 'of', '') is null then
      raise exception 'the field % has to say which value of the records it points at it works out', v_label
        using errcode = '23514',
              hint = 'FLD-11: config.of names a field key on the far side. Only count needs no field, because it counts the records themselves.';
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


CREATE OR REPLACE FUNCTION custom._merge_field_shape_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  d          jsonb := new.data;
  v_name     text;
  v_mod      text;
  c_sources  constant text[] := array['literal','record','state','actor','platform','user_input','tool','derived'];
  c_semantic constant text[] := array['value','reference','resolver','computed','collection'];
  c_mods     constant text[] := array['scoped','temporal','collection','live','fallback','formatted','required'];
  c_policies constant text[] := array['must_supply','shown_overridable','shown_locked','server_fixed','derived'];
begin
  if new.table_id is distinct from custom.merge_field_kernel_id() or new.data_class = 'kernel' then
    return new;
  end if;

  v_name := coalesce(nullif(d ->> 'key', ''), 'this merge field');

  -- DYN-2, the whole law in one refusal: no combination is ever its own type.
  if d ? 'type' then
    raise exception '% tries to be one kind of thing, and a merge field is three separate answers', v_name
      using errcode = '23514',
            hint = 'DYN-2: say where the value comes FROM (source), what it resolves INTO (semantic_type), and how it behaves (modifiers). Fusing them makes an enum like overrideable_state_person_reference_variable.';
  end if;

  if jsonb_typeof(d -> 'source') = 'array' then
    raise exception '% names more than one source, and a merge field has exactly one', v_name
      using errcode = '23514', hint = 'DYN-2: an ordered list of alternatives is the fallback modifier, not a second source.';
  end if;
  if coalesce(d ->> 'source', '') <> all (c_sources) then
    raise exception '% says its value comes from %, and the list of places a value may come from is closed',
                    v_name, coalesce(d ->> 'source', 'nothing')
      using errcode = '23514',
            hint = 'DYN-2: literal, record, state, actor, platform, user_input, tool, derived.';
  end if;

  if jsonb_typeof(d -> 'semantic_type') = 'array' then
    raise exception '% resolves into more than one kind of thing, and a merge field resolves into exactly one', v_name
      using errcode = '23514', hint = 'DYN-2: exactly one semantic type.';
  end if;
  if coalesce(d ->> 'semantic_type', '') <> all (c_semantic) then
    raise exception '% says it resolves into %, and it resolves into a value, a reference, a resolver, something computed, or a collection',
                    v_name, coalesce(d ->> 'semantic_type', 'nothing')
      using errcode = '23514', hint = 'DYN-2: value, reference, resolver, computed, collection.';
  end if;

  if jsonb_typeof(d -> 'modifiers') is distinct from 'array' then
    raise exception '% has to list how it behaves, even when the list is empty', v_name
      using errcode = '23514', hint = 'DYN-2: any number of modifiers.';
  end if;
  for v_mod in select m #>> '{}' from jsonb_array_elements(d -> 'modifiers') m loop
    if v_mod <> all (c_mods) then
      raise exception '% behaves as %, and that is not one of the ways a merge field can behave', v_name, v_mod
        using errcode = '23514',
              hint = 'DYN-2: scoped, temporal, collection, live, fallback, formatted, required.';
    end if;
  end loop;

  if d ? 'override_policy'
     and coalesce(d ->> 'override_policy', '') <> all (c_policies) then
    raise exception '% says a person may change it by %, and that is not one of the five ways',
                    v_name, coalesce(d ->> 'override_policy', 'nothing')
      using errcode = '23514',
            hint = 'DYN-2: must_supply, shown_overridable, shown_locked, server_fixed, derived. Who may override is a separate permission (override_requires), never the same knob.';
  end if;

  return new;
end;
$function$
;


CREATE OR REPLACE FUNCTION custom._record_field_validation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_type_field text;
  v_rtype      text;
  v_fields     custom.record[];
  v_gone       custom.record[];
  g            custom.record;
  v_retired    jsonb;
  v_owner      oid;                 -- W1-VAL-APPLY (1 of 2)
begin
  -- W1-VAL-APPLY (2 of 2): THE DOOR. While `custom/system_enabled` resolves false this store
  -- is closed to every client, so the only legitimate writer is the one that owns it. Nobody
  -- else is refused silently and nobody else is let through silently either: they are told
  -- which switch is off and who turns it on. Validation below is NOT conditional on this —
  -- the switch never removes a check, and the owner's write answers exactly as it did
  -- before this file, which is what makes landing it inert.
  if not custom.store_is_open(new.organization_id) then
    select c.relowner into v_owner from pg_class c where c.oid = 'custom.record'::regclass;
    if not pg_has_role(current_user, v_owner, 'member') then
      raise exception 'The custom data store is switched off, so it is not taking writes from "%".', current_user
        using errcode = '42501',
              hint = 'custom/system_enabled resolves false. While it does, this store takes writes only from the role that owns custom.record. The switch checklist turns the knob on; a lane never does. Nothing here skips validation while the switch is off - it is a closed door, not a quiet one.';
    end if;
  end if;

  -- The kernel is defined in code, the Tables and the Fields and the merge fields have their
  -- own shape guards, and a relation row carries an edge rather than a document.
  if new.data_class in ('kernel', 'relation')
     or new.table_id is null
     or new.table_id = custom.table_kernel_id()
     or new.table_id = custom.field_kernel_id() then
    return new;
  end if;

  v_type_field := custom.table_type_field(new.organization_id, new.table_id);
  if v_type_field is not null then
    v_rtype := new.data ->> v_type_field;
  end if;

  select array_agg(f) into v_fields
    from custom.applicable_fields(new.organization_id, new.table_id, v_rtype) f;
  if v_fields is null then
    return new;               -- a Table that declared no definitions validates nothing.
  end if;

  -- T8's retype: a Value that stops applying is neither coerced nor deleted. It is moved,
  -- WITH ITS REASON, and the field is then hidden by custom.applicable_fields. This is a
  -- STAND-IN for History and says so: W3-HIST (HIS-*) owns the real store, and when it
  -- lands this block writes there instead. Until then the value is in the document, not gone.
  if tg_op = 'UPDATE' and v_type_field is not null
     and (old.data ->> v_type_field) is distinct from v_rtype then
    select array_agg(f) into v_gone
      from custom.applicable_fields(new.organization_id, new.table_id,
                                    old.data ->> v_type_field) f
     where not exists (select 1
                         from custom.applicable_fields(new.organization_id, new.table_id, v_rtype) a
                        where a.id = f.id);
    v_retired := coalesce(new.data -> '_retired', '[]'::jsonb);
    if v_gone is not null then
      foreach g in array v_gone loop
        if old.data ? (g.data ->> 'key') and jsonb_typeof(old.data -> (g.data ->> 'key')) <> 'null' then
          v_retired := v_retired || jsonb_build_object(
            'key',   g.data ->> 'key',
            'label', g.data ->> 'label',
            'value', old.data -> (g.data ->> 'key'),
            -- W1-VAL (1 of 2): a retired Value takes its ENVELOPE with it. Where a value came
            -- from, who wrote it and its other candidates are facts about that value, so they
            -- belong beside it in _retired and not orphaned in _values pointing at nothing.
            'envelope', old.data -> '_values' -> (g.data ->> 'key'),
            'reason', format('this record became a %s, and %s does not apply to a %s',
                             coalesce(v_rtype, 'different kind of thing'),
                             coalesce(nullif(g.data ->> 'label', ''), g.data ->> 'key'),
                             coalesce(v_rtype, 'record of that kind')),
            'at', to_jsonb(now()));
          new.data := new.data - (g.data ->> 'key');
          if jsonb_typeof(new.data -> '_values') = 'object' then
            new.data := jsonb_set(new.data, '{_values}',
                                  (new.data -> '_values') - (g.data ->> 'key'));
          end if;
        end if;
      end loop;
      if jsonb_array_length(v_retired) > 0 then
        new.data := jsonb_set(new.data, '{_retired}', v_retired);
      end if;
    end if;
  end if;

  perform custom.validate_values(new.organization_id, v_fields, new.data, v_rtype);
  -- W1-VAL (2 of 2): the half of the envelope law that needs the definitions.
  perform custom.validate_value_envelope(new.organization_id, v_fields, new.data);
  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION custom._record_rule_uses()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_type_field text;
  v_rtype      text;
  r            custom.record;
  v_run        jsonb;
  v_truth      boolean;
  v_key        text;
  v_computed   jsonb := '{}'::jsonb;
  v_prior      jsonb;
  v_retired    jsonb;
  v_stale      text;
begin
  -- The kernel is defined in code; the Tables, the Fields, the merge fields and the Rules
  -- themselves have their own shape guards; and a relation row carries an edge rather than a
  -- document. (A Rule about Rules is a wave nobody has asked for.)
  if new.data_class in ('kernel', 'relation')
     or new.table_id is null
     or new.table_id = custom.table_kernel_id()
     or new.table_id = custom.field_kernel_id()
     or new.table_id = custom.rule_kernel_id()
     or new.table_id = custom.merge_field_kernel_id() then
    return new;
  end if;

  v_type_field := custom.table_type_field(new.organization_id, new.table_id);
  if v_type_field is not null then
    v_rtype := new.data ->> v_type_field;
  end if;

  -- ── USE 1: VALIDATE. A `false` answer refuses the write, naming the Rule. ──────────
  for r in select * from custom.table_rules(new.organization_id, new.table_id, 'validate', v_rtype) loop
    v_run   := custom.rule_run(new.organization_id, r.id, new.data, '{}'::jsonb);
    v_truth := custom.rule_truth(v_run -> 'answer');
    if v_truth is false then
      raise exception '%', coalesce(nullif(r.data ->> 'message', ''), r.data ->> 'name')
        using errcode = '23514',
              hint = format('REC-15: the rule "%s" (version %s) is not satisfied by this record.',
                            r.data ->> 'name', v_run ->> 'rule_version');
    end if;
  end loop;

  -- ── USE 2: COMPUTE. The answer IS the Value, and the version that produced it is ───
  -- RECORDED beside it. W3-HIST stamps its History row from exactly these keys.
  for r in select * from custom.table_rules(new.organization_id, new.table_id, 'compute', v_rtype) loop
    v_key := custom.rule_field_key(new.organization_id, (r.data ->> 'target_field_id')::uuid);
    if v_key is null then
      raise exception 'the rule % works out a field that is not there any more', r.data ->> 'name'
        using errcode = '23503',
              hint = 'REC-18: deleting a Field a Rule depends on is refused naming the Rule (W3-MIG). This is what the compute use says when it happens anyway.';
    end if;
    v_run := custom.rule_run(new.organization_id, r.id, new.data, '{}'::jsonb);
    v_computed := v_computed || jsonb_build_object(v_key, jsonb_build_object(
      'value',        v_run -> 'answer',
      'field_id',     r.data ->> 'target_field_id',
      'rule_id',      v_run ->> 'rule_id',
      'rule_version', (v_run -> 'rule_version'),
      'at',           to_jsonb(now())));
  end loop;

  -- A WORKED-OUT ANSWER THAT NO RULE WORKS OUT IS NEVER QUIETLY KEPT AND NEVER QUIETLY
  -- DROPPED, and the two ways one can appear are told apart rather than lumped together.
  --
  --   IT WAS ALREADY THERE, and its Rule has stopped applying — T8's retype, exactly: a
  --   square becomes a circle and `sides_equal` stops being a thing about this record. That
  --   is not an error and refusing it would make the retype impossible. The answer is
  --   RETIRED into `data -> '_retired'` with its reason, the same place and the same shape
  --   W1-FIELD moves a Value that stopped applying — a STAND-IN for History, announced with
  --   W3-HIST as the remedy.
  --
  --   IT ARRIVED IN THIS WRITE — a hand-written `_computed` block. That is a forged
  --   provenance: a value wearing a Rule's name and a version, which `custom.record_values`
  --   would then serve as if the system had worked it out. REFUSED by name.
  if jsonb_typeof(new.data -> '_computed') = 'object' then
    v_prior := case when tg_op = 'UPDATE' then coalesce(old.data -> '_computed', '{}'::jsonb)
                    else '{}'::jsonb end;
    for v_stale in
      select k from jsonb_object_keys(new.data -> '_computed') k where not (v_computed ? k)
    loop
      if (v_prior -> v_stale) is distinct from (new.data -> '_computed' -> v_stale) then
        raise exception 'this record carries a worked-out answer for % that no rule works out', v_stale
          using errcode = '23514',
                hint = 'REC-15 / FLD-9: a worked-out answer belongs to the Rule that works it out, and it carries that Rule''s id and version. A value written here by hand would be served as if the system had worked it out.';
      end if;
      v_retired := coalesce(new.data -> '_retired', '[]'::jsonb) || jsonb_build_object(
        'key',    v_stale,
        'label',  coalesce(custom.rule_field_label(new.organization_id,
                             (v_prior -> v_stale ->> 'field_id')::uuid), v_stale),
        'value',  v_prior -> v_stale -> 'value',
        'reason', format('this record changed, and nothing works out %s for it any more',
                         coalesce(custom.rule_field_label(new.organization_id,
                                    (v_prior -> v_stale ->> 'field_id')::uuid), v_stale)),
        'rule_id',      v_prior -> v_stale -> 'rule_id',
        'rule_version', v_prior -> v_stale -> 'rule_version',
        'at',     to_jsonb(now()));
      new.data := jsonb_set(new.data, '{_retired}', v_retired);
    end loop;
  end if;

  if v_computed = '{}'::jsonb then
    new.data := new.data - '_computed';
  else
    new.data := jsonb_set(new.data, '{_computed}', v_computed);
  end if;

  return new;
end;
$function$
;


CREATE OR REPLACE FUNCTION custom._rule_definition_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_data jsonb;
  v_id   uuid;
begin
  if tg_op = 'DELETE' then
    update custom.record
       set deleted_at = now()
     where organization_id = old.organization_id and id = old.id
       and table_id = custom.rule_kernel_id();
    return old;
  end if;

  -- The view's columns are assembled back into the ONE stored document, so a write through
  -- the projection and a write into the store produce the same row and the SAME guard fires.
  v_data := coalesce(new.data, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
    'name',            new.name,
    'kind',            new.kind,
    'scope_table_id',  new.scope_table_id,
    'target_field_id', new.target_field_id,
    'message',         new.message))
    || jsonb_build_object(
    'uses',             coalesce(new.uses, '[]'::jsonb),
    'applies_to_types', coalesce(new.applies_to_types, '[]'::jsonb),
    'use_types',        coalesce(new.use_types, '{}'::jsonb),
    'sort',             coalesce(new.sort, 0));
  if new.expr is not null then
    v_data := jsonb_set(v_data, '{expr}', new.expr);
  end if;

  if tg_op = 'INSERT' then
    insert into custom.record (id, organization_id, table_id, data_class, data)
    values (coalesce(new.id, gen_random_uuid()), new.organization_id,
            custom.rule_kernel_id(), 'rule', v_data)
    returning id into v_id;
    new.id := v_id;
    return new;
  end if;

  -- REC-19: the version is NOT touched here. platform._touch_row - the platform's own
  -- standard trigger, already on custom.record - increments it on every UPDATE, whichever
  -- way the write arrives. A second `version = version + 1` in this body would make a write
  -- through the projection count as two changes, which is exactly how a version number stops
  -- meaning anything.
  update custom.record
     set data = v_data
   where organization_id = new.organization_id and id = new.id
     and table_id = custom.rule_kernel_id();
  return new;
end;
$function$
;


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
begin
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
                    v_name, coalesce(v_kind, 'nothing')
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
                      v_name, coalesce(v_use, 'do nothing')
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
$function$
;


CREATE OR REPLACE FUNCTION custom._rule_topology_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_path   text[];
  v_self   text;
  v_back   text;
  v_leaf   jsonb;
  v_name   text;
  v_steps  text;
begin
  if new.data_class = 'kernel'
     or new.table_id is null
     or new.table_id not in (custom.rule_kernel_id(), custom.merge_field_kernel_id()) then
    return new;
  end if;

  -- ── REC-16 AT SAVE TIME, NAMING THE RULE. A Rule that asks for two ancestor levels is
  -- refused when it is WRITTEN, in the words of the person writing it, rather than at three
  -- in the morning on somebody else's record - the same standard W1-RULE set for the rest of
  -- the vocabulary. The three shapes are the three a person actually writes.
  if new.table_id = custom.rule_kernel_id() then
    v_name := coalesce(nullif(new.data ->> 'name', ''), 'this rule');
    for v_leaf in
      select jsonb_path_query(coalesce(new.data -> 'expr', '{}'::jsonb),
               '$.**{0 to 12} ? (exists(@.parent_field) || exists(@.grandparent_field) || exists(@.ancestor_field))')
    loop
      if v_leaf ?| array['grandparent_field', 'ancestor_field'] then
        raise exception 'the rule % reads an answer two steps up, and a rule reads its own record and the one it is inside', v_name
          using errcode = '23514',
                hint = 'REC-16: one level up and no further. To reach further, give the record a relation to the thing it needs and read that.';
      end if;
      if jsonb_typeof(v_leaf -> 'parent_field') = 'object' then
        raise exception 'the rule % reads the answer of the thing its parent is inside, and a rule reads its own record and the one it is inside', v_name
          using errcode = '23514',
                hint = 'REC-16: one level up and no further. {"parent_field": "<a field id>"} reads the parent; it cannot be wrapped around another parent_field.';
      end if;
      v_steps := coalesce(v_leaf ->> 'levels', v_leaf ->> 'up');
      if v_steps is not null and v_steps <> '1' then
        raise exception 'the rule % asks to go % steps up, and a rule reads its own record and the one it is inside', v_name, v_steps
          using errcode = '23514',
                hint = 'REC-16: one level up and no further. There is no number to raise here.';
      end if;
      if jsonb_typeof(v_leaf -> 'parent_field') <> 'string'
         or (v_leaf ->> 'parent_field') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'the rule % points at the parent''s field with % instead of with its id',
                        v_name, coalesce(v_leaf ->> 'parent_field', 'something that is not there')
          using errcode = '23514',
                hint = 'REC-17 applies to the parent''s Fields too: {"parent_field": "<the field''s id>"}.';
      end if;
      -- The parent may be a record of ANY Table (containment is a tree over records, not
      -- over tables), so the id is checked to be a live Field OF THIS ORGANIZATION - which
      -- is everything that can be known at save time, and it is checked rather than assumed.
      if custom.rule_field_key(new.organization_id, (v_leaf ->> 'parent_field')::uuid) is null then
        raise exception 'the rule % points at a field of the parent that this organization does not have', v_name
          using errcode = '23514',
                hint = 'REC-16 / REC-17: parent_field holds the id of a live Field. Which Table the parent belongs to is known only when the rule runs, so the id is what is checked here.';
      end if;
    end loop;
  end if;

  v_path := custom.dependency_cycle(new.organization_id, new);
  if v_path is null then
    return new;
  end if;

  -- BOTH SIDES, BY NAME. The thing being saved, and the nearest Rule or merge field in the
  -- circle that is already waiting for it - a refusal that named only one of them leaves the
  -- reader hunting for the other half, and one that named the FIELD between two Rules names
  -- the rope rather than either end of it.
  --
  -- 🚨 THE SAVED ROW'S NAME COMES OUT OF THE ROW, NOT OUT OF THE CATALOGUE. On an INSERT it
  -- is not in `custom.record` yet, so a lookup answers NULL and the refusal reads `saving
  -- "<NULL>"` - which is how this was caught, by its own suite, before it left the branch.
  v_self := coalesce(nullif(new.data ->> 'name', ''), nullif(new.data ->> 'key', ''),
                     custom.dependency_label(new.organization_id, v_path[1]), 'this rule');
  select custom.dependency_label(new.organization_id, u.n) into v_back
    from unnest(v_path) with ordinality as u(n, o)
   where u.o between 2 and array_length(v_path, 1) - 1
     and split_part(u.n, ':', 1) in ('rule', 'merge')
   order by u.o desc
   limit 1;
  v_back := coalesce(v_back,
                     custom.dependency_label(new.organization_id, v_path[array_length(v_path, 1) - 1]),
                     'something in the same circle');
  raise exception 'saving "%" would make it wait for "%", and "%" is already waiting for "%"',
                  v_self, v_back, v_back, v_self
    using errcode = '23514',
          hint = format('DYN-9 / REC-15: rules and merge fields work each other''s answers out, so they cannot wait on each other in a circle. The circle is: %s.',
                        (select string_agg(case when u.n = v_path[1] then v_self
                                                else custom.dependency_label(new.organization_id, u.n) end,
                                           ' -> ' order by u.o)
                           from unnest(v_path) with ordinality as u(n, o)));
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
  v_type       text;
  v_title      text;
  v_fields     jsonb;
  v_home       uuid;
  v_home_type  text;
  v_names      text[];
begin
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
    raise exception 'a table is an entity or a detail, and this one says %', coalesce(v_type, 'nothing')
      using errcode = '23514', hint = 'REC-66: type ∈ {entity, detail}.';
  end if;
  if v_type = 'detail' and coalesce(d ->> 'parent_token', '') = '' then
    raise exception 'a detail table has to say what it is a detail of'
      using errcode = '23514', hint = 'REC-66: parent_token is required when type is detail.';
  end if;
  if v_type <> 'detail' and d ? 'parent_token' then
    raise exception 'only a detail table has a parent table'
      using errcode = '23514', hint = 'REC-66: parent_token belongs to type detail and to nothing else.';
  end if;

  if coalesce(d ->> 'name', '') = '' then
    raise exception 'a table needs a name' using errcode = '23514', hint = 'REC-1.';
  end if;
  if coalesce(d ->> 'slug', '') !~ '^[a-z][a-z0-9_]*$' then
    raise exception 'a table needs a slug made of lower-case letters, digits and underscores'
      using errcode = '23514', hint = 'REC-66: slug.';
  end if;
  if coalesce(d ->> 'label_singular', '') = '' or coalesce(d ->> 'label_plural', '') = '' then
    raise exception 'a table needs both of its labels - one thing and many things'
      using errcode = '23514', hint = 'REC-66: label_singular and label_plural.';
  end if;

  if coalesce(d ->> 'display', '') not in ('list', 'page') then
    raise exception 'a table shows its records as a list or as a page, and this one says %',
                    coalesce(d ->> 'display', 'nothing')
      using errcode = '23514', hint = 'REC-1: display. T4 turns a list into a page and migrates nothing.';
  end if;
  if jsonb_typeof(d -> 'ordered') is distinct from 'boolean' then
    raise exception 'a table has to say whether its records are ordered'
      using errcode = '23514', hint = 'REC-1: ordered.';
  end if;
  if coalesce(d ->> 'weight', '') not in ('heavy', 'light') then
    raise exception 'a table is heavy or light, and this one says %', coalesce(d ->> 'weight', 'nothing')
      using errcode = '23514', hint = 'REC-1: heavy|light.';
  end if;
  if jsonb_typeof(d -> 'retention_days') is distinct from 'number' then
    raise exception 'a table has to say how long it keeps its history'
      using errcode = '23514', hint = 'REC-1: retention.';
  end if;
  if (d ->> 'retention_days')::numeric < 30 then
    raise exception 'thirty days is the least history a table can keep'
      using errcode = '23514',
            hint = 'REC-1 / T14: the retention floor is thirty days and an organization cannot go below it.';
  end if;

  -- REC-N-17: a default sort AND a manual row order, both load-bearing.
  if jsonb_typeof(d -> 'default_sort') is distinct from 'array' then
    raise exception 'a table has to say how its records are sorted by default'
      using errcode = '23514', hint = 'REC-N-17: default_sort is an array of {field, direction}.';
  end if;
  if coalesce(d ->> 'row_order', '') not in ('manual', 'sorted') then
    raise exception 'a table orders its rows by hand or by its sort, and this one says %',
                    coalesce(d ->> 'row_order', 'nothing')
      using errcode = '23514', hint = 'REC-N-17: manual row order.';
  end if;

  if jsonb_typeof(d -> 'agent_writable') is distinct from 'boolean' then
    raise exception 'a table has to say whether an agent may write to it'
      using errcode = '23514', hint = 'REC-66: agent_writable, default true, is declared rather than guessed.';
  end if;

  -- REC-1: its fields. REC-2: exactly one of them is the title.
  v_fields := d -> 'fields';
  if jsonb_typeof(v_fields) is distinct from 'array' or jsonb_array_length(v_fields) = 0 then
    raise exception 'a table has to declare its fields'
      using errcode = '23514', hint = 'REC-1: fields.';
  end if;
  select array_agg(f ->> 'name') into v_names from jsonb_array_elements(v_fields) f;
  if array_position(v_names, null) is not null then
    raise exception 'every field of a table needs a name'
      using errcode = '23514', hint = 'REC-1: fields.';
  end if;
  v_title := d ->> 'title_field';
  if v_title is null then
    raise exception 'a table needs a title field, or its records cannot be shown as chips'
      using errcode = '23514', hint = 'REC-2.';
  end if;
  if not (v_title = any (v_names)) then
    raise exception 'the title field % is not one of this table''s fields', v_title
      using errcode = '23514', hint = 'REC-2: the title field names one of the table''s own fields.';
  end if;

  -- REC-1 and REC-14: exactly ONE Home, and the Home IS the parent, so "exactly one Home"
  -- and "zero or one parent" are ONE stored fact and the Home tree is REC-7's tree.
  v_home := custom.containment_parent(d);
  if v_home is null then
    raise exception 'a table has to live somewhere - give it a home'
      using errcode = '23514',
            hint = 'REC-1: exactly one Home, stored as this record''s parent_id. Additional Homes are relations (REC-3, REC-26).';
  end if;
  -- REC-11: a detail Table's records inherit only and cannot be Homes.
  select t.data ->> 'type' into v_home_type
    from custom.record h
    join custom.record t
      on t.organization_id = h.organization_id and t.id = h.table_id
   where h.organization_id = new.organization_id and h.id = v_home;
  if v_home_type = 'detail' then
    raise exception 'a detail record cannot be a home'
      using errcode = '23514',
            hint = 'REC-11: a detail table inherits only - its records take no direct shares and cannot be Homes.';
  end if;

  return new;
end;
$function$
;
