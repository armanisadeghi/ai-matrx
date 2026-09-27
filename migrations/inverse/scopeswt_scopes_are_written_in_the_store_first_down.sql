-- INVERSE of migrations/campaign/scopeswt_scopes_are_written_in_the_store_first.sql (lane SCOPES-WRITE-THROUGH).
-- chair-step: puts back the five bodies it replaced, byte for byte as production held them before it (the old tables' follow trigger, the copy fence, the tag fence, the tag follow trigger, custom.context_tag_copy), and drops what it added (the store halves, the write-through, custom.context_writer, the mover's words in SQL, the switch's setting and its write door). Refused while any organization is switched to the store: switch it back first (platform.cutover_seam_press ... 'old', or platform.cutover_seam_press_everyone('scopes_screens','old')). An organization born on the store while this was in place goes back to the old tables as its writer with nothing lost: both sides were equal at every save, and the copy follows again. Run the doors' and the switch's inverses first.
-- ground-standing-ok: d — custom.context_writer is read by lane FINAL-SWITCH's platform._final_switch_readiness, which also depends on this lane's platform.cutover_seam_press_everyone (dropped by the switch's inverse, which must run first) and refuses the scope screens step without it; undoing this lane means the final switch has no scope screens step to run, and its file is reverted (or its readiness reads context_writer through to_regprocedure) before this runs.
-- based-on: context._follow_to_the_copy() 7635204a69e42b4d198355c0b8a9b806f97c85dd9b142847f5a52d30b62b17e3
-- based-on: custom._context_copy_fence() feac0eb3241a3b073270bc04d927a21ff14a6b963c8a93674ef5089064275ab6
-- based-on: platform._context_tag_copy_fence() a50ea89724ebe740d8ef102ae34014b1ef028db3cace35a805c4a1f44e809acb
-- based-on: platform._context_tag_follow_to_the_copy() 54a58f704c13241fcdf79dc0cd882cfe624d9e4a563179718415df7946f2b48a
-- based-on: custom.context_tag_copy(uuid) 955be971e3620fc8b92abd1556120f62b62dff9d0928e725beb88e69dcbb0f2d


do $$
begin
  if exists (select 1 from platform.knob_override o
              where o.feature = 'custom' and o.key = 'scopes_written_in_the_store' and o.value = 'true'::jsonb) then
    raise exception 'An organization is switched to write its scopes in the store. Switch it back first (platform.cutover_seam_press_everyone(''scopes_screens'', ''old'')), then run this inverse.'
      using errcode = '55000';
  end if;
  if to_regprocedure('custom.context_value_write(jsonb)') is not null
     or to_regprocedure('platform.cutover_seam_press_everyone(text,text,text,boolean,uuid[],uuid)') is not null then
    raise exception 'Run scopeswt_the_scopes_switch_presses_for_one_organization_or_all_down.sql and scopeswt_the_scope_doors_down.sql first.'
      using errcode = '55000';
  end if;
end $$;

CREATE OR REPLACE FUNCTION context._follow_to_the_copy()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_row  jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_id   uuid  := (v_row ->> 'id')::uuid;
  v_org  uuid;
  v_type uuid;
  v_on   boolean;
begin
  -- WHICH ORGANIZATION AND WHICH SCOPE TYPE (the copy's Table) this row belongs to.
  if tg_table_name = 'scope_types' then
    v_org  := (v_row ->> 'organization_id')::uuid;
    v_type := v_id;
  elsif tg_table_name = 'scopes' then
    v_org  := (v_row ->> 'organization_id')::uuid;
    v_type := (v_row ->> 'scope_type_id')::uuid;
  elsif tg_table_name = 'context_items' then
    v_type := (v_row ->> 'scope_type_id')::uuid;
    select t.organization_id into v_org from context.scope_types t where t.id = v_type;
  elsif tg_table_name = 'context_item_values' then
    select s.organization_id, s.scope_type_id into v_org, v_type
      from context.scopes s where s.id = (v_row ->> 'scope_id')::uuid;
  end if;
  if v_org is null then
    return null;
  end if;

  v_on := coalesce((platform.knob_resolve('custom', 'context_copy_following', v_org) #>> '{}')::boolean, true);
  if not v_on then
    return null;
  end if;

  insert into custom.io_outbox (event_key, record_id, table_id, operation, dedupe_key, organization_id, actor)
  values ('context.follow', v_id, v_type,
          case tg_op when 'INSERT' then 'created' when 'DELETE' then 'deleted' else 'updated' end,
          'context.follow:' || tg_table_name || ':' || v_id::text,
          v_org,
          jsonb_build_object('declared', 'context.' || tg_table_name, 'user_id', auth.uid()))
  on conflict (organization_id, dedupe_key) where deleted_at is null
  do update set consumed_at = null,
                consumer    = null,
                operation   = excluded.operation,
                actor       = excluded.actor;
  -- A RE-ARMED ROW IS NEWS TOO. custom.io_outbox_announce fires on INSERT only, so the second
  -- edit of the same old row (an update of the outbox row) would wake nobody; say it here, in the
  -- announce's own shape (a pointer, never the row). The follow debounces, so a duplicate on the
  -- first insert costs nothing.
  perform pg_notify('records_changed',
                    jsonb_build_object('organization_id', v_org, 'record_id', v_id, 'table_id', v_type,
                                       'operation', 'updated', 'event_key', 'context.follow')::text);
  return null;
exception when others then
  -- NEVER FAIL THE OLD SIDE'S EDIT, NEVER FAIL IN SILENCE. The current screens are the writer;
  -- an edit there must land whether or not the copy could be told. The miss is recorded with its
  -- remedy, and the next change to the same organization (or any follow drain run for it)
  -- re-plans the whole organization, so nothing is lost for good.
  begin
    insert into ops.system_error (kind, organization_id, source_app, source_feature, route, error_type, error_text, context)
    values ('context_follow_enqueue_failure', v_org, 'database', 'context-follow',
            'context._follow_to_the_copy', sqlstate, sqlerrm,
            jsonb_build_object('table', 'context.' || tg_table_name, 'row_id', v_id, 'operation', tg_op,
                               'remedy', 'run the follow for this organization: python -m matrx_records.movers.runner --follow-context --organization <id> --apply --i-know-this-writes'));
  exception when others then
    raise warning 'context._follow_to_the_copy: could not tell the copy about %.% (%), and could not record it: %',
      'context', tg_table_name, v_id, sqlerrm;
  end;
  return null;
end;
$function$

;

CREATE OR REPLACE FUNCTION custom._context_copy_fence()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_role   name := custom.caller_role();
  v_table  uuid;
  v_key    text;
  v_hit    text;
  v_kept   text;
  v_name   text;
  v_on     boolean;
  v_where  text;
  v_older  text;
  v_copyof uuid;
begin
  v_copyof := case when new.data_class = 'table' then new.id
                   when new.data_class = 'field' then nullif(new.data ->> 'entity_definition_id', '')::uuid
                   else new.table_id end;

  -- THE ONE WRITER. The store owner's own connection — the scopes mover, the follow worker and
  -- the older-tables mover's rerun — may write any copy. Read from the catalogue, never a role
  -- literal, exactly as custom._store_door's operator lane is. When it rewrites a test-copy row a
  -- person had touched, what it writes is the image the switch will put back (COPY-WRITABLE).
  if pg_has_role(v_role, (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass), 'member') then
    if tg_op = 'UPDATE' and custom._copy_evaluation_is_open(new.organization_id, new.id) then
      perform custom._copy_evaluation_reimage(new.organization_id, new.id, to_jsonb(new));
    end if;
    return new;
  end if;

  -- THE OLDER TABLE IS THE WRITER UNTIL THE SWITCH — FOR AGENTS, AUTOMATIONS AND INTEGRATIONS
  -- (WHERE-LIVES-SWITCH, amended by COPY-WRITABLE 2026-09-25). COPY mode keeps every older table
  -- live beside its same-id copy until an owner presses the organization's Data tables switch.
  -- A PERSON's own write to the copy (the new table page, the record page) is a test: allowed,
  -- and noted with the row as the mover left it, so the switch can replace it with the older
  -- table's truth. Any other writer is refused with the older table's address.
  v_older := custom._older_table_copy_refusal(v_copyof);
  if v_older is null and v_copyof is not null then
    perform custom._copy_evaluation_note(new.organization_id, v_copyof, new.id, new.data_class);   -- notes only a person's write to a test copy
  elsif v_older is not null then
    raise exception '%', v_older
      using errcode = '42501',
            hint = 'WHERE-LIVES-SWITCH / COPY-WRITABLE: platform.table_lives_in answers ''older'' for this table (its older table is live and the organization''s older_tables switch is off), and this write declares an agent, automation or integration (or is not a signed-in person''s own). Nothing was written. Write the older table; after the switch the copy is the table.';
  end if;

  -- WHICH TABLE THIS ROW BELONGS TO: a Table record is itself; a Field names its Table; every
  -- other row is a record of new.table_id.
  -- A scope's OWN table (G11, tied to its scope by `scope_binding`) is not a copy: the store is
  -- its writer, and people keep rows in it. Only the Tables the scopes mover lands — one per
  -- scope type, carrying no binding — are the copy.
  if new.data_class = 'table' then
    v_kept := case when new.data ? 'scope_binding' then '' else coalesce(new.data ->> 'kept_for', '') end;
    if tg_op = 'UPDATE' and v_kept <> 'context' and not (old.data ? 'scope_binding') then
      v_kept := coalesce(old.data ->> 'kept_for', '');   -- taking the word off is a write too
    end if;
    v_name := coalesce(nullif(new.data ->> 'name', ''), 'this table');
  else
    v_table := v_copyof;
    if v_table is null then
      return new;
    end if;
    -- ONE PRIMARY-KEY READ, NO MEMO. The store's memo (platform.memo_k_*) is WRITE-PERF-4's, and
    -- its inverse takes it away; a trigger that reached it would stand over a missing body after
    -- that rollback (check:inverses-leave-the-ground-standing, clause a). The read is the
    -- (organization_id, id) primary key of one partition.
    select case when t.data ? 'scope_binding' then '' else coalesce(t.data ->> 'kept_for', '') end
           || chr(31) || coalesce(nullif(t.data ->> 'name', ''), 'this table')
      into v_hit
      from custom.record t
     where t.organization_id = new.organization_id
       and t.id = v_table
       and t.table_id = custom.table_kernel_id();
    v_hit := coalesce(v_hit, chr(31));
    v_kept := split_part(v_hit, chr(31), 1);
    v_name := split_part(v_hit, chr(31), 2);
  end if;

  if v_kept is distinct from 'context' then
    return new;
  end if;

  v_on := coalesce((platform.knob_resolve('custom', 'context_copy_following', new.organization_id) #>> '{}')::boolean, true);
  if not v_on then
    return new;
  end if;

  -- WHERE TO EDIT IT INSTEAD. A copied Record keeps its scope's id, so its scope page is known;
  -- a change to the Table or its Fields is a change to the scope type, made on the scopes screen.
  v_where := case when new.data_class = 'record' then '/scopes/s/' || new.id::text else '/scopes/manage' end;

  raise exception 'This is the new system''s copy of %; it follows the current screens until the switch. Edit it on %.',
                  v_name, v_where
    using errcode = '42501',
          hint = 'SC-1'' P13: while custom/context_copy_following is on for this organization, only the follow of the current scope screens writes the record store''s copy of the context system. Nothing was written. The switch to the new system turns this off; an organization where the store is the writer turns it off for itself.';
end;
$function$

;

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
  -- The follow's own write to a copy is not news (it would wake the follow to re-copy itself).
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
  perform pg_notify('records_changed',
                    jsonb_build_object('organization_id', v_org, 'record_id', v_row.id, 'table_id', v_type,
                                       'operation', 'updated', 'event_key', 'context.follow')::text);
  return null;
exception when others then
  -- NEVER FAIL THE OLD SIDE'S TAG, NEVER FAIL IN SILENCE (same rule as context._follow_to_the_copy).
  begin
    insert into ops.system_error (kind, organization_id, source_app, source_feature, route, error_type, error_text, context)
    values ('context_follow_enqueue_failure', v_org, 'database', 'context-follow',
            'platform._context_tag_follow_to_the_copy', sqlstate, sqlerrm,
            jsonb_build_object('table', 'platform.associations', 'row_id', v_row.id, 'operation', tg_op,
                               'remedy', 'run the follow for this organization: python -m matrx_records.movers.runner --follow-context --organization <id> --apply --i-know-this-writes'));
  exception when others then
    raise warning 'platform._context_tag_follow_to_the_copy: could not tell the copy about tag % (%), and could not record it: %',
      v_row.id, tg_op, sqlerrm;
  end;
  return null;
end;
$function$

;

CREATE OR REPLACE FUNCTION custom.context_tag_copy(p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  g         record;
  v_twin    platform.associations%rowtype;
  v_other   boolean;
  v_want    boolean;
  v_meta    jsonb;
  v_via_t   text;
  v_via_id  uuid;
  n_made    int := 0;
  n_revived int := 0;
  n_archived int := 0;
  n_updated int := 0;
  n_same    int := 0;
  n_current int := 0;
  n_waiting int := 0;
  n_refused int := 0;
  v_refused jsonb := '[]'::jsonb;
begin
  if p_organization_id is null then
    raise exception 'custom.context_tag_copy: name the organization whose tags to copy'
      using errcode = '22004';
  end if;
  -- WHO IS WRITING, NAMED (the provenance stamp refuses an automated write that does not say).
  if coalesce(current_setting('app.actor_system', true), '') = '' then
    perform set_config('app.actor_system', 'matrx_records.context_follow', true);
  end if;

  -- EVERY SCOPE TAG TYPE HAS ITS STORE TWIN (lane PROOF-DEFECTS, D3). SC-4 P4 registered the
  -- `<kind> -> record` twins once; a `<kind> -> scope` type registered after it (app, 2026-09-25;
  -- processed_document "about", 2026-09-25) had none, the direction guard refused its copy, and the
  -- whole organization's follow stopped. The twin is registered here, the moment a copy needs it:
  -- same label, container side and conveyance. A row already there is never changed.
  insert into platform.association_types (source_type, target_type, label, container_side, conveys_max, is_active, notes)
  select a.source_type, 'record', a.label, a.container_side, a.conveys_max, true,
         'SC-4 P4: the record store''s copy of a context tag (role context_tag), twin of '
         || a.source_type || ' -> scope; same label, container side and conveyance. Written only by the context follow until the switch.'
    from platform.association_types a
   where a.target_type = 'scope' and a.is_active
     and not exists (select 1 from platform.association_types t
                      where t.source_type = a.source_type and t.target_type = 'record')
  on conflict (source_type, target_type) do nothing;

  -- A scope whose copy Record has not landed yet waits for the copy (counted, never guessed).
  select count(distinct a.id) into n_waiting
    from platform.associations a
    join context.scopes s on s.id = a.target_id
   where a.target_type = 'scope' and s.organization_id = p_organization_id
     and not exists (select 1 from custom.record r
                      where r.organization_id = p_organization_id and r.id = a.target_id
                        and r.data_class = 'record');

  -- ONE TAG PER (source, scope): two old edges between the same two ends (a plain tag and a
  -- class assignment) are one copied tag, live while either is, shaped by the live one.
  for g in
    select x.source_type, x.source_id, x.target_id,
           bool_or(x.deleted_at is null) as live,
           (array_agg(x.id order by (x.deleted_at is null) desc, x.created_at, x.id))[1] as pick_id
      from platform.associations x
      join context.scopes s on s.id = x.target_id
     where x.target_type = 'scope'
       and s.organization_id = p_organization_id
       and exists (select 1 from custom.record r
                    where r.organization_id = p_organization_id and r.id = x.target_id
                      and r.data_class = 'record')
     group by x.source_type, x.source_id, x.target_id
  loop
    declare
      o platform.associations%rowtype;
    begin
      select * into o from platform.associations where id = g.pick_id;

      -- THE SAME EDGE UNDER EITHER STORE TOKEN: something other than our copy already ties
      -- these two ends in the store.
      select exists (
        select 1 from platform.associations e
         where e.source_type = g.source_type and e.source_id = g.source_id
           and e.target_type in ('record', 'custom_record') and e.target_id = g.target_id
           and e.deleted_at is null
           and not (e.target_type = 'record' and e.role is not distinct from 'context_tag')
      ) into v_other;

      select * into v_twin
        from platform.associations t
       where t.source_type = g.source_type and t.source_id = g.source_id
         and t.target_type = 'record' and t.target_id = g.target_id and t.role = 'context_tag';

      v_want := g.live and not v_other;
      v_meta := coalesce(o.metadata, '{}'::jsonb)
                || jsonb_build_object('moved_from', jsonb_build_object(
                     'table', 'platform.associations', 'id', o.id, 'target_type', 'scope',
                     'role', o.role, 'lane', 'SC-4'));

      if v_twin.id is null then
        if v_want then
          insert into platform.associations
            (source_type, source_id, target_type, target_id, organization_id, label, metadata,
             created_by, created_at, role, position, updated_by_system)
          values (g.source_type, g.source_id, 'record', g.target_id, o.organization_id, o.label, v_meta,
                  o.created_by, o.created_at, 'context_tag', o.position, 'matrx_records.context_follow');
          n_made := n_made + 1;
        elsif g.live and v_other then
          n_same := n_same + 1;
        end if;
      elsif v_want then
        if v_twin.deleted_at is not null then
          update platform.associations
             set deleted_at = null, deleted_via_type = null, deleted_via_id = null,
                 organization_id = o.organization_id, label = o.label, metadata = v_meta, position = o.position
           where id = v_twin.id;
          n_revived := n_revived + 1;
        elsif v_twin.metadata is distinct from v_meta or v_twin.position is distinct from o.position
              or v_twin.label is distinct from o.label or v_twin.organization_id is distinct from o.organization_id then
          update platform.associations
             set metadata = v_meta, position = o.position, label = o.label, organization_id = o.organization_id
           where id = v_twin.id;
          n_updated := n_updated + 1;
        else
          n_current := n_current + 1;
        end if;
      else
        if v_twin.deleted_at is null then
          -- The old side's reason, mapped: a scope's own cascade becomes the Record's (same id),
          -- so the store's restore of that Record revives this tag with it.
          v_via_t  := case when v_other then 'record'
                           when o.deleted_via_type = 'scope' then 'record'
                           else o.deleted_via_type end;
          v_via_id := case when v_other then g.target_id else o.deleted_via_id end;
          update platform.associations
             set deleted_at = coalesce(o.deleted_at, now()), deleted_via_type = v_via_t, deleted_via_id = v_via_id
           where id = v_twin.id;
          n_archived := n_archived + 1;
        elsif v_other and g.live then
          n_same := n_same + 1;
        end if;
      end if;
    exception
      when check_violation or foreign_key_violation or insufficient_privilege or raise_exception then
        -- ONE TAG THE STORE REFUSES IS NAMED, AND THE REST OF THE ORGANIZATION IS COPIED
        -- (lane PROOF-DEFECTS, D3). The follow files ops.system_error for every refused tag.
        n_refused := n_refused + 1;
        if jsonb_array_length(v_refused) < 20 then
          v_refused := v_refused || jsonb_build_array(jsonb_build_object(
            'pair', g.source_type || ' -> record',
            'old_edge_id', g.pick_id,
            'source_id', g.source_id,
            'scope_id', g.target_id,
            'sqlstate', sqlstate,
            'says', left(split_part(sqlerrm, E'\n', 1), 300)));
        end if;
    end;
  end loop;

  -- A COPIED TAG WHOSE OLD EDGE IS GONE ALTOGETHER (hard-deleted on the old side) is archived.
  with gone as (
    update platform.associations t
       set deleted_at = now(), deleted_via_type = null, deleted_via_id = null
     where t.target_type = 'record' and t.role = 'context_tag' and t.deleted_at is null
       and exists (select 1 from context.scopes s where s.id = t.target_id and s.organization_id = p_organization_id)
       and not exists (select 1 from platform.associations x
                        where x.target_type = 'scope' and x.target_id = t.target_id
                          and x.source_type = t.source_type and x.source_id = t.source_id)
    returning 1)
  select n_archived + count(*) into n_archived from gone;

  return jsonb_build_object(
    'organization_id', p_organization_id,
    'made', n_made, 'revived', n_revived, 'archived', n_archived, 'updated', n_updated,
    'current', n_current, 'same_edge_already_there', n_same, 'waiting_for_the_record', n_waiting,
    'refused', n_refused, 'refused_tags', v_refused);
end;
$function$

;

drop function if exists custom._ctx_bridge(text, text, jsonb, uuid, uuid);
drop function if exists custom._ctx_store_tag(uuid, text, uuid, uuid);
drop function if exists custom._ctx_store_value(uuid, jsonb);
drop function if exists custom._ctx_value_of(jsonb, jsonb);
drop function if exists custom._ctx_store_scope(uuid, uuid, uuid, jsonb);
drop function if exists custom._ctx_store_item(uuid, uuid, uuid, jsonb);
drop function if exists custom._ctx_table_live(uuid, uuid);
drop function if exists custom._ctx_store_type(uuid, uuid, jsonb);
drop function if exists custom._ctx_upsert_doc(uuid, uuid, uuid, text, jsonb, jsonb, timestamptz, uuid);
drop function if exists custom._ctx_rekey(uuid, uuid, text, text);
drop function if exists custom._ctx_table_fields(uuid, uuid);
drop function if exists custom._ctx_word(text, text);
drop function if exists custom._ctx_field_doc(text, text, jsonb, uuid, boolean, integer, text, text, text, integer, jsonb, boolean);
drop function if exists custom._ctx_item_shape(jsonb, boolean);
drop function if exists custom._ctx_words(boolean, jsonb);
drop function if exists custom._ctx_py_json(jsonb);
drop function if exists custom._ctx_iso(timestamptz);
drop function if exists custom._ctx_slug(text, text);
drop function if exists custom._ctx_id(text[]);
drop function if exists custom._ctx_mark(text);
delete from platform.client_callable_door where schema_name = 'custom' and function_name in ('context_writer', '_ctx_marked');
drop function if exists custom._ctx_marked();
drop function if exists custom.context_writer(uuid);
delete from platform.metadata_reserved_keys where table_token = 'record' and key = 'moved_from';
delete from platform.knob_write_door where feature_prefix = 'custom.scopes_written_in_the_store';
delete from platform.knob_override where feature = 'custom' and key = 'scopes_written_in_the_store';
delete from platform.feature_knob where feature = 'custom' and key = 'scopes_written_in_the_store';
