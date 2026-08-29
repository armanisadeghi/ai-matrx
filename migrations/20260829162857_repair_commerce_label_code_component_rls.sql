-- Restore the canonical component ownership policy for commerce.label_code.
-- A component has no independent owner: access is inherited from its
-- composition parent, so no component policy may reference created_by.
--
-- 20260829083724_shared_knowledge_open_library_rls_alignment.sql refreshed
-- iam.entity_read_expr from an older body and lost the variant guard added by
-- component_read_lane_no_created_by.sql. Patch that one exact regression in
-- the deployed body so all newer library candidate lanes remain intact.

begin;

do $$
declare
  v_definition text;
  v_old text := 'if v_owner_col is not null then';
  v_new text := 'if v_owner_col is not null and p_variant <> ''component'' then';
  v_matches integer;
begin
  if not exists (
    select 1
    from platform.entity_types
    where schema_name = 'commerce'
      and table_name = 'label_code'
      and token = 'commerce_label_code'
      and rls_variant = 'component'
      and is_active
  ) then
    raise exception
      'commerce.label_code is not the active commerce_label_code component; refusing to regenerate RLS';
  end if;

  select pg_get_functiondef(
    'iam.entity_read_expr(text,text,text,text)'::regprocedure
  ) into v_definition;

  v_matches := (
    length(v_definition) - length(replace(v_definition, v_old, ''))
  ) / length(v_old);

  if v_matches <> 1 then
    raise exception
      'expected exactly one unguarded owner arm in iam.entity_read_expr, found %',
      v_matches;
  end if;

  execute replace(v_definition, v_old, v_new);

  perform iam.apply_rls(
    'commerce',
    'label_code',
    'commerce_label_code',
    'component'
  );

  if exists (
    select 1
    from pg_policy p
    where p.polrelid = 'commerce.label_code'::regclass
      and (
        coalesce(pg_get_expr(p.polqual, p.polrelid), '') ~* '\mcreated_by\M'
        or coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') ~* '\mcreated_by\M'
      )
  ) then
    raise exception
      'canonical component RLS regeneration left a created_by reference on commerce.label_code';
  end if;
end $$;

commit;

notify pgrst, 'reload schema';
