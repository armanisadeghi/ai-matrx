-- based-on: custom.visible_record_ids(uuid, permission_level) 23fc97ae4da88e8947de0e3cfa9533c5ad17a13c9239bc198b52df98e02041dd
-- based-on: custom.carrying_edges_in(uuid) 9b8391ef9c63899101897d2fe5602cbdda5c7df7a6cb23880be657f9b8fe2cbd
-- based-on: platform.memo_clear() 84095ae77c2585c60acdf31b2975d13cf7fbe255406febdfa06c8b80351a3657
--
-- INVERSE of migrations/campaign/mirrorperf2_the_organizations_edge_set_is_asked_once.sql.
--
-- It puts the defect back and NOTHING else. The two custom bodies below are the
-- `pg_get_functiondef` output taken from the main database on 2026-09-21, and they still hash to
-- production's current bodies (4b4e40a753ab… and a99682186e83…, re-measured 2026-09-23).
-- `platform.memo_clear()` is production's CURRENT body (section 3), and the nine triggers go back
-- to `platform.memo_clear_stmt()` (section 4). The only object it removes is
-- `platform.memo_clear_edge_inputs_stmt()`, which the up created and which nothing else reaches.
-- `platform.memo_b_seat()` is untouched: this lane deliberately never adopted it.
--
-- THE `-- based-on:` LINES are the bodies this file overwrites — the up's, as the up file stands
-- today, measured by running the up inside a rolled-back transaction on the dev clone
-- (2026-09-23). 🚨 The up itself cannot land as written: its own `-- based-on:` line for
-- `platform.memo_clear()` names 59a25537a63a…, and production's body has moved to c6470f278534…
-- (WRITE-PERF-3/4's `mx_memo.g` generation), so the runner refuses it by name. When the up is
-- re-based, re-run `pnpm db:based-on migrations/inverse/<this file>` for the memo_clear line.
--
-- REHEARSAL (lane INVERSE-GROUND, 2026-09-23, dev clone, one rolled-back transaction):
-- before → up → this file → up → this file. After each run of this file the three bodies hash
-- exactly as before the up and the nine triggers on platform.association_types,
-- custom.carrying_rule and custom.portal_table run platform.memo_clear_stmt again. The same run
-- with this file's previous bytes left memo_clear at 59a25537a63a… and all nine triggers gone.
--
-- After this file runs: `mx_memo.ce` is no longer cleared by anything, and nothing writes it,
-- because the only writer is the memoised `custom.carrying_edges_in` this file replaces.
--
-- 1. THE PAIR LOOP GOES BACK TO HASH ORDER.
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

-- 2. THE EDGE SET IS BUILT AGAIN ON EVERY CALL.
CREATE OR REPLACE FUNCTION custom.carrying_edges_in(p_organization_id uuid)
 RETURNS TABLE(container_type text, container_id uuid, item_type text, item_id uuid, conveys_max permission_level)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  return query
    -- arm 1 — platform.containment_edges
    select case when r.container_side = 'source' then a.source_type else a.target_type end,
           case when r.container_side = 'source' then a.source_id   else a.target_id   end,
           case when r.container_side = 'source' then a.target_type else a.source_type end,
           case when r.container_side = 'source' then a.target_id   else a.source_id   end,
           r.conveys_max
      from platform.associations a
      join platform.association_types r
        on r.source_type = a.source_type
       and r.target_type = a.target_type
       and (r.label is null or r.label = a.label)
     where a.deleted_at is null
       and r.is_active
       and r.container_side = any (array['source', 'target'])
       and (a.organization_id = p_organization_id or a.organization_id is null)
    union
    -- arm 2 — the custom.carrying_rule arm of custom.carrying_edges
    select case when cr.container_side = 'source' then a.source_type else a.target_type end,
           case when cr.container_side = 'source' then a.source_id   else a.target_id   end,
           case when cr.container_side = 'source' then a.target_type else a.source_type end,
           case when cr.container_side = 'source' then a.target_id   else a.source_id   end,
           cr.conveys_max
      from platform.associations a
      join custom.carrying_rule cr
        on cr.role = a.role
       and cr.is_active
     where a.deleted_at is null
       and (a.organization_id = p_organization_id or a.organization_id is null)
    union
    -- arm 3 — A PORTAL'S NAMING FIELD (PORTAL, 2026-09-20). The record the Field points at is
    -- the container; the record holding the Field is the item. This is what makes "only theirs"
    -- answerable without a per-portal query: an outsider holding her own client record reaches
    -- exactly the records that name it, at the level the portal declared, through the same
    -- ladder as everything else on this platform.
    select 'record'::text, a.target_id, 'record'::text, a.source_id, pt.conveys_max
      from platform.associations a
      join custom.portal_table pt on pt.names_via_field_id = a.relation_field_id
      join custom.portal p on p.id = pt.portal_id and p.is_active
     where a.deleted_at is null
       and a.organization_id = p_organization_id
       and pt.organization_id = p_organization_id
       and a.source_type = 'record'
       and a.target_type = 'record';
end
$function$

;

-- 3. THE MEMO LANE FORGETS THE SLOT — back to PRODUCTION'S body (hash c6470f278534…, main
--    database and dev clone, 2026-09-23), not the 2026-09-21 dump this file first carried. Since
--    that dump WRITE-PERF-3/4 added the `mx_memo.g` generation to this body; restoring the old
--    three-slot body would have stopped every `mx_memo.k*` slot from ever being cleared.
CREATE OR REPLACE FUNCTION platform.memo_clear()
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  -- The three blobs, byte for byte as before — and the generation, which is what makes an O(1)
  -- clear of every `mx_memo.k*` slot possible at all. `clock_timestamp()` and not `now()`: two
  -- clears inside one transaction must produce two different generations.
  select pg_catalog.set_config('mx_memo.v', '', true),
         pg_catalog.set_config('mx_memo.s', '', true),
         pg_catalog.set_config('mx_memo.b', '', true),
         pg_catalog.set_config('mx_memo.g',
           md5(clock_timestamp()::text || random()::text), true);
$function$

;

-- 4. THE NINE TRIGGERS GO BACK TO THE MEMO LANE'S OWN BODY, AND THEN THE FUNCTION THIS
--    MIGRATION CREATED FOR THEM IS DROPPED — in that order, so no trigger is ever left standing
--    over a body that is gone.
--
--    NOT `drop trigger` (amended 2026-09-23, lane INVERSE-GROUND). SHARE-REVOKE
--    (sharerevoke_every_table_the_ladder_reads_empties_the_memo.sql, on production since
--    2026-09-23) put `zz_memo_clear_i/_u/_d` → `platform.memo_clear_stmt()` on these same three
--    tables, and the up above REPLACES those triggers with its own. Dropping them here would
--    take SHARE-REVOKE's clear off `platform.association_types`, `custom.carrying_rule` and
--    `custom.portal_table` and put that lane's defect back (a revoked share stays "open" for the
--    rest of the statement). So they are re-pointed at `platform.memo_clear_stmt()` — exactly
--    what production held before the up. Written out, never built at runtime, so both runners'
--    window-class judgement reads every statement; `create or replace trigger` does not fire the
--    supautils hook. On a database that never had SHARE-REVOKE (an old branch) this leaves nine
--    extra statement-level memo clears behind: a clear is always safe, it costs a GUC write.
--
-- ground-standing-ok: c — the static tree orders SHARE-REVOKE's file after this lane's
-- unapplied up, so it reads `platform.memo_clear_edge_inputs_stmt` as run by no trigger. After
-- the up it IS run by these nine triggers; the statements just above take every one of them off
-- it first, and the body the live triggers then call, `platform.memo_clear_stmt` →
-- `platform.memo_clear`, is the one section 3 restores.
do $pre$
begin
  if to_regprocedure('platform.memo_clear_stmt()') is null then
    raise exception 'MIRROR-PERF-2 inverse: platform.memo_clear_stmt() does not exist on this database, so the nine triggers have no memo-lane body to go back to. Nothing was changed.';
  end if;
end
$pre$;

create or replace trigger zz_memo_clear_i after insert on platform.association_types
  for each statement execute function platform.memo_clear_stmt();
create or replace trigger zz_memo_clear_u after update on platform.association_types
  for each statement execute function platform.memo_clear_stmt();
create or replace trigger zz_memo_clear_d after delete on platform.association_types
  for each statement execute function platform.memo_clear_stmt();

create or replace trigger zz_memo_clear_i after insert on custom.carrying_rule
  for each statement execute function platform.memo_clear_stmt();
create or replace trigger zz_memo_clear_u after update on custom.carrying_rule
  for each statement execute function platform.memo_clear_stmt();
create or replace trigger zz_memo_clear_d after delete on custom.carrying_rule
  for each statement execute function platform.memo_clear_stmt();

create or replace trigger zz_memo_clear_i after insert on custom.portal_table
  for each statement execute function platform.memo_clear_stmt();
create or replace trigger zz_memo_clear_u after update on custom.portal_table
  for each statement execute function platform.memo_clear_stmt();
create or replace trigger zz_memo_clear_d after delete on custom.portal_table
  for each statement execute function platform.memo_clear_stmt();

drop function if exists platform.memo_clear_edge_inputs_stmt();
