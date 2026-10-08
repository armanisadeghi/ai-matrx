-- chair-step: undo perffix6_a_the_rung_asks_the_top_first.sql - restores custom.effective_level_many as it was
-- lane: PERF-FIX-6

set local statement_timeout = '60s';

CREATE OR REPLACE FUNCTION custom.effective_level_many(p_user_id uuid, p_ids uuid[], p_type text DEFAULT 'record'::text)
 RETURNS TABLE(id uuid, level permission_level)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
-- PERF-FIX-2 (2026-10-07). THE SET FORM OF custom.effective_level: one row per distinct non-null id,
-- `level` exactly what custom.effective_level(p_user_id, <any organization>, id, p_type) answers (that
-- function never reads its organization argument). The same halving over iam.content_levels(), and at
-- every step the same three questions effective_level's own check asks, in its order: the copy in
-- progress hides it (asked once per id: it does not depend on the rung), custom.reaches_directly (asked
-- through custom.reaches_directly_many for every id standing at the same rung in the same round), and
-- at viewer a Table that something inside opens (custom.table_has_a_visible_record). Each id walks its
-- own halving; the ids only share the asking. An id more than one row carries is answered by
-- custom.effective_level itself.
declare
  v_levels public.permission_level[];
  v_nl     integer;
  v_id     uuid[];  v_org uuid[];  v_tbl uuid[];  v_solo boolean[];  v_hide boolean[];
  v_lo     integer[];  v_hi integer[];  v_best integer[];
  v_kernel uuid := custom.table_kernel_id();
  v_m      integer;
  v_ix     integer[];
  v_ask    uuid[];
  v_ans    jsonb;
  v_yes    boolean;
  i        integer;
begin
  if p_ids is null or cardinality(p_ids) = 0 then
    return;
  end if;
  select coalesce(array_agg(l.level order by l.ordinal), '{}'::public.permission_level[])
    into v_levels
    from iam.content_levels() l;
  v_nl := coalesce(array_length(v_levels, 1), 0);
  if p_user_id is null or v_nl = 0 then
    return query select distinct u.x, null::public.permission_level from unnest(p_ids) u(x) where u.x is not null;
    return;
  end if;

  select coalesce(array_agg(q.id order by q.id), '{}'), coalesce(array_agg(q.org order by q.id), '{}'),
         coalesce(array_agg(q.tbl order by q.id), '{}'), coalesce(array_agg(q.n > 1 order by q.id), '{}')
    into v_id, v_org, v_tbl, v_solo
    from (select u.id, count(w.id) as n, (array_agg(w.organization_id))[1] as org, (array_agg(w.table_id))[1] as tbl
            from (select distinct x as id from unnest(p_ids) x where x is not null) u
            left join custom.record w on p_type = 'record' and w.id = u.id
           group by u.id) q;

  v_hide := array_fill(false, array[cardinality(v_id)]);
  v_lo   := array_fill(1, array[cardinality(v_id)]);
  v_hi   := array_fill(v_nl, array[cardinality(v_id)]);
  v_best := array_fill(0, array[cardinality(v_id)]);
  for i in 1 .. cardinality(v_id) loop
    if v_solo[i] then
      continue;
    end if;
    if p_type = 'record' then
      v_hide[i] := custom._copy_in_progress_hides(p_user_id, v_id[i]);
    end if;
  end loop;

  loop
    select min((v_lo[k] + v_hi[k]) / 2) into v_m
      from generate_subscripts(v_id, 1) k
     where not v_solo[k] and v_lo[k] <= v_hi[k];
    exit when v_m is null;
    v_ix := array(select k from generate_subscripts(v_id, 1) k
                   where not v_solo[k] and v_lo[k] <= v_hi[k] and (v_lo[k] + v_hi[k]) / 2 = v_m order by k);
    v_ask := array(select v_id[k] from unnest(v_ix) k where not v_hide[k]);
    select coalesce(jsonb_object_agg(m.target::text, m.reaches), '{}'::jsonb) into v_ans
      from custom.reaches_directly_many(p_user_id, v_ask, p_type, v_levels[v_m]) m;
    foreach i in array v_ix loop
      if v_hide[i] then
        v_yes := false;
      else
        v_yes := coalesce((v_ans ->> v_id[i]::text)::boolean, false);
        if not v_yes and p_type = 'record' and v_levels[v_m] <= 'viewer'::public.permission_level
           and v_tbl[i] = v_kernel
           and custom.table_has_a_visible_record(p_user_id, v_org[i], v_id[i]) then
          v_yes := true;
        end if;
      end if;
      if v_yes then
        v_best[i] := v_m;
        v_lo[i] := v_m + 1;
      else
        v_hi[i] := v_m - 1;
      end if;
    end loop;
  end loop;

  return query
    select v_id[k],
           case when v_solo[k] then custom.effective_level(p_user_id, v_org[k], v_id[k], p_type)
                when v_best[k] = 0 then null::public.permission_level
                else v_levels[v_best[k]] end
      from generate_subscripts(v_id, 1) k;
end;
$function$

;
