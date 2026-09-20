-- READ-PERF, the inverse of the halving: custom.effective_level walks every rung again.
CREATE OR REPLACE FUNCTION custom.effective_level(p_user_id uuid, p_organization_id uuid, p_id uuid, p_type text DEFAULT 'record'::text)
 RETURNS permission_level
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_level public.permission_level;
begin
  if p_user_id is null or p_id is null then return null; end if;
  for v_level in
    select l.level from iam.content_levels() l order by l.ordinal desc
  loop
    if custom.has_visibility(p_user_id, p_type, p_id, v_level) then
      return v_level;
    end if;
  end loop;
  return null;
end;
$function$;
