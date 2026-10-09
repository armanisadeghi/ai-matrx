-- chair-step: REPLACES the body of custom._field_readers_within (installspeed2_b_readers_walk_names_first.sql) so the cheap "does this formula name a frontier column" question is asked BEFORE custom.field_inputs_of, in a CASE the planner cannot reorder. Signature, volatility, SECURITY DEFINER, search_path, grants and the declared door unchanged. Same answers, only faster.
-- lane: INSTALL-SPEED-2
-- based-on: custom._field_readers_within(uuid, uuid) e064791354de47c58137ea636e65b03397640b297b3a7d6da52976c9ff4ebd20
-- lock: custom

set local statement_timeout = '60s';

CREATE OR REPLACE FUNCTION custom._field_readers_within(p_organization_id uuid, p_field_id uuid)
 RETURNS uuid[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_seen  uuid[] := array[p_field_id];
  v_front uuid[] := array[p_field_id];
  v_out   uuid[] := '{}'::uuid[];
  v_depth integer := 0;
begin
  -- INSTALL-SPEED-2: THE READERS OF ONE COLUMN, asked once. `custom.field_input_closure(f)` walks
  -- forward from every formula f to see whether it reaches this column. This walks BACKWARD from
  -- the column over the same edges — X reads Y when Y is in `custom.field_inputs_of(X.data)`, for
  -- every worked-out column of the organization — breadth first, to the same twelve levels. f
  -- reaches the column within twelve steps along a path that never repeats a column (the
  -- closure's own rule) exactly when its shortest such path is at most twelve steps, and a
  -- shortest path never repeats a column; so the answer is the same set of ids.
  --
  -- WHO IS ASKED: custom.field_inputs_of finds an input by the id a formula names, by the key it
  -- names, by its `via` key or by its `pick`/`of` key — every one of them is written in the
  -- formula's own definition. So a formula whose definition holds neither a frontier column's id
  -- (any case) nor its key as a JSON string cannot read it, and is never asked; every formula
  -- that may is asked the exact question.
  while v_depth < 12 and cardinality(v_front) > 0 loop
    v_depth := v_depth + 1;
    select coalesce(array_agg(distinct x.id), '{}'::uuid[]) into v_front
      from custom.record x
     where x.organization_id = p_organization_id
       and x.table_id = custom.field_kernel_id()
       and x.data ->> 'type' = 'formula'
       and coalesce(x.data -> 'config', '{}'::jsonb) ?| array['expr', 'pick', 'agg']
       and not (x.id = any (v_seen))
       -- A CASE, so the cheap question is asked first: the planner orders plain AND-ed
       -- sub-selects by its own cost guess and asked custom.field_inputs_of of every formula.
       and case when exists (select 1
                               from custom.record y
                              where y.organization_id = p_organization_id
                                and y.id = any (v_front)
                                and (strpos(lower(x.data::text), y.id::text) > 0
                                     or strpos(x.data::text, to_jsonb(y.data ->> 'key')::text) > 0))
                then exists (select 1
                               from custom.field_inputs_of(p_organization_id, x.data) i
                              where i.input_id = any (v_front))
                else false end;
    v_seen := v_seen || v_front;
    v_out  := v_out || v_front;
  end loop;
  return v_out;
end
$function$
;
