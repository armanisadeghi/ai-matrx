-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.effective_level(uuid, uuid, uuid, text) cc0c7bde5862c36d67726cdfa922d76389b84c91f26f781abf81983963c11e79
--
-- READ-PERF — THE LEVEL IS FOUND BY HALVING, NOT BY WALKING EVERY RUNG.
--
-- `custom.effective_level` is asked ONCE PER PAGE by `custom.read_records` — it is the level the
-- field question is asked at (DOOR-2) — and it finds it by walking the ladder from the top,
-- asking `custom.has_visibility` at every rung until one says yes. For somebody who holds
-- NOTHING that is four full misses, and a full miss is the most expensive answer the kernel
-- gives: measured on the main database for a plain member of an organization at `shared_only`,
-- **39.9 ms for the four**, on a page that returned no rows at all.
--
-- The function's own comment already states the property that makes the walk unnecessary: "by
-- the monotonicity of that function every rung below it is admitted too". A monotone predicate
-- over an ordered ladder is found by HALVING — two questions for four rungs, three for eight —
-- and the answer is identical rung for rung, which is what the READ-PERF green suite asserts
-- against the old walk for every (person, Table) pair on this database.
--
-- Nothing else changes: same ladder, same function, same order, same null for somebody who holds
-- nothing.

create or replace function custom.effective_level(p_user_id uuid, p_organization_id uuid, p_id uuid, p_type text default 'record'::text)
returns public.permission_level
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_levels public.permission_level[];
  v_lo     integer;
  v_hi     integer;
  v_mid    integer;
  v_best   integer := 0;
begin
  if p_user_id is null or p_id is null then return null; end if;

  -- The rungs, lowest first. `iam.content_levels()` is the one place that knows them and their
  -- order, so this reads them rather than spelling them out.
  select coalesce(array_agg(l.level order by l.ordinal), '{}'::public.permission_level[])
    into v_levels
    from iam.content_levels() l;
  if coalesce(array_length(v_levels, 1), 0) = 0 then return null; end if;

  -- HALVING. The one function is monotone in the level it is asked about — a yes at `editor` is
  -- a yes at `viewer` — so the highest rung it admits is found in log2(rungs) questions instead
  -- of one per rung. `v_best` is the highest index answered yes so far; 0 means none yet.
  v_lo := 1;
  v_hi := array_length(v_levels, 1);
  while v_lo <= v_hi loop
    v_mid := (v_lo + v_hi) / 2;
    if custom.has_visibility(p_user_id, p_type, p_id, v_levels[v_mid]) then
      v_best := v_mid;
      v_lo := v_mid + 1;
    else
      v_hi := v_mid - 1;
    end if;
  end loop;

  if v_best = 0 then return null; end if;
  return v_levels[v_best];
end;
$function$;
