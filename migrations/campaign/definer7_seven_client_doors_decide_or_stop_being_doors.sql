-- chair-step: seven client-callable SECURITY DEFINER functions stop being doors that decide
--   nothing. NON-ADDITIVE BY CONSTRUCTION and therefore header-less on the additive allow-list:
--   five function bodies are REPLACED, one stray EXECUTE is taken back, one register row is
--   UPDATEd and one grandfather row is DELETEd. Nothing is created, nothing is dropped, no
--   table, policy or trigger is touched, and no row of anybody's data is read, written or
--   moved. Its inverse is
--   `migrations/inverse/definer7_seven_client_doors_decide_or_stop_being_doors_down.sql`
--   and puts every byte back.
-- allows: revoke web
-- based-on: public.fork_shared_quiz(uuid, text) 7b56ac11be0c30960371e841f71b95036b60eeec158feb6192e35ba363cbca87
-- based-on: public.fork_shared_flashcard_set(uuid, text) 3506969cae25e88fb5fa3a692ce9e6678eb4a7e5562eb841f08dd7966ca1a010
-- based-on: public.fork_shared_conversation(uuid, text) a6b2ef1e33742f658252a510ce674b53081b657d1d5586432631c3500355f19a
-- based-on: platform.definer_access_decision_regex() 546068acbcecdb589cac1ca186d2ab5b21671294d820ebd515488174d4dcbd33
-- based-on: public.dict_resolve(boolean, boolean, uuid[], uuid[], uuid[]) 612968ec7a87a53bd6bd23754e624707de674ca019be7f5b145be292815f7137
-- lock: platform
-- lane: DEFINER-7
--
-- ══════════════════════════════════════════════════════════════════════════════════════════
-- DEFINER-7 — THE SEVEN DOORS `platform.definer_body_lint_findings()` STILL NAMES.
-- ══════════════════════════════════════════════════════════════════════════════════════════
--
-- Measured on the MAIN database 2026-09-22: seven SECURITY DEFINER functions hold EXECUTE for
-- `authenticated` (one also for `anon`), take a uuid argument, and neither their body nor
-- anything they call reaches an access decision. Production's own door guard
-- (`platform.door_body_must_decide`, migration 0805) would refuse every one of them if its
-- `platform.client_callable_door` row were re-inserted today. Each is ruled below by reading
-- the body, every caller in matrx-frontend and aidream, and the live grants — never by the
-- shape of the name.
--
-- ── 1 · THE THREE `fork_shared_*` TWO-ARGUMENT OVERLOADS ─────────────────────────────────────
--   public.fork_shared_quiz(p_quiz_id uuid, p_token text)
--   public.fork_shared_flashcard_set(p_set_id uuid, p_token text)
--   public.fork_shared_conversation(p_conversation_id uuid, p_token text)
--
-- These are NOT the fork doors. DEFAULT-ORG-4 (2026-09-22) moved the real work to the
-- three-argument overloads, which decide exactly as this class demands — the shared item's
-- share grant (`platform.shareable_resource_registry` + `visibility in ('public','link')` or
-- `public.share_link_authorizes(token, type, id)` or `iam.has_access(type, id, 'viewer')`),
-- and `iam.has_org_access(p_organization_id)` for the organization the copy lands in. Those
-- three are already GREEN in the census and are not touched here.
--
-- What is left at two arguments is a REFUSAL STUB: three lines that return
-- `{"success": false, "code": "organization_required"}` and nothing else. It reads no table,
-- writes no row and names no identity. `utils/permissions/shareLinks.ts` calls only the
-- three-argument form; the stub exists so a browser holding a cached bundle gets a sentence
-- instead of `PGRST202`.
--
-- RULING: a function that touches nothing needs no borrowed rights. They become SECURITY
-- INVOKER. That is not a dodge of the guard — the guard's whole question is what a body does
-- WITH borrowed rights, and a stub that runs as the caller has none to misuse. The bytes of
-- the body are unchanged, so the sentence the person sees is unchanged.
--
-- ── 2 · public.hr_wf_for_target(p_target_token text, p_target_id uuid) ───────────────────────
--
-- THE DECISION WAS ALREADY THERE AND THE LIST DID NOT KNOW ITS NAME. `hr_wf_for_target` is a
-- one-line wrapper over `hr.wf_for_target`, and D283 (`hr_c4_36`, 2026-08-28) gated that body
-- through `hr._wf_instance_visible(i.id, v_uid)` — the five-way standing test extracted from
-- `hr.wf_instance` so both doors ask ONE predicate. Every row of both arms, `open` and
-- `history`, passes through it; an unentitled caller gets the absence shape.
--
-- `platform.definer_access_decision_regex()` — the ONE list of what "an access decision" means
-- in this database — never learned that name, so the call-graph walk read a real gate as
-- silence. The ratchet's own note already said so in prose ("each makes its decision inside a
-- CALLEE, about a PARAMETER, which a positional rule cannot see") and excused it instead of
-- fixing it.
--
-- RULING: add `_wf_instance_visible` to the ONE list, beside the visibility predicates already
-- there (`membership_row_visible`, `assoc_members_visible`, `can_access_conversation`). Proven
-- on the clone in a rolled-back transaction: with the name added,
-- `platform.definer_body_decides_access('public.hr_wf_for_target(text,uuid)')` returns TRUE.
-- `platform.definer_access_decision_regex_strong()` still derives (it raises rather than
-- silently returning the full list if the identity alternatives move, and they do not here).
--
-- ── 3 · public.dict_resolve(boolean, boolean, uuid[], uuid[], uuid[]) ────────────────────────
--
-- The browser wrapper over the SECURITY INVOKER `public.dict_resolve_for(p_user_id, …)`, which
-- the aidream backend calls directly where `auth.uid()` is NULL. `dict_resolve_for` DOES decide:
-- its `member_orgs` CTE is `iam.organization_member where user_id = p_user_id`, and every
-- organization, scope type and scope it selects is joined to it — a foreign id in any of the
-- three arrays already yields nothing. The decision is an inline membership join, which no
-- positional rule can read.
--
-- RULING: make the same narrowing NAMED, in the door, before the read, with no change of
-- behaviour. `p_organization_ids` is filtered through `iam.has_org_access(o)` — the platform's
-- own membership predicate — before it is handed on. A foreign organization id was silently
-- dropped before and is silently dropped now, which is the right shape: it must answer exactly
-- as an invented id does, so the door is not an existence oracle. Scope types and scopes stay
-- as they are: `dict_resolve_for` already confines both to `member_orgs`.
--
-- ── 4 · web.assert_crawl_artifact_file_reused(uuid, uuid, uuid, text) ────────────────────────
--
-- NOT A DOOR AT ALL — A STRAY GRANT, AND ITS OWN TWIN IS THE PROOF. This is a constraint
-- helper: `returns void`, raises 23514, and is reached from the trigger
-- `web.validate_snapshot_artifact_files`. Its door row says exactly that.
--
-- The trigger PERFORMs two helpers on every write, in the same body:
--   web.assert_crawl_artifact_file(uuid,uuid,uuid,uuid,text)  — `authenticated` holds NO EXECUTE
--   web.assert_crawl_artifact_file_reused(uuid,uuid,uuid,text) — `authenticated` holds EXECUTE
-- If that write path were ever taken by the `authenticated` role, the first helper would already
-- raise 42501 on the non-reuse branch. It does not, because the crawl pipeline writes as the
-- server. So the grant on the second helper is an accident, not a lane, and revoking it brings
-- the function level with the twin it is called beside.
--
-- RULING: server-only. The `authenticated` EXECUTE is taken back and the register row is
-- corrected to say so, which is also what closes the one bit it leaked: a signed-in stranger
-- could call it directly and learn, from a raise or a silence, whether a given file id is a
-- valid reused artifact of a given organization's site. `service_role` and `postgres` keep
-- EXECUTE and the trigger path is untouched. The register row is corrected BEFORE the revoke
-- so `platform.enforce_definer_client_grants_impl` cannot hand the grant straight back.
--
-- ── 5 · public.record_guest_execution(…) — STAYS, AND SAYS WHY ───────────────────────────────
--
-- The one honest residue. It is the anonymous-by-design guest counter
-- (`utils/supabase/anonymousByDesignDoors.ts`, `lib/services/guest-limit-service.ts`): a signed-
-- out visitor's fingerprint is upserted into `users.guest_executions` and one row is appended to
-- `users.guest_execution_log`. There is no caller to identify — that is the entire point — and
-- its two uuid arguments, `p_resource_id` and `p_task_id`, are LOG PAYLOAD written verbatim into
-- the log row. Nothing is read back, nothing is returned but the new log row's own id, and no
-- row of anybody's data is reachable through it.
--
-- RULING: it keeps its client lane and its grandfather row, and the row's reason stops being the
-- boilerplate 0805 seeded from introspection and starts being the ruling.
--
-- ── WHAT THIS LEAVES ─────────────────────────────────────────────────────────────────────────
-- `platform.definer_body_lint_findings()` goes 7 → 1, and the one that remains is the one this
-- file declares. The two lists that excuse a door — `platform.provision_spec_grandfather`
-- (lane `definer_no_access_decision`, which the INSERT guard reads) and
-- `aidream/db/definer_access_ratchet.json` (which the release gate reads) — held 2 and 4 names
-- respectively, so the gate excused two doors the database would have refused. Both become the
-- same one name, and the release gate now REFUSES to run while they disagree.
-- ══════════════════════════════════════════════════════════════════════════════════════════

-- ── 1 · the three refusal stubs stop borrowing rights they never use ─────────────────────────
create or replace function public.fork_shared_quiz(p_quiz_id uuid, p_token text default null::text)
 returns jsonb
 language plpgsql
 security invoker
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
 security invoker
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
 security invoker
 set search_path to 'public'
as $function$
BEGIN
  RETURN jsonb_build_object(
    'success', false,
    'error', 'Choose the organization your copy belongs to, then try again.',
    'code', 'organization_required');
END; $function$;

-- ── 2 · the ONE list learns the name of the gate hr.wf_for_target already asks ───────────────
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
      -- DEFINER-7, 2026-09-22. hr._wf_instance_visible(instance_id, uid) is the five-way
      -- standing test D283 EXTRACTED from hr.wf_instance so the instance door and
      -- hr.wf_for_target ask one predicate instead of carrying two copies. It is a
      -- visibility gate exactly like membership_row_visible beside it; the list simply
      -- never learned its name, and public.hr_wf_for_target was excused for it instead.
      || '|_wf_instance_visible'
      || '|assert_[a-z_]*(access|member|owner|admin|permission|may)[a-z_]*'
      -- 0830, AD246. Three decisions the list above could not read, each narrow on
      -- purpose. A bearer-token scope proof (the esign outsider doors); a read whose
      -- own predicate confines it to rows the platform publishes; and a body that
      -- compares a caller-supplied secret against a stored hash before answering.
      || '|assert_outsider_scope|visibility\s*=\s*''public''|extensions\s*\.\s*crypt'
      || '|auth\s*\.\s*uid|request\.jwt\.claims)'
$function$;

-- ── 3 · the dictionary door names the membership it already relied on ────────────────────────
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
    -- DEFINER-7: the access decision, by name, before the read. public.dict_resolve_for
    -- already confined every organization, scope type and scope to the caller's
    -- iam.organization_member rows; this says so in a shape the platform's own census can
    -- read, and answers a foreign organization id exactly as it answers an invented one.
    SELECT public.dict_resolve_for(
      (select auth.uid()),
      p_include_user,
      p_all,
      coalesce((select array_agg(o) from unnest(p_organization_ids) o where iam.has_org_access(o)),
               '{}'::uuid[]),
      p_scope_type_ids,
      p_scope_ids);
$function$;

-- ── 4 · the crawl artifact assertion goes back to being server-only ──────────────────────────
update platform.client_callable_door
   set signed_in_callers = false,
       anonymous_callers = false,
       non_client_lane   = 'Server-only constraint helper. It is reached from the trigger '
                           'web.validate_snapshot_artifact_files, which PERFORMs it beside '
                           'web.assert_crawl_artifact_file — a function `authenticated` has '
                           'never held EXECUTE on. The crawl pipeline writes as the server, so '
                           'the signed-in grant here was an accident, and DEFINER-7 took it '
                           'back on 2026-09-22.',
       reason            = 'Constraint helper for reused canonical crawl artifacts (returns '
                           'void, raises 23514). Reached from the SECURITY INVOKER trigger '
                           'web.validate_snapshot_artifact_files on the server write path. No '
                           'client role calls it and none may: called directly it would tell a '
                           'stranger, by raise or silence, whether a file id is a valid reused '
                           'artifact of a given organization''s site.'
 where schema_name = 'web'
   and function_name = 'assert_crawl_artifact_file_reused';

revoke execute on function web.assert_crawl_artifact_file_reused(uuid, uuid, uuid, text) from authenticated;

delete from platform.provision_spec_grandfather
 where lane = 'definer_no_access_decision'
   and object_ref = 'web.assert_crawl_artifact_file_reused(p_file_id uuid, p_organization_id uuid, p_site_id uuid, p_mime_prefix text)';

-- ── 5 · the one that stays says why, in its own words ────────────────────────────────────────
update platform.provision_spec_grandfather
   set reason = 'THE ANONYMOUS GUEST COUNTER, and the only honest residue of this class '
                '(DEFINER-7, 2026-09-22). A signed-out visitor''s fingerprint is upserted into '
                'users.guest_executions and one row is appended to users.guest_execution_log. '
                'There is no caller to identify — that is the entire point of the door — and '
                'its two uuid arguments, p_resource_id and p_task_id, are LOG PAYLOAD written '
                'verbatim into the log row. Nothing is read back, nothing is returned but the '
                'new log row''s own id, and no row of anybody''s data is reachable through it. '
                'It leaves this list only by ceasing to be an anonymous door.',
       review_by = date '2026-12-31'
 where lane = 'definer_no_access_decision'
   and object_ref = 'public.record_guest_execution(p_fingerprint text, p_resource_type text, p_resource_id uuid, p_resource_name text, p_task_id uuid, p_ip_address inet, p_user_agent text, p_referer text)';
