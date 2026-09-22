-- chair-step: closes a defect CLASS in the mechanism rather than by convention — it adds an event trigger so that a REVOKE sweep over a schema declared closed automatically re-grants the doors that schema declares client-callable, and it replaces two of this lane's own function bodies so they read records through the one read door; an event trigger and two replacements are each judged by the allow-list, so the sanctioned route is a terminal-confirmed step
-- based-on: custom.io_comment_write(uuid, uuid, text, jsonb, uuid) 21082c55929346e1e72389a6d6dc7ffa09da7c72b706a2adbcd33e8ccba44898
-- based-on: custom.io_restore(uuid, uuid, integer) cc076380cf03ec923b6d6e2c4fecfe234d7cae0ba9700b1381944609953978e0
--
-- W4-IO, file 6 — TWO DEFECT CLASSES CLOSED IN THE MECHANISM.
--
-- CLASS 1 — A CLOSED-SCHEMA REVOKE SWEEP SILENTLY TOOK BACK EVERY DECLARED DOOR.
--
-- Schema `custom` is declared CLOSED in `platform.schema_client_exposure`, and twenty schemas
-- on this database carry ALTER DEFAULT PRIVILEGES rows that grant every NEW function
-- automatically. So every campaign file that lands a `custom.*` function re-opens the schema on
-- paper without anyone writing a GRANT, and `platform.provision` then REFUSES to build into it.
-- The remedy every lane reaches for is the blanket sweep:
--     revoke all on all functions in schema custom from public, anon, authenticated, service_role;
-- That sweep is indiscriminate. It also takes EXECUTE back from every function
-- `platform.client_callable_door` declares client-callable — so a door the platform deliberately
-- opened to signed-in callers goes dark, and nothing says so. It bit twice on 2026-09-18 and hit
-- nine doors of this seat's own two lanes.
--
-- The access lane's answer was `custom.reopen_declared_doors()` — correct, and a CONVENTION: it
-- works only for someone who remembers to call it, in a schema whose name is baked into it. A
-- convention is not a fix. **The re-grant now happens in the same transaction as the revoke, by
-- the mechanism, for every schema declared closed** — `platform.reopen_declared_doors(schema)`
-- generalised out of the `custom`-only version, and an event trigger on `REVOKE` that calls it.
-- Postgres fires `ddl_command_end` for `GRANT` and `REVOKE`, so the re-grant lands inside the
-- revoking statement's own transaction: a rollback takes both away, and there is no window in
-- which the doors are shut.
--
-- WHAT IT WILL NOT DO. It re-grants ONLY what `platform.client_callable_door` declares with
-- `signed_in_callers = true`, and ONLY in a schema `platform.schema_client_exposure` declares
-- CLOSED — where a blanket revoke is a posture restoration rather than a decision. It never
-- grants `anon`, never grants `service_role`, never invents a door, and announces by NOTICE
-- what it re-granted so the sweep is not quiet either way. Retiring a door is done by deleting
-- its `client_callable_door` row and then revoking, which is the order that says what you mean.
--
-- CLASS 2 — TWO OF THIS LANE'S DOORS READ RECORDS OUTSIDE THE ONE READ DOOR.
--
-- `custom.io_comment_write` read `custom.record` for the record's `table_id`, and
-- `custom.io_restore` read it back for the new version. Both checked visibility first, so
-- neither leaked — but "it happens to be checked here" is exactly the argument that failed for
-- `seo.keyword_value_map`, and a second reading path is a second place for the read door's
-- masking to not apply. They now go through `custom.read_record`, the one read door, which
-- makes the access decision itself. Nothing about their behaviour changes; what changes is that
-- there is one reading path instead of three.
--
-- THE INVERSE: `migrations/inverse/w4_io_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '600s';

-- ── CLASS 1, the generic form ───────────────────────────────────────────────
create or replace function platform.reopen_declared_doors(p_schema text)
returns table(reopened text)
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_sig    text;
  v_closed boolean;
  v_any    boolean := false;
begin
  -- ONLY a schema DECLARED CLOSED. In an open schema a revoke is somebody's decision and this
  -- has no business undoing it; in a closed one a blanket revoke is posture restoration, and
  -- taking the declared doors with it is collateral nobody intended.
  select not coalesce(e.client_exposed, false) into v_closed
    from platform.schema_client_exposure e where e.schema_name = p_schema;
  if not coalesce(v_closed, false) then
    return;
  end if;

  for v_sig in
    select p.oid::regprocedure::text
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace and n.nspname = p_schema
      join platform.client_callable_door d
        on d.schema_name = p_schema
       and d.function_name = p.proname
       and d.identity_argtypes = platform.door_argtypes(p.proargtypes)
     where d.signed_in_callers
       and not has_function_privilege('authenticated', p.oid, 'EXECUTE')
  loop
    v_any := true;
    execute format('grant execute on function %s to authenticated', v_sig);
    reopened := v_sig;
    return next;
  end loop;

  -- The schema grant is a consequence of there being a door, never a decision of its own.
  if exists (select 1
               from pg_proc p
               join pg_namespace n on n.oid = p.pronamespace and n.nspname = p_schema
               join platform.client_callable_door d
                 on d.schema_name = p_schema and d.function_name = p.proname
                and d.identity_argtypes = platform.door_argtypes(p.proargtypes)
              where d.signed_in_callers)
     and not has_schema_privilege('authenticated', p_schema, 'USAGE') then
    execute format('grant usage on schema %I to authenticated', p_schema);
    reopened := format('schema %s (USAGE)', p_schema);
    return next;
  end if;

  if v_any then
    raise notice 'platform.reopen_declared_doors(%): a revoke sweep took EXECUTE back from declared client doors and they were re-granted in the same transaction.', p_schema;
  end if;
end;
$fn$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('platform', 'reopen_declared_doors', 'p_schema text',
        array['text'::regtype]::oid[],
        'It takes NO entity id at all — one schema NAME, and it refuses to act on any schema platform.schema_client_exposure does not declare CLOSED. It reads no tenant data and returns none. What it grants is not its own decision either: it re-grants EXECUTE to `authenticated` for exactly the functions platform.client_callable_door already declares with signed_in_callers = true, so the access decision belongs to those declarations and this function can only restore them. It never grants anon, never grants service_role, and never creates a declaration.',
        'w4_io_the_closed_schema_regrants_its_doors.sql',
        'server_only: it is called by the platform_reopen_declared_doors event trigger inside a REVOKE statement''s own transaction, and by an operator repairing a schema by hand. A client has no revoke to repair and nothing to gain from calling it.',
        false, false)
on conflict do nothing;

comment on function platform.reopen_declared_doors(text) is
  'Re-grants EXECUTE to `authenticated` for every function platform.client_callable_door declares with signed_in_callers, in a schema platform.schema_client_exposure declares CLOSED. Generic form of custom.reopen_declared_doors(), which only ever knew one schema. Called automatically by the platform_reopen_declared_doors event trigger, so the re-grant happens in the revoking statement''s own transaction.';

-- ── CLASS 1, the mechanism ──────────────────────────────────────────────────
create or replace function platform._reopen_declared_doors_after_revoke()
returns event_trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_schema text;
begin
  -- Every schema declared closed that HAS at least one declared signed-in door. Iterating the
  -- declarations rather than parsing the REVOKE statement is deliberate: the statement's form
  -- varies (ALL FUNCTIONS IN SCHEMA, one function, a default-privileges change), and what must
  -- be true afterwards does not.
  for v_schema in
    select distinct e.schema_name
      from platform.schema_client_exposure e
      join platform.client_callable_door d on d.schema_name = e.schema_name
     where not coalesce(e.client_exposed, false)
       and d.signed_in_callers
  loop
    perform platform.reopen_declared_doors(v_schema);
  end loop;
exception when others then
  -- A REVOKE must never fail because the re-grant could not run — that would make the sweep
  -- itself unrunnable and every lane would work around it. It SCREAMS instead.
  raise warning 'platform._reopen_declared_doors_after_revoke: could not re-grant declared doors after a REVOKE (%). The doors of every closed schema may now be shut to signed-in callers; run select platform.reopen_declared_doors(''<schema>'') and find out why this failed.', sqlerrm;
end;
$fn$;

create event trigger platform_reopen_declared_doors
  on ddl_command_end
  when tag in ('REVOKE')
  execute function platform._reopen_declared_doors_after_revoke();

comment on function platform._reopen_declared_doors_after_revoke() is
  'THE CLASS FIX for "a closed-schema revoke sweep silently shuts every declared door" (bit twice, 2026-09-18). Fires on REVOKE, inside that statement''s transaction, and restores exactly what platform.client_callable_door declares. Never grants anon, never grants service_role, never invents a door.';

-- ── CLASS 2: one reading path ───────────────────────────────────────────────
create or replace function custom.io_comment_write(p_organization_id uuid,
                                                   p_record_id uuid,
                                                   p_body text,
                                                   p_anchor jsonb default '{}'::jsonb,
                                                   p_parent_comment_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_user  uuid := custom.query_principal();
  v_doc   jsonb;
  v_table uuid;
  v_id    uuid;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.io_comment_write');
  if coalesce(btrim(coalesce(p_body, '')), '') = '' then
    raise exception 'custom.io_comment_write: a comment with no body is not a comment'
      using errcode = '22004';
  end if;

  -- THE LEVEL, AND IT IS THE ENUM DOING THE WORK. `commenter` is the second rung, so this one
  -- call admits commenters, editors and admins and refuses viewers — without a single string
  -- comparison and without a second access idea beside the platform's.
  if not custom.has_visibility(v_user, 'record', p_record_id, 'commenter'::permission_level) then
    raise exception 'You may read this record but not comment on it.'
      using errcode = '42501',
            hint = 'Commenting needs the commenter level on the record (viewer < commenter < editor < admin). Ask whoever shared it with you to raise your level; nothing about the record itself has to change.';
  end if;

  -- THE ONE READ DOOR. This used to select from custom.record directly. It was checked, so it
  -- did not leak — but a second reading path is a second place the door's masking does not
  -- apply, and that argument is exactly the one that failed for seo.keyword_value_map.
  v_doc := custom.read_record(p_organization_id, p_record_id, true);
  if v_doc is null then
    raise exception 'custom.io_comment_write: record % is not in this organization, or is deleted', p_record_id
      using errcode = '23503';
  end if;
  v_table := (v_doc ->> 'table_id')::uuid;

  if p_parent_comment_id is not null
     and not exists (select 1 from custom.io_comment c
                      where c.organization_id = p_organization_id
                        and c.id = p_parent_comment_id
                        and c.record_id = p_record_id
                        and c.deleted_at is null) then
    -- A reply to a comment on ANOTHER record would put one conversation in two places.
    raise exception 'custom.io_comment_write: comment % is not a comment on record %', p_parent_comment_id, p_record_id
      using errcode = '23503';
  end if;

  insert into custom.io_comment (organization_id, record_id, table_id, body, anchor,
                                 parent_comment_id, created_by)
  values (p_organization_id, p_record_id, v_table, btrim(p_body),
          coalesce(p_anchor, '{}'::jsonb), p_parent_comment_id, v_user)
  returning id into v_id;
  return v_id;
end;
$fn$;

create or replace function custom.io_restore(p_organization_id uuid,
                                             p_record_id uuid,
                                             p_version integer)
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_user uuid := custom.query_principal();
  v_doc  jsonb;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.io_restore');
  -- Restoring REWRITES the record, so it needs the level that may rewrite it. A commenter who
  -- could restore would be able to change every value on the record without being allowed to
  -- change one.
  if not custom.has_visibility(v_user, 'record', p_record_id, 'editor'::permission_level) then
    raise exception 'You may not restore this record to an earlier version.'
      using errcode = '42501',
            hint = 'Restoring rewrites every value on the record, so it needs the editor level — the same level that lets you change one of them by hand.';
  end if;
  if p_version is null then
    raise exception 'custom.io_restore: name the version to restore. custom.io_revisions(organization, record) lists them with a sentence each.'
      using errcode = '22004';
  end if;

  -- The store's own restore, NOT a second one. It rewrites through the record's normal write
  -- path, so the restore gets its own version, its own history row and its own outbox event —
  -- which is what makes a restore undoable by the same mechanism that made it possible.
  perform history.snapshot_restore(p_organization_id, p_record_id, p_version);

  -- Read back through THE ONE READ DOOR, not out of custom.record.
  v_doc := custom.read_record(p_organization_id, p_record_id, true);
  return (v_doc ->> 'version')::integer;
end;
$fn$;

revoke all on all tables in schema custom from public, anon, authenticated, service_role;
revoke all on all functions in schema custom from public, anon, authenticated, service_role;
