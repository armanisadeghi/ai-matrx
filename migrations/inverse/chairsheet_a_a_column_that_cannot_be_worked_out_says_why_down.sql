-- additive: yes
-- chair-step: the INVERSE of migrations/campaign/chairsheet_a_a_column_that_cannot_be_worked_out_says_why.sql.
--   It restores custom.derived_value, custom.record_values_step and the six-argument
--   custom.mask_document exactly as they stood on production on 2026-10-05 before that file, then
--   drops custom._derived_attempt. A column that cannot be worked out reads empty again with no
--   reason. Re-base these bodies on production's current ones before running this after any later
--   file has replaced them.
--
-- lane: CHAIR-SHEET-STORE
-- based-on: custom.derived_value(uuid, uuid, jsonb, jsonb) f4e7ef140a7fdf6e1061701dde0a110a4d19de02652bd533c8310ac2dbfeb986
-- based-on: custom.record_values_step(custom.record, jsonb) 38931cc93bb9359dbd8ff8cd0db9bd0e58ad9dd983b20802b68d027a0e81a873
-- based-on: custom.mask_document(jsonb, text[], jsonb, boolean, jsonb, text[]) 5332eb89fa393b97ccdd74bccd42333924b568eefc66b134ed265520b646e5b0

CREATE OR REPLACE FUNCTION custom.derived_value(p_organization_id uuid, p_record_id uuid, p_field_data jsonb, p_values jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_parity text := custom.parity_type(p_field_data);
begin
  return case v_parity
    when 'lookup'  then custom.lookup_value(p_organization_id, p_record_id, p_field_data)
    when 'rollup'  then custom.rollup_value(p_organization_id, p_record_id, p_field_data)
    when 'formula' then custom.formula_value(p_organization_id, p_record_id, p_field_data, p_values)
    else null
  end;
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
    return null;
end;
$function$

;

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

  for f in select e from jsonb_array_elements(o_cache -> v_pk) e loop
    v_out := v_out || jsonb_build_object(f ->> 'key',
                        custom.derived_value(p_row.organization_id, p_row.id, f, v_plain));
  end loop;
  o_doc := v_base || coalesce(v_out, '{}'::jsonb);
end;
$function$

;

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
  v_out jsonb;
begin
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
      || case when p_notices = '{}'::jsonb then '{}'::jsonb
              else jsonb_build_object('_hidden', p_notices) end;
end;
$function$

;

drop function if exists custom._derived_attempt(uuid, uuid, jsonb, jsonb);
