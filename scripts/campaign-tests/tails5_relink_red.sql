-- LANE TAILS-5 — THE RED TWIN of `scripts/campaign-tests/tails5_relink_green.sql`.
--
-- The green suite is eight clauses that all pass, and a suite of passes proves nothing until
-- you can show them failing when the thing that makes them pass is taken away. This file takes
-- it away FOR REAL: it runs this lane's own inverse —
-- `migrations/inverse/tails5_a_revive_is_an_update_of_the_tombstone_down.sql`, the file rule 27
-- requires — inside a transaction that rolls back, and then drives the same dispatcher down the
-- same path on the same fixture.
--
--   RED 1  the relink dies again, inside the door, `21000 ON CONFLICT DO UPDATE command
--          cannot affect row a second time` — the dispatcher cannot put the customer she just
--          took off back on. (Green clause 3 gone.)
--   RED 2  the same statement through a completely different feature: the office cannot
--          re-attach a photo it removed from the job's chat, and it dies with the SAME 21000.
--          One trigger, two features, one defect — which is what makes green clause 7 a
--          measurement of the class rather than of one door. (Green clause 7 gone.)
--   RED 3  the control: an ordinary FIRST link, with no tombstone under it, still works with
--          the old bodies back. Without it, "the two suites differ" could just mean the
--          database is broken.
--
-- ONE transaction, ROLLBACK at the end: the reverted bodies and the whole fixture go with it.
-- Nothing here survives the session, and the main database keeps the fix.
--
-- THE SEAT. Same as the green suite: PART 0 takes `authenticated` and proves it, and every
-- clause that asserts anything is asked from that seat. The only things done as the connected
-- role are named PLANTS — the organization, the conversation and the file, which have no client
-- door, and the inverse itself, which is DDL no person is ever supposed to be able to run.
--
-- 🚨 THE MAIN DATABASE. The guard below names main's own system identifier.

\set ON_ERROR_STOP on
\timing off
\pset pager off

do $target$
begin
  if (select system_identifier from pg_control_system()) <> 7642734024280108049 then
    raise exception 'tails5_relink_red.sql runs on the MAIN database only, and this is %',
      (select system_identifier from pg_control_system());
  end if;
end $target$;

begin;

set local lock_timeout = '10s';
set local statement_timeout = '180s';

-- ══════════════════════════════════════════════════════════════════════════════════════
-- THE PLANT: this lane's own inverse, executed for real. Everything after it runs against
-- the bodies as they stood BEFORE the fix.
-- ══════════════════════════════════════════════════════════════════════════════════════
\ir ../../migrations/inverse/tails5_a_revive_is_an_update_of_the_tombstone_down.sql

do $red$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org     uuid := gen_random_uuid();
  v_boss    text := current_user;
  v_home    uuid;
  v_cust_t  uuid;
  v_jobs_t  uuid;
  v_marisol uuid;
  v_job     uuid;
  v_job2    uuid;
  v_ellery  uuid;
  v_edge    uuid;
  v_conv    uuid := gen_random_uuid();
  v_photo   uuid := gen_random_uuid();
  v_link    uuid;
  v_link2   uuid;
  v_n       integer;
  v_state   text;
  v_msg     text;
begin
  -- The inverse really did go in, and this is asserted rather than assumed: a red twin that
  -- silently failed to remove the thing under test would report every clause below as RED for
  -- the wrong reason.
  if pg_get_functiondef('platform.revive_tombstoned_association()'::regprocedure)
       like '%return null;%' then
    raise exception 'RED 0: the inverse did not take — platform.revive_tombstoned_association still skips the insert, so nothing below is measuring the old shape';
  end if;
  raise notice 'RED 0 — the inverse is in: the revive is an out-of-band UPDATE again and the INSERT proceeds.';

  perform set_config('app.actor_system', 'campaign.tails5.red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Rincon Plumbing Co — Carpinteria Branch',
          'rincon-plumbing-carpinteria-t5r-' || substr(v_org::text, 1, 8), 'RPC', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom', 'system_enabled', 'organization', v_org, v_org, 'true'::jsonb, 'tails5 red');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Rincon Plumbing Co — Carpinteria Branch'))
  returning id into v_home;
  insert into chat.conversation (id, organization_id, created_by, title)
  values (v_conv, v_org, c_admin, 'RPC-2214 — upstairs re-pipe, supply lines');
  insert into files.files (id, organization_id, created_by, file_name, file_path, storage_uri)
  values (v_photo, v_org, c_admin, 'rpc-2214-corroded-riser.jpg',
          'rincon/jobs/rpc-2214/rpc-2214-corroded-riser.jpg',
          'storage://rincon/jobs/rpc-2214/rpc-2214-corroded-riser.jpg');

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

  v_cust_t := custom.table_declare(v_org, jsonb_build_object(
    'name','Customers','slug','customers','type','entity','display','list',
    'label_singular','Customer','label_plural','Customers','ordered',true,'weight','light',
    'retention_days',365,'row_order','manual','agent_writable',true,'parent_id',v_home::text,
    'title_field','name',
    'default_sort', jsonb_build_array(jsonb_build_object('field','name','direction','asc')),
    'fields', jsonb_build_array(jsonb_build_object('name','name'))));
  perform custom.field_declare(v_org, v_cust_t,
    jsonb_build_object('key','name','label','Name','plain','text'));
  v_jobs_t := custom.table_declare(v_org, jsonb_build_object(
    'name','Jobs','slug','jobs','type','entity','display','list',
    'label_singular','Job','label_plural','Jobs','ordered',true,'weight','light',
    'retention_days',365,'row_order','manual','agent_writable',true,'parent_id',v_home::text,
    'title_field','job_number',
    'default_sort', jsonb_build_array(jsonb_build_object('field','job_number','direction','asc')),
    'fields', jsonb_build_array(jsonb_build_object('name','job_number'))));
  perform custom.field_declare(v_org, v_jobs_t,
    jsonb_build_object('key','job_number','label','Job number','plain','text'));
  perform custom.field_declare(v_org, v_jobs_t, jsonb_build_object(
    'key','customer','label','Customer','type','relation',
    'relation_target', v_cust_t::text, 'multi', false,
    'display', jsonb_build_array('name')));

  v_marisol := custom.record_write(v_org, v_cust_t, '{"name":"Marisol Vega"}'::jsonb);
  v_job     := custom.record_write(v_org, v_jobs_t, '{"job_number":"RPC-2214"}'::jsonb);

  -- ════════════════════════════════════════════════════════════════════════════
  -- RED 1 — THE DISPATCHER CANNOT PUT THE CUSTOMER BACK ON. Green clause 3, gone.
  -- ════════════════════════════════════════════════════════════════════════════
  perform platform.relation_set(v_org, v_job, 'customer', jsonb_build_array(v_marisol));
  select a.id into v_edge from platform.associations a
   where a.source_id = v_job and a.role = 'customer' and a.target_id = v_marisol
     and a.deleted_at is null;
  if v_edge is null then
    raise exception 'RED 1 setup: the customer never went onto the job, so the relink below would prove nothing';
  end if;
  perform platform.relation_unset(v_org, v_job, 'customer', v_marisol);

  v_state := null; v_msg := null;
  begin
    perform platform.relation_set(v_org, v_job, 'customer', jsonb_build_array(v_marisol));
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
  end;
  if v_state is null then
    raise exception 'RED 1 IS NOT RED: with the old trigger back, the relink SUCCEEDED — so the fix was not what was making green clause 3 pass, and something else has changed';
  end if;
  if v_state <> '21000' then
    raise exception 'RED 1: the relink failed, but with % "%" rather than the 21000 this lane measured. Re-measure before trusting the green suite.', v_state, v_msg;
  end if;
  raise notice 'RED 1 — SEATED as `%`: with the old revive back, putting Marisol Vega back on RPC-2214 dies inside the door — % "%". That is the defect, and it is the whole of green clause 3.', current_user, v_state, v_msg;

  -- ════════════════════════════════════════════════════════════════════════════
  -- RED 2 — AND IT WAS NEVER ONLY THE RELATION DOOR. The same statement, through a
  -- completely different feature: the photo on the job's chat. Green clause 7, gone.
  -- ════════════════════════════════════════════════════════════════════════════
  v_link := public.conversation_file_add(v_conv, v_photo, 'Corroded riser, upstairs unit');
  if v_link is null then
    raise exception 'RED 2 setup: attaching the photo the first time handed back no edge';
  end if;
  -- The same tombstone the green suite plants, for the same reason: the removal doors
  -- hard-delete, so a tombstone has to be made by hand. Out of the seat for one statement.
  perform set_config('role', v_boss, true);
  update platform.associations set deleted_at = now() where id = v_link;
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'RED 2: the seat was not retaken after the tombstone plant — current_user is %', current_user;
  end if;

  v_state := null; v_msg := null; v_link2 := null;
  begin
    v_link2 := public.conversation_file_add(v_conv, v_photo, 'Corroded riser, upstairs unit');
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
  end;
  if v_state is null and v_link2 is not null then
    raise exception 'RED 2 IS NOT RED: re-attaching the photo worked with the old trigger back, so this door was never carrying the defect and green clause 7 is measuring nothing';
  end if;
  if v_state = '21000' then
    raise notice 'RED 2 — SEATED as `%`: re-attaching the photo dies the same way — 21000 "%". One trigger, two features, one defect.', current_user, v_msg;
  else
    raise notice 'RED 2 — SEATED as `%`: re-attaching the photo did not work — sqlstate %, id %. Either way the door does not hand the office its edge back, which is what green clause 7 asserts it now does.', current_user, coalesce(v_state, '<none>'), coalesce(v_link2::text, '<null>');
  end if;

  -- ════════════════════════════════════════════════════════════════════════════
  -- RED 3 — WHAT THE FIX DID **NOT** TOUCH, asked with the old bodies back: an ordinary
  -- first link still works. If this went red too, the difference between the two suites
  -- would be "the database is broken", not "this trigger is the defect".
  -- ════════════════════════════════════════════════════════════════════════════
  -- A FRESH pair, because RED 1 left a tombstone on the old one and an ordinary first link is
  -- precisely a link with no tombstone under it.
  v_job2 := custom.record_write(v_org, v_jobs_t, '{"job_number":"RPC-2215"}'::jsonb);
  v_ellery := custom.record_write(v_org, v_cust_t, '{"name":"Ellery Tran"}'::jsonb);
  perform platform.relation_set(v_org, v_job2, 'customer', jsonb_build_array(v_ellery));
  select count(*) into v_n from platform.associations a
   where a.source_id = v_job2 and a.role = 'customer' and a.deleted_at is null;
  if v_n <> 1 then
    raise exception 'RED 3: with the old bodies back an ordinary link no longer works either (% live edge(s)) — the comparison above is not about this trigger', v_n;
  end if;
  raise notice 'RED 3 — the ordinary first link is untouched by either shape, so RED 1 and RED 2 are about the relink and nothing else.';

  perform set_config('role', v_boss, true);
  raise notice '=== TAILS-5 RED — this lane''s own inverse was run for real, and with it the dispatcher cannot put back a customer she just took off, and the office cannot re-attach a photo it removed. Rolling back; the main database keeps the fix. ===';
end $red$;

rollback;
