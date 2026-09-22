-- additive: yes
-- guard: custom/system_enabled
--
-- chair-step: it GRANTS EXECUTE to `authenticated` on ONE new function of schema `custom`
--   (`custom.table_archive`). The grant is the one shape this runner's allow-list refuses by
--   name, and it is the point of the file: without it no screen can archive a table the
--   product itself filled. The function is SECURITY DEFINER, asks the switch, the
--   organization wall and the rung by name before it reads or writes anything, and it writes
--   NOTHING itself — every row it archives goes through `custom.record_delete`, the store's
--   one soft-delete door, so every guard, every history capture and every outbox row still
--   happens. Nothing is dropped, nothing is revoked, no existing function is replaced, no row
--   of any feature is deleted or rewritten. The inverse is
--   `migrations/inverse/a_table_is_archived_in_chunks_and_survives_a_cut_down.sql`.
--
-- LANE FIX-10B — VERIFIER-10 finding F3 (HIGH).
--
-- WHAT A PERSON DID, AND WHAT HAPPENED. An admin of Rincon Plumbing Co opened Settings on
-- "Truck 1 dispatch backlog" (1,400 records the product itself had just imported), pressed
-- **Delete this table** and confirmed:
--
--   > That took too long to answer
--   > canceling statement due to statement timeout
--   > Nothing was changed. Try a smaller page, or try again in a moment.   SQLSTATE 57014
--
-- Reproduced twice, minutes apart. The write path put 1,000 rows in in 29 seconds; the delete
-- path could not survive what the write path produced. And the advice — "try a smaller page" —
-- means nothing when what you are doing is getting rid of a table.
--
-- THE CLASS, NOT THE INSTANCE. `custom.record_delete` on a Table recurses through EVERY thing
-- the Table contains inside ONE transaction: a `custom.delete_rule` call, an access check, a
-- history capture and an outbox row per record. That is right for a record and for a table of
-- forty rows, and it is unbounded by construction — there is no number of records at which it
-- starts working again, so raising the timeout only moves the wall. A store whose write path
-- is batched and whose delete path is not has one honest shape available to it: **archiving a
-- table is a job, not a statement.**
--
-- WHAT THIS FILE MAKES TRUE
--
--   * `custom.table_archive(organization, table, chunk, include_table)` archives at most
--     `chunk` of the table's records per call and comes back with numbers — `archived`,
--     `remaining`, `total`, `done` — so a screen can show a bar instead of a spinner and a
--     sentence instead of an SQLSTATE.
--   * IT IS RESUMABLE BECAUSE IT IS STATELESS. There is no job row to lose: what remains is
--     read off the records themselves every call, so a browser closed halfway, a laptop shut,
--     a deploy mid-run, all leave a table that is half archived and a next call that picks up
--     exactly where the last one stopped. Calling it again when nothing is left is not an
--     error; it says so and changes nothing.
--   * NOTHING IS DELETED. Every row goes through `custom.record_delete`, which sets
--     `deleted_at` — `custom.record_restore` still brings any of them back, and the Table is
--     only archived itself once nothing live is left inside it.
--   * `chunk => 0` archives nothing and only reports, so a screen can say "1,399 records will
--     be archived" BEFORE the person commits to it.
--   * The Table itself goes last and through the same door, by which time its own cascade is
--     the handful of Fields, saved views and Rules it carries — bounded, and fast.
--
-- WHY NOT A BIGGER TIMEOUT: because the person's browser has one too, and because a delete
-- that takes four minutes with nothing on the screen is indistinguishable from a broken one.
-- The remedy for "this cannot finish in one statement" is more statements, not a longer one.


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. THE PRIMITIVE.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function custom.table_archive(
  p_organization_id uuid,
  p_table_id        uuid,
  p_chunk           integer default 200,
  p_include_table   boolean default true)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  c_max     constant integer := 1000;  -- the most one call will take on, said out loud below
  v_chunk   integer;
  v_id      uuid;
  v_did     integer := 0;
  v_live    integer;
  v_gone    integer;
  v_name    text;
  v_table   boolean;                   -- is the Table record itself still live?
  v_done    boolean := false;
begin
  -- THE SWITCH, THE WALL, THE RUNG — all three by name, before anything is read or written.
  -- The rung is the one `custom.record_delete` asks of the Table record, asked ONCE here so a
  -- person who may not do this is told before the first row moves rather than after.
  perform custom.assert_store_door(p_organization_id, 'custom.table_archive');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.table_archive');

  if p_organization_id is null or p_table_id is null then
    raise exception 'Archiving a table needs the organization and the table, and this call does not say which.'
      using errcode = '22004';
  end if;

  select coalesce(nullif(r.data ->> 'name', ''), 'this table'), r.deleted_at is null
    into v_name, v_table
    from custom.record r
   where r.organization_id = p_organization_id
     and r.id = p_table_id
     and r.data_class = 'table';
  if not found then
    raise exception 'There is no table % in this organization, so there is nothing to archive.', p_table_id
      using errcode = '02000',
            hint = 'The store is keyed (organization_id, id), so a table of another organization is not found by this one. Nothing was changed.';
  end if;

  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.table_archive');

  -- HOW MUCH THIS CALL TAKES ON. 0 means "tell me, change nothing" — which is what a screen
  -- asks before it shows a person a number and a button. Above c_max is refused by clamping
  -- rather than by an exception, because a caller asking for too much wants the work done,
  -- not a lecture; the answer says what it actually did.
  v_chunk := least(greatest(coalesce(p_chunk, 200), 0), c_max);

  if v_chunk > 0 then
    for v_id in select r.id
                  from custom.record r
                 where r.organization_id = p_organization_id
                   and r.table_id = p_table_id
                   and r.data_class = 'record'
                   and r.deleted_at is null
                 order by r.created_at, r.id
                 limit v_chunk
    loop
      -- A RECORD THAT CONTAINS OTHER RECORDS TAKES THEM WITH IT, so a row this loop is about
      -- to reach may already have gone with an earlier one. That is not an error and it is
      -- not a second delete; it is simply already done.
      if exists (select 1 from custom.record r
                  where r.organization_id = p_organization_id and r.id = v_id and r.deleted_at is null) then
        perform custom.record_delete(p_organization_id, v_id);
        v_did := v_did + 1;
      end if;
    end loop;
  end if;

  select count(*) filter (where r.deleted_at is null),
         count(*) filter (where r.deleted_at is not null)
    into v_live, v_gone
    from custom.record r
   where r.organization_id = p_organization_id
     and r.table_id = p_table_id
     and r.data_class = 'record';

  -- THE TABLE GOES LAST, AND ONLY WHEN IT IS EMPTY. By now its own cascade is the Fields, the
  -- saved views and the Rules it carries — tens of rows, not thousands — so the one call that
  -- could not finish before is now the cheapest one in the run.
  if v_live = 0 and coalesce(p_include_table, true) and v_table then
    perform custom.record_delete(p_organization_id, p_table_id);
    v_table := false;
  end if;

  v_done := v_live = 0 and (not coalesce(p_include_table, true) or not v_table);

  return jsonb_build_object(
    'table_id',   p_table_id,
    'table_name', v_name,
    'archived',   v_did,                 -- what THIS call archived
    'remaining',  v_live,                -- records still live in this table
    'total',      v_live + v_gone,       -- records this table has ever held
    'archived_total', v_gone,            -- records of this table already archived, all runs
    'table_archived', not v_table,
    'done',       v_done,
    'chunk',      v_chunk,
    'message',    case
      when v_chunk = 0 and v_live > 0 then
        format('%s record%s in %s would be archived. Nothing has been changed yet.',
               v_live, case when v_live = 1 then '' else 's' end, v_name)
      when v_done and v_did = 0 then
        format('%s is already archived. Nothing was changed.', v_name)
      when v_done then
        format('%s record%s archived. %s is archived, and everything in it can still be brought back.',
               v_did, case when v_did = 1 then '' else 's' end, v_name)
      else
        format('%s record%s archived, %s to go in %s. Call again to carry on — it picks up where this left off.',
               v_did, case when v_did = 1 then '' else 's' end, v_live, v_name)
    end);
end;
$function$;

comment on function custom.table_archive(uuid, uuid, integer, boolean) is
  'Archive a table in chunks, resumably. Each call soft-deletes at most `chunk` of the '
  'table''s records through custom.record_delete (so every guard, history capture and outbox '
  'row still happens) and answers with archived / remaining / total / done, which is what a '
  'progress bar is made of. `chunk => 0` reports without changing anything. What remains is '
  'read off the records themselves, so there is no job row to lose: a run cut in half resumes '
  'exactly where it stopped. The Table itself is archived only once nothing live is left in '
  'it. VERIFIER-10 F3: deleting a 1,400-record table in one statement died on SQLSTATE 57014, '
  'and a delete path that cannot survive what the write path produces is unbounded by '
  'construction — the remedy is more statements, never a longer one.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. DECLARE, THEN GRANT. `platform.enforce_definer_client_grants` fires ON THE
--    GRANT, so a grant issued before its declaration is taken straight back
--    inside the same transaction while the run still reports success.
-- ─────────────────────────────────────────────────────────────────────────────

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes,
   signed_in_callers, anonymous_callers, declared_by, reason)
select 'custom', 'table_archive', iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes),
       true, false,
       'migrations/campaign/a_table_is_archived_in_chunks_and_survives_a_cut.sql (lane FIX-10B)',
       'Archive a table in resumable chunks. The one-statement delete cannot survive a table the product itself filled (SQLSTATE 57014 on 1,400 records), so the screen archives in passes and shows the progress. Every row goes through custom.record_delete; nothing is hard-deleted.'
  from pg_proc p
 where p.proname = 'table_archive' and p.pronamespace = 'custom'::regnamespace
   and not exists (select 1 from platform.client_callable_door d
                    where d.schema_name = 'custom' and d.function_name = 'table_archive'
                      and d.identity_argtypes = platform.door_argtypes(p.proargtypes));

grant execute on function custom.table_archive(uuid, uuid, integer, boolean) to authenticated;
