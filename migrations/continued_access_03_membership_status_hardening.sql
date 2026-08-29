-- continued_access_03 — MEMBERSHIP-STATUS HARDENING.
--
-- RECORD of a live change applied via the Supabase MCP on 2026-08-29.
--
-- 🚨 WHY THIS EXISTS. `departed` is the FIRST non-active membership status this platform has ever
-- had. Every one of the 464 live rows was `status='active'` when this ran, so these predicates
-- select exactly what they selected before -- a provable no-op at the time of the change. They
-- exist because a membership read that forgets to filter `status` is, the day after
-- continued-access ships, a former employee who kept a lane nobody remembered to close.
--
-- The census that produced this list: every function whose prosrc names `iam.memberships` and
-- does NOT mention `status`. Of those, the ones that can match an ORGANISATION-container row are
-- below. Deliberately NOT changed:
--   * files.is_listable_for      -- matches container_type='file' only
--   * public.agx_get_user_shortcuts, get_project_members_with_users, get_user_hierarchy
--                                -- container_type='project'; covered instead by
--                                   continued_access_depart soft-deleting sub-container rows
--   * iam.membership_row_visible -- the memberships table's own RLS helper; a departed person
--                                   SEEING their own membership row is correct and wanted
--   * public.org_admin_remove_member -- an admin action on a named row, not a reach lane
--
-- 🚨 IDEMPOTENT. Each rewrite is skipped when the hardened predicate is already present, so a
-- re-apply is a clean no-op rather than an abort on a missing fragment.

do $$
declare
  v_pairs jsonb := jsonb_build_array(
    jsonb_build_object('fn','public.user_container_ids','args','text, text[]',
      'old','and m.user_id = (select auth.uid()) and m.deleted_at is null',
      'new','and m.user_id = (select auth.uid()) and m.deleted_at is null and m.status = ''active'''),
    jsonb_build_object('fn','public.mbr_count','args','text, uuid[]',
      'old','and me.user_id = (select auth.uid()) and me.deleted_at is null',
      'new','and me.user_id = (select auth.uid()) and me.deleted_at is null and me.status = ''active'''),
    jsonb_build_object('fn','iam.is_discoverable_base','args','uuid, text, uuid, permission_level, boolean',
      'old','and m.user_id = v_uid and m.deleted_at is null',
      'new','and m.user_id = v_uid and m.deleted_at is null and m.status = ''active''')
  );
  v_pair jsonb;
  v_def text;
begin
  for v_pair in select * from jsonb_array_elements(v_pairs) loop
    select pg_get_functiondef((v_pair->>'fn' || '(' || (v_pair->>'args') || ')')::regprocedure) into v_def;
    if position((v_pair->>'new') in v_def) > 0 then
      raise notice 'continued_access_03: % already hardened, skipping', v_pair->>'fn';
    elsif position((v_pair->>'old') in v_def) = 0 then
      raise exception 'continued_access_03 ABORTED: neither the original nor the hardened predicate found in % -- the function was rewritten by something else and must be re-checked by hand', v_pair->>'fn';
    else
      execute replace(v_def, v_pair->>'old', v_pair->>'new');
      raise notice 'continued_access_03: hardened %', v_pair->>'fn';
    end if;
  end loop;
end $$;

-- The two CRM scope-count readers: both join memberships on container_type='organization' with
-- no status filter, so a departed person's former employer would still appear in their CRM scope
-- list. Handled separately because crm_list_scope_counts has two overloads.
do $$
declare v_def text; v_fn text; v_old text; v_new text;
begin
  v_old := 'WHERE m.user_id = v_uid
      AND m.container_type = ''organization''';
  v_new := 'WHERE m.user_id = v_uid
      AND m.container_type = ''organization''
      AND m.deleted_at IS NULL AND m.status = ''active''';
  for v_fn in
    select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'crm_list_scope_counts'
  loop
    select pg_get_functiondef(v_fn::regprocedure) into v_def;
    if position(v_new in v_def) > 0 then
      raise notice 'continued_access_03: % already hardened, skipping', v_fn;
    elsif position(v_old in v_def) = 0 then
      raise exception 'continued_access_03 ABORTED: fragment missing in %', v_fn;
    else
      execute replace(v_def, v_old, v_new);
      raise notice 'continued_access_03: hardened %', v_fn;
    end if;
  end loop;

  v_old := 'ON m.container_id = o.id AND m.container_type = ''organization'' AND m.user_id = (select auth.uid())';
  v_new := v_old || ' AND m.deleted_at IS NULL AND m.status = ''active''';
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'crm_inbox_list_scope_counts';
  if position(v_new in v_def) > 0 then
    raise notice 'continued_access_03: crm_inbox_list_scope_counts already hardened, skipping';
  elsif position(v_old in v_def) = 0 then
    raise exception 'continued_access_03 ABORTED: fragment missing in crm_inbox_list_scope_counts';
  else
    execute replace(v_def, v_old, v_new);
  end if;
end $$;
