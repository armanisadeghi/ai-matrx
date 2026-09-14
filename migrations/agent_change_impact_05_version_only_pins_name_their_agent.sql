-- agent_change_impact_05_version_only_pins_name_their_agent.sql
-- A PIN NAMES ITS AGENT (Agent Change Impact, R36 follow-up, 2026-09-14).
--
-- THE DEFECT
-- ----------
-- 36 live `mandate.definition` rows (all `default_holder_type = 'agent'`, all code-declared,
-- all system-homed) carried `default_holder_version_id` with `default_holder_id` NULL — pinned
-- by version alone. The boot sync wrote them from declarations that name only
-- `seed_version_id` (`sync_declared_mandates`, INSERT path); the server door
-- `set_default_holder` already derives the id and never produced one. The I2 reverse lookup
-- joins `mandate.definition` on `default_holder_id = agent`, so those rows produced NO rung, the
-- impact read returned NO verdict, and 30 of the 71 behind-latest rows on the standing table read
-- "Not graded". The binding twin was fixed in the writer on 2026-09-14 (aidream 03cc2d114) and
-- counts 0 live rows; this is the definition half plus the read path.
--
-- WHAT THIS SHIPS
-- ---------------
-- 1. BACKFILL: `default_holder_id := agent.definition_version.agent_id` for every live definition
--    and binding row pinned by version alone. Asserted: none remain afterwards. Every one of the
--    36 passes `mandate.guard_definition_holder` (all runnable builtins — measured before writing);
--    `clear_mandate_fallback_on_default_change` sees a holder-identity change (NULL -> id) and
--    clears `fallback_mandate_key`, which is NULL on all 36 (measured), so nothing is lost.
-- 2. THE READ PATH: `public.agent_mandate_rungs` resolves a rung's agent as
--    `coalesce(holder_id, <pinned version>.agent_id)` for both rung tables, so a version-only
--    pin written by any future path is still seen and still graded.
-- 3. The writer fix (aidream `sync_declared_mandates` derives the id from the version) and the
--    guard `pnpm check:mandate-pin-names-agent[:strict]` ship beside this file.
--
-- based-on: public.agent_mandate_rungs(uuid[], boolean, uuid, integer) f678fd589c0540781e7203785f495f9145ddde3a3ff651ee52e53fbe3fa9fe82

-- ── 1. Backfill ──────────────────────────────────────────────────────────────
do $$
declare
  v_defs  integer;
  v_binds integer;
  v_left  integer;
begin
  update mandate.definition m
     set default_holder_id = v.agent_id
    from agent.definition_version v
   where v.id = m.default_holder_version_id
     and m.deleted_at is null
     and m.default_holder_type = 'agent'
     and m.default_holder_id is null;
  get diagnostics v_defs = row_count;

  update mandate.binding b
     set holder_id = v.agent_id
    from agent.definition_version v
   where v.id = b.holder_version_id
     and b.deleted_at is null
     and b.holder_type = 'agent'
     and b.holder_id is null;
  get diagnostics v_binds = row_count;

  select count(*) into v_left from (
    select 1 from mandate.definition m
     where m.deleted_at is null and m.default_holder_type = 'agent'
       and m.default_holder_version_id is not null and m.default_holder_id is null
    union all
    select 1 from mandate.binding b
     where b.deleted_at is null and b.holder_type = 'agent'
       and b.holder_version_id is not null and b.holder_id is null
  ) x;
  if v_left <> 0 then
    raise exception 'agent_change_impact_05: % version-only pins still name no agent after the backfill', v_left;
  end if;
  raise notice 'agent_change_impact_05: backfilled % definition(s) and % binding(s); 0 version-only pins remain', v_defs, v_binds;
end
$$;

-- ── 2. The read path derives the agent through the pinned version ────────────
CREATE OR REPLACE FUNCTION public.agent_mandate_rungs(p_agent_ids uuid[], p_include_descendants boolean DEFAULT true, p_as_user uuid DEFAULT NULL::uuid, p_max_depth integer DEFAULT 16)
 RETURNS TABLE(root_agent_id uuid, holder_kind text, row_id uuid, mandate_id uuid, mandate_key text, holder_type text, holder_agent_id uuid, holder_agent_name text, principal_kind text, organization_id uuid, subject_user_id uuid, pinned_version_id uuid, lineage_depth integer, lineage_path jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'mandate', 'agent', 'iam', 'platform'
AS $function$
declare
  v_uid    uuid;
  v_claims jsonb;
begin
  if p_agent_ids is null or cardinality(p_agent_ids) = 0 then
    return;
  end if;

  -- Bounded input. A caller that wants the whole estate is asking a different question and should
  -- say so as its own item, not smuggle it through a 10,000-element array.
  if cardinality(p_agent_ids) > 500 then
    raise exception
      'public.agent_mandate_rungs: % agent ids requested; the cap is 500. Remedy: page the list.',
      cardinality(p_agent_ids)
      using errcode = '22023';
  end if;

  if p_max_depth is null or p_max_depth < 0 or p_max_depth > 64 then
    raise exception
      'public.agent_mandate_rungs: p_max_depth must be between 0 and 64 (got %).', p_max_depth
      using errcode = '22023';
  end if;

  -- ── Who is asking (R26) ────────────────────────────────────────────────────
  v_uid := auth.uid();
  if v_uid is null then
    v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    -- Claims present but not the service role = an `anon` PostgREST request. Refuse.
    if v_claims is not null and coalesce(v_claims ->> 'role', '') <> 'service_role' then
      raise exception
        'public.agent_mandate_rungs: no signed-in caller. Every row is scoped per-caller, so there '
        'is no anonymous answer. Remedy: call it from a signed-in session.'
        using errcode = '28000';
    end if;
    -- No claims at all = a direct database connection (aidream's pool, psql), or the service role.
    -- Both must name the person the read answers for; neither gets an unscoped sweep.
    if p_as_user is null then
      raise exception
        'public.agent_mandate_rungs: p_as_user is required when there is no signed-in caller — '
        'every row is scoped per-caller (R26, Agent Change Impact). Remedy: pass the id of the '
        'user this read answers for.'
        using errcode = '22023';
    end if;
    v_uid := p_as_user;
  end if;

  return query
  with recursive lineage as (
    -- The edited agents themselves.
    select
      a.id                as agent_id,
      a.name              as agent_name,
      a.id                as root_id,
      0                   as depth,
      array[a.id]         as visited,
      jsonb_build_array(jsonb_build_object(
        'agentId', a.id, 'agentName', a.name, 'relation', 'self'
      ))                  as path
    from agent.definition a
    where a.id = any(p_agent_ids)
      and a.deleted_at is null

    union all

    -- …and everything transitively duplicated from them. `c.source_agent_id` is a single parent,
    -- so this is a forest, not a DAG: no row is reached twice under one root. The visited guard is
    -- for a future cycle, not for today's data.
    select
      c.id,
      c.name,
      l.root_id,
      l.depth + 1,
      l.visited || c.id,
      l.path || jsonb_build_object(
        'agentId', c.id, 'agentName', c.name, 'relation', 'duplicated_from'
      )
    from lineage l
    join agent.definition c on c.source_agent_id = l.agent_id
    where p_include_descendants
      and c.deleted_at is null
      and l.depth < p_max_depth
      and not (c.id = any(l.visited))
  ),
  -- MATERIALIZED is a deliberate optimisation fence: it makes it impossible for any future plan to
  -- evaluate the COST 10000 `has_access_for` against more rows than the lineage walk matched.
  -- It costs nothing measurable today (see the R20 note in this file's header). Keep it.
  matched as materialized (
    select
      l.root_id                                              as root_agent_id,
      'mandate_default'::text                                as holder_kind,
      'mandate'::text                                        as access_token,
      d.id                                                   as row_id,
      d.id                                                   as mandate_id,
      d.mandate_key                                          as mandate_key,
      d.default_holder_type                                  as holder_type,
      coalesce(d.default_holder_id, dv.agent_id)             as holder_agent_id,
      l.agent_name                                           as holder_agent_name,
      'org'::text                                            as principal_kind,
      d.organization_id                                      as organization_id,
      null::uuid                                             as subject_user_id,
      d.default_holder_version_id                            as pinned_version_id,
      l.depth                                                as lineage_depth,
      l.path                                                 as lineage_path
    from lineage l
    -- A version-only pin (default_holder_id NULL, default_holder_version_id set) names its agent
    -- THROUGH the version. 36 live definitions were stored that way and got no verdict (2026-09-14).
    join mandate.definition d
      left join agent.definition_version dv on dv.id = d.default_holder_version_id
      on l.agent_id = coalesce(d.default_holder_id, dv.agent_id)
    where d.deleted_at is null

    union all

    select
      l.root_id,
      'binding'::text,
      'mandate_binding'::text,
      b.id,
      b.mandate_id,
      md.mandate_key,
      b.holder_type,
      coalesce(b.holder_id, bv.agent_id),
      l.agent_name,
      b.principal_type,
      b.organization_id,
      b.subject_user_id,
      b.holder_version_id,
      l.depth,
      l.path
    from lineage l
    join mandate.binding b
      left join agent.definition_version bv on bv.id = b.holder_version_id
      on l.agent_id = coalesce(b.holder_id, bv.agent_id)
    left join mandate.definition md on md.id = b.mandate_id
    where b.deleted_at is null
  )
  select
    m.root_agent_id,
    m.holder_kind,
    m.row_id,
    m.mandate_id,
    m.mandate_key,
    m.holder_type,
    m.holder_agent_id,
    m.holder_agent_name,
    m.principal_kind,
    m.organization_id,
    m.subject_user_id,
    m.pinned_version_id,
    m.lineage_depth,
    m.lineage_path
  from matched m
  where iam.has_access_for(v_uid, m.access_token, m.row_id, 'viewer'::public.permission_level)
  order by m.lineage_depth, m.mandate_key, m.holder_kind, m.row_id;
end;
$function$;
