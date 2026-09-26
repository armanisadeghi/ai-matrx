-- chair-step: the only DELETE is `delete from _check_reported` inside the replaced function body — a per-call temp table the function itself fills; nothing persistent is deleted or narrowed.
-- based-on: ops.check_items_apply_run(uuid, jsonb, text, text, boolean) d0f1f429f95bc839d69426d95016680845ac93a5a988bcc1d765e4ccd18c9d75
-- based-on: ops.check_item_db_accept(uuid, text, text, timestamp with time zone) c57f3670595ee9c34cedeab908cd9b7bd82d0ae8386d73e7ddd66b73222411cb
--
-- ops_check_store_fixes_2026_09_26f.sql
--
-- FIXES FROM THE RE-VERIFICATION (common-docs/projects/checks-run-in-the-app/P2-STORAGE-VERIFY.md,
-- "Re-verification (fresh)"). Build log: P2-STORAGE-DESIGN §7.
--   N2  A check that returns after retirement: its check_retired items it no longer reports are
--       judged like live items — fixed on a whole, scan-complete run, counted by the breaker — instead
--       of staying check_retired forever. (Reported ones were already revived.)
--   N3  check_item_db_accept refuses every reserved record key, __malformed__ included.

create or replace function ops.check_items_apply_run(
  p_run_id uuid, p_items jsonb, p_verdict text, p_headline text, p_confirm_mass_fix boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_sys constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_actor constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_reserved constant text[] := array['__check__', '__summary__', '__malformed__'];
  r ops.check_run%rowtype;
  c ops.proof_check%rowtype;
  v_items jsonb := coalesce(p_items, '[]'::jsonb);
  v_bad text;
  v_share numeric;
  v_min integer;
  v_trash_days integer;
  v_itemized boolean;
  v_can_fix boolean;
  v_can_close boolean;
  v_live integer;
  v_absent integer;
  v_new_reported integer;
  v_opened integer := 0;
  v_accepted integer := 0;
  v_reopened integer := 0;
  v_review_reopened integer := 0;
  v_fixed integer := 0;
  v_trashed integer := 0;
  v_note text;
  v_err text;
  v_summary_title text := left(coalesce(nullif(p_headline, ''), 'the check failed with no new item'), 500);
begin
  if p_verdict is not null and p_verdict not in ('pass', 'fail') then
    raise exception 'check_items_apply_run: verdict % is not pass|fail', p_verdict using errcode = '22023';
  end if;
  select * into r from ops.check_run where id = p_run_id for update;
  if not found then
    raise exception 'check_items_apply_run: no ops.check_run %', p_run_id using errcode = 'P0002';
  end if;
  -- Idempotent: a run is judged once. The one exception is a run the breaker HELD, re-applied with
  -- the confirmation the breaker's note asks for (V2).
  if r.applied or (r.apply_note is not null and not (p_confirm_mass_fix and r.skipped_reason = 'breaker_held')) then
    return jsonb_build_object('run_id', r.id, 'applied', r.applied, 'noop', true, 'note', r.apply_note);
  end if;
  perform set_config('app.user_id', v_actor::text, true);
  perform pg_advisory_xact_lock(hashtext('ops.check_item:' || r.check_id::text));
  select * into c from ops.proof_check where id = r.check_id for update;

  -- F7: never let an older run overwrite a newer verdict.
  if c.last_applied_started_at is not null and r.started_at < c.last_applied_started_at then
    v_note := format('refused: started %s, before the last applied run (%s started %s)',
                     r.started_at, c.last_applied_run_id, c.last_applied_started_at);
    update ops.check_run set skipped_reason = 'older_than_applied', apply_note = v_note where id = r.id;
    return jsonb_build_object('run_id', r.id, 'applied', false, 'note', v_note);
  end if;
  if r.status = 'skipped' then
    v_note := 'skipped: ' || coalesce(r.skipped_reason, 'no reason given');
    update ops.check_run set apply_note = v_note where id = r.id;
    return jsonb_build_object('run_id', r.id, 'applied', false, 'note', v_note);
  end if;

  -- V1: everything below runs in a subtransaction. A failure is RECORDED, never thrown: the ingest
  -- goes on to the next check and this check shows as broken with the database's own words.
  begin
    -- F9: a run that crashed, timed out or could not be parsed says nothing about its items.
    if r.status in ('errored', 'timed_out') then
      insert into ops.check_item (check_id, item_key, unit_key, state, title, first_seen_run_id,
                                  last_transition_run_id, organization_id, created_by, visibility)
      values (c.id, '__check__', c.repo || ':' || c.stable_id || '|__check__', 'check_broken',
              left(coalesce(nullif(p_headline, ''), 'the check ' || r.status), 500), r.id, r.id, v_sys, v_actor, 'internal')
      on conflict (check_id, item_key) do update
         set state = 'check_broken', title = excluded.title, last_transition_run_id = r.id,
             fixed_at = null, deleted_at = null, accept_basis = null
       where ops.check_item.state is distinct from 'check_broken' or ops.check_item.title is distinct from excluded.title;
      v_note := 'check_broken: ' || r.status;
      update ops.check_run set applied = true, apply_note = v_note where id = r.id;
      update ops.proof_check set last_applied_run_id = r.id, last_applied_started_at = r.started_at where id = c.id;
      return jsonb_build_object('run_id', r.id, 'applied', true, 'note', v_note);
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
      raise exception 'malformed items: %', left(v_bad, 1000) using errcode = '22023';
    end if;

    create temp table if not exists _check_reported (
      key text primary key, status text, basis text, unit text, title text, file text, line integer, rule text
    ) on commit drop;
    delete from _check_reported;
    -- V9: a work unit is namespaced by repo — declared ids are unique only within a repo.
    insert into _check_reported
    select distinct on (i->>'key')
           i->>'key', coalesce(i->>'status', 'new'),
           case when coalesce(i->>'status', 'new') = 'known'
                then case i->>'basis' when 'accepted' then 'allowlist' else 'baseline' end end,
           c.repo || ':' || coalesce(nullif(i->>'unit', ''),
                                     c.stable_id || '|' || coalesce(nullif(i->>'file', ''), nullif(i->>'rule', ''), i->>'key')),
           left(i->>'title', 500), i->>'file',
           case when jsonb_typeof(i->'line') = 'number' then (i->>'line')::integer end, i->>'rule'
      from jsonb_array_elements(v_items) i
     order by i->>'key', (coalesce(i->>'status', 'new') = 'new') desc;

    v_itemized := c.itemized or r.scan_complete or exists (select 1 from _check_reported);
    v_can_fix := r.run_scope = 'full' and r.scan_complete and r.status = 'completed' and v_itemized
                 and r.malformed_count = 0;
    -- V2: only a run that could itself judge the whole check closes its alarm.
    v_can_close := v_can_fix or (r.status = 'completed' and not v_itemized);
    select count(*), count(*) filter (where not exists (select 1 from _check_reported p where p.key = i.item_key))
      into v_live, v_absent
      from ops.check_item i
     where i.check_id = c.id and not (i.item_key = any(v_reserved))
       and i.state in ('open', 'handed_off', 'accepted', 'check_retired');
    select count(*) into v_new_reported from _check_reported where status = 'new';

    -- F6 circuit breaker.
    v_share := coalesce((platform.knob_resolve('checks', 'fix_breaker_share', v_sys, null, null) #>> '{}')::numeric, 0.2);
    v_min := coalesce((platform.knob_resolve('checks', 'fix_breaker_min', v_sys, null, null) #>> '{}')::integer, 10);
    if v_can_fix and not p_confirm_mass_fix and v_absent > v_min and v_absent > v_share * v_live then
      v_note := format('circuit breaker: this run would mark %s of %s live items fixed (more than %s%% and more than %s); nothing was applied. Confirm the scan is whole, then re-ingest with --confirm-mass-fix %s (p_confirm_mass_fix).',
                       v_absent, v_live, round(v_share * 100), v_min, c.stable_id);
      insert into ops.check_item (check_id, item_key, unit_key, state, title, first_seen_run_id,
                                  last_transition_run_id, organization_id, created_by, visibility)
      values (c.id, '__check__', c.repo || ':' || c.stable_id || '|__check__', 'check_broken', left(v_note, 500), r.id, r.id, v_sys, v_actor, 'internal')
      on conflict (check_id, item_key) do update
         set state = 'check_broken', title = excluded.title, last_transition_run_id = r.id,
             fixed_at = null, deleted_at = null, accept_basis = null;
      update ops.check_run set apply_note = v_note, skipped_reason = 'breaker_held' where id = r.id;
      return jsonb_build_object('run_id', r.id, 'applied', false, 'note', v_note, 'breaker', true);
    end if;

    -- V7: a `db` accept whose review date has passed is a question again.
    with up as (
      update ops.check_item
         set state = 'open', accept_basis = null, last_transition_run_id = r.id,
             metadata = metadata || jsonb_build_object('db_accept_expired', jsonb_build_object(
                          'reason', db_accept_reason, 'review_after', review_after, 'reopened_at', now())),
             db_accept_reason = null, review_after = null
       where check_id = c.id and state = 'accepted' and accept_basis = 'db' and review_after <= now()
      returning 1
    )
    select count(*) into v_review_reopened from up;

    -- New keys. A key in a unit somebody already holds is born held (F10).
    with ins as (
      insert into ops.check_item (check_id, item_key, unit_key, state, accept_basis, title, file, line, rule,
                                  first_seen_run_id, last_transition_run_id, handed_off_at, handed_off_to,
                                  organization_id, created_by, visibility)
      select c.id, p.key, p.unit,
             case when p.status = 'known' then 'accepted' when h.unit_key is not null then 'handed_off' else 'open' end,
             case when p.status = 'known' then p.basis end,
             p.title, p.file, p.line, p.rule, r.id, r.id,
             case when p.status = 'new' then h.handed_off_at end, case when p.status = 'new' then h.handed_off_to end,
             v_sys, v_actor, 'internal'
        from _check_reported p
        left join lateral (select x.unit_key, x.handed_off_at, x.handed_off_to from ops.check_item x
                            where x.unit_key = p.unit and x.state = 'handed_off' limit 1) h on true
       where not exists (select 1 from ops.check_item i where i.check_id = c.id and i.item_key = p.key)
      returning state
    )
    select count(*) filter (where state <> 'accepted'), count(*) filter (where state = 'accepted')
      into v_opened, v_accepted from ins;

    -- Known keys: covered by the check's own allowlist/baseline → accepted with that basis.
    with up as (
      update ops.check_item i
         set state = 'accepted', accept_basis = p.basis, review_after = null, db_accept_reason = null,
             handed_off_at = null, handed_off_to = null, fixed_at = null, deleted_at = null,
             metadata = i.metadata - 'db_accept',
             last_transition_run_id = r.id, title = coalesce(p.title, i.title), file = coalesce(p.file, i.file),
             line = coalesce(p.line, i.line), unit_key = p.unit
        from _check_reported p
       where i.check_id = c.id and i.item_key = p.key and p.status = 'known'
         and (i.state <> 'accepted' or i.accept_basis is distinct from p.basis)
      returning 1
    )
    select v_accepted + count(*) into v_accepted from up;

    -- New keys that exist: reopen an allowlist/baseline accept (never a `db` one, F5); revive a
    -- fixed/retired/broken key — as its `db` accept again when that accept had not reached its
    -- review date (V7); a key already open or held stays as it is.
    with up as (
      update ops.check_item i
         set state = case
                       when (i.metadata #>> '{db_accept,review_after}')::timestamptz > now() then 'accepted'
                       when exists (select 1 from ops.check_item x where x.unit_key = p.unit and x.state = 'handed_off') then 'handed_off'
                       else 'open' end,
             accept_basis = case when (i.metadata #>> '{db_accept,review_after}')::timestamptz > now() then 'db' end,
             db_accept_reason = case when (i.metadata #>> '{db_accept,review_after}')::timestamptz > now()
                                     then i.metadata #>> '{db_accept,reason}' end,
             review_after = case when (i.metadata #>> '{db_accept,review_after}')::timestamptz > now()
                                 then (i.metadata #>> '{db_accept,review_after}')::timestamptz end,
             metadata = i.metadata - 'db_accept',
             fixed_at = null, deleted_at = null, last_transition_run_id = r.id,
             title = coalesce(p.title, i.title), file = coalesce(p.file, i.file), line = coalesce(p.line, i.line),
             rule = coalesce(p.rule, i.rule), unit_key = p.unit
        from _check_reported p
       where i.check_id = c.id and i.item_key = p.key and p.status = 'new'
         and (i.state in ('fixed', 'check_retired', 'check_broken')
              or (i.state = 'accepted' and i.accept_basis <> 'db'))
      returning 1
    )
    select count(*) into v_reopened from up;

    -- Absent keys are fixed only by a run that can prove it saw everything (F6). Leaving `accepted`
    -- clears the basis (V1); a `db` accept is kept in metadata until its review date (V7).
    if v_can_fix then
      with up as (
        update ops.check_item i
           set state = 'fixed', fixed_at = now(), deleted_at = now(), handed_off_at = null,
               handed_off_to = null, last_transition_run_id = r.id,
               metadata = case when i.accept_basis = 'db'
                               then i.metadata || jsonb_build_object('db_accept', jsonb_build_object(
                                      'reason', i.db_accept_reason, 'review_after', i.review_after))
                               else i.metadata end,
               accept_basis = null, db_accept_reason = null, review_after = null
         where i.check_id = c.id and not (i.item_key = any(v_reserved))
           and i.state in ('open', 'handed_off', 'accepted', 'check_retired')
           and not exists (select 1 from _check_reported p where p.key = i.item_key)
        returning 1
      )
      select count(*) into v_fixed from up;
    end if;

    -- A run that could judge the whole check closes its broken alarm (V2).
    if v_can_close then
      update ops.check_item
         set state = 'fixed', fixed_at = now(), deleted_at = now(), last_transition_run_id = r.id
       where check_id = c.id and item_key = '__check__' and state = 'check_broken';
    end if;

    -- V6: malformed item lines are a finding of their own, never a clean pass.
    if r.malformed_count > 0 then
      insert into ops.check_item (check_id, item_key, unit_key, state, title, first_seen_run_id,
                                  last_transition_run_id, organization_id, created_by, visibility)
      values (c.id, '__malformed__', c.repo || ':' || c.stable_id || '|__malformed__', 'open',
              format('%s malformed MATRX-ITEM line(s): the check printed items the store cannot read, so nothing was marked fixed', r.malformed_count),
              r.id, r.id, v_sys, v_actor, 'internal')
      on conflict (check_id, item_key) do update
         set state = case when ops.check_item.state = 'handed_off' then 'handed_off' else 'open' end,
             title = excluded.title, fixed_at = null, deleted_at = null, accept_basis = null,
             last_transition_run_id = case when ops.check_item.state in ('open', 'handed_off')
                                           then ops.check_item.last_transition_run_id else r.id end;
    elsif r.status = 'completed' then
      update ops.check_item
         set state = 'fixed', fixed_at = now(), deleted_at = now(), handed_off_at = null, handed_off_to = null,
             last_transition_run_id = r.id
       where check_id = c.id and item_key = '__malformed__' and state in ('open', 'handed_off');
    end if;

    -- F9: a failing verdict with no NEW item is still a failure.
    if p_verdict = 'fail' and v_new_reported = 0 then
      insert into ops.check_item (check_id, item_key, unit_key, state, title, first_seen_run_id,
                                  last_transition_run_id, organization_id, created_by, visibility)
      values (c.id, '__summary__', c.repo || ':' || c.stable_id || '|__summary__', 'open', v_summary_title, r.id, r.id, v_sys, v_actor, 'internal')
      on conflict (check_id, item_key) do update
         set state = case when ops.check_item.state = 'handed_off' then 'handed_off' else 'open' end,
             title = excluded.title, fixed_at = null, deleted_at = null, accept_basis = null,
             last_transition_run_id = case when ops.check_item.state in ('open', 'handed_off')
                                           then ops.check_item.last_transition_run_id else r.id end;
    else
      update ops.check_item
         set state = 'fixed', fixed_at = now(), deleted_at = now(), handed_off_at = null, handed_off_to = null,
             last_transition_run_id = r.id
       where check_id = c.id and item_key = '__summary__' and state in ('open', 'handed_off');
    end if;

    -- F2: bounded growth by construction — trash this check's old runs (the sweep purges them).
    v_trash_days := coalesce((platform.knob_resolve('checks', 'check_run_trash_days', v_sys, null, null) #>> '{}')::integer, 30);
    with up as (
      update ops.check_run set deleted_at = now()
       where check_id = c.id and deleted_at is null and started_at < now() - make_interval(days => v_trash_days)
      returning 1
    )
    select count(*) into v_trashed from up;

    v_note := format('opened %s, accepted %s, reopened %s, fixed %s%s%s', v_opened, v_accepted, v_reopened, v_fixed,
                     case when v_review_reopened > 0 then format(', %s db accept(s) past review reopened', v_review_reopened) else '' end,
                     case when not v_can_fix then ' (absent keys not judged: ' ||
                       concat_ws(', ',
                         case when r.run_scope <> 'full' then 'partial run' end,
                         case when not r.scan_complete then 'no end-of-scan marker' end,
                         case when r.malformed_count > 0 then 'malformed item lines' end,
                         case when not v_itemized then 'check is not itemized' end) || ')' else '' end);
    update ops.check_run set applied = true, apply_note = v_note,
           skipped_reason = case when skipped_reason = 'breaker_held' then null else skipped_reason end
     where id = r.id;
    update ops.proof_check
       set last_applied_run_id = r.id, last_applied_started_at = r.started_at,
           itemized = v_itemized,
           last_verdict = case when p_verdict is distinct from last_verdict and p_verdict is not null then p_verdict else last_verdict end,
           last_run_at = case when p_verdict is distinct from last_verdict and p_verdict is not null then coalesce(r.finished_at, r.started_at) else last_run_at end
     where id = c.id;
    return jsonb_build_object('run_id', r.id, 'applied', true, 'opened', v_opened, 'accepted', v_accepted,
                              'reopened', v_reopened, 'review_reopened', v_review_reopened, 'fixed', v_fixed,
                              'trashed_runs', v_trashed, 'fix_judged', v_can_fix, 'note', v_note);
  exception when others then
    v_err := format('the store could not apply this run: %s (%s)', sqlerrm, sqlstate);
  end;

  -- The subtransaction rolled back every item write of this run; record the failure LOUDLY.
  insert into ops.check_item (check_id, item_key, unit_key, state, title, first_seen_run_id,
                              last_transition_run_id, organization_id, created_by, visibility)
  values (c.id, '__check__', c.repo || ':' || c.stable_id || '|__check__', 'check_broken', left(v_err, 500), r.id, r.id, v_sys, v_actor, 'internal')
  on conflict (check_id, item_key) do update
     set state = 'check_broken', title = excluded.title, last_transition_run_id = r.id,
         fixed_at = null, deleted_at = null, accept_basis = null;
  update ops.check_run set apply_note = left(v_err, 1000) where id = r.id;
  return jsonb_build_object('run_id', r.id, 'applied', false, 'error', v_err, 'note', v_err);
end;
$function$;

create or replace function ops.check_item_db_accept(
  p_check_id uuid, p_item_key text, p_reason text, p_review_after timestamptz)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_id uuid;
begin
  if coalesce(btrim(p_reason), '') = '' or p_review_after is null then
    raise exception 'check_item_db_accept: a reason and a review date are both required' using errcode = '22023';
  end if;
  if p_item_key in ('__check__', '__summary__', '__malformed__') then
    raise exception 'check_item_db_accept: % is a failure record, not an item — it cannot be accepted', p_item_key using errcode = '22023';
  end if;
  perform set_config('app.user_id', '87a6e699-3622-4869-8843-d0867456c0dd', true);
  update ops.check_item
     set state = 'accepted', accept_basis = 'db', db_accept_reason = p_reason, review_after = p_review_after,
         handed_off_at = null, handed_off_to = null, fixed_at = null, deleted_at = null
   where check_id = p_check_id and item_key = p_item_key and state in ('open', 'handed_off', 'accepted')
  returning id into v_id;
  if v_id is null then
    raise exception 'check_item_db_accept: no live item % on check %', p_item_key, p_check_id using errcode = 'P0002';
  end if;
  return v_id;
end;
$function$;

notify pgrst, 'reload schema';
