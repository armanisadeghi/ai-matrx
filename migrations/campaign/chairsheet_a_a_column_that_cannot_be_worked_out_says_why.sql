-- additive: yes
--   It ADDS one function, custom._derived_attempt(uuid, uuid, jsonb, jsonb) (STABLE, EXECUTE revoked
--   from public/anon/authenticated, called only from the store's own bodies), and REPLACES three
--   bodies: custom.derived_value, custom.record_values_step and the six-argument
--   custom.mask_document. No table, column, trigger, policy, grant or stored row is touched.
--   Locks: pg_proc row locks only.
--   Inverse: migrations/inverse/chairsheet_a_a_column_that_cannot_be_worked_out_says_why_down.sql
--
-- chair-step: it REPLACES the store's worked-out reader (custom.derived_value now answers through
--   custom._derived_attempt, same value), the read doors' values step (custom.record_values_step,
--   which keeps each failed column's reason in the record's `_errors`) and the read mask
--   (custom.mask_document keeps `_errors` only for columns the reader sees). Nothing is dropped or
--   revoked from a client.
--
-- guard: custom/system_enabled
-- lock: custom
-- lane: CHAIR-SHEET-STORE
-- based-on: custom.derived_value(uuid, uuid, jsonb, jsonb) 79e8b6c1b360c873aab0105d9862468a66cc2edb2b651b625a0181e135e69f7c
-- based-on: custom.record_values_step(custom.record, jsonb) ba6f6aaeccb17f9f3b59a2511b357953faa4990407dba7b11df3b9671688c4c2
-- based-on: custom.mask_document(jsonb, text[], jsonb, boolean, jsonb, text[]) e74e43b73684cd2d87c9b50a207840dbc051ba9cee2247b0e74ccdc8063f67d6
--
-- CHAIR-SHEET-STORE (Unified Data System v7) — A COLUMN THAT CANNOT BE WORKED OUT SAYS WHY (Law 4).
--
-- THE GAP. `{Qty} / 0` read empty on every row. custom.derived_value caught every formula, lookup and
-- roll-up failure, wrote a `raise warning` no reader ever sees and answered null — so the grid drew a
-- blank where the older Sheet drew "#ERROR" with the reason. Retiring the Sheet would lose that.
--
-- THE FIX. One evaluation, custom._derived_attempt, answers the value or the reason. The read doors
-- that work values out (custom.read_records, read_records_page via read_records_by_ids,
-- read_records_by_ids, read_record via custom._read_record_with, read_records_matching — every one
-- goes through custom.record_values_step) now carry
--     "_errors": { "<column key>": "This formula divides by zero." }
-- beside the empty value. The read never fails for it. custom.mask_document keeps a reason only for a
-- column this reader may see, keyed by Field id on a by-id read. A roll-up or lookup whose source is
-- archived still answers its typed {"__unavailable": "source_archived"} value — that is an answer,
-- not a failure, and is untouched.

CREATE OR REPLACE FUNCTION custom._derived_attempt(p_organization_id uuid, p_record_id uuid, p_field_data jsonb, p_values jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
-- CHAIR-SHEET-STORE (a): ONE worked-out column of one record, and WHY when it cannot be worked out.
--   {"v": <value>}                  worked out (the key is absent when the answer is SQL NULL)
--   {"e": "<plain-English reason>"} not worked out; the column is empty on this read
-- custom.derived_value is `-> 'v'` of this, exactly as it answered before; the read doors
-- (custom.record_values_step) also keep `-> 'e'` in the record's `_errors`.
declare
  v_parity text := custom.parity_type(p_field_data);
  v_value  jsonb;
  v_what   text;
  v_says   text;
begin
  v_value := case v_parity
    when 'lookup'  then custom.lookup_value(p_organization_id, p_record_id, p_field_data)
    when 'rollup'  then custom.rollup_value(p_organization_id, p_record_id, p_field_data)
    when 'formula' then custom.formula_value(p_organization_id, p_record_id, p_field_data, p_values)
    else null
  end;
  return case when v_value is null then '{}'::jsonb else jsonb_build_object('v', v_value) end;
exception
  -- 🚨 NEVER SWALLOWED: a refusal is an answer about ACCESS and belongs to the caller, and a
  -- cancelled or timed-out read has established nothing about this column at all. Both
  -- re-raise exactly as they arrived.
  when insufficient_privilege or query_canceled then
    raise;
  when others then
    raise warning 'custom.derived_value: the % column "%" (key %) could not be worked out for record %: % (%). The column is empty on this read; every other column and the record itself are unaffected. REMEDY: fix the Field''s own definition - REC-17 says a formula, a lookup and a rollup point at a Field by ID and never by name.',
      coalesce(v_parity, 'worked-out'),
      coalesce(p_field_data ->> 'label', p_field_data ->> 'key', '(unnamed)'),
      coalesce(p_field_data ->> 'key', '(no key)'),
      p_record_id, sqlerrm, sqlstate;
    v_what := case v_parity when 'lookup' then 'lookup' when 'rollup' then 'roll-up' else 'formula' end;
    -- The store's own refusals are already sentences ("This formula divides by zero.", a circle
    -- named by custom.far_value): they are kept word for word. Postgres's own words are not, so
    -- the common ones are said plainly and anything else keeps its words behind a plain lead-in.
    v_says := case
      when sqlerrm ~ '^[A-Z`"]' and sqlerrm ~ '[.!?]$' then sqlerrm
      when sqlstate = '22012' then format('This %s divides by zero.', v_what)
      when sqlstate = '22003' then format('This %s''s answer is too large to keep.', v_what)
      when sqlstate in ('22P02', '22007', '22008') then
        format('This %s reads a value that is not a number or a date where it needs one.', v_what)
      when sqlstate = '54001' then format('This %s reads itself in a circle.', v_what)
      else format('This %s could not be worked out: %s.', v_what, rtrim(sqlerrm, '.'))
    end;
    return jsonb_build_object('e', v_says);
end;
$function$;

revoke all on function custom._derived_attempt(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION custom.derived_value(p_organization_id uuid, p_record_id uuid, p_field_data jsonb, p_values jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
begin
  -- CHAIR-SHEET-STORE (a): the one evaluation lives in custom._derived_attempt, which also says WHY a
  -- column could not be worked out. This answer is unchanged: the value, or SQL NULL (warned) when it
  -- could not be worked out; a refusal about access and a cancelled read still re-raise.
  return custom._derived_attempt(p_organization_id, p_record_id, p_field_data, p_values) -> 'v';
end;
$function$;

CREATE OR REPLACE FUNCTION custom.record_values_step(p_row custom.record, p_cache jsonb DEFAULT '{}'::jsonb, OUT o_doc jsonb, OUT o_cache jsonb)
 RETURNS record
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_base  jsonb;
  v_out   jsonb;
  v_plain jsonb;
  v_tf    text;
  v_rtype text;
  v_tk    text;
  v_pk    text;
  v_plan  jsonb;
  f       jsonb;
  v_try   jsonb;
  v_errs  jsonb := '{}'::jsonb;
begin
  o_cache := coalesce(p_cache, '{}'::jsonb);
  v_base := (p_row.data - '_computed' - '_retired' - '_values' - '_sources' - '_derived')
            -- CHAIR-READPERF: asked only when the record keeps the block; custom.computed_block(null)
            -- answers {} and costs a parse and a plan of its body on every call (it is LANGUAGE sql).
            || case when p_row.data ? '_computed' then custom.computed_block(p_row.data -> '_computed')
                    else '{}'::jsonb end;

  -- custom.derived_values_of's own first line, exactly.
  if p_row.id is null or p_row.table_id is null
     or p_row.data_class in ('kernel', 'relation') then
    o_doc := v_base || '{}'::jsonb;
    return;
  end if;

  v_out := case when p_row.data ? '_derived' then custom.computed_block(p_row.data -> '_derived')
                else '{}'::jsonb end;
  v_plain := v_base || v_out;

  v_tk := 'tf:' || coalesce(p_row.organization_id::text, '-') || ':' || p_row.table_id::text;
  if not (o_cache ? v_tk) then
    o_cache := o_cache || jsonb_build_object(v_tk,
                 to_jsonb(custom.table_type_field(p_row.organization_id, p_row.table_id)));
  end if;
  v_tf := o_cache ->> v_tk;
  if v_tf is not null then
    v_rtype := p_row.data ->> v_tf;
  end if;

  v_pk := 'af:' || coalesce(p_row.organization_id::text, '-') || ':' || p_row.table_id::text || ':'
       || case when v_rtype is null then 'n' else 'v:' || v_rtype end;
  if not (o_cache ? v_pk) then
    select coalesce(jsonb_agg(a.data order by a.ordinality), '[]'::jsonb) into v_plan
      from custom.applicable_fields(p_row.organization_id, p_row.table_id, v_rtype) with ordinality as a
     where custom.parity_type(a.data) in ('lookup', 'rollup', 'formula')
       and coalesce(a.data ->> 'compute_on', '') = 'read';
    o_cache := o_cache || jsonb_build_object(v_pk, v_plan);
  end if;

  -- CHAIR-SHEET-STORE (a): A COLUMN THAT CANNOT BE WORKED OUT SAYS WHY (Law 4). The value is
  -- still empty, and the read still answers; the reason goes beside it in `_errors`, keyed by the
  -- column's key, in the store's own sentence ("This formula divides by zero."). The grid draws
  -- "#ERROR" with that sentence (records-ui cellMarks.tsx). custom.mask_document keeps only the
  -- keys this reader may see.
  for f in select e from jsonb_array_elements(o_cache -> v_pk) e loop
    v_try := custom._derived_attempt(p_row.organization_id, p_row.id, f, v_plain);
    v_out := v_out || jsonb_build_object(f ->> 'key', v_try -> 'v');
    if v_try ? 'e' then
      v_errs := v_errs || jsonb_build_object(f ->> 'key', v_try -> 'e');
    end if;
  end loop;
  o_doc := v_base || coalesce(v_out, '{}'::jsonb)
           || case when v_errs = '{}'::jsonb then '{}'::jsonb
                   else jsonb_build_object('_errors', v_errs) end;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.mask_document(p_document jsonb, p_visible_keys text[], p_notices jsonb, p_by_id boolean DEFAULT false, p_key_ids jsonb DEFAULT '{}'::jsonb, p_declared_keys text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
-- CHAIR-READPERF (2026-10-03): the same one expression as before, as a plpgsql body. A SQL-language
-- function that carries a SET clause is never inlined and is parsed and planned again on every call
-- (0.13 ms a record under the read door); plpgsql keeps the plan for the session.
declare
  v_out  jsonb;
  v_errs jsonb;
begin
  -- CHAIR-SHEET-STORE (a): `_errors` (why a worked-out column is empty on this read, by column key)
  -- is masked like the columns it names: a reason is kept only for a column this reader sees (or one
  -- with no Field at all), and it is keyed by Field id when the read is by id. Never `null`ed in place.
  if jsonb_typeof(p_document -> '_errors') = 'object' then
    select jsonb_object_agg(case when p_by_id then coalesce(p_key_ids ->> x.key, x.key) else x.key end, x.value)
      into v_errs
      from jsonb_each(p_document -> '_errors') x
     where x.key = any (p_visible_keys)
        or (p_declared_keys is not null and not (x.key = any (p_declared_keys)));
  end if;
  p_document := p_document - '_errors';

  select jsonb_object_agg(
           case when p_by_id then coalesce(p_key_ids ->> e.key, e.key) else e.key end,
           case
             -- Visible: the reader's level reaches this declared field.
             when e.key = any (p_visible_keys) then e.value
             -- Not declared at all: there is no Field record, so there is no
             -- sensitivity, no level and no notice — nothing to withhold it FROM.
             -- The document's own value is the only truth about this key.
             -- `p_declared_keys` null means the caller did not compute the list,
             -- and then nothing is treated as undeclared: the old behaviour, exact.
             when p_declared_keys is not null and not (e.key = any (p_declared_keys))
               then e.value
             -- Declared, and this reader may not see it. Nulled, with its notice.
             else 'null'::jsonb
           end)
    into v_out
    from jsonb_each(coalesce(p_document, '{}'::jsonb)) e;
  return coalesce(v_out, '{}'::jsonb)
      || case when v_errs is null then '{}'::jsonb else jsonb_build_object('_errors', v_errs) end
      || case when p_notices = '{}'::jsonb then '{}'::jsonb
              else jsonb_build_object('_hidden', p_notices) end;
end;
$function$;
