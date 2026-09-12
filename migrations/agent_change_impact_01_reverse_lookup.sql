-- agent_change_impact_01_reverse_lookup.sql
-- I2 — THE REVERSE LOOKUP (Agent Change Impact campaign, common-docs/projects/agent-change-impact/).
--
-- THE QUESTION NOBODY COULD ASK
-- -----------------------------
-- Arman, 2026-09-11 (MANDATE.md § Lineage):
--   "I might have one of my own agents that's then duplicated to create a system agent. And while
--    my agent is not used in a mandate, the system agent is... 'hey, you're updating an agent that
--    has a duplicate that was created of it a month ago. You may wanna update that too. Oh, and by
--    the way, that one's used in a mandate.'"
--
-- Discovery (A-own-system.md § Gaps 1 and 7) found nothing anywhere answers it: no aidream
-- endpoint, no DB function, no frontend service. Every mandate door is keyed by `mandate_key`.
-- The only lineage that exists is `selectAgentLineageIndex`, which walks ONE generation of the
-- agents already loaded into Redux under the caller's RLS — not a recursive descendant walk.
--
-- The scenario is not hypothetical. Verified live, 2026-09-12:
--   "Basic Image Generator"  fc20fe69-32c2-49b4-8bb7-1dc6c6325d6b   holds 0 rungs itself
--     └─ duplicated into "Matrx Image Ultra"  f5d213aa-…            holds 162 rungs
--          └─ duplicated into "Matrx Image Ultra"  bcc69216-…       holds 6 rungs
-- Editing the top agent today shows the editor nothing. After this function it reaches all 168.
-- Live population: 1,118 agents, 179 with a `source_agent_id`; the duplication forest is 4 deep
-- and acyclic today (measured), which is exactly why a one-generation client-side index misses.
--
-- WHAT THIS SHIPS
-- ---------------
-- `public.agent_mandate_rungs(uuid[], boolean, uuid, integer)` — one row per mandate RUNG held by
-- any of the given agents or by any agent transitively duplicated from them. Both rung tables:
--   * `mandate.definition`  — the DEFAULT rung (`default_holder_*`)            -> 'mandate_default'
--   * `mandate.binding`     — a principal's rung (`holder_*`)                  -> 'binding'
-- Each row carries the holder, the principal, the pinned version id, and the LINEAGE PATH — the
-- full chain of `{agentId, agentName, relation}` steps from the edited agent to the holder, not a
-- depth. `ImpactVerdict.lineagePath` (CONTRACT.md, frozen sha256 b5181e13…) needs the path.
--
-- R26 — SCOPING IS PART OF THE FUNCTION, NOT THE CALLER
-- ----------------------------------------------------
-- SECURITY DEFINER, and every returned row passes `iam.has_access_for(<caller>, <token>, id,
-- 'viewer')`. It answers ONLY about mandates the caller can already see. The badge COUNT the
-- post-edit panel renders is `count(*)` over this same door, because a count leaks existence
-- exactly as a list does.
--
-- There is NO unscoped lane. `auth.uid()` is the caller when a signed-in client calls it. A
-- caller with no `auth.uid()` (aidream's own pooled connection; a service-role PostgREST request)
-- MUST pass `p_as_user` — the function RAISES with the remedy rather than quietly answering for
-- everyone (nothing fails silently). `p_as_user` is IGNORED when there is a signed-in caller, so
-- it is not an impersonation door for a browser client.
--
-- KNOWN AND DELIBERATE — for I1/I4, not decided here: a super-admin reading the standing table
-- (I4) sees only what `iam.has_access` admits for them, so the 179 `principal_type='user'`
-- bindings owned by other people do NOT appear. R26 binds the authenticated half and this
-- function implements it literally. If I4's personal-rung requirement (I12) needs a wider admin
-- lane, that is an amendment to R26, not a silent widening here.
--
-- R20 — BOUNDED AND INDEX-BACKED
-- ------------------------------
-- The worked warning is aidream `9ce1ff9f1`: a per-request whole-table read of `mandate.reference`
-- (391,840 rows, 8.4 s, ~300 MB) froze the serving loop and made an unrelated sandbox change-feed
-- poll miss its deadline 78 times while that poll's own SQL averaged 0 ms. So:
--   * ONE query. No N+1, no per-mandate round trip, no ORM instance per row.
--   * The descendant walk rides `agent.definition (source_agent_id)`, which already exists.
--   * The two rung lookups get the partial indexes below — neither existed before this file.
--   * `matched` is `AS MATERIALIZED` on purpose, as PREVENTION — and the honest measurement is
--     that today it changes nothing. Measured 2026-09-12 on the worst real agent (171 rungs), both
--     spellings produce the same plan shape and the same work: MATERIALIZED 36.8 ms / 1,921 shared
--     buffer hits, NOT MATERIALIZED 35.5 ms / 1,877, and in both the access filter runs against
--     exactly the 171 matched rungs. What the fence buys is a GUARANTEE for a shape that has not
--     happened yet: with the CTE inlined the planner is free to push a COST 10000 `has_access_for`
--     into a Seq Scan of `mandate.definition` and evaluate it against every live mandate (690
--     today) before the lineage join ever narrows it. That pushdown is the N+1 R20 forbids, and
--     one keyword closes it for every future plan. Do not remove it on the grounds that it is
--     currently free; that IS the point.
--   * `p_max_depth` (default 16) and a visited-id guard bound the recursion even if a future
--     `source_agent_id` cycle appears. Measured today: max depth 4, zero cycles.
--
-- HONEST ABOUT WHAT IS NOT AN AGENT
-- ---------------------------------
-- `holder_type` is returned VERBATIM ('agent', 'workflow', …) and nothing is dropped for being the
-- wrong kind. I1 maps a non-agent holder to `blocker = "unsupported_holder"`. Likewise
-- `principal_kind` is the raw `principal_type`, which on live data takes THREE values —
-- 'org' (126), 'user' (180) and 'global' (2) — while CONTRACT.md's `ImpactVerdict.principal.kind`
-- admits only "org" | "user". The two global bindings are REAL and are returned. Mapping them is
-- I1's decision and needs a contract amendment; this function does not lie about the data to fit
-- a type. Flagged in the I2 report, 2026-09-12.
--
-- Soft-deleted rows are excluded on both rung tables and on the agent walk (live count of rungs
-- held by a soft-deleted agent: 0).
--
-- Idempotent. Safe to re-run.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The two indexes the reverse direction needs (R20).
-- ─────────────────────────────────────────────────────────────────────────────
-- Both tables are indexed FORWARD (by mandate_id, by organization_id) and not one index anywhere
-- goes agent -> rung, because until now nothing asked the question. Partial on `deleted_at IS
-- NULL` because every read here is a live read. Not CONCURRENTLY: `mandate.definition` is 760 rows
-- and `mandate.binding` is 308, the build is sub-millisecond, and `pnpm db:apply` refuses an
-- autocommit statement by name.
create index if not exists definition_default_holder_id_idx
  on mandate.definition (default_holder_id)
  where deleted_at is null and default_holder_id is not null;

create index if not exists binding_holder_id_idx
  on mandate.binding (holder_id)
  where deleted_at is null and holder_id is not null;

comment on index mandate.definition_default_holder_id_idx is
  'Reverse lookup agent -> default rung, for public.agent_mandate_rungs (I2, Agent Change Impact). '
  'Every other index on this table points forward from the mandate.';
comment on index mandate.binding_holder_id_idx is
  'Reverse lookup agent -> binding rung, for public.agent_mandate_rungs (I2, Agent Change Impact).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. The door.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.agent_mandate_rungs(
  p_agent_ids           uuid[],
  p_include_descendants boolean default true,
  p_as_user             uuid    default null,
  p_max_depth           integer default 16
)
returns table (
  root_agent_id        uuid,
  holder_kind          text,
  row_id               uuid,
  mandate_id           uuid,
  mandate_key          text,
  holder_type          text,
  holder_agent_id      uuid,
  holder_agent_name    text,
  principal_kind       text,
  organization_id      uuid,
  subject_user_id      uuid,
  pinned_version_id    uuid,
  lineage_depth        integer,
  lineage_path         jsonb
)
language plpgsql
stable
security definer
set search_path to 'public', 'mandate', 'agent', 'iam', 'platform'
as $$
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
      d.default_holder_id                                    as holder_agent_id,
      l.agent_name                                           as holder_agent_name,
      'org'::text                                            as principal_kind,
      d.organization_id                                      as organization_id,
      null::uuid                                             as subject_user_id,
      d.default_holder_version_id                            as pinned_version_id,
      l.depth                                                as lineage_depth,
      l.path                                                 as lineage_path
    from lineage l
    join mandate.definition d on d.default_holder_id = l.agent_id
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
      b.holder_id,
      l.agent_name,
      b.principal_type,
      b.organization_id,
      b.subject_user_id,
      b.holder_version_id,
      l.depth,
      l.path
    from lineage l
    join mandate.binding b on b.holder_id = l.agent_id
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
$$;

comment on function public.agent_mandate_rungs(uuid[], boolean, uuid, integer) is
  'THE REVERSE LOOKUP (I2, Agent Change Impact). Given agent ids, returns every mandate rung — '
  'mandate.definition default rungs AND mandate.binding rungs — held by those agents or by any '
  'agent transitively duplicated from them (agent.definition.source_agent_id), each carrying the '
  'holder, the principal, the pinned version id and the full lineage path of '
  '{agentId, agentName, relation} steps. Feeds ImpactVerdict.lineagePath / .principal. '
  'SECURITY DEFINER; every row passes iam.has_access_for(caller, token, id, viewer), so it answers '
  'only about mandates the caller can already see and the badge COUNT uses the same door (R26). '
  'A caller with no auth.uid() must pass p_as_user; there is no unscoped lane. '
  'holder_type and principal_kind are returned verbatim — a non-agent holder is reported, never '
  'dropped. Bounded and index-backed (R20): one query, no N+1.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. The client-callable door row — BEFORE the GRANT.
-- ─────────────────────────────────────────────────────────────────────────────
-- db-rules §6d-4: a new client-callable SECURITY DEFINER function needs its `client_callable_door`
-- row in the same migration and before the GRANT, or the DB-wide guard revokes the client EXECUTE
-- from inside the GRANT itself.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, declared_by, reason)
values
  ('public', 'agent_mandate_rungs',
   'p_agent_ids uuid[], p_include_descendants boolean, p_as_user uuid, p_max_depth integer',
   'agent_change_impact_01',
   'The agent -> mandate-rung reverse lookup behind the post-edit impact panel and its badge '
   'count (Agent Change Impact I2). Scoping is inside: SECURITY DEFINER with a per-row '
   'iam.has_access_for check for the calling user, so it answers only about mandates that caller '
   'can already see (R26). p_as_user is ignored for a signed-in caller and required for one with '
   'no auth.uid(); there is no unscoped lane.')
on conflict (schema_name, function_name, identity_args) do update
  set declared_by = excluded.declared_by,
      reason      = excluded.reason,
      declared_at = now();

revoke all on function public.agent_mandate_rungs(uuid[], boolean, uuid, integer) from public;
revoke all on function public.agent_mandate_rungs(uuid[], boolean, uuid, integer) from anon;
grant execute on function public.agent_mandate_rungs(uuid[], boolean, uuid, integer)
  to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Assertions — this file proves what it claims rather than assuming it.
-- ─────────────────────────────────────────────────────────────────────────────
do $verify$
declare
  v_ok boolean;
  v_n  integer;
  v_total integer;
begin
  -- (a) The grant survived the definer guard (this is what the door row buys).
  select has_function_privilege('authenticated',
           'public.agent_mandate_rungs(uuid[], boolean, uuid, integer)', 'execute')
    into v_ok;
  if not v_ok then
    raise exception 'agent_change_impact_01: authenticated lost EXECUTE — the door row did not take.';
  end if;

  select has_function_privilege('anon',
           'public.agent_mandate_rungs(uuid[], boolean, uuid, integer)', 'execute')
    into v_ok;
  if v_ok then
    raise exception 'agent_change_impact_01: anon holds EXECUTE; this door is never anonymous.';
  end if;

  -- (b) Both indexes exist.
  select count(*) into v_n from pg_indexes
   where (schemaname, indexname) in (('mandate', 'definition_default_holder_id_idx'),
                                     ('mandate', 'binding_holder_id_idx'));
  if v_n <> 2 then
    raise exception 'agent_change_impact_01: expected 2 reverse-lookup indexes, found %.', v_n;
  end if;

  -- (c) THE SCOPING IS REAL, and it is the PLATFORM's scoping, not a second opinion.
  --
  --     This assertion was written as "a stranger sees zero rungs" and it FAILED on the first
  --     apply, reading 6. That was the assertion being wrong, not the function: of the 168 rungs
  --     under `Basic Image Generator`, six mandates (chat.quick_image, education.card_image_
  --     generator, marketing.page_image, podcast.image_v3 / _v5 / _v6_feature) carry
  --     `visibility = 'public'`, and `iam.has_access_for_base` admits a public row to anyone
  --     signed in — deliberately. Asserting zero would have meant asking this door to be STRICTER
  --     than the platform resolver, which db-rules §6 names as its own defect class.
  --
  --     So the real invariant: a caller with no access reads PUBLIC rows and nothing else. Every
  --     non-public rung must be filtered out.
  select count(*) into v_n
    from public.agent_mandate_rungs(
           array['fc20fe69-32c2-49b4-8bb7-1dc6c6325d6b']::uuid[],
           true,
           '00000000-0000-0000-0000-0000000000ff'::uuid) g
    left join mandate.definition d on g.holder_kind = 'mandate_default' and d.id = g.row_id
    left join mandate.binding    b on g.holder_kind = 'binding'         and b.id = g.row_id
   where coalesce(d.visibility, b.visibility) is distinct from 'public'::platform.visibility;
  if v_n <> 0 then
    raise exception
      'agent_change_impact_01: a caller with no access read % NON-PUBLIC rungs. The per-row scope '
      'is broken.', v_n;
  end if;

  -- (c2) …and the filter must actually REMOVE rows, or (c) would pass on an empty result set.
  select count(*) into v_n
    from public.agent_mandate_rungs(
           array['fc20fe69-32c2-49b4-8bb7-1dc6c6325d6b']::uuid[],
           true,
           '00000000-0000-0000-0000-0000000000ff'::uuid);
  select count(*) into v_total
    from (
      select d.id from mandate.definition d
       where d.deleted_at is null
         and d.default_holder_id in ('f5d213aa-4b98-49eb-9fb3-d93172e68453',
                                     'bcc69216-d4fa-4e28-a090-8a7749123bc5')
      union all
      select b.id from mandate.binding b
       where b.deleted_at is null
         and b.holder_id in ('f5d213aa-4b98-49eb-9fb3-d93172e68453',
                             'bcc69216-d4fa-4e28-a090-8a7749123bc5')
    ) s;
  if v_n >= v_total then
    raise exception
      'agent_change_impact_01: a caller with no access read % of % rungs — the scope filter removed '
      'nothing.', v_n, v_total;
  end if;

  -- (d) An agent with no lineage and no rungs returns zero rows rather than erroring.
  select count(*) into v_n
    from public.agent_mandate_rungs(
           array['00000000-0000-0000-0000-000000000000']::uuid[], true,
           '00000000-0000-0000-0000-0000000000ff'::uuid);
  if v_n <> 0 then
    raise exception 'agent_change_impact_01: unknown agent id returned % rows.', v_n;
  end if;

  -- (e) No unscoped lane: a connection with no auth.uid() and no p_as_user is refused.
  begin
    perform * from public.agent_mandate_rungs(
      array['fc20fe69-32c2-49b4-8bb7-1dc6c6325d6b']::uuid[], true, null);
    raise exception 'agent_change_impact_01: an unscoped call succeeded. R26 is not enforced.';
  exception
    when invalid_parameter_value then null;   -- 22023, the intended refusal
  end;
end;
$verify$;
