-- chair-step: puts custom.read_records_archived and custom.archived_tables_everywhere back to the bodies they had before tableactions_a_the_archived_tables_list_asks_only_the_organizations_on_its_page.sql: the archived tables list again asks every organization holding an archived Table, and the archiver is asked for every archived row before the page is cut. Same signatures and grants.
-- lane: TABLE-ACTIONS
-- lock: custom
-- based-on: custom.read_records_archived(uuid, uuid, text, boolean, integer, integer) 5a37758f045e6b746035d6da0917760ee2f1193e45ed50e94ad6697508eeb9fc
-- based-on: custom.archived_tables_everywhere(text, integer, integer) 0a0529639acec1df5b23a48330e396699977c27bb05f70fe9360bee128601c3c
--
-- Inverse of migrations/campaign/tableactions_a_the_archived_tables_list_asks_only_the_organizations_on_its_page.sql: puts back the two bodies exactly as production had them
-- before (read_records_archived cae97bdf…, archived_tables_everywhere 85fadb80…).

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
  v_mask     jsonb;
  v_limit    integer;
  v_lane     text := lower(coalesce(p_lane, 'org'));
  v_lane_sql text;
  v_sql      text;
  v_count    integer;   -- CHAIR-DOORS-3A: the count-only answer
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

  -- A COUNT, THROUGH THIS DOOR'S OWN WHERE (CHAIR-DOORS-3A, asked by lane 9 SCOPES-ON-THE-STORE).
  -- custom.count_records_archived names the caller in the statement memo before it asks this door
  -- once per Table; this door then answers ONE row whose document is {"archived_count": n}, n being
  -- count(*) of exactly the rows the page below would have listed - the same wall, the same Table
  -- decision, the same ladder predicate, the same "Only me" list rule, the same lane, the same
  -- quarantine test - with no rendering, no mask, no level and no archiver lookup (the "mine" lane
  -- alone still asks custom.record_archiver, because it IS the lane). The count lives here and not in
  -- a door of its own because this WHERE reads the row column T-13 retires, which only the readers
  -- platform._t13_allowlist already names may read, and that list only shrinks.
  if platform.memo_k_get('custom.archived_count_only:' || v_me::text) = '1' then
    execute format($q$
      select count(*)::integer
        from custom.record r
       where r.organization_id = %1$L::uuid
         and r.table_id = %2$L::uuid
         and r.deleted_at is not null
         and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
         and %3$s
         and %4$s
    $q$,
      p_organization_id, p_table_id,
      custom.visible_predicate_sql(v_me, p_organization_id, p_table_id,
                                   'viewer'::public.permission_level, 'r')
      || format(' and platform.shown_to_lists(r.shown_to, r.visibility, r.created_by, r.organization_id, %L::uuid, %L::jsonb)',
                v_me, custom._record_shown_to_ctx(array[p_organization_id], p_table_id)),
      case when v_lane = 'mine'
           then format('custom.record_archiver(%L::uuid, r.id) = %L::uuid', p_organization_id, v_me)
           else 'true' end)
      into v_count;
    id               := null;
    document         := jsonb_build_object('archived_count', v_count);
    level            := null;
    archived_at      := null;
    archived_by      := null;
    archived_by_name := null;
    return next;
    return;
  end if;
  v_limit := custom.page_size(p_organization_id, 'custom.read_records_archived', p_limit, 200);

  v_level := custom.effective_level(v_me, p_organization_id, p_table_id);

  -- READ-MASK-ONCE: the field mask is the one door's answer, asked once per statement for this
  -- (person, organization, Table, level) and memoised — never worked out here a second way.
  v_mask := custom.read_mask_for(v_me, p_organization_id, p_table_id, v_level, 'read');
  select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_visible
    from jsonb_array_elements(v_mask -> 'visible') x;
  select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_declared
    from jsonb_array_elements(v_mask -> 'declared') x;
  -- Only the fields that are actually hidden carry a notice; every declared field carries its id.
  v_notices := v_mask -> 'notices';
  v_key_ids := v_mask -> 'all_key_ids';

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
           custom.record_values_of(r) as doc, r.data -> '_values' as wv_values, r.data -> '_sources' as wv_sources,
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
     order by r.deleted_at desc, r.id
     limit %5$s offset %6$s
  $q$,
    p_organization_id, p_table_id,
    custom.visible_predicate_sql(v_me, p_organization_id, p_table_id,
                                 'viewer'::public.permission_level, 'r')
    -- ONLY-ME-LISTED (2026-10-02): the archive is a LIST too; an "Only me" row stays its owner's alone here.
    || format(' and platform.shown_to_lists(r.shown_to, r.visibility, r.created_by, r.organization_id, %L::uuid, %L::jsonb)',
              v_me, custom._record_shown_to_ctx(array[p_organization_id], p_table_id)),
    v_lane_sql,
    v_limit, greatest(coalesce(p_offset, 0), 0));

  for v_rec in execute v_sql loop
    id               := v_rec.id;
    document         := custom.choice_render(p_organization_id, p_table_id,
                          custom.mask_document(v_rec.doc, v_visible, v_notices, p_by_id, v_key_ids, v_declared));
    -- BIG-VALUES-READERS: a value kept as a file carries its pointer, so every reader finds it.
    document := custom.with_whole_value_pointers(document, v_rec.wv_values, v_rec.wv_sources, v_visible, p_by_id, v_key_ids);
    level            := v_level;
    archived_at      := v_rec.archived_at;
    archived_by      := v_rec.archived_by;
    archived_by_name := v_rec.archived_by_name;
    return next;
  end loop;
end;
$function$

;

CREATE OR REPLACE FUNCTION custom.archived_tables_everywhere(p_lane text DEFAULT 'org'::text, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_cap    integer := least(greatest(coalesce(p_limit, 100), 1), 1000);
  v_off    integer := greatest(coalesce(p_offset, 0), 0);
  v_need   integer;
  v_kernel uuid := custom.table_kernel_id();
  v_org    uuid;
  v_name   text;
  v_ceil   integer;
  v_chunk  integer;
  v_at     integer;
  v_got    integer;
  v_page   jsonb;
  v_all    jsonb := '[]'::jsonb;
  v_rows   jsonb;
begin
  -- THE ARCHIVED TABLES OF EVERY ORGANIZATION THE CALLER BELONGS TO (org-filter sweep, 2026-09-29;
  -- lane DATA-HOME-3B2, 2026-10-01). Every row comes from custom.read_records_archived over the
  -- Table kernel, which decides the organization wall (custom.assert_client_may_reach, reading the
  -- request's role through custom.caller_role(), so this door being SECURITY DEFINER admits nobody)
  -- and the row ladder in its own body; an organization whose wall refuses (42501) contributes
  -- nothing. This body only adds the answers together.
  --
  -- The newest v_cap rows after v_off across organizations can only come from each organization's
  -- own newest v_cap + v_off, so that is all each one is asked for — in pages of at most its own
  -- ceiling (custom.page_ceiling), never in one ask the store would refuse (PAGE-1).
  --
  -- SECURITY DEFINER for one reason: to skip HER organizations that hold no archived Table at all
  -- (the exists below) instead of paying their wall, mask and ladder for nothing. That test only
  -- narrows which organizations are asked; it is never an answer.
  v_need := v_cap + v_off;
  for v_org, v_name in
    select o.id, o.name::text
      from iam.organizations o
     where o.id in (select iam.my_orgs())
       and o.archived_at is null
       and exists (select 1 from custom.record r
                    where r.organization_id = o.id
                      and r.table_id = v_kernel
                      and r.deleted_at is not null)
  loop
    begin
      v_ceil := greatest(coalesce(custom.page_ceiling(v_org), 200), 1);
      v_at := 0;
      loop
        v_chunk := least(v_need - v_at, v_ceil);
        exit when v_chunk < 1;
        select coalesce(jsonb_agg(to_jsonb(x) || jsonb_build_object('organization_id', v_org,
                                                                    'organization_name', v_name)), '[]'::jsonb),
               count(*)
          into v_page, v_got
          from custom.read_records_archived(v_org, v_kernel, p_lane, false, v_chunk, v_at) x;
        v_all := v_all || v_page;
        v_at := v_at + v_got;
        exit when v_got < v_chunk;
      end loop;
    exception when insufficient_privilege then
      continue;
    end;
  end loop;
  select coalesce(jsonb_agg(w order by (w ->> 'archived_at') desc nulls last, w ->> 'id'), '[]'::jsonb)
    into v_rows
    from (select w from jsonb_array_elements(v_all) w
           order by (w ->> 'archived_at') desc nulls last, w ->> 'id' limit v_cap offset v_off) s;
  return jsonb_build_object('success', true, 'tables', v_rows, 'limit', v_cap, 'offset', v_off);
end
$function$

;
