-- chair-step: puts custom._field_readers_within back to the body installspeed2_a_write_path_asks_once.sql gave it (read from the catalogue with pg_get_functiondef).

CREATE OR REPLACE FUNCTION custom._field_readers_within(p_organization_id uuid, p_field_id uuid)
 RETURNS uuid[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  -- INSTALL-SPEED-2: THE READERS OF ONE COLUMN, asked once. `custom.field_input_closure(f)` walks
  -- forward from every formula f to see whether it reaches this column; that asked the whole
  -- organization's formulas the same question one at a time (~0.9 s per raised column at 33
  -- formulas). This walks BACKWARD from the column over the same edges — X reads Y when Y is in
  -- `custom.field_inputs_of(X.data)`, for every worked-out column of the organization — to the
  -- same twelve levels. f reaches the column within twelve steps along a path that never repeats
  -- a column (the closure's own rule) exactly when the shortest such path is at most twelve
  -- steps, and a shortest path never repeats a column; so the answer is the same set of ids.
  return (
    with recursive edge as materialized (
      select x.id as reader, i.input_id
        from custom.record x
        cross join lateral custom.field_inputs_of(x.organization_id, x.data) i
       where x.organization_id = p_organization_id
         and x.table_id = custom.field_kernel_id()
         and x.data ->> 'type' = 'formula'
         and coalesce(x.data -> 'config', '{}'::jsonb) ?| array['expr', 'pick', 'agg']),
    up(id, depth) as (
      select p_field_id, 0
      union
      select e.reader, u.depth + 1
        from up u
        join edge e on e.input_id = u.id
       where u.depth < 12)
    select coalesce(array_agg(distinct u.id), '{}'::uuid[]) from up u where u.depth >= 1);
end
$function$
;
