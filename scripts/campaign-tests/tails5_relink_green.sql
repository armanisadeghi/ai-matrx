-- LANE TAILS-5 — THE GREEN SUITE: a person can put back a link she just took off.
--
-- THE USE CASE. Rincon Plumbing Co — Carpinteria Branch. The dispatcher, signed in as the
-- office, puts customer Marisol Vega on job RPC-2214 (a galvanised-supply-line re-pipe on the
-- upstairs unit), takes her off because she thinks she has the wrong duplex, and puts the SAME
-- customer back on when she realises the first entry was right. Then she removes the photo of
-- the corroded riser from the job's chat and puts that back too.
--
-- Before `migrations/campaign/tails5_a_revive_is_an_update_of_the_tombstone.sql` the relink
-- died inside the door with `21000 ON CONFLICT DO UPDATE command cannot affect row a second
-- time`, because `trg_associations_revive_tombstone` un-deleted the tombstone out of band and
-- the arriving INSERT could no longer see the row it was conflicting with. The red twin,
-- `scripts/campaign-tests/tails5_relink_red.sql`, runs this lane's own inverse and shows every
-- clause below failing again.
--
-- THE SEAT. PART 0 takes `authenticated` and proves it, and every clause that ASSERTS anything
-- is asked from that seat, through the doors a signed-in person actually reaches. The only
-- things done as the connected role are named PLANTS — the two files and the conversation,
-- which have no client door in this store — and nothing is asserted while out of the seat.
--
-- ONE transaction, ROLLBACK at the end. Nothing here survives the session.
--
-- 🚨 THE MAIN DATABASE. The guard below names main's own system identifier; the fixture is a
-- DISPOSABLE organization, never Matrx System.

\set ON_ERROR_STOP on
\timing off
\pset pager off

do $target$
begin
  if (select system_identifier from pg_control_system()) <> 7642734024280108049 then
    raise exception 'tails5_relink_green.sql runs on the MAIN database only, and this is %',
      (select system_identifier from pg_control_system());
  end if;
end $target$;

begin;

set local lock_timeout = '10s';
set local statement_timeout = '180s';

do $green$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org     uuid := gen_random_uuid();
  v_boss    text := current_user;
  v_home    uuid;
  v_cust_t  uuid;
  v_jobs_t  uuid;
  v_marisol uuid;
  v_ellery  uuid;
  v_job     uuid;
  v_edge    uuid;
  v_edge2   uuid;
  v_conv    uuid := gen_random_uuid();
  v_photo   uuid := gen_random_uuid();
  v_link    uuid;
  v_link2   uuid;
  v_n       integer;
  v_hist    integer;
  v_hist2   integer;
  v_state   text;
  v_msg     text;
begin
  perform set_config('app.actor_system', 'campaign.tails5.green', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  -- ── THE BUSINESS (plant: an organization has no client door that makes one) ──────────
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Rincon Plumbing Co — Carpinteria Branch',
          'rincon-plumbing-carpinteria-t5-' || substr(v_org::text, 1, 8), 'RPC', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom', 'system_enabled', 'organization', v_org, v_org, 'true'::jsonb, 'tails5 green');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Rincon Plumbing Co — Carpinteria Branch'))
  returning id into v_home;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 0 — THE SEAT.
  -- ════════════════════════════════════════════════════════════════════════════
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
  raise notice 'PART 0 OK — the seat is `authenticated` and custom.record is not readable from it.';

  -- ── THE OFFICE BUILDS ITS TWO TABLES, THROUGH THE DOORS ──────────────────────────────
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

  -- A job is for ONE customer, so the column points at one thing at a time. Declared from the
  -- seat, through `custom.field_declare` — the door w1_rel_red still says refuses this word.
  perform custom.field_declare(v_org, v_jobs_t, jsonb_build_object(
    'key','customer','label','Customer','type','relation',
    'relation_target', v_cust_t::text, 'multi', false,
    'display', jsonb_build_array('name')));

  v_marisol := custom.record_write(v_org, v_cust_t, '{"name":"Marisol Vega"}'::jsonb);
  v_ellery  := custom.record_write(v_org, v_cust_t, '{"name":"Ellery Tran"}'::jsonb);
  v_job     := custom.record_write(v_org, v_jobs_t,
    '{"job_number":"RPC-2214"}'::jsonb);

  -- ════════════════════════════════════════════════════════════════════════════
  -- CLAUSE 1 — she puts the customer on the job.
  -- ════════════════════════════════════════════════════════════════════════════
  perform platform.relation_set(v_org, v_job, 'customer', jsonb_build_array(v_marisol));
  select a.id into v_edge from platform.associations a
   where a.source_id = v_job and a.role = 'customer' and a.target_id = v_marisol
     and a.deleted_at is null;
  if v_edge is null then
    raise exception '1: the customer did not go onto the job at all';
  end if;
  raise notice 'CLAUSE 1 OK: RPC-2214 is Marisol Vega''s job.';

  -- ════════════════════════════════════════════════════════════════════════════
  -- CLAUSE 2 — she takes it off, and the platform ARCHIVES rather than deletes.
  -- ════════════════════════════════════════════════════════════════════════════
  perform platform.relation_unset(v_org, v_job, 'customer', v_marisol);
  select count(*) into v_n from platform.associations a
   where a.source_id = v_job and a.role = 'customer' and a.deleted_at is null;
  if v_n <> 0 then
    raise exception '2: taking the customer off left % live edge(s)', v_n;
  end if;
  if not exists (select 1 from platform.associations a
                  where a.id = v_edge and a.deleted_at is not null) then
    raise exception '2: the edge was DELETED rather than archived — a soft delete is the whole reason a relink has a row to come back to';
  end if;
  raise notice 'CLAUSE 2 OK: the job has no customer, and the edge is a tombstone rather than gone.';

  -- ════════════════════════════════════════════════════════════════════════════
  -- CLAUSE 3 — 🚨 THE DEFECT. She puts the SAME customer back on.
  -- Before the fix: 21000 "ON CONFLICT DO UPDATE command cannot affect row a second time".
  -- ════════════════════════════════════════════════════════════════════════════
  v_state := null; v_msg := null;
  begin
    perform platform.relation_set(v_org, v_job, 'customer', jsonb_build_array(v_marisol));
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
  end;
  if v_state is not null then
    raise exception '3: re-linking the customer she just unlinked was refused — % "%"', v_state, v_msg;
  end if;
  select count(*) into v_n from platform.associations a
   where a.source_id = v_job and a.role = 'customer' and a.target_id = v_marisol
     and a.deleted_at is null;
  if v_n <> 1 then
    raise exception '3: after the relink the job points at Marisol Vega % time(s)', v_n;
  end if;
  raise notice 'CLAUSE 3 OK: she put Marisol Vega back on RPC-2214.';

  -- ════════════════════════════════════════════════════════════════════════════
  -- CLAUSE 4 — NEVER A SECOND ROW. The revived edge is the SAME edge: same id, and
  -- exactly one row for that key in the whole table, live or dead.
  -- ════════════════════════════════════════════════════════════════════════════
  select count(*) into v_n from platform.associations a
   where a.source_type = 'record' and a.source_id = v_job
     and a.target_type = 'record' and a.target_id = v_marisol
     and a.role = 'customer';
  if v_n <> 1 then
    raise exception '4: the relink left % row(s) for one link — a revive is an UPDATE of the tombstone, never a second row', v_n;
  end if;
  if not exists (select 1 from platform.associations a
                  where a.id = v_edge and a.deleted_at is null) then
    raise exception '4: the link came back as a DIFFERENT row — the edge lost its identity, and with it its history';
  end if;
  raise notice 'CLAUSE 4 OK: one row, the same row — the link kept its identity through the round trip.';

  -- ════════════════════════════════════════════════════════════════════════════
  -- CLAUSE 5 — THE CONTRACT STILL DECIDES ON THE REVIVE PATH, and this is the clause
  -- that would catch the easy way to get this fix wrong. Skipping the INSERT skips every
  -- BEFORE INSERT trigger that sorts after the revive — including the relation contract
  -- itself. The revive's own UPDATE has to re-fire them. So: take Marisol off, put ELLERY
  -- on, then try to put Marisol back. The job points at one customer at a time, so the
  -- revive must be REFUSED, by REL-7, naming the customer it already has.
  -- ════════════════════════════════════════════════════════════════════════════
  perform platform.relation_unset(v_org, v_job, 'customer', v_marisol);
  perform platform.relation_set(v_org, v_job, 'customer', jsonb_build_array(v_ellery));
  v_state := null; v_msg := null;
  begin
    perform platform.relation_set(v_org, v_job, 'customer', jsonb_build_array(v_marisol));
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
  end;
  if v_state is null then
    raise exception '5: a job that points at one customer at a time took a SECOND one on the revive path — the relation contract is not running when a tombstone comes back';
  end if;
  if v_state <> '23514' or v_msg not like '%points at one thing at a time%' then
    raise exception '5: the revive was refused, but not by the relation contract — % "%"', v_state, v_msg;
  end if;
  if v_msg not like '%Ellery Tran%' then
    raise exception '5: the refusal did not name the customer the job already has — "%"', v_msg;
  end if;
  raise notice 'CLAUSE 5 OK: the contract decides on the revive path too — "%"', left(v_msg, 90);

  -- Put the office back where it meant to be: Marisol's job is Marisol's.
  perform platform.relation_unset(v_org, v_job, 'customer', v_ellery);
  perform platform.relation_set(v_org, v_job, 'customer', jsonb_build_array(v_marisol));

  -- ════════════════════════════════════════════════════════════════════════════
  -- CLAUSE 6 — HISTORY IS FILED FOR THE REVIVE. The edge came back as an UPDATE of the
  -- row it always was, so the row's own history says so. An edge that came back as a
  -- second row would have no history of ever having gone.
  -- ════════════════════════════════════════════════════════════════════════════
  select count(*) into v_hist from history.row_versions v
   where v.row_id = v_edge and v.organization_id = v_org and v.operation = 'UPDATE';
  if v_hist < 1 then
    raise exception '6: the link went, came back, went and came back again, and its history holds no UPDATE at all';
  end if;
  raise notice 'CLAUSE 6 OK: % UPDATE row(s) of history for one link''s round trips.', v_hist;

  -- ════════════════════════════════════════════════════════════════════════════
  -- CLAUSE 7 — THE HAZARD THE FIX CARRIES, CLOSED. A BEFORE INSERT trigger that returns
  -- NULL makes `INSERT … RETURNING` hand back nothing, and three doors read the edge id
  -- straight off that statement. The dispatcher takes the photo of the corroded riser out
  -- of the job's chat and puts it back: `public.conversation_file_add` must answer with the
  -- edge, never with a quiet NULL.
  -- ════════════════════════════════════════════════════════════════════════════
  -- PLANT: a conversation and a file, as the connected role — this store has no client door
  -- that makes either, and nothing is asserted while out of the seat.
  perform set_config('role', v_boss, true);
  insert into chat.conversation (id, organization_id, created_by, title)
  values (v_conv, v_org, c_admin, 'RPC-2214 — upstairs re-pipe, supply lines');
  insert into files.files (id, organization_id, created_by, file_name, file_path, storage_uri)
  values (v_photo, v_org, c_admin, 'rpc-2214-corroded-riser.jpg',
          'rincon/jobs/rpc-2214/rpc-2214-corroded-riser.jpg',
          'storage://rincon/jobs/rpc-2214/rpc-2214-corroded-riser.jpg');
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '7: the seat was not retaken after the plant — current_user is %', current_user;
  end if;

  v_link := public.conversation_file_add(v_conv, v_photo, 'Corroded riser, upstairs unit');
  if v_link is null then
    raise exception '7: attaching the photo the first time handed back no edge at all';
  end if;

  -- PLANT, and it is a FINDING rather than a convenience. `public.conversation_file_remove`,
  -- `public.agent_resource_remove` and `public.assoc_remove` all `DELETE FROM
  -- platform.associations` — they HARD-delete the edge, so taking the photo out leaves no
  -- tombstone to come back to and re-adding it makes a brand-new row with a new id. Measured
  -- here on 2026-09-21; it is a separate defect (this platform archives, it does not purge)
  -- and TAILS-5 did not absorb it silently. So the tombstone this clause needs is planted as
  -- the connected role, which is exactly what those three doors will write the day they are
  -- fixed, and nothing is asserted while out of the seat.
  perform set_config('role', v_boss, true);
  update platform.associations set deleted_at = now() where id = v_link;
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '7: the seat was not retaken after the tombstone plant — current_user is %', current_user;
  end if;

  v_link2 := public.conversation_file_add(v_conv, v_photo, 'Corroded riser, upstairs unit');
  if v_link2 is null then
    raise exception '7: 🚨 re-attaching the photo returned NULL. The revive skips the insert, so RETURNING hands back nothing, and this door read it straight through — the silent failure the fix was written to avoid.';
  end if;
  if v_link2 <> v_link then
    raise exception '7: the photo came back as a DIFFERENT edge (% then %) — a revive is an UPDATE of the tombstone, never a second row', v_link, v_link2;
  end if;
  if exists (select 1 from platform.associations a where a.id = v_link and a.deleted_at is not null) then
    raise exception '7: the door answered with the edge but left it tombstoned — the photo is still off the conversation';
  end if;
  select count(*) into v_n from platform.associations a
   where a.source_type = 'file' and a.source_id = v_photo
     and a.target_type = 'conversation' and a.target_id = v_conv;
  if v_n <> 1 then
    raise exception '7: % row(s) for one photo on one conversation', v_n;
  end if;
  raise notice 'CLAUSE 7 OK: the photo came back on the same edge and the door answered WITH it rather than with a quiet NULL.';
  raise notice 'CLAUSE 7 — FINDING, not this lane''s to fix: public.conversation_file_remove, public.agent_resource_remove and public.assoc_remove HARD-delete the edge (DELETE FROM platform.associations), so today a removal leaves nothing to revive and the re-add is a new row with a new id. This platform archives; those three doors do not.';

  -- ════════════════════════════════════════════════════════════════════════════
  -- CLAUSE 8 — AND NOTHING ELSE MOVED: an ordinary first link, onto an edge that has no
  -- tombstone, still goes in as an insert and still answers. The overwhelming majority of
  -- calls take this path and it must be untouched.
  -- ════════════════════════════════════════════════════════════════════════════
  v_edge2 := null;
  perform platform.relation_set(v_org, v_job, 'customer', jsonb_build_array(v_marisol));
  select a.id into v_edge2 from platform.associations a
   where a.source_id = v_job and a.role = 'customer' and a.deleted_at is null;
  if v_edge2 is distinct from v_edge then
    raise exception '8: re-stating an unchanged link moved it from % to %', v_edge, v_edge2;
  end if;
  select count(*) into v_hist2 from history.row_versions v
   where v.row_id = v_edge and v.organization_id = v_org;
  if v_hist2 < v_hist then
    raise exception '8: history LOST rows (% then %)', v_hist, v_hist2;
  end if;
  raise notice 'CLAUSE 8 OK: an unchanged link is still the same link, and nothing was lost.';

  perform set_config('role', v_boss, true);
  raise notice '=== TAILS-5 GREEN — the dispatcher can take a customer off a job and put the same customer back on, seated as a signed-in person, through the doors; the link keeps its id and its history; the relation contract still decides on the revive path; and the three doors that read the edge id off RETURNING answer with the edge rather than with NULL. Rolling back. ===';
end $green$;

rollback;
