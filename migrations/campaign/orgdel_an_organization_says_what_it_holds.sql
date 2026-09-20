-- chair-step: it GRANTS EXECUTE on two NEW functions to `authenticated`, which is the shape the
--   runner's allow-list refuses by name. Nothing is dropped, nothing is revoked, no existing
--   function is replaced, and no row of any feature is deleted or rewritten by this file. The
--   inverse is migrations/inverse/orgdel_an_organization_says_what_it_holds_down.sql.
-- additive: yes
-- guard: custom/system_enabled
--
-- ORG-DELETE — AN ORGANIZATION SAYS WHAT IT HOLDS, AND THERE IS A SUPPORTED WAY TO EMPTY IT.
--
-- WHAT THIS CLOSES, measured on the main database 2026-09-19 (bug
-- 8500bd65-7a5c-4c22-8213-2e10d462d348). An organization that holds store records cannot be
-- deleted, and what a person read in its Danger Zone was the database's own string:
--
--   update or delete on table "organizations" violates foreign key constraint
--   "record_organization_id_fkey"
--
-- That is not a sentence, it names nothing a person can do, and it is the dead end the
-- platform's own law forbids. It is also a CLASS, not one constraint: THIRTY-THREE foreign
-- keys reach `iam.organizations` from schemas `custom` and `history`, every one of them
-- NO ACTION, so any of them produces the identical raw refusal —
--   custom.record (and its 16 partitions), custom.record_alias, custom.anon_form,
--   custom.anon_hit, custom.anon_inbound, custom.anon_replay, custom.anon_submission,
--   custom.anon_token, custom.doc_render, custom.doc_signature, custom.external_link,
--   custom.external_source, custom.io_comment, custom.io_import, custom.io_outbox,
--   custom.merge_field_provenance, history.migration_log.
-- Nothing in the product could say which one was holding on, and nothing could clear any of
-- them. This file answers both, for the whole class at once, by asking the CATALOG which
-- tables reach `iam.organizations` rather than naming them — a thirty-fourth foreign key
-- added tomorrow is counted and cleared without touching this code.
--
-- THE TWO DOORS
--
-- `custom.organization_contents(organization)` — what is in here, in plain words, before
--   anybody decides anything. It is the sentence the Danger Zone shows.
--
-- `custom.organization_clear(organization, confirm, and_destroy)` — the supported path, and
--   it has two arms on purpose:
--
--   · `and_destroy => false` (THE DEFAULT) retires every live Table of the organization
--     through the store's OWN door, `custom.migrate_delete`, which takes each Table's
--     records, views, Rules and Fields with it as ONE `history.migration_log` entry that
--     `custom.migrate_undo` puts back. NOTHING IS HARD-DELETED. The undo stands for the
--     organization's retention floor (HIS-3: thirty days, raisable, never lowerable), and the
--     answer says the date.
--
--   · `and_destroy => true` is for the one case the first arm cannot serve: the owner is
--     removing the ORGANIZATION. Retention exists so a delete can be UNDONE, and an undo is
--     performed by a person from a seat inside the organization. When the organization goes,
--     no such seat remains and there is nothing left for the window to protect — so removing
--     the organization ends the window, and the answer SAYS SO in those words rather than
--     letting a person find out later. It destroys rows of THIS organization only, and only
--     in schemas `custom` and `history`. `custom.migrate_purge`'s retention rule, which is
--     what protects a retired record while its organization lives on, is not touched by this
--     file at all.
--
-- WHO MAY. Both doors go through `custom.assert_client_may_reach` (the organization wall) and
-- the clear goes through `custom.assert_store_door` (the switch) as well. The clear is then
-- OWNER ONLY, matching `iam.organizations.org_delete_policy` exactly — the person who may
-- delete the organization is the person who may empty it, and nobody else — and it demands
-- the organization's name back, character for character, the same confirmation the Danger
-- Zone already asks for. An admin who is not an owner is refused by name with the remedy.
--
-- WHAT MAKES IT FAIL (rule 3): drop the two functions, which is exactly what
-- migrations/inverse/orgdel_an_organization_says_what_it_holds_down.sql does — and
-- `scripts/campaign-tests/orgdel_green.sql` goes red on every PART naming them.

create function custom.organization_contents(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_name   text;
  v_holder record;
  v_rows   bigint;
  v_holds  jsonb := '[]'::jsonb;
  v_total  bigint := 0;
  v_tables bigint := 0;
  v_recs   bigint := 0;
  v_fields bigint := 0;
  v_retired bigint := 0;
  v_until  timestamptz;
  v_parts  text[] := '{}';
  v_sentence text;
begin
  -- THE ORGANIZATION WALL. A stranger does not get an inventory of somebody else's data,
  -- and this door answers with counts, which are still that organization's business.
  perform custom.assert_client_may_reach(p_organization_id, 'custom.organization_contents');

  if p_organization_id is null then
    raise exception 'custom.organization_contents: which organization?'
      using errcode = '22004',
            hint = 'This door counts what ONE organization holds; a null would count the whole store.';
  end if;

  select o.name into v_name from iam.organizations o where o.id = p_organization_id;

  -- THE CLASS, ASKED OF THE CATALOG. Every base or partitioned table in `custom` or `history`
  -- that carries a foreign key to iam.organizations is a thing that can refuse the delete, so
  -- every one of them is counted. Partitions are skipped: their rows are already counted
  -- through the partitioned parent, and counting both would double every record.
  for v_holder in
    select distinct rn.nspname as s, rc.relname as t
      from pg_constraint con
      join pg_class rc on rc.oid = con.conrelid
      join pg_namespace rn on rn.oid = rc.relnamespace
     where con.contype = 'f'
       and con.confrelid = 'iam.organizations'::regclass
       and rn.nspname in ('custom', 'history')
       and rc.relkind in ('r', 'p')
       and rc.relispartition = false
     order by 1, 2
  loop
    execute format('select count(*) from %I.%I where organization_id = $1', v_holder.s, v_holder.t)
      into v_rows using p_organization_id;
    if v_rows > 0 then
      v_holds := v_holds || jsonb_build_object('where', v_holder.s || '.' || v_holder.t, 'rows', v_rows);
      v_total := v_total + v_rows;
    end if;
  end loop;

  select count(*) filter (where r.data_class = 'table' and r.deleted_at is null),
         count(*) filter (where r.data_class not in ('table', 'field') and r.deleted_at is null),
         count(*) filter (where r.data_class = 'field' and r.deleted_at is null),
         count(*) filter (where r.deleted_at is not null),
         max(r.deleted_at)
    into v_tables, v_recs, v_fields, v_retired, v_until
    from custom.record r
   where r.organization_id = p_organization_id;

  -- THE SENTENCE. Plain words, in the order a person cares about them, and it never reads
  -- like a database. An organization that holds nothing says so in one clause.
  if v_tables > 0 then
    v_parts := v_parts || format('%s table%s', v_tables, case when v_tables = 1 then '' else 's' end);
  end if;
  if v_recs > 0 then
    v_parts := v_parts || format('%s record%s', v_recs, case when v_recs = 1 then '' else 's' end);
  end if;
  if v_fields > 0 then
    v_parts := v_parts || format('%s column%s', v_fields, case when v_fields = 1 then '' else 's' end);
  end if;
  if v_retired > 0 then
    v_parts := v_parts || format('%s retired row%s that can still be put back',
                                 v_retired, case when v_retired = 1 then '' else 's' end);
  end if;

  if v_total = 0 then
    v_sentence := format('%s holds no data in the record store, so it can be removed now.',
                         coalesce(v_name, 'This organization'));
  else
    v_sentence := format(
      '%s holds %s. Removing the organization removes all of it, and that cannot be undone afterwards.',
      coalesce(v_name, 'This organization'),
      array_to_string(v_parts, ' and '));
  end if;

  return jsonb_build_object(
    'function', 'custom.organization_contents',
    'organization_id', p_organization_id,
    'name', v_name,
    'holds', v_holds,
    'rows_held', v_total,
    'tables', v_tables,
    'records', v_recs,
    'columns', v_fields,
    'retired_rows', v_retired,
    'last_retired_at', v_until,
    'is_empty', v_total = 0,
    'sentence', v_sentence,
    'at', now());
end;
$function$;

create function custom.organization_clear(
  p_organization_id uuid,
  p_confirm         text,
  p_and_destroy     boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_me       uuid := custom.query_principal();
  v_boss     boolean := custom.query_is_store_owner();
  v_name     text;
  v_table    uuid;
  v_logs     uuid[] := '{}';
  v_retired  integer := 0;
  v_left     uuid;
  v_floor    integer;
  v_holder   record;
  v_gone     bigint;
  v_destroyed jsonb := '[]'::jsonb;
  v_total    bigint := 0;
  v_out      jsonb;
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

  -- ARM ONE, ALWAYS RUN: RETIRE, THROUGH THE STORE'S OWN DOOR. custom.migrate_delete takes a
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

  -- Anything live that no Table owned — a stranded row, a kernel row of this organization —
  -- goes the same way, through the same door, one entry each.
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
        'Everything in %s is retired. Nothing was destroyed — you can put all of it back until %s. Removing the organization itself ends that, and cannot be undone.',
        v_name, to_char(now() + make_interval(days => v_floor), 'FMDD FMMonth YYYY')),
      'at', now());
  end if;

  -- ARM TWO: THE ORGANIZATION IS GOING. Retention exists so a delete can be UNDONE, and an
  -- undo is performed by a person from a seat INSIDE the organization. Removing the
  -- organization removes every such seat, so the window has nothing left to protect and it
  -- ends here — deliberately, by the owner, who typed the name and is told so in the answer.
  -- Only rows of THIS organization, only in `custom` and `history`, asked of the catalog so
  -- a foreign key added after this file is written is cleared too. Ordered so a table that
  -- points at another goes first: `custom.record` and `history.migration_log` last.
  for v_holder in
    select distinct rn.nspname as s, rc.relname as t
      from pg_constraint con
      join pg_class rc on rc.oid = con.conrelid
      join pg_namespace rn on rn.oid = rc.relnamespace
     where con.contype = 'f'
       and con.confrelid = 'iam.organizations'::regclass
       and rn.nspname in ('custom', 'history')
       and rc.relkind in ('r', 'p')
       and rc.relispartition = false
     order by case when rn.nspname || '.' || rc.relname in ('custom.record', 'history.migration_log')
                   then 1 else 0 end, 1, 2
  loop
    execute format('delete from %I.%I where organization_id = $1', v_holder.s, v_holder.t)
      using p_organization_id;
    get diagnostics v_gone = row_count;
    if v_gone > 0 then
      v_destroyed := v_destroyed || jsonb_build_object('where', v_holder.s || '.' || v_holder.t, 'rows', v_gone);
      v_total := v_total + v_gone;
    end if;
  end loop;

  return jsonb_build_object(
    'function', 'custom.organization_clear',
    'organization_id', p_organization_id, 'name', v_name,
    'destroyed', true,
    'retired_operations', v_retired,
    'migrations', to_jsonb(v_logs),
    'rows_destroyed', v_total,
    'destroyed_from', v_destroyed,
    'sentence', format(
      '%s rows were removed from %s. The organization can now be deleted, and none of this can be put back — removing an organization ends the %s-day window its retired rows had.',
      v_total, v_name, v_floor),
    'at', now());
end;
$function$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, declared_by, reason, signed_in_callers,
   anonymous_callers, identity_argtypes)
values
  ('custom','organization_contents',
   'p_organization_id uuid',
   'migrations/campaign/orgdel_an_organization_says_what_it_holds.sql (lane ORG-DELETE)',
   'ORG-DELETE / bug 8500bd65-7a5c-4c22-8213-2e10d462d348: what this organization holds in the record store, in plain words, so the Danger Zone can say it instead of showing the database''s foreign-key string. p_organization_id is decided against the caller by custom.assert_client_may_reach, which is the organization wall — a stranger is refused an inventory of somebody else''s data — and null is refused with 22004 because a null would count the whole store. Reads only; writes nothing; counts rows in every table of schemas custom and history that carries a foreign key to iam.organizations, asked of the catalog rather than named, so a foreign key added later is counted without a code change. Counts of that organization''s own rows are that organization''s business, and no row content of any kind is returned.',
   true, false, array[2950]::oid[]),
  ('custom','organization_clear',
   'p_organization_id uuid, p_confirm text, p_and_destroy boolean',
   'migrations/campaign/orgdel_an_organization_says_what_it_holds.sql (lane ORG-DELETE)',
   'ORG-DELETE / REC-23 / HIS-3: the supported way to empty an organization, which is what an organization delete needs and never had. p_organization_id is decided against the caller by custom.assert_client_may_reach after custom.assert_store_door, and then a SECOND time and harder: this door is OWNER ONLY, the same person iam.organizations.org_delete_policy lets delete the organization, checked with iam.is_org_owner; an admin who is not an owner is refused with 42501 and the remedy. p_confirm must equal the organization''s name character for character or nothing happens (22023, with the name in the hint), so a caller that never drew a confirmation dialog cannot empty an organization by accident. p_and_destroy defaults to FALSE, and in that arm nothing is hard-deleted at all: every live Table is retired through custom.migrate_delete, the store''s own door, one history.migration_log entry each, and custom.migrate_undo puts them back for the organization''s retention floor. p_and_destroy => true is the arm for the one case the first cannot serve — the owner is removing the organization, no seat remains from which any undo could ever be performed, so the window ends with the organization and the answer says so in those words. It deletes rows of THAT organization only, only in schemas custom and history, and never touches custom.migrate_purge''s retention rule, which is what protects a retired record while its organization lives on.',
   true, false, array[2950,25,16]::oid[])
on conflict do nothing;

grant execute on function custom.organization_contents(uuid) to authenticated;
grant execute on function custom.organization_clear(uuid, text, boolean) to authenticated;
