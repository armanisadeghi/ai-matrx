-- LANE TAILS-5 (B) — THE RED TWIN of `scripts/campaign-tests/tails5b_copy_link_green.sql`.
--
-- It runs this lane's own inverse — the file rule 27 requires — inside a transaction that
-- rolls back, and then drives the same office down the same path.
--
--   RED 0  asserts the inverse actually took, so a twin that silently failed to remove the
--          thing under test cannot report red for the wrong reason
--   RED 1  the control: the INVITE still hands the office a link, exactly as before. What was
--          broken was never the invite; it was everything after the sentence scrolled away.
--   RED 2  the Portals panel redraws from `custom.portal_card`, which knows she is invited and
--          waiting and CANNOT SAY WHAT SHE IS WAITING ON. The office's only way back to her
--          link is to invite her a second time. (Green clause 2, gone.)
--
-- ONE transaction, ROLLBACK at the end; the main database keeps the fix.
--
-- 🚨 THE MAIN DATABASE.

\set ON_ERROR_STOP on
\timing off

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'tails5b_copy_link_red.sql'
\set requires 'exec:custom.table_declare'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
\pset pager off

begin;

set local lock_timeout = '10s';
set local statement_timeout = '180s';

-- ══════════════════════════════════════════════════════════════════════════════════════
-- THE PLANT: this lane's own inverse, executed for real.
-- ══════════════════════════════════════════════════════════════════════════════════════
\ir ../../migrations/inverse/tails5b_the_portal_card_carries_the_link_down.sql

do $red$
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
  if pg_get_functiondef('custom.portal_card(uuid,uuid)'::regprocedure) like '%accept_path%' then
    raise exception 'RED 0: the inverse did not take — custom.portal_card still carries accept_path, so nothing below is measuring the old shape';
  end if;
  raise notice 'RED 0 — the inverse is in: custom.portal_card answers no accept_path again.';

  perform set_config('app.actor_system', 'campaign.tails5b.red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Rincon Plumbing Co — Summerland Branch',
          'rincon-plumbing-summerland-br-' || substr(v_org::text, 1, 8), 'RPS', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom', 'system_enabled', 'organization', v_org, v_org, 'true'::jsonb, 'tails5b red'),
         ('custom', 'external_principal_enabled', 'organization', v_org, v_org, 'true'::jsonb, 'tails5b red');
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
  raise notice 'RED 1 — the control: inviting her STILL hands the office a link (%). The invite was never the broken half.', v_path;

  -- ════════════════════════════════════════════════════════════════════════════
  -- CLAUSE 2 — 🚨 THE DEFECT. The sentence is gone; the PANEL has to find the link.
  -- `custom.portal_card` is what the Portals rail redraws from.
  -- ════════════════════════════════════════════════════════════════════════════
  v_card := custom.portal_card(v_org, v_portal);
  select p into v_pr from jsonb_array_elements(v_card -> 'principals') p
   where (p ->> 'principal_id')::uuid = v_pid;
  if v_pr is null then
    raise exception 'RED 2 setup: the portal card does not list the person who was just invited';
  end if;
  if v_pr ? 'accept_path' and (v_pr ->> 'accept_path') is not null then
    raise exception 'RED 2 IS NOT RED: with the old door back the card still offered a link (%), so the fix was not what was making green clause 2 pass', v_pr ->> 'accept_path';
  end if;
  raise notice 'RED 2 — SEATED as `%`: the card says she is invited and waiting (signed_in=%) and offers NO link. The office''s only way back to it is to invite her a second time.', current_user, v_pr ->> 'signed_in';

  perform set_config('role', v_boss, true);
  raise notice '=== TAILS-5 (B) RED — this lane''s own inverse was run for real, and with it the office loses a waiting customer''s link the moment the invite sentence scrolls away. Rolling back; the main database keeps the fix. ===';
end $red$;

rollback;
