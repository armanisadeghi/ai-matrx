-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.level_floor() 835ec6de277b623c8923dc2a1fdf9e9fe1a34064d15a6923e2f6761a44c1e6c5
--
-- LADDER-CAP — AND THE FLOOR ITSELF PLANS ONCE.
--
-- CAUGHT BY LADDER-PERF'S OWN GUARD, on this lane's own function, in the run after it landed:
--
--     [FAIL] functions the one ladder reaches that re-plan their body on every call - 1:
--            custom.level_floor(sql) - LANGUAGE sql and not inlinable (SECURITY DEFINER + SET),
--            so PostgreSQL re-plans its body on every call - the plan cache of a non-inlined
--            SQL-language function lives for the calling query, not the session.
--
-- `custom.level_floor()` was added to make the cap cheap and was itself written in the one shape
-- LADDER-PERF spent a whole lane removing from this ladder: a SQL-language body that cannot be
-- inlined because it is SECURITY DEFINER and carries a SET clause. It is on the hottest path
-- there is — every arm of every question consults it — so it is exactly the function that must
-- not re-plan.
--
-- The body is identical, character for character, in plpgsql.

create or replace function custom.level_floor()
 returns permission_level
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
begin
  -- THE LOWEST CONTENT LEVEL. `iam.content_levels()` is the one place that knows the rungs and
  -- their order, so this reads them rather than spelling one out.
  return (select l.level from iam.content_levels() l order by l.ordinal limit 1);
end;
$function$;
