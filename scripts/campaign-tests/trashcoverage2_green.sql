-- LANE TRASH-COVERAGE-2 — THE GREEN SUITE. Every archivable thing a person sees is in Trash, and comes
-- back through its own door.
--
-- PART A, per kind (the 31 kinds migrations/campaign/trashcoverage2_every_archivable_thing_a_person_sees_is_in_trash.sql
-- registers), as admin@admin.com in the `authenticated` seat: archive one of the admin's own rows the
-- way its screen does (its archive RPC where it has one, else `deleted_at = now()` under RLS), find it
-- in Trash (`trash_list` for that kind), restore it through `entity_undelete`, and read it back — the
-- row it was, except the write stamps every write carries. Where the admin owns no live row of a kind
-- but owns an archived one, the suite starts from that archived row (find it, restore it, it is live).
-- Where the admin owns neither, the suite makes a realistic one inside the transaction.
--
-- PART B, the parent rule (a child that only comes back with its parent is listed "in <parent>" and
-- its restore brings the parent back first):
--   B1 a folder inside a folder; B2 a scope type with a scope and a Field (context item); B3 a
--      workflow with a trigger (the trigger comes back with the workflow, as active as it was);
--   B4 Organization Trash restores a child folder through its parent folder; B5 a library document
--      trashed with its file comes back with the file.
--
-- THE REAL USE CASE (owner law 2026-09-21): the admin tidies up — archives a rulebook, a folder of
-- supplier invoices, a war room, a scope type "Service areas" with its Field "Crew size" — changes
-- their mind, and gets each one back from Trash. Fixture rows are synthesized, nobody real.
--
-- One transaction, ends in ROLLBACK; every failure is collected and named together.
-- ITS RED: with the inverse applied, every Part A kind fails at "not in Trash" and Part B fails.

\set ON_ERROR_STOP on
\timing off

\set suite 'trashcoverage2_green.sql'
\set requires 'grant:authenticated:public.trash_list|grant:authenticated:public.entity_undelete'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_kinds   constant text[] := array[
    'rulebook', 'folder', 'war_room', 'thread', 'scope_type', 'scope', 'context_item',
    'working_document', 'user_memory', 'wbx_highlight', 'browser_profile', 'media_source_library',
    'learn_doc', 'seo_topical_map', 'seo_rank_target', 'hr_employee', 'hr_employment',
    'hr_jurisdiction_rule_org_decision', 'crm_blocklist_entry', 'commerce_intake_batch',
    'interview_decision_interview', 'workflow_runtime_surface', 'workflow_trigger',
    'product_capture_item', 'category', 'flexible_data', 'shared_canvas_item', 'sch_task',
    'user_feedback', 'agent_mandate_note', 'processed_document'];
  c_stamps  constant text[] := array['updated_at', 'updated_by', 'updated_by_system', 'updated_by_tier',
                                     'version', 'content_version', 'search_vector', 'trending_score'];
  v_org     uuid;
  v_tok     text;
  v_e       platform.entity_types%rowtype;
  v_id      uuid;
  v_from_archived boolean;
  v_before  jsonb;
  v_after   jsonb;
  v_diff    text[];
  v_n       int;
  v_ok      boolean;
  v_title   text;
  v_fail    text[] := '{}';
  v_pass    int := 0;
  v_a uuid; v_b uuid; v_c uuid; v_d uuid; v_w uuid; v_x uuid;
  v_res     jsonb;
begin
  perform set_config('app.actor_system', 'campaign-test/trashcoverage2_green', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  -- The admin's own organization where the admin is the owner (their workspace).
  select om.organization_id into v_org
    from iam.organization_member om join iam.organizations o on o.id = om.organization_id
   where om.user_id = c_admin and o.archived_at is null and om.role = 'owner'
   order by om.organization_id limit 1;

  -- ── PART A ──────────────────────────────────────────────────────────────────────────────────
  foreach v_tok in array c_kinds loop
    begin
      perform set_config('role', 'postgres', true);
      select * into v_e from platform.entity_types where token = v_tok;
      if v_e.user_artifact_kind is null or not v_e.is_active then
        raise exception 'not in Trash: platform.entity_types.user_artifact_kind is empty';
      end if;

      v_id := null; v_from_archived := false;
      case v_tok
        when 'folder' then
          select f.id into v_id from files.folders f
           where f.created_by = c_admin and f.deleted_at is null and not coalesce(f.is_system, false)
             and not exists (select 1 from files.folders c where c.parent_id = f.id)
           order by f.id limit 1;
        when 'category' then
          select c.id into v_id from platform.categories c
           where c.created_by = c_admin and c.deleted_at is null and not c.is_system
             and not exists (select 1 from platform.categories k where k.parent_id = c.id and k.deleted_at is null)
           order by c.id limit 1;
        when 'scope_type' then
          select t.id into v_id from context.scope_types t
           where t.created_by = c_admin and t.deleted_at is null and t.organization_id = v_org
           order by t.id limit 1;
        when 'scope' then
          select s.id into v_id from context.scopes s join context.scope_types t on t.id = s.scope_type_id
           where s.created_by = c_admin and s.deleted_at is null and t.deleted_at is null
             and exists (select 1 from iam.memberships m
                          where m.container_type = 'organization' and m.container_id = s.organization_id
                            and m.user_id = c_admin and m.role in ('owner', 'admin')
                            and m.status = 'active' and m.deleted_at is null)
             and not exists (select 1 from context.scopes k where k.parent_scope_id = s.id and k.deleted_at is null)
           order by s.id limit 1;
        when 'context_item' then
          select ci.id into v_id from context.context_items ci join context.scope_types t on t.id = ci.scope_type_id
           where ci.created_by = c_admin and ci.deleted_at is null and ci.is_active and t.deleted_at is null
             and t.organization_id = v_org
           order by ci.id limit 1;
        when 'hr_employee', 'hr_employment' then
          null;  -- HR archives only through its own engine; start from an archived row below.
        when 'processed_document' then
          -- a library document removed on its own (its file stays), the library's own remove
          select d.id into v_id from docproc.processed_documents d
           where d.owner_id = c_admin and d.deleted_at is null
             and d.derivation_kind not in ('initial_extract', 'legacy_import')
             and not exists (select 1 from docproc.processed_documents p where p.id = d.parent_processed_id and p.deleted_at is not null)
           order by d.id limit 1;
        else
          execute format('select id from %I.%I where created_by = $1 and deleted_at is null order by id limit 1',
                         v_e.schema_name, v_e.table_name) into v_id using c_admin;
      end case;

      if v_id is null then
        execute format('select id from %I.%I where %I = $1 and deleted_at is not null order by deleted_at desc, id limit 1',
                       v_e.schema_name, v_e.table_name, coalesce(v_e.retention_owner_column, 'created_by'))
          into v_id using c_admin;
        v_from_archived := v_id is not null;
      end if;
      if v_id is null then
        case v_tok
          when 'user_memory' then
            insert into users.user_memory (path, content, organization_id, created_by)
            values ('/preferences/invoice-format', 'Supplier invoices are filed by vendor, newest first.', v_org, c_admin)
            returning id into v_id;
          when 'wbx_highlight' then
            insert into extend.wbx_highlight (url, domain, page_title, text, organization_id, created_by)
            values ('https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.134', 'www.osha.gov',
                    'Respiratory protection standard', 'fit testing is required annually', v_org, c_admin)
            returning id into v_id;
          else
            raise exception 'the admin owns no row of this kind and the suite has no fixture for it';
        end case;
      end if;

      if not v_from_archived then
        execute format('select to_jsonb(t) from %I.%I t where id = $1', v_e.schema_name, v_e.table_name)
          into v_before using v_id;
        -- The screen's archive, from the person's seat.
        perform set_config('role', 'authenticated', true);
        case v_tok
          when 'folder' then perform public.soft_delete_folder(v_id);
          when 'scope_type' then perform public.delete_scope_type(v_id);
          when 'scope' then perform public.delete_scope(v_id);
          when 'context_item' then perform public.delete_context_item(v_id);
          when 'rulebook' then perform public.rulebook_archive(v_id);
          when 'category' then
            perform public.cat_archive((select c.dimension from platform.categories c where c.id = v_id), v_id);
          when 'flexible_data' then
            perform public.flexible_data_archive((v_before ->> 'organization_id')::uuid, v_id);
          when 'processed_document' then perform rag.fn_delete_library_document(v_id);
          else
            execute format('update %I.%I set deleted_at = now() where id = $1 and deleted_at is null',
                           v_e.schema_name, v_e.table_name) using v_id;
            get diagnostics v_n = row_count;
            if v_n <> 1 then
              raise exception 'the admin could not archive their own row % (RLS refused)', v_id;
            end if;
        end case;
      end if;

      perform set_config('role', 'authenticated', true);
      select exists (select 1 from public.trash_list(array[v_e.user_artifact_kind], 1000, 0) x where x.id = v_id)
        into v_ok;
      if not v_ok then
        raise exception 'archived row % is not in Trash', v_id;
      end if;

      if not public.entity_undelete(v_tok, v_id) then
        raise exception 'Trash restore of % answered false', v_id;
      end if;

      select exists (select 1 from public.trash_list(array[v_e.user_artifact_kind], 1000, 0) x where x.id = v_id)
        into v_ok;
      if v_ok then
        raise exception 'restored row % is still in Trash', v_id;
      end if;

      perform set_config('role', 'postgres', true);
      execute format('select to_jsonb(t) from %I.%I t where id = $1', v_e.schema_name, v_e.table_name)
        into v_after using v_id;
      if (v_after ->> 'deleted_at') is not null then
        raise exception 'restored row % is still archived', v_id;
      end if;
      if not v_from_archived then
        select coalesce(array_agg(k order by k), '{}') into v_diff
          from (select key k from jsonb_each(v_before) b
                 where b.value is distinct from (v_after -> b.key)
                   and not (b.key = any (c_stamps))) d;
        if cardinality(v_diff) > 0 then
          raise exception 'restored row % differs from what was archived in: %', v_id, array_to_string(v_diff, ', ');
        end if;
      end if;

      v_pass := v_pass + 1;
      raise notice 'ok  % (%)', v_tok, case when v_from_archived then 'from an archived row' else 'archive -> Trash -> restore' end;
    exception when others then
      perform set_config('role', 'postgres', true);
      v_fail := v_fail || format('%s: %s', v_tok, sqlerrm);
      raise notice 'RED %: %', v_tok, sqlerrm;
    end;
  end loop;

  -- ── PART B ──────────────────────────────────────────────────────────────────────────────────
  -- B1: "Supplier invoices" holds "2026 Q3"; archiving the outer folder takes the inner one with it.
  begin
    perform set_config('role', 'postgres', true);
    insert into files.folders (folder_name, folder_path, created_by, organization_id)
    values ('Supplier invoices', 'tc2-supplier-invoices-' || substr(gen_random_uuid()::text, 1, 8), c_admin, v_org)
    returning id into v_a;
    insert into files.folders (folder_name, folder_path, parent_id, created_by, organization_id)
    values ('2026 Q3', 'tc2-supplier-invoices-q3-' || substr(gen_random_uuid()::text, 1, 8), v_a, c_admin, v_org)
    returning id into v_b;
    perform set_config('role', 'authenticated', true);
    perform public.soft_delete_folder(v_a);
    select x.title into v_title from public.trash_list(array['folder'], 1000, 0) x where x.id = v_b;
    if v_title is distinct from '2026 Q3 (in Supplier invoices)' then
      raise exception 'the inner folder reads % in Trash, not "2026 Q3 (in Supplier invoices)"', coalesce(v_title, '(absent)');
    end if;
    if not public.entity_undelete('folder', v_b) then raise exception 'restore of the inner folder answered false'; end if;
    perform set_config('role', 'postgres', true);
    if exists (select 1 from files.folders where id in (v_a, v_b) and deleted_at is not null) then
      raise exception 'restoring the inner folder did not bring both folders back';
    end if;
    v_pass := v_pass + 1; raise notice 'ok  B1 folder in folder';
  exception when others then
    perform set_config('role', 'postgres', true);
    v_fail := v_fail || format('B1 folder in folder: %s', sqlerrm); raise notice 'RED B1: %', sqlerrm;
  end;

  -- B2: scope type "Service areas" with the scope "North County" and the Field "Crew size".
  begin
    perform set_config('role', 'postgres', true);
    insert into context.scope_types (organization_id, label_singular, label_plural, slug, created_by)
    values (v_org, 'Service area', 'Service areas', 'service-areas-' || substr(gen_random_uuid()::text, 1, 8), c_admin)
    returning id into v_a;
    insert into context.scopes (organization_id, scope_type_id, name, created_by)
    values (v_org, v_a, 'North County', c_admin) returning id into v_b;
    insert into context.context_items (scope_type_id, display_name, key, created_by)
    values (v_a, 'Crew size', 'crew_size', c_admin) returning id into v_c;
    perform set_config('role', 'authenticated', true);
    perform public.delete_context_item(v_c);          -- the Field removed first (is_active = false) ...
    perform public.delete_scope_type(v_a);            -- ... then its whole scope type.
    select x.title into v_title from public.trash_list(array['scope'], 1000, 0) x where x.id = v_b;
    if v_title is distinct from 'North County (in Service areas)' then
      raise exception 'the scope reads % in Trash, not "North County (in Service areas)"', coalesce(v_title, '(absent)');
    end if;
    select x.title into v_title from public.trash_list(array['context_item'], 1000, 0) x where x.id = v_c;
    if v_title is distinct from 'Crew size (in Service areas)' then
      raise exception 'the Field reads % in Trash, not "Crew size (in Service areas)"', coalesce(v_title, '(absent)');
    end if;
    if not public.entity_undelete('context_item', v_c) then raise exception 'restore of the Field answered false'; end if;
    perform set_config('role', 'postgres', true);
    if exists (select 1 from context.scope_types where id = v_a and deleted_at is not null) then
      raise exception 'restoring the Field did not bring its scope type back';
    end if;
    if exists (select 1 from context.scopes where id = v_b and deleted_at is not null) then
      raise exception 'the scope archived with its scope type did not come back with it';
    end if;
    if not exists (select 1 from context.context_items where id = v_c and deleted_at is null and is_active) then
      raise exception 'the Field is not back in use (deleted_at clear, is_active on)';
    end if;
    v_pass := v_pass + 1; raise notice 'ok  B2 scope type, scope and Field';
  exception when others then
    perform set_config('role', 'postgres', true);
    v_fail := v_fail || format('B2 scope type: %s', sqlerrm); raise notice 'RED B2: %', sqlerrm;
  end;

  -- B3: a workflow with one active and one paused trigger; both come back as they were.
  begin
    perform set_config('role', 'postgres', true);
    select d.id into v_w from workflow.definition d
     where d.created_by = c_admin and d.deleted_at is null
       and not exists (select 1 from workflow.trigger t where t.definition_id = d.id)
     order by d.id limit 1;
    if v_w is null then raise exception 'the admin owns no workflow without triggers'; end if;
    insert into workflow.trigger (definition_id, name, kind, is_active, organization_id, created_by)
    values (v_w, 'Every weekday at 7', 'manual', true, (select organization_id from workflow.definition where id = v_w), c_admin)
    returning id into v_x;
    insert into workflow.trigger (definition_id, name, kind, is_active, organization_id, created_by)
    values (v_w, 'On new supplier invoice', 'manual', false, (select organization_id from workflow.definition where id = v_w), c_admin)
    returning id into v_d;
    perform set_config('role', 'authenticated', true);
    update workflow.definition set deleted_at = now() where id = v_w;
    select x.title into v_title from public.trash_list(array['workflow_trigger'], 1000, 0) x where x.id = v_x;
    if v_title is null or v_title not like 'Every weekday at 7 (in %)' then
      raise exception 'the trigger reads % in Trash, not "Every weekday at 7 (in <workflow>)"', coalesce(v_title, '(absent)');
    end if;
    if not public.entity_undelete('workflow_trigger', v_x) then raise exception 'restore of the trigger answered false'; end if;
    perform set_config('role', 'postgres', true);
    if exists (select 1 from workflow.definition where id = v_w and deleted_at is not null) then
      raise exception 'restoring the trigger did not bring its workflow back';
    end if;
    if not exists (select 1 from workflow.trigger where id = v_x and deleted_at is null and is_active)
       or not exists (select 1 from workflow.trigger where id = v_d and deleted_at is null and not is_active) then
      raise exception 'the triggers did not come back as they were (one active, one paused)';
    end if;
    v_pass := v_pass + 1; raise notice 'ok  B3 workflow and its triggers';
  exception when others then
    perform set_config('role', 'postgres', true);
    v_fail := v_fail || format('B3 workflow triggers: %s', sqlerrm); raise notice 'RED B3: %', sqlerrm;
  end;

  -- B4: Organization Trash restores a child folder through its parent.
  begin
    perform set_config('role', 'postgres', true);
    insert into files.folders (folder_name, folder_path, created_by, organization_id)
    values ('Crew timesheets', 'tc2-crew-timesheets-' || substr(gen_random_uuid()::text, 1, 8), c_admin, v_org)
    returning id into v_a;
    insert into files.folders (folder_name, folder_path, parent_id, created_by, organization_id)
    values ('September', 'tc2-crew-timesheets-sep-' || substr(gen_random_uuid()::text, 1, 8), v_a, c_admin, v_org)
    returning id into v_b;
    perform set_config('role', 'authenticated', true);
    perform public.soft_delete_folder(v_a);
    select x.title into v_title from public.org_trash_list(v_org, array['folder'], null, 1000, 0) x where x.id = v_b;
    if v_title is distinct from 'September (in Crew timesheets)' then
      raise exception 'Organization Trash reads % for the inner folder', coalesce(v_title, '(absent)');
    end if;
    v_res := public.org_trash_restore(v_org, 'folder', v_b);
    if not coalesce((v_res ->> 'restored')::boolean, false) then
      raise exception 'Organization Trash restore answered %', v_res;
    end if;
    perform set_config('role', 'postgres', true);
    if exists (select 1 from files.folders where id in (v_a, v_b) and deleted_at is not null) then
      raise exception 'Organization Trash restore of the inner folder did not bring both back';
    end if;
    -- and a second restore of the same row is refused honestly (it is no longer archived)
    perform set_config('role', 'authenticated', true);
    v_res := public.org_trash_restore(v_org, 'folder', v_a);
    if coalesce((v_res ->> 'restored')::boolean, true) then
      raise exception 'restoring an already-restored folder answered restored=true: %', v_res;
    end if;
    perform set_config('role', 'postgres', true);
    v_pass := v_pass + 1; raise notice 'ok  B4 Organization Trash, child through parent';
  exception when others then
    perform set_config('role', 'postgres', true);
    v_fail := v_fail || format('B4 organization trash: %s', sqlerrm); raise notice 'RED B4: %', sqlerrm;
  end;

  -- B5: a library document trashed with its file ("Brake pad spec sheet.pdf") comes back with the file.
  begin
    perform set_config('role', 'postgres', true);
    select d.id, f.id into v_a, v_b
      from docproc.processed_documents d
      join files.files f on f.id::text = d.source_id and f.deleted_at is null
     where d.owner_id = c_admin and d.deleted_at is null and d.source_kind = 'cld_file'
       and f.created_by = c_admin
       and d.parent_processed_id is null
       and not exists (select 1 from files.folders fo where fo.id = f.parent_folder_id and fo.deleted_at is not null)
     order by d.id limit 1;
    if v_a is null then raise exception 'the admin owns no library document with a live file'; end if;
    perform set_config('role', 'authenticated', true);
    update files.files set deleted_at = now() where id = v_b;
    select x.title into v_title from public.trash_list(array['processed_document'], 1000, 0) x where x.id = v_a;
    if v_title is null or v_title not like '% (in %)' then
      raise exception 'the library document reads % in Trash, not "<name> (in <file>)"', coalesce(v_title, '(absent)');
    end if;
    if not public.entity_undelete('processed_document', v_a) then raise exception 'restore answered false'; end if;
    perform set_config('role', 'postgres', true);
    if exists (select 1 from files.files where id = v_b and deleted_at is not null)
       or exists (select 1 from docproc.processed_documents where id = v_a and deleted_at is not null) then
      raise exception 'restoring the library document did not bring its file and itself back';
    end if;
    v_pass := v_pass + 1; raise notice 'ok  B5 library document with its file';
  exception when others then
    perform set_config('role', 'postgres', true);
    v_fail := v_fail || format('B5 library document: %s', sqlerrm); raise notice 'RED B5: %', sqlerrm;
  end;

  if cardinality(v_fail) > 0 then
    raise exception E'trashcoverage2_green: % of % checks failed:\n  %',
      cardinality(v_fail), cardinality(c_kinds) + 5, array_to_string(v_fail, E'\n  ');
  end if;
  raise notice 'ALL % CHECKS PASSED (trashcoverage2_green).', v_pass;
end
$t$;

rollback;
