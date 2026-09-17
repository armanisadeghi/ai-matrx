-- W1-VAL — THE RED TWIN of `w1_val_t5.sql`. It turns this lane's two enforcement points OFF
-- inside ONE transaction that ends in ROLLBACK, and proves that every write `w1_val_t5.sql`
-- watches being REFUSED then LANDS. A guard that cannot be demonstrated failing is not a
-- guard (§3 rule 2), and a refusal nobody has seen disappear is a refusal nobody has tested.
--
-- RUN IT:
--   PSQL="$(pnpm -s exec tsx scripts/lib/psql-path.ts --print)"
--   "$PSQL" "$SUPABASE_BRANCH_DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/w1_val_red.sql
--
-- IT IS NOT A MIGRATION: it lives outside `migrations/`, no sweep can see it, and it rolls
-- back. It refuses to run anywhere but the rehearsal branch, by system identifier.
--
-- WHAT IT REMOVES, and therefore what each removal proves:
--   · trigger `_value_envelope`      → the actor is no longer resolved or refused, the
--                                      provenance is no longer interned, the author and the
--                                      version are no longer stamped from the write.
--   · constraint `record_value_envelope` → the envelope's shape is no longer law: a confidence
--                                      score, a per-value visibility, a fifth absence word and
--                                      a dangling pointer all become storable.
--   · `custom.record_values`' two subtractions → the plain read starts returning the envelope
--                                      block as if it were one of the record's own values.

\set ON_ERROR_STOP on
\timing off

begin;

do $t$
declare
  v_org    constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';  -- Matrx System
  v_person uuid;
  v_rec    uuid;
  v_doc    jsonb;
  v_j      jsonb;
  v_landed integer := 0;
begin
  if (pg_control_system()).system_identifier <> 7678069749886157684 then
    raise exception 'w1_val_red.sql refuses to run here: system_identifier is %, and this file may only run on the rehearsal branch (7678069749886157684)',
                    (pg_control_system()).system_identifier;
  end if;

  -- THE FIXTURE, identical to the GREEN suite's.
  v_person := custom.table_declare(v_org, jsonb_build_object(
    'name', 'W1-VAL Person (red)', 'slug', 'w1_val_person_red', 'type', 'entity',
    'label_singular', 'Person', 'label_plural', 'People',
    'title_field', 'full_name', 'display', 'page', 'weight', 'light',
    'ordered', false, 'row_order', 'sorted', 'default_sort', '[]'::jsonb,
    'agent_writable', true, 'retention_days', 365,
    'fields', jsonb_build_array(jsonb_build_object('name','full_name'), jsonb_build_object('name','phone')),
    'parent_id', '11111111-0000-4000-8000-000000000001'));

  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
    'key', 'full_name', 'label', 'Full name', 'type', 'text', 'sort', 10,
    'required', false, 'multi', false, 'dated', false, 'source', 'manual',
    'config', '{}'::jsonb, 'rules', '[]'::jsonb, 'depends_on', '[]'::jsonb,
    'sensitivity', 'internal', 'source_config', '{}'::jsonb, 'context_policy', 'include',
    'applies_to_types', '[]'::jsonb, 'entity_definition_id', v_person));

  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
    'key', 'phone', 'label', 'Phone', 'type', 'text', 'sort', 20,
    'required', false, 'multi', false, 'dated', false, 'source', 'manual',
    'config', '{}'::jsonb, 'rules', '[]'::jsonb, 'depends_on', '[]'::jsonb,
    'sensitivity', 'internal', 'source_config', '{}'::jsonb, 'context_policy', 'include',
    'applies_to_types', '[]'::jsonb, 'entity_definition_id', v_person));

  -- ══════════════════════════════════════════════════════════════════════════
  -- OFF. Both enforcement points, and the read's two subtractions.
  -- ══════════════════════════════════════════════════════════════════════════
  alter table custom.record drop constraint record_value_envelope;
  drop trigger _value_envelope on custom.record;

  -- ── RED 1: an author outside the vocabulary, and a retired word, both LAND ──
  v_rec := custom.record_write(v_org, v_person, jsonb_build_object(
    '_actor', 'robot',
    'full_name', 'Wei Chen',
    'phone', '+1-415-555-0101',
    '_values', jsonb_build_object('phone', jsonb_build_object('actor', 'human', 'ver', 99))));
  select data into v_doc from custom.record where organization_id = v_org and id = v_rec;
  if (v_doc ->> '_actor') <> 'robot' then
    raise exception 'RED 1: with the trigger gone, "robot" should have been stored verbatim, and the document says %', v_doc ->> '_actor';
  end if;
  if (v_doc -> '_values' -> 'phone' ->> 'actor') <> 'human' then
    raise exception 'RED 1: with the trigger gone, the retired word "human" should have survived as the author, and it says %', v_doc -> '_values' -> 'phone' ->> 'actor';
  end if;
  if (v_doc -> '_values' -> 'phone' ->> 'ver') <> '99' then
    raise exception 'RED 1: with the trigger gone, a forged version 99 should have survived, and it says %', v_doc -> '_values' -> 'phone' ->> 'ver';
  end if;
  v_landed := v_landed + 1;
  raise notice 'RED 1 — VAL-8 is OFF: "robot" is the author, "human" is a value''s author, version 99 was invented by the caller.';

  -- ── RED 2: a confidence score inside an alternate LANDS (ruling (a) is OFF) ──
  update custom.record
     set data = data || jsonb_build_object('_values', jsonb_build_object(
           'phone', jsonb_build_object('ver', 1, 'actor', 'user', 'alternates',
             jsonb_build_array(jsonb_build_object('value', '+1-415-555-0102', 'rank', 2, 'confidence', 0.82)))))
   where organization_id = v_org and id = v_rec;
  select data into v_doc from custom.record where organization_id = v_org and id = v_rec;
  if (v_doc -> '_values' -> 'phone' -> 'alternates' -> 0 ->> 'confidence') is null then
    raise exception 'RED 2: with the constraint gone, a confidence score should have landed inside the alternate';
  end if;
  v_landed := v_landed + 1;
  raise notice 'RED 2 — VAL-3/D-3 is OFF: a confidence score sits inside an alternate.';

  -- ── RED 3: a PER-VALUE visibility LANDS (VAL-5/VAL-6 are OFF) ───────────────
  update custom.record
     set data = data || jsonb_build_object('_values', jsonb_build_object(
           'phone', jsonb_build_object('ver', 1, 'actor', 'user', 'visibility', 'private', 'secret', true)))
   where organization_id = v_org and id = v_rec;
  select data into v_doc from custom.record where organization_id = v_org and id = v_rec;
  if (v_doc -> '_values' -> 'phone' ->> 'visibility') is null then
    raise exception 'RED 3: with the constraint gone, a per-value visibility should have landed';
  end if;
  v_landed := v_landed + 1;
  raise notice 'RED 3 — VAL-5/VAL-6 is OFF: a value carries its own visibility and its own secret flag.';

  -- ── RED 4: a fifth reason for absence, and a pointer to nothing, both LAND ──
  update custom.record
     set data = (data - 'phone') || jsonb_build_object('_values', jsonb_build_object(
           'phone', jsonb_build_object('ver', 1, 'actor', 'user', 'absent', 'dunno', 'src', 's42')))
   where organization_id = v_org and id = v_rec;
  select data into v_doc from custom.record where organization_id = v_org and id = v_rec;
  if (v_doc -> '_values' -> 'phone' ->> 'absent') <> 'dunno' then
    raise exception 'RED 4: with the constraint gone, "dunno" should have landed as a reason a value is missing';
  end if;
  if (v_doc -> '_values' -> 'phone' ->> 'src') <> 's42' then
    raise exception 'RED 4: with the constraint gone, a pointer at a source that does not exist should have landed';
  end if;
  v_landed := v_landed + 1;
  raise notice 'RED 4 — VAL-2 and VAL-1 are OFF: an invented reason for absence, and a pointer at a source nothing describes.';

  -- ── RED 5: the SAME SOURCE interned twice LANDS ─────────────────────────────
  update custom.record
     set data = jsonb_build_object('full_name', 'Wei Chen', 'phone', '+1-415-555-0101')
                || jsonb_build_object('_sources', jsonb_build_object(
                     's1', jsonb_build_object('kind', 'import', 'file', 'chen.csv'),
                     's2', jsonb_build_object('kind', 'import', 'file', 'chen.csv')))
                || jsonb_build_object('_values', jsonb_build_object(
                     'phone', jsonb_build_object('ver', 1, 'actor', 'user', 'src', 's1')))
   where organization_id = v_org and id = v_rec;
  select data into v_doc from custom.record where organization_id = v_org and id = v_rec;
  if (select count(*) from jsonb_object_keys(v_doc -> '_sources')) <> 2 then
    raise exception 'RED 5: with the constraint gone, the same source written twice should have landed as two entries';
  end if;
  v_landed := v_landed + 1;
  raise notice 'RED 5 — VAL-1''s "interned once per save" is OFF: one source, two entries.';

  -- ── RED 6: the plain read LEAKS the envelope once the subtractions go ───────
  v_j := custom.record_values(v_org, v_rec);
  if v_j ? '_values' or v_j ? '_sources' then
    raise exception 'RED 6 setup: the shipped read already leaks the envelope — the GREEN suite''s J would be vacuous';
  end if;
  create or replace function custom.record_values(p_organization_id uuid, p_record_id uuid)
   returns jsonb language sql stable set search_path to 'pg_catalog'
  as $red$
    select (r.data - '_computed' - '_retired')
           || coalesce((select jsonb_object_agg(e.key, e.value -> 'value')
                          from jsonb_each(coalesce(r.data -> '_computed', '{}'::jsonb)) e),
                       '{}'::jsonb)
      from custom.record r
     where r.organization_id = p_organization_id and r.id = p_record_id;
  $red$;
  v_j := custom.record_values(v_org, v_rec);
  if not (v_j ? '_values') or not (v_j ? '_sources') then
    raise exception 'RED 6: with the two subtractions removed, the plain read should return the envelope block as one of the record''s values, and it returned %',
                    (select array_agg(k) from jsonb_object_keys(v_j) k);
  end if;
  v_landed := v_landed + 1;
  raise notice 'RED 6 — the plain read leaks _values and _sources the moment the two subtractions go.';

  if v_landed <> 6 then
    raise exception 'the RED twin proved % of its six removals, and six is the number', v_landed;
  end if;
  raise notice '=== W1-VAL RED — all six writes the GREEN suite watches being REFUSED LAND once this lane''s two enforcement points are removed. Rolling back. ===';
end;
$t$;

rollback;
