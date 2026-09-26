-- chair-step: rule-27 rehearsal inverse of rehearsal/vridprune_the_record_set_skips_organizations_a_person_has_no_way_into.sql — puts back the pre-VRID-PRUNE body of custom.visible_record_ids verbatim, which walks every (organization, Table) pair on the database again (25-38 s per person on production). Same answers; only the cost returns. Never needed on production except to rule the prune out while diagnosing a refusal.
-- based-on: custom.visible_record_ids(uuid, permission_level) 49b469f255f0f07108f7fa258d28d384bb826385faafff1f3cc548014a205024
--
-- The body below is pg_get_functiondef(custom.visible_record_ids) as it stood on production on
-- 2026-09-25 (sha256 a99682186e83ae0581e5708b4d9cfe5f9c2af9f7c17b8a10a4289aeab8c6d5b1).

set local lock_timeout = '2s';

CREATE OR REPLACE FUNCTION custom.visible_record_ids(p_user_id uuid, p_required permission_level DEFAULT 'viewer'::permission_level)
 RETURNS TABLE(id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$

;
