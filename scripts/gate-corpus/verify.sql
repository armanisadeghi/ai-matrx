-- ============================================================================
-- THE GATE ASSERTIONS AND THE DIFF (THE PLAN v4 §6.2)
--
-- §6.2: "An empty or partial corpus fails the gate; it does not pass it
-- quietly." So coverage is asserted BEFORE any answer is compared, and a
-- missing arm, a missing rung or a missing shape raises. Only then are the live
-- functions asked, and every disagreement with the manifest is listed.
--
-- Run after seed.sql, on the same branch.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Coverage. The gate's precondition.
-- ---------------------------------------------------------------------------
do $$
declare
  v_missing_arms text;
  v_missing_rungs text;
  v_missing_shapes text;
  v_shapes text[] := array['library','curator','home','org lanes','public','system org',
                           'ladder','membership','assignment','containment','two homes',
                           'two hop','loop','detail','shared on none'];
begin
  select string_agg(a::text, ', ' order by a) into v_missing_arms
  from generate_series(1,16) a
  where not exists (select 1 from corpus.corpus_manifest m where m.arm = a and m.expected);

  select string_agg(l::text, ', ') into v_missing_rungs
  from unnest(array['viewer','editor','admin']::permission_level[]) l
  where not exists (select 1 from corpus.corpus_manifest m where m.required = l and m.expected);

  select string_agg(s, ', ') into v_missing_shapes
  from unnest(v_shapes) s
  where not exists (select 1 from corpus.corpus_manifest m where m.shape = s);

  if v_missing_arms is not null then
    raise exception 'GATE FAILS — arms with no non-empty coverage: %', v_missing_arms;
  end if;
  if v_missing_rungs is not null then
    raise exception 'GATE FAILS — ladder rungs with no non-empty coverage: %', v_missing_rungs;
  end if;
  if v_missing_shapes is not null then
    raise exception 'GATE FAILS — shapes absent from the corpus: %', v_missing_shapes;
  end if;
  if not exists (select 1 from corpus.corpus_manifest where not expected) then
    raise exception 'GATE FAILS — the corpus asserts no negative answer, so it cannot catch a gain';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Ask the live functions, pair by pair.
--
-- Through a trap, deliberately. The corpus found that the live kernel RAISES on
-- a carrying loop (`54001 stack depth limit exceeded`) instead of answering, so
-- a bare call would abort the whole comparison at the first looped pair and
-- hide the other fifty answers. A raise is recorded as a third outcome — never
-- swallowed, never read as "false".
-- ---------------------------------------------------------------------------
create or replace function corpus.ask(
  p_user uuid, p_type text, p_id uuid, p_required permission_level, p_include_public boolean,
  out answer boolean, out err_code text, out err_message text
) returns record language plpgsql as $$
begin
  answer := iam.has_access_for_base(p_user, p_type, p_id, p_required, p_include_public);
exception when others then
  answer := null;
  err_code := sqlstate;
  err_message := left(sqlerrm, 200);
end $$;

drop table if exists corpus.corpus_result;
create table corpus.corpus_result as
select m.arm, m.arm_name, m.shape, m.principal_name, m.record_type, m.record_id,
       m.required, m.include_public, m.expected,
       a.answer as actual, a.err_code, a.err_message, m.why
from corpus.corpus_manifest m
cross join lateral corpus.ask(m.principal, m.record_type, m.record_id, m.required, m.include_public) a;

alter table corpus.corpus_result add column agrees boolean
  generated always as (expected is not distinct from actual) stored;

-- The report itself is printed by run.ts, which owns the formatting: this file
-- stays pure SQL so it can be sent as one statement batch by any client.
