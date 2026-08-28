-- hr_l3_101 — P0. The SMS senders HR notifications flow through were reachable by ANYONE.
--
-- THE VULNERABILITY, PROVEN LIVE THROUGH POSTGREST BEFORE THIS RAN
--   `communication` IS in `pgrst.db_schemas` (the authenticator role's config lists it), so its RPCs
--   answer over PostgREST. Three of them are SECURITY DEFINER with the implicit-or-explicit PUBLIC
--   EXECUTE grant, and check 33's campaign never reached this schema — it swept `hr.*` only. Measured
--   with the project's own keys, no code change:
--
--     ANON KEY, no user session   POST /rest/v1/rpc/sms_notification_gate    -> 200, a real decision
--     ANON KEY, no user session   POST /rest/v1/rpc/resolve_channel_address  -> 200, a phone oracle
--     ANY authenticated token     POST /rest/v1/rpc/enqueue_notification_sms  -> 200, A REAL SMS ROW
--
--   🚨 `enqueue_notification_sms` DOES NOT CALL `sms_notification_gate` — verified against prosrc; the
--   adapter calls them SEPARATELY (aidream/services/notifications/channels/sms.py `_gate` then
--   `_enqueue`). So a caller holding a notification UUID queues a text with the gate never consulted:
--   suppression, consent, quiet hours and rate caps all bypassed. `resolve_channel_address` is a
--   phone-resolution oracle: hand it identifiers, it walks the CRM contact graph and returns where a
--   text would go. Both are DEFINER, so they run as the owner for whoever reaches them.
--
-- WHY REVOKING FROM ALL THREE CLIENT ROLES BREAKS NOTHING
--   The ONLY legitimate caller is the aidream SMS adapter, and it reaches these through `matrx_orm`
--   on a direct connection AS `postgres` — the functions' OWNER, which holds EXECUTE independent of
--   any grant. No frontend code calls them (grep of matrx-frontend: one doc comment, zero rpc calls),
--   and no SQL function calls the gate or the enqueue (they are application-orchestrated). So `anon`,
--   `authenticated` and PUBLIC have no legitimate reason to reach any of the three, and the adapter
--   keeps working because it never depended on the grant.
--
-- Applied live as `hr_l3_101_communication_senders_are_not_public`. Idempotent.
--
-- RECORDED TECHNICAL DECISIONS
--   · REVOKE FROM PUBLIC *AND* anon *AND* authenticated, in that order. hr_l3_93's law: on a function
--     whose `proacl` is NULL (which `enqueue_notification_sms` and `sms_notification_gate` both are),
--     every role holds EXECUTE through the implicit PUBLIC grant, and revoking `anon` alone only
--     MATERIALISES the ACL while leaving reachability wide open. Only `REVOKE FROM PUBLIC` closes it.
--     `resolve_channel_address` already has a materialised ACL carrying an explicit `=X` (PUBLIC) and
--     `authenticated=X`; the same three revokes remove both. Writing all three every time removes the
--     need to be right about which case each door is in.
--   · `service_role` AND `postgres` KEEP EXECUTE. postgres is the owner (implicit) and is the role the
--     ORM adapter connects as; service_role is left in case a server path ever calls over PostgREST
--     with the secret key. Neither is a client-reachable role.
--   · THE SENDERS ARE NOT MADE TO CALL THE GATE HERE. That `enqueue` bypasses the gate is a real
--     orchestration weakness, but wiring the gate into the writer is a behaviour change to another
--     lane's adapter and belongs to that lane with its own proof. Closing the door is the P0; the
--     internal call graph is reported, not rewritten under a security revoke.

do $mig$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure::text as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'communication'
       and (p.proname, pg_get_function_identity_arguments(p.oid)) in (
             ('enqueue_notification_sms', 'p_notification_id uuid, p_program_key text'),
             ('sms_notification_gate',    'p_notification_id uuid, p_now timestamp with time zone'),
             ('resolve_channel_address',
              'p_channel text, p_organization_id uuid, p_recipient_kind text, '
              || 'p_recipient_user_id uuid, p_recipient_party_id uuid, p_actor_token_id uuid, '
              || 'p_literal_address text'))
  loop
    execute format('revoke execute on function %s from public', r.sig);
    execute format('revoke execute on function %s from anon', r.sig);
    execute format('revoke execute on function %s from authenticated', r.sig);
    -- 🚨 service_role held EXECUTE only THROUGH the implicit PUBLIC grant on the NULL-acl senders, so
    -- revoking PUBLIC took it away too. Re-grant it explicitly: a server path calling over PostgREST
    -- with the secret key must still reach these. postgres (the owner) needs no grant.
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end
$mig$;

-- ── FALSIFICATION, in the database: anon/authenticated shut out, owner/service kept ──────────────
do $verify$
declare
  s text;
  bad text := '';
begin
  foreach s in array array[
    'communication.enqueue_notification_sms(uuid,text)',
    'communication.sms_notification_gate(uuid,timestamptz)',
    'communication.resolve_channel_address(text,uuid,text,uuid,uuid,uuid,text)'
  ] loop
    if has_function_privilege('anon', s, 'EXECUTE') then
      bad := bad || s || ' still reachable by anon; ';
    end if;
    if has_function_privilege('authenticated', s, 'EXECUTE') then
      bad := bad || s || ' still reachable by authenticated; ';
    end if;
    if not has_function_privilege('service_role', s, 'EXECUTE') then
      bad := bad || s || ' lost service_role; ';
    end if;
    -- postgres owns them, so EXECUTE is implicit and always true; assert it anyway.
    if not has_function_privilege('postgres', s, 'EXECUTE') then
      bad := bad || s || ' lost the OWNER grant (adapter path); ';
    end if;
  end loop;
  if bad <> '' then
    raise exception 'hr_l3_101: %', bad;
  end if;
end
$verify$;

-- ── CONTRACT ROWS — the class must not reopen one schema over ─────────────────────────────────────
insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason,
   is_active, must_be_definer, overloads_intended)
values
  ('communication', 'enqueue_notification_sms', 'hr_l3_101_communication_senders_are_not_public',
   array[]::text[], array[]::text[],
   'P0: PostgREST-exposed SECURITY DEFINER SMS sender that shipped with PUBLIC/anon execute and does '
   || 'NOT call the gate — any caller with a notification UUID queued a real text bypassing consent, '
   || 'suppression, quiet hours and caps. Only the aidream adapter (as postgres, the owner) may reach '
   || 'it. Client roles anon/authenticated must never hold EXECUTE. Tracked so check 33/35 cover the '
   || 'communication senders HR depends on, not just hr.*.',
   true, true, false),
  ('communication', 'sms_notification_gate', 'hr_l3_101_communication_senders_are_not_public',
   array[]::text[], array[]::text[],
   'P0: PostgREST-exposed DEFINER gate reachable by the anon key with no session (200, a real '
   || 'suppression decision). Client roles must never hold EXECUTE; the adapter reaches it as the '
   || 'owner. In-scope for the reachability sweep with the SMS family HR notifies through.',
   true, true, false),
  ('communication', 'resolve_channel_address', 'hr_l3_101_communication_senders_are_not_public',
   array[]::text[], array[]::text[],
   'P0: PostgREST-exposed DEFINER phone-resolution ORACLE reachable by anon — walks the CRM contact '
   || 'graph and returns where a text would go. Client roles must never hold EXECUTE.',
   true, true, false)
on conflict do nothing;
