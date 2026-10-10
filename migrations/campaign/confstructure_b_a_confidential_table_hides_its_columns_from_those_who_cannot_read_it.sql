-- target: branch,production
-- additive: yes
-- guard: access/confidential_hides_structure
-- lane: CONF-STRUCTURE
-- lock: custom
-- based-on: custom.applicable_fields(uuid, uuid, text) 42364cea39d5ae8973b822caab47891f4bea65ff586b3fbe0ae46344385374a2
-- based-on: custom.table_map_fields(uuid, uuid[]) 62076b381a377a9459bddb482c7eded305d316bba116834a1a5808e692c6250a
-- based-on: custom.reverse_columns(uuid, uuid) 68ede24709264616fce378cb8ab711fd93f9adaaf1df9537d48965d0c7dee9b1
-- based-on: custom.io_export(uuid, uuid, text[], integer, text) 9539d09bc4fec5be64142019b70e87bc85090ed412a4296bdf13679cb2744504
-- based-on: custom.table_kind_facts(uuid) d82986fdf136db6bf6d6a7911b643dc19c897cf085b05be6d23fe12f282e27ff
-- based-on: custom.enrichments(uuid, uuid) 435b4f8085461d7f234f9ec03ba08249d3277691ffa595e2c4766e20b94d5f14
-- based-on: custom.pipeline_read(uuid, uuid) a76e76e601581790038fdb309dbf14c3be5e05f8866ee87ae008d08fe2c415d5
-- based-on: custom.template_from_tables(uuid, uuid[], boolean, integer) d6f69091119efae51095a92f050e140bd7b325d863b5560fe086216ef7c57558
-- window-class: function bodies only (one new helper, eight door bodies); no table, column, index, trigger, policy or grant.
--
-- A CONFIDENTIAL TABLE'S COLUMNS ARE NOT THE BUSINESS OF A PERSON WHO CANNOT READ ITS ROWS.
-- Found 2026-10-09: on a Confidential custom table a plain org member who reads no rows still got its
-- field names and keys (custom.table_map_fields, applicable_fields, reverse_columns, io_export,
-- table_kind_facts, enrichments, pipeline_read, template_from_tables). On an HR or medical table a
-- column called "condition" is itself the secret. The ladder lets her know the table; it says nothing of its columns.
-- Chair ruling: a Feature Knob, access/confidential_hides_structure, boolean, default true (seeded by
-- confstructure_a). ONE helper, custom.may_see_table_structure(org, table), asked by every structure door.
-- Every parameter and every response key is kept; a hidden list is EMPTY, never absent (pipeline_read
-- answers is_pipeline=false; template_from_tables refuses in the standard sentence). The iam kernel is untouched.
-- Triggers (pg_trigger_depth() > 0) always see the columns: write-path validation needs them and returns them to nobody.
-- Inverse: migrations/inverse/confstructure_b_a_confidential_table_hides_its_columns_from_those_who_cannot_read_it_down.sql

set local lock_timeout = '2s';

create function custom.may_see_table_structure(p_organization_id uuid, p_table_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to ''
as $function$
-- MAY THIS PERSON BE TOLD A TABLE'S COLUMNS? (access ladder: a person who may KNOW a Confidential or
-- Private table is owed its name, kind, owner and organization - never its field list, keys or column
-- definitions, unless she can read its rows.) THE ONE HELPER every structure door asks.
-- True when: the table is not Confidential/Private; the knob access/confidential_hides_structure is off
-- for this organization; the caller is the store owner or a trigger (the engine's own writes need the
-- columns and return them to nobody); she owns the table; she is an owner/admin of its organization;
-- the table is shared with her; or she may read at least one row (the question custom.assert_may_know_table
-- already asks, over the same predicate). A table that does not exist answers true: the caller's own wall decides.
declare
  v_me    uuid;
  v_data  jsonb;
  v_owner uuid;
  v_knob  jsonb;
  v_pred  text;
  v_any   boolean := false;
  v_memo  text := 'w:s:' || coalesce(p_organization_id::text, '-') || ':' || coalesce(p_table_id::text, '-');
begin
  if p_organization_id is null or p_table_id is null then return true; end if;
  if pg_catalog.pg_trigger_depth() > 0 then return true; end if;
  if platform.memo_k_get(v_memo) = '1' then return true; end if;

  select t.data, t.created_by into v_data, v_owner
    from custom.record t
   where t.organization_id = p_organization_id and t.id = p_table_id
     and t.table_id = custom.table_kernel_id() and t.data_class = 'table' and t.deleted_at is null;
  if not found then return true; end if;
  if coalesce(v_data ->> 'level', '') not in ('confidential', 'private') then return true; end if;

  v_me := custom.query_principal();
  v_knob := platform.knob_resolve('access', 'confidential_hides_structure', p_organization_id, v_me);
  if v_knob is not null and v_knob <> 'true'::jsonb then return true; end if;
  if custom.query_is_store_owner() or v_me is null or v_me = v_owner then
    perform platform.memo_k_put(v_memo, '1');
    return true;
  end if;

  if exists (select 1 from iam.organization_member om
              where om.organization_id = p_organization_id and om.user_id = v_me and om.role in ('owner', 'admin'))
     and public.is_org_admin_for(v_me, p_organization_id) then
    perform platform.memo_k_put(v_memo, '1');
    return true;
  end if;

  if exists (select 1 from iam.permissions g
              where g.resource_type = 'record' and g.resource_id = p_table_id
                and g.granted_to_user_id = v_me and g.status = 'active'
                and (g.expires_at is null or g.expires_at > now())) then
    perform platform.memo_k_put(v_memo, '1');
    return true;
  end if;

  v_pred := custom.visible_predicate_sql(v_me, p_organization_id, p_table_id, 'viewer'::public.permission_level, 'r');
  execute format(
    'select exists (select 1 from custom.record r
                     where r.organization_id = %L::uuid and r.table_id = %L::uuid
                       and r.deleted_at is null and (%s) limit 1)',
    p_organization_id, p_table_id, v_pred) into v_any;
  if v_any then
    perform platform.memo_k_put(v_memo, '1');
    return true;
  end if;
  return false;
end;
$function$;

insert into platform.client_callable_door (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'may_see_table_structure', pg_get_function_identity_arguments('custom.may_see_table_structure(uuid,uuid)'::regprocedure),
  ARRAY['uuid'::regtype, 'uuid'::regtype]::oid[],
  'p_organization_id and p_table_id name the table asked about; the answer is about the caller only (read from the session), a boolean that reads nothing a caller does not already name. NULL answers true.',
  'campaign confstructure_b',
  'server_only: called only inside the structure doors (custom.applicable_fields, table_map_fields, reverse_columns, io_export, table_kind_facts, enrichments, pipeline_read, template_from_tables), all running as their owner; no client calls it.', false, false)
on conflict do nothing;

CREATE OR REPLACE FUNCTION custom.applicable_fields(p_organization_id uuid, p_table_id uuid, p_record_type text DEFAULT NULL::text)
 RETURNS SETOF custom.record
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_types text[];
  v_key   text;
  v_json  jsonb;
  v_hit   text;
begin
  -- The decision comes BEFORE the read, so a foreign organization id and an invented one
  -- answer identically: both are refused, neither is told whether the table exists.
  --
  -- INSTALL-SPEED-2: each of the three doors opens with its own memo check and returns at once on
  -- a yes already given in this statement to this seat. When all three yeses are there, asking
  -- the three functions only to have each return on its first line costs three calls per ask
  -- (four asks per row written); so read the same three slots here and call the doors otherwise.
  -- KEEP IN STEP: these are the first lines of custom.assert_store_door ('w:d:'),
  -- custom.assert_client_may_reach ('w:r:') and custom.assert_may_know_table ('w:k:').
  if platform.memo_k_get('w:d:' || coalesce(p_organization_id::text, '-')) = '1'
     and platform.memo_k_get('w:r:' || coalesce(p_organization_id::text, '-')) = '1'
     and platform.memo_k_get('w:k:' || coalesce(p_organization_id::text, '-') || ':' || coalesce(p_table_id::text, '-')) = '1' then
    null;
  else
    perform custom.assert_store_door(p_organization_id, 'custom.applicable_fields');
    perform custom.assert_client_may_reach(p_organization_id, 'custom.applicable_fields');
    perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.applicable_fields');
  end if;

  -- THE SAME TABLE, ALREADY READ IN THIS TRANSACTION. The three lines above ran first, so this
  -- is a shortcut through the READ and never through the DECISION.
  --
  -- WRITE-PERF-4: its own slot, not a corner of a 37 KB blob. Measured on the main database,
  -- a 17-field table: 427 us a call out of the shared blob, 254 us out of its own key. The
  -- value is `jsonb_strip_nulls`ed before it is stored — `jsonb_populate_recordset` reads an
  -- absent key and a null key identically, and a `custom.record` row is mostly nulls, so this
  -- is the same 17 rows out of a much smaller text.
  -- CONF-STRUCTURE: a person who may know a Confidential table but cannot read any of its rows
  -- is told its name and nothing about its columns (feature knob access/confidential_hides_structure).
  if not custom.may_see_table_structure(p_organization_id, p_table_id) then
    return;
  end if;

  v_key := 'af:' || coalesce(p_organization_id::text, '-') || ':' ||
                    coalesce(p_table_id::text, '-') || ':' || coalesce(p_record_type, '');
  v_hit := platform.memo_k_get(v_key);
  if v_hit is not null then
    return query select * from jsonb_populate_recordset(null::custom.record, v_hit::jsonb);
    return;
  end if;

  -- T8. The record's type value is the option's KEY; whoever declared "Radius applies to a
  -- Circle" may have written the word, the key or the option's id. All of them name the same
  -- choice, so the question is asked with all of them. This is the clause the seventh pass
  -- failed: "asking what columns THIS record has answers without Radius".
  v_types := case when p_record_type is null then '{}'::text[]
                  else custom.choice_synonyms(p_organization_id, p_table_id, p_record_type) end;

  select coalesce(jsonb_agg(jsonb_strip_nulls(to_jsonb(q))), '[]'::jsonb) into v_json from (
    select f.*
      from custom.record f
     where f.organization_id = p_organization_id
       and f.table_id = custom.field_kernel_id()
       and f.deleted_at is null
       and (f.data ->> 'entity_definition_id')::uuid = p_table_id
       and (jsonb_array_length(coalesce(f.data -> 'applies_to_types', '[]'::jsonb)) = 0
            or (p_record_type is not null
                and coalesce(f.data -> 'applies_to_types', '[]'::jsonb) ?| v_types))) q;

  perform platform.memo_k_put(v_key, v_json::text);
  return query select * from jsonb_populate_recordset(null::custom.record, v_json);
end $function$;

CREATE OR REPLACE FUNCTION custom.table_map_fields(p_organization_id uuid, p_table_ids uuid[])
 RETURNS TABLE(table_id uuid, field_key text, field_label text, field_type text, relation_target uuid, inverse_key text, field_sort numeric, is_link boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_t uuid;
  v_known uuid[] := '{}';
  v_checked uuid[] := '{}';
  v_targets uuid[];
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.table_map_fields');
  if coalesce(cardinality(p_table_ids), 0) > 500 then
    raise exception 'One call maps at most 500 tables; this one named %.', cardinality(p_table_ids)
      using errcode = '54000', hint = 'Ask for the tables a screen shows. Nothing was read.';
  end if;
  for v_t in
    select distinct t.id
      from unnest(coalesce(p_table_ids, '{}'::uuid[])) as a(id)
      join custom.record t on t.organization_id = p_organization_id and t.id = a.id
     where t.table_id = custom.table_kernel_id() and t.data_class = 'table' and t.deleted_at is null
  loop
    begin
      perform custom.assert_may_know_table(p_organization_id, v_t, 'custom.table_map_fields');
      -- CONF-STRUCTURE: known, but its columns are named only to a person the knob lets see them.
      if custom.may_see_table_structure(p_organization_id, v_t) then
        v_known := v_known || v_t;
      end if;
    exception when insufficient_privilege then
      continue;
    end;
  end loop;
  -- A link's target is named only when the reader may know that table too; otherwise it is null,
  -- exactly as an invented id would be.
  select coalesce(array_agg(distinct nullif(f.data ->> 'relation_target', '')::uuid), '{}')
    into v_targets
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = any (v_known)
     and nullif(f.data ->> 'relation_target', '') is not null;
  foreach v_t in array v_targets loop
    if v_t = any (v_known) then
      v_checked := v_checked || v_t;
      continue;
    end if;
    begin
      perform custom.assert_may_know_table(p_organization_id, v_t, 'custom.table_map_fields');
      v_checked := v_checked || v_t;
    exception when insufficient_privilege then
      continue;
    end;
  end loop;
  return query
    select x.tid, x.k, x.l, x.ty,
           case when x.rt = any (v_checked) then x.rt else null end,
           x.ik, x.srt, (x.lnk and x.rt = any (v_checked))
      from (
        select (f.data ->> 'entity_definition_id')::uuid as tid,
               f.data ->> 'key' as k,
               coalesce(f.data ->> 'label', f.data ->> 'key') as l,
               f.data ->> 'type' as ty,
               nullif(f.data ->> 'relation_target', '')::uuid as rt,
               f.data ->> 'inverse_key' as ik,
               coalesce(nullif(f.data ->> 'sort', '')::numeric, 0) as srt,
               (f.data ->> 'type' = 'relation' and nullif(f.data ->> 'relation_target', '') is not null) as lnk,
               row_number() over (partition by (f.data ->> 'entity_definition_id')::uuid
                                  order by coalesce(nullif(f.data ->> 'sort', '')::numeric, 0), f.created_at) as rn
          from custom.record f
         where f.organization_id = p_organization_id
           and f.table_id = custom.field_kernel_id()
           and f.deleted_at is null
           and (f.data ->> 'entity_definition_id')::uuid = any (v_known)
      ) x
     where (x.lnk and x.rt = any (v_checked)) or ((not x.lnk) and x.rn <= 4);
end
$function$;

CREATE OR REPLACE FUNCTION custom.reverse_columns(p_organization_id uuid, p_table_id uuid)
 RETURNS TABLE(key text, label text, source_field_id uuid, source_field_key text, source_field_label text, source_table_id uuid, source_table_name text, cardinality text, read_only boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_on boolean;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.reverse_columns');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.reverse_columns');
  -- CONF-STRUCTURE: no column list for a Confidential table whose structure this person may not see.
  if not custom.may_see_table_structure(p_organization_id, p_table_id) then
    return;
  end if;
  v_on := coalesce(nullif(platform.knob_resolve('custom', 'back_links', p_organization_id) #>> '{}', ''), 'true') = 'true';

  return query
  with links as (
    select f.id as fid,
           coalesce(nullif(f.data ->> 'key', ''), f.data ->> 'name') as fkey,
           coalesce(nullif(btrim(f.data ->> 'label'), ''), f.data ->> 'key') as flabel,
           nullif(f.data ->> 'inverse_key', '') as ikey,
           coalesce((f.data ->> 'sort')::numeric, 100) as fsort,
           t.id as tid,
           coalesce(nullif(btrim(t.data ->> 'name'), ''), 'Linked records') as tname,
           rv.key as rkey,
           rv.label as rlabel
      from custom.record f
      join custom.record t
        on t.organization_id = p_organization_id
       and t.id = (f.data ->> 'entity_definition_id')::uuid
       and t.table_id = custom.table_kernel_id()
       and t.data_class = 'table'
       and t.deleted_at is null
      -- NOTION-PROPS: the two-way link's own Field on THIS table, when there is one.
      left join lateral (select x.key, x.label from custom._reverse_field_of(p_organization_id, f.id) x) rv
        on f.data ->> 'relation_target' = p_table_id::text
     where f.organization_id = p_organization_id
       and f.table_id = custom.field_kernel_id()
       and f.data_class = 'field'
       and f.deleted_at is null
       and f.data ->> 'type' = 'relation'
       and nullif(f.data -> 'config' ->> 'reverse_of', '') is null
       and (case coalesce(nullif(f.data -> 'config' ->> 'target_mode', ''), 'one')
              when 'one' then f.data ->> 'relation_target' = p_table_id::text
              when 'several' then coalesce(f.data -> 'config' -> 'target_tables', '[]'::jsonb) ? p_table_id::text
              else false end)
       and (v_on or nullif(f.data ->> 'inverse_key', '') is not null)
  ), seen as (
    select l.* from links l where custom._may_know_table(p_organization_id, l.tid)
       and custom.may_see_table_structure(p_organization_id, l.tid)
  )
  select coalesce(s.rkey, s.ikey, 'linked_' || replace(s.fid::text, '-', '')),
         case when s.rlabel is not null then s.rlabel
              when s.tid = p_table_id
                or (select count(*) from seen s2 where s2.tid = s.tid) > 1
              then s.tname || ' (' || s.flabel || ')'
              else s.tname end,
         s.fid, s.fkey, s.flabel, s.tid, s.tname,
         'many'::text,
         s.rkey is null
    from seen s
   order by s.tname, s.fsort, s.flabel, s.fid;
end
$function$;

CREATE OR REPLACE FUNCTION custom.io_export(p_organization_id uuid, p_table_id uuid, p_columns text[] DEFAULT NULL::text[], p_limit integer DEFAULT 10000, p_required text DEFAULT 'viewer'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_cols    text[];
  v_named   integer;
  v_token   text;
  v_rows    jsonb;
  v_held    jsonb;
  v_hide    boolean;   -- CONF-STRUCTURE
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.io_export');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.io_export');
  perform custom.assert_store_door(p_organization_id, 'custom.io_export');
  -- CONF-STRUCTURE: a person who may not see a Confidential table's columns exports none of them.
  v_hide := not custom.may_see_table_structure(p_organization_id, p_table_id);

  -- NOTHING FAILS SILENTLY. This door's rows come from `custom.read_records`, which is the
  -- read door and answers at `viewer`; there is no list door in this store that answers "the
  -- rows I may edit". A caller asking for one used to be handed the viewer rows with no word
  -- said, which is the export path answering a question nobody asked.
  if coalesce(p_required, 'viewer') <> 'viewer' then
    raise exception 'custom.io_export answers at viewer and cannot export a higher level.'
      using errcode = '22023',
            hint = 'The export is the read door''s answer: it is built from custom.read_records, '
                   'which resolves the reader from the session and answers at viewer. Call it '
                   'with p_required => ''viewer'' (its default) and decide what may be CHANGED '
                   'with custom.my_level or custom.assert_client_may_change.';
  end if;

  select t.data ->> 'token' into v_token from custom.record t
   where t.organization_id = p_organization_id and t.id = p_table_id;

  v_cols := case when v_hide then array[]::text[] else coalesce(p_columns,
    (select array_agg(f.data ->> 'key' order by coalesce((f.data ->> 'sort')::int, 0),
                                                 f.data ->> 'key')
       from custom.applicable_fields(p_organization_id, p_table_id, null) f),
    (select array_agg(k order by k)
       from (select distinct jsonb_object_keys(r.data) k
               from custom.record r
              where r.organization_id = p_organization_id
                and r.table_id = p_table_id
                and r.deleted_at is null) ks
      where left(k, 1) <> '_'),
    array[]::text[]) end;

  -- A Field with no `key` is a data defect, not a reason to refuse the whole export. It is
  -- dropped and NAMED, with the remedy, exactly as `custom.derived_value` names a malformed
  -- worked-out column instead of taking the Table down with it.
  v_named := coalesce(pg_catalog.array_length(v_cols, 1), 0);
  v_cols  := coalesce(pg_catalog.array_remove(v_cols, null), array[]::text[]);
  if v_named > coalesce(pg_catalog.array_length(v_cols, 1), 0) then
    raise warning 'custom.io_export: % column(s) of table % carry no key and were left out of '
      'this export. Every other column and every row are unaffected. REMEDY: give the Field a '
      'key through custom.field_update, or retire it with custom.field_retire.',
      v_named - coalesce(pg_catalog.array_length(v_cols, 1), 0), p_table_id;
  end if;

  -- THE READ DOOR DECIDES BOTH QUESTIONS: which rows, and which cells of them.
  -- `custom.read_records` already choice-renders and already carries `_hidden`.
  --
  -- THE PAGE AND THE WITHHELD MAP ARE TWO AGGREGATES OVER THE SAME CTE, never one join.
  -- Joining `jsonb_each(_hidden)` onto the page multiplied every exported row by the number
  -- of columns withheld from the reader, and produced a null key — 22023 — when none were.
  --
  -- AND THE EXPORT'S PAGE IS BUILT OUT OF PAGES THE READ DOOR WILL ACTUALLY SERVE.
  -- `custom.export_ceiling` is 100,000 and `custom.page_ceiling` is 1,000, so asking the read
  -- door for the export's own page raised PAGE-1 — the door DIED on its own default of 10,000
  -- ("custom.read_records was asked for 10000 rows; this store serves at most 1000 rows in one
  -- page"). An export is not a screen page: it walks the read door at the store's page size
  -- and stops at the number the export contract promised. Every row is still exactly a row the
  -- read door handed over, so the parity clause is untouched.
  with want as (
    select custom.page_size(p_organization_id, 'custom.io_export', p_limit, 10000,
                            custom.export_ceiling(p_organization_id)) as n,
           greatest(1, custom.page_ceiling(p_organization_id)) as chunk
  ),
  page as (
    select row_number() over (order by o.off, rr.ord) as ord, rr.document as document
      from want w
      cross join lateral generate_series(0, w.n - 1, w.chunk) o(off)
      cross join lateral (
        select row_number() over () as ord, d.document
          from custom.read_records(p_organization_id, p_table_id, false,
                                   least(w.chunk, w.n - o.off)::integer, o.off::integer) d
      ) rr
  ),
  cells as (
    select p.ord,
           (select coalesce(jsonb_object_agg(c, coalesce(p.document -> c, 'null'::jsonb)),
                            '{}'::jsonb)
              from unnest(v_cols) c) as doc
      from page p
  ),
  held as (
    select distinct on (h.key) h.key, h.value
      from page p
      cross join lateral jsonb_each(coalesce(p.document -> '_hidden', '{}'::jsonb)) h
  )
  select coalesce((select jsonb_agg(c.doc order by c.ord) from cells c), '[]'::jsonb),
         coalesce((select jsonb_object_agg(h.key, h.value) from held h), '{}'::jsonb)
    into v_rows, v_held;

  -- NOTHING FAILS SILENTLY: a column the store withheld from this reader is named with the
  -- store's own reason, beside an export whose cells for it read `null`.
  return jsonb_build_object('table_id', p_table_id, 'token', v_token,
                            'columns', to_jsonb(v_cols), 'rows', v_rows,
                            'withheld', v_held,
                            -- PAGE-1. An export is one page of its own declared ceiling, and it
                            -- says what it was asked for, what came back, and where to carry on.
                            'page', jsonb_build_object(
                              'requested', custom.page_size(p_organization_id, 'custom.io_export', p_limit, 10000, custom.export_ceiling(p_organization_id)),
                              'returned',  jsonb_array_length(coalesce(v_rows, '[]'::jsonb)),
                              'ceiling',   custom.export_ceiling(p_organization_id),
                              'next',      case when jsonb_array_length(coalesce(v_rows, '[]'::jsonb))
                                                   = custom.page_size(p_organization_id, 'custom.io_export', p_limit, 10000, custom.export_ceiling(p_organization_id))
                                                then jsonb_array_length(coalesce(v_rows, '[]'::jsonb)) else null end),
                            'choices', case when v_hide then '{}'::jsonb else custom.choice_field_map(p_organization_id, p_table_id) end);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.table_kind_facts(p_table_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_org     uuid;
  v_table   custom.record;
  v_fields  jsonb;
  v_choices jsonb := '{}'::jsonb;
  v_f       record;
  v_stamp   text;
begin
  -- THE TABLE NAMES ITS OWN ORGANIZATION. Read before the walls only to know which organization the
  -- walls are asked about; nothing read here is answered until all three have passed.
  select t.organization_id into v_org
    from custom.record t
   where t.id = p_table_id
     and t.table_id = custom.table_kernel_id()
     and t.deleted_at is null
   limit 1;
  if v_org is null then
    raise exception 'You do not have access to this table, so % has nothing to show you.', 'custom.table_kind_facts'
      using errcode = '42501',
            hint = 'VIS-5 / T10: you know a table if you may open the table itself, or if anything in it has been shared with you. Ask whoever owns it to share the table, or a record in it, with you.';
  end if;

  perform custom.assert_store_door(v_org, 'custom.table_kind_facts');
  -- A TABLE IN AN ORGANIZATION SHE IS NOT IN IS REFUSED IN THE SAME SENTENCE AS AN INVENTED ID.
  -- assert_client_may_reach's own sentence ("You are not a member of that organization…") would
  -- tell her the id is a real Table somewhere; the decision is the wall's, only the words are kept.
  begin
    perform custom.assert_client_may_reach(v_org, 'custom.table_kind_facts');
    perform custom.assert_may_know_table(v_org, p_table_id, 'custom.table_kind_facts');
  exception when insufficient_privilege then
    raise exception 'You do not have access to this table, so % has nothing to show you.', 'custom.table_kind_facts'
      using errcode = '42501',
            hint = 'VIS-5 / T10: you know a table if you may open the table itself, or if anything in it has been shared with you. Ask whoever owns it to share the table, or a record in it, with you.';
  end;

  select * into v_table
    from custom.record t
   where t.organization_id = v_org and t.id = p_table_id
     and t.table_id = custom.table_kernel_id() and t.deleted_at is null;

  -- EVERY LIVE FIELD, typed ones included (applicable_fields(…, NULL) leaves those out on purpose).
  select coalesce(jsonb_agg((f.data - '_values' - '_sources')
                            || jsonb_build_object('id', f.id, 'version', f.version)
                            order by (f.data ->> 'sort')::numeric nulls last, f.created_at, f.id), '[]'::jsonb)
    into v_fields
    from custom.record f
   where f.organization_id = v_org
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = p_table_id
     and custom.may_see_table_structure(v_org, p_table_id);   -- CONF-STRUCTURE

  -- N1b (CHAIR-DOORS-3A): EACH FIELD SAYS ITS KIND in the store's own word, custom.field_kind_of
  -- (rating, duration, address, status, long_text, entity_reference ...). That function arrives
  -- with lane 10's field-kinds file; until it is on this database the key is left out, never guessed.
  if to_regprocedure('custom.field_kind_of(jsonb)') is not null then
    execute $k$
      select coalesce(jsonb_agg(x.e || jsonb_build_object('field_kind', custom.field_kind_of(x.e)) order by x.o), '[]'::jsonb)
        from jsonb_array_elements($1) with ordinality as x(e, o)
    $k$ into v_fields using v_fields;
  end if;

  -- THE CHOICES of every list Field, retired ones included, through the one options reader.
  for v_f in
    select f.data ->> 'key' as k, (f.data -> 'config' ->> 'options_table_id')::uuid as opts
      from custom.record f
     where f.organization_id = v_org
       and f.table_id = custom.field_kernel_id()
       and f.deleted_at is null
       and (f.data ->> 'entity_definition_id')::uuid = p_table_id
       and nullif(f.data -> 'config' ->> 'options_table_id', '') is not null
       and custom.may_see_table_structure(v_org, p_table_id)   -- CONF-STRUCTURE
  loop
    v_choices := v_choices || jsonb_build_object(v_f.k, (
      select coalesce(jsonb_agg(jsonb_build_object('key', o.key, 'label', o.value ->> 'label',
                                                   'id', o.value ->> 'id',
                                                   'retired', coalesce((o.value ->> 'retired')::boolean, false),
                                                   'position', o.value -> 'position')
                                order by coalesce((o.value ->> 'retired')::boolean, false),
                                         (o.value ->> 'position')::integer nulls last, o.key), '[]'::jsonb)
        from jsonb_each(custom.choice_options(v_org, v_f.opts)) o));
  end loop;

  select md5(string_agg(x.part, '|' order by x.part)) into v_stamp
    from (
      select 't:' || t.id || ':' || t.version || ':' || t.updated_at || ':' || coalesce(t.deleted_at::text, '') as part
        from custom.record t
       where t.organization_id = v_org and t.id = p_table_id and t.table_id = custom.table_kernel_id()
      union all
      select 'f:' || f.id || ':' || f.version || ':' || f.updated_at || ':' || coalesce(f.deleted_at::text, '')
        from custom.record f
       where f.organization_id = v_org
         and f.table_id = custom.field_kernel_id()
         and (f.data ->> 'entity_definition_id')::uuid = p_table_id
      union all
      select 'o:' || o.id || ':' || o.version || ':' || o.updated_at || ':' || coalesce(o.deleted_at::text, '')
        from custom.record f
        join custom.record o
          on o.organization_id = f.organization_id
         and o.table_id = (f.data -> 'config' ->> 'options_table_id')::uuid
       where f.organization_id = v_org
         and f.table_id = custom.field_kernel_id()
         and f.deleted_at is null
         and (f.data ->> 'entity_definition_id')::uuid = p_table_id
         and nullif(f.data -> 'config' ->> 'options_table_id', '') is not null
    ) x;

  return jsonb_build_object(
    'organization_id', v_org,
    'table_id',        p_table_id,
    'name',            coalesce(v_table.data ->> 'name', v_table.data ->> 'title'),
    'title_field',     v_table.data ->> 'title_field',
    'agent_writable',  coalesce((v_table.data ->> 'agent_writable')::boolean, true),
    'purpose',         v_table.data ->> 'purpose',
    'version',         v_table.version,
    'type_field',      v_table.data ->> 'type_field',
    'stamp',           v_stamp,
    'fields',          v_fields,
    'choices',         v_choices,
    -- N1b (CHAIR-DOORS-3A): where this Table's columns come from, in the store's own word
    -- (custom.table_column_source: `fields` refuses a key no Field declares, `free_form` takes any,
    -- `code` is a kernel Table), and the keys the platform itself writes into a document
    -- (custom.record_platform_keys) - so a derived schema mirrors the store instead of re-deriving it.
    'column_source',   custom.table_column_source(v_org, p_table_id),
    'platform_keys',   to_jsonb(custom.record_platform_keys()));
end;
$function$;

CREATE OR REPLACE FUNCTION custom.enrichments(p_organization_id uuid, p_table_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(field_id uuid, table_id uuid, field_key text, label text, enrichment jsonb, enabled boolean, review_interval_days integer, rows_total integer, rows_filled integer, rows_stale integer, rows_pinned integer, rows_absent integer, runs integer, cost_cents numeric, cost_per_row_cents numeric, last_run_at timestamp with time zone, last_run jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.enrichments');
  -- VIS-5 / T10 (LADDER-CAP): and the wall after it — a Table she may not know exists is
  -- not described to her. Null Table = list everything, and this returns early on that.
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.enrichments');

  return query
  with fields as (
    select f.id as fid,
           (f.data ->> 'entity_definition_id')::uuid as tid,
           f.data ->> 'key'   as fkey,
           coalesce(f.data ->> 'label', f.data ->> 'key') as flabel,
           coalesce(f.data -> 'source_config', '{}'::jsonb) as cfg,
           nullif(f.data ->> 'review_interval_days', '')::integer as every
      from custom.record f
     where f.organization_id = p_organization_id
       and f.table_id = custom.field_kernel_id()
       and f.deleted_at is null
       and f.data ->> 'source' = 'agent'
       -- CONF-STRUCTURE: a Confidential table's columns are named only to a person the knob lets see them.
       and custom.may_see_table_structure(p_organization_id, (f.data ->> 'entity_definition_id')::uuid)
       and (p_table_id is null or (f.data ->> 'entity_definition_id')::uuid = p_table_id)
       -- ONLY OVER TABLES THIS CALLER CAN ALREADY OPEN (VIS-5), so the list of what a model
       -- fills in is never a second way to learn that a Table exists.
       and (f.data ->> 'entity_definition_id')::uuid
             in (select v from custom.query_visible_ids(p_organization_id, custom.table_kernel_id()) v)
  ),
  cells as (
    select fl.fid,
           count(*)::integer as n_total,
           count(*) filter (where r.data ? fl.fkey
                              and jsonb_typeof(r.data -> fl.fkey) <> 'null')::integer as n_filled,
           count(*) filter (where coalesce((r.data -> '_values' -> fl.fkey ->> 'pinned')::boolean, false))::integer as n_pinned,
           count(*) filter (where nullif(r.data -> '_values' -> fl.fkey ->> 'absent', '') is not null)::integer as n_absent,
           count(*) filter (where fl.every is not null
                              and (r.data -> '_values' -> fl.fkey ->> 'at') is not null
                              and (r.data -> '_values' -> fl.fkey ->> 'at')::timestamptz
                                    + make_interval(days => fl.every) < now())::integer as n_stale
      from fields fl
      join custom.record r
        on r.organization_id = p_organization_id
       and r.table_id = fl.tid
       and r.deleted_at is null
       and r.data_class = 'record'
       and r.id in (select v from custom.query_visible_ids(p_organization_id, fl.tid) v)
     group by fl.fid
  ),
  runs as (
    select (x.data ->> 'field_id')::uuid as fid,
           count(*)::integer             as n_runs,
           sum(coalesce((x.data ->> 'cost_cents')::numeric, 0))   as spend,
           sum(coalesce((x.data ->> 'rows_written')::numeric, 0)) as written,
           max(x.created_at)             as last_at
      from custom.record x
     where x.organization_id = p_organization_id
       and x.table_id = custom.organization_kernel_id()
       and x.data_class = custom.enrich_run_class()
       and x.deleted_at is null
     group by 1
  ),
  last_one as (
    select distinct on ((x.data ->> 'field_id')::uuid)
           (x.data ->> 'field_id')::uuid as fid, x.data as doc
      from custom.record x
     where x.organization_id = p_organization_id
       and x.table_id = custom.organization_kernel_id()
       and x.data_class = custom.enrich_run_class()
       and x.deleted_at is null
     order by (x.data ->> 'field_id')::uuid, x.created_at desc
  )
  select fl.fid, fl.tid, fl.fkey, fl.flabel, fl.cfg,
         coalesce((fl.cfg ->> 'enabled')::boolean, false),
         fl.every,
         coalesce(c.n_total, 0), coalesce(c.n_filled, 0), coalesce(c.n_stale, 0),
         coalesce(c.n_pinned, 0), coalesce(c.n_absent, 0),
         coalesce(rn.n_runs, 0), coalesce(rn.spend, 0),
         case when coalesce(rn.written, 0) > 0
              then round(coalesce(rn.spend, 0) / rn.written, 4) end,
         rn.last_at, lo.doc
    from fields fl
    left join cells c   on c.fid  = fl.fid
    left join runs rn   on rn.fid = fl.fid
    left join last_one lo on lo.fid = fl.fid
   order by fl.flabel;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.pipeline_read(p_organization_id uuid, p_table_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_key   text;
  v_fid   uuid;
  v_flab  text;
  v_opts  uuid;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.pipeline_read');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.pipeline_read');
  -- CONF-STRUCTURE: no stage column is named to a person who may not see this table's columns.
  if not custom.may_see_table_structure(p_organization_id, p_table_id) then
    return jsonb_build_object('is_pipeline', false,
             'why', 'The columns of this table are not shown to you.');
  end if;
  v_key := custom._stage_field_key(p_organization_id, p_table_id);
  if v_key is null then
    -- Absent, not empty, and it says what would make it exist.
    return jsonb_build_object('is_pipeline', false,
             'why', 'This table has no stage column yet, so there is no board to draw.');
  end if;
  select f.id, coalesce(nullif(f.data ->> 'label', ''), 'Stage'),
         (f.data -> 'config' ->> 'options_table_id')::uuid
    into v_fid, v_flab, v_opts
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = p_table_id
     and f.data ->> 'key' = v_key;
  if v_fid is null then
    raise exception 'this table says its stage is kept in %, and that column is gone', v_key
      using errcode = '23503',
            hint = 'Declare the pipeline again with custom.pipeline_declare, or point stage_field at a column that is there.';
  end if;

  return jsonb_build_object(
    'is_pipeline', true,
    'table_id',    p_table_id,
    'stage_field', v_key,
    'field_id',    v_fid,
    'stage_label', v_flab,
    -- key AND label, both, every time. A board that carried only labels could not write a
    -- move; one that carried only keys could not draw a heading.
    -- THE ORDER A PERSON DECLARED, which is the order the board draws. The options are
    -- read as RECORDS, oldest first, because `custom.choice_options` answers a jsonb
    -- OBJECT and a jsonb object has no order at all — a board built on it drew Won
    -- first and Lead second, measured 2026-09-20.
    'stages',      coalesce((select jsonb_agg(jsonb_build_object(
                               'key', coalesce(nullif(o.metadata ->> 'option_key', ''),
                                               custom.choice_slug(o.data ->> 'title')),
                               'label', coalesce(nullif(o.data ->> 'title', ''), '(unnamed choice)'),
                               'retired', o.deleted_at is not null)
                               order by (o.deleted_at is not null),
                                        (o.metadata ->> 'option_position')::integer nulls last,
                                        o.created_at, o.id)
                              from custom.record o
                             where o.organization_id = p_organization_id
                               and o.table_id = v_opts), '[]'::jsonb),
    'rules',       coalesce((select jsonb_agg(jsonb_build_object(
                               'id', r.id, 'name', r.data ->> 'name',
                               'message', r.data ->> 'message',
                               'kind', r.data #>> '{pipeline,kind}',
                               'stage', r.data #>> '{pipeline,stage}',
                               'uses', r.data -> 'uses',
                               'on_entry', r.data -> 'on_entry',
                               -- STAGE-RULES-2: WHAT A GATE DOES WHEN IT SAYS NO, AND WHAT
                               -- IT WAS ASKED. A board already drew all three outcomes;
                               -- the settings screen has to draw the RULE, and a screen
                               -- that could not read `on_fail` back would show every gate
                               -- as "refuse" and silently turn an approval gate into a
                               -- refusal the next time somebody pressed Save.
                               'on_fail', coalesce(nullif(r.data ->> 'on_fail', ''), 'refuse'),
                               -- The gate exactly as the person wrote it: the condition
                               -- that says WHEN it is about a card, the condition it
                               -- DEMANDS, and nothing compiled. Absent on a gate declared
                               -- before this landed and on the four sugar rules, which are
                               -- not written in the condition builder at all — a screen
                               -- reads its absence as "this one was not written here",
                               -- never as "it has no condition".
                               'when', r.data #> '{pipeline,gate,when}',
                               'demands', r.data #> '{pipeline,gate,demands}',
                               'version', r.version)
                               order by r.data #>> '{pipeline,kind}', r.data #>> '{pipeline,stage}')
                              from custom.record r
                             where r.organization_id = p_organization_id
                               and r.table_id = custom.rule_kernel_id()
                               and r.deleted_at is null
                               and (r.data #>> '{pipeline,stage_field_of}')::uuid = p_table_id),
                            '[]'::jsonb));
end;
$function$;

CREATE OR REPLACE FUNCTION custom.template_from_tables(p_organization_id uuid, p_table_ids uuid[], p_include_rows boolean DEFAULT false, p_rows_per_table integer DEFAULT 25)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_ids      uuid[];
  v_id       uuid;
  v_org_name text;
  v_tables   jsonb := '[]'::jsonb;
  v_rels     jsonb := '[]'::jsonb;
  v_views    jsonb := '[]'::jsonb;
  v_forms    jsonb := '[]'::jsonb;
  v_extras   jsonb := '[]'::jsonb;
  v_dims     jsonb := '[]'::jsonb;
  v_missing  text[] := array[]::text[];
  v_notes    text[] := array[]::text[];
  v_tok      jsonb := '{}'::jsonb;   -- table id → token
  v_choice   uuid[] := array[]::uuid[];   -- the "… choices" tables folded into fields
  v_t        record;
  v_f        record;
  v_v        record;
  v_fm       record;
  v_fields   jsonb;
  v_field    jsonb;
  v_choices  jsonb;
  v_target   uuid;
  v_rows     jsonb;
  v_row      record;
  v_vals     jsonb;
  v_keys     text[];
  v_k        text;
  v_kind     text;
  v_def      jsonb;
  v_n_fields integer := 0;
  v_n_rows   integer := 0;
  v_cap      integer := least(greatest(coalesce(p_rows_per_table, 25), 1), 200);
  v_slug     text;
  v_me       uuid := custom.query_principal();
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.template_from_tables');
  select array_agg(distinct x) into v_ids from unnest(coalesce(p_table_ids, '{}'::uuid[])) x where x is not null;
  if coalesce(cardinality(v_ids), 0) = 0 then
    raise exception 'Pick at least one table to save as a template.' using errcode = '22023', hint = 'Nothing was read.';
  end if;
  if cardinality(v_ids) > 40 then
    raise exception 'A template holds at most 40 tables, and % were picked.', cardinality(v_ids) using errcode = '22023';
  end if;
  foreach v_id in array v_ids loop
    perform custom.assert_may_know_table(p_organization_id, v_id, 'custom.template_from_tables');
    -- CONF-STRUCTURE: a template copies columns, so it is refused for a table whose columns this person may not see.
    if not custom.may_see_table_structure(p_organization_id, v_id) then
      raise exception 'You do not have access to this table, so % has nothing to show you.', 'custom.template_from_tables'
        using errcode = '42501',
              hint = 'The columns of a Confidential table are shown only to people who can read its rows. Ask whoever owns it to share it with you.';
    end if;
  end loop;
  select o.name into v_org_name from iam.organizations o where o.id = p_organization_id;

  -- Which picked tables are a choice list of another picked table's field: folded, never a table.
  select coalesce(array_agg(distinct (f.data #>> '{config,options_table_id}')::uuid), '{}'::uuid[]) into v_choice
    from custom.record f
   where f.organization_id = p_organization_id and f.table_id = custom.field_kernel_id() and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = any (v_ids)
     and (f.data #>> '{config,options_table_id}') is not null
     and (f.data #>> '{config,options_table_id}')::uuid = any (v_ids);

  -- Tokens first, so relations and views can name their tables.
  for v_t in
    select t.id, t.data
      from custom.record t
     where t.organization_id = p_organization_id and t.id = any (v_ids)
       and t.table_id = custom.table_kernel_id() and t.deleted_at is null
       and not (t.id = any (v_choice))
     order by t.data ->> 'name', t.id
  loop
    v_slug := custom._template_token(regexp_replace(coalesce(nullif(v_t.data ->> 'slug', ''), v_t.data ->> 'name', 'table'), '_\d{10,}$', ''));
    -- unique within the spec
    while exists (select 1 from jsonb_each_text(v_tok) e where e.value = v_slug) loop v_slug := v_slug || '_2'; end loop;
    v_tok := v_tok || jsonb_build_object(v_t.id::text, v_slug);
  end loop;
  if v_tok = '{}'::jsonb then
    raise exception 'None of the picked tables is a live table of this organization.' using errcode = '02000';
  end if;

  for v_t in
    select t.id, t.data, (v_tok ->> t.id::text) as token
      from custom.record t
     where t.organization_id = p_organization_id and t.id = any (v_ids)
       and t.table_id = custom.table_kernel_id() and t.deleted_at is null
       and not (t.id = any (v_choice))
     order by t.data ->> 'name', t.id
  loop
    v_fields := '[]'::jsonb;
    v_keys := array[]::text[];
    for v_f in
      select f.data, f.id
        from custom.record f
       where f.organization_id = p_organization_id and f.table_id = custom.field_kernel_id() and f.deleted_at is null
         and (f.data ->> 'entity_definition_id')::uuid = v_t.id
       order by (f.data ->> 'sort')::numeric nulls last, f.created_at, f.id
    loop
      v_n_fields := v_n_fields + 1;
      v_keys := v_keys || (v_f.data ->> 'key');
      v_choices := null;
      v_target := nullif(v_f.data ->> 'relation_target', '')::uuid;
      if (v_f.data #>> '{config,options_table_id}') is not null then
        select jsonb_agg(o.data ->> 'title' order by (o.metadata ->> 'option_position')::integer nulls last, o.created_at)
          into v_choices
          from custom.record o
         where o.organization_id = p_organization_id and o.deleted_at is null
           and o.table_id = (v_f.data #>> '{config,options_table_id}')::uuid and o.data_class = 'record';
      elsif jsonb_typeof(v_f.data #> '{config,choices}') = 'array' then
        v_choices := v_f.data #> '{config,choices}';
      end if;
      v_field := jsonb_strip_nulls(jsonb_build_object(
        'key', v_f.data ->> 'key',
        'label', v_f.data ->> 'label',
        'parityType', coalesce(v_f.data ->> 'parity_type', v_f.data ->> 'type'),
        'multi', coalesce((v_f.data ->> 'multi')::boolean, false),
        'dated', coalesce((v_f.data ->> 'dated')::boolean, false),
        'required', coalesce((v_f.data ->> 'required')::boolean, false),
        'unit', v_f.data ->> 'unit',
        'format', v_f.data ->> 'format',
        'source', coalesce(v_f.data ->> 'source', 'manual'),
        'computeOn', v_f.data ->> 'compute_on',
        'rules', case when jsonb_typeof(v_f.data -> 'rules') = 'array' and v_f.data -> 'rules' <> '[]'::jsonb then v_f.data -> 'rules' end,
        'choices', v_choices,
        'relationTarget', case when v_target is not null and v_tok ? v_target::text then v_tok ->> v_target::text end,
        'relationMax', case when v_target is not null and v_tok ? v_target::text then (v_f.data ->> 'relation_max')::integer end,
        'sensitivity', coalesce(v_f.data ->> 'sensitivity', 'internal'),
        'contextPolicy', coalesce(v_f.data ->> 'context_policy', 'include'),
        'help', v_f.data ->> 'description',
        'default', v_f.data -> 'default'));
      if v_target is not null and not (v_tok ? v_target::text)
         and v_target not in (custom.person_kernel_id(), custom.file_kernel_id()) then
        v_notes := v_notes || format('%s.%s points at a table outside the picked set, so it is saved as a plain field.', v_t.token, v_f.data ->> 'key');
      end if;
      if v_target is not null and v_tok ? v_target::text then
        v_rels := v_rels || jsonb_build_array(jsonb_build_object(
          'describes', format('%s: %s.', coalesce(v_t.data ->> 'label_singular', v_t.data ->> 'name'), v_f.data ->> 'label'),
          'fromTable', v_t.token,
          'fromField', v_f.data ->> 'key',
          'toTable', v_tok ->> v_target::text,
          'flavor', case when v_f.data ->> 'on_target_delete' = 'cascade' then 'owned' else 'referenced' end,
          'cardinality', case when coalesce((v_f.data ->> 'relation_max')::integer, 0) = 1 then 'one' else 'many' end,
          'onDelete', coalesce(v_f.data ->> 'on_target_delete', 'set_null'),
          'inverseKey', coalesce(v_f.data ->> 'inverse_key', v_t.token || '_' || (v_f.data ->> 'key'))));
      end if;
      v_fields := v_fields || jsonb_build_array(v_field);
    end loop;

    -- Seed rows, through the reader's own mask, cut to the spec's fields; relations become row keys.
    v_rows := '[]'::jsonb;
    if p_include_rows then
      for v_row in
        select r.id, r.document from custom.read_records(p_organization_id, v_t.id, false, v_cap, 0) r
      loop
        v_vals := '{}'::jsonb;
        foreach v_k in array v_keys loop
          if v_row.document ? v_k then
            v_vals := v_vals || jsonb_build_object(v_k, custom._template_row_value(v_row.document -> v_k, v_tok));
          end if;
        end loop;
        v_rows := v_rows || jsonb_build_array(jsonb_build_object('key', 'row-' || left(v_row.id::text, 8), 'values', v_vals));
        v_n_rows := v_n_rows + 1;
      end loop;
    end if;

    v_tables := v_tables || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'token', v_t.token,
      'name', v_t.data ->> 'name',
      'labelSingular', coalesce(v_t.data ->> 'label_singular', v_t.data ->> 'name'),
      'labelPlural', coalesce(v_t.data ->> 'label_plural', v_t.data ->> 'name'),
      'type', coalesce(v_t.data ->> 'type', 'entity'),
      'display', coalesce(v_t.data ->> 'display', 'list'),
      'weight', coalesce(v_t.data ->> 'weight', 'light'),
      'ordered', coalesce((v_t.data ->> 'ordered')::boolean, false),
      'icon', v_t.data ->> 'icon',
      'titleField', coalesce(v_t.data ->> 'title_field', v_keys[1]),
      'describes', coalesce(v_t.data ->> 'description', ''),
      'fields', v_fields,
      'rows', v_rows)));
    if coalesce(v_t.data ->> 'description', '') = '' then
      v_missing := v_missing || format('tables.%s.describes', v_t.token);
    end if;

    -- Saved views on this table.
    for v_v in
      select sv.name, sv.definition
        from platform.saved_view sv
       where sv.organization_id = p_organization_id and sv.subject_id = v_t.id and sv.deleted_at is null
       order by sv.created_at, sv.id
    loop
      v_def  := coalesce(v_v.definition, '{}'::jsonb);
      v_kind := coalesce(v_def ->> 'layout', 'grid');
      if v_kind not in ('grid', 'kanban', 'calendar', 'gallery', 'timeline') then
        v_notes := v_notes || format('View "%s" on %s has a layout (%s) the template grammar does not carry; left out.', v_v.name, v_t.token, v_kind);
        continue;
      end if;
      v_views := v_views || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'token', custom._template_token(v_t.token || '_' || v_v.name),
        'name', v_v.name,
        'table', v_t.token,
        'kind', v_kind,
        'isDefault', case when (v_def ->> 'is_default')::boolean then true end,
        'filters', case when jsonb_typeof(v_def -> 'filters') = 'object' and v_def -> 'filters' <> '{}'::jsonb then v_def -> 'filters' end,
        'sorts', case when jsonb_typeof(v_def -> 'sorts') = 'array' and v_def -> 'sorts' <> '[]'::jsonb then v_def -> 'sorts' end,
        'hiddenFields', v_def #> '{presentation,hiddenFields}',
        'groupBy', case v_kind when 'grid' then v_def #>> '{presentation,grouping,field}' when 'kanban' then v_def ->> 'group_field' when 'timeline' then v_def ->> 'group_field' end,
        'swimlaneBy', case when v_kind = 'kanban' then v_def ->> 'swimlane_field' end,
        'measure', case when v_kind = 'kanban' then v_def ->> 'measure' end,
        'dateField', case when v_kind = 'calendar' then v_def ->> 'date_field' end,
        'coverField', case when v_kind = 'gallery' then v_def ->> 'image_field' end,
        'startField', case when v_kind = 'timeline' then v_def ->> 'start_field' end,
        'endField', case when v_kind = 'timeline' then v_def ->> 'end_field' end)));
    end loop;

    -- Forms and booking pages on this table.
    for v_fm in
      select f.id, f.title, f.slug, f.presentation, f.published_at, f.audience
        from custom.anon_form f
       where f.organization_id = p_organization_id and f.table_id = v_t.id and f.deleted_at is null
       order by f.created_at, f.id
    loop
      select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
               'field', q ->> 'field', 'ask', coalesce(q ->> 'ask', q ->> 'field'), 'help', q ->> 'help',
               'required', case when (q ->> 'required')::boolean then true end))), '[]'::jsonb)
        into v_fields
        from jsonb_array_elements(coalesce(v_fm.presentation -> 'questions', '[]'::jsonb)) q;
      if v_fm.presentation ? 'booking' then
        v_extras := v_extras || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
          'kind', 'booking',
          'token', custom._template_token(v_t.token || '_' || coalesce(v_fm.title, 'booking')),
          'title', coalesce(v_fm.title, 'Book a time'),
          'table', v_t.token,
          'questions', v_fields,
          'availability', jsonb_strip_nulls(jsonb_build_object(
            'timezone', v_fm.presentation #>> '{booking,timezone}',
            'slotMinutes', coalesce((v_fm.presentation #>> '{booking,slot_minutes}')::integer, 30),
            'bufferMinutes', (v_fm.presentation #>> '{booking,buffer_minutes}')::integer,
            'leadMinutes', (v_fm.presentation #>> '{booking,lead_minutes}')::integer,
            'maxPerDay', (v_fm.presentation #>> '{booking,max_per_day}')::integer,
            'days', (v_fm.presentation #>> '{booking,days}')::integer,
            'windows', coalesce(v_fm.presentation #> '{booking,windows}', '[]'::jsonb))))));
      else
        v_forms := v_forms || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
          'token', custom._template_token(v_t.token || '_' || coalesce(v_fm.title, 'form')),
          'name', coalesce(v_fm.title, 'Form'),
          'describes', coalesce(v_fm.presentation ->> 'intro', ''),
          'audience', case when v_fm.published_at is not null then 'public' else 'member' end,
          'table', v_t.token,
          'fields', v_fields,
          'submitLabel', coalesce(v_fm.presentation ->> 'submit_label', 'Send'),
          'confirmation', coalesce(v_fm.presentation #>> '{thank_you,body}', v_fm.presentation #>> '{thank_you,title}', 'Thank you.'))));
      end if;
    end loop;

    -- Dimensions the table already names (its overrides only; the store infers the rest on install).
    if jsonb_typeof(v_t.data -> 'dimensions') = 'object' then
      v_dims := v_dims || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'table', v_t.token,
        'dimensions', v_t.data #> '{dimensions,dimensions}',
        'measures', v_t.data #> '{dimensions,measures}',
        'paths', v_t.data #> '{dimensions,paths}',
        'default', v_t.data #> '{dimensions,default}')));
    end if;
  end loop;

  v_missing := v_missing || array['useCase', 'industry', 'vertical', 'job', 'audience', 'teaches', 'strengths',
                                  'business.describes', 'business.address', 'business.phone', 'walk', 'agent'];
  if p_include_rows then
    v_missing := v_missing || 'provenance.noRealPeople'::text;
    v_notes := v_notes || ('Seed rows are your own data: affirm provenance.noRealPeople only after replacing every real person, phone, address and mailbox; dates are absolute, the grammar wants install-relative dates (@today+3d).')::text;
  end if;

  return jsonb_build_object(
    'spec', jsonb_build_object(
      'specVersion', 1,
      'catalogueId', 'ORG-' || upper(left(replace(p_organization_id::text, '-', ''), 8)) || '-' || to_char(now(), 'YYYYMMDD'),
      'id', custom._template_token(coalesce(v_org_name, 'organization') || '-setup-' || to_char(now(), 'YYYY-MM-DD')),
      'useCase', '',
      'industry', null,
      'vertical', '',
      'job', null,
      'audience', null,
      'teaches', null,
      'strengths', '[]'::jsonb,
      'requires', '[]'::jsonb,
      'business', jsonb_build_object('name', coalesce(v_org_name, ''), 'describes', '',
                    'address', jsonb_build_object('line1', '', 'city', '', 'region', '', 'postalCode', '', 'country', ''), 'phone', ''),
      'cleanupTag', 'template-from-tables:' || p_organization_id::text,
      'tables', v_tables,
      'relationships', v_rels,
      'sharedBlocks', '[]'::jsonb,
      'views', v_views,
      'forms', v_forms,
      'dimensions', v_dims,
      'extras', v_extras,
      'agent', null,
      'walk', '[]'::jsonb,
      'foundation', '[]'::jsonb,
      'provenance', jsonb_build_object('kind', 'synthesized',
                      'authoredBy', 'custom.template_from_tables for ' || coalesce(v_me::text, 'a member'),
                      'authoredOn', to_char(now(), 'YYYY-MM-DD'),
                      'noRealPeople', not p_include_rows),
      'version', 1),
    'missing', to_jsonb(v_missing),
    'notes', to_jsonb(v_notes),
    'tables', jsonb_array_length(v_tables),
    'fields', v_n_fields,
    'relationships', jsonb_array_length(v_rels),
    'views', jsonb_array_length(v_views),
    'forms', jsonb_array_length(v_forms),
    'bookings', jsonb_array_length(v_extras),
    'rows', v_n_rows);
end
$function$;

