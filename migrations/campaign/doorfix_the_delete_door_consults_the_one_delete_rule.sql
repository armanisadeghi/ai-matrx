-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- DOOR-FIX 1 — T7. THE DELETE DOOR CONSULTS THE SAME RULE THE VERBS DO.
--
-- WHAT WAS WRONG, MEASURED ON THE MAIN DATABASE 2026-09-19
-- --------------------------------------------------------
-- `custom.migrate_delete` knew every rule about deleting — a Field a Rule or a formula reads
-- is refused by name, a Home its Tables still live in is refused by name, a relation set to
-- `restrict` refuses, a relation set to `set_null` is detached, a relation set to `cascade`
-- and everything CONTAINED goes with it — and `custom.record_delete`, the door every client
-- actually calls, knew NONE of them. It ran one UPDATE and set `deleted_at`. Probe: a parent
-- with one contained child, `custom.record_delete(parent)` → parent deleted = t, child
-- deleted = f. The child was orphaned, silently, through the only delete a person can reach.
--
-- THE FIX IS ONE RULE, NOT A SECOND COPY OF IT
-- --------------------------------------------
-- `custom.delete_rule(organization, record, apply)` is now the only place that knows what
-- deleting a record means. The DOOR calls it and then cascades through ITSELF, so a contained
-- record is deleted by the same door, with the same access check, as the record a person
-- named. `custom.migrate_delete` no longer carries a word of the rule: it works out the
-- inverse (through the same rule, asked not to apply anything) and then calls the door.
-- Deleting the rule from one of them is now impossible without deleting it from both.
--
-- THE RELATIONS SURFACE AND ITS OWN SWITCH. `platform.relation_on_delete` is behind
-- `custom/associations_guard`, which resolves false everywhere, and it refuses `authenticated`
-- by name (measured: 42501 "Relations are switched off"). A delete door that inherited that
-- refusal would stop deleting anything at all for ordinary callers; a delete door that
-- swallowed it would ignore `restrict` and `set_null` silently, which is the defect. So the
-- rule asks the relation question AS THE OWNER of `platform.associations` — the role that
-- surface's own door admits — for the length of that one call, and puts the caller's role
-- back immediately. It is the same question, asked by somebody allowed to ask it; nothing
-- else in the delete changes identity, and the access check on every record deleted is still
-- the caller's own (`custom.assert_client_may_change`).
--
-- UNDO. `history.migration_undo`'s restore arm restored ONE record and ignored the rest of
-- the inverse it was handed. It now restores the `also` list a cascading delete recorded, and
-- honours `unalias` — see DOOR-FIX 2 for why an id has to stop resolving when a merge is
-- undone. `custom.record_alias` gains `revoked_at`: an undone merge revokes the alias and
-- leaves it on the record, rather than deleting the evidence that the merge happened.
--
-- INVERSE: migrations/inverse/doorfix_the_delete_door_consults_the_one_delete_rule_down.sql
--
-- based-on: custom.resolve_id(uuid, uuid) 0abc9fdc1a27dbf636b4746f83b4ac8ad54a7140bb4157eb26cc612668fa6ca5
-- based-on: custom.record_delete(uuid, uuid) a50b5755269b92ea1e5ae904c1cf9aa550efb0c28a45a03e8f9754cad5e30e84
-- based-on: custom.migrate_delete(uuid, uuid, text) 64d1d1324025a17c36b03d495581c5e750502215bdc13f6070fb7596d5ca147d
-- based-on: history.migration_undo(uuid, uuid) 509bf0bcab8f909d4704f07195e292e9bdbd920603790d84c45d02a0e9b183f2

set lock_timeout = '3s';
set statement_timeout = '5min';

-- ─────────────────────────────────────────────────────────────────────────────
-- The alias's revocation. Additive: a NULL revoked_at is every alias that exists
-- today and means exactly what it meant before.
-- ─────────────────────────────────────────────────────────────────────────────
alter table custom.record_alias add column if not exists revoked_at timestamptz;

comment on column custom.record_alias.revoked_at is
  'When this alias stopped resolving, because the migration that created it was undone (HIS-8). NULL is a live alias. The row stays: an undone merge is still a thing that happened.';

create or replace function custom.resolve_id(p_organization_id uuid, p_id uuid)
returns uuid
language plpgsql
stable
set search_path to 'pg_catalog'
as $function$
declare
  -- READ-ONLY, and deliberately not behind custom/system_enabled: resolving an id is how a
  -- reader finds the record a merged id now means, and a closed switch must not make an old
  -- link answer with nothing.
  v_id    uuid := p_id;
  v_next  uuid;
  v_seen  uuid[] := array[]::uuid[];
begin
  -- The chain, not one hop: a record merged into a record that was later merged again has to
  -- answer with the one a person can open, or "the id resolves forever" is only true once.
  -- A REVOKED alias is not a hop: undoing a merge puts both records back, and an id that kept
  -- pointing at the survivor would land every relation on the wrong one (T5's last sentence).
  loop
    v_seen := v_seen || v_id;
    select a.new_id into v_next
      from custom.record_alias a
     where a.organization_id = p_organization_id and a.old_id = v_id
       and a.revoked_at is null;
    exit when v_next is null;
    exit when v_next = any (v_seen);        -- a cycle answers with where it started looping
    v_id := v_next;
  end loop;
  return v_id;
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- THE ONE RULE.
-- ─────────────────────────────────────────────────────────────────────────────
create function custom.delete_rule(p_organization_id uuid, p_record_id uuid,
                                              p_apply boolean default true)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  -- The callers of this rule (custom.record_delete, custom.migrate_delete) are behind
  -- custom/system_enabled through custom.assert_store_door; the rule itself only decides.
  v_row      custom.record%rowtype;
  v_names    text;
  v_cascade  uuid[] := '{}';
  v_detached integer := 0;
  v_effects  jsonb;
  v_child    uuid;
  v_role     text;
  v_owner    name;
begin
  select * into v_row from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id and r.deleted_at is null;
  if v_row.id is null then
    return jsonb_build_object('cascade_to', '[]'::jsonb, 'detached', 0,
                              'note', 'nothing here to delete');
  end if;

  -- ── REC-18. A Field a Rule or a formula depends on is refused, NAMING the dependant,
  --    because "this field is in use" tells a person nothing about what to go and change.
  if v_row.data_class = 'field' then
    select string_agg(distinct d.kind || ' "' || d.label || '"', ', ') into v_names
      from custom.field_dependants(p_organization_id, p_record_id) d;
    if v_names is not null then
      raise exception 'This field is used by %, so it was not deleted.', v_names
        using errcode = '23503',
              hint = 'REC-18 / T7: a Rule or a formula that reads a Field it can no longer find is a calculation that silently stops being right. Change or remove what depends on it first, and then this delete goes through.';
    end if;
  end if;

  -- ── REC-13. A Home is a RECORD, and the Tables living there have a say. The default is
  --    restrict, stated here rather than inherited from a nullable column.
  select string_agg(distinct coalesce(t.data ->> 'name', h.table_id::text), ', ') into v_names
    from custom.tables_at_home(p_organization_id, array[p_record_id]) h
    left join custom.record t
      on t.organization_id = p_organization_id and t.id = h.table_id and t.deleted_at is null
   where coalesce(t.data ->> 'on_delete', 'restrict') = 'restrict';
  if v_names is not null then
    raise exception 'This is home to %, so it was not deleted.', v_names
      using errcode = '23503',
            hint = 'REC-13 / T7: deleting a place that tables live in would take those tables and everything in them. The default is to refuse. Move those tables to another home first, or set them to cascade deliberately.';
  end if;

  -- ── REC-12, through W1-REL's own function. It RESTRICTS by name, detaches the set_null
  --    edges itself and RETURNS what must be cascaded; it deletes nothing — the door does.
  --    Asked AS THE OWNER of platform.associations, because that surface's product switch
  --    (custom/associations_guard) refuses `authenticated` outright and a delete that could
  --    not ask would be a delete that ignores on_delete. The role is put back on both paths.
  select c.relowner::regrole::name into v_owner
    from pg_class c where c.oid = 'platform.associations'::regclass;
  v_role := current_setting('role', true);
  begin
    perform set_config('role', v_owner::text, true);
    if p_apply then
      v_effects := platform.relation_on_delete(p_organization_id, p_record_id);
      v_detached := coalesce((v_effects ->> 'detached')::integer, 0);
      select coalesce(array_agg((x #>> '{}')::uuid), '{}') into v_cascade
        from jsonb_array_elements(coalesce(v_effects -> 'cascade_to', '[]'::jsonb)) x;
    else
      select string_agg(distinct coalesce(x.label, x.other_id::text), ', ') into v_names
        from platform.relation_delete_effects(p_organization_id, p_record_id) x
       where x.action = 'restrict';
      if v_names is not null then
        perform set_config('role', coalesce(v_role, 'none'), true);
        raise exception 'this is still used by %, so it was not deleted', v_names
          using errcode = '23503',
                hint = 'REL-2 / T7: this relation is set to refuse the delete while anything still points at it. Remove those first, or change what the field does when the thing it points at is deleted.';
      end if;
      select coalesce(array_agg(x.other_id), '{}') into v_cascade
        from platform.relation_delete_effects(p_organization_id, p_record_id) x
       where x.action = 'cascade' and x.other_type = 'record';
      v_effects := jsonb_build_object('detached', 0, 'cascade_to', to_jsonb(v_cascade));
    end if;
    perform set_config('role', coalesce(v_role, 'none'), true);
  exception
    when undefined_function then
      perform set_config('role', coalesce(v_role, 'none'), true);
      v_effects := jsonb_build_object('note', 'platform.relation_on_delete is not on this database');
    when others then
      perform set_config('role', coalesce(v_role, 'none'), true);
      raise;
  end;

  -- ── REC-12 for CONTAINMENT: the 500 serial numbers inside Widget. A contained record has no
  --    independent existence, so it goes with its container. This is not a relation's
  --    `on_delete` — it is what containment MEANS, and it is the cascade T7 names first.
  for v_child in
    select e.child_id from custom.containment_edges(p_organization_id) e
     where e.parent_id = p_record_id and e.via = 'contained'
  loop
    v_cascade := v_cascade || v_child;
  end loop;

  return jsonb_build_object('cascade_to', to_jsonb(v_cascade),
                            'detached', v_detached,
                            'relation_effects', coalesce(v_effects, '{}'::jsonb));
end;
$function$;

-- WHO MAY CALL IT, IN DATA. It is SECURITY DEFINER because custom.migrate_delete is not, and
-- the relation half has to be asked as the owner of platform.associations. No client reaches
-- it: a person deletes through custom.record_delete, which decides that person's access to
-- that row first and only then asks this rule what deleting it means.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('custom', 'delete_rule', 'p_organization_id uuid, p_record_id uuid, p_apply boolean',
   array['uuid'::regtype, 'uuid'::regtype, 'boolean'::regtype]::oid[],
   'p_organization_id is the organization whose store is being changed and is never NULL; p_record_id is read only as (p_organization_id, p_record_id), so a record of another organization is simply not found; p_apply decides whether the set_null detaches happen. It makes no access decision of its own and must not: custom.record_delete decides the caller against the row with custom.assert_client_may_change BEFORE it asks this, and asks it again for every record the cascade takes.',
   'migrations/campaign/doorfix_the_delete_door_consults_the_one_delete_rule.sql',
   'server_only: the delete rule behind custom.record_delete and custom.migrate_delete. No client calls it — it decides nothing about the caller, so reaching it directly would be a delete with no access question asked.',
   false, false)
on conflict (schema_name, function_name, identity_argtypes) do nothing;

comment on function custom.delete_rule(uuid, uuid, boolean) is
  'T7 / REC-12 / REC-13 / REC-18: THE rule about deleting a record — the refusals (a Field something reads, a Home its Tables still live in, a relation set to refuse), the set_null detaches, and the list the delete has to take with it (relation cascade + containment). custom.record_delete applies it; custom.migrate_delete asks it with apply=false to work out the inverse. There is no second copy.';

-- The whole cascade, ahead of time, so a delete can record an inverse that puts every record
-- back. It walks the SAME rule, so the list cannot disagree with what the door will do.
create function custom.delete_cascade_closure(p_organization_id uuid, p_record_id uuid)
returns uuid[]
language plpgsql
set search_path to 'pg_catalog'
as $function$
declare
  -- Its one caller, custom.migrate_delete, is behind custom/system_enabled.
  v_out   uuid[] := '{}';
  v_queue uuid[] := array[p_record_id];
  v_id    uuid;
  v_next  uuid;
  v_guard integer := 0;
begin
  while array_length(v_queue, 1) > 0 loop
    v_guard := v_guard + 1;
    if v_guard > 10000 then
      raise exception 'this delete reaches more than 10000 records, which is more than one transaction should take with it'
        using errcode = '53400',
              hint = 'REC-12: delete the contained records in batches first, and then the container.';
    end if;
    v_id := v_queue[1];
    v_queue := v_queue[2:];
    for v_next in
      select (x #>> '{}')::uuid
        from jsonb_array_elements(custom.delete_rule(p_organization_id, v_id, false) -> 'cascade_to') x
    loop
      if not (v_next = any (v_out)) and v_next <> p_record_id then
        v_out   := v_out || v_next;
        v_queue := v_queue || v_next;
      end if;
    end loop;
  end loop;
  return v_out;
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- THE DOOR. Same signature, same grants, same return — it now asks the rule.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function custom.record_delete(p_organization_id uuid, p_record_id uuid)
returns timestamp with time zone
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_at    timestamptz;
  v_plan  jsonb;
  v_child uuid;
begin
  -- THE SWITCH. Every line below is behind custom/system_enabled: custom.assert_store_door
  -- resolves that knob and, while it is false, this store takes writes only from the role that
  -- owns custom.record. The switch never removes a check; it closes the door.
  perform custom.assert_store_door(p_organization_id, 'custom.record_delete');
  perform custom.assert_client_may_change(p_organization_id, p_record_id, 'custom.record_delete');

  if p_organization_id is null or p_record_id is null then
    raise exception 'custom.record_delete: organization_id and the record id are both required - the store is keyed (organization_id, id)'
      using errcode = '22004';
  end if;

  -- THE RULE, BEFORE ANYTHING IS WRITTEN. It raises the refusals by name (a Field a formula
  -- reads, a Home its Tables live in, a relation set to refuse), detaches the set_null edges,
  -- and hands back everything this delete has to take with it.
  v_plan := custom.delete_rule(p_organization_id, p_record_id, true);

  update custom.record
     set deleted_at = now()
   where organization_id = p_organization_id and id = p_record_id and deleted_at is null
  returning deleted_at into v_at;

  if v_at is null then
    if exists (select 1 from custom.record r
                where r.organization_id = p_organization_id and r.id = p_record_id) then
      raise exception 'That record was already deleted, so nothing changed.'
        using errcode = '02000',
              hint = 'REC-23: it is still here and still reversible - custom.record_restore(organization, record) brings it back.';
    end if;
    raise exception 'There is no record % in this organization.', p_record_id
      using errcode = '02000',
            hint = 'Nothing was deleted. The store is keyed (organization_id, id), so a record of another organization is not found by this one.';
  end if;

  -- THE CASCADE GOES THROUGH THIS SAME DOOR — so every record it takes is judged by the
  -- caller's own access, gets its own history capture, and applies its own rule in turn. The
  -- container is marked deleted first, which is also what stops a containment loop here.
  for v_child in select (x #>> '{}')::uuid from jsonb_array_elements(coalesce(v_plan -> 'cascade_to', '[]'::jsonb)) x loop
    if exists (select 1 from custom.record r
                where r.organization_id = p_organization_id and r.id = v_child and r.deleted_at is null) then
      perform custom.record_delete(p_organization_id, v_child);
    end if;
  end loop;

  return v_at;
end
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- THE VERB. It records the inverse and then uses the door like everybody else.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function custom.migrate_delete(p_organization_id uuid, p_record_id uuid, p_note text default null)
returns jsonb
language plpgsql
set search_path to 'pg_catalog'
as $function$
declare
  v_row     custom.record%rowtype;
  v_cascade uuid[];
  v_log     uuid;
  v_took    uuid[] := '{}';
  v_child   uuid;
begin
  -- THE SWITCH. Every line below is behind custom/system_enabled: custom.assert_store_door
  -- resolves that knob and, while it is false, this store takes writes only from the role that
  -- owns custom.record. The switch never removes a check; it closes the door.
  perform custom.assert_store_door(p_organization_id, 'custom.migrate_delete');

  select * into v_row from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id and r.deleted_at is null;
  if v_row.id is null then
    raise exception 'There is no record % here to delete.', p_record_id
      using errcode = '02000',
            hint = 'REC-23: a record already deleted is still here and still reversible — custom.record_restore(organization, record) brings it back until its Table''s retention runs out.';
  end if;

  -- THE SAME RULE THE DOOR WILL APPLY, asked not to change anything, so the inverse names
  -- exactly the records the door is about to take. It raises the refusals here too, before
  -- a Migration row exists for a delete that is not going to happen.
  v_cascade := custom.delete_cascade_closure(p_organization_id, p_record_id);

  v_log := history.migration_record(p_organization_id, 'delete', v_row.data_class, p_record_id,
             jsonb_build_object('kind', 'restore', 'record_id', p_record_id::text,
                                'also', to_jsonb(v_cascade)),
             coalesce(p_note, format('deleted with %s record(s) it contained or owned', coalesce(array_length(v_cascade, 1), 0))));

  perform custom.record_delete(p_organization_id, p_record_id);

  foreach v_child in array v_cascade loop
    if exists (select 1 from custom.record r
                where r.organization_id = p_organization_id and r.id = v_child and r.deleted_at is not null) then
      v_took := v_took || v_child;
    end if;
  end loop;

  return jsonb_build_object('verb', 'delete', 'record_id', p_record_id,
                            'migration_id', v_log, 'took_with_it', to_jsonb(v_took),
                            'cascaded', coalesce(array_length(v_took, 1), 0),
                            'reversible_until', 'the end of this table''s retention (REC-23)',
                            'at', now());
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- UNDO. It restores what the delete took, and stops an undone merge's id resolving.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function history.migration_undo(p_organization_id uuid, p_log_id uuid)
returns jsonb
language plpgsql
set search_path to 'pg_catalog'
as $function$
declare
  m        history.migration_log%rowtype;
  v_kind   text;
  v_target uuid;
  v_patch  jsonb;
  v_ver    integer;
  v_also   uuid;
  v_back   integer := 0;
  v_unalias uuid;
  v_revoked integer := 0;
begin
  -- THE SWITCH, READ HERE. This function lives in `history`, not in `custom`, so it is not
  -- covered by the schema's own closed-door posture and says out loud which knob holds it off:
  -- while custom/system_enabled resolves false for this organization the record store takes
  -- writes only from the role that owns custom.record, and an undo is a write.
  if not coalesce((platform.knob_resolve('custom', 'system_enabled', p_organization_id) #>> '{}')::boolean, false) then
    perform custom.assert_store_door(p_organization_id, 'history.migration_log');
  end if;

  select * into m from history.migration_log l
   where l.organization_id = p_organization_id and l.id = p_log_id;
  if m.id is null then
    raise exception 'There is no Migration % on the record for this organization.', p_log_id
      using errcode = '02000';
  end if;
  if m.undone_at is not null then
    raise exception 'That Migration was already undone, on %.', m.undone_at
      using errcode = '22023',
            hint = 'HIS-8: undoing it twice would apply the same inverse to values that are already back. Nothing was changed. The undo itself is on the record too, so you can see what it did.';
  end if;

  v_kind   := m.inverse ->> 'kind';
  v_target := coalesce(nullif(m.inverse ->> 'record_id', '')::uuid, m.target_id);

  if v_kind = 'none' then
    raise exception 'The Migration "%" cannot be undone, and said so when it ran.', m.verb
      using errcode = '0A000',
            hint = format('HIS-8: it was recorded as one-way deliberately. What it did is still fully on the record — %s — so the state before it is readable even though it cannot be put back automatically.', coalesce(m.note, 'see the Migration log entry'));
  end if;

  -- THE SAME WRITE PATH, and that is the law rather than a convenience.
  if v_kind = 'restore' then
    perform custom.record_restore(p_organization_id, v_target);
    -- EVERYTHING THE DELETE TOOK WITH IT. A delete that cascaded and an undo that put one
    -- record back is not an undo; it is a smaller version of the same data loss.
    for v_also in select (x #>> '{}')::uuid
                    from jsonb_array_elements(coalesce(m.inverse -> 'also', '[]'::jsonb)) x loop
      if exists (select 1 from custom.record r
                  where r.organization_id = p_organization_id and r.id = v_also
                    and r.deleted_at is not null) then
        perform custom.record_restore(p_organization_id, v_also);
        v_back := v_back + 1;
      end if;
    end loop;
  else
    v_patch := m.inverse -> 'patch';
    if v_patch is null or jsonb_typeof(v_patch) <> 'object' then
      raise exception 'The undo stored for "%" says it is a patch and carries none.', m.verb
        using errcode = '22023', hint = 'HIS-8: nothing was changed.';
    end if;
    v_ver := custom.record_update(p_organization_id, v_target, v_patch);
  end if;

  -- THE ID HAS TO STOP RESOLVING (T5). A merge sends the loser's id to the winner forever;
  -- undoing the merge puts the loser back, and an id still pointing at the winner lands every
  -- relation to the restored record on the WRONG record. The alias is revoked rather than
  -- deleted: the merge happened, and the record of it stays.
  v_unalias := nullif(m.inverse ->> 'unalias', '')::uuid;
  if v_unalias is not null then
    update custom.record_alias a
       set revoked_at = now()
     where a.organization_id = p_organization_id and a.old_id = v_unalias
       and a.revoked_at is null;
    get diagnostics v_revoked = row_count;
    if v_revoked = 0 then
      raise exception 'The undo of "%" says the id % must stop resolving, and there is no live alias for it. Nothing here is half done — the restore above is in this same transaction and goes back with this refusal.', m.verb, v_unalias
        using errcode = '02000',
              hint = 'HIS-8 / T5: an undo that could not put the id back would leave every relation to the restored record pointing at the record it was merged into.';
    end if;
  end if;

  update history.migration_log l
     set undone_at = now(),
         undone_by = coalesce(nullif(current_setting('app.user_id', true), '')::uuid, (select auth.uid()))
   where l.organization_id = p_organization_id and l.id = p_log_id;

  return jsonb_build_object('undone', p_log_id, 'verb', m.verb, 'kind', v_kind,
                            'record_id', v_target, 'version_after', v_ver,
                            'also_restored', v_back, 'ids_unaliased', v_revoked, 'at', now());
end;
$function$;
