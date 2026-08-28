-- hr_l3_107 — CHECK 35: the cross-schema outsider / notification-sender EXECUTE audit.
--
-- WHY THIS EXISTS
--   The security arc closed four live P0s — an anon-reachable SMS gate/resolver, an authenticated
--   SMS enqueue, a cross-tenant `platform.mint_outsider_token`, and direct `platform.actor_token`
--   INSERT — and every one was a GRANT defect: a PostgREST-reachable SECURITY DEFINER routine (or a
--   credential table) that a client role could reach, running as its owner and bypassing RLS. Each
--   was found LIVE by a verifier. Check 33 already catches this class, but only inside `hr.*`; the
--   danger spans schemas (the forge was `platform.*`, the senders `communication.*`). This is the
--   structural generalization that would have failed all four at CI instead of in production.
--
-- THE DOOR SET (derived, per D13 — no hand list)
--   Every PostgREST-CALLABLE (non-trigger) SECURITY DEFINER function in the schemas HR's surfaces
--   reach — `public` (the wrappers), `communication`, `platform` — that a client role (`anon` or
--   `authenticated`) can EXECUTE and whose body TOUCHES an HR notify/outsider sensitive object:
--   actor_token, sms_messages, sms_conversations, sms_consent, sms_notification*, the notification
--   spine, resolve_channel_address, outsider_consumer, or mint_outsider_token.
--
-- THE RULE (the check-33 pattern, cross-schema)
--   Every door in that set must be EITHER
--     · credentialed — it takes an outsider/kiosk credential parameter (token/secret/pairing/code/
--       session), so the caller must present a secret the definer validates (the outsider session
--       lane), OR
--     · baselined — it appears in `hr.notify_outsider_door_baseline`, a reviewed allowlist of the
--       sanctioned client-reachable doors, each row asserting the door gates its caller to their own
--       data (the `_my_*` surfaces, the notification read/outcome writers) or is anonymous-intake by
--       design (the whistleblower report), and whether anon may reach it at all (`anon_ok`).
--   Anything else — a raw sender, a mint, a phone oracle, an un-reviewed writer — is a VIOLATION,
--   and so is any door reachable by `anon` that the baseline did not bless for anon, and any client
--   INSERT/UPDATE/DELETE grant on `platform.actor_token`.
--
--   This flags a hole the moment the grant exists, whatever schema it lands in. It cannot detect
--   "the definer forgot to gate its caller" by reading the body (a text scan for auth.uid is a
--   FALSE-POSITIVE trap — `mint_outsider_token` references auth.uid only to stamp issued_by), so it
--   does not try: it demands that every reachable door be explicitly sanctioned, and treats an
--   un-sanctioned reachable door as guilty. That is the same posture check 33 proved.
--
-- Applied live as `hr_l3_107_check_35_cross_schema_outsider_audit`. Idempotent.
--
-- RECORDED TECHNICAL DECISIONS
--   · `public` IS IN THE DOOR SET, BUT ONLY WHERE A FUNCTION TOUCHES A SENSITIVE OBJECT. The 792
--     authenticated-reachable `public.hr_*` wrappers are the intended client doors and gate
--     internally; they are NOT swept wholesale. Only the handful that touch the outsider/notify
--     surface (the mint wrappers, the SSR shell read) enter the set, and they are baselined.
--   · TRIGGER FUNCTIONS ARE EXCLUDED (`prorettype <> trigger`). A trigger function is not a
--     PostgREST RPC door; netting them was an over-scope caught and corrected before this shipped.
--   · anon IS REVOKED from `mark_notification_read` / `record_notification_outcome`. They gate on
--     `auth.uid()` so an anon call was already a no-op, but a signed-in-user's-own-notifications
--     surface has no business being anon-callable — least privilege, and it keeps the baseline's
--     anon_ok honest (only the whistleblower intake is anon-blessed).

-- ── 1. LEAST-PRIVILEGE: anon has no business at the two own-data notification writers ────────────
-- 🚨 REVOKE FROM PUBLIC, not just anon (hr_l3_93's law). Their ACL is {=X/postgres, authenticated=X,
-- ...}: anon reaches EXECUTE through the implicit PUBLIC grant (=X), so `revoke from anon` alone is a
-- no-op. `authenticated=X` is explicit and survives the PUBLIC revoke, so the signed-in door stays.
revoke execute on function communication.mark_notification_read(uuid, text) from public;
revoke execute on function communication.mark_notification_read(uuid, text) from anon;
revoke execute on function communication.record_notification_outcome(uuid, text, timestamptz) from public;
revoke execute on function communication.record_notification_outcome(uuid, text, timestamptz) from anon;

-- ── 2. THE BASELINE — the reviewed set of sanctioned client-reachable doors ──────────────────────
create table if not exists hr.notify_outsider_door_baseline (
  id            uuid primary key default gen_random_uuid(),
  schema_name   text not null,
  function_name text not null,
  identity_args text not null,
  anon_ok       boolean not null default false,
  reason        text not null,
  noted_on      date not null default current_date,
  unique (schema_name, function_name, identity_args)
);

insert into hr.notify_outsider_door_baseline (schema_name, function_name, identity_args, anon_ok, reason)
values
  ('communication','configure_my_sms_task_notifications','p_enabled boolean, p_program_key text', false,
   'Own-data: a signed-in user configures THEIR OWN task-SMS preference, scoped by auth.uid().'),
  ('communication','enqueue_my_sms_assistant_test','p_program_key text, p_body text, p_idempotency_key text', false,
   'Own-data: a signed-in user sends a test to THEIR OWN assistant, scoped by auth.uid().'),
  ('communication','enqueue_my_task_sms_reminder','p_task_id uuid, p_program_key text', false,
   'Own-data: scopes task ownership, consent and suppression by caller = auth.uid().'),
  ('communication','get_my_sms_assistant_program','p_program_key text', false,
   'Own-data read: the caller''s own assistant program.'),
  ('communication','get_my_sms_task_notification_preference','p_program_key text', false,
   'Own-data read: the caller''s own task-notification preference.'),
  ('communication','set_my_sms_assistant_enabled','p_program_key text, p_enabled boolean', false,
   'Own-data: toggles the caller''s own assistant, scoped by auth.uid().'),
  ('communication','mark_notification_read','p_notification_id uuid, p_channel text', false,
   'Own-data writer: updates only a notice where recipient_user_id = auth.uid() or created_by = auth.uid(). anon revoked (hr_l3_107).'),
  ('communication','record_notification_outcome','p_notification_id uuid, p_outcome text, p_acted_at timestamp with time zone', false,
   'Own-data writer: same recipient/creator scope as mark_notification_read. anon revoked (hr_l3_107).'),
  ('public','anonymous_report_open','p_organization_id uuid, p_ip inet', true,
   'ANONYMOUS INTAKE BY DESIGN (SPEC §5.6/5.7): a whistleblower with no account opens a report; mints the forbid-recipient-identity hr.anonymous_report token, rate-limited per IP. anon is correct here.'),
  ('public','esign_mint_signer_token','p_signer_id uuid, p_email text', false,
   'DEFINER mint WRAPPER: reaches mint_outsider_token as owner after gating the caller against the esign envelope. The legitimate door for a signer token.'),
  ('public','hr_mint_investigation_token','p_incident_id uuid, p_investigator_email text, p_investigator_name text, p_reason text', false,
   'DEFINER mint WRAPPER: gates the caller''s HR authority over the incident, then mints as owner. The legitimate investigation-token door.'),
  ('public','hr_mint_records_request_token','p_request_id uuid, p_delivery_address text, p_scope text[], p_reason text', false,
   'DEFINER mint WRAPPER: gates the caller, then mints a records-request token as owner.'),
  ('public','get_ssr_shell_data','p_user_id uuid', false,
   'Own-data read: the SSR shell (nav, notification bell count) for the caller''s own user_id.')
on conflict (schema_name, function_name, identity_args) do nothing;

-- ── 3. THE DERIVED VIOLATIONS HELPER ─────────────────────────────────────────────────────────────
create or replace function hr.notify_outsider_doors_client_reachable()
returns table (
  qname text, identity_args text, anon_can boolean, authenticated_can boolean,
  credentialed boolean, baselined boolean, anon_allowed boolean, verdict text
)
language sql
stable
security definer
set search_path to 'hr', 'public'
as $fn$
  with door as (
    select n.nspname as schema_name, p.proname,
           n.nspname || '.' || p.proname as qname,
           pg_get_function_identity_arguments(p.oid) as ia,
           has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_can,
           -- 🚨 A CREDENTIAL IS A SECRET THE CALLER PRESENTS, AT THE END OF A PARAM NAME — the `\M`
           -- word-boundary matters. `p_session`, `p_session_token`, `p_device_secret`,
           -- `p_pairing_code` are secrets; `p_actor_token_id uuid` is an ATTRIBUTION id, and an
           -- un-anchored `token` matched it and wrongly exempted resolve_channel_address (the phone
           -- oracle). The boundary makes `token\M` miss `token_id`.
           (pg_get_function_arguments(p.oid) ~* '(session|secret|pairing|token|code)\M') as credentialed
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public','communication','platform')
       and p.prosecdef
       and p.prorettype <> 'pg_catalog.trigger'::regtype
       and (has_function_privilege('anon', p.oid, 'EXECUTE')
         or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
       and (p.prosrc ~ '\mactor_token\M' or p.prosrc ~ '\msms_messages\M'
         or p.prosrc ~ '\msms_conversations\M' or p.prosrc ~ '\msms_consent\M'
         or p.prosrc ~ '\msms_notification' or p.prosrc ~ 'resolve_channel_address'
         or p.prosrc ~ '\mnotification\M' or p.prosrc ~ '\moutsider_consumer\M'
         or p.prosrc ~ 'mint_outsider_token'
         -- 🚨 THE RESOLVER PRIMITIVE ITSELF. resolve_channel_address reads the CRM contact graph
         -- (party_contact_point / contact_medium), NOT the tables above, so a body-touch scan
         -- misses it — yet it is the phone-resolution ORACLE the campaign proved (P0-1b). Matching
         -- the contact graph directly would net five unrelated CRM party-management doors, so the
         -- one named messaging-resolver primitive is included by name. This is the notify path's
         -- resolver, not a hand list of the door set.
         or p.proname = 'resolve_channel_address')
  )
  select d.qname, d.ia, d.anon_can, d.auth_can, d.credentialed,
         (b.function_name is not null) as baselined,
         coalesce(b.anon_ok, false) as anon_allowed,
         case
           when not d.credentialed and b.function_name is null
             then 'VIOLATION: client-reachable sensitive door is neither credentialed nor baselined'
           when d.anon_can and not coalesce(b.anon_ok, false) and not d.credentialed
             then 'VIOLATION: reachable by anon, which the baseline does not bless'
           else 'ok'
         end as verdict
    from door d
    left join hr.notify_outsider_door_baseline b
      on b.schema_name = d.schema_name and b.function_name = d.proname and b.identity_args = d.ia
   where not (
     -- ok rows are excluded; the helper returns VIOLATIONS only.
     (d.credentialed or b.function_name is not null)
     and not (d.anon_can and not coalesce(b.anon_ok, false) and not d.credentialed))
   order by d.qname;
$fn$;

revoke execute on function hr.notify_outsider_doors_client_reachable() from public;
revoke execute on function hr.notify_outsider_doors_client_reachable() from anon;
revoke execute on function hr.notify_outsider_doors_client_reachable() from authenticated;

-- ── 4. CHECK 35 — appended to the conformance function, surgically ───────────────────────────────
do $mig$
declare v_src text; v_new text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'punch_write_path_conformance';
  if v_src is null then
    raise exception 'hr_l3_107: hr.punch_write_path_conformance not found';
  end if;
  if position('cross_schema_outsider_doors_baselined' in v_src) > 0 then
    return;   -- already applied
  end if;

  v_new := replace(v_src,
$anchor$      || 'genuinely needs two signatures declares overloads_intended on its contract row.');
  return next;

end
$function$$anchor$,
$anchor$      || 'genuinely needs two signatures declares overloads_intended on its contract row.');
  return next;

  ---------------------------------------------------------------- 35. the cross-schema outsider / notification-sender audit
  check_key := 'cross_schema_outsider_doors_baselined';
  select coalesce(jsonb_agg(jsonb_build_object(
           'door', t.qname, 'args', t.identity_args, 'anon', t.anon_can,
           'authenticated', t.authenticated_can, 'credentialed', t.credentialed,
           'baselined', t.baselined, 'verdict', t.verdict) order by t.qname), '[]'::jsonb)
    into v_bad from hr.notify_outsider_doors_client_reachable() t;
  -- the credential-table dimension: a client role must never hold DML on platform.actor_token.
  declare v_tbl jsonb; begin
    select coalesce(jsonb_agg(g order by g), '[]'::jsonb) into v_tbl
      from (select 'authenticated:'||priv as g
              from unnest(array['INSERT','UPDATE','DELETE']) priv
             where has_table_privilege('authenticated','platform.actor_token',priv)
            union all
            select 'anon:'||priv
              from unnest(array['INSERT','UPDATE','DELETE']) priv
             where has_table_privilege('anon','platform.actor_token',priv)) q;
    ok       := (v_bad = '[]'::jsonb) and (v_tbl = '[]'::jsonb);
    severity := 'blocking';
    detail   := jsonb_build_object(
      'violations', v_bad,
      'actor_token_client_dml', v_tbl,
      'doors_checked', (select count(*) from hr.notify_outsider_door_baseline),
      'why', 'Every PostgREST-reachable SECURITY DEFINER door across public/communication/platform '
        || 'that touches an HR notify or outsider-token object must be credentialed (takes a '
        || 'session/token secret) or baselined (a reviewed, caller-gated door). The security arc '
        || 'closed four LIVE P0s of this exact class -- an anon SMS gate/resolver, an authenticated '
        || 'SMS enqueue, a cross-tenant mint_outsider_token, and a direct actor_token INSERT -- '
        || 'every one a grant a client role should never have held. Check 33 caught this inside '
        || 'hr.* only; this is the cross-schema generalization. A body scan for a caller gate is a '
        || 'false-positive trap (mint referenced auth.uid only to stamp issued_by), so this demands '
        || 'every reachable door be explicitly sanctioned and treats an un-sanctioned one as guilty. '
        || 'REACTIVE LIMIT: it runs against the LIVE db, so it fails CI after a hole is applied, not '
        || 'before -- the merge-time structural net, with the pre-apply DDL guard boarded for Arman.');
  end;
  return next;

end
$function$$anchor$);

  execute v_new;
end
$mig$;

-- ── 5. SELF-CHECK + CONTRACT ─────────────────────────────────────────────────────────────────────
do $chk$
declare v_fail integer;
begin
  perform 1 from hr.punch_write_path_conformance() where check_key = 'cross_schema_outsider_doors_baselined';
  if not found then
    raise exception 'hr_l3_107: check 35 did not land in the conformance function';
  end if;
  -- 🚨 SCOPED TO CHECK 35, not the whole suite (banked lesson: a security migration must not be
  -- held hostage by an unrelated lane's red). If check 35 itself is red, surface WHY.
  if exists (select 1 from hr.punch_write_path_conformance()
              where check_key = 'cross_schema_outsider_doors_baselined' and not ok) then
    raise exception 'hr_l3_107: check 35 is RED on landing: %',
      (select detail::text from hr.punch_write_path_conformance()
        where check_key = 'cross_schema_outsider_doors_baselined');
  end if;
end
$chk$;

insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason,
   is_active, must_be_definer, overloads_intended)
values
  ('hr', 'punch_write_path_conformance', 'hr_l3_107_check_35_cross_schema_outsider_audit',
   array['cross_schema_outsider_doors_baselined', 'notify_outsider_doors_client_reachable'],
   array[]::text[],
   'Check 35, the cross-schema outsider/EXECUTE audit — the structural generalization of check 33 '
   || 'that would have failed all four campaign P0s at CI instead of a verifier finding them live. '
   || 'A re-emit of the conformance function that drops this check removes the merge-time net for '
   || 'client-reachable senders/mints across public/communication/platform.',
   true, true, false)
on conflict do nothing;
