-- chair-step: lane TRASH-COVERAGE-2. Every archivable thing a person sees is in Trash: thirty more registry kinds get a Trash kind (rulebooks, folders, war rooms, threads, scope types, scopes, scope type Fields, working documents, memories, highlights, browser profiles, source libraries, study guides, topical maps, rank targets, HR employees and employment spells, jurisdiction decisions, blocklist entries, intake batches, decision interviews, run surfaces, workflow triggers, capture items, categories, flexible data, shared canvases, scheduled tasks, feedback, mandate notes). A child whose parent is archived is listed as "<title> (in <parent>)" and its restore brings the parent back first; kinds with their own restore door (folder, scope type, scope, context item, HR employee) are restored through it; a workflow's triggers now come back with it.
--
-- LANE TRASH-COVERAGE-2 (Unified Data System program, 2026-09-26).
--
-- THE LAW. Arman 2026-09-20 "Soft-delete everything important", and the Trash page's own promise
-- "Everything you've deleted, in one place": every archivable thing a person can see and archive is
-- findable in Trash by the person who may restore it. `pnpm check:trash-doors` (lane TRASH-TABLES)
-- found 31 kinds with archived rows, each "a person's thing, not yet in Trash". The chair's ruling: no
-- per-kind question — each gets a Trash kind with restore through its own door, obeying "access is
-- personal"; a child that only comes back with its parent is listed under the parent ("in <parent>")
-- with restore restoring the parent, never hidden.
--
-- WHAT THIS FILE DOES
--   1. platform.archived_parent_of(token, id) — THE parent primitive: the first ARCHIVED parent a row
--      only comes back with. Declared parents are platform.soft_delete_edge's cascade edges (what the
--      archive cascade and platform._guard_soft_delete_parent already read); four are coded in their
--      feature and named here (folder -> parent folder, file -> folder, employment -> employee,
--      workflow trigger -> workflow).
--   2. public._trash_kind_rows: such a row is titled "<title> (in <parent>)"; titles are capped at 200
--      characters and more descriptive columns are tried (page_title, subject_value, path, code, ...);
--      a scope type's Field (context.context_items, no organization_id) is listed in its scope type's
--      organization's Trash. public._trash_kind_counts counts it the same way.
--   3. public.entity_undelete / public.org_trash_restore: the parent first, through the same door; then
--      the kind's own door — public.restore_folder (subfolders and files), public.restore_scope_type,
--      NEW public.restore_scope (twin of delete_scope, same owner/admin rung), NEW
--      public.restore_context_item (twin of delete_context_item, same org-admin rung; is_active back
--      on), public.hr_employee_restore (HR's gate, same-act spells, audit) — never a raw update around a
--      door. org_trash_restore also stops trusting FOUND after EXECUTE (it never sets it): an
--      already-restored row now answers restored=false instead of writing an audit row about nothing.
--   4. workflow triggers: the archive cascade keeps each trigger's is_active in metadata and a new
--      restore trigger brings back exactly the triggers that archive took.
--   5. The 30 kinds (kind = registry token) and the label "Working Document" (the only plural label).
--
-- NOT A TRASH KIND, WITH ITS REASON (pnpm check:trash-doors lists it):
--   hr_leave_policy — no door archives a leave policy: HR ends one with hr.leave_policy_deactivate,
--   which sets is_active = false after deciding every balance on it (freeze / pay out / migrate). The
--   one archived row is the HRB-017 verification fixture (2026-08-28). A Trash restore could not undo a
--   payout, and there is no archive for it to undo.
--
-- Additive to data (no archived or live row changes); replaces five bodies (based-on below).
-- INVERSE: migrations/inverse/trashcoverage2_every_archivable_thing_a_person_sees_is_in_trash_down.sql
-- lane: TRASH-COVERAGE-2
-- based-on: public._trash_kind_rows(uuid, uuid, uuid, text[], integer, integer) e6d8b90bf07fcf6052f1525736ba3552ba3b7099678f0beec5ac662c10a5175d
-- based-on: public._trash_kind_counts(uuid, uuid, uuid) 5332918aa1089408732965042508b123d5114320d919006613c1975b6605b39c
-- based-on: public.org_trash_restore(uuid, text, uuid) 1eb037ba470713931d8cba9b6fd03cf9bfbc52dbb63b1cb9ee2de623ca47ad42
-- based-on: public.entity_undelete(text, uuid) 2f89ad2cdf21c70a4e315627c30755047775a961742f30a2b29835a514114b55
-- based-on: workflow._cascade_definition_soft_delete() b19b4dfef9fb09aac56d4446bba55a0a350f0fc0aed998b3093f6d63b6a83671

set local lock_timeout = '30s';

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- THE PARENT PRIMITIVE — which archived row a row only comes back with
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Declared parents are platform.soft_delete_edge's cascade edges (the same rows the archive cascade
-- and platform._guard_soft_delete_parent read). Four parents are coded in their feature instead of
-- declared, and are named here: a folder's parent folder (public.soft_delete_folder), a file's folder
-- (the same), an employment spell's employee (the HR archive stamps both), a workflow trigger's
-- workflow (workflow._cascade_definition_soft_delete). Returns the first ARCHIVED parent, or nothing.
create or replace function platform.archived_parent_of(p_token text, p_id uuid)
returns table(parent_token text, parent_id uuid, parent_title text)
language plpgsql
stable security definer
set search_path to 'pg_catalog'
as $function$
-- lane TRASH-COVERAGE-2
declare
  e record;
  s record;
  v_pid uuid;
  v_gone timestamptz;
  v_row jsonb;
  v_tcol text;
begin
  select t.schema_name, t.table_name into e from platform.entity_types t where t.token = p_token;
  if not found then return; end if;

  for s in
    select x.col, x.ptok, x.psch, x.ptbl, x.pcol
      from (
        select 'parent_id'::text as col, 'folder'::text as ptok, 'files'::text as psch, 'folders'::text as ptbl, 'id'::text as pcol, 1 as ord
         where p_token = 'folder'
        union all
        select 'parent_folder_id', 'folder', 'files', 'folders', 'id', 1 where p_token = 'file'
        union all
        select 'employee_id', 'hr_employee', 'hr', 'employee', 'id', 1 where p_token = 'hr_employment'
        union all
        select 'definition_id', 'workflow', 'workflow', 'definition', 'id', 1 where p_token = 'workflow_trigger'
        union all
        select d.child_column,
               (select t.token from platform.entity_types t
                 where t.schema_name = d.parent_schema and t.table_name = d.parent_table and t.is_active
                 order by (t.user_artifact_kind is null), t.token limit 1),
               d.parent_schema, d.parent_table, d.parent_column, 2
          from platform.soft_delete_edge d
         where d.child_schema = e.schema_name and d.child_table = e.table_name and d.action = 'cascade'
      ) x
     where x.ptok is not null
     order by x.ord, x.col
  loop
    begin
      execute format('select t.%I::uuid from %I.%I t where t.id = $1', s.col, e.schema_name, e.table_name)
        into v_pid using p_id;
      continue when v_pid is null;
      v_gone := null;
      execute format('select t.deleted_at, to_jsonb(t) from %I.%I t where t.%I = $1', s.psch, s.ptbl, s.pcol)
        into v_gone, v_row using v_pid;
      continue when v_gone is null;
      select t.title_column into v_tcol from platform.entity_types t where t.token = s.ptok;
      parent_token := s.ptok;
      parent_id := coalesce(nullif(v_row ->> 'id', '')::uuid, v_pid);
      parent_title := left(coalesce(nullif(btrim(v_row ->> coalesce(v_tcol, '')), ''),
                                    nullif(btrim(v_row ->> 'name'), ''),
                                    nullif(btrim(v_row ->> 'title'), ''),
                                    nullif(btrim(v_row ->> 'label'), ''),
                                    nullif(btrim(v_row ->> 'display_name'), ''),
                                    nullif(btrim(v_row ->> 'folder_name'), ''),
                                    nullif(btrim(v_row ->> 'label_plural'), '')), 200);
      return next;
      return;
    exception when undefined_column or undefined_table or invalid_text_representation then
      continue;
    end;
  end loop;
end;
$function$;

revoke all on function platform.archived_parent_of(text, uuid) from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- TWO RESTORE DOORS THE ARCHIVE DOORS NEVER HAD
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- public.delete_scope and public.delete_context_item archive at the organization owner/admin rung;
-- each gets its twin at the same rung (public.restore_scope_type is the precedent: "restoring is as
-- consequential as removing").
create or replace function public.restore_scope(p_scope_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
-- lane TRASH-COVERAGE-2. The twin of public.delete_scope. Clearing the scope's deleted_at is the whole
-- restore: platform._cascade_soft_delete brings back every child scope stamped with THIS removal's
-- timestamp and leaves anything removed separately removed. A scope whose scope type is archived is
-- refused by platform._guard_soft_delete_parent (restore the scope type first; Trash does that).
declare
  v_org uuid;
  v_removed_at timestamptz;
  v_child_count integer;
begin
  select scope.organization_id, scope.deleted_at
    into v_org, v_removed_at
    from context.scopes as scope
   where scope.id = p_scope_id
     and scope.deleted_at is not null;

  if v_org is null then
    perform platform.refuse_not_found('scope not found, or it was never removed');
  end if;

  if auth.role() <> 'service_role'
     and not public.is_platform_admin()
     and not exists (
       select 1
         from iam.memberships as membership
        where membership.container_type = 'organization'
          and membership.container_id = v_org
          and membership.organization_id = v_org
          and membership.user_id = (select auth.uid())
          and membership.role in ('owner', 'admin')
          and membership.status = 'active'
          and membership.deleted_at is null
     ) then
    raise exception 'organization owner or admin required'
      using errcode = '42501';
  end if;

  select count(*) into v_child_count
    from context.scopes as scope
   where scope.parent_scope_id = p_scope_id
     and scope.deleted_at = v_removed_at;

  update context.scopes
     set deleted_at = null,
         updated_by = (select auth.uid()),
         updated_at = now()
   where id = p_scope_id;

  return jsonb_build_object('restored_children', v_child_count);
end;
$function$;

create or replace function public.restore_context_item(p_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
-- lane TRASH-COVERAGE-2. The twin of public.delete_context_item, at its rung (an admin of the scope
-- type's organization). delete_context_item sets deleted_at AND is_active = false, so the restore
-- clears both: the Field comes back in use. It also finishes a Field that already came back with its
-- scope type (deleted_at clear, is_active still false from the old one-way archive).
declare
  v_org uuid;
  v_live boolean;
  v_result jsonb;
begin
  select st.organization_id, (ci.deleted_at is null and ci.is_active)
    into v_org, v_live
    from context.context_items ci
    join context.scope_types st on st.id = ci.scope_type_id
   where ci.id = p_item_id;

  if v_org is null then
    perform platform.refuse_not_found(format('context item %s not found', p_item_id));
  end if;
  if v_live then
    return jsonb_build_object('id', p_item_id, 'restored', false, 'detail', 'It is already in use.');
  end if;

  if (auth.role() = 'service_role' or iam.has_org_admin(v_org)) is not true then
    raise exception 'organization admin required for %', v_org
      using errcode = '42501';
  end if;

  update context.context_items
     set deleted_at = null,
         is_active = true,
         updated_at = now()
   where id = p_item_id
  returning jsonb_build_object('id', id, 'restored', true) into v_result;

  return v_result;
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- DOOR ROWS for the two new client doors and the server-only primitive
-- ─────────────────────────────────────────────────────────────────────────────────────────────
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
select d.schema_name, d.function_name, iam.door_identity_args(d.fn), d.argtypes, d.reason,
       'migrations/campaign/trashcoverage2_every_archivable_thing_a_person_sees_is_in_trash.sql (lane TRASH-COVERAGE-2)',
       d.non_client_lane, d.non_client_lane is null, false
  from (values
    ('public', 'restore_scope', 'public.restore_scope(uuid)'::regprocedure,
     array['uuid'::regtype::oid],
     'The undo half of delete_scope, called from Trash through entity_undelete / org_trash_restore. SECURITY DEFINER; p_scope_id must be an archived scope of an organization the caller owns or administers (iam.memberships owner/admin, or a platform admin), 42501 otherwise. Clears deleted_at; the declared cascade brings back child scopes archived in the same act.',
     null::text),
    ('public', 'restore_context_item', 'public.restore_context_item(uuid)'::regprocedure,
     array['uuid'::regtype::oid],
     'The undo half of delete_context_item, called from Trash through entity_undelete / org_trash_restore. SECURITY DEFINER; p_item_id must be a context item of a scope type whose organization the caller administers (iam.has_org_admin), 42501 otherwise. Clears deleted_at and sets is_active back on.',
     null::text),
    ('platform', 'archived_parent_of', 'platform.archived_parent_of(text, uuid)'::regprocedure,
     array['text'::regtype::oid, 'uuid'::regtype::oid],
     'Names the archived parent (token, id, title) a row only comes back with: platform.soft_delete_edge cascade edges plus the four feature-coded parents. Reads only.',
     'server_only: called only inside public._trash_kind_rows, public.entity_undelete and public.org_trash_restore, which decide the caller''s access themselves; execute is revoked from every client role.')
  ) as d(schema_name, function_name, fn, argtypes, reason, non_client_lane)
 where not exists (select 1 from platform.client_callable_door x
                    where x.schema_name = d.schema_name and x.function_name = d.function_name
                      and x.identity_argtypes = d.argtypes);

revoke all on function public.restore_scope(uuid) from public, anon;
revoke all on function public.restore_context_item(uuid) from public, anon;
grant execute on function public.restore_scope(uuid) to authenticated, service_role;
grant execute on function public.restore_context_item(uuid) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────────────────────

create or replace function public._trash_kind_rows(p_uid uuid, p_org uuid, p_member uuid, p_kinds text[], p_limit integer, p_offset integer)
 RETURNS TABLE(artifact_kind text, entity_token text, label text, id uuid, title text, deleted_at timestamp with time zone, organization_id uuid, is_mine boolean, owner_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- lane TRASH-2. The person (personal mode) or the organization (organization mode, gated by the
-- caller) is the filter; there is no per-row access check and no organization-wide walk here.
-- lane TRASH-TABLES: the record store's Tables and Records, after the registry kinds.
-- lane TRASH-COVERAGE-2: a row whose parent is archived (platform.archived_parent_of) is titled
-- "<title> (in <parent>)" — it is listed, never hidden, and its restore brings the parent back first.
-- A scope type's Field (context_item) carries no organization_id; in organization mode its
-- organization is its scope type's.
declare
  rec record;
  v_rel regclass;
  v_title text;
  v_org text;
  v_cols text;
  v_limit int := least(greatest(coalesce(p_limit, 200), 1), 1000);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_window int;
  v_title_expr text;
  v_parented boolean;
begin
  if p_uid is null then return; end if;
  v_window := v_limit + v_offset;

  for rec in
    select e.token, e.user_artifact_kind as kind, e.label,
           e.schema_name as sch, e.table_name as tbl,
           coalesce(e.retention_owner_column, 'created_by') as owner_col,
           e.title_column, e.feature_owned_restore
      from platform.entity_types e
     where e.user_artifact_kind is not null
       and e.is_active
       and (p_kinds is null or e.user_artifact_kind = any(p_kinds))
     order by e.user_artifact_kind
  loop
    begin
      v_rel := to_regclass(format('%I.%I', rec.sch, rec.tbl));
      if v_rel is null then continue; end if;

      if rec.token = 'credential_item' and rec.feature_owned_restore then
        -- Vault credentials: the owner's own, only. Organization mode never lists them.
        if p_org is not null then continue; end if;
        return query execute format(
          'select %L::text, %L::text, %L::text, t.id, t.display_name::text,
                  t.deleted_at, t.organization_id, true, t.user_id
             from users.credential_items t
            where t.user_id = $1 and t.deleted_at is not null
            order by t.deleted_at desc, t.id
            limit %s offset %s',
          rec.kind, rec.token, rec.label, v_limit, v_offset)
          using p_uid;
        continue;
      end if;

      v_title := null;
      select a.attname into v_title
        from pg_attribute a
       where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped
         and a.attname = coalesce(rec.title_column, '')
       limit 1;
      if v_title is null then
        select a.attname into v_title
          from pg_attribute a
         where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped
           and a.attname = any (array['name','title','label','display_name','file_name','folder_name','page_title','subject_value','target_domain','jurisdiction_key','path','code','label_plural','body','description'])
         order by array_position(array['name','title','label','display_name','file_name','folder_name','page_title','subject_value','target_domain','jurisdiction_key','path','code','label_plural','body','description'], a.attname::text)
         limit 1;
      end if;
      v_org := null;
      select a.attname into v_org
        from pg_attribute a
       where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped
         and a.attname = 'organization_id'
       limit 1;

      v_title_expr := case when v_title is null then 'null::text' else format('left(t.%I::text, 200)', v_title) end;
      v_parented := rec.token in ('folder', 'file', 'hr_employment', 'workflow_trigger')
        or exists (select 1 from platform.soft_delete_edge s
                    where s.child_schema = rec.sch and s.child_table = rec.tbl and s.action = 'cascade');
      if v_parented then
        v_title_expr := format(
          'coalesce((select coalesce(nullif(btrim(%1$s), ''''), ''Untitled'') || '' (in '' || '
          || 'coalesce(nullif(btrim(ap.parent_title), ''''), ''an archived item'') || '')'' '
          || 'from platform.archived_parent_of(%2$L, t.id) ap limit 1), %1$s)',
          v_title_expr, rec.token);
      end if;

      if rec.token = 'context_item' and p_org is not null then
        return query execute format(
          'select %L::text, %L::text, %L::text, t.id, %s, t.deleted_at, st.organization_id, (t.%I = $1), t.%I
             from context.context_items t
             join context.scope_types st on st.id = t.scope_type_id
            where st.organization_id = $2 and t.deleted_at is not null
              and ($3::uuid is null or t.%I = $3)
            order by t.deleted_at desc, t.id
            limit %s offset %s',
          rec.kind, rec.token, rec.label, v_title_expr, rec.owner_col, rec.owner_col, rec.owner_col,
          v_limit, v_offset)
          using p_uid, p_org, p_member;
        continue;
      end if;

      if p_org is not null and v_org is null then continue; end if;

      v_cols := format('%L::text, %L::text, %L::text, t.id, %s, t.deleted_at, %s, (t.%I = $1), t.%I',
        rec.kind, rec.token, rec.label,
        v_title_expr,
        case when v_org is null then 'null::uuid' else format('t.%I', v_org) end,
        rec.owner_col, rec.owner_col);

      if p_org is null then
        -- PERSONAL: what I own, plus what was named to me. Each branch is its own indexed read.
        return query execute format(
          'select * from (
             (select %1$s from %2$I.%3$I t
               where t.%4$I = $1 and t.deleted_at is not null
               order by t.deleted_at desc, t.id limit %5$s)
             union all
             (select %1$s from %2$I.%3$I t
               where t.deleted_at is not null
                 and t.%4$I is distinct from $1
                 and t.id in (select g.resource_id from iam.permissions g
                               where g.granted_to_user_id = $1
                                 and g.resource_type = %6$L
                                 and coalesce(g.status, ''active'') <> ''rejected''
                                 and (g.expires_at is null or g.expires_at > now()))
               order by t.deleted_at desc, t.id limit %5$s)
           ) x
           order by x.deleted_at desc, x.id
           limit %7$s offset %8$s',
          v_cols, rec.sch, rec.tbl, rec.owner_col, v_window, rec.token, v_limit, v_offset)
          using p_uid;
      else
        -- ORGANIZATION: this organization's archived rows, optionally one member's. The caller gated it.
        -- A PERSONAL row (visibility = personal) belongs to its owner alone — a member's private
        -- highlight or note never shows in the organization's Trash (verify RC-B11 round 3; access
        -- is personal, Arman 2026-09-23). Its owner still sees it in their own Trash.
        return query execute format(
          'select %1$s from %2$I.%3$I t
            where t.%4$I = $2 and t.deleted_at is not null
              and ($3::uuid is null or t.%5$I = $3)
              and (not %8$L::boolean or t.visibility is distinct from ''personal'' or t.%5$I = $1)
            order by t.deleted_at desc, t.id
            limit %6$s offset %7$s',
          v_cols, rec.sch, rec.tbl, v_org, rec.owner_col, v_limit, v_offset, iam.table_has_visibility(rec.sch, rec.tbl))
          using p_uid, p_org, p_member;
      end if;
    exception when undefined_table or undefined_column or insufficient_privilege then continue;
    end;
  end loop;

  -- ── THE RECORD STORE (lane TRASH-TABLES) ────────────────────────────────────────────────────
  -- One physical table (custom.record) holds every Table and Record, so the registry loop above
  -- cannot describe them. Same two modes, same person/organization filter, restored by
  -- custom.record_restore through entity_undelete / org_trash_restore (token `record`).
  if to_regclass('custom.record') is null then return; end if;

  if p_kinds is null or 'table' = any (p_kinds) then
    if p_org is null then
      return query
      select 'table'::text, 'record'::text, 'Table'::text, x.id,
             coalesce(nullif(btrim(x.data ->> 'name'), ''), 'Untitled table'),
             x.deleted_at, x.organization_id, (x.created_by = p_uid), x.created_by
        from (
          (select t.id, t.data, t.deleted_at, t.organization_id, t.created_by
             from custom.record t
            where t.created_by = p_uid and t.data_class = 'table' and t.deleted_at is not null
            order by t.deleted_at desc, t.id limit v_window)
          union all
          (select t.id, t.data, t.deleted_at, t.organization_id, t.created_by
             from custom.record t
            where t.data_class = 'table' and t.deleted_at is not null
              and t.created_by is distinct from p_uid
              and t.id in (select g.resource_id from iam.permissions g
                            where g.granted_to_user_id = p_uid
                              and g.resource_type = 'record'
                              and coalesce(g.status, 'active') <> 'rejected'
                              and (g.expires_at is null or g.expires_at > now()))
            order by t.deleted_at desc, t.id limit v_window)
        ) x
       order by x.deleted_at desc, x.id
       limit v_limit offset v_offset;
    else
      return query
      select 'table'::text, 'record'::text, 'Table'::text, t.id,
             coalesce(nullif(btrim(t.data ->> 'name'), ''), 'Untitled table'),
             t.deleted_at, t.organization_id, (t.created_by = p_uid), t.created_by
        from custom.record t
       where t.organization_id = p_org and t.data_class = 'table' and t.deleted_at is not null
         and (p_member is null or t.created_by = p_member)
       order by t.deleted_at desc, t.id
       limit v_limit offset v_offset;
    end if;
  end if;

  if p_kinds is null or 'record' = any (p_kinds) then
    -- A Record archived on its own, while its Table is live. One inside an archived Table comes
    -- back with the Table, so it is not a second Trash row.
    return query
    select 'record'::text, 'record'::text, 'Record'::text, y.id,
           format('%s (in %s)',
                  coalesce(nullif(btrim(custom.record_words(y.organization_id, y.id)), ''), 'Untitled record'),
                  coalesce(nullif(btrim(y.table_name), ''), 'a table')),
           y.deleted_at, y.organization_id, (y.created_by = p_uid), y.created_by
      from (
        select x.id, x.deleted_at, x.organization_id, x.created_by, x.table_name
          from (
            (select r.id, r.deleted_at, r.organization_id, r.created_by, t.data ->> 'name' as table_name
               from custom.record r
               join custom.record t
                 on t.organization_id = r.organization_id and t.id = r.table_id
                and t.data_class = 'table' and t.deleted_at is null
              where p_org is null
                and r.created_by = p_uid and r.data_class = 'record' and r.deleted_at is not null
              order by r.deleted_at desc, r.id limit v_window)
            union all
            (select r.id, r.deleted_at, r.organization_id, r.created_by, t.data ->> 'name'
               from custom.record r
               join custom.record t
                 on t.organization_id = r.organization_id and t.id = r.table_id
                and t.data_class = 'table' and t.deleted_at is null
              where p_org is null
                and r.data_class = 'record' and r.deleted_at is not null
                and r.created_by is distinct from p_uid
                and r.id in (select g.resource_id from iam.permissions g
                              where g.granted_to_user_id = p_uid
                                and g.resource_type = 'record'
                                and coalesce(g.status, 'active') <> 'rejected'
                                and (g.expires_at is null or g.expires_at > now()))
              order by r.deleted_at desc, r.id limit v_window)
            union all
            (select r.id, r.deleted_at, r.organization_id, r.created_by, t.data ->> 'name'
               from custom.record r
               join custom.record t
                 on t.organization_id = r.organization_id and t.id = r.table_id
                and t.data_class = 'table' and t.deleted_at is null
              where p_org is not null
                and r.organization_id = p_org and r.data_class = 'record' and r.deleted_at is not null
                and (p_member is null or r.created_by = p_member)
              order by r.deleted_at desc, r.id limit v_window)
          ) x
         order by x.deleted_at desc, x.id
         limit v_limit offset v_offset
      ) y
     order by y.deleted_at desc, y.id;
  end if;
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────

create or replace function public._trash_kind_counts(p_uid uuid, p_org uuid, p_member uuid)
 RETURNS TABLE(artifact_kind text, label text, n bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- lane TRASH-2. Mirrors public._trash_kind_rows row for row; no per-row access check.
-- lane TRASH-TABLES: the record store's Tables and Records, after the registry kinds.
-- lane TRASH-COVERAGE-2: context_item's organization is its scope type's (it has no organization_id).
declare
  rec record;
  v_rel regclass;
  v_org text;
  v_n bigint;
begin
  if p_uid is null then return; end if;

  for rec in
    select e.token, e.user_artifact_kind as kind, e.label,
           e.schema_name as sch, e.table_name as tbl,
           coalesce(e.retention_owner_column, 'created_by') as owner_col,
           e.feature_owned_restore
      from platform.entity_types e
     where e.user_artifact_kind is not null and e.is_active
     order by e.user_artifact_kind
  loop
    begin
      v_rel := to_regclass(format('%I.%I', rec.sch, rec.tbl));
      if v_rel is null then continue; end if;
      v_n := 0;

      if rec.token = 'credential_item' and rec.feature_owned_restore then
        if p_org is not null then continue; end if;
        select count(*) into v_n from users.credential_items t
         where t.user_id = p_uid and t.deleted_at is not null;
      else
        v_org := null;
        select a.attname into v_org
          from pg_attribute a
         where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped
           and a.attname = 'organization_id'
         limit 1;
        if p_org is null then
          execute format(
            'select (select count(*) from %1$I.%2$I t where t.%3$I = $1 and t.deleted_at is not null)
                  + (select count(*) from %1$I.%2$I t
                      where t.deleted_at is not null and t.%3$I is distinct from $1
                        and t.id in (select g.resource_id from iam.permissions g
                                      where g.granted_to_user_id = $1
                                        and g.resource_type = %4$L
                                        and coalesce(g.status, ''active'') <> ''rejected''
                                        and (g.expires_at is null or g.expires_at > now())))',
            rec.sch, rec.tbl, rec.owner_col, rec.token)
            into v_n using p_uid;
        elsif rec.token = 'context_item' then
          select count(*) into v_n
            from context.context_items t
            join context.scope_types st on st.id = t.scope_type_id
           where st.organization_id = p_org and t.deleted_at is not null
             and (p_member is null or t.created_by = p_member);
        else
          if v_org is null then continue; end if;
          execute format(
            'select count(*) from %1$I.%2$I t
              where t.%3$I = $1 and t.deleted_at is not null
                and ($2::uuid is null or t.%4$I = $2)',
            rec.sch, rec.tbl, v_org, rec.owner_col)
            into v_n using p_org, p_member;
        end if;
      end if;

      if v_n > 0 then
        artifact_kind := rec.kind; label := rec.label; n := v_n; return next;
      end if;
    exception when undefined_table or undefined_column or insufficient_privilege then continue;
    end;
  end loop;

  -- ── THE RECORD STORE (lane TRASH-TABLES) — the same predicates as _trash_kind_rows ──────────
  if to_regclass('custom.record') is null then return; end if;

  if p_org is null then
    select (select count(*) from custom.record t
             where t.created_by = p_uid and t.data_class = 'table' and t.deleted_at is not null)
         + (select count(*) from custom.record t
             where t.data_class = 'table' and t.deleted_at is not null
               and t.created_by is distinct from p_uid
               and t.id in (select g.resource_id from iam.permissions g
                             where g.granted_to_user_id = p_uid and g.resource_type = 'record'
                               and coalesce(g.status, 'active') <> 'rejected'
                               and (g.expires_at is null or g.expires_at > now())))
      into v_n;
  else
    select count(*) into v_n from custom.record t
     where t.organization_id = p_org and t.data_class = 'table' and t.deleted_at is not null
       and (p_member is null or t.created_by = p_member);
  end if;
  if v_n > 0 then
    artifact_kind := 'table'; label := 'Table'; n := v_n; return next;
  end if;

  if p_org is null then
    select (select count(*) from custom.record r
              join custom.record t on t.organization_id = r.organization_id and t.id = r.table_id
                                  and t.data_class = 'table' and t.deleted_at is null
             where r.created_by = p_uid and r.data_class = 'record' and r.deleted_at is not null)
         + (select count(*) from custom.record r
              join custom.record t on t.organization_id = r.organization_id and t.id = r.table_id
                                  and t.data_class = 'table' and t.deleted_at is null
             where r.data_class = 'record' and r.deleted_at is not null
               and r.created_by is distinct from p_uid
               and r.id in (select g.resource_id from iam.permissions g
                             where g.granted_to_user_id = p_uid and g.resource_type = 'record'
                               and coalesce(g.status, 'active') <> 'rejected'
                               and (g.expires_at is null or g.expires_at > now())))
      into v_n;
  else
    select count(*) into v_n from custom.record r
      join custom.record t on t.organization_id = r.organization_id and t.id = r.table_id
                          and t.data_class = 'table' and t.deleted_at is null
     where r.organization_id = p_org and r.data_class = 'record' and r.deleted_at is not null
       and (p_member is null or r.created_by = p_member);
  end if;
  if v_n > 0 then
    artifact_kind := 'record'; label := 'Record'; n := v_n; return next;
  end if;
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────

create or replace function public.org_trash_restore(p_organization_id uuid, p_token text, p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- lane TRASH-2. An owner or admin of the organization restores one member's archived item that sits
-- in THIS organization. One audit row (iam.org_admin_audit, action trash.restore) and, when the item
-- is somebody else's, an in-app notice to its owner. Never a purge.
-- lane TRASH-TABLES: a record-store Table or Record (token `record`) is restored by
-- custom.record_restore, which asks the store's own ladder for the caller and brings back exactly what
-- its archive took; a refusal is returned as restored=false with the store's sentence.
-- lane TRASH-COVERAGE-2: a row whose parent is archived brings the parent back first, through this
-- same door (audited and noticed as the parent). Kinds with their own restore door go through it:
-- folder (public.restore_folder), scope type (public.restore_scope_type), scope (public.restore_scope),
-- scope type Field (public.restore_context_item), HR employee (public.hr_employee_restore); a door's
-- refusal is restored=false with a sentence, never a raw update around it.
declare
  v_me uuid := public._org_trash_gate(p_organization_id);
  e record;
  v_rel regclass;
  v_title_col text;
  v_owner uuid;
  v_title text;
  v_label text;
  v_me_name text;
  v_org_name text;
  v_subject text;
  v_body text;
  v_class text;
  v_i int;
  v_ptok text;
  v_pid uuid;
  v_ptitle text;
  v_via_parent boolean := false;
  v_res jsonb;
  v_at timestamptz;
  v_title_expr text;
  v_found boolean;
  v_n int;
begin
  if p_token = 'record' then
    select r.created_by, r.data_class,
           case when r.data_class = 'table'
                then coalesce(nullif(btrim(r.data ->> 'name'), ''), 'Untitled table')
                else coalesce(nullif(btrim(custom.record_words(r.organization_id, r.id)), ''), 'Untitled record') end
      into v_owner, v_class, v_title
      from custom.record r
     where r.organization_id = p_organization_id and r.id = p_id
       and r.deleted_at is not null and r.data_class in ('table', 'record');
    if not found then
      return jsonb_build_object('restored', false,
        'message', 'It is no longer in this organization''s Trash — somebody may have restored it already.');
    end if;
    begin
      perform custom.record_restore(p_organization_id, p_id);
    exception when insufficient_privilege then
      return jsonb_build_object('restored', false,
        'message', format('Only someone who can edit %s can bring it back. Its owner can restore it from their own Trash.',
                          coalesce(nullif(btrim(v_title), ''), 'it')));
    end;
    v_label := case when v_class = 'table' then 'Table' else 'Record' end;
    select 'record'::text as token, v_label as label into e;
  else
    select t.token, t.user_artifact_kind, t.label, t.schema_name, t.table_name,
           coalesce(t.retention_owner_column, 'created_by') as owner_col, t.title_column, t.feature_owned_restore
      into e
      from platform.entity_types t
     where t.token = p_token and t.is_active and t.user_artifact_kind is not null;
    if not found then
      raise exception 'That kind of item is not in Trash.' using errcode = '22023';
    end if;
    if coalesce(e.feature_owned_restore, false) or e.token in ('credential_item', 'user_secret', 'credential_attachment') then
      raise exception 'Vault items are restored by their owner from their own Trash.' using errcode = '42501';
    end if;
    v_rel := to_regclass(format('%I.%I', e.schema_name, e.table_name));
    if v_rel is null then
      raise exception 'That kind of item is not in Trash.' using errcode = '22023';
    end if;

    select a.attname into v_title_col from pg_attribute a
     where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped
       and a.attname = coalesce(e.title_column, '') limit 1;
    if v_title_col is null then
      select a.attname into v_title_col from pg_attribute a
       where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped
         and a.attname = any (array['name','title','label','display_name','file_name','folder_name','page_title','subject_value','target_domain','jurisdiction_key','path','code','label_plural','body','description'])
       order by array_position(array['name','title','label','display_name','file_name','folder_name','page_title','subject_value','target_domain','jurisdiction_key','path','code','label_plural','body','description'], a.attname::text)
       limit 1;
    end if;

    v_title_expr := case when v_title_col is null then 'null::text' else format('left(t.%I::text, 200)', v_title_col) end;

    -- The parent first: a child of an archived parent only comes back with it.
    for v_i in 1..8 loop
      v_pid := null;
      select ap.parent_token, ap.parent_id, ap.parent_title into v_ptok, v_pid, v_ptitle
        from platform.archived_parent_of(e.token, p_id) ap limit 1;
      exit when v_pid is null;
      if not exists (select 1 from platform.entity_types t
                      where t.token = v_ptok and t.is_active and t.user_artifact_kind is not null) then
        return jsonb_build_object('restored', false,
          'message', format('It is inside %s, which is archived and is not in this organization''s Trash. Its owner can restore it from their own Trash.',
                            coalesce(nullif(btrim(v_ptitle), ''), 'something')));
      end if;
      v_res := public.org_trash_restore(p_organization_id, v_ptok, v_pid);
      if not coalesce((v_res ->> 'restored')::boolean, false) then
        return v_res;
      end if;
      v_via_parent := true;
    end loop;

    -- The row, in THIS organization (a scope type's Field reads its organization from its scope type).
    if e.token = 'context_item' then
      select true, ci.created_by, left(ci.display_name::text, 200), ci.deleted_at
        into v_found, v_owner, v_title, v_at
        from context.context_items ci
        join context.scope_types st on st.id = ci.scope_type_id
       where ci.id = p_id and st.organization_id = p_organization_id;
    else
      execute format('select true, t.%I, %s, t.deleted_at from %I.%I t where t.id = $1 and t.organization_id = $2',
                     e.owner_col, v_title_expr, e.schema_name, e.table_name)
        into v_found, v_owner, v_title, v_at
        using p_id, p_organization_id;
    end if;
    if not coalesce(v_found, false) or (v_at is null and not v_via_parent) then
      return jsonb_build_object('restored', false,
        'message', 'It is no longer in this organization''s Trash — somebody may have restored it already.');
    end if;

    if v_at is null then
      -- It came back with its parent (audited and noticed there). A Field comes back in use.
      if e.token = 'context_item' then
        perform public.restore_context_item(p_id);
      end if;
      return jsonb_build_object('restored', true, 'owner_id', v_owner, 'title', v_title,
        'message', format('%s came back with %s.', coalesce(nullif(btrim(v_title), ''), e.label),
                          coalesce(nullif(btrim(v_ptitle), ''), 'what it sits in')));
    end if;

    if e.token in ('folder', 'scope_type', 'scope', 'context_item', 'hr_employee') then
      begin
        case e.token
          when 'folder' then perform public.restore_folder(p_id);
          when 'scope_type' then perform public.restore_scope_type(p_id);
          when 'scope' then perform public.restore_scope(p_id);
          when 'context_item' then perform public.restore_context_item(p_id);
          when 'hr_employee' then
            v_res := public.hr_employee_restore(jsonb_build_object('employee_id', p_id));
            if not coalesce((v_res ->> 'ok')::boolean, false) then
              return jsonb_build_object('restored', false,
                'message', coalesce(nullif(btrim(v_res ->> 'detail'), ''),
                                    'Only someone HR allows to restore this person can bring them back.'));
            end if;
        end case;
      exception when insufficient_privilege then
        return jsonb_build_object('restored', false,
          'message', format('Only someone who can edit %s can bring it back. Its owner can restore it from their own Trash.',
                            coalesce(nullif(btrim(v_title), ''), 'it')));
      end;
    else
      execute format(
        'update %I.%I t set deleted_at = null
          where t.id = $1 and t.organization_id = $2 and t.deleted_at is not null
          returning t.%I, %s',
        e.schema_name, e.table_name, e.owner_col, v_title_expr)
        into v_owner, v_title
        using p_id, p_organization_id;
      get diagnostics v_n = row_count;

      -- (EXECUTE never sets FOUND; the row count is the answer.)
      if v_n = 0 then
        return jsonb_build_object('restored', false,
          'message', 'It is no longer in this organization''s Trash — somebody may have restored it already.');
      end if;
    end if;
    v_label := e.label;
  end if;

  perform iam._org_audit(p_organization_id, v_owner, 'trash.restore',
    jsonb_build_object('entity_token', e.token, 'id', p_id, 'label', v_label, 'title', v_title));

  if v_owner is not null and v_owner is distinct from v_me then
    select coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
                    nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
                    nullif(btrim(u.email), ''), 'An organization admin')
      into v_me_name from auth.users u where u.id = v_me;
    select coalesce(nullif(btrim(o.name), ''), 'your organization') into v_org_name
      from iam.organizations o where o.id = p_organization_id;
    v_subject := format('%s restored your %s', coalesce(v_me_name, 'An organization admin'), lower(v_label));
    v_body := format('%s restored "%s" from %s''s Trash. It is back where it was.',
                     coalesce(v_me_name, 'An organization admin'),
                     coalesce(nullif(btrim(v_title), ''), 'Untitled'), coalesce(v_org_name, 'your organization'));
    insert into communication.notification
      (organization_id, event_key, channel, recipient_user_id, recipient_kind,
       dedupe_key, subject, body, payload, target_kind, target_id, deep_link, visibility)
    values
      (p_organization_id, 'trash.restored_by_org_admin', 'in_app', v_owner, 'user',
       format('trash.restore:%s:%s:%s', e.token, p_id, extract(epoch from clock_timestamp())::bigint),
       v_subject, left(v_body, 600),
       jsonb_build_object('entity_token', e.token, 'id', p_id, 'by', v_me, 'source', 'org_trash_restore',
                          'notice', jsonb_build_object('subject', v_subject, 'body', v_body)),
       e.token, p_id, null, 'personal'::platform.visibility)
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
  end if;

  return jsonb_build_object('restored', true, 'owner_id', v_owner, 'title', v_title,
    'message', format('%s restored.', coalesce(nullif(btrim(v_title), ''), v_label)));
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────

create or replace function public.entity_undelete(p_token text, p_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
-- lane TRASH-TABLES: token `record` (custom.record — every Table and Record of the record store) is
-- restored by custom.record_restore(organization, id): the store's ladder decides (42501 when the
-- caller may not change it) and the archive event brings back exactly what it took. The organization
-- is read FROM THE ROW, never from the caller.
-- lane TRASH-COVERAGE-2: a row whose parent is archived (platform.archived_parent_of) brings the
-- parent back first, through this same door, so a child is never left live under a removed parent
-- (platform._guard_soft_delete_parent would refuse it anyway). Kinds with their own restore door go
-- through it and never a raw update: folder -> public.restore_folder (its subfolders and files),
-- scope type -> public.restore_scope_type, scope -> public.restore_scope, scope type Field ->
-- public.restore_context_item, HR employee -> public.hr_employee_restore (HR's gate and audit).
declare
  v_s text;
  v_t text;
  v_feature_owned_restore boolean;
  v_n int;
  v_org uuid;
  v_i int;
  v_ptok text;
  v_pid uuid;
  v_at timestamptz;
  v_found boolean;
  v_res jsonb;
begin
  if p_token = 'record' then
    select r.organization_id into v_org
      from custom.record r
     where r.id = p_id and r.deleted_at is not null;
    if v_org is null then
      return false;
    end if;
    perform custom.record_restore(v_org, p_id);
    return true;
  end if;

  select schema_name, table_name, feature_owned_restore
    into v_s, v_t, v_feature_owned_restore
    from platform.entity_types
   where token = p_token;

  if v_s is null then
    raise exception 'unknown token %', p_token using errcode = '22023';
  end if;
  if coalesce(v_feature_owned_restore, false) then
    raise exception 'entity % requires feature-owned restoration', p_token using errcode = '42501';
  end if;
  execute format('select true, t.deleted_at from %I.%I t where t.id = $1', v_s, v_t)
    into v_found, v_at using p_id;
  if not coalesce(v_found, false) or v_at is null then
    return false;
  end if;

  -- The parent first: a child of an archived parent only comes back with it.
  for v_i in 1..8 loop
    v_pid := null;
    select ap.parent_token, ap.parent_id into v_ptok, v_pid
      from platform.archived_parent_of(p_token, p_id) ap limit 1;
    exit when v_pid is null;
    perform public.entity_undelete(v_ptok, v_pid);
  end loop;

  execute format('select t.deleted_at from %I.%I t where t.id = $1', v_s, v_t) into v_at using p_id;
  if v_at is null then
    -- It came back with its parent. A Field comes back in use.
    if p_token = 'context_item' then
      perform public.restore_context_item(p_id);
    end if;
    return true;
  end if;

  case p_token
    when 'folder' then perform public.restore_folder(p_id); return true;
    when 'scope_type' then perform public.restore_scope_type(p_id); return true;
    when 'scope' then perform public.restore_scope(p_id); return true;
    when 'context_item' then perform public.restore_context_item(p_id); return true;
    when 'hr_employee' then
      v_res := public.hr_employee_restore(jsonb_build_object('employee_id', p_id));
      if not coalesce((v_res ->> 'ok')::boolean, false) then
        raise exception '%', coalesce(nullif(btrim(v_res ->> 'detail'), ''),
                                      'HR did not allow this person to be restored.')
          using errcode = '42501';
      end if;
      return true;
    else null;
  end case;

  if not iam.has_access(p_token, p_id, 'editor') then
    raise exception 'access denied' using errcode = '42501';
  end if;

  execute format('UPDATE %I.%I SET deleted_at=NULL WHERE id=$1 AND deleted_at IS NOT NULL', v_s, v_t)
    using p_id;
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────

create or replace function workflow._cascade_definition_soft_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- lane TRASH-COVERAGE-2: the trigger's own is_active is kept in metadata so restoring the
  -- workflow (workflow._cascade_definition_soft_restore) brings each trigger back as it was.
  UPDATE workflow.trigger
     SET deleted_at = NEW.deleted_at, is_active = false,
         metadata = coalesce(metadata, '{}'::jsonb)
                    || jsonb_build_object('active_before_archive', is_active,
                                          'archived_with_definition', NEW.id)
   WHERE definition_id = NEW.id AND deleted_at IS NULL;
  RETURN NEW;
END $function$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- A WORKFLOW'S TRIGGERS COME BACK WITH IT
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- workflow._cascade_definition_soft_delete archived every live trigger with its workflow (and forced
-- is_active = false) but nothing brought them back: restoring a workflow from Trash left its triggers
-- archived. The archive now keeps each trigger's own is_active in metadata; the restore brings back
-- exactly the triggers THIS archive took (same deleted_at, archived_with_definition = the workflow),
-- each as active as it was.
create or replace function workflow._cascade_definition_soft_restore()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
-- lane TRASH-COVERAGE-2
begin
  update workflow.trigger t
     set deleted_at = null,
         is_active = coalesce((t.metadata ->> 'active_before_archive')::boolean, t.is_active),
         metadata = t.metadata - 'active_before_archive' - 'archived_with_definition'
   where t.definition_id = new.id
     and t.deleted_at = old.deleted_at
     and (t.metadata ->> 'archived_with_definition') = new.id::text;
  return new;
end;
$function$;

drop trigger if exists _cascade_soft_restore on workflow.definition;
create trigger _cascade_soft_restore
  after update on workflow.definition
  for each row
  when (old.deleted_at is not null and new.deleted_at is null)
  execute function workflow._cascade_definition_soft_restore();

revoke all on function workflow._cascade_definition_soft_restore() from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- THE KINDS — every archivable thing a person sees is a Trash kind
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- The kind is the registry token (no coined vocabulary; each token is free as a kind — asserted).
do $kinds$
declare
  v_tokens constant text[] := array[
    'rulebook', 'folder', 'war_room', 'thread', 'scope_type', 'scope', 'context_item',
    'working_document', 'user_memory', 'wbx_highlight', 'browser_profile', 'media_source_library',
    'learn_doc', 'seo_topical_map', 'seo_rank_target', 'hr_employee', 'hr_employment',
    'hr_jurisdiction_rule_org_decision', 'crm_blocklist_entry', 'commerce_intake_batch',
    'interview_decision_interview', 'workflow_runtime_surface', 'workflow_trigger',
    'product_capture_item', 'category', 'flexible_data', 'shared_canvas_item', 'sch_task',
    'user_feedback', 'agent_mandate_note'];
  v_n int;
begin
  if exists (select 1 from platform.entity_types e
              where e.user_artifact_kind = any (v_tokens) and not (e.token = e.user_artifact_kind)) then
    raise exception 'trashcoverage2: a token is already another entity''s Trash kind';
  end if;
  update platform.entity_types e
     set user_artifact_kind = e.token
   where e.token = any (v_tokens)
     and e.user_artifact_kind is null;
  get diagnostics v_n = row_count;
  if (select count(*) from platform.entity_types e
       where e.token = any (v_tokens) and e.user_artifact_kind = e.token and e.is_active) <> cardinality(v_tokens) then
    raise exception 'trashcoverage2: expected % Trash kinds, registered %', cardinality(v_tokens), v_n;
  end if;
end
$kinds$;

-- "Working Documents" is the registry's only plural label; one Trash row is one working document.
update platform.entity_types set label = 'Working Document'
 where token = 'working_document' and label = 'Working Documents';

