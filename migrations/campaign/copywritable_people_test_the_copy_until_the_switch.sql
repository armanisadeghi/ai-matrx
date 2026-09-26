-- chair-step: lane COPY-WRITABLE (chair ruling 2026-09-25, from Arman's words: "Enable full read/write functionality on the new route immediately for testing and validation. Prior to final cutover, sync/pull the latest data from the legacy tables."). REPLACES the bodies of custom._context_copy_fence(), custom._older_table_copy_refusal(uuid), custom.where_tables_live(uuid[]), platform.cutover_tables_copied(uuid), platform._cutover_seam_readiness(text,uuid) and platform._cutover_seam_apply(text,uuid,text,uuid,uuid). ADDS two tables (platform.cutover_evaluation_write — one open row per copy row a person touched, with the row as the mover left it; platform.cutover_evaluation_replaced — the append-only log the switch writes), the person test platform.write_is_a_persons_own(), the fence's verdict custom._older_table_copy_verdict(uuid), the fence's two private steps custom._copy_evaluation_note / custom._copy_evaluation_reimage, the switch's re-sync platform._cutover_copy_resync, the mover's carry platform.cutover_evaluation_carry, and the client door custom.table_copy_evaluation_state(uuid). No row of any existing table is written except door declarations. No foreign key to iam.organizations (a live-database lock, rehearsal-on-live rule).
-- based-on: custom._older_table_copy_refusal(uuid) c0623ae788c3162718d7290bdf7f3af84ee2775b4cbb30979b00b8f8ad625b0e
-- based-on: custom._context_copy_fence() f2b0b58b52f8a7d22bf48995eafc687fb1e682a278c50a027a5153e73331de85
-- based-on: custom.where_tables_live(uuid[]) 29d195e16e33eaf3521c55b4d1490b3eecd22cfd8b4a86c60871027b266df6f6
-- based-on: platform.cutover_tables_copied(uuid) 80f7cbaa3ba09aca6edd3dd61c10cdda9191099cc76ee8a458f0eac267f643b7
-- based-on: platform._cutover_seam_readiness(text, uuid) bb371bb87ddef5c0acabe6a35e18a70a63306b0df03675ba6c3655f2540837a8
-- based-on: platform._cutover_seam_apply(text, uuid, text, uuid, uuid) 4dc26c950412e51430faa16c08857f1f5f4ce3085daf17a5983fc636d2b4ef45
-- lane: COPY-WRITABLE
-- INVERSE: migrations/inverse/copywritable_people_test_the_copy_until_the_switch_down.sql
--
-- THE RULE BEFORE THIS FILE (WHERE-LIVES-SWITCH, 2026-09-25): while an organization's Data tables
-- switch is off, the same-id copy of a live older table is read-only for every client. Arman could
-- not evaluate the new table page end to end: every edit on it was refused.
--
-- THE RULE AFTER IT:
--   · A PERSON (the client channel, signed in, declaring no agent, system or machine tier) may
--     create, edit, archive and restore rows, change the table's settings and fields on the copy,
--     through the new table page and the record page. Views (platform.saved_view) and comments
--     (custom.io_comment) were never fenced.
--   · AGENTS, AUTOMATIONS AND INTEGRATIONS keep writing the OLDER table (every resolver asks
--     custom.where_tables_live, unchanged); a write of theirs that reaches the copy is still
--     refused by name, with the older table's address.
--   · Every copy row a person touches is NOTED once, with the row exactly as the mover left it
--     (or `created` when a person made it). Readiness measures "was the older row edited after
--     its copy?" against that image, so a person's test edit never hides an older-table edit.
--   · THE SWITCH (Data tables → new) first RE-SYNCS: every noted row is put back to its image
--     (the older table's truth as the mover copied it), every row a person created is ARCHIVED
--     (never deleted), and one log row per table records the counts; then it archives the older
--     tables exactly as before. Older-table edits since the copy are carried by the mover's
--     rerun (readiness holds the switch back, named, until they are); the rerun refreshes the
--     noted image instead of the person's visible test edit.
--   · The new door custom.table_copy_evaluation_state(table) says all of this for one table, so
--     the table's ⋯ menu can say "Test copy: your edits here are replaced by the older table at
--     switch time" without a banner.


-- ── 1. WHAT A PERSON TESTED, AND WHAT THE SWITCH REPLACED ─────────────────────────────────────
create table if not exists platform.cutover_evaluation_write (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  table_id        uuid not null,
  record_id       uuid not null,
  data_class      text not null,
  created         boolean not null,
  pre_image       jsonb,
  first_by        uuid,
  last_by         uuid,
  first_at        timestamptz not null default clock_timestamp(),
  last_at         timestamptz not null default clock_timestamp(),
  writes          integer not null default 1,
  replaced_at     timestamptz,
  replaced_in     uuid,
  constraint cutover_evaluation_write_image check (created = (pre_image is null))
);

comment on table platform.cutover_evaluation_write is
  'COPY-WRITABLE: one open row per row of a test copy (the same-id copy of a live older table, switch off) that a PERSON wrote through the new pages — the row as the mover left it (pre_image), or created = true when the person made it. The Data tables switch puts each back (or archives a created one) before it flips, then closes the row (replaced_at, replaced_in = its platform.cutover_evaluation_replaced log row). Written only by the copy fence and the switch; no client role reads it (custom.table_copy_evaluation_state answers the counts).';

create unique index if not exists cutover_evaluation_write_open
  on platform.cutover_evaluation_write (organization_id, record_id) where replaced_at is null;
create index if not exists cutover_evaluation_write_table
  on platform.cutover_evaluation_write (organization_id, table_id) where replaced_at is null;

alter table platform.cutover_evaluation_write enable row level security;
revoke all on platform.cutover_evaluation_write from public, anon, authenticated, service_role;
-- Our own admin database access: the admin system reads through the server key; the DDL guard
-- re-grants service_role SELECT on each new table (admin_door_survives_revoke). A platform_admin_read
-- POLICY takes ACCESS EXCLUSIVE on auth/storage relations (window-class), so it is not added here.

create table if not exists platform.cutover_evaluation_replaced (
  id                 uuid primary key default gen_random_uuid(),
  press_id           uuid not null,
  organization_id    uuid not null,
  table_id           uuid not null,
  table_name         text,
  replaced_at        timestamptz not null default clock_timestamp(),
  writes             integer not null,
  rows_put_back      integer not null,
  rows_unarchived    integer not null,
  rows_archived      integer not null,
  settings_put_back  integer not null,
  settings_archived  integer not null,
  archived_ids       uuid[] not null default '{}',
  people             uuid[] not null default '{}',
  says               text not null
);

comment on table platform.cutover_evaluation_replaced is
  'COPY-WRITABLE: the "evaluation writes replaced" log — one row per table per Data tables switch that re-synced a test copy from its older table: how many test writes there were, how many rows were put back to the older table''s version, brought back from archive, or (created by a person on the copy, with no older row) archived — never deleted — with their ids. Append-only.';

create index if not exists cutover_evaluation_replaced_org on platform.cutover_evaluation_replaced (organization_id, replaced_at desc);

alter table platform.cutover_evaluation_replaced enable row level security;
revoke all on platform.cutover_evaluation_replaced from public, anon, authenticated, service_role;

create or replace function platform._cutover_evaluation_replaced_is_append_only()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $$
begin
  raise exception 'platform.cutover_evaluation_replaced is append-only: what a switch replaced is never rewritten or removed.'
    using errcode = '42501';
end;
$$;

-- (No `drop trigger if exists` first: the sql_drop event path takes ACCESS EXCLUSIVE on 24 auth/storage
-- relations, measured on the clone 2026-09-25; the table is new, so there is nothing to drop.)
do $trg$
begin
  if not exists (select 1 from pg_trigger where tgname = 'cutover_evaluation_replaced_append_only'
                    and tgrelid = 'platform.cutover_evaluation_replaced'::regclass) then
    create trigger cutover_evaluation_replaced_append_only
      before update or delete on platform.cutover_evaluation_replaced
      for each row execute function platform._cutover_evaluation_replaced_is_append_only();
  end if;
end $trg$;

-- ── 2. WHO IS A PERSON ────────────────────────────────────────────────────────────────────────
create or replace function platform.write_is_a_persons_own()
returns boolean
language plpgsql
stable
set search_path to 'pg_catalog'
as $$
declare
  v_tier text := nullif(current_setting('app.actor_tier', true), '');
  v_hdr  jsonb;
begin
  -- The client channel, signed in: the role PostgREST assumed for the request (custom.caller_role
  -- reads the `role` GUC, which a SECURITY DEFINER door does not move) and a person's id.
  if custom.caller_role() is distinct from 'authenticated'::name or auth.uid() is null then
    return false;
  end if;
  -- A server channel or a machine declares itself (DD-131): an agent's turn (`ai`), the
  -- platform's own machinery (`code`), a named system, an agent id. A person declares nothing.
  if v_tier is not null and v_tier <> 'human' then return false; end if;
  if nullif(current_setting('app.actor_system', true), '') is not null
     or nullif(current_setting('app.actor_agent', true), '') is not null then
    return false;
  end if;
  begin
    v_hdr := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    v_hdr := null;
  end;
  if v_hdr is not null and (nullif(v_hdr ->> 'x-matrx-actor-tier', '') is not null
                            or nullif(v_hdr ->> 'x-matrx-actor-system', '') is not null
                            or nullif(v_hdr ->> 'x-matrx-actor-agent', '') is not null) then
    return false;
  end if;
  return true;
end;
$$;

comment on function platform.write_is_a_persons_own() is
  'COPY-WRITABLE: true when this write is a signed-in person''s own action on the client channel (custom.caller_role() = authenticated, auth.uid() set, and no actor declaration: app.actor_tier other than human, app.actor_system, app.actor_agent, or an x-matrx-actor-* request header). Agents, automations, the platform''s machinery and every server channel declare themselves and answer false. Private: asked by the copy fence''s verdict.';

revoke all on function platform.write_is_a_persons_own() from public, anon, authenticated, service_role;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, non_client_lane, signed_in_callers, anonymous_callers)
select 'platform', 'write_is_a_persons_own', iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes),
       'migrations/campaign/copywritable_people_test_the_copy_until_the_switch.sql (lane COPY-WRITABLE)',
       'Takes no argument; reads only the request''s own role, claims, actor settings and headers, and answers one boolean.',
       'server_only: called only from inside custom._older_table_copy_verdict (the copy fence''s verdict); EXECUTE is revoked from every client role and from the server key.',
       false, false
  from pg_proc p where p.oid = 'platform.write_is_a_persons_own()'::regprocedure
on conflict (schema_name, function_name, identity_argtypes) do nothing;

-- ── 3. THE FENCE'S VERDICT ────────────────────────────────────────────────────────────────────
create or replace function custom._older_table_copy_verdict(p_table_id uuid)
returns text
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_name text;
  v_org  uuid;
begin
  if p_table_id is null or platform.table_lives_in(p_table_id) is distinct from 'older' then
    return null;
  end if;
  select d.organization_id, coalesce(nullif(d.table_name, ''), 'this table')
    into v_org, v_name
    from workbench.udt_datasets d where d.id = p_table_id and d.deleted_at is null;
  if not found then
    return null;
  end if;
  if platform.write_is_a_persons_own() then
    return 'person';
  end if;
  -- THE NAME ONLY TO WHO MAY OPEN THE COPY (the SUITE-HEALTH-3 rule, carried from
  -- the body of custom._older_table_copy_refusal this file replaces). The same may-open ladder every
  -- door asks, about the copy by its id. A caller it refuses is still refused the write; the
  -- sentence just names nothing. A copy that is not in the record store is not named either.
  if exists (select 1 from custom.record r where r.id = p_table_id) then
    begin
      perform custom.assert_client_may_open(v_org, p_table_id, 'custom._older_table_copy_verdict', 'viewer', 'table');
    exception when insufficient_privilege or null_value_not_allowed then
      v_name := 'this table';
    end;
  else
    v_name := 'this table';
  end if;
  return format('This is the new system''s test copy of %s; the older table is still the one in use for agents, automations and integrations until an owner switches Data tables on the organization''s settings page. Write it at /data/%s.',
                v_name, p_table_id);
end;
$$;

comment on function custom._older_table_copy_verdict(uuid) is
  'COPY-WRITABLE: the copy fence''s verdict for a write to table <id> in the record store — null (not the copy of a live older table in an organization whose Data tables switch is off: the store''s own doors decide), ''person'' (a person''s own write to a test copy: allowed and noted, replaced by the older table at the switch), or the sentence that refuses an agent''s, automation''s or integration''s write with the older table''s address. Private: called by custom._context_copy_fence() and custom._copy_evaluation_note.';

revoke all on function custom._older_table_copy_verdict(uuid) from anon;   -- PUBLIC is cleared at a definer's birth (ddl_guard §6d-4)

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, signed_in_callers)
select 'custom', '_older_table_copy_verdict', iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes),
       'migrations/campaign/copywritable_people_test_the_copy_until_the_switch.sql (lane COPY-WRITABLE)',
       'The copy fence''s verdict, asked by custom._context_copy_fence() as the writer (so every writer role executes it). p_table_id is only looked up; NULL answers NULL. It answers NULL, the word ''person'' or a refusal sentence; the sentence names the table only to a caller custom.assert_client_may_open lets open the copy, else says "this table".',
       true
  from pg_proc p where p.oid = 'custom._older_table_copy_verdict(uuid)'::regprocedure
on conflict (schema_name, function_name, identity_argtypes) do nothing;

grant execute on function custom._older_table_copy_verdict(uuid) to authenticated, service_role;

-- The fence's old question keeps its name and contract (NULL = may write, else the sentence), so
-- anything that still asks it hears the new rule.
create or replace function custom._older_table_copy_refusal(p_table_id uuid)
returns text
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $$
begin
  return nullif(custom._older_table_copy_verdict(p_table_id), 'person');
end;
$$;

comment on function custom._older_table_copy_refusal(uuid) is
  'WHERE-LIVES-SWITCH, amended by COPY-WRITABLE: null when this caller may write table <id> in the record store — including a person''s own write to a test copy — else the sentence that refuses an agent''s, automation''s or integration''s write to the copy of a live older table in an organization whose Data tables switch is off. Reads custom._older_table_copy_verdict.';

-- ── 4. THE FENCE'S TWO PRIVATE STEPS ──────────────────────────────────────────────────────────
create or replace function custom._copy_evaluation_note(p_org uuid, p_table uuid, p_id uuid, p_class text)
returns void
language plpgsql
volatile
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_row custom.record;
  v_uid uuid := auth.uid();
begin
  if pg_trigger_depth() < 1 then
    raise exception 'custom._copy_evaluation_note is the copy fence''s own step and is not called directly.'
      using errcode = '42501';
  end if;
  -- The switch's own re-sync writes as the person who pressed it; its writes are the older
  -- table's truth, not a test edit.
  if nullif(current_setting('platform.cutover_resync', true), '') is not null then
    return;
  end if;
  if custom._older_table_copy_verdict(p_table) is distinct from 'person' then
    return;
  end if;
  -- The organization wall, the first rung of the store. The calling door has already asked it in this
  -- transaction, so this is the memoised answer; a writer that somehow had not is refused here too.
  perform custom.assert_client_may_reach(p_org, 'custom._copy_evaluation_note');
  -- BEFORE the write: the stored row is still the one the mover left (or a person's earlier test).
  select * into v_row from custom.record r where r.organization_id = p_org and r.id = p_id;
  insert into platform.cutover_evaluation_write
    (organization_id, table_id, record_id, data_class, created, pre_image, first_by, last_by)
  values
    (p_org, p_table, p_id, coalesce(p_class, 'record'), v_row.id is null,
     case when v_row.id is null then null else to_jsonb(v_row) end, v_uid, v_uid)
  on conflict (organization_id, record_id) where replaced_at is null
  do update set writes  = platform.cutover_evaluation_write.writes + 1,
                last_at = clock_timestamp(),
                last_by = excluded.last_by;
end;
$$;

comment on function custom._copy_evaluation_note(uuid, uuid, uuid, text) is
  'COPY-WRITABLE: the copy fence''s note of a person''s test write to row <p_id> of test copy <p_table>: the first one keeps the row as it stood before (or created = true), later ones count. Reads the row itself, never an image a caller hands it; refuses a call from outside a trigger. Private.';

revoke all on function custom._copy_evaluation_note(uuid, uuid, uuid, text) from anon;   -- PUBLIC is cleared at a definer's birth (ddl_guard §6d-4)

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, signed_in_callers)
select 'custom', '_copy_evaluation_note', iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes),
       'migrations/campaign/copywritable_people_test_the_copy_until_the_switch.sql (lane COPY-WRITABLE)',
       'The copy fence''s own step, run as the writer inside the BEFORE trigger on custom.record (so every writer role executes it). It refuses when pg_trigger_depth() < 1 (a direct call), does nothing unless custom._older_table_copy_verdict answers ''person'' for the table, asks custom.assert_client_may_reach for the organization (the memoised yes of the calling door), and records only the stored row''s own image (read by primary key), never data from its arguments. It returns nothing.',
       true
  from pg_proc p where p.oid = 'custom._copy_evaluation_note(uuid, uuid, uuid, text)'::regprocedure
on conflict (schema_name, function_name, identity_argtypes) do nothing;

grant execute on function custom._copy_evaluation_note(uuid, uuid, uuid, text) to authenticated, service_role;

create or replace function custom._copy_evaluation_is_open(p_org uuid, p_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog'
as $$
  select exists (select 1 from platform.cutover_evaluation_write e
                  where e.organization_id = p_org and e.record_id = p_id and e.replaced_at is null and not e.created);
$$;

comment on function custom._copy_evaluation_is_open(uuid, uuid) is
  'COPY-WRITABLE: does row <p_id> carry an open test-write note? One index probe, asked by the copy fence on the store owner''s own connection before it re-images a note. Private.';

revoke all on function custom._copy_evaluation_is_open(uuid, uuid) from public, anon, authenticated, service_role;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, non_client_lane, signed_in_callers, anonymous_callers)
select 'custom', '_copy_evaluation_is_open', iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes),
       'migrations/campaign/copywritable_people_test_the_copy_until_the_switch.sql (lane COPY-WRITABLE)',
       'Answers one boolean about one row id; asked by custom._context_copy_fence() only on the store owner''s own connection.',
       'server_only: EXECUTE is revoked from every client role and from the server key.',
       false, false
  from pg_proc p where p.oid = 'custom._copy_evaluation_is_open(uuid, uuid)'::regprocedure
on conflict (schema_name, function_name, identity_argtypes) do nothing;

create or replace function custom._copy_evaluation_reimage(p_org uuid, p_id uuid, p_image jsonb)
returns void
language plpgsql
volatile
security definer
set search_path to 'pg_catalog'
as $$
begin
  if pg_trigger_depth() < 1 then
    raise exception 'custom._copy_evaluation_reimage is the copy fence''s own step and is not called directly.'
      using errcode = '42501';
  end if;
  if not pg_has_role(custom.caller_role(), (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass), 'member') then
    return;
  end if;
  update platform.cutover_evaluation_write e
     set pre_image = p_image || jsonb_build_object('updated_at', clock_timestamp())
   where e.organization_id = p_org and e.record_id = p_id and e.replaced_at is null and not e.created;
end;
$$;

comment on function custom._copy_evaluation_reimage(uuid, uuid, jsonb) is
  'COPY-WRITABLE: when the store owner''s own connection (the mover''s rerun) rewrites a test-copy row a person had touched, the row it writes becomes the image the switch puts back — the older table''s newer truth, not the stale one. Acts only for the store owner, only inside a trigger. Private.';

revoke all on function custom._copy_evaluation_reimage(uuid, uuid, jsonb) from public, anon, authenticated, service_role;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, non_client_lane, signed_in_callers, anonymous_callers)
select 'custom', '_copy_evaluation_reimage', iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes),
       'migrations/campaign/copywritable_people_test_the_copy_until_the_switch.sql (lane COPY-WRITABLE)',
       'Called by custom._context_copy_fence() only on the store owner''s own connection; refuses a direct call and does nothing for any other role.',
       'server_only: the store owner''s branch of the copy fence (the mover''s rerun); EXECUTE is revoked from every client role and from the server key.',
       false, false
  from pg_proc p where p.oid = 'custom._copy_evaluation_reimage(uuid, uuid, jsonb)'::regprocedure
on conflict (schema_name, function_name, identity_argtypes) do nothing;

-- ── 5. THE FENCE ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION custom._context_copy_fence()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_role   name := custom.caller_role();
  v_table  uuid;
  v_key    text;
  v_hit    text;
  v_kept   text;
  v_name   text;
  v_on     boolean;
  v_where  text;
  v_older  text;
  v_copyof uuid;
begin
  v_copyof := case when new.data_class = 'table' then new.id
                   when new.data_class = 'field' then nullif(new.data ->> 'entity_definition_id', '')::uuid
                   else new.table_id end;

  -- THE ONE WRITER. The store owner's own connection — the scopes mover, the follow worker and
  -- the older-tables mover's rerun — may write any copy. Read from the catalogue, never a role
  -- literal, exactly as custom._store_door's operator lane is. When it rewrites a test-copy row a
  -- person had touched, what it writes is the image the switch will put back (COPY-WRITABLE).
  if pg_has_role(v_role, (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass), 'member') then
    if tg_op = 'UPDATE' and custom._copy_evaluation_is_open(new.organization_id, new.id) then
      perform custom._copy_evaluation_reimage(new.organization_id, new.id, to_jsonb(new));
    end if;
    return new;
  end if;

  -- THE OLDER TABLE IS THE WRITER UNTIL THE SWITCH — FOR AGENTS, AUTOMATIONS AND INTEGRATIONS
  -- (WHERE-LIVES-SWITCH, amended by COPY-WRITABLE 2026-09-25). COPY mode keeps every older table
  -- live beside its same-id copy until an owner presses the organization's Data tables switch.
  -- A PERSON's own write to the copy (the new table page, the record page) is a test: allowed,
  -- and noted with the row as the mover left it, so the switch can replace it with the older
  -- table's truth. Any other writer is refused with the older table's address.
  v_older := custom._older_table_copy_verdict(v_copyof);
  if v_older = 'person' then
    perform custom._copy_evaluation_note(new.organization_id, v_copyof, new.id, new.data_class);
  elsif v_older is not null then
    raise exception '%', v_older
      using errcode = '42501',
            hint = 'WHERE-LIVES-SWITCH / COPY-WRITABLE: platform.table_lives_in answers ''older'' for this table (its older table is live and the organization''s older_tables switch is off), and this write declares an agent, automation or integration (or is not a signed-in person''s own). Nothing was written. Write the older table; after the switch the copy is the table.';
  end if;

  -- WHICH TABLE THIS ROW BELONGS TO: a Table record is itself; a Field names its Table; every
  -- other row is a record of new.table_id.
  -- A scope's OWN table (G11, tied to its scope by `scope_binding`) is not a copy: the store is
  -- its writer, and people keep rows in it. Only the Tables the scopes mover lands — one per
  -- scope type, carrying no binding — are the copy.
  if new.data_class = 'table' then
    v_kept := case when new.data ? 'scope_binding' then '' else coalesce(new.data ->> 'kept_for', '') end;
    if tg_op = 'UPDATE' and v_kept <> 'context' and not (old.data ? 'scope_binding') then
      v_kept := coalesce(old.data ->> 'kept_for', '');   -- taking the word off is a write too
    end if;
    v_name := coalesce(nullif(new.data ->> 'name', ''), 'this table');
  else
    v_table := v_copyof;
    if v_table is null then
      return new;
    end if;
    -- ONE PRIMARY-KEY READ, NO MEMO. The store's memo (platform.memo_k_*) is WRITE-PERF-4's, and
    -- its inverse takes it away; a trigger that reached it would stand over a missing body after
    -- that rollback (check:inverses-leave-the-ground-standing, clause a). The read is the
    -- (organization_id, id) primary key of one partition.
    select case when t.data ? 'scope_binding' then '' else coalesce(t.data ->> 'kept_for', '') end
           || chr(31) || coalesce(nullif(t.data ->> 'name', ''), 'this table')
      into v_hit
      from custom.record t
     where t.organization_id = new.organization_id
       and t.id = v_table
       and t.table_id = custom.table_kernel_id();
    v_hit := coalesce(v_hit, chr(31));
    v_kept := split_part(v_hit, chr(31), 1);
    v_name := split_part(v_hit, chr(31), 2);
  end if;

  if v_kept is distinct from 'context' then
    return new;
  end if;

  v_on := coalesce((platform.knob_resolve('custom', 'context_copy_following', new.organization_id) #>> '{}')::boolean, true);
  if not v_on then
    return new;
  end if;

  -- WHERE TO EDIT IT INSTEAD. A copied Record keeps its scope's id, so its scope page is known;
  -- a change to the Table or its Fields is a change to the scope type, made on the scopes screen.
  v_where := case when new.data_class = 'record' then '/scopes/s/' || new.id::text else '/scopes/manage' end;

  raise exception 'This is the new system''s copy of %; it follows the current screens until the switch. Edit it on %.',
                  v_name, v_where
    using errcode = '42501',
          hint = 'SC-1'' P13: while custom/context_copy_following is on for this organization, only the follow of the current scope screens writes the record store''s copy of the context system. Nothing was written. The switch to the new system turns this off; an organization where the store is the writer turns it off for itself.';
end;
$function$;

-- ── 6. WHERE A TABLE LIVES (the sentence only) ────────────────────────────────────────────────
create or replace function custom.where_tables_live(p_table_ids uuid[])
returns table (table_id uuid, lives_in text, why text)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
begin
  if auth.uid() is null and v_claims is not null and coalesce(v_claims ->> 'role', '') <> 'service_role' then
    raise exception 'Sign in to ask where a table lives.' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_table_ids), 0) > 1000 then
    raise exception 'Ask about at most 1000 tables at once (% were asked).', cardinality(p_table_ids) using errcode = '22023';
  end if;
  return query
    select i.id,
           l.lives_in,
           case l.lives_in
             when 'older' then 'It is an older table, and the older table is the one agents, automations and integrations read and write until an owner switches Data tables on the organization''s settings page. Its copy in the new system (if it has one) is a test copy: people may edit it, and the switch replaces those edits with the older table''s rows.'
             else 'It lives in the new system (the record store); the store''s own doors decide whether you may open it.'
           end
      from (select distinct u.id from unnest(coalesce(p_table_ids, '{}'::uuid[])) as u(id) where u.id is not null) i
      cross join lateral (select platform.table_lives_in(i.id) as lives_in) l;
end;
$$;

-- ── 7. ONE TABLE'S TEST-COPY STATE (the client door) ──────────────────────────────────────────
create or replace function custom.table_copy_evaluation_state(p_table_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_uid     uuid := auth.uid();
  v_claims  jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_org     uuid;
  v_live    boolean;
  v_lives   text;
  v_copy    boolean;
  v_writes  bigint; v_rows bigint; v_edited bigint; v_added bigint; v_settings bigint;
begin
  if v_uid is null and coalesce(v_claims ->> 'role', '') <> 'service_role' then
    raise exception 'Sign in to ask about a table.' using errcode = '42501';
  end if;
  if p_table_id is null then
    return jsonb_build_object('table_id', null, 'found', false);
  end if;
  -- The same answer for a table this person cannot open and a table that does not exist.
  if v_uid is not null and not custom.has_visibility(v_uid, 'record', p_table_id, 'viewer'::public.permission_level) then
    return jsonb_build_object('table_id', p_table_id, 'found', false);
  end if;
  select d.organization_id, d.deleted_at is null into v_org, v_live
    from workbench.udt_datasets d where d.id = p_table_id;
  v_lives := platform.table_lives_in(p_table_id);
  v_copy  := v_lives = 'older' and coalesce(v_live, false)
             and exists (select 1 from custom.record t where t.organization_id = v_org and t.id = p_table_id
                            and t.data_class = 'table' and t.deleted_at is null);
  select coalesce(sum(e.writes), 0), count(*),
         count(*) filter (where e.data_class = 'record' and not e.created),
         count(*) filter (where e.data_class = 'record' and e.created),
         count(*) filter (where e.data_class <> 'record')
    into v_writes, v_rows, v_edited, v_added, v_settings
    from platform.cutover_evaluation_write e
   where e.organization_id = v_org and e.table_id = p_table_id and e.replaced_at is null;
  return jsonb_build_object(
    'table_id', p_table_id,
    'found', true,
    'test_copy', v_copy,
    'writable_by_people', true,
    'older_table_live', coalesce(v_live, false),
    'agents_write', coalesce(v_lives, 'record'),
    'evaluation_writes_since_copy', v_writes,
    'rows_touched', v_rows,
    'rows_edited', v_edited,
    'rows_added', v_added,
    'settings_changed', v_settings,
    'says', case when v_copy
                 then 'Test copy: your edits here are replaced by the older table at switch time.'
                 else null end,
    'detail', case when v_copy
                   then 'Agents, automations and integrations still write the older table until an owner switches Data tables in the organization''s settings. '
                        || case when v_rows = 0 then 'Nothing has been changed here yet.'
                                else format('%s %s changed here so far (%s edited, %s added, %s settings); the switch puts them back to the older table and archives the added ones, in a log.',
                                            v_rows, case when v_rows = 1 then 'row' else 'rows' end, v_edited, v_added, v_settings) end
                   else null end);
end;
$$;

comment on function custom.table_copy_evaluation_state(uuid) is
  'COPY-WRITABLE: the client door to "is this table a test copy, and what have people changed on it?" — test_copy (the same-id copy of a live older table whose organization''s Data tables switch is off), writable_by_people, older_table_live, agents_write (older | record), evaluation_writes_since_copy and row counts, and the sentence the table''s ⋯ menu shows. A table the caller cannot open answers found = false, exactly like a missing one.';

revoke all on function custom.table_copy_evaluation_state(uuid) from anon;   -- PUBLIC is cleared at a definer's birth (ddl_guard §6d-4)

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, signed_in_callers)
select 'custom', 'table_copy_evaluation_state', iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes),
       'migrations/campaign/copywritable_people_test_the_copy_until_the_switch.sql (lane COPY-WRITABLE)',
       'The table page asks whether the table it shows is a test copy and how many rows people changed on it. A table the caller cannot open (custom.has_visibility viewer) answers found = false, the same as an id that does not exist; otherwise only counts and fixed sentences, never a row, a name or a person.',
       true
  from pg_proc p where p.oid = 'custom.table_copy_evaluation_state(uuid)'::regprocedure
on conflict (schema_name, function_name, identity_argtypes) do nothing;

grant execute on function custom.table_copy_evaluation_state(uuid) to authenticated, service_role;

-- ── 8. THE MOVER'S CARRY ──────────────────────────────────────────────────────────────────────
create or replace function platform.cutover_evaluation_carry(p_org uuid, p_id uuid, p_patch jsonb)
returns boolean
language plpgsql
volatile
security definer
set search_path to 'pg_catalog'
as $$
begin
  update platform.cutover_evaluation_write e
     set pre_image = jsonb_set(jsonb_set(e.pre_image, '{data}', coalesce(e.pre_image -> 'data', '{}'::jsonb) || coalesce(p_patch, '{}'::jsonb)),
                               '{updated_at}', to_jsonb(clock_timestamp()))
   where e.organization_id = p_org and e.record_id = p_id and e.replaced_at is null and not e.created;
  return found;
end;
$$;

comment on function platform.cutover_evaluation_carry(uuid, uuid, jsonb) is
  'COPY-WRITABLE: the older-tables mover''s rerun carries an older-table edit into a test-copy row a person has touched by updating the row''s kept image (what the switch puts back), leaving the person''s visible test edit alone until the switch. True when the row had a note (the mover then writes nothing else for it). Server only: the mover''s own connection.';

revoke all on function platform.cutover_evaluation_carry(uuid, uuid, jsonb) from public, anon, authenticated, service_role;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, non_client_lane, signed_in_callers, anonymous_callers)
select 'platform', 'cutover_evaluation_carry', iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes),
       'migrations/campaign/copywritable_people_test_the_copy_until_the_switch.sql (lane COPY-WRITABLE)',
       'Called by the older-tables mover (aidream matrx_records.movers.base) on its own direct connection as the store owner.',
       'server_only: EXECUTE is revoked from every client role and from the server key; only the store owner''s connection reaches it.',
       false, false
  from pg_proc p where p.oid = 'platform.cutover_evaluation_carry(uuid, uuid, jsonb)'::regprocedure
on conflict (schema_name, function_name, identity_argtypes) do nothing;

-- ── 9. THE ONE COUNT KNOWS ABOUT TEST WRITES ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION platform.cutover_tables_copied(p_org uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  with older as (
    select d.id, d.table_name,
           exists (select 1 from custom.record r
                    where r.organization_id = p_org and r.id = d.id
                      and r.data_class = 'table' and r.deleted_at is null
                      and coalesce((r.data ->> 'kept_by_the_app')::boolean, false) = false) as copied
      from workbench.udt_datasets d
     where d.organization_id = p_org and d.deleted_at is null
  ), ev as (
    -- A person's test writes (COPY-WRITABLE): the row as the mover left it is what the switch puts
    -- back, so "missing" and "edited in the older table after its copy" are measured against it.
    select e.record_id, e.table_id, e.data_class, e.created, e.writes,
           (e.pre_image ->> 'updated_at')::timestamptz as pre_updated_at,
           (e.pre_image ->> 'deleted_at') is null      as pre_live
      from platform.cutover_evaluation_write e
     where e.organization_id = p_org and e.replaced_at is null
  ), rows_of_copies as (
    select count(*) filter (where r.id is null or (r.deleted_at is not null and not coalesce(ev.pre_live, false))) as missing,
           count(*) filter (where r.id is not null and (r.deleted_at is null or coalesce(ev.pre_live, false))
                              and w.updated_at > coalesce(ev.pre_updated_at, r.updated_at))                  as stale
      from older o
      join workbench.udt_dataset_rows w on w.table_id = o.id and w.deleted_at is null
      left join custom.record r on r.organization_id = p_org and r.id = w.id
      left join ev on ev.record_id = w.id and not ev.created
     where o.copied
  )
  select jsonb_build_object(
    'organization_id', p_org,
    'older_live',      (select count(*) from older),
    'copied',          (select count(*) from older where copied),
    'not_yet',         coalesce((select jsonb_agg(x.table_name order by x.table_name)
                                   from (select table_name from older where not copied
                                          order by table_name limit 5) x), '[]'::jsonb),
    'rows_missing',    (select missing from rows_of_copies),
    'rows_stale',      (select stale from rows_of_copies),
    'archived_older',  (select count(*) from workbench.udt_datasets d
                         where d.organization_id = p_org and d.deleted_at is not null),
    'app_kept',        (select count(*) from custom.record r
                         where r.organization_id = p_org and r.data_class = 'table' and r.deleted_at is null
                           and coalesce((r.data ->> 'kept_by_the_app')::boolean, false)),
    'archived_copies', (select count(*) from custom.record r
                         where r.organization_id = p_org and r.data_class = 'table' and r.deleted_at is not null
                           and exists (select 1 from workbench.udt_datasets d
                                        where d.id = r.id and d.organization_id = p_org and d.deleted_at is null)),
    'evaluation',      (select jsonb_build_object(
                                 'writes',   coalesce(sum(ev.writes), 0),
                                 'rows',     count(*),
                                 'edited',   count(*) filter (where ev.data_class = 'record' and not ev.created),
                                 'added',    count(*) filter (where ev.data_class = 'record' and ev.created),
                                 'settings', count(*) filter (where ev.data_class <> 'record'),
                                 'tables',   count(distinct ev.table_id))
                          from ev),
    'counted_at',      now());
$function$;

-- ── 10. READINESS SAYS WHAT THE SWITCH WILL REPLACE ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION platform._cutover_seam_readiness(p_seam text, p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  s platform.cutover_seam;
  v_checks jsonb := '[]'::jsonb;
  v_n bigint; v_c bigint; v_missing bigint; v_stale bigint; v_lag bigint;
  v_tn bigint; v_tc bigint; v_sn bigint; v_sc bigint; v_in bigint; v_ic bigint;
  v_names text;
  v_pre jsonb;
  v_count jsonb;
  v_any bigint; v_hooks bigint;
  v_ev jsonb;
begin
  select * into s from platform.cutover_seam where seam_key = p_seam and retired_at is null;
  if s.seam_key is null then
    return jsonb_build_object('ready', false, 'checked_at', now(), 'checks', jsonb_build_array(
      jsonb_build_object('key', 'known', 'says', 'This switch exists', 'met', false,
                         'detail', format('There is no switch called %s.', p_seam))));
  end if;

  if s.press_kind = 'platform_switch' then
    return jsonb_build_object('ready', false, 'checked_at', now(), 'checks', jsonb_build_array(
      jsonb_build_object('key', 'pressed_here', 'says', 'Switched for one organization', 'met', false,
                         'detail', 'This one switches for everyone at once, in its own rehearsed step, not from an organization''s settings.')));
  elsif s.press_kind = 'already_switched' then
    return jsonb_build_object('ready', false, 'checked_at', now(), 'checks', jsonb_build_array(
      jsonb_build_object('key', 'already', 'says', 'Already on the new system', 'met', true,
                         'detail', s.flip_does)));
  end if;

  if p_seam = 'older_tables' then
    -- ONE COUNT, shared with the mover's census (lane CUTOVER-CENSUS): the organization's live
    -- older tables against their live same-id copies; archived older tables and the option lists
    -- the app keeps are never counted on either side.
    v_count := platform.cutover_tables_copied(p_org);
    v_n := (v_count ->> 'older_live')::bigint;
    v_c := (v_count ->> 'copied')::bigint;
    v_missing := (v_count ->> 'rows_missing')::bigint;
    v_stale := (v_count ->> 'rows_stale')::bigint;
    select string_agg(x, ', ' order by x) into v_names
      from jsonb_array_elements_text(v_count -> 'not_yet') x;

    v_checks := v_checks || jsonb_build_object(
      'key', 'copied', 'says', 'Every table is copied into the new system', 'met', v_c = v_n,
      'detail', case when v_n = 0 then 'This organization has no older tables left.'
                     else format('%s of %s tables copied.', v_c, v_n)
                          || case when v_c < v_n then ' Not yet: ' || v_names || case when v_n - v_c > 5 then format(' and %s more', v_n - v_c - 5) else '' end || '.' else '' end end);

    v_checks := v_checks
      || jsonb_build_object('key', 'rows_present', 'says', 'No row is missing from a copy',
           'met', v_missing = 0,
           'detail', case when v_missing = 0 then 'Every row of every copied table is in its copy.'
                          else format('%s rows are not in their copies yet. Copying the table again brings them.', v_missing) end)
      || jsonb_build_object('key', 'rows_current', 'says', 'No row was edited in an older table after it was copied',
           'met', v_stale = 0,
           'detail', case when v_stale = 0 then 'Every copy is as current as its older table.'
                          else format('%s rows were edited in the older tables after they were copied. Copying again brings the edits.', v_stale) end);

    -- WHAT THE SWITCH REPLACES FIRST (COPY-WRITABLE). People may test the copies while the switch
    -- is off; the switch puts every row they changed back to the older table's version and
    -- archives the rows they added, and logs the counts. Always met: it is what the press does,
    -- said before it is pressed.
    v_ev := v_count -> 'evaluation';
    v_checks := v_checks
      || jsonb_build_object('key', 'test_edits_replaced', 'says', 'Test edits on the copies are replaced by the older tables first',
           'met', true,
           'counts', v_ev,
           'detail', case when coalesce((v_ev ->> 'rows')::bigint, 0) = 0
                          then 'Nobody has changed a copy while testing; nothing is replaced.'
                          else format('%s %s changed while testing, in %s %s: %s edited %s put back to the older table''s version, %s added %s archived (never deleted), %s table or column %s put back. Each table''s counts are kept in a log.',
                                      v_ev ->> 'rows', case when (v_ev ->> 'rows')::bigint = 1 then 'row was' else 'rows were' end,
                                      v_ev ->> 'tables', case when (v_ev ->> 'tables')::bigint = 1 then 'table' else 'tables' end,
                                      v_ev ->> 'edited', case when (v_ev ->> 'edited')::bigint = 1 then 'row is' else 'rows are' end,
                                      v_ev ->> 'added', case when (v_ev ->> 'added')::bigint = 1 then 'row is' else 'rows are' end,
                                      v_ev ->> 'settings', case when (v_ev ->> 'settings')::bigint = 1 then 'setting is' else 'settings are' end) end);

    -- What the switch cannot carry by itself (CUTOVER-PLAN D8, F19): an automation on "any older
    -- table" names no table to follow, and an outbound webhook subscribed to older row events has
    -- no copy to listen to. Either would go silent at the switch, so each holds it back, named.
    select count(*) into v_any from scheduler.sch_trigger t
     where t.organization_id = p_org and t.deleted_at is null and t.enabled and t.type = 'event'
       and t.config ->> 'entity_type' = 'user_table_row' and coalesce(t.config ->> 'table_id', '') = '';
    select count(*) into v_hooks from files.webhooks w
     where w.organization_id = p_org and w.is_active
       and w.event_types && array['row.created','row.updated','row.deleted','row.archived','row.restored']::text[];
    v_checks := v_checks
      || jsonb_build_object('key', 'automations_follow', 'says', 'Every "when a row changes" automation names its table',
           'met', v_any = 0,
           'detail', case when v_any = 0 then 'Each one moves to its table''s copy at the switch and back with Switch back.'
                          else format('%s automations run on a change to any older table. Pick the table each one watches first, so it can follow it.', v_any) end)
      || jsonb_build_object('key', 'webhooks_follow', 'says', 'No outbound webhook listens for older-table row changes',
           'met', v_hooks = 0,
           'detail', case when v_hooks = 0 then 'Nothing outside the platform is waiting on older-table changes.'
                          else format('%s outbound webhooks still listen for older-table row changes. Point each at its table''s changes in the new system first.', v_hooks) end);

  elsif p_seam = 'agent_context' then
    select count(*), count(*) filter (where r.id is not null and r.deleted_at is null)
      into v_tn, v_tc
      from context.scope_types t
      left join custom.record r on r.organization_id = p_org and r.id = t.id
     where t.organization_id = p_org and t.deleted_at is null;
    select count(*), count(*) filter (where r.id is not null and r.deleted_at is null)
      into v_sn, v_sc
      from context.scopes x
      join context.scope_types t on t.id = x.scope_type_id and t.deleted_at is null
      left join custom.record r on r.organization_id = p_org and r.id = x.id
     where x.organization_id = p_org and x.deleted_at is null;
    select count(*), count(*) filter (where r.id is not null and r.deleted_at is null)
      into v_in, v_ic
      from context.context_items i
      join context.scope_types t on t.id = i.scope_type_id and t.deleted_at is null
      left join custom.record r on r.organization_id = p_org and r.id = i.id
     where t.organization_id = p_org and i.deleted_at is null and i.is_active;

    v_checks := v_checks || jsonb_build_object(
      'key', 'copied', 'says', 'Every scope type, scope and context field is copied',
      'met', v_tc = v_tn and v_sc = v_sn and v_ic = v_in,
      'detail', case when v_tn = 0 then 'This organization has no scopes.'
                     else format('%s of %s scope types, %s of %s scopes, %s of %s context fields copied.',
                                 v_tc, v_tn, v_sc, v_sn, v_ic, v_in) end);

    select count(*) into v_lag
      from custom.io_outbox x
     where x.organization_id = p_org and x.event_key = 'context.follow'
       and x.consumed_at is null and x.deleted_at is null;

    v_checks := v_checks || jsonb_build_object(
      'key', 'follow_current', 'says', 'No edit is waiting to be copied', 'met', v_lag = 0,
      'detail', case when v_lag = 0 then 'The copy has every edit made in the current screens.'
                     else format('%s edits made in the current screens are waiting for the copy.', v_lag) end);
  end if;

  for v_pre in select * from jsonb_array_elements(s.prerequisites) loop
    v_checks := v_checks || jsonb_build_object(
      'key', v_pre ->> 'key', 'says', v_pre ->> 'says',
      'met', coalesce((v_pre ->> 'met')::boolean, false),
      'detail', v_pre ->> 'evidence',
      -- When a measured fact was last measured (the census writes it; every release re-runs it).
      'measured_at', v_pre ->> 'measured_at');
  end loop;

  return jsonb_build_object(
    'ready', not exists (select 1 from jsonb_array_elements(v_checks) c where not (c ->> 'met')::boolean),
    'checked_at', now(),
    'checks', v_checks);
end;
$function$;

-- ── 11. THE RE-SYNC THE SWITCH RUNS FIRST ─────────────────────────────────────────────────────
create or replace function platform._cutover_copy_resync(p_org uuid, p_press uuid, p_actor uuid)
returns jsonb
language plpgsql
set search_path to 'pg_catalog'
as $$
declare
  v_t      record;
  v_e      record;
  v_was    timestamptz;
  v_found  boolean;
  v_at     timestamptz := clock_timestamp();
  v_log    uuid;
  v_out    jsonb := '[]'::jsonb;
  v_put int; v_unarch int; v_arch int; v_sput int; v_sarch int; v_writes int;
  v_ids uuid[]; v_people uuid[];
  v_says text;
begin
  -- The re-sync writes the older table's truth as the person who pressed; the copy fence must not
  -- take those writes for new test edits (custom._copy_evaluation_note reads this setting).
  perform set_config('platform.cutover_resync', p_press::text, true);

  for v_t in
    select e.table_id, min(d.table_name) as table_name
      from platform.cutover_evaluation_write e
      left join workbench.udt_datasets d on d.id = e.table_id
     where e.organization_id = p_org and e.replaced_at is null
     group by e.table_id
     order by e.table_id
  loop
    v_put := 0; v_unarch := 0; v_arch := 0; v_sput := 0; v_sarch := 0; v_writes := 0;
    v_ids := '{}'; v_people := '{}';
    -- The Table and its Fields first (a record's values are judged against its Fields), then rows.
    for v_e in
      select * from platform.cutover_evaluation_write e
       where e.organization_id = p_org and e.table_id = v_t.table_id and e.replaced_at is null
       order by (e.data_class = 'record'), e.record_id
       for update
    loop
      v_writes := v_writes + v_e.writes;
      if v_e.first_by is not null and not (v_e.first_by = any (v_people)) then v_people := v_people || v_e.first_by; end if;
      if v_e.last_by is not null and not (v_e.last_by = any (v_people)) then v_people := v_people || v_e.last_by; end if;
      select r.deleted_at, true into v_was, v_found
        from custom.record r where r.organization_id = p_org and r.id = v_e.record_id;
      if not coalesce(v_found, false) then
        v_found := false;
        continue;
      end if;
      v_found := false;
      if v_e.created then
        -- Made on the copy by a person, with no older row: ARCHIVED, never deleted. Its id is in
        -- this table's log row (archived_ids), which is where the reason is kept (metadata is the
        -- platform's own column, never a note).
        update custom.record r
           set deleted_at = coalesce(r.deleted_at, v_at)
         where r.organization_id = p_org and r.id = v_e.record_id;
        if v_e.data_class = 'record' then
          v_arch := v_arch + 1; v_ids := v_ids || v_e.record_id;
        else
          v_sarch := v_sarch + 1; v_ids := v_ids || v_e.record_id;
        end if;
      else
        -- Edited (or archived) by a person: put back exactly as the mover left it.
        update custom.record r
           set data          = v_e.pre_image -> 'data',
               deleted_at    = (v_e.pre_image ->> 'deleted_at')::timestamptz,
               metadata      = v_e.pre_image -> 'metadata',
               custom_fields = v_e.pre_image -> 'custom_fields',
               visibility    = (v_e.pre_image ->> 'visibility')::platform.visibility
         where r.organization_id = p_org and r.id = v_e.record_id;
        if v_e.data_class = 'record' then
          if v_was is not null and (v_e.pre_image ->> 'deleted_at') is null then
            v_unarch := v_unarch + 1;
          else
            v_put := v_put + 1;
          end if;
        else
          v_sput := v_sput + 1;
        end if;
      end if;
    end loop;

    v_says := format('%s test %s on %s replaced by the older table at the switch: %s %s put back, %s brought back from archive, %s added %s archived (not deleted), %s table or column %s put back, %s added %s archived.',
                     v_writes, case when v_writes = 1 then 'write' else 'writes' end,
                     coalesce(v_t.table_name, 'a table'),
                     v_put, case when v_put = 1 then 'row' else 'rows' end, v_unarch,
                     v_arch, case when v_arch = 1 then 'row' else 'rows' end,
                     v_sput, case when v_sput = 1 then 'setting' else 'settings' end,
                     v_sarch, case when v_sarch = 1 then 'column' else 'columns' end);
    insert into platform.cutover_evaluation_replaced
      (press_id, organization_id, table_id, table_name, writes, rows_put_back, rows_unarchived, rows_archived,
       settings_put_back, settings_archived, archived_ids, people, says)
    values
      (p_press, p_org, v_t.table_id, v_t.table_name, v_writes, v_put, v_unarch, v_arch, v_sput, v_sarch, v_ids, v_people, v_says)
    returning id into v_log;

    update platform.cutover_evaluation_write e
       set replaced_at = v_at, replaced_in = v_log
     where e.organization_id = p_org and e.table_id = v_t.table_id and e.replaced_at is null;

    v_out := v_out || jsonb_build_object('table_id', v_t.table_id, 'log', v_log, 'writes', v_writes,
                                         'rows_put_back', v_put, 'rows_unarchived', v_unarch, 'rows_archived', v_arch,
                                         'settings_put_back', v_sput, 'settings_archived', v_sarch, 'says', v_says);
  end loop;

  perform set_config('platform.cutover_resync', '', true);
  return v_out;
end;
$$;

comment on function platform._cutover_copy_resync(uuid, uuid, uuid) is
  'COPY-WRITABLE: the Data tables switch''s first step — every test-copy row a person changed while the switch was off is put back exactly as the mover left it (the older table''s truth), every row a person added is archived (never deleted), and one platform.cutover_evaluation_replaced row per table records the counts and the archived ids. Runs only inside platform._cutover_seam_apply; rolls back whole with the press.';

revoke all on function platform._cutover_copy_resync(uuid, uuid, uuid) from public, anon, authenticated, service_role;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, non_client_lane, signed_in_callers, anonymous_callers)
select 'platform', '_cutover_copy_resync', iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes),
       'migrations/campaign/copywritable_people_test_the_copy_until_the_switch.sql (lane COPY-WRITABLE)',
       'Called only by platform._cutover_seam_apply, inside the owner''s press (platform.cutover_seam_press, which checks the owner, the session and the page).',
       'server_only: EXECUTE is revoked from every client role and from the server key.',
       false, false
  from pg_proc p where p.oid = 'platform._cutover_copy_resync(uuid, uuid, uuid)'::regprocedure
on conflict (schema_name, function_name, identity_argtypes) do nothing;

-- ── 12. THE PRESS STEP RE-SYNCS, THEN FLIPS ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION platform._cutover_seam_apply(p_seam text, p_org uuid, p_to text, p_actor uuid, p_press uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_feature text; v_key text;
  v_before jsonb;
  v_last platform.cutover_seam_press;
  v_ids uuid[] := '{}';
  v_id uuid;
  v_w jsonb;
  v_t record;
  v_rekeyed jsonb := '[]'::jsonb;
  v_cfg jsonb;
  v_resynced jsonb := '[]'::jsonb;
  v_note text := format('switched %s on the organization''s settings page (press %s)', p_to, p_press);
begin
  if p_seam = 'older_tables' then
    v_feature := 'data_tables'; v_key := 'older_tables_moved';
  elsif p_seam = 'agent_context' then
    v_feature := 'custom'; v_key := 'agent_context_reads_the_copy';
  else
    raise exception 'the switch % has no press step', p_seam using errcode = '22023';
  end if;

  select o.value into v_before from platform.knob_override o
   where o.feature = v_feature and o.key = v_key and o.scope_kind = 'organization'
     and o.scope_id = p_org and o.organization_id = p_org;

  if p_to = 'new' then
    if p_seam = 'older_tables' then
      -- THE COPY IS RE-SYNCED FROM THE OLDER TABLE FIRST (COPY-WRITABLE, chair ruling 2026-09-25):
      -- the older table is the truth at this moment, so every test edit people made on a copy is
      -- put back and every row they added is archived, with a log row per table. Then the flip.
      v_resynced := platform._cutover_copy_resync(p_org, p_press, p_actor);
      for v_id in
        select d.id from workbench.udt_datasets d
         where d.organization_id = p_org and d.deleted_at is null
         order by d.id
      loop
        perform workbench.udt_dataset_archive(v_id, v_id, v_note);
        v_ids := v_ids || v_id;
      end loop;
      -- "WHEN A ROW CHANGES, RUN AN AGENT" FOLLOWS THE TABLE (CUTOVER-PLAN D8). An automation on
      -- an older table listens for older row events, which stop the moment the table is archived;
      -- it is re-keyed to the copy's record events (same table id, same column keys — the mover
      -- keeps them; row.deleted becomes record.archived, the store's own word). Its config before
      -- is kept on the press and on the automation, so Switch back puts it back exactly.
      for v_t in
        select t.id, t.config from scheduler.sch_trigger t
         where t.organization_id = p_org and t.deleted_at is null and t.type = 'event'
           and t.config ->> 'entity_type' = 'user_table_row'
           and (t.config ->> 'table_id')::uuid = any (v_ids)
         order by t.id
         for update
      loop
        v_cfg := v_t.config
          || jsonb_build_object('entity_type', 'record:' || (v_t.config ->> 'table_id'))
          || case when v_t.config ? 'actions' then jsonb_build_object('actions', (
               select coalesce(jsonb_agg(distinct case a when 'row.deleted' then 'record.archived'
                                                     else regexp_replace(a, '^row\.', 'record.') end), '[]'::jsonb)
                 from jsonb_array_elements_text(v_t.config -> 'actions') a)) else '{}'::jsonb end;
        update scheduler.sch_trigger
           set config = v_cfg,
               metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('cutover_rekeyed',
                 jsonb_build_object('press', p_press, 'at', clock_timestamp(), 'config_before', v_t.config)),
               updated_at = now(), updated_by = p_actor
         where id = v_t.id;
        v_rekeyed := v_rekeyed || jsonb_build_object('id', v_t.id, 'config_before', v_t.config, 'config_now', v_cfg);
      end loop;
    end if;
    v_w := platform._knob_override_write(v_feature, v_key, 'organization', p_org, p_org,
                                         'true'::jsonb, v_note, p_actor);
    if not coalesce((v_w ->> 'ok')::boolean, false) then
      raise exception 'the setting %.% could not be written: %', v_feature, v_key, v_w::text using errcode = '22023';
    end if;
    return jsonb_build_object('archived', to_jsonb(v_ids), 'rekeyed', v_rekeyed,
                              'resynced', v_resynced,
                              'setting', v_feature || '.' || v_key,
                              'setting_before', coalesce(v_before, 'null'::jsonb), 'setting_now', true);
  end if;

  -- p_to = 'old': undo exactly what the last switch to new did.
  v_last := platform._cutover_seam_last_done(p_seam, p_org);
  if p_seam = 'older_tables' and v_last.id is not null then
    for v_id in select (jsonb_array_elements_text(coalesce(v_last.did -> 'archived', '[]'::jsonb)))::uuid loop
      perform workbench.udt_dataset_unarchive(v_id);
      v_ids := v_ids || v_id;
    end loop;
    -- Every automation the switch re-keyed listens to its older table again, exactly as before.
    for v_t in select * from jsonb_array_elements(coalesce(v_last.did -> 'rekeyed', '[]'::jsonb)) as r(x) loop
      update scheduler.sch_trigger
         set config = v_t.x -> 'config_before',
             metadata = coalesce(metadata, '{}'::jsonb) - 'cutover_rekeyed',
             updated_at = now(), updated_by = p_actor
       where id = (v_t.x ->> 'id')::uuid and deleted_at is null;
      v_rekeyed := v_rekeyed || jsonb_build_object('id', v_t.x ->> 'id', 'config_now', v_t.x -> 'config_before');
    end loop;
  end if;
  v_before := case when v_last.id is null then null
                   when v_last.did -> 'setting_before' = 'null'::jsonb then null
                   else v_last.did -> 'setting_before' end;
  v_w := platform._knob_override_write(v_feature, v_key, 'organization', p_org, p_org,
                                       v_before, v_note, p_actor);
  if not coalesce((v_w ->> 'ok')::boolean, false) then
    raise exception 'the setting %.% could not be put back: %', v_feature, v_key, v_w::text using errcode = '22023';
  end if;
  return jsonb_build_object('unarchived', to_jsonb(v_ids), 'rekeyed_back', v_rekeyed,
                            'setting', v_feature || '.' || v_key,
                            'setting_restored_to', coalesce(v_before, 'null'::jsonb),
                            'undid_press', v_last.id);
end;
$function$;

-- ── 13. THE FILE PROVES ITSELF ────────────────────────────────────────────────────────────────
do $g$
begin
  if pg_get_functiondef('custom._context_copy_fence()'::regprocedure) not like '%_older_table_copy_verdict%'
     or pg_get_functiondef('custom._context_copy_fence()'::regprocedure) not like '%_copy_evaluation_note%' then
    raise exception 'copywritable: the fence does not ask the verdict or note a person''s test write';
  end if;
  if pg_get_functiondef('platform._cutover_seam_apply(text,uuid,text,uuid,uuid)'::regprocedure) not like '%_cutover_copy_resync%' then
    raise exception 'copywritable: the press step does not re-sync before it flips';
  end if;
  if has_function_privilege('authenticated', 'platform._cutover_copy_resync(uuid,uuid,uuid)', 'execute')
     or has_function_privilege('authenticated', 'platform.cutover_evaluation_carry(uuid,uuid,jsonb)', 'execute')
     or has_function_privilege('authenticated', 'platform.write_is_a_persons_own()', 'execute')
     or has_function_privilege('anon', 'custom.table_copy_evaluation_state(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'custom.table_copy_evaluation_state(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'custom._copy_evaluation_note(uuid,uuid,uuid,text)', 'execute')
     or not has_function_privilege('authenticated', 'custom._older_table_copy_verdict(uuid)', 'execute') then
    raise exception 'copywritable: a grant is not what the file says';
  end if;
  if has_table_privilege('authenticated', 'platform.cutover_evaluation_write', 'select')
     or has_table_privilege('authenticated', 'platform.cutover_evaluation_replaced', 'select') then
    raise exception 'copywritable: a client reads the evaluation tables directly';
  end if;
end $g$;
