-- lane: access-ladder T-35d — a detail's read policy opens the same Organization parents the kernel does.
-- based-on: platform.detail_readable_parents(text) c479c301ea0825c9201db7946726fbf0b5175cf8d1fe201e91e91280761b9af0
set local lock_timeout = '2s';

CREATE OR REPLACE FUNCTION platform.detail_readable_parents(p_token text)
 RETURNS TABLE(type_value text, id_value text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_uid    uuid := (select auth.uid());
  v_dc     text[] := platform.detail_parent_columns(p_token);
  v_schema text; v_table text;
  v_orgs   uuid[]; v_gr uuid[];
  r        record;
  v_ids    uuid[]; v_ok uuid[]; v_rest uuid[]; v_ask uuid[];
  v_ps text; v_pt text; v_rel regclass; v_owner text; v_org boolean; v_vis boolean;
  v_lanes  platform.lane_set; v_pred text;
  v_tok    text[] := '{}'; v_pid uuid[] := '{}';
  v_tv     text; v_key text;
begin
  -- 1294: the raw (type value, id value) pairs of p_token's rows whose record the CALLER may view —
  -- the polymorphic arm of a mapped detail's read policy (rows carrying the preferred pointer are the
  -- other arm's). Decided exactly as the kernel's set form decides a set (iam.accessible_entity_ids),
  -- restricted to the parents this table actually names:
  --   * the TRUSTED arms, one indexed query per parent token: the caller's own rows; internal-or-wider
  --     rows in the caller's organizations (when the token's class has the member lane); public rows;
  --     internal-or-wider rows of a global-readable system organization (organization/public classes);
  --     then the kernel's trash and reference gates;
  --   * every other parent is asked of the kernel ONLY when the candidate rule of 1320/1331
  --     (iam.reach_containers_worth_asking) finds a direct lane on it or above it — explicit
  --     conveyance rows, never a walk of every edge;
  --   * `file` is always asked of the kernel per id (files.has_access_for is not the generic set).
  -- Answers only for auth.uid(); no session answers nothing.
  if v_uid is null or v_dc is null or v_dc[2] is null then return; end if;
  select et.schema_name, et.table_name into v_schema, v_table
    from platform.entity_types et where et.token = p_token and et.is_active;
  if v_schema is null then return; end if;
  v_orgs := array(select om.organization_id from iam.organization_member om where om.user_id = v_uid);
  v_gr   := array(select so.organization_id from iam.system_orgs so where so.global_readable);
  v_tv   := case when v_dc[1] is null then 'null::text' else format('t.%I::text', v_dc[1]) end;
  v_key  := case when v_dc[4] is null then 'true' else format('t.%I is null', v_dc[4]) end;
  for r in execute format(
      'select q.tok, array_agg(q.pid) as ids from ('
      '  select distinct coalesce(platform.detail_parent_token($1, s.tv), $2) as tok, platform.uuid_or_null(s.iv) as pid '
      '    from (select distinct %1$s as tv, t.%2$I::text as iv from %3$I.%4$I t where %5$s) s) q '
      'where q.tok is not null and q.pid is not null group by q.tok',
      v_tv, v_dc[2], v_schema, v_table, v_key)
    using p_token, v_dc[3]
  loop
    v_ids := r.ids; v_ok := '{}'; v_ps := null;
    select et.schema_name, et.table_name into v_ps, v_pt
      from platform.entity_types et where et.token = r.tok and et.is_active;
    continue when v_ps is null;
    v_rel := to_regclass(format('%I.%I', v_ps, v_pt));
    continue when v_rel is null;
    if r.tok <> 'file' then
      v_owner := null;
      select a.attname::text into v_owner from pg_catalog.pg_attribute a
       where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped
         and a.attname in ('created_by', 'owner_id', 'user_id')
       order by case a.attname when 'created_by' then 1 when 'owner_id' then 2 else 3 end limit 1;
      select exists (select 1 from pg_catalog.pg_attribute a where a.attrelid = v_rel and a.attnum > 0
                       and not a.attisdropped and a.attname = 'organization_id') into v_org;
      select exists (select 1 from pg_catalog.pg_attribute a where a.attrelid = v_rel and a.attnum > 0
                       and not a.attisdropped and a.attname = 'visibility'
                       and a.atttypid = 'platform.visibility'::regtype) into v_vis;
      v_lanes := iam.class_lanes(r.tok);
      v_pred := concat_ws(' or ',
        case when v_owner is not null then format('t.%I = $2', v_owner) end,
        case when v_org and v_vis and v_lanes.org_member_lane
             -- Access ladder T-35d (2026-09-28): the same lane the kernel opens. On an Organization
             -- table `personal` is "Only me", a list filter, never a lock (iam.personal_opens_row):
             -- a coworker's detail rows on such a parent (15 rag.kg_chunks on 'personal' notes) were
             -- admitted by iam.has_access and refused by this arm.
             then format('((t.visibility >= ''internal'' or (t.visibility = ''personal'' and iam.personal_opens_row(%L, %L, %L, t.id))) and t.organization_id = any ($3))', r.tok, v_ps, v_pt) end,
        case when v_vis then 't.visibility = ''public''' end,
        case when v_org and v_vis and v_lanes.resolved_class in ('organization', 'public')
             then '(t.visibility >= ''internal'' and t.organization_id = any ($4))' end);
      if coalesce(v_pred, '') <> '' then
        execute format('select coalesce(array_agg(t.id), ''{}'') from %s t where t.id = any ($1) and (%s)', v_rel, v_pred)
          into v_ok using v_ids, v_uid, v_orgs, v_gr;
      end if;
      -- the kernel's trash and reference gates, as the set form applies them
      if platform.trash_is_owner_only(r.tok) and cardinality(v_ok) > 0 then
        execute format('select coalesce(array_agg(t.id), ''{}'') from %s t where t.id = any ($1) '
                       'and not platform.trash_hides($2, t.deleted_at, t.created_by, $3)', v_rel)
          into v_ok using v_ok, r.tok, v_uid;
      end if;
      if cardinality(v_ok) > 0 and exists (select 1 from platform.reference_gate(r.tok)) then
        v_ok := array(select u from unnest(v_ok) u
                       where iam.has_access_for(v_uid, r.tok, u, 'viewer'::public.permission_level));
      end if;
    end if;
    -- everything else: the kernel, only where the candidate rule finds a lane (always, for file)
    v_rest := array(select u from unnest(v_ids) u where u <> all (v_ok));
    if cardinality(v_rest) > 0 then
      if r.tok = 'file' then
        v_ask := v_rest;
      else
        v_ask := array(select w.container_id
                         from iam.reach_containers_worth_asking(v_uid,
                                array_fill(r.tok, array[cardinality(v_rest)]), v_rest) w);
      end if;
      v_ok := v_ok || array(select u from unnest(v_ask) u
                             where platform.detail_parent_access_for(v_uid, r.tok, u, 'viewer'::public.permission_level));
    end if;
    if cardinality(v_ok) > 0 then
      v_tok := v_tok || array_fill(r.tok, array[cardinality(v_ok)]);
      v_pid := v_pid || v_ok;
    end if;
  end loop;
  -- back to the raw (type value, id value) pairs the policy compares
  return query execute format(
    'select distinct s.tv, s.iv from (select distinct %1$s as tv, t.%2$I::text as iv from %3$I.%4$I t where %5$s) s '
    'join unnest($3::text[], $4::uuid[]) as k(tok, pid) '
    '  on k.tok = coalesce(platform.detail_parent_token($1, s.tv), $2) and k.pid = platform.uuid_or_null(s.iv)',
    v_tv, v_dc[2], v_schema, v_table, v_key)
  using p_token, v_dc[3], v_tok, v_pid;
end
$function$;
