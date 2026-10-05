-- chair-step: INVERSE of migrations/campaign/scopesfts1i_a_type_restores_its_fields_before_its_scopes.sql (lane FINISH-THE-SWITCH, FTS-1i): restores custom._ctx_type_subtree_follows as production held it on 2026-10-05 (restore brings the scopes back before the context fields).
-- lane: FINISH-THE-SWITCH (FTS-1i)
-- lock: custom

CREATE OR REPLACE FUNCTION custom._ctx_type_subtree_follows(p_org uuid, p_root uuid, p_when timestamp with time zone, p_restore boolean)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  c        record;
  cr       custom.record;
  e        record;
  v_n      integer := 0;
  v_types  uuid[];
  v_scopes uuid[];
  v_desc   text;
  v_was    text;
  v_actor  text := coalesce(current_setting('app.actor_system', true), '');
begin
  -- WHAT A SCOPE TYPE TAKES WITH IT, IN THE STORE (FTS-1f): what platform._cascade_soft_delete did through the old
  -- scope-type rows (its context fields, its sub-types, its scopes, the rag suggestions aimed at it),
  -- asked of the Records. Archive: everything live under p_root takes p_root's exact time. Restore: exactly what
  -- that removal took (archived at that same time), reached through the sub-types brought back. Called by the
  -- archive door BEFORE the root Table is archived (the store halves never write a row of a removed Table) and by
  -- the restore door AFTER the root Table is live again.
  with recursive under as (
    select p_root as id
    union
    select t.id from custom.record t join under u on t.data ->> 'parent_type_id' = u.id::text
     where t.organization_id = p_org and t.table_id = custom.table_kernel_id() and t.data ->> 'kept_for' = 'context'
       and case when p_restore then t.deleted_at = p_when else t.deleted_at is null end)
  select array_agg(id) into v_types from under;

  if v_actor = '' then perform set_config('app.actor_system', 'custom.context_write_through', true); end if;

  -- Restore brings the sub-types back first, so their rows can be written.
  if p_restore then
    for cr in select t.* from custom.record t where t.organization_id = p_org and t.id = any (v_types) and t.id <> p_root loop
      v_was := custom._ctx_mark('door');
      perform custom._ctx_store_type(p_org, cr.id, custom.scope_type_row_of(cr) || jsonb_build_object('deleted_at', null));
      perform custom._ctx_mark(v_was);
      v_n := v_n + 1;
    end loop;
  end if;

  -- The scopes of every type in the tree.
  select coalesce(array_agg(s.id), '{}'::uuid[]) into v_scopes from custom.record s
   where s.organization_id = p_org and s.table_id = any (v_types) and s.data_class = 'record'
     and case when p_restore then s.deleted_at = p_when else s.deleted_at is null end;
  for c in select s.* from custom.record s where s.organization_id = p_org and s.id = any (v_scopes) loop
    select f.data ->> 'key' into v_desc from custom.record f
     where f.organization_id = p_org and f.id = custom._ctx_id('scope-column-field', c.table_id::text, 'description');
    v_was := custom._ctx_mark('door');
    perform custom._ctx_store_scope(p_org, c.table_id, c.id, jsonb_build_object(
      'id', c.id, 'organization_id', p_org, 'scope_type_id', c.table_id,
      'parent_scope_id', nullif(c.data ->> 'parent_id', ''), 'name', c.data -> 'name',
      'description', coalesce(c.data ->> coalesce(v_desc, 'description'), ''),
      'settings', custom._ctx_scope_settings(p_org, c.table_id, c.data),
      'slug', c.data ->> 'slug', 'sort_order', nullif(c.data ->> 'sort_order', '')::smallint,
      'created_by', c.created_by, 'deleted_at', case when p_restore then null else p_when end));
    perform custom._ctx_mark(v_was);
    v_n := v_n + 1;
  end loop;

  -- The context fields of every type in the tree (a Table's column and settings Fields were never context fields).
  for cr in select f.* from custom.record f
            where f.organization_id = p_org and f.table_id = custom.field_kernel_id() and f.data_class = 'field'
              and f.data ->> 'entity_definition_id' = any (v_types::text[])
              and f.metadata -> 'moved_from' ->> 'table' = 'context.context_items'
              and case when p_restore then f.deleted_at = p_when else f.deleted_at is null end loop
    v_was := custom._ctx_mark('door');
    perform custom._ctx_store_item(p_org, (cr.data ->> 'entity_definition_id')::uuid, cr.id,
      custom.scope_item_row_of(cr) || jsonb_build_object(
        'scope_type_id', (cr.data ->> 'entity_definition_id')::uuid, 'created_by', cr.created_by,
        'deleted_at', case when p_restore then null else p_when end,
        'is_active', coalesce((cr.metadata #>> '{moved_from,carried,is_active}')::boolean, true),
        'review_interval_days', cr.data -> 'review_interval_days', 'depends_on', coalesce(cr.data -> 'depends_on', '[]'::jsonb),
        'status_note', cr.data -> 'status_note', 'source_type', 'manual'));
    perform custom._ctx_mark(v_was);
    v_n := v_n + 1;
  end loop;

  -- Archive takes the sub-types last (their rows first, while each Table is live), deepest first.
  if not p_restore then
    for cr in select t.* from custom.record t where t.organization_id = p_org and t.id = any (v_types) and t.id <> p_root
              order by array_position(v_types, t.id) desc loop
      v_was := custom._ctx_mark('door');
      perform custom._ctx_store_type(p_org, cr.id, custom.scope_type_row_of(cr) || jsonb_build_object('deleted_at', p_when));
      perform custom._ctx_mark(v_was);
      v_n := v_n + 1;
    end loop;
  end if;
  perform set_config('app.actor_system', v_actor, true);

  -- THE ADVICE AND ALERTS aimed at those types and scopes follow on the same time, restored exactly
  -- (the non-context edges of platform.soft_delete_edge; 'keep' edges stay).
  for e in select x.parent_table, x.child_schema, x.child_table, x.child_column from platform.soft_delete_edge x
            where x.parent_schema = 'context' and x.parent_table in ('scope_types', 'scopes') and x.parent_column = 'id'
              and x.action = 'cascade' and x.child_schema <> 'context' loop
    if p_restore then
      execute format('update %I.%I set deleted_at = null where %I = any ($1) and deleted_at = $2',
                     e.child_schema, e.child_table, e.child_column)
        using case when e.parent_table = 'scopes' then v_scopes else v_types end, p_when;
    else
      execute format('update %I.%I set deleted_at = $2 where %I = any ($1) and deleted_at is null',
                     e.child_schema, e.child_table, e.child_column)
        using case when e.parent_table = 'scopes' then v_scopes else v_types end, p_when;
    end if;
  end loop;
  return v_n;
end;
$function$;
revoke all on function custom._ctx_type_subtree_follows(uuid, uuid, timestamptz, boolean) from public, anon, authenticated;
