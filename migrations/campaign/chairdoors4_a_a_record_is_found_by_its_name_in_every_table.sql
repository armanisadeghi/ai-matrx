-- chair-step: this CREATES one new read door, custom.records_search(text, integer, integer, uuid[], uuid[], boolean) (STABLE SECURITY DEFINER, writes nothing), declares it in platform.client_callable_door and GRANTs EXECUTE on it to `authenticated` (the one grant every signed-in store door carries). No existing function, table, column, index, policy or data row is touched.
-- lane: CHAIR-DOORS (asked by v6 lane 5 INTEGRATION; blocks "Link a record…" on every right-click menu)
--
-- A RECORD IS FOUND BY ITS NAME IN EVERY TABLE. Every "Link a record…" menu, the variables picker and
-- the universal record picker need one question answered fast: "which of my records is called
-- something like this?" — across every Table of every organization the person belongs to (Arman: the
-- active organization is never a list filter). Until this file the only way was custom.data_home
-- (500 ms for a person in 50 organizations, and it lists Tables, not records) followed by one
-- read_records_page per Table.
--
--   custom.records_search(p_search, p_limit 50, p_offset 0, p_table_ids null, p_organization_ids null,
--                         p_include_app_tables false)
--     -> table(record_id, table_id, table_name, name, organization_id, updated_at)
--
--   * A record's NAME is the value of its Table's title field — the Table document's `title_field`,
--     `name` when the Table names none (the same rule custom.action_run and the grid use).
--   * p_search empty lists the most recently changed records (the picker's first paint); otherwise a
--     case-insensitive contains, ranked exact > starts-with > word-start > contains, then newest first.
--     At most 200 characters; % _ \ are matched as the characters themselves.
--   * p_organization_ids only NARROWS the person's own memberships (an organization named that the
--     caller cannot reach is refused by name, 42501); p_table_ids only narrows further.
--   * A Table the app keeps out of every default list (custom.table_kept_out_of_lists on the Table's
--     kept_for word — today the outputs an agent lands) is left out unless p_include_app_tables.
--   * MASKED BY THE ONE LIST RULE: every candidate row is admitted only through
--     custom.listed_predicate_sql (may she open it, and is it listed for her — "Only me" hides) for its
--     own organization and Table; a Table whose predicate refuses her contributes nothing. No new
--     predicate; the reader is custom.query_principal() and nobody else can be asked for.
--   * SPEED: one scan of the person's records for the candidates (ranked, capped at two pages, at
--     most 1000), then the list rule once per candidate Table, best Table first, stopping the moment
--     the page is full (at most 200 Tables a call). Measured on the clone (2xlarge) for admin@admin.com
--     (50 organizations, 910 Tables, 14,844 records), warm: "john" 192 ms (3 rows), "marcus" 333 ms,
--     "ma" 348–366 ms, the empty lister 377 ms, one letter "a" 459 ms; the candidate scan is 64 ms and
--     the rest is the one ladder itself — custom.query_visible_ids inside the list predicate costs
--     18–25 ms per Table touched, and a page of 50 names usually spans 8–12 Tables. The 300 ms budget
--     holds for a real name and not for a one-letter search; cutting further means changing the
--     ladder's own cost, which is the chair's, not this door's. No index is added: the candidate scan
--     rides record_organization_id_table_id_created_at_idx and the hash partitions by organization.
--
-- Inverse: migrations/inverse/chairdoors4_a_a_record_is_found_by_its_name_in_every_table_down.sql

CREATE OR REPLACE FUNCTION custom.records_search(
  p_search text,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_table_ids uuid[] DEFAULT NULL::uuid[],
  p_organization_ids uuid[] DEFAULT NULL::uuid[],
  p_include_app_tables boolean DEFAULT false)
 RETURNS TABLE(record_id uuid, table_id uuid, table_name text, name text, organization_id uuid, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me      uuid := custom.query_principal();
  v_q       text := nullif(btrim(coalesce(p_search, '')), '');
  v_like    text;
  v_limit   integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset  integer := greatest(coalesce(p_offset, 0), 0);
  v_cap     integer;
  v_orgs    uuid[];
  v_org     uuid;
  v_ids     uuid[];
  v_tids    uuid[];
  v_oids    uuid[];
  v_names   text[];
  v_tnames  text[];
  v_ats     timestamp with time zone[];
  v_kept    uuid[] := '{}'::uuid[];
  v_open    uuid[];
  v_part    uuid[];
  v_pair    record;
  v_pairs   integer := 0;
begin
  -- THE READER IS THE SESSION'S OWN PERSON. Nobody signed in: nothing is listed (the picker's empty state).
  if v_me is null then
    return;
  end if;
  if v_q is not null and length(v_q) > 200 then
    raise exception 'custom.records_search searches at most 200 characters; this search has %.', length(v_q)
      using errcode = '22023', hint = 'Search for a shorter phrase. Nothing was read.';
  end if;

  -- THE ORGANIZATIONS: hers, every one by default. A named one is decided first, in this door's own
  -- name (never an empty list that reads like "nothing there"); then the list is narrowed to it.
  if p_organization_ids is not null then
    foreach v_org in array p_organization_ids loop
      perform custom.assert_client_may_reach(v_org, 'custom.records_search');
    end loop;
  end if;
  v_orgs := array(
    select m.organization_id
      from iam.organization_member m
      join iam.organizations o on o.id = m.organization_id and o.archived_at is null
     where m.user_id = v_me
       and (p_organization_ids is null or m.organization_id = any (p_organization_ids)));
  if coalesce(cardinality(v_orgs), 0) = 0 then
    return;
  end if;

  -- THE CANDIDATES, in one scan: every live record of a Table she may be shown (app-kept Tables behind
  -- the switch), named like the search, ranked, newest first, capped at two pages (at least 200).
  v_cap  := least(greatest((v_offset + v_limit) * 2, 200), 1000);
  v_like := case when v_q is null then null
                 else '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%' end;
  with t as (
    select t.id, t.organization_id,
           coalesce(nullif(btrim(t.data ->> 'name'), ''), 'Untitled table') as nm,
           coalesce(nullif(btrim(t.data ->> 'title_field'), ''), 'name')  as tf
      from custom.record t
     where t.organization_id = any (v_orgs)
       and t.table_id = custom.table_kernel_id()
       and t.deleted_at is null
       and (p_table_ids is null or t.id = any (p_table_ids))
       and (p_include_app_tables or not custom.table_kept_out_of_lists(t.data ->> 'kept_for'))
  ), c as (
    select r.id, r.table_id, r.organization_id, r.updated_at, t.nm,
           nullif(btrim(r.data ->> t.tf), '') as name,
           case when v_q is null then 3
                when lower(r.data ->> t.tf) = lower(v_q) then 0
                when lower(r.data ->> t.tf) like lower(v_q) || '%' then 1
                when lower(r.data ->> t.tf) like '% ' || lower(v_q) || '%' then 2
                else 3 end as rank
      from custom.record r
      join t on t.organization_id = r.organization_id and t.id = r.table_id
     where r.organization_id = any (v_orgs)
       and r.data_class = 'record'
       and r.deleted_at is null
       and (v_like is null or (r.data ->> t.tf) ilike v_like)
     order by 7, r.updated_at desc, r.id
     limit v_cap
  )
  select array_agg(c.id          order by c.rank, c.updated_at desc, c.id),
         array_agg(c.table_id    order by c.rank, c.updated_at desc, c.id),
         array_agg(c.organization_id order by c.rank, c.updated_at desc, c.id),
         array_agg(c.name        order by c.rank, c.updated_at desc, c.id),
         array_agg(c.nm          order by c.rank, c.updated_at desc, c.id),
         array_agg(c.updated_at  order by c.rank, c.updated_at desc, c.id)
    into v_ids, v_tids, v_oids, v_names, v_tnames, v_ats
    from c;
  if v_ids is null then
    return;
  end if;

  -- AN ORGANIZATION THAT TURNED THE STORE OFF lists nothing (custom.data_home_tables' rule), asked only
  -- of the organizations that hold candidates (a handful), never of every membership.
  v_open := array(select distinct x from unnest(v_oids) x where custom.store_is_open(x));

  -- THE ONE LIST RULE, once per candidate Table, best-ranked Table first. custom.listed_predicate_sql
  -- is the predicate every door that lists over a Table's rows is built from; a Table whose predicate
  -- refuses this reader (she may not know it) contributes nothing — the same as an invented id.
  -- THE WALK STOPS when the page is full: every Table not yet asked holds only rows ranked after its
  -- first candidate, so once the rows kept AHEAD of the next Table's first candidate fill the page,
  -- no unasked Table can change it.
  for v_pair in
    select u.o as org, u.t as tbl, min(u.n) as first_n,
           lead(min(u.n)) over (order by min(u.n)) as next_first_n
      from unnest(v_oids, v_tids) with ordinality as u(o, t, n)
     group by u.o, u.t
     order by min(u.n)
  loop
    continue when not (v_pair.org = any (v_open));
    begin
      execute format(
        'select coalesce(array_agg(r.id), ''{}''::uuid[]) from custom.record r '
        ' where r.organization_id = %L::uuid and r.table_id = %L::uuid and r.deleted_at is null '
        '   and r.id = any (%L::uuid[]) and %s',
        v_pair.org, v_pair.tbl,
        array(select u.i from unnest(v_ids, v_oids, v_tids) as u(i, o, t) where u.o = v_pair.org and u.t = v_pair.tbl),
        custom.listed_predicate_sql(v_me, v_pair.org, v_pair.tbl, 'viewer'::public.permission_level, 'r'))
        into v_part;
    exception when insufficient_privilege then
      v_part := '{}'::uuid[];
    end;
    v_kept := v_kept || coalesce(v_part, '{}'::uuid[]);
    v_pairs := v_pairs + 1;
    exit when v_pairs >= 200;
    exit when v_pair.next_first_n is not null
          and (select count(*) from unnest(v_ids) with ordinality as u(i, n)
                where u.n < v_pair.next_first_n and u.i = any (v_kept)) >= v_offset + v_limit;
  end loop;

  return query
    select u.id, u.tid, u.tnm, u.nm, u.oid, u.at
      from unnest(v_ids, v_tids, v_tnames, v_names, v_oids, v_ats) with ordinality as u(id, tid, tnm, nm, oid, at, n)
     where u.id = any (v_kept)
     order by u.n
    offset v_offset
     limit v_limit;
end;
$function$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers, argument_rules)
values
  ('custom', 'records_search',
   'p_search text, p_limit integer, p_offset integer, p_table_ids uuid[], p_organization_ids uuid[], p_include_app_tables boolean',
   array['text'::regtype::oid, 'integer'::regtype::oid, 'integer'::regtype::oid, 'uuid[]'::regtype::oid, 'uuid[]'::regtype::oid, 'boolean'::regtype::oid],
   'The records called something like a search, across every Table of every organization the caller belongs to, for the record pickers. The reader is custom.query_principal() (nobody signed in lists nothing); every organization named in p_organization_ids is decided first by custom.assert_client_may_reach (42501 by name), and the walk is the caller''s own live memberships with the store open, narrowed by that list and by p_table_ids. Every candidate row is admitted only through custom.listed_predicate_sql for its own organization and Table (may she open it, and is it listed for her), so a Table she may not know contributes nothing, the same as an invented id. A Table the app keeps out of default lists (custom.table_kept_out_of_lists) is left out unless p_include_app_tables, which only widens back to Tables she could already open. It returns the record id, its Table id and name, the record''s own name (its Table''s title field), the organization id and when it last changed — never a field value beyond the name. It writes nothing.',
   'chairdoors4_a_a_record_is_found_by_its_name_in_every_table.sql', null, true, false,
   jsonb_build_object('version', '1', 'arguments', jsonb_build_object(
     'p_search', jsonb_build_object('type', 'text', 'position', 1,
       'check', 'at most 200 characters (22023); matched as a literal (percent, underscore and backslash escaped) inside ILIKE over the title value only; empty lists newest first.',
       'foreign', jsonb_build_object('not_a_leak', true)),
     'p_limit', jsonb_build_object('type', 'integer', 'position', 2, 'check', 'clamped to 1..200.'),
     'p_offset', jsonb_build_object('type', 'integer', 'position', 3, 'check', 'clamped to >= 0.'),
     'p_table_ids', jsonb_build_object('type', 'uuid[]', 'position', 4,
       'check', 'only NARROWS the Tables walked; each row is still decided by custom.listed_predicate_sql, so a foreign or invented id answers no row.',
       'foreign', jsonb_build_object('same_as_invented', true)),
     'p_organization_ids', jsonb_build_object('type', 'uuid[]', 'position', 5,
       'check', 'each element is decided by custom.assert_client_may_reach before anything is read (42501, by name), then only NARROWS the caller''s memberships.',
       'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true)),
     'p_include_app_tables', jsonb_build_object('type', 'boolean', 'position', 6,
       'check', 'only WIDENS back to Tables the caller could already open that the app keeps out of default lists; grants nothing.',
       'foreign', jsonb_build_object('not_a_leak', true)))));

grant execute on function custom.records_search(text, integer, integer, uuid[], uuid[], boolean) to authenticated;
