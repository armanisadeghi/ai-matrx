-- KI-044 — AUTONOMY MODES, OBEYED.
--
-- `seo_ai_autonomy_modes.sql` built the LADDER: every AI step in Keyword
-- Intelligence declares a mode, the mode overrides down platform → org → brand
-- → site, and one editor screen writes it. What it did NOT build was obedience:
-- only `meaning_suggestions` ever consulted its setting, and the registry said
-- so out loud (`enforced = false`, "Recorded, not yet obeyed").
--
-- This migration is the obedience. Four more capabilities — the classifier, the
-- topic assigner, place detection and the matcher engine — now read the ladder
-- before acting.
--
-- 🚨 THE FAILURE THIS CLOSES IS SILENT GUESSING. A runner that cannot work out
-- which mode it is in must REFUSE and say why. Defaulting to "apply" is exactly
-- the behaviour the item exists to remove: a control that governs nothing while
-- looking like it governs everything. `seo.fn_autonomy_gate` therefore RAISES on
-- an unknown capability and on a site that does not exist, and never invents a
-- mode.
--
-- ── THE FIFTH MODE: `off` ───────────────────────────────────────────────────
-- The policy shipped four modes and closed the list ("new modes are added to
-- this document first, then implemented"). Arman amended it on 2026-08-25 with a
-- fifth — OFF: the step does not run at all, and says so where a human can see
-- it. /policies/human-in-the-loop-autonomy-modes.md carries the amendment; this
-- migration implements it.
--
-- ── WHAT EACH MODE MEANS TO A RUNNER ────────────────────────────────────────
--   auto_platform / auto_org  → `apply`        run and write, as before
--   review_timeout            → `propose`      write PROPOSALS; separately apply
--                                              the ones nobody answered in time
--   review_required           → `propose_only` write proposals, apply nothing
--   off                       → `off`          do not run; report the refusal
--
-- ── THE PROPOSALS GO TO THE QUEUE THAT ALREADY EXISTS ───────────────────────
-- `seo.keyword_meaning_suggest` → `platform.assists` → the Approvals console.
-- There is no second queue and there is no second write path: the timeout pass
-- replays the SAME RPCs a person clicking Approve replays
-- (`features/marketing/seo/value-system/suggestions/apply.ts` is the human half
-- of the identical contract).
--
-- ── THE SITE-LESS RUNNERS ───────────────────────────────────────────────────
-- The classifier and place-detection NIGHTLIES walk the shared keyword
-- dictionary; they have no site, and a per-site setting cannot govern a write
-- every tenant shares. They therefore resolve at the PLATFORM rung
-- (`seo.fn_autonomy_gate(NULL, capability)`), which is the only rung whose scope
-- matches theirs. A review mode at the platform rung has no reviewer queue to
-- address, so those passes STOP and name the reason rather than applying — the
-- safe direction, and visible. Their per-site callers (a site's Classify-next
-- strip, a site's place-detection strip) resolve at that site as usual.
--
-- Idempotent: CREATE OR REPLACE, additive knobs, guarded constraint swap.

-- ───────────────────────── 1. the fifth mode ─────────────────────────

alter table seo.ai_capability drop constraint if exists ai_capability_default_mode_check;
alter table seo.ai_capability
  add constraint ai_capability_default_mode_check
  check (default_mode in ('auto_platform','auto_org','review_timeout','review_required','off'));

-- ───────────────────────── 2. the ceilings, as knobs ─────────────────────────

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, label, description, set_by, basis, review_due)
values
  ('seo.ai_autonomy', 'proposal_keyword_cap', to_jsonb(500), to_jsonb(500), 'integer',
   'Keywords carried by one proposal',
   'How many keyword ids a single "this is what I would stamp" proposal carries. Beyond it the proposal names the total and carries the highest-demand slice.',
   'agent',
   'A proposal card has to be readable and its payload has to fit a jsonb column a reviewer will scroll. The largest situational segment measured live is All Green Recycling at 27,234 keywords (2026-08-23) — a proposal carrying that is not a review, it is a data dump. 500 is roughly the size of a full afternoon of human spot-checking and keeps the assist row under ~20 KB. The proposal always reports the true total, so the cap can never masquerade as the whole segment.',
   (now() + interval '90 days')::date),
  ('seo.ai_autonomy', 'timeout_apply_cap', to_jsonb(200), to_jsonb(200), 'integer',
   'Proposals auto-applied by one timeout pass',
   'How many timed-out proposals one bounded pass applies before stopping. What it does not reach stays pending for the next pass.',
   'agent',
   'The timeout pass rides an engine run, so it must fit inside that run without turning a bounded pass into an unbounded one. Applying a stamp proposal is one keyword_facet_set call per proposal (~0.32 ms/row write, measured 2026-08-23) and real sites carry single-digit pending proposals today, so 200 is far above live volume while still bounding a pathological backlog. Raise it only after measuring a real backlog drain.',
   (now() + interval '90 days')::date)
on conflict (feature, key) do nothing;

-- ───────────────────────── 3. THE GATE ─────────────────────────

create or replace function seo.fn_autonomy_gate(
  p_site_id uuid,
  p_capability text
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'seo', 'web', 'platform', 'public', 'pg_temp'
as $fn$
declare
  v_cap    record;
  v_ladder jsonb;
  v_mode   text;
begin
  select * into v_cap from seo.ai_capability where slug = p_capability;
  if not found then
    -- A runner naming a capability that does not exist cannot know its mode.
    -- Refusing loudly is the whole point of this item.
    raise exception 'seo_autonomy_unknown_capability: there is no AI step named "%" — a runner that cannot determine its mode must not act',
      coalesce(p_capability, 'null');
  end if;

  if p_site_id is not null
     and not exists (select 1 from web.site s where s.id = p_site_id and s.deleted_at is null) then
    raise exception 'seo_autonomy_unknown_site: no live site % to resolve the autonomy ladder against', p_site_id
      using errcode = 'P0002';
  end if;

  v_ladder := seo.fn_ai_autonomy(p_site_id, p_capability);
  v_mode   := v_ladder ->> 'mode';
  if v_mode is null then
    raise exception 'seo_autonomy_indeterminate: the ladder returned no mode for "%" — refusing rather than guessing', p_capability;
  end if;

  return v_ladder || jsonb_build_object(
    'decision', case v_mode
                  when 'auto_platform'   then 'apply'
                  when 'auto_org'        then 'apply'
                  when 'review_timeout'  then 'propose'
                  when 'review_required' then 'propose_only'
                  when 'off'             then 'off'
                  -- Unreachable while the CHECK holds; if it ever is reached the
                  -- honest answer is "do nothing", never "apply".
                  else 'off'
                end,
    'label', v_cap.label,
    'scope', case when p_site_id is null then 'platform' else 'site' end,
    -- The sentence a surface shows a human when the runner declines to act.
    'refusal', case v_mode
                 when 'off' then
                   v_cap.label || ' is turned off for this scope, so nothing ran. '
                   || 'Change it under How much the AI may do on its own.'
                 when 'review_required' then
                   v_cap.label || ' may not apply anything without you — what it found is waiting in Approvals.'
                 when 'review_timeout' then
                   v_cap.label || ' put what it found in Approvals; it applies on its own if nobody answers in '
                   || coalesce((v_ladder ->> 'timeout_hours'), '?') || ' hours.'
                 else null
               end);
end;
$fn$;

comment on function seo.fn_autonomy_gate(uuid, text) is
  'THE autonomy decision every AI runner reads before acting (KI-044). Wraps seo.fn_ai_autonomy '
  '(the ONE ladder) and adds the decision the runner acts on: apply | propose | propose_only | off. '
  'RAISES on an unknown capability, an unknown site, or an indeterminate ladder — a runner that '
  'cannot determine its mode must refuse, never default to applying. p_site_id NULL resolves the '
  'PLATFORM rung, for passes that walk the shared dictionary and have no site.';

revoke all on function seo.fn_autonomy_gate(uuid, text) from public, anon;
grant execute on function seo.fn_autonomy_gate(uuid, text) to authenticated, service_role;

-- ───────────────────────── 4. writing a proposal, from an engine ─────────────

create or replace function seo.fn_autonomy_propose_stamp(
  p_site_id     uuid,
  p_capability  text,
  p_value_id    uuid,
  p_keyword_ids uuid[],
  p_title       text,
  p_reasoning   text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'seo', 'platform', 'public', 'pg_temp'
as $fn$
declare
  v_cap     int;
  v_total   int := coalesce(cardinality(p_keyword_ids), 0);
  v_ids     uuid[];
  v_dim     record;
  v_row     record;
begin
  if v_total = 0 then
    return jsonb_build_object('proposed', false, 'reason', 'nothing_to_propose', 'keywords', 0);
  end if;

  select coalesce((value #>> '{}')::int, 500) into v_cap
    from platform.feature_knob where feature = 'seo.ai_autonomy' and key = 'proposal_keyword_cap';
  v_cap := coalesce(v_cap, 500);

  -- Highest demand first, so the slice a reviewer reads is the slice that
  -- matters; the total is always reported so the cap is never silent.
  select array_agg(x.keyword_id) into v_ids
  from (
    select k.id as keyword_id
      from unnest(p_keyword_ids) as k(id)
      left join seo.keyword_classification_queue q on q.keyword_id = k.id
     order by q.priority_clicks desc nulls last,
              q.priority_impressions desc nulls last,
              k.id
     limit v_cap
  ) x;

  select d.slug as dim_slug, v.slug as value_slug, d.name as dim_label, v.name as value_label
    into v_dim
    from platform.categories v
    join platform.categories d on d.id = v.parent_id and d.deleted_at is null
   where v.id = p_value_id and v.deleted_at is null;
  if not found then
    raise exception 'seo_autonomy_unknown_value: % is not a dimension value', p_value_id;
  end if;

  select * into v_row from seo.keyword_meaning_suggest(
    p_site_id,
    jsonb_build_object(
      'proposal',      'stamp',
      'dimensionSlug', v_dim.dim_slug,
      -- keyword_meaning_suggest takes the SHORT value slug, not the prefixed one.
      'valueSlug',     split_part(v_dim.value_slug, ':', 2),
      'keywordIds',    to_jsonb(v_ids),
      'notes',         p_reasoning),
    p_title,
    format('%s keyword%s match. %s',
           v_total,
           case when v_total = 1 then '' else 's' end,
           case when v_total > v_cap
                then format('This proposal carries the %s highest-demand of them; approving stamps those.', v_cap)
                else 'Approving stamps all of them.' end),
    p_reasoning,
    100::real,
    jsonb_build_object('matched_total', v_total, 'carried', coalesce(cardinality(v_ids), 0)),
    -- `agentName` is what marks this by-agent, which routes the proposal to the
    -- owner of the thing being changed (KI-034). `capability` is what lets the
    -- timeout pass find its own proposals again.
    jsonb_build_object('agentName', p_capability, 'capability', p_capability));

  return jsonb_build_object(
    'proposed', true,
    'assist_id', v_row.assist_id,
    'status', v_row.status,
    'keywords', v_total,
    'carried', coalesce(cardinality(v_ids), 0),
    'value', v_dim.value_label,
    'dimension', v_dim.dim_label);
end;
$fn$;

comment on function seo.fn_autonomy_propose_stamp(uuid, text, uuid, uuid[], text, text) is
  'An engine in a review mode writes what it WOULD have stamped as one proposal in the existing '
  'approval queue (seo.keyword_meaning_suggest → platform.assists → the Approvals console). '
  'Never a second queue. Bounded by the seo.ai_autonomy.proposal_keyword_cap knob, and the true '
  'total always travels with the proposal so the cap cannot read as the whole segment.';

revoke all on function seo.fn_autonomy_propose_stamp(uuid, text, uuid, uuid[], text, text) from public, anon;
grant execute on function seo.fn_autonomy_propose_stamp(uuid, text, uuid, uuid[], text, text) to authenticated, service_role;

-- ───────────────────────── 5. the bounded timeout pass ──────────────────────

create or replace function seo.fn_autonomy_apply_timed_out(
  p_site_id    uuid,
  p_capability text
)
returns jsonb
language plpgsql
security definer
set search_path to 'seo', 'platform', 'web', 'public', 'pg_temp'
as $fn$
declare
  v_gate     jsonb;
  v_hours    int;
  v_cap      int;
  v_a        record;
  v_proposal jsonb;
  v_applied  int := 0;
  v_skipped  int := 0;
  v_stamped  int := 0;
  v_notes    jsonb := '[]'::jsonb;
begin
  v_gate := seo.fn_autonomy_gate(p_site_id, p_capability);
  if (v_gate ->> 'decision') <> 'propose' then
    -- Only "review then apply" has a window that can expire. Every other mode
    -- either applied already or must never apply without a person.
    return jsonb_build_object('applied', 0, 'skipped', 0,
                              'reason', 'mode_has_no_timeout',
                              'mode', v_gate ->> 'mode');
  end if;

  v_hours := coalesce((v_gate ->> 'timeout_hours')::int, 0);
  if v_hours <= 0 then
    -- "Review then apply" with no window would apply instantly, which is not
    -- what the operator asked for. Refuse rather than reinterpret.
    raise exception 'seo_autonomy_missing_timeout: "%" is set to review-then-apply with no waiting period', p_capability;
  end if;

  select coalesce((value #>> '{}')::int, 200) into v_cap
    from platform.feature_knob where feature = 'seo.ai_autonomy' and key = 'timeout_apply_cap';
  v_cap := coalesce(v_cap, 200);

  for v_a in
    select a.id, a.action, a.title
      from platform.assists a
     where a.deleted_at is null
       and a.status = 'pending'
       and a.entity_type = 'web_site'
       and a.entity_id = p_site_id
       and a.action ->> 'kind' = 'apply_keyword_meaning'
       and a.action -> 'provenance' ->> 'capability' = p_capability
       and a.created_at < now() - make_interval(hours => v_hours)
     order by a.created_at
     limit v_cap
  loop
    v_proposal := v_a.action -> 'proposal';

    -- THE SAME WRITE PATH A PERSON'S APPROVAL TAKES. `apply.ts` replays a
    -- proposal through the ordinary human RPC; so does this. A private applier
    -- here would be the parallel-writer defect that file exists to prevent.
    if (v_proposal ->> 'proposal') = 'stamp' then
      if (v_proposal ->> 'dimensionSlug') = 'traffic_class' then
        perform seo.gsc_set_keyword_class(
          p_site_id,
          (select array_agg(x::uuid) from jsonb_array_elements_text(v_proposal -> 'keywordIds') t(x)),
          v_proposal ->> 'valueSlug',
          'Applied automatically: nobody reviewed it within ' || v_hours || ' hours.',
          'manual', null, true);
      else
        perform seo.keyword_facet_set(
          (select array_agg(x::uuid) from jsonb_array_elements_text(v_proposal -> 'keywordIds') t(x)),
          v_proposal ->> 'dimensionSlug',
          v_proposal ->> 'valueSlug',
          'human',
          p_site_id);
      end if;
      v_stamped := v_stamped + coalesce(jsonb_array_length(v_proposal -> 'keywordIds'), 0);
    else
      -- Matcher / worth / guideline proposals belong to `meaning_suggestions`,
      -- which runs in review_required and must NEVER auto-apply. Leaving them
      -- pending is correct; saying so is what stops it looking like a miss.
      v_skipped := v_skipped + 1;
      v_notes := v_notes || jsonb_build_object('assist_id', v_a.id,
                                               'left_pending', v_proposal ->> 'proposal');
      continue;
    end if;

    update platform.assists a
       set status = 'accepted',
           decided_at = now(),
           decision_note = 'Applied automatically after ' || v_hours || ' hours with no review (' || p_capability || ').',
           result = jsonb_build_object('applied_by', 'autonomy_timeout',
                                       'capability', p_capability,
                                       'waited_hours', v_hours),
           updated_at = now()
     where a.id = v_a.id;
    v_applied := v_applied + 1;
  end loop;

  return jsonb_build_object(
    'applied', v_applied,
    'skipped', v_skipped,
    'keywords_stamped', v_stamped,
    'waited_hours', v_hours,
    'cap', v_cap,
    'left_pending', v_notes,
    'mode', v_gate ->> 'mode');
end;
$fn$;

comment on function seo.fn_autonomy_apply_timed_out(uuid, text) is
  'THE bounded pass mode 3 needs: applies the proposals THIS capability wrote that nobody answered '
  'inside the configured window, through the same RPCs a human approval replays. Rides an engine '
  'run rather than a schedule of its own (there is exactly one approved SEO dispatcher). Bounded by '
  'seo.ai_autonomy.timeout_apply_cap.';

revoke all on function seo.fn_autonomy_apply_timed_out(uuid, text) from public, anon;
grant execute on function seo.fn_autonomy_apply_timed_out(uuid, text) to authenticated, service_role;

-- ───────────────────────── 6. the matcher engine obeys ──────────────────────

-- 🚨 The 2-arg body is DROPPED, never left beside the new one. A default on the
-- third parameter would make `fn_evaluate_matchers_internal(site, ids)` ambiguous
-- AND — worse — every existing caller would keep resolving to the OLD body, so
-- the engine would exist twice and only one copy would obey the gate. Nothing
-- holds a dependency on it (plpgsql bodies are not tracked), so the drop is safe.
drop function if exists seo.fn_evaluate_matchers_internal(uuid, uuid[]);

-- `_internal` gains a MODE. `apply` is byte-for-byte what it did before, so
-- every existing caller (matcher delete, value archive, rule reconnect — all
-- consequences of an explicit human write, not the AI running on its own) is
-- unchanged by construction.
create or replace function seo.fn_evaluate_matchers_internal(
  p_site_id uuid,
  p_keyword_ids uuid[] default null::uuid[],
  p_mode text default 'apply'
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
DECLARE
  v_org uuid; v_stamped int := 0; v_removed int := 0; v_conflicts int := 0; v_matchers int := 0; v_scope int := 0;
  v_brand_matcher uuid; v_brand_value uuid;
  v_proposals jsonb := '[]'::jsonb; v_p record; v_one jsonb;
BEGIN
  SELECT organization_id INTO v_org FROM web.site WHERE id = p_site_id;

  CREATE TEMP TABLE IF NOT EXISTS _scope (kw_id uuid PRIMARY KEY) ON COMMIT DROP;
  TRUNCATE _scope;
  INSERT INTO _scope
    SELECT DISTINCT x.kw_id FROM (
      SELECT unnest(p_keyword_ids) AS kw_id WHERE p_keyword_ids IS NOT NULL
      UNION
      SELECT spd.keyword_id FROM seo.search_performance_daily spd
       WHERE p_keyword_ids IS NULL AND spd.site_id = p_site_id AND spd.keyword_id IS NOT NULL
      UNION
      SELECT skv.keyword_id FROM seo.site_keyword_value skv
       WHERE p_keyword_ids IS NULL AND skv.site_id = p_site_id AND skv.deleted_at IS NULL
    ) x WHERE x.kw_id IS NOT NULL;
  SELECT count(*) INTO v_scope FROM _scope;

  CREATE TEMP TABLE IF NOT EXISTS _hits (kw_id uuid, value_id uuid, dim_id uuid, matcher_id uuid, single_card boolean) ON COMMIT DROP;
  TRUNCATE _hits;
  CREATE TEMP TABLE IF NOT EXISTS _desired (kw_id uuid, value_id uuid, dim_id uuid, matcher_id uuid, single_card boolean) ON COMMIT DROP;
  TRUNCATE _desired;

  WITH m AS (
    SELECT dm.id AS matcher_id, dm.value_id, dm.kind, dm.pattern, dm.place_id, dm.fact_value_id,
           cv.parent_id AS dim_id, COALESCE(cd.metadata->>'cardinality','single') = 'single' AS single_card
    FROM seo.dimension_value_matcher dm
    JOIN platform.categories cv ON cv.id = dm.value_id AND cv.deleted_at IS NULL
    JOIN platform.categories cd ON cd.id = cv.parent_id AND cd.deleted_at IS NULL
    WHERE dm.site_id = p_site_id AND dm.deleted_at IS NULL AND dm.enabled
      AND dm.kind NOT IN ('condition','brand_identity')
  ),
  kw AS (SELECT k.id, k.normalized_phrase FROM seo.keyword k JOIN _scope s ON s.kw_id = k.id WHERE k.deleted_at IS NULL)
  INSERT INTO _hits
    SELECT kw.id, m.value_id, m.dim_id, m.matcher_id, m.single_card
    FROM kw JOIN m ON m.kind IN ('exact','word','contains','starts_with','ends_with') AND (
         (m.kind = 'contains'    AND kw.normalized_phrase LIKE '%' || seo.gsc_perf_like_escape(m.pattern) || '%')
      OR (m.kind = 'exact'       AND kw.normalized_phrase = m.pattern)
      OR (m.kind = 'starts_with' AND kw.normalized_phrase LIKE seo.gsc_perf_like_escape(m.pattern) || '%')
      OR (m.kind = 'ends_with'   AND kw.normalized_phrase LIKE '%' || seo.gsc_perf_like_escape(m.pattern))
      OR (m.kind = 'word'        AND kw.normalized_phrase ~ ('\m' || m.pattern || '\M')))
    UNION ALL
    SELECT kp.keyword_id, m.value_id, m.dim_id, m.matcher_id, m.single_card
    FROM m JOIN seo.keyword_place kp ON kp.place_id = m.place_id AND kp.deleted_at IS NULL
    JOIN _scope s ON s.kw_id = kp.keyword_id WHERE m.kind = 'place'
    UNION ALL
    SELECT kf.keyword_id, m.value_id, m.dim_id, m.matcher_id, m.single_card
    FROM m JOIN seo.keyword_facet kf ON kf.category_id = m.fact_value_id AND kf.deleted_at IS NULL
                                     AND (kf.site_id IS NULL OR kf.site_id = p_site_id)
    JOIN _scope s ON s.kw_id = kf.keyword_id WHERE m.kind = 'fact';

  SELECT dm.id, dm.value_id INTO v_brand_matcher, v_brand_value
  FROM seo.dimension_value_matcher dm
  WHERE dm.site_id = p_site_id AND dm.kind = 'brand_identity' AND dm.enabled AND dm.deleted_at IS NULL
  LIMIT 1;
  IF v_brand_matcher IS NOT NULL THEN
    INSERT INTO _hits
    WITH bh AS MATERIALIZED (SELECT * FROM seo.gsc_brand_hits(p_site_id)),
    alias_ok AS (SELECT bh.joined, count(*) <= seo.gsc_brand_generic_threshold() AS weak_ok FROM bh GROUP BY bh.joined)
    SELECT DISTINCT bh.keyword_id, v_brand_value,
           (SELECT parent_id FROM platform.categories WHERE id = v_brand_value), v_brand_matcher, true
    FROM bh JOIN alias_ok ao ON ao.joined = bh.joined
    JOIN _scope s ON s.kw_id = bh.keyword_id
    WHERE bh.strong OR ao.weak_ok;
  END IF;

  INSERT INTO _desired
  SELECT DISTINCT ON (kw_id, value_id) kw_id, value_id, dim_id, matcher_id, single_card
  FROM (SELECT h.*, row_number() OVER (PARTITION BY h.kw_id, h.dim_id ORDER BY h.matcher_id) AS rn FROM _hits h) r
  WHERE (NOT single_card) OR rn = 1
  ORDER BY kw_id, value_id, matcher_id;

  SELECT count(*) INTO v_conflicts FROM (
    SELECT kw_id, dim_id FROM _hits WHERE single_card GROUP BY kw_id, dim_id HAVING count(DISTINCT value_id) > 1) c;

  DELETE FROM _desired d
  WHERE d.single_card AND EXISTS (
    SELECT 1 FROM seo.keyword_facet kf JOIN platform.categories cv ON cv.id = kf.category_id
    WHERE kf.keyword_id = d.kw_id AND cv.parent_id = d.dim_id AND kf.deleted_at IS NULL
      AND (kf.site_id = p_site_id OR kf.site_id IS NULL)
      AND (kf.pinned OR kf.source = 'human'));

  SELECT count(*) INTO v_matchers FROM seo.dimension_value_matcher
   WHERE site_id = p_site_id AND deleted_at IS NULL AND enabled AND kind <> 'condition';

  -- 🚨 THE FORK. Everything above is the same reading of the same rules; only
  -- what happens to the answer changes. A proposing pass writes NO stamp, moves
  -- NO `last_evaluated_at` (nothing was evaluated onto the corpus), and releases
  -- nothing — releasing is a write like any other.
  IF p_mode = 'propose' THEN
    FOR v_p IN
      SELECT d.value_id, array_agg(d.kw_id) AS kw_ids, count(*) AS n
        FROM _desired d
        -- Only what is NOT already stamped is a proposal; re-proposing what the
        -- corpus already says would fill the queue with no-ops every pass.
       WHERE NOT EXISTS (
         SELECT 1 FROM seo.keyword_facet kf
          WHERE kf.keyword_id = d.kw_id AND kf.category_id = d.value_id
            AND kf.site_id = p_site_id AND kf.deleted_at IS NULL)
       GROUP BY d.value_id
       ORDER BY count(*) DESC
    LOOP
      v_one := seo.fn_autonomy_propose_stamp(
        p_site_id, 'matcher_engine', v_p.value_id, v_p.kw_ids,
        format('Your rules match %s keyword%s', v_p.n, CASE WHEN v_p.n = 1 THEN '' ELSE 's' END),
        'Found by the rules you wrote. Nothing was stamped — this is set to wait for you.');
      v_proposals := v_proposals || v_one;
    END LOOP;

    RETURN jsonb_build_object('scope_keywords', v_scope, 'matchers', v_matchers, 'stamped', 0,
                              'removed', 0, 'single_cardinality_conflicts', v_conflicts,
                              'mode', p_mode, 'proposals', v_proposals,
                              'evaluated_at', now());
  END IF;

  -- as_of = LAST CHANGE, and belongs ONLY on situational stamps (P20 / the
  -- intrinsic-vs-situational LAW). A matcher hit on an intrinsic dimension
  -- (qualifiers, geo, traffic class via brand_identity, ...) never carries it.
  WITH up AS (
    INSERT INTO seo.keyword_facet (keyword_id, category_id, site_id, source, confidence, matcher_id, as_of, organization_id, visibility)
    SELECT d.kw_id, d.value_id, p_site_id, 'matcher', 100, d.matcher_id,
           CASE WHEN cd.metadata->>'nature' = 'situational' THEN now() ELSE NULL END,
           v_org, 'internal'
    FROM _desired d
    JOIN platform.categories cd ON cd.id = d.dim_id
    ON CONFLICT (keyword_id, category_id, COALESCE(site_id,'00000000-0000-0000-0000-000000000000'::uuid)) WHERE deleted_at IS NULL
    DO UPDATE SET matcher_id = EXCLUDED.matcher_id, as_of = EXCLUDED.as_of, updated_at = now()
      WHERE seo.keyword_facet.source = 'matcher' AND NOT seo.keyword_facet.pinned
        -- a re-run that lands the same matcher moves nothing
        AND seo.keyword_facet.matcher_id IS DISTINCT FROM EXCLUDED.matcher_id
    RETURNING 1
  ) SELECT count(*) INTO v_stamped FROM up;

  WITH gone AS (
    UPDATE seo.keyword_facet kf SET deleted_at = now(), updated_at = now()
    WHERE kf.site_id = p_site_id AND kf.source = 'matcher' AND NOT kf.pinned AND kf.deleted_at IS NULL
      AND kf.keyword_id IN (SELECT kw_id FROM _scope)
      AND NOT EXISTS (SELECT 1 FROM seo.dimension_value_matcher cdm
                       WHERE cdm.id = kf.matcher_id AND cdm.kind = 'condition')
      AND NOT EXISTS (SELECT 1 FROM _desired d WHERE d.kw_id = kf.keyword_id AND d.value_id = kf.category_id)
    RETURNING 1
  ) SELECT count(*) INTO v_removed FROM gone;

  UPDATE seo.dimension_value_matcher dm
     SET last_evaluated_at = now(),
         match_count = (SELECT count(*) FROM seo.keyword_facet kf WHERE kf.matcher_id = dm.id AND kf.deleted_at IS NULL)
   WHERE dm.site_id = p_site_id AND dm.deleted_at IS NULL AND dm.kind <> 'condition';

  RETURN jsonb_build_object('scope_keywords', v_scope, 'matchers', v_matchers, 'stamped', v_stamped,
                            'removed', v_removed, 'single_cardinality_conflicts', v_conflicts,
                            'mode', 'apply', 'evaluated_at', now());
END $function$;

comment on function seo.fn_evaluate_matchers_internal(uuid, uuid[], text) is
  'THE deterministic matcher engine. p_mode = apply writes the stamps (unchanged, and what every '
  'human-write consequence calls); p_mode = propose reads the same rules and writes what it WOULD '
  'stamp into the approval queue instead, touching nothing. The autonomy gate is in the wrapper, '
  'seo.fn_evaluate_matchers.';

-- The WRAPPER is the seam every "run the engine" caller passes through, so the
-- gate lives here — one read, one decision, every caller obeys.
create or replace function seo.fn_evaluate_matchers(
  p_site_id uuid,
  p_keyword_ids uuid[] default null::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path to 'seo', 'platform', 'web', 'public', 'pg_temp'
as $function$
DECLARE
  v_gate jsonb;
  v_out  jsonb;
  v_timeout jsonb := null;
BEGIN
  PERFORM seo.gsc_assert_site_editor(p_site_id);
  -- RAISES if the mode cannot be determined. Refusing loudly beats applying.
  v_gate := seo.fn_autonomy_gate(p_site_id, 'matcher_engine');

  IF (v_gate ->> 'decision') = 'off' THEN
    RETURN jsonb_build_object('scope_keywords', 0, 'matchers', 0, 'stamped', 0, 'removed', 0,
                              'single_cardinality_conflicts', 0, 'skipped', 'autonomy_off',
                              'autonomy', v_gate, 'evaluated_at', now());
  END IF;

  IF (v_gate ->> 'decision') = 'propose' THEN
    -- Mode 3 in full: first honour the window that already expired, then read
    -- the corpus again and propose what is new.
    v_timeout := seo.fn_autonomy_apply_timed_out(p_site_id, 'matcher_engine');
  END IF;

  v_out := seo.fn_evaluate_matchers_internal(
    p_site_id, p_keyword_ids,
    CASE WHEN (v_gate ->> 'decision') = 'apply' THEN 'apply' ELSE 'propose' END);

  RETURN v_out || jsonb_build_object('autonomy', v_gate)
                || CASE WHEN v_timeout IS NULL THEN '{}'::jsonb
                        ELSE jsonb_build_object('timeout_pass', v_timeout) END;
END $function$;

comment on function seo.fn_evaluate_matchers(uuid, uuid[]) is
  'THE run-the-matchers entry point, and the seam where the matcher_engine autonomy mode is obeyed '
  '(KI-044): apply writes stamps, review modes write proposals into the existing approval queue and '
  'write nothing to the corpus, off does not run and says so. Site-editor guarded as before.';

-- ───────────────────────── 7. the situational engine obeys ──────────────────

-- Same gate, same capability (a condition matcher IS a matcher), wrapped around
-- the C5 engine. The heavy body is untouched; only the decision in front of it
-- is new, plus the propose branch that writes instead of stamping.
create or replace function seo.fn_evaluate_condition_matchers(
  p_site_id uuid,
  p_matcher_ids uuid[] default null::uuid[],
  p_dimension_id uuid default null::uuid,
  p_start date default null::date,
  p_end date default null::date
)
returns jsonb
language plpgsql
security definer
set search_path to 'seo', 'platform', 'web', 'public', 'pg_temp'
as $function$
DECLARE
  v_gate jsonb;
  v_timeout jsonb := null;
  v_org uuid;
  v_start date := p_start;
  v_end date := p_end;
  v_cmp_start date;
  v_cmp_end date;
  v_use_cmp boolean;
  v_span int;
  v_window_days int;
  v_budget int;
  v_left int;
  v_m record;
  v_rule seo.gsc_dig_rule%ROWTYPE;
  v_found int;
  v_fresh int;
  v_stamped int;
  v_removed int;
  v_remaining int;
  v_complete boolean;
  v_propose boolean;
  v_ids uuid[];
  v_one jsonb;
  v_total_stamped int := 0;
  v_total_removed int := 0;
  v_total_remaining int := 0;
  v_results jsonb := '[]'::jsonb;
BEGIN
  PERFORM seo.gsc_assert_site_editor(p_site_id);
  v_gate := seo.fn_autonomy_gate(p_site_id, 'matcher_engine');

  IF (v_gate ->> 'decision') = 'off' THEN
    RETURN jsonb_build_object('matchers', 0, 'stamped', 0, 'removed', 0, 'remaining', 0,
                              'skipped', 'autonomy_off', 'autonomy', v_gate,
                              'results', '[]'::jsonb, 'evaluated_at', now());
  END IF;
  v_propose := (v_gate ->> 'decision') <> 'apply';
  IF (v_gate ->> 'decision') = 'propose' THEN
    v_timeout := seo.fn_autonomy_apply_timed_out(p_site_id, 'matcher_engine');
  END IF;

  SELECT organization_id INTO v_org FROM web.site WHERE id = p_site_id;

  SELECT COALESCE((value #>> '{}')::int, 28) INTO v_window_days
    FROM platform.feature_knob WHERE feature = 'seo.situational_stamps' AND key = 'window_days';
  SELECT COALESCE((value #>> '{}')::int, 8000) INTO v_budget
    FROM platform.feature_knob WHERE feature = 'seo.situational_stamps' AND key = 'writes_per_pass';
  v_window_days := COALESCE(v_window_days, 28);
  v_budget := COALESCE(v_budget, 8000);
  v_left := v_budget;

  IF v_end IS NULL THEN
    SELECT max(spd.date) INTO v_end
    FROM seo.search_performance_daily spd
    WHERE spd.provider = 'gsc' AND spd.site_id = p_site_id AND spd.dimension_profile = 'query';
  END IF;
  IF v_end IS NULL THEN
    RAISE EXCEPTION 'gsc_no_performance_data: this site has no Search Console days yet, so there is no "now" to evaluate against';
  END IF;
  IF v_start IS NULL THEN v_start := v_end - (v_window_days - 1); END IF;
  IF v_start > v_end THEN
    RAISE EXCEPTION 'gsc_window_inverted: the window starts after it ends';
  END IF;
  v_span := (v_end - v_start) + 1;
  v_cmp_end := v_start - 1;
  v_cmp_start := v_cmp_end - (v_span - 1);

  CREATE TEMP TABLE IF NOT EXISTS _cond_hit (kw_id uuid PRIMARY KEY) ON COMMIT DROP;

  FOR v_m IN
    SELECT dm.id, dm.value_id, dm.condition_rule_id,
           cv.parent_id AS dim_id, cv.name AS value_label, cd.name AS dim_label,
           COALESCE(cd.metadata->>'cardinality','single') = 'single' AS single_card
    FROM seo.dimension_value_matcher dm
    JOIN platform.categories cv ON cv.id = dm.value_id AND cv.deleted_at IS NULL
    JOIN platform.categories cd ON cd.id = cv.parent_id AND cd.deleted_at IS NULL
    WHERE dm.site_id = p_site_id AND dm.kind = 'condition'
      AND dm.enabled AND dm.deleted_at IS NULL
      AND (p_matcher_ids IS NULL OR dm.id = ANY(p_matcher_ids))
      AND (p_dimension_id IS NULL OR cv.parent_id = p_dimension_id)
    ORDER BY dm.id
  LOOP
    SELECT * INTO v_rule FROM seo.gsc_dig_rule r WHERE r.id = v_m.condition_rule_id AND r.deleted_at IS NULL;
    IF NOT FOUND THEN
      v_results := v_results || jsonb_build_object(
        'matcher_id', v_m.id, 'value', v_m.value_label, 'error', 'rule_missing');
      CONTINUE;
    END IF;

    v_use_cmp := v_rule.sort_metric LIKE 'cmp\_%' OR v_rule.sort_metric LIKE 'delta\_%'
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_rule.conditions) c
                  WHERE c->>'metric' LIKE 'cmp\_%' OR c->>'metric' LIKE 'delta\_%');

    TRUNCATE _cond_hit;
    -- `0` = every keyword the rule matches (C5d). The rule's own row_limit
    -- governs the TABLE it is displayed in, never what the segment means.
    INSERT INTO _cond_hit
    SELECT DISTINCT d.keyword_id
    FROM seo.gsc_perf_dig(
           p_site_id, v_rule.dimension, v_start, v_end,
           CASE WHEN v_use_cmp THEN v_cmp_start END,
           CASE WHEN v_use_cmp THEN v_cmp_end END,
           v_rule.conditions, v_rule.base_filters, v_rule.sort_metric,
           v_rule.sort_dir, 0, v_rule.traffic_class, v_rule.level) d
    WHERE d.keyword_id IS NOT NULL;
    GET DIAGNOSTICS v_found = ROW_COUNT;

    -- A person's ruling on a single-choice dimension outranks the rule.
    DELETE FROM _cond_hit c
    WHERE v_m.single_card AND EXISTS (
      SELECT 1 FROM seo.keyword_facet kf
      JOIN platform.categories cv ON cv.id = kf.category_id
      WHERE kf.keyword_id = c.kw_id AND cv.parent_id = v_m.dim_id
        AND kf.deleted_at IS NULL AND (kf.site_id = p_site_id OR kf.site_id IS NULL)
        AND (kf.pinned OR kf.source = 'human'));

    -- Only the keywords NOT already carrying this stamp are work.
    SELECT count(*) INTO v_fresh FROM _cond_hit c
    WHERE NOT EXISTS (
      SELECT 1 FROM seo.keyword_facet kf
      WHERE kf.keyword_id = c.kw_id AND kf.category_id = v_m.value_id
        AND kf.site_id = p_site_id AND kf.deleted_at IS NULL);

    -- 🚨 A PROPOSING PASS TOUCHES NOTHING — no stamp, no release, and no
    -- `last_evaluated_at`: the segment was NOT re-derived onto the corpus, and
    -- claiming it was is exactly the lie KI-016 exists to prevent.
    IF v_propose THEN
      SELECT array_agg(c.kw_id) INTO v_ids FROM _cond_hit c
       WHERE NOT EXISTS (
         SELECT 1 FROM seo.keyword_facet kf
          WHERE kf.keyword_id = c.kw_id AND kf.category_id = v_m.value_id
            AND kf.site_id = p_site_id AND kf.deleted_at IS NULL);
      v_one := seo.fn_autonomy_propose_stamp(
        p_site_id, 'matcher_engine', v_m.value_id, COALESCE(v_ids, '{}'::uuid[]),
        format('"%s" now matches %s keyword%s', v_rule.name, v_fresh,
               CASE WHEN v_fresh = 1 THEN '' ELSE 's' END),
        format('Right now on this site, over %s to %s. Nothing was stamped — this is set to wait for you.',
               v_start, v_end));
      v_results := v_results || jsonb_build_object(
        'matcher_id', v_m.id, 'rule', v_rule.name,
        'dimension', v_m.dim_label, 'value', v_m.value_label,
        'matched', v_found, 'stamped', 0, 'removed', 0,
        'remaining', 0, 'complete', true, 'proposed', v_one,
        'table_row_limit', v_rule.row_limit, 'used_compare', v_use_cmp);
      CONTINUE;
    END IF;

    v_remaining := GREATEST(v_fresh - GREATEST(v_left, 0), 0);
    v_complete := v_remaining = 0;

    WITH pick AS (
      SELECT c.kw_id FROM _cond_hit c
      WHERE NOT EXISTS (
        SELECT 1 FROM seo.keyword_facet kf
        WHERE kf.keyword_id = c.kw_id AND kf.category_id = v_m.value_id
          AND kf.site_id = p_site_id AND kf.deleted_at IS NULL)
      ORDER BY c.kw_id
      LIMIT GREATEST(v_left, 0)
    ),
    up AS (
      INSERT INTO seo.keyword_facet
        (keyword_id, category_id, site_id, source, confidence, matcher_id, as_of, organization_id, visibility)
      SELECT p.kw_id, v_m.value_id, p_site_id, 'matcher', 100, v_m.id, now(), v_org, 'internal'
      FROM pick p
      ON CONFLICT (keyword_id, category_id, COALESCE(site_id,'00000000-0000-0000-0000-000000000000'::uuid))
        WHERE deleted_at IS NULL
      -- `as_of` is when the keyword ENTERED this segment; a re-evaluation that
      -- finds it still matching leaves it alone (that is the delta write).
      -- Adoption from another matcher is the only reason to touch the row.
      DO UPDATE SET matcher_id = EXCLUDED.matcher_id, updated_at = now()
        WHERE seo.keyword_facet.source = 'matcher' AND NOT seo.keyword_facet.pinned
          AND seo.keyword_facet.matcher_id IS DISTINCT FROM EXCLUDED.matcher_id
      RETURNING 1
    ) SELECT count(*) INTO v_stamped FROM up;
    v_left := v_left - v_stamped;

    -- 🚨 Release ONLY when the fill is complete. Against a half-filled set
    -- this would delete the very stamps the next pass is on its way to make.
    v_removed := 0;
    IF v_complete THEN
      WITH gone AS (
        UPDATE seo.keyword_facet kf SET deleted_at = now(), updated_at = now()
         WHERE kf.matcher_id = v_m.id AND kf.source = 'matcher'
           AND NOT kf.pinned AND kf.deleted_at IS NULL
           AND NOT EXISTS (SELECT 1 FROM _cond_hit c WHERE c.kw_id = kf.keyword_id)
        RETURNING 1
      ) SELECT count(*) INTO v_removed FROM gone;
    END IF;

    -- THE SEGMENT's freshness lives here, on ONE row — never on each stamp.
    UPDATE seo.dimension_value_matcher dm
       SET last_evaluated_at = now(),
           match_count = (SELECT count(*) FROM seo.keyword_facet kf
                           WHERE kf.matcher_id = dm.id AND kf.deleted_at IS NULL),
           metadata = dm.metadata || jsonb_build_object('fill_remaining', v_remaining)
     WHERE dm.id = v_m.id;

    v_total_stamped := v_total_stamped + v_stamped;
    v_total_removed := v_total_removed + v_removed;
    v_total_remaining := v_total_remaining + v_remaining;
    v_results := v_results || jsonb_build_object(
      'matcher_id', v_m.id, 'rule', v_rule.name,
      'dimension', v_m.dim_label, 'value', v_m.value_label,
      'matched', v_found, 'stamped', v_stamped, 'removed', v_removed,
      'remaining', v_remaining, 'complete', v_complete,
      'table_row_limit', v_rule.row_limit, 'used_compare', v_use_cmp);
  END LOOP;

  RETURN jsonb_build_object(
    'window', jsonb_build_object('start', v_start, 'end', v_end,
                                 'compare_start', v_cmp_start, 'compare_end', v_cmp_end),
    'matchers', jsonb_array_length(v_results),
    'stamped', v_total_stamped, 'removed', v_total_removed,
    -- > 0 ⇒ press again (the UI loops); the segment is still filling.
    'remaining', v_total_remaining,
    'writes_per_pass', v_budget,
    'autonomy', v_gate,
    'evaluated_at', now(), 'results', v_results)
    || CASE WHEN v_timeout IS NULL THEN '{}'::jsonb
            ELSE jsonb_build_object('timeout_pass', v_timeout) END;
END;
$function$;

comment on function seo.fn_evaluate_condition_matchers(uuid, uuid[], uuid, date, date) is
  'THE situational engine (C5) — re-derives condition-matcher stamps over the site''s current window '
  'and releases what stopped matching. Obeys the matcher_engine autonomy mode (KI-044): a review mode '
  'proposes and writes NOTHING (not even last_evaluated_at, which would claim a re-derivation that '
  'did not happen), off does not run.';

-- ───────────────────────── 8. the registry stops apologising ────────────────

update seo.ai_capability set
  enforced = true,
  enforcement_note = 'Enforced: the engine reads this before it stamps anything. Waiting modes write what it found into Approvals instead of the corpus; off stops it running.',
  updated_at = now()
where slug = 'matcher_engine';

update seo.ai_capability set
  enforced = true,
  enforcement_note = 'Enforced: the placement pass reads this before it writes. Waiting modes hold every placement as a proposal whatever its confidence; off stops the pass.',
  updated_at = now()
where slug = 'topic_assigner';

update seo.ai_capability set
  enforced = true,
  enforcement_note = 'Enforced: the classifier reads this before it spends. The nightly pass walks the shared keyword dictionary, so it reads the PLATFORM setting — a waiting mode there has no reviewer, so the pass stops and says so instead of applying.',
  updated_at = now()
where slug = 'keyword_classifier';

update seo.ai_capability set
  enforced = true,
  enforcement_note = 'Enforced: detection reads this before it stamps. The nightly pass walks the shared keyword dictionary, so it reads the PLATFORM setting — a waiting mode there has no reviewer, so the pass stops and says so instead of applying.',
  updated_at = now()
where slug = 'place_detection';

-- ───────────────────────── 9. `off` is writable ─────────────────────────────

create or replace function seo.set_ai_autonomy(
  p_scope text, p_id uuid default null, p_capability text default null,
  p_mode text default null, p_timeout_hours int default null, p_clear boolean default false
) returns jsonb
language plpgsql
set search_path to 'seo', 'web', 'iam', 'platform', 'public', 'pg_temp'
as $fn$
DECLARE v_all jsonb; v_entry jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM seo.ai_capability WHERE slug = p_capability) THEN
    RAISE EXCEPTION 'seo_autonomy_unknown_capability: there is no AI step named "%"', COALESCE(p_capability,'null');
  END IF;
  IF NOT seo.fn_value_settings_may_edit(p_scope, p_id) THEN
    RAISE EXCEPTION 'seo_autonomy_denied: you do not have permission to change these settings' USING ERRCODE='42501';
  END IF;
  IF NOT p_clear AND (p_mode IS NULL OR p_mode NOT IN ('auto_platform','auto_org','review_timeout','review_required','off')) THEN
    RAISE EXCEPTION 'seo_autonomy_bad_mode: choose one of auto_platform, auto_org, review_timeout, review_required, off';
  END IF;
  IF NOT p_clear AND p_mode = 'review_timeout' AND COALESCE(p_timeout_hours,0) <= 0 THEN
    RAISE EXCEPTION 'seo_autonomy_needs_timeout: "review then apply" needs how long to wait';
  END IF;

  IF p_scope = 'platform' THEN
    SELECT COALESCE(k.value,'{}'::jsonb) INTO v_all FROM platform.feature_knob k
     WHERE k.feature='seo.ai_autonomy' AND k.key='modes';
    v_all := COALESCE(v_all,'{}'::jsonb);
    IF p_clear THEN
      RAISE EXCEPTION 'seo_autonomy_platform_is_the_floor: the platform tier has nothing above it — change the mode instead of clearing it';
    END IF;
    v_entry := jsonb_strip_nulls(jsonb_build_object('mode', p_mode, 'timeout_hours', p_timeout_hours));
    v_all := v_all || jsonb_build_object(p_capability, v_entry);
    INSERT INTO platform.feature_knob (feature, key, value, default_value, value_type, label, description, set_by, basis, review_due)
    VALUES ('seo.ai_autonomy','modes', v_all, '{}'::jsonb, 'json',
            'AI autonomy modes', 'Which of the five human-in-the-loop modes each Keyword Intelligence AI step runs in by default (KI-044).',
            'human', 'Set by a platform admin in the admin settings screen.', (now() + interval '90 days')::date)
    ON CONFLICT (feature, key) DO UPDATE SET value = v_all, updated_at = now(), updated_by = (SELECT auth.uid()), set_by='human';
  ELSE
    IF p_scope = 'org' THEN
      SELECT COALESCE(o.settings->'ai_autonomy','{}'::jsonb) INTO v_all FROM iam.organizations o WHERE o.id = p_id;
    ELSIF p_scope = 'brand' THEN
      SELECT COALESCE(b.settings->'ai_autonomy','{}'::jsonb) INTO v_all FROM web.brand b WHERE b.id = p_id AND b.deleted_at IS NULL;
    ELSE
      SELECT COALESCE(s.settings->'ai_autonomy','{}'::jsonb) INTO v_all FROM web.site s WHERE s.id = p_id AND s.deleted_at IS NULL;
    END IF;
    IF v_all IS NULL THEN
      RAISE EXCEPTION 'seo_autonomy_scope_not_found: no % with id %', p_scope, p_id USING ERRCODE='P0002';
    END IF;
    IF p_clear THEN
      v_all := v_all - p_capability;
    ELSE
      v_all := v_all || jsonb_build_object(p_capability,
        jsonb_strip_nulls(jsonb_build_object('mode', p_mode, 'timeout_hours', p_timeout_hours)));
    END IF;

    IF p_scope = 'org' THEN
      UPDATE iam.organizations o SET settings = CASE WHEN v_all = '{}'::jsonb
        THEN COALESCE(o.settings,'{}'::jsonb) - 'ai_autonomy'
        ELSE COALESCE(o.settings,'{}'::jsonb) || jsonb_build_object('ai_autonomy', v_all) END
       WHERE o.id = p_id;
    ELSIF p_scope = 'brand' THEN
      UPDATE web.brand b SET settings = CASE WHEN v_all = '{}'::jsonb
        THEN COALESCE(b.settings,'{}'::jsonb) - 'ai_autonomy'
        ELSE COALESCE(b.settings,'{}'::jsonb) || jsonb_build_object('ai_autonomy', v_all) END,
        updated_at = now(), updated_by = (SELECT auth.uid())
       WHERE b.id = p_id AND b.deleted_at IS NULL;
    ELSE
      UPDATE web.site s SET settings = CASE WHEN v_all = '{}'::jsonb
        THEN COALESCE(s.settings,'{}'::jsonb) - 'ai_autonomy'
        ELSE COALESCE(s.settings,'{}'::jsonb) || jsonb_build_object('ai_autonomy', v_all) END,
        updated_at = now(), updated_by = (SELECT auth.uid())
       WHERE s.id = p_id AND s.deleted_at IS NULL;
    END IF;
  END IF;

  RETURN seo.ai_autonomy_scope(p_scope, p_id);
END;
$fn$;

revoke all on function seo.set_ai_autonomy(text, uuid, text, text, int, boolean) from public, anon;
grant execute on function seo.set_ai_autonomy(text, uuid, text, text, int, boolean) to authenticated, service_role;
