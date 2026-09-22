-- PORTAL-BIND — A CLIENT FOLLOWS HER LINK AND SEES HER OWN JOBS AND HER OWN INVOICES.
--
-- THE REAL USE CASE. Rincon Plumbing Co runs one branch per town; the Carpinteria branch
-- re-piped a duplex on Casitas Pass Rd over three visits and billed it in two parts. The owner
-- of the duplex keeps ringing the office to ask when the crew is back and what is still owed.
-- The office does not want her in the company and certainly does not want her seeing the other
-- customers, the crews, the parts or anybody else's invoices. It wants one thing: she signs in
-- and sees HER jobs and HER invoices.
--
-- 🚨 WHAT THIS LANE FIXED, AND WHAT THE RED TWIN MEASURES. Before 2026-09-21 that could not
-- finish. `custom.portal_principal_bind` wrote her grant through `custom.share_grant`, and
-- `share_grant` judges the CALLER at `admin` on the record being shared — which the customer
-- arriving on her own link has never held and never will. Lane GUARD-STAMPS measured the honest
-- arm reaching the decision and dying one call later. `portalbind_red.sql` puts those exact
-- bytes back inside a transaction that rolls back, and watches it die there.
--
-- 🚨 THE SEAT. Every clause runs as `authenticated`, as a real person:
--   admin@admin.com  — the Carpinteria office
--   test@test.com    — the duplex owner, who has NO membership of that branch at all
-- plus two clauses from NO seat at all (`anon`), because the person on the other end of a
-- portal invitation usually has no account — that is what "outside" means.
--
-- 🚨 IT BUILDS ITS OWN BRANCH, for the reason SHARE-OUT's suite gives in full: these checkouts
-- and these two test identities are shared, and another lane made test@test.com a MEMBER of the
-- live `Rincon Plumbing Co` on 2026-09-21, which would make every clause about an outsider
-- meaningless.
--
-- THE CLAUSES
--   1  the office invites her: one portal principal, one invitation on the ONE invitation
--      primitive (target_type portal_principal), one minted token, one link to copy
--   2  a notice is written on the ONE spine, addressed to her, carrying that link — and the
--      office is told honestly whether this server can actually send email
--   3  the link tells a signed-out stranger WHAT is on offer before asking them to sign in,
--      and an unknown token learns nothing at all
--   4  she accepts, and the accept COMPLETES — the bind and the grant in one transaction,
--      performed as the authority the token carries, never asking her for a level
--   5  she reads her own jobs and her own invoices, and only hers
--   6  every other table of the branch refuses her by name, and the branch's people list
--      holds nothing for her — an external principal is not a member
--   7  the invitation is not a membership: `inv_accept` refuses it by name with the door that
--      does take it, and `inv_for_me` does not offer it
--   8  the office revokes, and it is total in one statement: the records stop reaching her AND
--      the link dies, with the peek saying which way and who to ask

\set ON_ERROR_STOP on

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'portalbind_green.sql'
\set requires 'grant:authenticated:custom.table_declare'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

do $green$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com, the office
  c_owner   constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com, the duplex owner
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_own_j   constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  c_mail    constant text := 'test@test.com';
  v_boss    text := current_user;
  v_org     uuid := gen_random_uuid();   -- Rincon Plumbing Co — Carpinteria Branch, made here
  v_home    uuid;
  v_cust    uuid;
  v_jobs    uuid;
  v_invs    uuid;
  v_crews   uuid;
  v_her     uuid;
  v_him     uuid;
  v_portal  uuid;
  v_princ   uuid;
  v_row     jsonb;
  v_out     jsonb;
  v_peek    jsonb;
  v_acc     jsonb;
  v_token   text;
  v_link    text;
  v_n       integer;
  v_caught  text;
  v_seen    text;
begin
  perform set_config('app.actor_system', 'campaign.portalbind.green', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  -- ── SETUP: the branch. Three steps no client door covers. ────────────────────────────
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Rincon Plumbing Co — Carpinteria Branch',
          'rincon-plumbing-carpinteria-' || substr(v_org::text, 1, 8), 'RPC', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom', 'system_enabled', 'organization', v_org, v_org, 'true'::jsonb,
          'PORTAL-BIND seat suite: the Carpinteria branch keeps its jobs and invoices in the record store.'),
         ('custom', 'external_principal_enabled', 'organization', v_org, v_org, 'true'::jsonb,
          'PORTAL-BIND seat suite: the branch lets its customers follow their own work.');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Carpinteria Branch')) returning id into v_home;

  if exists (select 1 from iam.organization_member m
              where m.organization_id = v_org and m.user_id = c_owner) then
    raise exception 'SETUP FAILED: the customer is a MEMBER of the branch, so this suite would prove nothing';
  end if;

  -- ── PART 0 — TAKE THE SEAT AND PROVE IT. ─────────────────────────────────────────────
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

  -- ── THE BRANCH'S REAL TABLES, built through the doors as the office. ─────────────────
  v_cust := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Customers', 'slug', 'customers', 'type', 'entity', 'display', 'list',
    'label_singular', 'Customer', 'label_plural', 'Customers', 'ordered', false, 'weight', 'light',
    'retention_days', 3650, 'row_order', 'sorted', 'agent_writable', true,
    'parent_id', v_home::text, 'title_field', 'customer_name', 'default_sort', '[]'::jsonb,
    'fields', jsonb_build_array(jsonb_build_object('name','customer_name'),
                                jsonb_build_object('name','service_address'),
                                jsonb_build_object('name','contact_email'))));
  v_jobs := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Jobs', 'slug', 'jobs', 'type', 'entity', 'display', 'list',
    'label_singular', 'Job', 'label_plural', 'Jobs', 'ordered', false, 'weight', 'light',
    'retention_days', 365, 'row_order', 'sorted', 'agent_writable', true,
    'parent_id', v_home::text, 'title_field', 'work_order', 'default_sort', '[]'::jsonb,
    'fields', jsonb_build_array(jsonb_build_object('name','work_order'),
                                jsonb_build_object('name','problem'),
                                jsonb_build_object('name','stage'),
                                jsonb_build_object('name','scheduled_for'))));
  v_invs := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Invoices', 'slug', 'invoices', 'type', 'entity', 'display', 'list',
    'label_singular', 'Invoice', 'label_plural', 'Invoices', 'ordered', false, 'weight', 'light',
    'retention_days', 3650, 'row_order', 'sorted', 'agent_writable', true,
    'parent_id', v_home::text, 'title_field', 'invoice_no', 'default_sort', '[]'::jsonb,
    'fields', jsonb_build_array(jsonb_build_object('name','invoice_no'),
                                jsonb_build_object('name','amount_due'),
                                jsonb_build_object('name','status'))));

  -- THE FIELD THAT NAMES THE CLIENT, on BOTH tables. A plumbing invoice names the customer it
  -- is billed to; that is what makes "your invoices" answerable at all.
  perform custom.field_declare(v_org, v_cust, jsonb_build_object('key','customer_name','label','Customer name','plain','text','sort',10));
  perform custom.field_declare(v_org, v_cust, jsonb_build_object('key','service_address','label','Service address','plain','text','sort',20));
  perform custom.field_declare(v_org, v_cust, jsonb_build_object('key','contact_email','label','Contact email','plain','text','sort',30));
  perform custom.field_declare(v_org, v_jobs, jsonb_build_object('key','work_order','label','Work order','plain','text','sort',10));
  perform custom.field_declare(v_org, v_jobs, jsonb_build_object('key','problem','label','Problem','plain','text','sort',20));
  perform custom.field_declare(v_org, v_jobs, jsonb_build_object('key','stage','label','Stage','plain','text','sort',30));
  perform custom.field_declare(v_org, v_jobs, jsonb_build_object('key','scheduled_for','label','Scheduled for','plain','text','sort',40));
  perform custom.field_declare(v_org, v_jobs, jsonb_build_object(
    'label','Customer','type','relation','relation_target', v_cust::text,
    'on_target_delete','set_null','multi', false,'sort',5));
  perform custom.field_declare(v_org, v_invs, jsonb_build_object('key','invoice_no','label','Invoice no','plain','text','sort',10));
  perform custom.field_declare(v_org, v_invs, jsonb_build_object('key','amount_due','label','Amount due','plain','text','sort',20));
  perform custom.field_declare(v_org, v_invs, jsonb_build_object('key','status','label','Status','plain','text','sort',30));
  perform custom.field_declare(v_org, v_invs, jsonb_build_object(
    'label','Customer','type','relation','relation_target', v_cust::text,
    'on_target_delete','set_null','multi', false,'sort',5));

  v_crews := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Crews', 'slug', 'crews', 'type', 'entity', 'display', 'list',
    'label_singular', 'Crew', 'label_plural', 'Crews', 'ordered', false, 'weight', 'light',
    'retention_days', 3650, 'row_order', 'sorted', 'agent_writable', true,
    'parent_id', v_home::text, 'title_field', 'crew_name', 'default_sort', '[]'::jsonb,
    'fields', jsonb_build_array(jsonb_build_object('name','crew_name'),
                                jsonb_build_object('name','truck'))));
  perform custom.field_declare(v_org, v_crews, jsonb_build_object('key','crew_name','label','Crew','plain','text','sort',10));
  perform custom.field_declare(v_org, v_crews, jsonb_build_object('key','truck','label','Truck','plain','text','sort',20));
  perform custom.record_write(v_org, v_crews, jsonb_build_object('crew_name','Gil Ortega / apprentice','truck','Truck 3'));
  perform custom.record_write(v_org, v_crews, jsonb_build_object('crew_name','Nadia Brandt','truck','Truck 5'));

  -- Two real customers, so "only hers" has something to be wrong about.
  v_her := custom.record_write(v_org, v_cust, jsonb_build_object(
    'customer_name','Marisol Vega', 'service_address','1043 Casitas Pass Rd, Carpinteria',
    'contact_email', c_mail));
  v_him := custom.record_write(v_org, v_cust, jsonb_build_object(
    'customer_name','Ellery Tran', 'service_address','688 Linden Ave, Carpinteria',
    'contact_email','office@rincon-carpinteria.invalid'));

  perform custom.record_write(v_org, v_jobs, jsonb_build_object(
    'work_order','RPC-2214','problem','Re-pipe upstairs unit — galvanised supply lines, two bathrooms',
    'stage','In progress','scheduled_for','2026-09-23','customer', v_her::text));
  perform custom.record_write(v_org, v_jobs, jsonb_build_object(
    'work_order','RPC-2215','problem','Re-pipe downstairs unit — kitchen and laundry stack',
    'stage','Parts ordered','scheduled_for','2026-09-29','customer', v_her::text));
  perform custom.record_write(v_org, v_jobs, jsonb_build_object(
    'work_order','RPC-2219','problem','Tankless water heater descale — annual service',
    'stage','Scheduled','scheduled_for','2026-10-02','customer', v_him::text));

  perform custom.record_write(v_org, v_invs, jsonb_build_object(
    'invoice_no','INV-2214-A','amount_due','4,180.00','status','Paid','customer', v_her::text));
  perform custom.record_write(v_org, v_invs, jsonb_build_object(
    'invoice_no','INV-2215-A','amount_due','2,940.00','status','Due 30 Sep','customer', v_her::text));
  perform custom.record_write(v_org, v_invs, jsonb_build_object(
    'invoice_no','INV-2219-A','amount_due','285.00','status','Due 9 Oct','customer', v_him::text));

  -- The portal: customers come from Customers, and see Jobs and Invoices.
  v_portal := custom.portal_declare(v_org, 'Your jobs and invoices', v_cust, jsonb_build_array(
    jsonb_build_object('table_id', v_jobs::text, 'names_via', 'customer',
                       'visible_fields', jsonb_build_array('work_order','problem','stage','scheduled_for'),
                       'editable_fields', '[]'::jsonb, 'comments', false),
    jsonb_build_object('table_id', v_invs::text, 'names_via', 'customer',
                       'visible_fields', jsonb_build_array('invoice_no','amount_due','status'),
                       'editable_fields', '[]'::jsonb, 'comments', false)));

  -- ════════════════ CLAUSE 1 — the office invites her, and is handed a link ════════════
  v_out   := custom.portal_invite(v_org, v_portal, v_her, c_mail);
  v_princ := (v_out ->> 'principal_id')::uuid;
  v_token := v_out ->> 'token';
  v_link  := v_out ->> 'accept_path';

  if v_token is null or v_link is null then
    raise exception '1: the invite handed the office no link — %', v_out::text;
  end if;
  if coalesce((v_out ->> 'bound')::boolean, true) then
    raise exception '1: an invitation nobody has followed reads as bound, which would mean it holds access';
  end if;
  select count(*) into v_n from iam.invitations i
   where i.target_type = 'portal_principal' and i.target_id = v_princ
     and i.organization_id = v_org and i.status = 'pending' and i.deleted_at is null;
  if v_n <> 1 then
    raise exception '1: the ONE invitation primitive holds % row(s) for this portal principal, not 1', v_n;
  end if;
  raise notice 'CLAUSE 1 OK: % — %', v_out ->> 'say', v_link;
  raise notice 'CLAUSE 1 OK (what she will see): %', v_out ->> 'sees';

  -- ════════════════ CLAUSE 2 — the notice, on the ONE spine ════════════════════════════
  select count(*) into v_n from communication.notification n
   where n.target_kind = 'portal_invitation' and n.target_id = (v_out ->> 'invitation_id')::uuid;
  if v_n = 0 then
    raise exception '2: inviting her wrote NO notice — the invitation exists and nobody was told';
  end if;
  raise notice 'CLAUSE 2 OK: % notice(s) on communication.notification for this invitation', v_n;
  raise notice 'CLAUSE 2 OK (email on this server = %): %',
    v_out -> 'delivery' ->> 'email_answer', v_out ->> 'delivery_say';

  -- ════════════════ CLAUSE 3 — the link explains before it asks ════════════════════════
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true);
  v_peek := public.portal_share_peek(v_token);
  if (v_peek ->> 'state') <> 'sign_in_needed' then
    raise exception '3: a signed-out reader gets state %, not sign_in_needed', v_peek ->> 'state';
  end if;
  if (v_peek ->> 'organization') is null or (v_peek ->> 'portal') is null or (v_peek ->> 'inviter') is null then
    raise exception '3: the offer names no organization, portal or inviter — %', v_peek::text;
  end if;
  if (v_peek ->> 'invited_email') = c_mail then
    raise exception '3: the peek printed the invited address in full to somebody who is not signed in as her';
  end if;
  raise notice 'CLAUSE 3 OK (no account at all): % / %', v_peek ->> 'offer', v_peek ->> 'say';

  v_peek := public.portal_share_peek(gen_random_uuid()::text);
  if (v_peek ->> 'state') <> 'unknown' then
    raise exception '3: an unknown token answered state %', v_peek ->> 'state';
  end if;
  if v_peek::text ilike '%Carpinteria%' or v_peek::text ilike '%Rincon%' or v_peek::text ilike '%jobs%' then
    raise exception '3: an unknown token leaked something real — %', v_peek::text;
  end if;
  raise notice 'CLAUSE 3 OK (an unknown token learns nothing): %', v_peek ->> 'say';
  perform set_config('role', v_boss, true);
  perform set_config('role', 'authenticated', true);

  -- ════════════════ CLAUSE 4 — SHE ACCEPTS, AND IT COMPLETES ═══════════════════════════
  perform set_config('request.jwt.claims', c_own_j, true);
  v_peek := public.portal_share_peek(v_token);
  if (v_peek ->> 'state') <> 'ready' then
    raise exception '4: signed in as the invited person, the link reads % — %',
      v_peek ->> 'state', v_peek ->> 'say';
  end if;

  -- ════════════════ CLAUSE 7 — a portal invitation is not a membership ═════════════════
  -- Asked here, while it is still PENDING, because after she accepts there is no pending row
  -- left for the membership door to be wrong about — a clause run a minute later would pass
  -- for the wrong reason.
  v_caught := null;
  begin
    perform public.inv_accept(v_token);
  exception when others then v_caught := sqlerrm;
  end;
  if v_caught is null or v_caught not like '%portal_invite_accept%' then
    raise exception '7: the membership door took a portal invitation, or refused without naming the door that does — %', coalesce(v_caught, '<no refusal>');
  end if;
  raise notice 'CLAUSE 7 OK: %', v_caught;

  select count(*) into v_n from public.inv_for_me() i where i.target_type = 'portal_principal';
  if v_n <> 0 then
    raise exception '7: inv_for_me offered % pending portal invitation(s) as a place in an organization', v_n;
  end if;
  raise notice 'CLAUSE 7 OK: inv_for_me offers no portal invitation — it is not a place in the organization';

  v_acc := custom.portal_invite_accept(v_token);
  if not coalesce((v_acc ->> 'accepted')::boolean, false) then
    raise exception '4: the accept did not complete — %', v_acc::text;
  end if;
  raise notice 'CLAUSE 4 OK: %', v_acc ->> 'say';

  -- The grant it wrote is ONE row, on HER client record, and nothing else.
  select count(*) into v_n from iam.permissions p
   where p.granted_to_user_id = c_owner and p.status = 'active'
     and p.resource_type = 'record' and p.resource_id = v_her;
  if v_n <> 1 then
    raise exception '4: she holds % grant(s) on her own client record, not 1', v_n;
  end if;
  -- And on NOTHING ELSE of the branch. Named ids rather than a join to custom.record,
  -- because this seat cannot SELECT that table and should not be able to (part 0 proves it).
  select count(*) into v_n from iam.permissions p
   where p.granted_to_user_id = c_owner and p.status = 'active'
     and p.resource_id in (v_him, v_cust, v_jobs, v_invs, v_home);
  if v_n <> 0 then
    raise exception '4: the accept wrote % grant(s) on the branch''s other records or tables', v_n;
  end if;
  raise notice 'CLAUSE 4 OK (one grant, on her own client record, and nothing else)';

  -- ════════════════ CLAUSE 5 — her jobs and her invoices, and only hers ════════════════
  perform set_config('role', 'authenticated', true);
  select count(*), string_agg(r.document ->> 'work_order', ', ' order by r.document ->> 'work_order')
    into v_n, v_seen
    from custom.read_records(v_org, v_jobs, false, 200, 0) r;
  if v_n <> 2 or v_seen not like '%RPC-2214%' or v_seen not like '%RPC-2215%' or v_seen like '%RPC-2219%' then
    raise exception '5: she reads % job(s): % — she has two and Ellery Tran''s is not one of them', v_n, v_seen;
  end if;
  raise notice 'CLAUSE 5 OK: she opens Jobs and reads her own % — %', v_n, v_seen;

  select count(*), string_agg(r.document ->> 'invoice_no', ', ' order by r.document ->> 'invoice_no')
    into v_n, v_seen
    from custom.read_records(v_org, v_invs, false, 200, 0) r;
  if v_n <> 2 or v_seen not like '%INV-2214-A%' or v_seen not like '%INV-2215-A%' or v_seen like '%INV-2219-A%' then
    raise exception '5: she reads % invoice(s): % — she has two and Ellery Tran''s is not one of them', v_n, v_seen;
  end if;
  raise notice 'CLAUSE 5 OK: she opens Invoices and reads her own % — %', v_n, v_seen;

  -- ════════════════ CLAUSE 6 — everything else of the branch refuses her ═══════════════
  -- The customer list is not a customer list to HER. She reaches exactly ONE row of it — her
  -- own, the record she was granted — and Ellery Tran is not there. And the portal opened no
  -- FIELD on the Customers Table, so even her own row comes back with every value masked:
  -- reaching a record and being shown its columns are two different permissions, and the
  -- ladder answers both without the portal writing a second rule about either.
  select count(*), coalesce(string_agg(r.id::text, ', '), '<none>'),
         coalesce(string_agg(coalesce(r.document ->> 'customer_name', '<masked>'), ', '), '<none>')
    into v_n, v_link, v_seen
    from custom.read_records(v_org, v_cust, false, 200, 0) r;
  if v_n <> 1 then
    raise exception '6: she reaches % row(s) of the branch''s customer list, not 1 (%)', v_n, v_link;
  end if;
  if v_link is distinct from v_her::text then
    raise exception '6: the one customer row she reaches is %, and hers is %', v_link, v_her;
  end if;
  if v_seen like '%Ellery%' then
    raise exception '6: the other customer is readable to her — %', v_seen;
  end if;
  raise notice 'CLAUSE 6 OK (the customer list is one row to her — her own, and its columns read %): %', v_seen, v_link;

  -- A Table the portal never exposed, that nothing of hers names, refuses outright.
  v_caught := null;
  begin
    perform 1 from custom.read_records(v_org, v_crews, false, 10, 0);
  exception when others then v_caught := sqlerrm;
  end;
  if v_caught is null then
    raise exception '6: the branch''s Crews table opened for an outside client';
  end if;
  raise notice 'CLAUSE 6 OK (who works here): %', v_caught;

  -- 🚨 THE ORGANIZATION'S PEOPLE STAY SHUT. A grant admits her to the doors; it confers no
  -- membership, so nothing about who works at this branch is readable by her.
  select count(*) into v_n from iam.organization_member m where m.organization_id = v_org;
  if v_n <> 0 then
    raise exception '6: the branch''s member list handed an outside principal % row(s)', v_n;
  end if;
  raise notice 'CLAUSE 6 OK: the branch''s member list holds 0 rows for her — an external principal is not a member';

  -- ════════════════ CLAUSE 8 — the revoke is total, in one statement ═══════════════════
  perform set_config('request.jwt.claims', c_admin_j, true);
  v_out := custom.portal_revoke(v_org, v_portal, v_princ);
  raise notice 'CLAUSE 8 OK: %', v_out ->> 'say';

  perform set_config('request.jwt.claims', c_own_j, true);
  v_caught := null;
  begin
    perform 1 from custom.read_records(v_org, v_jobs, false, 10, 0);
  exception when others then v_caught := sqlerrm;
  end;
  if v_caught is null then
    raise exception '8: her access was revoked and Jobs still answers her';
  end if;
  raise notice 'CLAUSE 8 OK (the records stop reaching her): %', v_caught;

  v_peek := public.portal_share_peek(v_token);
  if (v_peek ->> 'state') <> 'revoked' then
    raise exception '8: after the revoke the link reads %, not revoked', v_peek ->> 'state';
  end if;
  raise notice 'CLAUSE 8 OK (and the link dies with it): % / %', v_peek ->> 'say', v_peek ->> 'ask';

  v_caught := null;
  begin
    perform custom.portal_invite_accept(v_token);
  exception when others then v_caught := sqlerrm;
  end;
  if v_caught is null then
    raise exception '8: a withdrawn invitation was accepted anyway';
  end if;
  raise notice 'CLAUSE 8 OK (and it cannot be accepted again): %', v_caught;

  perform set_config('role', v_boss, true);
  raise notice 'PORTAL-BIND GREEN — all eight clauses passed on branch %', v_org;
end $green$;
