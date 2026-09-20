-- MIRROR-PERF, the inverse: `custom.visible_record_ids` put back to the per-row ladder body it
-- carried before this lane, taken from the live catalogue at 2026-09-20 09:0x UTC. Run it and
-- the RLS mirror walks the whole database one row at a time again (43 s for one member).

CREATE OR REPLACE FUNCTION custom.visible_record_ids(p_user_id uuid, p_required permission_level DEFAULT 'viewer'::permission_level)
 RETURNS TABLE(id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select r.id
    from custom.record r
   where p_user_id is not null
     and r.deleted_at is null
     and custom.has_visibility(p_user_id, 'record', r.id, p_required);
$function$;
