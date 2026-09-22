-- chair-step: the true inverse of
--   `migrations/campaign/definer7_seven_client_doors_decide_or_stop_being_doors.sql`.
--   Five function bodies go back byte-for-byte, the `authenticated` EXECUTE on
--   web.assert_crawl_artifact_file_reused is re-granted, its register row is restored to the
--   sentence it carried on 2026-09-22, and both grandfather rows go back to the reason and the
--   review date migration 0805 seeded on 2026-09-17.
-- based-on: public.fork_shared_quiz(uuid, text) 0ea6c54b9c22ef9b9871779bb55c85e85a6e0eeb0bda88642f91d2c244bd1310
-- based-on: public.fork_shared_flashcard_set(uuid, text) c0dce933069f2468b2647a611bdd91c84b6e2a16ab520f3cbf56c615aa99e47e
-- based-on: public.fork_shared_conversation(uuid, text) f2c644ed707f1ec6633674b5cb03b283142a6fba7765d6bb51aeb764978a8a94
-- based-on: platform.definer_access_decision_regex() 96b42ba33e67c6a70d874a03ec6b99895c25ea75ca3cd1480cf7d3d1650f92b3
-- based-on: public.dict_resolve(boolean, boolean, uuid[], uuid[], uuid[]) a1f6c75e3a83eb26fc8020c49ee263635acd049562401942342906196defadb0
-- lock: platform
-- lane: DEFINER-7

-- ── 1 · the three refusal stubs go back to SECURITY DEFINER ──────────────────────────────────
create or replace function public.fork_shared_quiz(p_quiz_id uuid, p_token text default null::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
BEGIN
  RETURN jsonb_build_object(
    'success', false,
    'error', 'Choose the organization your copy belongs to, then try again.',
    'code', 'organization_required');
END; $function$;

create or replace function public.fork_shared_flashcard_set(p_set_id uuid, p_token text default null::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
BEGIN
  RETURN jsonb_build_object(
    'success', false,
    'error', 'Choose the organization your copy belongs to, then try again.',
    'code', 'organization_required');
END; $function$;

create or replace function public.fork_shared_conversation(p_conversation_id uuid, p_token text default null::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
BEGIN
  RETURN jsonb_build_object(
    'success', false,
    'error', 'Choose the organization your copy belongs to, then try again.',
    'code', 'organization_required');
END; $function$;

-- ── 2 · the ONE list forgets hr._wf_instance_visible again ───────────────────────────────────
create or replace function platform.definer_access_decision_regex()
 returns text
 language sql
 immutable
 set search_path to ''
as $function$
  -- Every shape that decides "may this caller touch this row?" in this database. It is
  -- deliberately GENEROUS: a body that reaches any of these is left alone, because the
  -- question this guard answers is "does it decide ANYTHING", not "does it decide
  -- correctly" — the second question is what the generated door contract
  -- (db/generate_door_contract_test.py) executes, per argument.
  select '(has_access|has_org_access|has_org_admin|has_org_owner'
      || '|is_org_member|is_org_manager|is_org_owner|is_org_admin|is_member_of_organization'
      || '|is_platform_admin|is_super_admin|is_admin|auth_is_org_admin'
      || '|has_permission|access_level|accessible_entity_ids|discoverable_ids|is_discoverable'
      || '|assert_class_allows|assert_class_read|class_allows'
      || '|can_access_conversation|can_access_run|membership_row_visible|org_readable|my_orgs'
      || '|assoc_side_readable|assoc_members_visible|scraper_visible|client_role_can_read'
      || '|resolve_entity_ref|gsc_assert_[a-z_]+|_tm_map|_tm_site|_tm_topic|_tm_live_topic_id'
      || '|guardian_can_view|guardian_assert_access|dict_assert_access|kg_caller_can_target_scope'
      || '|user_owns_file|user_owns_folder|can_view_chat_conversation'
      || '|can_read_processed_document|can_read_extraction_job|can_curate_library_document'
      || '|user_can_read_data_store_via_grant|user_can_read_via_library_grant|rag_user_can_see_note'
      || '|_edu_access_mode|_edu_can_read_via_assignment|_library_assert_admin|get_resource_access'
      || '|is_trusted_backend|is_client_lane|_container_authz|_meet_actor'
      || '|assert_[a-z_]*(access|member|owner|admin|permission|may)[a-z_]*'
      -- 0830, AD246. Three decisions the list above could not read, each narrow on
      -- purpose. A bearer-token scope proof (the esign outsider doors); a read whose
      -- own predicate confines it to rows the platform publishes; and a body that
      -- compares a caller-supplied secret against a stored hash before answering.
      || '|assert_outsider_scope|visibility\s*=\s*''public''|extensions\s*\.\s*crypt'
      || '|auth\s*\.\s*uid|request\.jwt\.claims)'
$function$;

-- ── 3 · dict_resolve goes back to handing the arrays straight through ────────────────────────
create or replace function public.dict_resolve(
  p_include_user boolean default true,
  p_all boolean default false,
  p_organization_ids uuid[] default '{}'::uuid[],
  p_scope_type_ids uuid[] default '{}'::uuid[],
  p_scope_ids uuid[] default '{}'::uuid[])
 returns jsonb
 language sql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
    SELECT public.dict_resolve_for((select auth.uid()), p_include_user, p_all, p_organization_ids, p_scope_type_ids, p_scope_ids);
$function$;

-- ── 4 · the crawl artifact assertion is a signed-in door again ───────────────────────────────
insert into platform.provision_spec_grandfather (lane, object_ref, reason, owner, review_by, seeded_by)
values ('definer_no_access_decision',
        'web.assert_crawl_artifact_file_reused(p_file_id uuid, p_organization_id uuid, p_site_id uuid, p_mime_prefix text)',
        'Live when the lane shipped (0805, 2026-09-17). SECURITY DEFINER, EXECUTE-able by a client role, takes p_file_id, p_organization_id, p_site_id, and neither its body nor anything it calls reaches an access decision. It leaves this list by deciding — or by losing its client grant.',
        'table-provisioning campaign', date '2026-12-16', 'postgres')
on conflict do nothing;

update platform.client_callable_door
   set signed_in_callers = true,
       anonymous_callers = false,
       non_client_lane   = null,
       reason            = 'Reached from the SECURITY INVOKER trigger web.validate_snapshot_artifact_files, which fires on writes made by authenticated users.'
 where schema_name = 'web'
   and function_name = 'assert_crawl_artifact_file_reused';

grant execute on function web.assert_crawl_artifact_file_reused(uuid, uuid, uuid, text) to authenticated;

-- ── 5 · the guest counter's grandfather row goes back to the 0805 sentence ───────────────────
update platform.provision_spec_grandfather
   set reason = 'Live when the lane shipped (0805, 2026-09-17). SECURITY DEFINER, EXECUTE-able by a client role, takes p_resource_id, p_task_id, and neither its body nor anything it calls reaches an access decision. It leaves this list by deciding — or by losing its client grant.',
       review_by = date '2026-12-16'
 where lane = 'definer_no_access_decision'
   and object_ref = 'public.record_guest_execution(p_fingerprint text, p_resource_type text, p_resource_id uuid, p_resource_name text, p_task_id uuid, p_ip_address inet, p_user_agent text, p_referer text)';
