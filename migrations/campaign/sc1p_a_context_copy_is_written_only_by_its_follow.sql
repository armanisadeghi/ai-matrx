-- target: branch,production
-- additive: yes
--   It ADDS one knob, `custom/context_copy_following` (default ON), one trigger function,
--   `custom._context_copy_fence()`, and one BEFORE INSERT OR UPDATE row trigger on custom.record
--   that calls it. Nothing existing is replaced, dropped, revoked or written; no policy or grant
--   is touched. Today no Table in any organization says `kept_for: "context"` except the ones a
--   test builds inside its own rolled-back transaction, so the fence refuses nothing that exists.
--   The inverse is `migrations/inverse/sc1p_a_context_copy_is_written_only_by_its_follow_down.sql`.
-- guard: custom/system_enabled
-- lock: custom
-- window-class: CREATE TRIGGER on the partitioned custom.record takes SHARE ROW EXCLUSIVE on the parent and its 16 partitions for the length of this transaction (every writer to the record store waits; no reader, no sign-in); 01:00–04:00 Pacific at production.
--
-- LANE SC-1' PLACEMENT-AND-FENCE — P13, THE WRITE FENCE ON THE COPY
-- (SCOPES-CONTEXT-TRANSITION.md rev 2 §2.3 P13, attack H3).
--
-- THE USE CASE. Once lane SC-2' copies Titanium's scopes into the record store, "Data
-- Destruction, Inc" exists twice: as a scope in the current screens (the writer until the owner
-- says go) and as a Record of the Clients Table in the store (the copy, which follows every edit).
-- Every door of the store could still write that copy — the `records` agent tool, a workflow's
-- records node, matrx-local's sync, the grid on /data-v2/<id> — and the follow would then
-- silently overwrite what they wrote, or worse, the two sides would disagree. "One writer at a
-- time" was a screen convention; this makes it the store's rule.
--
-- THE RULE. While `custom/context_copy_following` resolves on for an organization, a write to a
-- Table the context system keeps as its copy (`kept_for = 'context'` with no `scope_binding` — a
-- scope's own G11 table is the store's to write, not a copy), to one of its Fields or to one of
-- its Records is refused unless the connection is the store owner's own — the scopes mover and the
-- follow worker, which write as the owner, never as a person. Every client role (a signed-in
-- person through any door, the anonymous role, the service key) is refused with one sentence:
--   "This is the new system's copy of <Table>; it follows the current screens until the switch.
--    Edit it on <the scope's page>."
-- The validation organization, where the store IS the writer, is exempt by an organization
-- override of the knob to false. The flip (SC-13) turns the knob off platform-wide; the undo
-- turns it back on.
--
-- COST. The owner's connection returns at the first line. A client write reads one Table
-- record by its primary key, once per Table per transaction (memoised), and resolves the knob
-- only when that Table is kept for the context system.

set local lock_timeout = '5s';
set local statement_timeout = '60s';

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, label, description,
   set_by, basis, overridable_by, override_direction, propagation, public_read, ui)
values
  ('custom', 'context_copy_following', 'true'::jsonb, 'true'::jsonb, 'boolean',
   'The record store''s copy of the context system follows the current screens',
   'While on, the Tables the context system keeps in the record store (kept_for = context) are a '
   'COPY that follows every edit made in the current scope screens, and only that follow may write '
   'them: any person, agent, workflow, sync or grid writing one is refused with a sentence naming '
   'the scope page to edit instead. The organization where the store is the writer (the '
   'validation organization) turns it off for itself. The switch to the new system turns it off '
   'everywhere; the undo turns it back on.',
   'agent', 'Unified data program, lane SC-1'' (P13), 2026-09-23: one writer at a time is the store''s rule, not a screen convention.',
   '{organization}'::text[], 'any', 'next_load', false, '{}'::jsonb)
on conflict do nothing;

create function custom._context_copy_fence()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $fn$
declare
  v_role   name := custom.caller_role();
  v_table  uuid;
  v_key    text;
  v_hit    text;
  v_kept   text;
  v_name   text;
  v_on     boolean;
  v_where  text;
begin
  -- THE ONE WRITER. The store owner's own connection — the scopes mover and the follow worker —
  -- is the only one that may write the copy. Read from the catalogue, never a role literal,
  -- exactly as custom._store_door's operator lane is.
  if pg_has_role(v_role, (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass), 'member') then
    return new;
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
    v_table := case when new.data_class = 'field'
                    then nullif(new.data ->> 'entity_definition_id', '')::uuid
                    else new.table_id end;
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
$fn$;

comment on function custom._context_copy_fence() is
  'SC-1'' P13, the write fence on the copy. While custom/context_copy_following is on for the '
  'organization, a write by any client role to a Table kept for the context system (kept_for = '
  'context), its Fields or its Records is refused with a sentence naming the scope page to edit; '
  'the store owner''s connection (the scopes mover, the follow worker) passes.';

create trigger _ab_context_copy_fence
  before insert or update on custom.record
  for each row execute function custom._context_copy_fence();
