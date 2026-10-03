-- target: branch,production
-- additive: yes
--   REPLACES one body — `custom._view_field_key(uuid, uuid, text, text, jsonb, text[])` (byte for
--   byte as lane 10 VK left it, plus the test of a date setting accepting a Field whose VALUE is a
--   date: a formula whose answer is a date, and a lookup of one date). No table, trigger, policy,
--   index, grant or stored row changes. Inverse:
--   migrations/inverse/fdt_a_calendar_and_a_timeline_are_placed_by_a_worked_out_date_down.sql.
-- guard: custom/system_enabled
-- lock: custom
-- lane: VIEWS-AND-FIELDS (lane 10, sublane FDT)
-- based-on: custom._view_field_key(uuid, uuid, text, text, jsonb, text[]) 4b6dff2ff8cb0ae9aa6bb203f9bb01349044a40357f9dddd6fb90ddf406e6553
--
-- LANE 10 FDT. A CALENDAR AND A TIMELINE ARE PLACED BY A WORKED-OUT DATE.
--
-- THE USE CASE: a physical-therapy clinic keeps "Follow-up due = DATEADD({Visit date}, 14, 'days')"
-- and wants the calendar of follow-ups. Airtable places a calendar or a timeline by a formula or a
-- lookup that returns a date. The store refused it: "A calendar places a record by a date, and
-- Follow-up due does not hold one."
--
-- WHAT A DATE SETTING (`date_field`, `start_field`, `end_field`, shape field:date) NOW TAKES:
--   a stored date column                              as before
--   a formula whose answer is a date                  typed by custom._fxp_type over config.expr,
--                                                     the rule formula_parse's result_type uses
--   a lookup of ONE value of a date column            its via relation's target, its picked column a
--                                                     stored date or a date formula
-- Still refused, with the same sentences: everything else — a number formula, a text formula, a
-- many-valued lookup, and every rollup (custom.rollup_value adds up numbers only, so a rollup of
-- dates is always empty and a calendar on it would show nothing).
--
-- LOCKS. create or replace function x1. Not window-class.

set local lock_timeout = '2s';
set local statement_timeout = '60s';

CREATE OR REPLACE FUNCTION custom._view_field_key(p_organization_id uuid, p_table_id uuid, p_path text, p_shape text, p_ref jsonb, p_known text[])
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_ref   text;
  v_doc   jsonb;
  v_dead  boolean;
  v_type  text;
  v_par   text;
  v_kind  text;
  v_label text;
  v_held  boolean;
  v_cfg   jsonb;
  v_far   jsonb;
  v_ftab  text;
  v_flds  jsonb;
begin
  if p_ref is null or jsonb_typeof(p_ref) <> 'string' or btrim(p_ref #>> '{}') = '' then
    raise exception '% names a Field, and nothing was named.', p_path
      using errcode = '22023', hint = 'Name the Field by its key or its id. Nothing was written.';
  end if;
  v_ref := p_ref #>> '{}';

  select f.data, f.deleted_at is not null into v_doc, v_dead
    from custom.record f
   where f.organization_id = p_organization_id and f.data_class = 'field'
     and f.data ->> 'entity_definition_id' = p_table_id::text
     and (f.id::text = v_ref or f.data ->> 'key' = v_ref)
   order by (f.deleted_at is null) desc, f.updated_at desc
   limit 1;

  if v_doc is not null and v_ref = any (p_known) then
    return v_doc ->> 'key';
  end if;
  if v_doc is null and v_ref = any (p_known) then
    -- A word the view already held that is no Field of this Table now (a column since removed
    -- for good). Kept as it was; the screens skip a Field they cannot find.
    return v_ref;
  end if;
  if v_doc is null then
    raise exception '% names "%", which is not a field of this table.', p_path, v_ref
      using errcode = '22023', hint = 'A view names the fields of its own table, by key or id. Nothing was written.';
  end if;
  v_label := coalesce(nullif(v_doc ->> 'label', ''), v_doc ->> 'key');
  if v_dead and p_path <> 'presentation.hiddenFields' then
    -- (Hiding a column that is archived anyway harms nobody, so that one list takes it.)
    raise exception '% names %, which has been archived.', p_path, v_label
      using errcode = '22023', hint = 'An archived field is not shown to anyone, so a view cannot be built on it. Restore it first, or pick another. Nothing was written.';
  end if;

  v_type := v_doc ->> 'type';
  v_par  := coalesce(v_doc ->> 'parity_type', '');
  v_kind := coalesce(v_doc -> 'config' ->> 'kind', '');

  -- LANE 10 FDT: A DATE SETTING TAKES A FIELD WHOSE VALUE IS A DATE, stored or worked out (Airtable
  -- places a calendar or a timeline by a formula or a lookup that returns a date). A stored date
  -- column, as before; a formula whose answer is a date, typed by `custom._fxp_type` — the one rule
  -- the formula editor's "gives a date" uses; a lookup of ONE value whose picked column on the far
  -- table is a stored date or a date formula. A rollup is never one: `custom.rollup_value` adds up
  -- numbers only, so a rollup of dates is always empty and a calendar on it would show nothing.
  -- Everything else is refused with the same sentences as before.
  if p_shape = 'field:date' then
    v_held := v_type = 'range' and (v_kind in ('date', 'datetime') or v_par in ('date', 'datetime'));
    v_cfg := coalesce(v_doc -> 'config', '{}'::jsonb);
    if not v_held and v_type = 'formula' and not (v_cfg ? 'via') and jsonb_typeof(v_cfg -> 'expr') = 'object' then
      select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'key', f.data ->> 'key', 'label', f.data ->> 'label',
                                                   'type', f.data ->> 'type', 'config', f.data -> 'config')), '[]'::jsonb)
        into v_flds
        from custom.record f
       where f.organization_id = p_organization_id and f.table_id = custom.field_kernel_id()
         and f.data_class = 'field' and f.deleted_at is null
         and f.data ->> 'entity_definition_id' = p_table_id::text;
      v_held := custom._fxp_type(v_cfg -> 'expr', v_flds) = 'date';
    elsif not v_held and v_type = 'formula' and v_cfg ? 'via' and not (v_cfg ? 'agg')
          and not coalesce((v_doc ->> 'multi')::boolean, false) then
      select f.data ->> 'relation_target' into v_ftab
        from custom.record f
       where f.organization_id = p_organization_id and f.table_id = custom.field_kernel_id()
         and f.data_class = 'field' and f.deleted_at is null
         and f.data ->> 'entity_definition_id' = p_table_id::text
         and f.data ->> 'key' = v_cfg ->> 'via'
       limit 1;
      if v_ftab is not null then
        select f.data into v_far
          from custom.record f
         where f.organization_id = p_organization_id and f.table_id = custom.field_kernel_id()
           and f.data_class = 'field' and f.deleted_at is null
           and f.data ->> 'entity_definition_id' = v_ftab
           and f.data ->> 'key' = v_cfg ->> 'pick'
         limit 1;
      end if;
      if v_far ->> 'type' = 'range' then
        v_held := coalesce(v_far -> 'config' ->> 'kind', '') in ('date', 'datetime')
               or coalesce(v_far ->> 'parity_type', '') in ('date', 'datetime');
      elsif v_far ->> 'type' = 'formula' and not (v_far -> 'config' ? 'via')
            and jsonb_typeof(v_far -> 'config' -> 'expr') = 'object' then
        select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'key', f.data ->> 'key', 'label', f.data ->> 'label',
                                                     'type', f.data ->> 'type', 'config', f.data -> 'config')), '[]'::jsonb)
          into v_flds
          from custom.record f
         where f.organization_id = p_organization_id and f.table_id = custom.field_kernel_id()
           and f.data_class = 'field' and f.deleted_at is null
           and f.data ->> 'entity_definition_id' = v_ftab;
        v_held := custom._fxp_type(v_far -> 'config' -> 'expr', v_flds) = 'date';
      end if;
    end if;
    v_held := coalesce(v_held, false);
  end if;
  if p_shape = 'field:number'
     and not (v_type = 'formula'
              or (v_type = 'range' and v_kind not in ('date', 'datetime', 'time')
                  and v_par not in ('date', 'datetime', 'time'))) then
    raise exception 'The board sums a number, a money or a percentage field under each column, and % holds none of those.', v_label
      using errcode = '22023', hint = 'Pick a number field to total. Nothing was written.';
  elsif p_shape = 'field:date' and not v_held then
    -- LANE 10 VK: the same date test for every date setting; the sentence names the setting.
    if p_path = 'end_field' then
      raise exception 'A record''s end is a date, and % does not hold one.', v_label
        using errcode = '22023', hint = 'Pick a date field for where it ends. Nothing was written.';
    elsif p_path = 'start_field' then
      raise exception 'A timeline places a record by a date, and % does not hold one.', v_label
        using errcode = '22023', hint = 'Pick a date field for where it starts. Nothing was written.';
    end if;
    raise exception 'A calendar places a record by a date, and % does not hold one.', v_label
      using errcode = '22023', hint = 'Pick a date field. Nothing was written.';
  elsif p_shape = 'field:color' and v_type not in ('list', 'boolean') then
    raise exception 'Colour by gives one colour to each value of a choice, and % is not a choice.', v_label
      using errcode = '22023', hint = 'Pick a choice or a yes/no field to colour by. Nothing was written.';
  elsif p_shape = 'field:lane' and v_type not in ('list', 'relation', 'boolean', 'text') then
    raise exception 'A swimlane is one row for each value of a choice, a person, a link or a word, and % holds a %.', v_label, v_type
      using errcode = '22023', hint = 'Pick a choice, a person or a link field. Nothing was written.';
  end if;
  return v_doc ->> 'key';
end;
$function$;
