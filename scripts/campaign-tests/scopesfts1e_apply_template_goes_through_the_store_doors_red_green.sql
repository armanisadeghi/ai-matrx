-- FTS-1e (lane FINISH-THE-SWITCH) — public.apply_template APPLIES A TEMPLATE THROUGH THE STORE'S DOORS
-- (custom.context_template_apply), not by inserting old scope rows; measured RED then GREEN on live, rolled back
-- (migrations/campaign/scopesfts1e_apply_template_goes_through_the_store_doors.sql).
--
-- THE USE CASE. A new clinical research lab (admin's organization Northline Staffing II, which has no scope types) applies
-- the "clinical_research_lab" template: Studies, Sites, Subjects and Team Members appear, each field where the template
-- puts it.
--
-- WHAT MUST HOLD: A1 the answer keeps apply_template's shape (template_id, organization_id, 4 scope_types_created with
-- id/label_singular/label_plural, context_items_count 27); A2 the Study fields are in the template's order — the door
-- writes each field's place, the old inserts left every field at the same place (RED before the file); A3 the "Reports
-- To" field of Team Member points at Team Members (a reference keeps its own type).

do $suite$
declare
  a jsonb; red text[] := '{}'; got text; org uuid := '91201cc5-ba69-4cb1-9f07-ea1cb852c83c';
  tpl uuid := (select t.id from context.templates t where t.key = 'clinical_research_lab' and t.is_active);
  want text;
begin
  perform set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
  a := public.apply_template(tpl, org);
  if (select array_agg(k order by k) from jsonb_object_keys(a) k) is distinct from array['context_items_count','organization_id','scope_types_created','template_id']
     or jsonb_array_length(a -> 'scope_types_created') <> 4 or (a ->> 'context_items_count') <> '27'
     or (select array_agg(k order by k) from jsonb_object_keys(a -> 'scope_types_created' -> 0) k) is distinct from array['id','label_plural','label_singular'] then
    red := red || ('A1: ' || left(a::text, 300));
  end if;
  select string_agg(ti.key, ',' order by ti.sort_order, ti.key) into want
    from context.template_context_items ti join context.template_scope_types st on st.id = ti.template_scope_type_id
   where st.template_id = tpl and st.label_singular = 'Study';
  select string_agg(f.data ->> 'key', ',' order by (f.data ->> 'sort')::int, f.data ->> 'key') into got
    from custom.record f join custom.record t on t.organization_id = org and t.id::text = f.data ->> 'entity_definition_id'
                                             and t.data ->> 'label_singular' = 'Study' and t.deleted_at is null
   where f.organization_id = org and f.table_id = custom.field_kernel_id() and f.deleted_at is null and substr(f.id::text, 15, 1) <> '5';
  if got is distinct from want then red := red || ('A2: ' || coalesce(got, '<none>') || ' want ' || want); end if;
  select string_agg(tt.data ->> 'label_plural', ',') into got
    from custom.record f join custom.record t on t.organization_id = org and t.id::text = f.data ->> 'entity_definition_id'
                                             and t.data ->> 'label_singular' = 'Team Member' and t.deleted_at is null
    join custom.record tt on tt.organization_id = org and tt.id::text = f.data ->> 'relation_target'
   where f.organization_id = org and f.data ->> 'key' = 'reports_to' and f.deleted_at is null;
  if got is distinct from 'Team Members' then red := red || ('A3: ' || coalesce(got, '<none>')); end if;
  if cardinality(red) > 0 then raise exception 'RED: %', array_to_string(red, ' | '); end if;
  raise notice 'GREEN: A1-A3';
end $suite$;
