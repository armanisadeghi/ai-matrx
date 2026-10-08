-- describe_install_c_archiving_a_table_archives_what_is_built_on_it.sql — lane DESCRIBE-INSTALL (2026-10-08).
--
-- THE CLASS. custom.table_archive archives a table's forms, inbound addresses, saved views and portals in
-- the same event (T2.1), but custom.record_delete called straight at a Table (a page's Remove, an undo, a
-- script) left them live: 13 forms on live pointed at an archived table, 5 published and still taking
-- answers into it. The rule belongs to the Table's archive, not to one door: custom.record_delete now calls
-- custom._table_takes_what_is_built_on_it right after a Table's contents and before the Table itself. It
-- takes only what is still live, stamps it with the same moment as the Table, and names it in the archive
-- event's built_on (exactly as table_archive does) so a restore brings back this set and nothing older.
-- No trigger on custom.record (that takes SHARE ROW EXCLUSIVE across the store).
-- based-on: custom.record_delete(uuid, uuid) b0167d72cdf0dd548ae5e5c5b87cae3f085d105bdbee728a7be8ce35567e18f8

create or replace function custom._table_takes_what_is_built_on_it(p_organization_id uuid, p_table_id uuid, p_event uuid)
 returns integer
 language plpgsql
 set search_path to 'pg_catalog'
as $function$
declare
  v_now timestamptz := now();
  v_on  jsonb := '[]'::jsonb;
  v_n   integer := 0;
  v_k   integer;
begin
  with g as (
    update custom.anon_form f set deleted_at = v_now
     where f.organization_id = p_organization_id and f.table_id = p_table_id and f.deleted_at is null
    returning f.id)
  select v_on || coalesce(jsonb_agg(jsonb_build_object('kind', 'anon_form', 'id', g.id, 'at', v_now)), '[]'::jsonb), count(*)
    into v_on, v_k from g;
  v_n := v_n + v_k;
  with g as (
    update custom.anon_inbound i set deleted_at = v_now
     where i.organization_id = p_organization_id and i.table_id = p_table_id and i.deleted_at is null
    returning i.id)
  select v_on || coalesce(jsonb_agg(jsonb_build_object('kind', 'anon_inbound', 'id', g.id, 'at', v_now)), '[]'::jsonb), count(*)
    into v_on, v_k from g;
  v_n := v_n + v_k;
  with g as (
    update platform.saved_view v set deleted_at = v_now
     where v.organization_id = p_organization_id and v.subject_id = p_table_id and v.deleted_at is null
    returning v.id)
  select v_on || coalesce(jsonb_agg(jsonb_build_object('kind', 'saved_view', 'id', g.id, 'at', v_now)), '[]'::jsonb), count(*)
    into v_on, v_k from g;
  v_n := v_n + v_k;
  with g as (
    update custom.portal p
       set archived_at = v_now, archived_by = custom.query_principal(), archive_reason = 'Its table was archived.'
     where p.organization_id = p_organization_id and p.client_table_id = p_table_id and p.archived_at is null
    returning p.id)
  select v_on || coalesce(jsonb_agg(jsonb_build_object('kind', 'portal', 'id', g.id, 'at', v_now)), '[]'::jsonb), count(*)
    into v_on, v_k from g;
  v_n := v_n + v_k;
  if v_n > 0 and p_event is not null then
    update history.migration_log m
       set inverse = m.inverse || jsonb_build_object('built_on', coalesce(m.inverse -> 'built_on', '[]'::jsonb) || v_on)
     where m.organization_id = p_organization_id and m.id = p_event;
  end if;
  return v_n;
end;
$function$;
-- An internal step of custom.record_delete (which runs as its owner); not a client door.

CREATE OR REPLACE FUNCTION custom.record_delete(p_organization_id uuid, p_record_id uuid)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_at    timestamptz;
  v_plan  jsonb;
  v_child uuid;
  v_first boolean;
  v_depth integer;
  v_prev  text;
  -- STORE-TAILS-3: THE ARCHIVE EVENT this call belongs to, and what it took.
  v_event     uuid;
  v_own_event boolean := false;
  v_took      uuid[];
  v_class     text;
  v_table     uuid;
begin
  -- THE SWITCH. Every line below is behind custom/system_enabled: custom.assert_store_door
  -- resolves that knob and, while it is false, this store takes writes only from the role that
  -- owns custom.record. The switch never removes a check; it closes the door.
  perform custom.assert_store_door(p_organization_id, 'custom.record_delete');
  perform custom.assert_client_may_change(p_organization_id, p_record_id, 'custom.record_delete');
  -- VISION-REACH W4 (a): the organization's "Agent changes" setting, enforced here (custom._agent_change_gate).
  perform custom._agent_change_gate(p_organization_id, null, 'custom.record_delete', p_record_id);

  if p_organization_id is null or p_record_id is null then
    raise exception 'custom.record_delete: organization_id and the record id are both required - the store is keyed (organization_id, id)'
      using errcode = '22004';
  end if;

  -- HOW DEEP THIS HAS GONE. A cascade that nests past 64 is a cycle somebody built, and
  -- saying so beats recursing until the server runs out of stack.
  v_depth := coalesce(nullif(current_setting('custom.delete_depth', true), '')::integer, 0);
  if v_depth > 64 then
    raise exception 'this delete reaches through more than 64 levels of containment, which is a loop rather than a hierarchy'
      using errcode = '54001',
            hint = 'REC-12: something contains one of its own containers. Break that link and delete again.';
  end if;

  -- STORE-TAILS-3: THE TOP OF ONE ARCHIVE. Everything this call and its cascade take is written
  -- down, in order, so the restore can bring back exactly this set. A Table's archive opens its
  -- event HERE, before the first row moves, so every History version this statement writes
  -- carries the event's id; `custom.table_archive` opens one for all of its chunks and says so
  -- in `custom.archive_event`.
  if v_depth = 0 then
    perform set_config('custom.archive_took', '', true);
    v_event := nullif(current_setting('custom.archive_event', true), '')::uuid;
    select r.data_class into v_class
      from custom.record r
     where r.organization_id = p_organization_id and r.id = p_record_id and r.deleted_at is null;
    if v_event is null
       and exists (select 1 from custom.record r
                    where r.organization_id = p_organization_id and r.id = p_record_id
                      and r.table_id = custom.table_kernel_id() and r.data_class <> 'kernel'
                      and r.deleted_at is null) then
      v_event := history.migration_record(p_organization_id, 'archive', 'table', p_record_id,
                   jsonb_build_object('kind', 'restore', 'record_id', p_record_id::text,
                                      'also', '[]'::jsonb, 'took', '[]'::jsonb, 'open', true),
                   'STORE-TAILS-3: a table archived as one unit — its fields, saved views, rules and records with it; restoring the table brings back exactly this set.');
      v_own_event := true;
    end if;
  end if;
  -- A SYNCED TABLE'S ROWS HAVE ONE WRITER (lane VISION-REACH wave 3, REC-N-11 read-only first;
  -- verifier 2026-10-03: "read-only includes delete"). A row of a Table carrying sync_source is
  -- archived by custom.table_sync alone (it marks its writes in app.table_sync_writing) when the
  -- outside table no longer has it. A person — grid, REST, MCP, an approval — is refused in one
  -- sentence, the same rule the edit door speaks. Exempt: the sync itself; a whole-table archive
  -- (custom.table_archive opens custom.archive_event first); a cascade from a container (depth > 0),
  -- which is never a person's single-row delete.
  if v_depth = 0 and coalesce(current_setting('custom.archive_event', true), '') = '' then
    select r.table_id into v_table from custom.record r
     where r.organization_id = p_organization_id and r.id = p_record_id
       and r.data_class = 'record' and r.deleted_at is null;
    if v_table is not null
       and coalesce(current_setting('app.table_sync_writing', true), '') <> v_table::text
       and exists (select 1 from custom.record t
                    where t.organization_id = p_organization_id and t.id = v_table
                      and t.table_id = custom.table_kernel_id() and t.data ? 'sync_source') then
      raise exception 'This table''s rows are synced from outside AI Matrx, so a row can''t be deleted here.'
        using errcode = '42501',
              hint = 'Delete it where it lives, then press Refresh on the table. Nothing was changed.';
    end if;
  end if;
  perform set_config('custom.delete_depth', (v_depth + 1)::text, true);

  -- THE RULE, BEFORE ANYTHING IS WRITTEN. It raises the refusals by name (a Field a formula
  -- reads, a Home its Tables live in, a Table whose fields something outside still reads, a
  -- relation set to refuse), detaches the set_null edges, and hands back everything this
  -- delete has to take with it.
  v_plan  := custom.delete_rule(p_organization_id, p_record_id, true);
  v_first := coalesce((v_plan ->> 'contents_first')::boolean, false);

  -- A TABLE FIRST TAKES WHAT IS IN IT. Its records, its saved views, its Rules and then its
  -- Fields all go while the Table is still there, so every guard on custom.record still has
  -- the Table and the Fields it validates against in front of it. Nothing is switched off.
  if v_first then
    -- THE WHOLE SET, SAID OUT LOUD BEFORE THE FIRST ROW GOES. REC-18 refuses a Field something
    -- still reads; inside this table, what reads it is going too, so it is not something that
    -- still reads it. Transaction-local, and put back exactly as it was afterwards.
    v_prev := coalesce(current_setting('custom.delete_set', true), '');
    perform set_config('custom.delete_set',
      v_prev || ',' || p_record_id::text || ',' ||
      coalesce((select string_agg(x #>> '{}', ',')
                  from jsonb_array_elements(coalesce(v_plan -> 'cascade_to', '[]'::jsonb)) x), ''),
      true);
    for v_child in select (x #>> '{}')::uuid from jsonb_array_elements(coalesce(v_plan -> 'cascade_to', '[]'::jsonb)) x loop
      if v_child <> p_record_id
         and exists (select 1 from custom.record r
                      where r.organization_id = p_organization_id and r.id = v_child and r.deleted_at is null) then
        perform custom.record_delete(p_organization_id, v_child);
      end if;
    end loop;
    perform set_config('custom.delete_set', v_prev, true);
    -- DESCRIBE-INSTALL c (2026-10-08): A TABLE'S ARCHIVE TAKES WHAT IS BUILT ON IT, whichever door archives it
    -- (custom.table_archive already did, at its last step; every other path left the forms live).
    perform custom._table_takes_what_is_built_on_it(p_organization_id, p_record_id,
              coalesce(v_event, nullif(current_setting('custom.archive_event', true), '')::uuid));
  end if;

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
    raise exception 'There is no such record in this organization.' using errcode = '02000',
            hint = 'Nothing was deleted. The store is keyed (organization_id, id), so a record of another organization is not found by this one.',
            detail = jsonb_build_object('record_id', p_record_id)::text;
  end if;

  -- STORE-TAILS-3: this row is part of what this archive took, in the order it went.
  perform set_config('custom.archive_took',
                     coalesce(current_setting('custom.archive_took', true), '') || p_record_id::text || ',',
                     true);

  -- THE CASCADE GOES THROUGH THIS SAME DOOR — so every record it takes is judged by the
  -- caller's own access, gets its own history capture, and applies its own rule in turn. The
  -- container is marked deleted first, which is also what stops a containment loop here.
  if not v_first then
    for v_child in select (x #>> '{}')::uuid from jsonb_array_elements(coalesce(v_plan -> 'cascade_to', '[]'::jsonb)) x loop
      if exists (select 1 from custom.record r
                  where r.organization_id = p_organization_id and r.id = v_child and r.deleted_at is null) then
        perform custom.record_delete(p_organization_id, v_child);
      end if;
    end loop;
  end if;

  perform set_config('custom.delete_depth', v_depth::text, true);

  -- STORE-TAILS-3: THE BOTTOM OF ONE ARCHIVE. Write down what it took. A single row that took
  -- nothing with it needs no event (bringing it back was always exact); anything more — a table,
  -- a record that took what it contained, a row archived inside a table's chunked archive —
  -- is written to its event, each row with the exact moment it was archived.
  if v_depth = 0 then
    v_took := coalesce(string_to_array(rtrim(coalesce(current_setting('custom.archive_took', true), ''), ','), ',')::uuid[],
                       '{}'::uuid[]);
    perform set_config('custom.archive_took', '', true);
    if v_event is null and cardinality(v_took) > 1 then
      v_event := history.migration_record(p_organization_id, 'archive', coalesce(v_class, 'record'), p_record_id,
                   jsonb_build_object('kind', 'restore', 'record_id', p_record_id::text,
                                      'also', '[]'::jsonb, 'took', '[]'::jsonb, 'open', true),
                   format('STORE-TAILS-3: archived with %s row(s) it contained or cascaded to; restoring it brings back exactly this set.',
                          cardinality(v_took) - 1));
      v_own_event := true;
    end if;
    if v_event is not null and cardinality(v_took) > 0 then
      update history.migration_log m
         set inverse = m.inverse || jsonb_build_object(
               'also', coalesce(m.inverse -> 'also', '[]'::jsonb)
                       || coalesce((select jsonb_agg(t.x::text order by t.o)
                                      from unnest(v_took) with ordinality as t(x, o)
                                     where t.x::text is distinct from m.inverse ->> 'record_id'), '[]'::jsonb),
               'took', coalesce(m.inverse -> 'took', '[]'::jsonb)
                       || (select jsonb_agg(jsonb_build_array(t.x::text, v_at) order by t.o)
                             from unnest(v_took) with ordinality as t(x, o)),
               'open', case when v_own_event then 'false'::jsonb else coalesce(m.inverse -> 'open', 'true'::jsonb) end,
               'archived_at', case when v_own_event then to_jsonb(v_at) else m.inverse -> 'archived_at' end)
       where m.organization_id = p_organization_id and m.id = v_event;
    end if;
  end if;
  return v_at;
end
$function$
;
