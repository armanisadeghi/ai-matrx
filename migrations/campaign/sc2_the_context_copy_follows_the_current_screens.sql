-- target: branch,production
-- additive: yes
--   It ADDS one trigger function, `context._follow_to_the_copy()`, and four AFTER row triggers
--   (one on each of context.scope_types, context.context_items, context.scopes and
--   context.context_item_values) that call it. Nothing existing is replaced, dropped, revoked or
--   written; no policy or grant is touched; no old row is read back, marked or changed. The
--   trigger writes only custom.io_outbox rows, and a failure inside it is caught, recorded in
--   ops.system_error and swallowed — an edit in the current screens can never fail because the
--   copy could not be told about it.
--   The inverse is `migrations/inverse/sc2_the_context_copy_follows_the_current_screens_down.sql`.
-- guard: custom/system_enabled
-- lock: context
-- window-class: CREATE TRIGGER takes SHARE ROW EXCLUSIVE on the four small context tables for the
--   length of this transaction (a scope edit waits a moment; no reader, no sign-in). Applied
--   directly per the owner's ruling of 2026-09-24 ~17:30 PT, under lock_timeout.
--
-- LANE SC-2' COPY, THEN FOLLOW — P8, THE FOLLOW (SCOPES-CONTEXT-TRANSITION.md rev 2 §2.3 P8,
-- attack H1).
--
-- THE USE CASE. Arman edits Tech Stack on Matrx Frontend's scope page (AI Matrx → Apps). The
-- current screens stay the writer until he flips; the record store holds a COPY of every scope
-- type, context item, scope and value under the same ids, and that copy must never fall behind.
-- This file is the old side's half of that promise: every insert, update or delete on the four
-- scope tables leaves one row in the store's own outbox, `custom.io_outbox`, with
--   event_key  'context.follow'
--   record_id  the changed old row's id (a value row names its own id)
--   table_id   the scope type it belongs to (the copy's Table id)
--   operation  created / updated / deleted
--   dedupe_key 'context.follow:<table>:<row id>'  — ONE outbox row per old row, re-armed on
--              every later change, so a fifty-row batch import or a knowledge-sweep accept is
--              fifty rows claimed in one drain, never fifty drains per row.
-- The follow (aidream, `matrx_records.movers.context_follow`, consumer 'context-follow') claims
-- them through custom.io_outbox_drain and brings that organization's copy current, the old side
-- winning. The compare panel's lag reader (custom.context_compare_facts) counts exactly these
-- rows, so the day this lands the panel says whether the copy is current.
--
-- WHILE THE COPY FOLLOWS. An organization whose `custom/context_copy_following` resolves off
-- (the validation organization, where the store is the writer; everyone after the flip) writes
-- no follow rows.

set local lock_timeout = '30s';
set local statement_timeout = '120s';

create function context._follow_to_the_copy()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_row  jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_id   uuid  := (v_row ->> 'id')::uuid;
  v_org  uuid;
  v_type uuid;
  v_on   boolean;
begin
  -- WHICH ORGANIZATION AND WHICH SCOPE TYPE (the copy's Table) this row belongs to.
  if tg_table_name = 'scope_types' then
    v_org  := (v_row ->> 'organization_id')::uuid;
    v_type := v_id;
  elsif tg_table_name = 'scopes' then
    v_org  := (v_row ->> 'organization_id')::uuid;
    v_type := (v_row ->> 'scope_type_id')::uuid;
  elsif tg_table_name = 'context_items' then
    v_type := (v_row ->> 'scope_type_id')::uuid;
    select t.organization_id into v_org from context.scope_types t where t.id = v_type;
  elsif tg_table_name = 'context_item_values' then
    select s.organization_id, s.scope_type_id into v_org, v_type
      from context.scopes s where s.id = (v_row ->> 'scope_id')::uuid;
  end if;
  if v_org is null then
    return null;
  end if;

  v_on := coalesce((platform.knob_resolve('custom', 'context_copy_following', v_org) #>> '{}')::boolean, true);
  if not v_on then
    return null;
  end if;

  insert into custom.io_outbox (event_key, record_id, table_id, operation, dedupe_key, organization_id, actor)
  values ('context.follow', v_id, v_type,
          case tg_op when 'INSERT' then 'created' when 'DELETE' then 'deleted' else 'updated' end,
          'context.follow:' || tg_table_name || ':' || v_id::text,
          v_org,
          jsonb_build_object('declared', 'context.' || tg_table_name, 'user_id', auth.uid()))
  on conflict (organization_id, dedupe_key) where deleted_at is null
  do update set consumed_at = null,
                consumer    = null,
                operation   = excluded.operation,
                actor       = excluded.actor;
  -- A RE-ARMED ROW IS NEWS TOO. custom.io_outbox_announce fires on INSERT only, so the second
  -- edit of the same old row (an update of the outbox row) would wake nobody; say it here, in the
  -- announce's own shape (a pointer, never the row). The follow debounces, so a duplicate on the
  -- first insert costs nothing.
  perform pg_notify('records_changed',
                    jsonb_build_object('organization_id', v_org, 'record_id', v_id, 'table_id', v_type,
                                       'operation', 'updated', 'event_key', 'context.follow')::text);
  return null;
exception when others then
  -- NEVER FAIL THE OLD SIDE'S EDIT, NEVER FAIL IN SILENCE. The current screens are the writer;
  -- an edit there must land whether or not the copy could be told. The miss is recorded with its
  -- remedy, and the next change to the same organization (or any follow drain run for it)
  -- re-plans the whole organization, so nothing is lost for good.
  begin
    insert into ops.system_error (kind, organization_id, source_app, source_feature, route, error_type, error_text, context)
    values ('context_follow_enqueue_failure', v_org, 'database', 'context-follow',
            'context._follow_to_the_copy', sqlstate, sqlerrm,
            jsonb_build_object('table', 'context.' || tg_table_name, 'row_id', v_id, 'operation', tg_op,
                               'remedy', 'run the follow for this organization: python -m matrx_records.movers.runner --follow-context --organization <id> --apply --i-know-this-writes'));
  exception when others then
    raise warning 'context._follow_to_the_copy: could not tell the copy about %.% (%), and could not record it: %',
      'context', tg_table_name, v_id, sqlerrm;
  end;
  return null;
end;
$fn$;

comment on function context._follow_to_the_copy() is
  'SC-2'' P8, the old side of the follow. Every change to a scope type, context item, scope or '
  'value leaves one re-armed custom.io_outbox row (event context.follow, dedupe per old row) for '
  'the follow worker (consumer context-follow) to bring the record store''s copy current, old side '
  'winning. Writes nothing else; never fails the old edit.';

-- (No grant or revoke: a function that returns `trigger` can only ever be called as a trigger.)

create trigger zz_follow_to_the_copy
  after insert or update or delete on context.scope_types
  for each row execute function context._follow_to_the_copy();

create trigger zz_follow_to_the_copy
  after insert or update or delete on context.context_items
  for each row execute function context._follow_to_the_copy();

create trigger zz_follow_to_the_copy
  after insert or update or delete on context.scopes
  for each row execute function context._follow_to_the_copy();

create trigger zz_follow_to_the_copy
  after insert or update or delete on context.context_item_values
  for each row execute function context._follow_to_the_copy();
