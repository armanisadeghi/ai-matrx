-- ARGS-RULED-2 — custom.table_archive TELLS AN EMPTY TABLE'S OWNER WHAT HAPPENED, AND ITS
-- PREVIEW CHANGES NOTHING.
--
-- THE USE CASE (no fake test data): Willow Creek Veterinary Clinic, a three-vet small-animal
-- practice in Bend, Oregon. Its practice manager built a "Boarding Kennel Waitlist" Table for the
-- holiday rush, never used it, and now archives it from the Table's settings panel. That panel
-- (@ai-matrx/records-ui TableSettings) first asks the store for a PREVIEW — `p_chunk = 0`, "tell
-- me, change nothing" — so it can show the number before she confirms, then runs the passes.
--
-- THE SEAT: `authenticated` carrying test@test.com, the clinic's owner. Ends in ROLLBACK.
--
-- 1 · the preview on an empty Table changes NOTHING — the Table is still live afterwards — and
--     says the next step would archive the table itself. (Before: the preview archived it.)
-- 2 · the real pass archives the Table and SAYS SO: "the table itself is now archived".
--     (Before: "is already archived. Nothing was changed.")
-- 3 · a second pass, on a Table that really was already archived, says "already archived".
-- 4 · the control: a Table with records still previews its record count and changes nothing.
--
-- RED TWIN: argsruled2_table_archive_red.sql runs the inverse (pre-fix body) in its own
-- rolled-back transaction and requires clauses 1 and 2 to fail again.

\set suite 'argsruled2_table_archive_green.sql'
\set requires 'function:custom.table_archive|function:custom.record_delete|relation:custom.record'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
begin;

do $$
declare
  c_owner uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  v_boss  text := current_user;
  v_clinic uuid; v_waitlist uuid; v_intake uuid;
  v_res jsonb; v_live boolean;
begin
  perform set_config('app.actor_system', 'campaign.argsruled2_table_archive_suite', true);
  insert into iam.organizations (name, slug, abbreviation)
  values ('Willow Creek Veterinary Clinic', 'willow-creek-vet-argsruled2-archive', 'WCV') returning id into v_clinic;
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_clinic, 'organization', v_clinic, c_owner, 'owner', 'active');
  insert into custom.record (organization_id, data_class, data, created_by, updated_by)
  values (v_clinic, 'table', jsonb_build_object('name', 'Boarding Kennel Waitlist'), c_owner, c_owner)
  returning id into v_waitlist;
  insert into custom.record (organization_id, data_class, data, created_by, updated_by)
  values (v_clinic, 'table', jsonb_build_object('name', 'Canine Dental Intake'), c_owner, c_owner)
  returning id into v_intake;
  insert into custom.record (organization_id, table_id, data_class, data, created_by, updated_by)
  values (v_clinic, v_intake, 'record', '{}'::jsonb, c_owner, c_owner);

  perform set_config('request.jwt.claims', json_build_object('sub', c_owner::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' or auth.uid() <> c_owner then
    raise exception '0: not in the owner''s seat';
  end if;

  -- ══ 1 · the preview changes nothing ══
  v_res := custom.table_archive(v_clinic, v_waitlist, 0, true);
  perform set_config('role', v_boss, true);
  select deleted_at is null into v_live from custom.record where organization_id = v_clinic and id = v_waitlist;
  perform set_config('role', 'authenticated', true);
  if not v_live then
    raise exception '1: the PREVIEW (p_chunk 0, "change nothing") archived the empty Boarding Kennel Waitlist — the settings panel does this before she confirms: %', v_res;
  end if;
  if v_res ->> 'message' not like '%would archive the table itself. Nothing has been changed yet.%'
     or (v_res ->> 'table_archived')::boolean then
    raise exception '1: the preview did not say what the next step would do: %', v_res;
  end if;

  -- ══ 2 · the real pass archives it and says so ══
  v_res := custom.table_archive(v_clinic, v_waitlist, 50, true);
  if v_res ->> 'message' not like '%the table itself is now archived%'
     or (v_res ->> 'table_archived')::boolean is not true or (v_res ->> 'done')::boolean is not true then
    raise exception '2: the pass that archived the empty Table did not say so: %', v_res;
  end if;

  -- ══ 3 · a Table that really was already archived says so ══
  v_res := custom.table_archive(v_clinic, v_waitlist, 50, true);
  if v_res ->> 'message' not like '%is already archived. Nothing was changed.%' then
    raise exception '3: a Table archived before this call was not told it already was: %', v_res;
  end if;

  -- ══ 4 · the control: a Table with a record previews its count and changes nothing ══
  v_res := custom.table_archive(v_clinic, v_intake, 0, true);
  if v_res ->> 'message' not like '1 record in Canine Dental Intake would be archived. Nothing has been changed yet.%'
     or (v_res ->> 'remaining')::int <> 1 then
    raise exception '4: the preview of a Table with a record changed or misreported: %', v_res;
  end if;

  perform set_config('role', v_boss, true);
  raise notice 'argsruled2_table_archive_green: 4 clauses passed — the preview changes nothing, and an empty Table is told it was archived';
end $$;

rollback;
