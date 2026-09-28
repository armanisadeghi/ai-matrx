-- LANE SCOPES-ROWS-COPIED — THE SCOPES SWITCH COUNTS EVERY ROW BY ID, measured RED then GREEN on the
-- dev clone (production's data; clone-20260928 holds Titanium exactly as E9 measured it).
--
-- THE USE CASE. Titanium files its work under 933 Tags; 843 of them have no Record in the store
-- because the context copy timed out on them (SCOPES-CUTOVER-PLAN E9). Castellano & Reyes, LLP keeps
-- its Matters, Clients and Practice Areas fully copied. The scopes switch must say Titanium is NOT
-- ready — by name — whoever asks, and must turn Castellano red the moment one of its rows loses its
-- store twin.
--
-- WHAT MAKES IT FAIL (RED before scopesrowscopied_the_scopes_switch_counts_every_row_by_id.sql):
--   T1  readiness('scopes_screens', Titanium) carries a check rows_copied that is NOT met, counts 843
--       scopes and 843 Tag scopes, and says "Titanium → Tags: 843 of 933 scopes have no record";
--       Titanium is not ready — while the seat-based parity check and follow_current still say met
--       (the blindness this check closes)
--   T2  Castellano & Reyes: rows_copied met; one of its store Records archived (planted, rolled back)
--       turns it unmet with exactly 1 scope named
--   T3  the count is the owner's: no client role may call it, and every door that reads readiness
--       (cutover_seams, cutover_seam_press, cutover_seam_press_everyone) runs as the owner
--   T4  the final switch's readiness classes Titanium's rows_copied as Step 1's to clear
--       (needs_context_copy), never as something nobody can clear
--
-- Run (rolled back, nothing kept): the clone only.
do $t$
declare
  v_titanium uuid := 'f9cb3e35-2a65-4f2a-8525-088d6551071c';
  v_castellano uuid;
  r jsonb; c jsonb; v_rec uuid; v_fs jsonb;
begin
  -- T1
  r := platform._cutover_seam_readiness('scopes_screens', v_titanium);
  select x into c from jsonb_array_elements(r -> 'checks') x where x ->> 'key' = 'rows_copied';
  if c is null then
    raise exception 'T1 RED: readiness(scopes_screens, Titanium) has no rows_copied check; checks: %',
      (select string_agg((x ->> 'key') || '=' || (x ->> 'met'), ', ') from jsonb_array_elements(r -> 'checks') x);
  end if;
  if (c ->> 'met')::boolean then raise exception 'T1 RED: rows_copied met for Titanium: %', c; end if;
  if (c -> 'counts' ->> 'scopes')::int <> 843 or (c -> 'counts' ->> 'tag_scopes')::int <> 843 then
    raise exception 'T1 RED: expected 843 scopes / 843 Tag scopes missing, got %', c -> 'counts';
  end if;
  if position('Titanium → Tags: 843 of 933 scopes have no record' in c ->> 'detail') = 0 then
    raise exception 'T1 RED: the sentence does not name Titanium''s Tags: %', c ->> 'detail';
  end if;
  if (r ->> 'ready')::boolean then raise exception 'T1 RED: Titanium reads ready'; end if;
  raise notice 'T1 GREEN: %', c ->> 'detail';

  -- T2
  select o.id into v_castellano from iam.organizations o where o.name = 'Castellano & Reyes, LLP';
  r := platform._cutover_seam_readiness('scopes_screens', v_castellano);
  select x into c from jsonb_array_elements(r -> 'checks') x where x ->> 'key' = 'rows_copied';
  if not coalesce((c ->> 'met')::boolean, false) then raise exception 'T2 RED: Castellano not met before the plant: %', c; end if;
  select s.id into v_rec from context.scopes s join context.scope_types t on t.id = s.scope_type_id and t.deleted_at is null
   where s.organization_id = v_castellano and s.deleted_at is null order by s.name limit 1;
  perform set_config('app.actor_system', 'scopes-rows-copied-test', true);
  update custom.record set deleted_at = now() where organization_id = v_castellano and id = v_rec;
  r := platform._cutover_seam_readiness('scopes_screens', v_castellano);
  select x into c from jsonb_array_elements(r -> 'checks') x where x ->> 'key' = 'rows_copied';
  if (c ->> 'met')::boolean or (c -> 'counts' ->> 'scopes')::int <> 1 then
    raise exception 'T2 RED: the planted missing record did not turn Castellano red by exactly one scope: %', c;
  end if;
  raise notice 'T2 GREEN: %', c ->> 'detail';

  -- T3: the count is the owner's and never a client's door: a signed-in person cannot call it
  if has_function_privilege('authenticated', 'platform.cutover_scope_rows_copied(uuid)', 'execute')
     or has_function_privilege('anon', 'platform.cutover_scope_rows_copied(uuid)', 'execute') then
    raise exception 'T3 RED: a client role may call platform.cutover_scope_rows_copied';
  end if;
  -- every door a person reaches readiness through runs as the owner
  if exists (select 1 from pg_proc p where p.oid in ('platform.cutover_seams(uuid)'::regprocedure,
               'platform.cutover_seam_press(text,uuid,text,text,boolean)'::regprocedure,
               'platform.cutover_seam_press_everyone(text,text,text,boolean,uuid[],uuid)'::regprocedure)
             and not p.prosecdef) then
    raise exception 'T3 RED: a door that reads readiness runs as its caller, so a seat could hide rows';
  end if;
  raise notice 'T3 GREEN: closed to anon and authenticated; every door that reads it runs as the owner';

  -- T4: the final switch's readiness calls Titanium's missing rows Step 1's to clear
  v_fs := platform._final_switch_readiness();
  select x into c from jsonb_array_elements(v_fs -> 'organizations') x where (x ->> 'id')::uuid = v_titanium;
  if not exists (select 1 from jsonb_array_elements(c -> 'context_clears') y where y ->> 'key' = 'scopes_screens.rows_copied') then
    raise exception 'T4 RED: the final switch does not give Titanium''s rows_copied to Step 1: context_clears %, cannot_clear %',
      c -> 'context_clears', c -> 'cannot_clear';
  end if;
  if not (c ->> 'needs_context_copy')::boolean then raise exception 'T4 RED: Titanium not named for the context copy'; end if;
  raise notice 'T4 GREEN: the final switch names Titanium for the context copy';
end
$t$;
select 'PASS' as result;
