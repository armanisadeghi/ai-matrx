-- LANE ORDER-FIX — A VIEW'S ORDER IS ITS SORT OR ITS HAND-SET ORDER, NEVER BOTH.
--
-- THE USE CASE (_gridprim_clinic.sql): Cedar Ridge Veterinary Clinic's front desk, Marisol Vega
-- (test@test.com), keeps a "Check-in queue" view of the day's appointments. It started sorted by
-- patient name. She drags Tango, Juniper and Maple to the top: from then on the queue IS that
-- order, and the name sort is gone (Airtable's rule: a manual order is one of a view's sorts).
-- At lunch she sorts the queue by fee, highest first, to see the big visits: that replaces the
-- hand-set order. After lunch she drags Maple to the top again, and the order she kept before
-- lunch comes back behind Maple. Once she says "sort it again" (order "sorted") the view is sorted.
--
-- WHAT MAKES IT FAIL (VERIFIER-19 finding 2): a view that says manual and still carries the sort
-- it replaced (a reader that honours the sort draws A→Z over the dragged order); a sort chosen
-- later that leaves the view saying manual; an `order` word from a caller silently dropped; a
-- hand-ordered view laid out as the records-ui grid, whose tab draws the sort.
-- RED on the bodies before orderfix_a_hand_set_order_is_the_views_sort.sql, GREEN after.

\set ON_ERROR_STOP on
\timing off
\set suite 'orderfix_green.sql'
\set requires 'function:custom.view_record_order_set|function:custom.read_records_in_view_order'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '180s';
\i scripts/campaign-tests/_gridprim_clinic.sql

do $t$
declare
  c_dana_j constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org uuid; v_appts uuid; v_queue uuid;
  v_juniper uuid; v_tango uuid; v_maple uuid;
  v_res jsonb; v_def jsonb; v_names text[]; v_fail text[] := '{}';
begin
  select v into v_org from gp where k = 'org'; select v into v_appts from gp where k = 'appts';
  select v into v_juniper from gp where k = 'r2'; select v into v_tango from gp where k = 'r5';
  select v into v_maple from gp where k = 'r8';

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', c_dana_j, true);
  v_queue := custom.view_declare(v_org, v_appts, jsonb_build_object('name', 'Check-in queue',
               'definition', jsonb_build_object('layout', 'sheet',
                 'sorts', jsonb_build_array(jsonb_build_object('field', 'patient', 'direction', 'asc')))));

  -- O1. She drags three patients to the top: the queue's sort is now her order, the name sort gone.
  v_res := custom.view_record_order_set(v_org, v_queue, array[v_tango, v_juniper, v_maple]);
  select definition into v_def from platform.saved_view where id = v_queue;
  if v_def ->> 'order' is distinct from 'manual' or v_def ? 'sorts' then
    v_fail := v_fail || format('O1: after the drag the view says order %s and still carries sorts %s', v_def ->> 'order', v_def -> 'sorts');
  end if;
  if v_res -> 'replaced_sorts' is distinct from '[{"field": "patient", "direction": "asc"}]'::jsonb then
    v_fail := v_fail || format('O1b: the answer does not name the sort it replaced: %s', v_res);
  end if;
  select array_agg(d.document ->> 'patient' order by d.ord) into v_names
    from (select x.*, row_number() over () as ord from custom.read_records_in_view_order(v_org, v_queue, false, 3, 0) x) d;
  if v_names is distinct from array['Tango (Fairweather)', 'Juniper (Okafor)', 'Maple (Ferreira)'] then
    v_fail := v_fail || format('O2: the queue reads %s', v_names);
  end if;

  -- O3. At lunch she sorts by fee: that replaces the hand-set order.
  perform custom.view_declare(v_org, v_appts, jsonb_build_object('view_id', v_queue,
            'definition', jsonb_build_object('sorts', jsonb_build_array(jsonb_build_object('field', 'visit_fee', 'direction', 'desc')))));
  select definition into v_def from platform.saved_view where id = v_queue;
  if v_def ->> 'order' is distinct from 'sorted' or v_def -> 'sorts' is distinct from '[{"field": "visit_fee", "direction": "desc"}]'::jsonb then
    v_fail := v_fail || format('O3: after choosing a sort the view says order %s, sorts %s', v_def ->> 'order', v_def -> 'sorts');
  end if;

  -- O4. After lunch she drags Maple to the top: her morning order comes back behind Maple.
  v_res := custom.view_record_order_set(v_org, v_queue, array[v_maple]);
  select definition into v_def from platform.saved_view where id = v_queue;
  select array_agg(d.document ->> 'patient' order by d.ord) into v_names
    from (select x.*, row_number() over () as ord from custom.read_records_in_view_order(v_org, v_queue, false, 3, 0) x) d;
  if v_def ->> 'order' is distinct from 'manual' or v_def ? 'sorts'
     or v_names is distinct from array['Maple (Ferreira)', 'Tango (Fairweather)', 'Juniper (Okafor)'] then
    v_fail := v_fail || format('O4: after the second drag: order %s, sorts %s, queue %s', v_def ->> 'order', v_def -> 'sorts', v_names);
  end if;

  -- O5. A rename, or a layout change, keeps the hand-set order.
  perform custom.view_declare(v_org, v_appts, jsonb_build_object('view_id', v_queue, 'name', 'Front desk queue'));
  select definition into v_def from platform.saved_view where id = v_queue;
  if v_def ->> 'order' is distinct from 'manual' then
    v_fail := v_fail || format('O5: a rename changed the order to %s', v_def ->> 'order');
  end if;

  -- O6. "Manual" is written only by placing rows: the word from a caller is refused by name.
  begin
    perform custom.view_declare(v_org, v_appts, jsonb_build_object('view_id', v_queue,
              'definition', jsonb_build_object('order', 'manual')));
    v_fail := v_fail || 'O6: order "manual" from a caller was accepted (or silently dropped)'::text;
  exception when invalid_parameter_value then
    if sqlerrm not like '%placing its rows%' then v_fail := v_fail || format('O6: refused, but not by name: %s', sqlerrm); end if;
  end;

  -- O7. She says "sort it again": order "sorted" turns the hand-set order off.
  perform custom.view_declare(v_org, v_appts, jsonb_build_object('view_id', v_queue,
            'definition', jsonb_build_object('order', 'sorted')));
  select definition into v_def from platform.saved_view where id = v_queue;
  if v_def ->> 'order' is distinct from 'sorted' then
    v_fail := v_fail || format('O7: order "sorted" left the view saying %s', v_def ->> 'order');
  end if;
  begin
    perform custom.read_records_in_view_order(v_org, v_queue);
    v_fail := v_fail || 'O7b: a sorted view was still read as hand-ordered'::text;
  exception when invalid_parameter_value then null;
  end;

  -- O8. No hand-ordered view anywhere is laid out as the grid (its tab would draw the sort).
  perform set_config('role', 'postgres', true);
  if exists (select 1 from platform.saved_view where surface_key = 'custom/records' and deleted_at is null
              and definition ->> 'order' = 'manual' and definition ->> 'layout' = 'grid') then
    v_fail := v_fail || format('O8: %s hand-ordered view(s) are laid out as the grid',
      (select count(*) from platform.saved_view where surface_key = 'custom/records' and deleted_at is null
          and definition ->> 'order' = 'manual' and definition ->> 'layout' = 'grid'));
  end if;
  if exists (select 1 from platform.saved_view where surface_key = 'custom/records' and deleted_at is null
              and definition ->> 'order' = 'manual' and jsonb_array_length(coalesce(definition -> 'sorts', '[]'::jsonb)) > 0) then
    v_fail := v_fail || 'O9: a view says manual and still carries a sort'::text;
  end if;

  if cardinality(v_fail) > 0 then
    raise exception 'ORDER-FIX RED — %', array_to_string(v_fail, ' | ');
  end if;
  raise notice 'ORDER-FIX GREEN — the drag is the sort, a chosen sort replaces it, the word is refused by name, no hand-ordered grid tab.';
end $t$;
rollback;
