-- chair-step: restores public.count_user_files to its pre-PAGE-SPEED-3 body (count_user_files asks files.is_listable_for per file again). No data touched.
-- inverse of campaign/pagespeed3_d_count_user_files_reads_the_shared_set_once.sql

set local lock_timeout = '2s';

CREATE OR REPLACE FUNCTION public.count_user_files(p_user_id uuid, p_include_folders boolean DEFAULT true, p_include_deleted boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
declare v_files int; v_folders int;
begin
  if ( SELECT auth.uid()) is not null and ( SELECT auth.uid()) <> p_user_id then
    raise exception 'forbidden: p_user_id does not match ( SELECT auth.uid())' using errcode = '42501';
  end if;
  select count(*) into v_files from files.files f
  where (p_include_deleted or f.deleted_at is null)
    and f.parent_file_id is null
    and f.file_path not like 'system-files/%'
    and files.is_listable_for(p_user_id, f.id);
  if p_include_folders then
    select count(*) into v_folders from files.folders d
    where (p_include_deleted or d.deleted_at is null) and d.created_by = p_user_id;
  else
    v_folders := 0;
  end if;
  return jsonb_build_object('files', v_files, 'folders', v_folders, 'total', v_files + v_folders);
end;
$function$;
