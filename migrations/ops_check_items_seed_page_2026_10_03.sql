-- chair-step: new server-only function; its REVOKE/GRANT only narrow EXECUTE on the one function this
-- file creates (Postgres grants EXECUTE to PUBLIC on every new function, so locking a new door is a
-- REVOKE with no additive spelling). No DROP, no table, no policy, no change to an existing body.
-- ops_check_items_seed_page_2026_10_03.sql
--
-- WHY. ops.check_items_apply_run judges a whole run in ONE statement. Its expensive part is the
-- first sight of each key: an INSERT into ops.check_item, which fires ten per-row triggers. On the
-- nightly copy a 44,615-item run took 28.1 s in that one statement, against the `postgres` role's
-- 30 s ceiling (aidream migration 0919). A check's size must never decide whether its run lands.
--
-- WHAT. ops.check_items_seed_page(run, items) does ONLY that first-sight insert, for one page of
-- the run's items, under the same guards apply uses (run exists, not yet applied, not skipped or
-- broken, not older than the last applied run, well-formed items) and the same advisory lock. The
-- ingest calls it page by page (aidream services/platform_checks/ingest.py, SEED_PAGE_SIZE), then
-- calls apply with the whole run: every key then already exists, so apply only judges transitions
-- and absent keys. Measured on the copy (2026-10-03): 12,140 items in 13 pages of ≤1,000 —
-- slowest page 1.21 s, then the apply 1.44 s (it was 28.1 s for 44,615 items in one statement). The insert's state rules are a deliberate TWIN of apply's "New keys" CTE (known →
-- accepted with its basis; new → open, or handed_off when its unit is held); change one, change
-- both. It leaves the retiring `visibility` column to its own default (T-13 forbids a new reader).
-- A seeded key whose run is later held by the breaker or fails to apply stays as first seen — it
-- was reported, and the next applied run judges it like any other key.
--
-- New function only: no table, no policy, no change to an existing body. Callable by service_role
-- alone (the ingest's service connection), like every other ops.check_* writer.

create or replace function ops.check_items_seed_page(p_run_id uuid, p_items jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_sys constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_actor constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_reserved constant text[] := array['__check__', '__summary__', '__malformed__'];
  r ops.check_run%rowtype;
  c ops.proof_check%rowtype;
  v_items jsonb := coalesce(p_items, '[]'::jsonb);
  v_bad text;
  v_opened integer := 0;
  v_accepted integer := 0;
begin
  if jsonb_typeof(v_items) <> 'array' then
    raise exception 'check_items_seed_page: items must be a JSON array' using errcode = '22023';
  end if;
  if jsonb_array_length(v_items) > 5000 then
    raise exception 'check_items_seed_page: % items in one page; send at most 5000', jsonb_array_length(v_items) using errcode = '22023';
  end if;
  select * into r from ops.check_run where id = p_run_id;
  if not found then
    raise exception 'check_items_seed_page: no ops.check_run %', p_run_id using errcode = 'P0002';
  end if;
  perform set_config('app.user_id', v_actor::text, true);
  perform pg_advisory_xact_lock(hashtext('ops.check_item:' || r.check_id::text));
  select * into c from ops.proof_check where id = r.check_id;
  -- The same refusals apply makes, so seeding never writes what apply would not.
  if r.applied or r.apply_note is not null then
    return jsonb_build_object('run_id', r.id, 'seeded', false, 'note', 'run already judged');
  end if;
  if r.status <> 'completed' then
    return jsonb_build_object('run_id', r.id, 'seeded', false, 'note', 'run is ' || r.status);
  end if;
  if c.last_applied_started_at is not null and r.started_at < c.last_applied_started_at then
    return jsonb_build_object('run_id', r.id, 'seeded', false, 'note', 'run is older than the last applied run');
  end if;

  select string_agg(format('%s (%s)', coalesce(i->>'key', '<none>'), e), '; ') into v_bad
    from (select i, case
                      when jsonb_typeof(i) <> 'object' then 'not an object'
                      when coalesce(btrim(i->>'key'), '') = '' then 'no key'
                      when char_length(i->>'key') > 300 then 'key longer than 300'
                      when i->>'key' = any(v_reserved) then 'reserved key'
                      when coalesce(i->>'status', 'new') not in ('new', 'known') then 'status not new|known'
                      when i->>'basis' is not null and i->>'basis' not in ('accepted', 'debt') then 'basis not accepted|debt'
                    end as e
            from jsonb_array_elements(v_items) i) x
   where e is not null;
  if v_bad is not null then
    raise exception 'check_items_seed_page: malformed items: %', left(v_bad, 1000) using errcode = '22023';
  end if;

  -- TWIN of check_items_apply_run's "New keys" insert (same columns, same state rules).
  with p as (
    select distinct on (i->>'key')
           i->>'key' as key, coalesce(i->>'status', 'new') as status,
           case when coalesce(i->>'status', 'new') = 'known'
                then case i->>'basis' when 'accepted' then 'allowlist' else 'baseline' end end as basis,
           c.repo || ':' || coalesce(nullif(i->>'unit', ''),
                                     c.stable_id || '|' || coalesce(nullif(i->>'file', ''), nullif(i->>'rule', ''), i->>'key')) as unit,
           left(i->>'title', 500) as title, i->>'file' as file,
           case when jsonb_typeof(i->'line') = 'number' then (i->>'line')::integer end as line, i->>'rule' as rule
      from jsonb_array_elements(v_items) i
     order by i->>'key', (coalesce(i->>'status', 'new') = 'new') desc
  ), ins as (
    insert into ops.check_item (check_id, item_key, unit_key, state, accept_basis, title, file, line, rule,
                                first_seen_run_id, last_transition_run_id, handed_off_at, handed_off_to,
                                organization_id, created_by)
    select c.id, p.key, p.unit,
           case when p.status = 'known' then 'accepted' when h.unit_key is not null then 'handed_off' else 'open' end,
           case when p.status = 'known' then p.basis end,
           p.title, p.file, p.line, p.rule, r.id, r.id,
           case when p.status = 'new' then h.handed_off_at end, case when p.status = 'new' then h.handed_off_to end,
           v_sys, v_actor
      from p
      left join lateral (select x.unit_key, x.handed_off_at, x.handed_off_to from ops.check_item x
                          where x.unit_key = p.unit and x.state = 'handed_off' limit 1) h on true
     where not exists (select 1 from ops.check_item i where i.check_id = c.id and i.item_key = p.key)
    on conflict (check_id, item_key) do nothing
    returning state
  )
  select count(*) filter (where state <> 'accepted'), count(*) filter (where state = 'accepted')
    into v_opened, v_accepted from ins;

  return jsonb_build_object('run_id', r.id, 'seeded', true, 'opened', v_opened, 'accepted', v_accepted,
                            'page_items', jsonb_array_length(v_items));
end;
$function$;

do $grants$
declare
  f text := 'ops.check_items_seed_page(uuid, jsonb)';
begin
  insert into platform.client_callable_door (schema_name, function_name, identity_args, identity_argtypes,
                                             reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
  select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid),
         (select coalesce(array_agg(t order by o), '{}'::oid[]) from unnest(p.proargtypes) with ordinality u(t, o)),
         'Checks store: the first-sight insert of one page of a run''s items, so no single statement of a large run nears the role''s statement ceiling. Its arguments name a check run and that run''s items, checked against ops.check_run / ops.proof_check by the function itself; no caller identity is involved because no client may call it.',
         'matrx-frontend/migrations/ops_check_items_seed_page_2026_10_03.sql',
         'server_only: aidream/services/platform_checks/ingest.py (the check ingest — the scheduled CI pull and the hand CLI, as the service connection) is the only caller; check items are platform-admin-only internal data, so no browser or signed-in client ever writes them.',
         false, false
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.oid = f::regprocedure
     and not exists (select 1 from platform.client_callable_door d
                      where d.schema_name = n.nspname and d.function_name = p.proname
                        and d.identity_args = pg_get_function_identity_arguments(p.oid));
  execute format('revoke all on function %s from public, anon, authenticated', f);
  execute format('grant execute on function %s to service_role', f);
end
$grants$;
