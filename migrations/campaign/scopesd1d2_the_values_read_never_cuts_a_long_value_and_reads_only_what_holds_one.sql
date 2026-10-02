-- chair-step: it CREATES one internal helper (custom._ctx_agent_cell: SECURITY INVOKER, STABLE, no client EXECUTE) and REPLACES the bodies of two lane-9 scope doors, custom.context_values and custom.context_resolve, with their signatures, security, search_path and grants unchanged. Additive only: custom.context_values gains a `whole_value` key on a row whose cell holds only the first words of a text kept as a file (and answers a text still waiting for its file whole), and reads through custom.read_records_by_ids only the records that can hold a value; custom.context_resolve gains `whole_value` on such a cell and binding and hands the first words with the file NAMED (custom.agent_context_value, as custom.resolve_context already does) instead of the first words alone. No table, index, policy, grant or data row is touched. Every other answer is the same (scripts/campaign-tests/scopesd1d2_a_long_scope_value_is_never_cut_red_green.sql; scopesd1d2_same_answer.mjs: both seats, memos on and off, hashed before and after).
-- lane: SCOPES-ON-THE-STORE
-- lock: custom
--
-- Inverse: migrations/inverse/scopesd1d2_the_values_read_never_cuts_a_long_value_and_reads_only_what_holds_one_down.sql.
--
-- THE USE CASE. Castellano & Reyes, LLP keeps a workers' compensation matter as a scope; its
-- official QME report is a 139,950-character text, over the store's 100,000-byte ceiling for one
-- value, so the store keeps it as a file (ebad7d37…) and the cell holds its first 1000 characters.
--   D1. custom.context_values — what every scope screen reads a scope's values through — answered
--       those 1000 characters with no file named, and the web adapter had nothing to open: with the
--       store read switch on, the matter page would show 1000 characters of the report and nothing
--       saying the rest exists. custom.context_resolve (the merge-field resolver's one-call read of a
--       turn's bound cells, live for organizations on custom/consumer_context_enabled) answered the
--       same 1000 characters to the agent. The agent's main hand-off, custom.resolve_context, was
--       already right (the file named, the store's client hands the whole text: byte-identical to the
--       old hand-off, sha256 ddbcdf4e…, clone 2026-10-02) and is not touched.
--   D2. custom.context_values took ~2 ms a scope (200 scopes ~400 ms for test@test.com on the clone)
--       against the old values read's ~0.7 ms: every scope of the call went through the ladder and
--       the read mask (custom.read_records_by_ids), though most hold no value at all (683 scopes, 19
--       values), and the Table list was asked once per Table instead of once per organization.
--
-- ── custom._ctx_agent_cell — ONE CELL OF A SCOPE AS AN AGENT IS HANDED IT (new, internal) ───────────
CREATE OR REPLACE FUNCTION custom._ctx_agent_cell(p_doc jsonb, p_raw jsonb, p_key text, p_org uuid, p_rec uuid, p_cap bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
-- SCOPES-D1 (lane 9, 2026-10-02). `p_doc` is the record as the read door answered it for the person;
-- `p_raw` its own `_values` / `_sources` stamps. Answers {value[, whole_value]}:
--   * a value kept as a file: custom.agent_context_value's answer — the first words, the file NAMED,
--     `whole_value.expand` asking the store's client for the whole text (or, over the organization's
--     cap, the start and the file, announced) — exactly what custom.resolve_context hands;
--   * a text still waiting for its file (`pending`): the whole text from the store's waiting row
--     (or its start and where the rest is, over the cap); if that row is gone, the first words and a
--     sentence saying the rest is still being saved — never the first words alone;
--   * anything else: the value unchanged.
declare
  v_val   jsonb := p_doc -> p_key;
  v_src   jsonb;
  v_whole text;
begin
  if jsonb_typeof(v_val) is distinct from 'string' then
    return jsonb_build_object('value', v_val);
  end if;
  if custom.whole_value_pointer_of(p_doc -> '_values', p_doc -> '_sources', p_key) is not null then
    return custom.agent_context_value(p_doc, p_key, 'text', p_org, p_rec, coalesce(p_cap, 0));
  end if;
  v_src := p_raw -> '_sources' -> (p_raw -> '_values' -> p_key ->> 'src');
  if v_src ->> 'kind' is distinct from 'whole_value_in_file' or coalesce(v_src ->> 'file_id', '') <> '' then
    return jsonb_build_object('value', v_val);
  end if;
  select p.whole_text into v_whole
    from custom.whole_value_parked p
   where p.organization_id = p_org and p.record_id = p_rec and p.field_key = p_key
     and p.sha256 = v_src ->> 'sha256';
  if v_whole is null then
    return jsonb_build_object(
      'value', to_jsonb((v_val #>> '{}') || E'…\n\n' || format(
        '[This is the start of a %s-character text that is still being saved as a file. The whole value is the "%s" field of record %s; read it again in a moment for all of it.]',
        coalesce(v_src ->> 'chars', '?'), p_key, p_rec)),
      'whole_value', jsonb_build_object('kind', 'whole_value_in_file', 'pending', true, 'expand', false,
        'chars', v_src -> 'chars', 'bytes', v_src -> 'bytes', 'sha256', v_src -> 'sha256',
        'record_id', p_rec, 'key', p_key));
  end if;
  if coalesce(p_cap, 0) > 0 and octet_length(v_whole) > p_cap then
    return jsonb_build_object(
      'value', to_jsonb(custom.text_head_bytes(v_whole, p_cap) || E'…\n\n' || format(
        '[This value is %s bytes, over this organization''s limit of %s bytes for one value handed to an agent, so only its start is here. The whole value is the "%s" field of record %s.]',
        octet_length(v_whole), p_cap, p_key, p_rec)),
      'whole_value', jsonb_build_object('kind', 'capped_in_record', 'pending', true, 'expand', false,
        'record_id', p_rec, 'key', p_key, 'bytes', octet_length(v_whole), 'cap_bytes', p_cap));
  end if;
  return jsonb_build_object('value', to_jsonb(v_whole),
    'whole_value', jsonb_build_object('kind', 'whole_value_in_file', 'pending', true, 'in_value', true,
      'expand', false, 'chars', length(v_whole), 'sha256', v_src -> 'sha256', 'record_id', p_rec, 'key', p_key));
end;
$function$;

REVOKE ALL ON FUNCTION custom._ctx_agent_cell(jsonb, jsonb, text, uuid, uuid, bigint) FROM PUBLIC, anon, authenticated, service_role;

-- ── custom.context_values ─────────────────────────────────────────────────────────────────────
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
  v_lorg   uuid;
  v_listed uuid[] := '{}'::uuid[];
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
  -- nothing, so leaving it out changes no answer (scopesd1d2_green.sql: memos on and off, both seats,
  -- hashed before and after). The wall is still met for every organization asked about, as before,
  -- and the Table list is asked once per organization for the Tables this call reads
  -- (custom.tables_listed_among: query_visible_ids' answer restricted to them), not once per Table.
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
    select s.org, s.tbl, s.ids, s.held,
           array_agg(s.tbl) filter (where cardinality(s.held) > 0) over (partition by s.org) as org_tbls
      from s
     order by s.org, s.tbl
  loop
    continue when not (iam.has_org_access(v_grp.org) or custom.portal_admits(v_grp.org));
    perform custom.assert_client_may_reach(v_grp.org, 'custom.context_values');
    continue when cardinality(v_grp.held) = 0;
    -- STORE-READ-PERF-5: the Table list asked among these Tables (custom.tables_listed_among:
    -- query_visible_ids' own answer, restricted to them), not every Table of the organization;
    -- SCOPES-D2: once per organization, for every Table of it this call reads.
    if v_lorg is distinct from v_grp.org then
      v_lorg := v_grp.org;
      select coalesce(array_agg(v), '{}'::uuid[]) into v_listed
        from custom.tables_listed_among(v_grp.org, v_grp.org_tbls) v;
    end if;
    continue when not (v_grp.tbl = any (v_listed));
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
$function$
;

-- ── custom.context_resolve ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION custom.context_resolve(p_bindings jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me           uuid;
  v_binding      jsonb;
  v_record_ids   uuid[] := '{}';
  v_records      jsonb := '{}'::jsonb;
  v_scope_map    jsonb := '{}'::jsonb;
  v_orgs         jsonb := '{}'::jsonb;
  v_unresolved   jsonb := '[]'::jsonb;
  v_out          jsonb := '[]'::jsonb;
  v_rec          uuid;
  v_org          uuid;
  v_where        jsonb;
  v_wheres       jsonb;
  v_doc          jsonb;
  v_hidden       jsonb;
  v_values       jsonb;
  v_row          record;
  v_key          text;
  v_field        text;
  v_cell         jsonb;
  v_sens         text;
  v_hint         text;
  v_delivery     text;
  v_note         text;
  v_fresh        text;
  v_stale        text;
  v_verdict      jsonb;
  v_order        jsonb := '{}'::jsonb;
  v_ready        text[];
  v_pending      jsonb;
  v_index        int := 0;
  v_progress     boolean;
  v_dep          jsonb;
  v_blocked      boolean;
  -- SCOPES-D1 (lane 9): a value kept as a file, or still waiting for its file, is never handed cut
  v_raw          jsonb;
  v_cap          bigint;
  v_caps         jsonb := '{}'::jsonb;
  v_ac           jsonb;
begin
  -- THE PERSON FIRST. There is no organization argument any more: each record names its own
  -- organization (custom.where_id_opens reads it from the record), so a turn whose scopes live
  -- in two organizations — Brightline's task tagged to Harborline's app — reads each under its
  -- own, and the organization the person happens to be working in decides nothing.
  v_me := custom.query_principal();
  if v_me is null then
    raise exception 'custom.context_resolve reads context for a person, and nobody is signed in.'
      using errcode = '42501',
            hint = 'DOOR-1: the read door reads the person from the session. The server calls this door acting as the person operating the agent.';
  end if;

  if p_bindings is null or jsonb_typeof(p_bindings) <> 'array' then
    raise exception 'custom.context_resolve was asked to resolve something that is not a list of bindings.'
      using errcode = '22004',
            hint = 'Pass a JSON array of {key, scope_id|record_id, field_key} objects. A turn with no context items passes [] and gets an empty answer.';
  end if;

  if jsonb_array_length(p_bindings) = 0 then
    return jsonb_build_object(
      'scope_records', '{}'::jsonb, 'records', '{}'::jsonb, 'organizations', '{}'::jsonb,
      'bindings', '[]'::jsonb, 'unresolved', '[]'::jsonb,
      'read_as', 'the person operating this agent',
      'through', 'custom.where_id_opens, then custom.read_record under the record''s own organization',
      'principal', v_me);
  end if;

  if exists (select 1 from jsonb_array_elements(p_bindings) b where jsonb_typeof(b) <> 'object') then
    raise exception 'custom.context_resolve was handed a list whose entries are not bindings.'
      using errcode = '22004',
            hint = 'Each entry is an object: {key, scope_id|record_id, field_key}. An array of strings or numbers is not a turn''s context cells.';
  end if;

  if jsonb_array_length(p_bindings) > 500 then
    raise exception 'custom.context_resolve was handed % bindings and the ceiling is 500.',
      jsonb_array_length(p_bindings)
      using errcode = '22003',
            hint = 'A turn addresses a handful of context cells. A list this long is a caller asking for a whole catalogue, which is a different door (custom.agent_context reads a Table).';
  end if;

  -- ── 1. EVERY DISTINCT RECORD THE TURN NAMES — the scope id IS the record id ─────────────
  select array_agg(distinct x) into v_record_ids from (
    select nullif(coalesce(nullif(b ->> 'record_id', ''), b ->> 'scope_id'), '')::uuid as x
      from jsonb_array_elements(p_bindings) b
  ) s where x is not null;

  -- ── 2. EACH ONE ASKED FOR THE PERSON, THEN READ ONCE UNDER ITS OWN ORGANIZATION ─────────
  -- STORE-READ-PERF-3: where each record opens, asked ONCE for the whole set (one lookup of their
  -- homes, the organization wall once per organization, the ladder once per class) — each answer
  -- exactly custom.where_id_opens(<id>).
  v_wheres := custom._where_ids_open_with(v_record_ids);
  foreach v_rec in array coalesce(v_record_ids, array[]::uuid[]) loop
    -- custom.where_id_opens is the ONE answer to "which organization does this id live in, and
    -- may this person open it" (ROUTE-RESOLVER; ACCESS-IS-PERSONAL uses the same door). Null is
    -- "not given to you" and "not in the store" alike, on purpose: the store does not tell a
    -- guessed id from a real one. The unresolved row says both halves, and the turn's old value
    -- stays underneath (the fallback link), so nothing is dropped.
    v_where := v_wheres -> (v_rec::text);
    if v_where is null or v_where ->> 'kind' <> 'record' then
      v_unresolved := v_unresolved || jsonb_build_object(
        'record_id', v_rec, 'key', '*', 'reason',
        'this scope is not a record you may open in the record store — it has not been shared with you, or it has not been copied into the store yet — so its fields resolve the way they always have (nothing was dropped and nothing was guessed).');
      continue;
    end if;
    if not coalesce((v_where ->> 'live')::boolean, true) then
      v_unresolved := v_unresolved || jsonb_build_object(
        'record_id', v_rec, 'key', '*', 'reason',
        'this scope''s record is in the trash, so nothing is read from it until it is restored.');
      continue;
    end if;
    v_org := (v_where ->> 'organization_id')::uuid;
    v_orgs := v_orgs || jsonb_build_object(v_rec::text, v_org);

    begin
      v_doc := custom.read_record(v_org, v_rec, false);
    exception when others then
      -- THE DOOR'S OWN REFUSAL, CARRIED, NOT SWALLOWED.
      v_unresolved := v_unresolved || jsonb_build_object(
        'record_id', v_rec, 'key', '*', 'sqlstate', sqlstate, 'reason', sqlerrm);
      continue;
    end;

    v_scope_map := v_scope_map || jsonb_build_object(v_rec::text, v_rec);
    v_hidden := coalesce(v_doc -> '_hidden', '{}'::jsonb);
    v_values := '{}'::jsonb;
    -- SCOPES-D1: the record's own value stamps say which cell holds only the first words of a
    -- text kept as a file (or still waiting for its file); the organization's cap on one value
    -- handed to an agent is read once per organization, as custom.resolve_context reads it.
    select jsonb_build_object('_values', r.data -> '_values', '_sources', r.data -> '_sources')
      into v_raw
      from custom.record r where r.organization_id = v_org and r.id = v_rec;
    if not v_caps ? v_org::text then
      v_caps := v_caps || jsonb_build_object(v_org::text, custom.agent_context_value_cap(v_org));
    end if;
    v_cap := (v_caps ->> v_org::text)::bigint;

    begin
      for v_row in
        select * from custom.record_values_versioned(v_org, v_rec)
      loop
        v_ac := custom._ctx_agent_cell(v_doc, v_raw, v_row.field_key, v_org, v_rec, v_cap);
        v_values := v_values || jsonb_build_object(v_row.field_key, jsonb_build_object(
          'value',         v_ac -> 'value',
          'field_id',      v_row.field_id,
          'value_version', v_row.value_version,
          'written_at',    v_row.written_at,
          'absent_reason', v_row.absent_reason,
          'actor',         v_row.actor,
          'source',        v_row.source,
          'masked',        v_hidden ? v_row.field_key,
          'mask_reason',   v_hidden -> v_row.field_key ->> 'reason')
          || case when v_ac ? 'whole_value' then jsonb_build_object('whole_value', v_ac -> 'whole_value') else '{}'::jsonb end);
      end loop;
    exception when others then
      select coalesce(jsonb_object_agg(e.key, jsonb_build_object(
               'value',         e.ac -> 'value',
               'field_id',      null,
               'value_version', null,
               'written_at',    null,
               'absent_reason', format('the store did not let this principal read value versions (%s) — the value is the read door''s and its version is unknown rather than guessed', sqlerrm),
               'masked',        v_hidden ? e.key,
               'mask_reason',   v_hidden -> e.key ->> 'reason')
               || case when e.ac ? 'whole_value' then jsonb_build_object('whole_value', e.ac -> 'whole_value') else '{}'::jsonb end), '{}'::jsonb)
        into v_values
        from (select j.key, custom._ctx_agent_cell(v_doc, v_raw, j.key, v_org, v_rec, v_cap) as ac
                from jsonb_each(v_doc - '_hidden' - '_alternates' - '_retired') j) e;
    end;

    v_records := v_records || jsonb_build_object(v_rec::text, v_values);
  end loop;

  -- ── 3. EVERY BINDING, WITH ITS TWO CEILINGS ───────────────────────────────────────────
  for v_binding in select b from jsonb_array_elements(p_bindings) b loop
    v_key   := v_binding ->> 'key';
    v_field := v_binding ->> 'field_key';
    -- THE SCOPE ID IS THE RECORD ID (CUT-4). No slug, no document key, no second identity.
    v_rec   := nullif(coalesce(nullif(v_binding ->> 'record_id', ''), v_binding ->> 'scope_id'), '')::uuid;

    if v_rec is null then
      v_unresolved := v_unresolved || jsonb_build_object(
        'key', v_key,
        'reason', 'this binding names no scope and no record, so there is nothing to read for it (nothing was dropped and nothing was guessed).');
      continue;
    end if;
    if not (v_records ? v_rec::text) then
      continue;  -- the record's own refusal is already in v_unresolved, with its sentence
    end if;

    -- AGT-7's SENSITIVITY CEILING. Delivery may not widen what sensitivity allows. A
    -- restricted field is not dropped — dropping a real value is worse — it is moved off
    -- the inline tier so the agent fetches it when it actually needs it.
    v_hint := lower(coalesce(nullif(btrim(v_binding ->> 'fetch_hint'), ''), 'always'));
    v_sens := lower(coalesce(nullif(btrim(v_binding ->> 'sensitivity'), ''), ''));
    v_note := null;
    v_delivery := case v_hint
                    when 'always' then 'inline'
                    when 'on_demand' then 'on_demand'
                    when 'lazy' then 'on_demand'
                    when 'batch_related' then 'on_demand'
                    else null
                  end;
    if v_delivery is null then
      v_delivery := 'inline';
      v_note := format('this field asks to be fetched %L, which is not a delivery this system knows; it is delivered inline rather than dropped', v_hint);
    end if;
    if v_delivery = 'inline' and v_sens in ('restricted', 'privileged', 'confidential') then
      v_delivery := 'on_demand';
      v_note := format('this field is %s, so it is never written into the prompt unasked — the agent fetches it when it needs it (AGT-7)', v_sens);
    end if;

    v_cell := v_records -> v_rec::text -> v_field;
    if v_cell is null then
      v_unresolved := v_unresolved || jsonb_build_object(
        'key', v_key, 'record_id', v_rec,
        'reason', format('the record this field points at has no field %L you can read', v_field));
      continue;
    end if;

    -- §D's FRESHNESS CEILING. THE RULE IS NOT WRITTEN HERE ANY MORE — it is
    -- `custom.freshness_verdict`, the one implementation this door, the merge resolver and
    -- every screen that shows a value's age all read. What used to be eighteen lines of the
    -- same arithmetic is one call, and a second copy of it anywhere now fails
    -- `pnpm check:one-freshness-ceiling`.
    v_verdict := custom.freshness_verdict(
                   nullif(v_cell ->> 'written_at', '')::timestamptz,
                   nullif(v_binding ->> 'freshness_seconds', '')::numeric);
    v_fresh := v_verdict ->> 'freshness';
    v_stale := v_verdict ->> 'stale_note';

    v_out := v_out || (jsonb_build_object(
      'key',           v_key,
      'scope_id',      v_binding -> 'scope_id',
      'record_id',     v_rec,
      'field_key',     v_field,
      'field_id',      v_cell -> 'field_id',
      'value',         v_cell -> 'value',
      'value_version', v_cell -> 'value_version',
      'written_at',    v_cell -> 'written_at',
      'masked',        v_cell -> 'masked',
      'mask_reason',   v_cell -> 'mask_reason',
      'absent_reason', v_cell -> 'absent_reason',
      'delivery',      v_delivery,
      'delivery_note', v_note,
      'freshness',     v_fresh,
      'stale_note',    v_stale,
      -- CARRIED, and this is not decoration: the ordering step below reads `depends_on`
      -- off these rows. Leaving it out made `v_pending` a map of empty arrays, so every
      -- binding looked ready at once and the order was whatever `jsonb_object_keys`
      -- happened to answer — which the seat suite caught as `2 < 0`.
      'depends_on',    coalesce(v_binding -> 'depends_on', '[]'::jsonb))
      -- SCOPES-D1: a value kept as a file names its file (whole_value), so the store's client hands
      -- the whole text (matrx_records RecordStore.context_resolve) — never the first words alone.
      || case when v_cell ? 'whole_value' then jsonb_build_object('whole_value', v_cell -> 'whole_value') else '{}'::jsonb end);
  end loop;

  -- ── 4. `depends_on` ORDER, AND A CYCLE NAMED RATHER THAN LOOPED ───────────────────────
  -- DYN-9 belongs at SAVE time and this is not save time, so a circle written before anybody
  -- checked it must not end somebody's turn. The bindings inside it are ordered last, and the
  -- answer SAYS which keys made the circle so the panel can render the remedy.
  select coalesce(jsonb_object_agg(b ->> 'key', coalesce(b -> 'depends_on', '[]'::jsonb)), '{}'::jsonb)
    into v_pending
    from jsonb_array_elements(v_out) b;

  loop
    v_progress := false;
    v_ready := '{}';
    for v_key in select k from jsonb_object_keys(v_pending) k loop
      v_blocked := false;
      for v_dep in select d from jsonb_array_elements(v_pending -> v_key) d loop
        if v_pending ? (v_dep #>> '{}') and (v_dep #>> '{}') <> v_key then
          v_blocked := true;
        end if;
      end loop;
      if not v_blocked then
        v_ready := v_ready || v_key;
      end if;
    end loop;
    exit when coalesce(array_length(v_ready, 1), 0) = 0;
    foreach v_key in array v_ready loop
      v_order := v_order || jsonb_build_object(v_key, v_index);
      v_index := v_index + 1;
      v_pending := v_pending - v_key;
      v_progress := true;
    end loop;
    exit when not v_progress;
  end loop;

  if v_pending <> '{}'::jsonb then
    v_unresolved := v_unresolved || jsonb_build_object(
      'key', (select string_agg(k, ' -> ') from jsonb_object_keys(v_pending) k),
      'reason', 'these context fields depend on each other in a circle, so no order can satisfy them all. They are resolved last, in the order they were declared, and the circle is what to fix.');
    for v_key in select k from jsonb_object_keys(v_pending) k loop
      v_order := v_order || jsonb_build_object(v_key, v_index);
      v_index := v_index + 1;
    end loop;
  end if;

  select coalesce(jsonb_agg(b || jsonb_build_object('order_index', v_order -> (b ->> 'key'))
                            order by coalesce((v_order ->> (b ->> 'key'))::int, 2147483647)), '[]'::jsonb)
    into v_out
    from jsonb_array_elements(v_out) b;


  return jsonb_build_object(
    'scope_records', v_scope_map,
    'records',       v_records,
    'organizations', v_orgs,
    'bindings',      v_out,
    'unresolved',    v_unresolved,
    'read_as',       'the person operating this agent',
    'through',       'custom.where_id_opens, then custom.read_record under the record''s own organization',
    'principal',     v_me);
end;
$function$
;

