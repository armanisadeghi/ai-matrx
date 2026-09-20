-- INVERSE of migrations/campaign/laddercap_the_floor_plans_once.sql
--
-- Puts custom.level_floor() back into the LANGUAGE sql shape that cannot be inlined, so
-- check:store-doors-decide census 14 names it again. Same answer, re-planned on every call.

create or replace function custom.level_floor()
 returns permission_level
 language sql
 stable security definer
 set search_path to ''
as $function$
  select l.level from iam.content_levels() l order by l.ordinal limit 1;
$function$;
