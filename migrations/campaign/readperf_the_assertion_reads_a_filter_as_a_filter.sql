-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.read_door_parity(uuid, uuid, uuid, permission_level, integer) fff031c2426ac5422d31e4a3cedf408c83ea57ace3f185b74d67bfe65ff286ef
--
-- READ-PERF — THE ASSERTION READS A FILTER AS A FILTER.
--
-- `custom.read_door_parity` reports what the doors' WHERE clause would admit, by evaluating the
-- same expression as a VALUE. The two are not the same in SQL: a record whose `created_by` is
-- NULL makes `created_by = p_user` come back NULL, and `NULL or false or false` is NULL. In a
-- WHERE that is a row not returned — which is the right answer, and is what every door does. As
-- a projected boolean it is neither true nor false, and the comparison `set_based = per_row`
-- came back NULL, so the assertion reported a disagreement where the door and the ladder in fact
-- agree.
--
-- Found by the assertion's own PART 3 on the main database: organization
-- 39c38960-d30c-4840-b0c1-c9960de95582, Table 11111111-0000-4000-8000-000000000003, four records
-- with no creator, at level `editor` — the ladder says no, every door says no, and the assertion
-- said they disagreed. The doors are unchanged because the doors were never wrong; this is the
-- one place the expression is asked for a VALUE, so this is the one place that has to say what
-- a WHERE says: absent is not admitted.

create or replace function custom.read_door_parity(p_organization_id uuid, p_table_id uuid, p_user uuid, p_required permission_level, p_sample integer)
 RETURNS TABLE(record_id uuid, set_based boolean, per_row boolean, verdict text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_set record;
begin
  v_set := custom.visible_set(p_user, p_organization_id, p_table_id, p_required);
  return query
  with answered as (
    select r.id,
           -- WHAT THE DOORS' WHERE ADMITS, and a WHERE admits neither false nor NULL. A record
           -- with no creator makes `created_by = p_user` NULL, so the whole disjunction is NULL,
           -- so `sb = pr` is NULL and this assertion reported a disagreement the doors do not
           -- have. `coalesce(..., false)` is what a filter means (READ-PERF).
           coalesce( v_set.o_fallback
             or v_set.o_all_visible
             or r.created_by = p_user
             or (r.visibility = any (v_set.o_true_visibility) and not (r.id = any (v_set.o_granted_all)))
             or r.id = any (v_set.o_granted_visible)
             or r.id = any (v_set.o_carried_visible), false) as sb,
           custom.has_visibility(p_user, 'record', r.id, p_required) as pr
      from (select rec.id, rec.created_by, rec.visibility
              from custom.record rec
             where rec.organization_id = p_organization_id
               and rec.table_id is not distinct from p_table_id
               and rec.deleted_at is null
             -- p_sample = 0 means EVERY row. Above that it is a random sample, which is what a
             -- Table with a hundred thousand rows needs: the ladder costs about a millisecond a
             -- row, so asking it about all of them is minutes. `random()` and not `id` order,
             -- because an ordered sample only ever proves the first page.
             order by case when coalesce(p_sample, 0) > 0 then random() else 0 end
             limit case when coalesce(p_sample, 0) > 0 then p_sample else null end) r
  )
  select a.id, a.sb, a.pr,
         case
           when a.sb = a.pr then 'same'
           when a.pr then 'HIDDEN BY THE SET — the one ladder says this person holds this record and the set-based shape left it out. Whatever admits them (a grant, a container, a class) is not in custom.visible_set''s arms.'
           else 'SHOWN BY THE SET — the one ladder says this person does NOT hold this record and the set-based shape let it through. A visibility class was answered by an unrepresentative row, or containment was resolved to a level the path does not carry.'
         end
    from answered a;
end;
$function$;
