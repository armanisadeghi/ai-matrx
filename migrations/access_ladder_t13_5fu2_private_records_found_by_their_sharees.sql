-- lane: access-ladder T-13 phase 5 follow-up 2 (a Private record is found in search by its owner and the people it is shared with)
-- based-on: platform.search_items(text, text[], uuid[], uuid[], text[], text[], uuid[], timestamp with time zone, timestamp with time zone, integer, text) c43489d804d1b878830aaef6472b04aed788b2ffa436fa48e93f0bb6f56944e9
-- based-on: platform.search_item_sections(text, text[], uuid[], uuid[], text[], text[], uuid[], timestamp with time zone, timestamp with time zone, integer, jsonb) a62ae6e48b4165403245252021b568abcc8a1fa7ca2bb37cbf7b4c443a75e816
-- based-on: platform.count_items(text, text[], uuid[], uuid[], text[], text[], uuid[], timestamp with time zone, timestamp with time zone) d77ee4c4b4c44e4e89dc1f2568c57978ad774882c3121e581437bd390504cc00
-- scope: three search door bodies replaced (platform.search_items, platform.search_item_sections, platform.count_items); no table, policy, grant or row is changed.
--
-- The access ladder: a Private record opens to its owner alone WITHOUT being shared in, and sharing works at
-- every level. The search doors dropped every Private row not owned by the caller before the kernel was
-- asked, so a chat shared with someone could be opened by them but never found. Now:
--   * the scope branch still admits only the caller's OWN Private rows (a coworker never sees a candidate);
--   * a Private row shared directly with the caller is a candidate wherever it lives (shared_items), and
--     only the kernel (iam.has_access_for — level + shares, no row word) decides whether it is returned;
--   * count_items counts exactly what search_items returns.
-- Proof: common-docs/projects/access-ladder/t13/phase5/proof-5fu2-private-search.{sql,red.out,out}.
CREATE OR REPLACE FUNCTION platform.search_items(p_query text DEFAULT NULL::text, p_types text[] DEFAULT NULL::text[], p_org_ids uuid[] DEFAULT NULL::uuid[], p_within uuid[] DEFAULT NULL::uuid[], p_source_kinds text[] DEFAULT NULL::text[], p_origins text[] DEFAULT NULL::text[], p_captured_by uuid[] DEFAULT NULL::uuid[], p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_limit integer DEFAULT 20, p_cursor text DEFAULT NULL::text)
 RETURNS TABLE(entity_token text, entity_id uuid, organization_id uuid, owner_id uuid, data_class platform.data_class, title text, subtitle text, tags text[], updated_at timestamp with time zone, source_kind text, origin_client text, match_kind text, score real, next_cursor text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_uid       uuid := auth.uid();
  v_limit     integer := least(greatest(coalesce(p_limit, 20), 1), 100);
  v_offset    integer := 0;
  v_kcap      integer;
  v_my_orgs   uuid[];
  v_scope     uuid[];
  v_global    uuid[];
  v_q         text;
  v_words     text[];
  v_tsq       tsquery;
  v_like      text;
  v_filters   text := '';
  v_within    text := '';
  v_unres     uuid[] := '{}'::uuid[];
  v_textpred  text;
  v_rank      text;
  v_cand      text;
  v_sql       text;
begin
  if v_uid is null then
    raise exception 'Sign in to search your knowledge.' using errcode = '42501';
  end if;
  if p_cursor is not null then
    if p_cursor !~ '^o:[0-9]{1,6}$' then
      raise exception 'That page marker is not one this search handed out.' using errcode = '22023';
    end if;
    v_offset := substr(p_cursor, 3)::integer;
  end if;
  v_kcap := least(400, (v_offset + v_limit) * 4);

  v_my_orgs := array(select om.organization_id from iam.organization_member om where om.user_id = v_uid);
  v_scope   := coalesce(p_org_ids, v_my_orgs);
  v_global  := array(select so.organization_id from iam.system_orgs so where so.global_readable);

  -- ── the typed text, normalized exactly as stored titles are ───────────────────────────
  v_q := nullif(platform.search_normalize(btrim(coalesce(p_query, ''))), '');
  if v_q is not null then
    v_q := left(v_q, 200);
    v_words := array(select w from regexp_split_to_table(v_q, '[^[:alnum:]]+') w where w <> '');
    if cardinality(v_words) > 0 then
      v_tsq := to_tsquery('simple', array_to_string(array(
                 select quote_literal(w) || case when o = cardinality(v_words) then ':*' else '' end
                   from unnest(v_words) with ordinality u(w, o)), ' & '));
    end if;
    v_like := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    if char_length(v_q) >= 3 then
      v_textpred := '(s.title_norm = $1 or s.title_norm like $2'
                    || case when v_tsq is not null then ' or s.title_tsv @@ $3' else '' end
                    || ' or s.title_norm %> $1)';
    elsif char_length(v_q) = 2 then
      -- Two characters: a trigram index cannot help; exact title or a word prefix only.
      v_textpred := '(s.title_norm = $1'
                    || case when v_tsq is not null then ' or s.title_tsv @@ $3' else '' end || ')';
    else
      -- One character ranks nothing (every word starting with it matches — 12.8 s for a member of
      -- 142 organizations on the clone): exact title only. Callers show recents (no query) until the
      -- second character, as command bars do.
      v_textpred := '(s.title_norm = $1)';
    end if;
    v_rank := 'case when s.title_norm = $1 then ''exact'''
              || case when v_tsq is not null then ' when s.title_tsv @@ $3 then ''text''' else '' end
              || ' else ''fuzzy'' end as match_kind, (case when s.title_norm = $1 then 3.0'
              || case when v_tsq is not null then
                   ' when s.title_tsv @@ $3 then 2.0'
                   || ' + case when left(s.title_norm, char_length($1)) = $1 then 0.5 else 0 end'
                   || ' + least(ts_rank(s.title_tsv, $3), 0.49)'
                 else '' end
              || ' else word_similarity($1, s.title_norm) end)::real as score';
  end if;

  -- ── filters ─────────────────────────────────────────────────────────────────────────────
  if p_types is not null        then v_filters := v_filters || ' and s.entity_token = any($7)'; end if;
  if p_source_kinds is not null then v_filters := v_filters || ' and s.source_kind = any($8)'; end if;
  if p_origins is not null      then v_filters := v_filters || ' and s.origin_client = any($9)'; end if;
  if p_captured_by is not null  then v_filters := v_filters || ' and s.owner_id = any($10)'; end if;
  if p_date_from is not null    then v_filters := v_filters || ' and s.updated_at >= $11'; end if;
  if p_date_to is not null      then v_filters := v_filters || ' and s.updated_at < $12'; end if;
  if p_within is not null then
    -- Containers resolve their own token from the projection; an id the projection does not hold
    -- (a container type that is not searchable) is matched on the association id alone.
    v_unres := array(select w from unnest(p_within) w
                      where not exists (select 1 from platform.search_item c where c.entity_id = w));
    v_within := ' and exists (select 1 from within_items wi where wi.t = s.entity_token and wi.i = s.entity_id)';
  end if;

  -- ── candidates: scope organizations, plus rows shared directly with the caller ─────────────
  if v_q is null then
    v_cand := format(
      'select s.entity_token, s.entity_id, s.organization_id, s.owner_id, s.data_class, s.row_visibility, s.kernel_only, s.title, s.subtitle, s.tags, s.filed_tags, s.updated_at, s.source_kind, s.origin_client, ''recent''::text as match_kind, 0::real as score
         from unnest($19) o(id)
         cross join lateral (select s.* from platform.search_item s
                              where s.organization_id = o.id %1$s
                                and not (s.data_class = ''private'' and s.owner_id is distinct from $4)
                              order by s.updated_at desc
                              limit ($16 + $17) * 2) s
       union all
       select s.entity_token, s.entity_id, s.organization_id, s.owner_id, s.data_class, s.row_visibility, s.kernel_only, s.title, s.subtitle, s.tags, s.filed_tags, s.updated_at, s.source_kind, s.origin_client, ''recent''::text, 0::real
         from shared_items s
        where true %1$s',
      v_filters || v_within);
  else
    v_cand := format(
      'select s.entity_token, s.entity_id, s.organization_id, s.owner_id, s.data_class, s.row_visibility, s.kernel_only, s.title, s.subtitle, s.tags, s.filed_tags, s.updated_at, s.source_kind, s.origin_client, %1$s
         from platform.search_item s
        where s.organization_id = any($19) and %2$s %3$s
          and not (s.data_class = ''private'' and s.owner_id is distinct from $4)
       union all
       select s.entity_token, s.entity_id, s.organization_id, s.owner_id, s.data_class, s.row_visibility, s.kernel_only, s.title, s.subtitle, s.tags, s.filed_tags, s.updated_at, s.source_kind, s.origin_client, %1$s
         from shared_items s
        where true and %2$s %3$s',
      v_rank, v_textpred, v_filters || v_within);
  end if;

  v_sql := format($q$
    with
    within_containers as materialized (
      select c.entity_token as t, c.entity_id as i from platform.search_item c where c.entity_id = any($13)
    ),
    within_items as materialized (
      select a.source_type as t, a.source_id as i
        from platform.associations a join within_containers w on a.target_type = w.t and a.target_id = w.i
       where a.deleted_at is null
      union
      select a.target_type, a.target_id
        from platform.associations a join within_containers w on a.source_type = w.t and a.source_id = w.i
       where a.deleted_at is null
      %1$s
    ),
    shared_with_me as materialized (
      select p.resource_type as t, p.resource_id as i
        from iam.permissions p
       where $14 and p.granted_to_user_id = $4 and p.status <> 'rejected'
         and (p.expires_at is null or p.expires_at > now())
    ),
    -- Rows shared directly with the caller from outside the scope, found by KEY (one primary-key
    -- probe per grant; LIMIT 1 keeps it a probe) — never by re-running the text scan over the
    -- whole projection and hash-joining the grants onto it.
    shared_items as materialized (
      select s.*
        from shared_with_me sw
        cross join lateral (select s.* from platform.search_item s
                             where s.entity_token = sw.t and s.entity_id = sw.i limit 1) s
       where s.organization_id <> all($19)
          -- T-13 5fu2: a Private record shared with the caller is a candidate wherever it lives
          -- (the scope branch keeps only the caller's own Private rows).
          or (s.data_class = 'private' and s.owner_id is distinct from $4)
    ),
    cand as materialized (
      %2$s
    ),
    ranked as materialized (
      select c.*,
             ( (c.owner_id = $4 and not c.kernel_only)
               or (not c.kernel_only and c.row_visibility >= 'internal'
                   and c.data_class in ('confidential', 'organization', 'public')
                   and c.organization_id = any($5))
               or (not c.kernel_only and c.row_visibility = 'public'
                   and c.data_class in ('organization', 'public'))
               or (not c.kernel_only and c.row_visibility >= 'internal'
                   and c.data_class in ('organization', 'public')
                   and c.organization_id = any($6)) ) as fast,
             row_number() over (order by c.score desc, c.updated_at desc, c.entity_id) as rn
        from cand c
    ),
    kernel as materialized (
      select r.entity_token, r.entity_id
        from ranked r
       where not r.fast
         -- T-13 5fu2: a Private row that is not the caller's own reached the candidates only as a
         -- share; its level + shares decide (the kernel), never a row word.
         and ( r.data_class = 'private' or r.kernel_only or r.row_visibility is null or r.row_visibility <> 'personal'
               or exists (select 1 from iam.permissions p
                           where p.resource_type = r.entity_token and p.resource_id = r.entity_id
                             and p.status <> 'rejected' and (p.expires_at is null or p.expires_at > now())
                             and (p.granted_to_user_id = $4 or p.granted_to_organization_id = any($5)))
               or exists (select 1 from iam.memberships m
                           where m.container_type = r.entity_token and m.container_id = r.entity_id
                             and m.user_id = $4 and m.deleted_at is null)
               or exists (select 1 from platform.entity_grants g
                           where g.entity_type = r.entity_token and g.entity_id = r.entity_id) )
       order by r.rn
       limit $15
    ),
    -- 1392: the kernel is asked ONLY about the budgeted candidates (materialized — measured: the
    -- planner otherwise pushed the call down onto every ranked row, 4x slower on an agent browse).
    kernel_ok as materialized (
      select k.entity_token, k.entity_id from kernel k
       where iam.has_access_for($4, k.entity_token, k.entity_id, 'viewer'::public.permission_level)
    ),
    visible as (
      select r.* from ranked r where r.fast
      union all
      select r.* from ranked r join kernel_ok k using (entity_token, entity_id)
    ),
    page as (
      select v.* from visible v order by v.rn offset $16 limit $17
    )
    select p.entity_token, p.entity_id, p.organization_id, p.owner_id, p.data_class, p.title, p.subtitle,
           array(select distinct x from unnest(p.tags || p.filed_tags) x order by x), p.updated_at, p.source_kind, p.origin_client, p.match_kind, p.score::real,
           case when count(*) over () >= $17 then 'o:' || ($16 + $17 - 1)::text end
      from page p
     order by p.rn
     limit $17 - 1
  $q$,
    case when cardinality(v_unres) > 0 then
      'union select a.source_type, a.source_id from platform.associations a
        where a.target_id = any($18) and a.deleted_at is null
       union select a.target_type, a.target_id from platform.associations a
        where a.source_id = any($18) and a.deleted_at is null' else '' end,
    v_cand);

  return query execute v_sql
    using v_q, v_like, v_tsq, v_uid, v_my_orgs, v_global,
          p_types, p_source_kinds, p_origins, p_captured_by, p_date_from, p_date_to,
          coalesce(p_within, '{}'::uuid[]), (p_org_ids is null), v_kcap, v_offset, v_limit + 1,
          v_unres, v_scope;
end
$function$;

CREATE OR REPLACE FUNCTION platform.search_item_sections(p_query text DEFAULT NULL::text, p_types text[] DEFAULT NULL::text[], p_org_ids uuid[] DEFAULT NULL::uuid[], p_within uuid[] DEFAULT NULL::uuid[], p_source_kinds text[] DEFAULT NULL::text[], p_origins text[] DEFAULT NULL::text[], p_captured_by uuid[] DEFAULT NULL::uuid[], p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_limit_per_type integer DEFAULT 8, p_limits jsonb DEFAULT NULL::jsonb)
 RETURNS TABLE(entity_token text, entity_id uuid, organization_id uuid, owner_id uuid, data_class platform.data_class, title text, subtitle text, tags text[], updated_at timestamp with time zone, source_kind text, origin_client text, match_kind text, score real, next_cursor text, section_has_more boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_uid       uuid := auth.uid();
  v_limit     integer := least(greatest(coalesce(p_limit_per_type, 8), 1), 100);
  v_limits    jsonb := '{}'::jsonb;
  v_tokens    text[];
  v_my_orgs   uuid[];
  v_scope     uuid[];
  v_global    uuid[];
  v_q         text;
  v_words     text[];
  v_tsq       tsquery;
  v_like      text;
  v_filters   text := '';
  v_within    text := '';
  v_unres     uuid[] := '{}'::uuid[];
  v_textpred  text;
  v_rank      text;
  v_cand      text;
  v_sql       text;
begin
  if v_uid is null then
    raise exception 'Sign in to search your knowledge.' using errcode = '42501';
  end if;
  if p_limits is not null then
    if jsonb_typeof(p_limits) <> 'object' then
      raise exception 'Per-type limits are an object of type to number.' using errcode = '22023';
    end if;
    -- Each per-type limit is clamped exactly as platform.search_items clamps p_limit.
    select coalesce(jsonb_object_agg(k, least(greatest(v::integer, 1), 100)), '{}'::jsonb) into v_limits
      from jsonb_each_text(p_limits) e(k, v) where v ~ '^[0-9]{1,6}$';
  end if;
  -- The sections: the types asked for, or every projected type.
  v_tokens := coalesce(p_types, case when p_limits is not null
                                     then array(select jsonb_object_keys(p_limits)) end,
                       platform.search_item_projected_tokens());

  v_my_orgs := array(select om.organization_id from iam.organization_member om where om.user_id = v_uid);
  v_scope   := coalesce(p_org_ids, v_my_orgs);
  v_global  := array(select so.organization_id from iam.system_orgs so where so.global_readable);

  -- ── the typed text, normalized exactly as stored titles are ───────────────────────────
  v_q := nullif(platform.search_normalize(btrim(coalesce(p_query, ''))), '');
  if v_q is not null then
    v_q := left(v_q, 200);
    v_words := array(select w from regexp_split_to_table(v_q, '[^[:alnum:]]+') w where w <> '');
    if cardinality(v_words) > 0 then
      v_tsq := to_tsquery('simple', array_to_string(array(
                 select quote_literal(w) || case when o = cardinality(v_words) then ':*' else '' end
                   from unnest(v_words) with ordinality u(w, o)), ' & '));
    end if;
    v_like := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    if char_length(v_q) >= 3 then
      v_textpred := '(s.title_norm = $1 or s.title_norm like $2'
                    || case when v_tsq is not null then ' or s.title_tsv @@ $3' else '' end
                    || ' or s.title_norm %> $1)';
    elsif char_length(v_q) = 2 then
      -- Two characters: a trigram index cannot help; exact title or a word prefix only.
      v_textpred := '(s.title_norm = $1'
                    || case when v_tsq is not null then ' or s.title_tsv @@ $3' else '' end || ')';
    else
      -- One character ranks nothing (every word starting with it matches — 12.8 s for a member of
      -- 142 organizations on the clone): exact title only. Callers show recents (no query) until the
      -- second character, as command bars do.
      v_textpred := '(s.title_norm = $1)';
    end if;
    v_rank := 'case when s.title_norm = $1 then ''exact'''
              || case when v_tsq is not null then ' when s.title_tsv @@ $3 then ''text''' else '' end
              || ' else ''fuzzy'' end as match_kind, (case when s.title_norm = $1 then 3.0'
              || case when v_tsq is not null then
                   ' when s.title_tsv @@ $3 then 2.0'
                   || ' + case when left(s.title_norm, char_length($1)) = $1 then 0.5 else 0 end'
                   || ' + least(ts_rank(s.title_tsv, $3), 0.49)'
                 else '' end
              || ' else word_similarity($1, s.title_norm) end)::real as score';
  end if;

  -- ── filters ─────────────────────────────────────────────────────────────────────────────
  if p_types is not null        then v_filters := v_filters || ' and s.entity_token = any($7)'; end if;
  if p_source_kinds is not null then v_filters := v_filters || ' and s.source_kind = any($8)'; end if;
  if p_origins is not null      then v_filters := v_filters || ' and s.origin_client = any($9)'; end if;
  if p_captured_by is not null  then v_filters := v_filters || ' and s.owner_id = any($10)'; end if;
  if p_date_from is not null    then v_filters := v_filters || ' and s.updated_at >= $11'; end if;
  if p_date_to is not null      then v_filters := v_filters || ' and s.updated_at < $12'; end if;
  if p_within is not null then
    -- Containers resolve their own token from the projection; an id the projection does not hold
    -- (a container type that is not searchable) is matched on the association id alone.
    v_unres := array(select w from unnest(p_within) w
                      where not exists (select 1 from platform.search_item c where c.entity_id = w));
    v_within := ' and exists (select 1 from within_items wi where wi.t = s.entity_token and wi.i = s.entity_id)';
  end if;

  -- ── candidates: scope organizations, plus rows shared directly with the caller ─────────────
  if v_q is null then
    v_cand := format(
      'select s.entity_token, s.entity_id, s.organization_id, s.owner_id, s.data_class, s.row_visibility, s.kernel_only, s.title, s.subtitle, s.tags, s.filed_tags, s.updated_at, s.source_kind, s.origin_client, ''recent''::text as match_kind, 0::real as score
         from unnest($19) o(id) cross join unnest($20) tk(tok)
         cross join lateral (select s.* from platform.search_item s
                              where s.organization_id = o.id and s.entity_token = tk.tok %1$s
                                and not (s.data_class = ''private'' and s.owner_id is distinct from $4)
                              order by s.updated_at desc
                              limit (coalesce(($21 ->> tk.tok)::integer, $22) + 1) * 2) s
       union all
       select s.entity_token, s.entity_id, s.organization_id, s.owner_id, s.data_class, s.row_visibility, s.kernel_only, s.title, s.subtitle, s.tags, s.filed_tags, s.updated_at, s.source_kind, s.origin_client, ''recent''::text, 0::real
         from shared_items s
        where true and s.entity_token = any($20) %1$s',
      v_filters || v_within);
  else
    v_cand := format(
      'select s.entity_token, s.entity_id, s.organization_id, s.owner_id, s.data_class, s.row_visibility, s.kernel_only, s.title, s.subtitle, s.tags, s.filed_tags, s.updated_at, s.source_kind, s.origin_client, %1$s
         from platform.search_item s
        where s.organization_id = any($19) and s.entity_token = any($20) and %2$s %3$s
          and not (s.data_class = ''private'' and s.owner_id is distinct from $4)
       union all
       select s.entity_token, s.entity_id, s.organization_id, s.owner_id, s.data_class, s.row_visibility, s.kernel_only, s.title, s.subtitle, s.tags, s.filed_tags, s.updated_at, s.source_kind, s.origin_client, %1$s
         from shared_items s
        where true and s.entity_token = any($20) and %2$s %3$s',
      v_rank, v_textpred, v_filters || v_within);
  end if;

  v_sql := format($q$
    with
    within_containers as materialized (
      select c.entity_token as t, c.entity_id as i from platform.search_item c where c.entity_id = any($13)
    ),
    within_items as materialized (
      select a.source_type as t, a.source_id as i
        from platform.associations a join within_containers w on a.target_type = w.t and a.target_id = w.i
       where a.deleted_at is null
      union
      select a.target_type, a.target_id
        from platform.associations a join within_containers w on a.source_type = w.t and a.source_id = w.i
       where a.deleted_at is null
      %1$s
    ),
    shared_with_me as materialized (
      select p.resource_type as t, p.resource_id as i
        from iam.permissions p
       where $14 and p.granted_to_user_id = $4 and p.status <> 'rejected'
         and (p.expires_at is null or p.expires_at > now())
    ),
    -- Rows shared directly with the caller from outside the scope, found by KEY (one primary-key
    -- probe per grant; LIMIT 1 keeps it a probe) — never by re-running the text scan over the
    -- whole projection and hash-joining the grants onto it.
    shared_items as materialized (
      select s.*
        from shared_with_me sw
        cross join lateral (select s.* from platform.search_item s
                             where s.entity_token = sw.t and s.entity_id = sw.i limit 1) s
       where s.organization_id <> all($19)
          -- T-13 5fu2: a Private record shared with the caller is a candidate wherever it lives
          -- (the scope branch keeps only the caller's own Private rows).
          or (s.data_class = 'private' and s.owner_id is distinct from $4)
    ),
    cand as materialized (
      %2$s
    ),
    ranked as materialized (
      select c.*,
             ( (c.owner_id = $4 and not c.kernel_only)
               or (not c.kernel_only and c.row_visibility >= 'internal'
                   and c.data_class in ('confidential', 'organization', 'public')
                   and c.organization_id = any($5))
               or (not c.kernel_only and c.row_visibility = 'public'
                   and c.data_class in ('organization', 'public'))
               or (not c.kernel_only and c.row_visibility >= 'internal'
                   and c.data_class in ('organization', 'public')
                   and c.organization_id = any($6)) ) as fast,
             row_number() over (order by c.score desc, c.updated_at desc, c.entity_id) as rn
        from cand c
    ),
    kernel as materialized (
      select x.entity_token, x.entity_id from (
      select r.entity_token, r.entity_id,
             row_number() over (partition by r.entity_token order by r.rn) as krn
        from ranked r
       where not r.fast
         -- T-13 5fu2: a Private row that is not the caller's own reached the candidates only as a
         -- share; its level + shares decide (the kernel), never a row word.
         and ( r.data_class = 'private' or r.kernel_only or r.row_visibility is null or r.row_visibility <> 'personal'
               or exists (select 1 from iam.permissions p
                           where p.resource_type = r.entity_token and p.resource_id = r.entity_id
                             and p.status <> 'rejected' and (p.expires_at is null or p.expires_at > now())
                             and (p.granted_to_user_id = $4 or p.granted_to_organization_id = any($5)))
               or exists (select 1 from iam.memberships m
                           where m.container_type = r.entity_token and m.container_id = r.entity_id
                             and m.user_id = $4 and m.deleted_at is null)
               or exists (select 1 from platform.entity_grants g
                           where g.entity_type = r.entity_token and g.entity_id = r.entity_id) )
      ) x
      -- The same kernel budget platform.search_items gives one type: 4 x its limit, best-ranked first.
      where x.krn <= 4 * coalesce(($21 ->> x.entity_token)::integer, $22)
    ),
    -- The kernel is asked ONLY about the budgeted candidates (materialized, so no plan can push the
    -- call down onto every ranked row).
    kernel_ok as materialized (
      select k.entity_token, k.entity_id from kernel k
       where iam.has_access_for($4, k.entity_token, k.entity_id, 'viewer'::public.permission_level)
    ),
    visible as (
      select r.* from ranked r where r.fast
      union all
      select r.* from ranked r join kernel_ok k using (entity_token, entity_id)
    ),
    page as (
      select v.*, row_number() over (partition by v.entity_token order by v.rn) as prn,
             count(*) over (partition by v.entity_token) as tcnt,
             coalesce(($21 ->> v.entity_token)::integer, $22) as lim
        from visible v
    )
    select p.entity_token, p.entity_id, p.organization_id, p.owner_id, p.data_class, p.title, p.subtitle,
           array(select distinct x from unnest(p.tags || p.filed_tags) x order by x), p.updated_at, p.source_kind, p.origin_client, p.match_kind, p.score::real,
           -- The same page marker platform.search_items hands out, for that type's "show all".
           case when p.tcnt > p.lim then 'o:' || p.lim::text end,
           p.tcnt > p.lim
      from page p
     where p.prn <= p.lim
     order by p.entity_token, p.prn
  $q$,
    case when cardinality(v_unres) > 0 then
      'union select a.source_type, a.source_id from platform.associations a
        where a.target_id = any($18) and a.deleted_at is null
       union select a.target_type, a.target_id from platform.associations a
        where a.source_id = any($18) and a.deleted_at is null' else '' end,
    v_cand);

  return query execute v_sql
    using v_q, v_like, v_tsq, v_uid, v_my_orgs, v_global,
          p_types, p_source_kinds, p_origins, p_captured_by, p_date_from, p_date_to,
          coalesce(p_within, '{}'::uuid[]), (p_org_ids is null), 0, 0, 0,
          v_unres, v_scope, v_tokens, v_limits, v_limit;
end
$function$;

CREATE OR REPLACE FUNCTION platform.count_items(p_query text DEFAULT NULL::text, p_types text[] DEFAULT NULL::text[], p_org_ids uuid[] DEFAULT NULL::uuid[], p_within uuid[] DEFAULT NULL::uuid[], p_source_kinds text[] DEFAULT NULL::text[], p_origins text[] DEFAULT NULL::text[], p_captured_by uuid[] DEFAULT NULL::uuid[], p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(entity_token text, count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_uid      uuid := auth.uid();
  v_my_orgs  uuid[];
  v_scope    uuid[];
  v_global   uuid[];
  v_q        text;
  v_words    text[];
  v_tsq      tsquery;
  v_like     text;
  v_textpred text := 'true';
  v_filters  text := '';
  v_within   text := '';
  v_unres    uuid[] := '{}'::uuid[];
  v_fast     text;
  v_fast_own text;
  v_unres_sql text;
  v_gated    text[];
  v_counts   jsonb := '{}'::jsonb;
  v_tok      text;
  v_rel      text;
  v_n        bigint;
  r          record;
  g          record;
  v_where    text;
begin
  if v_uid is null then
    raise exception 'Sign in to search your knowledge.' using errcode = '42501';
  end if;
  v_my_orgs := array(select om.organization_id from iam.organization_member om where om.user_id = v_uid);
  v_scope   := coalesce(p_org_ids, v_my_orgs);
  v_global  := array(select so.organization_id from iam.system_orgs so where so.global_readable);

  -- The typed text, exactly as platform.search_items reads it.
  v_q := nullif(platform.search_normalize(btrim(coalesce(p_query, ''))), '');
  if v_q is not null then
    v_q := left(v_q, 200);
    v_words := array(select w from regexp_split_to_table(v_q, '[^[:alnum:]]+') w where w <> '');
    if cardinality(v_words) > 0 then
      v_tsq := to_tsquery('simple', array_to_string(array(
                 select quote_literal(w) || case when o = cardinality(v_words) then ':*' else '' end
                   from unnest(v_words) with ordinality u(w, o)), ' & '));
    end if;
    v_like := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    if char_length(v_q) >= 3 then
      v_textpred := '(s.title_norm = $1 or s.title_norm like $2'
                    || case when v_tsq is not null then ' or s.title_tsv @@ $3' else '' end
                    || ' or s.title_norm %> $1)';
    elsif char_length(v_q) = 2 then
      v_textpred := '(s.title_norm = $1'
                    || case when v_tsq is not null then ' or s.title_tsv @@ $3' else '' end || ')';
    else
      v_textpred := '(s.title_norm = $1)';
    end if;
  end if;

  if p_types is not null        then v_filters := v_filters || ' and s.entity_token = any($7)'; end if;
  if p_source_kinds is not null then v_filters := v_filters || ' and s.source_kind = any($8)'; end if;
  if p_origins is not null      then v_filters := v_filters || ' and s.origin_client = any($9)'; end if;
  if p_captured_by is not null  then v_filters := v_filters || ' and s.owner_id = any($10)'; end if;
  if p_date_from is not null    then v_filters := v_filters || ' and s.updated_at >= $11'; end if;
  if p_date_to is not null      then v_filters := v_filters || ' and s.updated_at < $12'; end if;
  if p_within is not null then
    v_unres := array(select w from unnest(p_within) w
                      where not exists (select 1 from platform.search_item c where c.entity_id = w));
    v_within := ' and exists (select 1 from within_items wi where wi.t = s.entity_token and wi.i = s.entity_id)';
  end if;

  -- The trusted arms, read off the mirrored columns (the same four platform.search_items applies).
  v_fast := '( (s.owner_id is not distinct from $4 and not s.kernel_only)'
         || ' or (not s.kernel_only and s.row_visibility >= ''internal'''
         || '     and s.data_class in (''confidential'', ''organization'', ''public'') and s.organization_id = any($5))'
         || ' or (not s.kernel_only and s.row_visibility = ''public'' and s.data_class in (''organization'', ''public''))'
         || ' or (not s.kernel_only and s.row_visibility >= ''internal'''
         || '     and s.data_class in (''organization'', ''public'') and s.organization_id = any($6)) )';
  -- 1388: a GATED type (a reference gate, not a detail — thread, war_room) is counted by its own
  -- trusted arms plus one kernel question per DISTINCT anchor record (the set form's gate,
  -- iam.accessible_entity_ids RC-A2c), instead of one kernel call per row: 58 per-row calls were
  -- 211 of admin@admin.com's 250 ms.
  v_fast_own := '( s.owner_id is not distinct from $4'
         || ' or (s.row_visibility >= ''internal'''
         || '     and s.data_class in (''confidential'', ''organization'', ''public'') and s.organization_id = any($5))'
         || ' or (s.row_visibility = ''public'' and s.data_class in (''organization'', ''public''))'
         || ' or (s.row_visibility >= ''internal'''
         || '     and s.data_class in (''organization'', ''public'') and s.organization_id = any($6)) )';
  v_gated := array(select et.token from platform.entity_types et
                    where et.is_active and not platform.token_is_detail(et.token)
                      and exists (select 1 from platform.reference_gate(et.token))
                      and (p_types is null or et.token = any(p_types)));
  v_where := v_textpred || v_filters || v_within
          || ' and not (s.data_class = ''private'' and s.owner_id is distinct from $4)';

  -- Counting is partitioned so no lane walks rows another lane settles (the same candidates the
  -- per-row prefilter of platform.search_items admits, found by index instead of row by row):
  --   fast       the trusted arms, one GROUP BY over (organization_id) INCLUDE lanes (1385)
  --   kernel     rows the arms cannot settle, each asked of iam.has_access_for:
  --              kernel-only / no-visibility rows (partial index, 1385), rows of scope organizations
  --              the caller is not a member of, personal rows carrying a grant/membership/library
  --              grant (hash join to the caller's grant set), and rows shared directly from outside.
  v_unres_sql := case when cardinality(v_unres) > 0 then
      'union select a.source_type, a.source_id from platform.associations a
        where a.target_id = any($16) and a.deleted_at is null
       union select a.target_type, a.target_id from platform.associations a
        where a.source_id = any($16) and a.deleted_at is null' else '' end;
  for r in execute format($q$
    with
    within_containers as materialized (
      select c.entity_token as t, c.entity_id as i from platform.search_item c where c.entity_id = any($13)
    ),
    within_items as materialized (
      select a.source_type as t, a.source_id as i
        from platform.associations a join within_containers w on a.target_type = w.t and a.target_id = w.i
       where a.deleted_at is null
      union
      select a.target_type, a.target_id
        from platform.associations a join within_containers w on a.source_type = w.t and a.source_id = w.i
       where a.deleted_at is null
      %1$s
    ),
    shared_with_me as materialized (
      select p.resource_type as t, p.resource_id as i
        from iam.permissions p
       where $14 and p.granted_to_user_id = $4 and p.status <> 'rejected'
         and (p.expires_at is null or p.expires_at > now())
    ),
    -- Rows shared directly with the caller from outside the scope, found by KEY (one primary-key
    -- probe per grant; LIMIT 1 keeps it a probe) — never by re-running the text scan over the
    -- whole projection and hash-joining the grants onto it.
    shared_items as materialized (
      select s.*
        from shared_with_me sw
        cross join lateral (select s.* from platform.search_item s
                             where s.entity_token = sw.t and s.entity_id = sw.i limit 1) s
       where s.organization_id <> all($15)
          -- T-13 5fu2: a Private record shared with the caller is a candidate wherever it lives.
          or (s.data_class = 'private' and s.owner_id is distinct from $4)
    ),
    granted as materialized (
      select p.resource_type as t, p.resource_id as i
        from iam.permissions p
       where p.status <> 'rejected' and (p.expires_at is null or p.expires_at > now())
         and (p.granted_to_user_id = $4 or p.granted_to_organization_id = any($5))
      union
      select m.container_type, m.container_id from iam.memberships m where m.user_id = $4 and m.deleted_at is null
      union
      select g.entity_type, g.entity_id from platform.entity_grants g
    ),
    hits as materialized (
      select s.entity_token, s.entity_id, s.organization_id, s.owner_id, s.row_visibility, s.data_class,
             s.kernel_only
        from platform.search_item s
       where s.organization_id = any($15) and %2$s
    ),
    fast as (
      select s.entity_token, count(*) as n
        from hits s
       where %3$s
       group by s.entity_token
    ),
    shared_rows as materialized (
      select s.entity_token, s.entity_id, (%3$s) as is_fast, s.data_class
        from shared_items s
       where %5$s
    ),
    kcand as materialized (
      select s.entity_token, s.entity_id
        from hits s
       where (s.kernel_only or s.row_visibility is null)
         and s.data_class <> 'private' and not %3$s
         and not (s.entity_token = any($18) and %4$s)
      union
      select s.entity_token, s.entity_id
        from hits s
       where s.organization_id = any($17) and s.data_class <> 'private' and not %3$s
      union
      select s.entity_token, s.entity_id
        from granted g
        join hits s on s.entity_id = g.i and s.entity_token = g.t
       where s.data_class <> 'private' and not %3$s
      union
      select r.entity_token, r.entity_id from shared_rows r where not r.is_fast  -- Private shares: the kernel decides (T-13 5fu2)
    ),
    kernel as (
      select k.entity_token, count(*) as n
        from kcand k
       where iam.has_access_for($4, k.entity_token, k.entity_id, 'viewer'::public.permission_level)
       group by k.entity_token
    ),
    visible as (
      select f.entity_token, f.n from fast f
      union all
      select r.entity_token, count(*) from shared_rows r where r.is_fast group by r.entity_token
      union all
      select k.entity_token, k.n from kernel k
    )
    select v.entity_token, sum(v.n)::bigint as n from visible v group by v.entity_token
  $q$,
    v_unres_sql, v_where, v_fast, v_fast_own, v_textpred || v_filters || v_within)
  using v_q, v_like, v_tsq, v_uid, v_my_orgs, v_global,
        p_types, p_source_kinds, p_origins, p_captured_by, p_date_from, p_date_to,
        coalesce(p_within, '{}'::uuid[]), (p_org_ids is null), v_scope, v_unres,
        array(select o from unnest(v_scope) o where o <> all(v_my_orgs)), v_gated
  loop
    v_counts := v_counts || jsonb_build_object(r.entity_token, coalesce((v_counts ->> r.entity_token)::bigint, 0) + r.n);
  end loop;

  -- The gated lane: own arms, then the gate asked once per distinct anchor.
  foreach v_tok in array v_gated loop
    for g in select * from platform.reference_gate(v_tok) loop
      select format('%I.%I', et.schema_name, et.table_name) into v_rel
        from platform.entity_types et where et.token = v_tok;
      execute format($g$
        with
        within_containers as materialized (
          select c.entity_token as t, c.entity_id as i from platform.search_item c where c.entity_id = any($13)
        ),
        within_items as materialized (
          select a.source_type as t, a.source_id as i
            from platform.associations a join within_containers w on a.target_type = w.t and a.target_id = w.i
           where a.deleted_at is null
          union
          select a.target_type, a.target_id
            from platform.associations a join within_containers w on a.source_type = w.t and a.source_id = w.i
           where a.deleted_at is null
          %6$s
        ),
        gated_rows as materialized (
          select t.%4$I as gt, t.%5$I as gi
            from platform.search_item s join %3$s t on t.id = s.entity_id
           where s.organization_id = any($15) and s.entity_token = $19 and %1$s
             and s.data_class <> 'private' and %2$s
        ),
        anchors_ok as materialized (
          select a.gt, a.gi from (select distinct gt, gi from gated_rows where gt is not null and gi is not null) a
           where iam.has_access_for($4, a.gt, a.gi, 'viewer'::public.permission_level)
        )
        select count(*) from gated_rows r
         where r.gt is null or r.gi is null
            or exists (select 1 from anchors_ok k where k.gt = r.gt and k.gi = r.gi)
      $g$, v_where, v_fast_own, v_rel, g.type_column, g.id_column, v_unres_sql)
      into v_n
      using v_q, v_like, v_tsq, v_uid, v_my_orgs, v_global,
            p_types, p_source_kinds, p_origins, p_captured_by, p_date_from, p_date_to,
            coalesce(p_within, '{}'::uuid[]), (p_org_ids is null), v_scope, v_unres,
            array(select o from unnest(v_scope) o where o <> all(v_my_orgs)), v_gated, v_tok;
      if v_n > 0 then
        v_counts := v_counts || jsonb_build_object(v_tok, coalesce((v_counts ->> v_tok)::bigint, 0) + v_n);
      end if;
    end loop;
  end loop;

  return query select k, v::bigint from jsonb_each_text(v_counts) as e(k, v) order by 1;
end
$function$;
