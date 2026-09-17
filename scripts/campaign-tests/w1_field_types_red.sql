-- W1-FIELD-TYPES — THE RED TWIN of `w1_field_types_c41.sql` (BUILD-BOOK rule 2).
--
-- Every guard this lane added is demonstrated FAILING, by removing the production object
-- that holds it and showing the write it refuses LAND, or the value it computes come back
-- empty. Nothing is hand-weakened in a shared file and nothing survives the run: the whole
-- script is one transaction that ends in ROLLBACK, and the objects it drops are restored by
-- that rollback, not by a second script somebody has to remember to run.
--
--   RED 1  `custom_record_field_type_parity_guard` dropped -> all SEVEN declarations
--          `w1_field_types_c41.sql` clause J refuses now LAND: a field calling itself a
--          `barcode`, a `currency` with no unit, a lookup with nothing to read through, a
--          rollup along a single relation, a rollup stamped at write time, an attachment
--          that cascades and a url with no pattern Rule.
--   RED 2  `custom_record_zz_derived_fields` dropped -> the write-time formula goes STALE
--          AND SILENT: the input moves 400 -> 1000 and the stamped answer still reads 440,
--          where clause F reads 1100. Not missing - wrong, which is the worse failure.
--   RED 3  `custom.derived_values` removed from `custom.record_values` (W1-VAL's body
--          restored verbatim, which is what the lane's inverse does) -> the lookup, the
--          rollup and the formula all read back NULL, where clauses A, C, D and E read
--          "Parity Person", 350 and 440.
--   RED 4  the DISTINCT removed from `custom.relation_targets` -> the rollup answers 450
--          instead of 350: the same line listed twice is counted twice. This is the one
--          that matters most, because the GREEN number alone cannot tell the two apart.
--
--   PSQL="$(pnpm -s exec tsx scripts/lib/psql-path.ts --print)"
--   "$PSQL" "$SUPABASE_BRANCH_DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/w1_field_types_red.sql

\set ON_ERROR_STOP on
\timing off

begin;

-- ── RED 1 ─────────────────────────────────────────────────────────────────────────────
drop trigger custom_record_field_type_parity_guard on custom.record;

do $r1$
declare
  v_org  constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_tbl  constant uuid := '11111111-0005-4000-8000-000000000003';
  v_case record;
  v_n    integer := 0;
begin
  for v_case in
    select * from (values
      ('a name nobody ships',        '{"key":"title","label":"Bad name","parity_type":"barcode","type":"text","multi":false,"dated":false,"rules":[],"config":{},"source":"manual","sensitivity":"internal","context_policy":"include","depends_on":[],"applies_to_types":[]}'::jsonb),
      ('a contradictory declaration','{"key":"title","label":"Fake currency","parity_type":"currency","type":"range","multi":false,"dated":false,"rules":[],"config":{"kind":"number"},"source":"manual","sensitivity":"internal","context_policy":"include","depends_on":[],"applies_to_types":[]}'::jsonb),
      ('a blind lookup',             '{"key":"title","label":"Blind lookup","parity_type":"lookup","type":"formula","compute_on":"read","multi":false,"dated":false,"rules":[],"config":{"pick":"full_name"},"source":"synced","sensitivity":"internal","context_policy":"include","depends_on":[],"applies_to_types":[]}'::jsonb),
      ('a single-relation rollup',   '{"key":"title","label":"Single rollup","parity_type":"rollup","type":"formula","compute_on":"read","multi":false,"dated":false,"rules":[],"config":{"via":"owner","of":"full_name","agg":"count"},"source":"formula","sensitivity":"internal","context_policy":"include","depends_on":[],"applies_to_types":[]}'::jsonb),
      ('a stale-by-design rollup',   '{"key":"title","label":"Stale rollup","parity_type":"rollup","type":"formula","compute_on":"write","multi":false,"dated":false,"rules":[],"config":{"via":"lines","of":"amount","agg":"sum"},"source":"formula","sensitivity":"internal","context_policy":"include","depends_on":[],"applies_to_types":[]}'::jsonb),
      ('a cascading attachment',     '{"key":"title","label":"Cascading photo","parity_type":"attachment","type":"relation","relation_target":"11111111-0000-4000-8000-000000000006","relation_max":1,"on_target_delete":"cascade","multi":false,"dated":false,"rules":[],"config":{},"source":"manual","sensitivity":"internal","context_policy":"include","depends_on":[],"applies_to_types":[]}'::jsonb),
      ('a url with no pattern Rule','{"key":"title","label":"Loose url","parity_type":"url","type":"text","format":"url","multi":false,"dated":false,"rules":[],"config":{},"source":"manual","sensitivity":"internal","context_policy":"include","depends_on":[],"applies_to_types":[]}'::jsonb)
    ) as t(what, decl)
  loop
    insert into custom.record (id, organization_id, table_id, data_class, data)
    values (gen_random_uuid(), v_org, custom.field_kernel_id(), 'field',
            v_case.decl || jsonb_build_object('entity_definition_id', v_tbl::text));
    v_n := v_n + 1;
    raise notice 'RED 1 — % LANDED with custom_record_field_type_parity_guard gone', v_case.what;
  end loop;
  if v_n <> 7 then
    raise exception 'RED 1 INCONCLUSIVE: only % of seven landed', v_n;
  end if;
  raise notice 'RED 1 CONFIRMED — all seven declarations the guard refuses LAND without it';
end;
$r1$;

rollback;

-- ── RED 2 ─────────────────────────────────────────────────────────────────────────────
begin;
drop trigger custom_record_zz_derived_fields on custom.record;

do $r2$
declare
  v_org constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_rec constant uuid := '11111111-0009-4000-8000-000000000011';
  v_v   jsonb;
begin
  update custom.record set data = jsonb_set(data, '{amount_usd}', '1000'::jsonb)
   where organization_id = v_org and id = v_rec;
  -- The answer is not MISSING, which would at least be visible. It is STALE: the input now
  -- says 1000 and the stamped answer still says 440, and a reader has no way to tell.
  select p.value into v_v from custom.parity_values(v_org, v_rec) p where p.field_key = 'amount_with_tax';
  if (v_v #>> '{}')::numeric <> 440 then
    raise exception 'RED 2 INCONCLUSIVE: expected the stale 440 to survive, and the formula answered %', v_v;
  end if;
  raise notice 'RED 2 CONFIRMED — the input moved 400 -> 1000 and the stamped answer is still 440: STALE, silently, where clause F reads 1100';
end;
$r2$;

rollback;

-- ── RED 3 and RED 4 ───────────────────────────────────────────────────────────────────
begin;

-- W1-VAL's body, verbatim: `custom.derived_values` is simply not called.
create or replace function custom.record_values(p_organization_id uuid, p_record_id uuid)
 returns jsonb language sql stable set search_path to 'pg_catalog'
as $function$
  select (r.data - '_computed' - '_retired' - '_values' - '_sources')
         || coalesce((select jsonb_object_agg(e.key, e.value -> 'value')
                        from jsonb_each(coalesce(r.data -> '_computed', '{}'::jsonb)) e),
                     '{}'::jsonb)
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id;
$function$;

do $r3$
declare
  v_org constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_rec constant uuid := '11111111-0009-4000-8000-000000000011';
  v_n   integer;
begin
  select count(*) into v_n from custom.parity_values(v_org, v_rec) p
   where p.field_key in ('owner_name', 'line_total', 'amount_with_tax') and p.value is not null;
  if v_n <> 0 then
    raise exception 'RED 3 INCONCLUSIVE: % of the three computed parity Values still answered', v_n;
  end if;
  raise notice 'RED 3 CONFIRMED — the lookup, the rollup and the write-time formula all read back as nothing';
end;
$r3$;

rollback;

begin;
-- The DISTINCT removed, and nothing else.
create or replace function custom.relation_targets(p_organization_id uuid, p_record_id uuid, p_via_key text)
  returns setof uuid language sql stable set search_path to 'pg_catalog'
as $function$
  select (t #>> '{}')::uuid
    from custom.record r
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(r.data -> p_via_key) = 'array' then r.data -> p_via_key
           when r.data ? p_via_key and jsonb_typeof(r.data -> p_via_key) = 'string'
                then jsonb_build_array(r.data -> p_via_key)
           else '[]'::jsonb end) t
   where r.organization_id = p_organization_id
     and r.id = p_record_id
     and r.deleted_at is null
     and (t #>> '{}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
$function$;

do $r4$
declare
  v_org constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_rec constant uuid := '11111111-0009-4000-8000-000000000011';
  v_v   jsonb;
begin
  select p.value into v_v from custom.parity_values(v_org, v_rec) p where p.field_key = 'line_total';
  if (v_v #>> '{}')::numeric <> 450 then
    raise exception 'RED 4 INCONCLUSIVE: without DISTINCT the rollup answered % and the double-counted sum is 450', v_v;
  end if;
  raise notice 'RED 4 CONFIRMED — the same line listed twice is counted twice: 450, where clause D reads 350';
end;
$r4$;

rollback;
