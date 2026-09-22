-- additive: yes
-- guard: custom/system_enabled
--
-- chair-step: it REPLACES two live functions with identical signatures — `custom.migrate_purge`
--   and `custom.organization_clear` — and adds one new function, `custom.migrate_purge_hard`,
--   which is granted to NOBODY and declared as a chair-only lane. Nothing is dropped, renamed
--   or revoked; no row of any organization is deleted or rewritten by this file. It makes the
--   store STRICTER: after it, no door a client can reach issues a `delete from custom.record`
--   at all. The inverse is
--   migrations/inverse/storetails2_the_purge_archives_first_and_the_hard_delete_is_a_compliance_door_down.sql.
--
-- LANE STORE-TAILS-2 — the owner's law of 2026-09-20: "archive, never delete; no purge by
-- default; 30 days is compliance only."
--
-- WHAT WAS LIVE. `custom.migrate_purge` was ONE unchunked statement:
--
--   delete from custom.record c using doomed d where c.organization_id = $1 and c.id = d.id
--
-- over a WHOLE ORGANIZATION. Three things are wrong with it and only one of them is the size.
--
--   1. IT IS THE DEFAULT PATH. `custom.organization_clear`, the door the Danger Zone presses,
--      called it with `p_and_destroy => true` and destroyed every record past its window. The
--      owner's law says nothing important is deleted and nothing is purged by default, so the
--      verb an ordinary screen reaches must not be the verb that destroys.
--   2. IT IS ONE STATEMENT. FIX-10B already measured what that costs on this store: archiving
--      a 1,430-record table in one statement died at SQLSTATE 57014 twelve seconds in, and a
--      path that cannot survive what the write path produces is unbounded by construction. A
--      DELETE over an organization is the same shape, one order of magnitude bigger, holding
--      row locks on sixteen partitions while it runs.
--   3. IT ASKS NO REASON. A hard delete that nobody has to justify leaves nothing behind that
--      says why the rows are gone, which is the one thing a compliance erasure exists to have.
--
-- WHAT THIS FILE MAKES TRUE
--
--   * `custom.migrate_purge(organization, table, dry_run)` keeps its name, its signature and
--     its door — and ARCHIVES. It walks the organization's live Tables through
--     `custom.table_archive`, the chunked, resumable path FIX-10B built, spending a bounded
--     budget per call and answering `archived` / `remaining` / `done` — which is what a
--     progress bar is made of. `p_dry_run => true` (still the DEFAULT) changes nothing and
--     reports what it would archive. It destroys nothing, ever, and `rows_purged` answers 0
--     rather than disappearing, so an older caller reading that key is told the truth.
--   * `custom.migrate_purge_hard(organization, table, compliance_reason, chunk, dry_run)` is
--     the hard delete, and it is a DIFFERENT DOOR with four locks on it:
--       — a compliance reason of at least forty characters, refused if absent;
--       — every record in scope must ALREADY be archived, and archived for at least 30 days
--         (or the Table's own retention window, whichever is longer). One live record in
--         scope refuses the whole call by name;
--       — it is chair-only: no EXECUTE grant to `authenticated` or `anon`, a
--         `platform.client_callable_door` row that says `non_client_lane`, and a role check in
--         the body so a grant appearing later still would not open it;
--       — it runs in CHUNKS under its own `lock_timeout`, and records one
--         `history.migration_log` entry carrying the reason, with `kind = "none"` because a
--         hard delete is honestly one-way.
--     REC-21 is unchanged: a record whose id is still an alias target is never destroyed.
--   * `custom.organization_clear` moves onto the archive path — the one caller of
--     `custom.migrate_purge` anywhere in either repository (censused 2026-09-22: the only
--     other mention is `custom._store_door`'s hint text and aidream's generated catalogue,
--     `apps/shared/records/src/store.generated.ts`, which is a description, not a caller) —
--     and says so in the sentence it hands the screen.
--
-- WHAT MAKES IT FAIL (law 3): `scripts/campaign-tests/storetails2_red.sql` asserts the OLD
-- behaviour — that `custom.migrate_purge(org, table, false)` destroys rows and that no
-- compliance door exists — and goes green only when this file is reversed.

-- based-on: custom.migrate_purge(uuid, uuid, boolean) 03c3f6da8488f18118d49195f21a82e6501735e7ef35e3bfac179929d71b1681
-- based-on: custom.organization_clear(uuid, text, boolean) 94f94249cb799a5496fe9764c64617be916e3a5686ca1184cc56972026fa1d89

set lock_timeout = '5s';
set statement_timeout = '600s';

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. THE PURGE VERB, WHICH NOW ARCHIVES.
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function custom.migrate_purge(p_organization_id uuid, p_table_id uuid default null,
                                                p_dry_run boolean default true)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  -- WHAT ONE CALL TAKES ON. A client call goes through PostgREST, which cancels at ~8 s, so
  -- the budget is the honest number and the answer says what is left. Calling again carries on.
  c_budget constant integer := 200;
  v_left     integer := c_budget;
  v_archived integer := 0;
  v_table    uuid;
  v_res      jsonb;
  v_live     bigint;
  v_arch     bigint;
  v_id       uuid;
  v_name     text;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.migrate_purge');
  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.migrate_purge',
                                          'admin'::public.permission_level, 'table');
  perform custom.assert_store_door(p_organization_id, 'custom.migrate_purge');

  if p_organization_id is null then
    raise exception 'custom.migrate_purge: which organization''s records?'
      using errcode = '22004',
            hint = 'A null organization would archive the whole store.';
  end if;

  -- THE SWITCH, NAMED AND READ IN THE BODY (§6b.2). While `custom/system_enabled` resolves
  -- false the store belongs to the campaign that owns it.
  if not coalesce((platform.knob_resolve('custom', 'system_enabled', p_organization_id) #>> '{}')::boolean, false)
     and not pg_has_role(custom.caller_role(),
                         (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass),
                         'member') then
    raise exception 'The custom data store is switched off, so nothing was archived.'
      using errcode = '42501',
            hint = 'custom/system_enabled resolves false and this caller does not own custom.record. Nothing was changed.';
  end if;

  select o.name into v_name from iam.organizations o where o.id = p_organization_id;

  if not coalesce(p_dry_run, true) then
    -- ── EVERY TABLE IN SCOPE, THROUGH THE ONE CHUNKED PATH. `custom.table_archive` is
    --    FIX-10B's resumable archive: it soft-deletes through `custom.record_delete`, so every
    --    guard, every history capture and every outbox row still happens, and it answers how
    --    much is left. Nothing here issues a delete of its own.
    for v_table in
      select r.id from custom.record r
       where r.organization_id = p_organization_id
         and r.data_class = 'table'
         and r.deleted_at is null
         and (p_table_id is null or r.id = p_table_id)
       order by r.created_at, r.id
    loop
      exit when v_left <= 0;
      -- A Table may already have gone with an earlier one (a Table that lives in another
      -- Table's Home). Asking again is cheaper than guessing the order.
      if exists (select 1 from custom.record r
                  where r.organization_id = p_organization_id and r.id = v_table and r.deleted_at is null) then
        v_res := custom.table_archive(p_organization_id, v_table, v_left, true);
        v_archived := v_archived + coalesce((v_res ->> 'archived')::integer, 0);
        v_left     := v_left - coalesce((v_res ->> 'archived')::integer, 0);
      end if;
    end loop;

    -- Anything live this organization holds that no Table owned — a stranded row, the
    -- organization's Home — goes the same way, through the same soft-delete door.
    if p_table_id is null then
      for v_id in
        select r.id from custom.record r
         where r.organization_id = p_organization_id and r.deleted_at is null
         order by r.created_at, r.id
         limit greatest(v_left, 0)
      loop
        exit when v_left <= 0;
        if exists (select 1 from custom.record r
                    where r.organization_id = p_organization_id and r.id = v_id and r.deleted_at is null) then
          perform custom.record_delete(p_organization_id, v_id);
          v_archived := v_archived + 1;
          v_left     := v_left - 1;
        end if;
      end loop;
    end if;
  end if;

  select count(*) filter (where r.deleted_at is null),
         count(*) filter (where r.deleted_at is not null)
    into v_live, v_arch
    from custom.record r
   where r.organization_id = p_organization_id
     and (p_table_id is null or r.table_id = p_table_id or r.id = p_table_id);

  return jsonb_build_object(
    'function', 'custom.migrate_purge',
    'organization_id', p_organization_id, 'table_id', p_table_id,
    'organization', v_name,
    'dry_run', coalesce(p_dry_run, true),
    'archived', v_archived,            -- what THIS call archived
    'remaining', v_live,               -- live records still to archive in scope
    'archived_total', v_arch,
    'done', v_live = 0,
    'budget', c_budget,
    -- KEPT DELIBERATELY, AND HONEST. An older caller that read this key is told the number
    -- rather than left to find the key missing and read null as zero by accident.
    'rows_purged', 0,
    'policy', 'Nothing is destroyed here. Every record is archived and can be brought back. Destroying records for good is custom.migrate_purge_hard, a separate compliance door that needs a written reason and 30 days.',
    'message', case
      when coalesce(p_dry_run, true) and v_live > 0 then
        format('%s record%s would be archived. Nothing has been changed.',
               v_live, case when v_live = 1 then '' else 's' end)
      when coalesce(p_dry_run, true) then
        'There is nothing left to archive. Nothing has been changed.'
      when v_live = 0 and v_archived = 0 then
        'Everything here is already archived. Nothing was changed.'
      when v_live = 0 then
        format('%s record%s archived. Everything here can still be brought back.',
               v_archived, case when v_archived = 1 then '' else 's' end)
      else
        format('%s record%s archived, %s to go. Call again to carry on — it picks up where this left off.',
               v_archived, case when v_archived = 1 then '' else 's' end, v_live)
    end,
    'at', now());
end;
$fn$;

comment on function custom.migrate_purge(uuid, uuid, boolean) is
  'REC-23, under the owner''s law of 2026-09-20 ("archive, never delete; no purge by default"). '
  'This verb ARCHIVES: it walks the organization''s live Tables through custom.table_archive — '
  'chunked, resumable, every row going through custom.record_delete — and answers archived / '
  'remaining / done. It destroys nothing, and rows_purged answers 0 rather than disappearing. '
  'The hard delete is custom.migrate_purge_hard, a separate chair-only compliance door that '
  'needs a written reason and 30 days of archive behind every row.';

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. THE COMPLIANCE DOOR. It is the only thing left in this store that destroys.
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function custom.migrate_purge_hard(p_organization_id uuid,
                                                     p_table_id uuid default null,
                                                     p_compliance_reason text default null,
                                                     p_chunk integer default 200,
                                                     p_dry_run boolean default true)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  c_max   constant integer := 1000;
  c_floor constant integer := 30;       -- the owner's number: 30 days, for compliance only.
  v_chunk integer;
  v_days  integer;
  v_gone  bigint := 0;
  v_ready bigint;
  v_young bigint;
  v_live  bigint;
  v_log   uuid;
begin
  -- ── CHAIR ONLY, AND SAID TWICE. There is no EXECUTE grant to `authenticated` or `anon`, and
  --    the body refuses anyone who is not the owner of `custom.record` as well — so a grant
  --    issued by mistake one day still does not open a hard delete.
  if not pg_has_role(custom.caller_role(),
                     (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass),
                     'member') then
    raise exception 'Destroying records for good is not something a signed-in caller does here.'
      using errcode = '42501',
            hint = 'The owner''s law of 2026-09-20: archive, never delete. Everything a person can reach archives — custom.migrate_purge(organization, table, false) — and a record stays restorable. This door exists for a compliance erasure, is run by a person at a terminal who owns custom.record, and needs a written reason.';
  end if;

  if p_organization_id is null then
    raise exception 'custom.migrate_purge_hard: which organization''s archived records?'
      using errcode = '22004',
            hint = 'Retention is resolved per organization, so a purge that spanned organizations would apply one organization''s window to another''s data.';
  end if;

  perform custom.assert_store_door(p_organization_id, 'custom.migrate_purge_hard');

  -- ── THE REASON. Not a flag, not a boolean: the sentence somebody will read in a year when
  --    they ask why these rows are gone. Forty characters is roughly one real sentence.
  if nullif(btrim(coalesce(p_compliance_reason, '')), '') is null
     or length(btrim(p_compliance_reason)) < 40 then
    raise exception 'Nothing was destroyed: a compliance erasure needs a written reason.'
      using errcode = '22004',
            hint = 'Say, in a sentence of at least forty characters, who asked for this erasure, under what obligation, and what it covers. It is stored on the history.migration_log entry this call writes, and it is the only thing that will explain the missing rows afterwards.';
  end if;

  -- ── THE WINDOW. Thirty days at the very least, and the Table''s own retention when it asks
  --    for longer. Read through W3-HIST's one reader, which never answers below the floor.
  v_days := greatest(c_floor,
                     case when p_table_id is null
                          then history.retention_floor_days(p_organization_id)
                          else history.retention_days(p_organization_id, p_table_id) end);

  select count(*) filter (where r.deleted_at is null),
         count(*) filter (where r.deleted_at is not null
                            and r.deleted_at >= now() - make_interval(days => v_days))
    into v_live, v_young
    from custom.record r
   where r.organization_id = p_organization_id
     and (p_table_id is null or r.table_id = p_table_id or r.id = p_table_id);

  -- ── ARCHIVE FIRST, AND THE REFUSAL NAMES WHAT IS IN THE WAY. A live record in scope is not
  --    a record somebody has decided to erase; it is a record nobody has archived yet.
  if v_live > 0 then
    raise exception 'Nothing was destroyed: % record(s) here are still live.', v_live
      using errcode = '23514',
            hint = 'Archive first. custom.migrate_purge(organization, table, false) archives in resumable passes and nothing is lost; then those records have to sit archived for the retention window before this door will destroy them.';
  end if;
  if v_young > 0 then
    raise exception 'Nothing was destroyed: % record(s) here have been archived for less than % days.', v_young, v_days
      using errcode = '23514',
            hint = 'The window is the promise that an archived record can be brought back. This door ends it, and only after it has actually run out for every record in scope.';
  end if;

  v_chunk := least(greatest(coalesce(p_chunk, 200), 0), c_max);

  select count(*) into v_ready
    from custom.record r
   where r.organization_id = p_organization_id
     and (p_table_id is null or r.table_id = p_table_id or r.id = p_table_id)
     and r.deleted_at is not null
     and r.deleted_at < now() - make_interval(days => v_days)
     -- REC-21: an id that resolves to a surviving record is never destroyed, whatever its age.
     and not exists (select 1 from custom.record_alias a
                      where a.organization_id = r.organization_id and a.old_id = r.id);

  if not coalesce(p_dry_run, true) and v_chunk > 0 and v_ready > 0 then
    -- ── IN CHUNKS, UNDER ITS OWN LOCK TIMEOUT. One statement over an organization held row
    --    locks on sixteen partitions for as long as it took; this one takes `chunk` rows and
    --    gives up waiting rather than block a live write path.
    set local lock_timeout = '3s';
    with doomed as (
      select r.organization_id, r.id
        from custom.record r
       where r.organization_id = p_organization_id
         and (p_table_id is null or r.table_id = p_table_id or r.id = p_table_id)
         and r.deleted_at is not null
         and r.deleted_at < now() - make_interval(days => v_days)
         and not exists (select 1 from custom.record_alias a
                          where a.organization_id = r.organization_id and a.old_id = r.id)
       order by r.deleted_at, r.id
       limit v_chunk
    ),
    gone as (
      delete from custom.record c using doomed d
       where c.organization_id = d.organization_id and c.id = d.id
      returning 1
    )
    select count(*) from gone into v_gone;

    -- THE ROW THAT EXPLAINS THE MISSING ROWS. `kind = "none"` because this really is one-way,
    -- and history.migration_record refuses an undo that would be a lie.
    v_log := history.migration_record(
               p_organization_id, 'purge_hard', 'organization', p_organization_id,
               jsonb_build_object('kind', 'none',
                                  'why', 'a compliance erasure is deliberately one-way',
                                  'rows', v_gone,
                                  'table_id', p_table_id,
                                  'window_days', v_days),
               btrim(p_compliance_reason));
  end if;

  return jsonb_build_object(
    'function', 'custom.migrate_purge_hard',
    'organization_id', p_organization_id, 'table_id', p_table_id,
    'compliance_reason', btrim(p_compliance_reason),
    'window_days', v_days,
    'dry_run', coalesce(p_dry_run, true),
    'eligible', v_ready,
    'rows_purged', v_gone,
    'remaining', greatest(v_ready - v_gone, 0),
    'done', v_ready - v_gone <= 0,
    'migration_id', v_log,
    'policy', 'Nothing important is deleted here. This door is the compliance exception: every record in scope was already archived, has been archived for at least thirty days, a written reason is stored with the erasure, and an id something still resolves to is never destroyed (REC-21).',
    'at', now());
end;
$fn$;

comment on function custom.migrate_purge_hard(uuid, uuid, text, integer, boolean) is
  'THE COMPLIANCE ERASURE, and the only thing left in this store that destroys a record. '
  'Chair-only: no client grant, a client_callable_door row declaring a non-client lane, and a '
  'role check in the body as well. It refuses unless every record in scope is already archived '
  'AND has been archived for at least thirty days (or the Table''s own longer window), and '
  'unless a written reason of at least forty characters is given — which is stored on the '
  'history.migration_log entry it writes, with kind "none" because a hard delete is honestly '
  'one-way. It runs in chunks under its own lock_timeout, and never destroys an id that '
  'custom.record_alias still resolves to (REC-21).';

-- ═════════════════════════════════════════════════════════════════════════════
-- 3. THE ONE CALLER, MOVED ONTO THE ARCHIVE PATH.
-- ═════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION custom.organization_clear(p_organization_id uuid, p_confirm text, p_and_destroy boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me        uuid := custom.query_principal();
  v_boss      boolean := custom.query_is_store_owner();
  v_name      text;
  v_table     uuid;
  v_logs      uuid[] := '{}';
  v_retired   integer := 0;
  v_left      uuid;
  v_floor     integer;
  v_holder    record;
  v_gone      bigint;
  v_destroyed jsonb := '[]'::jsonb;
  v_total     bigint := 0;
  v_purged    bigint := 0;
  v_waiting   bigint := 0;
  v_free_on   timestamptz;
  v_res       jsonb;
  v_out       jsonb;
  -- STORE-TAILS-2: what the (now archiving) purge took on in step two.
  v_archived_now bigint := 0;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.organization_clear');
  -- THE SWITCH. While `custom/system_enabled` resolves false this store belongs to the
  -- campaign that owns it, and nothing outside that campaign empties an organization in it.
  perform custom.assert_store_door(p_organization_id, 'custom.organization_clear');

  if p_organization_id is null then
    raise exception 'custom.organization_clear: which organization?'
      using errcode = '22004',
            hint = 'A null organization would empty the whole store.';
  end if;

  select o.name into v_name from iam.organizations o where o.id = p_organization_id;
  if v_name is null then
    raise exception 'There is no organization % here.', p_organization_id
      using errcode = '02000';
  end if;

  -- OWNER ONLY, the same person iam.organizations.org_delete_policy lets delete it. Being
  -- able to edit this organization's records is not the same permission as emptying it.
  if not v_boss and not (v_me is not null and iam.is_org_owner(p_organization_id, v_me)) then
    raise exception 'Only the owner of % can empty it.', v_name
      using errcode = '42501',
            hint = 'This removes every table and record the organization holds. Ask an owner of this organization to do it, or have an owner transfer ownership to you first. An admin of the organization is not enough.';
  end if;

  -- THE CONFIRMATION, character for character — the same one the Danger Zone asks for, asked
  -- again HERE, so a caller that never drew a dialog cannot empty an organization by accident.
  if p_confirm is distinct from v_name then
    raise exception 'Nothing was removed: the confirmation did not match this organization''s name.'
      using errcode = '22023',
            hint = format('Type the organization''s name exactly — %s — to confirm.', v_name);
  end if;

  v_floor := history.retention_floor_days(p_organization_id);

  -- STEP ONE, ALWAYS RUN: RETIRE, THROUGH THE STORE'S OWN DOOR. custom.migrate_delete takes a
  -- Table's records, saved views, Rules and Fields with it as ONE history.migration_log entry,
  -- and custom.migrate_undo puts the whole set back. Nothing here is hard-deleted.
  for v_table in
    select r.id from custom.record r
     where r.organization_id = p_organization_id
       and r.data_class = 'table'
       and r.deleted_at is null
     order by r.created_at
  loop
    -- A Table may already have gone with an earlier one in this loop (a Table that lives in
    -- another Table's Home). Asking the store again is cheaper than guessing the order.
    if exists (select 1 from custom.record r
                where r.organization_id = p_organization_id and r.id = v_table and r.deleted_at is null) then
      v_out := custom.migrate_delete(p_organization_id, v_table,
                 format('retired while emptying organization %s', v_name));
      v_logs := v_logs || (v_out ->> 'migration_id')::uuid;
      v_retired := v_retired + 1;
    end if;
  end loop;

  -- Anything live that no Table owned — a stranded row, this organization's Home — goes the
  -- same way, through the same door, one entry each.
  for v_left in
    select r.id from custom.record r
     where r.organization_id = p_organization_id and r.deleted_at is null
     order by r.created_at
  loop
    if exists (select 1 from custom.record r
                where r.organization_id = p_organization_id and r.id = v_left and r.deleted_at is null) then
      v_out := custom.migrate_delete(p_organization_id, v_left,
                 format('retired while emptying organization %s', v_name));
      v_logs := v_logs || (v_out ->> 'migration_id')::uuid;
      v_retired := v_retired + 1;
    end if;
  end loop;

  if not p_and_destroy then
    return jsonb_build_object(
      'function', 'custom.organization_clear',
      'organization_id', p_organization_id, 'name', v_name,
      'destroyed', false,
      'retired_operations', v_retired,
      'migrations', to_jsonb(v_logs),
      'recoverable_until', now() + make_interval(days => v_floor),
      'sentence', format(
        'Everything in %s is retired. Nothing was destroyed — you can put all of it back until %s.',
        v_name, to_char(now() + make_interval(days => v_floor), 'FMDD FMMonth YYYY')),
      'at', now());
  end if;

  -- STEP TWO: ARCHIVE WHATEVER IS SOMEHOW STILL LIVE, AND DESTROY NOTHING. Under the owner's
  -- law of 2026-09-20 `custom.migrate_purge` archives rather than deletes, in resumable
  -- chunks, so this step is now a belt on step one rather than the thing that ends records.
  -- Step one has normally taken everything already, and then this answers "done" and changes
  -- nothing. Destroying records for good is `custom.migrate_purge_hard`, a separate compliance
  -- door with a written reason and a thirty-day window, and no screen reaches it.
  v_res := custom.migrate_purge(p_organization_id, null, false);
  v_purged := 0;
  v_archived_now := coalesce((v_res ->> 'archived')::bigint, 0);
  v_retired := v_retired + v_archived_now::integer;

  -- The rest of what an organization holds in this store is WORK LOG, not records under a
  -- retention window: the outbox, imports, comments, document renders and signatures, the
  -- anonymous lane's tokens and hits, the merge provenance. Asked of the catalog rather than
  -- named, so a foreign key added after this file is written is cleared too; custom.record and
  -- history.migration_log are left to the purge and to the organization's own delete.
  for v_holder in
    select q.s, q.t from (
      select distinct rn.nspname as s, rc.relname as t
        from pg_constraint con
        join pg_class rc on rc.oid = con.conrelid
        join pg_namespace rn on rn.oid = rc.relnamespace
       where con.contype = 'f'
         and con.confrelid = 'iam.organizations'::regclass
         and rn.nspname in ('custom', 'history')
         and rc.relkind in ('r', 'p')
         and rc.relispartition = false
         and rn.nspname || '.' || rc.relname not in ('custom.record', 'history.migration_log')) q
     order by q.s, q.t
  loop
    execute format('delete from %I.%I where organization_id = $1', v_holder.s, v_holder.t)
      using p_organization_id;
    get diagnostics v_gone = row_count;
    if v_gone > 0 then
      v_destroyed := v_destroyed || jsonb_build_object('where', v_holder.s || '.' || v_holder.t, 'rows', v_gone);
      v_total := v_total + v_gone;
    end if;
  end loop;

  -- STEP THREE: SAY WHAT IS LEFT, AND WHEN. A retired record inside its window is not a
  -- failure and it is not a foreign key — it is the undo somebody was promised, and the only
  -- honest answer is the DATE.
  select count(*), min(r.deleted_at + make_interval(days => greatest(history.retention_days(p_organization_id, r.table_id), v_floor)))
    into v_waiting, v_free_on
    from custom.record r
   where r.organization_id = p_organization_id;

  -- THE MIGRATION LOG IS THE UNDO, so it goes LAST and only when there is nothing left to
  -- undo. Sweeping it with the other work logs threw away the very entry this door had just
  -- promised the person, which the green suite caught on its first run.
  if v_waiting = 0 then
    delete from history.migration_log m where m.organization_id = p_organization_id;
    get diagnostics v_gone = row_count;
    if v_gone > 0 then
      v_destroyed := v_destroyed || jsonb_build_object('where', 'history.migration_log', 'rows', v_gone);
      v_total := v_total + v_gone;
    end if;
  end if;

  return jsonb_build_object(
    'function', 'custom.organization_clear',
    'organization_id', p_organization_id, 'name', v_name,
    'destroyed', false,
    'archived', true,
    'retired_operations', v_retired,
    'migrations', to_jsonb(v_logs),
    'rows_destroyed', v_total,
    'destroyed_from', v_destroyed,
    'rows_waiting', v_waiting,
    'removable_on', v_free_on,
    'is_empty', v_waiting = 0,
    'sentence', case
      when v_waiting = 0 then
        format('%s is empty — %s row(s) of working logs were cleared, and the organization can now be deleted.',
               v_name, v_total)
      else
        -- THE HONEST ANSWER, AND IT IS NO LONGER A DATE TO WAIT FOR. Nothing here is destroyed
        -- on a timer any more: the records stay archived and restorable until somebody asks for
        -- a compliance erasure in writing. Saying "removable on <date>" would be a promise this
        -- door no longer keeps.
        format('Everything in %s is archived — %s record(s), all of which can still be brought back. Nothing was destroyed, so the organization still holds them and cannot be removed yet. Destroying them for good is a separate compliance step that needs a written reason and thirty days.',
               v_name, v_waiting)
      end,
    'at', now());
end;
$function$

;

comment on function custom.organization_clear(uuid, text, boolean) is
  'The supported way to empty an organization. It retires every Table and every stranded row '
  'through custom.migrate_delete, then asks custom.migrate_purge — which, under the owner''s '
  'law of 2026-09-20, ARCHIVES in resumable chunks rather than deleting — to take on anything '
  'still live. It clears this organization''s working logs (outbox, imports, comments, renders, '
  'anonymous-lane rows), which are logs of work rather than records under a window, and it '
  'destroys no record at all. Destroying records for good is custom.migrate_purge_hard, a '
  'chair-only compliance door with a written reason and a thirty-day window.';

-- ═════════════════════════════════════════════════════════════════════════════
-- 4. THE COMPLIANCE DOOR, DECLARED AS A NON-CLIENT LANE AND GRANTED TO NOBODY.
--    Schema `custom` never issues a raw GRANT; `platform.enforce_definer_client_grants`
--    takes back any grant a function holds without a row here. This row exists so the
--    catalogue SAYS why there is no client lane, rather than leaving a definer function
--    that nothing explains.
-- ═════════════════════════════════════════════════════════════════════════════
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes,
   signed_in_callers, anonymous_callers, non_client_lane, declared_by, reason)
select 'custom', 'migrate_purge_hard', iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes),
       false, false,
       'chair_only: a compliance erasure is run by a person at a terminal who owns custom.record, never by a signed-in seat. Browser roles hold no EXECUTE privilege on this function and this migration grants none; the body refuses any caller that is not a member of custom.record''s owner role as well, so a grant issued by mistake later still would not open a hard delete.',
       'migrations/campaign/storetails2_the_purge_archives_first_and_the_hard_delete_is_a_compliance_door.sql (lane STORE-TAILS-2)',
       'The hard delete, moved off the path every screen reaches. Under the owner''s law of 2026-09-20 nothing important is deleted and nothing is purged by default: custom.migrate_purge archives, and this door destroys only after every record in scope has been archived for at least thirty days and a written reason of at least forty characters has been given, in chunks, under its own lock_timeout, never touching an id custom.record_alias still resolves to.'
  from pg_proc p
 where p.proname = 'migrate_purge_hard' and p.pronamespace = 'custom'::regnamespace
   and not exists (select 1 from platform.client_callable_door d
                    where d.schema_name = 'custom' and d.function_name = 'migrate_purge_hard'
                      and d.identity_argtypes = platform.door_argtypes(p.proargtypes));

revoke all on function custom.migrate_purge_hard(uuid, uuid, text, integer, boolean) from public;
