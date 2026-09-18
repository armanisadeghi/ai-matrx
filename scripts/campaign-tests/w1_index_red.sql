-- W1-INDEX — THE RED TWIN of `w1_index_c5.sql`. It turns this lane's enforcement points OFF
-- inside ONE transaction that ends in ROLLBACK, and proves that every refusal the GREEN suite
-- watches happening actually STOPS happening. A guard that cannot be demonstrated failing is
-- not a guard (§3 rule 2), and a refusal nobody has seen disappear is a refusal nobody tested.
--
-- RUN IT:
--   PSQL="$(pnpm -s exec tsx scripts/lib/psql-path.ts --print)"
--   "$PSQL" "$SUPABASE_BRANCH_DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/w1_index_red.sql
--
-- IT IS NOT A MIGRATION: it lives outside `migrations/`, no sweep can see it, and it rolls
-- back. It refuses to run anywhere but the rehearsal branch, by system identifier.
--
-- WHAT IT REMOVES, and therefore what each removal proves:
--   · trigger `zz_promoted_field_cap`          → a NINTH promoted Field lands on a Table
--                                                REC-N-5 caps at eight.
--   · `custom.promoted_value_path`'s derived arm → a Field worked out at READ time gets an
--                                                index over `data ->> 'key'`, which holds
--                                                nothing: REC-N-3's silent wrong answer, built.
--   · trigger `_value_envelope`                → the envelope REC-N-3's punctuation names
--                                                becomes storable, so ruling (b)'s refusal is
--                                                a real refusal rather than an absent shape.
--   · `custom.promote_field`'s child rename     → the concurrent-duplicate refusal goes back to
--                                                quoting `record_pNN_organization_id_expr_idx`,
--                                                which names no field and no table.
--
-- EVERY REMOVAL IS RESTORED BY THE `rollback` AT THE END. Nothing here survives the session.

\set ON_ERROR_STOP on
\timing off

begin;

do $t$
declare
  v_org   constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';  -- Matrx System
  v_table uuid;
  v_fid   uuid;
  v_json  jsonb;
  v_name  text;
  v_msg   text;
  v_n     integer;
  v_red   integer := 0;
begin
  if (pg_control_system()).system_identifier <> 7678069749886157684 then
    raise exception 'w1_index_red.sql refuses to run here: system_identifier is %, and this file may only run on the rehearsal branch (7678069749886157684)',
                    (pg_control_system()).system_identifier;
  end if;

  update platform.feature_knob set value = 'true'::jsonb
   where feature = 'custom' and key = 'field_index_guard';

  v_table := custom.table_declare(v_org, jsonb_build_object(
    'name', 'W1-INDEX RED', 'slug', 'zz_w1_index_red', 'type', 'entity',
    'label_singular', 'Thing', 'label_plural', 'Things', 'title_field', 'code',
    'display', 'page', 'weight', 'light', 'ordered', false, 'row_order', 'sorted',
    'default_sort', '[]'::jsonb, 'agent_writable', true, 'retention_days', 365,
    'fields', jsonb_build_array(jsonb_build_object('name', 'code')) ||
              (select jsonb_agg(jsonb_build_object('name', 'zz_p' || g)) from generate_series(2, 9) g),
    'parent_id', '11111111-0000-4000-8000-000000000001'));

  for v_n in 2..9 loop
    insert into custom.record (organization_id, table_id, data_class, data)
    values (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
      'key', 'zz_p' || v_n, 'label', 'P' || v_n, 'type', 'text', 'sort', v_n, 'required', false,
      'multi', false, 'dated', false, 'source', 'manual', 'config', '{}'::jsonb,
      'rules', '[]'::jsonb, 'depends_on', '[]'::jsonb, 'sensitivity', 'internal',
      'source_config', '{}'::jsonb, 'context_policy', 'include', 'applies_to_types', '[]'::jsonb,
      'promoted', true, 'entity_definition_id', v_table))
    on conflict do nothing;
    exit when v_n = 9;
  end loop;

  -- ── RED 1 — the cap ────────────────────────────────────────────────────────────────────
  select count(*) into v_n from custom.promoted_fields(v_org, v_table);
  if v_n <> 8 then
    raise exception 'RED 1 fixture is wrong: the Table carries % promoted Fields, not the eight the cap allows', v_n;
  end if;
  drop trigger zz_promoted_field_cap on custom.record;
  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
    'key', 'zz_p9', 'label', 'P9', 'type', 'text', 'sort', 9, 'required', false,
    'multi', false, 'dated', false, 'source', 'manual', 'config', '{}'::jsonb,
    'rules', '[]'::jsonb, 'depends_on', '[]'::jsonb, 'sensitivity', 'internal',
    'source_config', '{}'::jsonb, 'context_policy', 'include', 'applies_to_types', '[]'::jsonb,
    'promoted', true, 'entity_definition_id', v_table));
  select count(*) into v_n from custom.promoted_fields(v_org, v_table);
  if v_n <= custom.promoted_field_cap() then
    raise exception 'RED 1 FAILED TO GO RED: the cap trigger is gone and the Table still holds only % promoted Fields', v_n;
  end if;
  v_red := v_red + 1;
  raise notice 'RED 1 — cap trigger dropped: the Table now carries % promoted Fields against a published cap of %. GREEN PART 5 is a real refusal.',
               v_n, custom.promoted_field_cap();

  -- ── RED 2 — REC-N-3's derived arm ──────────────────────────────────────────────────────
  v_json := jsonb_build_object('key', 'zz_derived', 'type', 'text', 'compute_on', 'read');
  if custom.promoted_index_expr(v_json) is not null then
    raise exception 'RED 2 fixture is wrong: a derived Field already answers an expression';
  end if;
  create or replace function custom.promoted_value_path(p_field_data jsonb)
    returns text language sql immutable parallel safe set search_path to 'pg_catalog' as $red$
    select 'stored';
  $red$;
  if custom.promoted_index_expr(v_json) is null then
    raise exception 'RED 2 FAILED TO GO RED: the derived arm is gone and the expression is still NULL';
  end if;
  v_red := v_red + 1;
  raise notice 'RED 2 — derived arm removed: a field worked out at READ time is now indexed at %, a path that holds nothing. GREEN PART 3 is what stops that.',
               custom.promoted_index_expr(v_json);

  -- ── RED 3 — the envelope refusal ───────────────────────────────────────────────────────
  -- THREE doors stand between this store and REC-N-3's envelope, each found by taking the
  -- previous one off, measured 2026-09-17:
  --   1. trigger `_value_envelope`               — refuses the KEY `v` by name.
  --   2. trigger `custom_record_field_validation` — refuses an envelope for a field the Table
  --      never declared ('Provenance nobody can read is worse than none').
  --   3. CHECK constraint `record_value_envelope` — refuses the SHAPE outright, on every
  --      partition, with no trigger involved at all.
  -- All three come off, and that is the finding rather than the obstacle: ruling (b) does not
  -- rest on one guard, and REC-N-3's literal path is refused by the table's own constraint.
  alter table custom.record disable trigger _value_envelope;
  alter table custom.record disable trigger custom_record_field_validation;
  alter table custom.record drop constraint record_value_envelope;
  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, v_table, 'record',
          jsonb_build_object('code', 'red3',
                             '_values', jsonb_build_object('code', jsonb_build_object('v', 'x'))));
  v_red := v_red + 1;
  raise notice 'RED 3 — all three envelope doors removed: `data -> ''_values'' -> ''code'' -> ''v''` stored cleanly. GREEN PART 2''s refusal is a refusal, not an absence.';
  alter table custom.record enable trigger _value_envelope;
  alter table custom.record enable trigger custom_record_field_validation;

  -- ── RED 4 — the child-index rename ROUTE A now does ────────────────────────────────────
  insert into custom.record (organization_id, table_id, data_class, data)
  select v_org, v_table, 'record', jsonb_build_object('code', 'r' || g)
    from generate_series(1, 50) g;

  -- Build the unique index the way `custom.promote_field` built it BEFORE tonight's fix:
  -- `CREATE INDEX` on the partitioned parent, children named by Postgres.
  v_name := 'zz_red_unrenamed';
  execute format('create unique index %I on custom.record (organization_id, ((data->>''code''))) where table_id = %L::uuid and deleted_at is null',
                 v_name, v_table);
  begin
    insert into custom.record (organization_id, table_id, data_class, data)
    values (v_org, v_table, 'record', jsonb_build_object('code', 'r7'));
    raise exception 'RED 4 fixture is wrong: the duplicate landed';
  exception when unique_violation then
    get stacked diagnostics v_msg = message_text;
  end;
  if position('zz_red_unrenamed' in v_msg) > 0 then
    raise exception 'RED 4 FAILED TO GO RED: Postgres named the partition index after its parent, so the defect this fix closes does not exist here. Message: %', v_msg;
  end if;
  v_red := v_red + 1;
  raise notice 'RED 4 — without the rename, the loser of a duplicate write is handed: %', v_msg;
  raise notice 'RED 4 —   with it (GREEN PART 4), the same person is handed a name carrying the field: cpu_<field>_<table hash>_NN.';

  if v_red <> 4 then
    raise exception 'only % of the four RED clauses ran', v_red;
  end if;
  raise notice '=== RED PASS — all four enforcement points were removed and all four failures appeared. Rolling back. ===';
end
$t$;

rollback;
