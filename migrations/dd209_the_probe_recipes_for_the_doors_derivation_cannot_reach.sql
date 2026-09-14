-- DD-209 — the probe recipes, written against each door's own signature and body.
--
-- `pnpm check:door-rows:strict` could not derive an argument for 74 doors of the
-- 483-door blocking population, and a further 43 came back with an error its new
-- control probe proves is the ARGUMENT's fault and not the caller's (the victim's
-- own identical call fails the same way). This file is the knowledge that closes
-- the gap for the ones that CAN be closed, and — just as important — the recorded
-- reason for the ones that cannot.
--
-- HOW EACH RECIPE WAS DECIDED. Every one was read against the function's identity
-- arguments and its body, live, on 2026-09-14: which table the id is looked up in,
-- which words its own validator accepts, which argument carries the identity the
-- door decides on. Nothing here is a guess — a guessed value produces a type error
-- or a "not found", and this gate reads neither as a refusal.
--
-- THE OTHER HALF, AND IT IS NOT A FAILURE. Many of these doors name a table that
-- has NO row at all in any organization the test callers lack standing in, because
-- the platform has no such data on this database yet: `workbench.udt_datasets` 0,
-- `rag.data_stores` 0, `seo.starter_pack` 0, `tool.mcp_server` 0, `iam.industries` 0,
-- `canvas.canvas_items` 0, `platform.taxonomy_node` 0, `education.learn_doc` 0,
-- `hr.overtime_preapproval` 0, `files.webhook_deliveries` 0 (measured, same day) —
-- and exactly ONE education class exists in the whole database, in caller A's own
-- organization, so `p_class` has no boundary to cross at all. No recipe can conjure
-- those rows, and a harness that writes them would be measuring its own fixture. So
-- those doors carry a NOTE instead: the door row records, in a sentence, WHY it
-- stays UNMEASURED, and the gate prints that sentence. "I could not measure it" and
-- "it did not widen" are the two sentences this program exists to keep apart, and a
-- named reason on the row is how the first one stops being anonymous.

-- The vocabulary gains `note`: a recipe may now carry ONLY a reason, for a door no
-- recipe can reach. It still may not be empty and it still may not be a word.
-- based-on: platform.door_probe_args_ok(jsonb) 55b4c9c7f62f101ebc214a9d23424c4d54c2f163ea734c5e9478ad27c19fe392
create or replace function platform.door_probe_args_ok(p_recipe jsonb)
returns boolean
language sql
immutable
set search_path = pg_catalog, public
as $fn$
  select p_recipe is null
      or (
        jsonb_typeof(p_recipe) = 'object'
        and (p_recipe ? 'args' or p_recipe ? 'boolean_oracle' or p_recipe ? 'note')
        and (not p_recipe ? 'args' or jsonb_typeof(p_recipe->'args') = 'object')
        and (
          not p_recipe ? 'args'
          or not exists (
            select 1
            from jsonb_each_text(p_recipe->'args') as a(k, v)
            where v !~ '^(own_org|other_org|victim_user|self|pending_invitation|omit|own_row:[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*|other_row:[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*|literal:.*)$'
          )
        )
        and (
          not p_recipe ? 'boolean_oracle'
          or (jsonb_typeof(p_recipe->'boolean_oracle') = 'string'
              and length(btrim(p_recipe->>'boolean_oracle')) >= 40)
        )
        and (
          not p_recipe ? 'note'
          or (jsonb_typeof(p_recipe->'note') = 'string'
              and length(btrim(p_recipe->>'note')) >= 40)
        )
      );
$fn$;

-- ── the recipes ──────────────────────────────────────────────────────────────

create temporary table dd209_recipe (fn text, args text, recipe jsonb) on commit drop;

insert into dd209_recipe (fn, args, recipe) values

-- THE AGENT FAMILY. `p_agent_id` is an `agent.definition` row; 35 of them belong to
-- organizations neither test caller has standing in.
('public.agx_get_access_level', 'p_agent_id uuid',
 '{"args":{"p_agent_id":"other_row:agent.definition"},"note":"p_agent_id is an agent.definition row; the victim catalog holds one in an organization neither caller belongs to."}'),
('public.agx_duplicate_agent', 'p_agent_id uuid, p_as_system boolean',
 '{"args":{"p_agent_id":"other_row:agent.definition"},"note":"Duplicating is reading (DD-192 class 3): the copy being personal is not a gate, the read is."}'),
('public.agx_purge_versions', 'p_agent_id uuid, p_keep_count integer',
 '{"args":{"p_agent_id":"other_row:agent.definition"},"note":"A destructive door over another organization agent definition; the write arm is what matters here."}'),
('public.agx_usage_history_counts', 'p_agent_id uuid',
 '{"args":{"p_agent_id":"other_row:agent.definition"},"note":"Usage counts over an agent the caller cannot open are still a disclosure about that agent."}'),
('public.agx_usage_scan', 'p_agent_id uuid',
 '{"args":{"p_agent_id":"other_row:agent.definition"},"note":"A usage scan names the shortcuts and surfaces an agent is bound to, across the organization boundary."}'),
('public.agx_usage_scan_admin', 'p_agent_id uuid',
 '{"args":{"p_agent_id":"other_row:agent.definition"},"note":"The admin arm of the same scan; a signed-in non-admin must not reach it for a foreign agent."}'),
('public.agx_usage_update_all_to_active', 'p_agent_id uuid, p_mode text',
 '{"args":{"p_agent_id":"other_row:agent.definition","p_mode":"literal:latest"},"note":"p_mode is a binding mode word the door validates; latest is the one the UI sends."}'),

-- THE INVITATION FAMILY. DD-191 lived here. The recipe needs a LIVE PENDING
-- invitation in a victim organization — any other invitation is refused for the
-- wrong reason and the door goes unmeasured.
('public.inv_get_managed', 'p_invitation_id uuid',
 '{"args":{"p_invitation_id":"pending_invitation"},"note":"DD-191 leaked pending invitations WITH their acceptance tokens; only a live pending row reaches the code that leaked."}'),
('public.inv_revoke', 'p_invitation_id uuid',
 '{"args":{"p_invitation_id":"pending_invitation"},"note":"Revoking another organization pending invitation is a cross-boundary WRITE, which is the half a read-only probe cannot see."}'),
('public.inv_resend', 'p_invitation_id uuid, p_expires_at timestamp with time zone',
 '{"args":{"p_invitation_id":"pending_invitation"},"note":"Resending another organization invitation mails a stranger on that organization behalf; a live pending row is the only one that reaches it."}'),

-- THE GUARDIAN / STUDENT FAMILY. Every one of these decides on ANOTHER PERSON
-- identity, so the crossing argument is a user id, not a row id.
('public.guardian_can_view', 'p_student_id uuid',
 '{"args":{"p_student_id":"victim_user"},"boolean_oracle":"TRUE would mean this door tells any signed-in caller that a guardian link exists for a student they have no relationship with, which is a disclosure about that student.","note":"p_student_id is an auth.users id; the victim identity is a real user neither caller is linked to."}'),
('public.guardian_student_gain', 'p_student_id uuid',
 '{"args":{"p_student_id":"victim_user"},"note":"Learning-gain figures for another person child are exactly the rows this door must not hand over."}'),
('public.guardian_student_mastery', 'p_student_id uuid',
 '{"args":{"p_student_id":"victim_user"},"note":"Mastery per topic for another person child; the row-diff is the measurement."}'),
('public.guardian_student_streak', 'p_student_id uuid',
 '{"args":{"p_student_id":"victim_user"},"note":"Streaks for another person child; the row-diff is the measurement."}'),
('public.guardian_student_sessions', 'p_student_id uuid',
 '{"args":{"p_student_id":"victim_user"},"note":"Study sessions for another person child; each session row is placed against the caller own RLS visibility."}'),
('public.guardian_student_attempts', 'p_student_id uuid, p_since timestamp with time zone',
 '{"args":{"p_student_id":"victim_user"},"note":"Answer attempts for another person child; each attempt row is placed against the caller own RLS visibility."}'),
('public.guardian_respond', 'p_guardian_user_id uuid, p_approve boolean',
 '{"args":{"p_guardian_user_id":"victim_user"},"note":"Responding on behalf of another guardian is an identity swap; the write arm is what this probe measures."}'),
('public.guardian_unlink', 'p_guardian_user_id uuid, p_student_user_id uuid',
 '{"args":{"p_guardian_user_id":"victim_user","p_student_user_id":"victim_user"},"note":"Unlinking a guardian the caller is not is a cross-identity WRITE."}'),
('public.edu_guardian_set_age_band', 'p_student_user_id uuid, p_band text',
 '{"args":{"p_student_user_id":"victim_user","p_band":"literal:teen"},"note":"p_band is validated against a fixed vocabulary; teen is one of its accepted words, so the door reaches its identity check instead of its input check."}'),

-- IDENTITY-SWAP SHAPES. The argument IS the caller claim.
('public.get_user_emails_by_ids', 'user_ids uuid[]',
 '{"args":{"user_ids":"victim_user"},"note":"An email address for a user id the caller has no relationship with is the disclosure this door must refuse."}'),
('public.search_users_intelligent', 'search_term text, current_user_id uuid, max_results integer',
 '{"args":{"current_user_id":"victim_user","search_term":"literal:a"},"note":"current_user_id is the caller identity taken as an argument — the DD-192 class 1 shape. A one-letter search term matches broadly on purpose."}'),
('public.dm_get_or_create_direct_conversation', 'p_user1_id uuid, p_user2_id uuid, p_organization_id uuid',
 '{"args":{"p_user1_id":"victim_user","p_user2_id":"victim_user","p_organization_id":"other_org"},"note":"Opening a direct conversation BETWEEN two other people, in an organization the caller has no standing in, is a cross-boundary write."}'),
('public.transfer_organization_ownership', 'org_id uuid, current_owner_id uuid, new_owner_id uuid',
 '{"args":{"org_id":"other_org","current_owner_id":"victim_user","new_owner_id":"self"},"note":"The worst shape on the platform: a stranger naming themselves the new owner of an organization they have no standing in."}'),
('public.cx_canvas_save_user_version', 'p_user_id uuid, p_canvas_id uuid, p_title text, p_content jsonb',
 '{"args":{"p_user_id":"victim_user"},"note":"p_user_id is the DD-192 class 1 identity-swap shape. p_canvas_id has no recipe: canvas.canvas_items holds no row in any organization the callers lack standing in (measured 2026-09-14)."}'),

-- THE RESOURCE-PERMISSION DOORS. The body accepts three resource types and nothing
-- else, so the discriminator vocabulary the harness enumerates never fits.
('iam.fn_list_resource_permissions', 'p_resource_type text, p_resource_id uuid',
 '{"args":{"p_resource_type":"literal:file","p_resource_id":"other_row:files.files"},"note":"The body accepts file, folder and web_site only; anything else is an input error the gate correctly refuses to read as a refusal."}'),
('iam.fn_grant_resource_permission', 'p_resource_type text, p_resource_id uuid, p_grantee_id uuid, p_grantee_type text, p_level text, p_expires_at timestamp with time zone',
 '{"args":{"p_resource_type":"literal:file","p_resource_id":"other_row:files.files","p_grantee_id":"self","p_grantee_type":"literal:user","p_level":"literal:viewer"},"note":"A stranger granting THEMSELVES a permission on another organization file is the escalation shape; the write arm is the measurement."}'),
('iam.fn_revoke_resource_permission', 'p_resource_type text, p_resource_id uuid, p_grantee_id uuid, p_grantee_type text',
 '{"args":{"p_resource_type":"literal:file","p_resource_id":"other_row:files.files","p_grantee_id":"victim_user","p_grantee_type":"literal:user"},"note":"Revoking somebody else access to a file the caller cannot open is a cross-boundary write."}'),
('public.review_org_share', 'p_permission_id uuid, p_status text, p_note text',
 '{"args":{"p_permission_id":"other_row:iam.permissions","p_status":"literal:approved"},"note":"p_permission_id is an iam.permissions row (no organization column; the victim identity created 537 of them). approved is one of the words the body accepts."}'),

-- CONTEXT AND SCOPE.
('public.create_context_item', 'p_scope_type_id uuid, p_key text, p_display_name text, p_value_type context_value_type, p_description text, p_category text, p_fetch_hint context_fetch_hint, p_sensitivity context_sensitivity, p_tags text[], p_slug text, p_sort_order smallint, p_allowed_reference_types text[], p_max_items integer, p_allowed_scope_type_ids uuid[], p_reference_source jsonb',
 '{"args":{"p_scope_type_id":"other_row:context.scope_types","p_value_type":"literal:string"},"note":"Creating a context item under ANOTHER organization scope type is a cross-boundary write; p_value_type is an enum and string is its plainest label."}'),

-- HR. The audited-door family takes an entity TOKEN plus a row of the table that
-- token names — neither means anything without the other.
('public.hr_restricted_get', 'p_token text, p_id uuid, p_purpose text, p_justification text',
 '{"args":{"p_token":"literal:hr_compensation","p_id":"other_row:hr.compensation","p_purpose":"literal:support_investigation","p_justification":"literal:check:door-rows (DD-209) is probing this audited HR door from an account with no standing in the organization that owns the row; the call is inside a transaction that is always rolled back."},"note":"hr_location is NOT an audited-tier token, which is why derivation left this door unmeasured; hr_compensation is."}'),
('public.hr_confidential_get', 'p_token text, p_id uuid, p_purpose text',
 '{"args":{"p_token":"literal:hr_employee_private","p_id":"other_row:hr.employee_private","p_purpose":"literal:support_investigation"},"note":"The confidential tier takes its own token vocabulary; hr_employee_private is one of its tables."}'),
('public.hr_self_update', 'p_token text, p_id uuid, p_patch jsonb',
 '{"args":{"p_token":"literal:hr_employee","p_id":"other_row:hr.employee","p_patch":"literal:{}"},"note":"A self-service update pointed at ANOTHER person employee row is the identity-swap shape, and an empty patch still reaches the identity check."}'),
('public.hr_time_adjustment_create', 'p_employment_id uuid, p_original_pay_period_id uuid, p_work_date date, p_earning_code_id uuid, p_hours_delta numeric, p_amount_delta numeric, p_reason_category_id uuid, p_reason_note text',
 '{"args":{"p_employment_id":"other_row:hr.employment","p_original_pay_period_id":"other_row:hr.pay_period","p_earning_code_id":"other_row:hr.earning_code"},"note":"Writing a time adjustment onto another organization employment is a payroll-grade cross-boundary write; all three tables hold victim rows."}'),
('public.hr_wf_reassign_step', 'p_step_id uuid, p_to_employment_id uuid, p_reason text',
 '{"args":{"p_to_employment_id":"other_row:hr.employment"},"note":"p_step_id has no recipe: hr.workflow_step holds no row in a victim organization. The employment side still crosses."}'),

-- MEMBERSHIP AND SETTINGS words their own validators accept.
('public.mbr_update_role', 'p_container_type text, p_container_id uuid, p_user_id uuid, p_role text',
 '{"args":{"p_container_type":"literal:organization","p_container_id":"other_org","p_user_id":"victim_user","p_role":"literal:admin"},"note":"Raising another person to admin in an organization the caller has no standing in is DD-191 inv_create shape, by a different door."}'),
('public.setting_access_request_decide', 'p_request_id uuid, p_decision text, p_note text',
 '{"args":{"p_decision":"literal:approve"},"note":"The body rejects any decision word it does not know before it decides anything about the caller; approve is one it knows."}'),

-- SEO status words.
('seo.update_competitor_tracking', 'p_competitor_id uuid, p_tracking_status text, p_human_ruling jsonb',
 '{"args":{"p_competitor_id":"other_row:seo.competitor","p_tracking_status":"literal:tracked"},"note":"tracked is one of the words the competitor validator accepts, so the door reaches its site-access check instead of its input check."}'),
('seo.update_reputation_case', 'p_case_id uuid, p_status text, p_human_ruling jsonb',
 '{"args":{"p_case_id":"other_row:seo.reputation_case","p_status":"literal:open"},"note":"open is one of the words the reputation-case validator accepts, so the door reaches its site-access check instead of its input check."}'),

-- ── THE NOTES: doors no recipe can reach, and the measured reason why ────────
('public.edu_class_roster', 'p_class uuid',
 '{"note":"p_class is a context.scopes row of scope type class. Exactly ONE class exists on this database and it belongs to caller A own organization (measured 2026-09-14), so there is no class across the boundary to hand this door and no recipe can make one without the harness writing its own fixture."}'),
('public.edu_class_join', 'p_class uuid',
 '{"note":"Same as edu_class_roster: the only class on this database is in caller A own organization, so p_class has no boundary to cross. Measured 2026-09-14."}'),
('public.edu_class_leave', 'p_class uuid',
 '{"note":"Same as edu_class_roster: the only class on this database is in caller A own organization, so p_class has no boundary to cross. Measured 2026-09-14."}'),
('public.edu_class_request', 'p_class uuid',
 '{"note":"Same as edu_class_roster: the only class on this database is in caller A own organization, so p_class has no boundary to cross. Measured 2026-09-14."}'),
('public.edu_class_assignments', 'p_class uuid',
 '{"note":"Same as edu_class_roster: the only class on this database is in caller A own organization, so p_class has no boundary to cross. Measured 2026-09-14."}'),
('public.edu_class_progress_overview', 'p_class uuid',
 '{"note":"Same as edu_class_roster: the only class on this database is in caller A own organization, so p_class has no boundary to cross. Measured 2026-09-14."}'),
('public.udt_upsert_row', 'p_table_id uuid, p_row_id uuid, p_data jsonb',
 '{"note":"p_table_id is a workbench.udt_datasets row, and that table holds no row in any organization the test callers lack standing in (measured 2026-09-14), so this door cannot be probed across the boundary until such data exists."}'),
('public.udt_bulk_write', 'p_table_id uuid, p_operations jsonb',
 '{"note":"p_table_id is a workbench.udt_datasets row, and that table holds no row in any organization the test callers lack standing in (measured 2026-09-14), so this door cannot be probed across the boundary until such data exists."}'),
('rag.fn_get_user_data_store', 'p_store_id uuid, p_member_limit integer',
 '{"note":"p_store_id is a rag.data_stores row, and that table holds no row in any organization the test callers lack standing in (measured 2026-09-14), so this door cannot be probed across the boundary until such data exists."}'),
('rag.fn_data_store_members_rich', 'p_store_id uuid',
 '{"note":"p_store_id is a rag.data_stores row, and that table holds no row in any organization the test callers lack standing in (measured 2026-09-14), so this door cannot be probed across the boundary until such data exists."}'),
('seo.starter_pack_detail', 'p_pack_id uuid',
 '{"note":"p_pack_id is a seo.starter_pack row, and that table holds no row in any organization the test callers lack standing in (measured 2026-09-14), so this door cannot be probed across the boundary until such data exists."}'),
('files.webhook_redeliver', 'p_delivery_id uuid',
 '{"note":"p_delivery_id is a files.webhook_deliveries row and that table is EMPTY on this database (measured 2026-09-14), so there is no delivery of anyone to redeliver."}'),
('public.upsert_mcp_connection', 'p_server_id uuid, p_config_id uuid, p_transport mcp_transport, p_endpoint_override text',
 '{"args":{"p_transport":"literal:http"},"note":"p_server_id is a tool.mcp_server row and that table holds no row in any organization the callers lack standing in (measured 2026-09-14); the transport enum is filled so the door at least reaches its own lookup."}'),
('public.admin_taxonomy_delete', 'p_id uuid',
 '{"note":"p_id is a platform.taxonomy_node row and that table holds no row in any organization the test callers lack standing in (measured 2026-09-14)."}'),
('public.industry_assign_org', 'p_organization_id uuid, p_industry_id uuid, p_is_primary boolean, p_actor uuid',
 '{"args":{"p_organization_id":"other_org","p_actor":"victim_user"},"note":"p_industry_id has no recipe: iam.industries holds no row in any organization the callers lack standing in (measured 2026-09-14). The organization and actor arguments still cross."}'),
('public.hr_overtime_preapproval_get', 'p_preapproval_id uuid',
 '{"note":"p_preapproval_id is an hr.overtime_preapproval row and that table holds no row in any organization the test callers lack standing in (measured 2026-09-14)."}');

update platform.client_callable_door d
   set probe_args = r.recipe
  from dd209_recipe r
 where d.schema_name || '.' || d.function_name = r.fn
   and d.identity_args = r.args;

-- A recipe for a door that does not exist is a recipe nobody will ever read, and
-- it would quietly mean "this door is covered" when it is not. Say so, loudly,
-- rather than landing the file and leaving a silent hole.
do $$
declare v_missed text;
begin
  select string_agg(format('%s(%s)', r.fn, r.args), E'\n  ') into v_missed
    from dd209_recipe r
   where not exists (
     select 1 from platform.client_callable_door d
      where d.schema_name || '.' || d.function_name = r.fn and d.identity_args = r.args);
  if v_missed is not null then
    raise exception E'DD-209: these recipes name no live declared door, so they would never be read:\n  %', v_missed;
  end if;
end $$;
