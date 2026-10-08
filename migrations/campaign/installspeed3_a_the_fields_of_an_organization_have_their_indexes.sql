-- additive: yes
-- adds two partial btree indexes to each of the sixteen partitions of custom.record (field-kernel rows only), built CONCURRENTLY so no write waits for them. Nothing is dropped, altered or rewritten; no data, function, policy or grant is touched.
-- lane: TEMPLATE-INSTALL-SLOW
-- lock: custom
-- AUTOCOMMIT FILE: CREATE INDEX CONCURRENTLY cannot run inside a transaction; apply statement by statement.
--
-- TEMPLATE-INSTALL-SLOW — AN ORGANIZATION'S FIELDS ARE FOUND WITHOUT READING ALL OF THEM.
--
-- Every write into custom.record runs custom._entity_custom_fields_guard, which asks for the Fields
-- of the table being written: `table_id = field_kernel_id() and data ->> 'table_token' = <token>`
-- (live ones, and the archived ones), and the formula readers ask for a Field by
-- `data ->> 'entity_definition_id'` + `data ->> 'key'`. The only way in was
-- (organization_id, table_id, created_at): every Field row of the organization, read and
-- filtered. admin's Workspace holds 5,330 Field rows; the archived-Fields query was a bitmap scan
-- of 2,131 heap blocks (5.3 ms) and the live one 670 blocks (1.1 ms), and an install clears the
-- statement memo with every Field it declares, so each of ~140 trigger runs paid them again —
-- ~0.65 s of the install, against ~0.07 s in an organization with no Fields (measured 2026-10-08
-- with plpgsql_check's profiler, line 175 of the guard). The same shape sits under field_cycle /
-- field_inputs_of, which walk Fields by definition id and key.
--
-- Two partial indexes per partition, on the field-kernel rows only (~104k of the table):
--   record_fieldkernel_token_rp_NN    (organization_id, table_token)
--   record_fieldkernel_def_key_rp_NN  (organization_id, entity_definition_id, key)
-- Measured in a rolled-back build on record_p14: 5.3 ms -> 0.07 ms and 1.1 ms -> 0.03 ms.
--
-- INVERSE: migrations/inverse/installspeed3_a_the_fields_of_an_organization_have_their_indexes_down.sql

create index concurrently if not exists record_fieldkernel_token_rp_00
  on custom.record_p00 (organization_id, (data ->> 'table_token'))
  where table_id = '11111111-0000-4000-8000-000000000002'::uuid;

create index concurrently if not exists record_fieldkernel_token_rp_01
  on custom.record_p01 (organization_id, (data ->> 'table_token'))
  where table_id = '11111111-0000-4000-8000-000000000002'::uuid;

create index concurrently if not exists record_fieldkernel_token_rp_02
  on custom.record_p02 (organization_id, (data ->> 'table_token'))
  where table_id = '11111111-0000-4000-8000-000000000002'::uuid;

create index concurrently if not exists record_fieldkernel_token_rp_03
  on custom.record_p03 (organization_id, (data ->> 'table_token'))
  where table_id = '11111111-0000-4000-8000-000000000002'::uuid;

create index concurrently if not exists record_fieldkernel_token_rp_04
  on custom.record_p04 (organization_id, (data ->> 'table_token'))
  where table_id = '11111111-0000-4000-8000-000000000002'::uuid;

create index concurrently if not exists record_fieldkernel_token_rp_05
  on custom.record_p05 (organization_id, (data ->> 'table_token'))
  where table_id = '11111111-0000-4000-8000-000000000002'::uuid;

create index concurrently if not exists record_fieldkernel_token_rp_06
  on custom.record_p06 (organization_id, (data ->> 'table_token'))
  where table_id = '11111111-0000-4000-8000-000000000002'::uuid;

create index concurrently if not exists record_fieldkernel_token_rp_07
  on custom.record_p07 (organization_id, (data ->> 'table_token'))
  where table_id = '11111111-0000-4000-8000-000000000002'::uuid;

create index concurrently if not exists record_fieldkernel_token_rp_08
  on custom.record_p08 (organization_id, (data ->> 'table_token'))
  where table_id = '11111111-0000-4000-8000-000000000002'::uuid;

create index concurrently if not exists record_fieldkernel_token_rp_09
  on custom.record_p09 (organization_id, (data ->> 'table_token'))
  where table_id = '11111111-0000-4000-8000-000000000002'::uuid;

create index concurrently if not exists record_fieldkernel_token_rp_10
  on custom.record_p10 (organization_id, (data ->> 'table_token'))
  where table_id = '11111111-0000-4000-8000-000000000002'::uuid;

create index concurrently if not exists record_fieldkernel_token_rp_11
  on custom.record_p11 (organization_id, (data ->> 'table_token'))
  where table_id = '11111111-0000-4000-8000-000000000002'::uuid;

create index concurrently if not exists record_fieldkernel_token_rp_12
  on custom.record_p12 (organization_id, (data ->> 'table_token'))
  where table_id = '11111111-0000-4000-8000-000000000002'::uuid;

create index concurrently if not exists record_fieldkernel_token_rp_13
  on custom.record_p13 (organization_id, (data ->> 'table_token'))
  where table_id = '11111111-0000-4000-8000-000000000002'::uuid;

create index concurrently if not exists record_fieldkernel_token_rp_14
  on custom.record_p14 (organization_id, (data ->> 'table_token'))
  where table_id = '11111111-0000-4000-8000-000000000002'::uuid;

create index concurrently if not exists record_fieldkernel_token_rp_15
  on custom.record_p15 (organization_id, (data ->> 'table_token'))
  where table_id = '11111111-0000-4000-8000-000000000002'::uuid;

create index concurrently if not exists record_fieldkernel_def_key_rp_00
  on custom.record_p00 (organization_id, (data ->> 'entity_definition_id'), (data ->> 'key'))
  where table_id = '11111111-0000-4000-8000-000000000002'::uuid;

create index concurrently if not exists record_fieldkernel_def_key_rp_01
  on custom.record_p01 (organization_id, (data ->> 'entity_definition_id'), (data ->> 'key'))
  where table_id = '11111111-0000-4000-8000-000000000002'::uuid;

create index concurrently if not exists record_fieldkernel_def_key_rp_02
  on custom.record_p02 (organization_id, (data ->> 'entity_definition_id'), (data ->> 'key'))
  where table_id = '11111111-0000-4000-8000-000000000002'::uuid;

create index concurrently if not exists record_fieldkernel_def_key_rp_03
  on custom.record_p03 (organization_id, (data ->> 'entity_definition_id'), (data ->> 'key'))
  where table_id = '11111111-0000-4000-8000-000000000002'::uuid;

create index concurrently if not exists record_fieldkernel_def_key_rp_04
  on custom.record_p04 (organization_id, (data ->> 'entity_definition_id'), (data ->> 'key'))
  where table_id = '11111111-0000-4000-8000-000000000002'::uuid;

create index concurrently if not exists record_fieldkernel_def_key_rp_05
  on custom.record_p05 (organization_id, (data ->> 'entity_definition_id'), (data ->> 'key'))
  where table_id = '11111111-0000-4000-8000-000000000002'::uuid;

create index concurrently if not exists record_fieldkernel_def_key_rp_06
  on custom.record_p06 (organization_id, (data ->> 'entity_definition_id'), (data ->> 'key'))
  where table_id = '11111111-0000-4000-8000-000000000002'::uuid;

create index concurrently if not exists record_fieldkernel_def_key_rp_07
  on custom.record_p07 (organization_id, (data ->> 'entity_definition_id'), (data ->> 'key'))
  where table_id = '11111111-0000-4000-8000-000000000002'::uuid;

create index concurrently if not exists record_fieldkernel_def_key_rp_08
  on custom.record_p08 (organization_id, (data ->> 'entity_definition_id'), (data ->> 'key'))
  where table_id = '11111111-0000-4000-8000-000000000002'::uuid;

create index concurrently if not exists record_fieldkernel_def_key_rp_09
  on custom.record_p09 (organization_id, (data ->> 'entity_definition_id'), (data ->> 'key'))
  where table_id = '11111111-0000-4000-8000-000000000002'::uuid;

create index concurrently if not exists record_fieldkernel_def_key_rp_10
  on custom.record_p10 (organization_id, (data ->> 'entity_definition_id'), (data ->> 'key'))
  where table_id = '11111111-0000-4000-8000-000000000002'::uuid;

create index concurrently if not exists record_fieldkernel_def_key_rp_11
  on custom.record_p11 (organization_id, (data ->> 'entity_definition_id'), (data ->> 'key'))
  where table_id = '11111111-0000-4000-8000-000000000002'::uuid;

create index concurrently if not exists record_fieldkernel_def_key_rp_12
  on custom.record_p12 (organization_id, (data ->> 'entity_definition_id'), (data ->> 'key'))
  where table_id = '11111111-0000-4000-8000-000000000002'::uuid;

create index concurrently if not exists record_fieldkernel_def_key_rp_13
  on custom.record_p13 (organization_id, (data ->> 'entity_definition_id'), (data ->> 'key'))
  where table_id = '11111111-0000-4000-8000-000000000002'::uuid;

create index concurrently if not exists record_fieldkernel_def_key_rp_14
  on custom.record_p14 (organization_id, (data ->> 'entity_definition_id'), (data ->> 'key'))
  where table_id = '11111111-0000-4000-8000-000000000002'::uuid;

create index concurrently if not exists record_fieldkernel_def_key_rp_15
  on custom.record_p15 (organization_id, (data ->> 'entity_definition_id'), (data ->> 'key'))
  where table_id = '11111111-0000-4000-8000-000000000002'::uuid;

do $check$
declare v_bad text;
begin
  select string_agg(w.n, ', ') into v_bad
    from (values
    ('record_fieldkernel_token_rp_00'),
    ('record_fieldkernel_token_rp_01'),
    ('record_fieldkernel_token_rp_02'),
    ('record_fieldkernel_token_rp_03'),
    ('record_fieldkernel_token_rp_04'),
    ('record_fieldkernel_token_rp_05'),
    ('record_fieldkernel_token_rp_06'),
    ('record_fieldkernel_token_rp_07'),
    ('record_fieldkernel_token_rp_08'),
    ('record_fieldkernel_token_rp_09'),
    ('record_fieldkernel_token_rp_10'),
    ('record_fieldkernel_token_rp_11'),
    ('record_fieldkernel_token_rp_12'),
    ('record_fieldkernel_token_rp_13'),
    ('record_fieldkernel_token_rp_14'),
    ('record_fieldkernel_token_rp_15'),
    ('record_fieldkernel_def_key_rp_00'),
    ('record_fieldkernel_def_key_rp_01'),
    ('record_fieldkernel_def_key_rp_02'),
    ('record_fieldkernel_def_key_rp_03'),
    ('record_fieldkernel_def_key_rp_04'),
    ('record_fieldkernel_def_key_rp_05'),
    ('record_fieldkernel_def_key_rp_06'),
    ('record_fieldkernel_def_key_rp_07'),
    ('record_fieldkernel_def_key_rp_08'),
    ('record_fieldkernel_def_key_rp_09'),
    ('record_fieldkernel_def_key_rp_10'),
    ('record_fieldkernel_def_key_rp_11'),
    ('record_fieldkernel_def_key_rp_12'),
    ('record_fieldkernel_def_key_rp_13'),
    ('record_fieldkernel_def_key_rp_14'),
    ('record_fieldkernel_def_key_rp_15')) w(n)
    left join pg_catalog.pg_class c
      on c.relname = w.n and c.relkind = 'i'
     and c.relnamespace = 'custom'::regnamespace
    left join pg_catalog.pg_index i on i.indexrelid = c.oid
   where i.indisvalid is not true or i.indisready is not true;
  if v_bad is not null then
    raise exception 'installspeed3 indexes not valid: % — the named index is invalid; remove it by hand and re-run the file', v_bad;
  end if;
end
$check$;
