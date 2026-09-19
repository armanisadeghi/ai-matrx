-- chair-step: it is STORE-REL 1's backfill, run again inside a DO block the additive allow-list
--   cannot read. It only ever ADDS an association for a relation value a record already holds.
-- guard: custom/system_enabled
--
-- STORE-REL 1b — THE BACKFILL NAMES ITSELF.
--
-- STORE-REL 1's backfill wrote NOTHING: all seven relation values were refused by
-- `platform._stamp_actor_tier` with *"This write declares actor_tier=code, but names no
-- actor_system… 'an AI did it' with no name is not provenance."* The rule is right and the
-- backfill was wrong: `custom._relation_associations` names itself (`custom.relations`) exactly
-- for this reason and the DO block did not. Nothing was swallowed — the refusal was printed for
-- every one of the seven, which is why this file exists at all.
--
-- The backfill is otherwise unchanged, and it is idempotent: an edge that already names its
-- field is counted and skipped.

set lock_timeout = '3s';
set statement_timeout = '10min';

do $backfill$
declare
  r          record;
  v_written  integer := 0;
  v_existing integer := 0;
  v_failed   integer := 0;
  v_notes    text[]  := '{}';
begin
  -- THE NAME, which is the whole of this file. An automated write says WHICH system it is.
  perform set_config('app.actor_system', 'custom.relations', true);

  for r in
    select rec.organization_id, rec.id, e.target_id, e.edge_role, e.field_id, e.ord
      from custom.record rec
      cross join lateral custom.record_relation_edges(rec.organization_id, rec.id, rec.table_id,
                                                      rec.data_class, rec.data, rec.deleted_at) e
     where rec.deleted_at is null
     order by rec.organization_id, rec.id, e.edge_role, e.ord nulls last, e.target_id
  loop
    begin
      if exists (select 1 from platform.associations a
                  where a.source_type = 'record' and a.source_id = r.id
                    and a.target_type = 'record' and a.target_id = r.target_id
                    and a.role = r.edge_role and a.deleted_at is null
                    and a.relation_field_id is not null) then
        v_existing := v_existing + 1;
        continue;
      end if;
      insert into platform.associations
        (source_type, source_id, target_type, target_id, role, organization_id,
         relation_field_id, "position")
      values ('record', r.id, 'record', r.target_id, r.edge_role, r.organization_id,
              r.field_id, r.ord)
      on conflict (source_type, source_id, target_type, target_id, role) do update
         set relation_field_id = excluded.relation_field_id,
             "position"        = excluded."position",
             deleted_at        = null;
      v_written := v_written + 1;
    exception when others then
      v_failed := v_failed + 1;
      v_notes  := v_notes || format('record %s, field "%s" -> %s: %s',
                                    r.id, r.edge_role, r.target_id, sqlerrm);
    end;
  end loop;

  perform set_config('app.actor_system', '', true);

  raise notice 'STORE-REL backfill: % relation edge(s) written, % already named their field, % could not be resolved.',
    v_written, v_existing, v_failed;
  if v_failed > 0 then
    raise notice 'STORE-REL backfill, what it could NOT resolve: %', array_to_string(v_notes, ' | ');
  end if;
end;
$backfill$;

do $assert$
declare v_missing integer;
begin
  select count(*) into v_missing
    from custom.record rec
    cross join lateral custom.record_relation_edges(rec.organization_id, rec.id, rec.table_id,
                                                    rec.data_class, rec.data, rec.deleted_at) e
   where rec.deleted_at is null
     and not exists (select 1 from platform.associations a
                      where a.source_type = 'record' and a.source_id = rec.id
                        and a.target_type = 'record' and a.target_id = e.target_id
                        and a.role = e.edge_role and a.deleted_at is null
                        and a.relation_field_id is not null);
  raise notice 'STORE-REL: % live relation value(s) still without an edge that names its field.', v_missing;
end;
$assert$;
