-- INVERSE of migrations/campaign/switchsteptwo_c2_the_last_two_older_readers_follow.sql (lane SWITCH-STEP-TWO): both bodies
-- exactly as they were.
-- based-on: workbench.guard_used_template_fields() 70db9d9c338994cccbb85a1e9eef57cc125a0a502d9f79d19dbefddb6cbfd306
-- based-on: workbench.udt_row_words_many(uuid, jsonb, uuid[]) d80b76650b016a0a0eea893ed21ea3883265e1d3dfcdecd4ca489ac8b9f9e6ba
-- lane: SWITCH-STEP-TWO

CREATE OR REPLACE FUNCTION workbench.guard_used_template_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if exists (select 1 from workbench.udt_datasets d where d.template_id = coalesce(new.template_id, old.template_id)) then
    raise exception 'template % is already instantiated; create a new template version instead of changing its fields',
      coalesce(new.template_id, old.template_id) using errcode = '55000';
  end if;
  return coalesce(new, old);
end; $function$

;

CREATE OR REPLACE FUNCTION workbench.udt_row_words_many(p_organization_id uuid, p_display jsonb, p_row_ids uuid[])
 RETURNS TABLE(row_id uuid, words text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_spec jsonb;
begin
  -- THE ORGANIZATION WALL, BEFORE ANYTHING IS READ. The same helper the unified store's doors
  -- use, memoised per seat per organization, so a non-member is refused here and never reaches a
  -- row of any table.
  perform custom.assert_client_may_reach(p_organization_id, 'workbench.udt_row_words_many');
  v_spec := workbench._udt_display_spec(p_display);

  -- A row the caller may not see comes back as the withheld sentence; a row that is not there at
  -- all comes back as NOTHING, and the caller's cell reads as an unresolvable reference carrying
  -- its own identifier. The ladder is NOT batched: it is asked inside the resolver for every id
  -- in the array, so batching buys a round trip and never a disclosure.
  return query
    select t.id, t.w
      from (
        select i.id, workbench._udt_row_words(p_organization_id, i.id, v_spec, 0) as w
          from unnest(coalesce(p_row_ids, '{}'::uuid[])) as i(id)
         where i.id is not null
      ) t
     where t.w is not null;
end
$function$

;
