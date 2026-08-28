-- HR domain C4 — migration 48 (register item HRB-008; HRB-001 D15 verifier, DEFECT-1 continued).
--
-- 🚨 THE INBOX QUEUE DEEP LINKS ALSO CARRIED NO READ REFERENCE.
--
-- hr_c4_47 threaded `notice=<id>` into the links hr._wf_notify emits — the notifications a person
-- follows from email/sms/in-app. The verifier named a second producer of the same notice-less link:
-- the in-app QUEUE. `hr.wf_pending` and `hr.wf_inbox` compose `/hr/tasks/<instance>?step=<step>` for
-- every queue row, so following a queue item stamped nothing either (§5.2: "In-app: the notice item
-- was expanded or its deep link followed").
--
-- Unlike a notification row, a queue row is not itself a notice — so the reference is RESOLVED: the
-- viewer's own in-app notification for that step. Keyed to `recipient_user_id = v_uid` (the actual
-- caller), so an admin reading SOMEBODY ELSE'S queue finds no notice of their own and gets the plain
-- object route — their click must never stamp the employee's notice as read.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS
--
-- 1. THE REFERENCE IS THE VIEWER'S OWN IN-APP NOTICE FOR THE STEP, or nothing. `notice=<id>` is
--    appended only when a `communication.notification` row exists for `recipient_user_id = v_uid`,
--    `target_id = <step>`, `channel = 'in_app'`. No row (e.g. an admin viewing another queue, or a
--    step nobody was notified about) → the object route stands, exactly as before. The notice
--    reference can only ever point at a notice the VIEWER is entitled to stamp.
--
-- 2. THE OBJECT ROUTE IS PRESERVED, THE REFERENCE APPENDED (§2.1 + §5.2), joined with `&` because
--    the route already carries `?step=`. Identical shape to hr_c4_47.
--
-- 3. THREE SITES, ONE EXPRESSION. `hr.wf_pending` has one deep-link composition
--    (`needs_my_decision`); `hr.wf_inbox` has two (the `queue` and `team` scopes). All three are the
--    same string and all three are rewritten, so the queue cannot be half-fixed.
--
-- Authority: SPEC-NOTIFICATIONS §5.2 (the read reference) / §2.1 (the object route); continues
-- hr_c4_47.
-- Applied live as `hr_c4_48_the_queue_deep_links_carry_the_read_reference_too`. Idempotent.

set local statement_timeout = '600s';
set local lock_timeout = '120s';

do $$
declare v_bad integer;
begin
  select count(*) into v_bad
    from platform.entity_types e, lateral iam.canonical_certify('hr', e.table_name, e.token) c
   where e.schema_name = 'hr' and c.category <> 'broken_dependent_fn' and c.status in ('FAIL','WARN');
  perform set_config('matrx.hr_c4_48_conf_before', v_bad::text, true);
end $$;

-- ============================================================ 1. thread the reference (RD 1/2/3)
do $mig$
declare
  v_fn text; v_oid oid; v_def text; v_new text; v_hits integer;
  v_old constant text := $o$'/hr/tasks/' || i.id::text || '?step=' || s.id::text$o$;
  v_add constant text := $o$'/hr/tasks/' || i.id::text || '?step=' || s.id::text || coalesce('&notice=' || (select nt.id::text from communication.notification nt where nt.recipient_user_id = v_uid and nt.target_id = s.id and nt.channel = 'in_app' order by nt.created_at desc limit 1), '')$o$;
begin
  foreach v_fn in array array['wf_pending', 'wf_inbox'] loop
    select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'hr' and p.proname = v_fn;
    v_def := pg_get_functiondef(v_oid);
    if position('&notice=' in v_def) > 0 then
      raise notice 'hr_c4_48: hr.% already carries the read reference', v_fn;
      continue;
    end if;
    v_hits := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    if v_hits = 0 then
      raise exception 'hr_c4_48: hr.% does not carry the expected deep-link composition — refusing to half-apply', v_fn;
    end if;
    if v_def !~ 'v_uid' then
      raise exception 'hr_c4_48: hr.% has no v_uid to key the notice reference on', v_fn;
    end if;
    v_new := replace(v_def, v_old, v_add);
    execute v_new;
    raise notice 'hr_c4_48: hr.% now appends the viewer''s notice reference (% site(s))', v_fn, v_hits;
  end loop;
end
$mig$;

-- ============================================================ 2. the contracts
do $$
begin
  delete from hr.function_contract where home_migration = 'hr_c4_48';
  insert into hr.function_contract (schema_name, function_name, home_migration,
                                    must_contain, must_not_contain, must_be_definer, reason)
  values
  ('hr', 'wf_pending', 'hr_c4_48',
   array['&notice=', 'nt.recipient_user_id = v_uid', 'nt.channel = ''in_app'''], '{}', true,
   'hr_c4_48: the queue deep link must carry the VIEWER''s own in-app notice reference so following it stamps read (§5.2). Keyed to recipient_user_id = v_uid: an admin reading another queue must find no notice and get the plain route — their click must never stamp the employee''s notice.'),
  ('hr', 'wf_inbox', 'hr_c4_48',
   array['&notice=', 'nt.recipient_user_id = v_uid', 'nt.channel = ''in_app'''], '{}', true,
   'hr_c4_48: both the queue and team scope deep links must carry the viewer''s own in-app notice reference (§5.2), keyed to recipient_user_id = v_uid so it only ever points at a notice this viewer may stamp.');
end $$;

-- ============================================================ 3. post-conditions that EXECUTE
do $$
declare
  v_bad integer; v_before integer; v_res jsonb;
  v_pend integer; v_inbx integer;
begin
  -- both functions carry the reference at every site
  select (length(prosrc) - length(replace(prosrc, '&notice=', ''))) / length('&notice=')
    into v_pend from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'wf_pending';
  select (length(prosrc) - length(replace(prosrc, '&notice=', ''))) / length('&notice=')
    into v_inbx from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'wf_inbox';
  if v_pend < 1 then raise exception 'hr_c4_48: wf_pending lost its notice reference'; end if;
  if v_inbx < 2 then raise exception 'hr_c4_48: wf_inbox has % notice references, expected 2', v_inbx; end if;

  -- the reference is keyed to the viewer, never a bare step lookup
  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = 'wf_pending') !~ 'nt\.recipient_user_id = v_uid' then
    raise exception 'hr_c4_48: wf_pending does not key the notice on the viewer';
  end if;

  v_res := hr._wf_door_smoke();
  if not coalesce((v_res ->> 'ok')::boolean, false) then
    raise exception 'hr_c4_48: the door smoke test failed: %', v_res;
  end if;
  select coalesce(count(*), 0) into v_bad from hr.function_contracts_broken();
  if v_bad > 0 then
    raise exception 'hr_c4_48: % function contract(s) broken', v_bad;
  end if;
  select count(*) into v_bad
    from platform.entity_types e, lateral iam.canonical_certify('hr', e.table_name, e.token) c
   where e.schema_name = 'hr' and c.category <> 'broken_dependent_fn' and c.status in ('FAIL','WARN');
  v_before := current_setting('matrx.hr_c4_48_conf_before')::integer;
  if v_bad > v_before then
    raise exception 'hr_c4_48: hr conformance findings rose from % to %', v_before, v_bad;
  end if;
  raise notice 'hr_c4_48: the queue deep links carry the read reference too';
end $$;
