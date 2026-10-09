-- chair-step: undo memosweep_b - puts back kernel_batch_on, iam._memo_pair, iam.kernel_memo_compare and iam.kernel_memo_sweep as memosweep_a left them.
-- lane: MEMO-SWEEP
-- based-on: iam.kernel_batch_on(uuid) 0a8c63bde8da54db5a47663662f6611fcdb07e22798d7f84d0a5fd2df7d8c40a
-- based-on: iam._memo_pair(text, uuid, uuid, uuid, uuid[], text, text, integer, integer) 2c076d006dbd8caf2f1aace9cf0c098db4f994baa4bed20d891f62f23cf4a0bf
-- based-on: iam.kernel_memo_compare(integer, integer) 16e9d2f8219ffaf51f10ff286fd464496339ecd08cfef1468318ca370dcd46b1
-- based-on: iam.kernel_memo_sweep(integer, integer) 7e128b914366bb242b0544423ae86c015d8477a7689c944c4369ae9b9c81195a

CREATE OR REPLACE FUNCTION iam.kernel_batch_on(p_person uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
-- HOT-DOORS-4: may this statement keep access sub-answers in the statement memo for this person (knob
-- access/kernel_batch: {"on": bool, "off_for": [user ids]})? Never once the transaction has written (the
-- memo's own rule). mx.kernel_batch = 'off' / 'on' forces one path for the session (the proofs compute both;
-- not reachable from a client). A null person is the session's own (auth.uid()). Any failure answers false.
-- MEMO-SWEEP (2026-10-08): off_for covers the statement. When the person asked about, or the signed-in person, is
-- listed, a statement-wide opt-out is left in the memo and every later ask in the statement answers false - the
-- person-independent helpers (they pass null) stand down exactly as the person-aware ones do. Answers never change.
declare
  v_p    uuid;
  v_me   uuid;
  v_s    text;
  v_k    text;
  v_on   boolean;
  v_knob jsonb;
  v_off  boolean := false;
begin
  if pg_catalog.pg_current_xact_id_if_assigned() is not null then
    return false;
  end if;
  v_s := coalesce(current_setting('mx.kernel_batch', true), '');
  if v_s = 'off' then return false; end if;
  if v_s = 'on' then return true; end if;
  if platform.memo_k_get('iam.kernel_batch_off_for') = 't' then
    return false;
  end if;
  v_me := auth.uid();
  v_p := coalesce(p_person, v_me);
  v_k := 'iam.kernel_batch_on:' || coalesce(v_p::text, '-');
  v_s := platform.memo_k_get(v_k);
  if v_s is not null then
    return v_s = 't';
  end if;
  begin
    v_knob := platform.knob_resolve('access', 'kernel_batch', null);
    v_off := coalesce(v_knob -> 'off_for' ? coalesce(v_p::text, ''), false)
          or coalesce(v_knob -> 'off_for' ? coalesce(v_me::text, ''), false);
    v_on := coalesce((v_knob ->> 'on')::boolean, false) and not v_off;
  exception when others then
    v_on := false;
  end;
  if v_off then
    perform platform.memo_k_put('iam.kernel_batch_off_for', 't');
  end if;
  perform platform.memo_k_put(v_k, case when v_on then 't' else 'f' end);
  return v_on;
end;
$function$

;
CREATE OR REPLACE FUNCTION iam._memo_pair(p_kind text, p_person uuid, p_org uuid, p_table uuid, p_ids uuid[], p_level text, p_search text, p_limit integer, p_offset integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
-- MEMO-SWEEP: ask custom.levels_of ('levels'), custom.reaches_directly_many ('many') or custom.read_records_page ('page')
-- as p_person with the statement memo off, then on (platform.memo_clear() before each), and return
-- {"same": bool, "slots": live memo slots after the 'on' run, "diff": [first differing keys]}. Never writes.
declare
  v_off   jsonb;
  v_on    jsonb;
  v_stamp text;
  v_slots integer;
  v_diff  jsonb := '[]'::jsonb;
  v_mode  text;
begin
  perform pg_catalog.set_config('request.jwt.claims',
            jsonb_build_object('sub', p_person, 'role', 'authenticated')::text, true);
  perform pg_catalog.set_config('request.jwt.claim.sub', p_person::text, true);
  foreach v_mode in array array['off', 'on'] loop
    perform pg_catalog.set_config('mx.kernel_batch', v_mode, true);
    perform platform.memo_clear();
    begin
      if p_kind = 'levels' then
        v_on := custom.levels_of(p_person, p_ids);
      elsif p_kind = 'many' then
        select coalesce(jsonb_object_agg(m.target::text, m.reaches), '{}'::jsonb) into v_on
          from custom.reaches_directly_many(p_person, p_ids, 'record', p_level::public.permission_level) m;
      else
        v_on := custom.read_records_page(p_org, p_table, '{}'::jsonb, p_search, '[]'::jsonb, null, false, p_limit, p_offset);
      end if;
    exception when others then
      v_on := jsonb_build_object('error', sqlstate || ' ' || sqlerrm);
    end;
    if v_mode = 'off' then
      v_off := v_on;
    end if;
  end loop;
  v_stamp := platform.memo_k_stamp();
  select count(*) into v_slots from pg_catalog.pg_settings s
   where s.name like 'mx\_memo.k%' and left(s.setting, length(v_stamp)) = v_stamp;
  if v_off is distinct from v_on then
    if p_kind in ('levels', 'many') and jsonb_typeof(v_off) = 'object' and jsonb_typeof(v_on) = 'object' then
      select coalesce(jsonb_agg(k.key order by k.key) filter (where k.n <= 5), '[]'::jsonb) into v_diff
        from (select x.key, row_number() over (order by x.key) n
                from (select key from jsonb_object_keys(v_off) key union select key from jsonb_object_keys(v_on) key) x
               where v_off -> x.key is distinct from v_on -> x.key) k;
    else
      select coalesce(jsonb_agg(k.key order by k.key) filter (where k.n <= 5), '[]'::jsonb) into v_diff
        from (select x.key, row_number() over (order by x.key) n
                from (select key from jsonb_object_keys(case when jsonb_typeof(v_off) = 'object' then v_off else '{}'::jsonb end) key
                      union select key from jsonb_object_keys(case when jsonb_typeof(v_on) = 'object' then v_on else '{}'::jsonb end) key) x
               where v_off -> x.key is distinct from v_on -> x.key) k;
    end if;
    if jsonb_array_length(v_diff) = 0 then
      v_diff := jsonb_build_array('(whole answer)');
    end if;
  end if;
  return jsonb_build_object('same', v_off is not distinct from v_on, 'slots', v_slots, 'diff', v_diff,
                            'off', case when v_off is distinct from v_on then left(v_off::text, 300) end,
                            'on',  case when v_off is distinct from v_on then left(v_on::text, 300) end);
end;
$function$

;
CREATE OR REPLACE FUNCTION iam.kernel_memo_compare(p_ids integer DEFAULT 30, p_pages integer DEFAULT 3)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
-- MEMO-SWEEP: see the file header. Compares memo-off and memo-on answers of custom.levels_of,
-- custom.reaches_directly_many and custom.read_records_page on one snapshot, read-only. Returns
-- {"ok": bool, "compared": n, "diffs": [...], "errors": [...], "strata": [...], "slots": {kind: live slots}}.
-- ok is false on any difference or when the memo path could not be shown to run.
declare
  v_kernel  uuid := custom.table_kernel_id();
  v_claims0 text := current_setting('request.jwt.claims', true);
  v_sub0    text := current_setting('request.jwt.claim.sub', true);
  v_kb0     text := current_setting('mx.kernel_batch', true);
  v_conf    constant uuid := 'a261e070-6e44-4ab9-837c-7f6df75db3da';
  v_n       integer := greatest(coalesce(p_ids, 30), 5);
  v_strata  jsonb := '[]'::jsonb;
  v_who     uuid[];
  v_big_org uuid;
  v_big_tbl uuid;
  v_org     uuid;
  v_tbl     uuid;
  v_ids     uuid[];
  v_name    text;
  v_named   uuid;
  v_s       jsonb;
  v_p       uuid;
  v_lvl     text;
  v_r       jsonb;
  v_compared integer := 0;
  v_diffs   jsonb := '[]'::jsonb;
  v_errs    jsonb := '[]'::jsonb;
  v_slots   jsonb := jsonb_build_object('levels', 0, 'many', 0, 'page', 0);
  v_k       text;
  v_pg      integer;
  v_search  text;
  v_off     integer;
begin
  if pg_catalog.pg_current_xact_id_if_assigned() is not null then
    return jsonb_build_object('ok', false, 'compared', 0, 'diffs', '[]'::jsonb,
      'errors', jsonb_build_array('the comparison started in a transaction that had already written, so the statement memo was off and nothing was tested'));
  end if;

  -- The strata: ids, and for page reads the Table they live in.
  select r.organization_id into v_org from custom.record r where r.id = v_conf limit 1;
  if v_org is null then
    select r.id, r.organization_id into v_tbl, v_org from custom.record r
     where r.table_id = v_kernel and r.data_class = 'table' and r.data ->> 'level' = 'confidential' limit 1;
  else
    v_tbl := v_conf;
  end if;
  if v_tbl is not null then
    select array_agg(x.id) into v_ids from (select r.id from custom.record r
       where r.organization_id = v_org and r.table_id = v_tbl and r.data_class = 'record' order by random() limit v_n) x;
    v_strata := v_strata || jsonb_build_object('name', 'confidential', 'org', v_org, 'tbl', v_tbl, 'ids', to_jsonb(coalesce(v_ids, '{}')));
    -- a person a reader field of that Table names
    select (r.data ->> (rd ->> 'field'))::uuid into v_named
      from custom.record t
      cross join lateral jsonb_array_elements(case when jsonb_typeof(t.data -> 'readers') = 'array' then t.data -> 'readers' else '[]'::jsonb end) rd
      join custom.record r on r.organization_id = t.organization_id and r.table_id = t.id and r.data_class = 'record'
     where t.id = v_tbl and t.organization_id = v_org
       and (r.data ->> (rd ->> 'field')) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     limit 1;
  end if;

  select x.organization_id, x.table_id into v_big_org, v_big_tbl
    from (select r.organization_id, r.table_id, count(*) n from custom.record r
           where r.data_class = 'record' group by 1, 2 order by 3 desc limit 1) x;

  foreach v_name in array array['published', 'only_me', 'big', 'table_definition'] loop
    v_ids := null; v_org := null; v_tbl := null;
    if v_name = 'published' then
      select array_agg(x.id), min(x.organization_id::text)::uuid, min(x.table_id::text)::uuid into v_ids, v_org, v_tbl
        from (select r.id, r.organization_id, r.table_id from custom.record r
               where r.published_to_web and r.data_class = 'record' order by random() limit v_n) x;
    elsif v_name = 'only_me' then
      select array_agg(x.id), min(x.organization_id::text)::uuid, min(x.table_id::text)::uuid into v_ids, v_org, v_tbl
        from (select r.id, r.organization_id, r.table_id from custom.record r
               where r.shown_to = 'only_me' and r.data_class = 'record' order by random() limit v_n) x;
    elsif v_name = 'big' then
      v_org := v_big_org; v_tbl := v_big_tbl;
      select array_agg(x.id) into v_ids from (select r.id from custom.record r
         where r.organization_id = v_big_org and r.table_id = v_big_tbl and r.data_class = 'record' order by random() limit v_n) x;
    else
      select array_agg(x.id), min(x.organization_id::text)::uuid into v_ids, v_org
        from (select r.id, r.organization_id from custom.record r
               where r.table_id = v_kernel and r.data_class = 'table' order by random() limit v_n) x;
    end if;
    if v_ids is not null then
      v_strata := v_strata || jsonb_build_object('name', v_name, 'org', v_org, 'tbl', v_tbl, 'ids', to_jsonb(v_ids));
    end if;
  end loop;

  -- The seats.
  v_who := array['87a6e699-3622-4869-8843-d0867456c0dd'::uuid, '4060701e-706a-4c76-b3ca-0bbc69fa5a14'::uuid];
  if v_named is not null then v_who := v_who || v_named; end if;
  select om.user_id into v_p from iam.organization_member om
   where om.organization_id = v_big_org and om.user_id <> all (v_who) order by random() limit 1;
  if v_p is not null then v_who := v_who || v_p; end if;

  for v_s in select * from jsonb_array_elements(v_strata) loop
    v_ids := array(select x::uuid from jsonb_array_elements_text(v_s -> 'ids') x);
    foreach v_p in array v_who loop
      -- levels
      v_r := iam._memo_pair('levels', v_p, null, null, v_ids, null, null, null, null);
      v_compared := v_compared + 1;
      v_slots := jsonb_set(v_slots, '{levels}', to_jsonb((v_slots ->> 'levels')::int + (v_r ->> 'slots')::int));
      if not (v_r ->> 'same')::boolean then
        v_diffs := v_diffs || jsonb_build_object('fn', 'custom.levels_of', 'stratum', v_s ->> 'name', 'person', v_p, 'level', null,
                     'target', v_r -> 'diff' -> 0, 'detail', v_r);
      end if;
      -- sets, at every level
      foreach v_lvl in array array['viewer', 'commenter', 'edit_content', 'editor', 'admin'] loop
        v_r := iam._memo_pair('many', v_p, null, null, v_ids, v_lvl, null, null, null);
        v_compared := v_compared + 1;
        v_slots := jsonb_set(v_slots, '{many}', to_jsonb((v_slots ->> 'many')::int + (v_r ->> 'slots')::int));
        if not (v_r ->> 'same')::boolean then
          v_diffs := v_diffs || jsonb_build_object('fn', 'custom.reaches_directly_many', 'stratum', v_s ->> 'name', 'person', v_p,
                       'level', v_lvl, 'target', v_r -> 'diff' -> 0, 'detail', v_r);
        end if;
      end loop;
      -- pages of the Table the stratum lives in
      if v_s ->> 'tbl' is not null and v_s ->> 'name' <> 'table_definition' then
        for v_pg in 1 .. greatest(coalesce(p_pages, 3), 1) loop
          v_off := case v_pg when 1 then 0 when 2 then 25 else 10 end;
          v_search := case when v_pg = 3 then 'a' end;
          v_r := iam._memo_pair('page', v_p, (v_s ->> 'org')::uuid, (v_s ->> 'tbl')::uuid, null, null, v_search,
                                case v_pg when 1 then 50 when 2 then 25 else 10 end, v_off);
          v_compared := v_compared + 1;
          v_slots := jsonb_set(v_slots, '{page}', to_jsonb((v_slots ->> 'page')::int + (v_r ->> 'slots')::int));
          if not (v_r ->> 'same')::boolean then
            v_diffs := v_diffs || jsonb_build_object('fn', 'custom.read_records_page', 'stratum', v_s ->> 'name', 'person', v_p,
                         'level', format('page %s', v_pg), 'target', to_jsonb(v_s ->> 'tbl'), 'detail', v_r);
          end if;
        end loop;
      end if;
    end loop;
  end loop;

  -- The memo path must have run: live slots after the 'on' runs, for every kind.
  foreach v_k in array array['levels', 'many', 'page'] loop
    if (v_slots ->> v_k)::int = 0 then
      v_errs := v_errs || to_jsonb(format('the statement memo wrote no slot while asking %s: the memo path was not exercised', v_k));
    end if;
  end loop;
  if pg_catalog.pg_current_xact_id_if_assigned() is not null then
    v_errs := v_errs || to_jsonb('the comparison took a transaction id, so the memo was off for the rest of it'::text);
  end if;

  perform pg_catalog.set_config('request.jwt.claims', coalesce(v_claims0, ''), true);
  perform pg_catalog.set_config('request.jwt.claim.sub', coalesce(v_sub0, ''), true);
  perform pg_catalog.set_config('mx.kernel_batch', coalesce(v_kb0, ''), true);
  return jsonb_build_object('ok', jsonb_array_length(v_diffs) = 0 and jsonb_array_length(v_errs) = 0,
    'compared', v_compared, 'diffs', v_diffs, 'errors', v_errs, 'slots', v_slots,
    'seats', cardinality(v_who),
    'strata', (select coalesce(jsonb_agg(jsonb_build_object('name', s ->> 'name', 'table', s ->> 'tbl', 'ids', jsonb_array_length(s -> 'ids'))), '[]'::jsonb)
                 from jsonb_array_elements(v_strata) s));
exception when others then
  perform pg_catalog.set_config('request.jwt.claims', coalesce(v_claims0, ''), true);
  perform pg_catalog.set_config('request.jwt.claim.sub', coalesce(v_sub0, ''), true);
  perform pg_catalog.set_config('mx.kernel_batch', coalesce(v_kb0, ''), true);
  return jsonb_build_object('ok', false, 'compared', coalesce(v_compared, 0), 'diffs', coalesce(v_diffs, '[]'::jsonb),
    'errors', jsonb_build_array(format('the comparison itself failed: %s %s', sqlstate, sqlerrm)));
end;
$function$

;
CREATE OR REPLACE FUNCTION iam.kernel_memo_sweep(p_ids integer DEFAULT 30, p_pages integer DEFAULT 3)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
-- MEMO-SWEEP: the scheduled half. iam.kernel_memo_compare must run BEFORE this transaction writes (a transaction id turns
-- the statement memo off), so it is called first and the log is written from what it returned.
declare
  v   jsonb := iam.kernel_memo_compare(p_ids, p_pages);
  d   jsonb;
  n   integer := jsonb_array_length(v -> 'diffs');
  e   text;
begin
  for d in select * from jsonb_array_elements(v -> 'diffs') loop
    insert into iam.access_shadow_log (person, target, level, caller, compared, disagreed)
    values ((d ->> 'person')::uuid,
            case when (d ->> 'target') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (d ->> 'target')::uuid
                 else '00000000-0000-0000-0000-000000000000'::uuid end,
            d ->> 'level',
            left(format('iam.kernel_memo_sweep|%s|%s|%s', d ->> 'fn', d ->> 'stratum', d -> 'detail' ->> 'diff'), 500), 1, 1);
  end loop;
  e := nullif(coalesce(array_to_string(array(select jsonb_array_elements_text(v -> 'errors')), '; '), ''), '');
  insert into iam.access_shadow_log (person, target, level, caller, compared, disagreed, error)
  values (null, null, 'memo', format('iam.kernel_memo_sweep|summary|%s seats|%s strata', v ->> 'seats', jsonb_array_length(coalesce(v -> 'strata', '[]'::jsonb))),
          coalesce((v ->> 'compared')::int, 0), n, left(e, 1000));
  if n > 0 or e is not null then
    perform ops.record_system_error(jsonb_build_object(
      'kind', 'access_kernel_disagreement', 'source_app', 'database', 'source_feature', 'access',
      'route', 'iam.kernel_memo_sweep',
      'error_type', case when n > 0 then 'memo_disagreement' else 'memo_check_failed' end,
      'error_text', format('The statement memo of the access kernel (knob access/kernel_batch) %s: %s disagreement(s) of %s comparisons%s. Revert: update platform.feature_knob set value = ''{"on": false, "off_for": []}'' where feature = ''access'' and key = ''kernel_batch''. Detail: iam.access_shadow_log, caller like ''iam.kernel_memo_sweep|%%''.',
                           case when n > 0 then 'disagreed with asking one question at a time' else 'could not be checked' end,
                           n, coalesce(v ->> 'compared', '0'), coalesce(' (' || e || ')', '')),
      'context', jsonb_build_object('diffs', (select jsonb_agg(x - 'detail') from jsonb_array_elements(v -> 'diffs') x), 'errors', v -> 'errors')));
  end if;
  return v - 'diffs' || jsonb_build_object('disagreements', n);
end;
$function$

;
