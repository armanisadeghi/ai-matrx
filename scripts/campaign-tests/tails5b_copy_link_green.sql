-- LANE TAILS-5 (B) — THE GREEN SUITE: the office can find a waiting client's own link again.
--
-- THE USE CASE. Rincon Plumbing Co — Summerland Branch opens a portal so each customer can
-- see their own jobs. The office invites Marisol Vega, and the door hands back one sentence and
-- one link. Then the sentence scrolls away — somebody closes the panel, or opens another
-- portal, or comes back tomorrow — and the office wants to TEXT her that link, which is how
-- this actually happens (INVITE-DELIVERY measured texting as the ordinary case, not the
-- fallback). Until `migrations/campaign/tails5b_the_portal_card_carries_the_link.sql`,
-- `custom.portal_card` knew she was "invited and waiting" and had no way to say what she was
-- waiting on, so the only way to see her link again was to invite her a second time.
--
-- The red twin, `scripts/campaign-tests/tails5b_copy_link_red.sql`, runs this lane's own
-- inverse and shows every clause below failing again.
--
-- THE SEAT. PART 0 takes `authenticated` and proves it; every clause is the OFFICE asking the
-- doors it actually has. The only thing done as the connected role is the organization, which
-- has no client door here.
--
-- ONE transaction, ROLLBACK at the end.
--
-- 🚨 THE MAIN DATABASE.

\set ON_ERROR_STOP on
\timing off

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'tails5b_copy_link_green.sql'
\set requires 'exec:custom.table_declare'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
\pset pager off

begin;

set local lock_timeout = '10s';
set local statement_timeout = '180s';

do $green$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org     uuid := gen_random_uuid();
  v_boss    text := current_user;
  v_home    uuid;
  v_cust_t  uuid;
  v_jobs_t  uuid;
  v_marisol uuid;
  v_ellery  uuid;
  v_portal  uuid;
  v_out     jsonb;
  v_card    jsonb;
  v_pr      jsonb;
  v_path    text;
  v_pid     uuid;
begin
  perform set_config('app.actor_system', 'campaign.tails5b.green', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Rincon Plumbing Co — Summerland Branch',
          'rincon-plumbing-summerland-b-' || substr(v_org::text, 1, 8), 'RPS', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom', 'system_enabled', 'organization', v_org, v_org, 'true'::jsonb, 'tails5b green'),
         ('custom', 'external_principal_enabled', 'organization', v_org, v_org, 'true'::jsonb, 'tails5b green');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Rincon Plumbing Co — Summerland Branch'))
  returning id into v_home;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 0 — THE SEAT.
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this suite did not take the seat — current_user is %', current_user;
  end if;
  begin
    perform 1 from custom.record limit 1;
    raise exception '0: this seat can SELECT custom.record directly, so it is not a client seat';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PART 0 OK — the seat is `authenticated`.';

  -- ── THE BRANCH BUILDS ITS TWO TABLES AND OPENS A PORTAL, through the doors ────────────
  v_cust_t := custom.table_declare(v_org, jsonb_build_object(
    'name','Customers','slug','customers','type','entity','display','list',
    'label_singular','Customer','label_plural','Customers','ordered',true,'weight','light',
    'retention_days',365,'row_order','manual','agent_writable',true,'parent_id',v_home::text,
    'title_field','name',
    'default_sort', jsonb_build_array(jsonb_build_object('field','name','direction','asc')),
    'fields', jsonb_build_array(jsonb_build_object('name','name'))));
  perform custom.field_declare(v_org, v_cust_t, jsonb_build_object('key','name','label','Name','plain','text'));

  v_jobs_t := custom.table_declare(v_org, jsonb_build_object(
    'name','Jobs','slug','jobs','type','entity','display','list',
    'label_singular','Job','label_plural','Jobs','ordered',true,'weight','light',
    'retention_days',365,'row_order','manual','agent_writable',true,'parent_id',v_home::text,
    'title_field','job_number',
    'default_sort', jsonb_build_array(jsonb_build_object('field','job_number','direction','asc')),
    'fields', jsonb_build_array(jsonb_build_object('name','job_number'))));
  perform custom.field_declare(v_org, v_jobs_t, jsonb_build_object('key','job_number','label','Job number','plain','text'));
  perform custom.field_declare(v_org, v_jobs_t, jsonb_build_object('key','stage','label','Stage','plain','text'));
  perform custom.field_declare(v_org, v_jobs_t, jsonb_build_object(
    'key','customer','label','Customer','type','relation',
    'relation_target', v_cust_t::text, 'multi', false));

  v_marisol := custom.record_write(v_org, v_cust_t, '{"name":"Marisol Vega"}'::jsonb);
  v_ellery  := custom.record_write(v_org, v_cust_t, '{"name":"Ellery Tran"}'::jsonb);

  v_portal := custom.portal_declare(v_org, 'Your jobs', v_cust_t, jsonb_build_array(
    jsonb_build_object('table_id', v_jobs_t::text, 'names_via', 'customer',
      'visible_fields', jsonb_build_array('job_number','stage'),
      'editable_fields', '[]'::jsonb, 'comments', false)));

  -- ════════════════════════════════════════════════════════════════════════════
  -- CLAUSE 1 — the office invites Marisol, and the door hands back a link.
  -- ════════════════════════════════════════════════════════════════════════════
  v_out := custom.portal_invite(v_org, v_portal, v_marisol, 'marisol.vega@example.invalid');
  v_path := v_out ->> 'accept_path';
  v_pid  := (v_out ->> 'principal_id')::uuid;
  if v_path is null or v_path not like '/invitations/portal/accept/%' then
    raise exception '1: inviting her handed the office no link (%)', coalesce(v_path, '<null>');
  end if;
  raise notice 'CLAUSE 1 OK: the office invited Marisol Vega and was handed %.', v_path;

  -- ════════════════════════════════════════════════════════════════════════════
  -- CLAUSE 2 — 🚨 THE DEFECT. The sentence is gone; the PANEL has to find the link.
  -- `custom.portal_card` is what the Portals rail redraws from.
  -- ════════════════════════════════════════════════════════════════════════════
  v_card := custom.portal_card(v_org, v_portal);
  select p into v_pr from jsonb_array_elements(v_card -> 'principals') p
   where (p ->> 'principal_id')::uuid = v_pid;
  if v_pr is null then
    raise exception '2: the portal card does not list the person who was just invited';
  end if;
  if (v_pr ->> 'accept_path') is null then
    raise exception '2: the portal card knows she is invited and waiting, and cannot say what she is waiting on — the office has no link to copy';
  end if;
  if (v_pr ->> 'accept_path') <> v_path then
    raise exception '2: the card offers a DIFFERENT link (% vs %) — one of the two is a second template', v_pr ->> 'accept_path', v_path;
  end if;
  if (v_pr ->> 'signed_in')::boolean then
    raise exception '2: she has not followed the link and the card says she has';
  end if;
  raise notice 'CLAUSE 2 OK: the panel finds her own link again — the same one, not a second template.';

  -- ════════════════════════════════════════════════════════════════════════════
  -- CLAUSE 3 — A PERSON NOBODY ASKED HAS NO LINK, AND THAT IS AN ANSWER. Ellery was
  -- never invited, so there is nothing to copy for him — and the door says null rather
  -- than inventing a path that would 404 on the person it was texted to.
  -- ════════════════════════════════════════════════════════════════════════════
  if exists (select 1 from jsonb_array_elements(v_card -> 'principals') p
              where (p ->> 'client') = 'Ellery Tran') then
    raise exception '3: the card lists somebody nobody invited';
  end if;
  raise notice 'CLAUSE 3 OK: only the person who was actually asked is on the card.';

  -- ════════════════════════════════════════════════════════════════════════════
  -- CLAUSE 4 — THE LINK DIES WITH THE ACCESS. `custom.portal_revoke` withdraws the
  -- invitation in the same statement (PORTAL-BIND's own rule), so the card must stop
  -- offering a link the moment the office takes her access away. A panel still showing
  -- "copy their link" after a revoke would hand somebody a dead URL to text.
  -- ════════════════════════════════════════════════════════════════════════════
  perform custom.portal_revoke(v_org, v_portal, v_pid);
  v_card := custom.portal_card(v_org, v_portal);
  select p into v_pr from jsonb_array_elements(v_card -> 'principals') p
   where (p ->> 'principal_id')::uuid = v_pid;
  if v_pr is null then
    raise exception '4: the revoked person vanished from the card entirely — this platform archives';
  end if;
  if (v_pr ->> 'accept_path') is not null then
    raise exception '4: the card still offers a link after the revoke (%) — the office would text somebody a dead URL', v_pr ->> 'accept_path';
  end if;
  if (v_pr ->> 'is_active')::boolean then
    raise exception '4: the card still says she is active after the revoke';
  end if;
  raise notice 'CLAUSE 4 OK: the revoke took the link away with the access, and she is still ON the card as revoked.';

  perform set_config('role', v_boss, true);
  raise notice '=== TAILS-5 (B) GREEN — the office invites a customer, the sentence scrolls away, and the Portals panel can still find HER link: the same one the invite door handed back, gone the moment the office takes her access away, and never invented for somebody nobody asked. Rolling back. ===';
end $green$;

rollback;
