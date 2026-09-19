-- STORE-ASOF (1 of 4) — ASKING ABOUT ONE RECORD COSTS ONE RECORD (T13, rule 9).
--
-- THE DEFECT, READ OUT OF THE BODY RATHER THAN INFERRED. `custom.query_can_see` answered
-- "may I see THIS row" by calling `custom.query_visible_ids(organization, NULL, required)`
-- — the list-everything door, with no Table filter — and then checking whether the single id
-- asked about appeared in the result. That walks EVERY live record in the organization and
-- puts each one up the visibility ladder, to answer a question about one row.
--
-- MEASURED ON THE MAIN DATABASE, 2026-09-19, SELECT-only, as a real member of the largest
-- organization that has one (301 live records, EXPLAIN ANALYZE from that member's seat):
--   before  328.476 ms   ~1.09 ms per live record in the organization
--   after    19.743 ms   flat: one primary-key lookup plus that row's own carriers
-- At 100,000 records the old shape is ~109 seconds — which is why the fail-closed-under-load
-- test could never be run through it. The new shape does not read the organization at all.
--
-- WHY NO INDEX IS ADDED. The rewrite makes the question O(that row's carriers), and every
-- lookup it then makes is already indexed: `custom.record` is keyed `(organization_id, id)`,
-- and `custom.visibility_ancestors` walks `custom.carrying_edges`, whose two arms hit
-- `idx_assoc_source_live` and `idx_assoc_target_live`. An index added on top of a walk that
-- no longer happens would be ceremony, not a fix.
--
-- IT IS THE SAME ANSWER, NOT A CHEAPER DIFFERENT ONE. Every clause of the old path is kept,
-- in the same order and asked of the same functions: the organization wall first
-- (`custom.assert_client_may_reach`), then the row's own liveness and DOOR-17 quarantine
-- filter, then THE ONE LADDER — `custom.has_visibility` at the same threshold, or the
-- campaign's own maintenance lane judged by the role exactly as `query_visible_ids` judges
-- it. `custom.query_visible_ids` itself is untouched: listing what you can see is genuinely
-- a question about every record, and this file does not pretend otherwise.
--
-- ADDITIVE: one CREATE OR REPLACE of a function this campaign wrote, no signature change, no
-- grant change, no door row change. Every caller keeps calling it with the same arguments and
-- gets the same booleans.
--
-- INVERSE: migrations/inverse/asof_one_record_is_one_question_down.sql

-- based-on: custom.query_can_see(uuid, uuid, text) 6997c4cd91a2f00b338fe3ac684b2ff3d344a6cd41c6cc0f56ce5cfc9a6cc097

set lock_timeout = '5s';
set statement_timeout = '120s';

create or replace function custom.query_can_see(p_organization_id uuid, p_record_id uuid, p_required text default 'viewer')
returns boolean
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_user uuid := custom.query_principal();
  v_ok   boolean;
begin
  -- THE WALL, before any row is fetched, exactly as before.
  perform custom.assert_client_may_reach(p_organization_id, 'custom.query_can_see');

  if p_record_id is null then
    return false;
  end if;

  -- ONE ROW. The primary key is (organization_id, id), so this is a single partition probe,
  -- and `custom.has_visibility` is then asked about that one record only — which is what the
  -- question was in the first place.
  select true into v_ok
    from custom.record r
   where r.organization_id = p_organization_id
     and r.id = p_record_id
     and r.deleted_at is null
     -- DOOR-17: a quarantined submission is invisible to every read until a Rule clears it.
     and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
     -- THE ONE LADDER, the same rung `custom.query_visible_ids` climbs per row. A connection
     -- with no principal at all is the campaign's own maintenance and is judged by the role.
     and ((v_user is null and custom.query_is_store_owner())
          or custom.has_visibility(v_user, 'record', r.id, p_required::public.permission_level));

  return coalesce(v_ok, false);
end;
$fn$;

comment on function custom.query_can_see(uuid, uuid, text) is
  'T13 / REC-9: may this principal see THIS record. O(that record''s carriers), never O(the organization) — measured on the main database 2026-09-19 at 328.476 ms before and 19.743 ms after, from a real member''s seat in a 301-record organization.';
