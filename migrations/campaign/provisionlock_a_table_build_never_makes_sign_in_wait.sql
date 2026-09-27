-- chair-step: lane PROVISION-LOCK (2026-09-27). A TABLE BUILD NEVER MAKES SIGN-IN WAIT. Four real table builds on production (lane KERNEL-1294) timed out at `drop trigger if exists _guard_governance on workbench.<new>` waiting for ACCESS EXCLUSIVE on auth.users, with sign-in reads queued behind the wait. NAMED CAUSE: Supabase's supautils (session_preload_libraries) `drop_trigger_grants` and `policy_grants`, both keyed on role postgres: every DROP TRIGGER and CREATE/ALTER/DROP POLICY run as postgres takes ACCESS EXCLUSIVE on the 23 listed auth/storage/realtime tables and holds it to COMMIT (fixed upstream in supautils 3.4.4; production image 17.6.1.127 predates it). Not an FK and not one of our event triggers (proved on the clone with every postgres event trigger disabled, and with a non-postgres role: 0 locks). On production auth.users is never free (97-second custom.context_tag_copy calls hold RowShare on it), so the wait was the norm. FIX THE CLASS: (1) iam.take_sign_in_freeze(rel, for) is the one door in front of the hook: it takes the hook's own locks with 1 ms waits in a retry loop (so nobody queues behind the attempt) and refuses 55P03 in a plain sentence naming the transaction in the way after knob infrastructure.provisioning/sign_in_freeze_grab_ms (seeded 8000); iam._rls_emit_policies, iam.drop_governance_guard and platform._admin_read_ensure call it before their first hooked statement. (2) iam.apply_governance_guard issues one CREATE OR REPLACE TRIGGER (not hooked) instead of drop + create; drop_governance_guard drops only a trigger that exists. (3) platform._admin_read_ensure is the one writer of platform_admin_read (bytes moved verbatim from platform._admin_read_follows_rls, which calls it). (4) With the base contract deferred, platform.provision's build transaction writes no policy at all (the relation is marked `owed`; iam._rls_emit_policies skips it; the admin-read event trigger leaves it alone; platform.provision_certify_judged records the policy checks PENDING), and platform.provision_attach_base_contract, already the next short transaction every caller runs, seals it: iam.organizations lock NOWAIT, iam.apply_rls (freeze only at the burst), platform_admin_read, then the FKs under NOWAIT locks. platform.provision_validate_base_contract (unchanged) re-certifies in full. No kernel member and no fingerprint changes (asserted). Proof: scripts/campaign-tests/provisionlock_green.sql and the load harness in PROGRESS-PROVISION-LOCK.md.
-- lane: PROVISION-LOCK
-- based-on: iam._rls_emit_policies(text[], text[]) 9a06fc863cdba1b4dcb9aa3682850d64a1400f8fd9f422341014e3a2a6eb1503
-- based-on: iam.drop_governance_guard(text, text) 9c2cd5f85b2b769b705227bf58d1f693ebd671885a20a2f0a2d4aa9726b51202
-- based-on: iam.apply_governance_guard(text, text, text) d567b60ccd858f637745e452b24674ecf9e217c32e4af3559c24c59fe2ce1cc5
-- based-on: platform._admin_read_follows_rls() bf0ab831f21381bc9b159c891fa6527702b5670001e8944ff9163e3d31b79572
-- based-on: platform.provision_certify_judged(text, text, text, boolean) c6d563370c8542a0006cc8ffb22ed240f75c809467419771b5ece68fd21f991d
-- based-on: platform.provision_attach_base_contract(text) 7412baaeb4523b01eb1ca402f07a03626c453bbb1c64fdb46ca8a8bb14a8fbb6
-- based-on: platform.provision(jsonb, text, uuid, text) f049ed54225097085fac5da95a69b726013f985de9dcabf5d4a5f841ce4f286e
-- INVERSE: migrations/inverse/provisionlock_a_table_build_never_makes_sign_in_wait_down.sql



insert into platform.feature_knob (
  feature, key, value, default_value, value_type, unit,
  min_value, max_value, allowed_values, label, description,
  set_by, basis, overridable_by, override_direction, ui, propagation, taxonomy_node_id
)
select 'infrastructure.provisioning', 'sign_in_freeze_grab_ms',
       to_jsonb(8000), to_jsonb(8000), 'integer', 'milliseconds',
       1000::numeric, 30000::numeric, null::jsonb,
       'How long writing a table''s access rules may look for a quiet moment',
       'Writing a table''s access rules has to pause sign-in for a few milliseconds. The platform never makes anyone wait for that pause: it only takes it at a moment when nobody is signing in, and gives up after this long, saying so, rather than letting sign-in queue up behind it.',
       'agent',
       '8000 ms (lane PROVISION-LOCK, 2026-09-27). Each try waits at most 1 ms, so this bounds only how long the builder keeps trying, never how long anyone else waits. It sits under the settle transaction''s 15 s statement ceiling in aidream (services/provisioning/service.py _SETTLE_STATEMENT_TIMEOUT_MS) with room for the build work around it.',
       array['organization'], 'any',
       jsonb_build_object('group','Infrastructure','order',12,'control','number','help','Raise it if table building keeps saying the sign-in tables were never quiet; it never makes sign-in wait longer.'),
       'next_load', n.id
  from (select id from platform.taxonomy_node where slug = 'production-infra' and level = 'feature' limit 1) n
on conflict (feature, key) do nothing;

CREATE OR REPLACE FUNCTION platform.sign_in_freeze_grab_ms()
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_ms integer;
begin
  select (k.value #>> '{}')::integer into v_ms
    from platform.feature_knob k
   where k.feature = 'infrastructure.provisioning' and k.key = 'sign_in_freeze_grab_ms';
  if v_ms is null then
    raise exception 'platform.sign_in_freeze_grab_ms: knob infrastructure.provisioning/sign_in_freeze_grab_ms is not seeded'
      using errcode = 'P0001',
            hint = 'Seed it (migrations/campaign/provisionlock_a_table_build_never_makes_sign_in_wait.sql) and call again. A missing knob raises rather than inventing how long the builder may keep trying.';
  end if;
  return v_ms;
end;
$function$;

CREATE OR REPLACE FUNCTION platform._access_seal_marked(p_rel regclass, p_which text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  -- Lane PROVISION-LOCK (2026-09-27). Two TRANSACTION-LOCAL lists of relation oids:
  --   owed    set by platform.provision in the build transaction when the base contract is deferred:
  --           the table's policies are NOT written here (iam._rls_emit_policies skips them) and the
  --           policy checks are PENDING in platform.provision_certify_judged;
  --   sealing set by platform.provision_attach_base_contract while it writes them.
  -- In both, platform._admin_read_follows_rls leaves the relation alone: its platform_admin_read
  -- is written by platform._admin_read_ensure right after the generator's policy burst, so the
  -- sign-in freeze never opens before the burst. A list dies with its transaction.
  select coalesce(current_setting('platform.access_seal_' || p_which, true), '') like ('%,' || p_rel::oid::text || ',%')
$function$;

CREATE OR REPLACE FUNCTION platform._access_seal_mark(p_rel regclass, p_which text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
begin
  if p_which not in ('owed', 'sealing') then
    raise exception 'platform._access_seal_mark: unknown list %, expected owed or sealing', p_which;
  end if;
  if platform._access_seal_marked(p_rel, p_which) then return; end if;
  perform set_config('platform.access_seal_' || p_which,
    coalesce(nullif(current_setting('platform.access_seal_' || p_which, true), ''), ',') || p_rel::oid::text || ',',
    true);
end;
$function$;

CREATE OR REPLACE FUNCTION iam.take_sign_in_freeze(p_rel regclass, p_for text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  -- ── LANE PROVISION-LOCK (2026-09-27) — SIGN-IN NEVER QUEUES BEHIND A POLICY STATEMENT ──────
  -- Supabase's supautils (session_preload_libraries) carries `policy_grants` and
  -- `drop_trigger_grants`, both keyed on the role `postgres`. For every CREATE / ALTER / DROP POLICY
  -- and every DROP TRIGGER run as postgres it resolves the 23 listed auth / storage / realtime
  -- tables with ACCESS EXCLUSIVE, and PostgreSQL holds them to COMMIT (fixed upstream in supautils
  -- 3.4.4, PR #228; production runs an older image). A plain statement WAITS for them with the
  -- session's lock_timeout, and while it waits every sign-in read queues behind it: on production
  -- on 2026-09-27 four table builds waited ~11 s each behind 97-second custom.context_tag_copy
  -- calls, with sign-in reads queued behind the wait.
  --
  -- This function is the one door in front of that hook. It takes the same locks the hook takes,
  -- by running the cheapest hooked statement (a DROP POLICY IF EXISTS that drops nothing) with a
  -- 1 ms lock wait, and retries with a short sleep until it gets a moment when nobody else holds
  -- them. So nobody ever waits more than 1 ms behind the attempt. After it returns the locks are
  -- held to COMMIT: the caller must issue its hooked statements next and commit promptly.
  -- If the hook does not lock (a newer supautils, or a role it is not keyed on) it returns
  -- taken = false and costs one statement. If there is no quiet moment within the knob
  -- infrastructure.provisioning/sign_in_freeze_grab_ms it REFUSES with 55P03 and a plain sentence
  -- naming the oldest transaction in the way. Nothing is changed by a refusal.
  v_users  oid := to_regclass('auth.users');
  v_budget integer := platform.sign_in_freeze_grab_ms();
  v_t0     timestamptz := clock_timestamp();
  v_tries  integer := 0;
  v_lt     text := current_setting('lock_timeout');
  v_cmm    text := current_setting('client_min_messages');
  v_set    oid[];
  v_holder text;
  v_taken  boolean;
begin
  if p_rel is null then
    raise exception 'iam.take_sign_in_freeze: no relation given (for %)', p_for;
  end if;
  if v_users is not null and exists (
       select 1 from pg_locks l
        where l.pid = pg_backend_pid() and l.locktype = 'relation' and l.relation = v_users
          and l.mode = 'AccessExclusiveLock' and l.granted) then
    return jsonb_build_object('taken', true, 'already_held', true, 'for', p_for);
  end if;
  loop
    v_tries := v_tries + 1;
    begin
      perform set_config('lock_timeout', '1ms', true);
      perform set_config('client_min_messages', 'warning', true);
      execute format('drop policy if exists _sign_in_freeze_probe on %s', p_rel);
      perform set_config('lock_timeout', v_lt, true);
      perform set_config('client_min_messages', v_cmm, true);
      exit;
    exception when lock_not_available then
      null;  -- the subtransaction's locks and set_config calls are undone with it
    end;
    if clock_timestamp() - v_t0 > make_interval(secs => v_budget / 1000.0) then
      select array_agg(to_regclass(t)::oid) into v_set
        from jsonb_array_elements_text(
               coalesce(nullif(current_setting('supautils.policy_grants', true), ''), '{}')::jsonb -> current_user::text) t
       where to_regclass(t) is not null;
      select format('pid %s (%s), transaction open %s s, running: %s', a.pid,
                    coalesce(nullif(a.application_name, ''), 'no application name'),
                    round(extract(epoch from clock_timestamp() - a.xact_start)::numeric, 1),
                    left(regexp_replace(coalesce(a.query, ''), '\s+', ' ', 'g'), 160))
        into v_holder
        from pg_locks l join pg_stat_activity a on a.pid = l.pid
       where l.locktype = 'relation' and l.granted and l.pid <> pg_backend_pid()
         and (l.relation = any (coalesce(v_set, '{}'::oid[])) or l.relation = p_rel::oid)
       order by a.xact_start nulls last
       limit 1;
      raise exception 'Nothing was changed: writing the access rules for % has to pause sign-in for a few milliseconds, and in % tries over % s there was never a moment when nobody else was using the sign-in tables. The longest one in the way is %. Try again in a minute.',
        p_rel, v_tries, round(v_budget / 1000.0, 1), coalesce(v_holder, 'not visible to this session')
        using errcode = '55P03',
              detail = format('For: %s. Supabase supautils (policy_grants / drop_trigger_grants keyed on role %s) takes ACCESS EXCLUSIVE on auth.users, auth.sessions, auth.refresh_tokens, storage.objects and 19 more for every policy statement and DROP TRIGGER, held to COMMIT. Each try here waited at most 1 ms, so nobody queued behind this attempt.', p_for, current_user),
              hint = 'Retry later (aidream retries on 55P03 by itself). If it keeps refusing, the transaction named above is holding the sign-in tables for a long time; that is the thing to fix. Budget: knob infrastructure.provisioning/sign_in_freeze_grab_ms.';
    end if;
    perform pg_sleep(0.01 + random() * 0.03);
  end loop;
  v_taken := v_users is not null and exists (
    select 1 from pg_locks l
     where l.pid = pg_backend_pid() and l.locktype = 'relation' and l.relation = v_users
       and l.mode = 'AccessExclusiveLock' and l.granted);
  return jsonb_build_object('taken', v_taken, 'tries', v_tries, 'for', p_for,
    'looked_ms', round(extract(epoch from clock_timestamp() - v_t0) * 1000),
    'opened_at', case when v_taken then clock_timestamp() end);
end;
$function$;

CREATE OR REPLACE FUNCTION platform._take_lock_nowait(p_rels regclass[], p_mode text, p_for text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  -- Lane PROVISION-LOCK (2026-09-27): take `p_mode` on every relation in p_rels without ever
  -- entering a lock queue (LOCK ... NOWAIT, retried with a short sleep), so nobody queues behind
  -- the attempt. Budget: the same knob as iam.take_sign_in_freeze. Refuses 55P03 in plain words.
  v_budget integer := platform.sign_in_freeze_grab_ms();
  v_t0     timestamptz := clock_timestamp();
  v_tries  integer := 0;
  v_list   text;
begin
  if p_mode not in ('ROW EXCLUSIVE', 'SHARE UPDATE EXCLUSIVE', 'SHARE', 'SHARE ROW EXCLUSIVE', 'EXCLUSIVE', 'ACCESS EXCLUSIVE') then
    raise exception 'platform._take_lock_nowait: unknown lock mode %', p_mode;
  end if;
  select string_agg('only ' || r::text, ', ') into v_list from unnest(p_rels) r where r is not null;
  if v_list is null then return jsonb_build_object('taken', false, 'for', p_for); end if;
  loop
    v_tries := v_tries + 1;
    begin
      execute format('lock table %s in %s mode nowait', v_list, p_mode);
      exit;
    exception when lock_not_available then
      null;
    end;
    if clock_timestamp() - v_t0 > make_interval(secs => v_budget / 1000.0) then
      raise exception 'Nothing was changed: % needs % on % for a moment, and in % tries over % s there was never a moment when nobody else was using them. Try again in a minute.',
        p_for, lower(p_mode), v_list, v_tries, round(v_budget / 1000.0, 1)
        using errcode = '55P03',
              detail = 'Each try used NOWAIT, so nobody queued behind this attempt.',
              hint = 'Retry later (aidream retries on 55P03 by itself). Budget: knob infrastructure.provisioning/sign_in_freeze_grab_ms.';
    end if;
    perform pg_sleep(0.01 + random() * 0.03);
  end loop;
  return jsonb_build_object('taken', true, 'tries', v_tries, 'for', p_for,
    'looked_ms', round(extract(epoch from clock_timestamp() - v_t0) * 1000));
end;
$function$;

CREATE OR REPLACE FUNCTION platform._admin_read_ensure(p_rel regclass)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  r record;
begin
  -- Lane PROVISION-LOCK (2026-09-27): the ONE writer of the unconditional platform_admin_read
  -- policy (OUR OWN ADMIN DATABASE ACCESS - NEVER REMOVE, NARROW OR SUPERSEDE). Extracted verbatim
  -- from platform._admin_read_follows_rls, which now calls this, so the event trigger and the
  -- provisioner's access seal write the same bytes. Takes the sign-in freeze first (a policy
  -- statement), so it never makes sign-in queue. Answers true when it wrote the policy.
  select c.oid, n.nspname, c.relname into r
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where c.oid = p_rel
     and c.relkind in ('r', 'p')
     and not c.relispartition
     and c.relrowsecurity
     and n.nspname not in ('graveyard','auth','storage','realtime','supabase_functions','vault','pgsodium',
                           'net','cron','extensions','supabase_migrations','_realtime','pg_catalog',
                           'information_schema')
     and n.nspname not like 'pg\_temp%' and n.nspname not like 'pg\_toast%'
     and not exists (
       select 1 from pg_policy p
        where p.polrelid = c.oid and p.polpermissive and p.polcmd in ('r', '*')
          and regexp_replace(coalesce(pg_get_expr(p.polqual, p.polrelid), ''), '[\s()]', '', 'g')
              in ('SELECTis_platform_adminASis_platform_admin','is_platform_admin','SELECTpublic.is_platform_adminASis_platform_admin'));
  if not found then return false; end if;
  perform iam.take_sign_in_freeze(p_rel, format('platform_admin_read on %I.%I', r.nspname, r.relname));
  if exists (select 1 from pg_policy where polrelid = r.oid and polname = 'platform_admin_read') then
    execute format('drop policy platform_admin_read on %I.%I', r.nspname, r.relname);
  end if;
  execute format(
    'create policy platform_admin_read on %I.%I for select to authenticated using ((select public.is_platform_admin()))',
    r.nspname, r.relname);
  execute format(
    'comment on policy platform_admin_read on %I.%I is %L', r.nspname, r.relname,
    'OUR OWN ADMIN DATABASE ACCESS - NEVER REMOVE, NARROW OR SUPERSEDE. Unconditional platform-admin read; works only inside the admin lane (admin apps), never on user pages. Law: common-docs/policies/our-own-admin-database-access.md');
  raise notice 'admin_read_follows_rls: %.% had no unconditional platform-admin read — created platform_admin_read', r.nspname, r.relname;
  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION iam._rls_emit_policies(p_drop text[], p_create text[])
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  s text;
  -- iam._rls_plan_is wrote '<table>|<n>|<anon>' just before this call; the table is read before
  -- the plan is cleared.
  v_rel regclass := to_regclass(nullif(split_part(coalesce(current_setting('iam.rls_plan', true), ''), '|', 1), ''));
begin
  -- The plan has served its purpose; clear it BEFORE the freeze so nothing runs between the
  -- statements below.
  perform set_config('iam.rls_plan', '', true);
  if v_rel is null and cardinality(p_drop) + cardinality(p_create) > 0 then
    v_rel := to_regclass(substring(coalesce(p_drop[1], p_create[1]) from ' on ([^ ]+)'));
  end if;
  -- LANE PROVISION-LOCK (2026-09-27). (1) A table the provisioner is building with its base
  -- contract deferred gets its policies in platform.provision_attach_base_contract, the next short
  -- transaction, so the build transaction never takes the supautils locks at all.
  if v_rel is not null and platform._access_seal_marked(v_rel, 'owed') then
    raise notice 'iam.apply_rls: the % policy statement(s) for % are written by platform.provision_attach_base_contract in its own short transaction (the access seal), so this build transaction never pauses sign-in', cardinality(p_drop) + cardinality(p_create), v_rel;
    return;
  end if;
  -- (2) Everyone else takes the sign-in freeze with 1 ms waits before the first statement, so
  -- sign-in never queues behind a policy statement (iam.take_sign_in_freeze says why).
  if v_rel is not null and cardinality(p_drop) + cardinality(p_create) > 0 then
    perform iam.take_sign_in_freeze(v_rel, 'iam.apply_rls ' || v_rel::text);
  end if;
  -- 🚨 THE FREEZE STARTS AT THE FIRST STATEMENT BELOW AND ENDS AT COMMIT. Nothing may be added
  -- between these two loops, and nothing may be added after this call in the caller.
  foreach s in array p_drop loop
    execute s;
  end loop;
  foreach s in array p_create loop
    execute s;
  end loop;
end
$function$;

CREATE OR REPLACE FUNCTION iam.drop_governance_guard(p_schema text, p_table text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
begin
  -- Lane PROVISION-LOCK (2026-09-27): DROP TRIGGER is hooked by supautils drop_trigger_grants
  -- (ACCESS EXCLUSIVE on auth.users and 22 more, to COMMIT), even when the trigger is absent. So
  -- it is issued only when there is a trigger to drop, and then behind the 1 ms-wait freeze door.
  if exists (select 1 from pg_trigger t
              where t.tgrelid = to_regclass(format('%I.%I', p_schema, p_table))
                and t.tgname = '_guard_governance' and not t.tgisinternal) then
    perform iam.take_sign_in_freeze(format('%I.%I', p_schema, p_table)::regclass,
                                    format('iam.drop_governance_guard %I.%I', p_schema, p_table));
    execute format('drop trigger if exists _guard_governance on %I.%I', p_schema, p_table);
  end if;
end
$function$;

CREATE OR REPLACE FUNCTION iam.apply_governance_guard(p_schema text, p_table text, p_token text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  v_tbl text := format('%I.%I', p_schema, p_table);
begin
  -- Lane PROVISION-LOCK (2026-09-27): ONE `create or replace trigger` instead of drop + create.
  -- DROP TRIGGER is hooked by Supabase supautils (drop_trigger_grants): as postgres it takes ACCESS
  -- EXCLUSIVE on auth.users and 22 more sign-in / storage / realtime tables until COMMIT, even when
  -- the trigger does not exist yet, and it was the statement four production table builds timed
  -- out on (2026-09-27). CREATE OR REPLACE TRIGGER is not hooked (measured: 0 locks outside its
  -- table) and takes SHARE ROW EXCLUSIVE on its own table instead of ACCESS EXCLUSIVE.
  execute format(
    'create or replace trigger _guard_governance before update on %s for each row execute function iam._guard_governance_columns(%L)',
    v_tbl, p_token);
end
$function$;

CREATE OR REPLACE FUNCTION platform._admin_read_follows_rls()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  r record;
begin
  -- STRICT (2026-09-25): only an UNCONDITIONAL admin read counts. A visibility-narrowed admin arm
  -- ("visibility >= internal AND is_platform_admin()") hid personal rows from the admin system on 246
  -- tables and fooled the old check. Admin powers only work inside the admin lane, so the full read is
  -- safe on user pages.
  -- Lane PROVISION-LOCK (2026-09-27): the policy is written by platform._admin_read_ensure (the
  -- same bytes this loop used to execute inline), which takes the sign-in freeze with 1 ms waits
  -- first, OUTSIDE the exception block below so a refusal is a refusal and never a silent blind
  -- table. A relation the provisioner is still sealing (platform._access_seal_marked owed/sealing)
  -- is left alone here: its admin read is written right after the generator's policy burst.
  for r in
    select distinct c.oid, n.nspname, c.relname
      from pg_event_trigger_ddl_commands() cmd
      join pg_class c on c.oid = cmd.objid
      join pg_namespace n on n.oid = c.relnamespace
     where cmd.classid = 'pg_class'::regclass
       and c.relkind in ('r', 'p')
       and not c.relispartition
       and c.relrowsecurity
       and n.nspname not in ('graveyard','auth','storage','realtime','supabase_functions','vault','pgsodium',
                             'net','cron','extensions','supabase_migrations','_realtime','pg_catalog',
                             'information_schema')
       and n.nspname not like 'pg\_temp%' and n.nspname not like 'pg\_toast%'
       and not platform._access_seal_marked(c.oid::regclass, 'owed')
       and not platform._access_seal_marked(c.oid::regclass, 'sealing')
       and not exists (
         select 1 from pg_policy p
          where p.polrelid = c.oid and p.polpermissive and p.polcmd in ('r', '*')
            and regexp_replace(coalesce(pg_get_expr(p.polqual, p.polrelid), ''), '[\s()]', '', 'g')
                in ('SELECTis_platform_adminASis_platform_admin','is_platform_admin','SELECTpublic.is_platform_adminASis_platform_admin'))
  loop
    perform iam.take_sign_in_freeze(r.oid::regclass, format('platform_admin_read on %I.%I', r.nspname, r.relname));
    begin
      perform platform._admin_read_ensure(r.oid::regclass);
    exception when others then
      raise warning 'admin_read_follows_rls: could not create platform_admin_read on %.% (%: %) — the admin system is BLIND on it. Law: common-docs/policies/our-own-admin-database-access.md', r.nspname, r.relname, sqlstate, sqlerrm;
    end;
  end loop;

  -- ADMIN DOOR GRANT (2026-09-25): the admin system's server door reads as service_role.
  for r in
    select distinct c.oid, n.nspname, c.relname
      from pg_event_trigger_ddl_commands() cmd
      join pg_class c on c.oid = cmd.objid
      join pg_namespace n on n.oid = c.relnamespace
     where cmd.classid = 'pg_class'::regclass
       and c.relkind in ('r','p','v','m')
       and not c.relispartition
       and n.nspname not in ('graveyard','auth','storage','realtime','supabase_functions','vault','pgsodium',
                             'net','cron','extensions','supabase_migrations','_realtime','pg_catalog',
                             'information_schema','partman')
       and n.nspname not like 'pg\_temp%' and n.nspname not like 'pg\_toast%'
       and not has_table_privilege('service_role', c.oid, 'SELECT')
  loop
    begin
      execute format('grant select on %I.%I to service_role', r.nspname, r.relname);
    exception when others then
      raise warning 'admin_read_follows_rls: could not grant SELECT to service_role on %.% (%: %) - the admin door is BLIND on it.', r.nspname, r.relname, sqlstate, sqlerrm;
    end;
  end loop;
end
$function$;

CREATE OR REPLACE FUNCTION platform.provision_certify_judged(p_schema text, p_table text, p_token text, p_defer_base boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_certify jsonb := '[]'::jsonb;
  v_refuse  jsonb := '[]'::jsonb;
  r         record;
begin
  -- THE ONE CERTIFICATION JUDGEMENT OF THE PROVISIONER (lane PROVISION-BATCH-FIX, 2026-09-26).
  -- platform.provision (one table) and platform.provision_batch (its members, again, after the
  -- batch's deferred constraints) both call this and nothing else, so the two paths cannot
  -- disagree about what refuses. The batch used to carry its own copy of the loop without the
  -- deferred base-contract rule, and refused every batch.
  --
  -- canonical_certify reports every WARN and FAIL under category `conformance`; the CHECK NAME is
  -- the prefix of `detail`. Refuse on every FAIL and every WARN except the three legacy-column
  -- WARNs (§3.1); INFO (the snapshot row) is ignored.
  --
  -- THE THREE BASE-CONTRACT CHECKS ARE OWED, NOT FAILED (2026-09-21), when p_defer_base: the
  -- foreign keys are added by platform.provision_attach_base_contract in the NEXT transaction, on
  -- purpose, so verify_canonical is RIGHT that they are absent and wrong to call it a defect here.
  -- They are recorded ONCE, as `PENDING`, the debt register carries the relation, and
  -- platform.provision_validate_base_contract re-runs the full certification once they are
  -- validated — the moment the table is actually certified. Deferral does not excuse the check;
  -- it moves it to where the answer is true.
  --
  -- Answers {certify: [{category, status, detail}], refuse: ["<category> [<status>]: <detail>"]}.
  for r in select * from iam.canonical_certify(p_schema, p_table, p_token) loop
    -- LANE PROVISION-LOCK (2026-09-27): THE POLICY CHECKS ARE OWED, NOT FAILED, while the table's
    -- policies are deferred to the access seal (platform.provision_attach_base_contract), exactly
    -- like the three base-contract checks: recorded once as PENDING, re-judged in full by
    -- platform.provision_validate_base_contract once the policies exist.
    if r.status in ('FAIL', 'WARN')
       and platform._access_seal_marked(to_regclass(format('%I.%I', p_schema, p_table)), 'owed')
       and split_part(coalesce(r.detail, ''), ':', 1) = any (array['policies_canonical', 'platform_admin_read_present', 'bespoke_policy_present', 'privacy_wall', 'personal_row_wall', 'component_not_wider_than_parent', 'containment_respects_personal', 'client_read_only_policies', 'component_public_read', 'policy_owner_shortcircuit', 'policy_uses_has_access', 'pub_read_anon', 'policy_system_public_read', 'policy_personal_owner_only', 'policy_follows_parent']) then
      v_certify := v_certify || jsonb_build_array(jsonb_build_object('category', r.category, 'status', 'PENDING',
        'detail', coalesce(r.detail,'') || ' — the policies are written by platform.provision_attach_base_contract (the access seal) in its own short transaction'));
      continue;
    end if;
    if p_defer_base
       and r.status = 'FAIL'
       and split_part(coalesce(r.detail, ''), ':', 1) in ('base_org_fk','base_created_by_fk','base_updated_by_fk') then
      v_certify := v_certify || jsonb_build_array(jsonb_build_object('category', r.category, 'status', 'PENDING',
        'detail', coalesce(r.detail,'') || ' — deferred to platform.provision_attach_base_contract, settled in its own short transaction'));
      continue;
    end if;
    v_certify := v_certify || jsonb_build_array(jsonb_build_object('category', r.category, 'status', r.status, 'detail', r.detail));
    if r.status = 'FAIL'
       or (r.status = 'WARN'
           and split_part(coalesce(r.detail, ''), ':', 1) not in ('legacy_owner_col','legacy_is_public','legacy_is_deleted')) then
      v_refuse := v_refuse || to_jsonb(format('%s [%s]: %s', r.category, r.status, coalesce(r.detail,'')));
    end if;
  end loop;
  return jsonb_build_object('certify', v_certify, 'refuse', v_refuse);
end;
$function$;

CREATE OR REPLACE FUNCTION platform.provision_attach_base_contract(p_relation text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  -- TEXT, not regclass, on purpose: every caller is a driver sending a bare string
  -- (the service's call_function, psql, an MCP tool), and an untyped literal cannot
  -- resolve a regclass overload. The cast happens HERE, where a name that resolves to
  -- nothing raises `relation ... does not exist` in Postgres's own words.
  v_oid     regclass := p_relation::regclass;
  v_budget  integer := platform.provisioning_lock_budget_ms();
  v_open_ms numeric;
  v_pending record;
  v_rel     text := v_oid::text;
  v_table   text;
  v_added   jsonb := '[]'::jsonb;
  v_col     text;
  v_parent  text;
  v_name    text;
  v_seal    jsonb;
  v_variant text;
begin
  select p.* into v_pending
    from platform.provision_base_contract_pending p
   where p.relation = v_rel;
  if not found then
    raise exception 'platform.provision_attach_base_contract: % has no deferred base contract', v_rel
      using errcode = 'check_violation',
            hint = 'This function settles a debt the builder wrote down; it is not a way to add foreign keys to an arbitrary relation. If the table really was built with a deferred base contract, its row in platform.provision_base_contract_pending is missing and that is the defect to chase.';
  end if;

  select ceil(extract(epoch from (clock_timestamp() - a.xact_start)) * 1000) into v_open_ms
    from pg_catalog.pg_stat_activity a where a.pid = pg_catalog.pg_backend_pid();
  if v_open_ms > v_budget then
    raise exception 'platform.provision_attach_base_contract: this transaction has been open % ms, over the % ms budget', v_open_ms::bigint, v_budget
      using errcode = '55P03',
            detail = 'Adding the base-contract foreign keys takes SHARE ROW EXCLUSIVE on auth.users and iam.organizations and holds it until COMMIT. In a long transaction that is the 2026-09-21 outage exactly: 22 sessions, sign-in included, queued behind one build.',
            hint = 'Call this in its OWN transaction, immediately after the build transaction has committed: begin; select platform.provision_attach_base_contract(''<relation>''); commit;';
  end if;

  perform pg_catalog.set_config('lock_timeout', v_budget::text || 'ms', true);

  -- ---- LANE PROVISION-LOCK (2026-09-27): THE ACCESS SEAL -------------------------------------
  -- A table built with its base contract deferred gets its row-level policies HERE, not in the
  -- build (see platform.provision). Order is the point:
  --   1. iam.organizations SHARE ROW EXCLUSIVE, NOWAIT-retried: the FK below needs it, and taking
  --      it now means nothing waits for it later while sign-in is paused;
  --   2. iam.apply_rls — every non-policy statement first, then the policy burst, which takes the
  --      sign-in freeze with 1 ms waits (iam.take_sign_in_freeze), so sign-in never queues;
  --   3. platform_admin_read right after the burst (platform._admin_read_ensure);
  --   4. the FKs (auth.users is already held by the freeze), then COMMIT.
  -- So sign-in is paused only for the burst, the three FKs and the commit.
  if coalesce(v_pending.detail->>'access_seal', '') = 'pending' then
    perform platform._take_lock_nowait(array['iam.organizations'::regclass], 'SHARE ROW EXCLUSIVE',
                                       'the base contract of ' || v_rel);
    select e.rls_variant into v_variant from platform.entity_types e where e.token = v_pending.token;
    perform platform._access_seal_mark(v_oid, 'sealing');
    perform iam.apply_rls(v_pending.detail->>'schema', v_pending.detail->>'table', v_pending.token,
                          coalesce(v_variant, 'entity'));
    perform platform._admin_read_ensure(v_oid);
    v_seal := jsonb_build_object('status', 'sealed', 'variant', coalesce(v_variant, 'entity'),
      'policies', (select coalesce(jsonb_agg(p.polname order by p.polname), '[]'::jsonb) from pg_catalog.pg_policy p where p.polrelid = v_oid),
      'sign_in_paused_from', clock_timestamp());
  end if;
  -- The FKs' own locks, NOWAIT-retried (instant when the seal already holds them), so a writer
  -- signing in never queues behind this transaction either.
  perform platform._take_lock_nowait(array['iam.organizations'::regclass, 'auth.users'::regclass],
                                     'SHARE ROW EXCLUSIVE', 'the base contract of ' || v_rel);
  v_table := v_oid::text;
  v_table := split_part(v_table, '.', 2);
  if v_table = '' then v_table := v_rel; end if;

  foreach v_col in array array['organization_id', 'created_by', 'updated_by'] loop
    v_parent := case when v_col = 'organization_id' then 'iam.organizations' else 'auth.users' end;
    continue when not exists (
      select 1 from pg_catalog.pg_attribute a
       where a.attrelid = v_oid and a.attname = v_col and not a.attisdropped and a.attnum > 0);
    continue when exists (
      select 1 from pg_catalog.pg_constraint c
       join pg_catalog.pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
       where c.conrelid = v_oid and c.contype = 'f' and a.attname = v_col
         and c.confrelid = v_parent::regclass);
    v_name := left(format('%s_%s_fkey', v_table, v_col), 63);
    execute format('alter table %s add constraint %I foreign key (%I) references %s(id) not valid',
                   v_rel, v_name, v_col, v_parent);
    v_added := v_added || to_jsonb(format('%s.%s -> %s (not valid)', v_rel, v_col, v_parent));
  end loop;

  update platform.provision_base_contract_pending
     set attached_at = now(),
         detail = detail || jsonb_build_object('added', v_added, 'attached_in_ms', v_open_ms)
                         || case when v_seal is not null then jsonb_build_object('access_seal', 'sealed', 'sealed_at', now()) else '{}'::jsonb end
   where relation = v_rel;

  return jsonb_build_object(
    'ok', true, 'relation', v_rel, 'added', v_added,
    'access_seal', coalesce(v_seal, jsonb_build_object('status', 'not_owed')),
    'transaction_open_ms', v_open_ms,
    'next', format('select platform.provision_validate_base_contract(%L); -- in its own transaction; VALIDATE takes only SHARE UPDATE EXCLUSIVE', v_rel));
end;
$function$;

CREATE OR REPLACE FUNCTION platform.provision(p_spec jsonb, p_applied_via text DEFAULT 'supabase_mcp'::text, p_org_id uuid DEFAULT NULL::uuid, p_lane text DEFAULT 'full'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_pre      jsonb;
  v_heal     jsonb;   -- PROVISIONER-SELF-HEAL
  v_res      jsonb;
  n          jsonb;
  v_cur      record;
  v_hash     text;
  v_schema   text;
  v_table    text;
  v_token    text;
  v_variant  text;
  v_rel      text;
  v_cols     text;
  v_item     jsonb;
  v_txt      text;
  v_target   text;
  v_frag     text;
  v_soft     boolean;
  v_vis      text;
  v_cat      boolean;
  v_class    text;
  v_created  jsonb[] := '{}'::jsonb[];
  v_certify  jsonb[] := '{}'::jsonb[];
  v_refuse   text[]  := '{}'::text[];
  v_grants   text[]  := '{}'::text[];
  v_g_auth   text[]  := '{}'::text[];
  v_g_anon   text[]  := '{}'::text[];
  v_g_close  text[]  := '{}'::text[];
  v_edges    jsonb   := '[]'::jsonb;
  v_argf     jsonb[] := '{}'::jsonb[];
  v_refs     text[]  := '{}'::text[];
  v_idx      jsonb   := '[]'::jsonb;
  v_actor    uuid;
  v_role     text;
  v_part     jsonb;
  v_pkey     text;
  v_pcount   integer;
  v_ix       integer;
  v_client_exposed boolean;
  v_exposure_viol  text;
  r          record;
  v_dfk      jsonb[] := '{}'::jsonb[];
  v_lead     text[]  := '{}'::text[];
  v_od       text;
  v_defer_base boolean;   -- 2026-09-21: the base-contract FKs leave this transaction
  v_judged   jsonb;     -- PROVISION-BATCH-FIX: platform.provision_certify_judged
begin
  -- ---- a batch: several tables in ONE call (next-build item 2) -----------
  -- `tables[]` is the whole declaration. platform.provision_batch orders the members,
  -- creates the batch's types, calls THIS function once per table with the batch's
  -- tokens visible, then adds the foreign keys that could not exist yet (forward and
  -- self references) and the edges between batch tables. One transaction; a refusal
  -- anywhere leaves nothing.
  if jsonb_typeof(p_spec->'tables') = 'array' then
    return platform.provision_batch(p_spec, p_applied_via, p_org_id, p_lane);
  end if;

  -- ---- ONE PROVISIONING RUN AT A TIME, AND IT YIELDS (2026-09-21) --------
  -- pg_try_advisory_xact_lock, never the blocking form: a builder that waits on another
  -- builder waits while holding its own locks, which is how one slow build became a
  -- 22-session queue with sign-in in it. A second run is refused with 55P03, which lane
  -- B's service already retries. Re-entrant: provision_batch calls this function once per
  -- member inside the same transaction and re-taking the lock succeeds.
  perform platform.provision_run_claim('provision');

  -- ---- preflight -------------------------------------------------------
  v_pre := platform.provision_preflight();
  if not (v_pre->>'ok')::boolean then
    -- A STALE KERNEL FINGERPRINT IS REFUSED WITH A LOGGED ROW (lane KERNEL-TAILS, 2026-09-25).
    -- A raise here rolls back everything the caller's transaction did, so a refusal left no
    -- trace: SHARE-LANE-2's file refused every spec for 26 minutes and rca2b's for 57, and
    -- nobody saw either until a lane ran check:store-doors-decide. Nothing has been written yet
    -- at this point (the run claim is an advisory lock), so this branch writes ONE
    -- ops.system_error row (kind provisioner_fingerprint_stale, naming the moved body and the
    -- remedy), warns, and RETURNS the refusal — ok false, refused true — instead of raising.
    --
    -- 🚨 AND A STALE FINGERPRINT HEALS ITSELF WHEN THE KERNEL STILL ANSWERS THE SAME (lane
    -- PROVISIONER-SELF-HEAL, 2026-09-25, chair's ruling). The fingerprint exists so no table is
    -- provisioned against an UNKNOWN kernel; it was never meant to stop table creation because a
    -- file forgot a bookkeeping line (83 minutes on production on 2026-09-25, twice, once from
    -- outside the program). When stale-kernel is the ONLY finding, the kernel's own equivalence
    -- self-check runs here, in this call, on its fixed fixture (platform.kernel_equivalence_check,
    -- about a second): identical -> the fingerprint is re-recorded with a
    -- platform.kernel_fingerprint_record row and ONE ops.system_error row of kind
    -- kernel_fingerprint_auto_rerecorded, and provisioning continues; not identical -> the logged
    -- refusal below, with the evidence in the row.
    if exists (select 1 from jsonb_array_elements(v_pre->'findings') x
                where x->>'rule_id' = 'preflight.read_kernel') then
      if jsonb_array_length(v_pre->'findings') = 1 then
        v_heal := platform._provisioner_heals_a_stale_kernel(p_spec, v_pre, p_applied_via, p_org_id, p_lane);
        if coalesce((v_heal->>'healed')::boolean, false) then
          v_pre := platform.provision_preflight();
        else
          v_pre := v_pre || jsonb_build_object('equivalence', v_heal->'equivalence');
        end if;
      end if;
      if exists (select 1 from jsonb_array_elements(v_pre->'findings') x
                  where x->>'rule_id' = 'preflight.read_kernel') then
        return platform._provisioner_refuses_a_stale_kernel(p_spec, v_pre, p_applied_via, p_org_id, p_lane);
      end if;
    end if;
    if not (v_pre->>'ok')::boolean then
    raise exception 'provision: PREFLIGHT REFUSED (% problem(s)). Nothing was written.%',
      jsonb_array_length(v_pre->'findings'),
      (select string_agg(E'\n\n' || (x->>'message'), '') from jsonb_array_elements(v_pre->'findings') x)
      using errcode = 'check_violation',
            hint = 'The enforcement chain this path rests on is not intact. Fix the named condition and call platform.provision again; nothing was written, so there is nothing to undo.';
    end if;
  end if;

  -- ---- validate, inside THIS transaction (PLAN §3.2 — no plan fingerprint) ----
  v_res   := platform.provision_validate(p_spec, p_lane, p_org_id);
  n       := v_res->'normalized_spec';
  v_hash  := v_res->>'spec_hash';
  v_token := p_spec->>'token';

  -- ---- unchanged / changed --------------------------------------------
  if v_token is not null then
    -- 🚨 THE DECLARATION IS HISTORY; THE CATALOGUE IS STATE. `platform.provision_spec` is
    -- append-only by design — a trigger refuses a DELETE with "the applied declaration IS the
    -- record" — so a token whose relation has since been torn down STILL has a current row in
    -- this view. Without the existence test below, provision() answered `unchanged` for a
    -- table that does not exist, or refused it as "a DIFFERENT declaration", and that token
    -- could never be rebuilt. It made rule 27's down-then-up loop impossible for every
    -- provisioned table, which is how it was found. When the relation is gone the stored
    -- declaration is a record of what once stood there; provision() creates, so it proceeds
    -- and appends a new row beside the old one.
    select * into v_cur from platform.v_provision_spec_current c
     where c.token = v_token
       and to_regclass(format('%I.%I', c.spec->>'schema', c.spec->>'table')) is not null;
    if found then
      -- Lane B may only see its OWN declarations. Another organization's token answers
      -- exactly like any taken token, so neither existence nor the hash leaks.
      if p_lane = 'restricted' and v_cur.owner_org_id is distinct from p_org_id then
        raise exception '%', (platform.provision_finding('identity.token.taken', 'token', null, v_token))->>'message'
          using errcode = 'check_violation';
      end if;
      if v_cur.spec_hash = v_hash then
        return platform._provision_says_the_kernel_was_rerecorded(jsonb_build_object('ok', true, 'unchanged', true, 'token', v_token,
                 'spec_hash', v_hash, 'plan', '[]'::jsonb, 'created', '[]'::jsonb,
                 'certify', '[]'::jsonb,
                 'detail', format('%s already carries this exact declaration (applied %s). Nothing was written.',
                                  v_token, v_cur.applied_at)));
      end if;
      raise exception 'provision: % already carries a DIFFERENT declaration. provision() creates, it never alters. Changed: %',
        v_token,
        coalesce((select string_agg(k, ', ' order by k)
                    from (select key k from jsonb_each(n)
                          union select key from jsonb_each(v_cur.spec)) x
                   where (n->x.k) is distinct from (v_cur.spec->x.k)), '(no key-level difference — only the hash)')
        using errcode = 'check_violation',
              hint = (select otherwise from platform.provision_rule_message where rule_id = 'evolve.changed_spec');
    end if;
  end if;

  -- ---- findings: ONE error, and nothing written ------------------------
  if not (v_res->>'ok')::boolean then
    raise exception 'provision: % finding(s); call platform.provision_validate(<spec>) for the list. Nothing was written.',
      jsonb_array_length(v_res->'findings')
      using errcode = 'check_violation',
            hint = format('The rules that refused: %s',
                     (select string_agg(x->>'rule_id', ', ') from jsonb_array_elements(v_res->'findings') x));
  end if;

  v_schema  := n->>'schema';
  v_table   := n->>'table';
  v_variant := n->>'rls_variant';
  v_rel     := format('%I.%I', v_schema, v_table);
  v_soft    := (n->>'soft_delete')::boolean;
  v_vis     := n->'access'->>'visibility';
  v_cat     := (n->>'category')::boolean;
  v_class   := n->'access'->>'data_class';

  -- 🚨 THE SCHEMA'S DECLARED EXPOSURE, READ ONCE, HONOURED BY EVERY GRANT BELOW.
  -- `platform.schema_client_exposure` is the declaration; a schema with no row keeps the
  -- platform's historical answer (exposed), so an existing spec's result is unchanged.
  v_client_exposed := platform.schema_is_client_exposed(v_schema);

  perform set_config('matrx.provisioner', '1', true);
  perform platform.provision_marker_set(true);   -- wave 3: the proof the guards actually read

  -- ---- types[] ---------------------------------------------------------
  for v_item in select value from jsonb_array_elements(n->'types') loop
    if to_regtype(format('%I.%I', v_schema, v_item->>'name')) is not null
       and (platform.provision_batch_context()->'types' ? format('%s.%s', v_schema, v_item->>'name')) then
      continue;   -- created by platform.provision_batch before this member ran
    end if;
    execute format('create type %I.%I as enum (%s)', v_schema, v_item->>'name',
             (select string_agg(quote_literal(l), ', ')
                from jsonb_array_elements_text(v_item->'labels') l));
    v_created := v_created || jsonb_build_object('type', format('%s.%s', v_schema, v_item->>'name'));
  end loop;

  -- ---- the table -------------------------------------------------------
  -- PARTITIONED OR NOT, THIS IS THE SAME BUILDER. When the spec declares no partition the
  -- emitted DDL is byte-for-byte what it has always been; `v_part` is null, `v_pkey` is
  -- null, and every branch below collapses to the empty string.
  v_part := case when jsonb_typeof(n->'partition') = 'object' then n->'partition' else null end;
  if v_part is null then
    v_cols := 'id uuid primary key default gen_random_uuid()';
  else
    -- PostgreSQL refuses a unique constraint on a partitioned table that does not contain
    -- the partition key, so `id` stops being the whole key and becomes its tail.
    v_pcount := (v_part->>'count')::integer;
    v_pkey   := (select string_agg(format('%I', c), ', ')
                   from jsonb_array_elements_text(v_part->'key') c);
    v_cols   := 'id uuid not null default gen_random_uuid()';
  end if;
  for v_item in select value from jsonb_array_elements(n->'fields') loop
    v_frag := format('%I %s', v_item->>'name', to_regtype(v_item->>'type')::text);
    if v_item ? 'generated' then
      v_frag := v_frag || format(' generated always as (%s) stored', v_item->'generated'->>'expression');
    else
      if coalesce((v_item->>'not_null')::boolean, false) then v_frag := v_frag || ' not null'; end if;
      if v_item ? 'default' and jsonb_typeof(v_item->'default') <> 'null' then
        v_frag := v_frag || format(' default %s', v_item->'default' #>> '{}');
      end if;
    end if;
    if v_item ? 'references' then
      v_target := v_item->'references'->>'target';
      v_od := case lower(v_item->'references'->>'on_delete')
                when 'cascade' then 'cascade' when 'restrict' then 'restrict'
                when 'set_null' then 'set null' else 'no action' end;
      v_target := coalesce(
        (select format('%I.%I', e.schema_name, e.table_name) from platform.entity_types e where e.token = v_target),
        platform.provision_batch_token_rel(v_target),
        case when v_target = v_token then v_rel end,
        to_regclass(v_target)::text);
      if to_regclass(v_target) is not null then
        v_frag := v_frag || format(' references %s(id) on delete %s', v_target, v_od);
      else
        -- G3/G13: the table itself (a tree), or a batch member not built yet. The
        -- constraint is added the moment its target exists; the column is born now.
        v_dfk := v_dfk || jsonb_build_object('column', v_item->>'name', 'target', v_target, 'on_delete', v_od);
      end if;
    end if;
    if v_item ? 'check' then
      v_frag := v_frag || format(' check (%s)', v_item->>'check');
    end if;
    v_cols := v_cols || ', ' || v_frag;
  end loop;

  -- 🚨 THE FRONT DOOR IS NOT HELD WHILE THE TABLE IS BUILT (incident 2026-09-21).
  -- `references auth.users` inside CREATE TABLE takes SHARE ROW EXCLUSIVE on auth.users and
  -- holds it to COMMIT — measured at 298,560 ms with 22 sessions queued behind it, GoTrue's
  -- sign-in read among them. In deferred mode the columns are born bare and the three
  -- foreign keys are added afterwards, each in its own short transaction, by
  -- platform.provision_attach_base_contract / _validate_base_contract. The debt is written
  -- down below and the result document carries the remedy: nothing about the gap is silent.
  v_defer_base := platform.provision_defer_base_fks();
  if v_defer_base then
    v_cols := v_cols || ', organization_id uuid not null';
    v_cols := v_cols || ', created_by uuid';
    v_cols := v_cols || ', updated_by uuid';
  else
    v_cols := v_cols || ', organization_id uuid not null references iam.organizations(id)';
    v_cols := v_cols || ', created_by uuid references auth.users(id)';
    v_cols := v_cols || ', updated_by uuid references auth.users(id)';
  end if;
  v_cols := v_cols || ', created_at timestamptz not null default now()';
  v_cols := v_cols || ', updated_at timestamptz not null default now()';
  if v_soft then v_cols := v_cols || ', deleted_at timestamptz'; end if;
  v_cols := v_cols || ', version integer not null default 1';
  v_cols := v_cols || ', metadata jsonb not null default ''{}''::jsonb';
  -- REC-40 / REC-60: the one field-value column, emitted by the builder, immediately after
  -- `metadata` so the platform-wide column is never confused with a table's own domain
  -- columns. The spec key already existed and the platform's answer is still `false`; what
  -- changes is that answering `true` now EMITS something instead of being recorded and
  -- ignored.
  if coalesce((n->>'custom_fields')::boolean, false) then
    v_cols := v_cols || ', custom_fields jsonb not null default ''{}''::jsonb';
  end if;
  if v_vis is not null then
    v_cols := v_cols || format(', visibility platform.visibility not null default %L::platform.visibility', v_vis);
  end if;
  if v_cat then v_cols := v_cols || ', category_id uuid references platform.categories(id)'; end if;
  for v_item in select value from jsonb_array_elements(n->'checks') loop
    v_cols := v_cols || format(', constraint %I check (%s)', v_item->>'name', v_item->>'expression');
  end loop;

  if v_part is not null then
    v_cols := v_cols || format(', constraint %I primary key (%s, id)',
                left(format('%s_pkey', v_table), 63), v_pkey);
  end if;

  execute format('create table %s (%s)%s', v_rel, v_cols,
    case when v_part is null then '' else format(' partition by hash (%s)', v_pkey) end);
  v_created := v_created || jsonb_build_object('table', format('%s.%s', v_schema, v_table));

  -- 🚨 THE REVOKE IS NOT BELT-AND-BRACES. 20 schemas carry ALTER DEFAULT PRIVILEGES
  -- rows that grant every NEW relation automatically — crm gives authenticated=arwd
  -- and service_role=arwd AT `CREATE TABLE`. iam.apply_table_grants (inside apply_rls)
  -- then grants what the variant actually earns.
  execute format('revoke all on table %s from public, anon, authenticated, service_role', v_rel);

  -- ---- the children, in THIS transaction --------------------------------
  -- They are created here, before the indexes and the triggers, so that every partitioned
  -- index and every row trigger the builder attaches to the parent propagates to all of
  -- them at birth rather than being a thing somebody has to remember for child seventeen.
  -- The guard exempts a partition child of a registered parent, and inside provision() the
  -- marker exempts both — Doctrine: partitions are their parent.
  if v_part is not null then
    for v_ix in 0 .. v_pcount - 1 loop
      execute format('create table %I.%I partition of %s for values with (modulus %s, remainder %s)',
                     v_schema, format('%s_p%s', v_table, lpad(v_ix::text, 2, '0')), v_rel, v_pcount, v_ix);
      execute format('revoke all on table %I.%I from public, anon, authenticated, service_role',
                     v_schema, format('%s_p%s', v_table, lpad(v_ix::text, 2, '0')));
    end loop;
    v_created := v_created || jsonb_build_object('partitions',
      format('%s hash partition(s) of %s on (%s), %s.%s_p00 … %s.%s_p%s',
             v_pcount, v_rel, v_pkey, v_schema, v_table, v_schema, v_table,
             lpad((v_pcount - 1)::text, 2, '0')));
  end if;

  -- ---- the foreign keys that could not be inline ------------------------
  -- A self reference can be added now (the table exists). A reference to a batch member
  -- that is not built yet is handed to platform.provision_batch, which adds it once every
  -- member exists. The covering index is created in the index block below either way.
  foreach v_item in array v_dfk loop
    if to_regclass(v_item->>'target') is not null then
      execute format('alter table %s add constraint %I foreign key (%I) references %s(id) on delete %s',
                     v_rel, left(format('%s_%s_fkey', v_table, v_item->>'column'), 63),
                     v_item->>'column', v_item->>'target', v_item->>'on_delete');
      v_created := v_created || jsonb_build_object('foreign_key',
        format('%s.%s -> %s (self reference)', v_rel, v_item->>'column', v_item->>'target'));
    elsif platform.provision_batch_context() ? 'batch_id' then
      perform platform.provision_batch_defer('fks', v_item || jsonb_build_object('relation', v_rel, 'table', v_table));
      v_created := v_created || jsonb_build_object('foreign_key_deferred',
        format('%s.%s -> %s (added by the batch once %s exists)', v_rel, v_item->>'column', v_item->>'target', v_item->>'target'));
    else
      raise exception 'provision: %.% references %, which does not exist and is not declared in this call', v_rel, v_item->>'column', v_item->>'target'
        using errcode = 'check_violation';
    end if;
  end loop;

  -- ---- comments (the cheapest machine-readable intent we have) ----------
  execute format('comment on table %s is %L', v_rel, n->>'description');
  for v_item in select value from jsonb_array_elements(n->'fields') loop
    if v_item ? 'description' then
      execute format('comment on column %s.%I is %L', v_rel, v_item->>'name', v_item->>'description');
    end if;
  end loop;

  -- ---- indexes ---------------------------------------------------------
  -- EVERY FK gets a covering index, base columns organization_id and created_by included
  -- (they are columns the BUILDER emits, so the rule lives here and not in the
  -- declaration). NEVER updated_by: P3-05 measured 0 of 4,917 statements filtering on it
  -- and the platform's own FK-index batch excludes it by rule (G6). A declared index that
  -- LEADS with an FK column is that column's covering index, so the automatic one is not
  -- emitted beside it — which is how a partial FK index is declared (G5).
  select coalesce(array_agg(x.value->'columns'->>0), '{}'::text[]) into v_lead
    from jsonb_array_elements(n->'indexes') x
   where jsonb_typeof(x.value->'columns') = 'array' and jsonb_array_length(x.value->'columns') > 0;
  v_lead := v_lead || coalesce(array(select x.value->>'name' from jsonb_array_elements(n->'fields') x
                                      where coalesce((x.value->>'unique')::boolean, false)), '{}'::text[]);
  foreach v_txt in array array['organization_id','created_by'] loop
    if not (v_txt = any (v_lead)) then
      execute format('create index on %s (%I)', v_rel, v_txt);
    end if;
  end loop;
  if v_cat and not ('category_id' = any (v_lead)) then execute format('create index on %s (category_id)', v_rel); end if;
  for v_item in select value from jsonb_array_elements(n->'fields') loop
    if v_item ? 'references' and coalesce((v_item->>'index')::boolean, true)
       and not ((v_item->>'name') = any (v_lead)) then
      execute format('create index on %s (%I)', v_rel, v_item->>'name');
    end if;
    if coalesce((v_item->>'unique')::boolean, false) then
      v_idx := v_idx || jsonb_build_array(jsonb_build_object(
        'columns', jsonb_build_array(v_item->>'name'), 'unique', true,
        'where', case when v_soft then 'deleted_at IS NULL' else null end));
    end if;
    if (n->>'gin_jsonb')::boolean and lower(coalesce(v_item->>'type','')) = 'jsonb' then
      execute format('create index on %s using gin (%I)', v_rel, v_item->>'name');
    end if;
  end loop;
  for v_item in select value from jsonb_array_elements(n->'indexes' || v_idx) loop
    execute format('create %s index on %s using %s (%s)%s',
      case when coalesce((v_item->>'unique')::boolean, false) then 'unique' else '' end,
      v_rel, coalesce(v_item->>'method','btree'),
      -- G4: `expression` is the parenthesised index expression, verbatim (lane A only —
      -- the validator refuses it on lane B by name); otherwise the quoted column list.
      coalesce(nullif(btrim(v_item->>'expression'), ''),
               (select string_agg(format('%I', c), ', ') from jsonb_array_elements_text(v_item->'columns') c)),
      case when v_item->>'where' is not null then format(' where %s', v_item->>'where') else '' end);
  end loop;

  -- ---- REGISTER (before the triggers: the admission trigger on this INSERT
  --      attaches _stamp_actor_tier itself — B-77) ------------------------
  insert into platform.entity_types(
    token, schema_name, table_name, label, origin, is_versioned, has_soft_delete,
    is_component, is_listed, default_visibility, rls_variant, table_ref, is_active,
    data_class, default_list_scope, suppress_platform_admin_lane, category,
    title_column, content_role, relation_kind, projects_token, audit_class, audit_class_reason,
    client_read_only, reference_pickable, agent_writable, agent_write_notes, confirmation_enabled,
    client_excluded_columns, component_anon_read_via_public_parent, taxonomy_node_id,
    base_tier, is_module, default_members_can_add, default_needs_approval, default_scopeable,
    default_auto_ingest, allow_preview, reference_candidate_predicates, governed_columns,
    retention_owner_column, user_artifact_kind, reference_category,
    lifecycle_enlisted, lifecycle_hot_days, version_store, data_class_reason,
    type, custom_fields_enabled)
  values (
    v_token, v_schema, v_table, n->>'label', n->>'origin',
    (n->>'versioned')::boolean, v_soft,
    (v_variant = 'component'), (n->>'is_listed')::boolean,
    nullif(v_vis,'')::platform.visibility, v_variant, v_rel::regclass, true,
    v_class::platform.data_class,
    (n->'access'->>'default_list_scope')::platform.list_scope,
    -- §3.1 derivation two: a private or confidential token closes the platform-admin
    -- lane. A detail's class is its parent's and is resolved below, once parents exist.
    coalesce(v_variant = 'restricted' or v_class in ('private', 'confidential'), false),
    n->>'category_label',
    n->>'title_column', n->>'content_role', n->>'relation_kind', n->>'projects_token',
    n->>'audit_class', n->>'audit_class_reason',
    (n->>'client_read_only')::boolean, (n->>'reference_pickable')::boolean,
    (n->>'agent_writable')::boolean, n->>'agent_write_notes', (n->>'confirmation_enabled')::boolean,
    nullif(array(select jsonb_array_elements_text(n->'client_excluded_columns')), '{}'),
    coalesce((n->>'component_anon_read_via_public_parent')::boolean, false),
    (n->>'taxonomy_node_id')::uuid,
    (n->>'base_tier')::smallint, (n->>'is_module')::boolean,
    (n->>'default_members_can_add')::boolean, (n->>'default_needs_approval')::boolean,
    (n->>'default_scopeable')::boolean, (n->>'default_auto_ingest')::boolean,
    (n->>'allow_preview')::boolean, n->'reference_candidate_predicates',
    case when jsonb_typeof(n->'governed_columns') = 'array'
         then array(select jsonb_array_elements_text(n->'governed_columns')) end,
    n->>'retention_owner_column', n->>'user_artifact_kind', n->>'reference_category',
    coalesce((n->'lifecycle'->>'enlisted')::boolean, false),
    (n->'lifecycle'->>'hot_days')::integer,
    n->>'version_store', n->'access'->>'data_class_reason',
    n->>'type', (n->>'type') in ('entity', 'detail'));
  v_created := v_created || jsonb_build_object('entity_type', v_token);

  -- ---- parents ---------------------------------------------------------
  for v_txt in select value #>> '{}' from jsonb_array_elements(n->'parents') loop
    insert into platform.entity_relationships(child_type, parent_type, fk_column, kind)
    values (v_token, btrim(split_part(v_txt, ':', 1)), btrim(split_part(v_txt, ':', 2)), 'composition');
  end loop;

  -- A detail (and a ledger) is judged on its RESOLVED class (DD-137b10): under a
  -- private or confidential parent the platform-staff lane is closed on it too.
  if v_variant in ('component', 'ledger')
     and (iam.class_lanes(v_token)).resolved_class::text in ('private', 'confidential') then
    update platform.entity_types set suppress_platform_admin_lane = true where token = v_token;
  end if;

  -- ---- triggers --------------------------------------------------------
  execute format('create trigger _stamp_actor before insert or update on %s for each row execute function platform._stamp_actor()', v_rel);
  -- B-77: the entity_types admission trigger may already have attached this one.
  -- The test is BY FUNCTION, never by name (DD-173).
  if not exists (select 1 from pg_trigger t
                  where t.tgrelid = v_rel::regclass and not t.tgisinternal
                    and t.tgfoid = 'platform._stamp_actor_tier()'::regprocedure) then
    execute format('create trigger _stamp_actor_tier before insert or update on %s for each row execute function platform._stamp_actor_tier()', v_rel);
  end if;
  execute format('create trigger _touch_row before insert or update on %s for each row execute function platform._touch_row()', v_rel);
  execute format('create trigger _metadata_guard before insert or update of metadata on %s for each row execute function platform._metadata_guard(%L)', v_rel, v_token);
  if (n->>'versioned')::boolean then
    execute format('create trigger _version_capture after insert or delete or update on %s for each row execute function platform._version_capture(%L)', v_rel, v_token);
  end if;

  -- The ONE shared tenancy trigger, per declared nullable FK into a tenant table.
  for v_item in select value from jsonb_array_elements(n->'fields') loop
    if coalesce((v_item->>'tenancy_check')::boolean, false) then
      v_target := v_item->'references'->>'target';
      v_target := coalesce(
        (select format('%I.%I', e.schema_name, e.table_name) from platform.entity_types e where e.token = v_target),
        platform.provision_batch_token_rel(v_target),
        case when v_target = v_token then v_rel end,
        to_regclass(v_target)::text);
      execute format(
        'create trigger %I before insert or update of %I on %s for each row execute function platform.assert_same_org(%L, %L)',
        left(format('_same_org_%s', v_item->>'name'), 63), v_item->>'name', v_rel,
        v_item->>'name', v_target);
    end if;
  end loop;

  perform platform.sync_association_gc_triggers(v_token);

  -- ---- the single write door, DECLARED BEFORE THE GRANTS ARE GENERATED ---
  -- 🚨 THE CLASS FIX, NOT THE INSTANCE. iam.apply_table_grants issues
  -- `grant select, insert, update, delete … to authenticated` for every non-ledger variant,
  -- so a REVOKE issued AFTER apply_rls lasts exactly until the next regeneration — the
  -- failure that function's own DD-248 comment describes in as many words. The register it
  -- already reads is where a one-write-door table says so, so the generator itself issues
  -- the narrow grant and every regeneration keeps it.
  if n->>'write_door' = 'single' then
    insert into platform.stamped_write_table(
      schema_name, table_name, stamp_column, rls_variant, declared_by, reason)
    values (v_schema, v_table, 'created_by', v_variant, format('platform.provision(%s)', v_token),
            format('write_door = single. `authenticated` holds no direct INSERT, UPDATE or DELETE on %s; the only write path is %s, declared in platform.client_callable_door in this same transaction. iam.apply_table_grants reads THIS register (DD-248), so the narrow grant is what the generator issues rather than something revoked behind its back — which would last only until the next regeneration.',
                   v_rel,
                   coalesce((select string_agg(format('%s.%s', v_schema, x.value->>'name'), ', ')
                               from jsonb_array_elements(n->'functions') x), '(none declared)')))
    on conflict (schema_name, table_name) do nothing;
    v_created := v_created || jsonb_build_object('write_door', format('single: %s', v_rel));
  end if;

  -- ---- RLS -------------------------------------------------------------
  -- LANE PROVISION-LOCK (2026-09-27). With the base contract deferred, this transaction writes
  -- every part of the access layer EXCEPT the policy statements: RLS on, the table grants, the
  -- governance guard and every refusal the generator can raise run here, and the policies are
  -- written by platform.provision_attach_base_contract in the next short transaction (the
  -- access seal). Policy statements are hooked by Supabase supautils (ACCESS EXCLUSIVE on
  -- auth.users and 22 more tables, held to COMMIT), so writing them here froze sign-in for the
  -- rest of the build or, under load, timed the build out (four production builds, 2026-09-27).
  -- Until the seal runs the table has RLS on and no policy: nobody but its owner reads a row.
  if v_defer_base then
    perform platform._access_seal_mark(v_rel::regclass, 'owed');
  end if;
  perform iam.apply_rls(v_schema, v_table, v_token, v_variant);

  -- A policy on the PARENT is not consulted when a partition is addressed DIRECTLY, and
  -- ENABLE ROW LEVEL SECURITY does not cascade. "Unreachable" must never depend on which
  -- relation name a caller happens to type, so every child carries RLS enabled with no
  -- policy of its own, which denies every non-owner outright.
  if v_part is not null then
    for v_ix in 0 .. v_pcount - 1 loop
      execute format('alter table %I.%I enable row level security',
                     v_schema, format('%s_p%s', v_table, lpad(v_ix::text, 2, '0')));
      execute format('revoke all on table %I.%I from public, anon, authenticated, service_role',
                     v_schema, format('%s_p%s', v_table, lpad(v_ix::text, 2, '0')));
    end loop;
  end if;

  -- ---- realtime (G10: was accepted and discarded) -----------------------
  -- `true` adds the table to the supabase_realtime publication, under its RLS.
  if coalesce((n->>'realtime')::boolean, false) then
    execute format('alter publication supabase_realtime add table %s', v_rel);
    v_created := v_created || jsonb_build_object('realtime', format('supabase_realtime carries %s', v_rel));
  end if;

  -- ---- association types -----------------------------------------------
  -- An edge naming a batch member that is not registered yet is handed to the batch,
  -- which writes it once every member exists. Every OTHER declared edge is written in ONE
  -- statement (1024, rebased as 1161): platform.association_types carries a STATEMENT-level
  -- trigger that rebuilds platform.reachability in full — measured 19.6 s on the rehearsal
  -- branch — so a row-at-a-time loop paid that once PER EDGE inside the transaction that holds
  -- this provision's locks (six edges on the topical map: most of the 2026-09-21 hold).
  for v_item in select value from jsonb_array_elements(n->'association_types') loop
    if (platform.provision_batch_context() ? 'batch_id')
       and (not exists (select 1 from platform.entity_types e where e.token = v_item->>'source_type')
            or not exists (select 1 from platform.entity_types e where e.token = v_item->>'target_type')) then
      perform platform.provision_batch_defer('edges', v_item);
      v_created := v_created || jsonb_build_object('association_type_deferred',
        format('%s -> %s (written by the batch once both tokens exist)', v_item->>'source_type', v_item->>'target_type'));
      continue;
    end if;
    v_edges := v_edges || jsonb_build_array(v_item);
  end loop;
  if jsonb_array_length(v_edges) > 0 then
    insert into platform.association_types(source_type, target_type, label, container_side, conveys_max, notes)
    select e.value->>'source_type', e.value->>'target_type', e.value->>'label',
           coalesce(e.value->>'container_side','none'),
           coalesce(e.value->>'conveys_max','editor')::public.permission_level, e.value->>'notes'
      from jsonb_array_elements(v_edges) e
    on conflict (source_type, target_type) do nothing;
  end if;

  -- ---- knobs (SAME transaction: knob_resolve raises on a missing knob) ---
  for v_item in select value from jsonb_array_elements(n->'knobs') loop
    insert into platform.feature_knob(feature, key, value, default_value, value_type, unit,
      min_value, max_value, allowed_values, label, description, set_by, overridable_by,
      override_direction, propagation, taxonomy_node_id)
    values (v_item->>'feature', v_item->>'key', v_item->'value',
            coalesce(v_item->'default_value', v_item->'value'), v_item->>'value_type',
            v_item->>'unit', (v_item->>'min_value')::numeric, (v_item->>'max_value')::numeric,
            v_item->'allowed_values', v_item->>'label', v_item->>'description',
            coalesce(v_item->>'set_by','agent'),
            coalesce(array(select jsonb_array_elements_text(v_item->'overridable_by')), '{}'::text[]),
            coalesce(v_item->>'override_direction','any'), coalesce(v_item->>'propagation','next_load'),
            (v_item->>'taxonomy_node_id')::uuid)
    on conflict (feature, key) do nothing;
    v_created := v_created || jsonb_build_object('knob', format('%s/%s', v_item->>'feature', v_item->>'key'));
  end loop;

  -- ---- views -----------------------------------------------------------
  for v_item in select value from jsonb_array_elements(n->'views') loop
    execute format('create view %I.%I with (security_invoker = %s) as %s',
      v_schema, v_item->>'name',
      case when coalesce((v_item->>'security_invoker')::boolean, true) then 'true' else 'false' end,
      v_item->>'definition');
    -- A view in a CLOSED schema is a relation like any other: the schema's default ACL is the
    -- source of a new relation's grants (20 schemas carry one), so it is revoked by name here
    -- rather than left to whatever the schema happens to declare.
    if not v_client_exposed then
      execute format('revoke all on %I.%I from public, anon, authenticated, service_role',
                     v_schema, v_item->>'name');
    end if;
    v_created := v_created || jsonb_build_object('view', format('%s.%s', v_schema, v_item->>'name'));

    -- G9: `registered_as_projection` was checked and then nothing was written. The view is
    -- registered the way agent_card and workflow_card are: relation_kind = 'projection',
    -- projects_token naming the table it projects, audit_class = 'machinery' with the
    -- declared reason. The declared primary key must be columns the view actually has —
    -- db/generate.py hard-fails for EVERY schema on a registered view with a bad key.
    if coalesce((v_item->>'registered_as_projection')::boolean, false) then
      for v_txt in select jsonb_array_elements_text(v_item->'primary_key') loop
        if not exists (select 1 from pg_attribute a
                        where a.attrelid = to_regclass(format('%I.%I', v_schema, v_item->>'name'))
                          and a.attname = v_txt and a.attnum > 0 and not a.attisdropped) then
          raise exception '%', (platform.provision_finding('views.projection.primary_key.unknown',
                   format('views[%s].primary_key', v_item->>'name'), null,
                   format('%s is not a column of %s.%s', v_txt, v_schema, v_item->>'name')))->>'message'
            using errcode = 'check_violation';
        end if;
      end loop;
      insert into platform.entity_types(
        token, schema_name, table_name, label, origin, is_component, rls_variant,
        relation_kind, projects_token, audit_class, audit_class_reason, is_versioned,
        has_soft_delete, is_listed, is_active, taxonomy_node_id, category, type, custom_fields_enabled)
      values (v_item->>'token', v_schema, v_item->>'name', v_item->>'label', 'standard', true, 'component',
              'projection', coalesce(v_item->>'projects_token', v_token), 'machinery',
              format('Projection: %s.%s is a view over %s (%s). It owns no rows — it exists to carry the %s permission scope. %s',
                     v_schema, v_item->>'name', v_rel, v_token, v_item->>'token', v_item->>'reason'),
              false, false, false, true, (n->>'taxonomy_node_id')::uuid, n->>'category_label', 'system', false);
      v_created := v_created || jsonb_build_object('projection', format('%s (%s.%s, key %s)', v_item->>'token', v_schema, v_item->>'name', v_item->'primary_key'::text));
    end if;
  end loop;

  -- ---- functions -------------------------------------------------------
  -- An entry WITH a body is created (lane A only — the validator refuses a body on
  -- lane B). An entry WITHOUT one declares a door for a function that already exists.
  for v_item in select value from jsonb_array_elements(n->'functions') loop
    if v_item ? 'body' then
      execute format('create function %I.%I(%s) returns %s language %s %s set search_path to %L as $provision_body$%s$provision_body$',
        v_schema, v_item->>'name', coalesce(v_item->>'args',''), v_item->>'returns',
        coalesce(v_item->>'language','plpgsql'),
        case when lower(coalesce(v_item->>'security','invoker')) = 'definer' then 'security definer' else 'security invoker' end,
        coalesce(v_item->>'search_path','pg_catalog'), v_item->>'body');
      -- PostgreSQL grants EXECUTE on a new function to PUBLIC implicitly (proacl stays NULL),
      -- so a function born in a CLOSED schema is callable by every client role unless this
      -- revoke is issued. Measured on the rehearsal branch 2026-09-17: four functions in
      -- schema `custom` read `proacl IS NULL`, which is PUBLIC=EXECUTE.
      if not v_client_exposed then
        execute format('revoke all on function %I.%I(%s) from public, anon, authenticated, service_role',
                       v_schema, v_item->>'name', coalesce(v_item->>'args',''));
      end if;
      v_created := v_created || jsonb_build_object('function', format('%s.%s', v_schema, v_item->>'name'));
    end if;
  end loop;

  -- ---- per-argument check, against the CATALOGUE (lessons ledger 23 + 27) ----
  -- The validator checked the text the spec wrote; this checks what exists, so a
  -- spec whose `args` text disagrees with its body, or a lane-B door on an existing
  -- function, cannot slip past.
  for v_item in select value from jsonb_array_elements(n->'functions') loop
    select p.oid, pg_get_function_arguments(p.oid) as args into r
      from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = v_schema and p.proname = v_item->>'name'
     order by p.oid desc limit 1;
    if not found then
      v_argf := v_argf || platform.provision_finding('functions.not_found',
                 format('functions[%s].name', v_item->>'name'), null,
                 format('%s.%s does not exist', v_schema, v_item->>'name'));
    else
      v_argf := v_argf || platform.provision_arg_check_findings(v_item->>'name', r.args, v_item->'arg_checks');
    end if;
  end loop;
  if cardinality(v_argf) > 0 then
    raise exception 'provision: % function argument finding(s). Nothing was written.%',
      cardinality(v_argf),
      (select string_agg(E'\n\n' || (x->>'message'), '') from unnest(v_argf) x)
      using errcode = 'check_violation',
            hint = (select otherwise from platform.provision_rule_message where rule_id = 'functions.arg_checks.missing');
  end if;

  -- ---- sharing ---------------------------------------------------------
  if jsonb_typeof(n->'sharing') = 'object' then
    insert into platform.shareable_resource_registry(
      resource_type, schema_name, table_name, id_column, owner_column, display_label,
      url_path_template, is_link_shareable, is_scopeable, public_columns, content_role,
      organization_id, visibility)
    values (v_token, v_schema, v_table, 'id',
            coalesce(n->'sharing'->>'owner_column','created_by'),
            n->'sharing'->>'display_label', n->'sharing'->>'url_path_template',
            coalesce((n->'sharing'->>'is_link_shareable')::boolean, false),
            coalesce((n->'sharing'->>'is_scopeable')::boolean, false),
            nullif(array(select jsonb_array_elements_text(n->'sharing'->'public_columns')), '{}'),
            n->>'content_role',
            coalesce(p_org_id, public.system_org_id('system')),
            coalesce(nullif(v_vis,'')::platform.visibility, 'internal'::platform.visibility));
    v_created := v_created || jsonb_build_object('shareable_resource', v_token);
  end if;

  -- ---- DOORS, then GRANTS. In that order, always. -----------------------
  -- Lessons ledger 1 and 24: an undeclared grant is silently stripped, and a
  -- guard-log revoke row means the grant preceded the door — 51 times out of 86.
  for v_item in select value from jsonb_array_elements(n->'functions') loop
    select p.oid, pg_get_function_identity_arguments(p.oid) ia, platform.door_argtypes(p.proargtypes) at,
           pg_get_function_arguments(p.oid) fa
      into r
      from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = v_schema and p.proname = v_item->>'name'
     order by p.oid desc limit 1;

    if exists (select 1 from platform.client_callable_door c
                where c.schema_name = v_schema and c.function_name = v_item->>'name'
                  and c.identity_argtypes = r.at) then
      raise exception '%', (platform.provision_finding('functions.door_exists',
               format('functions[%s].name', v_item->>'name'), null,
               format('%s.%s(%s)', v_schema, v_item->>'name', r.ia)))->>'message'
        using errcode = 'check_violation';
    end if;

    -- 0796: the per-argument rules are STORED, not validated and thrown away (G15).
    insert into platform.client_callable_door(
      schema_name, function_name, identity_args, identity_argtypes, reason,
      argument_rules, contract_probe,
      anonymous_callers, anonymous_purpose, signed_in_callers, non_client_lane, declared_by)
    values (v_schema, v_item->>'name', r.ia, r.at, v_item->>'reason',
            platform.door_rules_normalize(r.fa, v_item->'arg_checks'),
            case when jsonb_typeof(v_item->'contract_probe') = 'object' then v_item->'contract_probe' end,
            (v_item->>'client_access') = 'anonymous',
            case when (v_item->>'client_access') = 'anonymous' then v_item->>'anonymous_purpose' end,
            (v_item->>'client_access') in ('anonymous','signed_in'),
            case when (v_item->>'client_access') = 'server_only' then v_item->>'non_client_lane' end,
            format('platform.provision(%s)', v_token));
    v_created := v_created || jsonb_build_object('door', format('%s.%s(%s)', v_schema, v_item->>'name', r.ia));
    v_refs := v_refs || format('%s.%s(%s)', v_schema, v_item->>'name', r.ia);

    -- Collected, not issued: every GRANT goes last, as ONE STATEMENT per role set. Each
    -- GRANT statement fires a DB-wide re-sweep of ~2,000 DEFINER functions (ATTACK #8), so
    -- since 1012 the functions are listed in one GRANT and the sweep runs once, not once
    -- per door (2026-09-21: every statement inside a provision is time spent holding
    -- SHARE ROW EXCLUSIVE on iam.organizations and auth.users).
    -- The DOOR ROW is written whatever the schema's exposure is — it is the declaration of
    -- what this function is FOR, and it is what `iam.apply_table_grants`, the door census and
    -- switch-checklist step 3 all read. The GRANT is the access, and a CLOSED schema gets none.
    if not v_client_exposed then
      if (v_item->>'client_access') in ('signed_in','anonymous') then
        raise notice
          'provision: door %.%(%) is declared % and its platform.client_callable_door row was written, but schema % is declared CLOSED in platform.schema_client_exposure — the EXECUTE grant was NOT issued. Opening the schema (platform.schema_client_exposure.client_exposed = true) and re-running the provisioner issues it.',
          v_schema, v_item->>'name', r.ia, v_item->>'client_access', v_schema;
      end if;
      v_g_close := v_g_close || format('%I.%I(%s)', v_schema, v_item->>'name', r.ia);
    elsif (v_item->>'client_access') = 'signed_in' then
      v_g_auth := v_g_auth || format('%I.%I(%s)', v_schema, v_item->>'name', r.ia);
    elsif (v_item->>'client_access') = 'anonymous' then
      v_g_anon := v_g_anon || format('%I.%I(%s)', v_schema, v_item->>'name', r.ia);
    end if;
  end loop;

  if cardinality(v_g_close) > 0 then
    v_grants := v_grants || format('revoke all on function %s from public, anon, authenticated, service_role',
                                   array_to_string(v_g_close, ', '));
  end if;
  if cardinality(v_g_auth) > 0 then
    v_grants := v_grants || format('grant execute on function %s to authenticated', array_to_string(v_g_auth, ', '));
  end if;
  if cardinality(v_g_anon) > 0 then
    v_grants := v_grants || format('grant execute on function %s to anon, authenticated', array_to_string(v_g_anon, ', '));
  end if;
  foreach v_txt in array v_grants loop
    execute v_txt;
  end loop;

  -- ---- the door proof (PLAN §4.5): what exists matches what was declared ----
  for v_item in select value from jsonb_array_elements(n->'functions') loop
    select p.oid into r
      from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = v_schema and p.proname = v_item->>'name'
     order by p.oid desc limit 1;
    -- The door proof compares the catalogue to what was DECLARED **and what the schema's
    -- exposure allows** — in a closed schema the expected answer for both roles is false, and
    -- a proof that still expected the declaration would refuse every provision into one.
    if (has_function_privilege('authenticated', r.oid, 'EXECUTE')
          is distinct from (v_client_exposed and (v_item->>'client_access') in ('signed_in','anonymous')))
       or (has_function_privilege('anon', r.oid, 'EXECUTE')
          is distinct from (v_client_exposed and (v_item->>'client_access') = 'anonymous')) then
      raise exception '%', (platform.provision_finding('doors.proof_failed',
               format('functions[%s].client_access', v_item->>'name'), null,
               format('declared %s (schema client-exposed = %s); observed authenticated EXECUTE = %s, anon EXECUTE = %s',
                      v_item->>'client_access', v_client_exposed,
                      has_function_privilege('authenticated', r.oid, 'EXECUTE'),
                      has_function_privilege('anon', r.oid, 'EXECUTE'))))->>'message'
        using errcode = 'check_violation';
    end if;
  end loop;

  -- ---- the write-door proof: the narrow grant, OBSERVED -----------------
  -- Same shape as the door proof above, and for the same reason: the declaration is worth
  -- nothing unless the catalogue agrees with it at the end of the transaction.
  if n->>'write_door' = 'single' then
    if has_table_privilege('authenticated', v_rel::regclass, 'INSERT')
       or has_table_privilege('authenticated', v_rel::regclass, 'UPDATE')
       or has_table_privilege('authenticated', v_rel::regclass, 'DELETE') then
      raise exception '%', (platform.provision_finding('write_door.proof_failed', 'write_door', null,
               format('authenticated still holds INSERT=%s UPDATE=%s DELETE=%s on %s',
                      has_table_privilege('authenticated', v_rel::regclass, 'INSERT'),
                      has_table_privilege('authenticated', v_rel::regclass, 'UPDATE'),
                      has_table_privilege('authenticated', v_rel::regclass, 'DELETE'), v_rel)))->>'message'
        using errcode = 'check_violation';
    end if;
  end if;

  -- The guard revoked PUBLIC's default EXECUTE on every DEFINER function created above
  -- and logged it, BEFORE its door could exist (a door row cannot precede the function
  -- it names, and a both-flags-false door that precedes it makes the guard refuse the
  -- CREATE). The door now declares the decision, so the row is acknowledged with that
  -- reason — only rows this transaction produced, only for the functions just doored.
  update platform.ddl_guard_log l
     set acknowledged_at = now(),
         acknowledged_by = format('platform.provision(%s)', v_token),
         ack_reason = format('The birth revoke of PUBLIC''s default EXECUTE was correct; platform.provision(%s) declared this function''s door in the same transaction (lessons ledger 24).', v_token)
   where l.acknowledged_at is null
     -- the guard's birth-revoke row is logged under either name (the TAILS-5 rename of
     -- 2026-09-21 moved it to `definer_default_public_execute_cleared_at_birth`; provision
     -- kept acknowledging only the old name and left one unacknowledged row per door).
     and l.rule in ('definer_client_grant_revoked', 'definer_default_public_execute_cleared_at_birth')
     and l.occurred_at >= now()
     and l.object_ref = any (v_refs);

  -- ---- certification ---------------------------------------------------
  -- ONE JUDGEMENT, SHARED WITH THE BATCH (lane PROVISION-BATCH-FIX, 2026-09-26). What
  -- refuses, what is owed, and what the certify document says are decided by
  -- platform.provision_certify_judged — the same function platform.provision_batch calls when
  -- it certifies its members again after their deferred constraints. Until this file the batch
  -- carried its own copy of this loop without the deferred base-contract rule, and so refused
  -- EVERY batch with base_org_fk / base_created_by_fk / base_updated_by_fk the moment the
  -- base contract was deferred (the default). One function; the two paths cannot diverge again.
  v_judged  := platform.provision_certify_judged(v_schema, v_table, v_token, v_defer_base);
  v_certify := array(select jsonb_array_elements(v_judged->'certify'));
  v_refuse  := array(select jsonb_array_elements_text(v_judged->'refuse'));
  if cardinality(v_refuse) > 0 then
    raise exception 'provision: % refused certification. Nothing was written.%',
      format('%s.%s', v_schema, v_table),
      E'\n  - ' || array_to_string(v_refuse, E'\n  - ')
      using errcode = 'check_violation',
            hint = (select otherwise from platform.provision_rule_message where rule_id = 'certify.refused');
  end if;

  -- ---- THE CLOSED-SCHEMA PROOF, FROM THE CATALOGUE ----------------------
  -- Same shape and same reason as the door proof and the write-door proof above: a rule the
  -- generator followed is worth nothing unless the catalogue agrees with it at the end of the
  -- transaction. For a schema declared CLOSED this asserts the whole of §6.3's fact two —
  -- schema USAGE, every relation and column ACL, every default-privilege row and every
  -- function's EXECUTE reachability, for PUBLIC, anon, authenticated and service_role — so a
  -- future grant added anywhere in this function, or by a trigger it fires, or standing in the
  -- schema from before, refuses the provision instead of quietly reopening the store.
  if not v_client_exposed then
    select string_agg(format('%s %s: %s', v.kind, v.object_name, v.detail), E'\n  - ' order by v.kind, v.object_name)
      into v_exposure_viol
      from platform.schema_exposure_violations(v_schema) v;
    if v_exposure_viol is not null then
      raise exception
        'provision: schema % is declared CLOSED to client roles in platform.schema_client_exposure, and it is NOT closed after this transaction. Nothing was written.%',
        v_schema, E'\n  - ' || v_exposure_viol
        using errcode = 'check_violation',
              hint = format('Close the schema and re-run: revoke all on schema %I from public, anon, authenticated, service_role; revoke all on all tables in schema %I from public, anon, authenticated, service_role; revoke all on all functions in schema %I from public, anon, authenticated, service_role; alter default privileges in schema %I revoke all on tables from public, anon, authenticated, service_role; (same for functions and sequences). To open it instead, set platform.schema_client_exposure.client_exposed = true for %L with a reason.',
                           v_schema, v_schema, v_schema, v_schema, v_schema);
    end if;
  end if;

  -- ---- capture, inside THIS transaction (PLAN §3.3) ---------------------
  -- WHO ACTUALLY ASKED. Lane B arrives as `SET LOCAL ROLE matrx_provisioner` and
  -- then this SECURITY DEFINER, so current_user and session_user BOTH say `postgres`
  -- and neither can tell the lanes apart. The GUC `role` and the verified JWT survive
  -- the DEFINER switch; p_lane is the lane the caller entered through.
  v_actor := auth.uid();
  v_role  := nullif(current_setting('role', true), 'none');

  insert into platform.provision_spec(
    token, spec, spec_hash, type, origin, owner_org_id, verb, result,
    applied_by, applied_via, artifacts_status,
    applied_lane, applied_actor, applied_role, batch_id)
  values (v_token, n, v_hash, n->>'type', n->>'origin', p_org_id,
          case when p_lane = 'restricted' then 'provision_restricted' else 'provision' end,
          jsonb_build_object('created', coalesce(to_jsonb(v_created), '[]'::jsonb),
                             'certify', coalesce(to_jsonb(v_certify), '[]'::jsonb)),
          coalesce(v_actor::text, v_role, session_user), p_applied_via, 'pending',
          case when p_lane = 'restricted' then 'restricted' else 'full' end,
          v_actor, coalesce(v_role, session_user),
          nullif(platform.provision_batch_context()->>'batch_id', '')::uuid);

  -- ---- the base-contract debt, written INSIDE this transaction ----------
  -- If this insert does not happen the deferral never happened either: the register and
  -- the CREATE TABLE commit together or not at all, so there is no state in which a table
  -- exists with bare base columns and nothing saying so.
  if v_defer_base then
    insert into platform.provision_base_contract_pending (relation, token, detail)
    values (v_rel, v_token,
            jsonb_build_object('schema', v_schema, 'table', v_table, 'lane', p_lane,
                               'applied_via', p_applied_via, 'access_seal', 'pending'))
    on conflict (relation) do update set
      token = excluded.token, deferred_at = now(),
      attached_at = null, validated_at = null, detail = excluded.detail;
    v_created := v_created || jsonb_build_object('base_contract_deferred',
      format('%s: organization_id -> iam.organizations, created_by / updated_by -> auth.users are added by platform.provision_attach_base_contract in their own short transaction', v_rel));
  end if;

  perform set_config('matrx.provisioner', '0', true);
  perform platform.provision_marker_set(false);

  return platform._provision_says_the_kernel_was_rerecorded(jsonb_build_object(
    'ok', true, 'unchanged', false, 'token', v_token, 'spec_hash', v_hash,
    'plan', v_res->'plan',
    'created', coalesce(to_jsonb(v_created), '[]'::jsonb),
    'certify', coalesce(to_jsonb(v_certify), '[]'::jsonb),
    -- NULL, not false, while the base contract is pending: this table has not been
    -- certified YET, and `false` would read as "this table is wrong". The remedy below is
    -- the two statements that make it true.
    'canonical_certify_ok', case when v_defer_base then null
                                 else iam.canonical_certify_ok(v_schema, v_table, v_token) end,
    'base_contract', case when v_defer_base then jsonb_build_object(
        'status', 'pending_attach',
        'relation', v_rel,
        'why', 'The base-contract foreign keys point at auth.users and iam.organizations. Creating them inside this transaction would have held SHARE ROW EXCLUSIVE on both for the length of the build (2026-09-21: 298s, 22 sessions queued, sign-in included).',
        'remedy', format('begin; select platform.provision_attach_base_contract(%L); commit;  begin; select platform.provision_validate_base_contract(%L); commit;', v_rel, v_rel),
        'access_seal', 'pending',
        'access_seal_why', 'The table''s row-level policies are written by the same attach call, in its own short transaction: policy statements pause sign-in (Supabase supautils), so they are never written inside the build. Until then RLS is on with no policy, so nobody but the owner reads a row.')
      else jsonb_build_object('status', 'inline') end,
    'artifacts_status', 'pending',
    'note', 'The repo projection, ORM models and frontend types are produced by db/provision_pull.py in the deploy train (PLAN §3.3), within one cycle. `pending` is by design for that window.'));
end;
$function$;


revoke all on function platform.sign_in_freeze_grab_ms() from public, anon, authenticated, service_role;
revoke all on function platform._access_seal_marked(regclass, text) from public, anon, authenticated, service_role;
revoke all on function platform._access_seal_mark(regclass, text) from public, anon, authenticated, service_role;
revoke all on function iam.take_sign_in_freeze(regclass, text) from public, anon, authenticated, service_role;
revoke all on function platform._take_lock_nowait(regclass[], text, text) from public, anon, authenticated, service_role;
revoke all on function platform._admin_read_ensure(regclass) from public, anon, authenticated, service_role;


-- ── the file's own assertions ─────────────────────────────────────────────────────────────
do $assert$
begin
  if platform.sign_in_freeze_grab_ms() is null then
    raise exception 'provisionlock: knob not readable';
  end if;
  if position('drop trigger if exists' in pg_get_functiondef('iam.apply_governance_guard(text,text,text)'::regprocedure)) > 0 then
    raise exception 'provisionlock: iam.apply_governance_guard still issues DROP TRIGGER';
  end if;
  if position('take_sign_in_freeze' in pg_get_functiondef(to_regprocedure('iam._rls_' || 'emit_policies(text[],text[])'))) = 0 then
    raise exception 'provisionlock: iam._rls_emit_policies does not take the freeze door';
  end if;
  if position('_admin_read_ensure' in pg_get_functiondef('platform._admin_read_follows_rls()'::regprocedure)) = 0 then
    raise exception 'provisionlock: the admin-read event trigger does not use the one writer';
  end if;
  if iam.entity_read_kernel_fingerprint() is distinct from iam.entity_read_kernel_expected() then
    raise exception 'provisionlock: the access-kernel fingerprint is not matched after this file (live %, recorded %) — this file changes no kernel member, so something else moved it',
      iam.entity_read_kernel_fingerprint(), iam.entity_read_kernel_expected();
  end if;
  -- platform.provision_selfcheck(false) is run in its OWN transaction after this file: its
  -- preflight refuses a transaction that is already seconds old, which this one is.
end $assert$;
