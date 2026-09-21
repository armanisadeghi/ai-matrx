-- additive: yes
--
-- chair-step: it REPLACES the live bodies of `custom.parity_field_types`,
--   `custom.parity_type`, `custom._field_shape_guard`, `custom.validate_values`,
--   `custom.field_value_convert`, `custom._field_document_for`,
--   `custom._field_type_parity_guard`, `custom.io_cell`, `custom.io_infer_type`,
--   `custom.io_infer_column`, `custom.io_proposal_accept`, `custom.agg_sql`,
--   `custom.agg_view_admits_state` and `custom.doc_format_value`. Nothing is dropped,
--   nothing is revoked, no enum value is added, and NOT ONE EXISTING ROW IS TOUCHED —
--   in particular every Yes/No choice field crews declared as a workaround stays
--   exactly the choice field it is. Every replaced body carries a `-- based-on:` hash.
--
--
-- based-on: custom.parity_field_types() 0ce8071a0666591064f4b4bc2659dbaf9b43fb3aa6c1de3f6e0cbcdf2d76749d
-- based-on: custom.parity_type(jsonb) c30a634691e9772b0f9d6404f55741fc578d13dcacf888b2c5046730d46dfce1
-- based-on: custom._field_shape_guard() f67e24ad593128b033a5d7c613b5a4b744a32ac15a60d922c061beb9efb4d34e
-- based-on: custom.validate_values(uuid, custom.record[], jsonb, text) fc76c261b8413377a47724132ee476d9cf250dbb2845a8159ba0d66605d41e74
-- based-on: custom.field_value_convert(jsonb, jsonb) cf0e48adce0706e73497387cf0b0f326a1051f31d5b8a391159a9b9d08f1e87d
-- based-on: custom._field_type_converts_values() f2a14e739075d635090998846a7521eeb939762f6334711946f47e88a53aa761
-- based-on: custom._field_document_for(uuid, uuid, jsonb) 67e7e79418c2ceea7ae470792bfd621257fe341abcd3225197dc71bd3500032f
-- based-on: custom._field_type_parity_guard() 5860c450cf4d5dd29efbe21eaf2898fcfeb9d8245542d882227d08ba5c80471b
-- based-on: custom.io_cell(uuid, jsonb, text, text) cc8e5844ac5b0300e95874f770fb246c7f308ae6b9081b462eba52ead251bb71
-- based-on: custom.io_infer_type(jsonb) c01df8bb98eb9fda6d1a6b5ea847a35a1905293ed313ea10047e22e5ec7c2dc7
-- based-on: custom.io_infer_column(uuid, uuid, text, jsonb) 56bb13057f26d65394bb210e59ee9a99111b9b2f485e8ffc18ce173d8d547181
-- based-on: custom.io_proposal_accept(uuid, uuid, text, text, text) c86e201780ff6395a3010b914dafd99f973a4f595ab68b9db991293eb959a749
-- based-on: custom.agg_sql(uuid, uuid, jsonb, jsonb, jsonb, jsonb, integer, text) ab68afa3cf511aa7021bb22946deb5d65e3fa54413703074850c11cf36715012
-- based-on: custom.agg_view_admits_state(jsonb, jsonb) cb3f48e760591d44cce3874fe036aae0f761bc812b6e7bc3072fbd355eae9b3e
-- based-on: custom.doc_format_value(jsonb, jsonb) f5c2eda08640b8219f5eb1247372a698c8d09aaeef752582529c6db45512e8eb
--
-- LIMITS-FIX — A CHECKBOX IS A REAL BOOLEAN, AND "NEVER ANSWERED" IS NOT "NO".
--
-- WHAT WENT WRONG (real-data crew B, 2026-09-21, feedback 1ce74b8d-8f1c-4687-9abd-5f6cda7e1355).
-- A physical-therapy clinic recording whether a contractor is insured, a family recipe
-- collection recording whether an ingredient has been bought, a home-renovation log recording
-- whether a crew photographed a bin: three of the most ordinary facts a small business or a
-- person records, and this store had no column for any of them. `custom.parity_field_types()`
-- shipped thirteen types plus three plain behaviours and not one of them was a boolean, so
-- `custom.field_declare` refused `plain: "boolean"` and crews fell back to a Yes/No choice
-- list — after which every row written with the JSON boolean it actually is was refused:
--
--     23514  checked takes one of its choices, and it was given a boolean
--
-- THE RULING (chair, 2026-09-21): `checkbox` becomes a FIRST-CLASS parity type, made of a new
-- FLD-1 behaviour `boolean`, end to end. Not a two-option list wearing a tick: the record
-- holds a REAL JSON boolean, the read door hands back a real boolean, and a row that never
-- answered holds NOTHING — which is a third state, and is why this is a behaviour of its own
-- rather than a format on text.
--
-- THE THIRD STATE IS THE WHOLE POINT. `true`, `false` and UNSET are three different facts: a
-- contractor recorded as not insured and a contractor nobody has asked yet are not the same
-- contractor, and a screen that shows both as an empty tick box is lying. So:
--   · group-by already separates them, because `r.data ->> 'insured'` is 'true', 'false' or
--     SQL NULL, and this file adds the test that proves it;
--   · a filter asking for `null` now means UNSET, in `custom.agg_sql` and in a saved view's
--     `custom.agg_view_admits_state` — both of them used to compare the missing value against
--     the empty string and quietly answer "no rows".
--
-- CONVERTS NOTHING. There is no sweep in this file. A Yes/No choice field already declared
-- stays a choice field with its own options Table, its own records and its own history; a
-- later verb may offer to convert one on request, and this is not that verb.

-- (the runner owns the transaction: this file carries no BEGIN and no COMMIT)

-- ════════════════════════════════════════════════════════════════════════════════════
-- 1. THE VOCABULARY. Fourteen types, and the fourteenth says out loud that it has three
--    states — because every reader of this list (the field panel, the agent tool, the
--    import mapper) takes its sentence from here.
-- ════════════════════════════════════════════════════════════════════════════════════
create or replace function custom.parity_field_types()
 returns table(parity_type text, behavior text, made_of text)
 language sql
 immutable parallel safe
 set search_path to 'pg_catalog'
as $function$
  select * from (values
    ('select',       'list',     'one choice from a Table shown as a list (FLD-5/FLD-6)'),
    ('multi_select', 'list',     'many choices from the same Table — the multi modifier, never a second behaviour'),
    ('member',       'relation', 'a person: a relation whose target is the kernel `Person` Table'),
    ('attachment',   'relation', 'REC-31: a File record reached through a relation, target the kernel `File` Table'),
    ('lookup',       'formula',  'a Value read THROUGH a relation — config.via names the relation field, config.pick the Value on the far side'),
    ('rollup',       'formula',  'an aggregate ALONG a relation — config.via, config.of, config.agg; far-side ids are taken DISTINCT, so nothing is counted twice'),
    ('formula',      'formula',  'FLD-9: a declared computation, on read or on write, evaluated by custom.rule_eval'),
    ('url',          'text',     'text whose format is url, with the pattern Rule that makes the format enforceable'),
    ('email',        'text',     'text whose format is email'),
    ('phone',        'text',     'text whose format is phone'),
    ('currency',     'range',    'FLD-N-1: a number whose UNIT is the currency and whose format is currency — on the Field, never in presentation'),
    ('percent',      'range',    'a number whose unit is % and whose format is percent'),
    ('datetime',     'range',    'a range of kind date or datetime — the dated modifier says the VALUES are dated, which is a different question'),
    ('checkbox',     'boolean',  'a ticked or unticked answer, stored as a REAL boolean — and a record that never answered holds neither, so filters and group-by see three states, not two')
  ) as t(parity_type, behavior, made_of);
$function$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- 2. THE DERIVATION. One new arm, first-match-wins as every other arm is.
-- ════════════════════════════════════════════════════════════════════════════════════
-- 2. THE DERIVATION. One new arm, first-match-wins as every other arm already is.
-- ════════════════════════════════════════════════════════════════════════════════════
create or replace function custom.parity_type(p_field_data jsonb)
 returns text
 language sql
 immutable parallel safe
 set search_path to 'pg_catalog'
as $function$
  -- Read top to bottom: the FIRST answer wins, and every arm reads only what a Field
  -- already declares. Nothing here consults a column invented for the purpose.
  select case
    -- LIMITS-FIX 2026-09-21: the tick box. Its behaviour IS its parity type, so it is
    -- asked first and answers without looking at a format, a unit or a target.
    when p_field_data ->> 'type' = 'boolean' then 'checkbox'
    when p_field_data ->> 'type' = 'list'
      then case when coalesce((p_field_data ->> 'multi')::boolean, false)
                then 'multi_select' else 'select' end
    when p_field_data ->> 'type' = 'relation'
         and (p_field_data ->> 'relation_target')::uuid = custom.file_kernel_id()
      then 'attachment'
    when p_field_data ->> 'type' = 'relation'
         and (p_field_data ->> 'relation_target')::uuid = custom.person_kernel_id()
      then 'member'
    when p_field_data ->> 'type' = 'formula'
         and p_field_data -> 'config' ? 'pick'   then 'lookup'
    when p_field_data ->> 'type' = 'formula'
         and p_field_data -> 'config' ? 'agg'    then 'rollup'
    -- 🚨 `expr` IS REQUIRED HERE, and it is not a formality. A Field of behaviour `formula`
    -- whose answer is worked out by a compute RULE (REC-15, W1-RULE's `sides_equal`) carries
    -- no expression of its own and is NOT the `formula` parity type — it is a formula Field
    -- the Rule layer fills in. Answering `formula` for it would make the guard demand an
    -- expression W1-RULE never writes, and make the write path evaluate an empty expression
    -- and raise. Measured: doing exactly that turned `w1_field_t4_t8`, `w1_rule_t8` and
    -- `w1_rule_apply` red, 2026-09-17.
    when p_field_data ->> 'type' = 'formula'
         and p_field_data -> 'config' ? 'expr'   then 'formula'
    when p_field_data ->> 'type' = 'text'
         and (p_field_data ->> 'format') in ('url', 'email', 'phone')
      then p_field_data ->> 'format'
    when p_field_data ->> 'type' = 'range'
         and (p_field_data ->> 'format') = 'percent'  then 'percent'
    when p_field_data ->> 'type' = 'range'
         and nullif(p_field_data ->> 'unit', '') is not null
         and (p_field_data ->> 'format') = 'currency' then 'currency'
    when p_field_data ->> 'type' = 'range'
         and (p_field_data -> 'config' ->> 'kind') in ('date', 'datetime') then 'datetime'
    else null
  end;
$function$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- 3. THE SHAPE GUARD. FLD-1's closed set gains a sixth behaviour.
-- ════════════════════════════════════════════════════════════════════════════════════
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

  -- Only field definitions. A `kernel` row is the kernel Table `Field` itself (REC-27:
  -- defined in code, not data) and is exempt, exactly as W1-TABLE exempts the kernel Tables.
  if new.table_id is distinct from custom.field_kernel_id() or new.data_class = 'kernel' then
    return new;
  end if;

  v_label := nullif(d ->> 'label', '');
  v_key   := d ->> 'key';
  if v_key is null or v_key !~ '^[a-z][a-z0-9_]*$' then
    raise exception 'a field needs a key made of lower-case letters, digits and underscores, and this one says %',
                    custom.said(v_key, 'nothing')
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
            hint = 'FLD-1: one of list, range, text, relation, formula, boolean. What looks like a second behavior is a modifier (FLD-2) or a Rule (FLD-3).';
  end if;
  v_type := d ->> 'type';
  -- LIMITS-FIX 2026-09-21: `boolean` joins the closed set. It is a BEHAVIOUR and not a
  -- format on something else, because a tick box has THREE answers — ticked, unticked, and
  -- nobody has said — and only a behaviour of its own can hold a real boolean while an
  -- absent key keeps meaning "never asked" (VAL-2).
  if v_type is null or v_type not in ('list', 'range', 'text', 'relation', 'formula', 'boolean') then
    raise exception 'the field % says its behavior is %, and a field behaves as a list, a range, text, a relation, a formula or a tick box',
                    v_label, custom.said(v_type, 'nothing')
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
    -- STORE-T / B1: `unique` joins the set. It is not judged here — a shape guard sees one
    -- row and uniqueness is a statement about the OTHERS — it is carried out by
    -- custom._unique_rule_holds, which is a trigger and can take the lock that makes it true
    -- under concurrency. A kind this store cannot execute is still refused by name.
    if v_kind is null or v_kind not in ('min', 'max', 'pattern', 'length', 'equals_field', 'differs_from_field', 'unique') then
      raise exception 'the field % carries a rule of kind %, which this validator cannot execute',
                      v_label, custom.said(v_kind, 'nothing')
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
                    v_label, custom.said(v_source, 'nothing')
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
                    v_label, custom.said(d ->> 'sensitivity', 'nothing')
      using errcode = '23514', hint = 'FLD-12: sensitivity is public, internal, confidential or restricted.';
  end if;
  if coalesce(d ->> 'context_policy', '') not in ('include', 'summarize', 'exclude', 'on_request') then
    raise exception 'the field % has to say whether an agent may see its values, and it says %',
                    v_label, custom.said(d ->> 'context_policy', 'nothing')
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
$function$;


CREATE OR REPLACE FUNCTION custom.validate_values(p_organization_id uuid, p_fields custom.record[], p_values jsonb, p_record_type text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  f        custom.record;
  d        jsonb;
  v_label  text;
  v_key    text;
  v_type   text;
  v_multi  boolean;
  v_val    jsonb;
  v_one    jsonb;
  v_items  jsonb;
  v_n      integer;
  v_rule   jsonb;
  v_kind   text;
  v_other  jsonb;
  v_table  uuid;
  v_map    jsonb;
  v_field  jsonb;
  v_types  text[];
begin
  if p_fields is null or array_length(p_fields, 1) is null then
    return;
  end if;

  -- CHOICE-VALUE. The type field's value is the option's KEY now, and `applies_to_types` was
  -- written by whoever declared the Field or the Rule - in words, in keys, or (before this
  -- lane) in option ids. All three name the same choice, so all three are asked. This is what
  -- keeps T8's Square rule attached to the square.
  -- THE MAP IS BUILT FROM THE FIELDS THEMSELVES, not from a Table id. MEASURED 2026-09-20
  -- 07:27Z: the fields of a STANDARD entity's `custom_fields` (REC-40) carry `table_token` and
  -- no `entity_definition_id` at all, so asking `custom.choice_field_map` for a Table produced
  -- an empty map and every valid choice on `crm.party` was refused. Each list Field already
  -- names the Table its choices come from; that is the only thing this needs.
  select coalesce(jsonb_object_agg(f2.data ->> 'key', jsonb_build_object(
           'label',   coalesce(nullif(f2.data ->> 'label', ''), f2.data ->> 'key'),
           'options', custom.choice_options(p_organization_id,
                        (f2.data -> 'config' ->> 'options_table_id')::uuid))), '{}'::jsonb)
    into v_map
    from unnest(p_fields) f2
   where f2.data ->> 'type' = 'list'
     and nullif(f2.data -> 'config' ->> 'options_table_id', '') is not null;

  v_types := case when p_record_type is null then '{}'::text[]
                  else custom.choice_synonyms_in(v_map, p_record_type) end;

  foreach f in array p_fields loop
    d       := f.data;
    v_key   := d ->> 'key';
    v_label := coalesce(nullif(d ->> 'label', ''), v_key);
    v_type  := d ->> 'type';
    v_multi := coalesce((d ->> 'multi')::boolean, false);
    v_val   := p_values -> v_key;

    -- REQUIRED. An absent key and a null value are the same absence and are said the same way.
    if v_val is null or jsonb_typeof(v_val) = 'null'
       or (v_multi and jsonb_typeof(v_val) = 'array' and jsonb_array_length(v_val) = 0) then
      if coalesce((d ->> 'required')::boolean, false) then
        raise exception '% is required', v_label
          using errcode = '23514', hint = format('REC-51: the field %s of this table.', v_key);
      end if;
      continue;
    end if;

    -- A FORMULA IS NEVER WRITTEN BY HAND (FLD-9): the declaration says who computes it.
    if v_type = 'formula' then
      raise exception '% is worked out by the system, so it cannot be typed in', v_label
        using errcode = '23514',
              hint = format('FLD-9: this formula computes on %s.', coalesce(d ->> 'compute_on', 'write'));
    end if;

    -- MULTI (FLD-2) is about the SHAPE of the value, never about the behavior.
    if v_multi then
      if jsonb_typeof(v_val) <> 'array' then
        raise exception '% holds many values, so it takes a list', v_label
          using errcode = '23514', hint = 'FLD-2: the multi modifier.';
      end if;
      v_items := v_val;
    else
      if jsonb_typeof(v_val) = 'array' then
        raise exception '% holds one value, and it was given a list', v_label
          using errcode = '23514', hint = 'FLD-2: multi is off for this field.';
      end if;
      v_items := jsonb_build_array(v_val);
    end if;

    for v_one in select e from jsonb_array_elements(v_items) e loop
      -- TYPE.
      if v_type = 'boolean' then
        -- LIMITS-FIX: a tick is a REAL boolean. A record that never answered carries no key
        -- at all and left through the absence branch above, so `false` arriving here is a
        -- person SAYING no — a different fact from never having been asked, and the store
        -- keeps the two apart rather than flattening them into one empty box.
        if jsonb_typeof(v_one) <> 'boolean' then
          raise exception '% is ticked or left unticked, and it was given a %', v_label, jsonb_typeof(v_one)
            using errcode = '23514',
                  hint = 'FLD-1: boolean. Write true or false. The WORDS "Yes" and "No" are a choice list, which is a different kind of column.';
        end if;
      elsif v_type = 'text' then
        if jsonb_typeof(v_one) <> 'string' then
          raise exception '% takes words, and it was given a %', v_label, jsonb_typeof(v_one)
            using errcode = '23514', hint = 'FLD-1: text.';
        end if;
      elsif v_type = 'range' then
        if jsonb_typeof(v_one) = 'number' then
          null;
        elsif jsonb_typeof(v_one) = 'string'
              and coalesce(d -> 'config' ->> 'kind', 'number') in ('date', 'datetime') then
          begin
            perform (v_one #>> '{}')::timestamptz;
          exception when others then
            raise exception '% takes a date, and % is not one', v_label, v_one #>> '{}'
              using errcode = '23514', hint = 'FLD-1: range, of kind date.';
          end;
        else
          raise exception '% takes a number, and it was given a %', v_label, jsonb_typeof(v_one)
            using errcode = '23514', hint = 'FLD-1: range.';
        end if;
      elsif v_type = 'list' then
        if jsonb_typeof(v_one) <> 'string' then
          raise exception '% takes one of its choices, and it was given a %', v_label, jsonb_typeof(v_one)
            using errcode = '23514',
                  hint = 'FLD-5 / FLD-6: a list field stores the option''s own KEY - a short stable word - because every pick-list is already a Table.';
        end if;
        -- OPTION MEMBERSHIP. The value is the KEY of an option of this Field's own Table.
        -- A RETIRED option's key passes here ON PURPOSE: a record that already holds one has
        -- to stay editable when somebody changes a different column. Picking a retired choice
        -- ANEW is refused by custom._resolve_choice_words, which is the only place that can
        -- tell a new pick from a value that was already there.
        -- A TOKEN THAT NAMES ONE OF THE CHOICES. The KEY is the contract and is what
        -- `custom._resolve_choice_words` stores; the label and the option's own id are
        -- accepted too, because a surface with no normaliser in front of it (a standard
        -- entity's `custom_fields`) writes what its caller sent and must not be refused for
        -- naming the right choice a different way.
        v_field := v_map -> v_key;
        if v_field is null
           or custom.choice_key_of(v_field, v_one #>> '{}') is null then
          raise exception '% was given a choice that is not one of its choices', v_label
            using errcode = '23514',
                  hint = format('REC-51: option membership. The choices for %s are %s.', v_label,
                                coalesce(custom.choice_words(coalesce(v_field, '{}'::jsonb)),
                                         'the records of its own table, and it has none yet'));
        end if;
      elsif v_type = 'relation' then
        if jsonb_typeof(v_one) <> 'string' then
          raise exception '% points at a record, and it was given a %', v_label, jsonb_typeof(v_one)
            using errcode = '23514', hint = 'FLD-1: relation.';
        end if;
        -- RELATION RULES. The target exists, in this organization, in the declared table.
        -- The id SHAPE first, for the same reason as the list branch above.
        if (v_one #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
          raise exception '% points at something that is not there', v_label
            using errcode = '23514',
                  hint = format('REC-51: %s stores the id of a record, and what it was given is not an id at all.', v_label);
        end if;
        if not exists (
          select 1 from custom.record t
           where t.organization_id = p_organization_id
             and t.id = (v_one #>> '{}')::uuid
             and t.table_id = (d ->> 'relation_target')::uuid
             and t.deleted_at is null) then
          raise exception '% points at something that is not there', v_label
            using errcode = '23514',
                  hint = 'REC-51: a relation field points at a live record of the table it declared.';
        end if;
      end if;

      -- FLD-3: the attached validation Rules, read through the ONE seam.
      -- FLD-10 says the type field selects which Fields AND RULES apply, so a Rule carries
      -- its own applies_to_types: T8's Width applies to a rectangle and to a square, and the
      -- "the sides are equal" Rule attached to it applies to the SQUARE alone. A Rule with an
      -- empty list applies wherever its Field does.
      for v_rule in select r from jsonb_array_elements(coalesce(d -> 'rules', '[]'::jsonb)) r loop
        if jsonb_array_length(coalesce(v_rule -> 'applies_to_types', '[]'::jsonb)) > 0
           and not (p_record_type is not null and (v_rule -> 'applies_to_types') ?| v_types) then
          continue;
        end if;
        v_kind := v_rule ->> 'kind';
        if v_kind = 'min' and jsonb_typeof(v_one) = 'number'
           and (v_one #>> '{}')::numeric < (v_rule ->> 'value')::numeric then
          raise exception '% has to be at least %', v_label, v_rule ->> 'value'
            using errcode = '23514', hint = 'FLD-3: an attached validation Rule, not a behavior.';
        elsif v_kind = 'max' and jsonb_typeof(v_one) = 'number'
              and (v_one #>> '{}')::numeric > (v_rule ->> 'value')::numeric then
          raise exception '% cannot be more than %', v_label, v_rule ->> 'value'
            using errcode = '23514', hint = 'FLD-3: an attached validation Rule, not a behavior.';
        elsif v_kind = 'length' and jsonb_typeof(v_one) = 'string'
              and length(v_one #>> '{}') > (v_rule ->> 'value')::integer then
          raise exception '% is longer than % characters', v_label, v_rule ->> 'value'
            using errcode = '23514', hint = 'FLD-3.';
        elsif v_kind = 'pattern' and jsonb_typeof(v_one) = 'string'
              and (v_one #>> '{}') !~ (v_rule ->> 'value') then
          raise exception '% is not written the way this field expects', v_label
            using errcode = '23514', hint = 'FLD-3.';
        elsif v_kind = 'equals_field' then
          v_other := p_values -> (v_rule ->> 'value');
          if v_other is not null and jsonb_typeof(v_other) <> 'null' and v_other <> v_one then
            raise exception '% and % have to be the same', v_label, v_rule ->> 'value'
              using errcode = '23514',
                    hint = 'FLD-3 / T8: a constraint across two fields is a Rule attached to one of them, never a behavior.';
          end if;
        elsif v_kind = 'differs_from_field' then
          v_other := p_values -> (v_rule ->> 'value');
          if v_other is not null and v_other = v_one then
            raise exception '% and % have to be different', v_label, v_rule ->> 'value'
              using errcode = '23514', hint = 'FLD-3.';
          end if;
        end if;
      end loop;
    end loop;

    -- RELATION MAX, once per field rather than once per item.
    if v_type = 'relation' and v_multi then
      v_n := jsonb_array_length(v_items);
      if v_n > coalesce((d ->> 'relation_max')::integer, v_n) then
        raise exception '% points at % things, and it can point at % at most',
                        v_label, v_n, d ->> 'relation_max'
          using errcode = '23514', hint = 'REC-51: relation_max.';
      end if;
    end if;
  end loop;
end;
$function$;


CREATE OR REPLACE FUNCTION custom.field_value_convert(p_to jsonb, p_value jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_type text := p_to ->> 'type';
  v_kind text := coalesce(p_to -> 'config' ->> 'kind', 'number');
  v_txt  text;
  v_num  numeric;
  v_one  jsonb;
  v_out  jsonb;
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    return p_value;                       -- an absence is already whatever the field wants
  end if;

  -- MULTI: a list of values converts when every one of them does, and not otherwise. A half
  -- converted list is a value nobody asked for.
  if jsonb_typeof(p_value) = 'array' then
    v_out := '[]'::jsonb;
    for v_one in select e from jsonb_array_elements(p_value) e loop
      v_one := custom.field_value_convert(p_to, v_one);
      if v_one is null then
        return null;
      end if;
      v_out := v_out || jsonb_build_array(v_one);
    end loop;
    return v_out;
  end if;

  if jsonb_typeof(p_value) = 'object' then
    return null;                          -- no field behaviour takes an object
  end if;

  v_txt := p_value #>> '{}';

  if v_type = 'boolean' then
    if jsonb_typeof(p_value) = 'boolean' then
      return p_value;
    end if;
    -- The words a spreadsheet, a form and a person actually write for a tick. Anything else
    -- does not convert, and custom._field_type_converts_values then keeps it in `_retired`
    -- with its reason rather than guessing that an unreadable value meant "no".
    if lower(btrim(v_txt)) in ('true', 't', 'yes', 'y', '1', 'on', 'x', '✓', '✔') then
      return to_jsonb(true);
    end if;
    if lower(btrim(v_txt)) in ('false', 'f', 'no', 'n', '0', 'off', '☐') then
      return to_jsonb(false);
    end if;
    return null;
  end if;

  if v_type = 'text' then
    -- ANYTHING SCALAR READS AS WORDS. 12 becomes "12"; true becomes "true". Nothing is lost.
    return to_jsonb(v_txt);

  elsif v_type = 'range' and v_kind in ('date', 'datetime') then
    if jsonb_typeof(p_value) <> 'string' then
      return null;
    end if;
    begin
      perform v_txt::timestamptz;         -- exactly the test custom.validate_values applies
    exception when others then
      return null;
    end;
    return p_value;

  elsif v_type = 'range' then
    if jsonb_typeof(p_value) = 'number' then
      return p_value;
    end if;
    begin
      v_num := v_txt::numeric;
    exception when others then
      return null;
    end;
    return to_jsonb(v_num);

  elsif v_type in ('list', 'relation') then
    -- Both store the id of a record. A value that is not an id is not one of its choices and
    -- is not going to become one by being converted.
    if jsonb_typeof(p_value) = 'string'
       and v_txt ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return p_value;
    end if;
    return null;

  elsif v_type = 'formula' then
    -- FLD-9: a formula is never written by hand, so a typed-in value cannot survive the change.
    return null;
  end if;

  return null;
end;
$function$;


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
  if not coalesce((platform.knob_resolve('custom', 'system_enabled', new.organization_id) #>> '{}')::boolean, false) then
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
$function$;


CREATE OR REPLACE FUNCTION custom._field_document_for(p_organization_id uuid, p_table_id uuid, p_spec jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  d        jsonb;
  v_parity text := nullif(p_spec ->> 'parity_type', '');
  v_key    text := nullif(p_spec ->> 'key', '');
  -- ── LIMITS-FIX 2026-09-21: ONE WORD FOR WHAT A PERSON READS ON THE COLUMN. ──────────
  -- A table spec's inline field says `name` (`custom._table_shape_guard` demands it) and
  -- this door said `label`, so the same concept had two words one call apart and a caller
  -- that used the table's word was told "A field needs a name" while holding one. Real-data
  -- crew D hit this on 2026-09-21 declaring a podcast episode pipeline. Both words are read
  -- here; `label` still wins when a caller sends both, so no existing caller changes.
  v_label  text := coalesce(nullif(p_spec ->> 'label', ''), nullif(p_spec ->> 'name', ''));
  v_multi  boolean := coalesce((p_spec ->> 'multi')::boolean, false);
  v_config jsonb := coalesce(p_spec -> 'config', '{}'::jsonb);
  v_rules  jsonb := coalesce(p_spec -> 'rules', '[]'::jsonb);
  v_plain  text := coalesce(nullif(p_spec ->> 'plain', ''), 'text');
  v_alias  text := lower(btrim(coalesce(p_spec ->> 'type', '')));
  v_relation uuid := null;   -- SEAT-SUITES: the Table a caller's own relation column points at
  -- LIMITS-FIX 2026-09-21: the same one-word rule for the relation's target. Real-data crew E
  -- reported that no client door could declare a table-to-table relation; the door could, and
  -- has since 2026-09-19 — it only ever answered to `relation_target`, and a caller reaching
  -- for `target_table` got "A column that points at other records is a Person column or a File
  -- column", which describes a different mistake entirely.
  v_target text := coalesce(nullif(p_spec ->> 'relation_target', ''), nullif(p_spec ->> 'target_table', ''));
  v_deps   jsonb := case when jsonb_typeof(p_spec -> 'depends_on') = 'array'
                         then p_spec -> 'depends_on' else '[]'::jsonb end;
begin
  -- ── STORE-T: `type` IS THE WORD EVERY CALLER REACHES FOR, AND IT WAS THROWN AWAY. ──────
  -- Measured on 2026-09-20: `{"type":"number"}` produced a TEXT column and `{"type":"banana"}`
  -- was ACCEPTED, silently, as text. Only `parity_type` and `plain` were ever read, so every
  -- agent, script and other client that said "type" got a text column and was never told.
  -- Now it is read as what it plainly means, and a word that means nothing is refused BY NAME
  -- with the list — nothing is guessed and nothing is silently dropped.
  if v_alias <> '' and v_parity is null and nullif(p_spec ->> 'plain', '') is null then
    if exists (select 1 from custom.parity_field_types() t where t.parity_type = v_alias) then
      v_parity := v_alias;
    elsif v_alias in ('number', 'range', 'integer', 'decimal', 'float') then
      v_plain := 'number';
    elsif v_alias in ('long_text', 'longtext', 'long text', 'paragraph') then
      v_plain := 'long_text';
    elsif v_alias in ('text', 'string') then
      v_plain := 'text';
    elsif v_alias in ('boolean', 'bool', 'checkbox', 'check_box', 'tick', 'tickbox',
                      'yes_no', 'yesno', 'yes/no', 'toggle', 'switch') then
      -- LIMITS-FIX: every word a person, an agent or a spreadsheet reaches for when they
      -- mean a tick box lands on the one type that is one.
      v_parity := 'checkbox';
    elsif v_alias = 'list' then
      v_parity := 'select';
    elsif v_alias = 'relation' then
      -- ── SEAT-SUITES, 2026-09-19: A COLUMN POINTING AT ANOTHER OF YOUR OWN TABLES COULD
      -- NOT BE MADE AT ALL. ────────────────────────────────────────────────────────────
      -- `member` points at the kernel Person Table and `attachment` at the kernel File
      -- Table, and those were the ONLY two relations this door could build. A person with
      -- an Invoice Table and a Line Table could not give Invoice a Lines column through any
      -- door, although the store holds exactly that shape already: the parity-floor
      -- fixture's own `lines` field is a plain relation at a custom Table, and every guard,
      -- every edge, every rollup and `custom.record_relation_edges` handle it. Only the
      -- door refused, and it refused EVEN WHEN THE CALLER SAID WHICH TABLE.
      -- THE RULE: a caller that NAMES its target gets the relation it asked for; a caller
      -- that names nothing still gets the old sentence, because a relation with no target
      -- is the thing that sentence is actually about.
      if v_target is null then
        raise exception 'A column that points at other records is a Person column or a File column, and "%" does not say which.', v_alias
          using errcode = '23514',
                hint = 'FLD-11: say member for a person or attachment for a file, or name the Table this column points at in relation_target. Nothing was created.';
      end if;
      v_relation := v_target::uuid;
      -- ── RELATION-DECLARE, 2026-09-20: A COLUMN COULD POINT AT SOMETHING THAT IS NOT A
      -- TABLE, AND NOBODY WAS TOLD. ────────────────────────────────────────────────────────
      -- This arm took the caller's uuid and wrote it down unread. A uuid naming NOTHING at
      -- all was accepted; a uuid naming a RECORD instead of a Table was accepted. The column
      -- then points at a thing with no records to pick from and no title field to make a chip
      -- out of, and every reader downstream has to guess what that means. Measured from the
      -- seat `authenticated` on the main database, 2026-09-20. (A Table in ANOTHER
      -- organization was already refused by custom._field_shape_guard; that stands.)
      if not exists (select 1 from custom.record t
                      where t.id = v_relation
                        and t.deleted_at is null
                        and t.table_id = custom.table_kernel_id()
                        and (t.organization_id = p_organization_id or t.data_class = 'kernel')) then
        raise exception 'A column that points at other records has to point at a TABLE, and "%" is not one of this organization''s tables.', v_relation
          using errcode = '23503',
                hint = 'FLD-11 / REL-8: relation_target names the Table whose records this column may point at - open the Table you meant and use its id. Nothing was created.';
      end if;
    else
      raise exception 'There is no kind of column called "%".', p_spec ->> 'type'
        using errcode = '23514',
              hint = 'FLD-11: the fourteen are select, multi_select, member, attachment, lookup, rollup, formula, url, email, phone, currency, percent, datetime and checkbox, and the three plain ones are text, long_text and number. Nothing was created.';
    end if;
  end if;
  if v_label is null then
    raise exception 'A field needs a name - it is what a person reads on the column.'
      using errcode = '23514', hint = 'Give the field a name (a table spec''s own word) or a label - they mean the same thing here. Everything else this door can work out.';
  end if;
  if v_key is null then
    -- The panel derives the key from the label; a caller that did not is not
    -- refused for a machine token it never meant to think about.
    v_key := regexp_replace(lower(btrim(v_label)), '[^a-z0-9]+', '_', 'g');
    v_key := regexp_replace(v_key, '^_+|_+$', '', 'g');
    if v_key !~ '^[a-z]' then v_key := 'f_' || v_key; end if;
    v_key := left(v_key, 48);
  end if;
  if v_key !~ '^[a-z][a-z0-9_]*$' then
    raise exception 'A field''s key is made of lower-case letters, digits and underscores, and this one is "%".', v_key
      using errcode = '23514', hint = 'FLD-13: leave the key out and the store makes one from the name.';
  end if;

  -- THE FLOOR EVERY FIELD STANDS ON. Every key the guards demand is written,
  -- always, so no caller can omit one by accident.
  d := jsonb_build_object(
    'key',                  v_key,
    'label',                v_label,
    'multi',                v_multi,
    'dated',                coalesce((p_spec ->> 'dated')::boolean, false),
    'required',             coalesce((p_spec ->> 'required')::boolean, false),
    'sort',                 coalesce((p_spec ->> 'sort')::numeric, 100),
    'source',               coalesce(nullif(p_spec ->> 'source', ''), 'manual'),
    'source_config',        coalesce(p_spec -> 'source_config', '{}'::jsonb),
    'sensitivity',          coalesce(nullif(p_spec ->> 'sensitivity', ''), 'internal'),
    'context_policy',       coalesce(nullif(p_spec ->> 'context_policy', ''), 'include'),
    'applies_to_types',     coalesce(p_spec -> 'applies_to_types', '[]'::jsonb),
    -- STORE-T / T7: THE CALLER'S OWN DEPENDENCY LIST, KEPT. It used to be hard-coded to the
    -- empty list here, so NO client-made formula ever had dependencies, `custom.field_dependants`
    -- could never name one, and REC-18's refusal — "this field is used by …" — could not fire for
    -- anything a person or an agent built. That is the third half of T7.
    'depends_on',           v_deps,
    'entity_definition_id', p_table_id);

  -- SEAT-SUITES 2026-09-19: two properties `custom.field` has always projected and this door
  -- silently dropped, so a person could read them and never set them. They are carried only
  -- when the caller names them, so no existing field's document changes shape.
  if nullif(p_spec ->> 'review_interval_days', '') is not null then
    d := d || jsonb_build_object('review_interval_days', (p_spec ->> 'review_interval_days')::integer);
  end if;
  if p_spec ? 'default' then
    d := d || jsonb_build_object('default', p_spec -> 'default');
  end if;

  -- THE RELATION A CALLER NAMED ITSELF (see the `relation` arm above). It carries no parity
  -- type — `custom.parity_type` answers nothing for it, exactly as it answers nothing for
  -- plain text and plain numbers — and every relation property is the caller's to declare.
  if v_relation is not null then
    d := d || jsonb_build_object(
      'type',             'relation',
      'relation_target',  v_relation,
      'relation_max',     coalesce((p_spec ->> 'relation_max')::integer, case when v_multi then 25 else 1 end),
      'on_target_delete', case when nullif(p_spec ->> 'on_target_delete', '') in ('restrict','set_null','cascade')
                               then p_spec ->> 'on_target_delete' else 'set_null' end,
      'rules',            v_rules,
      'config',           v_config);
    if nullif(p_spec ->> 'inverse_key', '') is not null then
      d := d || jsonb_build_object('inverse_key', p_spec ->> 'inverse_key');
    end if;
    return d;
  end if;

  if v_parity is null then
    -- The three behaviours a person picks that are NOT one of the thirteen:
    -- plain text, a long text and a plain number. They carry no parity type,
    -- which is exactly what `custom.parity_type` answers for them.
    if v_plain = 'number' then
      d := d || jsonb_build_object('type', 'range', 'config', v_config, 'rules', v_rules);
      if nullif(p_spec ->> 'unit', '') is not null then
        d := d || jsonb_build_object('unit', p_spec ->> 'unit');
      end if;
    elsif v_plain = 'long_text' then
      d := d || jsonb_build_object('type', 'text', 'format', 'long',
                                   'config', v_config || jsonb_build_object('multiline', true),
                                   'rules', v_rules);
    else
      d := d || jsonb_build_object('type', 'text', 'config', v_config, 'rules', v_rules);
      -- ── SEAT-SUITES, 2026-09-19: A SIGNATURE FIELD COULD NOT BE DECLARED BY ANYBODY. ────
      -- `custom.doc_signature_field_ok` accepts exactly one shape — a text field whose
      -- `format` is `signature` — and `custom.doc_sign` refuses every other field by name.
      -- No door wrote that `format`: this branch dropped it, and the thirteen parity types
      -- have no signature among them. So `custom.doc_sign`, which IS granted to
      -- `authenticated`, could never be used by a signed-in person at all: the one field it
      -- accepts had no way to exist outside an INSERT straight into `custom.record`, which
      -- needs a table privilege nobody has. Measured from the seat on the main database on
      -- 2026-09-19 while converting `scripts/campaign-tests/w3_doc_c43.sql`.
      -- A plain text field may now SAY it holds a signature, and nothing else changes: a
      -- field that does not ask for it is written exactly as before.
      if nullif(p_spec ->> 'format', '') = 'signature' then
        d := d || jsonb_build_object('format', 'signature');
      end if;
    end if;
    return d;
  end if;

  if not exists (select 1 from custom.parity_field_types() t where t.parity_type = v_parity) then
    raise exception 'There is no field type called "%" in this system.', v_parity
      using errcode = '23514',
            hint = 'FLD-11: the fourteen are select, multi_select, member, attachment, lookup, rollup, formula, url, email, phone, currency, percent, datetime and checkbox.';
  end if;

  d := d || jsonb_build_object('parity_type', v_parity);

  case v_parity
    -- ── the two list types ───────────────────────────────────────────────────
    when 'select', 'multi_select' then
      d := d || jsonb_build_object(
        'type',   'list',
        'multi',  v_parity = 'multi_select',
        'rules',  v_rules,
        'config', v_config || jsonb_build_object(
                    'options_table_id', p_spec ->> 'options_table_id'));

    -- ── the two relation types a person names by what they hold ─────────────
    when 'member' then
      d := d || jsonb_build_object(
        'type',             'relation',
        'relation_target',  custom.person_kernel_id(),
        'relation_max',     coalesce((p_spec ->> 'relation_max')::integer, case when v_multi then 25 else 1 end),
        -- STORE-T / T7 (REL-2): what happens to this record when the thing it points at is
        -- deleted is the CALLER'S to declare — restrict, set_null or cascade. It was hard-coded
        -- to set_null, so no client could ever declare the `restrict` T7 asks for and every
        -- delete of a pointed-at record was accepted. set_null stays the default.
        'on_target_delete', case when nullif(p_spec ->> 'on_target_delete', '') in ('restrict','set_null','cascade')
                                 then p_spec ->> 'on_target_delete' else 'set_null' end,
        'rules',            v_rules,
        'config',           v_config);
    when 'attachment' then
      d := d || jsonb_build_object(
        'type',             'relation',
        'relation_target',  custom.file_kernel_id(),
        'relation_max',     coalesce((p_spec ->> 'relation_max')::integer, case when v_multi then 25 else 1 end),
        -- REC-31: removing the file removes the attachment, never the record — so `cascade` is
        -- the one answer this field may not give, and custom._field_type_parity_guard refuses it
        -- by name. restrict is a caller's to choose.
        'on_target_delete', case when nullif(p_spec ->> 'on_target_delete', '') in ('restrict','set_null','cascade')
                                 then p_spec ->> 'on_target_delete' else 'set_null' end,
        'rules',            v_rules,
        'config',           v_config);

    -- ── the three worked-out types ──────────────────────────────────────────
    when 'lookup' then
      d := d || jsonb_build_object(
        'type',       'formula',
        'source',     'formula',
        'compute_on', coalesce(nullif(p_spec ->> 'compute_on', ''), 'read'),
        'rules',      v_rules,
        'config',     v_config || jsonb_strip_nulls(jsonb_build_object(
                        'via',  nullif(p_spec ->> 'via', ''),
                        'pick', nullif(p_spec ->> 'pick', ''))));
    when 'rollup' then
      d := d || jsonb_build_object(
        'type',       'formula',
        'source',     'formula',
        -- FLD-11: a rollup that stamped itself at write time would be stale the
        -- moment a contained record changed, and the store refuses that — so the
        -- only answer this door can give is the right one.
        'compute_on', 'read',
        'rules',      v_rules,
        'config',     v_config || jsonb_strip_nulls(jsonb_build_object(
                        'via', nullif(p_spec ->> 'via', ''),
                        'agg', nullif(p_spec ->> 'agg', ''),
                        'of',  nullif(p_spec ->> 'of', ''))));
    when 'formula' then
      d := d || jsonb_build_object(
        'type',       'formula',
        'source',     'formula',
        'compute_on', coalesce(nullif(p_spec ->> 'compute_on', ''), 'read'),
        'rules',      v_rules,
        'config',     v_config || jsonb_build_object('expr', coalesce(p_spec -> 'expr', v_config -> 'expr')));

    -- ── the three formatted texts. The format says how to SHOW it; the
    --    pattern Rule is what makes it enforceable (FLD-3 / FLD-11), so the
    --    door writes the Rule rather than leaving a label on an empty box.
    when 'url' then
      d := d || jsonb_build_object('type', 'text', 'format', 'url', 'config', v_config,
        'rules', case when exists (select 1 from jsonb_array_elements(v_rules) r where r ->> 'kind' = 'pattern')
                      then v_rules
                      else v_rules || jsonb_build_array(jsonb_build_object(
                             'kind', 'pattern', 'value', '^https?://[^\s]+$')) end);
    when 'email' then
      d := d || jsonb_build_object('type', 'text', 'format', 'email', 'config', v_config,
        'rules', case when exists (select 1 from jsonb_array_elements(v_rules) r where r ->> 'kind' = 'pattern')
                      then v_rules
                      else v_rules || jsonb_build_array(jsonb_build_object(
                             'kind', 'pattern', 'value', '^[^@\s]+@[^@\s]+\.[^@\s]+$')) end);
    when 'phone' then
      d := d || jsonb_build_object('type', 'text', 'format', 'phone', 'config', v_config,
        'rules', case when exists (select 1 from jsonb_array_elements(v_rules) r where r ->> 'kind' = 'pattern')
                      then v_rules
                      else v_rules || jsonb_build_array(jsonb_build_object(
                             'kind', 'pattern', 'value', '^[+0-9][0-9 ()\-\.]{4,}$')) end);

    -- ── the three numbers and dates ─────────────────────────────────────────
    when 'currency' then
      d := d || jsonb_build_object(
        'type', 'range', 'format', 'currency',
        'unit', coalesce(nullif(p_spec ->> 'unit', ''), '$'),
        'config', v_config, 'rules', v_rules);
    when 'percent' then
      d := d || jsonb_build_object(
        'type', 'range', 'format', 'percent', 'unit', '%', 'config', v_config,
        -- FLD-3 / FLD-11: a percent field that takes -40 is a percent in name only.
        'rules', case when exists (select 1 from jsonb_array_elements(v_rules) r
                                    where r ->> 'kind' in ('min', 'max'))
                      then v_rules
                      else v_rules || jsonb_build_array(
                             jsonb_build_object('kind', 'min', 'value', 0),
                             jsonb_build_object('kind', 'max', 'value', 100)) end);
    -- ── the tick box ────────────────────────────────────────────────────────
    -- No format, no unit, no options Table and no Rule: what it holds IS the
    -- behaviour. A default is carried when the caller named one (above), which is
    -- how a column can start life ticked.
    when 'checkbox' then
      d := d || jsonb_build_object('type', 'boolean', 'config', v_config, 'rules', v_rules);

    when 'datetime' then
      d := d || jsonb_build_object(
        'type', 'range', 'rules', v_rules,
        'config', v_config || jsonb_build_object(
                    'kind', case when coalesce(p_spec ->> 'kind', v_config ->> 'kind') = 'datetime'
                                 then 'datetime' else 'date' end));
      if coalesce(p_spec ->> 'kind', v_config ->> 'kind') = 'datetime' then
        d := d || jsonb_build_object('format', 'datetime');
      end if;
    else
      raise exception 'The field type "%" is known but this store does not yet know what it is made of.', v_parity
        using errcode = '23514',
              hint = 'custom._field_document_for has an arm per parity type; this one is missing. Nothing was written.';
  end case;

  return d;
end
$function$;


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
            hint = 'FLD-11: select parity_type from custom.parity_field_types() - select, multi_select, member, attachment, lookup, rollup, formula, url, email, phone, currency, percent, datetime, checkbox.';
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


CREATE OR REPLACE FUNCTION custom.io_infer_type(p_samples jsonb)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  -- Deliberately conservative, and it answers `text` when it is not sure. A proposal that
  -- guesses "number" off three rows and is wrong makes a person fix data later; a proposal
  -- that says "text" makes them change a dropdown now.
  with s as (select value #>> '{}' as v from jsonb_array_elements(coalesce(p_samples, '[]'::jsonb))
              where value #>> '{}' is not null and btrim(value #>> '{}') <> '')
  select case
           when not exists (select 1 from s) then 'text'
           -- LIMITS-FIX: THE TICK IS ASKED FIRST, and it has to be. A column holding only
           -- 1 and 0 is a yes/no far more often than it is a quantity, and the number arms
           -- below claimed every one of them before this arm was ever reached.
           when not exists (select 1 from s where lower(btrim(v)) not in
                             ('true','false','t','f','yes','no','y','n','1','0','on','off','x','✓','✔')) then 'checkbox'
           when not exists (select 1 from s where v !~ '^[+-]?[0-9]+$') then 'number'
           when not exists (select 1 from s where v !~ '^[+-]?[0-9]*[.][0-9]+$' and v !~ '^[+-]?[0-9]+$') then 'number'
           when not exists (select 1 from s where v !~ '^\d{4}-\d{2}-\d{2}$') then 'date'
           when not exists (select 1 from s where v !~ '^[^@\s]+@[^@\s]+[.][^@\s]+$') then 'email'
           else 'text'
         end;
$function$;


CREATE OR REPLACE FUNCTION custom.io_infer_column(p_organization_id uuid, p_table_id uuid, p_header text, p_samples jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_head    text := btrim(coalesce(p_header, ''));
  v_norm    text;
  v_field   record;
  v_words   text[];
  v_n       integer;
  v_distinct text[];
  v_d       integer;
  v_unit    text;
  v_target  uuid;
  v_avg     numeric;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.io_infer_column');
  -- A TABLE THAT DOES NOT EXIST YET IS A REAL QUESTION, AND IT IS THE FIRST ONE ANYBODY
  -- ASKS. "Pull my spreadsheet in" has no table to match against — the table is what the
  -- file is FOR. `p_table_id` null means exactly that: judge every column on its own
  -- values. Every arm below already works that way; only the first one needs a table, and
  -- it is skipped rather than reproduced somewhere else.
  if p_table_id is not null then
    perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.io_infer_column');
  end if;
  if v_head = '' then
    raise exception 'A column with no heading cannot be matched to anything.'
      using errcode = '22004',
            hint = 'Give the column a heading in the file, or map it by hand.';
  end if;

  v_norm := btrim(regexp_replace(lower(v_head), '[^a-z0-9]+', '_', 'g'), '_');

  -- ── 1. A COLUMN THIS TABLE ALREADY HAS. Asked first, always: a file whose header says
  --       what the Table already calls something is not a new column, however its values
  --       happen to look.
  if p_table_id is not null then
  select f.id,
         f.data ->> 'key'   as key,
         f.data ->> 'label' as label,
         coalesce(custom.parity_type(f.data), f.data ->> 'type') as parity
    into v_field
    from custom.applicable_fields(p_organization_id, p_table_id, null) f
   where lower(coalesce(f.data ->> 'key', ''))   = lower(v_head)
      or lower(coalesce(f.data ->> 'label', '')) = lower(v_head)
      or coalesce(f.data ->> 'key', '')          = v_norm
   order by case when lower(coalesce(f.data ->> 'key', '')) = lower(v_head) then 0
                 when lower(coalesce(f.data ->> 'label', '')) = lower(v_head) then 1
                 else 2 end
   limit 1;
  if found then
    return jsonb_build_object(
      'header',   v_head,
      'field_id', v_field.id,
      'field_key',v_field.key,
      'label',    v_field.label,
      'type',     v_field.parity,
      'matched',  true,
      'why',      format('This table already has a column called "%s".', coalesce(v_field.label, v_field.key)));
  end if;
  end if;

  select array_agg(word) into v_words from custom.io_sample_words(p_samples);
  v_words := coalesce(v_words, array[]::text[]);
  v_n := cardinality(v_words);

  if v_n = 0 then
    return jsonb_build_object('header', v_head, 'field_id', null, 'field_key', v_norm,
                              'label', v_head, 'type', 'text', 'matched', false,
                              'why', 'Every row in this column is empty, so there is nothing to go on. Text holds anything.');
  end if;

  -- ── 1b. A TICK. LIMITS-FIX 2026-09-21: asked before everything else that could claim
  --        it. A column of Yes/No words was proposed as a two-choice DROPDOWN by arm 8, and
  --        a column of 1s and 0s as a NUMBER by arm 9 — so the single most ordinary column
  --        a person imports ("Paid?", "Insured?", "Photographed?") could be proposed as
  --        anything except what it is.
  if not exists (select 1 from unnest(v_words) w
                  where lower(btrim(w)) not in
                    ('true','false','t','f','yes','no','y','n','1','0','on','off','x','✓','✔')) then
    return jsonb_build_object('header', v_head, 'field_id', null, 'field_key', v_norm,
                              'label', v_head, 'type', 'checkbox', 'matched', false,
                              'why', 'Every value in this column is a yes or a no, so it is a tick box.');
  end if;

  -- ── 2. AN EMAIL — AND THE STORE KNOWS WHETHER IT IS ONE OF YOURS.
  if not exists (select 1 from unnest(v_words) w where w !~ '^[^@\s]+@[^@\s]+[.][^@\s]+$') then
    if not exists (
      select 1 from unnest(v_words) w
       where not exists (select 1 from iam.organization_member m
                           join auth.users u on u.id = m.user_id
                          where m.organization_id = p_organization_id
                            and lower(u.email::text) = lower(w)))
    then
      return jsonb_build_object('header', v_head, 'field_id', null, 'field_key', v_norm,
                                'label', v_head, 'type', 'member', 'matched', false,
                                'why', 'Every address in this column belongs to somebody in this organization, so it is a person.');
    end if;
    return jsonb_build_object('header', v_head, 'field_id', null, 'field_key', v_norm,
                              'label', v_head, 'type', 'email', 'matched', false,
                              'why', 'Every value is an email address.');
  end if;

  -- ── 3. MONEY. The unit is the currency and it is read off the values themselves.
  if not exists (select 1 from unnest(v_words) w
                  where w !~ '^[-(]?\s*[$€£¥]\s*[0-9][0-9, ]*([.][0-9]{1,2})?\s*[)]?$'
                    and upper(w) !~ '^[-]?[0-9][0-9, ]*([.][0-9]{1,2})?\s*(USD|EUR|GBP|CAD|AUD)$') then
    select custom.io_money_unit(w) into v_unit from unnest(v_words) w
     where custom.io_money_unit(w) is not null limit 1;
    return jsonb_build_object('header', v_head, 'field_id', null, 'field_key', v_norm,
                              'label', v_head, 'type', 'currency', 'unit', coalesce(v_unit, 'USD'),
                              'matched', false,
                              'why', format('Every value is an amount of money in %s.', coalesce(v_unit, 'USD')));
  end if;

  -- ── 4. A PERCENTAGE.
  if not exists (select 1 from unnest(v_words) w where w !~ '^-?[0-9]+([.][0-9]+)?\s*%$') then
    return jsonb_build_object('header', v_head, 'field_id', null, 'field_key', v_norm,
                              'label', v_head, 'type', 'percent', 'matched', false,
                              'why', 'Every value is a percentage.');
  end if;

  -- ── 5. A DATE. ISO first because it is unambiguous; the slashed forms are accepted and
  --       the ambiguity between day-first and month-first is said out loud rather than
  --       silently resolved, because getting it wrong is invisible until March.
  if not exists (select 1 from unnest(v_words) w
                  where w !~ '^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?([.]\d+)?(Z|[+-]\d{2}:?\d{2})?)?$') then
    return jsonb_build_object('header', v_head, 'field_id', null, 'field_key', v_norm,
                              'label', v_head, 'type', 'datetime', 'matched', false,
                              'why', 'Every value is a date written year-month-day.');
  end if;
  if not exists (select 1 from unnest(v_words) w where w !~ '^\d{1,2}/\d{1,2}/\d{2,4}$') then
    return jsonb_build_object('header', v_head, 'field_id', null, 'field_key', v_norm,
                              'label', v_head, 'type', 'datetime', 'matched', false,
                              'ambiguous', true,
                              'why', 'Every value is a date with slashes. Which number is the day cannot be read off the file — check a row you know before you run this.');
  end if;

  -- ── 6. A LINK.
  if not exists (select 1 from unnest(v_words) w where w !~ '^https?://[^\s]+$') then
    return jsonb_build_object('header', v_head, 'field_id', null, 'field_key', v_norm,
                              'label', v_head, 'type', 'url', 'matched', false,
                              'why', 'Every value is a web address.');
  end if;

  -- ── 7. A PHONE NUMBER. Deliberately narrow: enough punctuation and enough digits.
  if not exists (select 1 from unnest(v_words) w
                  where w !~ '^[+]?[0-9][0-9 ()./-]{6,19}$'
                     or length(regexp_replace(w, '[^0-9]', '', 'g')) not between 7 and 15) then
    return jsonb_build_object('header', v_head, 'field_id', null, 'field_key', v_norm,
                              'label', v_head, 'type', 'phone', 'matched', false,
                              'why', 'Every value is a phone number.');
  end if;

  -- ── 8. A CHOICE. A column of a few repeating words is a dropdown, and this is the arm
  --       that turns a spreadsheet into something a dashboard can group by. It is asked
  --       BEFORE the plain-number arm on purpose only for non-numeric words: a column of
  --       twelve repeating numbers is a number, not a dropdown of numbers.
  select array_agg(distinct w order by w) into v_distinct from unnest(v_words) w;
  v_d := cardinality(v_distinct);
  if v_n >= 5 and v_d between 2 and 12 and v_d::numeric <= v_n::numeric * 0.4
     and exists (select 1 from unnest(v_words) w where w !~ '^[+-]?[0-9]+([.][0-9]+)?$')
     and not exists (select 1 from unnest(v_words) w where length(w) > 60) then
    return jsonb_build_object('header', v_head, 'field_id', null, 'field_key', v_norm,
                              'label', v_head, 'type', 'select',
                              'options', to_jsonb(v_distinct), 'matched', false,
                              'why', format('This column holds only %s different words over %s rows, so it is a list of choices.', v_d, v_n));
  end if;

  -- ── 9. A PLAIN NUMBER.
  if not exists (select 1 from unnest(v_words) w where w !~ '^[+-]?[0-9]{1,15}([.][0-9]+)?$') then
    return jsonb_build_object('header', v_head, 'field_id', null, 'field_key', v_norm,
                              'label', v_head, 'type', 'number', 'matched', false,
                              'why', 'Every value is a number.');
  end if;

  -- ── 10. A POINTER AT ANOTHER OF YOUR TABLES.
  v_target := custom.io_relation_candidate(p_organization_id, p_table_id,
                (select array_agg(distinct w) from unnest(v_words[1:12]) w));
  if v_target is not null then
    return jsonb_build_object('header', v_head, 'field_id', null, 'field_key', v_norm,
                              'label', v_head, 'type', 'relation',
                              'relation_target', v_target, 'matched', false,
                              'why', format('Every value in this column is the name of a record in "%s", so this column points at it.',
                                            coalesce((select r.data ->> 'name' from custom.record r
                                                       where r.organization_id = p_organization_id and r.id = v_target),
                                                     'another table')));
  end if;

  -- ── 11. WORDS. Long ones get the long editor, because a paragraph in a one-line box is
  --        the small, constant annoyance nobody files a bug about.
  select avg(length(w)) into v_avg from unnest(v_words) w;
  return jsonb_build_object('header', v_head, 'field_id', null, 'field_key', v_norm,
                            'label', v_head,
                            'type', case when coalesce(v_avg, 0) > 120 then 'long_text' else 'text' end,
                            'matched', false,
                            'why', case when coalesce(v_avg, 0) > 120
                                        then 'These values are long, so this is a paragraph of text.'
                                        else 'Nothing about these values says they are anything more particular than text.' end);
end;
$function$;


CREATE OR REPLACE FUNCTION custom.io_proposal_accept(p_organization_id uuid, p_import_id uuid, p_column text, p_type text DEFAULT NULL::text, p_label text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_run      custom.io_import;
  v_proposal jsonb;
  v_type     text;
  v_word     text;
  v_format   text;
  v_key      text;
  v_field_id uuid;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.io_proposal_accept');
  perform custom.assert_store_door(p_organization_id, 'custom.io_proposal_accept');
  select * into v_run from custom.io_import
   where organization_id = p_organization_id and id = p_import_id and deleted_at is null;
  if not found then
    raise exception 'custom.io_proposal_accept: no import run % for this organization', p_import_id
      using errcode = '23503';
  end if;

  select p into v_proposal
    from jsonb_array_elements(v_run.proposals) p
   where p ->> 'column' = p_column
   limit 1;
  if v_proposal is null then
    raise exception 'custom.io_proposal_accept: import run % proposed no column "%". Its proposals are %.',
      p_import_id, p_column, coalesce((select string_agg(p ->> 'column', ', ')
                                         from jsonb_array_elements(v_run.proposals) p), '(none)')
      using errcode = '23503';
  end if;
  if v_proposal ->> 'state' = 'accepted' then
    raise exception 'custom.io_proposal_accept: "%" was already accepted on this run. Accepting twice would mint a second Field with the same key.', p_column
      using errcode = '23505';
  end if;

  -- THE PROPOSAL SPEAKS HUMAN; THE FIELD SPEAKS BEHAVIOUR. What a person sees offered is
  -- "this looks like a number" — but `custom._field_shape_guard` holds a Field's `type` to
  -- exactly five BEHAVIOURS (list, range, text, relation, formula), because "number",
  -- "currency" and "percent" are one behaviour wearing three units. So the human word is
  -- translated here, once, and the flavour is kept where the store keeps flavour: `format`.
  v_word := coalesce(nullif(btrim(coalesce(p_type, '')), ''), v_proposal ->> 'inferred_type', 'text');
  if v_word in ('list', 'range', 'text', 'relation', 'formula') then
    v_type := v_word;                    -- the caller named a behaviour outright
    v_format := null;
  elsif v_word = 'number' then
    v_type := 'range'; v_format := null;
  elsif v_word = 'date' then
    v_type := 'range'; v_format := 'date';
  elsif v_word = 'email' then
    v_type := 'text';  v_format := 'email';
  elsif v_word = 'url' then
    v_type := 'text';  v_format := 'url';
  elsif v_word = 'phone' then
    v_type := 'text';  v_format := 'phone';
  elsif v_word in ('checkbox', 'boolean', 'bool', 'yes_no', 'toggle') then
    -- LIMITS-FIX 2026-09-21: a tick box is now a BEHAVIOUR of its own and needs no options
    -- Table, so the conservative answer and the right answer are finally the same one. This
    -- arm used to fall through to TEXT with the note below; the note is kept in the file's
    -- header so the reason it existed is not lost.
    v_type := 'boolean'; v_format := null;
  else
    -- Everything else: TEXT. Conservative here costs one dropdown a person fixes in a
    -- second; wrong here costs a data repair.
    v_type := 'text';  v_format := null;
  end if;
  -- The key is the column's own name, lowered and de-spaced, because that is what the next
  -- import of the same file will match on without anyone authoring a mapping.
  v_key := regexp_replace(lower(btrim(p_column)), '[^a-z0-9]+', '_', 'g');
  v_key := btrim(v_key, '_');
  if v_key = '' then
    raise exception 'custom.io_proposal_accept: column "%" leaves no usable Field key', p_column
      using errcode = '22023';
  end if;

  -- DOOR-14 IS "ADD THIS AS A FIELD", AND A TABLE OWNS ITS FIELD LIST.
  -- `custom._field_definition_write` refuses a Field whose Table does not declare its key —
  -- "the table does not declare a field called X, declare it there first" — and that rule is
  -- right: the Table document is what says which fields exist, and a Field record that
  -- appeared beside it without being declared would be a field only half the system knew
  -- about. So accepting a proposal declares it on the Table FIRST, through the record write
  -- door like any other change, and only then mints the Field.
  if not exists (select 1 from custom.record t, jsonb_array_elements(coalesce(t.data -> 'fields', '[]'::jsonb)) f
                  where t.organization_id = p_organization_id and t.id = v_run.table_id
                    and f ->> 'name' = v_key) then
    perform custom.record_update(
      p_organization_id, v_run.table_id,
      jsonb_build_object('fields',
        coalesce((select t.data -> 'fields' from custom.record t
                   where t.organization_id = p_organization_id and t.id = v_run.table_id),
                 '[]'::jsonb)
        || jsonb_build_array(jsonb_build_object('name', v_key))),
      null);
  end if;

  -- THE SAME DOOR A HAND-MADE FIELD GOES THROUGH. An accepted proposal is a Field, not a
  -- second kind of Field, so nothing downstream ever has to ask where a Field came from.
  v_field_id := custom.record_write(
    p_organization_id, custom.field_kernel_id(),
    -- A FIELD DOCUMENT IS NOT THREE KEYS. `custom._field_shape_guard` requires every Field to
    -- SAY the things a Field has to say — what it is a field OF, whether it holds one value or
    -- many, whether it is required, whether it is dated, its rules (even empty), where its
    -- values come from, and how sensitive they are. An accepted proposal must produce the same
    -- complete document a hand-made Field produces, or it is a second kind of Field after all.
    jsonb_build_object('entity_definition_id', v_run.table_id,
                       'key', v_key,
                       'label', coalesce(nullif(btrim(coalesce(p_label, '')), ''), btrim(p_column)),
                       'type', v_type,
                       'format', v_format,
                       'multi', false,
                       'required', false,
                       'dated', false,
                       'sort', 0,
                       'rules', '[]'::jsonb,
                       'config', '{}'::jsonb,
                       'depends_on', '[]'::jsonb,
                       'applies_to_types', '[]'::jsonb,
                       -- `manual`, because that is the closed vocabulary's word for "a person
                       -- fills this in". WHERE it came from is source_config, below.
                       'source', 'manual',
                       'source_config', jsonb_build_object('origin', 'import_proposal',
                                                           'import_id', p_import_id,
                                                           'source_column', p_column),
                       -- `internal` is the conservative default: a column nobody has classified
                       -- is the organization's business and not the world's.
                       'sensitivity', 'internal',
                       'context_policy', 'include',
                       '_actor', 'system'));

  update custom.io_import
     set proposals = (select jsonb_agg(case when p ->> 'column' = p_column
                                            then p || jsonb_build_object('state', 'accepted',
                                                                         'field_id', v_field_id)
                                            else p end)
                        from jsonb_array_elements(proposals) p),
         mapping   = mapping || jsonb_build_object(p_column, v_key)
   where organization_id = p_organization_id and id = p_import_id;

  return v_field_id;
end;
$function$;


CREATE OR REPLACE FUNCTION custom.agg_sql(p_organization_id uuid, p_table_id uuid, p_group_by jsonb DEFAULT '[]'::jsonb, p_measures jsonb DEFAULT '[]'::jsonb, p_bucket jsonb DEFAULT NULL::jsonb, p_filter jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 200, p_required text DEFAULT 'viewer'::text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_group_sel  text[] := '{}';
  v_group_lbl  text[] := '{}';
  v_meas_sel   text[] := '{}';
  v_where      text[] := '{}';
  v_key        text;
  v_op         text;
  v_by         text;
  m            jsonb;
  v_sql        text;
  v_i          integer := 0;
begin
  if p_organization_id is null or p_table_id is null then
    raise exception 'custom.record_aggregate: the organization and the Table are both required'
      using errcode = '22004';
  end if;

  -- ── the groups ──────────────────────────────────────────────────────────────
  for v_key in select (e #>> '{}') from jsonb_array_elements(coalesce(p_group_by, '[]'::jsonb)) e loop
    -- `array_append`, never `||`: `anyarray || anycompatible` and `anyarray || anyarray` are
    -- both candidates for `text[] || text`, and PostgreSQL resolves it to the SECOND, casting
    -- the string to text[] and raising `malformed array literal` on the first expression that
    -- contains a comma. Named here because the failure is at run time and reads like a bug in
    -- the caller's data.
    v_group_sel := array_append(v_group_sel, custom.agg_value_sql(v_key));
    v_group_lbl := array_append(v_group_lbl, quote_literal(custom.agg_assert_key(v_key)));
  end loop;

  -- ── the bucket, which is a group whose expression is a date_trunc ───────────
  if p_bucket is not null and jsonb_typeof(p_bucket) = 'object' then
    v_key := custom.agg_assert_key(p_bucket ->> 'key');
    v_by  := lower(coalesce(p_bucket ->> 'by', 'month'));
    if not (v_by = any (custom.agg_buckets())) then
      raise exception 'custom.record_aggregate: "%" is not a bucket', v_by
        using errcode = '22023',
              hint = format('Legal buckets: %s.', array_to_string(custom.agg_buckets(), ', '));
    end if;
    -- `created_at` is a real column; anything else is a Field read out of the document. Both
    -- are cast to timestamptz, and a value that is not a date makes the ROW absent from the
    -- bucket rather than making the whole answer fail.
    if v_key = 'created_at' then
      v_group_sel := array_append(v_group_sel, format('date_trunc(%L, r.created_at)::text', v_by));
    else
      v_group_sel := array_append(v_group_sel,
        format('date_trunc(%L, (nullif(%s, '''')::timestamptz))::text', v_by, custom.agg_value_sql(v_key)));
    end if;
    v_group_lbl := array_append(v_group_lbl, quote_literal(v_key || '_' || v_by));
  end if;

  -- ── the measures ────────────────────────────────────────────────────────────
  for m in select e from jsonb_array_elements(coalesce(p_measures, '[]'::jsonb)) e loop
    v_op := lower(coalesce(m ->> 'op', 'count'));
    if not (v_op = any (custom.agg_operations())) then
      raise exception 'custom.record_aggregate: "%" is not a measure', v_op
        using errcode = '22023',
              hint = format('Legal measures: %s.', array_to_string(custom.agg_operations(), ', '));
    end if;
    if v_op = 'count' then
      v_meas_sel := array_append(v_meas_sel, quote_literal('count') || ', count(*)::numeric');
    else
      v_key := custom.agg_assert_key(m ->> 'key');
      v_meas_sel := array_append(v_meas_sel,
        quote_literal(v_op || '_' || v_key) || ', ' ||
        format('%s(nullif(%s, '''')::numeric)::numeric', v_op, custom.agg_value_sql(v_key)));
    end if;
  end loop;
  if cardinality(v_meas_sel) = 0 then
    v_meas_sel := array[quote_literal('count') || ', count(*)::numeric'];
  end if;

  -- ── the filter, in the same WHERE as Visibility ─────────────────────────────
  --
  -- A SCALAR IS AN EQUALITY, exactly as it always was. AN OBJECT IS A WINDOW — the one new
  -- shape this file adds, so that the eighth verb can answer "this month" without either
  -- reading every month ever or letting a browser do the filtering (DOOR-10).
  if p_filter is not null and jsonb_typeof(p_filter) = 'object' then
    for v_key in select k from jsonb_object_keys(p_filter) k loop
      if jsonb_typeof(p_filter -> v_key) = 'object' then
        v_where := array_append(v_where, custom.dashboard_window_sql(v_key, p_filter -> v_key));
      elsif jsonb_typeof(p_filter -> v_key) = 'null' then
        -- LIMITS-FIX 2026-09-21 — THE THIRD STATE. A tick box has three answers: yes, no,
        -- and nobody has said yet. Asking for `null` used to reach the arm below, compare
        -- the missing value against the empty string and answer NO ROWS — so the one
        -- question a person actually asks of a checklist ("which of these has nobody
        -- answered?") could not be asked at all. It now means UNSET. Grouping already
        -- separates the three, because `r.data ->> key` is 'true', 'false' or SQL NULL.
        v_where := array_append(v_where, format('(%s) is null', custom.agg_value_sql(v_key)));
      else
        v_where := array_append(v_where,
          format('%s = %L', custom.agg_value_sql(v_key), p_filter ->> v_key));
      end if;
    end loop;
  end if;

  -- ══════════════════════════════════════════════════════════════════════════
  -- ONE STATEMENT, and Visibility is a PREDICATE in its own WHERE rather than a list of
  -- ids joined back — which is what AGT-N-8's "inside the read door's own query" and
  -- DOOR-10's "never post-filtered" actually ask for, and what lets the planner prune the
  -- partition and drive the index instead of probing the primary key once per visible id.
  -- The aggregate is still computed over exactly the rows this principal may see, and the
  -- rows they may not see are still never fetched at all (READ-PERF).
  -- ══════════════════════════════════════════════════════════════════════════
  v_sql := format($q$
    select %s as groups,
           jsonb_build_object(%s) as measures,
           count(*)::bigint as row_count
      from custom.record r
     where r.organization_id = %L::uuid
       and r.table_id = %L::uuid
       and r.deleted_at is null
       and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
       and %s
     %s
     %s
     order by count(*) desc
     limit %s
  $q$,
    case when cardinality(v_group_sel) = 0 then '''{}''::jsonb'
         else 'jsonb_build_object(' ||
              (select string_agg(v_group_lbl[i] || ', ' || v_group_sel[i], ', ')
                 from generate_subscripts(v_group_sel, 1) i) || ')' end,
    array_to_string(v_meas_sel, ', '),
    p_organization_id, p_table_id,
    custom.visible_predicate_sql(custom.query_principal(), p_organization_id, p_table_id,
                                 p_required::public.permission_level, 'r'),
    case when cardinality(v_where) = 0 then '' else 'and ' || array_to_string(v_where, ' and ') end,
    case when cardinality(v_group_sel) = 0 then ''
         else 'group by ' || (select string_agg(i::text, ', ')
                                from generate_subscripts(v_group_sel, 1) i) end,
    custom.page_size(p_organization_id, 'custom.record_aggregate', p_limit, 200));

  return v_sql;
end;
$function$;


CREATE OR REPLACE FUNCTION custom.agg_view_admits_state(p_definition jsonb, p_state jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_doc jsonb;
  v_key text;
begin
  if p_state is null then return false; end if;

  -- ONE PREDICATE, EITHER SHAPE. custom.record_as_of replays the whole ROW and puts
  -- the document under `data`; custom.record.data IS the document. Recognising the
  -- envelope here means no caller can pass the wrong one, which is exactly what
  -- happened the first time this ran against real history.
  if jsonb_typeof(p_state -> 'data') = 'object' and p_state ? 'id' and p_state ? 'data_class' then
    if coalesce(p_state ->> 'deleted_at', '') <> '' then
      return false;                  -- in the bin at that moment is not in the view at that moment
    end if;
    v_doc := p_state -> 'data';
  else
    v_doc := p_state;
  end if;

  for v_key in select k from jsonb_object_keys(coalesce(p_definition -> 'filters', '{}'::jsonb)) k loop
    -- LIMITS-FIX 2026-09-21 — THE THIRD STATE, in a saved view as in an aggregate. A view
    -- whose filter says `null` means "the ones nobody has answered", and it used to compare
    -- the absent value against the empty string and admit nothing at all.
    if jsonb_typeof(p_definition -> 'filters' -> v_key) = 'null' then
      if v_doc ? v_key and jsonb_typeof(v_doc -> v_key) <> 'null'
         and not (jsonb_typeof(v_doc -> v_key) = 'object' and (v_doc -> v_key) ? 'value'
                  and jsonb_typeof(v_doc -> v_key -> 'value') = 'null') then
        return false;
      end if;
      continue;
    end if;
    if coalesce(case when jsonb_typeof(v_doc -> v_key) = 'object' and (v_doc -> v_key) ? 'value'
                     then v_doc -> v_key ->> 'value' else v_doc ->> v_key end, '')
       is distinct from (p_definition -> 'filters' ->> v_key) then
      return false;
    end if;
  end loop;
  return true;
end;
$function$;


CREATE OR REPLACE FUNCTION custom.doc_format_value(p_field_data jsonb, p_value jsonb)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_fmt  text := nullif(p_field_data ->> 'format', '');
  v_unit text := nullif(p_field_data ->> 'unit', '');
  v_kind text := p_field_data -> 'config' ->> 'kind';
  v_n    numeric;
  v_t    text;
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    return '';
  end if;

  -- A multi-valued Field renders as its values, in order, comma separated — the modifier
  -- (FLD-2), never a second behaviour.
  if jsonb_typeof(p_value) = 'array' then
    return (select string_agg(custom.doc_format_value(p_field_data, e), ', ')
              from jsonb_array_elements(p_value) e);
  end if;

  -- LIMITS-FIX: a tick on a printed certificate reads as a word. `true` on a document a
  -- customer signs is machine identity where a person is looking.
  if jsonb_typeof(p_value) = 'boolean' then
    return case when p_value = to_jsonb(true) then 'Yes' else 'No' end;
  end if;

  v_t := case when jsonb_typeof(p_value) = 'string' then p_value #>> '{}' else p_value::text end;

  if v_fmt = 'currency' then
    begin v_n := v_t::numeric; exception when others then return v_t; end;
    -- The UNIT is the currency (FLD-N-1's own worked example) and it is printed, because a
    -- proposal that says 1,200.00 without saying of what is exactly the merge that lies.
    return btrim(coalesce(v_unit || ' ', '') || to_char(v_n, 'FM999,999,999,990.00'));
  end if;

  if v_fmt = 'percent' then
    begin v_n := v_t::numeric; exception when others then return v_t; end;
    -- FIXED (found by this lane's own w3_doc_c43.sql part D): `####` is not a fraction
    -- specifier in `to_char`, so 12.5 printed as 13. `FM999,999,999,990.999999` prints up to
    -- six real decimal places and `rtrim` peels back trailing zeros and a bare trailing dot,
    -- so 12.5 stays 12.5, 8 stays 8, and 12.567 stays 12.567.
    return rtrim(rtrim(to_char(v_n, 'FM999,999,999,990.999999'), '0'), '.') || coalesce(v_unit, '%');
  end if;

  if v_fmt in ('date', 'datetime') or v_kind in ('date', 'datetime') then
    begin
      -- FIXED (found by the same test): `Month` blank-pads to nine characters and only the
      -- `FM` fill-mode PREFIXED ONTO `Month` itself (`FMMonth`) suppresses the padding — the
      -- leading `FM` on `FMDD` only affects the day. Without it, "3 November 2026" printed
      -- with two spaces before the year became "3 November  2026".
      return case when coalesce(v_fmt, v_kind) = 'date'
                  then to_char(v_t::timestamptz, 'FMDD FMMonth YYYY')
                  else to_char(v_t::timestamptz, 'FMDD FMMonth YYYY "at" HH24:MI') end;
    exception when others then return v_t;
    end;
  end if;

  -- url · email · phone · signature and every other declared format print the value the
  -- record holds. A format this function does not know is never a reason to print nothing.
  if v_unit is not null then
    return v_t || ' ' || v_unit;
  end if;
  return v_t;
end;
$function$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- THE PROOF, IN THIS TRANSACTION. A store that shipped the vocabulary and refused the
-- column would be worse than one that shipped neither.
-- ════════════════════════════════════════════════════════════════════════════════════
do $check$
begin
  if not exists (select 1 from custom.parity_field_types() t where t.parity_type = 'checkbox') then
    raise exception 'limitsfix: custom.parity_field_types() still does not ship checkbox';
  end if;
  if custom.parity_type('{"type":"boolean"}'::jsonb) is distinct from 'checkbox' then
    raise exception 'limitsfix: custom.parity_type does not derive checkbox from a boolean behaviour';
  end if;
  if custom.field_behaviour('{"type":"boolean"}'::jsonb)
     is not distinct from custom.field_behaviour('{"type":"text"}'::jsonb) then
    raise exception 'limitsfix: a tick box and a text column read as the same behaviour';
  end if;
  if custom.field_value_convert('{"type":"boolean"}'::jsonb, '"Yes"'::jsonb) is distinct from 'true'::jsonb
     or custom.field_value_convert('{"type":"boolean"}'::jsonb, '"0"'::jsonb) is distinct from 'false'::jsonb
     or custom.field_value_convert('{"type":"boolean"}'::jsonb, '"maybe"'::jsonb) is not null then
    raise exception 'limitsfix: converting words into a tick does not read yes/no/1/0 and refuse the rest';
  end if;
  if custom.io_infer_type('["Yes","No","Yes"]'::jsonb) is distinct from 'checkbox'
     or custom.io_infer_type('["1","0","1"]'::jsonb) is distinct from 'checkbox'
     or custom.io_infer_type('["✓","✓"]'::jsonb) is distinct from 'checkbox'
     or custom.io_infer_type('["3","4","19"]'::jsonb) is distinct from 'number' then
    raise exception 'limitsfix: the import mapper does not infer a tick box from yes/no, 1/0 and a check mark';
  end if;
  if custom.doc_format_value('{"type":"boolean"}'::jsonb, 'true'::jsonb) <> 'Yes'
     or custom.doc_format_value('{"type":"boolean"}'::jsonb, 'false'::jsonb) <> 'No' then
    raise exception 'limitsfix: a tick prints as true/false on a document';
  end if;
  -- THE THIRD STATE, as a saved view asks it.
  if not custom.agg_view_admits_state('{"filters":{"insured":null}}'::jsonb, '{"name":"x"}'::jsonb)
     or custom.agg_view_admits_state('{"filters":{"insured":null}}'::jsonb, '{"insured":false}'::jsonb)
     or custom.agg_view_admits_state('{"filters":{"insured":null}}'::jsonb, '{"insured":true}'::jsonb) then
    raise exception 'limitsfix: a saved view filtering on null does not mean UNSET';
  end if;
  raise notice 'limitsfix: checkbox is a first-class parity type — % types ship now.',
    (select count(*) from custom.parity_field_types());
end
$check$;

