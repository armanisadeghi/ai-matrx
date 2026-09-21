-- W3-WORK — THE RED TWIN of `scripts/campaign-tests/w3_work_c44.sql`, ON THE MAIN DATABASE,
-- FROM THE SEAT `authenticated` WHEREVER A DOOR EXISTS.
--
-- RUN IT:
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the main database DSN>" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/w3_work_red.sql
--
-- Rule 2: a guard that cannot be demonstrated failing is not a guard. This file turns THIS
-- LANE'S four enforcement points off, one at a time, inside ONE transaction that ROLLS BACK,
-- and asserts that each refusal C-44 relies on DISAPPEARS — and, where the failure is silent
-- rather than loud, that the wrong thing is actually written.
--
-- 🚨 RE-POINTED AND SEATED (lane ORG-DELETE, 2026-09-19). It used to refuse to run anywhere
-- but the rehearsal branch, and it performed every act as the role that OWNS `custom.record`.
-- It now runs on the main database, on a disposable organization of its own.
--
-- WHERE THE SEAT REACHES, AND WHERE IT CANNOT. `w3_work_c44.sql` PART 0b measures the
-- headline and this file inherits it: NOT ONE of the twenty `custom.work_*` functions holds
-- an EXECUTE grant for `authenticated`, not one asks the ladder who is calling, and not one
-- carries a row in `platform.client_callable_door`. So REDs 2 and 3, whose whole subject is a
-- `custom.work_*` verb, are OPERATOR and say so. REDs 1 and 4 are about the STORE — the state
-- model and this lane's trigger — and both of those are reached through `custom.record_write`
-- and `custom.record_update`, doors a signed-in person holds: with the guard removed, the
-- wrong write LANDS FROM THE SEAT, which is where it would really land.
--
-- THE GUARD REMOVALS THEMSELVES always step out: no client door replaces a production
-- function or edits a state model. Nothing here takes ACCESS EXCLUSIVE on `custom.record` —
-- `DROP TRIGGER` and `ALTER TABLE … DISABLE TRIGGER` lock the whole live table and its
-- sixteen partitions against every other session for as long as the transaction runs, so RED
-- 4 neuters `custom._work_shape_guard` by replacing its FUNCTION body, which is invisible to
-- every other session until a commit that never comes.
--
--   RED 1 — the transition model. The states stop declaring what they may move to, and the
--           move C-44 watches being refused LANDS — written by a signed-in person through
--           `custom.record_update`.
--   RED 2 — the template judgement (OPERATOR). `custom.work_template_refusal` is replaced
--           with one that approves everything, and a `referenced` relation is then written as
--           an OWNED edge — the silent wrong answer the real refusal exists to prevent,
--           counted as a containment edge that should not be there.
--   RED 3 — REC-N-12's UNIQUE (OPERATOR). The slot Field is promoted WITHOUT `unique`, and
--           two holds on one slot both commit.
--   RED 4 — this lane's trigger. `custom._work_shape_guard` is neutered and a hold dated in
--           the PAST is written by a signed-in person through `custom.record_write`, which is
--           the one refusal that belongs to the trigger alone (`custom.validate_values`
--           accepts any parseable date).
--
-- IT IS NOT A MIGRATION: it lives outside `migrations/` and no sweep can see it.

\set ON_ERROR_STOP on
\timing off

begin;
set local lock_timeout = '60s';
set local statement_timeout = '240s';

do $r$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org     uuid := gen_random_uuid();
  v_home    uuid;
  v_table   uuid;
  v_take    jsonb;
  v_states  uuid;
  v_ns      uuid;
  v_done    uuid;
  v_rec     uuid;
  v_tpl     uuid;
  v_inst    jsonb;
  v_stable  uuid;
  v_field   uuid;
  v_n       bigint;
  v_reds    integer := 0;
  v_guard_def text;
  v_refuse_def text;
  v_boss    text := current_user;
begin
  if (pg_control_system()).system_identifier <> 7642734024280108049 then
    raise exception 'w3_work_red.sql runs on the MAIN database only, and this is %',
                    (pg_control_system()).system_identifier;
  end if;

  -- ── THE FIXTURES NO CLIENT DOOR COVERS, as the connected role. Nothing asserted. ──────
  perform set_config('app.actor_system', 'campaign-test/w3_work_red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Rincon Plumbing Co — Millbrook Branch', 'rincon-plumbing-millbrook-work-' || substr(v_org::text, 1, 8), 'RPM', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'w3_work_red');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Home')) returning id into v_home;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 0 — THE SEAT.
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this suite did not take the seat — current_user is %', current_user;
  end if;
  if pg_has_role(current_user,
                 (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass),
                 'member') then
    raise exception '0: this seat is a member of the role that owns custom.record, so every wall would open on its first line';
  end if;
  begin
    perform 1 from custom.record limit 1;
    raise exception '0: this seat can SELECT custom.record directly, so it is not a client seat';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PART 0 PASSED — the seat is `authenticated`, the ladder sees a client, and custom.record refuses a direct read.';

  -- ── THE FIXTURE. The Table and its column are the person's, through the doors; the
  -- assignment fields are not, because `custom.work_take_assignment` holds no client grant.
  v_table := custom.table_declare(v_org, jsonb_build_object(
    'name','Punch List Tasks','slug','punch_list_tasks','type','entity',
    'label_singular','Task','label_plural','Tasks','title_field','title',
    'display','page','weight','light','ordered',false,'row_order','sorted',
    'default_sort','[]'::jsonb,'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','title')),
    'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_table, jsonb_build_object(
    'key','title','label','Title','plain','text','sort',10));

  perform set_config('role', v_boss, true);   -- OPERATOR: no client door takes the assignment fields
  v_take   := custom.work_take_assignment(v_org, v_table);
  v_states := (v_take ->> 'state_table_id')::uuid;
  select id into v_ns   from custom.record where organization_id=v_org and table_id=v_states and data->>'name'='Not started';
  select id into v_done from custom.record where organization_id=v_org and table_id=v_states and data->>'name'='Done';
  perform set_config('role', 'authenticated', true);

  v_rec := custom.record_write(v_org, v_table, jsonb_build_object(
    '_actor','user','title','RED','status', v_ns::text));

  -- ══════════════════════════════════════════════════════════════════════════
  -- RED 1 — the transition model, removed. The wrong move is then made BY A
  --         SIGNED-IN PERSON, through the door they hold.
  -- ══════════════════════════════════════════════════════════════════════════
  -- OUT OF THE SEAT for the removal only: no client door rewrites a state model. Nothing is
  -- asserted while out.
  perform set_config('role', v_boss, true);
  update custom.record set data = data - 'next'
   where organization_id = v_org and table_id = v_states;
  perform set_config('role', 'authenticated', true);

  perform custom.record_update(v_org, v_rec,
    jsonb_build_object('_actor','user','status', v_done::text));
  if (custom.read_record(v_org, v_rec, true) -> 'status') #>> '{}' <> v_done::text then
    raise exception 'RED 1 did not go red: the forbidden move was still refused with the model removed';
  end if;
  v_reds := v_reds + 1;
  raise notice 'RED 1 IS RED — with `next` gone from the states, a signed-in person moved a task Not started -> Done through custom.record_update and it LANDED. The refusal C-44 reads is the model, not a coincidence.';

  -- ══════════════════════════════════════════════════════════════════════════
  -- RED 2 — the template judgement, removed. OPERATOR THROUGHOUT: no person can
  --         declare or run a template at all (w3_work_c44.sql PART 0b), so this
  --         red says nothing about what a signed-in person may do — only that
  --         the judgement is what refuses a `referenced` edge.
  -- ══════════════════════════════════════════════════════════════════════════
  perform set_config('role', v_boss, true);
  select pg_get_functiondef('custom.work_template_refusal(jsonb)'::regprocedure) into v_refuse_def;
  create or replace function custom.work_template_refusal(p_graph jsonb)
  returns text language sql immutable set search_path to 'pg_catalog' as $red$ select null::text; $red$;

  v_tpl := custom.work_template_declare(v_org, 'Rough-In Before Trim-Out', jsonb_build_object(
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
  raise notice 'RED 2 IS RED (OPERATOR) — with the judgement removed, a `referenced` relation was written as an OWNED edge: % record now CONTAINED inside the other. That is the silent wrong answer the real refusal prevents.', v_n;
  execute v_refuse_def;

  -- ══════════════════════════════════════════════════════════════════════════
  -- RED 3 — REC-N-12's UNIQUE, removed. OPERATOR THROUGHOUT, for the same
  --         reason: `custom.work_slot_hold` holds no client grant either.
  -- ══════════════════════════════════════════════════════════════════════════
  v_stable := custom.table_declare(v_org, jsonb_build_object(
    'name','Truck Bay Holds','slug','truck_bay_holds','type','entity',
    'label_singular','Hold','label_plural','Holds','title_field','slot_key',
    'display','page','weight','light','ordered',false,'row_order','sorted',
    'default_sort','[]'::jsonb,'agent_writable',false,'retention_days',365,
    'work_kind','slot',
    'fields', jsonb_build_array(jsonb_build_object('name','slot_key'),
                                jsonb_build_object('name','holder'),
                                jsonb_build_object('name','expires_at')),
    'parent_id', v_home::text));
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
  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
    'key','holder','label','Holder','sort',20,'type','text',
    'multi',false,'dated',false,'required',true,'source','manual',
    'config','{}'::jsonb,'rules','[]'::jsonb,'depends_on','[]'::jsonb,
    'source_config','{}'::jsonb,'sensitivity','internal',
    'context_policy','include','applies_to_types','[]'::jsonb,
    'entity_definition_id',v_stable::text));
  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
    'key','expires_at','label','Held until','sort',30,'type','range',
    'multi',false,'dated',false,'required',true,'source','manual',
    'config',jsonb_build_object('kind','datetime'),'rules','[]'::jsonb,'depends_on','[]'::jsonb,
    'source_config','{}'::jsonb,'sensitivity','internal',
    'context_policy','include','applies_to_types','[]'::jsonb,
    'entity_definition_id',v_stable::text));
  perform custom.promote_field(v_org, v_stable, v_field);

  perform custom.work_slot_hold(v_org, v_stable, 'RED-SLOT', 'alice', interval '10 minutes');
  perform custom.work_slot_hold(v_org, v_stable, 'RED-SLOT', 'bob',   interval '10 minutes');
  select count(*) into v_n from custom.work_slot_holds(v_org, v_stable) where slot_key = 'RED-SLOT';
  if v_n <> 2 then
    raise exception 'RED 3 did not go red: % hold(s) on one slot, and without UNIQUE there should be two', v_n;
  end if;
  v_reds := v_reds + 1;
  raise notice 'RED 3 IS RED (OPERATOR) — with the slot Field promoted WITHOUT unique, % holds on one slot both committed. REC-N-12''s index is what decides, and nothing else does.', v_n;

  -- ══════════════════════════════════════════════════════════════════════════
  -- RED 4 — this lane's trigger, neutered. The hold dated in the PAST is then
  --         written BY A SIGNED-IN PERSON, through `custom.record_write`.
  -- ══════════════════════════════════════════════════════════════════════════
  -- OUT OF THE SEAT for the removal only. The function body is replaced rather than the
  -- trigger dropped, so no lock is taken on `custom.record` or any of its sixteen partitions.
  select pg_get_functiondef('custom._work_shape_guard()'::regprocedure) into v_guard_def;
  create or replace function custom._work_shape_guard() returns trigger
    language plpgsql as $red$ begin return new; end $red$;
  perform set_config('role', 'authenticated', true);

  perform custom.record_write(v_org, v_stable, jsonb_build_object(
    '_actor','user','slot_key','RED-PAST','holder','mallory',
    'expires_at', to_char((now()-interval '1 hour') at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
  perform set_config('role', v_boss, true);   -- OPERATOR: `custom.work_slot_holds` is the only reader
  select count(*) into v_n
    from custom.work_slot_holds(v_org, v_stable) where slot_key = 'RED-PAST' and expired;
  if v_n <> 1 then
    raise exception 'RED 4 did not go red: a hold dated in the past was still refused with the guard neutered';
  end if;
  v_reds := v_reds + 1;
  raise notice 'RED 4 IS RED — with `custom._work_shape_guard'' replaced by a pass-through, a signed-in person wrote a hold that had ALREADY EXPIRED through custom.record_write and the store kept it. custom.validate_values accepts it; only this lane''s trigger does not.';
  execute v_guard_def;

  if v_reds <> 4 then
    raise exception 'only % of the four enforcement points were shown failing', v_reds;
  end if;
  raise notice '';
  raise notice '=== RED — all four W3-WORK enforcement points shown FAILING. REDs 1 and 4 landed the wrong write FROM THE SEAT `authenticated`, through the doors a signed-in person holds; REDs 2 and 3 are OPERATOR because no custom.work_* verb is reachable by a person at all. This transaction rolls back: the two replaced functions, the states and the Tables all go back to what they were. ===';
end
$r$;

rollback;

-- The main database is left as it was found. Proof, outside the rolled-back transaction:
select (select prosrc ~ 'assert_store_door' from pg_proc
         where oid = 'custom._work_shape_guard()'::regprocedure)          as work_trigger_back,
       custom.work_template_refusal(
         '{"nodes":[{"ref":"a"},{"ref":"b"}],"relations":[{"kind":"referenced","from":"a","to":"b"}]}'::jsonb)
         is not null                                                      as judgement_back,
       (select count(*) from pg_trigger where tgrelid = 'custom.record'::regclass
         and tgname = 'zz_w3_work_shape_guard')                           as trigger_present;
