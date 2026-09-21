-- READ-PERF, the inverse of the assertion fix: custom.read_door_parity projects the raw
-- three-valued expression again, so a record with no creator reads as a disagreement.
--
-- 🚨 WHICH ONE RUNS, AND IN WHAT ORDER (lane INVERSE-GUARD, 2026-09-21).
-- The body this file restores calls custom.visible_set, and the sibling
-- inverse `readperf_the_read_door_asks_visibility_once_down.sql` REMOVES
-- that function. They are not two independent undos: they are two halves of one lane's
-- teardown, and the pair has exactly one safe order.
--   · THIS FILE ALONE is what puts THIS file's defect back, and it is what the red twin beside
--     it runs. custom.visible_set is still there, so the body it restores still resolves.
--   · `readperf_the_read_door_asks_visibility_once_down.sql` is the DEEPER teardown — it takes
--     custom.visible_set itself away — so it may never run with this file's restore standing in
--     front of it. Run it on its own, against the lane's shipped bodies, never after this one.
-- Running the sibling FIRST and this one SECOND is the one order that leaves the access kernel
-- calling a function that is gone, and it is the order this note exists to forbid.
-- ground-standing-ok: b — the order above is stated, and neither half is run on top of the other.
--
create or replace function custom.read_door_parity(
  p_organization_id uuid,
  p_table_id        uuid,
  p_user            uuid,
  p_required        public.permission_level,
  p_sample          integer)
returns table(record_id uuid, set_based boolean, per_row boolean, verdict text)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_set record;
begin
  v_set := custom.visible_set(p_user, p_organization_id, p_table_id, p_required);
  return query
  with answered as (
    select r.id,
           ( v_set.o_fallback
             or v_set.o_all_visible
             or r.created_by = p_user
             or (r.visibility = any (v_set.o_true_visibility) and not (r.id = any (v_set.o_granted_all)))
             or r.id = any (v_set.o_granted_visible)
             or r.id = any (v_set.o_carried_visible) ) as sb,
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


