-- chair-step: the inverse of `migrations/campaign/storetxn3_a_link_writes_both_halves.sql`, for
--   rule 27 (up -> inverse -> up) ON THE CLONE. It REPLACES the bodies of
--   `platform.relation_set` and `platform.relation_unset`, which is outside the additive
--   allow-list, and it REVOKES the EXECUTE grant the forward file added. It is never run on the
--   main database: undoing the forward file there would put the store back to a state in which
--   `custom.record_write_graph` cannot write a graph at all.
-- lock: custom,platform
--
-- It puts both bodies back BYTE FOR BYTE as they stood on the main database at 16:1x UTC on
-- 2026-09-22 (the bytes the forward file's `-- based-on:` lines pin). A `drop function` would NOT
-- be the inverse: the forward file is a REPLACE and declares the bodies it is based on, so leg 3
-- of rule 27 has to find those exact bodies live.
--
-- based-on: platform.relation_set(uuid, uuid, text, jsonb) ca4fa60c7771d888710804596b87220d7e80f1e0a9b8b04d296c4fe911d36fc1
-- based-on: platform.relation_unset(uuid, uuid, text, uuid) 00210bfe293aac2da17e9abf4fcd0582b15610fbae7b82123c222b3296ff96d1

set lock_timeout = '5s';
set statement_timeout = '300s';

CREATE OR REPLACE FUNCTION platform.relation_set(p_organization_id uuid, p_record_id uuid, p_field_key text, p_targets jsonb)
returns integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  d        jsonb;
  v_field  uuid;
  t        jsonb;
  i        integer := 0;
  v_type   text;
  v_id     uuid;
  v_written integer := 0;
  v_tbl    uuid;
begin
  perform platform.assert_relations_door(p_organization_id);
  -- BOTH ENDS, BEFORE THE FIRST WRITE. Linking is a change to the SOURCE record, so it asks
  -- editor there; and the TARGET is a record in another table whose title this link then
  -- shows on the source's screen, so it asks viewer there. A link you could make to a record
  -- you may not see would be a way to read one row at a time by guessing ids.
  perform custom.assert_client_may_change(p_organization_id, p_record_id, 'platform.relation_set',
                                          'editor'::public.permission_level, 'record');
  v_field := platform.relation_field(p_organization_id, p_record_id, p_field_key);
  d := platform.relation_declaration(p_organization_id, v_field);

  if jsonb_typeof(p_targets) <> 'array' then
    raise exception 'the targets of a relation are a list, and this is %', jsonb_typeof(p_targets)
      using errcode = '22023',
            hint = 'REL-7: a relation points at at most one thing, or at many - both are written as a list, so the shape never has to change when the cardinality does. One target is a list of one.';
  end if;

  for t in select * from jsonb_array_elements(p_targets) loop
    i := i + 1;
    if jsonb_typeof(t) = 'string' then
      v_type := 'record'; v_id := (t #>> '{}')::uuid;
    else
      v_type := coalesce(nullif(t ->> 'entity', ''), 'record');
      v_id   := nullif(t ->> 'row_id', '')::uuid;
    end if;
    if v_id is null then
      raise exception 'target % of this relation names no row', i using errcode = '22004';
    end if;

    if v_type = 'record' then
      perform custom.assert_client_may_open(p_organization_id, v_id, 'platform.relation_set',
                                            'viewer'::public.permission_level, 'record');
      select r.table_id into v_tbl
        from custom.record r
       where r.organization_id = p_organization_id and r.id = v_id and r.deleted_at is null;
      if v_tbl is not null then
        perform custom.assert_may_know_table(p_organization_id, v_tbl, 'platform.relation_set');
      end if;
    end if;

    insert into platform.associations
      (source_type, source_id, target_type, target_id, organization_id, role, position,
       relation_field_id, origin, payload_kind, payload, created_by)
    values
      ('record', p_record_id, v_type, v_id, p_organization_id, p_field_key,
       case when (d ->> 'ordered')::boolean then i else null end,
       v_field, 'campaign',
       case when d ->> 'binding' = 'snapshot' then 'relation_snapshot' else null end,
       case when d ->> 'binding' = 'snapshot'
            then platform.relation_snapshot_of(p_organization_id, v_type, v_id) else null end,
       (select auth.uid()))
    on conflict (source_type, source_id, target_type, target_id, role) do update
      set position          = excluded.position,
          relation_field_id = excluded.relation_field_id,
          origin            = excluded.origin,
          payload_kind      = excluded.payload_kind,
          payload           = excluded.payload,
          deleted_at        = null;
    v_written := v_written + 1;
  end loop;
  return v_written;
end;
$function$

;

comment on function platform.relation_set(uuid, uuid, text, jsonb) is
  'Held by the knob custom/system_enabled, resolved for the organization through platform.assert_relations_door. While it is off this answers only the role that owns platform.associations.';

CREATE OR REPLACE FUNCTION platform.relation_unset(p_organization_id uuid, p_record_id uuid, p_field_key text, p_target_id uuid)
returns integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare v_n integer;
begin
  perform platform.assert_relations_door(p_organization_id);
  -- Unlinking changes the SOURCE record, so it is the same question as linking, at the same
  -- threshold. The target is not asked: removing a pointer tells you nothing about what it
  -- pointed at.
  perform custom.assert_client_may_change(p_organization_id, p_record_id, 'platform.relation_unset',
                                          'editor'::public.permission_level, 'record');
  -- A relation is UNMADE the way every edge in this platform is: soft, so the reverse end and
  -- the history both keep their record of it (REL-13).
  update platform.associations a
     set deleted_at = now()
   where a.organization_id = p_organization_id
     and a.source_type = 'record' and a.source_id = p_record_id
     and a.role = p_field_key and a.target_id = p_target_id
     and a.deleted_at is null;
  get diagnostics v_n = row_count;
  return v_n;
end;
$function$

;

comment on function platform.relation_unset(uuid, uuid, text, uuid) is null;

-- The one grant the forward file added, taken back. On the clone only, as the header says.
revoke execute on function custom.migrate_purge_hard(uuid, uuid, text, integer, boolean)
  from authenticated;
