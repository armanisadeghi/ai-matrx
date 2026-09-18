-- W3-WORK — THE RED TWIN of `scripts/campaign-tests/w3_work_c44.sql`.
--
-- Rule 2: a guard that cannot be demonstrated failing is not a guard. This file turns THIS
-- LANE'S four enforcement points off, one at a time, inside ONE transaction that ROLLS BACK,
-- and asserts that each refusal C-44 relies on DISAPPEARS — and, where the failure is silent
-- rather than loud, that the wrong thing is actually written.
--
--   RED 1 — the transition model. The states stop declaring what they may move to, and the
--           move C-44 watches being refused LANDS.
--   RED 2 — the template judgement. `custom.work_template_refusal` is replaced with one that
--           approves everything, and a `referenced` relation is then written as an OWNED
--           edge — the silent wrong answer the real refusal exists to prevent, counted as a
--           containment edge that should not be there.
--   RED 3 — REC-N-12's UNIQUE. The slot Field is promoted WITHOUT `unique`, and two holds on
--           one slot both commit.
--   RED 4 — this lane's trigger. `zz_w3_work_shape_guard` is dropped and a hold dated in the
--           PAST is written straight into the store, which is the one refusal that belongs to
--           the trigger alone (`custom.validate_values` accepts any parseable date).
--
-- It refuses to run anywhere but the rehearsal branch, by system identifier, and it is not a
-- migration: nothing in `migrations/` and no sweep can see it.
--
--   PSQL="$(pnpm -s exec tsx scripts/lib/psql-path.ts --print)"
--   "$PSQL" "$SUPABASE_BRANCH_DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/w3_work_red.sql

\set ON_ERROR_STOP on
\timing off

begin;

do $r$
declare
  v_org    constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_table  uuid;
  v_take   jsonb;
  v_states uuid;
  v_ns     uuid;
  v_done   uuid;
  v_rec    uuid;
  v_tpl    uuid;
  v_inst   jsonb;
  v_stable uuid;
  v_field  uuid;
  v_n      bigint;
  v_reds   integer := 0;
begin
  if (pg_control_system()).system_identifier <> 7678069749886157684 then
    raise exception 'w3_work_red.sql refuses to run here: system_identifier is %, and this file may only run on the rehearsal branch (7678069749886157684)',
                    (pg_control_system()).system_identifier;
  end if;

  v_table := custom.table_declare(v_org, jsonb_build_object(
    'name','ZZ W3 Work RED','slug','zz_w3_work_red','type','entity',
    'label_singular','Task','label_plural','Tasks','title_field','title',
    'display','page','weight','light','ordered',false,'row_order','sorted',
    'default_sort','[]'::jsonb,'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','title')),
    'parent_id','11111111-0000-4000-8000-000000000001'));
  v_take   := custom.work_take_assignment(v_org, v_table);
  v_states := (v_take ->> 'state_table_id')::uuid;
  select id into v_ns   from custom.record where organization_id=v_org and table_id=v_states and data->>'name'='Not started';
  select id into v_done from custom.record where organization_id=v_org and table_id=v_states and data->>'name'='Done';
  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, v_table, 'record', jsonb_build_object('title','RED','status', v_ns::text))
  returning id into v_rec;

  -- ── RED 1 — the transition model ─────────────────────────────────────────────────────
  update custom.record set data = data - 'next'
   where organization_id = v_org and table_id = v_states;
  update custom.record set data = data || jsonb_build_object('status', v_done::text)
   where organization_id = v_org and id = v_rec;
  if (select data ->> 'status' from custom.record where organization_id=v_org and id=v_rec) <> v_done::text then
    raise exception 'RED 1 did not go red: the forbidden move was still refused with the model removed';
  end if;
  v_reds := v_reds + 1;
  raise notice 'RED 1 — with `next` gone from the states, Not started -> Done LANDED. The refusal C-44 reads is the model, not a coincidence.';

  -- ── RED 2 — the template judgement ───────────────────────────────────────────────────
  create or replace function custom.work_template_refusal(p_graph jsonb)
  returns text language sql immutable set search_path to 'pg_catalog' as $red$ select null::text; $red$;

  v_tpl := custom.work_template_declare(v_org, 'ZZ RED referenced', jsonb_build_object(
    'nodes', jsonb_build_array(jsonb_build_object('ref','a','table',v_table::text,'data',jsonb_build_object('title','A')),
                               jsonb_build_object('ref','b','table',v_table::text,'data',jsonb_build_object('title','B'))),
    'relations', jsonb_build_array(jsonb_build_object('kind','referenced','from','a','to','b'))));
  v_inst := custom.work_template_instantiate(v_org, v_tpl);
  select count(*) into v_n
    from custom.record r
   where r.organization_id = v_org
     and custom.containment_parent(r.data) = (v_inst -> 'refs' ->> 'a')::uuid;
  if v_n <> 1 then
    raise exception 'RED 2 did not go red: the referenced relation was still refused (% contained record(s))', v_n;
  end if;
  v_reds := v_reds + 1;
  raise notice 'RED 2 — with the judgement removed, a `referenced` relation was written as an OWNED edge: % record now CONTAINED inside the other. That is the silent wrong answer the real refusal prevents.', v_n;

  -- ── RED 3 — REC-N-12's UNIQUE ────────────────────────────────────────────────────────
  update platform.feature_knob set value = 'true'::jsonb
   where feature = 'custom' and key = 'field_index_guard';

  v_stable := custom.table_declare(v_org, jsonb_build_object(
    'name','ZZ RED Slots','slug','zz_w3_work_red_slots','type','entity',
    'label_singular','Hold','label_plural','Holds','title_field','slot_key',
    'display','page','weight','light','ordered',false,'row_order','sorted',
    'default_sort','[]'::jsonb,'agent_writable',false,'retention_days',365,
    'work_kind','slot',
    'fields', jsonb_build_array(jsonb_build_object('name','slot_key'),
                                jsonb_build_object('name','holder'),
                                jsonb_build_object('name','expires_at')),
    'parent_id','11111111-0000-4000-8000-000000000001'));
  -- The ONE difference from `custom.work_slots_declare`: `unique` is false.
  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
    'key','slot_key','label','Slot','sort',10,'type','text',
    'multi',false,'dated',false,'required',true,'source','manual',
    'config','{}'::jsonb,'rules','[]'::jsonb,'depends_on','[]'::jsonb,
    'source_config','{}'::jsonb,'sensitivity','internal',
    'context_policy','include','applies_to_types','[]'::jsonb,
    'promoted',true,'unique',false,'entity_definition_id',v_stable::text))
  returning id into v_field;
  perform custom.promote_field(v_org, v_stable, v_field);

  perform custom.work_slot_hold(v_org, v_stable, 'RED-SLOT', 'alice', interval '10 minutes');
  perform custom.work_slot_hold(v_org, v_stable, 'RED-SLOT', 'bob',   interval '10 minutes');
  select count(*) into v_n from custom.work_slot_holds(v_org, v_stable) where slot_key = 'RED-SLOT';
  if v_n <> 2 then
    raise exception 'RED 3 did not go red: % hold(s) on one slot, and without UNIQUE there should be two', v_n;
  end if;
  v_reds := v_reds + 1;
  raise notice 'RED 3 — with the slot Field promoted WITHOUT unique, % holds on one slot both committed. REC-N-12''s index is what decides, and nothing else does.', v_n;

  -- ── RED 4 — this lane's trigger ──────────────────────────────────────────────────────
  drop trigger zz_w3_work_shape_guard on custom.record;
  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, v_stable, 'record', jsonb_build_object('slot_key','RED-PAST','holder','mallory',
          'expires_at', to_char((now()-interval '1 hour') at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
  select count(*) into v_n
    from custom.work_slot_holds(v_org, v_stable) where slot_key = 'RED-PAST' and expired;
  if v_n <> 1 then
    raise exception 'RED 4 did not go red: a hold dated in the past was still refused with the trigger dropped';
  end if;
  v_reds := v_reds + 1;
  raise notice 'RED 4 — with zz_w3_work_shape_guard dropped, a hold that had ALREADY EXPIRED was written into the store and is live. custom.validate_values accepts it; only this lane''s trigger does not.';

  if v_reds <> 4 then
    raise exception 'only % of the four enforcement points were shown failing', v_reds;
  end if;
  raise notice '';
  raise notice '=== RED — all four W3-WORK enforcement points shown FAILING. This transaction rolls back: the functions, the states, the trigger and the knob all go back to what they were. ===';
end
$r$;

rollback;

-- The branch is left as it was found. Proof, outside the rolled-back transaction:
select (select count(*) from pg_trigger where tgrelid = 'custom.record'::regclass
         and tgname = 'zz_w3_work_shape_guard')                                as trigger_back,
       custom.work_template_refusal('{"nodes":[]}'::jsonb) is not null          as judgement_back,
       (platform.knob_resolve('custom','field_index_guard',null) #>> '{}')      as field_index_guard;
