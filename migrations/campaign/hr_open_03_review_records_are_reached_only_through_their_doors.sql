-- chair-step: lane HR-SCHEMA-OPEN. REVOKEs every client table privilege on hr.review, hr.review_response and hr.review_peer_nomination (authenticated held SELECT/INSERT/UPDATE/DELETE; anon held none). No policy, function or data row changes; the tables are reached only through the hr_review_* SECURITY DEFINER doors.
-- lane: HR-SCHEMA-OPEN
--
-- hr_open_03 — REVIEW RECORDS ARE REACHED ONLY THROUGH THEIR DOORS (Wave X, PUBLIC-PLACEMENT.md §2.1 step 2:
-- "make the relation doors-only by revoking client table grants").
--
-- Found by the independent leak probe after hr_open_02 exposed `hr`: the three tables' std_select arm
-- `organization_id IN (SELECT iam.my_orgs())` let any member of the organization read every row
-- straight over REST — overall and calibrated ratings, calibration notes, written answers and peer
-- nominations — skipping the seat and blind rules the doors enforce. The tables were empty.
--
-- Safe to cut, measured 2026-10-10:
--   * no frontend code reads these tables directly (grep of features/ packages/ app/ lib/: only doors);
--   * every client path is an hr_review_* door: SECURITY DEFINER, owned by postgres;
--   * the only invoker function naming them (hr._rev_review_goal_ids) is called from inside those doors;
--   * no policy on any other table and no view reads them; the only FKs are between the three.
-- hr.goal is deliberately untouched (org-wide goal reads are by design, hr._goal_can_read).
-- Inverse: migrations/inverse/hr_open_03_review_records_are_reached_only_through_their_doors_down.sql

revoke all on table hr.review, hr.review_response, hr.review_peer_nomination from authenticated, anon;

do $chk$
declare v text;
begin
  select string_agg(format('%s:%s', t, r), ', ') into v
    from unnest(array['hr.review', 'hr.review_response', 'hr.review_peer_nomination']) t,
         unnest(array['authenticated', 'anon']) r
   where has_table_privilege(r, t, 'SELECT,INSERT,UPDATE,DELETE')
      or has_any_column_privilege(r, t, 'SELECT,INSERT,UPDATE');
  if v is not null then raise exception 'hr_open_03: client privilege still held: %', v; end if;
end $chk$;
