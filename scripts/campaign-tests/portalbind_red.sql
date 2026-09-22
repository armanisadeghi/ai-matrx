-- PORTAL-BIND — THE RED TWIN. The same walk, on the bytes that stood before this lane.
--
-- 🚨 IT IS NOT A RE-TELLING. It runs this lane's OWN INVERSES — the files rule 27 requires,
-- which restore the previous bodies character for character — inside a transaction that ROLLS
-- BACK, and then drives the same customer down the same path. Everything it prints is the
-- pre-lane platform refusing, measured, not remembered.
--
-- THE THREE THINGS THAT WERE TRUE YESTERDAY
--   A  there was no door at all: `custom.portal_invite_accept` did not exist, so a portal
--      invitation could only be followed through the server's out-of-band magic-link lane,
--      and there was no link anybody could copy and text to a customer
--   B  the honest self-bind arm — the one lane GUARD-STAMPS fixed so it proves the arriving
--      person by the address the platform's own auth holds — reached its decision and then
--      DIED ONE CALL LATER, because `custom.share_grant` judges the CALLER at `admin` on the
--      record being shared and an arriving outsider holds nothing on it
--   C  `public.portal_share_peek` did not exist, so a signed-out reader holding a real link
--      could learn nothing about what it offered before being asked to make an account
--
-- Run it with psql. It ends in ROLLBACK and leaves nothing behind.

\set ON_ERROR_STOP on

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'portalbind_red.sql'
\set requires 'grant:authenticated:custom.table_declare'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;

-- THE PRE-LANE BYTES, restored by this lane's own inverses.
\i migrations/inverse/portalbind_a_portal_invitation_is_an_invitation_down.sql
\i migrations/inverse/portalbind_one_writer_for_the_grant_down.sql

do $red$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_owner   constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_own_j   constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  c_mail    constant text := 'test@test.com';
  v_boss    text := current_user;
  v_org     uuid := gen_random_uuid();
  v_home    uuid;
  v_cust    uuid;
  v_jobs    uuid;
  v_her     uuid;
  v_portal  uuid;
  v_princ   uuid;
  v_out     jsonb;
  v_caught  text;
begin
  perform set_config('app.actor_system', 'campaign.portalbind.red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Rincon Plumbing Co — Carpinteria Branch',
          'rincon-plumbing-carpinteria-red-' || substr(v_org::text, 1, 8), 'RPC', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom', 'system_enabled', 'organization', v_org, v_org, 'true'::jsonb, 'PORTAL-BIND red twin'),
         ('custom', 'external_principal_enabled', 'organization', v_org, v_org, 'true'::jsonb, 'PORTAL-BIND red twin');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Carpinteria Branch')) returning id into v_home;

  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'RED: this twin did not take the seat — current_user is %', current_user;
  end if;

  v_cust := custom.table_declare(v_org, jsonb_build_object(
    'name','Customers','slug','customers','type','entity','display','list',
    'label_singular','Customer','label_plural','Customers','ordered',false,'weight','light',
    'retention_days',3650,'row_order','sorted','agent_writable',true,
    'parent_id', v_home::text,'title_field','customer_name','default_sort','[]'::jsonb,
    'fields', jsonb_build_array(jsonb_build_object('name','customer_name'))));
  v_jobs := custom.table_declare(v_org, jsonb_build_object(
    'name','Jobs','slug','jobs','type','entity','display','list',
    'label_singular','Job','label_plural','Jobs','ordered',false,'weight','light',
    'retention_days',365,'row_order','sorted','agent_writable',true,
    'parent_id', v_home::text,'title_field','work_order','default_sort','[]'::jsonb,
    'fields', jsonb_build_array(jsonb_build_object('name','work_order'))));
  perform custom.field_declare(v_org, v_cust, jsonb_build_object('key','customer_name','label','Customer name','plain','text','sort',10));
  perform custom.field_declare(v_org, v_jobs, jsonb_build_object('key','work_order','label','Work order','plain','text','sort',10));
  perform custom.field_declare(v_org, v_jobs, jsonb_build_object(
    'label','Customer','type','relation','relation_target', v_cust::text,
    'on_target_delete','set_null','multi',false,'sort',5));
  v_her := custom.record_write(v_org, v_cust, jsonb_build_object('customer_name','Marisol Vega'));
  perform custom.record_write(v_org, v_jobs, jsonb_build_object(
    'work_order','RPC-2214','customer', v_her::text));
  v_portal := custom.portal_declare(v_org, 'Your jobs and invoices', v_cust, jsonb_build_array(
    jsonb_build_object('table_id', v_jobs::text, 'names_via','customer',
                       'visible_fields', jsonb_build_array('work_order'),
                       'editable_fields','[]'::jsonb,'comments',false)));
  v_out   := custom.portal_invite(v_org, v_portal, v_her, c_mail);
  v_princ := (v_out ->> 'principal_id')::uuid;

  -- ── A — THERE IS NO DOOR AT ALL. ────────────────────────────────────────────────────
  if to_regprocedure('custom.portal_invite_accept(text)') is not null then
    raise exception 'RED A: custom.portal_invite_accept still exists, so this twin is not on the pre-lane bytes';
  end if;
  raise notice 'CLAUSE A RED: there is no custom.portal_invite_accept — a portal invitation can only be followed through the server''s own magic-link lane, and there is no link to copy';
  if (v_out ? 'accept_path') then
    raise exception 'RED A: the invite handed back a link, so this twin is not on the pre-lane bytes';
  end if;
  raise notice 'CLAUSE A RED: and the invite hands the office no link — it writes a principal row and stops';

  -- ── C — AND NOTHING TELLS A SIGNED-OUT READER WHAT IS ON OFFER. ─────────────────────
  if to_regprocedure('public.portal_share_peek(text)') is not null then
    raise exception 'RED C: public.portal_share_peek still exists, so this twin is not on the pre-lane bytes';
  end if;
  raise notice 'CLAUSE C RED: there is no public.portal_share_peek — a stranger holding a real link is asked to make an account before being told what for';

  -- ── B — THE ONE THAT MATTERS. The honest arm, reached, and dead one call later. ─────
  perform set_config('request.jwt.claims', c_own_j, true);
  v_caught := null;
  begin
    perform custom.portal_principal_bind(v_org, v_princ, c_owner);
  exception when others then v_caught := sqlerrm;
  end;
  if v_caught is null then
    raise exception 'RED B: the pre-lane bind COMPLETED, so this twin measures nothing';
  end if;
  raise notice 'CLAUSE B RED: the invited customer, at her own address, on her own invitation — %', v_caught;

  perform set_config('role', v_boss, true);
  raise notice 'PORTAL-BIND RED — all three clauses failed on the pre-lane bytes, as they did yesterday';
end $red$;

rollback;
