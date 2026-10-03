-- chair-step: the inverse of migrations/campaign/scopesb2_a_scope_value_shows_the_version_a_person_made.sql:
--   puts back the two door bodies of 2026-10-02 before lane 9 rulings 2 and 4 (custom.context_values answers
--   the stamp's ver as `version`; custom.context_archived_types counts every archived row of a type).
-- lane: SCOPES-ON-THE-STORE
-- based-on: custom.context_values(uuid[]) 8c37b991ae3083c86d8603150a9d84836a1088af70918efe8d2a2a1452de2bda
-- based-on: custom.context_archived_types(uuid) 9421fb8f126b50e71b177e2556164b1e1dc81f95aac009ab8704fe78f3fe8dc6

CREATE OR REPLACE FUNCTION custom.context_values(p_scope_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me     uuid := custom.query_principal();
  v_tables uuid := custom.table_kernel_id();
  v_fields uuid := custom.field_kernel_id();
  v_ids    uuid[];
  v_grp    record;
  v_out    jsonb := '[]'::jsonb;
  -- SCOPES-D2 (lane 9): the Table list asked once per organization, for the Tables of this call
  v_todo   jsonb := '[]'::jsonb;
  v_among  jsonb;
  v_listed text[] := '{}'::text[];   -- 'organization:Table' (a record id is unique only within its organization)
  v_g      jsonb;
  v_o      text;
begin
  select coalesce(array_agg(distinct i), '{}'::uuid[]) into v_ids
    from unnest(coalesce(p_scope_ids, '{}'::uuid[])) i where i is not null;
  if v_me is null or cardinality(v_ids) = 0 then
    return v_out;
  end if;
  if cardinality(v_ids) > 200 then
    raise exception 'custom.context_values answers at most 200 scopes a call (% asked).', cardinality(v_ids)
      using errcode = '22023', hint = 'Ask in batches of 200 or fewer.';
  end if;


  -- A value is a key of the scope's Record document; the document comes through
  -- custom.read_records_by_ids (the one ladder, the one read mask), so a key the caller may not see
  -- is simply absent. Beside each value: its version, when it was set, the source it came from and
  -- the old value id the copy carried (the Record's own value stamps).
  --
  -- SCOPES-D2 (lane 9, 2026-10-02): ONLY THE RECORDS THAT CAN HOLD A VALUE ARE READ. A scope answers
  -- a row here only for a value Field of its Table (a Field that is not one of the scope's own
  -- columns — those carry v5 ids) whose key its document holds, non-null. Most scopes hold none (a
  -- member's 683 scopes hold 19 values), yet every one was read through the ladder and the mask.
  -- So a record goes to custom.read_records_by_ids only when its stored data could produce such a
  -- row: a non-null value under one of those keys, or a `_computed` / `_derived` block, or its Table
  -- has a Field worked out at read time (lookup / rollup / formula). Anything else can only produce
  -- nothing, so leaving it out changes no answer (scopesd1d2_same_answer.mjs: memos on and off, both
  -- seats, hashed before and after). The wall is still met for every organization asked about, in the
  -- same order, before anything is read. Then the Table list is asked once per organization for the
  -- Tables this call reads (custom.tables_listed_among: query_visible_ids' answer restricted to them),
  -- with every organization and its Tables named in the statement memo first
  -- ('custom.kernel_among_batch:<person>', as custom.context_tree names them — STORE-READ-PERF-6), so
  -- the one ladder's Table walk is asked once for all of them; the name is dropped before any record
  -- is read.
  for v_grp in
    with g as materialized (
      select r.organization_id as org, r.table_id as tbl, r.id, r.data
        from custom.record r
        join custom.record t
          on t.organization_id = r.organization_id and t.id = r.table_id
         and t.table_id = v_tables and t.deleted_at is null and t.data ->> 'kept_for' = 'context'
       where r.id = any (v_ids) and r.deleted_at is null
    ),
    k as materialized (
      select x.organization_id as org, x.data ->> 'entity_definition_id' as tbl,
             array_agg(x.data ->> 'key') as keys,
             bool_or(custom.parity_type(x.data) in ('lookup', 'rollup', 'formula')) as computed
        from custom.record x
       where x.organization_id in (select distinct g.org from g)
         and x.table_id = v_fields and x.deleted_at is null
         and x.data ->> 'entity_definition_id' in (select distinct g.tbl::text from g)
         and substr(x.id::text, 15, 1) <> '5'
       group by 1, 2
    ),
    s as (
      select g.org, g.tbl, array_agg(g.id) as ids,
             coalesce(array_agg(g.id) filter (where k.org is not null and (
                        k.computed
                     or exists (select 1 from unnest(k.keys) kk
                                 where coalesce(jsonb_typeof(g.data -> kk), 'null') <> 'null')
                     or coalesce(g.data -> '_computed', '{}'::jsonb) not in ('{}'::jsonb, 'null'::jsonb)
                     or coalesce(g.data -> '_derived', '{}'::jsonb) not in ('{}'::jsonb, 'null'::jsonb))),
                      '{}'::uuid[]) as held
        from g left join k on k.org = g.org and k.tbl = g.tbl::text
       group by g.org, g.tbl
    )
    select s.org, s.tbl, s.ids, s.held
      from s
     order by s.org, s.tbl
  loop
    continue when not (iam.has_org_access(v_grp.org) or custom.portal_admits(v_grp.org));
    perform custom.assert_client_may_reach(v_grp.org, 'custom.context_values');
    continue when cardinality(v_grp.held) = 0;
    v_todo := v_todo || jsonb_build_array(jsonb_build_object('org', v_grp.org, 'tbl', v_grp.tbl, 'held', to_jsonb(v_grp.held)));
  end loop;
  if jsonb_array_length(v_todo) = 0 then
    return v_out;
  end if;

  -- STORE-READ-PERF-5: the Table list asked among these Tables, not every Table of the organization;
  -- SCOPES-D2: once per organization, every organization's walk asked in one pass.
  select jsonb_object_agg(o.org, o.tbls) into v_among
    from (select t ->> 'org' as org, jsonb_agg(distinct t -> 'tbl') as tbls
            from jsonb_array_elements(v_todo) t group by 1) o;
  perform platform.memo_k_put('custom.kernel_among_batch:' || v_me::text, v_among::text);
  for v_o in select jsonb_object_keys(v_among) loop
    v_listed := v_listed || coalesce((select array_agg(v_o || ':' || v::text) from custom.tables_listed_among(
                  v_o::uuid, array(select jsonb_array_elements_text(v_among -> v_o)::uuid)) v), '{}'::text[]);
  end loop;
  perform platform.memo_k_drop('custom.kernel_among_batch:' || v_me::text);

  for v_g in select t from jsonb_array_elements(v_todo) t loop
    continue when not ((v_g ->> 'org') || ':' || (v_g ->> 'tbl') = any (v_listed));
    select (v_g ->> 'org')::uuid as org, (v_g ->> 'tbl')::uuid as tbl,
           array(select jsonb_array_elements_text(v_g -> 'held')::uuid) as held
      into v_grp;
    v_out := v_out || coalesce((
      with d as materialized (
        select x.id, x.document from custom.read_records_by_ids(v_grp.org, v_grp.tbl, v_grp.held, false) x
      ),
      h as materialized (
        select r.id, r.data -> '_values' as stamps, r.data -> '_sources' as sources, r.updated_at
          from custom.record r where r.organization_id = v_grp.org and r.id = any (v_grp.held)
      ),
      f as materialized (
        select x.id, x.data, x.metadata from custom.record x
         where x.organization_id = v_grp.org and x.table_id = v_fields and x.deleted_at is null
           and x.data ->> 'entity_definition_id' = v_grp.tbl::text
           and substr(x.id::text, 15, 1) <> '5'
      ),
      v as materialized (
        select d.id as scope_id, f.id as item_id, f.data ->> 'key' as key, f.data as fdoc, f.metadata as fmeta,
               d.document -> (f.data ->> 'key') as value,
               h.stamps -> (f.data ->> 'key') as stamp, h.sources, h.updated_at,
               d.document -> '_values' as dvals, d.document -> '_sources' as dsrcs
          from d join h on h.id = d.id
          join f on d.document ? (f.data ->> 'key') and jsonb_typeof(d.document -> (f.data ->> 'key')) <> 'null'
      ),
      -- SCOPES-D1 (lane 9, 2026-10-02): A TEXT KEPT AS A FILE IS NEVER ANSWERED AS ITS FIRST WORDS ALONE.
      -- The cell of a value over the store's ceiling holds its first 1000 characters; the whole text
      -- is a file. The read door's document names that file for a Field the caller may see
      -- (custom.with_whole_value_pointers), so the row carries it as `whole_value` (the file fields of
      -- the pointer only, custom.whole_value_pointer_of) and the screen opens the whole text. A text
      -- written but still waiting for its file (`pending`: the follower attaches it within seconds) is
      -- answered WHOLE from the store's own waiting row, and says so (`whole_value.in_value`).
      w as materialized (
        select v.*,
               case when jsonb_typeof(v.value) = 'string' then
                 coalesce(custom.whole_value_pointer_of(v.dvals, v.dsrcs, v.key),
                          case when v.sources -> (v.stamp ->> 'src') ->> 'kind' = 'whole_value_in_file'
                                and coalesce(v.sources -> (v.stamp ->> 'src') ->> 'file_id', '') = ''
                               then jsonb_strip_nulls(jsonb_build_object(
                                      'kind', 'whole_value_in_file', 'pending', true,
                                      'bytes', v.sources -> (v.stamp ->> 'src') -> 'bytes',
                                      'chars', v.sources -> (v.stamp ->> 'src') -> 'chars',
                                      'sha256', v.sources -> (v.stamp ->> 'src') -> 'sha256',
                                      'shown_chars', v.sources -> (v.stamp ->> 'src') -> 'shown_chars',
                                      'mime', v.sources -> (v.stamp ->> 'src') -> 'mime'))
                          end)
               end as whole
          from v
      ),
      wv as materialized (
        select w.*,
               case when (w.whole ->> 'pending')::boolean then
                 (select p.whole_text from custom.whole_value_parked p
                   where p.organization_id = v_grp.org and p.record_id = w.scope_id and p.field_key = w.key
                     and p.sha256 = w.whole ->> 'sha256')
               end as parked
          from w
      ),
      -- The names of the scopes a reference points at, for its chip — only scopes the caller sees
      -- (the one ladder's level on each, custom.levels_of, asked once for all of them).
      refs as materialized (
        select distinct (e #>> '{}')::uuid as id
          from v cross join lateral jsonb_array_elements(case jsonb_typeof(v.value)
                                                           when 'array' then v.value
                                                           when 'string' then jsonb_build_array(v.value)
                                                           else '[]'::jsonb end) e
         where v.fdoc ->> 'type' = 'relation' and jsonb_typeof(e) = 'string'
           and (e #>> '{}') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      ),
      lv as materialized (
        select custom.levels_of(v_me, (select array_agg(refs.id) from refs)) as l where exists (select 1 from refs)
      ),
      names as materialized (
        select x.id, x.data ->> 'name' as name,
               -- A File RECORD (the kernel File Table) names its file in data.file_id; the old fence
               -- named the file, so the answer carries it beside the name (lane SCOPES-READ-SWITCH-VALIDATE).
               case when x.table_id = '11111111-0000-4000-8000-000000000006'::uuid then x.data ->> 'file_id' end as file_id
          from custom.record x, lv
         where x.organization_id = v_grp.org and x.id in (select refs.id from refs)
           and (lv.l -> x.id::text ->> 'l') is not null
      )
      select jsonb_agg(jsonb_build_object(
               'scope_id', v.scope_id, 'context_item_id', v.item_id, 'key', v.key,
               'value', case when v.parked is not null then to_jsonb(v.parked) else v.value end,
               'field', jsonb_build_object(
                 'type', v.fdoc -> 'type', 'multi', v.fdoc -> 'multi', 'format', v.fdoc -> 'format',
                 'display_format', v.fdoc -> 'display_format', 'config', v.fdoc -> 'config',
                 'relation_target', v.fdoc -> 'relation_target',
                 'carried', v.fmeta -> 'moved_from' -> 'carried'),
               'version', coalesce((v.stamp ->> 'ver')::int, 1),
               'set_at', coalesce(v.stamp ->> 'at', v.updated_at::text),
               'source_type', v.sources -> (v.stamp ->> 'src') ->> 'source_type',
               'value_id', v.sources -> (v.stamp ->> 'src') ->> 'old_value_id',
               'authored_by', case when (v.stamp ->> 'actor') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
                                   then v.stamp ->> 'actor' end,
               'labels', (select jsonb_object_agg(n.id, n.name) from names n
                           where v.fdoc ->> 'type' = 'relation'
                             and (n.id::text = v.value #>> '{}'
                                  or (jsonb_typeof(v.value) = 'array' and v.value ? n.id::text))),
               'files', (select jsonb_object_agg(n.id, n.file_id) from names n
                          where n.file_id is not null and v.fdoc ->> 'type' = 'relation'
                            and (n.id::text = v.value #>> '{}'
                                 or (jsonb_typeof(v.value) = 'array' and v.value ? n.id::text))))
             || case when v.whole is null then '{}'::jsonb
                     else jsonb_build_object('whole_value',
                            v.whole || case when v.parked is not null then '{"in_value": true}'::jsonb else '{}'::jsonb end)
                end)
        from wv v), '[]'::jsonb);
  end loop;
  return v_out;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.context_archived_types(p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me       uuid := custom.query_principal();
  v_uid      uuid := auth.uid();
  v_tables   uuid := custom.table_kernel_id();
  v_cand     uuid[];
  v_level    public.permission_level;
  v_mask     jsonb;
  v_shown    text[];
  v_declared text[];
  v_rows     jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.context_archived_types');
  if v_me is null then
    return '[]'::jsonb;
  end if;
  -- STORE-READ-PERF-5 (2026-09-30). ONLY THE ARCHIVED TABLES THE CONTEXT SYSTEM KEPT ARE READ.
  -- This door used to page custom.read_records_archived over EVERY archived Table of the organization
  -- (200 a page, each row rendered: its derived values, the mask, the choice labels) and keep the
  -- ones whose document said kept_for = context. test@test.com's own workspace holds 1,313 archived
  -- Tables and no archived scope type: 7-30 s to answer []. The candidates are the archived,
  -- unquarantined kernel rows whose stored kept_for is context (a superset of what the old filter
  -- kept, which read the same key from the rendered document); none, and the answer is [].
  -- The Table decision is asked first, as the archive door asked it (the wall was asked above, in
  -- this door's own name).
  perform custom.assert_may_know_table(p_organization_id, v_tables, 'custom.context_archived_types');
  select coalesce(array_agg(r.id), '{}'::uuid[]) into v_cand
    from custom.record r
   where r.organization_id = p_organization_id
     and r.table_id = v_tables
     and r.deleted_at is not null
     and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
     and r.data ->> 'kept_for' = 'context';
  if cardinality(v_cand) = 0 then
    return '[]'::jsonb;
  end if;
  -- Of the candidates, exactly what the archive door answers about them: its rows through the one
  -- ladder's own predicate for this Table at viewer (custom.visible_predicate_sql, the sentence the
  -- archive door writes into its WHERE), each document through the one read mask
  -- (custom.read_mask_for at the caller's level on the Table), custom.mask_document,
  -- custom.choice_render and custom.with_whole_value_pointers, in that order, as the door renders it.
  v_level := custom.effective_level(v_uid, p_organization_id, v_tables);
  v_mask := custom.read_mask_for(v_uid, p_organization_id, v_tables, v_level, 'read');
  select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_shown
    from jsonb_array_elements(v_mask -> 'visible') x;
  select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_declared
    from jsonb_array_elements(v_mask -> 'declared') x;
  execute format($q$
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', r.id, 'doc', custom.record_values_of(r), 'wv', r.data -> '_values',
             'ws', r.data -> '_sources', 'at', r.deleted_at)), '[]'::jsonb)
      from custom.record r
     where r.organization_id = %1$L::uuid
       and r.table_id = %2$L::uuid
       and r.id = any (%3$L::uuid[])
       and r.deleted_at is not null
       and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
       and %4$s
  $q$,
    p_organization_id, v_tables, v_cand,
    custom.visible_predicate_sql(v_uid, p_organization_id, v_tables, 'viewer'::public.permission_level, 'r'))
  into v_rows;
  -- Each carries how many of its scopes were archived, which is what a restore brings back.
  return (
    select coalesce(jsonb_agg(z.x order by z.x ->> 'deleted_at' desc, z.x ->> 'id'), '[]'::jsonb)
      from (
        select jsonb_build_object(
                 'id', (p ->> 'id')::uuid, 'organization_id', p_organization_id,
                 'label_singular', d.doc -> 'label_singular', 'label_plural', d.doc -> 'label_plural',
                 'icon', d.doc -> 'icon', 'color', d.doc -> 'color',
                 'deleted_at', p -> 'at',
                 'archived_scope_count', (select count(*) from custom.record r
                                           where r.organization_id = p_organization_id
                                             and r.table_id = (p ->> 'id')::uuid and r.deleted_at is not null)) as x
          from jsonb_array_elements(v_rows) p
          cross join lateral (
            select custom.with_whole_value_pointers(
                     custom.choice_render(p_organization_id, v_tables,
                       custom.mask_document(p -> 'doc', v_shown, v_mask -> 'notices', false,
                                            v_mask -> 'all_key_ids', v_declared)),
                     p -> 'wv', p -> 'ws', v_shown, false, v_mask -> 'all_key_ids') as doc) d
         where d.doc ->> 'kept_for' = 'context') z);
end;
$function$;
