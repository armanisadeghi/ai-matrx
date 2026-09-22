-- SHARE-OUT / item 1 — A PLUMBER GIVES ONE CUSTOMER READ-ONLY ACCESS TO ONE TABLE.
--
-- THE REAL USE CASE. Rincon Plumbing Co replaced a water heater for a customer who now
-- wants to follow the work: when the crew is coming back, what was done, what is still
-- open. The office does not want her in the company — she is a customer, not a colleague —
-- and it certainly does not want her seeing Invoices, Customers, Parts or Crews. It wants
-- exactly one thing: she can open the Jobs table, read-only, and nothing else of the Ojai branch's
-- exists for her. Until today the store refused that, in a good sentence, with no way
-- forward from the dialog.
--
-- 🚨 THE SEAT. Every clause runs as `authenticated`, as a real person:
--   admin@admin.com  — owner of the branch, the office
--   test@test.com    — the customer, who has NO membership of that branch at all
-- Nothing below runs as the role that owns the store. A door that answers the operator
-- proves nothing about a person, and the whole question here is what an outsider sees.
--
-- 🚨 IT BUILDS ITS OWN BRANCH, AND HERE IS WHY. The first run of this suite proved clauses
-- 1 to 8 green against the live `Rincon Plumbing Co` organization — and then, between that
-- run and the next, another lane added test@test.com to it as a member, which makes every
-- clause here meaningless (an outsider who is a member is not an outsider). These
-- checkouts are shared and the test identities are shared, so a suite that depends on one
-- organization's roster staying still is a suite that goes green or red for reasons that
-- have nothing to do with the code. It therefore makes its OWN branch of the same real
-- business — Rincon Plumbing Co runs one per town, and there are eleven of them already —
-- with its own Jobs table and its own real jobs, through the doors, from the seat.
--
-- THE CLAUSES
--   1  with the outside lane shut, the invite refuses BY NAME and says who opens it
--   2  the customer sees nothing of the Ojai branch's while the lane is shut
--   3  with the lane open, the invite makes a PENDING invitation — and she still sees nothing
--   4  the dialog says "invited, not yet joined", with a resend and a revoke
--   5  nobody grants above their own level
--   6  she accepts, and the Jobs table OPENS from her seat, with its rows
--   7  every OTHER table of Rincon still refuses her, by name
--   8  the Ojai branch's people list is empty for her — an outside principal is not a member
--   9  revoking ends her access AT ONCE, in the same statement
--
-- The red twin is `shareout_outside_red.sql`: the same nine clauses against the bytes that
-- stood before SHARE-OUT.

\set ON_ERROR_STOP on

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'shareout_outside_green.sql'
\set requires 'grant:authenticated:custom.table_declare'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

do $green$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com, the office
  c_mara    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com, the customer
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_mara_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  c_mail    constant text := 'test@test.com';
  v_org     uuid := gen_random_uuid();   -- Rincon Plumbing Co — Ojai Branch, made here
  v_home    uuid;
  v_jobs    uuid;                        -- its Jobs table
  v_invoice uuid;                        -- its Invoices table
  v_job     jsonb;
  v_state   jsonb;
  v_out     jsonb;
  v_inv     uuid;
  v_token   text;
  v_rows    integer;
  v_msg     text;
  v_level   text;
begin
  perform set_config('app.actor_system', 'campaign.shareout.outside.green', true);

  -- ── SETUP: the branch, its two tables and its real work. ─────────────────────────
  -- The three steps no client door covers — creating the organization, its membership
  -- rows and its store switch — say so by happening here, as the operator. Everything
  -- after `set_config('role','authenticated')` is what a person can actually do.
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Rincon Plumbing Co — Ojai Branch',
          'rincon-plumbing-ojai-' || substr(v_org::text, 1, 8), 'RPO', c_admin);
  -- ONLY the office. The customer is deliberately NOT given a membership anywhere here,
  -- and because this branch is made in this transaction nobody else can give her one.
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom', 'system_enabled', 'organization', v_org, v_org, 'true'::jsonb,
          'SHARE-OUT seat suite: the Ojai branch keeps its jobs in the record store.');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Ojai Branch')) returning id into v_home;

  if exists (select 1 from iam.organization_member m
              where m.organization_id = v_org and m.user_id = c_mara) then
    raise exception 'SETUP FAILED: the customer is a MEMBER of the branch, so this suite would prove nothing';
  end if;

  -- ── THE SEAT. Everything below is what the office can actually make and do. ───────
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'SHARE-OUT outside: the seat was not taken — current_user is %', current_user;
  end if;

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

  v_invoice := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Invoices', 'slug', 'invoices', 'type', 'entity', 'display', 'list',
    'label_singular', 'Invoice', 'label_plural', 'Invoices', 'ordered', false, 'weight', 'light',
    'retention_days', 365, 'row_order', 'sorted', 'agent_writable', true,
    'parent_id', v_home::text, 'title_field', 'invoice_number', 'default_sort', '[]'::jsonb,
    'fields', jsonb_build_array(jsonb_build_object('name','invoice_number'),
                                jsonb_build_object('name','amount_due'))));

  -- Six jobs the Ojai crew actually runs in a week. The customer's own is the first.
  for v_job in select * from jsonb_array_elements(jsonb_build_array(
    jsonb_build_object('work_order','RPO-4471','address','812 Grand Ave, Ojai','problem','Water heater replacement — 50 gal gas, old unit leaking at the base','stage','Parts ordered','scheduled_for','2026-09-24'),
    jsonb_build_object('work_order','RPO-4472','address','1140 Maricopa Hwy, Ojai','problem','Kitchen line backing up into the dishwasher','stage','Scheduled','scheduled_for','2026-09-22'),
    jsonb_build_object('work_order','RPO-4473','address','305 N Montgomery St, Ojai','problem','Main shutoff valve weeping — replace gate valve','stage','In progress','scheduled_for','2026-09-21'),
    jsonb_build_object('work_order','RPO-4474','address','77 Cuyama Rd, Ojai','problem','Slab leak located under the hall bath; reroute quoted','stage','Awaiting approval','scheduled_for','2026-09-25'),
    jsonb_build_object('work_order','RPO-4475','address','2201 E Ojai Ave','problem','Tankless unit throwing error 11 — annual service and descale','stage','Done','scheduled_for','2026-09-18'),
    jsonb_build_object('work_order','RPO-4476','address','48 Signal St, Ojai','problem','Hose bib froze and split over the winter','stage','Done','scheduled_for','2026-09-17')))
  loop
    perform custom.record_write(v_org, v_jobs, v_job);
  end loop;

  perform custom.record_write(v_org, v_invoice,
    jsonb_build_object('invoice_number', 'RPO-INV-2210', 'amount_due', '1840'));

  -- ── CLAUSE 1 — the lane is shut, and the refusal says who opens it. ───────────────
  begin
    perform custom.table_share_outside_invite(v_org, v_jobs, c_mail, 'viewer'::public.permission_level);
    raise exception 'CLAUSE 1 FAILED: the invite went through with the outside lane shut';
  exception when insufficient_privilege then
    get stacked diagnostics v_msg = message_text;
    if v_msg !~ 'turned off' then
      raise exception 'CLAUSE 1 FAILED: the refusal does not say the lane is off: %', v_msg;
    end if;
    raise notice 'CLAUSE 1 OK: %', v_msg;
  end;

  -- And the dialog says the same thing, before anybody presses anything.
  v_state := custom.table_share_outside(v_org, v_jobs);
  if (v_state ->> 'lane_open')::boolean then
    raise exception 'CLAUSE 1 FAILED: the dialog says the lane is open when it is shut';
  end if;
  raise notice 'CLAUSE 1 OK (dialog): %', v_state ->> 'say';

  -- ── CLAUSE 2 — the customer sees nothing of the Ojai branch's. ────────────────────────────
  perform set_config('request.jwt.claims', c_mara_j, true);
  begin
    perform count(*) from custom.read_records(v_org, v_jobs, false, 5, 0);
    raise exception 'CLAUSE 2 FAILED: an outsider read the branch''s Jobs with the lane shut';
  exception when insufficient_privilege then
    get stacked diagnostics v_msg = message_text;
    raise notice 'CLAUSE 2 OK: %', v_msg;
  end;

  -- ── THE OFFICE OPENS ITS OWN OUTSIDE DOOR. An organization admin's own act. ───────
  perform set_config('request.jwt.claims', c_admin_j, true);
  v_out := platform.knob_override_set('custom', 'external_principal_enabled', 'organization',
             v_org, v_org, 'true'::jsonb,
             'The Ojai branch lets customers see the job they are waiting on.');
  if not coalesce((v_out ->> 'ok')::boolean, false) then
    raise exception 'SETUP FAILED: the office could not open its own outside door: %', v_out;
  end if;

  -- ── CLAUSE 3 — the invite makes a PENDING invitation, and nothing else. ──────────
  v_out := custom.table_share_outside_invite(v_org, v_jobs, c_mail, 'viewer'::public.permission_level);
  if not coalesce((v_out ->> 'invited')::boolean, false) or coalesce((v_out ->> 'joined')::boolean, true) then
    raise exception 'CLAUSE 3 FAILED: %', v_out;
  end if;
  v_inv   := (v_out ->> 'invitation_id')::uuid;
  v_token := v_out ->> 'token';
  raise notice 'CLAUSE 3 OK: %', v_out ->> 'say';

  -- She still sees nothing: an invitation holds nothing until it is taken up.
  perform set_config('request.jwt.claims', c_mara_j, true);
  begin
    perform count(*) from custom.read_records(v_org, v_jobs, false, 5, 0);
    raise exception 'CLAUSE 3 FAILED: an INVITED but unaccepted person read the branch''s Jobs';
  exception when insufficient_privilege then
    get stacked diagnostics v_msg = message_text;
    raise notice 'CLAUSE 3 OK (pending holds nothing): %', v_msg;
  end;

  -- ── CLAUSE 4 — the dialog says "invited, not yet joined", and both controls work. ─
  perform set_config('request.jwt.claims', c_admin_j, true);
  v_state := custom.table_share_outside(v_org, v_jobs);
  if jsonb_array_length(v_state -> 'invitations') <> 1
     or (v_state -> 'invitations' -> 0 ->> 'joined')::boolean
     or (v_state -> 'invitations' -> 0 ->> 'status') <> 'pending' then
    raise exception 'CLAUSE 4 FAILED: %', v_state -> 'invitations';
  end if;
  raise notice 'CLAUSE 4 OK: %', v_state -> 'invitations' -> 0 ->> 'say';

  v_out := custom.table_share_outside_resend(v_org, v_inv);
  if (v_out ->> 'token') = v_token then
    raise exception 'CLAUSE 4 FAILED: resend handed back the SAME link';
  end if;
  v_token := v_out ->> 'token';
  raise notice 'CLAUSE 4 OK (resend): %', v_out ->> 'say';

  -- ── CLAUSE 5 — the outside lane is for OUTSIDERS, and it says so. ───────────────
  -- Inviting somebody who is already in the organization is not the outside lane at all,
  -- and an invitation that sat there unaccepted beside a grant they can have right now
  -- would be a dead control. It refuses, naming the lane that does work.
  begin
    perform custom.table_share_outside_invite(v_org, v_jobs, 'admin@admin.com', 'viewer'::public.permission_level);
    raise exception 'CLAUSE 5 FAILED: the office invited ITSELF from outside';
  exception when unique_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg !~ 'already in' then
      raise exception 'CLAUSE 5 FAILED: wrong refusal: %', v_msg;
    end if;
    raise notice 'CLAUSE 5 OK: %', v_msg;
  end;

  -- ── CLAUSE 6 — she accepts, and Jobs OPENS from her seat. ───────────────────────
  perform set_config('request.jwt.claims', c_mara_j, true);
  v_out := custom.table_share_outside_accept(v_token);
  if not coalesce((v_out ->> 'accepted')::boolean, false) then
    raise exception 'CLAUSE 6 FAILED: %', v_out;
  end if;
  raise notice 'CLAUSE 6 OK (accept): %', v_out ->> 'say';

  select count(*) into v_rows from custom.read_records(v_org, v_jobs, false, 500, 0);
  if v_rows < 1 then
    raise exception 'CLAUSE 6 FAILED: the table opened but held % rows for her', v_rows;
  end if;
  v_level := custom.my_level(v_org, v_jobs, 'table')::text;
  if v_level is distinct from 'viewer' then
    raise exception 'CLAUSE 6 FAILED: she holds % on Jobs, not viewer', v_level;
  end if;
  raise notice 'CLAUSE 6 OK: the customer opens the branch''s Jobs table and reads % job(s), at %', v_rows, v_level;

  -- ── CLAUSE 7 — every OTHER table of Rincon refuses her, by name. ───────────────
  begin
    perform count(*) from custom.read_records(v_org, v_invoice, false, 5, 0);
    raise exception 'CLAUSE 7 FAILED: the customer read the branch''s INVOICES';
  exception when insufficient_privilege then
    get stacked diagnostics v_msg = message_text;
    raise notice 'CLAUSE 7 OK (Invoices): %', v_msg;
  end;
  -- And she cannot see that the other tables EXIST. The Tables list is itself read through
  -- the store's own list door, from her seat, and it is her list — not the Ojai branch's.
  select count(*) into v_rows from custom.read_records(v_org, custom.table_kernel_id(), false, 500, 0);
  if v_rows <> 1 then
    raise exception 'CLAUSE 7 FAILED: the customer can see % of the branch''s tables, not just the one shared with her', v_rows;
  end if;
  raise notice 'CLAUSE 7 OK: exactly % table of the branch''s exists for her — the one she was given', v_rows;

  -- ── CLAUSE 8 — the Ojai branch's people list is shut to her. ────────────────────────────
  select count(*) into v_rows from iam.organization_member m where m.organization_id = v_org;
  if v_rows <> 0 then
    raise exception 'CLAUSE 8 FAILED: the customer can see % of the branch''s people', v_rows;
  end if;
  raise notice 'CLAUSE 8 OK: the branch''s member list holds 0 rows for her — an outside principal is not a member';

  -- ── CLAUSE 9 — revoking ends it AT ONCE. ──────────────────────────────────────
  perform set_config('request.jwt.claims', c_admin_j, true);
  v_out := custom.table_share_outside_revoke(v_org, v_inv);
  if not coalesce((v_out ->> 'revoked')::boolean, false)
     or coalesce((v_out ->> 'grants_removed')::integer, 0) < 1 then
    raise exception 'CLAUSE 9 FAILED: %', v_out;
  end if;
  raise notice 'CLAUSE 9 OK: %', v_out ->> 'say';

  perform set_config('request.jwt.claims', c_mara_j, true);
  begin
    perform count(*) from custom.read_records(v_org, v_jobs, false, 5, 0);
    raise exception 'CLAUSE 9 FAILED: the customer still reads Jobs after the revoke';
  exception when insufficient_privilege then
    get stacked diagnostics v_msg = message_text;
    raise notice 'CLAUSE 9 OK (access ended in the same statement): %', v_msg;
  end;

  raise notice 'SHARE-OUT / item 1 GREEN: all nine clauses passed from the two real seats.';
end;
$green$;
