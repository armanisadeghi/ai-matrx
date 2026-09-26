-- chair-step: lane LIST-COPY-PERMISSIVE, second file (found by the clone run of MOVER-DELETIONS' removal test on the first). REPLACES platform.cutover_older_removals(uuid,uuid[]): the settings card's five examples name what the older side REMOVED before any invented choice, so an organization with many invented choices (admin's Workspace holds six on production) does not crowd a real removal out of the sentence. No row of any table is written. No lock beyond one function definition.
-- based-on: platform.cutover_older_removals(uuid, uuid[]) cdd1a44dd740e26072a85c3e20555a007c850e4ef2875edc41061ba6cc170454
-- lane: LIST-COPY-PERMISSIVE
-- INVERSE: migrations/inverse/listcopypermissive_b_a_removal_is_named_before_an_invented_choice_down.sql

CREATE OR REPLACE FUNCTION platform.cutover_older_removals(p_org uuid, p_tables uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  with x as (select * from platform.cutover_older_removal_rows(p_org, p_tables))
  select jsonb_build_object(
    'count',   (select count(*) from x where kind <> 'share'),
    'clears',  (select count(*) from x where kind <> 'share'),
    'shares',  (select count(*) from x where kind = 'share'),
    'by_kind', coalesce((select jsonb_object_agg(k, n) from (select kind as k, count(*) as n from x group by kind) g), '{}'::jsonb),
    'examples', coalesce((select jsonb_agg(e.says) from (
        select format('%s: %s', coalesce(x.table_name, 'a table'),
                      case when x.kind like '%\_back' escape '\'
                           then x.what || ' is back on the older side and archived on the copy'
                           when x.kind in ('table', 'list') then x.what || ' is archived on the older side and live on the copy'
                           when x.kind = 'invented_choice' then x.what || ' was never on the older list and is on the copy; the value it came from is kept as an other value'
                           else x.what || ' was removed on the older side and is still on the copy' end) as says
          from x where x.kind <> 'share'
         -- LIST-COPY-PERMISSIVE (second file): what the older side REMOVED is named first; an
         -- organization with many invented choices must not crowd a real removal out of the five.
         order by (x.kind = 'invented_choice'), x.table_name, x.kind, x.what limit 5) e), '[]'::jsonb));
$function$;
