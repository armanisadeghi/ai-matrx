-- chair-step: the REVOKEs narrow three brand-new functions (iam._memo_pair, iam.kernel_memo_compare, iam.kernel_memo_sweep) so no client role can call them; nothing existing loses a privilege
-- lane: MEMO-SWEEP
-- based-on: iam.kernel_batch_on(uuid) 44b43a339b69591931d821a7c0bf8440c009a52de9fd5d00d7241d3073052a0a
-- based-on: iam.access_shadow_status() 391745151577d11c911a80ab6b75dc9161991a34f0c70f0fbdabcf76a23c58f7
-- based-on: custom.reaches_directly_many(uuid, uuid[], text, permission_level) 7ac88c48275021764b09aba3867f5f39fc4933dac5f663422ee19f4ea1cb9a29
--
-- MEMO-SWEEP a (2026-10-08). Nothing standing tested the statement memo (knob access/kernel_batch): the memo turns itself
-- off once the transaction has a transaction id, so iam.kernel_shadow_sweep (which writes its own log) never runs it.
-- A later edit to any memoised helper could make memo-on and memo-off disagree with nobody told.
--
--   1. iam.kernel_memo_compare(): READ-ONLY (no transaction id before it finishes; it refuses and says so otherwise).
--      Per seat (admin@admin.com, test@test.com, a person a Confidential Table's reader field names, a member of the
--      biggest Table's organization) and per stratum (the Confidential Table a261e070, published rows, "only me" rows,
--      the largest Table, Table definitions) it asks custom.levels_of, custom.reaches_directly_many at every level and
--      custom.read_records_page (plain, offset, searched), each TWICE on one snapshot: mx.kernel_batch = 'off', then 'on'
--      with platform.memo_clear() before each so the memo starts empty (one function call is one client message, so the
--      memo would otherwise be shared). It counts the live memo slots after each 'on' run: zero slots = the memo path was
--      not exercised = a failure, never a pass. The seat is set through request.jwt.claims, as the client door sees it.
--   2. iam.kernel_memo_sweep(): calls the above, THEN writes iam.access_shadow_log (caller 'iam.kernel_memo_sweep|...':
--      one summary row, a row per disagreement with target = first differing id or the Table) and, on a disagreement or
--      failure, an ops.system_error of kind access_kernel_disagreement naming the revert.
--   3. iam.access_shadow_status() adds memo_* fields (the set-form fields no longer count memo rows); server_status shows them.
--   4. off_for (knob access/kernel_batch) applies consistently: iam.kernel_batch_on(p) leaves a statement-wide opt-out when p
--      or the signed-in person is listed, and custom.levels_of, custom.read_records_page and custom.reaches_directly_many
--      ask it for their person first, so the person-independent helpers (carrying edges, visibility ancestors, default level,
--      addressed cap) stand down too. Answers never change either way (this file's compare proves it).
-- Off: select cron.unschedule('kernel-memo-sweep'); revert the rest: migrations/inverse/memosweep_a_*_down.sql

set local statement_timeout = '60s';

-- (4) off_for applies to every helper in the statement, not only to the ones that were handed the person.
create or replace function iam.kernel_batch_on(p_person uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to ''
as $function$
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
$function$;

-- (4) the access_shadow_status line: memo rows counted on their own.
create or replace function iam.access_shadow_status()
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  -- KERNEL-SHADOW: the drift guard's state for server_status. red = any disagreement in 24 h.
  -- MEMO-SWEEP (2026-10-08): the memo sweep's rows (caller 'iam.kernel_memo_sweep|...') are counted as memo_*; the
  -- set-form fields count the other rows only. red covers both.
  select jsonb_build_object(
    'disagreements_24h', count(*) filter (where l.target is not null and not m.memo),
    'failures_24h',      count(*) filter (where l.target is null and l.error is not null and not m.memo),
    'compared_24h',      coalesce(sum(l.compared) filter (where not m.memo), 0),
    'checks_24h',        count(*) filter (where l.target is null and not m.memo),
    'last_check_at',     max(l.at) filter (where l.target is null and not m.memo),
    'set_form_on',       coalesce((select (k.value ->> 'on')::boolean from platform.feature_knob k
                                    where k.feature = 'access' and k.key = 'kernel_set_form'), false),
    'memo_on',           coalesce((select (k.value ->> 'on')::boolean from platform.feature_knob k
                                    where k.feature = 'access' and k.key = 'kernel_batch'), false),
    'memo_disagreements_24h', count(*) filter (where l.target is not null and m.memo),
    'memo_failures_24h', count(*) filter (where l.target is null and l.error is not null and m.memo),
    'memo_compared_24h', coalesce(sum(l.compared) filter (where l.target is null and l.error is null and m.memo), 0),
    'memo_checks_24h',   count(*) filter (where l.target is null and l.error is null and m.memo),
    'memo_last_check_at', max(l.at) filter (where l.target is null and l.error is null and m.memo),
    'red',               count(*) filter (where l.target is not null or l.error is not null) > 0)
    from iam.access_shadow_log l
   cross join lateral (select l.caller like 'iam.kernel\_memo\_sweep|%' as memo) m
   where l.at > now() - interval '24 hours'
$function$;

-- (1) one comparison: the same call with the memo off and then on, on one snapshot, as one seat.
create or replace function iam._memo_pair(p_kind text, p_person uuid, p_org uuid, p_table uuid, p_ids uuid[],
                                          p_level text, p_search text, p_limit integer, p_offset integer)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
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
$function$;

create or replace function iam.kernel_memo_compare(p_ids integer default 30, p_pages integer default 3)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
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
$function$;

-- (2) the cron entry: compare first (read-only), write the log after.
create or replace function iam.kernel_memo_sweep(p_ids integer default 30, p_pages integer default 3)
returns jsonb
language plpgsql
volatile
security definer
set search_path to ''
as $function$
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
$function$;

revoke all on function iam._memo_pair(text, uuid, uuid, uuid, uuid[], text, text, integer, integer) from public, anon, authenticated;
revoke all on function iam.kernel_memo_compare(integer, integer) from public, anon, authenticated;
revoke all on function iam.kernel_memo_sweep(integer, integer) from public, anon, authenticated;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
values
  ('iam', '_memo_pair', pg_get_function_identity_arguments('iam._memo_pair(text, uuid, uuid, uuid, uuid[], text, text, integer, integer)'::regprocedure),
   array['text'::regtype, 'uuid'::regtype, 'uuid'::regtype, 'uuid'::regtype, 'uuid[]'::regtype, 'text'::regtype, 'text'::regtype, 'integer'::regtype, 'integer'::regtype]::oid[],
   'Asks three read doors as a named person with the memo off and on; reads only, takes no client input.',
   'migrations/campaign/memosweep_a_the_memo_path_is_compared_with_the_plain_path_every_half_hour.sql (lane MEMO-SWEEP)',
   'server_only: called only by iam.kernel_memo_compare; no client ever calls it.', false, false),
  ('iam', 'kernel_memo_compare', pg_get_function_identity_arguments('iam.kernel_memo_compare(integer, integer)'::regprocedure),
   array['integer'::regtype, 'integer'::regtype]::oid[],
   'p_ids and p_pages are counts; no entity-id arguments; reads only.',
   'migrations/campaign/memosweep_a_the_memo_path_is_compared_with_the_plain_path_every_half_hour.sql (lane MEMO-SWEEP)',
   'server_only: run by iam.kernel_memo_sweep (pg_cron kernel-memo-sweep) and by scripts/db-proofs/memo-path-agreement.py.', false, false),
  ('iam', 'kernel_memo_sweep', pg_get_function_identity_arguments('iam.kernel_memo_sweep(integer, integer)'::regprocedure),
   array['integer'::regtype, 'integer'::regtype]::oid[],
   'p_ids and p_pages are counts; no entity-id arguments.',
   'migrations/campaign/memosweep_a_the_memo_path_is_compared_with_the_plain_path_every_half_hour.sql (lane MEMO-SWEEP)',
   'server_only: run by pg_cron kernel-memo-sweep; it writes iam.access_shadow_log, so no client ever calls it.', false, false);

-- (4) custom.reaches_directly_many asks the opt-out for its person first (the live body, one line added).
CREATE OR REPLACE FUNCTION custom.reaches_directly_many(p_user_id uuid, p_targets uuid[], p_type text DEFAULT 'record'::text, p_required permission_level DEFAULT 'viewer'::permission_level)
 RETURNS TABLE(target uuid, reaches boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
-- PERF-FIX-2 (2026-10-07). THE SET FORM OF custom.reaches_directly: one row per distinct non-null
-- target, `reaches` = custom.reaches_directly(p_user_id, p_type, target, p_required) - that very
-- function, asked for each target, so it is not a second ladder and cannot drift from it.
-- What it shares is the one question that function and the access kernel each ask first about a
-- record: does it have a Confidential anchor (custom.confidential_anchor, twice per record, each a
-- read by id across all sixteen partitions). Here it is read ONCE for every target together. A
-- target that no row of class `record` carries, or that exactly one such row carries whose Table is
-- not Confidential and whose document names no parent, has no anchor - custom.confidential_anchor's
-- own loop stops at that first row - and the statement memo is given the very "none" ('-') that
-- function would leave there (only while the transaction has written nothing, as it does). Every
-- other target is left to the anchor function, as before.
-- KERNEL-SHADOW (2026-10-07): the shadow call at the end; see there.
declare
  v_kernel uuid := custom.table_kernel_id();
  v_snap   text := pg_catalog.pg_current_snapshot()::text;
  v_kt     uuid[];     -- PERF-FIX-4: the set form's targets and answers, when it ran
  v_ka     boolean[];
  v_fast   jsonb := '{}'::jsonb;
  v_batch  boolean;  -- HOT-DOORS-4
begin
  -- MEMO-SWEEP (2026-10-08): the person's opt-out (knob access/kernel_batch off_for) is read first so every helper below stands down with it.
  perform iam.kernel_batch_on(p_user_id);
  if p_targets is null or cardinality(p_targets) = 0 then
    return;
  end if;
  if p_user_id is not null and p_type = 'record' and pg_catalog.pg_current_xact_id_if_assigned() is null then
    perform platform.memo_k_put('custom.confidential_anchor:' || q.id::text || ':' || v_snap, '-')
       from (
         select u.id,
                count(w.id) as n_rec,
                coalesce(bool_or((t.data ->> 'level') = 'confidential'), false) as conf_tbl,
                coalesce(bool_or(jsonb_typeof(w.data -> 'parent_id') = 'string'), false) as has_parent
           from (select distinct x as id from unnest(p_targets) x where x is not null) u
           left join custom.record w on w.id = u.id and w.data_class = 'record'
           left join custom.record t
             on t.organization_id = w.organization_id and t.id = w.table_id and t.table_id = v_kernel
          group by u.id
       ) q
      where q.n_rec = 0 or (q.n_rec = 1 and not q.conf_tbl and not q.has_parent);
  end if;
  -- KERNEL-SHADOW stage 1 (2026-10-07): arm 1 of custom.reaches_directly (the access kernel) is asked
  -- ONCE for the whole set through iam.has_access_for_many and handed to each per-target call through
  -- the statement memo - only while the knob access/kernel_set_form is on for this person and the
  -- transaction has written nothing (the memo's own rule). A failure of the set form is a WARNING and
  -- every target is asked one at a time, as before.
  if p_user_id is not null and pg_catalog.pg_current_xact_id_if_assigned() is null
     and iam.kernel_set_form_on(p_user_id) then
    begin
      select array_agg(m.target), array_agg(m.allowed) into v_kt, v_ka
        from iam.has_access_for_many(p_user_id, p_targets, p_required::text, p_type) m;
      perform platform.memo_k_put('iam.kernel_set:' || p_user_id::text || ':' || p_type || ':'
                                  || p_required::text || ':' || m.target::text
                                  || ':' || pg_catalog.pg_current_snapshot()::text,
                                  case when m.allowed then 'true' else 'false' end)
         from unnest(v_kt, v_ka) as m(target, allowed);
    exception when others then
      v_kt := null;  v_ka := null;
      raise warning 'KERNEL-SET-FORM: iam.has_access_for_many failed (% %); answering one at a time',
        sqlstate, sqlerrm;
    end;
  end if;
  -- PERF-FIX-4 (2026-10-07): custom.reaches_directly's own first yes, read off the set answer above
  -- instead of asked one target at a time. For a target that ONE row carries, whose document's parent_id
  -- is absent or one well-formed id (so custom.containment_parent cannot raise), with no Confidential
  -- anchor (the very test the anchor memo above is written from: custom.confidential_answer is then
  -- null), in an organization that is not archived, whose kernel answer above is yes, and with the level
  -- asked at or below custom.level_floor(), custom.reaches_directly returns true at its kernel step and
  -- reads or writes nothing else on the way. Those targets answer true here; every other target is asked
  -- of custom.reaches_directly exactly as before. mx.data_home_set = off asks every target.
  -- HOT-DOORS-4 (2026-10-08): ABOVE THE FLOOR TOO. For the same targets (the same test, word for word), at a
  -- level above custom.level_floor() custom.reaches_directly returns, at its kernel step, `cap is null or
  -- p_required <= cap` with cap = custom.addressed_cap(p_user_id, 'record', id, <the row's organization>, <the
  -- row's Table>) and reads or writes nothing else - so that is the answer here (the cap kept in the statement
  -- memo, so the rungs of a level search ask it once per row). Only while iam.kernel_batch_on.
  v_batch := v_kt is not null and p_type = 'record' and p_required > custom.level_floor()
             and coalesce(current_setting('mx.data_home_set', true), '') <> 'off'
             and iam.kernel_batch_on(p_user_id);
  if v_kt is not null and p_type = 'record' and (p_required <= custom.level_floor() or v_batch)
     and coalesce(current_setting('mx.data_home_set', true), '') <> 'off' then
    select coalesce(jsonb_object_agg(u.id::text,
                      case when not v_batch then true
                           else (select c.cap is null or p_required <= c.cap
                                   from (select custom.addressed_cap(p_user_id, 'record', u.id, r.org, r.tbl) as cap) c)
                      end), '{}'::jsonb) into v_fast
      from unnest(v_kt, v_ka) as u(id, ok)
      cross join lateral (
        select count(*) as n,
               min(w.organization_id::text)::uuid as org,
               min(w.table_id::text)::uuid as tbl,  -- HOT-DOORS-4: the row's Table (one row: n = 1)
               coalesce(bool_and(w.data -> 'parent_id' is null or jsonb_typeof(w.data -> 'parent_id') = 'null'
                                 or (jsonb_typeof(w.data -> 'parent_id') = 'string'
                                     and (w.data ->> 'parent_id') ~* '^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$')), false) as parent_ok,
               count(*) filter (where w.data_class = 'record') as n_rec,
               coalesce(bool_or(w.data_class = 'record' and (t.data ->> 'level') = 'confidential'), false) as conf_tbl,
               coalesce(bool_or(w.data_class = 'record' and jsonb_typeof(w.data -> 'parent_id') = 'string'), false) as has_parent
          from custom.record w
          left join custom.record t
            on t.organization_id = w.organization_id and t.id = w.table_id and t.table_id = v_kernel
         where w.id = u.id
      ) r
     where u.ok is true
       and r.n = 1 and r.parent_ok
       and (r.n_rec = 0 or (r.n_rec = 1 and not r.conf_tbl and not r.has_parent))
       and not exists (select 1 from iam.organizations o where o.id = r.org and o.archived_at is not null);
  end if;
  return query
    select u.x, case when v_fast ? u.x::text then (v_fast ->> u.x::text)::boolean
                     else custom.reaches_directly(p_user_id, p_type, u.x, p_required) end
      from (select distinct x from unnest(p_targets) x where x is not null) u(x);
  -- KERNEL-SHADOW (2026-10-07): for the people the knob access/kernel_shadow names, ask the set form
  -- of the access kernel beside the one-at-a-time form and log any disagreement. Asked AFTER the
  -- answer above, so nothing it does can change that answer; its own return value is not used here.
  if p_user_id is not null and iam.kernel_shadow_on(p_user_id) then
    perform iam.has_access_for_shadow(p_user_id, p_targets, p_required::text, p_type,
                                      'custom.reaches_directly_many');
  end if;
end;
$function$
;
