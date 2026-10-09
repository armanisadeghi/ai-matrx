-- lane: ENTITY-IDS (Unified Data program)
-- based-on: iam.accessible_child_parents(text) 77e67d409de65d0a7055da9ded29abcdff88437a8947e54911f33d305c7061ae
-- based-on: iam.accessible_entity_ids(text, permission_level, integer, boolean) fbe350d117e0912598880bbe549ee3acbb55cf13c95f540c8d67b8d8900f3327
-- based-on: iam.entity_read_kernel_expected() c9e1ec5ff543d225f5aa778970b38ac38619bd23649288bf50b06732097a3b18
-- based-on: iam.entity_read_kernel_members_expected() 2ed4db9eb64c5ae722ff5675e32594a66614670c5707f61c50a8a971b683f7f7
-- lock: iam, platform
--
-- ENTITY-IDS (2026-10-08): A FILE'S PARENT IS CHECKED BY ASKING ABOUT THE PARENT IDS THE FILES NAME, NOT BY LISTING
-- EVERY ROW OF THE PARENT TYPE A PERSON CAN REACH.
--
-- THE USE CASE. A 360 review's meeting recording is a file whose parent is the Confidential notes row (a store
-- `record`). The files read policy's child lane (iam.accessible_child_parents) and the set form's parent lane
-- (iam.accessible_entity_ids, which every files component policy asks for `file`) both answered "which parents can
-- this person see" by listing every row of the parent type the person reaches: for `record` that alone never
-- returned for a member and took > 45 s for admin@admin.com (lane HR-360, measured 2026-10-08), so recordings stayed off.
--
-- THE CHANGE. For a parent type the knob access/child_parent_asks_ids lists (default {"types": ["record"]}), both
-- functions take the parent ids the child table actually names (files_files_parent_record_idx) and ask the kernel
-- about exactly those: iam.has_access_for_many_in (the set form, each id's organization as a hint) while
-- access/kernel_set_form is on for the person and the question includes the public lane, else
-- iam.has_access_for_base one id at a time. A set-form failure is a WARNING and the one-at-a-time kernel answers.
-- Every other parent type is listed exactly as before. No RLS policy, no generator and no kernel decision body changes;
-- the two functions are fingerprinted, so the fingerprint is re-recorded here (549104e33e07d066bc5df6f07e715032 -> 33d13ee5c2f25e1462af8d56d0bcea94).
--
-- PROOF (2026-10-08, live database, rolled back, one repeatable-read snapshot per run; scripts/campaign-tests/
-- entityids_file_parents_asked_by_id_proof.sql): every files.files id each seat reads, count + md5, and the newest-50
-- page, and files.file_versions (a component policy that asks iam.accessible_entity_ids('file')), with the session
-- forced to the old listing (mx.child_parent_asks_ids = off) and on the new path:
--   admin@admin.com   62,212 = 62,212 (09ac2739…)  versions 59,996 = 59,996 (ba8888e3…)
--   test@test.com      9,283 =  9,283 (e66c6325…)  versions 10,199 = 10,199 (365c6ddf…)
--   dd048-joiner (member of 3) 4,278 = 4,278 (30337b55…) versions 4,702 = 4,702 (0b4eb262…)
-- platform.kernel_equivalence_check(): ok, 0 lost / 0 gained / 0 missing before and after.
--
-- REVERT: {"types": []} in the knob puts every type back on the listing (one statement, no deploy) — but only
-- after entityids_b is reverted, or file reads under a record stall again. Full inverse:
-- migrations/inverse/entityids_a_file_parents_are_asked_by_the_ids_the_files_name_down.sql.


do $pre$
declare v_chk jsonb;
begin
  if iam.entity_read_kernel_fingerprint() is distinct from '549104e33e07d066bc5df6f07e715032' then
    raise exception 'entityids_a: the live access-kernel fingerprint is % but this file was proved against 549104e33e07d066bc5df6f07e715032; re-derive the file.', iam.entity_read_kernel_fingerprint();
  end if;
  v_chk := platform.kernel_equivalence_check();
  if not coalesce((v_chk->>'ok')::boolean, false) or (v_chk->>'lost')::int <> 0 or (v_chk->>'gained')::int <> 0 or (v_chk->>'missing')::int <> 0 then
    raise exception 'entityids_a: the kernel equivalence check is not ok before this file: %', v_chk - 'answers';
  end if;
end $pre$;

insert into platform.feature_knob (feature, key, label, description, basis, value_type, default_value, value,
  overridable_by, override_direction, delegable, not_delegable_reason, propagation, public_read, set_by, review_due)
values ('access', 'child_parent_asks_ids', 'File parents asked by id',
  'Parent types whose child files are checked by asking the access kernel about the parent ids the files name, instead of listing every row of that type a person can reach. {"types": []} lists every type in full again.',
  'ENTITY-IDS 2026-10-08: listing every record a person reaches took > 45 s for admin@admin.com and never returned for a member, so files under a store record could not ship.',
  'json', '{"types": ["record"]}'::jsonb, '{"types": ["record"]}'::jsonb, '{}', 'any', false,
  'A platform switch over how the access kernel is asked; no organization or person decides it.',
  'next_load', false, 'agent', '2026-11-08');

CREATE OR REPLACE FUNCTION iam.accessible_child_parents(p_child_type text)
 RETURNS TABLE(parent_type text, parent_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_cols text[];
  v_schema text; v_table text; v_ptype text;
  v_uid uuid := auth.uid();
  -- ENTITY-IDS (2026-10-08): parent types asked by the ids present (see the loop).
  v_ask_types text[]; v_knob jsonb; v_cols_ask text[]; v_ask_ids uuid[]; v_ask_orgs uuid[]; v_has_org boolean;
  v_got uuid[];
begin
  if v_uid is null then return; end if;
  v_cols := platform.child_parent_columns(p_child_type);
  if v_cols is null then return; end if;
  select et.schema_name, et.table_name into v_schema, v_table
  from platform.entity_types et where et.token = p_child_type and et.is_active;
  if v_schema is null then return; end if;
  select exists (select 1 from pg_catalog.pg_attribute a
                  where a.attrelid = format('%I.%I', v_schema, v_table)::regclass
                    and a.attname = 'organization_id' and not a.attisdropped) into v_has_org;
  v_cols_ask := v_cols;
  -- ENTITY-IDS (2026-10-08): a parent type the knob access/child_parent_asks_ids lists (default: record) is
  -- not enumerated. Its ids are the ones this table actually names, and the kernel is asked about exactly those
  -- (iam.has_access_for_many_in, the set form, with each id's organization as a hint; the one-at-a-time kernel
  -- when the set form is off for the person or the question excludes the public lane). Same answer as the
  -- enumeration for every id the table names; the enumeration of every record a person reaches took > 45 s.
  -- mx.child_parent_asks_ids = 'off' (session) forces the enumeration for every type; the proofs compare both.
  begin
    if coalesce(current_setting('mx.child_parent_asks_ids', true), '') = 'off' then
      v_ask_types := '{}'::text[];
    else
      v_knob := platform.knob_resolve('access', 'child_parent_asks_ids', null);
      v_ask_types := case when v_knob ? 'types'
                          then array(select jsonb_array_elements_text(v_knob -> 'types'))
                          else array['record'] end;
    end if;
  exception when others then
    raise warning 'ENTITY-IDS: knob access/child_parent_asks_ids unreadable (%); record parents are asked by the ids present', sqlerrm;
    v_ask_types := array['record'];
  end;
  for v_ptype in execute format(
      'with recursive d(v) as ('
      || ' (select t.%1$I::text from %2$I.%3$I t where t.%1$I is not null and t.%4$I is not null order by 1 limit 1)'
      || ' union all'
      || ' select (select t.%1$I::text from %2$I.%3$I t where t.%1$I > d.v and t.%4$I is not null order by 1 limit 1)'
      || ' from d where d.v is not null'
      || ') select v from d where v is not null',
      v_cols[1], v_schema, v_table, v_cols[2])
  loop
    continue when v_ptype = p_child_type;
    if v_ptype = any(v_ask_types) then
      execute format(
          'select array_agg(q.pid), array_agg(q.org) from (select t.%1$I as pid, %4$s as org from %2$s t '
          || 'where t.%3$I = $1 and t.%1$I is not null group by t.%1$I) q',
          v_cols_ask[2], format('%I.%I', v_schema, v_table), v_cols_ask[1],
          case when v_has_org then '(array_agg(t.organization_id))[1]' else 'null::uuid' end)
        into v_ask_ids, v_ask_orgs using v_ptype;
      v_got := '{}'::uuid[];
      if coalesce(cardinality(v_ask_ids), 0) > 0 then
        begin
          if iam.kernel_set_form_on(v_uid) then
            select coalesce(array_agg(m.target), '{}'::uuid[]) into v_got
              from iam.has_access_for_many_in(v_uid, v_ask_ids, v_ask_orgs, ('viewer'::public.permission_level)::text, v_ptype) m
             where m.allowed;
          else
            select coalesce(array_agg(x), '{}'::uuid[]) into v_got
              from unnest(v_ask_ids) x
             where iam.has_access_for_base(v_uid, v_ptype, x, 'viewer'::public.permission_level, true);
          end if;
        exception when others then
          raise warning 'ENTITY-IDS: the set form failed for % parents (%); asking one at a time', v_ptype, sqlerrm;
          select coalesce(array_agg(x), '{}'::uuid[]) into v_got
            from unnest(v_ask_ids) x
           where iam.has_access_for_base(v_uid, v_ptype, x, 'viewer'::public.permission_level, true);
        end;
      end if;
      return query select v_ptype, u from unnest(v_got) u;
      continue;
    end if;
    return query
      select v_ptype, u
      from unnest(iam.accessible_entity_ids(v_ptype, 'viewer'::public.permission_level, 1, true)) u;
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION iam.accessible_entity_ids(p_type text, p_required permission_level, p_depth integer, p_include_public boolean)
 RETURNS uuid[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- DD-171: containment never carries a personal row (see iam._dd171_containment_filter).

declare
  v_uid uuid := auth.uid();
  v_schema text; v_table text; v_tbl text; v_owner_col text;
  v_has_org boolean; v_has_vis boolean;
  v_parent_ids uuid[]; v_nonpublic_parent_ids uuid[]; v_more uuid[];
  v_trusted text; v_sql text;
  v_ids uuid[] := '{}';
  -- 🚨 DD-175 (2026-09-12) — THE SET FORM ASKS THE SAME QUESTION THE KERNEL ASKS.
  -- iam.has_access_for_base and iam.entity_read_expr both gate the organization and
  -- platform-staff lanes on iam.class_lanes (DD-137b). This function never learned that,
  -- so it returned ids the parent's own policy refuses. On the parent's own std_select that
  -- is harmless — the set is only a CANDIDATE there and iam.has_access confirms every id —
  -- but a generated COMPONENT lane takes this set as FINAL with nothing behind it, so the
  -- component read rows its parent refuses. Measured live, 2026-09-12, before this change:
  -- arman@titaniumsuccess.com read 2,313 docproc.processed_document_pages whose parent
  -- processed_document its own policy refuses; admin@admin.com 106 udt_document_snapshots
  -- and 87 udt_workbook_snapshots; users.credential_attachments leaked all 3 of its rows
  -- under a refused credential_item; workbench.udt_structured_list_items all 15 of its.
  v_lanes platform.lane_set;
  -- 🚨 DD-175e (2026-09-13) — THE `restricted` VARIANT HIDES ITS SOFT-DELETED ROWS AND THIS
  -- FUNCTION DID NOT. iam._apply_rls_unchecked's restricted branch emits std_select with its
  -- own `deleted_at is null and …` prefix (v_delpfx). The set form had no soft-delete arm, so
  -- a component under a restricted parent read rows whose parent the parent's own policy
  -- hides: measured live, admin@admin.com read 101 chat.coding_session_entry rows under one
  -- soft-deleted chat.coding_session. Scoped to `restricted` ON PURPOSE — every other variant
  -- keeps archived rows readable (the archived-items law), and cutting them out here would
  -- empty every archive view on the platform.
  v_soft_deleted_hidden boolean;
  rec record;
  -- AEI-MEMO (2026-09-26): cache each nested parent question within a depth-0
  -- cascade only. The frame is restored before returning, so it cannot leak to
  -- a later policy or caller.
  v_memo_prev text;
  v_memo_key text;
  v_memo jsonb;
  -- Access ladder T-11 leak fixes: the parent lane (platform.child_parent_columns).
  v_child_cols text[]; v_ptype text;
  -- ENTITY-IDS (2026-10-08): parent types asked by the ids present (see the parent lane).
  v_ask_types text[]; v_knob jsonb; v_cols_ask text[]; v_ask_ids uuid[]; v_ask_orgs uuid[];
  -- ACCESS LADDER T-13 2.3e (2026-09-28): the parent cascade's child gate (see the cascade).
  v_child_gate text := '';
begin
  -- ACCESS LADDER T-33 (2026-09-28): every organization-membership read below joins
  -- iam.organizations and skips an ARCHIVED organization, which is closed to its members.
  if v_uid is null then return '{}'::uuid[]; end if;
  -- NOTHING FAILS SILENTLY (2026-10-05). p_depth is the parent cascade's recursion level, not a row limit.
  -- 13 is one past the ceiling: a cascade deeper than 12 parents stops there (answered empty, announced).
  -- Anything larger is a caller passing a limit: announced, and clamped to the ceiling (pass 0 for the full set).
  if p_depth = 13 then
    raise notice 'iam.accessible_entity_ids(%): the parent cascade reached its depth ceiling (12); parents deeper than that are not followed.', p_type;
    return '{}'::uuid[];
  elsif p_depth > 13 then
    raise warning 'iam.accessible_entity_ids(%, depth %): depth is the parent-cascade level, not a row limit; clamped to the ceiling 12. Pass 0 for the full set.', p_type, p_depth;
    p_depth := 12;
  end if;

  -- 🚨 W2-PRED / VIS-N-1 — THE CUSTOM-RECORD ARM, AND NOTHING ELSE IN THIS BODY.
  -- One set-based join per request instead of one function call per row. The knob is the whole
  -- switch: while it resolves false this block falls through and the old body below answers, which
  -- is why the OFF path is the old behaviour rather than a copy of it.
  if p_type = 'record'
     and coalesce(
           platform.knob_resolve('custom', 'accessible_entity_ids_guard', null)::text::boolean,
           false)
  then
    return coalesce(
      (select array_agg(distinct v.id) from custom.visible_record_ids(v_uid, p_required) v),
      '{}'::uuid[]);
  end if;

  select et.schema_name, et.table_name into v_schema, v_table
  from platform.entity_types et
  where et.token = p_type and et.is_active;
  if v_schema is null then return '{}'::uuid[]; end if;
  -- 🚨 RC-A2b (2026-09-25) — A DETAIL'S SET IS WHAT THE KERNEL SAYS, ROW BY ROW. The trusted
  -- arms below read a row's own visibility and organization, which is exactly the answer a
  -- detail (platform.comments) must never get: it listed comments on colleagues' personal notes
  -- to every member. A detail's access is its record's, which only the kernel resolves, so the
  -- set form asks it per row and cannot disagree with it. Cost: one kernel call per detail row;
  -- every client read of a detail goes through a door already filtered to one record.
  if platform.token_is_detail(p_type) then  -- RC-A2e: every declared detail
    execute format('select coalesce(array_agg(t.id), ''{}'') from %I.%I t '
                   'where iam.has_access_for_base($1, $2, t.id, $3, $4)', v_schema, v_table)
      into v_ids using v_uid, p_type, p_required, p_include_public;
    return coalesce(v_ids, '{}'::uuid[]);
  end if;
  v_tbl := format('%I.%I', v_schema, v_table);
  -- 🚨 SCOPES-READS-ACCESS (2026-09-30) — A SCOPE IS LISTED FROM THE RECORD STORE. A scope is the Record of its
  -- context Table under the same id, with the same organization, creator, row level and archive (proved equal for
  -- every scope); the scopes cutover moves the old scopes table to the deprecated, after which the registry's table would
  -- be gone. Every arm below reads only those five columns for this token (it has no containment edge, no child
  -- columns and no reference gate), so the Records stand in for the rows, found Table first through the store's
  -- index. The column questions above still read the old scopes table's catalogue, which names the same five.
  if p_type = 'scope' then
    v_tbl := '(select r.id, r.organization_id, r.created_by, r.visibility, r.deleted_at'
          || ' from custom.record tt join custom.record r on r.organization_id = tt.organization_id and r.table_id = tt.id'
          || ' where tt.table_id = custom.table_kernel_id() and tt.data @> ''{"kept_for": "context"}''::jsonb'
          || ' and r.data_class = ''record'')';
  end if;
  v_lanes := iam.class_lanes(p_type);
  select coalesce(et.rls_variant = 'restricted', false)
         and exists (select 1 from information_schema.columns c
                      where c.table_schema = v_schema and c.table_name = v_table
                        and c.column_name = 'deleted_at')
    into v_soft_deleted_hidden
    from platform.entity_types et where et.token = p_type and et.is_active;
  v_soft_deleted_hidden := coalesce(v_soft_deleted_hidden, false);

  select c.column_name into v_owner_col
  from information_schema.columns c
  where c.table_schema = v_schema and c.table_name = v_table
    and c.column_name in ('created_by', 'owner_id', 'user_id')
  order by case c.column_name
    when 'created_by' then 1 when 'owner_id' then 2 else 3 end
  limit 1;
  select exists (
    select 1 from information_schema.columns c
    where c.table_schema = v_schema and c.table_name = v_table
      and c.column_name = 'organization_id'
  ) into v_has_org;
  select exists (
    select 1 from information_schema.columns c
    where c.table_schema = v_schema and c.table_name = v_table
      and c.column_name = 'visibility'
      and c.udt_schema = 'platform' and c.udt_name = 'visibility'
  ) into v_has_vis;

  v_trusted := case
    when v_owner_col is not null then format('t.%I = $1', v_owner_col)
    else 'false' end;
  if v_has_vis and v_has_org then
    if p_required <= 'editor'::public.permission_level and v_lanes.org_member_lane then
      v_trusted := v_trusted
        || ' or (' || iam.org_lane_visibility_sql(p_type, 't.') || ' and t.organization_id in ('
        || 'select om.organization_id from iam.organization_member om join iam.organizations om_org on om_org.id = om.organization_id and om_org.archived_at is null where om.user_id = $1))';
    elsif p_required > 'editor'::public.permission_level and v_lanes.org_role_lane then
      v_trusted := v_trusted
        || ' or (' || iam.org_lane_visibility_sql(p_type, 't.') || ' and t.organization_id in ('
        || 'select om.organization_id from iam.organization_member om join iam.organizations om_org on om_org.id = om.organization_id and om_org.archived_at is null '
        || 'where om.user_id = $1 and om.role in (''owner'', ''admin'')))';
    end if;
  end if;
  if v_has_org and v_lanes.platform_admin_lane and public.is_super_admin_for(v_uid) then
    if v_has_vis then
      v_trusted := v_trusted
        || ' or (t.organization_id in (select so.organization_id '
        || 'from iam.system_orgs so where so.global_readable)'
        || ' and t.visibility >= ''internal'')';
    elsif not iam.token_is_parented_component(p_type) then
      v_trusted := v_trusted
        || ' or t.organization_id in (select so.organization_id '
        || 'from iam.system_orgs so where so.global_readable)';
    end if;
  end if;
  if p_required = 'viewer'::public.permission_level then
    if p_include_public and v_has_vis then
      v_trusted := v_trusted || ' or t.visibility = ''public''';
      -- 🚨 DD-185 (2026-09-13) — THE SECOND COPY OF THE §6e ARM, and the one the generated
      -- policy's bounded `iam.has_access` lane is asked about. Gated on the same two classes as
      -- the kernel and the mirror: an every-signed-in-user arm is not a lane a `confidential` or
      -- `private` token has. Server-side lists call this function directly, so leaving it here
      -- would have been a safe path beside an unsafe one.
      if v_has_org and v_lanes.resolved_class in ('organization','public') then
        v_trusted := v_trusted
          || ' or (t.visibility >= ''internal'' and t.organization_id in ('
          || 'select so.organization_id from iam.system_orgs so where so.global_readable))';
      end if;
    end if;
    -- 🚨 DD-136b (2026-09-12) — THE THIRD COPY OF THE ORG-ADMIN LANE.
    -- Unguarded, it handed an organization's admins every id in the
    -- organization at viewer, including `personal` rows, and a component's
    -- generated read lane takes this set as final with no has_access behind it.
    -- Guarded to match iam.has_access_for_base and iam.entity_read_expr; a
    -- parented component still gets nothing by role here, because its access is
    -- its parent's (db-rules §6d-1).
    if v_has_org and v_has_vis and v_lanes.org_role_lane then
      v_trusted := v_trusted
        || ' or (' || iam.org_lane_visibility_sql(p_type, 't.') || ' and t.organization_id in ('
        || 'select om.organization_id from iam.organization_member om join iam.organizations om_org on om_org.id = om.organization_id and om_org.archived_at is null '
        || 'where om.user_id = $1 and om.role in (''owner'', ''admin'')))';
    elsif v_has_org and v_lanes.org_role_lane and not iam.token_is_parented_component(p_type) then
      v_trusted := v_trusted
        || ' or t.organization_id in (select om.organization_id '
        || 'from iam.organization_member om join iam.organizations om_org on om_org.id = om.organization_id and om_org.archived_at is null where om.user_id = $1 '
        || 'and om.role in (''owner'', ''admin''))';
    end if;
  end if;

  -- ACCESS LADDER (2026-09-28): an Organization table with no visibility column opens to every member,
  -- exactly as iam.has_access_for_base's member lane admits it (personal_opens_row); the generated
  -- policy carries the same arm (iam.entity_read_expr).
  if v_has_org and not v_has_vis and v_schema <> 'custom' and v_lanes.org_member_lane
     and v_lanes.resolved_class = 'organization' and p_required <= 'editor'::public.permission_level
     and not iam.token_is_parented_component(p_type) then
    v_trusted := v_trusted || ' or (t.organization_id in (select om.organization_id from iam.organization_member om '
      || 'join iam.organizations om_org on om_org.id = om.organization_id and om_org.archived_at is null '
      || 'where om.user_id = $1)'
      || case when platform.child_parent_columns(p_type) is null then ''
              else format(' and t.%I is null', (platform.child_parent_columns(p_type))[1]) end
      || case when platform.row_class_column(p_type) is null then ''
              else format(' and coalesce(t.%I::text, ''organization'') not in (''private'', ''confidential'')',
                          platform.row_class_column(p_type)) end
      || ')';
  end if;
  -- ACCESS LADDER T-33 (2026-09-28): nothing in an archived organization is trusted — not even its
  -- author's or its public rows (the same question as the org_open_gate policy).
  if v_has_org then
    v_trusted := '(t.organization_id is null or t.organization_id not in (select o.id from iam.organizations o '
      || 'where o.archived_at is not null)) and (' || v_trusted || ')';
  end if;
  v_sql := format(
    'select coalesce(array_agg(t.id), ''{}'') from %s t where %s',
    v_tbl, v_trusted
  );
  execute v_sql into v_ids using v_uid;
  v_ids := coalesce(v_ids, '{}'::uuid[]);

  -- Candidate lanes. THE ANTIJOIN IS HASHED, NEVER `= any(<param array>)`:
  -- a param array is not a Const, so PostgreSQL cannot use a hashed
  -- ScalarArrayOpExpr and falls back to a linear scan of the array PER ROW.
  -- Against v_ids of 32,697 that is what made this function quadratic.
  for rec in
    with have as materialized (select iam.unnest_uuids(v_ids) as id),
    -- AEI-REACH survives this rebase: ask the kernel once per distinct container,
    -- then still confirm every candidate row with the kernel below.
    reach_cand as materialized (
      select r.item_id, r.container_type, r.container_id
      from platform.reachability r
      where r.item_type = p_type and r.max_level >= p_required
        and not exists (select 1 from have h where h.id = r.item_id)
    ),
    reach_containers as materialized (
      select distinct rc.container_type, rc.container_id from reach_cand rc
    ),
    -- 1320: THE KERNEL IS ASKED ONLY ABOUT CONTAINERS THAT COULD CONVEY. Before this, every distinct
    -- container of every reachability row outside the caller's own set was walked by the kernel —
    -- 3,540 file containers (~2.2 ms each) for admin@admin.com on processed_document, 8 s per call,
    -- almost all refusals (documents of other organizations reached through their own files).
    -- iam.reach_containers_worth_asking keeps the containers the caller holds a direct lane on, or
    -- one of whose own containers they do; the kernel still decides each one.
    reach_worth as materialized (
      select w.container_type, w.container_id
        from iam.reach_containers_worth_asking(v_uid,
               array(select k.container_type from reach_containers k),
               array(select k.container_id from reach_containers k)) w
    ),
    reach_ok as materialized (
      select k.container_type, k.container_id
      from reach_worth k
      where iam.has_access_for_base(v_uid, k.container_type, k.container_id, p_required, p_include_public)
    )
    select distinct c.id
    from (
      select p.resource_id as id
      from iam.permissions p
      where p.resource_type = p_type
        and (
          p.granted_to_user_id = v_uid
          or p.granted_to_organization_id in (
            select om.organization_id
            from iam.organization_member om join iam.organizations om_org on om_org.id = om.organization_id and om_org.archived_at is null where om.user_id = v_uid
          )
        )
        and p.status <> 'rejected'
        and (p.expires_at is null or p.expires_at > now())
      union
      select m.container_id
      from iam.memberships m
      where m.container_type = p_type and m.user_id = v_uid and m.deleted_at is null
      union
      select rc.item_id
      from reach_cand rc
      where exists (select 1 from reach_ok k
                     where k.container_type = rc.container_type and k.container_id = rc.container_id)
      union
      select a.source_id
      from platform.associations_live a
      where a.source_type = p_type and a.role = 'assignment'
        and a.target_type = 'scope'
      -- D261 (2026-08-23): THE LIBRARY LANES. iam.has_access_for_base opens with
      -- two token-agnostic viewer lanes — public.user_can_read_via_library_grant
      -- and public.library_is_open ("THE OPEN LIBRARY") — that both read
      -- platform.entity_grants. This function never learned them, so a row
      -- readable ONLY through a library grant was never even a CANDIDATE, and
      -- the set form disagreed with the per-row form for the same (type, id).
      -- Measured before this change: 15 disagreements across the three tokens
      -- that have entity_grants rows (rag.data_stores 6, platform.rulebook 6,
      -- seo.starter_pack 3).
      --
      -- This can only ever ADD ids, and only ids the loop below then confirms
      -- with has_access_for_base — the authority. A wider candidate SET cannot
      -- grant anything the per-row resolver denies; it can only stop the two
      -- forms from disagreeing. That asymmetry is what makes this landable on
      -- machinery every component parent arm depends on.
      union
      select g.entity_id
      from platform.entity_grants g
      where g.entity_type = p_type
      -- ...and the two curator lanes, for the same reason: has_access_for_base
      -- grants a curator every row in their industry, and none of those ids
      -- appear in permissions, memberships, reachability or assignments.
      union
      select rb.id
      from platform.rulebook rb
      join iam.industry_curators ic on ic.industry_id = rb.industry_id
      where p_type = 'rulebook' and ic.user_id = v_uid and ic.deleted_at is null
        and rb.deleted_at is null
      union
      select sp.id
      from seo.starter_pack sp
      join iam.industry_curators ic on ic.industry_id = sp.industry_id
      where p_type = 'seo_starter_pack' and ic.user_id = v_uid and ic.deleted_at is null
    ) c
    where not exists (select 1 from have h where h.id = c.id)
  loop
    if iam.has_access_for_base(v_uid, p_type, rec.id, p_required, p_include_public)
    then v_ids := v_ids || rec.id; end if;
  end loop;

  -- Parent cascade. SELF-CONTAINMENT EDGES ARE A TRANSITIVE CLOSURE, NOT A
  -- RECURSION: `folder -> folder` made a depth-0 call fan out to ~91
  -- invocations (12 levels, doubled at every level by the include_public /
  -- non-public pair), each one re-deriving the SAME base set over the whole
  -- table. Ordered so self edges run LAST, over the fully accumulated v_ids.
  -- 🚨 ACCESS LADDER T-13 2.3e (2026-09-28) — A CHILD NEVER OPENS THROUGH A CONTAINER, SET-WISE.
  -- iam.has_access_for_base pushes no containment and no composition edge for a row that names its
  -- parent record (T-33: "a file with a parent record never opens through its folder"); this cascade
  -- did, so the set held child files the per-row kernel and files.files refuse, and every generated
  -- child read that takes this set as final (files.file_versions: file_id in the 'file' set) opened
  -- them. Measured: test@test.com read 26 file_versions rows of admin@admin.com's Confidential
  -- study-session recordings through their folder. A child row enters the set only through the
  -- parent lane below (or its own owner / grant / candidate lanes above).
  if platform.child_parent_columns(p_type) is not null then
    v_child_gate := format(' and t.%I is null', (platform.child_parent_columns(p_type))[1]);
  end if;
  if p_depth = 0 and p_include_public and v_has_vis then
    v_memo_prev := current_setting('iam.aei_cascade_memo', true);
    perform set_config('iam.aei_cascade_memo', '{}', true);
  end if;
  for rec in
    select er.parent_type, er.fk_column
    from platform.entity_relationships er
    where er.child_type = p_type
      and er.kind in ('composition', 'containment')
      -- ACCESS LADDER T-35 (2026-09-28): a containment edge carries only an Organization or Public
      -- row, as iam.has_access_for_base says (reachability candidates are confirmed by it below).
      and (er.kind = 'composition' or v_lanes.resolved_class in ('organization', 'public'))
    order by (er.parent_type = p_type), er.kind, er.parent_type, er.fk_column
  loop
    if exists (
      select 1 from information_schema.columns c
      where c.table_schema = v_schema and c.table_name = v_table
        and c.column_name = rec.fk_column
    ) then
      if rec.parent_type = p_type then
        -- T-11 leak fixes (2026-09-28), speed only: each closure step below probes the parent-id
        -- index once per row it just added (a LATERAL fenced with OFFSET 0). As a plain join the
        -- planner merge-joined the WHOLE table on every step — measured on files.folders as
        -- test@test.com: eight steps x 104k index rows = 505 ms, now 20 ms. Same rows, same filters.
        -- P = closure_public(S_T u N) where N is the non-public closure.
        -- Proof that this equals the old recursion's fixpoint: N is closed
        -- under ALL children (its own branch takes the else arm), so every
        -- non-public row the old code admitted via `parent in N` is already
        -- IN N; only the public arm still needs iterating. N costs exactly one
        -- nested call, and that call takes this same branch with
        -- p_include_public = false, so it does not fan out either.
        if p_include_public and v_has_vis then
          v_memo_key := concat_ws('|', v_uid, p_type, p_required, p_depth + 1, false);
          v_memo := nullif(current_setting('iam.aei_cascade_memo', true), '')::jsonb;
          if v_memo ? v_memo_key then
            v_more := (v_memo ->> v_memo_key)::uuid[];
          else
            v_more := iam.accessible_entity_ids(
              p_type, p_required, p_depth + 1, false);
            if nullif(current_setting('iam.aei_cascade_memo', true), '') is not null then
              perform set_config('iam.aei_cascade_memo',
                (current_setting('iam.aei_cascade_memo', true)::jsonb
                   || jsonb_build_object(v_memo_key, v_more::text))::text, true);
            end if;
          end if;
          v_ids := v_ids || v_more;
          v_sql := format(
            'with recursive clo(id) as ('
            || ' select u from iam.unnest_uuids($1) u'
            || ' union'
            || ' select t.id from clo c cross join lateral'
            || '  (select t.id from %s t where t.%I = c.id and t.visibility = ''public''%s offset 0) t'
            || ') select coalesce(array_agg(id), ''{}'') from clo',
            v_tbl, rec.fk_column, v_child_gate);
        else
          v_sql := format(
            'with recursive clo(id) as ('
            || ' select u from iam.unnest_uuids($1) u'
            || ' union'
            || ' select t.id from clo c cross join lateral'
            || '  (select t.id from %s t where t.%I = c.id%s%s offset 0) t'
            || ') select coalesce(array_agg(id), ''{}'') from clo',
            v_tbl, rec.fk_column, iam._dd171_containment_filter(v_has_vis, 't', ' and '), v_child_gate);
        end if;
        execute v_sql into v_more using v_ids;
        v_ids := coalesce(v_more, '{}'::uuid[]);
      else
        v_memo_key := concat_ws('|', v_uid, rec.parent_type, p_required, p_depth + 1, p_include_public);
        v_memo := nullif(current_setting('iam.aei_cascade_memo', true), '')::jsonb;
        if v_memo ? v_memo_key then
          v_parent_ids := (v_memo ->> v_memo_key)::uuid[];
        else
          v_parent_ids := iam.accessible_entity_ids(
            rec.parent_type, p_required, p_depth + 1, p_include_public);
          if nullif(current_setting('iam.aei_cascade_memo', true), '') is not null then
            perform set_config('iam.aei_cascade_memo',
              (current_setting('iam.aei_cascade_memo', true)::jsonb
                 || jsonb_build_object(v_memo_key, v_parent_ids::text))::text, true);
          end if;
        end if;
        if p_include_public and v_has_vis then
          v_memo_key := concat_ws('|', v_uid, rec.parent_type, p_required, p_depth + 1, false);
          v_memo := nullif(current_setting('iam.aei_cascade_memo', true), '')::jsonb;
          if v_memo ? v_memo_key then
            v_nonpublic_parent_ids := (v_memo ->> v_memo_key)::uuid[];
          else
            v_nonpublic_parent_ids := iam.accessible_entity_ids(
              rec.parent_type, p_required, p_depth + 1, false);
            if nullif(current_setting('iam.aei_cascade_memo', true), '') is not null then
              perform set_config('iam.aei_cascade_memo',
                (current_setting('iam.aei_cascade_memo', true)::jsonb
                   || jsonb_build_object(v_memo_key, v_nonpublic_parent_ids::text))::text, true);
            end if;
          end if;
          v_sql := format(
            'with have as materialized (select iam.unnest_uuids($3) as id) '
            || 'select coalesce(array_agg(t.id), ''{}'') from %s t '
            || 'where ('
            || '(t.visibility = ''public'' and t.%I = any($1)) '
            || 'or ((t.visibility is null or t.visibility >= ''internal''::platform.visibility)'
            || ' and t.visibility is distinct from ''public'' and t.%I = any($2))'
            || ')%s and not exists (select 1 from have h where h.id = t.id)',
            v_tbl, rec.fk_column, rec.fk_column, v_child_gate
          );
          execute v_sql into v_more using v_parent_ids, v_nonpublic_parent_ids, v_ids;
        else
          v_sql := format(
            'with have as materialized (select iam.unnest_uuids($2) as id) '
            || 'select coalesce(array_agg(t.id), ''{}'') from %s t '
            || 'where t.%I = any($1) %s%s '
            || 'and not exists (select 1 from have h where h.id = t.id)',
            v_tbl, rec.fk_column, iam._dd171_containment_filter(v_has_vis, 't', ' and '), v_child_gate
          );
          execute v_sql into v_more using v_parent_ids, v_ids;
        end if;
        v_ids := v_ids || coalesce(v_more, '{}'::uuid[]);
      end if;
    end if;
  end loop;

  if p_depth = 0 and p_include_public and v_has_vis then
    perform set_config('iam.aei_cascade_memo', coalesce(v_memo_prev, ''), true);
  end if;

  -- DD-175e: one filter over every lane at once, so no arm can reintroduce a row the
  -- parent's own std_select hides.
  -- 🚨 ACCESS LADDER T-11 (2026-09-28) — THE PARENT LANE, SET-WISE. The kernel's twin
  -- (iam.has_access_for_base): a child row is in the set when its parent record is in the
  -- caller's set for the parent's type. Only the parent types actually present are asked (a
  -- loose index scan over files_files_parent_record_idx), each once, through this same function
  -- at depth + 1; the rows come back through the same index. A same-type pointer (a file variant
  -- written before T-11 part n) is left to the kernel row by row. The trash rule and the
  -- reference gate below still apply to these rows.
  v_child_cols := platform.child_parent_columns(p_type);
  if v_child_cols is not null and p_depth < 12 then
    -- ENTITY-IDS (2026-10-08): a parent type the knob access/child_parent_asks_ids lists (default: record) is
    -- not enumerated. Its ids are the ones this table actually names, and the kernel is asked about exactly those
    -- (iam.has_access_for_many_in, the set form, with each id's organization as a hint; the one-at-a-time kernel
    -- when the set form is off for the person or the question excludes the public lane). Same answer as the
    -- enumeration for every id the table names; the enumeration of every record a person reaches took > 45 s.
    -- mx.child_parent_asks_ids = 'off' (session) forces the enumeration for every type; the proofs compare both.
    begin
      if coalesce(current_setting('mx.child_parent_asks_ids', true), '') = 'off' then
        v_ask_types := '{}'::text[];
      else
        v_knob := platform.knob_resolve('access', 'child_parent_asks_ids', null);
        v_ask_types := case when v_knob ? 'types'
                            then array(select jsonb_array_elements_text(v_knob -> 'types'))
                            else array['record'] end;
      end if;
    exception when others then
      raise warning 'ENTITY-IDS: knob access/child_parent_asks_ids unreadable (%); record parents are asked by the ids present', sqlerrm;
      v_ask_types := array['record'];
    end;
    v_cols_ask := v_child_cols;
    for v_ptype in execute format(
        'with recursive d(v) as ('
        || ' (select t.%1$I::text from %2$s t where t.%1$I is not null and t.%3$I is not null order by 1 limit 1)'
        || ' union all'
        || ' select (select t.%1$I::text from %2$s t where t.%1$I > d.v and t.%3$I is not null order by 1 limit 1)'
        || ' from d where d.v is not null'
        || ') select v from d where v is not null',
        v_child_cols[1], v_tbl, v_child_cols[2])
    loop
      continue when v_ptype = p_type;
      if v_ptype = any(v_ask_types) then
        execute format(
            'select array_agg(q.pid), array_agg(q.org) from (select t.%1$I as pid, %4$s as org from %2$s t '
            || 'where t.%3$I = $1 and t.%1$I is not null group by t.%1$I) q',
            v_cols_ask[2], v_tbl, v_cols_ask[1],
          case when v_has_org then '(array_agg(t.organization_id))[1]' else 'null::uuid' end)
          into v_ask_ids, v_ask_orgs using v_ptype;
        v_parent_ids := '{}'::uuid[];
        if coalesce(cardinality(v_ask_ids), 0) > 0 then
          begin
            if p_include_public and iam.kernel_set_form_on(v_uid) then
              select coalesce(array_agg(m.target), '{}'::uuid[]) into v_parent_ids
                from iam.has_access_for_many_in(v_uid, v_ask_ids, v_ask_orgs, (p_required)::text, v_ptype) m
               where m.allowed;
            else
              select coalesce(array_agg(x), '{}'::uuid[]) into v_parent_ids
                from unnest(v_ask_ids) x
               where iam.has_access_for_base(v_uid, v_ptype, x, p_required, p_include_public);
            end if;
          exception when others then
            raise warning 'ENTITY-IDS: the set form failed for % parents (%); asking one at a time', v_ptype, sqlerrm;
            select coalesce(array_agg(x), '{}'::uuid[]) into v_parent_ids
              from unnest(v_ask_ids) x
             where iam.has_access_for_base(v_uid, v_ptype, x, p_required, p_include_public);
          end;
        end if;
      else
        v_parent_ids := iam.accessible_entity_ids(v_ptype, p_required, p_depth + 1, p_include_public);
      end if;
      continue when coalesce(cardinality(v_parent_ids), 0) = 0;
      execute format(
        'with have as materialized (select iam.unnest_uuids($3) as id) '
        || 'select coalesce(array_agg(t.id), ''{}'') from %s t where t.%I = $1 and t.%I = any($2) '
        || 'and not exists (select 1 from have h where h.id = t.id)',
        v_tbl, v_child_cols[1], v_child_cols[2])
        into v_more using v_ptype, v_parent_ids, v_ids;
      v_ids := v_ids || coalesce(v_more, '{}'::uuid[]);
    end loop;
  end if;

  if v_soft_deleted_hidden and coalesce(array_length(v_ids,1),0) > 0 then
    v_sql := format(
      'select coalesce(array_agg(t.id), ''{}'') from %s t' ||
      ' where t.id = any($1) and t.deleted_at is null', v_tbl);
    execute v_sql into v_more using v_ids;
    v_ids := coalesce(v_more, '{}'::uuid[]);
  end if;
  -- 🚨 RC-A1 (2026-09-25): the kernel's trash rule, set-wise — a row in its owner's trash is in
  -- nobody else's set (platform.trash_hides; declared by platform.trash_is_owner_only).
  if platform.trash_is_owner_only(p_type) and coalesce(array_length(v_ids, 1), 0) > 0 then
    execute format('select coalesce(array_agg(t.id), ''{}'') from %s t where t.id = any($1) '
                   'and not platform.trash_hides($2, t.deleted_at, t.created_by, $3)', v_tbl)
      into v_more using v_ids, p_type, v_uid;
    v_ids := coalesce(v_more, '{}'::uuid[]);
  end if;
  -- 🚨 RC-A2c (2026-09-25): a row that points at another record (platform.reference_gate) is in
  -- the set only when the caller can view that record — the kernel's gate, set-wise.
  if coalesce(array_length(v_ids, 1), 0) > 0 then
    for rec in select g.type_column, g.id_column from platform.reference_gate(p_type) g loop
      execute format(
        'select coalesce(array_agg(t.id), ''{}'') from %s t where t.id = any($1) and '
        '(t.%I is null or t.%I is null or iam.has_access_for($2, t.%I, t.%I, ''viewer''::public.permission_level))',
        v_tbl, rec.type_column, rec.id_column, rec.type_column, rec.id_column)
        into v_more using v_ids, v_uid;
      v_ids := coalesce(v_more, '{}'::uuid[]);
    end loop;
  end if;
  return coalesce((
    select array_agg(distinct x) from unnest(v_ids) x
  ), '{}'::uuid[]);
end;
$function$;

CREATE OR REPLACE FUNCTION iam.entity_read_kernel_expected()
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT '33d13ee5c2f25e1462af8d56d0bcea94'::text
$function$;
CREATE OR REPLACE FUNCTION iam.entity_read_kernel_members_expected()
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT '{"members": {"files.is_crawl_artifact(p_file_id uuid)": "7eb586213cedff72ee4abb4dd60a0433", "iam.candidate_admits(p_type text, p_id uuid)": "aaafd2a1d1fb3e3579c326fe11d70cac", "iam.accessible_entity_candidates(p_type text)": "ff4a1d407ed7e37438cb773f0d5ce80e", "iam.accessible_child_parents(p_child_type text)": "bf087889e6a752ea92dbe0634d4ec003", "iam.has_org_access_for(p_user_id uuid, p_org uuid)": "05abb4362cb28aa7d775eedf975889f9", "public.is_pack_curator(p_user uuid, p_pack_id uuid)": "5e6f2b3c9c4f0f9011655974ef1532b7", "public.is_org_admin_for(p_user_id uuid, p_org_id uuid)": "ac5072f5e23eb0dfffb7ef05e9899ad4", "files.crawl_site_conveys(p_user_id uuid, p_file_id uuid)": "5fadac4e0d1ad31e788cdb446422d8fc", "public._edu_can_read_via_assignment(p_type text, p_id uuid)": "d97bbb3323238c5b8afb88e3e6337434", "public.is_rulebook_curator(p_user uuid, p_rulebook_id uuid)": "b781c4c0210974d680f53a603cb723aa", "public.library_is_open(p_entity_type text, p_entity_id uuid)": "36c934bb956df459e334c15085aacd30", "public.user_can_read_data_store_via_grant(p_user uuid, p_store uuid)": "63b3fd7f798351c9c8e7517fcfedc3fc", "public._edu_can_read_via_assignment(p_user_id uuid, p_type text, p_id uuid)": "a0d7ac13ea23ec81b8eb15bbb87e3cbb", "public.user_can_read_via_library_grant(p_user uuid, p_type text, p_id uuid)": "a49b44fa2f0de5d3aecace9d950f49e4", "files.has_access_for(p_user_id uuid, p_file_id uuid, p_required permission_level)": "d324b5143d4172b0a6b8b8188930ff7b", "iam.accessible_entity_ids(p_type text, p_required permission_level, p_depth integer)": "9fe155aa00093efd6fc9c89ab94b8479", "iam.has_access_for(p_user_id uuid, p_type text, p_id uuid, p_required permission_level)": "c7e2eec401c991f06be4bf28453548e5", "iam.has_access_for_base(p_user_id uuid, p_type text, p_id uuid, p_required permission_level)": "e37fdacb359b9a528d7aef6b2bfb5270", "iam.accessible_entity_ids(p_type text, p_required permission_level, p_depth integer, p_include_public boolean)": "abd42f41f3aed087888d0b1d8101979d", "iam.has_access_for_base(p_user_id uuid, p_type text, p_id uuid, p_required permission_level, p_include_public boolean)": "e6b147f6962003e0dc2c8b826ef4ee06", "public.has_permission_for(p_user_id uuid, p_resource_type text, p_resource_id uuid, p_required_permission permission_level)": "679e85b43c11904b2fd68bd563f5b1df", "iam.has_access_for_base(p_user_id uuid, p_type text, p_id uuid, p_required permission_level, p_include_public boolean, p_path text[])": "b664c84d0199c9489847ca146f2b2d5e", "platform.entity_row_access_attrs(p_schema text, p_table text, p_id uuid, OUT o_vis platform.visibility, OUT o_owner uuid, OUT o_org uuid, OUT o_found boolean)": "760dc66d23a0c8ef2b1f06f9a1954f19"}, "fingerprint": "33d13ee5c2f25e1462af8d56d0bcea94"}'::jsonb
$function$;

do $post$
declare v_chk jsonb; v_pre jsonb;
begin
  v_chk := platform.kernel_equivalence_check();
  if not coalesce((v_chk->>'ok')::boolean, false) or (v_chk->>'lost')::int <> 0 or (v_chk->>'gained')::int <> 0 or (v_chk->>'missing')::int <> 0 then
    raise exception 'entityids_a: after the change the kernel equivalence check is not ok: %', v_chk - 'answers';
  end if;
  if iam.entity_read_kernel_fingerprint() is distinct from iam.entity_read_kernel_expected() then
    raise exception 'entityids_a: re-recorded % but the live fingerprint reads %', iam.entity_read_kernel_expected(), iam.entity_read_kernel_fingerprint();
  end if;
  if iam.entity_read_kernel_members_expected() is distinct from
     jsonb_build_object('members', iam.entity_read_kernel_members_live(), 'fingerprint', iam.entity_read_kernel_fingerprint()) then
    raise exception 'entityids_a: the recorded members differ from the live members';
  end if;
  v_pre := platform.provision_preflight();
  if exists (select 1 from jsonb_array_elements(coalesce(v_pre->'findings', '[]'::jsonb)) f where f->>'rule_id' = 'preflight.read_kernel') then
    raise exception 'entityids_a: the provisioner preflight still names the read kernel: %', v_pre;
  end if;
  insert into platform.kernel_fingerprint_record
    (fingerprint_from, fingerprint_to, members_changed, ruling, fixture_version, evidence, via, target)
  values ('549104e33e07d066bc5df6f07e715032', '33d13ee5c2f25e1462af8d56d0bcea94',
          array['iam.accessible_child_parents(p_child_type text)', 'iam.accessible_entity_ids(p_type text, p_required permission_level, p_depth integer, p_include_public boolean)'],
          'ENTITY-IDS (2026-10-08): parent types listed by access/child_parent_asks_ids (record) are asked by the ids the child table names; every other type unchanged. Proof: identical files.files and files.file_versions sets for admin@admin.com, test@test.com, dd048-joiner; equivalence check ok.',
          'v2', jsonb_build_object('after', v_chk - 'answers'),
          'campaign entityids_a_file_parents_are_asked_by_the_ids_the_files_name.sql / lane ENTITY-IDS', 'iam.accessible_child_parents');
end $post$;
