-- KI-044 — place detection obeys its autonomy mode, at the ONE seam it has.
--
-- `seo.fn_backfill_keyword_places` IS the place-detection engine: the rules
-- bench's strip presses it directly and aidream's nightly drives it in a loop.
-- Gating it here means both callers obey with one implementation and no deploy
-- between them.
--
-- WHICH RUNG. The pass walks the SHARED keyword dictionary — it claims from
-- `seo.keyword_classification_queue` with no site at all, and the places and
-- `local_intent` it stamps are universal facts every tenant reads. A per-site
-- setting cannot govern a write every tenant shares, so it resolves the
-- PLATFORM rung (`seo.fn_autonomy_gate(NULL, ...)`), the only rung whose scope
-- matches its own.
--
-- WHY A REVIEW MODE STOPS INSTEAD OF PROPOSING. A proposal is addressed to the
-- owner of the thing being changed (KI-034), and the shared dictionary has no
-- owner — there is nobody to ask. Stopping and saying so is the honest answer;
-- applying because proposing was awkward is precisely the failure KI-044
-- exists to close.
--
-- The return gains two columns rather than raising: a person pressed a button
-- and deserves a receipt that says what happened, not a red error for a
-- deliberate setting.
--
-- Idempotent: DROP + CREATE (the signature is unchanged, the return type is not,
-- and Postgres refuses to REPLACE a function whose OUT columns changed).

drop function if exists seo.fn_backfill_keyword_places(integer, integer, text);

create function seo.fn_backfill_keyword_places(
  p_limit integer,
  p_min_impressions integer,
  p_detector_version text default 'gazetteer-2026-08-22'::text
)
returns table(
  claimed integer,
  keywords_with_places integer,
  places_written integer,
  local_intent_stamped integer,
  human_protected integer,
  -- KI-044. NULL = the pass ran. Otherwise: why it did not.
  skipped text,
  autonomy_mode text
)
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_ids uuid[];
  v_row record;
  v_gate jsonb;
  v_decision text;
begin
  if not public.is_admin() then
    raise exception 'seo_geo_forbidden: the place backfill is an admin pass.';
  end if;
  if p_limit is null or p_limit < 1 then
    raise exception 'seo_geo_bad_limit: p_limit must be >= 1 (it is a feature knob, never a constant).';
  end if;

  -- RAISES if the mode cannot be determined; refusing loudly beats applying.
  v_gate := seo.fn_autonomy_gate(null, 'place_detection');
  v_decision := v_gate ->> 'decision';
  if v_decision is distinct from 'apply' then
    return query select 0, 0, 0, 0, 0,
                        case when v_decision = 'off'
                             then 'autonomy_off'
                             else 'autonomy_review_required' end,
                        v_gate ->> 'mode';
    return;
  end if;

  select array_agg(q.keyword_id) into v_ids
  from (
    select q.keyword_id
    from seo.keyword_classification_queue q
    where q.place_scanned_at is null
      and (q.priority_clicks > 0
           or q.priority_impressions >= coalesce(p_min_impressions, 0))
    order by q.priority_clicks desc, q.priority_impressions desc, q.keyword_id
    limit p_limit
  ) q;

  if v_ids is null then
    return query select 0, 0, 0, 0, 0, null::text, v_gate ->> 'mode';
    return;
  end if;

  select * into v_row from seo.stamp_keyword_places(v_ids, p_detector_version);

  update seo.keyword_classification_queue q
     set place_scanned_at = now(),
         place_detector_version = p_detector_version,
         places_found = coalesce((
           select count(*) from seo.keyword_place kp
            where kp.keyword_id = q.keyword_id and kp.deleted_at is null), 0)
   where q.keyword_id = any(v_ids);

  return query select cardinality(v_ids)::integer,
                      v_row.keywords_with_places, v_row.places_written,
                      v_row.local_intent_stamped, v_row.human_protected,
                      null::text, v_gate ->> 'mode';
end;
$function$;

comment on function seo.fn_backfill_keyword_places(integer, integer, text) is
  'THE deterministic place-detection pass, and the seam where the place_detection autonomy mode is '
  'obeyed (KI-044). Walks the SHARED keyword dictionary, so it resolves the PLATFORM rung; a review '
  'mode there has no reviewer to address a proposal to, so the pass reports skipped rather than '
  'applying. Admin-gated as before.';

revoke all on function seo.fn_backfill_keyword_places(integer, integer, text) from public, anon;
grant execute on function seo.fn_backfill_keyword_places(integer, integer, text) to authenticated, service_role;

update seo.ai_capability set
  enforcement_note = 'Enforced: seo.fn_backfill_keyword_places reads this before it stamps — the bench strip and the nightly both. The pass walks the shared keyword dictionary, so it reads the PLATFORM setting; a waiting mode there has no reviewer, so it stops and says so instead of applying.',
  updated_at = now()
where slug = 'place_detection';
