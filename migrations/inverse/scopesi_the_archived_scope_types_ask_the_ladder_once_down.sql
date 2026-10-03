-- chair-step: the inverse of migrations/campaign/scopesi_the_archived_scope_types_ask_the_ladder_once.sql:
--   puts back the custom.context_archived_types body of scopesb2 (2026-10-03), which asks the archive door
--   once per archived type without naming the pairs (each ask walks containment on its own). Same answer.
-- lane: SCOPES-ON-THE-STORE
-- based-on: custom.context_archived_types(uuid) 8ccd02ff4a73cdae78effc0bb95bf3ad1f6d8e1d73654da0d07d0d41e440e1ac

CREATE OR REPLACE FUNCTION custom.context_archived_types(p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me       uuid := custom.query_principal();
  v_uid      uuid := auth.uid();
  v_tables   uuid := custom.table_kernel_id();
  v_cand     uuid[];
  v_level    public.permission_level;
  v_mask     jsonb;
  v_shown    text[];
  v_declared text[];
  v_rows     jsonb;
  v_counts   jsonb := '{}'::jsonb;   -- archived type id -> archived scopes the caller could see
  v_type     uuid;
  v_page     integer;
  v_got      integer;
  v_n        integer;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.context_archived_types');
  if v_me is null then
    return '[]'::jsonb;
  end if;
  -- STORE-READ-PERF-5 (2026-09-30). ONLY THE ARCHIVED TABLES THE CONTEXT SYSTEM KEPT ARE READ.
  -- This door used to page custom.read_records_archived over EVERY archived Table of the organization
  -- (200 a page, each row rendered: its derived values, the mask, the choice labels) and keep the
  -- ones whose document said kept_for = context. test@test.com's own workspace holds 1,313 archived
  -- Tables and no archived scope type: 7-30 s to answer []. The candidates are the archived,
  -- unquarantined kernel rows whose stored kept_for is context (a superset of what the old filter
  -- kept, which read the same key from the rendered document); none, and the answer is [].
  -- The Table decision is asked first, as the archive door asked it (the wall was asked above, in
  -- this door's own name).
  perform custom.assert_may_know_table(p_organization_id, v_tables, 'custom.context_archived_types');
  select coalesce(array_agg(r.id), '{}'::uuid[]) into v_cand
    from custom.record r
   where r.organization_id = p_organization_id
     and r.table_id = v_tables
     and r.deleted_at is not null
     and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
     and r.data ->> 'kept_for' = 'context';
  if cardinality(v_cand) = 0 then
    return '[]'::jsonb;
  end if;
  -- Of the candidates, exactly what the archive door answers about them: its rows through the one
  -- ladder's own predicate for this Table at viewer (custom.visible_predicate_sql, the sentence the
  -- archive door writes into its WHERE), each document through the one read mask
  -- (custom.read_mask_for at the caller's level on the Table), custom.mask_document,
  -- custom.choice_render and custom.with_whole_value_pointers, in that order, as the door renders it.
  v_level := custom.effective_level(v_uid, p_organization_id, v_tables);
  v_mask := custom.read_mask_for(v_uid, p_organization_id, v_tables, v_level, 'read');
  select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_shown
    from jsonb_array_elements(v_mask -> 'visible') x;
  select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_declared
    from jsonb_array_elements(v_mask -> 'declared') x;
  execute format($q$
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', r.id, 'doc', custom.record_values_of(r), 'wv', r.data -> '_values',
             'ws', r.data -> '_sources', 'at', r.deleted_at)), '[]'::jsonb)
      from custom.record r
     where r.organization_id = %1$L::uuid
       and r.table_id = %2$L::uuid
       and r.id = any (%3$L::uuid[])
       and r.deleted_at is not null
       and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
       and %4$s
  $q$,
    p_organization_id, v_tables, v_cand,
    custom.visible_predicate_sql(v_uid, p_organization_id, v_tables, 'viewer'::public.permission_level, 'r'))
  into v_rows;
  -- Each carries how many of its scopes were archived, which is what a restore brings back.
  -- THE ARCHIVED SCOPES THE CALLER COULD SEE (lane 9 SCOPES-ON-THE-STORE, chair ruling 4, 2026-10-02):
  -- exactly the rows the data home's archive answers the caller for that Table — custom.read_records_archived
  -- itself (the one ladder's predicate at viewer, the "Only me" list rule, quarantine left out), read page by
  -- page at the organization's page ceiling and counted. Its WHERE is not copied here: it reads the row
  -- column T-13 retires, which only the archive door may (platform._t13_allowlist). A type with no archived
  -- Record at all is 0 without asking the door; a Table the caller may not know (42501) is 0 — nothing
  -- there is theirs to bring back. The count used to be every archived Record of the Table, whoever could
  -- open it.
  for v_type in
    select distinct (p ->> 'id')::uuid from jsonb_array_elements(coalesce(v_rows, '[]'::jsonb)) p
     where exists (select 1 from custom.record r
                    where r.organization_id = p_organization_id
                      and r.table_id = (p ->> 'id')::uuid and r.deleted_at is not null)
  loop
    v_n := 0;
    if v_uid is not null then
      v_page := greatest(coalesce(custom.page_ceiling(p_organization_id), 200), 1);
      begin
        loop
          select count(*) into v_got
            from custom.read_records_archived(p_organization_id, v_type, 'org', false, v_page, v_n) x;
          v_n := v_n + v_got;
          exit when v_got < v_page;
        end loop;
      exception when insufficient_privilege then
        v_n := 0;
      end;
    end if;
    v_counts := v_counts || jsonb_build_object(v_type::text, v_n);
  end loop;
  return (
    select coalesce(jsonb_agg(z.x order by z.x ->> 'deleted_at' desc, z.x ->> 'id'), '[]'::jsonb)
      from (
        select jsonb_build_object(
                 'id', (p ->> 'id')::uuid, 'organization_id', p_organization_id,
                 'label_singular', d.doc -> 'label_singular', 'label_plural', d.doc -> 'label_plural',
                 'icon', d.doc -> 'icon', 'color', d.doc -> 'color',
                 'deleted_at', p -> 'at',
                 'archived_scope_count', coalesce((v_counts ->> (p ->> 'id'))::integer, 0)) as x
          from jsonb_array_elements(v_rows) p
          cross join lateral (
            select custom.with_whole_value_pointers(
                     custom.choice_render(p_organization_id, v_tables,
                       custom.mask_document(p -> 'doc', v_shown, v_mask -> 'notices', false,
                                            v_mask -> 'all_key_ids', v_declared)),
                     p -> 'wv', p -> 'ws', v_shown, false, v_mask -> 'all_key_ids') as doc) d
         where d.doc ->> 'kept_for' = 'context') z);
end;
$function$;
