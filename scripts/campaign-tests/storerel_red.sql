-- STORE-REL — THE RED TWIN of storerel_green.sql.
--
-- RUN IT FROM THE REPOSITORY ROOT (the \i paths below are relative to it), against the MAIN
-- database, exactly as the green suite is run:
--   PSQL="$(pnpm -s exec tsx scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the five SUPABASE_MATRIX_* values>" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/storerel_red.sql
--
-- WHAT IT DOES. It runs STORE-REL's own inverses — the bodies the fourth pass measured — and
-- then asks the SAME six questions the green suite asks, requiring the OLD, BROKEN answer to
-- each. A block that does NOT flip is a green clause that was never proving anything.
--
-- Everything is inside ONE transaction that ends in ROLLBACK, so the live functions, the
-- triggers, the grants and `platform.associations.relation_field_id` are all exactly as they
-- were the moment it finishes.

\set ON_ERROR_STOP on
\timing off

begin;
set local statement_timeout = '60s';

\i migrations/inverse/storerel_the_delete_rules_land_down.sql
\i migrations/inverse/storerel_pruning_can_be_asked_for_down.sql
\i migrations/inverse/storerel_the_merge_answers_a_client_down.sql
\i migrations/inverse/storerel_a_table_you_cannot_see_is_not_described_down.sql
\i migrations/inverse/storerel_a_second_parent_is_never_a_silent_move_down.sql
\i migrations/inverse/storerel_a_carrying_link_has_a_door_down.sql
\i migrations/inverse/storerel_a_relation_edge_names_its_field_down.sql

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org  uuid := gen_random_uuid();
  v_home uuid; v_proj uuid; v_x uuid; v_y uuid; v_risk uuid; v_inc uuid; v_r1 uuid;
  v_sup_t uuid; v_po_t uuid; v_f_sup uuid; v_sup uuid; v_po uuid; v_cls uuid;
  v_per_t uuid; v_f_ph uuid; v_ch1 uuid; v_ch2 uuid;
  v_n integer; v_caught text; v_doc jsonb; v_red integer := 0;
begin
  if (select system_identifier from pg_control_system()) <> 7642734024280108049 then
    raise exception 'storerel_red.sql runs on the MAIN database only, and this is %',
      (select system_identifier from pg_control_system());
  end if;
  perform set_config('app.actor_system', 'campaign-test/storerel_red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Kessler Lab for Applied Microbial Ecology — Compost Annex',
          'kessler-compost-annex-' || substr(v_org::text, 1, 8), 'KLC', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active'),
         (v_org, 'organization', v_org, c_dana,  'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom', 'system_enabled', 'organization', v_org, v_org, 'true'::jsonb, 'campaign-test/storerel_red'),
         ('custom', 'member_default_visibility', 'organization', v_org, v_org, '"shared_only"'::jsonb, 'campaign-test/storerel_red');

  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name','Kessler Lab — Main Laboratory')) returning id into v_home;
  v_proj := custom.table_declare(v_org, jsonb_build_object(
    'name','Experiment','slug','experiments','type','entity',
    'label_singular','Experiment','label_plural','Experiments','title_field','pname',
    'display','page','weight','light','ordered',false,'row_order','sorted',
    'default_sort','[]'::jsonb,'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','pname')), 'parent_id', v_home::text));
  v_x := custom.record_write(v_org, v_proj, jsonb_build_object('pname','Riparian nitrogen amendment trial','parent_id',v_home::text));
  v_y := custom.record_write(v_org, v_proj, jsonb_build_object('pname','Anaerobic sulfate reducer screen','parent_id',v_home::text));
  v_risk := custom.table_declare(v_org, jsonb_build_object(
    'name','Measurement','slug','measurements','type','entity',
    'label_singular','Measurement','label_plural','Measurements','title_field','rtitle',
    'display','list','weight','light','ordered',false,'row_order','sorted',
    'default_sort','[]'::jsonb,'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','rtitle')), 'parent_id', v_home::text));
  perform custom.home_add(v_org, v_risk, v_x);
  v_inc := custom.table_declare(v_org, jsonb_build_object(
    'name','Protocol deviation','slug','protocol_deviations','type','entity',
    'label_singular','Protocol deviation','label_plural','Protocol deviations','title_field','ititle',
    'display','list','weight','light','ordered',false,'row_order','sorted',
    'default_sort','[]'::jsonb,'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','ititle')), 'parent_id', v_y::text));
  v_r1 := custom.record_write(v_org, v_risk, jsonb_build_object('rtitle','nifH copies per gram, week 4','parent_id',v_x::text));

  -- ── BLOCK 1 (T7) — the ordinary write door leaves the edge nameless, so restrict does nothing.
  v_sup_t := custom.table_declare(v_org, jsonb_build_object(
    'name','Reagent supplier','slug','reagent_suppliers','type','entity',
    'label_singular','Reagent supplier','label_plural','Reagent suppliers','title_field','sname',
    'display','list','weight','light','ordered',false,'row_order','sorted',
    'default_sort','[]'::jsonb,'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','sname')), 'parent_id', v_home::text));
  v_po_t := custom.table_declare(v_org, jsonb_build_object(
    'name','Reagent order','slug','reagent_orders','type','entity',
    'label_singular','Reagent order','label_plural','Reagent orders','title_field','ponum',
    'display','list','weight','light','ordered',false,'row_order','sorted',
    'default_sort','[]'::jsonb,'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','ponum'), jsonb_build_object('name','supplier')),
    'parent_id', v_home::text));
  insert into custom.record (organization_id, table_id, data_class, data) values
    (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
      'key','supplier','label','Supplier','type','relation','sort',20,'required',false,'multi',false,
      'dated',false,'source','manual','config','{}'::jsonb,'rules','[]'::jsonb,
      'depends_on','[]'::jsonb,'sensitivity','internal','source_config','{}'::jsonb,
      'context_policy','include','applies_to_types','[]'::jsonb,'entity_definition_id',v_po_t,
      'relation_target', v_sup_t, 'relation_max', 1, 'on_target_delete', 'restrict'))
    returning id into v_f_sup;
  v_sup := custom.record_write(v_org, v_sup_t, jsonb_build_object('sname','Meridian Molecular Reagents','parent_id',v_home::text));
  v_po  := custom.record_write(v_org, v_po_t, jsonb_build_object('ponum','PO-1','supplier',v_sup::text,'parent_id',v_home::text));
  select count(*) into v_n from platform.associations a
   where a.source_id = v_po and a.role = 'supplier' and a.relation_field_id is not null and a.deleted_at is null;
  v_caught := null;
  begin perform custom.record_delete(v_org, v_sup); exception when others then v_caught := sqlerrm; end;
  if v_n = 0 and v_caught is null then
    v_red := v_red + 1;
    raise notice '[RED 1/6] (T7) the write door wrote 0 edges naming the field, and deleting a supplier a live purchase order points at was NOT refused.';
  else
    raise exception 'BLOCK 1 did not flip: % edge(s) named the field, refusal was %', v_n, coalesce(v_caught,'none');
  end if;

  -- ── BLOCK 2 (T2) — there is no client door for a carrying link at all.
  v_caught := null;
  begin perform custom.relation_carry(v_org, v_x, v_r1); exception when others then v_caught := sqlerrm; end;
  if v_caught is not null and v_caught ~ 'does not exist' then
    v_red := v_red + 1;
    raise notice '[RED 2/6] (T2) custom.relation_carry does not exist, so nothing a client can call links two records.';
  else
    raise exception 'BLOCK 2 did not flip: %', coalesce(v_caught, 'the carrying door still answered');
  end if;

  -- ── BLOCK 3 (T3) — the second call SILENTLY MOVES the record.
  v_cls := custom.record_write(v_org, v_risk, jsonb_build_object('rtitle','Total organic carbon, replicate 3'));
  perform custom.relation_own(v_org, v_x, v_cls);
  v_caught := null;
  begin perform custom.relation_own(v_org, v_y, v_cls); exception when others then v_caught := sqlerrm; end;
  if v_caught is null
     and (select custom.containment_parent(r.data) from custom.record r where r.id = v_cls) = v_y then
    v_red := v_red + 1;
    raise notice '[RED 3/6] (T3) asking for a second parent was accepted and the first parent silently disappeared.';
  else
    raise exception 'BLOCK 3 did not flip: refusal was %, parent is %', coalesce(v_caught,'none'),
      (select custom.containment_parent(r.data) from custom.record r where r.id = v_cls);
  end if;

  -- ── BLOCK 4 (T10) — the capacity door describes a Table she may not know exists.
  insert into iam.permissions (resource_type, resource_id, granted_to_user_id, permission_level, status)
  values ('record', v_x, c_dana, 'viewer', 'active');
  perform set_config('request.jwt.claims', c_dana_j, true);
  perform set_config('role', 'authenticated', true);
  v_caught := null; v_doc := null;
  begin v_doc := custom.table_capacity(v_org, v_inc); exception when others then v_caught := sqlerrm; end;
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  if v_caught is null and v_doc ->> 'says' is not null then
    v_red := v_red + 1;
    raise notice '[RED 4/6] (T10) the capacity door answered "%" about a Table she is not allowed to know exists.', v_doc ->> 'says';
  else
    raise exception 'BLOCK 4 did not flip: %', coalesce(v_caught, 'the door returned nothing');
  end if;
  delete from iam.permissions where resource_type='record' and resource_id=v_x and granted_to_user_id=c_dana;

  -- ── BLOCK 5 (T5) — the read door strips the alternates and the merged id resolves nowhere.
  v_per_t := custom.table_declare(v_org, jsonb_build_object(
    'name','Researcher','slug','researchers','type','entity',
    'label_singular','Researcher','label_plural','Researchers','title_field','pname',
    'display','page','weight','light','ordered',false,'row_order','sorted',
    'default_sort','[]'::jsonb,'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','pname'), jsonb_build_object('name','phone')),
    'parent_id', v_home::text));
  insert into custom.record (organization_id, table_id, data_class, data) values
    (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
      'key','phone','label','Phone','type','text','sort',20,'required',false,'multi',false,
      'dated',false,'source','manual','config','{}'::jsonb,'rules','[]'::jsonb,
      'depends_on','[]'::jsonb,'sensitivity','internal','source_config','{}'::jsonb,
      'context_policy','include','applies_to_types','[]'::jsonb,'entity_definition_id',v_per_t))
    returning id into v_f_ph;
  v_ch1 := custom.record_write(v_org, v_per_t, jsonb_build_object('pname','Chen','phone','555-0101','parent_id',v_home::text));
  v_ch2 := custom.record_write(v_org, v_per_t, jsonb_build_object('pname','Chen','phone','555-0202','parent_id',v_home::text));
  perform custom.migrate_merge(v_org, v_ch1, v_ch2, 'campaign-test/storerel_red');
  v_doc := custom.read_record(v_org, v_ch1);
  v_caught := null;
  begin perform custom.read_record(v_org, v_ch2); exception when others then v_caught := sqlerrm; end;
  if not (v_doc ? '_alternates') and v_caught is not null and v_caught ~ 'no record' then
    v_red := v_red + 1;
    raise notice '[RED 5/6] (T5) the read door stripped the alternates the merge kept, and the merged-away id answered "%".', v_caught;
  else
    raise exception 'BLOCK 5 did not flip: alternates present = %, loser id said %',
      (v_doc ? '_alternates'), coalesce(v_caught,'the survivor''s document');
  end if;

  -- ── BLOCK 6 (T14) — pruning cannot be asked for at all.
  v_caught := null;
  begin perform custom.history_prune(v_org, 'values', v_per_t, true); exception when others then v_caught := sqlerrm; end;
  if v_caught is not null and v_caught ~ 'does not exist' then
    v_red := v_red + 1;
    raise notice '[RED 6/6] (T14) custom.history_prune does not exist, so the sixty-days-later half cannot be asked from a client seat.';
  else
    raise exception 'BLOCK 6 did not flip: %', coalesce(v_caught, 'the prune door still answered');
  end if;

  if v_red <> 6 then
    raise exception 'only % of 6 blocks were RED', v_red;
  end if;
  raise notice '% of 6 blocks are RED (the defect they assert is gone)', v_red;
end;
$t$;

rollback;

select count(*) as organizations_left_behind
  from iam.organizations o where o.slug like 'kessler-compost-annex-%';
