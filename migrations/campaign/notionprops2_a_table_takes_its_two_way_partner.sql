-- target: branch,production
-- additive: yes
-- ADDITIVE: a two-way link's paired column (config.reverse_of on the other table) goes WITH the Field or the
--   Table it pairs, as Notion does, instead of refusing the archive as a "reader" of it. Measured live
--   2026-10-08: archiving "Projects" (linked two-way to "Clients") was refused — "This table's fields are used
--   by field "Projects", so it was not deleted." — and so was removing the forward column alone.
--   Adds: custom._two_way_partners (no client lane).
--   Replaces (same signatures): custom.delete_rule (a paired column is not a refusing reader; a Table's
--   archive takes its partners first under the same delete_set and archive event; a Field's delete cascades
--   to its partner), custom.field_retire (retires the partner through the same door, so the other table
--   stops declaring it), custom.field_restore (brings back the partner retired at the same moment).
--   Restore of an archived Table already brings back every row its archive event took, partner included.
--   Migrates nothing. Locks: pg_proc rows only.
--   Inverse: migrations/inverse/notionprops2_a_table_takes_its_two_way_partner_down.sql
--   Proof: scripts/campaign-tests/notionprops2_a_table_takes_its_two_way_partner.sql (RED before, GREEN after)
-- guard: custom/system_enabled
-- lock: custom
-- lane: NOTION-PROPS-2
-- based-on: custom.delete_rule(uuid, uuid, boolean) eecb3021461eddcf018917252d821630cdce7b6698e964b9fd1a570c7e1d94da
-- based-on: custom.field_retire(uuid, uuid) 427aca22887f67eb09b6eca2f47fbb4a8675d37b05d3d71a35521436ae837058
-- based-on: custom.field_restore(uuid, uuid) 36b8426c3827d7c8093d91dcbd359b739880f8b3680165771f156ec8d9f87c58

create function custom._two_way_partners(p_organization_id uuid, p_field_ids uuid[])
 returns uuid[]
 language sql
 stable
 set search_path to 'pg_catalog'
as $function$
  -- NOTION-PROPS-2: the live paired columns (config.reverse_of) of these Fields, on any table of the
  -- organization. A paired column holds no value of its own; it is the other half of the same link.
  select coalesce(array_agg(r.id order by r.created_at, r.id), '{}'::uuid[])
    from custom.record r
   where r.organization_id = p_organization_id
     and r.table_id = custom.field_kernel_id()
     and r.data_class = 'field'
     and r.deleted_at is null
     and nullif(r.data -> 'config' ->> 'reverse_of', '') is not null
     and r.data -> 'config' ->> 'reverse_of' = any (select f::text from unnest(p_field_ids) f)
$function$;
comment on function custom._two_way_partners(uuid, uuid[]) is
  'NOTION-PROPS-2: the live paired columns (config.reverse_of) of these Fields. No client lane.';

CREATE OR REPLACE FUNCTION custom.delete_rule(p_organization_id uuid, p_record_id uuid, p_apply boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
  -- WHAT THIS ONE OPERATION IS ALREADY TAKING. `custom.record_delete` publishes the whole set
  -- before it starts on a Table's contents, because a formula reading its neighbour is not an
  -- obstacle when the neighbour is going too — it is part of the same delete. Transaction-local
  -- (set_config(..., true)), restored by the caller, and empty for an ordinary single delete.
  v_going     text := coalesce(current_setting('custom.delete_set', true), '');
  -- NOTION-PROPS-2: the paired column of a two-way link (config.reverse_of) is the other half of
  -- the same link, so it is never a reader that refuses — it goes with the Field (or the Table) it
  -- pairs, in the same operation, and comes back with it.
  v_pairs     uuid[] := '{}';
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
    v_pairs := custom._two_way_partners(p_organization_id, array[p_record_id]);
    select string_agg(distinct d.kind || ' "' || d.label || '"', ', ') into v_names
      from custom.field_dependants(p_organization_id, p_record_id) d
     where position(d.dependant_id::text in v_going) = 0
       and not (d.dependant_id = any (v_pairs));
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
    -- NOTION-PROPS-2: the paired columns on OTHER tables of this table's links go with it.
    v_pairs := custom._two_way_partners(p_organization_id, v_contents);
    v_contents := v_contents || coalesce((select array_agg(x) from unnest(v_pairs) x
                                           where not (x = any (v_contents))), '{}');

    select string_agg(distinct d.kind || ' "' || d.label || '"', ', ') into v_names
      from unnest(v_contents) f
      join lateral custom.field_dependants(p_organization_id, f) d on true
     where not (d.dependant_id = any (v_contents))
       and d.dependant_id <> p_record_id
       and position(d.dependant_id::text in v_going) = 0;
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

  -- NOTION-PROPS-2: a Field's paired column goes after it, through the same door.
  if not v_is_table then
    v_cascade := v_cascade || coalesce((select array_agg(x) from unnest(v_pairs) x
                                         where not (x = any (v_cascade))), '{}');
  end if;

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
$function$

;

CREATE OR REPLACE FUNCTION custom.field_retire(p_organization_id uuid, p_field_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_field  jsonb;
  v_table  uuid;
  v_spec   jsonb;
  v_going  uuid[];
  v_keys   text[];
  v_added  integer;
  v_title  text;
  v_names  text;
  v_saved_set text;
  v_one    uuid;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.field_retire');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.field_retire');

  select r.data, (r.data ->> 'entity_definition_id')::uuid into v_field, v_table
    from custom.record r
   where r.organization_id = p_organization_id
     and r.id = p_field_id
     and r.table_id = custom.field_kernel_id()
     and r.deleted_at is null;
  if v_field is null then
    raise exception 'There is no such field in this organization, so nothing was removed.'
      using errcode = '23514', hint = 'REC-29: organizations are hard walls.';
  end if;
  if v_table is null then
    raise exception 'The field "%" belongs to a standard table, and this door removes a field from a table somebody made.',
                    custom.said(v_field ->> 'label', 'that one')
      using errcode = '23514',
            hint = 'FLD-8: a field on a standard table is part of that table''s own definition.';
  end if;

  perform custom.assert_client_may_change(p_organization_id, v_table, 'custom.field_retire',
                                          'admin'::public.permission_level, 'table');

  select r.data into v_spec
    from custom.record r
   where r.organization_id = p_organization_id and r.id = v_table
     and r.table_id = custom.table_kernel_id() and r.deleted_at is null;

  -- THE SET THAT IS GOING. The field, and every field of this same table that works out its
  -- answer through it - and then every field that works out ITS answer through one of those.
  -- A lookup that feeds a rollup goes in the same operation as the relation both read.
  v_going := array[p_field_id];
  v_keys  := array[v_field ->> 'key'];
  loop
    v_added := array_length(v_going, 1);
    select coalesce(array_agg(x.id), '{}'::uuid[]), coalesce(array_agg(x.key), '{}'::text[])
      into v_going, v_keys
      from (
        select f.id as id, f.data ->> 'key' as key
          from custom.record f
         where f.organization_id = p_organization_id
           and f.table_id = custom.field_kernel_id()
           and f.deleted_at is null
           and (f.data ->> 'entity_definition_id')::uuid = v_table
           and (f.id = any (v_going)
                or f.data -> 'config' ->> 'via'  = any (v_keys)
                or f.data -> 'config' ->> 'of'   = any (v_keys)
                or f.data -> 'config' ->> 'pick' = any (v_keys))
      ) x;
    exit when array_length(v_going, 1) = v_added;
  end loop;

  -- REC-2. The title goes nowhere, and the refusal says which field in the set is the title.
  v_title := v_spec ->> 'title_field';
  if v_title = any (v_keys) then
    select string_agg('"' || custom.said(f.data ->> 'label', f.data ->> 'key') || '"', ', ' order by f.data ->> 'key')
      into v_names
      from custom.record f
     where f.organization_id = p_organization_id and f.id = any (v_going);
    raise exception 'Removing "%" would also remove %, and one of those is "%" - what every record of this table is called.',
                    custom.said(v_field ->> 'label', 'that field'), v_names, v_title
      using errcode = '23514',
            hint = 'REC-2: a record is shown as a chip with the value of its title field. Make another field the title first, and then this removal takes the whole set in one operation.';
  end if;

  -- REC-1. A table keeps at least one field, and the refusal says how many the set would take.
  if jsonb_array_length(coalesce(v_spec -> 'fields', '[]'::jsonb)) <= array_length(v_going, 1) then
    raise exception 'A table keeps at least one field, and removing "%" would take all % of them.',
                    custom.said(v_field ->> 'label', 'that field'),
                    array_length(v_going, 1)::text
      using errcode = '23514',
            hint = 'REC-1: a table has to declare its fields. Add another field first, and then this removal goes through.';
  end if;

  -- ── T7's LAST CLAUSE, 2026-09-20 (lane LEAK-T10): AND A FORMULA THAT READS IT IS ASKED.
  --    `custom.field_dependants` has always been able to name the formula, the Rule and the
  --    merge field that read this column by id, and `custom.delete_rule` has always refused a
  --    delete that would blind one — REC-18, "This field is used by …, so it was not deleted."
  --    This door never asked it. It computed its own going set from `config->>via/of/pick`,
  --    which is the LOOKUP and ROLLUP chain only, and then soft-deleted the rows with a plain
  --    UPDATE. So retiring a column a formula depends on succeeded in silence, and the formula
  --    went on being evaluated against a Field that is not there — the exact calculation that
  --    "silently stops being right" REC-18 exists to prevent.
  --
  --    IT ASKS THE SHARED RULE, and does not grow a second copy of it. Everything the rule
  --    needs is already here: the going set is published in `custom.delete_set` exactly as
  --    `custom.record_delete` publishes it, so a formula that reads a column going in the SAME
  --    operation is not an obstacle (it is part of the set), and anything OUTSIDE the set comes
  --    back as the rule's own sentence, with the dependant's kind and name in it.
  --
  --    `p_apply => false` because this door does its own retirement below, in one statement,
  --    under `custom.is_a_retirement`. What is wanted from the rule is its VERDICT.
  v_saved_set := coalesce(current_setting('custom.delete_set', true), '');
  perform set_config('custom.delete_set',
                     (select string_agg(g::text, ',') from unnest(v_going) g), true);
  begin
    foreach v_one in array v_going loop
      perform custom.delete_rule(p_organization_id, v_one, false);
    end loop;
  exception when others then
    perform set_config('custom.delete_set', v_saved_set, true);
    raise;
  end;
  perform set_config('custom.delete_set', v_saved_set, true);

  -- ── NOTION-PROPS-2, 2026-10-08: A TWO-WAY LINK'S OTHER HALF GOES WITH IT. The paired column on the
  -- other table (config.reverse_of) holds no value of its own; it is retired through this same door,
  -- so that table stops declaring it and its own readers still refuse by name. custom.field_restore
  -- brings it back with this one (same moment).
  for v_one in select p from unnest(custom._two_way_partners(p_organization_id, v_going)) p
                where not (p = any (v_going)) loop
    perform custom.field_retire(p_organization_id, v_one);
  end loop;

  -- ── RELATION-DECLARE, 2026-09-20: AND THE LINKS GO WITH THE COLUMNS. ─────────────────
  -- The column was gone and its edges were live, naming a field that no longer exists, which
  -- is the same 23514 a retype caused on the other table's reverse side. The whole going set
  -- is withdrawn in one statement, through the one withdrawal both this and custom.field_update
  -- call, so a removal never leaves a relation behind it. It runs BEFORE the field records are
  -- retired, while those columns still say what their links mean.
  perform custom.relation_edges_withdraw(p_organization_id, v_going,
    format('the column "%s" was removed', custom.said(v_field ->> 'label', v_field ->> 'key')));

  -- The field records go first: a retirement is not a change of shape (custom.is_a_retirement),
  -- so every guard lets the whole set through in ONE statement, and the table is then left
  -- declaring only fields that exist.
  update custom.record
     set deleted_at = now()
   where organization_id = p_organization_id
     and id = any (v_going)
     and table_id = custom.field_kernel_id();

  update custom.record
     set data = jsonb_set(data, '{fields}', (
           select coalesce(jsonb_agg(f), '[]'::jsonb)
             from jsonb_array_elements(coalesce(data -> 'fields', '[]'::jsonb)) f
            where not (f ->> 'name' = any (v_keys)))),
         updated_at = now(), version = version + 1
   where organization_id = p_organization_id and id = v_table
     and table_id = custom.table_kernel_id();

  return true;
end
$function$

;

CREATE OR REPLACE FUNCTION custom.field_restore(p_organization_id uuid, p_field_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
-- lane STORE-RESTORE-DOORS. THE UNDO OF custom.field_retire. A retirement takes a SET — the Field
-- and every Field of the same Table that works its answer out through it — in one statement, so the
-- set is every Field of this Table archived at this Field's own moment. It comes back whole: the
-- Table declares the columns again (custom.field_declare's order: the Table is told first), the
-- Field rows are live again, and the links custom.relation_edges_withdraw took out in the same
-- statement come back. THE VALUES NEVER LEFT: a retirement changes no record's document (the
-- undeclared-key guard judges only a key a write changes), so every record still holds what it held
-- under that column, and the column shows it again the moment it is back.
declare
  v_field  jsonb;
  v_table  uuid;
  v_at     timestamptz;
  v_spec   jsonb;
  v_going  uuid[];
  v_keys   text[];
  v_taken  text;
  v_edges  integer := 0;
  v_named  boolean := false;
  v_pair   uuid;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.field_restore');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.field_restore');

  select r.data, nullif(r.data ->> 'entity_definition_id', '')::uuid, r.deleted_at
    into v_field, v_table, v_at
    from custom.record r
   where r.organization_id = p_organization_id
     and r.id = p_field_id
     and r.table_id = custom.field_kernel_id();
  if v_field is null then
    raise exception 'There is no such field in this organization, so nothing was brought back.'
      using errcode = '02000', hint = 'REC-29: organizations are hard walls.';
  end if;
  if v_at is null then
    raise exception 'The field "%" was not removed, so there was nothing to bring back.',
                    custom.said(v_field ->> 'label', v_field ->> 'key')
      using errcode = '02000', hint = 'REC-23: it is already here.';
  end if;
  -- LANE7-SEC-ARCHIVE (2026-10-03): A STANDARD TABLE'S FIELD COMES BACK FROM TRASH TOO. Its values
  -- never left the rows (the custom_fields guard carries them untouched while it is archived), so
  -- bringing the definition back is the whole restore. The rung is custom.entity_field_retire's:
  -- an owner or an admin of the organization. A field made since under the same key holds it.
  if v_table is null and nullif(v_field ->> 'table_token', '') is not null then
    if not (custom.query_is_store_owner() or iam.has_org_admin(p_organization_id)) then
      raise exception 'Bringing back "%" changes it for everybody in this organization, and that is an owner''s or an admin''s to do.',
                      custom.said(v_field ->> 'label', v_field ->> 'key')
        using errcode = '42501', hint = 'The same rung that archived it. Nothing was brought back.';
    end if;
    select string_agg(format('"%s"', custom.said(f.data ->> 'label', f.data ->> 'key')), ', ')
      into v_taken
      from custom.record f
     where f.organization_id = p_organization_id
       and f.table_id = custom.field_kernel_id()
       and f.deleted_at is null
       and f.data ->> 'table_token' = v_field ->> 'table_token'
       and f.data ->> 'key' = v_field ->> 'key';
    if v_taken is not null then
      raise exception 'This table has a field % again, so "%" cannot come back beside it.',
                      v_taken, custom.said(v_field ->> 'label', v_field ->> 'key')
        using errcode = '23505',
              hint = 'Two fields of one table cannot share a key. Rename or remove the newer one, then restore this one from Trash.';
    end if;
    update custom.record
       set deleted_at = null
     where organization_id = p_organization_id
       and id = p_field_id
       and table_id = custom.field_kernel_id()
       and deleted_at = v_at;
    raise notice '%', 'Brought back: 1 field with its values.';
    return true;
  end if;
  if v_table is null then
    raise exception 'The field "%" belongs to a standard table, and this door brings back a field of a table somebody made.',
                    custom.said(v_field ->> 'label', 'that one')
      using errcode = '23514', hint = 'FLD-8: a field on a standard table is part of that table''s own definition.';
  end if;

  select r.data into v_spec
    from custom.record r
   where r.organization_id = p_organization_id and r.id = v_table
     and r.table_id = custom.table_kernel_id() and r.deleted_at is null;
  if v_spec is null then
    raise exception 'The field "%" belongs to a table that is archived, so it cannot come back on its own.',
                    custom.said(v_field ->> 'label', v_field ->> 'key')
      using errcode = '23514',
            hint = 'Restore the table from Trash first. A field removed with its table comes back with it; a field removed before, from Trash once the table is back.';
  end if;

  -- The rung custom.field_retire climbs: admin on the Table.
  perform custom.assert_client_may_change(p_organization_id, v_table, 'custom.field_restore',
                                          'admin'::public.permission_level, 'table');

  -- THE SET THAT WENT TOGETHER: every Field of this Table retired in the same statement.
  select array_agg(f.id order by f.id), array_agg(f.data ->> 'key' order by f.id)
    into v_going, v_keys
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at = v_at
     and f.data ->> 'entity_definition_id' = v_table::text;

  -- A column made since under the same key holds that key now; two columns cannot share it.
  select string_agg(format('"%s"', custom.said(f.data ->> 'label', f.data ->> 'key')), ', ')
    into v_taken
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and f.data ->> 'entity_definition_id' = v_table::text
     and f.data ->> 'key' = any (v_keys);
  if v_taken is not null then
    raise exception 'This table has a field % again, so "%" cannot come back beside it.',
                    v_taken, custom.said(v_field ->> 'label', v_field ->> 'key')
      using errcode = '23505',
            hint = 'Two fields of one table cannot share a key. Rename or remove the newer one, then restore this one from Trash.';
  end if;

  -- The Table declares the columns first — the field guard refuses a definition for a column the
  -- Table does not declare (custom.field_declare tells the Table first for the same reason).
  update custom.record
     set data = jsonb_set(data, '{fields}',
                          coalesce(data -> 'fields', '[]'::jsonb)
                          || coalesce((select jsonb_agg(jsonb_build_object('name', k) order by o)
                                         from unnest(v_keys) with ordinality as u(k, o)
                                        where not exists (select 1
                                                            from jsonb_array_elements(coalesce(data -> 'fields', '[]'::jsonb)) x
                                                           where x ->> 'name' = k)), '[]'::jsonb)),
         updated_at = now(), version = version + 1
   where organization_id = p_organization_id and id = v_table
     and table_id = custom.table_kernel_id();

  update custom.record
     set deleted_at = null
   where organization_id = p_organization_id
     and id = any (v_going)
     and table_id = custom.field_kernel_id()
     and deleted_at = v_at;

  -- THE LINKS THE RETIREMENT TOOK: custom.relation_edges_withdraw tombstoned them in the same
  -- statement (deleted_at = that moment, no deleted_via — it is not a trashing). One the records
  -- have made again since is live already and is left as it is.
  if nullif(current_setting('app.actor_system', true), '') is null
     and coalesce(platform.declared_actor_tier(), platform.actor_tier()) in ('agent', 'system') then
    perform set_config('app.actor_system', 'custom.relations', true);
    v_named := true;
  end if;
  update platform.associations a
     set deleted_at = null
   where a.organization_id = p_organization_id
     and a.relation_field_id = any (v_going)
     and a.deleted_at = v_at
     and a.deleted_via_type is null
     and not exists (select 1 from platform.associations b
                      where b.organization_id = a.organization_id
                        and b.relation_field_id = a.relation_field_id
                        and b.source_type = a.source_type and b.source_id = a.source_id
                        and b.target_type = a.target_type and b.target_id = a.target_id
                        and b.role is not distinct from a.role
                        and b.deleted_at is null);
  get diagnostics v_edges = row_count;
  if v_named then
    perform set_config('app.actor_system', '', true);
  end if;

  -- NOTION-PROPS-2: the paired column custom.field_retire took with this one (same moment), when its
  -- table is live.
  for v_pair in
    select r.id from custom.record r
      join custom.record t on t.organization_id = r.organization_id
                          and t.id = nullif(r.data ->> 'entity_definition_id', '')::uuid
                          and t.table_id = custom.table_kernel_id() and t.deleted_at is null
     where r.organization_id = p_organization_id
       and r.table_id = custom.field_kernel_id()
       and r.deleted_at = v_at
       and r.data -> 'config' ->> 'reverse_of' = any (select g::text from unnest(v_going) g)
       and not (r.id = any (v_going))
  loop
    perform custom.field_restore(p_organization_id, v_pair);
  end loop;

  raise notice '%', format('Brought back: %s field(s) with their values%s.',
    cardinality(v_going),
    case when v_edges > 0 then format(', and %s link(s) they made', v_edges) else '' end);
  return true;
end
$function$

;
