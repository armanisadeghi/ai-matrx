-- lane: ARGS-RULED
--
-- chair-step: it UPDATEs platform.client_callable_door.argument_rules on eighteen rows, MERGING
--   per argument so nothing another lane declared is thrown away. No body changes here. The
--   inverse is migrations/inverse/argsruled_the_eighteen_that_reach_no_ladder_down.sql.
--
-- ARGS-RULED — THE EIGHTEEN DOORS OF THE 236 THAT REACH NO LADDER PRIMITIVE AT ALL.
--
-- These are the ones no classifier can help with: not one of their id arguments is passed to
-- `custom.assert_client_may_*`, `custom.assert_may_know_table`, `iam.has_org_access`,
-- `custom.has_visibility` or `iam.has_access`. Each was read on its own. Eight of them turned out
-- to share ONE defect and were fixed first, by
-- migrations/campaign/argsruled_the_second_id_lives_in_the_same_organization.sql; this file
-- declares what is true after it.
--
-- THREE ARGUMENTS ARE DELIBERATELY LEFT UNRULED, and they carry NO `foreign` key so the census
-- keeps naming them. A rule is a claim the contract generator EXECUTES; writing one for an
-- argument this lane could not stand behind would be the false declaration lessons ledger 28
-- exists to stop, and it would clear the door from the census on a lie.
--
--   * `custom.read_record(p_organization_id)` — 🚨 A FINDING, WRITTEN DOWN RATHER THAN FIXED.
--     This is DOOR-1, the store's one read door, and it makes NO membership decision about the
--     organization it is handed. Its 02000 "there is no record % in this organization" is raised
--     BEFORE `custom.has_visibility`, so a non-member who guesses a record uuid learns whether it
--     exists in that organization (02000) or not (42501). One bit, about a guessed uuid — and
--     REC-29 says the wall is decided first, which every other door in this store obeys. The fix
--     is one line, `custom.assert_client_may_reach(p_organization_id, 'custom.read_record')`, and
--     it needs the `custom` object lock, which lane TAILS held for the whole of this lane's run.
--   * `public.hr_leave_case_open(p_employment_id, …)` and `public.hr_wf_request(…)` — one-line
--     wrappers whose own bodies decide nothing. Their inner functions, `hr.leave_case_open` and
--     `hr.wf_request`, were NOT read. Saying so is the ruling.
--
-- AND THREE ARGUMENTS STOP BEING DECLARED UNCHECKED. `p_premium_earning_code_id`,
-- `p_location_id` and `p_employment_ids` carried `{"unchecked": true}` since 2026-09-17 — three of
-- the five such declarations on the whole platform. Each reaches a table predicate and lands in a
-- row, so the declaration was never legitimate; they are checks now.

set lock_timeout = '4s';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_the_eighteen_that_reach_no_ladder.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb, '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k, coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_form_id": {"type": "uuid", "position": 2, "check": "the form is resolved only within this organization and a miss raises 23503; the DECISION is then custom.has_visibility(caller,''record'',form.table_id,''admin'') \u2014 publishing opens a write path for people with no account, so it is an admin act on the Table the form writes into.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body", "entity": "custom_record", "access": "admin on the form''s Table"}, "p_organization_id": {"type": "uuid", "position": 1, "check": "it scopes the form lookup and nothing else; the access decision is the Table ladder above. custom.assert_store_door is the PRODUCT SWITCH and decides no membership.", "foreign": {"note": "the row is keyed (organization_id, id) and a wrong organization answers exactly what an invented id answers: 23503, no form here", "not_a_leak": true, "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body", "entity": "organization"}}'::jsonb) as t(k, v)), true)
 where d.schema_name = 'custom' and d.function_name = 'anon_publish';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_the_eighteen_that_reach_no_ladder.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb, '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k, coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_sheet_id": {"type": "uuid", "position": 2, "check": "the sheet is resolved within this organization and with audience=''crew''; NOT FOUND and NOT custom.has_visibility(caller,''record'',sheet.table_id,''editor'') raise the SAME sentence on purpose, so existence is never disclosed.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body", "entity": "custom_record", "access": "editor on the sheet''s Table"}, "p_organization_id": {"type": "uuid", "position": 1, "check": "it scopes the sheet lookup; the access decision is the Table ladder, which is asked before existence.", "foreign": {"note": "the row is keyed (organization_id, id) and a wrong organization answers exactly what an invented id answers: the same 42501, which is what a missing sheet answers", "not_a_leak": true, "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body", "entity": "organization"}}'::jsonb) as t(k, v)), true)
 where d.schema_name = 'custom' and d.function_name = 'capture_submit';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_the_eighteen_that_reach_no_ladder.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb, '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k, coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_comment_id": {"type": "uuid", "position": 2, "check": "the comment is resolved only within this organization; a miss returns false, which is what an invented id returns. The DECISION is custom.has_visibility(caller,''record'',comment.record_id,''commenter'') \u2014 resolving is a commenter-level act on the record the comment hangs off.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body", "access": "commenter on the record"}, "p_organization_id": {"type": "uuid", "position": 1, "check": "it scopes the comment lookup; the access decision is the record ladder above.", "foreign": {"note": "the row is keyed (organization_id, id) and a wrong organization answers exactly what an invented id answers: false", "not_a_leak": true, "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body", "entity": "organization"}}'::jsonb) as t(k, v)), true)
 where d.schema_name = 'custom' and d.function_name = 'io_comment_resolve';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_the_eighteen_that_reach_no_ladder.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb, '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k, coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_record_id": {"type": "uuid", "position": 2, "check": "custom.has_visibility(auth.uid(),''record'',resolved_id,''viewer'') raises 42501 \u2014 this is DOOR-1, the store''s one read door, and nothing reads a record around it.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body", "entity": "custom_record", "access": "viewer"}, "p_organization_id": {"type": "uuid", "position": 1, "check": "it scopes the row read and custom.resolve_id, so a record of another organization is never returned. \ud83d\udea8 ARGS-RULED 2026-09-21 READ IT AND LEFT IT: this door makes NO membership decision about the organization, and the 02000 ''there is no record % in this organization'' is raised BEFORE the visibility check \u2014 so a non-member who guesses a record uuid learns whether it exists in that organization (02000) or not (42501). One bit, about a guessed uuid, and REC-29 says the wall is decided first. The fix is one line \u2014 custom.assert_client_may_reach(p_organization_id,''custom.read_record'') \u2014 and it belongs in the `custom` object lock, which lane TAILS held for the whole of this lane''s run. Written up in PROGRESS-ARGS-RULED.md and NOT declared checked.", "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body", "entity": "organization", "ruling": "NOT RULED \u2014 this lane read it and did not reach a ruling it could stand behind; it stays in the per-argument census on purpose."}}'::jsonb) as t(k, v)), true)
 where d.schema_name = 'custom' and d.function_name = 'read_record';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_the_eighteen_that_reach_no_ladder.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb, '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k, coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_run_id": {"type": "uuid", "position": 2, "check": "the run is resolved within this organization and a miss returns NULL \u2014 ''organizations are hard walls, and a door never tells a caller that somebody else''s row exists'', its own words. The DECISION is then created_by = auth.uid() OR iam.has_access(''guided_checklist_run'', id, ''editor'') OR (visibility >= internal AND public.is_platform_admin()).", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body", "entity": "guided_checklist_run", "access": "editor, ownership, or platform admin"}, "p_organization_id": {"type": "uuid", "position": 1, "check": "it scopes the run lookup; the access decision is the ladder above.", "foreign": {"note": "the row is keyed (organization_id, id) and a wrong organization answers exactly what an invented id answers: null", "not_a_leak": true, "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body", "entity": "organization"}}'::jsonb) as t(k, v)), true)
 where d.schema_name = 'public' and d.function_name = 'checklist_run_save';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_the_eighteen_that_reach_no_ladder.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb, '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k, coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_id": {"type": "uuid", "position": 2, "check": "the row is resolved within this organization, a miss raises 23503, and the DECISION is created_by = auth.uid() OR iam.has_access(''flexible_data'', id, ''admin'') OR (visibility >= internal AND platform admin) \u2014 archiving is the admin rung because putting something away is not changing it.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body", "entity": "flexible_data", "access": "admin, ownership, or platform admin"}, "p_organization_id": {"type": "uuid", "position": 1, "check": "it scopes the row lookup; the access decision is the ladder above.", "foreign": {"note": "the row is keyed (organization_id, id) and a wrong organization answers exactly what an invented id answers: 23503", "not_a_leak": true, "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body", "entity": "organization"}}'::jsonb) as t(k, v)), true)
 where d.schema_name = 'public' and d.function_name = 'flexible_data_archive';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_the_eighteen_that_reach_no_ladder.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb, '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k, coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_premium_earning_code_id": {"type": "uuid", "position": 4, "check": "ARGS-RULED 2026-09-21: scoped to the exception''s own organization or the platform system organization \u2014 the same two the automatic resolver allows \u2014 and then required to BE the expected statutory premium code, active and statutory. Until that migration it was DECLARED unchecked and read any earning_code row on the database, and the mismatch refusal read that foreign row''s code, is_active and is_statutory_premium back to the caller.", "foreign": {"note": "hr_premium_earning_code_missing, identical to an invented id", "not_a_leak": true, "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body", "entity": "hr_earning_code", "access": "the exception''s organization or the platform set"}}'::jsonb) as t(k, v)), true)
 where d.schema_name = 'public' and d.function_name = 'hr_attendance_exception_resolve';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_the_eighteen_that_reach_no_ladder.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb, '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k, coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_authority_id": {"type": "uuid", "position": 1, "check": "the authority is resolved and its organization taken from it; the caller must BE the holder \u2014 v_holder_emp = any(hr.employments_of(auth.uid())) \u2014 or a governance refusal is returned by name.", "foreign": {"note": "not_the_holder / P0002, identical to an invented id", "not_a_leak": true, "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body", "entity": "hr_approval_authority", "access": "the holder of the authority"}, "p_delegate_employment_id": {"type": "uuid", "position": 2, "check": "ARGS-RULED 2026-09-21: must be a live hr.employment of the SAME organization as the authority. Until that migration an approval authority could be handed to an employment in a different organization \u2014 a privilege grant across the wall, with only a plain foreign key (existence, never organization) under it.", "foreign": {"note": "delegate_not_in_this_organization", "not_a_leak": true, "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body", "entity": "hr_employment", "access": "employed by the authority''s organization"}}'::jsonb) as t(k, v)), true)
 where d.schema_name = 'public' and d.function_name = 'hr_authority_delegation_request';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_the_eighteen_that_reach_no_ladder.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb, '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k, coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_incident_id": {"type": "uuid", "position": 1, "check": "the incident is resolved (organization and subject taken off it), hr.incident_excluded(caller) is asked, and hr._l1_write_gate(org,''incident.investigate'', SUBJECT, \u2026) decides \u2014 the population question is about the subject of the case, never the assignee.", "foreign": {"note": "not_reachable, identical to an invented id", "not_a_leak": true, "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body", "entity": "hr_incident", "access": "the incident.investigate capability over the subject"}, "p_employment_id": {"type": "uuid", "position": 2, "check": "ARGS-RULED 2026-09-21: must be a live hr.employment of the incident''s own organization. It was checked for EXCLUSION and never for organization, so a case could be assigned to somebody employed somewhere else entirely.", "foreign": {"note": "assignee_not_in_this_organization", "not_a_leak": true, "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body", "entity": "hr_employment", "access": "employed by the incident''s organization"}}'::jsonb) as t(k, v)), true)
 where d.schema_name = 'public' and d.function_name = 'hr_incident_assign';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_the_eighteen_that_reach_no_ladder.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb, '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k, coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_location_id": {"type": "uuid", "position": 3, "check": "ARGS-RULED 2026-09-21: must be a live hr.location of p_organization_id. It was DECLARED unchecked and written straight onto hr.kiosk_device.location_id beside an organization the gate DOES check \u2014 and a kiosk''s location is what its punches are checked against and what cross-location flagging compares to.", "foreign": {"note": "hr_kiosk_location_not_in_this_organization", "not_a_leak": true, "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body", "entity": "hr_location", "access": "a work location of that organization"}}'::jsonb) as t(k, v)), true)
 where d.schema_name = 'public' and d.function_name = 'hr_kiosk_pairing_code_create';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_the_eighteen_that_reach_no_ladder.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb, '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k, coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_employment_ids": {"type": "uuid[]", "position": 2, "check": "ARGS-RULED 2026-09-21: every employment must be live and in the POLICY''s organization, and one that is not is named and skipped rather than enrolled. It was DECLARED unchecked, and the only gate is hr._leave_admin_rung(policy.organization_id) \u2014 about the caller and the policy, never about the people \u2014 so an HR admin of one organization could enrol another organization''s employments into their policy.", "foreign": {"note": "skipped with reason not_in_this_organization", "not_a_leak": true, "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body", "entity": "hr_employment", "access": "employed by the policy''s organization"}}'::jsonb) as t(k, v)), true)
 where d.schema_name = 'public' and d.function_name = 'hr_leave_enroll';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_the_eighteen_that_reach_no_ladder.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb, '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k, coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_leave_policy_id": {"type": "uuid", "position": 1, "check": "hr._leave_policy_at resolves it and hr._leave_admin_rung(policy.organization_id) must be hr_admin or hr_owner; deactivating decides what happens to every balance on it.", "foreign": {"note": "not_found / not_an_hr_admin", "not_a_leak": true, "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body", "entity": "hr_leave_policy", "access": "hr_admin or hr_owner of the policy''s organization"}, "p_migrate_to_policy_id": {"type": "uuid", "position": 3, "check": "ALREADY CHECKED, in the body, by name: v_target.organization_id <> pol.organization_id (or inactive, or unlimited) returns migration_target_invalid. This is the one member of its family that was already doing it.", "foreign": {"note": "migration_target_invalid", "not_a_leak": true, "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body", "entity": "hr_leave_policy", "access": "an active policy of the same organization"}}'::jsonb) as t(k, v)), true)
 where d.schema_name = 'public' and d.function_name = 'hr_leave_policy_deactivate';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_the_eighteen_that_reach_no_ladder.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb, '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k, coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_employment_id": {"type": "uuid", "position": 1, "check": "this door is a one-line wrapper over hr.leave_case_open; its own body makes no decision. \ud83d\udea8 ARGS-RULED 2026-09-21 DID NOT READ hr.leave_case_open''s body and therefore declares nothing about it \u2014 see PROGRESS-ARGS-RULED.md.", "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body", "entity": "hr_employment", "ruling": "NOT RULED \u2014 this lane read it and did not reach a ruling it could stand behind; it stays in the per-argument census on purpose."}}'::jsonb) as t(k, v)), true)
 where d.schema_name = 'public' and d.function_name = 'hr_leave_case_open';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_the_eighteen_that_reach_no_ladder.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb, '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k, coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_employment_id": {"type": "uuid", "position": 1, "check": "the employment is resolved and its organization becomes v_org; the caller must hold hr.capability(role.assign) over it or be an owner of that organization.", "foreign": {"note": "no_capability / P0002", "not_a_leak": true, "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body", "entity": "hr_employment", "access": "role.assign over that employment, or org owner"}, "p_scope_id": {"type": "uuid", "position": 4, "check": "ARGS-RULED 2026-09-21: resolved BY KIND against v_org \u2014 org must equal it; department, location, pay_group and crew must each be a row of that organization. The kinds that carry no id of their own (direct_reports, position_subtree, employment_set) pass through unchanged. Until that migration a grant made in one organization could be SCOPED to another organization''s department, location, pay group or crew.", "foreign": {"note": "scope_not_in_this_organization", "not_a_leak": true, "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body", "access": "a scope row of the granting organization"}, "p_scope_employment_ids": {"type": "uuid[]", "position": 5, "check": "ARGS-RULED 2026-09-21: every person a role is scoped over must be a live employment of v_org.", "foreign": {"note": "scope_people_not_in_this_organization", "not_a_leak": true, "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body", "entity": "hr_employment", "access": "employed by the granting organization"}}'::jsonb) as t(k, v)), true)
 where d.schema_name = 'public' and d.function_name = 'hr_role_assign';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_the_eighteen_that_reach_no_ladder.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb, '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k, coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_organization_id": {"type": "uuid", "position": 4, "check": "this door is a one-line wrapper over hr.wf_request; its own body makes no decision. \ud83d\udea8 ARGS-RULED 2026-09-21 DID NOT READ hr.wf_request''s body and therefore declares nothing about it \u2014 see PROGRESS-ARGS-RULED.md.", "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body", "entity": "organization", "ruling": "NOT RULED \u2014 this lane read it and did not reach a ruling it could stand behind; it stays in the per-argument census on purpose."}}'::jsonb) as t(k, v)), true)
 where d.schema_name = 'public' and d.function_name = 'hr_wf_request';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_the_eighteen_that_reach_no_ladder.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb, '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k, coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_account_id": {"type": "uuid", "position": 1, "check": "provider.attach_credential resolves the account, takes its organization and calls provider._assert_org_admin(org) before anything is written.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body", "entity": "provider_account", "access": "organization admin"}, "p_credential_item_id": {"type": "uuid", "position": 2, "check": "ARGS-RULED 2026-09-21: must be a credential item of that organization OR the caller''s own (370 of the 406 rows are personal and carry no organization). Until then the door asked nothing about it; measured, the table trigger provider._credential_link_guard was what stopped a foreign one, so this was NOT exploitable \u2014 the decision has moved to the door, where a refusal can say what to do.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body", "entity": "credential_item", "access": "the organization''s credential or the caller''s own"}}'::jsonb) as t(k, v)), true)
 where d.schema_name = 'public' and d.function_name = 'provider_account_attach_credential';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_the_eighteen_that_reach_no_ladder.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb, '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k, coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_account_id": {"type": "uuid", "position": 1, "check": "provider.set_account_status resolves the account, takes its organization and calls provider._assert_org_admin(org).", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body", "entity": "provider_account", "access": "organization admin"}, "p_duplicate_of_id": {"type": "uuid", "position": 5, "check": "ARGS-RULED 2026-09-21: must be a live provider.account of the same organization. provider.account carries only a plain foreign key on this column \u2014 existence, never organization.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body", "entity": "provider_account", "access": "an account of the same organization"}}'::jsonb) as t(k, v)), true)
 where d.schema_name = 'public' and d.function_name = 'provider_account_set_status';

update platform.client_callable_door d
   set argument_rules = jsonb_set(
         coalesce(d.argument_rules, '{}'::jsonb) || '{"version": 1, "declared_by": "argsruled_the_eighteen_that_reach_no_ladder.sql", "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body"}'::jsonb, '{arguments}',
         coalesce(d.argument_rules -> 'arguments', '{}'::jsonb)
           || (select jsonb_object_agg(t.k, coalesce(d.argument_rules -> 'arguments' -> t.k, '{}'::jsonb) || t.v)
                 from jsonb_each('{"p_table_id": {"type": "uuid", "position": 1, "check": "workbench.udt_dataset_access(p_table_id,''editor'') must be true or 42501, before the first read.", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body", "entity": "dataset", "access": "editor on the dataset"}, "p_field_id": {"type": "uuid", "position": 2, "check": "DERIVED: the column is resolved only within table_id = p_table_id and only when it is an autonumber column; anything else returns the same ''That column is not an Autonumber column of this table.'' object an invented id returns.", "foreign": {"note": "the same refusal object as an invented id", "not_a_leak": true, "same_as_invented": true}, "verified": "2026-09-21 lane ARGS-RULED \u2014 read from this body", "entity": "udt_dataset_fields"}}'::jsonb) as t(k, v)), true)
 where d.schema_name = 'public' and d.function_name = 'udt_backfill_autonumber';
