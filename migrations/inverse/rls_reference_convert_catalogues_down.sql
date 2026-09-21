-- lane: RLS-REFERENCE
-- chair-step: an inverse is non-additive by construction. It DROPs the generated reference lane
-- from five tables, re-creates by hand the policies the canonical route cannot produce (that is
-- WHY they were hand-written, and why the reference variant exists), re-grants the client write
-- privileges three of them carried, and briefly DISABLEs
-- platform._entity_types_class_regenerates -- because putting rls_variant back to 'system' on a
-- table with no visibility column would make that trigger call iam.apply_rls and raise. Every
-- statement restores a state this database actually held at 2026-09-21 22:09 UTC, captured before
-- migrations/campaign/rls_reference_convert_catalogues.sql ran.
--
-- INVERSE of migrations/campaign/rls_reference_convert_catalogues.sql. Run it BEFORE
-- migrations/inverse/rls_reference_variant_down.sql -- that file refuses while any token still
-- carries rls_variant='reference'.

alter table platform.entity_types disable trigger _entity_types_class_regenerates;

do $restore$
declare
  r record;
  c_rels constant text[] := array[
    'workbench.schema_templates','context.template_context_items','context.template_scope_types',
    'platform.masterwork_run_kind','research.research_intent'];
  v_rel text;
begin
  -- 1. take the generated lane off every one of them
  foreach v_rel in array c_rels loop
    if to_regclass(v_rel) is null then
      raise exception 'rls-reference inverse: % does not exist', v_rel;
    end if;
    for r in select polname from pg_policy where polrelid = v_rel::regclass loop
      execute format('drop policy %I on %s', r.polname, v_rel);
    end loop;
    execute format('revoke all on %s from authenticated', v_rel);
  end loop;

  -- 2. workbench.schema_templates: RLS OFF and a bare authenticated SELECT grant. This is the
  --    `check:rls-on` ARM A finding restored on purpose -- an inverse puts back what was there,
  --    defects included, or it is not an inverse.
  execute 'alter table workbench.schema_templates disable row level security';
  execute 'grant select on workbench.schema_templates to authenticated';
  execute 'grant select, insert, update, delete, truncate, references on workbench.schema_templates to service_role';

  -- 3. the four that ran hand-written USING (true) reads
  execute 'create policy template_ci_select on context.template_context_items for select to authenticated using (true)';
  execute 'create policy platform_admin_all on context.template_context_items for all to authenticated using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()))';
  execute 'grant select, insert, update, delete on context.template_context_items to authenticated';
  execute 'grant select, insert, update, delete, truncate, references on context.template_context_items to service_role';

  execute 'create policy template_st_select on context.template_scope_types for select to authenticated using (true)';
  execute 'create policy platform_admin_all on context.template_scope_types for all to authenticated using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()))';
  execute 'grant select, insert, update, delete on context.template_scope_types to authenticated';
  execute 'grant select, insert, update, delete, truncate, references on context.template_scope_types to service_role';

  execute 'create policy masterwork_run_kind_read_authenticated on platform.masterwork_run_kind for select to authenticated using (true)';
  execute 'grant select on platform.masterwork_run_kind to authenticated';
  execute 'revoke all on platform.masterwork_run_kind from service_role';

  execute 'create policy std_select on research.research_intent for select to authenticated using (true)';
  execute 'create policy platform_admin_all on research.research_intent for all to authenticated using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()))';
  execute 'create policy svc_all on research.research_intent for all to service_role using (true) with check (true)';
  execute 'grant select, insert, update, delete on research.research_intent to authenticated';
  execute 'grant all on research.research_intent to service_role';
end
$restore$;

-- 4. the registry rows, back to what they held before the conversion
update platform.entity_types set
  rls_variant = 'system', data_class = 'private', default_list_scope = 'mine',
  data_class_reason = 'Born unclassified and derived by platform.derive_data_class from rls_variant=system, default_visibility=unset. Reclassify deliberately if this table is not what its birth flags say it is — a derived class is a description, not a decision.',
  type_reason = 'authenticated holds SELECT and nothing else while service_role writes; RLS off, no organization_id — platform-shipped schema templates'
where token = 'schema_templates';

update platform.entity_types set
  rls_variant = 'system', data_class = 'private', default_list_scope = 'mine',
  data_class_reason = 'Born unclassified and derived by platform.derive_data_class from rls_variant=system, default_visibility=unset. Reclassify deliberately if this table is not what its birth flags say it is — a derived class is a description, not a decision.'
where token in ('template_context_items','template_scope_types','masterwork_run_kind','research_intent');

alter table platform.entity_types enable trigger _entity_types_class_regenerates;

do $check$
declare v_left text;
begin
  select string_agg(token, ', ' order by token) into v_left
    from platform.entity_types where rls_variant = 'reference';
  if v_left is not null then
    raise exception 'rls-reference inverse: % still carries rls_variant=reference', v_left;
  end if;
  if not exists (select 1 from pg_trigger
                  where tgrelid='platform.entity_types'::regclass
                    and tgname='_entity_types_class_regenerates' and tgenabled='O') then
    raise exception 'rls-reference inverse: _entity_types_class_regenerates was left DISABLED -- every future class change would silently skip its regeneration';
  end if;
  raise notice 'rls-reference inverse: 5 catalogues restored to their 2026-09-21 22:09 UTC state';
end
$check$;
