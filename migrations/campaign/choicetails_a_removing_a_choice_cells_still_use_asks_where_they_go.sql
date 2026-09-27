-- chair-step: lane CHOICE-TAILS (2026-09-27). Removing a choice that cells still use asks where those cells go, Notion-style (ruling: "N records use "<choice>". Move them to [another choice], keep the words as other values (only if the column allows other values), or clear them."), and the answer is ONE save: custom.field_update_rehoming_choices (new client door) saves the column's choices through custom.field_update (which decides the right to change the table's columns) and moves, keeps or clears every cell that held a removed choice through custom.record_update (which decides each row), in one transaction; it answers the undo — the list as it was and every cell as it was — and the same door, given that undo, puts both back in one transaction. custom.field_choice_usage (new client door) answers how many records hold each choice, which is the N the column editor says. No existing body is replaced; no row is written by this file except two door registry rows. Locks: function definitions only.
-- lane: CHOICE-TAILS
-- INVERSE: migrations/inverse/choicetails_a_removing_a_choice_cells_still_use_asks_where_they_go_down.sql

-- ── 1. HOW MANY RECORDS HOLD EACH CHOICE ─────────────────────────────────────────────────────
-- {"<option id>": {"key", "words", "retired", "records"}} for every option of one choice column
-- (retired ones too, so a caller can say what a retired choice still holds). `records` counts the
-- live records of the column's table this caller may SEE whose cell holds the option's key — the
-- read door's own visibility, exactly as custom.choice_census bounds itself.
CREATE OR REPLACE FUNCTION custom.field_choice_usage(p_organization_id uuid, p_field_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_doc   jsonb;
  v_table uuid;
  v_key   text;
  v_opts  uuid;
  v_out   jsonb;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.field_choice_usage');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.field_choice_usage');

  select f.data into v_doc
    from custom.record f
   where f.organization_id = p_organization_id and f.id = p_field_id
     and f.table_id = custom.field_kernel_id() and f.deleted_at is null
     and coalesce(f.data_class, '') <> 'kernel';
  if v_doc is null then
    raise exception 'There is no such column in this organization.'
      using errcode = '02000', hint = 'REC-29: organizations are hard walls. Nothing was read.';
  end if;
  v_table := nullif(v_doc ->> 'entity_definition_id', '')::uuid;
  perform custom.assert_may_know_table(p_organization_id, v_table, 'custom.field_choice_usage');

  v_key  := v_doc ->> 'key';
  v_opts := nullif(v_doc -> 'config' ->> 'options_table_id', '')::uuid;
  if coalesce(v_doc ->> 'type', '') <> 'list' or v_opts is null then
    return '{}'::jsonb;
  end if;

  with opts as (
    select e.key as k, e.value ->> 'id' as id, e.value ->> 'label' as words,
           coalesce((e.value ->> 'retired')::boolean, false) as retired
      from jsonb_each(custom.choice_options(p_organization_id, v_opts)) e
  ), cells as (
    select r.id as rid, x #>> '{}' as tok
      from custom.record r
      cross join lateral jsonb_array_elements(
             case jsonb_typeof(r.data -> v_key)
               when 'array'  then r.data -> v_key
               when 'string' then jsonb_build_array(r.data -> v_key)
               else '[]'::jsonb end) x
     where r.organization_id = p_organization_id
       and r.table_id = v_table
       and r.deleted_at is null
       and coalesce(r.data_class, 'record') = 'record'
       and jsonb_typeof(x) = 'string'
       and (custom.query_is_store_owner()
            or custom.has_visibility(custom.query_principal(), 'record', r.id, 'viewer'::public.permission_level))
  )
  select coalesce(jsonb_object_agg(o.id, jsonb_build_object(
           'key', o.k, 'words', o.words, 'retired', o.retired,
           'records', (select count(distinct c.rid) from cells c where c.tok = o.k))), '{}'::jsonb)
    into v_out
    from opts o
   where o.id is not null;
  return v_out;
end;
$function$;

-- ── 2. A COLUMN'S CHOICES SAVED, AND THE CELLS OF A REMOVED ONE MOVED, KEPT OR CLEARED ─────────
-- `p_patch` is what custom.field_update takes (the column's `options`, in order, {id, words} or
-- words). `p_rehome` says where the cells of each removed choice go:
--   {"<option id>": {"then": "move", "to": "<option id>"}}   they take another (live) choice
--   {"<option id>": {"then": "keep"}}                         they keep the words as another value
--                                                              (only where the column takes other values)
--   {"<option id>": {"then": "clear"}}                        they are emptied
-- A removed choice this does not name keeps its cells as they are (the store's retired-choice
-- rule, unchanged). `p_cells_back` is an undo's [{record_id, value}] — each cell of THIS column
-- written back through custom.record_update. The answer carries `undo`: the list as it was and
-- every cell as it was, which, sent back through this same door, puts both back in one save.
CREATE OR REPLACE FUNCTION custom.field_update_rehoming_choices(p_organization_id uuid, p_field_id uuid,
                                                                p_patch jsonb,
                                                                p_rehome jsonb DEFAULT NULL::jsonb,
                                                                p_cells_back jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_doc     jsonb;
  v_table   uuid;
  v_key     text;
  v_label   text;
  v_opts    uuid;
  v_allow   boolean;
  v_before  jsonb;
  v_after   jsonb;
  v_was     jsonb;
  v_e       record;
  v_then    text;
  v_rk      text;
  v_words   text;
  v_tk      text;
  v_r       record;
  v_new     jsonb;
  v_cells   jsonb := '[]'::jsonb;
  v_summary jsonb := '[]'::jsonb;
  v_n       integer;
  v_c       jsonb;
  v_rid     uuid;
  n_back    integer := 0;
  k_uuid    constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
begin
  perform custom.assert_store_door(p_organization_id, 'custom.field_update_rehoming_choices');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.field_update_rehoming_choices');
  if p_rehome is not null and jsonb_typeof(p_rehome) not in ('object', 'null') then
    raise exception 'Where the cells of a removed choice go is sent per choice, as {"<choice id>": {"then": "move" | "keep" | "clear"}}.'
      using errcode = '23514', hint = 'Nothing was changed.';
  end if;
  if p_cells_back is not null and jsonb_typeof(p_cells_back) not in ('array', 'null') then
    raise exception 'Cells to put back are sent as a list of {record_id, value}.'
      using errcode = '23514', hint = 'Nothing was changed.';
  end if;

  select f.data into v_doc
    from custom.record f
   where f.organization_id = p_organization_id and f.id = p_field_id
     and f.table_id = custom.field_kernel_id() and f.deleted_at is null
     and coalesce(f.data_class, '') <> 'kernel';
  if v_doc is null then
    raise exception 'There is no such column in this organization, so nothing was changed.'
      using errcode = '02000', hint = 'REC-29: organizations are hard walls.';
  end if;
  v_table := nullif(v_doc ->> 'entity_definition_id', '')::uuid;
  perform custom.assert_may_know_table(p_organization_id, v_table, 'custom.field_update_rehoming_choices');
  v_key   := v_doc ->> 'key';
  v_label := coalesce(nullif(v_doc ->> 'label', ''), v_key);
  v_opts  := nullif(v_doc -> 'config' ->> 'options_table_id', '')::uuid;

  -- THE LIST AS IT WAS, for the undo: the live choices, in the person's order, by id.
  v_before := case when v_opts is null then '{}'::jsonb else custom.choice_options(p_organization_id, v_opts) end;
  select coalesce(jsonb_agg(jsonb_build_object('id', e.value ->> 'id', 'words', e.value ->> 'label')
                            order by (e.value ->> 'position')::integer nulls last, e.value ->> 'label'), '[]'::jsonb)
    into v_was
    from jsonb_each(v_before) e
   where not coalesce((e.value ->> 'retired')::boolean, false);

  -- THE COLUMN'S OWN SAVE, which decides the right to change the table's columns.
  if p_patch is not null and jsonb_typeof(p_patch) = 'object' and p_patch <> '{}'::jsonb then
    perform custom.field_update(p_organization_id, p_field_id, p_patch);
  end if;

  select f.data into v_doc
    from custom.record f
   where f.organization_id = p_organization_id and f.id = p_field_id and f.table_id = custom.field_kernel_id();
  v_opts  := nullif(v_doc -> 'config' ->> 'options_table_id', '')::uuid;
  v_allow := coalesce((v_doc -> 'config' ->> 'allow_other')::boolean, false);
  v_after := case when v_opts is null then '{}'::jsonb else custom.choice_options(p_organization_id, v_opts) end;

  -- WHERE THE CELLS OF EACH REMOVED CHOICE GO.
  for v_e in select key, value from jsonb_each(coalesce(nullif(p_rehome, 'null'::jsonb), '{}'::jsonb)) loop
    v_then := lower(coalesce(v_e.value ->> 'then', ''));
    select o.key, o.value ->> 'label' into v_rk, v_words
      from jsonb_each(v_after) o
     where o.value ->> 'id' = v_e.key
     limit 1;
    if v_rk is null then
      raise exception '"%" has no choice with the id %, so nothing was changed.', v_label, v_e.key
        using errcode = '23514', hint = 'Open the column''s settings again; its choices are read afresh.';
    end if;
    if not coalesce((v_after -> v_rk ->> 'retired')::boolean, false) then
      raise exception '"%" is still one of the choices for "%", so its records were left as they are and nothing was changed.', v_words, v_label
        using errcode = '23514', hint = 'Remove the choice from the list in the same save that says where its records go.';
    end if;

    v_tk := null;
    if v_then = 'move' then
      if coalesce(v_e.value ->> 'to', '') !~ k_uuid then
        raise exception 'Moving the records that hold "%" needs the choice they move to.', v_words
          using errcode = '23514', hint = 'Send {"then": "move", "to": "<choice id>"}. Nothing was changed.';
      end if;
      select o.key into v_tk
        from jsonb_each(v_after) o
       where o.value ->> 'id' = v_e.value ->> 'to'
         and not coalesce((o.value ->> 'retired')::boolean, false)
       limit 1;
      if v_tk is null then
        raise exception 'The records that hold "%" can only move to one of the choices "%" still has, so nothing was changed.', v_words, v_label
          using errcode = '23514', hint = 'Pick a choice that is still in the list.';
      end if;
    elsif v_then = 'keep' then
      if not v_allow then
        raise exception '"%" takes only its own choices, so the records that hold "%" cannot keep it as another value. Nothing was changed.', v_label, v_words
          using errcode = '23514', hint = 'Move them to another choice or clear them, or let the column take other values first.';
      end if;
    elsif v_then <> 'clear' then
      raise exception 'The records that hold "%" can be moved, kept as other values or cleared, and "%" is none of those.', v_words, v_then
        using errcode = '23514', hint = 'Send "then": "move", "keep" or "clear". Nothing was changed.';
    end if;

    v_n := 0;
    for v_r in
      select r.id, r.data -> v_key as val
        from custom.record r
       where r.organization_id = p_organization_id
         and r.table_id = v_table
         and r.deleted_at is null
         and coalesce(r.data_class, 'record') = 'record'
         and (r.data -> v_key = to_jsonb(v_rk)
              or (jsonb_typeof(r.data -> v_key) = 'array' and (r.data -> v_key) ? v_rk))
       order by r.id
    loop
      if jsonb_typeof(v_r.val) = 'array' then
        select coalesce(jsonb_agg(z.v order by z.n), '[]'::jsonb) into v_new
          from (select distinct on (y.v) y.v, y.n
                  from (select case when x.v = to_jsonb(v_rk)
                                    then case v_then when 'move' then to_jsonb(v_tk)
                                                     when 'keep' then to_jsonb(v_words) end
                                    else x.v end as v, x.n
                          from jsonb_array_elements(v_r.val) with ordinality x(v, n)) y
                 where y.v is not null
                 order by y.v, y.n) z;
      else
        v_new := case v_then when 'move' then to_jsonb(v_tk)
                             when 'keep' then to_jsonb(v_words)
                             else 'null'::jsonb end;
      end if;
      -- THE ROW'S OWN WRITE DOOR, which decides the row, validates the value and versions it.
      perform custom.record_update(p_organization_id, v_r.id, jsonb_build_object(v_key, v_new));
      v_cells := v_cells || jsonb_build_array(jsonb_build_object('record_id', v_r.id, 'value', v_r.val));
      v_n := v_n + 1;
    end loop;

    v_summary := v_summary || jsonb_build_array(jsonb_build_object(
      'choice_id', v_e.key, 'words', v_words, 'then', v_then, 'to', v_e.value ->> 'to', 'records', v_n));
  end loop;

  -- AN UNDO'S CELLS, each written back through the row's own door, on this column only.
  for v_c in select x from jsonb_array_elements(coalesce(nullif(p_cells_back, 'null'::jsonb), '[]'::jsonb)) x loop
    if coalesce(v_c ->> 'record_id', '') !~ k_uuid then
      raise exception 'A cell to put back names no record, so nothing was changed.'
        using errcode = '23514', hint = 'Send [{"record_id": "<id>", "value": …}].';
    end if;
    v_rid := (v_c ->> 'record_id')::uuid;
    if not exists (select 1 from custom.record r
                    where r.organization_id = p_organization_id and r.id = v_rid
                      and r.table_id = v_table and coalesce(r.data_class, 'record') = 'record') then
      raise exception 'A cell to put back is not a record of the table "%" belongs to, so nothing was changed.', v_label
        using errcode = '23514', hint = 'REC-29: an undo writes only the column it came from.';
    end if;
    perform custom.record_update(p_organization_id, v_rid,
              jsonb_build_object(v_key, coalesce(v_c -> 'value', 'null'::jsonb)));
    n_back := n_back + 1;
  end loop;

  return jsonb_build_object(
    'field_id',   p_field_id,
    'rehomed',    v_summary,
    'cells_back', n_back,
    'undo',       jsonb_build_object('options', v_was, 'cells_back', v_cells));
end;
$function$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, signed_in_callers, anonymous_callers, argument_rules)
select 'custom', 'field_choice_usage', iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes),
       'migrations/campaign/choicetails_a_removing_a_choice_cells_still_use_asks_where_they_go.sql (lane CHOICE-TAILS)',
       'How many records hold each choice of one choice column — the count a column editor says before a choice that cells still use is removed. It decides the organization''s off switch, the organization wall and the table before it reads anything, and counts only records the caller may see.',
       true, false,
       '{"version": 1, "arguments": {"p_organization_id": {"type": "uuid", "check": "this body decides it with custom.assert_client_may_reach(arg1) — the organization wall — a non-member is refused before anything is read.", "entity": "organization", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-27 lane CHOICE-TAILS — read from this body"}, "p_field_id": {"type": "uuid", "check": "DERIVED BY ORGANIZATION. It reaches no table predicate without `organization_id = p_organization_id` beside it, and its table is decided by custom.assert_may_know_table before any record is counted; a column of another organization is absent here exactly as an invented id is.", "foreign": {"not_a_leak": true, "same_as_invented": true}, "verified": "2026-09-27 lane CHOICE-TAILS — read from this body"}}, "declared_at": "2026-09-27 lane CHOICE-TAILS", "declared_by": "choicetails_a_removing_a_choice_cells_still_use_asks_where_they_go.sql"}'::jsonb
  from pg_proc p where p.oid = 'custom.field_choice_usage(uuid,uuid)'::regprocedure
on conflict (schema_name, function_name, identity_argtypes) do nothing;
grant execute on function custom.field_choice_usage(uuid, uuid) to authenticated;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, signed_in_callers, anonymous_callers, argument_rules)
select 'custom', 'field_update_rehoming_choices', iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes),
       'migrations/campaign/choicetails_a_removing_a_choice_cells_still_use_asks_where_they_go.sql (lane CHOICE-TAILS)',
       'A choice column''s choices saved and the cells of each removed choice moved to another choice, kept as other values or cleared, in one transaction: the column through custom.field_update (which decides the right to change the table''s columns), every cell through custom.record_update (which decides the row). Its undo goes back through this same door. It decides the organization''s off switch, the organization wall and the table before it reads anything.',
       true, false,
       '{"version": 1, "arguments": {"p_organization_id": {"type": "uuid", "check": "this body decides it with custom.assert_client_may_reach(arg1) — the organization wall — a non-member is refused before anything is read.", "entity": "organization", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-27 lane CHOICE-TAILS — read from this body"}, "p_field_id": {"type": "uuid", "check": "DERIVED BY ORGANIZATION. It reaches no table predicate without `organization_id = p_organization_id` beside it; its table is decided by custom.assert_may_know_table, the column by custom.field_update and every row by custom.record_update, which this body calls; a column of another organization is absent here exactly as an invented id is.", "foreign": {"not_a_leak": true, "same_as_invented": true}, "verified": "2026-09-27 lane CHOICE-TAILS — read from this body"}}, "declared_at": "2026-09-27 lane CHOICE-TAILS", "declared_by": "choicetails_a_removing_a_choice_cells_still_use_asks_where_they_go.sql"}'::jsonb
  from pg_proc p where p.oid = 'custom.field_update_rehoming_choices(uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure
on conflict (schema_name, function_name, identity_argtypes) do nothing;
grant execute on function custom.field_update_rehoming_choices(uuid, uuid, jsonb, jsonb, jsonb) to authenticated;
