-- A relationship rule saved from the admin Rules page no longer fails with "DELETE requires a WHERE clause".
-- Found 2026-09-26 (RC-B11, registering conversation→note by clicks): admin_upsert_relationship_rule's
-- reachability rebuild runs `DELETE FROM platform.reachability;` and pg_safeupdate (loaded for PostgREST
-- sessions) refuses an unqualified DELETE with 21000, so every rule save through the product failed.
-- based-on: platform.rebuild_reachability() 9a87d988dd2286f26b6bd79c0676aa97fd7d259f8aca759dc05f29e0c34e5afc

set local lock_timeout = '2s';

CREATE OR REPLACE FUNCTION platform.rebuild_reachability()
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_count bigint;
BEGIN
  -- Serialises rebuilds against each other and nothing else. Held to transaction end.
  PERFORM pg_advisory_xact_lock(hashtextextended('platform.reachability:rebuild', 0));
  -- DELETE, not TRUNCATE: ROW EXCLUSIVE instead of ACCESS EXCLUSIVE. See the header —
  -- a TRUNCATE here closed the platform's hottest read table for 77 s on 2026-09-15.
  -- WHERE true: under PostgREST, pg_safeupdate refuses a DELETE with no WHERE (21000), which made
  -- every relationship-rule save from the admin page fail (2026-09-26). Same rows, same lock.
  DELETE FROM platform.reachability WHERE true;
  INSERT INTO platform.reachability (container_type, container_id, item_type, item_id, depth, max_level)
WITH RECURSIVE edges AS MATERIALIZED (SELECT * FROM platform.containment_edges), walk AS (
 SELECT e.container_type,e.container_id,e.item_type,e.item_id,1 AS depth,e.conveys_max AS max_level,
 ARRAY[e.container_type || ':' || e.container_id::text,e.item_type || ':' || e.item_id::text] AS path FROM edges e
 UNION ALL
 SELECT w.container_type,w.container_id,e.item_type,e.item_id,w.depth+1,LEAST(w.max_level,e.conveys_max),w.path || (e.item_type || ':' || e.item_id::text)
 FROM walk w JOIN edges e ON e.container_type=w.item_type AND e.container_id=w.item_id
 WHERE w.depth<8 AND NOT (e.item_type || ':' || e.item_id::text)=ANY(w.path)
) SELECT container_type,container_id,item_type,item_id,MIN(depth) AS depth,MAX(max_level) AS max_level FROM walk GROUP BY container_type,container_id,item_type,item_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $function$
;
