-- LIMITS-FIX — THE RED TWIN of `checkbox_green.sql`.
--
-- WHAT A RED TWIN IS FOR. A green suite that would be green WITHOUT the change proves
-- nothing. This file puts the PRE-RULING bodies back — the ones live on this database
-- before `migrations/campaign/limitsfix_a_checkbox_is_a_real_boolean.sql` — one at a time,
-- inside SAVEPOINTs, and asserts that each clause of the green suite FLIPS. Every savepoint
-- is rolled back immediately, and the whole transaction ends in ROLLBACK, so the shipped
-- bodies are never out of place for longer than the assertion that needs them gone and the
-- database is left exactly as it was found.
--
-- IT RUNS AS THE OWNER, DELIBERATELY. It is replacing function bodies, which no client seat
-- may do; what it proves is about the BODIES. That the doors work from a signed-in person's
-- seat is `checkbox_green.sql`'s PART 0 and its seven clauses.
--
-- RUN IT:
--   "$PSQL" "<the five SUPABASE_MATRIX_* values>" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/checkbox_red.sql
--
-- THE USE CASE is the green suite's: Cedar Ridge Physical Therapy's roster of the
-- contractors who service its clinic equipment, and the two yes/no facts the front office
-- has to know before letting one in the building.

\set ON_ERROR_STOP on
\timing off

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'checkbox_red.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local statement_timeout = '60s';

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org  uuid := gen_random_uuid();
  v_home uuid; v_tbl uuid;
  v_caught text; v_n int; v_word text;
begin
  perform set_config('app.actor_system', 'campaign-test/checkbox_red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Cedar Ridge Physical Therapy', 'cedar-ridge-red-'||substr(v_org::text,1,8), 'CRR', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active');
  insert into platform.knob_override (feature,key,scope_kind,scope_id,organization_id,value,set_note)
  values ('custom','system_enabled','organization',v_org,v_org,'true'::jsonb,'campaign-test/checkbox_red');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name','Cedar Ridge Clinic')) returning id into v_home;

  v_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name','Equipment Contractor','slug','equipment_contractor','type','entity',
    'label_singular','Equipment contractor','label_plural','Equipment contractors',
    'title_field','company','display','page','weight','light','ordered',false,
    'row_order','sorted','default_sort','[]'::jsonb,'agent_writable',true,'retention_days',2555,
    'fields', jsonb_build_array(jsonb_build_object('name','company')),'parent_id',v_home::text));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Insured','type','checkbox'));
  perform custom.record_write(v_org, v_tbl, jsonb_build_object(
    'company','Hale Medical Equipment Service','insured', true, 'parent_id', v_home::text));
  perform custom.record_write(v_org, v_tbl, jsonb_build_object(
    'company','Okafor Hydraulics','insured', false, 'parent_id', v_home::text));
  perform custom.record_write(v_org, v_tbl, jsonb_build_object(
    'company','Delgado Plumbing & Heating', 'parent_id', v_home::text));
  raise notice 'SETUP — the tick box exists and three contractors are ticked, unticked and never asked.';
end
$t$;

-- ══════════════════════════════════════════════════════════════════════════════════════════
-- RED 1 — THE VOCABULARY. With the pre-ruling `custom.parity_field_types()` back, declaring
-- a tick box is refused by name: this is EXACTLY the wall real-data crew B hit on
-- 2026-09-21 and the whole reason this ruling exists.
-- ══════════════════════════════════════════════════════════════════════════════════════════
savepoint red1;
CREATE OR REPLACE FUNCTION custom.parity_field_types()
 RETURNS TABLE(parity_type text, behavior text, made_of text)
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog'
AS $function$
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
    ('datetime',     'range',    'a range of kind date or datetime — the dated modifier says the VALUES are dated, which is a different question')
  ) as t(parity_type, behavior, made_of);
$function$;

do $t$
declare v_caught text; v_org uuid; v_tbl uuid;
begin
  select o.id into v_org from iam.organizations o where o.slug like 'cedar-ridge-red-%' order by o.created_at desc limit 1;
  select r.id into v_tbl from custom.record r
   where r.organization_id = v_org and r.table_id = custom.table_kernel_id() and r.deleted_at is null
     and r.data ->> 'slug' = 'equipment_contractor' limit 1;
  -- THE SEAT, for the assertion itself. The function bodies above are replaced as the
  -- owner (no client may do that); what is ASSERTED is asserted from `authenticated`, the
  -- seat the green suite's PART 0 takes, so each clause flips where a person stands.
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'this red clause did not take the seat — current_user is %', current_user;
  end if;
  if exists (select 1 from custom.parity_field_types() t where t.parity_type = 'checkbox') then
    raise exception 'RED 1: the pre-ruling vocabulary was not restored';
  end if;
  begin
    perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Background check cleared','type','checkbox'));
    raise exception 'RED 1 DID NOT FLIP: a tick box was declarable with the pre-ruling vocabulary in place';
  exception when check_violation then v_caught := sqlerrm;
  end;
  perform set_config('role', session_user::text, true);
  raise notice 'RED 1 FLIPPED — pre-ruling, a tick box could not be declared at all: %', v_caught;
end
$t$;
rollback to savepoint red1;

-- ══════════════════════════════════════════════════════════════════════════════════════════
-- RED 2 — THE WRITE PATH. With the pre-ruling `custom.validate_values()` back, the tick box
-- takes ANYTHING: the word "Yes" lands in a boolean column and nobody is told. That silence
-- is what the new arm refuses by name.
-- ══════════════════════════════════════════════════════════════════════════════════════════
savepoint red2;
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

do $t$
declare v_org uuid; v_tbl uuid; v_id uuid; v_doc jsonb; v_home uuid;
begin
  select o.id into v_org from iam.organizations o where o.slug like 'cedar-ridge-red-%' order by o.created_at desc limit 1;
  select r.id into v_tbl from custom.record r
   where r.organization_id = v_org and r.table_id = custom.table_kernel_id() and r.deleted_at is null
     and r.data ->> 'slug' = 'equipment_contractor' limit 1;
  select r.id into v_home from custom.record r
   where r.organization_id = v_org and r.table_id is null and r.deleted_at is null limit 1;
  -- THE SEAT, for the assertion itself. The function bodies above are replaced as the
  -- owner (no client may do that); what is ASSERTED is asserted from `authenticated`, the
  -- seat the green suite's PART 0 takes, so each clause flips where a person stands.
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'this red clause did not take the seat — current_user is %', current_user;
  end if;
  begin
    v_id := custom.record_write(v_org, v_tbl, jsonb_build_object(
      'company','Vance Electrical','insured','Yes','parent_id', v_home::text));
  exception when others then
    raise exception 'RED 2 DID NOT FLIP the way it was written to: the pre-ruling write path answered %', sqlerrm;
  end;
  v_doc := custom.read_record(v_org, v_id, true);
  if jsonb_typeof(v_doc -> 'insured') <> 'string' then
    raise exception 'RED 2 DID NOT FLIP: the word "Yes" did not land in the tick box as a string';
  end if;
  perform set_config('role', session_user::text, true);
  raise notice 'RED 2 FLIPPED — pre-ruling, the WORD "%" sat in a boolean column and nothing said so.', v_doc ->> 'insured';
end
$t$;
rollback to savepoint red2;

-- ══════════════════════════════════════════════════════════════════════════════════════════
-- RED 3 — THE THIRD STATE. With the pre-ruling `custom.agg_sql()` back, the office manager's
-- Monday question — "which contractors has nobody asked?" — answers ZERO, because a `null`
-- filter was compared against the literal string.
-- ══════════════════════════════════════════════════════════════════════════════════════════
savepoint red3;
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

do $t$
declare v_org uuid; v_tbl uuid; v_unset int;
begin
  select o.id into v_org from iam.organizations o where o.slug like 'cedar-ridge-red-%' order by o.created_at desc limit 1;
  select r.id into v_tbl from custom.record r
   where r.organization_id = v_org and r.table_id = custom.table_kernel_id() and r.deleted_at is null
     and r.data ->> 'slug' = 'equipment_contractor' limit 1;
  -- THE SEAT, for the assertion itself. The function bodies above are replaced as the
  -- owner (no client may do that); what is ASSERTED is asserted from `authenticated`, the
  -- seat the green suite's PART 0 takes, so each clause flips where a person stands.
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'this red clause did not take the seat — current_user is %', current_user;
  end if;
  select coalesce(sum(a.row_count), 0)::int into v_unset from custom.record_aggregate(
    v_org, v_tbl, '[]'::jsonb, '[]'::jsonb, null, '{"insured": null}'::jsonb, 200, 'viewer') a;
  if v_unset <> 0 then
    raise exception 'RED 3 DID NOT FLIP: the pre-ruling aggregate already answered % for "never asked"', v_unset;
  end if;
  perform set_config('role', session_user::text, true);
  raise notice 'RED 3 FLIPPED — pre-ruling, "who has nobody asked?" answered 0 while one contractor was waiting.';
end
$t$;
rollback to savepoint red3;

-- ══════════════════════════════════════════════════════════════════════════════════════════
-- RED 4 — THE IMPORT MAPPER. With the pre-ruling `custom.io_infer_column()` back, the
-- clinic's Yes/No column is proposed as a two-choice DROPDOWN and its 1/0 column as a
-- NUMBER — the two wrong answers the new arm is asked before.
-- ══════════════════════════════════════════════════════════════════════════════════════════
savepoint red4;
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

do $t$
declare v_org uuid; v_word text;
begin
  select o.id into v_org from iam.organizations o where o.slug like 'cedar-ridge-red-%' order by o.created_at desc limit 1;
  -- THE SEAT, for the assertion itself. The function bodies above are replaced as the
  -- owner (no client may do that); what is ASSERTED is asserted from `authenticated`, the
  -- seat the green suite's PART 0 takes, so each clause flips where a person stands.
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'this red clause did not take the seat — current_user is %', current_user;
  end if;
  v_word := custom.io_infer_column(v_org, null, 'Background check cleared',
              '["Yes","No","Yes","Yes","No"]'::jsonb) ->> 'type';
  if v_word = 'checkbox' then
    raise exception 'RED 4 DID NOT FLIP: the pre-ruling mapper already proposed a tick box';
  end if;
  raise notice 'RED 4 FLIPPED — pre-ruling, a Yes/No column was proposed as "%".', v_word;
  v_word := custom.io_infer_column(v_org, null, 'W-9 on file', '["1","0","1","1","0","1"]'::jsonb) ->> 'type';
  if v_word = 'checkbox' then
    raise exception 'RED 4 DID NOT FLIP: the pre-ruling mapper already proposed a tick box for 1/0';
  end if;
  raise notice 'RED 4 FLIPPED — pre-ruling, a 1/0 column was proposed as "%".', v_word;
  perform set_config('role', session_user::text, true);
end
$t$;
rollback to savepoint red4;

do $t$ begin
  raise notice 'checkbox_red: ALL 4 CLAUSES FLIPPED with the pre-ruling bodies in place.';
end $t$;

rollback;
