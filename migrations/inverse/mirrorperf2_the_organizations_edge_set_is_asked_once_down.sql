--
-- INVERSE of migrations/campaign/mirrorperf2_the_organizations_edge_set_is_asked_once.sql.
--
-- It puts the defect back and NOTHING else: the three bodies are the byte-for-byte
-- `pg_get_functiondef` output taken from the main database on 2026-09-21 immediately before the
-- migration was written, and the only objects it removes are the nine triggers that file
-- created, plus `platform.memo_clear_edge_inputs_stmt()`, which that file created for those
-- nine triggers and which nothing else on the database reaches. `platform.memo_clear_stmt()`
-- and `platform.memo_b_seat()` are untouched: this lane deliberately never adopted them.
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

-- 3. THE MEMO LANE FORGETS THE SLOT.
CREATE OR REPLACE FUNCTION platform.memo_clear()
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select set_config('mx_memo.v', '', true),
         set_config('mx_memo.s', '', true),
         set_config('mx_memo.b', '', true);
$function$

;

-- 4. THE NINE TRIGGERS THIS MIGRATION CREATED COME OFF, AND THEN THE FUNCTION IT CREATED FOR
--    THEM — in that order, so no trigger is ever left standing over a body that is gone.
drop trigger if exists zz_memo_clear_i on platform.association_types;
drop trigger if exists zz_memo_clear_u on platform.association_types;
drop trigger if exists zz_memo_clear_d on platform.association_types;
drop trigger if exists zz_memo_clear_i on custom.carrying_rule;
drop trigger if exists zz_memo_clear_u on custom.carrying_rule;
drop trigger if exists zz_memo_clear_d on custom.carrying_rule;
drop trigger if exists zz_memo_clear_i on custom.portal_table;
drop trigger if exists zz_memo_clear_u on custom.portal_table;
drop trigger if exists zz_memo_clear_d on custom.portal_table;
drop function if exists platform.memo_clear_edge_inputs_stmt();
