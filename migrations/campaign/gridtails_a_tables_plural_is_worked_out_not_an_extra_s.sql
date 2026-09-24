-- chair-step: it REPLACES the view custom.table with the same 33 columns in the same order, changing ONE expression — the fallback plural for a Table that stores none, `name || 's'`, becomes `custom.plural_of(name)` — and ADDS one IMMUTABLE function, custom.plural_of(text). A view replacement is refused by name on the production allow-list, so it comes through this route. No grant, table, trigger or row changes. Today the fallback reaches only the nine kernel Tables (every other Table must store its own plural, REC-66). ORDER: after sc1p_the_facts_door_says_who_keeps_each_table.sql (the view below carries that file's three columns; the first statement refuses by name on a database it has not reached). Inverse: migrations/inverse/gridtails_a_tables_plural_is_worked_out_not_an_extra_s_down.sql.
-- lane: GRID-TAILS
-- lock: custom
--
-- THE USE CASE. A table called "Customers" that stores no plural read "Customerss" everywhere a
-- sentence counts its rows, because the store's only pluraliser was "add an s". A person reads a
-- machine's typo. Now: a word ending in s stays as it is (it is already plural, or a word like
-- "Business" or "Class" whose plural a machine should not guess), -y after a consonant becomes
-- -ies ("Company" → "Companies"), -x/-z/-ch/-sh take -es ("Batch" → "Batches"), a handful of
-- irregulars are known ("Person" → "People"), words with no plural stay ("Equipment"), and
-- everything else takes -s. Only the LAST word changes ("Service Call" → "Service Calls").

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Refuse, by name, on a database sc1p has not reached: the view below appends its columns.
do $pre$
begin
  if not exists (select 1 from pg_catalog.pg_attribute
                  where attrelid = 'custom.table'::regclass and attname = 'offered_as_context' and not attisdropped) then
    raise exception 'gridtails_a_tables_plural_is_worked_out_not_an_extra_s.sql runs after sc1p_the_facts_door_says_who_keeps_each_table.sql, which this database has not reached (custom.table has no offered_as_context column).';
  end if;
end
$pre$;

create function custom.plural_of(p_word text)
returns text
language plpgsql
immutable
set search_path to 'pg_catalog'
as $fn$
declare
  v_head  text;
  v_last  text;
  v_low   text;
  v_upper boolean;
  v_out   text;
begin
  if p_word is null or btrim(p_word) = '' then
    return p_word;
  end if;
  -- The last run of letters is the word that takes the plural; anything after it (a digit, a
  -- bracket) means this is a name, not a noun, and it is left exactly as typed.
  v_last := substring(p_word from '([A-Za-z]+)$');
  if v_last is null then
    return p_word;
  end if;
  v_head  := left(p_word, length(p_word) - length(v_last));
  v_low   := lower(v_last);
  v_upper := length(v_last) > 1 and v_last = upper(v_last);

  v_out := case
    -- no plural in ordinary English
    when v_low in ('data', 'information', 'equipment', 'staff', 'feedback', 'software', 'hardware',
                   'media', 'series', 'news', 'inventory', 'furniture', 'research', 'sheep',
                   'fish', 'deer', 'species', 'aircraft', 'people', 'children', 'men', 'women')
      then v_last
    -- the common irregulars
    when v_low = 'person' then left(v_last, 1) || 'eople'
    when v_low = 'child'  then v_last || 'ren'
    when v_low = 'man'    then left(v_last, 1) || 'en'
    when v_low = 'woman'  then left(v_last, 3) || 'en'
    when v_low = 'mouse'  then left(v_last, 1) || 'ice'
    when v_low = 'foot'   then left(v_last, 1) || 'eet'
    when v_low = 'tooth'  then left(v_last, 1) || 'eeth'
    -- already plural, or a word ending in s whose plural a machine must not guess
    when v_low ~ 's$' then v_last
    when v_low ~ '(x|z|ch|sh)$' then v_last || 'es'
    when v_low ~ '[^aeiou]y$' then left(v_last, length(v_last) - 1) || 'ies'
    else v_last || 's'
  end;
  -- An acronym keeps its capitals and takes a small s ("FAQ" → "FAQs"); a shouted word keeps
  -- shouting ("BOX" → "BOXES").
  if v_upper and v_out <> v_last || 's' then
    v_out := upper(v_out);
  end if;
  return v_head || v_out;
end;
$fn$;

comment on function custom.plural_of(text) is
  'GRID-TAILS: the plural of a Table''s name when it stores none — the common English rules on the last word, else the word unchanged. Never "name || s".';

create or replace view custom.table
with (security_invoker = true) as
 SELECT id,
    organization_id,
    COALESCE(data ->> 'slug'::text, lower(data ->> 'name'::text)) AS slug,
    data ->> 'name'::text AS name,
    COALESCE(data ->> 'label_singular'::text, data ->> 'name'::text) AS label_singular,
    COALESCE(data ->> 'label_plural'::text, custom.plural_of(data ->> 'name'::text)) AS label_plural,
    data ->> 'icon'::text AS icon,
    data ->> 'color'::text AS color,
    COALESCE(data ->> 'type'::text, 'entity'::text) AS type,
    COALESCE(data ->> 'type'::text, 'entity'::text) = 'detail'::text AS detail,
    data ->> 'parent_token'::text AS parent_token,
    COALESCE((data ->> 'agent_writable'::text)::boolean, true) AS agent_writable,
    COALESCE(data ->> 'display'::text, 'list'::text) AS display,
    COALESCE((data ->> 'ordered'::text)::boolean, false) AS ordered,
    COALESCE(data ->> 'weight'::text, 'light'::text) AS weight,
    COALESCE((data ->> 'retention_days'::text)::integer, 30) AS retention_days,
    data ->> 'title_field'::text AS title_field,
    COALESCE(data -> 'fields'::text, '[]'::jsonb) AS fields,
    COALESCE(data -> 'default_sort'::text, '[]'::jsonb) AS default_sort,
    COALESCE(data ->> 'row_order'::text, 'sorted'::text) AS row_order,
    custom.containment_parent(data) AS home_id,
    data_class = 'kernel'::text AS is_kernel,
    created_by,
    updated_by,
    created_at,
    updated_at,
    version,
    metadata,
    visibility,
    data,
    (custom.table_placement(organization_id, id, data, data_class = 'kernel'::text) ->> 'kept_by_the_app'::text)::boolean AS kept_by_the_app,
    custom.table_placement(organization_id, id, data, data_class = 'kernel'::text) ->> 'kept_for'::text AS kept_for,
    (custom.table_placement(organization_id, id, data, data_class = 'kernel'::text) ->> 'offered_as_context'::text)::boolean AS offered_as_context
   FROM custom.record r
  WHERE table_id = custom.table_kernel_id() AND deleted_at IS NULL;
