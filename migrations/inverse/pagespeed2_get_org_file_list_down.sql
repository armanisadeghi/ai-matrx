-- chair-step: restores public.get_org_file_list's body byte for byte as the catalogue held it before PAGE-SPEED-2 (is_discoverable_for asked once per file). No data touched.
-- inverse of campaign/pagespeed2_get_org_file_list_skips_what_it_would_refuse.sql

CREATE OR REPLACE FUNCTION public.get_org_file_list(p_user_id uuid, p_org_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
declare v_result jsonb;
begin
  if ( SELECT auth.uid()) is not null and ( SELECT auth.uid()) <> p_user_id then
    raise exception 'forbidden: p_user_id does not match ( SELECT auth.uid())' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) into v_result
  from (
    select f.id, f.file_name, f.mime_type, f.size_bytes, f.updated_at
    from files.files f
    where f.organization_id = p_org_id
      and f.deleted_at is null
      and files.is_discoverable_for(p_user_id, f.id, 'viewer')
    order by f.updated_at desc nulls last
  ) t;
  return v_result;
end;
$function$
;
