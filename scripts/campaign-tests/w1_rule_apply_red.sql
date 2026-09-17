-- W1-RULE-APPLY — THE RED TWIN of `w1_rule_apply.sql` (rule 2: a guard that cannot be
-- demonstrated failing is not a guard).
--
-- It removes this lane's ONE enforcement point — the trigger `custom_record_rule_topology_guard`
-- — inside a transaction that ROLLS BACK, and shows every write the GREEN suite watches being
-- REFUSED landing instead. The evidence is written into a disposable `zz_w1_rule_apply_red`
-- schema (rule 2's own words), read back from there, and rolled away with everything else.
--
-- WHAT IT DOES NOT PLANT, and why that is not a gap. REC-16's EVALUATION half lives in
-- `custom.rule_eval`, and its RED was measured by the real mechanism rather than by a copy:
-- `migrations/inverse/w1_rule_apply_the_other_two_uses_down.sql` restores `W1-RULE`'s body
-- byte for byte (hash `d2e11d617e0b…`), and with it in place a `parent_field` leaf raises
-- `0A000 "this rule reads the parent's answer, and that is not switched on yet"` instead of
-- reading the parent — which is rule 27's inverse doing double duty as this clause's RED.
-- Weakening `custom.rule_eval` here as well would prove the same thing with a hand-made copy.
--
--   PSQL="$(pnpm -s exec tsx scripts/lib/psql-path.ts --print)"
--   "$PSQL" "$SUPABASE_BRANCH_DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/w1_rule_apply_red.sql

\set ON_ERROR_STOP on
\timing off

begin;

create schema zz_w1_rule_apply_red;
create table zz_w1_rule_apply_red.landed (
  red       text primary key,
  what      text not null,
  row_id    uuid,
  detail    jsonb
);

-- THE ENFORCEMENT POINT, REMOVED. Everything below is what the branch does without it.
drop trigger custom_record_rule_topology_guard on custom.record;

do $t$
declare
  v_org     constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_tbl     constant uuid := '11111111-0004-4000-8000-000000000001';
  v_f_kind  constant uuid := '11111111-0004-4000-8000-000000000011';
  v_f_w     constant uuid := '11111111-0004-4000-8000-000000000012';
  v_f_h     constant uuid := '11111111-0004-4000-8000-000000000013';
  v_r_all   constant uuid := '11111111-0004-4000-8000-000000000101';
  v_mf      constant uuid := '11111111-0004-4000-8000-000000000120';
  v_t2  uuid;
  v_f1  uuid;
  v_f2  uuid;
  v_id  uuid;
begin
  -- ── RED 1: a Rule and a merge field waiting on each other. ────────────────────────
  update custom.record set data = jsonb_set(data, '{expr}', jsonb_build_object(
    'op','and','args', jsonb_build_array(
      jsonb_build_object('op','eq','args', jsonb_build_array(
        jsonb_build_object('field', v_f_w), jsonb_build_object('field', v_f_h))),
      jsonb_build_object('merge_field', v_mf))))
   where organization_id = v_org and id = v_r_all;
  insert into zz_w1_rule_apply_red.landed
  select 'RED 1', 'a Rule now reads the merge field that resolves through it - the circle is stored',
         r.id, jsonb_build_object('rule', r.data ->> 'name',
                                  'reads_merge_field', r.data #> '{expr,args,1,merge_field}',
                                  'merge_field_resolves_through', m.data ->> 'rule_id')
    from custom.record r, custom.record m
   where r.organization_id = v_org and r.id = v_r_all and m.id = v_mf;

  -- ── RED 2: two Rules working each other's answers out. ────────────────────────────
  v_t2 := custom.table_declare(v_org, jsonb_build_object(
    'name','W1-RULE-APPLY red cycle','slug','zz_w1_rule_apply_red_cycle','type','entity',
    'label_singular','Cycle','label_plural','Cycles','title_field','a','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','a'), jsonb_build_object('name','b')),
    'parent_id','11111111-0000-4000-8000-000000000001'));
  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
    'entity_definition_id', v_t2, 'key','a','label','A','type','formula','sort',10,
    'required',false,'multi',false,'dated',false,'source','formula','compute_on','write',
    'config','{}'::jsonb,'rules','[]'::jsonb,'depends_on','[]'::jsonb,'sensitivity','internal',
    'source_config','{}'::jsonb,'context_policy','include','applies_to_types','[]'::jsonb))
  returning id into v_f1;
  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
    'entity_definition_id', v_t2, 'key','b','label','B','type','formula','sort',20,
    'required',false,'multi',false,'dated',false,'source','formula','compute_on','write',
    'config','{}'::jsonb,'rules','[]'::jsonb,'depends_on','[]'::jsonb,'sensitivity','internal',
    'source_config','{}'::jsonb,'context_policy','include','applies_to_types','[]'::jsonb))
  returning id into v_f2;
  insert into custom.record (organization_id, table_id, data_class, data) values (v_org,
    '11111111-0000-4000-8000-000000000003'::uuid, 'rule',
    jsonb_build_object('name','A from B','kind','expression','scope_table_id', v_t2,
      'uses', jsonb_build_array('compute'), 'applies_to_types','[]'::jsonb, 'target_field_id', v_f1,
      'expr', jsonb_build_object('op','concat','args', jsonb_build_array(jsonb_build_object('field', v_f2)))));
  insert into custom.record (organization_id, table_id, data_class, data) values (v_org,
    '11111111-0000-4000-8000-000000000003'::uuid, 'rule',
    jsonb_build_object('name','B from A','kind','expression','scope_table_id', v_t2,
      'uses', jsonb_build_array('compute'), 'applies_to_types','[]'::jsonb, 'target_field_id', v_f2,
      'expr', jsonb_build_object('op','concat','args', jsonb_build_array(jsonb_build_object('field', v_f1)))))
  returning id into v_id;
  insert into zz_w1_rule_apply_red.landed
  values ('RED 2', 'both halves of a Rule <-> Rule circle are stored, and neither save was refused',
          v_id, (select jsonb_agg(r.data ->> 'name' order by r.data ->> 'name')
                   from custom.record r
                  where r.organization_id = v_org and r.table_id = custom.rule_kernel_id()
                    and (r.data ->> 'scope_table_id')::uuid = v_t2));

  -- ── RED 3: REC-16's ceiling, in all three shapes a person writes. ─────────────────
  insert into custom.record (organization_id, table_id, data_class, data) values (v_org,
    '11111111-0000-4000-8000-000000000003'::uuid, 'rule',
    jsonb_build_object('name','Two up','kind','predicate','scope_table_id', v_tbl,
      'uses', jsonb_build_array('applicability'), 'applies_to_types','[]'::jsonb,
      'expr', jsonb_build_object('op','eq','args', jsonb_build_array(
        jsonb_build_object('parent_field', jsonb_build_object('parent_field', v_f_kind)),
        jsonb_build_object('const','square')))))
  returning id into v_id;
  insert into zz_w1_rule_apply_red.landed values
    ('RED 3', 'a Rule reading TWO ancestor levels is stored', v_id, null);
  insert into custom.record (organization_id, table_id, data_class, data) values (v_org,
    '11111111-0000-4000-8000-000000000003'::uuid, 'rule',
    jsonb_build_object('name','Two up by number','kind','predicate','scope_table_id', v_tbl,
      'uses', jsonb_build_array('applicability'), 'applies_to_types','[]'::jsonb,
      'expr', jsonb_build_object('op','eq','args', jsonb_build_array(
        jsonb_build_object('parent_field', v_f_kind, 'levels', 2),
        jsonb_build_object('const','square')))))
  returning id into v_id;
  insert into zz_w1_rule_apply_red.landed values
    ('RED 4', 'a Rule asking for two levels by number is stored', v_id, null);
  insert into custom.record (organization_id, table_id, data_class, data) values (v_org,
    '11111111-0000-4000-8000-000000000003'::uuid, 'rule',
    jsonb_build_object('name','Grandparent','kind','predicate','scope_table_id', v_tbl,
      'uses', jsonb_build_array('applicability'), 'applies_to_types','[]'::jsonb,
      'expr', jsonb_build_object('op','eq','args', jsonb_build_array(
        jsonb_build_object('grandparent_field', v_f_kind),
        jsonb_build_object('const','square')))))
  returning id into v_id;
  insert into zz_w1_rule_apply_red.landed values
    ('RED 5', 'a grandparent_field Rule is stored', v_id, null);
end;
$t$;

do $r$
declare
  l record;
  v_n integer;
begin
  select count(*) into v_n from zz_w1_rule_apply_red.landed;
  if v_n <> 5 then
    raise exception 'THE RED TWIN PROVED NOTHING: % of the 5 refused writes landed.', v_n;
  end if;
  for l in select * from zz_w1_rule_apply_red.landed order by red loop
    raise notice '% — % (%)%', l.red, l.what, l.row_id,
      case when l.detail is null then '' else ' ' || l.detail::text end;
  end loop;
  raise notice '=== W1-RULE-APPLY RED — all five writes the GREEN suite watches being REFUSED LAND once custom_record_rule_topology_guard is removed. Rolling back. ===';
end;
$r$;

rollback;
