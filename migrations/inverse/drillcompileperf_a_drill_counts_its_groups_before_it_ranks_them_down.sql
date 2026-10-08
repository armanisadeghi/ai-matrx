-- chair-step: the inverse of migrations/campaign/drillcompileperf_a_drill_counts_its_groups_before_it_ranks_them.sql (lane DRILL-COMPILE-PERF) — puts back platform._drill_compile exactly as it was (the row-by-row answer statement, as migrations/campaign/drillprimitive3_blank_and_null_are_one_no_value_group.sql wrote it) and drops the two text builders only it called (platform._drill_fine_agg_sql, platform._drill_fine_ratio_sql). No row of anybody's data is touched.
-- lane: DRILL-COMPILE-PERF
-- lock: platform
-- based-on: platform._drill_compile(uuid, jsonb, jsonb, text) e8842fc8caae44b8c52162a0f055321ddcda6ecbf0f429dbf1a918bc44514651
-- (based-on hash: the body the up file writes — pg_get_functiondef of it is the up file's text byte for byte)

CREATE OR REPLACE FUNCTION platform._drill_compile(p_organization_id uuid, p_def jsonb, p_question jsonb, p_kind text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  c_ops    constant text[] := array['count','count_distinct','sum','avg','min','max','median','filled','empty','span'];
  c_steps  constant jsonb := '{"hour":"1 hour","day":"1 day","week":"7 days","month":"1 month","quarter":"3 months","year":"1 year"}';
  q        jsonb := coalesce(p_question, '{}'::jsonb);
  v_c      jsonb := p_def -> '_c';
  v_cols   jsonb;
  k        text;
  v_lane   text;
  v_mode   text := coalesce(p_def ->> 'mode', 'invoker');
  v_me     uuid := auth.uid();
  v_cal    jsonb;
  v_tz     text;
  v_ws     text;
  v_shift  integer;
  v_params jsonb := '{}'::jsonb;
  v_from   text;
  v_preds  text[] := '{}';
  v_w      jsonb := '[]'::jsonb;         -- bound where values, by position
  v_by     jsonb := '[]'::jsonb;         -- [{key, dim, grain, col}]
  v_ax     jsonb;                        -- the across entry
  v_show   jsonb := '[]'::jsonb;         -- [{key, op, col, grain_col, cat}]
  v_sort   jsonb;
  v_cap    integer;
  v_acap   integer;
  v_cmp    jsonb;
  v_win    jsonb;
  v_time_default boolean := false;
  e        jsonb;
  d        jsonb;
  m        jsonb;
  v_col    jsonb;
  v_ref    text;
  v_x      text;
  v_i      integer;
  v_n      integer;
  v_sel    text[];
  v_gk     text[];
  v_sets   text;
  v_meas   text[];
  v_zero   jsonb := '{}'::jsonb;
  v_delta  text[] := '{}';
  v_grp    text;
  v_order  text;
  v_sql    text;
  v_rel    jsonb := '[]'::jsonb;
  v_rank_dir text;
  v_rank_expr text;
  v_has_by boolean;
  v_has_ax boolean;
  v_rows_cols text[];
  v_pk     jsonb;
  v_fact   jsonb;                        -- the relation read: the fact, or the records relation
  v_records boolean := false;           -- the records of a definer definition, read by the definer step
  v_asof   timestamptz;
  v_parts  jsonb;
  v_part   jsonb;
  v_j      integer;
  v_hv     jsonb := '[]'::jsonb;         -- the thresholds' numbers, bound
  v_hsel   text[] := '{}';               -- per-group values the thresholds read (bg)
  v_hok    text[] := '{}';               -- the thresholds, as predicates (bh)
  v_hmed   text[] := '{}';               -- the medians they compare with (bm)
  v_hsays  text[] := '{}';
  v_page   text;
  v_sum    text[];
  v_k      jsonb := '[]'::jsonb;         -- bound constants of the Measures (percentile p, scales, per) — $1->'k'
  v_mp     jsonb;                        -- a Measure's plan (platform._drill_measure_plan)
  v_flt    jsonb;                        -- a Measure's own filter (platform._drill_measure_filter)
  v_leaf   jsonb;
  v_leaves jsonb;
  v_cs     jsonb;
  v_val    text;
  v_rate_ws text;                        -- the window's length (seconds) beside each row, for a run rate
  -- LANE7-W3A (door 2): the Table API's question over a standard table
  v_api    boolean := false;             -- a question that names a scope is the API's list
  v_api_d  jsonb;                        -- the definition's api block (door 1)
  v_has    jsonb;
  v_scope  text;
  v_dlw    jsonb;
  v_dlw_p  text[] := '{}';               -- the default list rule, one predicate per fact
  v_dlw_w  text[] := '{}';               -- and the words a row off the default list is shown with
  v_term   text;
  v_obj    text;
  v_sx     text;                         -- the sort expression the cursor walks
  v_sdesc  boolean := false;
  v_cmax   integer;
  v_chunks text[];
  -- AP3-PHASEB-U1: the written-out lanes and the field mask (API branch only)
  v_mo     text;                         -- her memberships, as a uuid[] literal ($1->>'mo')
  v_st     text;                         -- the Shown-to filter on the organization arm
  v_g      text;                         -- the explicit-grant arm
  v_stc    boolean;
  v_fid    uuid;
  v_forg   uuid;
  v_cfx    text;
  -- AP3-PHASEB-U4: the API branch's predicate list (G1/G2), sort list (G3) and count switch (G4)
  v_pl     text[];                       -- one predicate's arms (several columns OR them); the cursor's arms
  v_pv     text;
  v_neg    boolean;
  v_op     text;
  v_lbl    text;
  v_skeys  jsonb := '[]'::jsonb;         -- the effective order: [{x: expression, d: descending, t: type}]
  v_kx     text;
begin
  -- the columns this definition may read: key -> {alias, column, type, cat, fk?}
  v_cols := coalesce(v_c -> 'cols', '{}'::jsonb);
  v_fact := v_c -> 'fact';
  -- THE RECORDS OF A DEFINER DEFINITION (decision 14): the same question, the same lane rule and the
  -- same filter, read from the declared records relation, whose columns carry the fact's names.
  if p_kind = 'rows' and v_mode = 'definer' and v_c ? 'records' then
    v_records := true;
    v_cols := v_c -> 'records' -> 'cols';
    v_fact := v_c -> 'records' -> 'fact';
  end if;

  for k in select jsonb_object_keys(q) loop
    if not (k = any (array['by','across','show','where','window','compare','sort','limit','offset','lane','path','columns','having','scope','organization','search','all_rows','archived','cursor','total'])) then
      raise exception '"%" is not part of a question.', k
        using errcode = '22023', hint = 'A question has: by, across, show, where, window, compare, sort, limit, lane, having (and for records: offset, columns).';
    end if;
  end loop;
  if (q ? 'by') and jsonb_typeof(q -> 'by') <> 'array' then
    raise exception 'by is a list of dimension keys, outermost first.' using errcode = '22023';
  end if;
  if (q ? 'show') and jsonb_typeof(q -> 'show') <> 'array' then
    raise exception 'show is a list of measure keys.' using errcode = '22023';
  end if;
  if (q ? 'where') and jsonb_typeof(q -> 'where') <> 'object' and not (q ? 'scope' and jsonb_typeof(q -> 'where') = 'array') then
    raise exception 'where is an object of dimension key -> value.' using errcode = '22023',
      hint = 'A value is an equality, null is "not set", a list is any of them, and {"from": …, "to": …} is a half-open range.';
  end if;

  v_api := q ? 'scope';
  v_api_d := coalesce(p_def -> 'api', '{}'::jsonb);
  v_has := coalesce(v_api_d -> 'has', '{}'::jsonb);
  if not v_api and (q ? 'search' or q ? 'all_rows' or q ? 'archived' or q ? 'cursor' or q ? 'total') then
    raise exception 'organization, search, all_rows, archived, cursor and total are asked together with a scope.' using errcode = '22023',
      hint = 'Add "scope": "all" (or mine, team, orgs, shared, public).';
  end if;
  if v_api then
    -- ── THE SCOPE (lane 7, the Table API): the row rules decide what she can read; a scope is
    -- a filter she chose on top of them, never a copy of them. No access predicate of our own.
    if v_mode = 'definer' or not (p_def ? 'api') then
      raise exception '"%" is asked in its lanes, not by scope.', p_def ->> 'label' using errcode = '22023';
    end if;
    if v_me is null then
      raise exception 'Listing by scope needs a signed-in person.' using errcode = '42501';
    end if;
    v_lane := 'scope';
    v_scope := lower(coalesce(nullif(btrim(q ->> 'scope'), ''), 'all'));
    v_params := v_params || jsonb_build_object('org', p_organization_id, 'me', v_me, 'tok', v_fact ->> 'token');
    if v_scope in ('mine', 'team', 'shared') and not coalesce((v_has ->> 'created_by')::boolean, false) then
      raise exception '% has no column that says who added each one, so it has no "%" list.', p_def ->> 'label', v_scope using errcode = '22023';
    end if;
    if v_scope in ('orgs', 'shared', 'team') and not coalesce((v_has ->> 'organization_id')::boolean, false) then
      raise exception '% does not belong to organizations, so it has no "%" list.', p_def ->> 'label', v_scope using errcode = '22023';
    end if;
    if v_scope = 'public' and not coalesce((v_has ->> 'published_to_web')::boolean, false) then
      raise exception '% has no public records, so it has no "public" list.', p_def ->> 'label' using errcode = '22023';
    end if;
    -- the two discovery lanes, never folded into All: a row published platform-wide (Public),
    -- and a row of a global-readable system organization (System, iam.system_orgs)
    v_x := concat_ws(' or ',
             case when coalesce((v_has ->> 'published_to_web')::boolean, false) then 'coalesce(t.published_to_web, false)' end,
             case when coalesce((v_has ->> 'organization_id')::boolean, false)
                  then 'coalesce(t.organization_id in (select so.organization_id from iam.system_orgs so where so.global_readable), false)' end);
    -- AP3-PHASEB-U1 (M5, G7, 2026-10-06): THE LANES ARE WRITTEN OUT, never "every row the row rules
    -- return". Her organizations are her MEMBERSHIPS (iam.organization_member of a live organization), never
    -- iam.my_orgs(), which the admin lane widens to the system organization; a grant is an explicit
    -- iam.permissions row to her or to one of those organizations; each row's Shown-to is a FILTER on the
    -- organization arm (platform.shown_to_lists), never a lock: a row it hides still opens by id ("any").
    -- Row security stays the ceiling; platform_admin_read is untouched.
    select coalesce(array_agg(om.organization_id order by om.organization_id), '{}'::uuid[])::text into v_mo
      from iam.organization_member om
      join iam.organizations o on o.id = om.organization_id and o.archived_at is null
     where om.user_id = v_me;
    v_params := v_params || jsonb_build_object('mo', v_mo);
    v_st := 'true';
    if coalesce((v_has ->> 'organization_id')::boolean, false) and v_scope in ('all', 'team', 'orgs') then
      -- (T-13: the retired row column is never read; shown_to carries the person's choice, and a row with
      -- none takes its organization's "Shown to by default" from platform.shown_to_context)
      v_stc := (platform._drill_column(v_fact ->> 'schema', v_fact ->> 'table', 'shown_to') ->> 'type') = 'platform.shown_to';
      v_params := v_params || jsonb_build_object('stc', platform.shown_to_context(v_fact ->> 'token'));
      v_st := format('platform.shown_to_lists(%s, null, %s, t.organization_id, ($1->>''me'')::uuid, $1->''stc'')',
        case when coalesce(v_stc, false) then 't.shown_to' else 'null' end,
        case when coalesce((v_has ->> 'created_by')::boolean, false) then 't.created_by' else 'null::uuid' end);
    end if;
    v_g := format('t.%I in (select p.resource_id from iam.permissions p where p.resource_type = ($1->>''tok'') and (p.granted_to_user_id = ($1->>''me'')::uuid or p.granted_to_organization_id = any (($1->>''mo'')::uuid[])) and p.status <> ''rejected'' and (p.expires_at is null or p.expires_at > now()))',
      v_fact -> 'pk' ->> 0);
    if v_scope = 'all' then
      -- All = Mine ∪ My organizations (Shown-to applied) ∪ explicit grants
      if coalesce((v_has ->> 'created_by')::boolean, false) or coalesce((v_has ->> 'organization_id')::boolean, false) then
        v_preds := v_preds || ('(' || concat_ws(' or ',
          case when coalesce((v_has ->> 'created_by')::boolean, false) then 't.created_by = ($1->>''me'')::uuid' end,
          case when coalesce((v_has ->> 'organization_id')::boolean, false)
               then format('(t.organization_id = any (($1->>''mo'')::uuid[]) and %s)', v_st) end,
          v_g,
          -- follow-up 1: what she reaches through containment (a child of a record she can open) by HER OWN
          -- access — the kernel, never the admin route — outside her member organizations, never a discovery row
          concat_ws(' and ',
            case when coalesce((v_has ->> 'organization_id')::boolean, false)
                 then 'not coalesce(t.organization_id = any (($1->>''mo'')::uuid[]), false)' end,
            case when v_x <> '' then format('not (%s)', v_x) end,
            case when coalesce((v_has ->> 'organization_id')::boolean, false) then v_st end,
            format('iam.has_access(($1->>''tok''), t.%I, ''viewer'')', v_fact -> 'pk' ->> 0))) || ')');
      elsif v_x <> '' then
        v_preds := v_preds || format('(not (%s) or %s)', v_x, v_g);
      end if;
    elsif v_scope = 'system' then
      if not coalesce((v_has ->> 'organization_id')::boolean, false) then
        raise exception '% does not belong to organizations, so it has no "system" list.', p_def ->> 'label' using errcode = '22023';
      end if;
      v_preds := v_preds || 't.organization_id in (select so.organization_id from iam.system_orgs so where so.global_readable)'::text;
    elsif v_scope = 'mine' then
      v_preds := v_preds || 't.created_by = ($1->>''me'')::uuid'::text;
    elsif v_scope = 'team' then
      v_preds := v_preds || format('(t.created_by in (select r.user_id from iam.my_team_reach() r where r.organization_id = t.organization_id) and t.organization_id = any (($1->>''mo'')::uuid[]) and %s)', v_st);
    elsif v_scope = 'orgs' then
      v_preds := v_preds || format('(t.organization_id = any (($1->>''mo'')::uuid[]) and %s)', v_st);
    elsif v_scope = 'shared' then
      v_preds := v_preds || format('(t.created_by is distinct from ($1->>''me'')::uuid and %s)', v_g);
    elsif v_scope = 'public' then
      v_preds := v_preds || 'coalesce(t.published_to_web, false)'::text;
    elsif v_scope = 'any' then
      null;   -- reading by id: exactly what her row rules let her open, with no list defaults
    else
      raise exception '"%" is not a scope.', q ->> 'scope' using errcode = '22023',
        hint = 'A list is scoped all, mine, team, orgs, shared, public or system.';
    end if;
    -- AP3-PHASEB-U1: an archived organization is closed whatever the lane (ACCESS LADDER T-33); the admin
    -- lane's org_open_gate arm never reopens it on a list.
    if v_scope <> 'any' and coalesce((v_has ->> 'organization_id')::boolean, false) then
      v_preds := v_preds || '(t.organization_id is null or t.organization_id not in (select iam.archived_org_ids()))'::text;
    end if;
    -- one organization, when she names one; every organization she can read otherwise
    if jsonb_typeof(q -> 'organization') = 'string' then
      if not coalesce((v_has ->> 'organization_id')::boolean, false) then
        raise exception '% does not belong to organizations, so it cannot be narrowed to one.', p_def ->> 'label' using errcode = '22023';
      end if;
      begin
        v_params := v_params || jsonb_build_object('orgf', (q ->> 'organization')::uuid);
      exception when others then
        raise exception '"%" is not an organization id.', q ->> 'organization' using errcode = '22023';
      end;
      v_preds := v_preds || 't.organization_id = ($1->>''orgf'')::uuid'::text;
    end if;
  else
  v_lane := coalesce(nullif(q ->> 'lane', ''), case when p_def -> 'lanes' ? 'organization' then 'organization'
                                                    else p_def -> 'lanes' ->> 0 end);
  if not (p_def -> 'lanes' ? v_lane) then
    raise exception '"%" cannot be asked in the % lane.', p_def ->> 'label', v_lane
      using errcode = '22023', hint = format('It offers: %s.', (select string_agg(x #>> '{}', ', ') from jsonb_array_elements(p_def -> 'lanes') x));
  end if;
  if v_lane = 'platform' and not public.is_platform_admin() then
    raise exception 'Everything on the platform is counted only inside the admin apps, by a platform admin.'
      using errcode = '42501', hint = 'Ask in your organization''s lane, or your own.';
  end if;
  if v_lane = 'mine' and public.is_platform_admin() then
    raise exception 'Inside the admin apps an admin never counts as herself.'
      using errcode = '22023', hint = 'Ask in the platform lane, or in one organization''s.';
  end if;
  if v_lane = 'mine' and v_me is null then
    raise exception 'Your own lane needs a signed-in person.' using errcode = '42501';
  end if;
  v_params := v_params || jsonb_build_object('org', p_organization_id, 'me', v_me);

  if v_mode = 'definer' and q ? 'organization' then
    raise exception '"%" is counted in its lanes; it is not narrowed to one organization.', p_def ->> 'label' using errcode = '22023';
  end if;
  if v_mode = 'definer' then
    e := p_def -> '_c' -> 'lane_rules' -> v_lane;
    if e is null then
      raise exception 'The % lane of "%" names no rule, so it is not answered.', v_lane, p_def ->> 'key' using errcode = '42P17';
    end if;
    if v_lane = 'organization' and e ->> 'rule' = 'admin'
       and not (p_organization_id in (select iam.my_admin_orgs())) then
      raise exception 'Only an owner or admin of this organization sees its % counted here.', lower(p_def ->> 'label')
        using errcode = '42501';
    end if;
    if v_lane in ('mine', 'organization') then
      v_col := v_cols -> (e ->> 'column');
      v_preds := v_preds || format('%I.%I = ($1->>%L)::uuid', v_col ->> 'alias', v_col ->> 'column',
                                   case when v_lane = 'mine' then 'me' else 'org' end);
    end if;
  else
    if v_lane = 'organization' and v_c -> 'lane_cols' ? 'organization' then
      v_col := v_cols -> (v_c -> 'lane_cols' ->> 'organization');
      if jsonb_typeof(q -> 'organization') = 'string' then
        -- one organization, when she names one
        begin
          v_params := v_params || jsonb_build_object('orgf', (q ->> 'organization')::uuid);
        exception when others then
          raise exception '"%" is not an organization id.', q ->> 'organization' using errcode = '22023';
        end;
        v_preds := v_preds || format('%I.%I = ($1->>''orgf'')::uuid', v_col ->> 'alias', v_col ->> 'column');
      elsif q ? 'lane' then
        -- the organization lane, asked for by name: the organization the question is asked in
        v_preds := v_preds || format('%I.%I = ($1->>''org'')::uuid', v_col ->> 'alias', v_col ->> 'column');
      else
        -- CHAIR-ENTITY-BLOCKS-2 — THE ACTIVE ORGANIZATION IS NEVER A LIST FILTER (access ladder):
        -- unasked, a standard source is everything she can see across her organizations (and what
        -- belongs to none); her row rules still decide every row.
        v_preds := v_preds || format('(%1$I.%2$I is null or %1$I.%2$I in (select iam.my_orgs()))', v_col ->> 'alias', v_col ->> 'column');
      end if;
    elsif v_lane = 'mine' then
      if not (v_c -> 'lane_cols' ? 'mine') then
        raise exception '"%" has no column that says whose a row is, so it has no lane of your own.', p_def ->> 'label' using errcode = '22023';
      end if;
      v_col := v_cols -> (v_c -> 'lane_cols' ->> 'mine');
      v_preds := v_preds || format('%I.%I = ($1->>''me'')::uuid', v_col ->> 'alias', v_col ->> 'column');
    end if;
  end if;
  end if;   -- (the lanes; a scoped question took the branch above)
  -- (follow-up 2: on every branch — a scoped list and an analytics question alike)
    -- AP3-PHASEB-U1 (R12 / G8, 2026-10-06): THE STORE'S FIELD MASK ON EVERY cf: COLUMN. A custom value is
    -- read only where iam.may_touch_field — the rule custom.entity_read_mask applies, at her seat on the row
    -- (custom.entity_seat_level: admin = organization admin or admin access; editor = the creator or editor
    -- access; else viewer) — lets her read it. Elsewhere the column is NULL, so a filter, a sort or a search on
    -- it answers as unknown, as custom.rule_filter_node_sql treats a hidden field. Protected fields stay
    -- platform._drill_protect's. The rule is asked once per field here; only an answer that depends on the
    -- row is asked per row.
    for k, v_col in select e.key, e.value from jsonb_each(v_cols) e
                     where e.key like 'cf:%' and coalesce((e.value ->> 'custom')::boolean, false)
                       and not coalesce((e.value ->> 'protected')::boolean, false) loop
      begin
        v_fid := substr(k, 4)::uuid;
        v_forg := (v_col ->> 'organization_id')::uuid;
      exception when others then
        v_fid := null;
      end;
      if v_fid is null or v_forg is null then
        v_cfx := 'false';
      elsif iam.may_touch_field(v_me, v_fid, v_forg, 'viewer', 'read') then
        continue;      -- any seat on a row she can open reads it
      elsif not iam.may_touch_field(v_me, v_fid, v_forg, 'admin', 'read') then
        v_cfx := 'false';
      elsif iam.has_org_admin(v_forg) then
        continue;      -- an organization admin holds the admin seat on each of its rows
      elsif iam.may_touch_field(v_me, v_fid, v_forg, 'editor', 'read') then
        v_cfx := concat_ws(' or ',
          case when coalesce((v_has ->> 'created_by')::boolean, false) then 't.created_by = ($1->>''me'')::uuid' end,
          format('iam.has_access(%L, t.%I, ''editor'')', v_fact ->> 'token', v_fact -> 'pk' ->> 0));
      else
        v_cfx := format('iam.has_access(%L, t.%I, ''admin'')', v_fact ->> 'token', v_fact -> 'pk' ->> 0);
      end if;
      v_cols := jsonb_set(v_cols, array[k, 'expr'], to_jsonb(format('(case when (%s) then %s end)', v_cfx, v_col ->> 'expr')));
    end loop;
  if v_api then
    -- archived rows: off the list unless asked for; refused in words where nothing is archived
    v_x := lower(coalesce(nullif(q ->> 'archived', ''), case when v_scope = 'any' then 'include' else 'exclude' end));
    if v_x not in ('exclude', 'include', 'only') then
      raise exception 'archived is exclude, include or only.' using errcode = '22023';
    end if;
    if v_x = 'only' and not (v_fact ->> 'deleted')::boolean then
      raise exception '% are never archived, so there is no archived list.', p_def ->> 'label' using errcode = '22023';
    end if;
    if (v_fact ->> 'deleted')::boolean then
      if v_x = 'exclude' then v_preds := v_preds || 't.deleted_at is null'::text;
      elsif v_x = 'only' then v_preds := v_preds || 't.deleted_at is not null'::text;
      end if;
    end if;
    -- THE DEFAULT LIST (the registry's one copy of "hidden by default"), dropped by all_rows and
    -- never applied to a read by id. Each fact also says, on a row it hides, why it is off the list.
    v_dlw := coalesce(v_api_d -> 'default_list_where', '{}'::jsonb);
    for k, e in select key, value from jsonb_each(v_dlw) loop
      v_x := case when jsonb_typeof(e) = 'null' then format('t.%I is null', k)
                  else format('t.%I::text = %L', k, e #>> '{}') end;
      v_dlw_p := v_dlw_p || v_x;
      v_dlw_w := v_dlw_w || format('case when not coalesce(%s, false) then %L end', v_x,
                                   k || case when jsonb_typeof(e) = 'null' then ' is set' else ' is not ' || (e #>> '{}') end);
    end loop;
    if not coalesce((q ->> 'all_rows')::boolean, false) and v_scope <> 'any' then
      v_preds := v_preds || v_dlw_p;
    end if;
    -- SEARCH: the whole term, as the app searches it — one ilike, ORed across the registry's
    -- search columns, the term bound and its % and _ escaped. Never split into words.
    v_term := nullif(btrim(coalesce(q ->> 'search', '')), '');
    if v_term is not null then
      if jsonb_array_length(coalesce(v_api_d -> 'search_columns', '[]')) = 0 then
        raise exception '% has no columns to search.', p_def ->> 'label' using errcode = '22023';
      end if;
      v_params := v_params || jsonb_build_object('s', '%' || replace(replace(replace(v_term, '\', '\\'), '%', '\%'), '_', '\_') || '%');
      v_preds := v_preds || ('(' || (select string_agg(format('t.%I::text ilike ($1->>''s'')', x #>> '{}'), ' or ')
                                       from jsonb_array_elements(v_api_d -> 'search_columns') x) || ')');
    end if;
    -- a read by id, or a where on any column this seat may read: the key is a column too
    if jsonb_array_length(v_fact -> 'pk') = 1 and not v_cols ? (v_fact -> 'pk' ->> 0) then
      v_cols := v_cols || jsonb_build_object(v_fact -> 'pk' ->> 0,
        jsonb_build_object('alias', 't', 'column', v_fact -> 'pk' ->> 0, 'type', 'uuid', 'cat', 'uuid'));
    end if;
  elsif (v_fact ->> 'deleted')::boolean then
    v_preds := v_preds || 't.deleted_at is null'::text;
  end if;

  -- ── THE CALENDAR (only when a time is cut) ───────────────────────────────────────────────
  v_cal := custom.agg_calendar(p_organization_id);
  v_tz := v_cal ->> 'time_zone';
  v_ws := v_cal ->> 'week_start';
  v_shift := (8 - coalesce(array_position(array['monday','tuesday','wednesday','thursday','friday','saturday','sunday'], v_ws), 1)) % 7;
  v_params := v_params || jsonb_build_object('tz', v_tz);

  -- ── FROM: the fact and its star ──────────────────────────────────────────────────────────
  v_from := format('%I.%I t', v_fact ->> 'schema', v_fact ->> 'table');
  for e in select x from jsonb_array_elements(coalesce(v_c -> 'joins', '[]'::jsonb)) x loop
    v_from := v_from || format(' left join %I.%I %I on %I.%I = %I.%I',
                               e ->> 'schema', e ->> 'table', e ->> 'alias',
                               e ->> 'alias', e ->> 'to', e ->> 'on_alias', e ->> 'on_column');
  end loop;

  -- ── WHERE: every value bound, cast to the column's own type ──────────────────────────────
  for k, e in select key, value from jsonb_each(case when jsonb_typeof(q -> 'where') = 'array' then '{}'::jsonb else coalesce(q -> 'where', '{}'::jsonb) end) loop
    d := (select x from jsonb_array_elements(p_def -> 'dimensions') x where x ->> 'key' = k);
    if d is null and v_cols ? k then
      -- LANE7-W3A: a where on any column this seat may read, not only on a Dimension
      d := jsonb_build_object('key', k, 'from', k, 'kind', 'column',
             'label', coalesce((select x ->> 'name' from jsonb_array_elements(coalesce(v_api_d -> 'columns', '[]')) x where x ->> 'api_name' = k), k));
    end if;
    if d is null then
      d := (select x from jsonb_array_elements(p_def -> 'dimensions') x where x ->> 'key' = split_part(k, ':', 1));
    end if;
    if d is null then
      raise exception 'There is no dimension "%" to filter by.', k using errcode = '22023',
        hint = format('Dimensions: %s.', (select string_agg(x ->> 'key', ', ') from jsonb_array_elements(p_def -> 'dimensions') x));
    end if;
    v_col := v_cols -> (d ->> 'from');
    v_ref := coalesce(v_col ->> 'expr', format('%I.%I', v_col ->> 'alias', v_col ->> 'column'));
    if position(':' in k) > 0 and d ->> 'kind' <> 'column' then
      -- a bucket a person clicked: that one period, from its label to the next
      v_x := split_part(k, ':', 2);
      if d ->> 'kind' <> 'time' or not (c_steps ? v_x) or jsonb_typeof(e) <> 'string' then
        raise exception '"%" is a period filter: a time dimension, a grain, and the period''s label.', k using errcode = '22023';
      end if;
      begin
        e := jsonb_build_object('from', (e #>> '{}')::timestamptz,
                                'to', (((e #>> '{}')::timestamptz at time zone v_tz) + (c_steps ->> v_x)::interval) at time zone v_tz);
      exception when others then
        raise exception '"%" is not a period label (such as 2026-09-01T00:00:00-07:00).', e #>> '{}' using errcode = '22023';
      end;
    end if;
    v_i := jsonb_array_length(v_w);
    if jsonb_typeof(e) = 'null' then
      -- BLANK IS NO VALUE (lane DRILL-PRIMITIVE-3): '' and NULL are ONE "No value" group, so its records are both
      v_preds := v_preds || case when v_col ->> 'type' in ('text', 'character varying', 'varchar', 'citext')
                                 then format('(%1$s is null or %1$s = '''')', v_ref) else format('%s is null', v_ref) end;
    elsif jsonb_typeof(e) = 'array' then
      if jsonb_array_length(e) > 1000 then
        raise exception 'A filter lists at most 1000 values; this one lists %.', jsonb_array_length(e) using errcode = '22023';
      end if;
      perform platform._drill_assert_values(e, v_col ->> 'type', d ->> 'label');
      v_w := v_w || jsonb_build_array(e);
      v_preds := v_preds || format('(%1$s = any ((select array_agg(x) from jsonb_array_elements_text($1->''w''->%2$s) x)::%3$s[]) or (%4$s and ($1->''w''->%2$s) @> ''[null]''))',
                                   v_ref, v_i, v_col ->> 'type',
                                   case when v_col ->> 'type' in ('text', 'character varying', 'varchar', 'citext') then format('(%1$s is null or %1$s = '''')', v_ref) else format('%s is null', v_ref) end);
    elsif jsonb_typeof(e) = 'object' and exists (select 1 from jsonb_object_keys(e) x where x not in ('from', 'to')) then
      -- LANE7-W3A: the one wire grammar's comparisons (eq ne gt gte lt lte from to in empty),
      -- every one of which must hold; each value bound and cast to the column's own type
      if exists (select 1 from jsonb_object_keys(e) x where x not in ('eq','ne','gt','gte','lt','lte','from','to','in','empty')
                                                          and not (v_api and x = 'contains')) then
        raise exception 'A filter on % says eq, ne, gt, gte, lt, lte, from, to, in% or empty.', d ->> 'label',
          case when v_api then ', contains' else '' end using errcode = '22023';
      end if;
      for v_x, m in select key, value from jsonb_each(e) loop
        v_i := jsonb_array_length(v_w);
        if v_x = 'empty' then
          if jsonb_typeof(m) <> 'boolean' then
            raise exception '"empty" on % is true or false.', d ->> 'label' using errcode = '22023';
          end if;
          v_preds := v_preds || format('%s is %snull', v_ref, case when (m #>> '{}')::boolean then '' else 'not ' end);
        elsif v_x = 'contains' then
          -- AP3-PHASEB-U4 (G1, the API only): a case-blind literal match, its \, % and _ escaped, bound
          if jsonb_typeof(m) not in ('string', 'number') then
            raise exception '"contains" on % takes text.', d ->> 'label' using errcode = '22023';
          end if;
          v_w := v_w || jsonb_build_array('%' || replace(replace(replace(m #>> '{}', '\', '\\'), '%', '\%'), '_', '\_') || '%');
          v_preds := v_preds || format('%s::text ilike ($1->''w''->>%s)', v_ref, v_i);
        elsif v_x = 'in' then
          if jsonb_typeof(m) <> 'array' or jsonb_array_length(m) = 0 then
            raise exception '"in" on % takes a list of values.', d ->> 'label' using errcode = '22023';
          end if;
          perform platform._drill_assert_values(m, v_col ->> 'type', d ->> 'label');
          v_w := v_w || jsonb_build_array(m);
          v_preds := v_preds || format('%1$s = any ((select array_agg(x) from jsonb_array_elements_text($1->''w''->%2$s) x)::%3$s[])', v_ref, v_i, v_col ->> 'type');
        else
          perform platform._drill_assert_values(jsonb_build_array(m), v_col ->> 'type', d ->> 'label');
          if jsonb_typeof(m) = 'null' then
            raise exception '"%" on % takes a value.', v_x, d ->> 'label' using errcode = '22023';
          end if;
          v_w := v_w || jsonb_build_array(m);
          v_preds := v_preds || format('%s %s ($1->''w''->>%s)::%s', v_ref,
            case v_x when 'eq' then '=' when 'ne' then 'is distinct from' when 'gt' then '>' when 'gte' then '>='
                     when 'lt' then '<' when 'lte' then '<=' when 'from' then '>=' else '<' end, v_i, v_col ->> 'type');
        end if;
      end loop;
    elsif jsonb_typeof(e) = 'object' then
      if exists (select 1 from jsonb_object_keys(e) x where x not in ('from', 'to')) or not (e ? 'from' or e ? 'to') then
        raise exception 'A range is {"from": …, "to": …}: from is included, to is not.' using errcode = '22023';
      end if;
      if v_col ->> 'cat' = 'time' then
        begin
          e := jsonb_strip_nulls(jsonb_build_object('from', (e ->> 'from')::timestamptz, 'to', (e ->> 'to')::timestamptz));
        exception when others then
          raise exception 'The range on % is not two moments.', d ->> 'label' using errcode = '22023';
        end;
        v_x := platform._drill_moment_sql(v_ref, v_col ->> 'type');
        v_w := v_w || jsonb_build_array(e);
        if e ? 'from' then v_preds := v_preds || format('%s >= ($1->''w''->%s->>''from'')::timestamptz', v_x, v_i); end if;
        if e ? 'to' then v_preds := v_preds || format('%s < ($1->''w''->%s->>''to'')::timestamptz', v_x, v_i); end if;
      else
        perform platform._drill_assert_values(jsonb_build_array(e -> 'from', e -> 'to'), v_col ->> 'type', d ->> 'label');
        v_w := v_w || jsonb_build_array(e);
        if e ? 'from' then v_preds := v_preds || format('%s >= ($1->''w''->%s->>''from'')::%s', v_ref, v_i, v_col ->> 'type'); end if;
        if e ? 'to' then v_preds := v_preds || format('%s < ($1->''w''->%s->>''to'')::%s', v_ref, v_i, v_col ->> 'type'); end if;
      end if;
    else
      perform platform._drill_assert_values(jsonb_build_array(e), v_col ->> 'type', d ->> 'label');
      v_w := v_w || jsonb_build_array(e);
      v_preds := v_preds || format('%s = ($1->''w''->>%s)::%s', v_ref, v_i, v_col ->> 'type');
    end if;
  end loop;

  -- AP3-PHASEB-U4 (G1/G2, 2026-10-06): THE API'S PREDICATE LIST (entity CONTRACT §3.2). The object form above is
  -- the Table API's and is untouched. Here each predicate {column | columns, op, …, negated} is its own conjunct,
  -- so two on one column compose; "columns" (a custom key several organizations declare) judges each row by its own
  -- organization's field (a row of an organization that declares none has no value).
  -- Every value is bound and cast to the column's own type; a choice is matched by its word too; text is matched
  -- case-blind as a literal (its \, % and _ escaped); negated = NOT coalesce(positive, false), so a negated test
  -- also keeps the rows it cannot judge (an empty value, or a field this seat may not read).
  if v_api and q ? 'total' and jsonb_typeof(q -> 'total') <> 'boolean' then
    raise exception 'total is true or false.' using errcode = '22023';
  end if;
  if v_api and jsonb_typeof(q -> 'where') = 'array' then
    if jsonb_array_length(q -> 'where') > 100 then
      raise exception 'A list is filtered by at most 100 predicates; this one has %.', jsonb_array_length(q -> 'where') using errcode = '22023';
    end if;
    for e in select x from jsonb_array_elements(q -> 'where') x loop
      if jsonb_typeof(e) <> 'object' then
        raise exception 'A predicate is {"column", "op", …}.' using errcode = '22023';
      end if;
      v_op := lower(coalesce(e ->> 'op', ''));
      if v_op = 'contains' then
        v_op := 'text';
        e := jsonb_build_object('match', 'contains') || e;
      elsif v_op = 'ne' then
        v_op := 'neq';
      end if;
      if not (v_op = any (array['eq','neq','gt','gte','lt','lte','range','in','empty','null','text'])) then
        raise exception '"%" is not a filter: eq, neq, gt, gte, lt, lte, range, in, empty, null, text or contains.', coalesce(e ->> 'op', '')
          using errcode = '22023';
      end if;
      if e ? 'negated' and jsonb_typeof(e -> 'negated') not in ('boolean', 'null') then
        raise exception 'negated is true or false.' using errcode = '22023';
      end if;
      v_neg := coalesce((e ->> 'negated')::boolean, false);
      v_pl := '{}';
      v_sx := null;     -- several organizations' fields: CASE t.organization_id WHEN <org> THEN <its test> … ELSE <no value> END
      if jsonb_typeof(e -> 'columns') = 'array' and jsonb_array_length(e -> 'columns') > 1
         and not exists (select 1 from jsonb_array_elements(e -> 'columns') y
                          where v_cols -> (y #>> '{}') ->> 'organization_id' is null) then
        v_sx := 'case t.organization_id';
      end if;
      for k in select y #>> '{}' from jsonb_array_elements((case when jsonb_typeof(e -> 'columns') = 'array' then e -> 'columns'
                                                                else jsonb_build_array(e -> 'column') end)
                                                          || case when v_sx is not null then '[null]'::jsonb else '[]'::jsonb end) y loop
        if k is null and v_sx is not null then
          v_col := '{"type": "text", "expr": "null::text"}'::jsonb;    -- a row of an organization that declares none
        else
          v_col := v_cols -> coalesce(k, '');
        end if;
        if v_col is null then
          raise exception 'There is no dimension "%" to filter by.', coalesce(k, '') using errcode = '22023';
        end if;
        v_lbl := coalesce((select x ->> 'name' from jsonb_array_elements(coalesce(v_api_d -> 'columns', '[]')) x where x ->> 'api_name' = k), k);
        v_ref := coalesce(v_col ->> 'expr', format('%I.%I', v_col ->> 'alias', v_col ->> 'column'));
        v_x := coalesce(nullif(v_col ->> 'type', ''), 'text');
        m := case when v_op = 'in' then coalesce(e -> 'values', case when e ? 'value' then jsonb_build_array(e -> 'value') end)
                  else e -> 'value' end;
        -- a custom choice is filtered by its word too (the object form's platform._drill_choice_words_in, per column)
        if v_op in ('eq', 'neq', 'in') and m is not null and k ~ '^cf:[0-9a-fA-F-]{36}$'
           and coalesce((v_col ->> 'custom')::boolean, false) then
          d := null;
          select r.organization_id, r.data into v_forg, d from custom.record r
           where r.id = substr(k, 4)::uuid and r.table_id = custom.field_kernel_id() and r.deleted_at is null;
          if coalesce(d ->> 'type', '') = 'list'
             and coalesce(nullif(d ->> 'options_table_id', ''), nullif(d -> 'config' ->> 'options_table_id', '')) is not null then
            m := custom.choice_value_keys(jsonb_build_object('options', custom.choice_options(v_forg,
                   coalesce(nullif(d ->> 'options_table_id', ''), nullif(d -> 'config' ->> 'options_table_id', ''))::uuid)), m);
          end if;
        end if;
        v_i := jsonb_array_length(v_w);
        if v_op in ('eq', 'neq') then
          if m is null or jsonb_typeof(m) = 'null' then
            v_pv := format('%s is %snull', v_ref, case when v_op = 'neq' then 'not ' else '' end);
          else
            perform platform._drill_assert_values(jsonb_build_array(m), v_x, v_lbl);
            v_w := v_w || jsonb_build_array(m);
            v_pv := format('%s %s ($1->''w''->>%s)::%s', case when v_x = 'boolean' then format('coalesce(%s, false)', v_ref) else v_ref end,
                           case when v_op = 'eq' then '=' else 'is distinct from' end, v_i, v_x);
          end if;
        elsif v_op in ('gt', 'gte', 'lt', 'lte', 'range') then
          v_pv := null;
          for v_kx, m in select key, value from jsonb_each(case when v_op = 'range' then e else jsonb_build_object(v_op, e -> 'value') end)
                          where key in ('gt', 'gte', 'lt', 'lte') loop
            if m is null or jsonb_typeof(m) = 'null' then
              raise exception '"%" on % takes a value.', v_kx, v_lbl using errcode = '22023';
            end if;
            perform platform._drill_assert_values(jsonb_build_array(m), v_x, v_lbl);
            v_i := jsonb_array_length(v_w);
            v_w := v_w || jsonb_build_array(m);
            v_pv := concat_ws(' and ', v_pv, format('%s %s ($1->''w''->>%s)::%s', v_ref,
                      case v_kx when 'gt' then '>' when 'gte' then '>=' when 'lt' then '<' else '<=' end, v_i, v_x));
          end loop;
          if v_pv is null then
            raise exception 'A range on % names gt, gte, lt or lte.', v_lbl using errcode = '22023';
          end if;
        elsif v_op = 'in' then
          if m is null or jsonb_typeof(m) <> 'array' then
            raise exception '"in" on % takes values: [ … ].', v_lbl using errcode = '22023';
          end if;
          if jsonb_array_length(m) > 1000 then
            raise exception 'A filter lists at most 1000 values; this one lists %.', jsonb_array_length(m) using errcode = '22023';
          end if;
          if jsonb_array_length(m) = 0 then
            v_pv := 'false';      -- in [] matches nothing (CONTRACT §3.2)
          else
            perform platform._drill_assert_values(m, v_x, v_lbl);
            v_w := v_w || jsonb_build_array(m);
            v_pv := format('(%1$s = any ((select array_agg(x) from jsonb_array_elements_text($1->''w''->%2$s) x)::%3$s[]) or (%1$s is null and ($1->''w''->%2$s) @> ''[null]''))',
                           v_ref, v_i, v_x);
          end if;
        elsif v_op = 'empty' then
          -- empty: no value, blank text, or an empty list (CONTRACT §3.2)
          v_pv := case when v_x like '%[]' then format('(%1$s is null or cardinality(%1$s) = 0)', v_ref)
                       when v_x = 'jsonb' then format('(%1$s is null or %1$s in (''[]''::jsonb, ''{}''::jsonb, ''""''::jsonb, ''null''::jsonb))', v_ref)
                       when v_x in ('text', 'character varying', 'varchar', 'citext') then format('(%1$s is null or btrim(%1$s) = '''')', v_ref)
                       else format('%s is null', v_ref) end;
        elsif v_op = 'null' then
          v_pv := format('%s is null', v_ref);
        else
          v_kx := lower(coalesce(e ->> 'match', 'contains'));
          if v_kx = 'word' then
            raise exception 'Whole-word matching is not offered yet.' using errcode = '0A000';
          elsif v_kx not in ('contains', 'starts_with', 'ends_with', 'equals') then
            raise exception 'A text match is contains, starts_with, ends_with or equals.' using errcode = '22023';
          end if;
          if m is null or jsonb_typeof(m) not in ('string', 'number') then
            raise exception 'A text filter on % takes text.', v_lbl using errcode = '22023';
          end if;
          if v_kx = 'equals' then
            v_w := v_w || jsonb_build_array(lower(btrim(m #>> '{}')));
            v_pv := format('lower(btrim(%s::text)) = ($1->''w''->>%s)', v_ref, v_i);
          else
            v_w := v_w || jsonb_build_array(case when v_kx in ('contains', 'ends_with') then '%' else '' end
                     || replace(replace(replace(m #>> '{}', '\', '\\'), '%', '\%'), '_', '\_')
                     || case when v_kx in ('contains', 'starts_with') then '%' else '' end);
            v_pv := format('%s::text ilike ($1->''w''->>%s)', v_ref, v_i);
          end if;
        end if;
        if v_sx is null then
          v_pl := v_pl || ('(' || v_pv || ')');
        elsif k is null then
          v_pl := array[v_sx || format(' else (%s) end', v_pv)];
        else
          v_sx := v_sx || format(' when %L::uuid then (%s)', v_col ->> 'organization_id', v_pv);
        end if;
      end loop;
      if cardinality(v_pl) = 0 then
        raise exception 'A predicate names its column.' using errcode = '22023';
      end if;
      v_preds := v_preds || case when v_neg then format('not coalesce((%s), false)', array_to_string(v_pl, ' or '))
                                 else '(' || array_to_string(v_pl, ' or ') || ')' end;
    end loop;
  end if;

  -- ── THE WINDOW and THE COMPARISON ────────────────────────────────────────────────────────
  v_win := q -> 'window';
  if v_win is not null and jsonb_typeof(v_win) = 'object' then
    k := coalesce(v_win ->> 'key', p_def -> 'default' -> 'window' ->> 'key',
                  (select x ->> 'key' from jsonb_array_elements(p_def -> 'dimensions') x where x ->> 'kind' = 'time' limit 1));
    d := (select x from jsonb_array_elements(p_def -> 'dimensions') x where x ->> 'key' = k and x ->> 'kind' = 'time');
    if d is null then
      raise exception 'A window runs along a time dimension, and "%" is not one.', coalesce(k, '') using errcode = '22023';
    end if;
    if v_win ? 'preset' then
      v_x := v_win ->> 'preset';
      if v_x !~ '^[0-9]{1,4}(h|d)$' and v_x <> 'all' then
        raise exception '"%" is not a window: 24h, 7d, 30d, 90d, 365d or all.', v_x using errcode = '22023';
      end if;
      v_win := case when v_x = 'all' then jsonb_build_object('key', k)
                    else jsonb_build_object('key', k,
                           'from', now() - (left(v_x, -1) || case right(v_x, 1) when 'h' then ' hours' else ' days' end)::interval,
                           'to', now()) end;
    end if;
    v_win := v_win || jsonb_build_object('key', k);
  else
    v_win := null;
  end if;

  if q ? 'compare' and jsonb_typeof(q -> 'compare') <> 'null' then
    e := case when jsonb_typeof(q -> 'compare') = 'string' then jsonb_build_object('against', q ->> 'compare') else q -> 'compare' end;
    if e ->> 'against' in ('prev', 'previous') then e := e || '{"against":"previous_period"}'; end if;
    if e ->> 'against' in ('yoy') then e := e || '{"against":"same_period_last_year"}'; end if;
    k := coalesce(e ->> 'key', v_win ->> 'key',
                  (select split_part(x #>> '{}', ':', 1) from jsonb_array_elements(coalesce(q -> 'by', '[]')) x
                    where exists (select 1 from jsonb_array_elements(p_def -> 'dimensions') y
                                   where y ->> 'key' = split_part(x #>> '{}', ':', 1) and y ->> 'kind' = 'time') limit 1),
                  (select x ->> 'key' from jsonb_array_elements(p_def -> 'dimensions') x where x ->> 'kind' = 'time' limit 1));
    d := (select x from jsonb_array_elements(p_def -> 'dimensions') x where x ->> 'key' = k and x ->> 'kind' = 'time');
    if d is null then
      raise exception 'A comparison runs along a time dimension, and this definition has none called "%".', coalesce(k, '') using errcode = '22023';
    end if;
    e := e || jsonb_build_object('key', 'created_at');   -- custom.agg_compare_windows judges the key's shape only
    if v_win ? 'from' and not (e ? 'from' or e ? 'to' or e ? 'period') then
      e := e || jsonb_build_object('from', v_win ->> 'from', 'to', coalesce(v_win ->> 'to', now()::text));
    end if;
    v_cmp := custom.agg_compare_windows(p_organization_id, e,
               (select jsonb_build_object('key', 'created_at', 'by', split_part(x #>> '{}', ':', 2))
                  from jsonb_array_elements(coalesce(q -> 'by', '[]')) x where position(':' in x #>> '{}') > 0 limit 1));
    v_cmp := v_cmp || jsonb_build_object('key', k);
    v_col := v_cols -> (d ->> 'from');
    v_x := platform._drill_moment_sql(format('%I.%I', v_col ->> 'alias', v_col ->> 'column'), v_col ->> 'type');
    v_params := v_params || jsonb_build_object(
      'wf', (v_cmp -> 'window' ->> 'from')::timestamptz, 'wt', (v_cmp -> 'window' ->> 'to')::timestamptz,
      'pf', (v_cmp -> 'prior_window' ->> 'from')::timestamptz, 'pt', (v_cmp -> 'prior_window' ->> 'to')::timestamptz,
      'cmp', v_cmp);
    v_preds := v_preds || format('((sd.side = ''w'' and %1$s >= ($1->>''wf'')::timestamptz and %1$s < ($1->>''wt'')::timestamptz) or (sd.side = ''p'' and %1$s >= ($1->>''pf'')::timestamptz and %1$s < ($1->>''pt'')::timestamptz))', v_x);
    v_from := v_from || ' cross join lateral (values (''w''::text), (''p''::text)) sd(side)';
  elsif v_win ? 'from' or v_win ? 'to' then
    d := (select x from jsonb_array_elements(p_def -> 'dimensions') x where x ->> 'key' = v_win ->> 'key');
    v_col := v_cols -> (d ->> 'from');
    v_x := platform._drill_moment_sql(format('%I.%I', v_col ->> 'alias', v_col ->> 'column'), v_col ->> 'type');
    begin
      v_params := v_params || jsonb_strip_nulls(jsonb_build_object('wf', (v_win ->> 'from')::timestamptz, 'wt', (v_win ->> 'to')::timestamptz));
    exception when others then
      raise exception 'A window is {"from": …, "to": …} as two moments, or a preset.' using errcode = '22023';
    end;
    if v_params ? 'wf' then v_preds := v_preds || format('%s >= ($1->>''wf'')::timestamptz', v_x); end if;
    if v_params ? 'wt' then v_preds := v_preds || format('%s < ($1->>''wt'')::timestamptz', v_x); end if;
  end if;
  v_params := v_params || jsonb_build_object('w', v_w);

  -- ════════════════════════════════════════════════════════════════════════════════════════
  -- RECORDS ("see these records"): the same FROM and WHERE, an explicit column list.
  -- ════════════════════════════════════════════════════════════════════════════════════════
  if p_kind = 'rows' then
    if v_cmp is not null then
      raise exception 'The records behind a number are asked without a comparison.' using errcode = '22023';
    end if;
    if v_api then
      -- ── THE TABLE API'S PAGE (lane 7): every column she may read, keyed by api name; the
      -- registry's default list said on each row it hides; a keyset cursor; a capped count.
      if jsonb_array_length(v_fact -> 'pk') <> 1 then
        raise exception '% has no single key, so its rows are not listed through the API.', p_def ->> 'label' using errcode = '0A000';
      end if;
      v_cap := custom.page_size(p_organization_id, 'platform.drill_rows', (q ->> 'limit')::integer, 50);
      v_cmax := greatest(1, coalesce((platform.knob_resolve('table_api', 'exact_count_max', p_organization_id, v_me) #>> '{}')::integer, 10000));
      v_rows_cols := array[format('''id'', t.%I', v_fact -> 'pk' ->> 0)];
      for k in select x ->> 'api_name' from jsonb_array_elements(coalesce(v_api_d -> 'columns', '[]')) x
                where q -> 'columns' is null or q ->> 'columns' = 'all'
                   or (jsonb_typeof(q -> 'columns') = 'array' and q -> 'columns' ? (x ->> 'api_name')) loop
        v_col := v_cols -> k;
        continue when v_col is null;
        v_rows_cols := v_rows_cols || format('%L, %s', k, coalesce(v_col ->> 'expr', format('%I.%I', v_col ->> 'alias', v_col ->> 'column')));
      end loop;
      v_rows_cols := v_rows_cols || format('''_state'', jsonb_strip_nulls(jsonb_build_object(''archived'', %s, ''hidden_by_default'', %s))',
        case when (v_fact ->> 'deleted')::boolean then 'case when t.deleted_at is not null then true end' else 'null::boolean' end,
        case when cardinality(v_dlw_w) > 0 then format('nullif(to_jsonb(array_remove(array[%s]::text[], null)), ''[]''::jsonb)', array_to_string(v_dlw_w, ', ')) else 'null::jsonb' end);
      if jsonb_typeof(q -> 'sort') = 'array' then
        -- AP3-PHASEB-U4 (G3, 2026-10-06): THE SORT LIST. Up to the knob entity_data.sort_max_columns keys, each
        -- {key | keys, direction}; empty values last in either direction; text compared case-blind, then as
        -- written, with empty text among the empty values (entity CONTRACT §3.3); the key is the last tiebreak.
        -- "keys" (a custom key several organizations declare) sorts by the row's own organization's field. The
        -- cursor's "v" is the tuple of every sort value, compared key by key, so a row whose sort values did not
        -- change between two page reads is on exactly one page; a row whose sort values changed may move.
        v_n := greatest(1, coalesce((platform.knob_resolve('entity_data', 'sort_max_columns', p_organization_id, v_me) #>> '{}')::integer, 3));
        if jsonb_array_length(q -> 'sort') = 0 or jsonb_array_length(q -> 'sort') > v_n then
          raise exception 'A list sorts by 1 to % columns.', v_n using errcode = '22023';
        end if;
        v_skeys := '[]'::jsonb;
        for e in select x from jsonb_array_elements(q -> 'sort') x loop
          if jsonb_typeof(e) <> 'object' or lower(coalesce(e ->> 'direction', 'asc')) not in ('asc', 'desc') then
            raise exception 'A sort is {"key", "direction": asc or desc}.' using errcode = '22023';
          end if;
          v_sdesc := lower(coalesce(e ->> 'direction', 'asc')) = 'desc';
          v_pl := '{}';
          v_x := null;
          for k in select coalesce(y #>> '{}', '') from jsonb_array_elements(case when jsonb_typeof(e -> 'keys') = 'array' then e -> 'keys'
                                                                                 else jsonb_build_array(e -> 'key') end) y loop
            v_col := v_cols -> k;
            if v_col is null or coalesce(v_col ->> 'type', 'text') like '%[]'
               or (v_x is not null and v_x <> coalesce(v_col ->> 'type', 'text')) then
              raise exception 'These records cannot be sorted by "%".', k using errcode = '22023';
            end if;
            v_x := coalesce(v_col ->> 'type', 'text');
            v_pl := v_pl || coalesce(v_col ->> 'expr', format('%I.%I', v_col ->> 'alias', v_col ->> 'column'));
          end loop;
          if cardinality(v_pl) = 0 then
            raise exception 'These records cannot be sorted by "".' using errcode = '22023';
          end if;
          v_sx := case when cardinality(v_pl) = 1 then v_pl[1] else 'coalesce(' || array_to_string(v_pl, ', ') || ')' end;
          if v_x in ('text', 'character varying', 'varchar', 'citext') then
            v_skeys := v_skeys || jsonb_build_array(jsonb_build_object('x', format('nullif(lower(%s), '''')', v_sx), 'd', v_sdesc, 't', 'text'),
                                                    jsonb_build_object('x', format('nullif(%s, '''')', v_sx), 'd', v_sdesc, 't', 'text'));
          else
            v_skeys := v_skeys || jsonb_build_array(jsonb_build_object('x', v_sx, 'd', v_sdesc, 't', v_x));
          end if;
        end loop;
        v_order := (select string_agg(format('%s %s nulls last', s ->> 'x', case when (s ->> 'd')::boolean then 'desc' else 'asc' end), ', ' order by o)
                      from jsonb_array_elements(v_skeys) with ordinality a(s, o)) || format(', t.%I', v_fact -> 'pk' ->> 0);
        v_rows_cols := v_rows_cols || format('''_k'', jsonb_build_array(jsonb_build_array(%s), t.%I)',
                         (select string_agg(s ->> 'x', ', ' order by o) from jsonb_array_elements(v_skeys) with ordinality a(s, o)), v_fact -> 'pk' ->> 0);
        v_page := '';
        if jsonb_typeof(q -> 'cursor') = 'object' then
          if jsonb_typeof(q -> 'cursor' -> 'v') is distinct from 'array' or jsonb_array_length(q -> 'cursor' -> 'v') <> jsonb_array_length(v_skeys)
             or jsonb_typeof(q -> 'cursor' -> 'id') is distinct from 'string' then
            raise exception 'A cursor is the one the previous page returned.' using errcode = '22023';
          end if;
          v_params := v_params || jsonb_build_object('cur', q -> 'cursor');
          -- past the cursor: equal on every earlier key and past it on this one (an empty value is past every value,
          -- in either direction; nothing is past an empty value but a later key), or equal on all and a greater key
          v_pl := '{}';
          v_pv := 'true';
          for v_i in 0 .. jsonb_array_length(v_skeys) - 1 loop
            v_sx := v_skeys -> v_i ->> 'x';
            v_kx := format('($1->''cur''->''v''->>%s)::%s', v_i, v_skeys -> v_i ->> 't');
            if jsonb_typeof(q -> 'cursor' -> 'v' -> v_i) = 'null' then
              v_pv := v_pv || format(' and %s is null', v_sx);
            else
              v_pl := v_pl || format('(%s and (%s %s %s or %s is null))', v_pv, v_sx,
                                     case when (v_skeys -> v_i ->> 'd')::boolean then '<' else '>' end, v_kx, v_sx);
              v_pv := v_pv || format(' and %s = %s', v_sx, v_kx);
            end if;
          end loop;
          v_pl := v_pl || format('(%s and t.%I > ($1->''cur''->>''id'')::uuid)', v_pv, v_fact -> 'pk' ->> 0);
          v_page := ' and (' || array_to_string(v_pl, ' or ') || ')';
        elsif q ? 'cursor' and jsonb_typeof(q -> 'cursor') <> 'null' then
          raise exception 'A cursor is the one the previous page returned.' using errcode = '22023';
        end if;
      else
      -- order: the asked column (or the newest first), then the key, so a cursor never skips a row
      v_sx := null;
      if q ? 'sort' then
        k := q -> 'sort' ->> 'key';
        v_col := v_cols -> k;
        if v_col is null then
          raise exception 'These records cannot be sorted by "%".', coalesce(k, '') using errcode = '22023';
        end if;
        v_sx := coalesce(v_col ->> 'expr', format('%I.%I', v_col ->> 'alias', v_col ->> 'column'));
        v_sdesc := lower(coalesce(q -> 'sort' ->> 'direction', 'asc')) = 'desc';
        v_x := v_col ->> 'type';
      elsif v_cols ? 'created_at' then
        v_sx := 't.created_at';
        v_sdesc := true;
        v_x := v_cols -> 'created_at' ->> 'type';
      end if;
      v_order := concat_ws(', ', case when v_sx is not null then format('%s %s nulls last', v_sx, case when v_sdesc then 'desc' else 'asc' end) end,
                           format('t.%I', v_fact -> 'pk' ->> 0));
      v_rows_cols := v_rows_cols || format('''_k'', jsonb_build_array(%s, t.%I)', coalesce(v_sx, 'null'), v_fact -> 'pk' ->> 0);
      v_page := '';
      if jsonb_typeof(q -> 'cursor') = 'object' then
        v_params := v_params || jsonb_build_object('cur', q -> 'cursor');
        if v_sx is null then
          v_page := format(' and t.%I > ($1->''cur''->>''id'')::uuid', v_fact -> 'pk' ->> 0);
        elsif jsonb_typeof(q -> 'cursor' -> 'v') = 'null' or not (q -> 'cursor' ? 'v') then
          v_page := format(' and (%1$s is null and t.%2$I > ($1->''cur''->>''id'')::uuid)', v_sx, v_fact -> 'pk' ->> 0);
        else
          v_page := format(' and ((%1$s %3$s ($1->''cur''->>''v'')::%4$s) or (%1$s = ($1->''cur''->>''v'')::%4$s and t.%2$I > ($1->''cur''->>''id'')::uuid) or %1$s is null)',
                           v_sx, v_fact -> 'pk' ->> 0, case when v_sdesc then '<' else '>' end, v_x);
        end if;
      elsif q ? 'cursor' and jsonb_typeof(q -> 'cursor') <> 'null' then
        raise exception 'A cursor is the one the previous page returned.' using errcode = '22023';
      end if;
      end if;   -- (AP3-PHASEB-U4: the sort list, or the single sort)
      v_params := v_params || jsonb_build_object('w', v_w, 'limit', v_cap, 'cmax', v_cmax,
                                                 'offset', case when q ? 'cursor' then 0 else greatest(0, coalesce((q ->> 'offset')::integer, 0)) end);
      -- jsonb_build_object takes at most 100 arguments: a wide table is built in pieces
      select array_agg(format('jsonb_build_object(%s)', s.part) order by s.g) into v_chunks
        from (select (n - 1) / 40 as g, string_agg(x, ', ' order by n) as part
                from unnest(v_rows_cols) with ordinality u(x, n) group by (n - 1) / 40) s;
      v_obj := array_to_string(v_chunks, ' || ');
      -- AP3-PHASEB-U4 (G4): "total": false skips the count pass (the list's row-security cost, paid once)
      v_kx := case when jsonb_typeof(q -> 'total') = 'boolean' and not (q ->> 'total')::boolean then 'null::bigint'
                   else format($c$(select count(*) from (select 1 from %s where %s limit ($1->>'cmax')::integer + 1) c)::bigint$c$,
                               v_from, coalesce(nullif(array_to_string(v_preds, ' and '), ''), 'true')) end;
      return jsonb_build_object(
        'sql', format($q$select %6$s as total, coalesce((select jsonb_agg(y.r order by y.n) from (select %1$s as r, row_number() over (order by %4$s) as n from %2$s where %3$s%5$s order by %4$s limit ($1->>'limit')::integer offset ($1->>'offset')::integer) y), '[]'::jsonb) as rows$q$,
                      v_obj, v_from, coalesce(nullif(array_to_string(v_preds, ' and '), ''), 'true'), v_order, v_page, v_kx),
        'count_sql', format('select count(*)::bigint from %s where %s', v_from, coalesce(nullif(array_to_string(v_preds, ' and '), ''), 'true')),
        'params', v_params, 'lane', v_lane, 'scope', v_scope, 'limit', v_cap, 'offset', v_params -> 'offset',
        'count_max', v_cmax, 'api', true);
    end if;
    if v_records then
      -- a definer fact's records are listed for a window, and never past what its number counted
      if not (v_params ? 'wf') then
        raise exception 'The records behind "%" are listed for a window: give it a start (from), or a preset such as 30d.', p_def ->> 'label'
          using errcode = '22023', hint = 'Every usage number is asked for a window; its records are asked for the same one.';
      end if;
      if v_c ? 'watermark' then
        execute format('select max(covered_to) from %s', v_c ->> 'watermark') into v_asof;
        if v_asof is null then
          raise exception 'The summary behind "%" has not been counted yet, so its records are not listed.', p_def ->> 'label'
            using errcode = '0A000', hint = 'Recount it; the records are listed up to the moment the summary counted through.';
        end if;
        v_col := v_cols -> 'created_at';
        v_params := v_params || jsonb_build_object('asof', v_asof);
        v_preds := v_preds || format('%I.%I < ($1->>''asof'')::timestamptz', v_col ->> 'alias', v_col ->> 'column');
      end if;
      if q ? 'columns' and exists (select 1 from jsonb_array_elements(q -> 'columns') x
                                    where not (v_c -> 'records' -> 'columns') ? coalesce(x ->> 'from', x #>> '{}')) then
        raise exception 'A record of "%" shows only its declared columns: %.', p_def ->> 'label',
          (select string_agg(x #>> '{}', ', ') from jsonb_array_elements(v_c -> 'records' -> 'columns') x)
          using errcode = '22023';
      end if;
    end if;
    v_cap := custom.page_size(p_organization_id, 'platform.drill_rows', (q ->> 'limit')::integer, 50);
    if coalesce((q ->> 'offset')::integer, 0) < 0 then
      raise exception 'An offset is 0 or more.' using errcode = '22023';
    end if;
    v_params := v_params || jsonb_build_object('limit', v_cap, 'offset', coalesce((q ->> 'offset')::integer, 0));
    v_rows_cols := '{}';
    -- (an invoker definition's declared records are its own rows, read as the seat: its record
    -- columns are the default, lane DRILL-GAPS)
    for k in select coalesce(x ->> 'from', x #>> '{}') from jsonb_array_elements(
               coalesce(q -> 'columns', case when v_records then v_c -> 'records' -> 'columns' end,
                        case when not v_records and v_mode = 'invoker' then p_def -> 'records' -> 'columns' end,
                        p_def -> 'detail' -> 'columns', '[]'::jsonb)) x loop
      -- a detail column is a column key, or a dimension's key
      v_x := coalesce((select y ->> 'from' from jsonb_array_elements(p_def -> 'dimensions') y where y ->> 'key' = k), k);
      v_col := v_cols -> v_x;
      if v_col is null then
        raise exception 'There is no column "%" these records can show.', k using errcode = '22023';
      end if;
      v_rows_cols := v_rows_cols || format('%L, %I.%I', k, v_col ->> 'alias', v_col ->> 'column');
    end loop;
    if jsonb_array_length(v_fact -> 'pk') = 1 then
      v_rows_cols := array[format('''id'', t.%I', v_fact -> 'pk' ->> 0)] || v_rows_cols;
    elsif jsonb_array_length(v_fact -> 'pk') > 1 then
      v_rows_cols := array[format('''id'', jsonb_build_object(%s)',
                     (select string_agg(format('%L, t.%I', x #>> '{}', x #>> '{}'), ', ') from jsonb_array_elements(v_fact -> 'pk') x))] || v_rows_cols;
    end if;
    -- order: the asked column, or the first time, then the key so pages never overlap
    v_order := '';
    if q ? 'sort' then
      k := q -> 'sort' ->> 'key';
      v_x := coalesce((select y ->> 'from' from jsonb_array_elements(p_def -> 'dimensions') y where y ->> 'key' = k), k);
      v_col := v_cols -> v_x;
      if v_col is null then
        raise exception 'These records cannot be sorted by "%".', coalesce(k, '') using errcode = '22023';
      end if;
      v_order := format('%I.%I %s nulls last', v_col ->> 'alias', v_col ->> 'column',
                        case when lower(coalesce(q -> 'sort' ->> 'direction', 'asc')) = 'desc' then 'desc' else 'asc' end);
    else
      -- (records of a definer fact: newest first in the order the relation's own index reads, so a
      -- page reads only the latest rows)
      select format(case when v_records then '%I.%I desc' else '%I.%I desc nulls last' end,
                    v_cols -> (x ->> 'from') ->> 'alias', v_cols -> (x ->> 'from') ->> 'column')
        into v_order from jsonb_array_elements(p_def -> 'dimensions') x where x ->> 'kind' = 'time' limit 1;
    end if;
    v_order := concat_ws(', ', nullif(v_order, ''),
                 (select string_agg(format('t.%I', x #>> '{}'), ', ') from jsonb_array_elements(v_fact -> 'pk') x));
    if v_records and jsonb_array_length(v_fact -> 'pk') = 0 then
      -- a view has no key: its record columns, in their declared order, make the order total
      v_order := concat_ws(', ', nullif(v_order, ''),
                   (select string_agg(format('%I.%I desc', v_cols -> (x #>> '{}') ->> 'alias', v_cols -> (x #>> '{}') ->> 'column'), ', ' order by o)
                      from jsonb_array_elements(v_c -> 'records' -> 'columns') with ordinality z(x, o)));
    end if;
    v_sql := format($q$select count(*) over () as total, jsonb_build_object(%s) as r from %s where %s order by %s limit ($1->>'limit')::integer offset ($1->>'offset')::integer$q$,
                    array_to_string(v_rows_cols, ', '), v_from, coalesce(nullif(array_to_string(v_preds, ' and '), ''), 'true'),
                    coalesce(nullif(v_order, ''), '1'));
    if v_records then
      -- one page, without counting the whole window for it (the total is count_sql's), and the
      -- window's sums of every Measure that adds up, over the SAME filter (the seat guard's sum)
      v_page := format($q$select coalesce(jsonb_agg(y.r), '[]'::jsonb) from (select jsonb_build_object(%s) as r from %s where %s order by %s limit ($1->>'limit')::integer offset ($1->>'offset')::integer) y$q$,
                       array_to_string(v_rows_cols, ', '), v_from, coalesce(nullif(array_to_string(v_preds, ' and '), ''), 'true'),
                       coalesce(nullif(v_order, ''), '1'));
      v_sum := '{}';
      for m in select x from jsonb_array_elements(p_def -> 'measures') x loop
        continue when not ((m ->> 'op' in ('count', 'sum') and coalesce((m ->> 'additive')::boolean, true)
                            and (m ->> 'op' = 'count' or v_cols ? (m ->> 'of')))
                           or m ->> 'op' in ('ratio', 'sum_of'));
        -- every leaf (a sum or a count, narrowed by its own where) over the records' own columns, the
        -- ratio's template around them, its constants bound (lane DRILL-GAPS)
        v_mp := platform._drill_measure_plan(p_def, m ->> 'key');
        v_x := v_mp ->> 'tpl';
        for v_j in reverse jsonb_array_length(v_mp -> 'leaves') - 1 .. 0 loop
          v_leaf := v_mp -> 'leaves' -> v_j;
          v_flt := platform._drill_measure_filter(p_def, v_cols, v_leaf -> 'where', jsonb_array_length(v_w));
          if v_flt is not null then v_w := v_w || (v_flt -> 'w'); end if;
          v_val := case when v_leaf ->> 'op' = 'count' then case when v_flt is not null then format('count(case when %s then 1 end)', v_flt ->> 'sql') else 'count(*)' end
                        else format('sum(%s)', case when v_flt is not null
                                                    then format('case when %s then %I.%I end', v_flt ->> 'sql', v_cols -> (v_leaf ->> 'of') ->> 'alias', v_cols -> (v_leaf ->> 'of') ->> 'column')
                                                    else format('%I.%I', v_cols -> (v_leaf ->> 'of') ->> 'alias', v_cols -> (v_leaf ->> 'of') ->> 'column') end) end;
          v_x := replace(v_x, format('@L%s@', v_j), v_val);
        end loop;
        for v_j in reverse jsonb_array_length(v_mp -> 'consts') - 1 .. 0 loop
          v_x := replace(v_x, format('@C%s@', v_j), format('($1->''k''->>%s)::numeric', jsonb_array_length(v_k)));
          v_k := v_k || jsonb_build_array(v_mp -> 'consts' -> v_j);
        end loop;
        v_sum := v_sum || format('%L, %s', m ->> 'key', v_x);
      end loop;
      v_params := v_params || jsonb_build_object('w', v_w, 'k', v_k);
      return jsonb_build_object(
        'page_sql', v_page,
        'sum_sql', format('select jsonb_build_object(%s) from %s where %s',
                          coalesce(nullif(array_to_string(v_sum, ', '), ''), '''count'', count(*)'), v_from,
                          coalesce(nullif(array_to_string(v_preds, ' and '), ''), 'true')),
        'count_sql', format('select count(*)::bigint from %s where %s', v_from, coalesce(nullif(array_to_string(v_preds, ' and '), ''), 'true')),
        'params', v_params, 'lane', v_lane, 'limit', v_cap, 'offset', v_params -> 'offset', 'as_of', v_asof,
        'columns', coalesce(q -> 'columns', v_c -> 'records' -> 'columns'));
    end if;
    return jsonb_build_object(
      'sql', format('select coalesce(max(x.total), 0)::bigint as total, coalesce(jsonb_agg(x.r order by x.n), ''[]''::jsonb) as rows from (select row_number() over () as n, y.* from (%s) y) x', v_sql),
      'count_sql', format('select count(*)::bigint from %s where %s', v_from, coalesce(nullif(array_to_string(v_preds, ' and '), ''), 'true')),
      'params', v_params, 'lane', v_lane, 'limit', v_cap, 'offset', v_params -> 'offset');
  end if;

  -- ════════════════════════════════════════════════════════════════════════════════════════
  -- THE ANSWER
  -- ════════════════════════════════════════════════════════════════════════════════════════
  -- BY: dimension keys, `time:grain` for a period, outermost first.
  for e in select x from jsonb_array_elements(coalesce(q -> 'by', p_def -> 'default' -> 'by', '[]'::jsonb)) x loop
    k := e #>> '{}';
    d := (select x from jsonb_array_elements(p_def -> 'dimensions') x where x ->> 'key' = split_part(k, ':', 1));
    if d is null then
      raise exception 'There is no dimension "%" to group by.', k using errcode = '22023',
        hint = format('Dimensions: %s.', (select string_agg(x ->> 'key', ', ') from jsonb_array_elements(p_def -> 'dimensions') x));
    end if;
    if d ->> 'kind' = 'time' then
      v_x := coalesce(nullif(split_part(k, ':', 2), ''), 'month');
      if not (c_steps ? v_x) or not (coalesce(d -> 'grains', '["year","quarter","month","week","day"]') ? v_x) then
        raise exception '% is not cut by "%".', d ->> 'label', v_x using errcode = '22023',
          hint = format('It is cut by %s.', (select string_agg(x #>> '{}', ', ') from jsonb_array_elements(coalesce(d -> 'grains', '["year","quarter","month","week","day"]')) x));
      end if;
      k := (d ->> 'key') || ':' || v_x;
    elsif position(':' in k) > 0 then
      raise exception '% is not a time, so it has no periods.', d ->> 'label' using errcode = '22023';
    else
      v_x := null;
    end if;
    if exists (select 1 from jsonb_array_elements(v_by) y where y ->> 'key' = k) then
      raise exception '"%" is asked twice.', k using errcode = '22023';
    end if;
    v_by := v_by || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('key', k, 'dim', d, 'grain', v_x, 'col', v_cols -> (d ->> 'from'))));
  end loop;
  if jsonb_array_length(v_by) > 4 then
    raise exception 'A question groups by at most four dimensions at once.' using errcode = '22023',
      hint = 'Drill into one group to go deeper.';
  end if;

  -- ACROSS: one dimension becomes the columns of a pivot.
  if q ? 'across' and jsonb_typeof(q -> 'across') = 'string' then
    k := q ->> 'across';
    d := (select x from jsonb_array_elements(p_def -> 'dimensions') x where x ->> 'key' = split_part(k, ':', 1));
    if d is null then
      raise exception 'There is no dimension "%" to pivot across.', k using errcode = '22023';
    end if;
    if d ->> 'cardinality' = 'high' then
      raise exception '% has too many values to become columns.', d ->> 'label' using errcode = '22023', hint = 'Group by it instead.';
    end if;
    v_x := case when d ->> 'kind' = 'time' then coalesce(nullif(split_part(k, ':', 2), ''), 'month') end;
    if v_x is not null and not (c_steps ? v_x) then
      raise exception '"%" is not a grain.', v_x using errcode = '22023';
    end if;
    k := (d ->> 'key') || coalesce(':' || v_x, '');
    if exists (select 1 from jsonb_array_elements(v_by) y where y ->> 'key' = k or y -> 'dim' ->> 'key' = d ->> 'key') then
      raise exception '"%" cannot be both a group and the columns.', k using errcode = '22023';
    end if;
    v_ax := jsonb_strip_nulls(jsonb_build_object('key', k, 'dim', d, 'grain', v_x, 'col', v_cols -> (d ->> 'from')));
  end if;
  v_has_by := jsonb_array_length(v_by) > 0;
  v_has_ax := v_ax is not null;

  -- SHOW: measure keys, or {op, of} over a column this definition reads.
  for e in select x from jsonb_array_elements(coalesce(q -> 'show', p_def -> 'default' -> 'show', '["count"]'::jsonb)) x loop
    if jsonb_typeof(e) = 'string' then
      m := (select x from jsonb_array_elements(p_def -> 'measures') x where x ->> 'key' = e #>> '{}');
      if m is null then
        raise exception 'There is no measure "%".', e #>> '{}' using errcode = '22023',
          hint = format('Measures: %s.', (select string_agg(x ->> 'key', ', ') from jsonb_array_elements(p_def -> 'measures') x));
      end if;
    elsif jsonb_typeof(e) = 'object' then
      if not coalesce(e ->> 'op', '') = any (c_ops) then
        raise exception '"%" is not a measure operation.', coalesce(e ->> 'op', '') using errcode = '22023',
          hint = format('Operations: %s.', array_to_string(c_ops, ', '));
      end if;
      v_x := coalesce((select y ->> 'from' from jsonb_array_elements(p_def -> 'dimensions') y where y ->> 'key' = e ->> 'of'), e ->> 'of');
      if e ->> 'op' <> 'count' and not (v_cols ? coalesce(v_x, '')) then
        raise exception 'There is no column "%" to measure.', coalesce(e ->> 'of', '') using errcode = '22023';
      end if;
      if e ->> 'op' in ('sum', 'avg', 'median') and v_cols -> v_x ->> 'cat' <> 'number' then
        raise exception '"%" is not a number, so it cannot be added up.', e ->> 'of' using errcode = '22023';
      end if;
      if e ->> 'op' = 'span' and v_cols -> v_x ->> 'cat' <> 'time' then
        raise exception '"%" is not a time, so it has no span.', e ->> 'of' using errcode = '22023';
      end if;
      m := jsonb_strip_nulls(jsonb_build_object('key', case when e ->> 'op' = 'count' then 'count' else (e ->> 'op') || '_' || (e ->> 'of') end,
                                                'op', e ->> 'op', 'of', v_x));
    else
      raise exception 'A measure is its key, or {"op": …, "of": …}.' using errcode = '22023';
    end if;
    if exists (select 1 from jsonb_array_elements(v_show) y where y ->> 'key' = m ->> 'key') then
      continue;
    end if;
    if m ->> 'op' in ('ratio', 'sum_of') then
      -- (lane DRILL-PARITY-LAST: a sum_of is the same template with one side, and adds up)
      -- a ratio of this definition's own Measures (validated: each part a sum or a count, narrowed
      -- by its own where, or another ratio; lists added up; a scale multiplies) — lane DRILL-GAPS
      v_mp := platform._drill_measure_plan(p_def, m ->> 'key');
      v_leaves := '[]'::jsonb;
      for v_j in 0 .. jsonb_array_length(v_mp -> 'leaves') - 1 loop
        v_leaf := v_mp -> 'leaves' -> v_j;
        v_flt := platform._drill_measure_filter(p_def, v_cols, v_leaf -> 'where', jsonb_array_length(v_w));
        if v_flt is not null then v_w := v_w || (v_flt -> 'w'); end if;
        v_val := case when v_leaf ->> 'op' = 'count' then case when v_flt is not null then format('case when %s then 1 end', v_flt ->> 'sql') end
                      when v_flt is not null then format('case when %s then %I.%I end', v_flt ->> 'sql', v_cols -> (v_leaf ->> 'of') ->> 'alias', v_cols -> (v_leaf ->> 'of') ->> 'column')
                      else format('%I.%I', v_cols -> (v_leaf ->> 'of') ->> 'alias', v_cols -> (v_leaf ->> 'of') ->> 'column') end;
        v_leaves := v_leaves || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
          'op', case when v_leaf ->> 'op' = 'count' and v_flt is not null then 'filled' else v_leaf ->> 'op' end,
          'expr', v_val)));
      end loop;
      v_cs := '[]'::jsonb;
      for v_j in 0 .. jsonb_array_length(v_mp -> 'consts') - 1 loop
        v_cs := v_cs || to_jsonb(format('($1->''k''->>%s)::numeric', jsonb_array_length(v_k)));
        v_k := v_k || jsonb_build_array(v_mp -> 'consts' -> v_j);
      end loop;
      v_show := v_show || jsonb_build_array(jsonb_build_object(
        'key', m ->> 'key', 'op', 'ratio', 'adds', m ->> 'op' = 'sum_of', 'cat', 'number', 'tpl', v_mp ->> 'tpl', 'leaves', v_leaves, 'consts_sql', v_cs));
      continue;
    end if;
    -- (lane DRILL-SPAN) a span: the latest minus the earliest moment of a time column, in milliseconds
    -- (unit duration). It rides the ratio template with two leaves (max, min of the moment as epoch
    -- ms), so every group, Other and the total are recomputed from their own rows, never added up —
    -- and, like every Measure, it reads only the rows the seat's lane lets through.
    if m ->> 'op' = 'span' then
      if v_cols -> (m ->> 'of') ->> 'cat' is distinct from 'time' then
        raise exception 'The span "%" reads "%", which is not a time.', m ->> 'key', coalesce(m ->> 'of', '') using errcode = '22023';
      end if;
      v_flt := platform._drill_measure_filter(p_def, v_cols, m -> 'where', jsonb_array_length(v_w));
      if v_flt is not null then v_w := v_w || (v_flt -> 'w'); end if;
      v_val := format('(extract(epoch from %I.%I) * 1000)', v_cols -> (m ->> 'of') ->> 'alias', v_cols -> (m ->> 'of') ->> 'column');
      if v_flt is not null then
        v_val := format('case when %s then %s end', v_flt ->> 'sql', v_val);
      end if;
      v_show := v_show || jsonb_build_array(jsonb_build_object(
        'key', m ->> 'key', 'op', 'ratio', 'adds', false, 'cat', 'number', 'tpl', 'round(@L0@ - @L1@)',
        'leaves', jsonb_build_array(jsonb_build_object('op', 'max', 'expr', v_val), jsonb_build_object('op', 'min', 'expr', v_val)),
        'consts_sql', '[]'::jsonb));
      continue;
    end if;
    -- a Measure narrowed by its own where reads its column only on the rows that pass (a count
    -- counts them); percentile's p and a run rate's per × scale are bound constants (lane DRILL-GAPS)
    v_flt := platform._drill_measure_filter(p_def, v_cols, m -> 'where', jsonb_array_length(v_w));
    if v_flt is not null then v_w := v_w || (v_flt -> 'w'); end if;
    if m ->> 'op' = 'rate' and v_rate_ws is null then
      if not (v_params ? 'wf') then
        raise exception '"%" is a run rate, counted over a window with a start: give the question a window (a preset such as 30d, or from).',
          coalesce(m ->> 'label', m ->> 'key') using errcode = '22023';
      end if;
      -- the window's length: the part of it that has happened (a window reaching past now is not
      -- counted as time that passed); a comparison's prior window is its whole length
      v_params := v_params || jsonb_build_object(
        'wsw', extract(epoch from least(coalesce((v_params ->> 'wt')::timestamptz, now()), now()) - (v_params ->> 'wf')::timestamptz),
        'wsp', case when v_params ? 'pf' then extract(epoch from (v_params ->> 'pt')::timestamptz - (v_params ->> 'pf')::timestamptz) end);
      v_rate_ws := case when v_cmp is not null then '(case sd.side when ''w'' then ($1->>''wsw'') else ($1->>''wsp'') end)::numeric'
                        else '($1->>''wsw'')::numeric' end;
    end if;
    v_show := v_show || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'key', m ->> 'key', 'op', case when m ->> 'op' = 'count' and v_flt is not null then 'filled' else m ->> 'op' end,
      'of', m ->> 'of', 'at_grain', m ->> 'at_grain',
      'cat', coalesce(v_cols -> (m ->> 'of') ->> 'cat', case when m ->> 'op' = 'count' then 'number' end),
      'expr', case when m ->> 'op' = 'count' then case when v_flt is not null then format('case when %s then 1 end', v_flt ->> 'sql') end
                   when v_flt is not null then format('case when %s then %I.%I end', v_flt ->> 'sql', v_cols -> (m ->> 'of') ->> 'alias', v_cols -> (m ->> 'of') ->> 'column') end,
      'p_sql', case when m ->> 'op' = 'percentile' then format('($1->''k''->>%s)::float8', jsonb_array_length(v_k)) end,
      'per_sql', case when m ->> 'op' = 'rate' then format('($1->''k''->>%s)::numeric', jsonb_array_length(v_k)) end)));
    if m ->> 'op' = 'percentile' then
      v_k := v_k || jsonb_build_array(m -> 'p');
    elsif m ->> 'op' = 'rate' then
      v_k := v_k || to_jsonb(case m ->> 'per' when 'month' then 2592000 else 86400 end * coalesce((m ->> 'scale')::numeric, 1));
    end if;
  end loop;
  v_params := v_params || jsonb_build_object('w', v_w, 'k', v_k);
  if jsonb_array_length(v_show) = 0 then
    v_show := '[{"key":"count","op":"count"}]';
  end if;

  -- SORT: a shown measure, or a grouped dimension. A time first dimension keeps its latest
  -- periods and reads in calendar order.
  if q ? 'sort' and jsonb_typeof(q -> 'sort') = 'object' then
    k := q -> 'sort' ->> 'key';
    if exists (select 1 from jsonb_array_elements(v_show) y where y ->> 'key' = k) then
      v_rank_dir := case when lower(coalesce(q -> 'sort' ->> 'direction', 'desc')) = 'asc' then 'asc' else 'desc' end;
      v_sort := jsonb_build_object('measure', k);
    else
      v_i := (select o - 1 from jsonb_array_elements(v_by) with ordinality z(y, o)
               where y ->> 'key' = k or y -> 'dim' ->> 'key' = k limit 1);
      if v_i is null then
        raise exception 'The answer cannot be sorted by "%": sort by a measure it shows or a dimension it groups by.', coalesce(k, '')
          using errcode = '22023';
      end if;
      v_rank_dir := case when lower(coalesce(q -> 'sort' ->> 'direction', 'asc')) = 'desc' then 'desc' else 'asc' end;
      v_sort := jsonb_build_object('by', v_i);
    end if;
  elsif v_has_by and v_by -> 0 ->> 'grain' is not null then
    v_sort := jsonb_build_object('by', 0);
    v_rank_dir := 'desc';
    v_time_default := true;
  else
    v_sort := jsonb_build_object('measure', v_show -> 0 ->> 'key');
    v_rank_dir := 'desc';
  end if;

  v_cap := custom.page_size(p_organization_id, 'platform.drill_ask', (q ->> 'limit')::integer,
             coalesce((platform.knob_resolve('drill', 'groups_per_level', p_organization_id, v_me) #>> '{}')::integer, 100));
  v_acap := greatest(1, coalesce((platform.knob_resolve('drill', 'pivot_columns', p_organization_id, v_me) #>> '{}')::integer, 24));
  v_params := v_params || jsonb_build_object('cap', v_cap, 'acap', v_acap);

  -- ── src: one row per fact row that passes, with its group values ────────────────────────
  v_sel := array[case when v_cmp is not null then 'sd.side' else '''w''::text' end || ' as side'];
  v_gk := '{}';
  v_i := 0;
  for e in select x from jsonb_array_elements(v_by) x loop
    v_i := v_i + 1;
    v_ref := format('%I.%I', e -> 'col' ->> 'alias', e -> 'col' ->> 'column');
    if e ? 'grain' then
      v_x := platform._drill_period_sql(platform._drill_local_sql(v_ref, e -> 'col' ->> 'type'), e ->> 'grain', v_shift);
      v_sel := v_sel || format('%s as ps%s', v_x, v_i);
      if v_cmp is not null then
        v_params := v_params || jsonb_build_object('wps_' || (e ->> 'grain'),
          custom.agg_period_start((v_params ->> 'wf')::timestamptz at time zone v_tz, e ->> 'grain', v_ws),
          'pps_' || (e ->> 'grain'),
          custom.agg_period_start((v_params ->> 'pf')::timestamptz at time zone v_tz, e ->> 'grain', v_ws));
        v_sel := v_sel || format('%s as d%s', platform._drill_ordinal_sql(v_x,
                   format('(case sd.side when ''w'' then ($1->>%L) else ($1->>%L) end)::timestamp', 'wps_' || (e ->> 'grain'), 'pps_' || (e ->> 'grain')),
                   e ->> 'grain'), v_i);
      else
        v_sel := v_sel || format('%s as d%s', v_x, v_i);
      end if;
    else
      -- BLANK IS NO VALUE: a text '' groups with NULL, never as a second identical "No value" row
      v_sel := v_sel || case when e -> 'col' ->> 'type' in ('text', 'character varying', 'varchar', 'citext')
                             then format('nullif(%s, '''') as d%s', v_ref, v_i) else format('%s as d%s', v_ref, v_i) end;
    end if;
    v_gk := v_gk || format('s.d%s', v_i);
  end loop;
  if v_has_ax then
    v_ref := format('%I.%I', v_ax -> 'col' ->> 'alias', v_ax -> 'col' ->> 'column');
    if v_ax ? 'grain' then
      v_x := platform._drill_period_sql(platform._drill_local_sql(v_ref, v_ax -> 'col' ->> 'type'), v_ax ->> 'grain', v_shift);
      v_sel := v_sel || format('%s as aps', v_x);
      if v_cmp is not null then
        v_params := v_params || jsonb_build_object('wps_' || (v_ax ->> 'grain'),
          custom.agg_period_start((v_params ->> 'wf')::timestamptz at time zone v_tz, v_ax ->> 'grain', v_ws),
          'pps_' || (v_ax ->> 'grain'),
          custom.agg_period_start((v_params ->> 'pf')::timestamptz at time zone v_tz, v_ax ->> 'grain', v_ws));
        v_sel := v_sel || format('%s as ax', platform._drill_ordinal_sql(v_x,
                   format('(case sd.side when ''w'' then ($1->>%L) else ($1->>%L) end)::timestamp', 'wps_' || (v_ax ->> 'grain'), 'pps_' || (v_ax ->> 'grain')),
                   v_ax ->> 'grain'));
      else
        v_sel := v_sel || format('%s as ax', v_x);
      end if;
    else
      v_sel := v_sel || case when v_ax -> 'col' ->> 'type' in ('text', 'character varying', 'varchar', 'citext')
                             then format('nullif(%s, '''') as ax', v_ref) else format('%s as ax', v_ref) end;
    end if;
  end if;
  v_i := 0;
  for m in select x from jsonb_array_elements(v_show) x loop
    v_i := v_i + 1;
    if m ->> 'op' = 'ratio' then
      -- each leaf once, as m<i>_<n> (its own where already folded into its expression)
      for v_j in 0 .. jsonb_array_length(m -> 'leaves') - 1 loop
        if m -> 'leaves' -> v_j ? 'expr' then
          v_sel := v_sel || format('%s as m%s_%s', m -> 'leaves' -> v_j ->> 'expr', v_i, v_j);
        end if;
      end loop;
      continue;
    end if;
    if m ? 'expr' then
      v_sel := v_sel || format('%s as m%s', m ->> 'expr', v_i);
    elsif m ->> 'op' <> 'count' then
      v_col := v_cols -> (m ->> 'of');
      v_sel := v_sel || format('%I.%I as m%s', v_col ->> 'alias', v_col ->> 'column', v_i);
    end if;
    if m ->> 'op' = 'rate' then
      v_sel := v_sel || format('%s as m%s_ws', v_rate_ws, v_i);
    end if;
    if m ? 'at_grain' then
      v_col := v_cols -> (m ->> 'at_grain');
      v_sel := v_sel || format('%I.%I as g%s', v_col ->> 'alias', v_col ->> 'column', v_i);
    end if;
  end loop;

  -- the sort's own aggregate over src (the ranking of groups)
  if v_sort ? 'measure' then
    v_i := (select o from jsonb_array_elements(v_show) with ordinality z(y, o) where y ->> 'key' = v_sort ->> 'measure');
    v_rank_expr := case when v_show -> (v_i - 1) ->> 'op' = 'ratio'
                     then platform._drill_ratio_sql(v_show -> (v_i - 1), 's.m' || v_i, case when v_cmp is not null then 's.side = ''w''' end)
                     else platform._drill_agg_sql(v_show -> (v_i - 1), 's.m' || v_i, null,
                            case when v_cmp is not null then 's.side = ''w''' end) end;
  end if;

  -- ── HAVING: thresholds on the groups (decision 25), judged on the current window and applied
  --    BEFORE the cut into Other: a group that misses one is added into Other with the groups past
  --    the cap, so the answer still adds up to its total and says how many groups met the rule.
  if q ? 'having' and jsonb_typeof(q -> 'having') <> 'null' then
    if jsonb_typeof(q -> 'having') <> 'array' then
      raise exception 'having is a list of thresholds.' using errcode = '22023';
    end if;
    if jsonb_array_length(q -> 'having') > 0 and not v_has_by then
      raise exception 'A threshold is on groups, so the question must group by something.' using errcode = '22023';
    end if;
    v_j := 0;
    for e in select x from jsonb_array_elements(q -> 'having') x loop
      v_j := v_j + 1;
      v_i := (select o from jsonb_array_elements(v_show) with ordinality z(y, o) where y ->> 'key' = e ->> 'measure');
      if v_i is null then
        raise exception 'A threshold''s measure "%" must also be shown.', coalesce(e ->> 'measure', '') using errcode = '22023';
      end if;
      m := v_show -> (v_i - 1);
      if m ? 'at_grain' then
        raise exception 'A threshold cannot read "%", which is counted once per %.', m ->> 'key', m ->> 'at_grain' using errcode = '22023';
      end if;
      -- (lane DRILL-PARITY-LAST) a moment (the latest activity) is not a number a line can be drawn on
      if m ->> 'cat' = 'time' then
        raise exception 'A threshold is a number; "%" is a moment.', m ->> 'key' using errcode = '22023';
      end if;
      if coalesce(e ->> 'op', '') not in ('>=', '>', '<=', '<') then
        raise exception 'A threshold''s op is ">=", ">", "<=" or "<".' using errcode = '22023';
      end if;
      if (case when e ? 'value' then 1 else 0 end) + (case when e ? 'share_of_total' then 1 else 0 end) + (case when e ? 'times_median' then 1 else 0 end) <> 1 then
        raise exception 'A threshold has exactly one of value, share_of_total and times_median.' using errcode = '22023';
      end if;
      -- the line: a setting when the threshold names one (organizations decide), else its own number
      begin
        v_x := case when e ? 'knob' then platform.drill_knob(p_organization_id, e ->> 'knob')::text
                    else coalesce(e ->> 'value', e ->> 'share_of_total', e ->> 'times_median') end;
        perform v_x::numeric;
      exception when invalid_text_representation or numeric_value_out_of_range then
        raise exception 'A threshold''s line is a number.' using errcode = '22023';
      end;
      v_hv := v_hv || to_jsonb(v_x::numeric);
      v_hsel := v_hsel || format('%s as hv%s',
        case when m ->> 'op' = 'ratio' then platform._drill_ratio_sql(m, 's.m' || v_i, 's.side = ''w''')
             else platform._drill_agg_sql(m, 's.m' || v_i, null, 's.side = ''w''') end, v_j);
      if e ? 'share_of_total' then
        if not coalesce((m ->> 'adds')::boolean, false)
           and (not (m ->> 'op' in ('sum', 'count')) or not coalesce(((select y from jsonb_array_elements(p_def -> 'measures') y where y ->> 'key' = m ->> 'key') ->> 'additive')::boolean, m ->> 'op' in ('sum', 'count'))) then
          raise exception 'A share of the total needs a measure that adds up across groups; "%" does not.', m ->> 'key' using errcode = '22023';
        end if;
        v_hok := v_hok || format('bg.hv%1$s %2$s ($1->''hv''->>%3$s)::numeric / 100 * sum(bg.hv%1$s) over ()', v_j, e ->> 'op', v_j - 1);
        v_hsays := v_hsays || format('%s %s %s%% of the total', lower(coalesce((select y ->> 'label' from jsonb_array_elements(p_def -> 'measures') y where y ->> 'key' = m ->> 'key'), m ->> 'key')),
                                     case e ->> 'op' when '>=' then 'at least' when '>' then 'more than' when '<=' then 'at most' else 'less than' end, trim_scale(v_x::numeric));
      elsif e ? 'times_median' then
        v_hmed := v_hmed || format('percentile_cont(0.5) within group (order by hv%1$s) filter (where hv%1$s is not null%2$s) as md%1$s',
                                   v_j, case when coalesce((e ->> 'median_nonzero')::boolean, false) then format(' and hv%s > 0', v_j) else '' end);
        v_hok := v_hok || format('bg.hv%1$s %2$s ($1->''hv''->>%3$s)::numeric * bm.md%1$s', v_j, e ->> 'op', v_j - 1);
        v_hsays := v_hsays || format('%s %s %s × the median group%s', lower(coalesce((select y ->> 'label' from jsonb_array_elements(p_def -> 'measures') y where y ->> 'key' = m ->> 'key'), m ->> 'key')),
                                     case e ->> 'op' when '>=' then 'at least' when '>' then 'more than' when '<=' then 'at most' else 'less than' end, trim_scale(v_x::numeric),
                                     case when coalesce((e ->> 'median_nonzero')::boolean, false) then ' above zero' else '' end);
      else
        v_hok := v_hok || format('bg.hv%1$s %2$s ($1->''hv''->>%3$s)::numeric', v_j, e ->> 'op', v_j - 1);
        v_hsays := v_hsays || format('%s %s %s', lower(coalesce((select y ->> 'label' from jsonb_array_elements(p_def -> 'measures') y where y ->> 'key' = m ->> 'key'), m ->> 'key')),
                                     case e ->> 'op' when '>=' then 'at least' when '>' then 'more than' when '<=' then 'at most' else 'less than' end, trim_scale(v_x::numeric));
      end if;
    end loop;
    v_params := v_params || jsonb_build_object('hv', v_hv);
  end if;

  -- ── the statement ─────────────────────────────────────────────────────────────────────────
  v_sql := format('with src as (select %s from %s where %s)', array_to_string(v_sel, ', '), v_from,
                  coalesce(nullif(array_to_string(v_preds, ' and '), ''), 'true'));
  -- s2: the group key as one jsonb value (hashable), the across value likewise
  v_sql := v_sql || format(', s2 as (select s.*, %s as gk0, %s as av0 from src s)',
             case when v_has_by then 'jsonb_build_array(' || array_to_string(v_gk, ', ') || ')' else '''[]''::jsonb' end,
             case when v_has_ax then 'coalesce(to_jsonb(s.ax), ''null''::jsonb)' else 'null::jsonb' end);
  -- the ranking of groups: by the current window's value; a group only the prior window has
  -- ranks after every current one. Ties break on the key, so top-N is the same on every call.
  v_sql := v_sql || format(', bg as (select s.gk0 as gk, %s as sv, count(*) filter (where s.side = ''w'') as c, count(*) as c_all%s from s2 s group by s.gk0)',
             case when v_sort ? 'measure' then v_rank_expr else 'null::numeric' end,
             case when cardinality(v_hsel) > 0 then ', ' || array_to_string(v_hsel, ', ') else '' end);
  -- bh: which groups meet every threshold (all of them when the question names none)
  if cardinality(v_hmed) > 0 then
    v_sql := v_sql || format(', bm as (select %s from bg)', array_to_string(v_hmed, ', '));
  end if;
  v_sql := v_sql || format(', bh as (select bg.*, %s as ok from bg%s)',
             case when cardinality(v_hok) > 0 then format('(bg.c > 0 and coalesce(%s, false))', array_to_string(v_hok, ' and ')) else 'true' end,
             case when cardinality(v_hmed) > 0 then ' cross join bm' else '' end);
  v_sql := v_sql || format(', br as (select gk, ok, row_number() over (order by (not ok), %s, gk) as rn, count(*) filter (where c > 0 and ok) over () as n, count(*) filter (where c > 0) over () as n_all from bh)',
             case when v_sort ? 'measure' then format('sv %s nulls last, c desc, c_all desc', v_rank_dir)
                  else format('(gk->%s) %s nulls last', v_sort ->> 'by', v_rank_dir) end);
  if v_has_ax then
    v_sql := v_sql || ', ag as (select s.av0 as av, count(*) filter (where s.side = ''w'') as c, count(*) as c_all from s2 s group by s.av0)';
    v_sql := v_sql || format(', ar as (select av, row_number() over (order by %s, c desc, c_all desc, av) as arn, count(*) filter (where c > 0) over () as n from ag)',
               case when v_ax ? 'grain' then 'av asc' else 'c desc' end);
  end if;
  -- tg: fold every group past the cap into Other, every across value past its cap into one column
  v_sql := v_sql || format(', tg as (select s.*, br.rn, case when br.rn <= ($1->>''cap'')::integer and br.ok then br.gk end as gk, (br.rn > ($1->>''cap'')::integer or not br.ok) as is_other%s from s2 s join br on br.gk = s.gk0%s)',
             case when v_has_ax then ', ar.arn, case when ar.arn <= ($1->>''acap'')::integer then ar.av else ''{"other":true}''::jsonb end as av' else '' end,
             case when v_has_ax then ' join ar on ar.av = s.av0' else '' end);
  -- tg2: at_grain flags, one per grouping-set shape, on the FOLDED keys
  v_sel := '{}';
  v_i := 0;
  for m in select x from jsonb_array_elements(v_show) x loop
    v_i := v_i + 1;
    continue when not (m ? 'at_grain');
    v_sel := v_sel || format('(row_number() over (partition by t.side, t.is_other, t.gk%s, t.g%s order by t.m%s nulls last) = 1) as f%s_c',
                             case when v_has_ax then ', t.av' else '' end, v_i, v_i, v_i);
    if v_has_ax then
      v_sel := v_sel || format('(row_number() over (partition by t.side, t.is_other, t.gk, t.g%s order by t.m%s nulls last) = 1) as f%s_g', v_i, v_i, v_i);
      v_sel := v_sel || format('(row_number() over (partition by t.side, t.av, t.g%s order by t.m%s nulls last) = 1) as f%s_a', v_i, v_i, v_i);
    end if;
    v_sel := v_sel || format('(row_number() over (partition by t.side, t.g%s order by t.m%s nulls last) = 1) as f%s_t', v_i, v_i, v_i);
  end loop;
  v_sql := v_sql || format(', tg2 as (select t.*%s from tg t)',
             case when cardinality(v_sel) > 0 then ', ' || array_to_string(v_sel, ', ') else '' end);

  -- the grouping sets, and each measure chosen per set
  v_sets := case
    when v_has_by and v_has_ax then '(side, is_other, gk, av), (side, is_other, gk), (side, av), (side)'
    when v_has_by then '(side, is_other, gk), (side)'
    when v_has_ax then '(side, av), (side)'
    else '(side)' end;
  v_meas := '{}';
  v_i := 0;
  for m in select x from jsonb_array_elements(v_show) x loop
    v_i := v_i + 1;
    if m ? 'at_grain' then
      v_x := format('case %s else %s end',
        case
          when v_has_by and v_has_ax then format('when grouping(gk) = 0 and grouping(av) = 0 then %s when grouping(gk) = 0 then %s when grouping(av) = 0 then %s',
                                                platform._drill_agg_sql(m, 'm' || v_i, 'f' || v_i || '_c'),
                                                platform._drill_agg_sql(m, 'm' || v_i, 'f' || v_i || '_g'),
                                                platform._drill_agg_sql(m, 'm' || v_i, 'f' || v_i || '_a'))
          when v_has_by then format('when grouping(gk) = 0 then %s', platform._drill_agg_sql(m, 'm' || v_i, 'f' || v_i || '_c'))
          when v_has_ax then format('when grouping(av) = 0 then %s', platform._drill_agg_sql(m, 'm' || v_i, 'f' || v_i || '_c'))
          else 'when false then null' end,
        platform._drill_agg_sql(m, 'm' || v_i, 'f' || v_i || '_t'));
    elsif m ->> 'op' = 'ratio' then
      v_x := platform._drill_ratio_sql(m, 'm' || v_i, null);
    else
      v_x := platform._drill_agg_sql(m, 'm' || v_i, null);
    end if;
    v_meas := v_meas || format('%L, (%s)', m ->> 'key', v_x);
    v_zero := v_zero || jsonb_build_object(m ->> 'key',
                case when m ->> 'op' in ('count', 'count_distinct', 'filled', 'empty') or coalesce((m ->> 'adds')::boolean, false) then to_jsonb(0) else 'null'::jsonb end);
    if coalesce(m ->> 'cat', 'number') = 'number' or m ->> 'op' in ('count', 'count_distinct', 'filled', 'empty') then
      v_delta := v_delta || format($d$%1$L, jsonb_build_object('current', (c.measures->>%1$L)::numeric, 'prior', (p.measures->>%1$L)::numeric,
                                 'change', (c.measures->>%1$L)::numeric - (p.measures->>%1$L)::numeric,
                                 'change_pct', case when (p.measures->>%1$L)::numeric is null or (c.measures->>%1$L)::numeric is null or (p.measures->>%1$L)::numeric = 0 then null
                                                    else round(((c.measures->>%1$L)::numeric - (p.measures->>%1$L)::numeric) / abs((p.measures->>%1$L)::numeric) * 100, 1) end)$d$,
                                 m ->> 'key');
    end if;
  end loop;
  v_params := v_params || jsonb_build_object('zero', v_zero);

  -- the time labels of each group (the period start, read as the store's label)
  v_sel := '{}';
  v_i := 0;
  for e in select x from jsonb_array_elements(v_by) x loop
    v_i := v_i + 1;
    if e ? 'grain' then
      v_sel := v_sel || format('min(case when not is_other then ps%s end) as lbl%s', v_i, v_i);
    end if;
  end loop;
  if v_has_ax and v_ax ? 'grain' then
    v_sel := v_sel || 'min(case when av <> ''{"other":true}''::jsonb then aps end) as albl'::text;
  end if;
  v_sql := v_sql || format(', agg as (select side, %s as gg, %s as ga, %s as is_other, %s as gk, %s as av, min(rn) as rn, %s as arn%s, jsonb_build_object(%s) as measures, count(*)::bigint as row_count from tg2 group by grouping sets (%s))',
    case when v_has_by then 'grouping(gk)' else '1' end,
    case when v_has_ax then 'grouping(av)' else '1' end,
    case when v_has_by then 'is_other' else 'false' end,
    case when v_has_by then 'gk' else 'null::jsonb' end,
    case when v_has_ax then 'av' else 'null::jsonb' end,
    case when v_has_ax then 'min(arn)' else 'null::bigint' end,
    case when cardinality(v_sel) > 0 then ', ' || array_to_string(v_sel, ', ') else '' end,
    array_to_string(v_meas, ', '), v_sets);

  -- groups: each asked key -> its value (a period as its label); Other and totals carry none;
  -- a pivot cell and a column total carry the across key.
  v_sel := '{}';
  v_i := 0;
  for e in select x from jsonb_array_elements(v_by) x loop
    v_i := v_i + 1;
    v_sel := v_sel || format('%L, %s', e ->> 'key',
      case when e ? 'grain' then platform._drill_label_sql('X.lbl' || v_i) else format('X.gk->%s', v_i - 1) end);
  end loop;
  v_grp := format('(case when X.gg = 0 and not X.is_other then jsonb_build_object(%s) else ''{}''::jsonb end)%s',
    case when cardinality(v_sel) > 0 then array_to_string(v_sel, ', ') else '' end,
    case when v_has_ax then format(' || (case when X.ga = 0 then jsonb_build_object(%L, %s) else ''{}''::jsonb end)', v_ax ->> 'key',
           case when v_ax ? 'grain' then format('case when X.av = ''{"other":true}''::jsonb then X.av else to_jsonb(%s) end', platform._drill_label_sql('X.albl'))
                else 'X.av' end)
         else '' end);

  v_order := format('case when %1$s.gg = 1 then 2 when %1$s.is_other then 1 else 0 end, %2$s, %1$s.ga desc, %1$s.arn nulls first',
                    'Y', case when v_time_default then 'Y.rn desc' else 'Y.rn' end);

  if v_cmp is null then
    v_sql := v_sql || format($q$ select row_number() over (order by %s) as ord,
        case when Y.gg = 1 then 'total' when Y.is_other then 'other' else 'group' end as kind,
        %s as groups, Y.measures, Y.row_count,
        null::jsonb as prior_groups, null::jsonb as prior_measures, null::bigint as prior_row_count, null::jsonb as delta, null::jsonb as compare,
        (select max(n) from br)::bigint as distinct_groups, %s as distinct_across, (select max(n_all) from br)::bigint as distinct_all
      from agg Y$q$,
      v_order, replace(v_grp, 'X.', 'Y.'),
      case when v_has_ax then '(select max(n) from ar)::bigint' else 'null::bigint' end);
  else
    -- the same question over both windows, matched by the group (a period by its position)
    v_sql := v_sql || format($q$, cur as (select * from agg where side = 'w'), pri as (select * from agg where side = 'p'),
      j as (select coalesce(c.gg, p.gg) as gg, coalesce(c.ga, p.ga) as ga, coalesce(c.is_other, p.is_other) as is_other,
                   coalesce(c.rn, p.rn) as rn, coalesce(c.arn, p.arn) as arn,
                   case when c.side is not null then %s end as groups, coalesce(c.measures, $1->'zero') as measures, coalesce(c.row_count, 0) as row_count,
                   case when p.side is not null then %s end as prior_groups, coalesce(p.measures, $1->'zero') as prior_measures, coalesce(p.row_count, 0) as prior_row_count,
                   jsonb_build_object(%s) as delta,
                   ($1->'cmp') || jsonb_build_object('position', %s) as compare
              from cur c full join pri p
                on c.gg = p.gg and c.ga = p.ga and c.is_other is not distinct from p.is_other
               and c.gk is not distinct from p.gk and c.av is not distinct from p.av)
      select row_number() over (order by %s) as ord,
             case when Y.gg = 1 then 'total' when Y.is_other then 'other' else 'group' end as kind,
             Y.groups, Y.measures, Y.row_count, Y.prior_groups, Y.prior_measures, Y.prior_row_count, Y.delta, Y.compare,
             (select max(n) from br)::bigint as distinct_groups, %s as distinct_across, (select max(n_all) from br)::bigint as distinct_all
        from j Y$q$,
      replace(v_grp, 'X.', 'c.'), replace(v_grp, 'X.', 'p.'),
      replace(replace(array_to_string(v_delta, ', '), 'c.measures', 'coalesce(c.measures, $1->''zero'')'), 'p.measures', 'coalesce(p.measures, $1->''zero'')'),
      coalesce((select format('coalesce(c.gk, p.gk)->%s', o - 1) from jsonb_array_elements(v_by) with ordinality z(y, o) where y ? 'grain' limit 1), 'null'),
      v_order,
      case when v_has_ax then '(select max(n) from ar)::bigint' else 'null::bigint' end);
  end if;

  -- relation dimensions of this answer: their targets, so labels are read as the seat
  for e in select x from jsonb_array_elements(v_by || coalesce(jsonb_build_array(v_ax), '[]')) x loop
    continue when e is null or e -> 'dim' ->> 'kind' <> 'relation';
    if not (e -> 'col' ? 'fk') and e -> 'dim' -> 'relation' ->> 'token' is not null then
      -- a column with no foreign key (a view's) names its target by the Dimension's declared
      -- relation token: the registry's table, its one-column key and its title (lane DRILL-GAPS).
      -- The words are still read as the seat, through the target's own row security (drill_ask).
      select jsonb_build_object('schema', et.schema_name, 'table', et.table_name, 'title', et.title_column,
                                'to', coalesce((select att.attname::text from pg_constraint pk
                                         join pg_attribute att on att.attrelid = pk.conrelid and att.attnum = pk.conkey[1]
                                        where pk.conrelid = format('%I.%I', et.schema_name, et.table_name)::regclass
                                          and pk.contype = 'p' and cardinality(pk.conkey) = 1),
                                       -- a record-store view has no key constraint; its rows are keyed by id
                                       (select 'id' from pg_class v join pg_namespace vn on vn.oid = v.relnamespace
                                         where vn.nspname = et.schema_name and v.relname = et.table_name and v.relkind = 'v')))
        into v_part
        -- SCOPES-REFS (2026-10-05): the target is read where its rows live (platform.entity_read_source)
        from (select e2.token, e2.is_active, e2.type, e2.data_class, e2.title_column, rs.schema_name, rs.table_name
                from platform.entity_types e2 cross join lateral platform.entity_read_source(e2.token) rs
               where e2.token = e -> 'dim' -> 'relation' ->> 'token') et
       where et.is_active and et.title_column is not null
         and et.type not in ('restricted', 'deprecated') and et.data_class::text <> 'confidential';
      continue when v_part is null or (v_part ->> 'to') is null;
      e := jsonb_set(e, '{col,fk}', v_part);
    end if;
    continue when not (e -> 'col' ? 'fk');
    continue when e -> 'col' -> 'fk' ->> 'title' is null;
    v_rel := v_rel || jsonb_build_array(jsonb_build_object('key', e ->> 'key',
               'schema', e -> 'col' -> 'fk' ->> 'schema', 'table', e -> 'col' -> 'fk' ->> 'table',
               'to', e -> 'col' -> 'fk' ->> 'to', 'title', e -> 'col' -> 'fk' ->> 'title',
               'uuid', (platform._drill_column(e -> 'col' -> 'fk' ->> 'schema', e -> 'col' -> 'fk' ->> 'table', e -> 'col' -> 'fk' ->> 'to') ->> 'cat') = 'uuid'));
  end loop;

  return jsonb_build_object(
    'sql', v_sql, 'params', v_params, 'lane', v_lane, 'cap', v_cap, 'acap', v_acap, 'zero', v_zero,
    'by', (select coalesce(jsonb_agg(x ->> 'key'), '[]') from jsonb_array_elements(v_by) x),
    'across', v_ax ->> 'key',
    'show', (select coalesce(jsonb_agg(x ->> 'key'), '[]') from jsonb_array_elements(v_show) x),
    'relations', v_rel,
    'sort_label', case when v_sort ? 'measure' then (select coalesce(y ->> 'label', y ->> 'key') from jsonb_array_elements(p_def -> 'measures') y where y ->> 'key' = v_sort ->> 'measure')
                       else v_by -> (v_sort ->> 'by')::integer -> 'dim' ->> 'label' end,
    'time_first', v_time_default,
    'compare', v_cmp,
    'having_says', case when cardinality(v_hsays) > 0 then array_to_string(v_hsays, ' and ') end);
end
$function$
;

DROP FUNCTION platform._drill_fine_ratio_sql(jsonb, text, text, text, text);
DROP FUNCTION platform._drill_fine_agg_sql(jsonb, text, text, text, text);
