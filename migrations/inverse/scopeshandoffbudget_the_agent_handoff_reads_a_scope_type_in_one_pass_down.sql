-- chair-step: the inverse of migrations/campaign/scopeshandoffbudget_the_agent_handoff_reads_a_scope_type_in_one_pass.sql (lane SCOPES-HANDOFF-BUDGET) — puts custom.visibility_ancestors, custom.levels_of, custom._where_ids_open_with, custom._read_record_with and custom.resolve_context back exactly as production held them before it (pg_get_functiondef, 2026-09-28; the same bodies on the dev clone). Nothing of anybody's data is touched.
-- based-on: custom.visibility_ancestors(text, uuid) c47624f13fcc7c033728261c15fb6afe29d0aa6f36d0fdc3589af5372622f00c
-- based-on: custom.levels_of(uuid, uuid[]) a1d15061bc7c3bcf51fa4633d1b6fa583e50846a23efa67feb9bb07edf5e89b6
-- based-on: custom._where_ids_open_with(uuid[], uuid, jsonb) eb7d5e290b2b7dd734cfea2942aa2d0ef3538f3087b50031a375649d1602339c
-- based-on: custom._read_record_with(uuid, uuid, boolean, jsonb, jsonb) 8e507f8aa394c42df502258f2b72c66ab853f52fe2a6ac2bba411cd8a8b216dc
-- based-on: custom.resolve_context(text, uuid, uuid[], uuid[], text[]) 30ceb7f40a6560764721ccc4ef0cb77de3efdb4318032f575639234c4c895553

set local lock_timeout = '2s';

CREATE OR REPLACE FUNCTION custom.visibility_ancestors(p_item_type text, p_item_id uuid)
 RETURNS TABLE(container_type text, container_id uuid, depth integer, max_level permission_level)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  return query
    with recursive seed as (
      -- THE ONE NEW FACT: which of this item's containers IS the Table it lives in. Everything
      -- else about the walk is unchanged.
      select e.container_type, e.container_id, e.conveys_max,
             (p_item_type = 'record'
              and exists (select 1 from custom.record r
                           where r.id = p_item_id and r.table_id = e.container_id)) as is_table
        from custom.carrying_edges_of(p_item_type, p_item_id) e
    ), up as (
      select s.container_type, s.container_id, 1 as depth, s.conveys_max as max_level, s.is_table,
             array[p_item_type || ':' || p_item_id::text,
                   s.container_type || ':' || s.container_id::text] as path
        from seed s
      union all
      select e.container_type, e.container_id, u.depth + 1,
             least(u.max_level, e.conveys_max),
             -- LEAK-T10: THE SAME FACT, AT EVERY DEPTH. This was hard-coded `false`, so the
             -- terminal rule held only for the row the walk started from. One step further out
             -- a Home is a row of some Table too, and the walk climbed from that Table into ITS
             -- Homes — the same leak, one level up, in a place no test looked.
             (u.container_type = 'record'
              and exists (select 1 from custom.record r
                           where r.id = u.container_id and r.table_id = e.container_id)),
             u.path || (e.container_type || ':' || e.container_id::text)
        from up u
        cross join lateral custom.carrying_edges_of(u.container_type, u.container_id) e
       -- `not u.is_table` is the whole change: a Table is where the walk stops, because a
       -- Table's own containers are its Homes and a Home of the Table is not a container of
       -- every record in it.
       where u.depth < 16
         and not u.is_table
         and not (e.container_type || ':' || e.container_id::text) = any (u.path)
    )
    select u.container_type, u.container_id, min(u.depth), max(u.max_level)
      from up u
     group by u.container_type, u.container_id;
end
$function$;

CREATE OR REPLACE FUNCTION custom.levels_of(p_user_id uuid, p_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
-- STORE-READ-PERF-2 (2026-09-25). THE RUNG, ONCE PER CLASS, FOR A SET OF RECORDS.
--
-- Answers, for each id, exactly what the one ladder answers about it for this person:
--   l = custom.effective_level(p_user_id, <its organization>, id)   (the rung the mask needs)
--   s = custom.has_visibility(p_user_id, 'record', id, 'viewer')   (the read door's own check)
-- as {"<id>": {"l": <level or null>, "s": <bool>}}.
--
-- WHY IT MAY ASK ONCE PER CLASS. Every input the ladder reads about ONE record is either a
-- column of that record — its organization, its Table, its `visibility`, whether it is live,
-- whether this person created it (`iam.owner_of` reads `created_by`) — or a row somewhere else
-- that NAMES that record by id: a grant (`iam.permissions`), a membership held on it
-- (`iam.memberships`, record or scope), a library grant (`platform.entity_grants`), a closure
-- row (`platform.reachability`), a carrying edge (`custom.carrying_edges_of` arms 1a/1b/2a/2b/4
-- — every arm but the Table the record lives in), or an assignment to a scope
-- (`public._edu_can_read_via_assignment`). Everything else the ladder reads — the organization's
-- lanes and knobs, the Table's own grants and carrying, whether this person is an admin, owns a
-- record in the organization, or holds any grant anywhere — is the same for every record that
-- shares those columns. So two records with the same columns and NO row naming either of them
-- get the same answer at every rung, and the ladder is asked once for the class.
--
-- A record that is NAMED by any such row, a row of the kernel Table (arm 4 of has_visibility
-- reads the Table's contents), a record with no Table, an id that is not a record, and every
-- record while `record` has a registered FK containment parent (custom.visible_set's first stop)
-- is asked on its own, exactly as before. The class memo lives in this one call and nowhere
-- else, so it can never outlive the snapshot it was answered in.
declare
  v_out    jsonb := '{}'::jsonb;
  v_memo   jsonb := '{}'::jsonb;
  v_fk     boolean;
  v_kernel uuid := custom.table_kernel_id();
  v_key    text;
  v_l      public.permission_level;
  v_s      boolean;
  r        record;
begin
  if p_user_id is null or p_ids is null or cardinality(p_ids) = 0 then
    return v_out;
  end if;

  v_fk := exists (select 1 from platform.entity_relationships er
                   where er.child_type = 'record' and er.kind in ('composition', 'containment'));

  for r in
    select u.id, x.organization_id, x.table_id, x.visibility, x.deleted_at is null as live,
           x.created_by is not distinct from p_user_id as own, x.id is not null as found,
           ( exists (select 1 from iam.permissions p
                      where p.resource_type = 'record' and p.resource_id = u.id)
          or exists (select 1 from iam.memberships m
                      where m.container_type in ('record', 'scope') and m.container_id = u.id)
          or exists (select 1 from platform.entity_grants g
                      where g.entity_type = 'record' and g.entity_id = u.id)
          or exists (select 1 from platform.reachability rr
                      where rr.item_type = 'record' and rr.item_id = u.id)
          or exists (select 1 from platform.associations a
                      where a.deleted_at is null and a.target_type = 'record' and a.target_id = u.id)
          or exists (select 1 from platform.associations a
                      where a.deleted_at is null and a.source_type = 'record' and a.source_id = u.id
                        and ( a.target_type = 'scope'
                           or a.relation_field_id is not null and exists (
                                select 1 from custom.portal_table pt where pt.names_via_field_id = a.relation_field_id)
                           or exists (select 1 from platform.association_types t
                                       where t.source_type = a.source_type and t.target_type = a.target_type
                                         and (t.label is null or t.label = a.label)
                                         and t.is_active and t.container_side = 'target')
                           or exists (select 1 from custom.carrying_rule cr
                                       where cr.role = a.role and cr.is_active and cr.container_side = 'target'))) ) as named
      from (select distinct unnest(p_ids) as id) u
      left join custom.record x on x.id = u.id
     where u.id is not null
  loop
    if not r.found or v_fk or r.table_id is null or r.table_id = v_kernel or r.named then
      v_key := null;
    else
      v_key := r.organization_id::text || ':' || r.table_id::text || ':' || r.visibility::text || ':'
            || r.live::text || ':' || r.own::text;
    end if;

    if v_key is not null and v_memo ? v_key then
      v_out := v_out || jsonb_build_object(r.id::text, v_memo -> v_key);
      continue;
    end if;

    v_l := custom.effective_level(p_user_id, r.organization_id, r.id);
    v_s := custom.has_visibility(p_user_id, 'record', r.id, 'viewer'::public.permission_level);
    v_out := v_out || jsonb_build_object(r.id::text, jsonb_build_object('l', v_l, 's', v_s));
    if v_key is not null then
      v_memo := v_memo || jsonb_build_object(v_key, jsonb_build_object('l', v_l, 's', v_s));
    end if;
  end loop;
  return v_out;
end;
$function$;

CREATE OR REPLACE FUNCTION custom._where_ids_open_with(p_ids uuid[], p_user_id uuid DEFAULT NULL::uuid, p_levels jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
-- STORE-READ-PERF-3 (2026-09-25). custom.where_id_opens FOR A SET OF IDS, in one pass.
--
-- Answers {"<id>": <exactly what custom.where_id_opens(<id>) answers>} for every id whose answer
-- is not null (an id it would answer null for is simply absent, so `-> id` is null for both).
--
-- THE SET ARM. The ids are looked up in custom.record in ONE query (their organization, Table,
-- class and liveness, and whether their Table is a kernel Table), not once per id. For a record
-- that is a Table, a part of how a Table is built (a Field, a Rule, a Person row) or an ordinary
-- record, custom.where_id_opens's wall is the record itself in its own organization, and
-- custom._where_id_may_open asks exactly two things about it: the organization wall
-- (custom.assert_client_may_reach, asked here once per organization and caught the same way) and
-- custom.assert_client_may_open, which for a row that lives where it is asked about and a signed-in
-- person is: the store's own role, else custom.has_visibility(person, 'record', id, 'viewer'). That
-- viewer answer is `s` in custom.levels_of — handed in by the calling door when it already asked
-- custom.levels_of for the SAME person (p_user_id = the query principal), asked here once for the
-- set otherwise.
--
-- EVERYTHING ELSE IS ASKED ON ITS OWN, through custom.where_id_opens itself: an id that is not a
-- record (a merged id, a form, a booking page, a portal, a rendered document), a dashboard, a
-- digest rule (its recipient-or-admin check), an id that more than one row carries, and every id
-- if the set arm's ladder question raises (so a refusal is the single door's refusal, verbatim).
declare
  v_me     uuid := custom.query_principal();
  v_tables uuid := custom.table_kernel_id();
  v_shows  uuid := custom.presentation_kernel_id();
  v_dash   text := custom.dashboard_class();
  v_owner  boolean;
  v_out    jsonb := '{}'::jsonb;
  v_rows   jsonb := '{}'::jsonb;    -- id -> {org, kind, path, live}, the set arm
  v_slow   uuid[] := array[]::uuid[];
  v_reach  jsonb := '{}'::jsonb;    -- organization -> may the person reach it
  v_levels jsonb := '{}'::jsonb;
  v_ask    uuid[];
  v_ok     boolean;
  v_w      jsonb;
  v_id     uuid;
  v_key    text;
  r        record;
begin
  -- A signed-out caller is nobody's (custom.where_id_opens answers null for every id).
  if p_ids is null or v_me is null then
    return v_out;
  end if;

  -- ── THE ONE LOOKUP: every id's home, grouped by the Table it lives in ────────────────────
  for r in
    select u.id, x.organization_id as org, x.table_id,
           case
             when x.organization_id is null then 'slow'
             when x.table_id = v_tables then 'table'
             when x.table_id = v_shows and x.data_class = v_dash then 'slow'
             when x.data_class = 'rule' and x.data ? 'subscription' then 'slow'
             when k.kernel then 'table_part'
             when coalesce(x.metadata ->> 'quarantine', 'false') = 'true' then 'none'
             else 'record'
           end as kind,
           x.deleted_at is null as live
      from (select distinct s.id from unnest(p_ids) s(id) where s.id is not null) u
      left join custom.record x on x.id = u.id
      left join lateral (
        select exists (select 1 from custom.record kr
                        where kr.id = x.table_id and kr.table_id = v_tables and kr.data_class = 'kernel') as kernel
      ) k on x.table_id is not null
     order by x.table_id, u.id
  loop
    v_key := r.id::text;
    if v_rows ? v_key or r.id = any (v_slow) then
      -- more than one row carries this id: the single door decides it
      v_rows := v_rows - v_key;
      v_slow := v_slow || r.id;
      continue;
    end if;
    if r.kind = 'slow' then
      v_slow := v_slow || r.id;
      continue;
    end if;
    v_rows := v_rows || jsonb_build_object(v_key, jsonb_build_object(
      'org', r.org, 'kind', r.kind, 'live', coalesce(r.live, true),
      'path', case r.kind
                when 'table'  then '/data-v2/' || r.id::text
                when 'record' then '/data-v2/' || r.table_id::text || '?record=' || r.id::text
              end));
  end loop;

  -- ── THE LADDER'S VIEWER ANSWER, once for the set ─────────────────────────────────────────
  v_owner := custom.query_is_store_owner();
  if not v_owner then
    select array_agg(e.key::uuid) into v_ask
      from jsonb_each(v_rows) e
     where e.value ->> 'kind' <> 'none'
       and not (p_user_id is not distinct from v_me and coalesce(p_levels, '{}'::jsonb) ? e.key);
    if p_user_id is not distinct from v_me and p_levels is not null then
      v_levels := p_levels;
    end if;
    if v_ask is not null then
      begin
        v_levels := v_levels || custom.levels_of(v_me, v_ask);
      exception when others then
        -- the single door, verbatim, for every id of the set arm
        v_slow := v_slow || (select array_agg(e.key::uuid) from jsonb_each(v_rows) e);
        v_rows := '{}'::jsonb;
      end;
    end if;
  end if;

  for r in select e.key, e.value from jsonb_each(v_rows) e loop
    continue when r.value ->> 'kind' = 'none';   -- DOOR-17: a quarantined submission
    -- the organization wall, once per organization (custom._where_id_may_open's first question)
    if not v_reach ? (r.value ->> 'org') then
      begin
        perform custom.assert_client_may_reach((r.value ->> 'org')::uuid, 'platform.resolve_id');
        v_ok := true;
      exception when insufficient_privilege or null_value_not_allowed then
        v_ok := false;
      end;
      v_reach := v_reach || jsonb_build_object(r.value ->> 'org', v_ok);
    end if;
    continue when not (v_reach ->> (r.value ->> 'org'))::boolean;
    -- the row: the store's own role, else the one ladder at viewer
    continue when not (v_owner or coalesce((v_levels -> r.key ->> 's')::boolean, false));
    v_out := v_out || jsonb_build_object(r.key, jsonb_build_object(
      'kind',            r.value ->> 'kind',
      'organization_id', r.value -> 'org',
      'path',            r.value -> 'path',
      'live',            r.value -> 'live',
      'resolved_id',     r.key));
  end loop;

  -- ── EVERYTHING ELSE: the single door ────────────────────────────────────────────────────
  foreach v_id in array v_slow loop
    v_w := custom.where_id_opens(v_id);
    if v_w is not null then
      v_out := v_out || jsonb_build_object(v_id::text, v_w);
    end if;
  end loop;
  return v_out;
end;
$function$;

CREATE OR REPLACE FUNCTION custom._read_record_with(p_organization_id uuid, p_record_id uuid, p_by_id boolean, p_levels jsonb, p_cache jsonb, OUT o_doc jsonb, OUT o_cache jsonb)
 RETURNS record
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me       uuid := auth.uid();
  v_table    uuid;
  v_doc      jsonb;
  v_mask     jsonb;
  v_visible  text[];
  v_declared text[];
  v_now      uuid;
  v_alts     jsonb;
  v_retired  jsonb;
  v_out      jsonb;
  v_wv_values  jsonb;
  v_wv_sources jsonb;
  v_row      custom.record;
  v_vs       record;
  v_ck       text;
  v_known    boolean;
  v_key_ids  jsonb;
begin
  o_cache := coalesce(p_cache, '{}'::jsonb);
  if v_me is null then
    raise exception 'Nobody is signed in, so there is nothing to read.'
      using errcode = '42501', hint = 'DOOR-1: the read door reads the person from the session.';
  end if;

  -- ARGS-RULED (2026-09-21). THE WALL IS DECIDED FIRST, AND IT WAS NOT DECIDED AT ALL.
  -- REC-29: "organizations are hard walls, and a door decides who may reach one before it
  -- decides anything else" — every other door in this store obeys it and DOOR-1, the one read
  -- door, did not. It made no membership decision about the organization it was handed.
  perform custom.assert_client_may_reach(p_organization_id, 'custom.read_record');

  -- REC-21 / T5. THE ID A MERGE SENT SOMEWHERE ELSE — a redirect, never a silent substitution.
  v_now := custom.resolve_id(p_organization_id, p_record_id);
  -- STORE-READ-PERF-2: a set door that already asked the ladder about this record for the whole
  -- set (custom.levels_of) hands the answer in; alone, the door asks it here as it always did.
  v_known := coalesce(p_levels ? v_now::text, false);

  -- AND THE LADDER BEFORE EXISTENCE. This used to raise 02000 "there is no record % in this
  -- organization" BEFORE asking custom.has_visibility, so the two answers differed: a caller who
  -- guessed a record uuid learned whether it existed in that organization (02000) or not
  -- (42501). One bit per guess, and the store's own rule is that a record you may not open and a
  -- record that is not there answer the same thing. `custom.has_visibility` answers false for an
  -- id that is not there, so this ordering makes the two identical without a second read.
  if not (case when v_known then (p_levels -> v_now::text ->> 's')::boolean
               else custom.has_visibility(v_me, 'record', v_now, 'viewer') end) then
    raise exception 'You do not have access to this record.'
      using errcode = '42501',
            hint = 'DOOR-1: nothing reads a record around this door - not a screen, not an agent, not an export. Ask somebody who holds it to share it with you.';
  end if;

  select r.* into v_row
    from custom.record r
   where r.organization_id = p_organization_id and r.id = v_now and r.deleted_at is null;
  if not found then
    -- Only somebody the ladder has already admitted reaches this sentence, so it now tells a
    -- person who holds the record that it is in the trash — and tells a stranger nothing.
    raise exception 'There is no such record in this organization.' using errcode = '02000', hint = 'It was deleted, or it never existed here.',
            detail = jsonb_build_object('record_id', p_record_id)::text;
  end if;
  v_table := v_row.table_id;
  v_wv_values := v_row.data -> '_values';
  v_wv_sources := v_row.data -> '_sources';
  -- custom.record_values_of(r), with the Table's plan carried from record to record.
  select * into v_vs from custom.record_values_step(v_row, o_cache);
  v_doc := v_vs.o_doc;
  o_cache := v_vs.o_cache;

  -- THE ONE FACT. `custom.read_mask` is the whole of what this door used to work out privately.
  v_mask := custom.read_mask_at(v_now, v_known, (p_levels -> v_now::text ->> 'l')::public.permission_level, 'read');
  -- STORE-READ-PERF-2 / DOOR-N-5: id-keyed on request means EVERY declared Field's key, as the
  -- page doors have always done — not only the hidden ones.
  v_key_ids := coalesce(v_mask -> 'all_key_ids', v_mask -> 'key_ids');
  select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_visible
    from jsonb_array_elements(v_mask -> 'visible') x;
  select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_declared
    from jsonb_array_elements(v_mask -> 'declared') x;

  v_out := custom.mask_document(v_doc, v_visible, v_mask -> 'notices', p_by_id,
                                v_key_ids, v_declared);

  -- CHOICE-VALUE. Rendered AFTER masking, so a field this reader may not see keeps its notice
  -- and is never resolved.
  if v_table is not null then
    v_ck := 'cr:' || p_organization_id::text || ':' || v_table::text;
    if not (o_cache ? v_ck) then
      o_cache := o_cache || jsonb_build_object(v_ck, custom.choice_render_plan(p_organization_id, v_table));
    end if;
    v_out := custom.choice_render_with(p_organization_id, v_table, v_out, o_cache -> v_ck);
  end if;

  -- BIG-VALUES-READERS. A value too big for one cell keeps its first words here and its whole
  -- text in a file; the pointer (`_values.<key>.src` -> `_sources.<ptr>`, the file fields only)
  -- rides along for the keys this reader may see, so a screen opens the file and an agent's
  -- context reads the whole text. Nothing else of the provenance block is carried.
  v_out := custom.with_whole_value_pointers(v_out, v_wv_values, v_wv_sources, v_visible, p_by_id,
                                            v_key_ids);

  -- T5 / REC-N-11. THE ALTERNATES THE MERGE KEPT — only for keys this reader may see.
  select jsonb_object_agg(k, alts) into v_alts
    from (
      select e.key as k,
             (select jsonb_agg(jsonb_build_object(
                       'value',  a -> 'value',
                       'rank',   a -> 'rank',
                       'source', r.data -> '_sources' -> (a ->> 'src'))
                     order by (a ->> 'rank')::int)
                from jsonb_array_elements(coalesce(e.value -> 'alternates', '[]'::jsonb)) a) as alts
        from custom.record r
        cross join lateral jsonb_each(coalesce(r.data -> '_values', '{}'::jsonb)) e
       where r.organization_id = p_organization_id and r.id = v_now
         and e.key = any (v_visible)
         and jsonb_array_length(coalesce(e.value -> 'alternates', '[]'::jsonb)) > 0
    ) x
   where x.alts is not null;

  if v_alts is not null and v_alts <> '{}'::jsonb then
    v_out := v_out || jsonb_build_object('_alternates', v_alts);
  end if;

  -- SEAT-SUITES / T5+T12. THE VALUES THE STORE KEPT AND THE DOOR THREW AWAY, masked exactly
  -- like the value they used to be.
  select jsonb_agg(x order by x ->> 'key') into v_retired
    from custom.record r
    cross join lateral jsonb_array_elements(coalesce(r.data -> '_retired', '[]'::jsonb)) x
   where r.organization_id = p_organization_id and r.id = v_now
     and ((x ->> 'key') = any (v_visible) or not ((x ->> 'key') = any (v_declared)));

  if v_retired is not null and jsonb_array_length(v_retired) > 0 then
    v_out := v_out || jsonb_build_object('_retired', v_retired);
  end if;

  if v_now is distinct from p_record_id then
    v_out := v_out || jsonb_build_object(
      '_redirected_from', p_record_id,
      '_redirect_says', 'That record was merged into this one, so its id now answers with this record. REC-21: the merged id resolves to the survivor for good — undoing the merge puts both records and both ids back.');
  end if;

  o_doc := v_out;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.resolve_context(p_entity_type text, p_entity_id uuid, p_record_ids uuid[] DEFAULT NULL::uuid[], p_table_ids uuid[] DEFAULT NULL::uuid[], p_system_item_refs text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me          uuid := custom.query_principal();
  v_org_id      uuid;
  v_project_id  uuid;
  v_task_id     uuid;
  v_cands       jsonb := '[]'::jsonb;   -- [{record_id, via}] in contribution order
  v_checks      jsonb := '[]'::jsonb;   -- one row per candidate: admitted or refused, and why
  v_withheld    jsonb := '[]'::jsonb;   -- a field the person may not see on an admitted record
  v_admitted    jsonb := '[]'::jsonb;   -- [{record_id, organization_id, table_id, name, type_label, via}]
  v_tables      jsonb := '[]'::jsonb;
  v_scope_labels jsonb := '{}'::jsonb;
  v_variables   jsonb := '{}'::jsonb;
  v_sources     jsonb := '{}'::jsonb;
  v_cells       jsonb := '{}'::jsonb;
  v_cell        jsonb;
  v_where       jsonb;
  v_doc         jsonb;
  v_hidden      jsonb;
  v_table       custom.record;
  v_title_field text;
  v_label       text;
  v_name        text;
  v_inject      text;
  v_org         uuid;
  v_rec         uuid;
  v_via         text;
  v_versions    jsonb;
  c             jsonb;
  v_cap         bigint;
  v_val         jsonb;
  v_whole       jsonb;
  a             jsonb;
  f             record;
  rec           record;
  v_levels      jsonb;
  v_rcache      jsonb := '{}'::jsonb;
  v_wheres      jsonb;
  v_tcache      jsonb := '{}'::jsonb;
  v_tid         uuid;
  v_tbl         jsonb;
begin
  if v_me is null then
    raise exception 'custom.resolve_context resolves context for a person, and nobody is signed in.'
      using errcode = '42501',
            hint = 'The server calls this door acting as the person operating the agent (DOOR-1).';
  end if;

  -- ── THE ENTITY: where the turn lives (read exactly as public.resolve_full_context reads it) ─
  if p_entity_type = 'task' then
    select t.project_id, p.organization_id, t.id
      into v_project_id, v_org_id, v_task_id
      from workspace.tasks t left join workspace.projects p on t.project_id = p.id
     where t.id = p_entity_id;
  elsif p_entity_type = 'project' then
    select p.organization_id, p.id into v_org_id, v_project_id
      from workspace.projects p where p.id = p_entity_id;
  elsif p_entity_type = 'conversation' then
    select c2.organization_id,
           (select a2.target_id from platform.associations_live a2
             where a2.source_type = 'conversation' and a2.source_id = c2.id
               and a2.target_type = 'project' and a2.organization_id = c2.organization_id
             order by a2.position nulls last, a2.created_at, a2.id limit 1),
           c2.task_id
      into v_org_id, v_project_id, v_task_id
      from chat.conversation c2 where c2.id = p_entity_id;
  elsif p_entity_type = 'note' then
    select n.organization_id,
           (select a2.target_id from platform.associations_live a2
             where a2.source_type = 'note' and a2.source_id = n.id and a2.target_type = 'project'
             order by a2.position nulls last, a2.created_at, a2.id limit 1),
           (select a2.target_id from platform.associations_live a2
             where a2.source_type = 'note' and a2.source_id = n.id and a2.target_type = 'task'
             order by a2.position nulls last, a2.created_at, a2.id limit 1)
      into v_org_id, v_project_id, v_task_id
      from workbench.notes n where n.id = p_entity_id;
  end if;

  -- ── THE CANDIDATES, in the old resolver's own order: the entity's tags, else its project's,
  --    then the selection. A tag is read by its TARGET ID whichever token the edge carries —
  --    `scope` today, its copy `record` (SC-4 P4, role context_tag; `custom_record` is the retired
  --    tier-2 token, read too so an edge under either store token is the same tag: grouped by
  --    target id, one candidate) (same id, CUT-4) — and in
  --    ANY organization, because the edge belongs to the entity's organization and the record
  --    to its own (Brightline's task, Harborline's app).
  select coalesce(jsonb_agg(jsonb_build_object('record_id', t.target_id, 'via', 'entity_tag') order by t.first_at, t.target_id), '[]'::jsonb)
    into v_cands
    from (select a2.target_id, min(a2.created_at) as first_at
            from platform.associations_live a2
           where a2.source_type = p_entity_type and a2.source_id = p_entity_id
             and a2.target_type in ('scope', 'record', 'custom_record')
           group by a2.target_id) t;

  if jsonb_array_length(v_cands) = 0 and v_project_id is not null and p_entity_type <> 'project' then
    select coalesce(jsonb_agg(jsonb_build_object('record_id', t.target_id, 'via', 'project_tag') order by t.first_at, t.target_id), '[]'::jsonb)
      into v_cands
      from (select a2.target_id, min(a2.created_at) as first_at
              from platform.associations_live a2
             where a2.source_type = 'project' and a2.source_id = v_project_id
               and a2.target_type in ('scope', 'record', 'custom_record')
             group by a2.target_id) t;
  end if;

  if p_record_ids is not null then
    select v_cands || coalesce(jsonb_agg(jsonb_build_object('record_id', s.id, 'via', 'selection') order by s.ord), '[]'::jsonb)
      into v_cands
      from unnest(p_record_ids) with ordinality as s(id, ord)
     where s.id is not null
       and not (v_cands @> jsonb_build_array(jsonb_build_object('record_id', s.id)));
  end if;

  -- ── EVERY CANDIDATE CHECKED FOR THE PERSON — the one rule changed on purpose ──────────────
  -- The old resolver checked only the selection; a tag and a project's tag delivered every
  -- cell to whoever ran the turn. Here each record, however it arrived, is asked through
  -- custom.where_id_opens: organization members, direct and outside grants, and (P7's read
  -- arm) a scope membership on that record. What is refused is NAMED in `checks`, never
  -- dropped in silence.
  -- STORE-READ-PERF-2: the ladder is asked about every candidate at once, for the person the read
  -- door reads as (auth.uid(), as custom.read_record does), and each read below is handed its
  -- answer; the Table's value and choice plans ride from one record to the next in v_rcache.
  v_levels := custom.levels_of(auth.uid(),
                (select array_agg((e ->> 'record_id')::uuid) from jsonb_array_elements(v_cands) e));
  -- STORE-READ-PERF-3: where each candidate opens, asked ONCE for the whole set — one lookup of
  -- their homes, the organization wall once per organization, and the ladder's viewer answer
  -- taken from v_levels (asked above for the same person) — each answer exactly
  -- custom.where_id_opens(<id>).
  v_wheres := custom._where_ids_open_with(
                (select array_agg((e ->> 'record_id')::uuid) from jsonb_array_elements(v_cands) e),
                auth.uid(), v_levels);
  for c in select value from jsonb_array_elements(v_cands) loop
    v_rec := (c ->> 'record_id')::uuid;
    v_via := c ->> 'via';
    v_where := v_wheres -> (v_rec::text);
    if v_where is null then
      v_checks := v_checks || jsonb_build_object('record_id', v_rec, 'via', v_via, 'admitted', false,
        'reason', 'not_opened',
        'says', 'This scope is not one you may open in the record store — it has not been shared with you, or it has not been copied into the store yet.');
      continue;
    end if;
    if v_where ->> 'kind' <> 'record' then
      v_checks := v_checks || jsonb_build_object('record_id', v_rec, 'via', v_via, 'admitted', false,
        'reason', 'not_a_record', 'kind', v_where ->> 'kind',
        'says', 'That id opens something that is not a record, so it carries no context values.');
      continue;
    end if;
    if not coalesce((v_where ->> 'live')::boolean, true) then
      v_checks := v_checks || jsonb_build_object('record_id', v_rec, 'via', v_via, 'admitted', false,
        'reason', 'in_trash', 'organization_id', v_where -> 'organization_id',
        'says', 'This scope''s record is in the trash, so nothing is read from it until it is restored.');
      continue;
    end if;

    v_org := (v_where ->> 'organization_id')::uuid;
    begin
      -- THE DECISION, IN THIS BODY (lane SUITE-HEALTH-2): the record's own organization's wall,
      -- asked by this door. custom._where_ids_open_with asked it once for this organization and
      -- remembered the yes for the transaction, so this is free and refuses nobody it admitted.
      perform custom.assert_client_may_reach(v_org, 'custom.resolve_context');
      select w.o_doc, w.o_cache into v_doc, v_rcache
        from custom._read_record_with(v_org, v_rec, false, v_levels, v_rcache) w;
    exception when others then
      v_checks := v_checks || jsonb_build_object('record_id', v_rec, 'via', v_via, 'admitted', false,
        'reason', 'door_refused', 'organization_id', v_org, 'sqlstate', sqlstate, 'says', sqlerrm);
      continue;
    end;

    -- STORE-READ-PERF-3: the record's Table is looked up once per Table, not once per record.
    v_tid := (select x.table_id from custom.record x where x.organization_id = v_org and x.id = v_rec);
    v_tbl := case when v_tid is not null then v_tcache -> (v_tid::text) end;
    if v_tbl is null then
      select r.* into v_table
        from custom.record r
       where r.id = v_tid
         and r.table_id = custom.table_kernel_id()
       limit 1;
      v_tbl := jsonb_build_object('id', v_table.id,
        'title_field', coalesce(nullif(v_table.data ->> 'title_field', ''), 'name'),
        'label', coalesce(nullif(v_table.data ->> 'label_singular', ''), nullif(v_table.data ->> 'name', ''), 'record'));
      if v_tid is not null then
        v_tcache := v_tcache || jsonb_build_object(v_tid::text, v_tbl);
      end if;
    end if;
    v_title_field := v_tbl ->> 'title_field';
    v_label := v_tbl ->> 'label';
    v_name := coalesce(nullif(v_doc ->> v_title_field, ''), v_rec::text);
    v_hidden := coalesce(v_doc -> '_hidden', '{}'::jsonb);

    v_checks := v_checks || jsonb_build_object('record_id', v_rec, 'via', v_via, 'admitted', true,
      'organization_id', v_org, 'table_id', (v_tbl ->> 'id')::uuid, 'name', v_name);
    -- THE TRIPLE, so the compare page can say which side is behind (copy lag) rather than
    -- merely that two values differ. INSPECTOR-TAILS (2026-09-25): read from the record this
    -- door has just opened for the person (custom.read_record above), the same `_values` /
    -- `_derived` / `_computed` metadata custom.record_values_versioned reads, for the same keys
    -- (the record's values plus its `_values` entries). It used to CALL that door once per
    -- record, and the door re-asked the organization wall, the record ladder and the whole field
    -- mask the read door had just answered — about 23 ms a record, 400 of the 850 ms a type of
    -- 17 scopes took. Proven identical on 70 live scope records before the swap.
    select coalesce(jsonb_object_agg(k.key, jsonb_build_object(
             'value_version', coalesce((x.data -> '_values' -> k.key ->> 'ver')::integer, 1),
             'written_at', coalesce((x.data -> '_values' -> k.key ->> 'at')::timestamptz,
                                    (x.data -> '_derived' -> k.key ->> 'at')::timestamptz,
                                    (x.data -> '_computed' -> k.key ->> 'at')::timestamptz))),
           '{}'::jsonb)
      into v_versions
      from custom.record x
      cross join lateral (
        select j.key from jsonb_object_keys(v_doc) j(key) where left(j.key, 1) <> '_'
        union
        select j.key from jsonb_object_keys(coalesce(x.data -> '_values', '{}'::jsonb)) j(key)
      ) k
     where x.organization_id = v_org and x.id = v_rec;
    -- BIG-VALUES-READERS: this organization's cap on one context value handed to an agent
    -- (0, the default, is no cap: the agent gets the whole text, exactly as the old path does).
    v_cap := custom.agent_context_value_cap(v_org);
    v_admitted := v_admitted || jsonb_build_object('record_id', v_rec, 'organization_id', v_org,
      'table_id', (v_tbl ->> 'id')::uuid, 'name', v_name, 'type_label', lower(v_label), 'via', v_via,
      'doc', v_doc - '_hidden' - '_alternates' - '_retired' - '_redirected_from' - '_redirect_says',
      'hidden', v_hidden, 'title_field', v_title_field, 'versions', v_versions, 'cap', v_cap);
  end loop;

  -- ── THE ACTIVE TABLES with no record chosen ("I'm working in Clients") — named, for the person ─
  if p_table_ids is not null then
    v_wheres := custom._where_ids_open_with(p_table_ids);
    select coalesce(jsonb_agg(t.id), '[]'::jsonb) into v_tables
      from unnest(p_table_ids) t(id)
     where coalesce(v_wheres -> (t.id::text) ->> 'kind', '') = 'table';
  end if;

  -- ── SCOPE LABELS: every admitted record's name under its Table's singular label ────────────
  select coalesce(jsonb_object_agg(x.type_label, x.names), '{}'::jsonb)
    into v_scope_labels
    from (
      select e ->> 'type_label' as type_label,
             case when count(*) > 1 then jsonb_agg(e ->> 'name' order by e ->> 'name')
                  else to_jsonb(min(e ->> 'name')) end as names
        from jsonb_array_elements(v_admitted) e
       group by e ->> 'type_label'
    ) x;

  -- ── THE SYSTEM LANE: System context stays its own table (§5 D10), and a System item is read
  --    only when it is NAMED (lane CONTEXT-VALUES-NAMED-2): p_system_item_refs, the same ids-or-keys
  --    list public.resolve_full_context takes; NULL or empty reads none ─────────────────────────
  for rec in (
    select sci.id as context_item_id, sci.key, sci.description,
           sci.value_type::text as value_type, sci.value as value
      from context.named_system_context_items(context.system_item_refs_or_defaults(p_system_item_refs)) sci
     where sci.is_active = true and sci.deleted_at is null and sci.feed_type != 'dataset'
     order by sci.sort_order asc, sci.key asc
  ) loop
    continue when rec.value is null;
    v_cell := jsonb_build_object(
      'key', rec.key, 'value', rec.value, 'type', rec.value_type, 'description', rec.description,
      'context_item_id', rec.context_item_id,
      'scope_id', null, 'scope_name', 'System', 'scope_type_id', null, 'source', 'system');
    v_variables := v_variables || jsonb_build_object(rec.key, jsonb_build_object(
      'value', rec.value, 'type', rec.value_type, 'inject_as', 'direct',
      'source', 'system', 'description', rec.description,
      'cells', coalesce(v_variables -> rec.key -> 'cells', '[]'::jsonb) || jsonb_build_array(v_cell)));
    v_sources := v_sources || jsonb_build_object(rec.key, 'system');
    v_cells := v_cells || jsonb_build_object(rec.context_item_id::text,
      coalesce(v_cells -> rec.context_item_id::text, '[]'::jsonb) || jsonb_build_array(v_cell));
  end loop;

  for rec in (
    select sci.id as context_item_id, sci.key, sci.description, sci.display_name,
           sci.feed_config as feed_config
      from context.named_system_context_items(context.system_item_refs_or_defaults(p_system_item_refs)) sci
     where sci.is_active = true and sci.deleted_at is null and sci.feed_type = 'dataset'
       and sci.feed_config ? 'data_store_id'
     order by sci.sort_order asc, sci.key asc
  ) loop
    v_cell := jsonb_build_object(
      'key', rec.key,
      'value', jsonb_build_object('kind', 'dataset',
          'data_store_id', rec.feed_config->>'data_store_id',
          'name', coalesce(rec.feed_config->>'data_store_name', rec.display_name),
          'short_code', rec.feed_config->>'data_store_short_code'),
      'type', 'dataset', 'description', rec.description,
      'context_item_id', rec.context_item_id,
      'scope_id', null, 'scope_name', 'System', 'scope_type_id', null, 'source', 'system');
    v_variables := v_variables || jsonb_build_object(rec.key, jsonb_build_object(
      'value', jsonb_build_object('kind', 'dataset',
          'data_store_id', rec.feed_config->>'data_store_id',
          'name', coalesce(rec.feed_config->>'data_store_name', rec.display_name),
          'short_code', rec.feed_config->>'data_store_short_code',
          'hint', 'Knowledge resource — query it with the RAG tools, e.g. knowledge_search(data_store_id=<data_store_id>).'),
      'type', 'dataset', 'inject_as', 'reference', 'source', 'system', 'description', rec.description,
      'cells', coalesce(v_variables -> rec.key -> 'cells', '[]'::jsonb) || jsonb_build_array(v_cell)));
    v_sources := v_sources || jsonb_build_object(rec.key, 'system');
    v_cells := v_cells || jsonb_build_object(rec.context_item_id::text,
      coalesce(v_cells -> rec.context_item_id::text, '[]'::jsonb) || jsonb_build_array(v_cell));
  end loop;

  -- ── THE RECORDS' FIELDS: every declared Field of each admitted record, except its title and a
  --    Field declared `exclude` — in Table, Field and record order, as the old resolver orders
  --    scope type, context item and scope. A Field this person may not see is WITHHELD and
  --    named; a relation (a reference) moves to the on-demand tier, where DYN-17 says it belongs
  --    — the one declared tier move.
  for rec in (
    select e.value as a, fr.id as field_id, fr.data ->> 'key' as fkey, fr.data ->> 'type' as ftype,
           fr.data ->> 'label' as flabel, fr.data ->> 'description' as fdesc,
           coalesce(nullif(fr.data ->> 'sort', '')::int, 0) as fsort
      from jsonb_array_elements(v_admitted) with ordinality e(value, ord)
      join custom.record fr
        on fr.organization_id = (e.value ->> 'organization_id')::uuid
       and fr.table_id = custom.field_kernel_id()
       and fr.deleted_at is null
       and (fr.data ->> 'entity_definition_id')::uuid = (e.value ->> 'table_id')::uuid
     where fr.data ->> 'key' is distinct from (e.value ->> 'title_field')
       and coalesce(fr.data ->> 'context_policy', 'include') <> 'exclude'
     order by e.value ->> 'type_label', coalesce(nullif(fr.data ->> 'sort', '')::int, 0),
              e.value ->> 'name', e.value ->> 'record_id'
  ) loop
    a := rec.a;
    if (a -> 'hidden') ? rec.fkey then
      v_withheld := v_withheld || jsonb_build_object(
        'record_id', a -> 'record_id', 'record_name', a -> 'name', 'key', rec.fkey,
        'reason', coalesce(a -> 'hidden' -> rec.fkey ->> 'reason', 'this field is not visible at your level'));
      continue;
    end if;
    continue when (a -> 'doc' -> rec.fkey) is null or jsonb_typeof(a -> 'doc' -> rec.fkey) = 'null';
    v_inject := case when rec.ftype in ('relation', 'entity_reference') then 'tool_accessible' else 'direct' end;
    -- BIG-VALUES-READERS: what the agent is handed for this value. A value kept as a file is
    -- its whole text (the store's client reads the file the door names in `whole_value`), or,
    -- under the organization's cap, its first words and the file to open — never the first
    -- words alone. A relation to files is the file reference the old path hands.
    v_val := custom.agent_context_value(a -> 'doc', rec.fkey, rec.ftype, (a ->> 'organization_id')::uuid,
                                        (a ->> 'record_id')::uuid, coalesce((a ->> 'cap')::bigint, 0));
    v_whole := v_val -> 'whole_value';
    v_val := v_val -> 'value';
    v_cell := jsonb_build_object(
      'key', rec.fkey, 'value', v_val, 'type', rec.ftype,
      'description', coalesce(rec.fdesc, rec.flabel),
      'context_item_id', rec.field_id,
      'scope_id', a -> 'record_id', 'scope_name', a -> 'name', 'scope_type_id', a -> 'table_id',
      'organization_id', a -> 'organization_id', 'via', a -> 'via',
      'value_version', a -> 'versions' -> rec.fkey -> 'value_version',
      'written_at', a -> 'versions' -> rec.fkey -> 'written_at',
      'source', 'scope:' || (a ->> 'name'))
      || case when v_whole is null then '{}'::jsonb else jsonb_build_object('whole_value', v_whole) end;
    v_variables := v_variables || jsonb_build_object(rec.fkey, jsonb_build_object(
      'value', v_val, 'type', rec.ftype, 'inject_as', v_inject,
      'source', 'scope:' || (a ->> 'name'), 'description', coalesce(rec.fdesc, rec.flabel),
      'cells', coalesce(v_variables -> rec.fkey -> 'cells', '[]'::jsonb) || jsonb_build_array(v_cell))
      || case when v_whole is null then '{}'::jsonb else jsonb_build_object('whole_value', v_whole) end);
    v_sources := v_sources || jsonb_build_object(rec.fkey, 'scope:' || (a ->> 'name'));
    v_cells := v_cells || jsonb_build_object(rec.field_id::text,
      coalesce(v_cells -> rec.field_id::text, '[]'::jsonb) || jsonb_build_array(v_cell));
  end loop;

  return jsonb_build_object(
    'scope_labels', v_scope_labels,
    'variables',    v_variables,
    'sources',      v_sources,
    'cell_values',  v_cells,
    'context', jsonb_build_object(
      'user_id', v_me, 'organization_id', v_org_id, 'project_id', v_project_id, 'task_id', v_task_id,
      'scope_ids', coalesce((select jsonb_agg(e -> 'record_id') from jsonb_array_elements(v_admitted) e), '[]'::jsonb),
      'table_ids', v_tables),
    'checks',       v_checks,
    'withheld',     v_withheld,
    'resolved_at',  extract(epoch from now()),
    'read_as',      'the person operating this agent',
    'through',      'custom.where_id_opens for every contributing record, then custom.read_record under that record''s own organization');
end;
$function$;
