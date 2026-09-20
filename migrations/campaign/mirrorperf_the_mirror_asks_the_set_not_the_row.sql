-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.visible_record_ids(uuid, permission_level) 6df19262f86aff0cbc78755b0e7c0e7e1da14761c9031867621da918993d7445
-- based-on: custom.visible_set(uuid, uuid, uuid, permission_level) d82d8f6ef5a20aa2234123115fd01064ad55a81d2029a72363e0a39dd17bbb27
-- based-on: custom.visible_predicate_sql(uuid, uuid, uuid, permission_level, text) 64940bbe02edc01cf793690e471344b67982060007a38cf4e86e7efc22e2c961
-- based-on: custom.has_visibility(uuid, text, uuid, permission_level) a62d4e0e3499c9c104702b7cabaa0ce6e311173c32e6672f9affe53643acbf00
--
-- MIRROR-PERF — THE ONE FUNCTION THE RLS MIRROR REACHES ASKS THE SET, NOT THE ROW.
--
-- THE DEFECT, MEASURED ON THE MAIN DATABASE 2026-09-20. `custom.visible_record_ids` was one
-- SQL statement:
--
--     select r.id from custom.record r
--      where p_user_id is not null and r.deleted_at is null
--        and custom.has_visibility(p_user_id, 'record', r.id, p_required);
--
-- — the per-row ladder over EVERY record on the database, with no organization and no Table to
-- bound it. It is not a back road: `iam.accessible_entity_ids('record', ...)` returns exactly
-- this set while the `custom/accessible_entity_ids_guard` knob resolves true, and the RLS
-- mirror `iam.entity_read_expr('custom','record','record')` puts that call in its last arm. So
-- every caller of the mirror — and census 12 of `pnpm check:store-doors-decide`, which
-- evaluates the mirror's own text — pays one ladder walk per record that exists.
--
-- Timed live, one member, `viewer`, over 4,118 live records:
--
--     custom.visible_record_ids(34ed4fc3-…)  1,811 ids in 43,182 ms
--     custom.visible_record_ids(4060701e-…)  3,294 ids in 21,012 ms
--     custom.visible_record_ids(3adf47c5-…)  1,785 ids in 43,002 ms
--
-- and the mirror evaluated for one of those members over the four `shared_only` organizations
-- took 43,891 ms, of which 630 ms was the per-row `iam.has_access` conjunct and the whole of
-- the rest was this function.
--
-- WHAT THIS FILE DOES. The same answer, asked the way the read doors ask it: once per caller
-- per (organization, Table), through `custom.visible_set` — the set-based form READ-PERF built
-- and SHARED-ONLY taught the member-visibility knob — rendered by `custom.visible_predicate_sql`
-- into the WHERE of one scan per pair. Nothing is reimplemented and no second ladder is built:
-- `custom.has_visibility` is still the only thing that decides, and `custom.visible_set` is
-- still the only thing that decides how few times to ask it. Where `custom.visible_set` says it
-- cannot answer set-based (`o_fallback`), `custom.visible_predicate_sql` emits the per-row
-- ladder verbatim for that pair alone — so the rows this function used to walk one at a time
-- are still walked one at a time exactly where the set form declines, and nowhere else.
--
-- IT IS THE SAME SET, AND THAT IS MEASURED, NOT ASSERTED. Both forms were run side by side on
-- the main database for every one of the six members census 12 judges: 1,811 / 3,294 / 1,785 /
-- 1,785 / … ids, sorted, identical arrays, every member. Census 12 itself is the standing proof
-- — it compares this very function's answer (through the mirror text) against the one ladder
-- and the read door, per (member, record) pair, in every `shared_only` organization.
--
-- MEMOISED PER STATEMENT, BY BEING STABLE AND BY NOT BEING CORRELATED. The mirror's last arm
-- reads `id in (select iam.unnest_uuids(iam.accessible_entity_ids('record', 'viewer', 0, true))
-- union …)`. Nothing in that subquery mentions the outer row, so PostgreSQL hoists it into an
-- InitPlan and runs it ONCE per statement — `EXPLAIN (ANALYZE)` on a member's direct read under
-- the policy shows `InitPlan … (never executed)`/`loops=1`, never `loops=<rows>`. The gain this
-- file makes is therefore per statement, not per row, for every client that ever reads
-- `custom.record` directly.
--
-- WHAT IT DOES NOT DO. It does not make one ladder call cheaper. `custom.has_visibility` costs
-- ~16 ms for an ordinary record and ~43 ms for a Table row (arm 4, "a Table you can see
-- something inside is a Table you may know"), against ~1.5 ms for `iam.has_access_for` — so
-- what is left of this function's time is `custom.visible_set`'s bounded calls, and closing THAT
-- is a change to `custom.reaches_directly`'s ancestor walk, which is not this file's.

create or replace function custom.visible_record_ids(
  p_user_id  uuid,
  p_required public.permission_level default 'viewer'::public.permission_level
)
returns table(id uuid)
language plpgsql
stable
security definer
set search_path to ''
as $fn$
declare
  v_pair record;
  v_pred text;
begin
  -- NO PRINCIPAL, NO SET. The old body said this with `p_user_id is not null` inside the WHERE;
  -- saying it here keeps `custom.visible_predicate_sql`'s own no-principal arm (which judges the
  -- campaign's maintenance connection by its ROLE) out of a function whose whole job is to
  -- answer for a PERSON.
  if p_user_id is null then
    return;
  end if;

  -- ONE PAIR AT A TIME, AND THE PAIRS ARE THE STORE'S OWN. A record lives in exactly one
  -- (organization, Table), so these groups partition the live rows: no row is asked about twice
  -- and none is missed. `table_id` may be null — `is not distinct from` is what keeps those rows
  -- in their own group rather than dropping them, and `custom.visible_set` says of that group
  -- that it cannot answer set-based, which puts the per-row ladder back for exactly those rows.
  for v_pair in
    select r.organization_id as org, r.table_id as tbl
      from custom.record r
     where r.deleted_at is null
     group by r.organization_id, r.table_id
  loop
    -- THE READ DOOR'S OWN PREDICATE, BUILT THE WAY THE READ DOOR BUILDS IT. This is the whole
    -- point of the file: the set form and this function cannot drift, because there is only one
    -- of them. `custom.visible_predicate_sql` emits `true` when the whole pair is visible, the
    -- four-arm set expression when it is not, and the per-row ladder verbatim when
    -- `custom.visible_set` declines.
    v_pred := custom.visible_predicate_sql(p_user_id, v_pair.org, v_pair.tbl, p_required, 'r');

    return query execute format(
      'select r.id from custom.record r'
      || ' where r.organization_id = %L::uuid'
      || '   and r.table_id is not distinct from %L::uuid'
      || '   and r.deleted_at is null'
      || '   and (%s)',
      v_pair.org, v_pair.tbl, v_pred);
  end loop;

  return;
end;
$fn$;

comment on function custom.visible_record_ids(uuid, public.permission_level) is
  'MIRROR-PERF (2026-09-20): every live record this person reaches at p_required, asked ONCE '
  'per (organization, Table) through custom.visible_set — the same set the read doors are built '
  'from — instead of once per row. iam.accessible_entity_ids returns this set while '
  'custom/accessible_entity_ids_guard is on, and iam.entity_read_expr puts it in the RLS '
  'mirror''s last arm, so the cost of a direct read is one visibility computation per statement '
  'rather than one per row. Census 12 of check:store-doors-decide is the standing parity proof.';
