-- Inverse of migrations/campaign/scopesw2c_the_tag_copy_into_the_old_scope_store_is_gone.sql: every function, owner, grant, trigger and door row exactly as production held them on 2026-10-05.

CREATE OR REPLACE FUNCTION platform._context_tag_copy_fence()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_org  uuid;
  v_on   boolean;
  v_what text;
begin
  -- THE ONE WRITER: the store owner's own connection (the scopes mover and the follow), read
  -- from the catalogue exactly as custom._context_copy_fence does. (SECURITY DEFINER so the
  -- scope's organization and its knob are read whoever writes; custom.caller_role() reads the
  -- role GUC and session_user, which the definer boundary does not move.) A hard delete is
  -- never fenced: the old side's delete of an entity sweeps its edges, copies included.
  if pg_has_role(custom.caller_role(), (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass), 'member') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.role is distinct from 'context_tag' or new.target_type <> 'record' then
      return new;
    end if;
    v_what := 'make';
  else
    if coalesce(old.role, '') <> 'context_tag' and coalesce(new.role, '') <> 'context_tag' then
      return new;
    end if;
    if old.role is distinct from new.role then
      v_what := 'change the role of';
    elsif old.deleted_at is not null and new.deleted_at is null
          and old.deleted_via_id is not null and new.deleted_via_id is null
          and pg_trigger_depth() > 1 then
      -- lane TRASH-COVERAGE-2: the tagged item's own restore (platform._gc_entity_associations,
      -- running as a trigger on the item's table) bringing back exactly the edges its archive
      -- tombstoned — the mirror of the tombstone let through below. Without it no tagged file,
      -- conversation, note, project, task or war room could come back from Trash (42501 on
      -- every restore). A direct revive (trigger depth 1) is still refused.
      return new;
    elsif old.deleted_at is not null and new.deleted_at is null then
      v_what := 'revive';
    elsif new.target_type is distinct from old.target_type or new.target_id is distinct from old.target_id then
      v_what := 're-point';
    elsif new.deleted_at is null and (new.metadata is distinct from old.metadata
                                      or new.position is distinct from old.position
                                      or new.label is distinct from old.label) then
      v_what := 'edit';
    else
      -- A tombstone, or a source moved by a merge: the old side's own cascades, carried; the
      -- follow re-arms on it and puts the old side's word back at the next drain.
      return new;
    end if;
  end if;

  select s.organization_id into v_org from context.scopes s where s.id = new.target_id;
  if v_org is null then
    return new;
  end if;
  -- SCOPES-WRITE-THROUGH: in an organization whose store is the writer, the write-through (marked)
  -- carries each tag in the same statement as the tag itself.
  if custom._ctx_marked() and custom.context_writer(v_org) = 'store' then
    return new;
  end if;
  v_on := coalesce((platform.knob_resolve('custom', 'context_copy_following', v_org) #>> '{}')::boolean, true);
  if not v_on then
    return new;
  end if;

  raise exception 'This is the new system''s copy of a context tag; it follows the current tags until the switch, so nobody may % it here. Tag or untag the item in its Context section.', v_what
    using errcode = '42501',
          hint = 'SC-4 P4: while custom/context_copy_following is on for the scope''s organization, only the follow of the current screens writes the record store''s copied tags (role context_tag). Nothing was written.';
end;
$function$

;
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
$function$

;
CREATE OR REPLACE FUNCTION custom.context_tag_copy_batch(p_organization_id uuid, p_cursor jsonb DEFAULT NULL::jsonb, p_rows integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  g          record;
  v_rows     integer;
  v_phase    text := coalesce(p_cursor->>'phase', 'tags');
  v_t        uuid := nullif(p_cursor->>'target_id', '')::uuid;
  v_st       text := p_cursor->>'source_type';
  v_s        uuid := nullif(p_cursor->>'source_id', '')::uuid;
  v_after    uuid := nullif(p_cursor->>'after_id', '')::uuid;
  v_seen     integer := 0;
  v_next     jsonb;
  v_did      text;
  v_last_id  uuid;
  n_made    int := 0;
  n_revived int := 0;
  n_archived int := 0;
  n_updated int := 0;
  n_same    int := 0;
  n_current int := 0;
  n_waiting int := null;
  n_refused int := 0;
  v_refused jsonb := '[]'::jsonb;
begin
  if p_organization_id is null then
    raise exception 'Name the organization whose tags are to be copied.'
      using errcode = '22004', detail = 'custom.context_tag_copy_batch needs p_organization_id.';
  end if;
  if v_phase not in ('tags', 'archive') then
    raise exception 'The copy cannot carry on from where it stopped; start it again from the beginning.'
      using errcode = '22023', detail = format('custom.context_tag_copy_batch: the cursor names phase %s, which is neither tags nor archive', v_phase), hint = 'Pass null to start, then the "next" this function returned.';
  end if;
  v_rows := coalesce(p_rows, (platform.knob_resolve('context', 'follow_batch_rows', p_organization_id) #>> '{}')::integer, 10);
  v_rows := least(greatest(v_rows, 1), 1000);
  -- WHO IS WRITING, NAMED (the provenance stamp refuses an automated write that does not say).
  if coalesce(current_setting('app.actor_system', true), '') = '' then
    perform set_config('app.actor_system', 'matrx_records.context_follow', true);
  end if;

  if p_cursor is null then
    -- EVERY SCOPE TAG TYPE HAS ITS STORE TWIN (lane PROOF-DEFECTS, D3), registered once per copy.
    insert into platform.association_types (source_type, target_type, label, container_side, conveys_max, is_active, notes)
    select a.source_type, 'record', a.label, a.container_side, a.conveys_max, true,
           'SC-4 P4: the record store''s copy of a context tag (role context_tag), twin of '
           || a.source_type || ' -> scope; same label, container side and conveyance. Written only by the context follow until the switch.'
      from platform.association_types a
     where a.target_type = 'scope' and a.is_active
       and not exists (select 1 from platform.association_types t
                        where t.source_type = a.source_type and t.target_type = 'record')
    on conflict (source_type, target_type) do nothing;

    -- A scope whose copy Record has not landed yet waits for the copy (counted once, never guessed).
    select count(distinct a.id) into n_waiting
      from platform.associations a
      join context.scopes s on s.id = a.target_id
     where a.target_type = 'scope' and s.organization_id = p_organization_id
       and not exists (select 1 from custom.record r
                        where r.organization_id = p_organization_id and r.id = a.target_id
                          and r.data_class = 'record');
  end if;

  if v_phase = 'tags' then
    -- A NEW TAG'S REACHABILITY REFRESH IS DEFERRED to platform.reachability_flush (1381): this
    -- transaction only, trusted backend only; a new edge conveys nothing until it is flushed.
    perform platform.reachability_defer_begin();
    for g in
      select distinct x.target_id, x.source_type, x.source_id
        from platform.associations x
        join context.scopes s on s.id = x.target_id
       where x.target_type = 'scope'
         and s.organization_id = p_organization_id
         and (v_t is null or (x.target_id, x.source_type, x.source_id) > (v_t, v_st, v_s))
         and exists (select 1 from custom.record r
                      where r.organization_id = p_organization_id and r.id = x.target_id
                        and r.data_class = 'record')
       order by x.target_id, x.source_type, x.source_id
       limit v_rows
    loop
      v_seen := v_seen + 1;
      v_t := g.target_id; v_st := g.source_type; v_s := g.source_id;
      begin
        -- ONE BODY FOR ONE TAG (SCOPES-WRITE-THROUGH): the per-edge write-through calls the same.
        v_did := custom._ctx_store_tag(p_organization_id, g.source_type, g.source_id, g.target_id);
        case v_did
          when 'made' then n_made := n_made + 1;
          when 'revived' then n_revived := n_revived + 1;
          when 'updated' then n_updated := n_updated + 1;
          when 'current' then n_current := n_current + 1;
          when 'archived' then n_archived := n_archived + 1;
          when 'same_edge_already_there' then n_same := n_same + 1;
          else null;
        end case;
      exception
        when check_violation or foreign_key_violation or insufficient_privilege or raise_exception then
          -- ONE TAG THE STORE REFUSES IS NAMED, AND THE REST OF THE ORGANIZATION IS COPIED (D3).
          n_refused := n_refused + 1;
          if jsonb_array_length(v_refused) < 20 then
            v_refused := v_refused || jsonb_build_array(jsonb_build_object(
              'pair', g.source_type || ' -> record',
              'source_id', g.source_id,
              'scope_id', g.target_id,
              'sqlstate', sqlstate,
              'says', left(split_part(sqlerrm, E'\n', 1), 300)));
          end if;
      end;
    end loop;
    if v_seen = v_rows then
      v_next := jsonb_build_object('phase', 'tags', 'target_id', v_t, 'source_type', v_st, 'source_id', v_s);
    else
      v_next := jsonb_build_object('phase', 'archive');
    end if;
  else
    -- A COPIED TAG WHOSE OLD EDGE IS GONE ALTOGETHER (hard-deleted on the old side) is archived.
    with pick as (
      select t.id
        from platform.associations t
       where t.target_type = 'record' and t.role = 'context_tag' and t.deleted_at is null
         and (v_after is null or t.id > v_after)
         and exists (select 1 from context.scopes s where s.id = t.target_id and s.organization_id = p_organization_id)
       order by t.id
       limit v_rows),
    gone as (
      update platform.associations t
         set deleted_at = now(), deleted_via_type = null, deleted_via_id = null
        from pick
       where t.id = pick.id
         and not exists (select 1 from platform.associations x
                          where x.target_type = 'scope' and x.target_id = t.target_id
                            and x.source_type = t.source_type and x.source_id = t.source_id)
      returning 1)
    select (select count(*) from pick), (select max(id::text)::uuid from pick), (select count(*) from gone)
      into v_seen, v_last_id, n_archived;
    v_next := case when v_seen = v_rows then jsonb_build_object('phase', 'archive', 'after_id', v_last_id) end;
  end if;

  return jsonb_build_object(
    'organization_id', p_organization_id, 'phase', v_phase, 'rows', v_rows, 'seen', v_seen,
    'made', n_made, 'revived', n_revived, 'archived', n_archived, 'updated', n_updated,
    'current', n_current, 'same_edge_already_there', n_same, 'waiting_for_the_record', n_waiting,
    'refused', n_refused, 'refused_tags', v_refused, 'next', v_next);
end;
$function$

;
CREATE OR REPLACE FUNCTION custom.context_tag_copy(p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  -- RETIRED AS A ONE-TRANSACTION DOOR (lane FOLLOW-BATCH-2). Copying a whole organization's tags in
  -- the caller's transaction holds the sign-in table (auth.users, every copied tag's created_by) until
  -- that transaction commits: minutes for a large organization. A SECURITY DEFINER function cannot
  -- commit between batches, so this door refuses and names the one that can be committed per step.
  raise exception 'Copying a whole organization''s tags in one step is no longer offered; nothing was copied. Copy them in batches instead.'
    using errcode = '0A000',
          detail = format('custom.context_tag_copy copies a whole organization in one transaction, which holds the sign-in table until it commits, so it no longer runs. Organization %s: nothing was copied.', coalesce(p_organization_id::text, '(none named)')),
          hint = 'Call custom.context_tag_copy_batch(organization_id, cursor) and COMMIT after each call, passing back the "next" cursor it returns until it is null, then platform.reachability_flush(5) in short transactions until it returns less than 5. The context follow (aidream matrx_records.movers.context_follow) does exactly that; a new edit to any of the organization''s scopes wakes it.';
end;
$function$

;
alter function platform._context_tag_copy_fence() owner to postgres;
alter function platform._context_tag_follow_to_the_copy() owner to postgres;
alter function custom.context_tag_copy_batch(uuid, jsonb, integer) owner to postgres;
alter function custom.context_tag_copy(uuid) owner to postgres;
revoke all on function custom.context_tag_copy_batch(uuid, jsonb, integer) from public;
revoke all on function custom.context_tag_copy(uuid) from public;
CREATE TRIGGER _ab_context_tag_copy_fence_ins BEFORE INSERT ON platform.associations FOR EACH ROW WHEN ((new.role = 'context_tag'::text)) EXECUTE FUNCTION platform._context_tag_copy_fence();
CREATE TRIGGER _ab_context_tag_copy_fence_upd BEFORE UPDATE ON platform.associations FOR EACH ROW WHEN (((old.role = 'context_tag'::text) OR (new.role = 'context_tag'::text))) EXECUTE FUNCTION platform._context_tag_copy_fence();
CREATE TRIGGER zz_context_tag_follow_ins AFTER INSERT ON platform.associations FOR EACH ROW WHEN (((new.target_type = 'scope'::text) OR (new.role = ANY (ARRAY['context_tag'::text, 'record_scope'::text])))) EXECUTE FUNCTION platform._context_tag_follow_to_the_copy();
CREATE TRIGGER zz_context_tag_follow_upd AFTER UPDATE ON platform.associations FOR EACH ROW WHEN (((old.target_type = 'scope'::text) OR (new.target_type = 'scope'::text) OR (old.role = ANY (ARRAY['context_tag'::text, 'record_scope'::text])) OR (new.role = ANY (ARRAY['context_tag'::text, 'record_scope'::text])))) EXECUTE FUNCTION platform._context_tag_follow_to_the_copy();
CREATE TRIGGER zz_context_tag_follow_del AFTER DELETE ON platform.associations FOR EACH ROW WHEN (((old.target_type = 'scope'::text) OR (old.role = ANY (ARRAY['context_tag'::text, 'record_scope'::text])))) EXECUTE FUNCTION platform._context_tag_follow_to_the_copy();
insert into platform.client_callable_door select * from jsonb_populate_record(null::platform.client_callable_door, '{"id": "14dbe5d7-5a93-44a3-8412-57dbb5e96fdd", "reason": "p_organization_id names the organization whose copied tags are brought current; it is read only to select that organization''s scopes and their copy Records, and a NULL is refused (22004).", "probe_args": null, "declared_at": "2026-09-25T02:51:25.821207+00:00", "declared_by": "sc4_every_context_tag_has_one_copy_in_the_store.sql", "schema_name": "custom", "refusal_only": false, "function_name": "context_tag_copy", "identity_args": "p_organization_id uuid", "argument_rules": null, "contract_probe": null, "gate_predicate": null, "non_client_lane": "server_only: the context follow (aidream matrx_records.movers.context_follow, on the store owner''s own connection) calls it inside its copy of one organization; no client ever does, and the fence refuses any other writer of a copied tag.", "anonymous_callers": false, "anonymous_purpose": null, "identity_argtypes": ["2950"], "signed_in_callers": false}');
insert into platform.client_callable_door select * from jsonb_populate_record(null::platform.client_callable_door, '{"id": "96a27676-7bf4-495d-8d26-04a6570570fe", "reason": "p_organization_id names the organization whose copied tags are brought current; it is read only to select that organization''s scopes and their copy Records, and a NULL is refused (22004). p_cursor is the keyset position this function itself returned (no entity id is trusted from it beyond ordering within that organization''s own edges); p_rows is clamped to 1..1000.", "probe_args": null, "declared_at": "2026-09-27T17:24:34.89231+00:00", "declared_by": "tagcopyperf_the_context_tag_copy_runs_in_short_batches.sql", "schema_name": "custom", "refusal_only": false, "function_name": "context_tag_copy_batch", "identity_args": "p_organization_id uuid, p_cursor jsonb, p_rows integer", "argument_rules": null, "contract_probe": null, "gate_predicate": null, "non_client_lane": "server_only: the context follow (aidream matrx_records.movers.context_follow, on the store owner''s own connection) calls it once per short batch after its copy of one organization commits; no client ever does, and the fence refuses any other writer of a copied tag.", "anonymous_callers": false, "anonymous_purpose": null, "identity_argtypes": ["2950", "3802", "23"], "signed_in_callers": false}');
