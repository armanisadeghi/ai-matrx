-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- W3-WORK — REC-69, REC-70, REC-71. THE WORK LAYER OF THE RECORD STORE.
--
-- THE LANE HOLDS NO LOCK. Every object it creates is under its own reserved prefix inside
-- schema `custom` (BUILD-BOOK §4.5, rule 7): `custom.work_*` for verbs and readers,
-- `custom._work_*` for trigger functions, `zz_w3_work_*` for the one trigger it attaches to
-- the shared table and for any RED proof's disposable objects. The precedent is `W1-TIER`,
-- which reserved `external_*` the same way and recorded it in the build log before its first
-- statement. Two other lanes hold `LOCK:custom` and `LOCK:platform` while this file runs, so
-- every statement that can wait on a shared object runs under a `lock_timeout` and this file
-- creates NOTHING outside its prefix and alters NOTHING those lanes own.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- REC-69 — ASSIGNEE, DUE DATE AND STATUS ARE KERNEL FIELDS ANY TABLE MAY TAKE
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- "so 'whose turn is it' is never re-invented per table." The reference is Linear, which
-- ships assignee, due date and a workflow state on every issue as first-class fields rather
-- than as per-team custom properties.
--
-- The three specs are DEFINED IN CODE, NOT DATA — REC-27's rule for the kernel, and the same
-- shape `custom.parity_field_types()`, `custom.value_envelope_keys()` and
-- `custom.rule_node_kinds()` already use. `custom.work_assignment_fields()` IS the kernel
-- declaration; `custom.work_take_assignment()` is how one Table TAKES it. A Table that took
-- them gets three real `custom.field` definitions, indistinguishable from any other Field —
-- which is the whole point: the kernel supplies the shape, the store holds one kind of Field.
--
-- WHY `status` PULLS A TABLE IN WITH IT, and it is not scope creep. FLD-5/FLD-6 are already
-- law here and `custom._field_shape_guard` enforces them: "every pick-list is already a
-- Table, so a list field names one rather than carrying an enum". A status field that carried
-- an enum would be refused by a guard that already exists. So taking the assignment fields
-- declares the workflow-state Table too, with its five states as records, and the Field
-- points at it. `terminal` on a state is what makes "whose turn is it" able to stop asking.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- REC-70 — A TEMPLATE RECORD INSTANTIATES A WHOLE GRAPH IN ONE ATOMIC, LOGGED ACT
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- The reference is Asana, whose project templates create the whole task graph with its
-- dependencies in a single instantiation rather than task by task.
--
-- THE RELATIONS ARE THE STORE'S OWN, NOT A NEW LAYER. `W1-REL` is not built, and this lane
-- does not build it. What the store already offers for owned/contained records is
-- `custom.relation_own(organization, owner, target)`: it writes the containment edge
-- (`parent_id`) and the carrying `relation` row in one transaction, through
-- `custom._containment_guard`, so every REC-7 / REC-8 / REC-N-4 refusal applies. That is the
-- only relation verb this file calls.
--
-- 🚨 WHAT `W1-REL` MUST LATER CARRY, STATED HERE SO IT IS NOT DISCOVERED LATE (rule 16 — a
--    stand-in announces itself with the remedy):
--      1. REFERENCED (non-carrying) relations. `relation_own` writes `kind: owned,
--         carrying: true` and moves the target's parent. A template that wants a task to
--         REFERENCE a document without containing it has no verb today, so
--         `custom.work_template_instantiate` REFUSES `"kind": "referenced"` by name rather
--         than silently writing an owned edge. When W1-REL lands, that refusal becomes a call.
--      2. TYPED / ROLE-BEARING edges. The relation row this store writes carries
--         `{kind, carrying, from, to}` and no role, so a template cannot say "blocks",
--         "depends on" or "reviews". The dependency graph Asana's templates carry needs that
--         word, and REC-70's own proof line calls it "with its dependencies".
--      3. INVERSE TRAVERSAL as a first-class read. `custom.relation_targets` walks forward
--         from a record; nothing walks backward except a scan.
--      4. RELATION CARDINALITY AND DELETE BEHAVIOUR as a property of the edge, rather than of
--         the Field declaration (`relation_max`, `on_target_delete`) it currently lives on.
--    Until then a template's graph is a CONTAINMENT tree with carrying edges, and
--    `custom.work_template_instantiate` says so in its own report (`relation_kind: owned`).
--
-- THE LOG IS A STAND-IN AND SAYS SO. `W3-HIST` owns the history store (HIS-*) and has not
-- landed. So the "logged" half of REC-70 is a row of the store itself — one
-- `work_instantiation` record naming the template, the actor, the moment, every record id
-- and every relation id it created, and the counts. It is written INSIDE the same statement,
-- so a graph that rolled back has no log row either. When `W3-HIST` lands, this row's content
-- is what it must be able to reproduce: template id, actor, at, and the two id arrays.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- REC-71 — A SLOT HOLD IS A RESERVATION WITH AN EXPIRY, DECIDED BY REC-N-12'S UNIQUE INDEX
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- The reference is Cal.com, which resolves double-booking in the database and returns the
-- collision to the second caller rather than accepting both.
--
-- NOTHING IN THIS LANE DECIDES THE COLLISION. `W1-INDEX` built the decision:
-- `custom.promote_field` on a Field declared `unique` creates
-- `unique index cpu_<key>_<hash> on custom.record (organization_id, (data->>'<key>'))
--  where table_id = <table> and deleted_at is null`, with every partition child renamed to
-- `<parent>_NN` so the refusal a person reads carries the field key. This lane declares the
-- slot Table so that `slot_key` IS that Field, and then gets out of the way.
--
-- THE EXPIRY RIDES ON THE INDEX'S OWN PREDICATE, and that is the design rather than an
-- accident. The index is partial on `deleted_at is null`, so an expired hold stops competing
-- for the slot the moment it is soft-deleted — and REC-23 already makes delete soft here.
-- `now()` cannot appear in an index predicate (it is not IMMUTABLE), so the sweep is an act,
-- not a declaration: `custom.work_slot_hold` runs `custom.work_slot_expire` for this Table
-- inside its own statement before it inserts. Two concurrent holds therefore both sweep, both
-- insert, and the index decides — which is exactly REC-71's law.

set lock_timeout = '10s';
set statement_timeout = '600s';

-- THE TARGET IS THE RUNNER'S ASSERTION, NOT A DO BLOCK IN HERE. `pnpm db:apply … --target`
-- compares `pg_control_system().system_identifier` to `plan/BRANCH-REF` before a byte
-- executes and refuses on disagreement (BUILD-BOOK §5.2b), and a DO block would be refused by
-- the additive allow-list anyway, because it builds statements the allow-list cannot read.


-- ════════════════════════════════════════════════════════════════════════════════════════
-- 1. REC-69 — THE KERNEL DECLARATION, IN CODE.
-- ════════════════════════════════════════════════════════════════════════════════════════

-- The five workflow states. `terminal` is what lets "whose turn is it" stop asking about a
-- record nobody owes anything on. They are DATA of a Table (FLD-5), declared here in code so
-- that every Table that takes the assignment fields starts from the same five.
-- `next` is the workflow MODEL: which states this one may be moved to. It is what makes
-- "a state the model forbids" a refusal rather than a convention, and it is DATA on the state
-- record, so an organization that wants a different workflow edits its own states rather than
-- waiting for a code change (law 6: opinions become knobs).
create or replace function custom.work_states()
returns table (sort integer, name text, terminal boolean, next text[])
language sql
immutable
parallel safe
set search_path to 'pg_catalog'
as $$
  select * from (values
    (10, 'Not started', false, array['In progress', 'Cancelled']),
    (20, 'In progress', false, array['Blocked', 'Done', 'Cancelled']),
    (30, 'Blocked',     false, array['In progress', 'Cancelled']),
    (40, 'Done',        true,  array['In progress']),
    (50, 'Cancelled',   true,  array['Not started'])
  ) v(sort, name, terminal, next);
$$;

-- THE KERNEL FIELDS. `spec` is the Field's `data` document less its `entity_definition_id`,
-- which is the one thing that differs per Table — so a Table takes the kernel by adding one
-- key, and nothing about the shape is re-decided per table. `parity_type` is DECLARED on each
-- one so `custom._field_type_parity_guard` checks the declaration against what the Field
-- actually says it is, rather than this file asserting it in a comment.
create or replace function custom.work_assignment_fields(p_options_table_id uuid default null)
returns table (key text, label text, spec jsonb)
language sql
stable
parallel safe
set search_path to 'pg_catalog'
as $$
  select v.key, v.label, v.spec from (values
    ('assignee', 'Assignee', jsonb_build_object(
        'key', 'assignee', 'label', 'Assignee', 'sort', 900,
        'type', 'relation', 'parity_type', 'member',
        'relation_target', custom.person_kernel_id()::text,
        'relation_max', 1, 'on_target_delete', 'set_null',
        'multi', false, 'dated', false, 'required', false,
        'source', 'manual', 'config', '{}'::jsonb, 'rules', '[]'::jsonb,
        'depends_on', '[]'::jsonb, 'source_config', '{}'::jsonb,
        'sensitivity', 'internal', 'context_policy', 'include',
        'applies_to_types', '[]'::jsonb,
        'promoted', true, 'unique', false)),
    ('due_date', 'Due date', jsonb_build_object(
        'key', 'due_date', 'label', 'Due date', 'sort', 910,
        'type', 'range', 'parity_type', 'datetime',
        'config', jsonb_build_object('kind', 'date'),
        'multi', false, 'dated', false, 'required', false,
        'source', 'manual', 'rules', '[]'::jsonb,
        'depends_on', '[]'::jsonb, 'source_config', '{}'::jsonb,
        'sensitivity', 'internal', 'context_policy', 'include',
        'applies_to_types', '[]'::jsonb,
        'promoted', true, 'unique', false)),
    ('status', 'Status', jsonb_build_object(
        'key', 'status', 'label', 'Status', 'sort', 920,
        'type', 'list', 'parity_type', 'select',
        'config', jsonb_build_object('options_table_id', p_options_table_id),
        'multi', false, 'dated', false, 'required', false,
        'source', 'manual', 'rules', '[]'::jsonb,
        'depends_on', '[]'::jsonb, 'source_config', '{}'::jsonb,
        'sensitivity', 'internal', 'context_policy', 'include',
        'applies_to_types', '[]'::jsonb,
        'promoted', true, 'unique', false))
  ) v(key, label, spec);
$$;

-- Does this Table hold the assignment fields? One answer, read from the definitions
-- themselves rather than from a flag somebody could forget to set.
create or replace function custom.work_has_assignment(p_organization_id uuid, p_table_id uuid)
returns boolean
language sql
stable
set search_path to 'pg_catalog'
as $$
  select (select count(distinct f.data ->> 'key')
            from custom.record f
           where f.organization_id = p_organization_id
             and f.table_id = custom.field_kernel_id()
             and f.deleted_at is null
             and nullif(f.data ->> 'entity_definition_id', '')::uuid = p_table_id
             and (f.data ->> 'key') in ('assignee', 'due_date', 'status')) = 3;
$$;

-- THE VERB. A Table TAKES the kernel assignment fields.
--   · it is idempotent — taking twice reports `taken: false` and writes nothing;
--   · it declares the workflow-state Table the `status` Field is required by FLD-5 to point
--     at, homed on the Table it serves;
--   · it appends the three names to the Table's own `fields` list, because
--     `custom._field_shape_guard` refuses a definition for a field the Table never declared
--     (REC-1 / FLD-8: one source of truth, both ways);
--   · it COUNTS ITS ROWS in the sentence it returns (`V1-STORE-FIXES` finding 3).
create or replace function custom.work_take_assignment(p_organization_id uuid, p_table_id uuid)
returns jsonb
language plpgsql
set search_path to 'pg_catalog'
as $$
declare
  v_table    custom.record;
  v_slug     text;
  v_states   uuid;
  v_names    jsonb;
  v_missing  text[] := '{}';
  v_field    record;
  v_state    record;
  v_id       uuid;
  v_fields   jsonb := '[]'::jsonb;
  v_n_states integer := 0;
  v_n_fields integer := 0;
  v_t0       timestamptz := clock_timestamp();
begin
  perform custom.assert_store_door(p_organization_id, 'custom.work_take_assignment');

  select r.* into v_table
    from custom.record r
   where r.organization_id = p_organization_id
     and r.id = p_table_id
     and r.table_id = custom.table_kernel_id()
     and r.deleted_at is null;
  if v_table.id is null then
    raise exception 'that table is not in this organization'
      using errcode = '23503',
            hint = 'REC-69: the assignment fields are taken BY a Table, and the Table is named by its record id.';
  end if;
  if coalesce(v_table.data ->> 'type', '') = 'detail' then
    raise exception 'a detail table cannot take the assignment fields'
      using errcode = '23514',
            hint = 'REC-11 / REC-69: a detail table''s records inherit only. Whose turn it is belongs to the entity the detail hangs off.';
  end if;

  if custom.work_has_assignment(p_organization_id, p_table_id) then
    return jsonb_build_object(
      'table_id', p_table_id, 'taken', false,
      'reason', 'this table already holds the assignment fields',
      'fields', 3, 'states_created', 0, 'fields_created', 0,
      'ms', round(extract(epoch from (clock_timestamp() - v_t0)) * 1000, 1));
  end if;

  -- The workflow-state Table. Homed on the Table it serves, so it travels with it.
  v_slug := left(coalesce(v_table.data ->> 'slug', 'table'), 40) || '_work_state';
  select r.id into v_states
    from custom.record r
   where r.organization_id = p_organization_id
     and r.table_id = custom.table_kernel_id()
     and r.data ->> 'slug' = v_slug
     and r.deleted_at is null
   limit 1;

  if v_states is null then
    insert into custom.record (organization_id, table_id, data_class, data)
    values (p_organization_id, custom.table_kernel_id(), 'table', jsonb_build_object(
      'name',           coalesce(v_table.data ->> 'name', 'Table') || ' — workflow state',
      'slug',           v_slug,
      'type',           'entity',
      'label_singular', 'State',
      'label_plural',   'States',
      'title_field',    'name',
      'display',        'list',
      'weight',         'light',
      'ordered',        true,
      'row_order',      'sorted',
      'default_sort',   jsonb_build_array(jsonb_build_object('field', 'sort', 'direction', 'asc')),
      'agent_writable', false,
      'retention_days', 365,
      'work_kind',      'state',
      'fields', jsonb_build_array(jsonb_build_object('name', 'name'),
                                  jsonb_build_object('name', 'sort'),
                                  jsonb_build_object('name', 'terminal'),
                                  jsonb_build_object('name', 'next')),
      'parent_id',      p_table_id::text))
    returning id into v_states;

    for v_state in select * from custom.work_states() order by sort loop
      insert into custom.record (organization_id, table_id, data_class, data)
      values (p_organization_id, v_states, 'record',
              jsonb_build_object('name', v_state.name, 'sort', v_state.sort,
                                 'terminal', v_state.terminal,
                                 'next', to_jsonb(v_state.next)));
      v_n_states := v_n_states + 1;
    end loop;
  end if;

  -- REC-1 / FLD-8, both ways: the Table declares the field names, the definitions define them.
  v_names := coalesce(v_table.data -> 'fields', '[]'::jsonb);
  for v_field in select * from custom.work_assignment_fields(v_states) loop
    if not exists (select 1 from jsonb_array_elements(v_names) f where f ->> 'name' = v_field.key) then
      v_names := v_names || jsonb_build_array(jsonb_build_object('name', v_field.key));
      v_missing := v_missing || v_field.key;
    end if;
  end loop;
  if array_length(v_missing, 1) is not null then
    update custom.record r
       set data = r.data || jsonb_build_object('fields', v_names)
     where r.organization_id = p_organization_id and r.id = p_table_id;
  end if;

  for v_field in select * from custom.work_assignment_fields(v_states) loop
    if exists (select 1 from custom.record f
                where f.organization_id = p_organization_id
                  and f.table_id = custom.field_kernel_id()
                  and f.deleted_at is null
                  and nullif(f.data ->> 'entity_definition_id', '')::uuid = p_table_id
                  and f.data ->> 'key' = v_field.key) then
      continue;
    end if;
    insert into custom.record (organization_id, table_id, data_class, data)
    values (p_organization_id, custom.field_kernel_id(), 'field',
            v_field.spec || jsonb_build_object('entity_definition_id', p_table_id::text))
    returning id into v_id;
    v_fields := v_fields || jsonb_build_array(jsonb_build_object('key', v_field.key, 'id', v_id));
    v_n_fields := v_n_fields + 1;
  end loop;

  return jsonb_build_object(
    'table_id',        p_table_id,
    'taken',           true,
    'state_table_id',  v_states,
    'states_created',  v_n_states,
    'fields_created',  v_n_fields,
    'fields',          v_fields,
    'declared_on_table', to_jsonb(v_missing),
    'ms', round(extract(epoch from (clock_timestamp() - v_t0)) * 1000, 1));
end
$$;

-- WHOSE TURN IS IT — ONE QUERY. This is REC-69's whole point: the answer is the same shape
-- for every Table that took the kernel fields, and no Table re-invents it.
--   `turn`   — the person the record is waiting on, or `nobody` when it is finished, or
--              `unassigned` when it is waiting on somebody being chosen.
--   `state`  — overdue / due_today / scheduled / undated / finished.
-- The three reads are the promoted paths `custom.promoted_index_expr` builds over, so a Table
-- whose Fields were promoted answers this through its own indexes.
create or replace function custom.work_whose_turn(p_organization_id uuid, p_table_id uuid,
                                                  p_include_finished boolean default false)
returns table (record_id uuid, title text, assignee_id uuid, turn text,
               due_on timestamptz, state text, status text, terminal boolean)
language sql
stable
set search_path to 'pg_catalog'
as $$
  select r.id,
         r.data ->> coalesce((select t.data ->> 'title_field'
                                from custom.record t
                               where t.organization_id = p_organization_id
                                 and t.id = p_table_id), 'name'),
         nullif(r.data ->> 'assignee', '')::uuid,
         case when coalesce((s.data ->> 'terminal')::boolean, false) then 'nobody'
              when p.id is null then 'unassigned'
              else coalesce(nullif(p.data ->> 'name', ''), p.id::text) end,
         nullif(r.data ->> 'due_date', '')::timestamptz,
         case when coalesce((s.data ->> 'terminal')::boolean, false) then 'finished'
              when nullif(r.data ->> 'due_date', '') is null                       then 'undated'
              when (r.data ->> 'due_date')::timestamptz <  date_trunc('day', now()) then 'overdue'
              when (r.data ->> 'due_date')::timestamptz <  date_trunc('day', now()) + interval '1 day'
                                                                                   then 'due_today'
              else 'scheduled' end,
         s.data ->> 'name',
         coalesce((s.data ->> 'terminal')::boolean, false)
    from custom.record r
    left join custom.record p
      on p.organization_id = r.organization_id
     and p.id = nullif(r.data ->> 'assignee', '')::uuid
     and p.table_id = custom.person_kernel_id()
     and p.deleted_at is null
    left join custom.record s
      on s.organization_id = r.organization_id
     and s.id = nullif(r.data ->> 'status', '')::uuid
     and s.deleted_at is null
   where r.organization_id = p_organization_id
     and r.table_id = p_table_id
     and r.deleted_at is null
     and (p_include_finished or not coalesce((s.data ->> 'terminal')::boolean, false))
   order by case when coalesce((s.data ->> 'terminal')::boolean, false) then 2
                 when nullif(r.data ->> 'due_date', '') is null then 1 else 0 end,
            nullif(r.data ->> 'due_date', '')::timestamptz nulls last,
            r.created_at;
$$;

-- THE TRANSITION MODEL, read out of the state records themselves. It answers NULL when the
-- move is allowed and the refusal's own sentence when it is not, so the guard below and any
-- caller that wants to ASK before it writes get the same answer from one place.
--
-- A state record that declares no `next` at all says nothing about transitions, and nothing
-- is what it is enforced as — that is the case of an organization that built its own state
-- Table by hand and never declared a workflow. `custom.work_take_assignment` always writes
-- `next`, so every Table that took the kernel fields has a model.
create or replace function custom.work_transition_refusal(p_organization_id uuid,
                                                          p_from_state_id uuid, p_to_state_id uuid)
returns text
language plpgsql
stable
set search_path to 'pg_catalog'
as $$
declare
  v_from custom.record;
  v_to   custom.record;
begin
  if p_from_state_id is null or p_to_state_id is null or p_from_state_id = p_to_state_id then
    return null;
  end if;
  select * into v_from from custom.record r
   where r.organization_id = p_organization_id and r.id = p_from_state_id and r.deleted_at is null;
  select * into v_to   from custom.record r
   where r.organization_id = p_organization_id and r.id = p_to_state_id   and r.deleted_at is null;
  if v_from.id is null or v_to.id is null then
    return null;                      -- `custom.validate_values` already refuses a non-option.
  end if;
  if jsonb_typeof(v_from.data -> 'next') is distinct from 'array' then
    return null;                      -- this state declares no model, so it forbids nothing.
  end if;
  if (v_from.data -> 'next') ? (v_to.data ->> 'name') then
    return null;
  end if;
  return format('%s cannot go straight to %s. From %s it can go to %s.',
                v_from.data ->> 'name', v_to.data ->> 'name', v_from.data ->> 'name',
                coalesce(nullif((select string_agg(x #>> '{}', ' or ' order by x #>> '{}')
                                   from jsonb_array_elements(v_from.data -> 'next') x), ''),
                         'nowhere - it is finished'));
end
$$;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- 2. REC-70 — THE TEMPLATE RECORD AND ITS ONE ATOMIC, LOGGED INSTANTIATION.
-- ════════════════════════════════════════════════════════════════════════════════════════

-- The relation kinds a template may ask for TODAY. `owned` is what `custom.relation_own`
-- writes; `referenced` is named and refused, because W1-REL has not built it and an owned
-- edge written where a referenced one was asked for is precisely the silent wrong answer.
create or replace function custom.work_relation_kinds()
returns table (kind text, available boolean, why text)
language sql
immutable
parallel safe
set search_path to 'pg_catalog'
as $$
  select * from (values
    ('owned', true,
     'custom.relation_own writes the containment edge and the carrying relation row in one transaction.'),
    ('referenced', false,
     'a referenced relation does not contain its target, and this store has no verb for one yet - W1-REL (REL-*) owns it. Asking for one is refused rather than written as an owned edge.')
  ) v(kind, available, why);
$$;

-- The refusal a badly shaped template graph earns, as TEXT, so the shape guard and the verb
-- give the same answer and neither can drift from the other.
create or replace function custom.work_template_refusal(p_graph jsonb)
returns text
language plpgsql
immutable
set search_path to 'pg_catalog'
as $$
declare
  v_nodes jsonb;
  v_rels  jsonb;
  v_node  jsonb;
  v_rel   jsonb;
  v_refs  text[] := '{}';
  v_ref   text;
begin
  if p_graph is null or jsonb_typeof(p_graph) <> 'object' then
    return 'a template carries a graph, and this one carries a ' || coalesce(jsonb_typeof(p_graph), 'nothing') || '.';
  end if;

  v_nodes := p_graph -> 'nodes';
  if jsonb_typeof(v_nodes) is distinct from 'array' or jsonb_array_length(v_nodes) = 0 then
    return 'a template has to say which records it creates, as a list of at least one.';
  end if;

  for v_node in select e from jsonb_array_elements(v_nodes) e loop
    v_ref := v_node ->> 'ref';
    if v_ref is null or v_ref !~ '^[a-z][a-z0-9_]*$' then
      return format('every record in a template needs a name made of lower-case letters, digits and underscores, and one says %s.',
                    coalesce(v_ref, 'nothing'));
    end if;
    if v_ref = any (v_refs) then
      return format('the template names %s twice, and each record in it is named once.', v_ref);
    end if;
    v_refs := v_refs || v_ref;
    if nullif(v_node ->> 'table', '') is null then
      return format('%s does not say which table its record belongs to.', v_ref);
    end if;
    if (v_node ->> 'table') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return format('%s names a table that is not an id at all.', v_ref);
    end if;
    if v_node ? 'data' and jsonb_typeof(v_node -> 'data') <> 'object' then
      return format('%s carries a document that is not a document.', v_ref);
    end if;
  end loop;

  v_rels := coalesce(p_graph -> 'relations', '[]'::jsonb);
  if jsonb_typeof(v_rels) <> 'array' then
    return 'a template carries its relations as a list, even an empty one.';
  end if;
  for v_rel in select e from jsonb_array_elements(v_rels) e loop
    if not exists (select 1 from custom.work_relation_kinds() k
                    where k.kind = coalesce(v_rel ->> 'kind', 'owned') and k.available) then
      return format('this template asks for a %s relation. %s',
                    coalesce(v_rel ->> 'kind', 'nothing'),
                    coalesce((select k.why from custom.work_relation_kinds() k
                               where k.kind = coalesce(v_rel ->> 'kind', 'owned')),
                             'A relation in a template is owned, and nothing else yet.'));
    end if;
    if not (coalesce(v_rel ->> 'from', '') = any (v_refs)) then
      return format('a relation starts at %s, and the template has no record by that name.',
                    coalesce(nullif(v_rel ->> 'from', ''), 'nothing'));
    end if;
    if not (coalesce(v_rel ->> 'to', '') = any (v_refs)) then
      return format('a relation ends at %s, and the template has no record by that name.',
                    coalesce(nullif(v_rel ->> 'to', ''), 'nothing'));
    end if;
    if (v_rel ->> 'from') = (v_rel ->> 'to') then
      return 'this would put it inside itself';
    end if;
  end loop;

  return null;
end
$$;

-- A Template IS a record of the store (data_class `work_template`, no Table of its own — the
-- same shape `custom.relation_own` already writes its edges in).
create or replace function custom.work_template_declare(p_organization_id uuid, p_name text, p_graph jsonb)
returns uuid
language plpgsql
set search_path to 'pg_catalog'
as $$
declare
  v_id uuid;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.work_template_declare');
  if p_organization_id is null then
    raise exception 'custom.work_template_declare: organization_id is required - the store is keyed (organization_id, id)'
      using errcode = '22004';
  end if;
  insert into custom.record (organization_id, table_id, data_class, data)
  values (p_organization_id, null, 'work_template',
          jsonb_build_object('name', coalesce(nullif(btrim(p_name), ''), 'Template'),
                             'graph', coalesce(p_graph, '{}'::jsonb)))
  returning id into v_id;
  return v_id;
end
$$;

-- THE ONE ATOMIC, LOGGED ACT.
--
-- ATOMICITY IS THE STATEMENT'S, NOT A CLAIM OF THIS FUNCTION'S. Every row below — the nodes,
-- the containment edges, the relation rows, the log — is written inside one `select`, so a
-- refusal anywhere unwinds all of it and the store holds zero rows from the attempt. That is
-- what the proof counts, and it is why this function catches NOTHING: an exception handler
-- here would open a subtransaction and could leave part of a graph standing.
create or replace function custom.work_template_instantiate(p_organization_id uuid, p_template_id uuid,
                                                            p_overrides jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
set search_path to 'pg_catalog'
as $$
declare
  v_tpl     custom.record;
  v_graph   jsonb;
  v_why     text;
  v_node    jsonb;
  v_rel     jsonb;
  v_map     jsonb := '{}'::jsonb;
  v_ids     uuid[] := '{}';
  v_redges  uuid[] := '{}';
  v_id      uuid;
  v_data    jsonb;
  v_log     uuid;
  v_t0      timestamptz := clock_timestamp();
begin
  perform custom.assert_store_door(p_organization_id, 'custom.work_template_instantiate');

  select r.* into v_tpl
    from custom.record r
   where r.organization_id = p_organization_id
     and r.id = p_template_id
     and r.data_class = 'work_template'
     and r.deleted_at is null;
  if v_tpl.id is null then
    raise exception 'that template is not in this organization'
      using errcode = '23503', hint = 'REC-70: a Template is a Record of this store.';
  end if;

  v_graph := v_tpl.data -> 'graph';
  v_why := custom.work_template_refusal(v_graph);
  if v_why is not null then
    raise exception '%', v_why
      using errcode = '23514',
            hint = 'REC-70: the whole graph is created in one act, so it is judged before any of it is written.';
  end if;

  -- 1. The records. Every one through the store's own guards; the first refusal ends the
  --    statement and nothing survives it.
  for v_node in select e from jsonb_array_elements(v_graph -> 'nodes') e loop
    v_data := coalesce(v_node -> 'data', '{}'::jsonb)
              || coalesce(p_overrides -> (v_node ->> 'ref'), '{}'::jsonb);
    insert into custom.record (organization_id, table_id, data_class, data)
    values (p_organization_id, (v_node ->> 'table')::uuid, 'record', v_data)
    returning id into v_id;
    v_map := v_map || jsonb_build_object(v_node ->> 'ref', v_id);
    v_ids := v_ids || v_id;
  end loop;

  -- 2. The relations, through the ONE verb the store already offers for owned/contained
  --    records. W1-REL is not built and this does not build it.
  for v_rel in select e from jsonb_array_elements(coalesce(v_graph -> 'relations', '[]'::jsonb)) e loop
    v_redges := v_redges || custom.relation_own(p_organization_id,
                                                (v_map ->> (v_rel ->> 'from'))::uuid,
                                                (v_map ->> (v_rel ->> 'to'))::uuid);
  end loop;

  -- 3. The log. A STAND-IN for W3-HIST and it says so in its own row.
  insert into custom.record (organization_id, table_id, data_class, data)
  values (p_organization_id, null, 'work_instantiation', jsonb_build_object(
    'template_id',  p_template_id,
    'template',     v_tpl.data ->> 'name',
    'at',           to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'actor',        custom.caller_role(),
    'records',      to_jsonb(v_ids),
    'relations',    to_jsonb(v_redges),
    'record_count', cardinality(v_ids),
    'relation_count', cardinality(v_redges),
    'stand_in_for', 'W3-HIST (HIS-*): until the history store lands, this row IS the log of the act.'))
  returning id into v_log;

  return jsonb_build_object(
    'template_id',      p_template_id,
    'instantiation_id', v_log,
    'records_created',  cardinality(v_ids),
    'relations_created', cardinality(v_redges),
    'relation_kind',    'owned',
    'refs',             v_map,
    'records',          to_jsonb(v_ids),
    'relations',        to_jsonb(v_redges),
    'ms', round(extract(epoch from (clock_timestamp() - v_t0)) * 1000, 1));
end
$$;

-- THE SHAPE OF A GRAPH, so "the instance's ids differ from the template's while its shape
-- matches" (C-44) is a COMPARISON rather than an eyeball. Both readers answer the same
-- document: how many records of each Table, and which Table-to-Table edges carry them.
create or replace function custom.work_template_shape(p_organization_id uuid, p_template_id uuid)
returns jsonb
language sql
stable
set search_path to 'pg_catalog'
as $$
  with g as (select r.data -> 'graph' as graph from custom.record r
              where r.organization_id = p_organization_id and r.id = p_template_id
                and r.data_class = 'work_template'),
  n as (select e ->> 'ref' as ref, (e ->> 'table')::uuid as tbl
          from g, jsonb_array_elements(g.graph -> 'nodes') e),
  e as (select (select tbl from n where n.ref = r ->> 'from') as src,
               (select tbl from n where n.ref = r ->> 'to')   as dst,
               coalesce(r ->> 'kind', 'owned') as kind
          from g, jsonb_array_elements(coalesce(g.graph -> 'relations', '[]'::jsonb)) r)
  select jsonb_build_object(
    'tables', coalesce((select jsonb_agg(x order by x ->> 'table')
                          from (select jsonb_build_object('table', tbl::text, 'records', count(*)) x
                                  from n group by tbl) t), '[]'::jsonb),
    'edges',  coalesce((select jsonb_agg(x order by x ->> 'from', x ->> 'to')
                          from (select jsonb_build_object('from', src::text, 'to', dst::text,
                                                          'kind', kind, 'n', count(*)) x
                                  from e group by src, dst, kind) t), '[]'::jsonb));
$$;

create or replace function custom.work_instantiation_shape(p_organization_id uuid, p_instantiation_id uuid)
returns jsonb
language sql
stable
set search_path to 'pg_catalog'
as $$
  with l as (select r.data as d from custom.record r
              where r.organization_id = p_organization_id and r.id = p_instantiation_id
                and r.data_class = 'work_instantiation'),
  n as (select rec.id, rec.table_id as tbl
          from l, jsonb_array_elements_text(l.d -> 'records') x
          join custom.record rec
            on rec.organization_id = p_organization_id and rec.id = x::uuid),
  e as (select (select tbl from n where n.id = (er.data ->> 'from')::uuid) as src,
               (select tbl from n where n.id = (er.data ->> 'to')::uuid)   as dst,
               er.data ->> 'kind' as kind
          from l, jsonb_array_elements_text(l.d -> 'relations') y
          join custom.record er
            on er.organization_id = p_organization_id and er.id = y::uuid)
  select jsonb_build_object(
    'tables', coalesce((select jsonb_agg(x order by x ->> 'table')
                          from (select jsonb_build_object('table', tbl::text, 'records', count(*)) x
                                  from n group by tbl) t), '[]'::jsonb),
    'edges',  coalesce((select jsonb_agg(x order by x ->> 'from', x ->> 'to')
                          from (select jsonb_build_object('from', src::text, 'to', dst::text,
                                                          'kind', kind, 'n', count(*)) x
                                  from e group by src, dst, kind) t), '[]'::jsonb));
$$;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- 3. REC-71 — THE SLOT HOLD.
-- ════════════════════════════════════════════════════════════════════════════════════════

-- The name the loser of a collision reads. It is `W1-INDEX`'s function, not this lane's — so
-- a caller that wants to NAME the constraint before it meets it reads the same string the
-- database will quote.
--
-- 🚨 IT IS THE PARENT'S NAME, AND WHAT POSTGRES QUOTES IS THE PARTITION CHILD'S. `custom.record`
--    is hash-partitioned sixteen ways, so REC-N-12's index is a partitioned index whose children
--    `custom.promote_field` renames to `<parent>_NN` — and the duplicate-key refusal names the
--    CHILD the row landed in (measured here 2026-09-18: `cpu_slot_key_49538c6408_10`). So this
--    function answers the PREFIX every one of those names begins with, which is the stable thing
--    a caller can match on; the refusal itself always carries the exact name, taken from
--    Postgres's own diagnostics.
create or replace function custom.work_slot_index_name(p_table_id uuid)
returns text
language sql
stable
parallel safe
set search_path to 'pg_catalog'
as $$
  select custom.promoted_index_name(p_table_id, 'slot_key', true);
$$;

-- DECLARE A SLOT TABLE. Three Fields; `slot_key` is the unique, promoted one, so REC-N-12's
-- index is what decides a double-book.
--
-- IT REFUSES OUT LOUD WHEN PROMOTION IS SWITCHED OFF, with the key and the remedy, rather
-- than declaring a Table whose slot_key is not actually unique — which would be a booking
-- system that silently double-books (law 4).
create or replace function custom.work_slots_declare(p_organization_id uuid, p_name text, p_slug text,
                                                     p_home_id uuid default null)
returns jsonb
language plpgsql
set search_path to 'pg_catalog'
as $$
declare
  v_on    boolean;
  v_table uuid;
  v_field uuid;
  v_home  uuid := coalesce(p_home_id, custom.table_kernel_id());
  v_promo jsonb;
  v_t0    timestamptz := clock_timestamp();
begin
  perform custom.assert_store_door(p_organization_id, 'custom.work_slots_declare');

  begin
    v_on := coalesce((platform.knob_resolve('custom', 'field_index_guard', p_organization_id) #>> '{}')::boolean, false);
  exception when others then
    v_on := false;
  end;
  if not v_on then
    raise exception 'slots cannot be declared here yet: the database cannot be asked to decide a double-booking'
      using errcode = '0A000',
            hint = 'REC-71 / REC-N-12: a slot is kept single by a UNIQUE index on its key, and custom/field_index_guard resolves false for this organization, so no index can be built. Nothing was created. Turn the guard on (the switch checklist does it) and declare the slots again.';
  end if;

  if p_slug is null or p_slug !~ '^[a-z][a-z0-9_]*$' then
    raise exception 'a slot table needs a slug made of lower-case letters, digits and underscores, and this one says %',
                    coalesce(p_slug, 'nothing')
      using errcode = '23514', hint = 'REC-66: slug.';
  end if;

  insert into custom.record (organization_id, table_id, data_class, data)
  values (p_organization_id, custom.table_kernel_id(), 'table', jsonb_build_object(
    'name',           coalesce(nullif(btrim(p_name), ''), 'Slots'),
    'slug',           p_slug,
    'type',           'entity',
    'label_singular', 'Hold',
    'label_plural',   'Holds',
    'title_field',    'slot_key',
    'display',        'page',
    'weight',         'light',
    'ordered',        false,
    'row_order',      'sorted',
    'default_sort',   jsonb_build_array(jsonb_build_object('field', 'expires_at', 'direction', 'asc')),
    'agent_writable', false,
    'retention_days', 365,
    'work_kind',      'slot',
    'fields', jsonb_build_array(jsonb_build_object('name', 'slot_key'),
                                jsonb_build_object('name', 'holder'),
                                jsonb_build_object('name', 'expires_at')),
    'parent_id',      v_home::text))
  returning id into v_table;

  insert into custom.record (organization_id, table_id, data_class, data)
  values (p_organization_id, custom.field_kernel_id(), 'field', jsonb_build_object(
    'key', 'slot_key', 'label', 'Slot', 'sort', 10, 'type', 'text',
    'multi', false, 'dated', false, 'required', true, 'source', 'manual',
    'config', '{}'::jsonb, 'rules', '[]'::jsonb, 'depends_on', '[]'::jsonb,
    'source_config', '{}'::jsonb, 'sensitivity', 'internal',
    'context_policy', 'include', 'applies_to_types', '[]'::jsonb,
    'promoted', true, 'unique', true, 'entity_definition_id', v_table::text))
  returning id into v_field;

  insert into custom.record (organization_id, table_id, data_class, data)
  values (p_organization_id, custom.field_kernel_id(), 'field', jsonb_build_object(
    'key', 'holder', 'label', 'Held by', 'sort', 20, 'type', 'text',
    'multi', false, 'dated', false, 'required', true, 'source', 'manual',
    'config', '{}'::jsonb, 'rules', '[]'::jsonb, 'depends_on', '[]'::jsonb,
    'source_config', '{}'::jsonb, 'sensitivity', 'internal',
    'context_policy', 'include', 'applies_to_types', '[]'::jsonb,
    'promoted', false, 'entity_definition_id', v_table::text));

  insert into custom.record (organization_id, table_id, data_class, data)
  values (p_organization_id, custom.field_kernel_id(), 'field', jsonb_build_object(
    'key', 'expires_at', 'label', 'Held until', 'sort', 30, 'type', 'range',
    'parity_type', 'datetime', 'config', jsonb_build_object('kind', 'datetime'),
    'multi', false, 'dated', false, 'required', true, 'source', 'manual',
    'rules', '[]'::jsonb, 'depends_on', '[]'::jsonb,
    'source_config', '{}'::jsonb, 'sensitivity', 'internal',
    'context_policy', 'include', 'applies_to_types', '[]'::jsonb,
    'promoted', false, 'entity_definition_id', v_table::text));

  -- REC-N-12's index, built by W1-INDEX's own verb. `promote_field` cannot be called from
  -- inside a query that is itself scanning `custom.record` (measured by W1-INDEX), which is
  -- why the Field's id came back from its own INSERT above rather than from a sub-select.
  v_promo := custom.promote_field(p_organization_id, v_table, v_field);

  return jsonb_build_object(
    'table_id',      v_table,
    'slot_field_id', v_field,
    'index_name',    v_promo ->> 'index_name',
    'unique',        (v_promo ->> 'unique')::boolean,
    'fields_created', 3,
    'records_created', 0,
    'ms', round(extract(epoch from (clock_timestamp() - v_t0)) * 1000, 1));
end
$$;

-- THE SWEEP. An expired hold is soft-deleted, which takes it out of the unique index's own
-- partial predicate (`deleted_at is null`) and frees the slot. It returns how many it let go.
create or replace function custom.work_slot_expire(p_organization_id uuid, p_table_id uuid)
returns integer
language plpgsql
set search_path to 'pg_catalog'
as $$
declare v_n integer;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.work_slot_expire');
  update custom.record r
     set deleted_at = now()
   where r.organization_id = p_organization_id
     and r.table_id = p_table_id
     and r.deleted_at is null
     and nullif(r.data ->> 'expires_at', '') is not null
     and (r.data ->> 'expires_at')::timestamptz <= now();
  get diagnostics v_n = row_count;
  return v_n;
end
$$;

-- TAKE A HOLD. The expiry sweep and the insert are one statement, so two callers racing for
-- one slot both sweep and both insert — and REC-N-12's index decides, by name.
create or replace function custom.work_slot_hold(p_organization_id uuid, p_table_id uuid,
                                                 p_slot_key text, p_holder text,
                                                 p_ttl interval default interval '15 minutes')
returns jsonb
language plpgsql
set search_path to 'pg_catalog'
as $$
declare
  v_id      uuid;
  v_expired integer;
  v_until   timestamptz := now() + coalesce(p_ttl, interval '15 minutes');
  v_con     text;
  v_t0      timestamptz := clock_timestamp();
begin
  perform custom.assert_store_door(p_organization_id, 'custom.work_slot_hold');
  if coalesce(p_ttl, interval '15 minutes') <= interval '0' then
    raise exception 'a hold that has already expired is not a hold'
      using errcode = '22023', hint = 'REC-71: a slot hold is a reservation WITH an expiry, and the expiry is in the future.';
  end if;

  v_expired := custom.work_slot_expire(p_organization_id, p_table_id);

  begin
    insert into custom.record (organization_id, table_id, data_class, data)
    values (p_organization_id, p_table_id, 'record', jsonb_build_object(
      'slot_key',   p_slot_key,
      'holder',     p_holder,
      'expires_at', to_char(v_until at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))
    returning id into v_id;
  exception when unique_violation then
    -- THE DATABASE DECIDED IT, AND WHAT IT DECIDED WITH IS QUOTED BACK. The name comes from
    -- Postgres's own diagnostics, never from a string this function built, so a hold refused
    -- by anything other than REC-N-12's index cannot wear its name.
    get stacked diagnostics v_con = constraint_name;
    raise exception 'the slot % is already held, and the database refused this hold by %',
                    p_slot_key, coalesce(v_con, 'a constraint it did not name')
      using errcode = '23505',
            hint = 'REC-71 / REC-N-12: one hold per slot is a UNIQUE index, not a check the application makes. Wait for the hold to expire or be released, then take it again.';
  end;

  return jsonb_build_object(
    'hold_id',      v_id,
    'slot_key',     p_slot_key,
    'holder',       p_holder,
    'expires_at',   v_until,
    'expired_swept', v_expired,
    'kept_single_by', custom.work_slot_index_name(p_table_id),
    'ms', round(extract(epoch from (clock_timestamp() - v_t0)) * 1000, 1));
end
$$;

-- RELEASE. Soft, like every delete in this store (REC-23), and it says whether it released
-- anything rather than answering silently.
create or replace function custom.work_slot_release(p_organization_id uuid, p_hold_id uuid)
returns boolean
language plpgsql
set search_path to 'pg_catalog'
as $$
declare v_n integer;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.work_slot_release');
  update custom.record r
     set deleted_at = now()
   where r.organization_id = p_organization_id
     and r.id = p_hold_id
     and r.deleted_at is null;
  get diagnostics v_n = row_count;
  return v_n = 1;
end
$$;

-- WHO HOLDS WHAT, right now. The live holds of one slot Table, expired ones excluded by the
-- same clock the sweep uses.
create or replace function custom.work_slot_holds(p_organization_id uuid, p_table_id uuid)
returns table (hold_id uuid, slot_key text, holder text, expires_at timestamptz, expired boolean)
language sql
stable
set search_path to 'pg_catalog'
as $$
  select r.id, r.data ->> 'slot_key', r.data ->> 'holder',
         nullif(r.data ->> 'expires_at', '')::timestamptz,
         coalesce((r.data ->> 'expires_at')::timestamptz <= now(), false)
    from custom.record r
   where r.organization_id = p_organization_id
     and r.table_id = p_table_id
     and r.deleted_at is null
   order by r.data ->> 'slot_key';
$$;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- 4. THE SHAPE GUARD — one trigger, and it reads its guard through the ONE predicate.
-- ════════════════════════════════════════════════════════════════════════════════════════
--
-- Every `RETURNS trigger` in schema `custom` opens with `custom.assert_store_door`, and this
-- one is no exception. The door is the FIRST statement: a closed store is a closed door, not
-- a quiet one, and nothing below is skipped while the switch is off.
--
-- WHY THE VERBS ARE NOT ENOUGH, said plainly: a shape enforced only inside
-- `custom.work_slot_hold` is a safe path beside an unsafe one. `insert into custom.record`
-- reaches the same rows. So the shape lives here, on the table, where every writer meets it.
create or replace function custom._work_shape_guard()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $$
declare
  d       jsonb := new.data;
  v_why   text;
  v_kind  text;
  v_until timestamptz;
begin
  -- THE DOOR. One call to the ONE predicate (`custom.assert_store_door`), which judges
  -- `custom.caller_role()` - the identity the caller actually held - and not `current_user`,
  -- which a SECURITY DEFINER door has already rewritten to itself.
  perform custom.assert_store_door(new.organization_id, 'custom.record');

  if new.data_class = 'work_template' then
    v_why := custom.work_template_refusal(d -> 'graph');
    if v_why is not null then
      raise exception '%', v_why
        using errcode = '23514',
              hint = 'REC-70: a template is judged when it is written, not when somebody runs it.';
    end if;
    return new;
  end if;

  if new.data_class = 'work_instantiation' then
    if nullif(d ->> 'template_id', '') is null
       or jsonb_typeof(d -> 'records') is distinct from 'array' then
      raise exception 'a record of an instantiation has to name its template and the records it made'
        using errcode = '23514',
              hint = 'REC-70: the act is logged, and a log that cannot say what it made is not one.';
    end if;
    return new;
  end if;

  if new.table_id is null or new.data_class in ('kernel', 'table', 'field', 'rule', 'relation', 'merge_field') then
    return new;
  end if;

  -- REC-69 — THE ACTION STATES. A move the model forbids is refused, naming both states and
  -- saying where the record CAN go instead. The cheap test is first: this costs a `jsonb ->>`
  -- on every write to the store and a query only on a write that actually moves a status.
  if tg_op = 'UPDATE'
     and nullif(new.data ->> 'status', '') is distinct from nullif(old.data ->> 'status', '')
     and nullif(old.data ->> 'status', '') is not null
     and nullif(new.data ->> 'status', '') is not null then
    v_why := custom.work_transition_refusal(new.organization_id,
                                            (old.data ->> 'status')::uuid,
                                            (new.data ->> 'status')::uuid);
    if v_why is not null then
      raise exception '%', v_why
        using errcode = '23514',
              hint = 'REC-69: the states a record can move to are declared on the state it is in. Change the state records if this organization works differently.';
    end if;
  end if;

  -- A HOLD. Its Table says so; nothing here guesses from a field name.
  select t.data ->> 'work_kind' into v_kind
    from custom.record t
   where t.organization_id = new.organization_id
     and t.id = new.table_id
     and t.table_id = custom.table_kernel_id()
     and t.deleted_at is null;
  if v_kind is distinct from 'slot' then
    return new;
  end if;

  if nullif(d ->> 'slot_key', '') is null then
    raise exception 'a hold has to say which slot it is on'
      using errcode = '23514', hint = 'REC-71: slot_key is what the unique index keeps single.';
  end if;
  if nullif(d ->> 'holder', '') is null then
    raise exception 'a hold has to say who is holding it'
      using errcode = '23514', hint = 'REC-71: a reservation nobody holds is not a reservation.';
  end if;
  begin
    v_until := (nullif(d ->> 'expires_at', ''))::timestamptz;
  exception when others then
    v_until := null;
  end;
  if v_until is null then
    raise exception 'a hold has to say when it runs out'
      using errcode = '23514',
            hint = 'REC-71: a slot hold is a reservation WITH an expiry - a hold with no expiry would keep the slot forever.';
  end if;
  if tg_op = 'INSERT' and v_until <= now() then
    raise exception 'a hold that has already expired is not a hold'
      using errcode = '22023', hint = 'REC-71: the expiry is in the future when the hold is taken.';
  end if;

  return new;
end
$$;

-- `zz_` so it fires AFTER every shape and envelope guard: a document that is not a legal
-- record should be refused for being illegal, not for the workflow state it was moved to.
-- Created BARE, with no `drop trigger if exists` above it: every DROP is refused by name in a
-- file whose header names production (JUDGMENT.md §4), which is why every sibling in this
-- campaign creates its trigger this way and leaves the dropping to the inverse. Re-application
-- is rule 27's down-then-up, never an up on top of an up.
create trigger zz_w3_work_shape_guard
  before insert or update on custom.record
  for each row execute function custom._work_shape_guard();
