-- LANE OLD-TABLES-2 — W2, THE OLDER STORE'S WORDS DOOR. THE RED TWIN. Ends in ROLLBACK.
--
-- A guard you cannot show FAILING is not a guard. This file breaks the door in the two exact
-- ways OLD-TABLES-CUTOVER rev 2 says W2 is most likely to be got wrong, and asserts that the
-- damage is REAL and VISIBLE. Both arms replace `workbench._udt_row_words`'s body inside one
-- transaction and ROLL BACK, so the live door is byte-identical when this file ends.
--
--   ARM 1 — THE LADDER REMOVED. With the per-record check gone, a colleague who was shared
--           neither Rincon table reads the customers' real names. The withheld sentence is what
--           stands between her and them, and this arm shows it doing that work.
--
--   ARM 2 — THE PER-RECORD ARM REPLACED BY A TABLE-LEVEL CHECK. This is the mistake the plan
--           says this wave is most likely to make, and the reason `_udt_row_granted` exists:
--           `workbench.udt_dataset_access(table_id,'viewer')` is NARROWER than the row's own
--           `std_select`, so a seat holding a grant on ONE ROW and no access to its table is
--           told "A record you have not been given access to" about a row it may read. A false
--           refusal, not a leak — and a screen that refuses a person their own record still
--           lies (DD-175).
--
-- RUN IT:  psql "$DSN" -f scripts/campaign-tests/udtwords_red.sql

\set ON_ERROR_STOP on
\timing off

\set suite 'udtwords_red.sql'
\set requires 'function:workbench.udt_row_words_many|function:workbench._udt_row_granted|row:workbench.udt_datasets:id = \'415c3e23-2f90-4c66-9040-b246fa1c4b36\''
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

\echo ''
\echo '── ARM 1 · the ladder removed — the colleague reads the households ────────────────────'

begin;

-- The SAME body, with the ladder block (a) deleted and NOTHING else changed.
create or replace function workbench._udt_row_words(
  p_organization_id uuid,
  p_row_id          uuid,
  p_display         jsonb   default null,
  p_hop             integer default 0)
returns text
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_table uuid;
  v_data  jsonb;
  v_meta  jsonb;
  v_cols  text[];
  v_sep   text;
  v_parts text[] := '{}'::text[];
  v_raw   text;
  v_one   text;
  v_label text;
  c       text;
  k_uuid  constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
begin
  if p_row_id is null then return null; end if;
  select r.table_id, r.data, d.metadata into v_table, v_data, v_meta
    from workbench.udt_dataset_rows r
    join workbench.udt_datasets d on d.id = r.table_id
   where r.organization_id = p_organization_id and r.id = p_row_id
     and r.deleted_at is null and d.deleted_at is null;
  if not found then return null; end if;

  -- ☠ THE LADDER IS GONE. This is the mutilation.

  if p_display is not null and jsonb_typeof(p_display -> 'columns') = 'array' then
    select array_agg(e.value #>> '{}' order by e.ordinality) into v_cols
      from jsonb_array_elements(p_display -> 'columns') with ordinality e;
    v_sep := coalesce(p_display ->> 'separator', ' ');
    foreach c in array coalesce(v_cols, '{}'::text[]) loop
      v_raw := nullif(btrim(coalesce(v_data ->> c, '')), '');
      if v_raw is not null and v_raw !~ k_uuid then v_parts := v_parts || v_raw; end if;
    end loop;
    if array_length(v_parts, 1) is not null then
      return array_to_string(v_parts, coalesce(v_sep, ' '));
    end if;
  end if;

  if jsonb_typeof(v_meta -> 'row_label') = 'object'
     and (v_meta -> 'row_label' ->> 'kind') = 'field' then
    v_label := nullif(btrim(coalesce(v_meta -> 'row_label' ->> 'field', '')), '');
  end if;
  v_raw := coalesce(
    case when v_label is not null then nullif(btrim(coalesce(v_data ->> v_label, '')), '') end,
    nullif(btrim(coalesce(v_data ->> 'name', '')), ''),
    nullif(btrim(coalesce(v_data ->> 'title', '')), ''),
    nullif(btrim(coalesce(v_data ->> 'label', '')), ''),
    nullif(btrim(coalesce(v_data ->> 'full_name', '')), ''),
    nullif(btrim(coalesce(v_data ->> 'company', '')), ''),
    nullif(btrim(coalesce(v_data ->> 'subject', '')), ''),
    custom._first_words(v_data));
  if v_raw is not null and v_raw !~ k_uuid then return v_raw; end if;
  return 'an untitled row';
end
$fn$;

do $t$
declare
  c_other_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org       constant uuid := '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f';
  v_customers constant uuid := '415c3e23-2f90-4c66-9040-b246fa1c4b36';
  v_ids   uuid[];
  v_leak  text;
  v_n     integer;
begin
  select array_agg(r.id) into v_ids
    from workbench.udt_dataset_rows r
   where r.table_id = v_customers and r.deleted_at is null;

  perform set_config('request.jwt.claims', c_other_j, true);
  perform set_config('role', 'authenticated', true);

  select count(*), min(w.words) into v_n, v_leak
    from workbench.udt_row_words_many(v_org, '"household"'::jsonb, v_ids) w
   where w.words <> platform.relation_withheld_label();

  perform set_config('role', 'postgres', true);
  if v_n = 0 then
    raise exception 'ARM 1 DID NOT GO RED: the ladder was removed and the colleague still read nothing. The suite is not load-bearing.';
  end if;
  raise notice 'ARM 1 RED — with the ladder removed the colleague read % of % households, starting with %. That is the leak the door prevents.',
    v_n, array_length(v_ids, 1), v_leak;
end
$t$;

rollback;

\echo ''
\echo '── ARM 2 · the per-record arm replaced by the table-level check ───────────────────────'

begin;

-- The SAME body, with the per-record arm replaced by `udt_dataset_access(table_id,'viewer')`
-- alone — the narrower check the plan warns about — and NOTHING else changed.
create or replace function workbench._udt_row_words(
  p_organization_id uuid,
  p_row_id          uuid,
  p_display         jsonb   default null,
  p_hop             integer default 0)
returns text
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_table uuid;
  v_data  jsonb;
  v_meta  jsonb;
  v_me    uuid;
  v_cols  text[];
  v_sep   text;
  v_parts text[] := '{}'::text[];
  v_raw   text;
  v_label text;
  c       text;
  k_uuid  constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
begin
  if p_row_id is null then return null; end if;
  select r.table_id, r.data, d.metadata into v_table, v_data, v_meta
    from workbench.udt_dataset_rows r
    join workbench.udt_datasets d on d.id = r.table_id
   where r.organization_id = p_organization_id and r.id = p_row_id
     and r.deleted_at is null and d.deleted_at is null;
  if not found then return null; end if;

  -- ☠ THE TABLE DECIDES FOR THE ROW. `_udt_row_granted` is never asked.
  v_me := custom.query_principal();
  if v_me is not null
     and not workbench.udt_dataset_access(v_table, 'viewer'::public.permission_level) then
    return platform.relation_withheld_label();
  end if;

  if p_display is not null and jsonb_typeof(p_display -> 'columns') = 'array' then
    select array_agg(e.value #>> '{}' order by e.ordinality) into v_cols
      from jsonb_array_elements(p_display -> 'columns') with ordinality e;
    v_sep := coalesce(p_display ->> 'separator', ' ');
    foreach c in array coalesce(v_cols, '{}'::text[]) loop
      v_raw := nullif(btrim(coalesce(v_data ->> c, '')), '');
      if v_raw is not null and v_raw !~ k_uuid then v_parts := v_parts || v_raw; end if;
    end loop;
    if array_length(v_parts, 1) is not null then
      return array_to_string(v_parts, coalesce(v_sep, ' '));
    end if;
  end if;

  if jsonb_typeof(v_meta -> 'row_label') = 'object'
     and (v_meta -> 'row_label' ->> 'kind') = 'field' then
    v_label := nullif(btrim(coalesce(v_meta -> 'row_label' ->> 'field', '')), '');
  end if;
  v_raw := coalesce(
    case when v_label is not null then nullif(btrim(coalesce(v_data ->> v_label, '')), '') end,
    nullif(btrim(coalesce(v_data ->> 'name', '')), ''),
    nullif(btrim(coalesce(v_data ->> 'title', '')), ''),
    nullif(btrim(coalesce(v_data ->> 'label', '')), ''),
    nullif(btrim(coalesce(v_data ->> 'full_name', '')), ''),
    nullif(btrim(coalesce(v_data ->> 'company', '')), ''),
    nullif(btrim(coalesce(v_data ->> 'subject', '')), ''),
    custom._first_words(v_data));
  if v_raw is not null and v_raw !~ k_uuid then return v_raw; end if;
  return 'an untitled row';
end
$fn$;

do $t$
declare
  c_other_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  c_other_id constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  v_org       constant uuid := '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f';
  v_customers constant uuid := '415c3e23-2f90-4c66-9040-b246fa1c4b36';
  v_one   uuid;
  v_words text;
  v_rls   boolean;
begin
  select r.id into v_one
    from workbench.udt_dataset_rows r
   where r.table_id = v_customers and r.deleted_at is null
     and r.data ->> 'household' = 'Maria Delgado';
  if v_one is null then
    raise exception 'ARM 2: the Rincon Customers table no longer holds the Maria Delgado household';
  end if;

  -- The grant the row's own policy honours and the table-level check cannot see.
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org, 'udt_dataset_rows', v_one, c_other_id, 'viewer', 'active');

  perform set_config('request.jwt.claims', c_other_j, true);
  perform set_config('role', 'authenticated', true);

  -- What the ROW'S OWN RLS says this seat may read — the truth the door must agree with.
  select exists (select 1 from workbench.udt_dataset_rows r where r.id = v_one) into v_rls;
  select w.words into v_words
    from workbench.udt_row_words_many(v_org, '"household"'::jsonb, array[v_one]) w;

  perform set_config('role', 'postgres', true);

  if not v_rls then
    raise exception 'ARM 2 IS NOT SET UP: the row''s own policy does NOT let this seat read it, so there is nothing for the table-level check to get wrong.';
  end if;
  if v_words is distinct from platform.relation_withheld_label() then
    raise exception 'ARM 2 DID NOT GO RED: the table-level check still answered % for a row the seat holds a grant on. The suite is not load-bearing.',
      coalesce(v_words, '(nothing)');
  end if;
  raise notice 'ARM 2 RED — the row''s own policy lets this seat read it, and the table-level check answered "%". That is the false refusal _udt_row_granted exists to prevent.',
    v_words;
end
$t$;

rollback;

\echo ''
\echo '── the live door is restored by the rollback — verifying ──────────────────────────────'

do $$
declare
  v_src text;
begin
  select p.prosrc into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'workbench' and p.proname = '_udt_row_words';
  if v_src !~ '_udt_row_granted' then
    raise exception 'THE ROLLBACK DID NOT RESTORE THE DOOR: workbench._udt_row_words no longer asks _udt_row_granted.';
  end if;
  if v_src ~ 'THE LADDER IS GONE' or v_src ~ 'THE TABLE DECIDES FOR THE ROW' then
    raise exception 'THE ROLLBACK DID NOT RESTORE THE DOOR: a mutilated body is still live.';
  end if;
  raise notice 'RESTORED — workbench._udt_row_words is the shipped body again, ladder and per-record arm intact';
end $$;

\echo ''
\echo '── udtwords_red.sql: both arms went RED and the live door is unchanged ────────────────'
