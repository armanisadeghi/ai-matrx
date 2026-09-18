-- target: branch,production
-- additive: yes
-- guard: custom/row_versions_guard
-- based-on: history.who_could_see(uuid,uuid,timestamp with time zone) 0fc55420079f52842a0049d57db0598827721635a29f5b6122d8427b250ac956
--
-- W3-HIST, part ten — VIS-16's ANSWER HAS NEVER BEEN RETURNED ONCE, AND NOTHING SAID SO.
--
-- WHAT WAS MEASURED (branch, 2026-09-18, scripts/campaign-tests/w3_hist_c17.sql PART 6):
--
--   ERROR:  COALESCE types text and jsonb cannot be matched
--   CONTEXT: PL/pgSQL function history.who_could_see(...) line 30 at RETURN QUERY
--
-- The second arm of the union read the replayed document's visibility twice, in two types:
--
--   coalesce(((history.record_at(…)) -> 'data' ->> 'visibility'),     -- text
--            ((history.record_at(…)) -> 'visibility'))                 -- jsonb
--
-- `coalesce` has one type. Postgres settles that at PLAN time, so the failure is not a data
-- case reachable on some rows and not others: EVERY call of `history.who_could_see` raised
-- 42804 the moment the query was planned, on both databases, since the function was created.
-- The lane's own file authored it; nothing ran it; it landed and read as built.
--
-- This is why the exit clause is "the answer, quoted" and never "the function exists". A
-- function that always raises is indistinguishable from a working one by every census, every
-- catalogue query and every `check:` in the campaign.
--
-- THE FIX, AND IT IS SMALLER THAN THE DEFECT. Both arms are read as TEXT, and the two
-- conditions collapse into the one they were always trying to be: the record's visibility AS
-- THE REPLAY STATES IT, and only when the replay states it. `in (…)` over a NULL is NULL and
-- therefore false, so "the document said nothing" is excluded exactly as the old `is not null`
-- arm intended, with one read instead of four.
--
-- BASED ON, VERIFIED: the body below is `pg_get_functiondef(history.who_could_see)` as it
-- stands on the branch (2026-09-18), with only that union arm's WHERE clause changed. The
-- replay of the containment chain, the two `assert_watching` calls and the grants arm are
-- byte-identical to what `w3_hist_undo_and_replay.sql` applied.
--
-- ITS PROOF is `scripts/campaign-tests/w3_hist_c17.sql` PART 6 (c), which asks who could see a
-- record on a date and requires the principal a since-revoked grant named to be IN the answer.

create or replace function history.who_could_see(p_organization_id uuid, p_record_id uuid, p_at timestamptz)
returns table(principal_kind text, principal_id uuid, level text, via_kind text, via_id uuid)
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
declare
  v_doc     jsonb;
  v_node    uuid := p_record_id;
  v_depth   integer := 0;
  v_ceiling integer;
  v_chain   uuid[] := array[]::uuid[];
begin
  -- RULE 16, AND IT IS THE HARD HALF OF VIS-16. A replay of a window the store was not
  -- recording would be a guess with a query's confidence, so both halves must have been
  -- watching: the record's own versions AND the grant rows.
  perform history.assert_watching('custom.record', p_at);
  perform history.assert_watching('iam.permissions', p_at);

  -- THE GUARD, NAMED AND READ IN THE BODY (§6b.2). `custom/row_versions_guard` is the campaign
  -- switch for this store's writer: while it resolves false and the caller does not own the
  -- store, nothing has been written for this organization to replay FROM, and an audit answered
  -- out of a store that was not recording is the confident wrong answer VIS-16 exists to refuse.
  if not coalesce((platform.knob_resolve('custom', 'row_versions_guard', p_organization_id) #>> '{}')::boolean, false)
     and not history.capture_is_open(p_organization_id) then
    raise exception 'History is not recording for this organization, so there is nothing to replay.'
      using errcode = '42501',
            hint = 'custom/row_versions_guard resolves false and this caller does not own the store. Nothing was guessed at. The switch checklist turns the knob on; a caller never does.';
  end if;

  -- The CONTAINMENT CHAIN AS IT STOOD THEN — not as it stands now. A record moved into a
  -- different parent since D would otherwise be answered with today's parent's audience,
  -- which is the wrong answer to the only question anybody asks this for.
  v_ceiling := custom.containment_depth_ceiling(p_organization_id);
  loop
    v_chain := v_chain || v_node;
    v_doc := (history.record_at(p_organization_id, v_node, p_at)) -> 'data';
    exit when v_doc is null;
    v_node := nullif(v_doc ->> 'parent_id', '')::uuid;
    exit when v_node is null;
    exit when v_node = any (v_chain);          -- a loop in the past is still a loop
    v_depth := v_depth + 1;
    exit when v_depth > v_ceiling;
  end loop;

  return query
  -- (1) Everyone a grant named, on the record or on anything it was inside at the time.
  select case when g.granted_to_user_id is not null then 'user'
              when g.granted_to_organization_id is not null then 'organization'
              else 'public' end,
         coalesce(g.granted_to_user_id, g.granted_to_organization_id),
         g.level,
         case when c.node = p_record_id then 'record' else 'container' end,
         c.node
    from unnest(v_chain) as c(node)
    cross join lateral history.grants_at('record', c.node, p_at) g
  union
  -- (2) The organization's own members, when the record's visibility at the time let them
  --     see it. Visibility is read from the REPLAYED document, never from the live row — ONCE,
  --     and as text: the document may carry it at the top or inside `data`, and a `coalesce`
  --     over one of each was a plan-time type error that made this whole function unusable.
  --     `in (…)` over a NULL is false, so "the replay states nothing" excludes the member
  --     rung exactly as it should.
  select 'user', m.user_id, 'viewer', 'organization', p_organization_id
    from iam.organization_member m
   where m.organization_id = p_organization_id
     and coalesce((history.record_at(p_organization_id, p_record_id, p_at)) -> 'data' ->> 'visibility',
                  (history.record_at(p_organization_id, p_record_id, p_at)) ->> 'visibility')
         in ('internal', 'public');
end;
$fn$;

comment on function history.who_could_see(uuid, uuid, timestamptz) is
  'VIS-16: who could see this record on that date, answered by replaying History — the record''s own visibility and the containment chain AS THEY STOOD THEN, plus the grants as they stood then, including principals who have since lost access. No separate access-history store is kept. A moment History was not recording is refused by name rather than guessed at. The replayed visibility is read once, as text; reading it as two types made every call raise 42804 at plan time.';
