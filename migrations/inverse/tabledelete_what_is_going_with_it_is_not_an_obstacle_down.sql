-- INVERSE of tabledelete_what_is_going_with_it_is_not_an_obstacle.sql — custom.delete_rule and
-- custom.record_delete as tabledelete_a_table_takes_its_contents_with_it.sql left them, before
-- the door said out loud what the whole operation was taking. Run it only to undo that file.
--
-- 🚨 WHICH ONE RUNS, AND IN WHAT ORDER (lane INVERSE-GUARD, 2026-09-21).
-- The body this file restores calls custom.table_contents, and the sibling
-- inverse `tabledelete_a_table_takes_its_contents_with_it_down.sql` REMOVES
-- that function. They are not two independent undos: they are two halves of one lane's
-- teardown, and the pair has exactly one safe order.
--   · THIS FILE ALONE is what puts THIS file's defect back, and it is what the red twin beside
--     it runs. custom.table_contents is still there, so the body it restores still resolves.
--   · `tabledelete_a_table_takes_its_contents_with_it_down.sql` is the DEEPER teardown — it takes
--     custom.table_contents itself away — so it may never run with this file's restore standing in
--     front of it. Run it on its own, against the lane's shipped bodies, never after this one.
-- Running the sibling FIRST and this one SECOND is the one order that leaves the access kernel
-- calling a function that is gone, and it is the order this note exists to forbid.
-- ground-standing-ok: b — the order above is stated, and neither half is run on top of the other.
--

set lock_timeout = '3s';
set statement_timeout = '5min';

create or replace function custom.delete_rule(p_organization_id uuid, p_record_id uuid, p_apply boolean default true)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  -- The callers of this rule (custom.record_delete, custom.migrate_delete) are behind
  -- custom/system_enabled through custom.assert_store_door; the rule itself only decides.
  v_row       custom.record%rowtype;
  v_names     text;
  v_cascade   uuid[] := '{}';
  v_contents  uuid[] := '{}';
  v_is_table  boolean := false;
  v_detached  integer := 0;
  v_effects   jsonb;
  v_child     uuid;
begin
  select * into v_row from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id and r.deleted_at is null;
  if v_row.id is null then
    return jsonb_build_object('cascade_to', '[]'::jsonb, 'detached', 0,
                              'contents_first', false,
                              'note', 'nothing here to delete');
  end if;

  -- ── REC-18. A Field a Rule or a formula depends on is refused, NAMING the dependant,
  --    because "this field is in use" tells a person nothing about what to go and change.
  --    A Field is a Field because it lives in the Field kernel, not because of data_class.
  if v_row.table_id = custom.field_kernel_id() and v_row.data_class <> 'kernel' then
    select string_agg(distinct d.kind || ' "' || d.label || '"', ', ') into v_names
      from custom.field_dependants(p_organization_id, p_record_id) d;
    if v_names is not null then
      raise exception 'This field is used by %, so it was not deleted.', v_names
        using errcode = '23503',
              hint = 'REC-18 / T7: a Rule or a formula that reads a Field it can no longer find is a calculation that silently stops being right. Change or remove what depends on it first, and then this delete goes through.';
    end if;
  end if;

  -- ── TABLE-DELETE. A TABLE IS A CONTAINER. Its Fields, its saved views, its Rules and its
  --    records have no existence without it, so they go with it — in the same transaction,
  --    under this same rule, recorded as ONE operation. What is refused is the same thing
  --    REC-18 refuses for one Field: something OUTSIDE this Table that reads one of its
  --    Fields. Inside the Table, a formula reading its neighbour is going too, so it is not
  --    an obstacle; it is part of the set.
  if v_row.table_id = custom.table_kernel_id() and v_row.data_class <> 'kernel' then
    v_is_table := true;
    select coalesce(array_agg(c.record_id order by c.goes_at, c.record_id), '{}')
      into v_contents
      from custom.table_contents(p_organization_id, p_record_id) c;

    select string_agg(distinct d.kind || ' "' || d.label || '"', ', ') into v_names
      from unnest(v_contents) f
      join lateral custom.field_dependants(p_organization_id, f) d on true
     where not (d.dependant_id = any (v_contents))
       and d.dependant_id <> p_record_id;
    if v_names is not null then
      raise exception 'This table''s fields are used by %, so it was not deleted.', v_names
        using errcode = '23503',
              hint = 'REC-18 / T7: deleting this table would take fields that a Rule, a formula or a relation somewhere else still reads, and a calculation that can no longer find its field silently stops being right. Change or remove what depends on them first, and then this delete goes through — it will take this table''s fields, saved views, rules and records with it, in one operation you can undo.';
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
  begin
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
        raise exception 'this is still used by %, so it was not deleted', v_names
          using errcode = '23503',
                hint = 'REL-2 / T7: this relation is set to refuse the delete while anything still points at it. Remove those first, or change what the field does when the thing it points at is deleted.';
      end if;
      select coalesce(array_agg(x.other_id), '{}') into v_cascade
        from platform.relation_delete_effects(p_organization_id, p_record_id) x
       where x.action = 'cascade' and x.other_type = 'record';
      v_effects := jsonb_build_object('detached', 0, 'cascade_to', to_jsonb(v_cascade));
    end if;
  exception when undefined_function then
    -- The relation surface is not on this database at all. That is a fact about the database,
    -- not a rule, and it is carried back in the answer rather than swallowed.
    v_effects := jsonb_build_object('note', 'platform.relation_on_delete is not on this database');
  end;

  -- ── REC-12 for CONTAINMENT: the 500 serial numbers inside Widget. A contained record has no
  --    independent existence, so it goes with its container. This is not a relation's
  --    `on_delete` — it is what containment MEANS, and it is the cascade T7 names first.
  for v_child in
    select e.child_id from custom.containment_edges(p_organization_id) e
     where e.parent_id = p_record_id and e.via = 'contained'
  loop
    if not (v_child = any (v_cascade)) then
      v_cascade := v_cascade || v_child;
    end if;
  end loop;

  -- A Table's contents lead, because the door takes them before the Table itself.
  if v_is_table then
    select coalesce(array_agg(x order by ord), '{}') into v_cascade
      from (select x, ord from unnest(v_contents) with ordinality as c(x, ord)
            union all
            select x, ord + 1000000 from unnest(v_cascade) with ordinality as d(x, ord)
                   where not (x = any (v_contents))) s;
  end if;

  return jsonb_build_object('cascade_to', to_jsonb(v_cascade),
                            'detached', v_detached,
                            'contents_first', v_is_table,
                            'relation_effects', coalesce(v_effects, '{}'::jsonb));
end;
$fn$;

-- ─────────────────────────────────────────────────────────────────────────────
-- THE DOOR. A Table's contents go BEFORE the Table; everything else goes after
-- its container, which is what stops a containment loop.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function custom.record_delete(p_organization_id uuid, p_record_id uuid)
returns timestamp with time zone
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_at    timestamptz;
  v_plan  jsonb;
  v_child uuid;
  v_first boolean;
  v_depth integer;
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

  -- HOW DEEP THIS HAS GONE. A cascade that nests past 64 is a cycle somebody built, and
  -- saying so beats recursing until the server runs out of stack.
  v_depth := coalesce(nullif(current_setting('custom.delete_depth', true), '')::integer, 0);
  if v_depth > 64 then
    raise exception 'this delete reaches through more than 64 levels of containment, which is a loop rather than a hierarchy'
      using errcode = '54001',
            hint = 'REC-12: something contains one of its own containers. Break that link and delete again.';
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
    for v_child in select (x #>> '{}')::uuid from jsonb_array_elements(coalesce(v_plan -> 'cascade_to', '[]'::jsonb)) x loop
      if v_child <> p_record_id
         and exists (select 1 from custom.record r
                      where r.organization_id = p_organization_id and r.id = v_child and r.deleted_at is null) then
        perform custom.record_delete(p_organization_id, v_child);
      end if;
    end loop;
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
    raise exception 'There is no record % in this organization.', p_record_id
      using errcode = '02000',
            hint = 'Nothing was deleted. The store is keyed (organization_id, id), so a record of another organization is not found by this one.';
  end if;

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
  return v_at;
end
$fn$;
