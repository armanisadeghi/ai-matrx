-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- W1-FIELD — the one definitions surface for custom fields, the `Merge Field` kernel Table,
-- and the validation trigger that enforces the definitions on write.
--
-- THE RULING THIS FILE EXECUTES (build log, 2026-09-17, rules 23/25/28 by the same reading
-- `W1-TABLE` recorded at 12:06 UTC)
-- ----------------------------------------------------------------------------------------
-- FLD-8 / FLD-13: `custom.field` and `custom.merge_field` are PROJECTIONS over
-- `custom.record`, not provisioned relations. REC-25 is law and is already BUILT: a Table
-- is a Record here (`W1-STORE`'s eight kernel rows, `W1-TABLE`'s `custom."table"` view over
-- them), and a Field is the same kind of thing one level down — a Record of the kernel Table
-- `Field` (`11111111-0000-4000-8000-000000000002`, written by `W1-STORE` and read back live
-- before this file was written). A second physical `custom.field` would make every Field
-- exist twice with nothing keeping the two equal, and `W1-TABLE`'s ruling forbids exactly
-- that. FLD-13's "base contract" is therefore satisfied literally: the base-contract columns
-- the view returns are `custom.record`'s own, certified by
-- `iam.canonical_certify_ok('custom','record','record')` under REC-56, and every
-- field-definition property is lifted out of `data`.
--
-- THIS LANE CREATES NO RELATION, adds no column to `custom.record` and touches no index.
-- Everything below is a view, a trigger, a function, one knob row, or a row IN the store.
--
-- WHERE THE EXIT'S TWO PRODUCTION QUERIES LAND, said plainly so nobody has to guess:
--   `select id, entity_definition_id, name, type from custom.field where name in (…)`
--     reads this file's seven seeded Field records off `custom.field`;
--   `select tgname from pg_trigger where tgrelid = 'custom.field'::regclass`
--     returns `custom_field_definition_validation`, the INSTEAD OF trigger on the view.
--   A view carries real `pg_trigger` rows, so the clause is answered literally. The trigger
--   that enforces the definitions on a RECORD write is a second one,
--   `custom_record_field_validation` on `custom.record`, and BOTH are named in the report —
--   an INSTEAD OF trigger on a view only fires for writes THROUGH the view, so it can never
--   be the whole of REC-51 and is not offered as such.
--
-- WHAT EACH LAW BECOMES, IN CONTRACT ORDER
-- ----------------------------------------
--   FLD-1    a Field has exactly ONE behavior from the closed set `list`, `range`, `text`,
--            `relation`, `formula` — `custom._field_shape_guard`. An array is refused by
--            name, so "exactly one" is unrepresentable rather than merely unwritten.
--   FLD-2    modifiers are SEPARATE from behavior: `multi`, `dated`, and any number of
--            attached validation Rules in `rules` — three distinct stored keys, none of
--            which may be spelled as a behavior.
--   FLD-3    a constraint is a Rule, not a behavior — a constraint written into `config`
--            or into `type` is refused BY NAME and told where it belongs. The attached
--            rules this file evaluates are read through ONE body,
--            `custom.field_rules(jsonb)`, which is the seam `W1-RULE` repoints to
--            `custom.rule` rows: the Rule OBJECT, its versions and its id-references are
--            `W1-RULE`'s and are not claimed here.
--   FLD-5    a category is a Record of a Table with `display: list` and only a title field —
--            the four option Tables this file seeds are exactly that, and a `list` field
--            whose options Table is not `display: list` is refused.
--   FLD-6    there is no select-to-relation conversion, because every pick-list is already a
--            Table — a `list` field stores the OPTION RECORD'S ID, so T4's "nothing
--            migrates" is structural: the Table grows fields and becomes `display: page`
--            and every stored value still points at the same record.
--   FLD-7    field source is one of `manual`, `formula`, `agent`, `synced`.
--   FLD-9    a Formula declares whether it computes on read or on write — `compute_on` is
--            REQUIRED for a formula and REFUSED for anything else.
--   FLD-10   a type field selects which Fields and Rules apply to the record — a Table
--            names its `type_field`, a Field names its `applies_to_types`, and
--            `custom.applicable_fields()` is the one body that answers "which fields".
--   FLD-12   a field definition carries `sensitivity`, `context_policy`,
--            `review_interval_days`, `depends_on` and its relation properties.
--   FLD-13   `custom.field`'s own columns, the doctrine's list verbatim, plus `table_token`
--            for a STANDARD table and `entity_definition_id` for a custom one — exactly one
--            of the two, which is what makes it ONE definitions surface (FLD-8) rather than
--            two tables wearing one name.
--   FLD-N-1  unit and format live on the FIELD, not in presentation — `unit` and `format`
--            are field columns, and a `presentation` blob carrying either is refused by
--            name, because that is the only way the rule can fail in practice.
--   REC-51   the validation trigger enforces the definitions on write — type, required,
--            relation rules and option membership — on `custom.record`
--            (`custom_record_field_validation`) and on the `custom_fields` column of every
--            table the registry marks (`custom.validate_custom_fields`, wired to
--            `crm.party` behind `custom/entity_custom_fields_guard`).
--   DYN-1    a merge field is a Record of the standard Table `Merge Field` — the NINTH
--            kernel row, which `W1-STORE` deliberately left to this lane. After this file
--            `select count(*) from custom.record where data_class = 'kernel'` is 9.
--   DYN-2    three orthogonal axes: exactly one source, exactly one semantic type, any
--            number of modifiers, and no combination is ever its own type — a `type` key on
--            a merge field is refused by name with the three axes in the message.
--
-- THE REGISTRY SEAM, NAMED RATHER THAN SMUGGLED. REC-51's second half says "every table
-- whose registry row reads `custom_fields_enabled`". `platform.entity_types` carries NO
-- such column today (measured on the branch before this file was written: zero columns
-- matching `%custom%`); it is `W1-REG`'s registry surgery. So the enabled set is answered
-- through ONE body, `custom.custom_fields_tables()`, which today reads the registry row
-- ANDs the physical presence of a `custom_fields` column, announces that stand-in with its
-- remedy in its own comment, and is the single place `W1-REG` repoints when the flag lands.
-- Nothing else in this file enumerates that set.
--
-- THE HISTORY SEAM. T8's "its old Value in History" is `W3-HIST`'s store. When a retype
-- makes a field inapplicable, this file does NOT delete or coerce the value: it moves it to
-- `data -> '_retired'` with the reason and the moment, and says so in the trigger's own
-- comment with `W3-HIST` named as the remedy. That is a stand-in that announces itself
-- (rule 16), never a silent drop.
--
-- WHY NOTHING HERE IS A GRANT. Schema `custom` is revoked from PUBLIC, anon, authenticated
-- and service_role, is absent from `pgrst.db_schemas`, and `custom/system_enabled` resolves
-- false on both databases. Every function below is SECURITY INVOKER and carries no GRANT, so
-- `custom.record_write` (DOOR-N-1) remains the one door and these are owner-side
-- constructors above it. The one trigger this file puts on a LIVE table — `crm.party` — is
-- rule 4's fourth exception and nothing else: its body returns NEW untouched unless
-- `custom/entity_custom_fields_guard` resolves true, which it does nowhere.
--
-- IDEMPOTENCE, STATED HONESTLY. §6b.2's allow-list admits `CREATE VIEW`, `CREATE TRIGGER`
-- and `create or replace function` and refuses `CREATE OR REPLACE` of a view or a trigger, and
-- PostgreSQL has no `IF NOT EXISTS` for any of the three. So a second consecutive apply of
-- these bytes is refused BY THE DATABASE (42P07 / 42710 / 42723) and changes nothing,
-- exactly as `W1-STORE`'s, `W1-PROV`'s and `W1-TABLE`'s files do. Rule 27's loop is up →
-- inverse → `--reapply`. Every seeded ROW is `on conflict do nothing`, so the data half is
-- idempotent on its own.
--
-- THE INVERSE: `migrations/inverse/w1_field_definitions_and_validation_down.sql` (§4.13).

set lock_timeout = '5s';
set statement_timeout = '300s';

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. The two kernel ids, in code
-- ══════════════════════════════════════════════════════════════════════════════

create or replace function custom.field_kernel_id() returns uuid
  language sql immutable parallel safe
  set search_path to 'pg_catalog'
as $fn_field_kernel_id$
  select '11111111-0000-4000-8000-000000000002'::uuid;
$fn_field_kernel_id$;

comment on function custom.field_kernel_id() is
  'REC-25 / REC-27 / FLD-8: the id of the kernel `Field` record in custom.record, written by W1-STORE''s w1_store_kernel_tables.sql and read back live before this file was written. A record whose table_id is this id IS a field definition.';

create or replace function custom.merge_field_kernel_id() returns uuid
  language sql immutable parallel safe
  set search_path to 'pg_catalog'
as $fn_mf_kernel_id$
  select '11111111-0000-4000-8000-000000000009'::uuid;
$fn_mf_kernel_id$;

comment on function custom.merge_field_kernel_id() is
  'DYN-1: the id of the kernel `Merge Field` record — REC-27''s ninth, which W1-STORE left to this lane. A record whose table_id is this id IS a merge field, so History, Visibility and Migration cover it with no second mechanism.';

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. DYN-1 — the ninth kernel Table
-- ══════════════════════════════════════════════════════════════════════════════
-- Written exactly as W1-STORE wrote the other eight: data_class `kernel`, table_id the
-- `Table` kernel record, the same organization, the same three data keys. `_table_shape_guard`
-- exempts `kernel` rows (REC-27: the kernel is defined in code, not data) and
-- `custom."table"` supplies their defaults, so this row needs no declaration block.

insert into custom.record (id, organization_id, table_id, data_class, data)
values ('11111111-0000-4000-8000-000000000009'::uuid,
        '39c38960-d30c-4840-b0c1-c9960de95582'::uuid,
        '11111111-0000-4000-8000-000000000001'::uuid,
        'kernel',
        '{"row": "REC-27", "name": "Merge Field", "kernel": true}'::jsonb)
on conflict (organization_id, id) do nothing;

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. FLD-3's seam — the ONE place an attached constraint Rule is read
-- ══════════════════════════════════════════════════════════════════════════════

create or replace function custom.field_rules(p_field_data jsonb)
  returns table (kind text, spec jsonb)
  language sql immutable parallel safe
  set search_path to 'pg_catalog'
as $fn_field_rules$
  select r ->> 'kind', r
    from jsonb_array_elements(coalesce(p_field_data -> 'rules', '[]'::jsonb)) r;
$fn_field_rules$;

comment on function custom.field_rules(jsonb) is
  'FLD-3: a constraint is a Rule, not a behavior. This is the ONE body that enumerates a Field''s attached validation Rules, so W1-RULE repoints it at custom.rule rows (by id and version) and no consumer moves. TODAY it reads the rules inline on the Field record, which carries no version and no shared identity — announced here with W1-RULE / REC-15 / REC-17 as the remedy rather than left to be discovered. The Rule OBJECT is not this lane''s and is not claimed.';

-- ══════════════════════════════════════════════════════════════════════════════
-- 4. FLD-10 — which fields apply, and the type field that decides it
-- ══════════════════════════════════════════════════════════════════════════════

create or replace function custom.table_type_field(p_organization_id uuid, p_table_id uuid)
  returns text
  language sql stable
  set search_path to 'pg_catalog'
as $fn_type_field$
  select t.data ->> 'type_field'
    from custom.record t
   where t.organization_id = p_organization_id
     and t.id = p_table_id
     and t.table_id = custom.table_kernel_id()
     and t.deleted_at is null;
$fn_type_field$;

comment on function custom.table_type_field(uuid, uuid) is
  'FLD-10 / T8: the name of the field whose VALUE selects which Fields and Rules apply to a record of this Table. A Table with no type_field has one shape and every field applies.';

create or replace function custom.applicable_fields(p_organization_id uuid, p_table_id uuid,
                                         p_record_type text default null)
  returns setof custom.record
  language sql stable
  set search_path to 'pg_catalog'
as $fn_applicable$
  select f.*
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = p_table_id
     and (jsonb_array_length(coalesce(f.data -> 'applies_to_types', '[]'::jsonb)) = 0
          or (p_record_type is not null
              and coalesce(f.data -> 'applies_to_types', '[]'::jsonb) ? p_record_type));
$fn_applicable$;

comment on function custom.applicable_fields(uuid, uuid, text) is
  'FLD-10: the one body that answers "which Fields apply to this record". A Field with an empty applies_to_types applies to every record of its Table; otherwise the record''s own type value, read out of the Table''s type_field, selects it. T8''s Circle shows Radius and its Rectangle shows Width and Height because of THIS query and nothing else.';

create or replace function custom.field_options(p_organization_id uuid, p_field_id uuid)
  returns setof custom.record
  language sql stable
  set search_path to 'pg_catalog'
as $fn_field_options$
  select o.*
    from custom.record f
    join custom.record o
      on o.organization_id = f.organization_id
     and o.table_id = (f.data -> 'config' ->> 'options_table_id')::uuid
     and o.deleted_at is null
   where f.organization_id = p_organization_id
     and f.id = p_field_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null;
$fn_field_options$;

comment on function custom.field_options(uuid, uuid) is
  'FLD-5 / FLD-6: a list field''s options ARE the records of a Table with display: list. There is no option store, no enum and no select-to-relation conversion, because the pick-list was a Table from the first write.';

-- ══════════════════════════════════════════════════════════════════════════════
-- 5. FLD-1, FLD-2, FLD-3, FLD-5, FLD-7, FLD-9, FLD-12, FLD-13, FLD-N-1
--    what a field DEFINITION must declare
-- ══════════════════════════════════════════════════════════════════════════════

create or replace function custom._field_shape_guard() returns trigger
  language plpgsql
  set search_path to 'pg_catalog'
as $fn_fguard$
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
$fn_fguard$;

comment on function custom._field_shape_guard() is
  'FLD-1, FLD-2, FLD-3, FLD-5, FLD-7, FLD-9, FLD-12, FLD-13 and FLD-N-1: everything a field DEFINITION must declare, refused in the user''s own words and always by the field''s own name. The kernel `Field` row is exempt (REC-27: the kernel is defined in code, not data).';

create trigger custom_record_field_shape_guard
  before insert or update on custom.record
  for each row execute function custom._field_shape_guard();

-- ══════════════════════════════════════════════════════════════════════════════
-- 6. DYN-2 — three axes, never collapsed
-- ══════════════════════════════════════════════════════════════════════════════

create or replace function custom._merge_field_shape_guard() returns trigger
  language plpgsql
  set search_path to 'pg_catalog'
as $fn_mfguard$
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
$fn_mfguard$;

comment on function custom._merge_field_shape_guard() is
  'DYN-2: a merge field declares exactly one source, exactly one semantic type and any number of modifiers, and no combination is ever its own type. The three axes are refused separately, so a caller learns which one it got wrong.';

create trigger custom_record_merge_field_shape_guard
  before insert or update on custom.record
  for each row execute function custom._merge_field_shape_guard();

-- ══════════════════════════════════════════════════════════════════════════════
-- 7. REC-51 — the validation trigger, on the store
-- ══════════════════════════════════════════════════════════════════════════════
-- One body validates a jsonb document against a set of field definitions, so the store half
-- and the `custom_fields` half (§8) are the SAME validator rather than two that drift.

create or replace function custom.validate_values(p_organization_id uuid, p_fields custom.record[],
                                       p_values jsonb, p_record_type text default null)
  returns void
  language plpgsql stable
  set search_path to 'pg_catalog'
as $fn_validate$
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
begin
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
      if v_type = 'text' then
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
                  hint = 'FLD-5 / FLD-6: a list field stores the id of the option RECORD, because every pick-list is already a Table.';
        end if;
        -- OPTION MEMBERSHIP. The value is an option RECORD of the options Table. The id
        -- SHAPE is checked first: a cast failure would refuse the write with Postgres's own
        -- 22P02 and never name the field, which is a refusal nobody can act on.
        if (v_one #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
          raise exception '% was given a choice that is not one of its choices', v_label
            using errcode = '23514',
                  hint = format('REC-51: option membership. %s stores the id of an option record, and what it was given is not an id at all.', v_label);
        end if;
        if not exists (
          select 1 from custom.record o
           where o.organization_id = p_organization_id
             and o.id = (v_one #>> '{}')::uuid
             and o.table_id = (d -> 'config' ->> 'options_table_id')::uuid
             and o.deleted_at is null) then
          raise exception '% was given a choice that is not one of its choices', v_label
            using errcode = '23514',
                  hint = format('REC-51: option membership. The choices for %s are the records of its own table.', v_label);
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
           and not (p_record_type is not null and (v_rule -> 'applies_to_types') ? p_record_type) then
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
$fn_validate$;

comment on function custom.validate_values(uuid, custom.record[], jsonb, text) is
  'REC-51: ONE validator for type, required, relation rules and option membership. It is shared by the store half (custom_record_field_validation) and the custom_fields half (custom.validate_custom_fields), so the two can never drift apart, and every refusal names the FIELD, in the words a person reading the screen would use.';

create or replace function custom._record_field_validation() returns trigger
  language plpgsql
  set search_path to 'pg_catalog'
as $fn_rfv$
declare
  v_type_field text;
  v_rtype      text;
  v_fields     custom.record[];
  v_gone       custom.record[];
  g            custom.record;
  v_retired    jsonb;
begin
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
            'reason', format('this record became a %s, and %s does not apply to a %s',
                             coalesce(v_rtype, 'different kind of thing'),
                             coalesce(nullif(g.data ->> 'label', ''), g.data ->> 'key'),
                             coalesce(v_rtype, 'record of that kind')),
            'at', to_jsonb(now()));
          new.data := new.data - (g.data ->> 'key');
        end if;
      end loop;
      if jsonb_array_length(v_retired) > 0 then
        new.data := jsonb_set(new.data, '{_retired}', v_retired);
      end if;
    end if;
  end if;

  perform custom.validate_values(new.organization_id, v_fields, new.data, v_rtype);
  return new;
end;
$fn_rfv$;

comment on function custom._record_field_validation() is
  'REC-51 on the store: every write of a record is checked against the field definitions that APPLY to it (FLD-10), and refused by the field''s own name. T8''s retype moves a Value that stopped applying into data -> _retired with its reason - a STAND-IN for History, announced here with W3-HIST as the remedy, never a silent drop and never a coercion.';

create trigger custom_record_field_validation
  before insert or update on custom.record
  for each row execute function custom._record_field_validation();

-- ══════════════════════════════════════════════════════════════════════════════
-- 8. FLD-8 / FLD-13 — the ONE definitions surface
-- ══════════════════════════════════════════════════════════════════════════════

create view custom.field with (security_invoker = true) as
  select f.id,
         f.organization_id,
         (f.data ->> 'entity_definition_id')::uuid                       as entity_definition_id,
         f.data ->> 'table_token'                                        as table_token,
         f.data ->> 'key'                                                as key,
         f.data ->> 'label'                                              as label,
         coalesce(nullif(f.data ->> 'label', ''), f.data ->> 'key')      as name,
         f.data ->> 'type'                                               as type,
         coalesce(f.data -> 'config', '{}'::jsonb)                       as config,
         coalesce((f.data ->> 'required')::boolean, false)               as required,
         f.data -> 'default'                                             as "default",
         coalesce((f.data ->> 'sort')::integer, 0)                       as sort,
         coalesce((f.data ->> 'multi')::boolean, false)                  as multi,
         coalesce((f.data ->> 'dated')::boolean, false)                  as dated,
         coalesce(f.data -> 'rules', '[]'::jsonb)                        as rules,
         (f.data ->> 'relation_target')::uuid                            as relation_target,
         (f.data ->> 'relation_max')::integer                            as relation_max,
         f.data ->> 'on_target_delete'                                   as on_target_delete,
         f.data ->> 'inverse_key'                                        as inverse_key,
         f.data ->> 'source'                                             as source,
         coalesce(f.data -> 'source_config', '{}'::jsonb)                as source_config,
         f.data ->> 'compute_on'                                         as compute_on,
         f.data ->> 'unit'                                               as unit,
         f.data ->> 'format'                                             as format,
         f.data ->> 'sensitivity'                                        as sensitivity,
         f.data ->> 'context_policy'                                     as context_policy,
         (f.data ->> 'review_interval_days')::integer                    as review_interval_days,
         coalesce(f.data -> 'depends_on', '[]'::jsonb)                   as depends_on,
         coalesce(f.data -> 'applies_to_types', '[]'::jsonb)             as applies_to_types,
         (f.data -> 'config' ->> 'options_table_id')::uuid               as options_table_id,
         f.created_by, f.updated_by, f.created_at, f.updated_at,
         f.version, f.metadata, f.visibility, f.data
    from custom.record f
   where f.table_id = custom.field_kernel_id()
     and f.data_class <> 'kernel'
     and f.deleted_at is null;

comment on view custom.field is
  'FLD-8 and FLD-13: ONE definitions table for all custom fields, on standard and custom tables alike, organization-scoped - so two organizations add different fields to the same standard table and neither can see the other''s. A PROJECTION over custom.record, never a second relation: a Field IS a Record (REC-25), so its id is its record id and its base contract is custom.record''s own certified columns. entity_definition_id names a custom Table record and table_token a standard table''s registry token; exactly one is ever set. security_invoker: every caller reads it under their own row-level security.';

create or replace function custom._field_definition_write() returns trigger
  language plpgsql
  set search_path to 'pg_catalog'
as $fn_fdw$
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
$fn_fdw$;

comment on function custom._field_definition_write() is
  'FLD-8 / REC-51: writing a field DEFINITION through custom.field. It assembles the view''s columns back into the one stored document and writes custom.record, so custom._field_shape_guard fires on exactly the same bytes whichever way the definition arrives - the projection is a surface, never a second store with its own rules.';

create trigger custom_field_definition_validation
  instead of insert or update or delete on custom.field
  for each row execute function custom._field_definition_write();

-- ══════════════════════════════════════════════════════════════════════════════
-- 9. DYN-1 / DYN-2 — the merge field surface
-- ══════════════════════════════════════════════════════════════════════════════

create view custom.merge_field with (security_invoker = true) as
  select m.id,
         m.organization_id,
         m.data ->> 'key'                                    as key,
         m.data ->> 'label'                                  as label,
         m.data ->> 'source'                                 as source,
         m.data ->> 'semantic_type'                          as semantic_type,
         coalesce(m.data -> 'modifiers', '[]'::jsonb)        as modifiers,
         m.data ->> 'override_policy'                        as override_policy,
         m.data ->> 'override_requires'                      as override_requires,
         m.data ->> 'format'                                 as format,
         coalesce(m.data -> 'source_config', '{}'::jsonb)    as source_config,
         m.created_by, m.updated_by, m.created_at, m.updated_at,
         m.version, m.metadata, m.visibility, m.data
    from custom.record m
   where m.table_id = custom.merge_field_kernel_id()
     and m.data_class <> 'kernel'
     and m.deleted_at is null;

comment on view custom.merge_field is
  'DYN-1: a merge field is a Record of the standard Table `Merge Field`, so History, Visibility and Migration cover it with no second mechanism. DYN-2: source, semantic_type and modifiers are three columns because they are three independent answers, and there is no column that fuses them.';

-- ══════════════════════════════════════════════════════════════════════════════
-- 10. THE SEED — FLD-5's four category Tables, and DYN-1's own Fields
-- ══════════════════════════════════════════════════════════════════════════════
-- Every row below is a constant, so the seed is idempotent on its own and the file needs no
-- DO block, no function call and no UPDATE at the top level. The four option Tables are
-- FLD-5 exactly: a Record of a Table with `display: list` and only a title field. Their Home
-- is the `Merge Field` kernel record, which is where they belong and is not a detail Table.

insert into custom.record (id, organization_id, table_id, data_class, data) values
  ('11111111-0001-4000-8000-000000000001'::uuid, '39c38960-d30c-4840-b0c1-c9960de95582'::uuid,
   '11111111-0000-4000-8000-000000000001'::uuid, 'table',
   '{"type":"entity","name":"Merge Field Source","slug":"merge_field_source","label_singular":"Source","label_plural":"Sources","display":"list","ordered":true,"weight":"light","retention_days":365,"default_sort":[{"field":"name","direction":"asc"}],"row_order":"manual","agent_writable":false,"fields":[{"name":"name"}],"title_field":"name","parent_id":"11111111-0000-4000-8000-000000000009"}'::jsonb),
  ('11111111-0001-4000-8000-000000000002'::uuid, '39c38960-d30c-4840-b0c1-c9960de95582'::uuid,
   '11111111-0000-4000-8000-000000000001'::uuid, 'table',
   '{"type":"entity","name":"Merge Field Semantic Type","slug":"merge_field_semantic_type","label_singular":"Semantic type","label_plural":"Semantic types","display":"list","ordered":true,"weight":"light","retention_days":365,"default_sort":[{"field":"name","direction":"asc"}],"row_order":"manual","agent_writable":false,"fields":[{"name":"name"}],"title_field":"name","parent_id":"11111111-0000-4000-8000-000000000009"}'::jsonb),
  ('11111111-0001-4000-8000-000000000003'::uuid, '39c38960-d30c-4840-b0c1-c9960de95582'::uuid,
   '11111111-0000-4000-8000-000000000001'::uuid, 'table',
   '{"type":"entity","name":"Merge Field Modifier","slug":"merge_field_modifier","label_singular":"Modifier","label_plural":"Modifiers","display":"list","ordered":true,"weight":"light","retention_days":365,"default_sort":[{"field":"name","direction":"asc"}],"row_order":"manual","agent_writable":false,"fields":[{"name":"name"}],"title_field":"name","parent_id":"11111111-0000-4000-8000-000000000009"}'::jsonb),
  ('11111111-0001-4000-8000-000000000004'::uuid, '39c38960-d30c-4840-b0c1-c9960de95582'::uuid,
   '11111111-0000-4000-8000-000000000001'::uuid, 'table',
   '{"type":"entity","name":"Override Policy","slug":"override_policy","label_singular":"Override policy","label_plural":"Override policies","display":"list","ordered":true,"weight":"light","retention_days":365,"default_sort":[{"field":"name","direction":"asc"}],"row_order":"manual","agent_writable":false,"fields":[{"name":"name"}],"title_field":"name","parent_id":"11111111-0000-4000-8000-000000000009"}'::jsonb)
on conflict (organization_id, id) do nothing;

-- The eight sources (DYNAMIC-VALUES §C), the five semantic types, the seven modifiers and
-- the five override policies, each as a RECORD of its Table - never an enum, never a check
-- constraint, never a lookup column. That is FLD-6 said as data.
insert into custom.record (id, organization_id, table_id, data_class, data) values
  ('11111111-0002-4000-8000-000000000001'::uuid,'39c38960-d30c-4840-b0c1-c9960de95582'::uuid,'11111111-0001-4000-8000-000000000001'::uuid,'record','{"name":"literal"}'::jsonb),
  ('11111111-0002-4000-8000-000000000002'::uuid,'39c38960-d30c-4840-b0c1-c9960de95582'::uuid,'11111111-0001-4000-8000-000000000001'::uuid,'record','{"name":"record"}'::jsonb),
  ('11111111-0002-4000-8000-000000000003'::uuid,'39c38960-d30c-4840-b0c1-c9960de95582'::uuid,'11111111-0001-4000-8000-000000000001'::uuid,'record','{"name":"state"}'::jsonb),
  ('11111111-0002-4000-8000-000000000004'::uuid,'39c38960-d30c-4840-b0c1-c9960de95582'::uuid,'11111111-0001-4000-8000-000000000001'::uuid,'record','{"name":"actor"}'::jsonb),
  ('11111111-0002-4000-8000-000000000005'::uuid,'39c38960-d30c-4840-b0c1-c9960de95582'::uuid,'11111111-0001-4000-8000-000000000001'::uuid,'record','{"name":"platform"}'::jsonb),
  ('11111111-0002-4000-8000-000000000006'::uuid,'39c38960-d30c-4840-b0c1-c9960de95582'::uuid,'11111111-0001-4000-8000-000000000001'::uuid,'record','{"name":"user_input"}'::jsonb),
  ('11111111-0002-4000-8000-000000000007'::uuid,'39c38960-d30c-4840-b0c1-c9960de95582'::uuid,'11111111-0001-4000-8000-000000000001'::uuid,'record','{"name":"tool"}'::jsonb),
  ('11111111-0002-4000-8000-000000000008'::uuid,'39c38960-d30c-4840-b0c1-c9960de95582'::uuid,'11111111-0001-4000-8000-000000000001'::uuid,'record','{"name":"derived"}'::jsonb),
  ('11111111-0002-4000-8000-000000000011'::uuid,'39c38960-d30c-4840-b0c1-c9960de95582'::uuid,'11111111-0001-4000-8000-000000000002'::uuid,'record','{"name":"value"}'::jsonb),
  ('11111111-0002-4000-8000-000000000012'::uuid,'39c38960-d30c-4840-b0c1-c9960de95582'::uuid,'11111111-0001-4000-8000-000000000002'::uuid,'record','{"name":"reference"}'::jsonb),
  ('11111111-0002-4000-8000-000000000013'::uuid,'39c38960-d30c-4840-b0c1-c9960de95582'::uuid,'11111111-0001-4000-8000-000000000002'::uuid,'record','{"name":"resolver"}'::jsonb),
  ('11111111-0002-4000-8000-000000000014'::uuid,'39c38960-d30c-4840-b0c1-c9960de95582'::uuid,'11111111-0001-4000-8000-000000000002'::uuid,'record','{"name":"computed"}'::jsonb),
  ('11111111-0002-4000-8000-000000000015'::uuid,'39c38960-d30c-4840-b0c1-c9960de95582'::uuid,'11111111-0001-4000-8000-000000000002'::uuid,'record','{"name":"collection"}'::jsonb),
  ('11111111-0002-4000-8000-000000000021'::uuid,'39c38960-d30c-4840-b0c1-c9960de95582'::uuid,'11111111-0001-4000-8000-000000000003'::uuid,'record','{"name":"scoped"}'::jsonb),
  ('11111111-0002-4000-8000-000000000022'::uuid,'39c38960-d30c-4840-b0c1-c9960de95582'::uuid,'11111111-0001-4000-8000-000000000003'::uuid,'record','{"name":"temporal"}'::jsonb),
  ('11111111-0002-4000-8000-000000000023'::uuid,'39c38960-d30c-4840-b0c1-c9960de95582'::uuid,'11111111-0001-4000-8000-000000000003'::uuid,'record','{"name":"collection"}'::jsonb),
  ('11111111-0002-4000-8000-000000000024'::uuid,'39c38960-d30c-4840-b0c1-c9960de95582'::uuid,'11111111-0001-4000-8000-000000000003'::uuid,'record','{"name":"live"}'::jsonb),
  ('11111111-0002-4000-8000-000000000025'::uuid,'39c38960-d30c-4840-b0c1-c9960de95582'::uuid,'11111111-0001-4000-8000-000000000003'::uuid,'record','{"name":"fallback"}'::jsonb),
  ('11111111-0002-4000-8000-000000000026'::uuid,'39c38960-d30c-4840-b0c1-c9960de95582'::uuid,'11111111-0001-4000-8000-000000000003'::uuid,'record','{"name":"formatted"}'::jsonb),
  ('11111111-0002-4000-8000-000000000027'::uuid,'39c38960-d30c-4840-b0c1-c9960de95582'::uuid,'11111111-0001-4000-8000-000000000003'::uuid,'record','{"name":"required"}'::jsonb),
  ('11111111-0002-4000-8000-000000000031'::uuid,'39c38960-d30c-4840-b0c1-c9960de95582'::uuid,'11111111-0001-4000-8000-000000000004'::uuid,'record','{"name":"must_supply"}'::jsonb),
  ('11111111-0002-4000-8000-000000000032'::uuid,'39c38960-d30c-4840-b0c1-c9960de95582'::uuid,'11111111-0001-4000-8000-000000000004'::uuid,'record','{"name":"shown_overridable"}'::jsonb),
  ('11111111-0002-4000-8000-000000000033'::uuid,'39c38960-d30c-4840-b0c1-c9960de95582'::uuid,'11111111-0001-4000-8000-000000000004'::uuid,'record','{"name":"shown_locked"}'::jsonb),
  ('11111111-0002-4000-8000-000000000034'::uuid,'39c38960-d30c-4840-b0c1-c9960de95582'::uuid,'11111111-0001-4000-8000-000000000004'::uuid,'record','{"name":"server_fixed"}'::jsonb),
  ('11111111-0002-4000-8000-000000000035'::uuid,'39c38960-d30c-4840-b0c1-c9960de95582'::uuid,'11111111-0001-4000-8000-000000000004'::uuid,'record','{"name":"derived"}'::jsonb)
on conflict (organization_id, id) do nothing;

-- DYN-1's "and its Fields". The `Merge Field` kernel Table is declared here as a Table
-- record so its fields have somewhere to be declared (REC-1), and the SEVEN field
-- definitions below are this lane's named rows: `select id, entity_definition_id, name, type
-- from custom.field where name in ('Key','Label','Source','Semantic type','Modifiers',
-- 'Override policy','Format')` returns exactly them.
insert into custom.record (id, organization_id, table_id, data_class, data) values
  ('11111111-0001-4000-8000-000000000009'::uuid, '39c38960-d30c-4840-b0c1-c9960de95582'::uuid,
   '11111111-0000-4000-8000-000000000001'::uuid, 'table',
   '{"type":"entity","name":"Merge Field Declaration","slug":"merge_field_declaration","label_singular":"Merge field","label_plural":"Merge fields","display":"page","ordered":false,"weight":"light","retention_days":365,"default_sort":[{"field":"key","direction":"asc"}],"row_order":"sorted","agent_writable":false,"fields":[{"name":"key"},{"name":"label"},{"name":"source"},{"name":"semantic_type"},{"name":"modifiers"},{"name":"override_policy"},{"name":"format"}],"title_field":"key","parent_id":"11111111-0000-4000-8000-000000000009"}'::jsonb)
on conflict (organization_id, id) do nothing;

insert into custom.record (id, organization_id, table_id, data_class, data) values
  ('11111111-0003-4000-8000-000000000001'::uuid,'39c38960-d30c-4840-b0c1-c9960de95582'::uuid,'11111111-0000-4000-8000-000000000002'::uuid,'field',
   '{"entity_definition_id":"11111111-0001-4000-8000-000000000009","key":"key","label":"Key","type":"text","multi":false,"dated":false,"rules":[{"kind":"pattern","value":"^[a-z][a-z0-9_.]*$"}],"config":{},"required":true,"sort":10,"source":"manual","source_config":{},"sensitivity":"internal","context_policy":"include","depends_on":[],"applies_to_types":[]}'::jsonb),
  ('11111111-0003-4000-8000-000000000002'::uuid,'39c38960-d30c-4840-b0c1-c9960de95582'::uuid,'11111111-0000-4000-8000-000000000002'::uuid,'field',
   '{"entity_definition_id":"11111111-0001-4000-8000-000000000009","key":"label","label":"Label","type":"text","multi":false,"dated":false,"rules":[],"config":{},"required":false,"sort":20,"source":"manual","source_config":{},"sensitivity":"internal","context_policy":"include","depends_on":[],"applies_to_types":[]}'::jsonb),
  ('11111111-0003-4000-8000-000000000003'::uuid,'39c38960-d30c-4840-b0c1-c9960de95582'::uuid,'11111111-0000-4000-8000-000000000002'::uuid,'field',
   '{"entity_definition_id":"11111111-0001-4000-8000-000000000009","key":"source","label":"Source","type":"list","multi":false,"dated":false,"rules":[],"config":{"options_table_id":"11111111-0001-4000-8000-000000000001"},"required":true,"sort":30,"source":"manual","source_config":{},"sensitivity":"internal","context_policy":"include","depends_on":[],"applies_to_types":[]}'::jsonb),
  ('11111111-0003-4000-8000-000000000004'::uuid,'39c38960-d30c-4840-b0c1-c9960de95582'::uuid,'11111111-0000-4000-8000-000000000002'::uuid,'field',
   '{"entity_definition_id":"11111111-0001-4000-8000-000000000009","key":"semantic_type","label":"Semantic type","type":"list","multi":false,"dated":false,"rules":[],"config":{"options_table_id":"11111111-0001-4000-8000-000000000002"},"required":true,"sort":40,"source":"manual","source_config":{},"sensitivity":"internal","context_policy":"include","depends_on":[],"applies_to_types":[]}'::jsonb),
  ('11111111-0003-4000-8000-000000000005'::uuid,'39c38960-d30c-4840-b0c1-c9960de95582'::uuid,'11111111-0000-4000-8000-000000000002'::uuid,'field',
   '{"entity_definition_id":"11111111-0001-4000-8000-000000000009","key":"modifiers","label":"Modifiers","type":"list","multi":true,"dated":false,"rules":[],"config":{"options_table_id":"11111111-0001-4000-8000-000000000003"},"required":false,"sort":50,"source":"manual","source_config":{},"sensitivity":"internal","context_policy":"include","depends_on":[],"applies_to_types":[]}'::jsonb),
  ('11111111-0003-4000-8000-000000000006'::uuid,'39c38960-d30c-4840-b0c1-c9960de95582'::uuid,'11111111-0000-4000-8000-000000000002'::uuid,'field',
   '{"entity_definition_id":"11111111-0001-4000-8000-000000000009","key":"override_policy","label":"Override policy","type":"list","multi":false,"dated":false,"rules":[],"config":{"options_table_id":"11111111-0001-4000-8000-000000000004"},"required":false,"sort":60,"source":"manual","source_config":{},"sensitivity":"internal","context_policy":"include","depends_on":[],"applies_to_types":[]}'::jsonb),
  ('11111111-0003-4000-8000-000000000007'::uuid,'39c38960-d30c-4840-b0c1-c9960de95582'::uuid,'11111111-0000-4000-8000-000000000002'::uuid,'field',
   '{"entity_definition_id":"11111111-0001-4000-8000-000000000009","key":"format","label":"Format","type":"text","multi":false,"dated":false,"rules":[],"config":{},"required":false,"sort":70,"source":"manual","source_config":{},"sensitivity":"internal","context_policy":"include","depends_on":[],"applies_to_types":[],"unit":null,"format":null}'::jsonb)
on conflict (organization_id, id) do nothing;
