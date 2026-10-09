-- chair-step: undo memosweep_a - drops the memo comparison (compare, pair, sweep), puts back kernel_batch_on, access_shadow_status and reaches_directly_many as they were. Unschedule first: select cron.unschedule('kernel-memo-sweep');
-- lane: MEMO-SWEEP
-- based-on: iam.kernel_batch_on(uuid) 44b43a339b69591931d821a7c0bf8440c009a52de9fd5d00d7241d3073052a0a
-- based-on: iam.access_shadow_status() 391745151577d11c911a80ab6b75dc9161991a34f0c70f0fbdabcf76a23c58f7
-- based-on: custom.reaches_directly_many(uuid, uuid[], text, permission_level) 7ac88c48275021764b09aba3867f5f39fc4933dac5f663422ee19f4ea1cb9a29

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
declare
  v_p   uuid;
  v_s   text;
  v_k   text;
  v_on  boolean;
begin
  if pg_catalog.pg_current_xact_id_if_assigned() is not null then
    return false;
  end if;
  v_s := coalesce(current_setting('mx.kernel_batch', true), '');
  if v_s = 'off' then return false; end if;
  if v_s = 'on' then return true; end if;
  v_p := coalesce(p_person, auth.uid());
  v_k := 'iam.kernel_batch_on:' || coalesce(v_p::text, '-');
  v_s := platform.memo_k_get(v_k);
  if v_s is not null then
    return v_s = 't';
  end if;
  begin
    v_on := coalesce((platform.knob_resolve('access', 'kernel_batch', null) ->> 'on')::boolean, false)
        and not coalesce(platform.knob_resolve('access', 'kernel_batch', null) -> 'off_for' ? coalesce(v_p::text, ''), false);
  exception when others then
    v_on := false;
  end;
  perform platform.memo_k_put(v_k, case when v_on then 't' else 'f' end);
  return v_on;
end;
$function$
;
CREATE OR REPLACE FUNCTION iam.access_shadow_status()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  -- KERNEL-SHADOW: the drift guard's state for server_status. red = any disagreement in 24 h.
  select jsonb_build_object(
    'disagreements_24h', count(*) filter (where l.target is not null),
    'failures_24h',      count(*) filter (where l.target is null and l.error is not null),
    'compared_24h',      coalesce(sum(l.compared), 0),
    'checks_24h',        count(*) filter (where l.target is null),
    'last_check_at',     max(l.at) filter (where l.target is null),
    'set_form_on',       coalesce((select (k.value ->> 'on')::boolean from platform.feature_knob k
                                    where k.feature = 'access' and k.key = 'kernel_set_form'), false),
    'red',               count(*) filter (where l.target is not null or l.error is not null) > 0)
    from iam.access_shadow_log l
   where l.at > now() - interval '24 hours'
$function$
;
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

delete from platform.client_callable_door
 where schema_name = 'iam' and function_name in ('_memo_pair', 'kernel_memo_compare', 'kernel_memo_sweep');
drop function if exists iam.kernel_memo_sweep(integer, integer);
drop function if exists iam.kernel_memo_compare(integer, integer);
drop function if exists iam._memo_pair(text, uuid, uuid, uuid, uuid[], text, text, integer, integer);
