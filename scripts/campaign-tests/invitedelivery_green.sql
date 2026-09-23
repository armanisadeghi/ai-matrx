-- INVITE-DELIVERY — THE INVITATION ACTUALLY REACHES THE PERSON.
--
-- THE REAL USE CASE, continued from SHARE-OUT. Rincon Plumbing Co's Ojai branch replaced
-- a water heater at 812 Grand Ave. The customer wants to follow the work. The office
-- shares the Jobs table with her, read-only — and until this lane, NOTHING happened next.
-- The token was minted into a column nobody could read, no message went anywhere, and the
-- dialog said "Invited, not yet joined" forever. She never learned a table had been
-- shared with her; the office never learned nothing had been sent.
--
-- 🚨 THE SEAT. Every clause runs as `authenticated`, as a real person:
--   admin@admin.com  — owner of the branch, the office
--   test@test.com    — the customer, who has NO membership of that branch at all
-- plus one clause from NO seat at all (`anon`), because the person on the other end of an
-- invitation link usually has no account — that is what "outside" means.
--
-- 🚨 IT BUILDS ITS OWN BRANCH, for the reason SHARE-OUT's suite gives in full: these
-- checkouts and these two test identities are shared, and another lane added test@test.com
-- to the live `Rincon Plumbing Co` as a member on 2026-09-21, which makes every clause
-- about an outsider meaningless. Rincon runs one branch per town.
--
-- THE CLAUSES
--   1  the dialog says HONESTLY whether this server can send email — yes / no / unknown,
--      never a bare boolean, and every answer names the copy-the-link remedy
--   2  inviting her writes a notice onto the ONE spine (communication.notification),
--      addressed to her, carrying the accept link — no second mailer anywhere
--   3  the sharer is handed the link, from the invite AND from the dialog's own list
--   4  the words are not invented here: the notice waits at render_pending for the ONE
--      renderer, and the event's templates are on the registry row
--   5  a resend mints a fresh token, sends again, and the OLD link stops working at once
--   6  revoking invalidates the link in the same statement — the peek says WHICH, and who
--      to ask, instead of a dead end
--   7  the peek tells the truth to somebody with no account at all, and to somebody signed
--      in with the wrong address — an honest sentence, never a dead end
--   8  an unknown token learns NOTHING: the same one sentence, and no table, organization
--      or inviter name anywhere in the answer
--
-- The red twin is `invitedelivery_red.sql`: the same clauses against the bytes that stood
-- before this lane.

\set ON_ERROR_STOP on

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'invitedelivery_green.sql'
\set requires 'grant:authenticated:custom.table_declare'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

-- FIXTURE-ORGS 2026-09-23: this suite's DO block used to run in autocommit, so every run
-- COMMITTED a fresh branch organization (random slug, same realistic name) and left it on the
-- database — the look-alike rows in a member's Shared-with-me. The branch is still built fresh
-- (the outsider clauses need a company test@test.com is not in), but inside ONE transaction
-- that rolls back, so a run leaves nothing.
begin;

do $green$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com, the office
  c_mara    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com, the customer
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_mara_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  c_mail    constant text := 'test@test.com';
  v_boss    text := current_user;
  v_org     uuid := gen_random_uuid();   -- Rincon Plumbing Co — Ojai Branch, made here
  v_home    uuid;
  v_jobs    uuid;
  v_job     jsonb;
  v_state   jsonb;
  v_out     jsonb;
  v_peek    jsonb;
  v_inv     uuid;
  v_token   text;
  v_token2  text;
  v_n       integer;
  v_answer  text;
  v_link    text;
  v_all     text;
begin
  perform set_config('app.actor_system', 'campaign.invitedelivery.green', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  -- ── SETUP: the branch and its Jobs table. Three steps no client door covers. ──────
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Rincon Plumbing Co — Ojai Branch',
          'rincon-plumbing-ojai-' || substr(v_org::text, 1, 8), 'RPO', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom', 'system_enabled', 'organization', v_org, v_org, 'true'::jsonb,
          'INVITE-DELIVERY seat suite: the Ojai branch keeps its jobs in the record store.'),
         ('custom', 'external_principal_enabled', 'organization', v_org, v_org, 'true'::jsonb,
          'INVITE-DELIVERY seat suite: the branch lets customers follow their own job.');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Ojai Branch')) returning id into v_home;

  if exists (select 1 from iam.organization_member m
              where m.organization_id = v_org and m.user_id = c_mara) then
    raise exception 'SETUP FAILED: the customer is a MEMBER of the branch, so this suite would prove nothing';
  end if;

  -- ── PART 0 — TAKE THE SEAT AND PROVE IT. ─────────────────────────────────────────
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this suite did not take the seat — current_user is %', current_user;
  end if;
  if pg_has_role(current_user,
                 (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass),
                 'member') then
    raise exception '0: this seat is a member of the role that owns custom.record, so every wall would open on its first line';
  end if;
  begin
    perform 1 from custom.record limit 1;
    raise exception '0: this seat can SELECT custom.record directly, so it is not a client seat';
  exception when insufficient_privilege then null;
  end;

  v_jobs := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Jobs', 'slug', 'jobs', 'type', 'entity', 'display', 'list',
    'label_singular', 'Job', 'label_plural', 'Jobs', 'ordered', false, 'weight', 'light',
    'retention_days', 365, 'row_order', 'sorted', 'agent_writable', true,
    'parent_id', v_home::text, 'title_field', 'work_order', 'default_sort', '[]'::jsonb,
    'fields', jsonb_build_array(jsonb_build_object('name','work_order'),
                                jsonb_build_object('name','address'),
                                jsonb_build_object('name','problem'),
                                jsonb_build_object('name','stage'),
                                jsonb_build_object('name','scheduled_for'))));

  for v_job in select * from jsonb_array_elements(jsonb_build_array(
    jsonb_build_object('work_order','RPO-4471','address','812 Grand Ave, Ojai','problem','Water heater replacement — 50 gal gas, old unit leaking at the base','stage','Parts ordered','scheduled_for','2026-09-24'),
    jsonb_build_object('work_order','RPO-4472','address','1140 Maricopa Hwy, Ojai','problem','Kitchen line backing up into the dishwasher','stage','Scheduled','scheduled_for','2026-09-22'),
    jsonb_build_object('work_order','RPO-4473','address','305 N Montgomery St, Ojai','problem','Main shutoff valve weeping — replace gate valve','stage','In progress','scheduled_for','2026-09-21')))
  loop
    perform custom.record_write(v_org, v_jobs, v_job);
  end loop;

  -- ═══ CLAUSE 1 — THE SCREEN NEVER PROMISES AN EMAIL THIS SERVER CANNOT SEND. ═══════
  v_state  := custom.table_share_outside(v_org, v_jobs);
  v_answer := v_state -> 'email_delivery' ->> 'answer';

  if v_answer is null then
    raise exception '1 FAILED: the dialog was told nothing about whether email works here';
  end if;
  if v_answer not in ('yes', 'no', 'unknown') then
    raise exception '1 FAILED: "%" is not one of yes / no / unknown', v_answer;
  end if;
  -- 🚨 THE HALF THAT MATTERS: "we could not look" is NOT "no". A boolean here would make
  -- an unchecked server indistinguishable from one with no mail configured.
  if v_answer = 'unknown' and (v_state -> 'email_delivery' -> 'configured') <> 'null'::jsonb then
    raise exception '1 FAILED: an unknown answer still carried a true/false — a failed check printed as a fact';
  end if;
  -- Every one of the three answers points at the thing a person can actually do.
  if position('copy the link' in lower(v_state ->> 'email_say')) = 0 then
    raise exception '1 FAILED: the email sentence does not offer the link — "%"', v_state ->> 'email_say';
  end if;
  raise notice 'CLAUSE 1 OK (email on this server = %): %', v_answer, v_state ->> 'email_say';

  -- ═══ CLAUSE 2 — THE INVITE WRITES A NOTICE ONTO THE ONE SPINE. ═══════════════════
  v_out   := custom.table_share_outside_invite(v_org, v_jobs, c_mail, 'viewer');
  v_inv   := (v_out ->> 'invitation_id')::uuid;
  v_token := v_out ->> 'token';

  select count(*) into v_n
    from communication.notification n
   where n.target_id = v_inv
     and n.event_key = 'share.table_invited'
     and n.organization_id = v_org;
  if v_n = 0 then
    raise exception '2 FAILED: inviting % sent nothing at all — this is the defect this lane exists to close', c_mail;
  end if;

  -- Addressed to HER, carrying the link, in the platform's own outbox.
  select count(*) into v_n
    from communication.notification n
   where n.target_id = v_inv and n.channel = 'email'
     and lower(n.to_address) = c_mail
     and n.deep_link = '/invitations/table/accept/' || v_token;
  if v_n <> 1 then
    raise exception '2 FAILED: expected exactly one email notice addressed to % carrying the accept link, found %', c_mail, v_n;
  end if;
  raise notice 'CLAUSE 2 OK: % notice(s) on communication.notification for this invitation, the email one addressed to % with the link',
    (select count(*) from communication.notification where target_id = v_inv), c_mail;
  raise notice 'CLAUSE 2 OK (what the office is told): %', v_out ->> 'delivery_say';

  -- ═══ CLAUSE 3 — THE SHARER IS HANDED THE LINK. ═══════════════════════════════════
  -- A plumber texting a customer a link is the ORDINARY case, not the fallback.
  if v_out ->> 'accept_path' is distinct from '/invitations/table/accept/' || v_token then
    raise exception '3 FAILED: the invite did not hand back the link — %', coalesce(v_out ->> 'accept_path', '(nothing)');
  end if;

  v_state := custom.table_share_outside(v_org, v_jobs);
  select r ->> 'accept_path' into v_link
    from jsonb_array_elements(v_state -> 'invitations') r
   where (r ->> 'invitation_id')::uuid = v_inv;
  if v_link is distinct from '/invitations/table/accept/' || v_token then
    raise exception '3 FAILED: the pending row in the dialog carries no link to copy — %', coalesce(v_link, '(nothing)');
  end if;
  raise notice 'CLAUSE 3 OK: the office can copy % from the pending row beside "Invited, not yet joined"', v_link;

  -- ═══ CLAUSE 4 — THE WORDS ARE NOT INVENTED HERE. ═════════════════════════════════
  -- There is ONE template renderer and it is Python. This transaction writes the FACTS;
  -- the notice waits at render_pending for services/notifications/render_pass.py.
  select count(*) into v_n
    from communication.notification n
   where n.target_id = v_inv and n.status = 'render_pending';
  if v_n = 0 then
    raise exception '4 FAILED: nothing is waiting for the renderer, so either a second renderer was invented here or the notice was dropped';
  end if;
  if not exists (select 1 from communication.notification n
                  where n.target_id = v_inv
                    and n.payload -> 'invite' ->> 'table' = 'Jobs'
                    and n.payload -> 'invite' ->> 'organization' = 'Rincon Plumbing Co — Ojai Branch'
                    and n.payload -> 'invite' ->> 'token' = v_token
                    and coalesce(n.payload -> 'invite' ->> 'means', '') <> ''
                    and coalesce(n.payload -> 'invite' ->> 'inviter', '') <> ''
                    and coalesce(n.payload -> 'invite' ->> 'expires', '') <> '') then
    raise exception '4 FAILED: the notice does not carry every merge field its template names — the strict renderer would refuse it and it would reach nobody';
  end if;
  if not exists (select 1 from communication.notification_event_type t
                  where t.event_key = 'share.table_invited'
                    and coalesce(t.config -> 'templates' -> 'email' ->> 'body', '') <> ''
                    and coalesce(t.config -> 'templates' -> 'in_app' ->> 'body', '') <> '') then
    raise exception '4 FAILED: the event has no templates, so every notice would be a no_template skip';
  end if;
  raise notice 'CLAUSE 4 OK: % notice(s) waiting for the ONE renderer, carrying every field its template names', v_n;

  -- ═══ CLAUSE 5 — A RESEND SENDS AGAIN, AND THE OLD LINK DIES AT ONCE. ═════════════
  v_out    := custom.table_share_outside_resend(v_org, v_inv);
  v_token2 := v_out ->> 'token';
  if v_token2 = v_token then
    raise exception '5 FAILED: the resend did not mint a fresh token';
  end if;
  select count(*) into v_n
    from communication.notification n
   where n.target_id = v_inv and n.channel = 'email'
     and n.deep_link = '/invitations/table/accept/' || v_token2;
  if v_n <> 1 then
    raise exception '5 FAILED: the resend sent nothing — found % email notice(s) for the fresh link', v_n;
  end if;

  -- THE OLD ONE STOPS WORKING IMMEDIATELY, and says so rather than dying silently.
  v_peek := public.table_share_peek(v_token);
  if (v_peek ->> 'usable')::boolean then
    raise exception '5 FAILED: the OLD link still works after a resend';
  end if;
  raise notice 'CLAUSE 5 OK (resend): %', v_out ->> 'delivery_say';
  raise notice 'CLAUSE 5 OK (the old link): %', v_peek ->> 'say';

  -- ═══ CLAUSE 6 — SHE OPENS IT, AND A REVOKE KILLS THE LINK IN THE SAME STATEMENT. ══
  perform set_config('request.jwt.claims', c_mara_j, true);
  v_peek := public.table_share_peek(v_token2);
  if v_peek ->> 'state' <> 'ready' then
    raise exception '6 FAILED: the invited person cannot use her own fresh link — % (%)',
      v_peek ->> 'state', v_peek ->> 'say';
  end if;
  -- She sees WHAT she is being offered before she is asked to do anything.
  if v_peek ->> 'table' <> 'Jobs'
     or v_peek ->> 'organization' <> 'Rincon Plumbing Co — Ojai Branch'
     or coalesce(v_peek ->> 'inviter', '') = ''
     or coalesce(v_peek ->> 'level_label', '') = '' then
    raise exception '6 FAILED: the offer does not say which table, whose organization, at what level, from whom';
  end if;
  raise notice 'CLAUSE 6 OK (what she is offered): %', v_peek ->> 'offer';

  v_out := custom.table_share_outside_accept(v_token2);
  select count(*) into v_n from custom.read_records(v_org, v_jobs, true, 200, 0);
  if v_n <> 3 then
    raise exception '6 FAILED: she accepted and then read % job(s) instead of 3', v_n;
  end if;
  raise notice 'CLAUSE 6 OK: the customer opens the branch''s Jobs table and reads % job(s), at %',
    v_n, v_out ->> 'level';

  perform set_config('request.jwt.claims', c_admin_j, true);
  v_out := custom.table_share_outside_revoke(v_org, v_inv);
  perform set_config('request.jwt.claims', c_mara_j, true);
  v_peek := public.table_share_peek(v_token2);
  if (v_peek ->> 'usable')::boolean or v_peek ->> 'state' <> 'revoked' then
    raise exception '6 FAILED: the link still works after the revoke — state %', v_peek ->> 'state';
  end if;
  if coalesce(v_peek ->> 'ask', '') = '' then
    raise exception '6 FAILED: a dead link with nobody to ask is a dead end';
  end if;
  raise notice 'CLAUSE 6 OK (revoked): % / %', v_peek ->> 'say', v_peek ->> 'ask';

  -- ═══ CLAUSE 7 — THE TRUTH TO A STRANGER, AND TO THE WRONG ACCOUNT. ══════════════
  -- A fresh invitation, so the state under test is the account and not the revoke.
  perform set_config('request.jwt.claims', c_admin_j, true);
  v_out   := custom.table_share_outside_invite(v_org, v_jobs, 'dispatch@rinconplumbing-ojai.test', 'viewer');
  v_token := v_out ->> 'token';

  -- (a) NOBODY AT ALL. The person on the other end of an invitation link has no account:
  --     that is what "outside" means, and the page must not ask before it explains.
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'anon', true);
  if current_user <> 'anon' then
    raise exception '7 FAILED: could not take the anonymous seat — current_user is %', current_user;
  end if;
  v_peek := public.table_share_peek(v_token);
  if v_peek ->> 'state' <> 'sign_in_needed' then
    raise exception '7 FAILED: a signed-out reader got "%" instead of being told to sign in', v_peek ->> 'state';
  end if;
  if v_peek ->> 'table' <> 'Jobs' then
    raise exception '7 FAILED: a signed-out reader is not told what is being offered, so the page must ask before it explains';
  end if;
  -- The invited address is MASKED to anyone not signed in as that person.
  if v_peek ->> 'invited_email' like '%dispatch@%' then
    raise exception '7 FAILED: the invited address came back unmasked to a stranger — %', v_peek ->> 'invited_email';
  end if;
  raise notice 'CLAUSE 7 OK (no account at all): % — %', v_peek ->> 'offer', v_peek ->> 'say';

  -- (b) THE WRONG ACCOUNT. An honest sentence, not a dead end.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', c_mara_j, true);
  v_peek := public.table_share_peek(v_token);
  if v_peek ->> 'state' <> 'wrong_account' then
    raise exception '7 FAILED: signed in as the wrong person and got "%"', v_peek ->> 'state';
  end if;
  if position(c_mail in v_peek ->> 'say') = 0 then
    raise exception '7 FAILED: the sentence does not say which address she is actually using';
  end if;
  raise notice 'CLAUSE 7 OK (wrong account): % / %', v_peek ->> 'say', v_peek ->> 'ask';

  -- ═══ CLAUSE 8 — AN UNKNOWN TOKEN LEARNS NOTHING. ════════════════════════════════
  v_peek := public.table_share_peek(gen_random_uuid()::text);
  v_all  := v_peek::text;
  if v_peek ->> 'state' <> 'unknown' or (v_peek ->> 'usable')::boolean then
    raise exception '8 FAILED: a made-up token was not refused';
  end if;
  if v_all ilike '%Jobs%' or v_all ilike '%Rincon%' or v_all ilike '%@%' then
    raise exception '8 FAILED: a made-up token learned something — %', v_all;
  end if;
  raise notice 'CLAUSE 8 OK: %', v_peek ->> 'say';

  perform set_config('role', v_boss, true);
  raise notice 'INVITE-DELIVERY green: all eight clauses passed from the seat.';
end
$green$;

rollback;
