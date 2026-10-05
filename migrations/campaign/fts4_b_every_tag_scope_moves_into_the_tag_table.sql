-- lane: FINISH-THE-SWITCH
-- lock: platform
-- based-on: platform._context_tag_follow_to_the_copy() 26c62a48faf9eab2b565e9efc601414a80bc190d6413486f8ab9fa11b55cbddd
--
-- FTS-4 b/4 — EVERY LIVE (AND ARCHIVED) TAG SCOPE BECOMES A platform.tag ROW WITH THE SAME ID, AND THE EDGES
-- THAT POINT AT IT POINT AT THE TAG. Same ids on purpose: no edge needs an id remap, the search filter
-- (`within` = ids) and every id a client already holds keep working. Nothing is deleted: the scopes stay where
-- they are until file d archives them, after the readers have moved.
-- Census 2026-10-04: 9,321 tag scopes in 38 organizations (no slug collision inside an organization, no
-- scope without a slug or a name), 19,572 live + 69 archived edges.

set local statement_timeout = '600s';

select set_config('app.actor_tier', 'system', true);
select set_config('app.actor_system', 'fts4.tags_move', true);
select platform.reachability_defer_begin();   -- the access index is refreshed once, at the end

insert into platform.tag (id, organization_id, name, slug, color, created_by, updated_by, created_at, updated_at,
                          deleted_at, visibility, metadata)
select s.id, s.organization_id, btrim(s.name), s.slug, nullif(s.settings ->> 'color', ''), s.created_by,
       s.updated_by, s.created_at, s.updated_at, s.deleted_at, s.visibility, coalesce(s.metadata, '{}'::jsonb)
  from context.scopes s
  join context.scope_types st on st.id = s.scope_type_id
 where st.slug = 'tag'
on conflict (id) do nothing;

-- The old side's follow would copy each re-pointed edge into the record store as it goes; the tag is not a
-- scope any more and that mirror is being retired, so the follow now lets a scope-to-tag re-point pass.
CREATE OR REPLACE FUNCTION platform._context_tag_follow_to_the_copy()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_row  platform.associations%rowtype := case when tg_op = 'DELETE' then old else new end;
  v_org  uuid;
  v_type uuid;
  v_on   boolean;
begin
  -- FTS-4 (2026-10-04): an edge re-pointed from a scope to the platform tag is not a scope edge any more; the
  -- record store's copy of tags is retired, so there is nothing to follow.
  if tg_op = 'UPDATE' and old.target_type = 'scope' and new.target_type = 'tag' then
    return null;
  end if;
  -- The follow's own write to a copy is not news (it would wake the follow to re-copy itself), and
  -- neither is the write-through's (SCOPES-WRITE-THROUGH, marked for its transaction).
  if v_row.target_type = 'record' and custom._ctx_marked() then
    return null;
  end if;
  if v_row.target_type = 'record'
     and pg_has_role(custom.caller_role(), (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass), 'member') then
    return null;
  end if;

  select s.organization_id, s.scope_type_id into v_org, v_type
    from context.scopes s where s.id = v_row.target_id;
  if v_org is null and tg_op = 'UPDATE' then
    select s.organization_id, s.scope_type_id into v_org, v_type
      from context.scopes s where s.id = old.target_id;
  end if;
  if v_org is null then
    return null;
  end if;
  -- SCOPES-WRITE-THROUGH: in an organization whose store is the writer, this tag's copy is brought
  -- current in the same statement (outside the handler below, so a store refusal refuses the tag).
  if custom.context_writer(v_org) = 'store' then
    declare
      v_was text := custom._ctx_mark('bridge');
    begin
      if coalesce(current_setting('app.actor_system', true), '') = '' then
        perform set_config('app.actor_system', 'custom.context_write_through', true);
      end if;
      perform custom._ctx_store_tag(v_org, v_row.source_type, v_row.source_id, v_row.target_id);
      if tg_op = 'UPDATE' and old.target_id is distinct from new.target_id and old.target_type = 'scope' then
        perform custom._ctx_store_tag(v_org, old.source_type, old.source_id, old.target_id);
      end if;
      perform custom._ctx_mark(v_was);
    end;
    return null;
  end if;
  begin
  v_on := coalesce((platform.knob_resolve('custom', 'context_copy_following', v_org) #>> '{}')::boolean, true);
  if not v_on then
    return null;
  end if;

  insert into custom.io_outbox (event_key, record_id, table_id, operation, dedupe_key, organization_id, actor)
  values ('context.follow', v_row.id, v_type,
          case tg_op when 'INSERT' then 'created' when 'DELETE' then 'deleted' else 'updated' end,
          'context.follow:associations:' || v_row.id::text,
          v_org,
          jsonb_build_object('declared', 'platform.associations', 'user_id', auth.uid(),
                             'source_type', v_row.source_type, 'target_type', v_row.target_type))
  on conflict (organization_id, dedupe_key) where deleted_at is null
  do update set consumed_at = null,
                consumer    = null,
                operation   = excluded.operation,
                actor       = excluded.actor;
  -- RE-ARMED FOR EVERY CONSUMER (CHAIR-RECORD-CHANGED): once each consumer keeps its own
  -- consumption, a re-armed row is news again only when those rows go too.
  if custom.io_outbox_per_consumer() then
    perform custom.io_outbox_rearm(v_org, 'context.follow:associations:' || v_row.id::text);
  end if;
  perform pg_notify('records_changed',
                    jsonb_build_object('organization_id', v_org, 'record_id', v_row.id, 'table_id', v_type,
                                       'operation', 'updated', 'event_key', 'context.follow')::text);
  return null;
  exception when others then
  -- NEVER FAIL THE OLD SIDE'S TAG, NEVER FAIL IN SILENCE (same rule as context._follow_to_the_copy).
  begin
    perform ops.record_system_error(jsonb_build_object(
      'kind', 'context_follow_enqueue_failure',
      'organization_id', v_org,
      'source_app', 'database',
      'source_feature', 'context-follow',
      'route', 'platform._context_tag_follow_to_the_copy',
      'error_type', sqlstate,
      'error_text', sqlerrm,
      'context', jsonb_build_object('table', 'platform.associations', 'row_id', v_row.id, 'operation', tg_op,
                               'remedy', 'run the follow for this organization: python -m matrx_records.movers.runner --follow-context --organization <id> --apply --i-know-this-writes')));
  exception when others then
    raise warning 'platform._context_tag_follow_to_the_copy: could not tell the copy about tag % (%), and could not record it: %',
      v_row.id, tg_op, sqlerrm;
  end;
  return null;
  end;
end;
$function$;

update platform.associations a
   set target_type = 'tag'
 where a.target_type = 'scope'
   and exists (select 1 from platform.tag t where t.id = a.target_id);
