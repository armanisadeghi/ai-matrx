-- dd169_closed_helpers_reached_by_client_paths.sql
--
-- DD-169 batch 3 CLOSED internal helpers (client EXECUTE revoked) after a census that
-- looked for client call sites, RLS policies and security_invoker paths, but never read
-- the BODIES of SECURITY INVOKER functions a client reaches. A plain call inside an
-- invoker body is checked against the CALLER's EXECUTE privilege, so each closed helper
-- below turned a working user path into `42501 permission denied for function <helper>`.
--
-- Proven live 2026-09-14 as admin@admin.com (`authenticated`, auth.uid() confirmed) in a
-- rolled-back transaction, before this file:
--   update seo.site_geo_area ...           -> 42501 permission denied for function fn_geo_area_sync_meaning
--   public.cx_soft_delete_conversation     -> 42501 permission denied for function spine_soft_delete_conversation_requests
--   public.seo_rank_target_list_scoped x4  -> 42501 permission denied for function has_access_for  (every scope)
--   public.get_agent_usage_stats           -> 42501 permission denied for function agent_usage_totals
--
-- The helpers STAY closed where DD-169 was right to close them. Each path is repaired in
-- the shape that opens no new client surface:
--   1. The geo-area trigger function runs as its owner. A trigger function cannot be
--      called over PostgREST, and EXECUTE on it is never checked when it fires, so the
--      internal helper keeps zero client grants.
--   2. The rank list calls the auth.uid()-bound doors (iam.has_access, public.has_permission)
--      instead of the user-id-taking internals. v_uid is auth.uid() in that body, so the
--      answers are identical. Patched from the LIVE definition, never retyped from a file.
--   3. The spine soft-delete helper gets back the door its restore twin
--      (runtime.spine_restore_conversation_requests) already declares it "mirrors".
--   4. get_agent_usage_stats has no caller in any of the four repos and answers 42501 to
--      every client today: its client EXECUTE is closed, as DD-169 closes every function
--      no client calls. service_role keeps it.
--
-- Guard: scripts/check-impl-doors.ts D18 (a closed helper reached by a client path).
--
-- based-on: seo.site_geo_area_sync_meaning_tg() 8bfc5c2925e7630e97711f4a76142e8fa628bb6674a2f4233d060b02cdc27c96
-- based-on: public.seo_rank_target_list_scoped(text, uuid, text, text, text, jsonb, integer, integer) 1740519609a68eedc65dd451db12c8f5a1d742fd3fd10a03176ef011ec4bdd0d

-- 1. Geo area: the trigger runs as owner; seo.fn_geo_area_sync_meaning stays closed.
create or replace function seo.site_geo_area_sync_meaning_tg()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public'
as $function$
BEGIN
  PERFORM seo.fn_geo_area_sync_meaning(NEW.id);
  RETURN NULL;
END $function$;

revoke execute on function seo.site_geo_area_sync_meaning_tg() from public, anon, authenticated;

-- 2. Rank list: patch the live body to call the auth.uid()-bound doors.
do $patch$
declare
  v_def text := pg_get_functiondef('public.seo_rank_target_list_scoped(text,uuid,text,text,text,jsonb,integer,integer)'::regprocedure);
  v_new text;
  v_access int;
  v_perm int;
begin
  select count(*) into v_access from regexp_matches(v_def, 'iam\.has_access_for\(\s*v_uid,\s*', 'g');
  select count(*) into v_perm from regexp_matches(v_def, 'public\.has_permission_for\(\s*v_uid,\s*', 'g');
  if v_access <> 1 or v_perm <> 4 then
    raise exception 'dd169 reach fix: public.seo_rank_target_list_scoped no longer has the shape this patch was written against (expected 1 iam.has_access_for(v_uid, …) and 4 public.has_permission_for(v_uid, …); found % and %). Re-read the live body and rewrite this step.', v_access, v_perm;
  end if;
  v_new := regexp_replace(v_def, 'iam\.has_access_for\(\s*v_uid,\s*', 'iam.has_access(', 'g');
  v_new := regexp_replace(v_new, 'public\.has_permission_for\(\s*v_uid,\s*', 'public.has_permission(', 'g');
  if v_new ~ '(has_access_for|has_permission_for)\s*\(' then
    raise exception 'dd169 reach fix: a user-id-taking access call survived the patch of public.seo_rank_target_list_scoped';
  end if;
  execute v_new;
end
$patch$;

-- 3. Conversation delete: the spine helper's door, mirroring its restore twin.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   signed_in_callers, anonymous_callers)
select 'runtime', 'spine_soft_delete_conversation_requests', 'p_conversation_id uuid',
       platform.door_argtypes(p.proargtypes),
       'Soft-delete half of the conversation cascade; called by public.cx_soft_delete_conversation (SECURITY INVOKER), which RLS-gates the conversation first. Its body acts only on a conversation that is ALREADY soft-deleted, so it can only converge runtime requests to the state that delete intended. Mirrors the runtime.spine_restore_conversation_requests door. DD-169 batch 3 closed it while cx_soft_delete_conversation still called it, which made every conversation delete answer 42501 (proven live 2026-09-14).',
       'DD-169 reach fix (dd169_closed_helpers_reached_by_client_paths)',
       true, false
  from pg_proc p
 where p.oid = 'runtime.spine_soft_delete_conversation_requests(uuid)'::regprocedure
   and not exists (
     select 1 from platform.client_callable_door d
      where d.schema_name = 'runtime'
        and d.function_name = 'spine_soft_delete_conversation_requests'
        and d.identity_argtypes = platform.door_argtypes(p.proargtypes));

grant execute on function runtime.spine_soft_delete_conversation_requests(uuid) to authenticated;

-- 4. get_agent_usage_stats: no client caller anywhere; close it to clients.
revoke execute on function public.get_agent_usage_stats(uuid, integer) from public, anon, authenticated;

-- End state, asserted in the same transaction.
do $assert$
begin
  if not (select prosecdef from pg_proc where oid = 'seo.site_geo_area_sync_meaning_tg()'::regprocedure) then
    raise exception 'dd169 reach fix: seo.site_geo_area_sync_meaning_tg is not SECURITY DEFINER';
  end if;
  if has_function_privilege('authenticated', 'seo.fn_geo_area_sync_meaning(uuid)', 'EXECUTE') then
    raise exception 'dd169 reach fix: seo.fn_geo_area_sync_meaning must stay closed to clients';
  end if;
  if (select prosrc ~ '(has_access_for|has_permission_for)\s*\('
        from pg_proc where oid = 'public.seo_rank_target_list_scoped(text,uuid,text,text,text,jsonb,integer,integer)'::regprocedure) then
    raise exception 'dd169 reach fix: seo_rank_target_list_scoped still calls a closed access helper';
  end if;
  if not has_function_privilege('authenticated', 'runtime.spine_soft_delete_conversation_requests(uuid)', 'EXECUTE') then
    raise exception 'dd169 reach fix: authenticated cannot execute runtime.spine_soft_delete_conversation_requests (did the §6d-4 guard take the grant back?)';
  end if;
  if has_function_privilege('authenticated', 'public.get_agent_usage_stats(uuid,integer)', 'EXECUTE')
     or has_function_privilege('anon', 'public.get_agent_usage_stats(uuid,integer)', 'EXECUTE') then
    raise exception 'dd169 reach fix: public.get_agent_usage_stats is still client-executable';
  end if;
end
$assert$;
