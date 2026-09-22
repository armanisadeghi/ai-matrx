-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.portals(uuid) cd45008869c2b5f963b679b33e7b9ae05a82ca2377c9175ee8e093d93e25d399
-- based-on: custom.read_records_archived(uuid, uuid, text, boolean, integer, integer) f3a603afeecaaee9fec9840d5a35af310823e1039072c32ec2902e3d8e6b2bf7
--
-- DOORS-DECIDE-3 — A DOOR THAT DECIDES THROUGH A DELEGATE DECIDES NOWHERE THE GUARD CAN SEE.
--
-- `pnpm check:store-doors-decide` has been RED on these two doors, reported by several lanes
-- as pre-existing and owned by none of them:
--
--   [FAIL] client doors taking an organization id that never decide the caller - 2:
--          custom.portals(p_organization_id uuid)
--          custom.read_records_archived(p_organization_id uuid, p_table_id uuid, ...)
--   [FAIL] declared client doors whose body never goes through the one ladder - 2:  (the same two)
--
-- THE DIAGNOSIS, one per door, read off the live bodies on the main database:
--
--   custom.portals(uuid) is a two-line wrapper: `return query select * from
--     custom.list_portals(p_organization_id, 'active')`. `custom.list_portals` DOES decide —
--     `perform custom.assert_client_may_reach(...)` on its first line, then
--     `custom.has_visibility(..., 'viewer')` as a conjunct on every row it returns. So the
--     ACCESS was never open. What was open is the thing the guard exists to refuse: the
--     decision lives in a delegate, so nothing in this door's own body says who may knock,
--     and the day `list_portals` is edited, re-pointed or shadowed, this door silently
--     becomes the hole. The guard reads ONE body at a time, on purpose.
--
--   custom.read_records_archived(...) is the same class one level deeper. It decides through
--     `custom.assert_may_know_table` (whose own first act, after its memo, is `perform
--     custom.assert_client_may_reach`), and it decides the ROW through
--     `custom.visible_predicate_sql(...)` interpolated into a statement built with `format`
--     and run with `execute`. Both are real decisions and both are invisible to a census that
--     reads the body's text: a ladder spelled inside a `%3$s` placeholder is not a ladder
--     anybody can prove from the catalogue. This is exactly what lane DRILL hit and fixed the
--     same way — ask the organization wall BY NAME, in the door's own body, as
--     `custom.record_aggregate` does on its first line before it builds its `agg_sql`.
--
-- Neither door's answer changes for anybody. `custom.assert_client_may_reach` is the same
-- wall both doors already reached one call later, and `custom.assert_may_know_table` memoises
-- its yes per transaction (`platform.memo_get('w:k:…')`), so a member pays for it once and a
-- stranger is refused one call earlier, by the same sentence, with the same SQLSTATE.
--
-- This file replaces two bodies and nothing else: no table, column, grant, door row, kernel
-- row or delegate is touched. The inverse is the two bodies exactly as they stand today,
-- which is what the two `-- based-on:` hashes above pin.

CREATE OR REPLACE FUNCTION custom.portals(p_organization_id uuid)
 RETURNS TABLE(portal_id uuid, title text, slug text, client_table_id uuid, client_table text, is_active boolean, tables integer, invited integer, signed_in integer, sign_in_method text, opened_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  -- THE WALL, IN THIS DOOR'S OWN BODY. custom.list_portals asks the same line and then
  -- narrows every row by custom.has_visibility at viewer, so this changes no answer — it
  -- makes the decision belong to the door a client can actually execute, instead of being
  -- borrowed from a delegate the guard cannot see through. (DOORS-DECIDE-3, 2026-09-22.)
  perform custom.assert_client_may_reach(p_organization_id, 'custom.portals');
  return query select * from custom.list_portals(p_organization_id, 'active');
end $function$;

comment on function custom.portals(uuid) is
  'PORTALS: the live portals of one organization. Decides in its OWN body — custom.assert_client_may_reach for the organization wall — and then delegates to custom.list_portals, which asks the same wall again (memoised) and returns only portals whose client Table the caller may open at viewer, so a portal is never evidence that a Table exists.';

CREATE OR REPLACE FUNCTION custom.read_records_archived(p_organization_id uuid, p_table_id uuid, p_lane text DEFAULT 'org'::text, p_by_id boolean DEFAULT false, p_limit integer DEFAULT 200, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, document jsonb, level permission_level, archived_at timestamp with time zone, archived_by uuid, archived_by_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me       uuid := auth.uid();
  v_rec      record;
  v_level    public.permission_level;
  v_visible  text[];
  v_declared text[];
  v_notices  jsonb;
  v_key_ids  jsonb;
  v_limit    integer;
  v_lane     text := lower(coalesce(p_lane, 'org'));
  v_lane_sql text;
  v_sql      text;
begin
  if v_me is null then
    raise exception 'Nobody is signed in, so there is nothing to read.'
      using errcode = '42501',
            hint = 'DOOR-1: the read door resolves the reader from the session and takes no principal argument. Sign in, or call it from a lane that carries a person.';
  end if;

  -- THE ORGANIZATION WALL, ASKED BY NAME, BEFORE ANYTHING IS READ. This door decided the
  -- organization through custom.assert_may_know_table and the row through a
  -- custom.visible_predicate_sql placeholder inside a `format`-built statement: both real,
  -- neither legible to a census that reads a body. custom.record_aggregate asks this same
  -- line before it builds its statement, for the same reason. The yes is memoised per
  -- transaction, so the member below pays nothing twice. (DOORS-DECIDE-3, 2026-09-22.)
  perform custom.assert_client_may_reach(p_organization_id, 'custom.read_records_archived');

  -- THE LANE IS VOCABULARY, NOT A FREE STRING. An unknown word is refused by name; answering
  -- it as 'org' would quietly show a person more than they asked for.
  if v_lane not in ('mine', 'org') then
    raise exception 'custom.read_records_archived: "%" is not a lane', p_lane
      using errcode = '22023',
            hint = 'Two lanes: "mine" (what I archived) and "org" (what anybody in this organization archived).';
  end if;

  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.read_records_archived');
  v_limit := custom.page_size(p_organization_id, 'custom.read_records_archived', p_limit, 200);

  v_level := custom.effective_level(v_me, p_organization_id, p_table_id);

  select coalesce(array_agg(f.field_key), '{}'::text[])
    into v_visible
    from iam.visible_field_ids(v_me, p_organization_id, p_table_id, v_level, 'read') f;

  select coalesce(jsonb_object_agg(f.data ->> 'key', custom.hidden_field_notice(f, 'read')), '{}'::jsonb),
         coalesce(jsonb_object_agg(f.data ->> 'key', f.id::text), '{}'::jsonb),
         coalesce(array_agg(f.data ->> 'key'), '{}'::text[])
    into v_notices, v_key_ids, v_declared
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = p_table_id;

  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
    into v_notices
    from jsonb_each(v_notices) e
   where not (e.key = any (v_visible));

  -- THE LANE, AS A PREDICATE OVER THE SET THE LADDER ALREADY ALLOWED. `mine` narrows; it
  -- cannot widen, because it is an additional conjunct beside custom.visible_predicate_sql.
  v_lane_sql := case when v_lane = 'mine'
                     then format('a.who = %L::uuid', v_me)
                     else 'true' end;

  -- ONE STATEMENT. Visibility, the lane, the archive test and the page in the same WHERE.
  -- Nothing here is built from a caller's bytes: the only interpolated values are two uuids
  -- this function resolved itself, two integers, and predicates this database wrote.
  v_sql := format($q$
    select r.id,
           custom.record_values_of(r) as doc,
           r.deleted_at               as archived_at,
           a.who                      as archived_by,
           p.nm                       as archived_by_name
      from custom.record r
      cross join lateral (select custom.record_archiver(%1$L::uuid, r.id) as who) a
      left join lateral (
             select coalesce(nullif(u.raw_user_meta_data ->> 'display_name', ''),
                             nullif(u.raw_user_meta_data ->> 'full_name', ''),
                             split_part(u.email::text, '@', 1)) as nm
               from iam.organization_member m
               join auth.users u on u.id = m.user_id
              where m.organization_id = %1$L::uuid
                and m.user_id = a.who
              limit 1) p on true
     where r.organization_id = %1$L::uuid
       and r.table_id = %2$L::uuid
       and r.deleted_at is not null
       and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
       and %3$s
       and %4$s
     order by r.deleted_at desc
     limit %5$s offset %6$s
  $q$,
    p_organization_id, p_table_id,
    custom.visible_predicate_sql(v_me, p_organization_id, p_table_id,
                                 'viewer'::public.permission_level, 'r'),
    v_lane_sql,
    v_limit, greatest(coalesce(p_offset, 0), 0));

  for v_rec in execute v_sql loop
    id               := v_rec.id;
    document         := custom.choice_render(p_organization_id, p_table_id,
                          custom.mask_document(v_rec.doc, v_visible, v_notices, p_by_id, v_key_ids, v_declared));
    level            := v_level;
    archived_at      := v_rec.archived_at;
    archived_by      := v_rec.archived_by;
    archived_by_name := v_rec.archived_by_name;
    return next;
  end loop;
end;
$function$;

comment on function custom.read_records_archived(uuid, uuid, text, boolean, integer, integer) is
  'ARCHIVE: the archived records of one Table, in the `mine` or `org` lane. Decides in its OWN body — custom.assert_client_may_reach for the organization wall on the first line after the session check, then custom.assert_may_know_table for this Table, then custom.visible_predicate_sql at viewer as a conjunct on every row of the one built statement. Fields the caller may not read are masked by custom.mask_document rather than omitted.';
