-- chair-step: INVERSE of migrations/campaign/listcopypermissive_b_a_removal_is_named_before_an_invented_choice.sql (lane LIST-COPY-PERMISSIVE). Puts back platform.cutover_older_removals as the first LIST-COPY-PERMISSIVE file left it (examples ordered by table name only).
-- based-on: platform.cutover_older_removals(uuid, uuid[]) b83ff0be44370518b32d026baccc2d43de684a89e7f2b8d7f83ebb838425520c
-- lane: LIST-COPY-PERMISSIVE

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
          from x where x.kind <> 'share' order by x.table_name, x.kind, x.what limit 5) e), '[]'::jsonb));
$function$
;
