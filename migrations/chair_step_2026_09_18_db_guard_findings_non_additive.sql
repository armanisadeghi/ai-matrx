-- chair-step: the non-additive half of the 2026-09-18 database-guard repairs — eight REVOKEs of client grants nobody uses, one superseded function overload, four platform_admin_all policies on private tables, and one unique index rebuilt as partial. Each is a removal by construction; the additive halves are already applied and this file's proof names every object it touches.
--
-- chair_step_2026_09_18_db_guard_findings_non_additive
--
-- WHY A CHAIR STEP. migrations/JUDGMENT.md §4b refuses a header-less file carrying a DROP, a
-- REVOKE or a DELETE at production unless the owner is awake at a terminal (§5). Everything in
-- this file removes something, so it is that file. Its four additive companions
-- (hr_public_wrappers_are_declared_doors…, impl_doors_closed_helpers…, staff_door_six_tokens…,
-- note_folders_name_key… is NOT one of them — it is here) applied unattended first; this file
-- finishes each finding. Each block says which guard it closes and what the proof asserts.
--
-- ── A. impl-doors D18 / D5 / D16a (release gate 28) ─────────────────────────────────────────
-- Maintenance helpers that `authenticated` could EXECUTE with no client caller anywhere
-- (census 2026-09-18 across matrx-frontend, matrx-extend, aidream), each calling a helper the
-- role cannot execute — a 42501 inside a reachable path. Provisioning runs as
-- matrx_provisioner / service_role, which keep their grants. Two event-trigger functions born
-- with PostgreSQL's default PUBLIC EXECUTE (PostgREST cannot invoke them; the grant is noise the
-- D5 census counts). seo._tm_rendition_of is declared a private helper with no client lane.
-- The rehearsal branch is a snapshot older than some of these objects, so each REVOKE runs only
-- where its object exists and says so when it does not; the proof below refuses an absence on
-- PRODUCTION by its system identifier (the same identity the runner prints), so a typo cannot
-- pass there as "absent".
do $revokes$
declare
  sig text; kind text;
begin
  foreach sig in array array[
    'procedure:iam.sweep_governance_guards(text)',
    'function:platform.declare_soft_delete_edge(text, text, text, text, text, text, text, text, text, text)',
    'function:platform.definer_access_decision_regex_strong()',
    'function:platform.provision_arg_check_findings(text, text, jsonb)',
    'function:platform.provision_preflight()',
    'function:seo._tm_rendition_of(uuid, text)',
    'function:platform._door_follows_its_function()',
    'function:platform._provision_shape_guard()'] loop
    kind := split_part(sig, ':', 1);
    sig  := substr(sig, length(kind) + 2);
    if to_regprocedure(sig) is null then
      raise notice 'chair_step: % % is absent on this server — skipped (rehearsal snapshot?)', kind, sig;
      continue;
    end if;
    execute format('revoke all on %s %s from public, anon, authenticated', kind, sig);
  end loop;
end $revokes$;

-- The 15-argument public.provision_mcp_server has no p_organization_id — the pre-"NO ASSIGNED
-- ORG" shape. The one client caller (features/tool-registry/mcp-admin/services/mcpAdmin.service.ts)
-- uses the 16-argument overload with an explicit organization. Door row first, then the function.
delete from platform.client_callable_door
 where schema_name = 'public' and function_name = 'provision_mcp_server'
   and identity_args = 'p_slug text, p_name text, p_vendor text, p_category mcp_server_category, p_transport mcp_transport, p_auth_strategy mcp_auth_strategy, p_endpoint_url text, p_description text, p_icon_url text, p_color text, p_docs_url text, p_website_url text, p_status mcp_server_status, p_is_official boolean, p_oauth_scopes text[]';
drop function if exists public.provision_mcp_server(text, text, text, mcp_server_category, mcp_transport, mcp_auth_strategy, text, text, text, text, text, text, mcp_server_status, boolean, text[]);

-- ── B. THE STAFF DOOR (check-staff-door) ─────────────────────────────────────────────────────
-- platform_admin_all is a generated, platform-wide lane: iam.supersede_bespoke_policies refuses
-- it by design and regeneration would rewrite these bespoke tables' whole policy sets, so the
-- four removals are plain DROPs. The registry rows already declare the lane closed
-- (suppress_platform_admin_lane = true, staff_door_six_tokens_dd137b_2026_09_18), so no
-- regeneration can put it back. admin_markdown_sample keeps its lane by design (named residue).
drop policy if exists platform_admin_all on education.data_rights_event;
drop policy if exists platform_admin_all on users.integration_connections;
drop policy if exists platform_admin_all on users.integration_connection_resources;
drop policy if exists platform_admin_all on users.user_secret_audit;

-- ── C. note_folders name key (check:soft-delete-unique, CI BLOCKING) ─────────────────────────
-- `note_folder` is has_soft_delete = true; an exact unique index on (organization_id, created_by,
-- name) lets a removed folder hold its name for ever (db-rules §8). Nothing upserts against this
-- key (census 2026-09-18), the table holds 55 rows, so the rebuild is milliseconds. The
-- (id, organization_id) index stays exact: it is a FK target (notes_n01…), and the guard now
-- knows an index carrying the row's own id cannot collide.
drop index if exists workbench.note_folders_organization_created_by_name_unique;
create unique index note_folders_organization_created_by_name_unique
  on workbench.note_folders (organization_id, created_by, name)
  where deleted_at is null;

-- ── Proof, same transaction ──────────────────────────────────────────────────────────────────
do $proof$
declare v_n int; v_bad text; v_pred text; v_absent int; v_absent_names text;
begin
  -- On production (system identifier 7642734024280108049, the one the runner prints) every one of
  -- the eight must exist and be closed; on the rehearsal snapshot an absent object is reported.
  select count(*) filter (where to_regprocedure(x.f) is null),
         string_agg(x.f, ', ') filter (where to_regprocedure(x.f) is null)
    into v_absent, v_absent_names
    from (select unnest(array[
      'iam.sweep_governance_guards(text)', 'platform.declare_soft_delete_edge(text,text,text,text,text,text,text,text,text,text)',
      'platform.definer_access_decision_regex_strong()', 'platform.provision_arg_check_findings(text,text,jsonb)',
      'platform.provision_preflight()', 'seo._tm_rendition_of(uuid,text)',
      'platform._door_follows_its_function()', 'platform._provision_shape_guard()']) f) x;
  if v_absent > 0 and (select system_identifier from pg_control_system()) = 7642734024280108049 then
    raise exception 'chair_step: on PRODUCTION % object(s) named by this file do not exist: %', v_absent, v_absent_names;
  elsif v_absent > 0 then
    raise notice 'chair_step: % object(s) absent on this rehearsal server: %', v_absent, v_absent_names;
  end if;
  select count(*), string_agg(f, ', ') into v_n, v_bad from (
    select unnest(array[
      'iam.sweep_governance_guards(text)', 'platform.declare_soft_delete_edge(text,text,text,text,text,text,text,text,text,text)',
      'platform.definer_access_decision_regex_strong()', 'platform.provision_arg_check_findings(text,text,jsonb)',
      'platform.provision_preflight()', 'seo._tm_rendition_of(uuid,text)',
      'platform._door_follows_its_function()', 'platform._provision_shape_guard()']) f) x
   where to_regprocedure(x.f) is not null
     and (has_function_privilege('authenticated', x.f, 'EXECUTE') or has_function_privilege('anon', x.f, 'EXECUTE'));
  if v_n > 0 then raise exception 'chair_step: client roles still execute %', v_bad; end if;
  if (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'provision_mcp_server') <> 1 then
    raise exception 'chair_step: expected exactly one provision_mcp_server overload to remain';
  end if;
  if exists (select 1 from platform.client_callable_door where function_name = 'provision_mcp_server' and identity_args not like '%p_organization_id uuid%') then
    raise exception 'chair_step: the superseded provision_mcp_server door row is still there';
  end if;
  select count(*), string_agg(p.polrelid::regclass::text, ', ') into v_n, v_bad
    from pg_policy p
   where p.polname = 'platform_admin_all'
     and p.polrelid in ('education.data_rights_event'::regclass, 'users.integration_connections'::regclass,
                        'users.integration_connection_resources'::regclass, 'users.user_secret_audit'::regclass);
  if v_n > 0 then raise exception 'chair_step: platform_admin_all still on %', v_bad; end if;
  select pg_get_expr(ix.indpred, ix.indrelid) into v_pred
    from pg_index ix join pg_class c on c.oid = ix.indexrelid
   where c.relname = 'note_folders_organization_created_by_name_unique'
     and ix.indrelid = 'workbench.note_folders'::regclass and ix.indisunique and ix.indisvalid;
  if coalesce(v_pred, '') not ilike '%deleted_at is null%' then
    raise exception 'chair_step: the org-scoped folder name index is not partial on deleted_at (predicate: %)', v_pred;
  end if;
  if exists (select 1 from pg_index ix join pg_class c on c.oid = ix.indexrelid
              where c.relname = 'note_folders_id_organization_unique' and ix.indpred is not null) then
    raise exception 'chair_step: note_folders_id_organization_unique must stay exact (FK target)';
  end if;
end $proof$;
