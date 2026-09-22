-- chair-step: it GRANTS EXECUTE to `authenticated` on nine NEW functions of schema `custom`,
--   attaches TWO new row triggers to `custom.record` and creates ONE partial index on it. A
--   GRANT is the one shape this runner's allow-list refuses by name, and it is the point of the
--   file: without it there is no checklist anybody can reach from a browser. Every one of the
--   nine is SECURITY DEFINER and asks the one ladder first (`custom.assert_client_may_reach`,
--   then `custom.assert_client_may_open` / `custom.assert_client_may_change` on the subject);
--   every one that WRITES asks `custom.assert_store_door` before anything else, so the OFF
--   switch still closes it. The two triggers return on their first line for every row whose
--   `data_class` is not `record` (a class this file does not invent and does not change), and
--   the index is partial on `data_class = 'checklist_template'`, a class that did not exist
--   before this file. Nothing is dropped, nothing is revoked, no existing function is replaced
--   and no row of any feature is deleted or rewritten. The inverse is
--   `migrations/inverse/checklists_a_checklist_is_a_template_of_work_down.sql`.
-- guard: custom/system_enabled
--
-- LANE CHECKLISTS — PRODUCTS.md row 13, *"Every new hire gets these twelve steps."*
-- The primitive is P7, template instantiation (REC-70), over the one work layer (REC-69).
--
-- WHAT WAS ALREADY THERE, AND WHAT WAS NOT
-- ----------------------------------------
-- REC-70 shipped `custom.work_template_declare` / `custom.work_template_instantiate`: a
-- template is a graph of records-to-be, written in one atomic, logged act. REC-69 shipped
-- assignee, due date and status as kernel Fields any Table may take, plus the five states and
-- the moves the model allows. WORK-DOORS put both behind client doors and one inbox.
--
-- None of that is a CHECKLIST. Measured on the main database 2026-09-20, before this file:
--
--   * A template graph has no ORDER. `nodes` is a list and `relations` are containment edges;
--     nothing says step 4 comes after step 3, and nothing refuses step 4 while step 3 is open.
--   * A template names no OWNER. Every record it makes lands unassigned, so "twelve steps"
--     became twelve rows nobody was given and nobody was told about.
--   * A template names no WHEN. There is no due offset anywhere in the graph, so a run of it
--     produced twelve undated rows that the inbox sorts under `undated` forever.
--   * A step could not require anything. "Done" was a status change and nothing else — no
--     value, no note, no evidence, so a checklist could be closed with nothing in it.
--   * Nothing INSTANTIATED anything on its own. REC-50 stores templates; a person had to
--     remember to run one, which is exactly the thing an onboarding checklist exists to stop.
--
--   * And `@ai-matrx/records-ui`'s own `ChecklistRunner` kept its runs in a PACKAGE-OWNED
--     Table (`records_ui_checklist_run`) it seeded into each organization's store — the second
--     store beside the store, which this campaign forbids and which WORK-DOORS already removed
--     from `ActionInbox`. This file is the object it should have been calling.
--
-- THE SHAPE, AND IT IS RECORDS ALL THE WAY DOWN
-- ---------------------------------------------
-- A TEMPLATE is a record, `data_class = 'checklist_template'`, `table_id` null — the same
-- shape `work_template` and `work_approval` already use, so it inherits the organization wall,
-- the history capture, the soft delete and the retention rule with no second table to drift.
-- Its document:
--
--   name              what a person calls it
--   about_table_id    the Table a run is ABOUT (People, Hires, Jobs, Matters)
--   roles             [{role, label, user_id}] — the default person for each role
--   trigger           {kind: 'record_created'|'status_reached'|'manual', table_id, status}
--   steps             [{ref, title, role, due_days, depends_on[], requires{...}}]
--
--   requires.kind, and every one of them is CHECKED at completion, never decorative:
--     none          a person says it is done
--     note          a sentence of evidence (`evidence.note`)
--     answer        a named value (`key`, `label`) that must be filled in on the step
--     record_field  a Field on the record the run is about must hold a value
--     form          the step IS a form (`form_id`); completing it needs a response record
--     document      the step IS a document from a doc template (`template_id`); completing it
--                   needs a render of that template for this record
--
-- A RUN is a record, `data_class = 'checklist_run'`, `table_id` null: which template, which
-- record it is about, when it started, who started it, what started it, the steps it made, and
-- `closed_at` once every step is finished.
--
-- A STEP IS A REAL WORK ITEM. One record per step in the organization's `checklist_step`
-- Table, which takes the REC-69 assignment Fields on creation — so a step has an assignee, a
-- due date and one of the five states, appears in `custom.work_list('mine')` and therefore in
-- `custom.work_inbox`, can be commented on, shared, exported, historied and read by an agent,
-- exactly like every other row of this store. There is no checklist-shaped queue anywhere.
--
-- THE DEPENDENCY IS CLOSED, NOT GUARDED BESIDE. `custom.checklist_step_complete` is the
-- pleasant door, but the rule lives in a BEFORE trigger on `custom.record`: a step cannot
-- reach a terminal state while a step it depends on is open, or while what it requires is
-- missing — through `custom.work_set_state`, through `custom.record_update`, through anything.
-- A safe path beside an unsafe one is not a rule.
--
-- THE INVERSE: `migrations/inverse/checklists_a_checklist_is_a_template_of_work_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '600s';

-- ── the judgement, asked before anything is written ──────────────────────────────────────
create or replace function custom.checklist_refusal(p_spec jsonb)
returns text
language plpgsql
immutable
set search_path to 'pg_catalog'
as $$
declare
  v_steps jsonb;
  v_step  jsonb;
  v_roles jsonb;
  v_trig  jsonb;
  v_refs  text[] := '{}';
  v_known text[] := '{}';
  v_ref   text;
  v_dep   text;
  v_kind  text;
  v_i     integer := 0;
begin
  if p_spec is null or jsonb_typeof(p_spec) <> 'object' then
    return format('a checklist is described by a document, and this one is a %s.',
                  coalesce(jsonb_typeof(p_spec), 'nothing'));
  end if;
  if nullif(btrim(coalesce(p_spec ->> 'name', '')), '') is null then
    return 'a checklist needs a name, so the people running it know what they are running.';
  end if;
  if nullif(p_spec ->> 'about_table_id', '') is null then
    return 'a checklist has to say what it is about — the table whose records it runs for, like People or Hires.';
  end if;
  if (p_spec ->> 'about_table_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return 'the table this checklist is about is named by something that is not a table at all.';
  end if;

  v_roles := coalesce(p_spec -> 'roles', '[]'::jsonb);
  if jsonb_typeof(v_roles) <> 'array' then
    return 'the roles on a checklist are a list, even an empty one.';
  end if;
  for v_step in select e from jsonb_array_elements(v_roles) e loop
    v_ref := v_step ->> 'role';
    if v_ref is null or v_ref !~ '^[a-z][a-z0-9_]*$' then
      return format('every role needs a short name in lower-case letters, and one says %s.',
                    coalesce(v_ref, 'nothing'));
    end if;
    if v_ref = any (v_known) then
      return format('the role %s is named twice, and each role on a checklist is named once.', v_ref);
    end if;
    v_known := v_known || v_ref;
    if nullif(v_step ->> 'user_id', '') is not null
       and (v_step ->> 'user_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return format('the person standing in for %s is named by something that is not a person.', v_ref);
    end if;
  end loop;

  v_steps := p_spec -> 'steps';
  if jsonb_typeof(v_steps) is distinct from 'array' or jsonb_array_length(v_steps) = 0 then
    return 'a checklist is a list of at least one step, and this one has no steps.';
  end if;
  if jsonb_array_length(v_steps) > 200 then
    return 'a checklist runs up to two hundred steps; this one asks for more than that.';
  end if;

  for v_step in select e from jsonb_array_elements(v_steps) e loop
    v_i := v_i + 1;
    v_ref := v_step ->> 'ref';
    if v_ref is null or v_ref !~ '^[a-z][a-z0-9_]*$' then
      return format('step %s needs a short name in lower-case letters, digits and underscores, and it says %s.',
                    v_i, coalesce(v_ref, 'nothing'));
    end if;
    if v_ref = any (v_refs) then
      return format('the step %s appears twice, and each step of a checklist is named once.', v_ref);
    end if;
    if nullif(btrim(coalesce(v_step ->> 'title', '')), '') is null then
      return format('step %s has no title, so nobody reading their work would know what to do.', v_ref);
    end if;
    if v_step ? 'due_days' then
      if jsonb_typeof(v_step -> 'due_days') <> 'number' or (v_step ->> 'due_days')::numeric < 0
         or (v_step ->> 'due_days')::numeric > 3650 then
        return format('%s says it is due %s days in, and a due date is a whole number of days from the start, between none and ten years.',
                      v_ref, coalesce(v_step ->> 'due_days', 'nothing'));
      end if;
    end if;
    if nullif(v_step ->> 'role', '') is not null and not (v_step ->> 'role' = any (v_known)) then
      return format('%s is given to the %s role, and this checklist never says who that is.',
                    v_ref, v_step ->> 'role');
    end if;

    if v_step ? 'depends_on' then
      if jsonb_typeof(v_step -> 'depends_on') <> 'array' then
        return format('what %s waits for is a list of steps, even an empty one.', v_ref);
      end if;
      for v_dep in select e #>> '{}' from jsonb_array_elements(v_step -> 'depends_on') e loop
        if v_dep = v_ref then
          return format('%s waits for itself, so it could never start.', v_ref);
        end if;
        if not (v_dep = any (v_refs)) then
          return format('%s waits for %s, which does not come before it in this checklist. A step waits only for steps already listed above it — that is what keeps a checklist from waiting on itself in a circle.',
                        v_ref, coalesce(nullif(v_dep, ''), 'nothing'));
        end if;
      end loop;
    end if;

    if v_step ? 'requires' and jsonb_typeof(v_step -> 'requires') = 'object' then
      v_kind := coalesce(v_step #>> '{requires,kind}', 'none');
      if v_kind not in ('none', 'note', 'answer', 'record_field', 'form', 'document') then
        return format('%s asks for %s before it can be finished, and a step asks for one of: nothing, a note, an answer, a field on the record, a form, or a document.',
                      v_ref, v_kind);
      end if;
      if v_kind in ('answer', 'record_field') and nullif(v_step #>> '{requires,key}', '') is null then
        return format('%s needs something filled in before it is done, and it does not say what.', v_ref);
      end if;
      if v_kind = 'form' and nullif(v_step #>> '{requires,form_id}', '') is null then
        return format('%s is a form step and names no form.', v_ref);
      end if;
      if v_kind = 'document' and nullif(v_step #>> '{requires,template_id}', '') is null then
        return format('%s is a document step and names no document template.', v_ref);
      end if;
    elsif v_step ? 'requires' then
      return format('what %s requires is written as a document, like {"kind": "note"}.', v_ref);
    end if;

    v_refs := v_refs || v_ref;
  end loop;

  v_trig := coalesce(p_spec -> 'trigger', jsonb_build_object('kind', 'manual'));
  if jsonb_typeof(v_trig) <> 'object' then
    return 'what starts a run is written as a document, like {"kind": "record_created"}.';
  end if;
  v_kind := coalesce(v_trig ->> 'kind', 'manual');
  if v_kind not in ('manual', 'record_created', 'status_reached') then
    return format('a checklist starts by hand, when a new record arrives, or when a record reaches a state — and this one says %s.', v_kind);
  end if;
  if v_kind <> 'manual' then
    if nullif(v_trig ->> 'table_id', '') is null then
      return 'a checklist that starts on its own has to say which table it is watching.';
    end if;
    if (v_trig ->> 'table_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return 'the table this checklist watches is named by something that is not a table.';
    end if;
  end if;
  if v_kind = 'status_reached' and nullif(btrim(coalesce(v_trig ->> 'status', '')), '') is null then
    return 'a checklist that starts when a record reaches a state has to say which state.';
  end if;

  return null;
end
$$;

-- ── the one Table every step of every checklist is a row of ──────────────────────────────
create or replace function custom.checklist_steps_table(p_organization_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_id uuid;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.checklist_steps_table');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.checklist_steps_table');

  select r.id into v_id
    from custom.record r
   where r.organization_id = p_organization_id
     and r.table_id = custom.table_kernel_id()
     and r.data ->> 'slug' = 'checklist_step'
     and r.deleted_at is null
   limit 1;
  if v_id is not null then
    return v_id;
  end if;

  insert into custom.record (organization_id, table_id, data_class, data)
  values (p_organization_id, custom.table_kernel_id(), 'table', jsonb_build_object(
    'name',           'Checklist steps',
    'slug',           'checklist_step',
    'type',           'entity',
    'label_singular', 'Step',
    'label_plural',   'Steps',
    'title_field',    'title',
    'display',        'list',
    'weight',         'light',
    'ordered',        true,
    'row_order',      'sorted',
    'default_sort',   jsonb_build_array(jsonb_build_object('field', 'position', 'direction', 'asc')),
    'agent_writable', true,
    'retention_days', 3650,
    'work_kind',      'checklist_step',
    'fields', jsonb_build_array(jsonb_build_object('name', 'title'),
                                jsonb_build_object('name', 'position'))))
  returning id into v_id;

  -- REC-69 gives it Assignee, Due date and Status — the same three every other Table takes,
  -- so a step lands in `custom.work_list` and therefore in the one inbox with no second path.
  perform custom.work_take_assignment(p_organization_id, v_id);

  insert into custom.record (organization_id, table_id, data_class, data)
  select p_organization_id, custom.field_kernel_id(), 'field',
         v.spec || jsonb_build_object('entity_definition_id', v_id::text)
    from (values
      (jsonb_build_object('key', 'title', 'label', 'Step', 'sort', 10,
                          'type', 'text', 'parity_type', 'text',
                          'multi', false, 'dated', false, 'required', true,
                          'source', 'manual', 'config', '{}'::jsonb, 'rules', '[]'::jsonb,
                          'depends_on', '[]'::jsonb, 'source_config', '{}'::jsonb,
                          'sensitivity', 'internal', 'context_policy', 'include',
                          'applies_to_types', '[]'::jsonb, 'promoted', false, 'unique', false)),
      (jsonb_build_object('key', 'position', 'label', 'Order', 'sort', 20,
                          'type', 'number', 'parity_type', 'number',
                          'multi', false, 'dated', false, 'required', false,
                          'source', 'manual', 'config', '{}'::jsonb, 'rules', '[]'::jsonb,
                          'depends_on', '[]'::jsonb, 'source_config', '{}'::jsonb,
                          'sensitivity', 'internal', 'context_policy', 'include',
                          'applies_to_types', '[]'::jsonb, 'promoted', false, 'unique', false))
    ) v(spec);

  return v_id;
end
$$;

-- ── is this state the end of the line ────────────────────────────────────────────────────
create or replace function custom._checklist_finished(p_organization_id uuid, p_table_id uuid, p_status text)
returns boolean
language sql
stable
set search_path to 'pg_catalog'
as $$
  select coalesce((select (s.data ->> 'terminal')::boolean
                     from custom.record s
                    where s.organization_id = p_organization_id
                      and s.id = custom.work_state_id(p_organization_id, p_table_id, p_status)
                      and s.deleted_at is null), false);
$$;

-- ── why this step cannot be finished right now, in plain words ───────────────────────────
-- Takes the document EXPLICITLY so the BEFORE trigger can ask about the row as it is being
-- written, and the client door can ask about the row as it stands. One rule, two callers.
create or replace function custom._checklist_refusal_for(p_organization_id uuid, p_step_id uuid, p_data jsonb)
returns text
language plpgsql
stable
set search_path to 'pg_catalog'
as $$
declare
  v_ev      jsonb := coalesce(p_data -> 'evidence', '{}'::jsonb);
  v_req     jsonb := coalesce(p_data -> 'requires', '{}'::jsonb);
  v_kind    text  := coalesce(v_req ->> 'kind', 'none');
  v_waiting text[] := '{}';
  v_dep     uuid;
  v_title   text;
  v_about   uuid := nullif(p_data ->> 'about_record_id', '')::uuid;
  v_label   text;
begin
  for v_dep in select (e #>> '{}')::uuid from jsonb_array_elements(coalesce(p_data -> 'depends_on_ids', '[]'::jsonb)) e loop
    select r.data ->> 'title' into v_title
      from custom.record r
     where r.organization_id = p_organization_id
       and r.id = v_dep
       and r.deleted_at is null
       and not custom._checklist_finished(p_organization_id, r.table_id, r.data ->> 'status');
    if v_title is not null then
      v_waiting := v_waiting || v_title;
    end if;
    v_title := null;
  end loop;
  if array_length(v_waiting, 1) is not null then
    return format('%s is waiting on %s. Finish %s first.',
                  coalesce(p_data ->> 'title', 'This step'),
                  array_to_string(v_waiting, ', and on '),
                  case when array_length(v_waiting, 1) = 1 then 'that step' else 'those steps' end);
  end if;

  v_label := coalesce(nullif(v_req ->> 'label', ''), nullif(v_req ->> 'key', ''), 'it');

  if v_kind = 'note' then
    if nullif(btrim(coalesce(v_ev ->> 'note', '')), '') is null then
      return format('%s asks you to say what you did before it counts as done.',
                    coalesce(p_data ->> 'title', 'This step'));
    end if;
  elsif v_kind = 'answer' then
    if nullif(btrim(coalesce(v_ev ->> (v_req ->> 'key'), '')), '') is null then
      return format('%s needs %s filled in before it counts as done.',
                    coalesce(p_data ->> 'title', 'This step'), v_label);
    end if;
  elsif v_kind = 'record_field' then
    if v_about is null then
      return format('%s needs %s on the record this checklist is about, and this run is not about a record.',
                    coalesce(p_data ->> 'title', 'This step'), v_label);
    end if;
    if not exists (select 1 from custom.record r
                    where r.organization_id = p_organization_id
                      and r.id = v_about
                      and r.deleted_at is null
                      and nullif(btrim(coalesce(r.data ->> (v_req ->> 'key'), '')), '') is not null) then
      return format('%s needs %s filled in on the record this checklist is about before it counts as done.',
                    coalesce(p_data ->> 'title', 'This step'), v_label);
    end if;
  elsif v_kind = 'form' then
    if nullif(v_ev ->> 'record_id', '') is null
       or not exists (select 1 from custom.record r
                       where r.organization_id = p_organization_id
                         and r.id = (v_ev ->> 'record_id')::uuid
                         and r.deleted_at is null) then
      return format('%s is finished when somebody has answered its form. No answer has come in yet.',
                    coalesce(p_data ->> 'title', 'This step'));
    end if;
  elsif v_kind = 'document' then
    if nullif(v_ev ->> 'render_id', '') is null
       or not exists (select 1 from custom.record r
                       where r.organization_id = p_organization_id
                         and r.id = (v_ev ->> 'render_id')::uuid
                         and r.deleted_at is null) then
      return format('%s is finished when its document has been made. It has not been made yet.',
                    coalesce(p_data ->> 'title', 'This step'));
    end if;
  end if;

  return null;
end
$$;

create or replace function custom.checklist_step_refusal(p_organization_id uuid, p_step_id uuid)
returns text
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_row custom.record;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.checklist_step_refusal');
  perform custom.assert_client_may_open(p_organization_id, p_step_id,
                                        'custom.checklist_step_refusal',
                                        'viewer'::public.permission_level, 'step');
  select r.* into v_row from custom.record r
   where r.organization_id = p_organization_id and r.id = p_step_id and r.deleted_at is null;
  if v_row.id is null then
    raise exception 'There is no such step in this organization.' using errcode = '02000';
  end if;
  if custom._checklist_finished(p_organization_id, v_row.table_id, v_row.data ->> 'status') then
    return null;
  end if;
  return custom._checklist_refusal_for(p_organization_id, p_step_id, v_row.data);
end
$$;

-- ── the door that stores a checklist, and the one that changes it ────────────────────────
create or replace function custom.checklist_declare(p_organization_id uuid, p_spec jsonb,
                                         p_template_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_why    text;
  v_id     uuid;
  v_spec   jsonb;
  v_steps  uuid;
  v_about  uuid;
  v_trigt  uuid;
  v_t0     timestamptz := clock_timestamp();
begin
  perform custom.assert_store_door(p_organization_id, 'custom.checklist_declare');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.checklist_declare');
  if p_organization_id is null then
    raise exception 'custom.checklist_declare: organization_id is required - the store is keyed (organization_id, id)'
      using errcode = '22004';
  end if;

  v_spec := coalesce(p_spec, '{}'::jsonb);
  v_why := custom.checklist_refusal(v_spec);
  if v_why is not null then
    raise exception '%', v_why
      using errcode = '23514',
            hint = 'PRODUCTS row 13: a checklist is judged when it is written, so a run of it cannot be half a checklist.';
  end if;

  v_about := (v_spec ->> 'about_table_id')::uuid;
  -- Writing a checklist that runs against a table is a change to how that table is worked, so
  -- it asks the rung a change to that table asks.
  perform custom.assert_client_may_change(p_organization_id, v_about, 'custom.checklist_declare',
                                          'editor'::public.permission_level, 'table');
  if not exists (select 1 from custom.record r
                  where r.organization_id = p_organization_id and r.id = v_about
                    and r.table_id = custom.table_kernel_id() and r.deleted_at is null) then
    raise exception 'That table is not in this organization, so a checklist cannot be about it.'
      using errcode = '23503';
  end if;

  v_steps := custom.checklist_steps_table(p_organization_id);

  v_trigt := nullif(v_spec #>> '{trigger,table_id}', '')::uuid;
  if v_trigt is not null then
    if v_trigt = v_steps then
      raise exception 'A checklist cannot watch the table its own steps live in — every step it made would start another run of it.'
        using errcode = '23514';
    end if;
    perform custom.assert_client_may_change(p_organization_id, v_trigt, 'custom.checklist_declare',
                                            'editor'::public.permission_level, 'table');
    if not exists (select 1 from custom.record r
                    where r.organization_id = p_organization_id and r.id = v_trigt
                      and r.table_id = custom.table_kernel_id() and r.deleted_at is null) then
      raise exception 'That table is not in this organization, so a checklist cannot watch it.'
        using errcode = '23503';
    end if;
  end if;

  if p_template_id is null then
    insert into custom.record (organization_id, table_id, data_class, data)
    values (p_organization_id, null, 'checklist_template', v_spec)
    returning id into v_id;
  else
    perform custom.assert_client_may_change(p_organization_id, p_template_id,
                                            'custom.checklist_declare',
                                            'editor'::public.permission_level, 'checklist');
    if not exists (select 1 from custom.record r
                    where r.organization_id = p_organization_id and r.id = p_template_id
                      and r.data_class = 'checklist_template' and r.deleted_at is null) then
      raise exception 'There is no such checklist in this organization.' using errcode = '02000';
    end if;
    v_id := p_template_id;
    perform custom.record_update(p_organization_id, p_template_id, v_spec, null);
  end if;

  return jsonb_build_object(
    'template_id',    v_id,
    'name',           v_spec ->> 'name',
    'about_table_id', v_about,
    'steps_table_id', v_steps,
    'steps',          jsonb_array_length(v_spec -> 'steps'),
    'roles',          jsonb_array_length(coalesce(v_spec -> 'roles', '[]'::jsonb)),
    'trigger',        coalesce(v_spec -> 'trigger', jsonb_build_object('kind', 'manual')),
    'created',        p_template_id is null,
    'message',        format('%s has %s step%s, and it %s.',
                             v_spec ->> 'name',
                             jsonb_array_length(v_spec -> 'steps'),
                             case when jsonb_array_length(v_spec -> 'steps') = 1 then '' else 's' end,
                             case coalesce(v_spec #>> '{trigger,kind}', 'manual')
                               when 'record_created'  then 'starts on its own whenever a new record arrives'
                               when 'status_reached'  then format('starts on its own when a record reaches %s',
                                                                  v_spec #>> '{trigger,status}')
                               else 'is started by hand' end),
    'ms', round(extract(epoch from (clock_timestamp() - v_t0)) * 1000, 1));
end
$$;

create or replace function custom.checklist_templates(p_organization_id uuid,
                                           p_about_table_id uuid default null,
                                           p_limit integer default 100)
returns table (template_id uuid, name text, about_table_id uuid, about_table text,
               steps integer, roles integer, trigger_kind text, trigger_status text,
               open_runs integer, total_runs integer, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $$
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.checklist_templates');
  return query
    select c.id,
           c.data ->> 'name',
           nullif(c.data ->> 'about_table_id', '')::uuid,
           t.data ->> 'name',
           jsonb_array_length(coalesce(c.data -> 'steps', '[]'::jsonb)),
           jsonb_array_length(coalesce(c.data -> 'roles', '[]'::jsonb)),
           coalesce(c.data #>> '{trigger,kind}', 'manual'),
           nullif(c.data #>> '{trigger,status}', ''),
           (select count(*)::integer from custom.record run
             where run.organization_id = p_organization_id
               and run.data_class = 'checklist_run'
               and run.deleted_at is null
               and nullif(run.data ->> 'template_id', '')::uuid = c.id
               and nullif(run.data ->> 'closed_at', '') is null),
           (select count(*)::integer from custom.record run
             where run.organization_id = p_organization_id
               and run.data_class = 'checklist_run'
               and run.deleted_at is null
               and nullif(run.data ->> 'template_id', '')::uuid = c.id),
           c.updated_at
      from custom.record c
      left join custom.record t
        on t.organization_id = c.organization_id
       and t.id = nullif(c.data ->> 'about_table_id', '')::uuid
     where c.organization_id = p_organization_id
       and c.data_class = 'checklist_template'
       and c.deleted_at is null
       and (p_about_table_id is null
            or nullif(c.data ->> 'about_table_id', '')::uuid = p_about_table_id)
       and (custom.query_is_store_owner()
            or custom.has_visibility(custom.query_principal(), 'record', c.id,
                                     'viewer'::public.permission_level))
     order by c.updated_at desc
     limit greatest(1, least(coalesce(p_limit, 100), 200));
end
$$;

create or replace function custom.checklist_template_shape(p_organization_id uuid, p_template_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_row custom.record;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.checklist_template_shape');
  perform custom.assert_client_may_open(p_organization_id, p_template_id,
                                        'custom.checklist_template_shape',
                                        'viewer'::public.permission_level, 'checklist');
  select r.* into v_row from custom.record r
   where r.organization_id = p_organization_id and r.id = p_template_id
     and r.data_class = 'checklist_template' and r.deleted_at is null;
  if v_row.id is null then
    raise exception 'There is no such checklist in this organization.' using errcode = '02000';
  end if;
  return v_row.data || jsonb_build_object(
    'template_id', v_row.id,
    'steps_table_id', (select r.id from custom.record r
                        where r.organization_id = p_organization_id
                          and r.table_id = custom.table_kernel_id()
                          and r.data ->> 'slug' = 'checklist_step'
                          and r.deleted_at is null limit 1),
    'may_change', custom.query_is_store_owner()
                  or custom.has_visibility(custom.query_principal(), 'record', v_row.id,
                                           'editor'::public.permission_level));
end
$$;

-- ── the instantiation itself ─────────────────────────────────────────────────────────────
-- Internal: never granted, never declared as a client door. The client door
-- (`custom.checklist_start`) asks the ladder and then calls this; the trigger calls it
-- directly, because a run that the ORGANIZATION'S OWN RULE starts is not the acting person's
-- act to be refused for — they are being given work, not taking it.
create or replace function custom._checklist_instantiate(p_organization_id uuid, p_template_id uuid,
                                              p_about_record_id uuid, p_roles jsonb,
                                              p_starting_at timestamptz, p_origin text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_tpl     custom.record;
  v_spec    jsonb;
  v_why     text;
  v_steps   uuid;
  v_states  uuid;
  v_start   uuid;
  v_map     jsonb := '{}'::jsonb;
  v_roles   jsonb := '{}'::jsonb;
  v_role    jsonb;
  v_step    jsonb;
  v_deps    jsonb;
  v_dep     text;
  v_ids     jsonb := '[]'::jsonb;
  v_id      uuid;
  v_run     uuid;
  v_at      timestamptz := coalesce(p_starting_at, now());
  v_due     timestamptz;
  v_user    uuid;
  v_i       integer := 0;
  v_given   integer := 0;
  v_waiting text[] := '{}';
  v_about   text;
  v_t0      timestamptz := clock_timestamp();
begin
  perform custom.assert_store_door(p_organization_id, 'custom.checklist_start');

  select r.* into v_tpl from custom.record r
   where r.organization_id = p_organization_id and r.id = p_template_id
     and r.data_class = 'checklist_template' and r.deleted_at is null;
  if v_tpl.id is null then
    raise exception 'There is no such checklist in this organization.'
      using errcode = '02000',
            hint = 'REC-50: a checklist template is a record of this store, named by its id.';
  end if;
  v_spec := v_tpl.data;
  v_why := custom.checklist_refusal(v_spec);
  if v_why is not null then
    raise exception '%', v_why
      using errcode = '23514',
            hint = 'REC-70: the whole run is judged before any of it is written, so a half-made checklist is not a state this store can be in.';
  end if;

  if p_about_record_id is not null then
    if not exists (select 1 from custom.record r
                    where r.organization_id = p_organization_id and r.id = p_about_record_id
                      and r.table_id = (v_spec ->> 'about_table_id')::uuid
                      and r.deleted_at is null) then
      raise exception 'That record is not one of the records this checklist runs for.'
        using errcode = '23503',
              hint = format('This checklist is about the table it names in about_table_id, and the record you gave is not in it.');
    end if;
    select coalesce(nullif(r.data ->> coalesce(t.data ->> 'title_field', 'name'), ''), 'a record')
      into v_about
      from custom.record r
      join custom.record t on t.organization_id = r.organization_id and t.id = r.table_id
     where r.organization_id = p_organization_id and r.id = p_about_record_id;
  end if;

  v_steps  := custom.checklist_steps_table(p_organization_id);
  select r.id into v_states
    from custom.record r
   where r.organization_id = p_organization_id
     and r.table_id = custom.table_kernel_id()
     and r.data ->> 'slug' = 'checklist_step_work_state'
     and r.deleted_at is null
   limit 1;
  select s.id into v_start
    from custom.record s
   where s.organization_id = p_organization_id and s.table_id = v_states
     and s.data ->> 'name' = 'Not started' and s.deleted_at is null
   limit 1;

  -- WHO EACH ROLE IS. The template's own defaults, then whatever this run was told.
  for v_role in select e from jsonb_array_elements(coalesce(v_spec -> 'roles', '[]'::jsonb)) e loop
    if nullif(v_role ->> 'user_id', '') is not null then
      v_roles := v_roles || jsonb_build_object(v_role ->> 'role', v_role ->> 'user_id');
    end if;
  end loop;
  v_roles := v_roles || coalesce(p_roles, '{}'::jsonb);

  v_run := gen_random_uuid();

  for v_step in select e from jsonb_array_elements(v_spec -> 'steps') e loop
    v_i := v_i + 1;
    v_deps := '[]'::jsonb;
    for v_dep in select e #>> '{}' from jsonb_array_elements(coalesce(v_step -> 'depends_on', '[]'::jsonb)) e loop
      v_deps := v_deps || jsonb_build_array(v_map ->> v_dep);
    end loop;

    insert into custom.record (organization_id, table_id, data_class, data)
    values (p_organization_id, v_steps, 'record', jsonb_build_object(
      'title',            v_step ->> 'title',
      'position',         v_i,
      'run_id',           v_run::text,
      'template_id',      p_template_id::text,
      'template',         v_spec ->> 'name',
      'ref',              v_step ->> 'ref',
      'role',             nullif(v_step ->> 'role', ''),
      'about_record_id',  p_about_record_id::text,
      'about_table_id',   v_spec ->> 'about_table_id',
      'depends_on',       coalesce(v_step -> 'depends_on', '[]'::jsonb),
      'depends_on_ids',   v_deps,
      'requires',         coalesce(v_step -> 'requires', jsonb_build_object('kind', 'none')),
      'evidence',         '{}'::jsonb,
      'status',           v_start::text))
    returning id into v_id;

    v_map := v_map || jsonb_build_object(v_step ->> 'ref', v_id);
    v_ids := v_ids || jsonb_build_array(jsonb_build_object(
      'ref', v_step ->> 'ref', 'step_id', v_id, 'title', v_step ->> 'title',
      'role', nullif(v_step ->> 'role', '')));

    v_due := case when v_step ? 'due_days'
                  then v_at + ((v_step ->> 'due_days')::integer || ' days')::interval end;
    v_user := nullif(v_roles ->> coalesce(v_step ->> 'role', ''), '')::uuid;

    if v_user is not null then
      -- One act: the name on the row AND the access to it, so nobody gets a task they are
      -- then refused when they open it.
      perform custom.work_assign(p_organization_id, v_id, v_user, v_due, false);
      v_given := v_given + 1;
    else
      if nullif(v_step ->> 'role', '') is not null
         and not (v_step ->> 'role' = any (v_waiting)) then
        v_waiting := v_waiting || (v_step ->> 'role');
      end if;
      if v_due is not null then
        perform custom.record_update(p_organization_id, v_id,
          jsonb_build_object('due_date',
            to_char(v_due at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')), null);
      end if;
    end if;
  end loop;

  insert into custom.record (organization_id, id, table_id, data_class, data)
  values (p_organization_id, v_run, null, 'checklist_run', jsonb_build_object(
    'template_id',      p_template_id::text,
    'template',         v_spec ->> 'name',
    'name',             coalesce(v_spec ->> 'name', 'Checklist')
                        || case when v_about is null then '' else ' — ' || v_about end,
    'about_record_id',  p_about_record_id::text,
    'about_table_id',   v_spec ->> 'about_table_id',
    'about',            v_about,
    'steps_table_id',   v_steps::text,
    'started_at',       to_char(v_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'started_by',       custom.query_principal(),
    'origin',           coalesce(nullif(p_origin, ''), 'person'),
    'step_count',       v_i,
    'steps',            v_ids,
    'closed_at',        null));

  return jsonb_build_object(
    'run_id',        v_run,
    'template_id',   p_template_id,
    'template',      v_spec ->> 'name',
    'about_record_id', p_about_record_id,
    'about',         v_about,
    'steps_table_id', v_steps,
    'steps_created', v_i,
    'assigned',      v_given,
    'unassigned',    v_i - v_given,
    'origin',        coalesce(nullif(p_origin, ''), 'person'),
    'steps',         v_ids,
    'waiting_on_a_name', to_jsonb(v_waiting),
    'message',       format('%s started with %s step%s%s.%s',
                            v_spec ->> 'name', v_i,
                            case when v_i = 1 then '' else 's' end,
                            case when v_about is null then '' else ' for ' || v_about end,
                            case when array_length(v_waiting, 1) is null then ''
                                 else format(' Nobody is named for %s yet, so %s step%s %s waiting on somebody being chosen.',
                                             array_to_string(v_waiting, ' or '),
                                             v_i - v_given,
                                             case when v_i - v_given = 1 then '' else 's' end,
                                             case when v_i - v_given = 1 then 'is' else 'are' end) end),
    'ms', round(extract(epoch from (clock_timestamp() - v_t0)) * 1000, 1));
end
$$;

create or replace function custom.checklist_start(p_organization_id uuid, p_template_id uuid,
                                       p_about_record_id uuid default null,
                                       p_roles jsonb default '{}'::jsonb,
                                       p_starting_at timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
begin
  perform custom.assert_store_door(p_organization_id, 'custom.checklist_start');
  perform custom.assert_client_may_open(p_organization_id, p_template_id,
                                        'custom.checklist_start',
                                        'viewer'::public.permission_level, 'checklist');
  return custom._checklist_instantiate(p_organization_id, p_template_id, p_about_record_id,
                                       p_roles, p_starting_at, 'person');
end
$$;

-- ── what a run looks like, step by step ──────────────────────────────────────────────────
create or replace function custom.checklist_run(p_organization_id uuid, p_run_id uuid)
returns table (step_id uuid, step_order integer, ref text, title text, role text,
               assignee_name text, assignee_user_id uuid,
               due_on timestamptz, due_state text, status text, finished boolean,
               requires text, requires_label text, requires_id uuid,
               evidence jsonb, blocked_by text[], may_complete boolean, refusal text)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_me  uuid := custom.query_principal();
  v_run custom.record;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.checklist_run');
  select r.* into v_run from custom.record r
   where r.organization_id = p_organization_id and r.id = p_run_id
     and r.data_class = 'checklist_run' and r.deleted_at is null;
  if v_run.id is null then
    raise exception 'There is no such checklist run in this organization.' using errcode = '02000';
  end if;

  return query
    select s.id,
           coalesce((s.data ->> 'position')::integer, 0),
           s.data ->> 'ref',
           s.data ->> 'title',
           s.data ->> 'role',
           p.data ->> 'name',
           nullif(p.data ->> 'user_id', '')::uuid,
           nullif(s.data ->> 'due_date', '')::timestamptz,
           case when custom._checklist_finished(p_organization_id, s.table_id, s.data ->> 'status') then 'finished'
                when nullif(s.data ->> 'due_date', '') is null                        then 'undated'
                when (s.data ->> 'due_date')::timestamptz <  date_trunc('day', now()) then 'overdue'
                when (s.data ->> 'due_date')::timestamptz <  date_trunc('day', now()) + interval '1 day'
                                                                                      then 'due_today'
                else 'scheduled' end,
           st.data ->> 'name',
           custom._checklist_finished(p_organization_id, s.table_id, s.data ->> 'status'),
           coalesce(s.data #>> '{requires,kind}', 'none'),
           nullif(coalesce(s.data #>> '{requires,label}', s.data #>> '{requires,key}'), ''),
           coalesce(nullif(s.data #>> '{requires,form_id}', ''),
                    nullif(s.data #>> '{requires,template_id}', ''))::uuid,
           coalesce(s.data -> 'evidence', '{}'::jsonb),
           (select coalesce(array_agg(d.data ->> 'title' order by (d.data ->> 'position')::integer), '{}')
              from jsonb_array_elements(coalesce(s.data -> 'depends_on_ids', '[]'::jsonb)) e
              join custom.record d
                on d.organization_id = p_organization_id
               and d.id = (e #>> '{}')::uuid
               and d.deleted_at is null
               and not custom._checklist_finished(p_organization_id, d.table_id, d.data ->> 'status')),
           custom.query_is_store_owner()
             or custom.has_visibility(v_me, 'record', s.id, 'editor'::public.permission_level),
           case when custom._checklist_finished(p_organization_id, s.table_id, s.data ->> 'status')
                then null
                else custom._checklist_refusal_for(p_organization_id, s.id, s.data) end
      from custom.record s
      left join custom.record p
        on p.organization_id = s.organization_id
       and p.id = nullif(s.data ->> 'assignee', '')::uuid
      left join custom.record st
        on st.organization_id = s.organization_id
       and st.id = custom.work_state_id(s.organization_id, s.table_id, s.data ->> 'status')
       and st.deleted_at is null
     where s.organization_id = p_organization_id
       and s.deleted_at is null
       and s.data_class = 'record'
       and nullif(s.data ->> 'run_id', '')::uuid = p_run_id
     order by coalesce((s.data ->> 'position')::integer, 0);
end
$$;

create or replace function custom.checklist_runs(p_organization_id uuid,
                                      p_about_table_id uuid default null,
                                      p_about_record_id uuid default null,
                                      p_include_closed boolean default true,
                                      p_limit integer default 100)
returns table (run_id uuid, name text, template_id uuid, template text,
               about_record_id uuid, about text, about_table_id uuid,
               started_at timestamptz, started_by uuid, origin text,
               step_count integer, done integer, overdue integer,
               next_step text, next_due timestamptz, closed_at timestamptz)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $$
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.checklist_runs');
  return query
    with runs as (
      select r.id, r.data as d
        from custom.record r
       where r.organization_id = p_organization_id
         and r.data_class = 'checklist_run'
         and r.deleted_at is null
         and (p_about_table_id is null
              or nullif(r.data ->> 'about_table_id', '')::uuid = p_about_table_id)
         and (p_about_record_id is null
              or nullif(r.data ->> 'about_record_id', '')::uuid = p_about_record_id)
         and (coalesce(p_include_closed, true) or nullif(r.data ->> 'closed_at', '') is null)
    ), steps as (
      select nullif(s.data ->> 'run_id', '')::uuid as run_id,
             count(*)::integer as n,
             count(*) filter (where custom._checklist_finished(p_organization_id, s.table_id, s.data ->> 'status'))::integer as done,
             count(*) filter (where not custom._checklist_finished(p_organization_id, s.table_id, s.data ->> 'status')
                                and nullif(s.data ->> 'due_date', '')::timestamptz < date_trunc('day', now()))::integer as overdue,
             (array_agg(s.data ->> 'title' order by
                          custom._checklist_finished(p_organization_id, s.table_id, s.data ->> 'status'),
                          coalesce((s.data ->> 'position')::integer, 0)))[1] as next_step,
             min(nullif(s.data ->> 'due_date', '')::timestamptz)
               filter (where not custom._checklist_finished(p_organization_id, s.table_id, s.data ->> 'status')) as next_due
        from custom.record s
       where s.organization_id = p_organization_id
         and s.deleted_at is null
         and s.data_class = 'record'
         and nullif(s.data ->> 'run_id', '') is not null
         and nullif(s.data ->> 'run_id', '')::uuid in (select id from runs)
       group by 1
    )
    select r.id,
           r.d ->> 'name',
           nullif(r.d ->> 'template_id', '')::uuid,
           r.d ->> 'template',
           nullif(r.d ->> 'about_record_id', '')::uuid,
           r.d ->> 'about',
           nullif(r.d ->> 'about_table_id', '')::uuid,
           nullif(r.d ->> 'started_at', '')::timestamptz,
           nullif(r.d ->> 'started_by', '')::uuid,
           coalesce(r.d ->> 'origin', 'person'),
           coalesce(s.n, 0),
           coalesce(s.done, 0),
           coalesce(s.overdue, 0),
           case when nullif(r.d ->> 'closed_at', '') is not null then null else s.next_step end,
           s.next_due,
           nullif(r.d ->> 'closed_at', '')::timestamptz
      from runs r
      left join steps s on s.run_id = r.id
     order by nullif(r.d ->> 'started_at', '')::timestamptz desc nulls last
     limit greatest(1, least(coalesce(p_limit, 100), 200));
end
$$;

-- ── finishing a step, with whatever it asked for ─────────────────────────────────────────
create or replace function custom.checklist_step_complete(p_organization_id uuid, p_step_id uuid,
                                               p_evidence jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_row   custom.record;
  v_ev    jsonb;
  v_why   text;
  v_done  uuid;
  v_run   uuid;
  v_left  integer;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.checklist_step_complete');
  perform custom.assert_client_may_change(p_organization_id, p_step_id,
                                          'custom.checklist_step_complete',
                                          'editor'::public.permission_level, 'step');
  select r.* into v_row from custom.record r
   where r.organization_id = p_organization_id and r.id = p_step_id and r.deleted_at is null;
  if v_row.id is null then
    raise exception 'There is no such step in this organization.' using errcode = '02000';
  end if;
  if nullif(v_row.data ->> 'run_id', '') is null then
    raise exception 'That is not a checklist step, so it cannot be ticked off one.'
      using errcode = '0A000',
            hint = 'A checklist step is a record made by custom.checklist_start; an ordinary record is finished with custom.work_set_state.';
  end if;
  if custom._checklist_finished(p_organization_id, v_row.table_id, v_row.data ->> 'status') then
    return jsonb_build_object('step_id', p_step_id, 'completed', false,
                              'message', format('%s was already done.', v_row.data ->> 'title'));
  end if;

  v_ev := coalesce(v_row.data -> 'evidence', '{}'::jsonb) || coalesce(p_evidence, '{}'::jsonb);

  -- ASKED BEFORE ANYTHING IS WRITTEN, so a person is told what is missing rather than left
  -- with half a tick. The same rule the BEFORE trigger enforces, asked here to be kind.
  v_why := custom._checklist_refusal_for(p_organization_id, p_step_id,
                                        v_row.data || jsonb_build_object('evidence', v_ev));
  if v_why is not null then
    raise exception '%', v_why
      using errcode = '23514',
            hint = 'PRODUCTS row 13: a checklist step is finished when what it asks for is there and what it waits for is done.';
  end if;

  perform custom.record_update(p_organization_id, p_step_id,
                               jsonb_build_object('evidence', v_ev), null);

  select s.id into v_done from custom.record s
   where s.organization_id = p_organization_id and s.table_id = (
           select w.data #>> '{config,options_table_id}' from custom.record w
            where w.organization_id = p_organization_id
              and w.table_id = custom.field_kernel_id()
              and w.deleted_at is null
              and nullif(w.data ->> 'entity_definition_id', '')::uuid = v_row.table_id
              and w.data ->> 'key' = 'status' limit 1)::uuid
     and s.data ->> 'name' = 'Done' and s.deleted_at is null limit 1;

  perform custom.work_set_state(p_organization_id, p_step_id, v_done);

  v_run := nullif(v_row.data ->> 'run_id', '')::uuid;
  select count(*)::integer into v_left
    from custom.record s
   where s.organization_id = p_organization_id
     and s.deleted_at is null
     and s.data_class = 'record'
     and nullif(s.data ->> 'run_id', '')::uuid = v_run
     and not custom._checklist_finished(p_organization_id, s.table_id, s.data ->> 'status');

  return jsonb_build_object(
    'step_id',   p_step_id,
    'run_id',    v_run,
    'completed', true,
    'evidence',  v_ev,
    'steps_left', v_left,
    'run_closed', v_left = 0,
    'message',   case when v_left = 0
                      then format('%s is done, and that was the last step — this checklist is finished.',
                                  v_row.data ->> 'title')
                      else format('%s is done. %s step%s to go.', v_row.data ->> 'title', v_left,
                                  case when v_left = 1 then '' else 's' end) end);
end
$$;

-- ── the rule, closed rather than guarded beside ──────────────────────────────────────────
-- `custom.checklist_step_complete` is the pleasant door, but a person with `custom.record_update`
-- or `custom.work_set_state` could otherwise tick step 12 on their first morning. The rule
-- lives here so every path meets it.
--
-- CANCELLING IS NOT FINISHING. A step may be cancelled at any time — that is how a person
-- skips a step that does not apply, and Process Street calls it the same thing. Reaching the
-- DONE end of the line is what this guard asks about. It recognises the cancel state by its
-- name, which is a record this organization owns: if somebody renames it, this guard starts
-- asking about that move too, which is the safe direction to fail in.
create or replace function custom._checklist_step_guard()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $$
declare
  v_why  text;
  v_name text;
begin
  if tg_op <> 'UPDATE' or new.data_class <> 'record' then
    return new;
  end if;
  if not (new.data ? 'run_id') then
    return new;
  end if;
  if nullif(new.data ->> 'status', '') is not distinct from nullif(old.data ->> 'status', '') then
    return new;
  end if;
  if not custom._checklist_finished(new.organization_id, new.table_id, new.data ->> 'status') then
    return new;
  end if;

  select s.data ->> 'name' into v_name
    from custom.record s
   where s.organization_id = new.organization_id
     and s.id = custom.work_state_id(new.organization_id, new.table_id, new.data ->> 'status');
  if v_name = 'Cancelled' then
    return new;
  end if;

  v_why := custom._checklist_refusal_for(new.organization_id, new.id, new.data);
  if v_why is not null then
    raise exception '%', v_why
      using errcode = '23514',
            hint = 'PRODUCTS row 13: a checklist step is finished when what it waits for is done and what it asks for is there. Cancel it instead if it does not apply.';
  end if;
  return new;
end
$$;

create trigger zz_ckl_step_guard
  before update on custom.record
  for each row execute function custom._checklist_step_guard();

-- ── what starts a run, and what ends one ─────────────────────────────────────────────────
create index checklist_template_trigger_idx on custom.record
  (organization_id, ((data #>> '{trigger,table_id}')))
  where data_class = 'checklist_template' and deleted_at is null;

create or replace function custom._checklist_watch()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_tpl    uuid;
  v_run    uuid;
  v_left   integer;
  v_closed text;
  v_status text;
  v_want   text;
begin
  if new.data_class <> 'record' or new.deleted_at is not null then
    return null;
  end if;

  -- A STEP OF A RUN. Its status just moved, so the run may have just finished — or may have
  -- just re-opened, because somebody pulled a done step back to In progress.
  if new.data ? 'run_id' then
    if tg_op = 'UPDATE'
       and nullif(new.data ->> 'status', '') is distinct from nullif(old.data ->> 'status', '') then
      v_run := nullif(new.data ->> 'run_id', '')::uuid;
      select count(*)::integer into v_left
        from custom.record s
       where s.organization_id = new.organization_id
         and s.deleted_at is null
         and s.data_class = 'record'
         and nullif(s.data ->> 'run_id', '')::uuid = v_run
         and not custom._checklist_finished(new.organization_id, s.table_id, s.data ->> 'status');
      v_closed := case when v_left = 0
                       then to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end;
      update custom.record r
         set data = r.data || jsonb_build_object('closed_at', v_closed)
       where r.organization_id = new.organization_id
         and r.id = v_run
         and r.data_class = 'checklist_run'
         and r.deleted_at is null
         and coalesce(r.data ->> 'closed_at', '') is distinct from coalesce(v_closed, '');
    end if;
    return null;
  end if;

  if new.table_id is null then
    return null;
  end if;
  if tg_op = 'UPDATE'
     and nullif(new.data ->> 'status', '') is not distinct from nullif(old.data ->> 'status', '') then
    return null;
  end if;

  for v_tpl in
    select c.id
      from custom.record c
     where c.organization_id = new.organization_id
       and c.data_class = 'checklist_template'
       and c.deleted_at is null
       and (c.data #>> '{trigger,table_id}') = new.table_id::text
       and coalesce(c.data #>> '{trigger,kind}', 'manual')
           = case when tg_op = 'INSERT' then 'record_created' else 'status_reached' end
  loop
    if tg_op = 'UPDATE' then
      select s.data ->> 'name' into v_status
        from custom.record s
       where s.organization_id = new.organization_id
         and s.id = custom.work_state_id(new.organization_id, new.table_id, new.data ->> 'status');
      select c.data #>> '{trigger,status}' into v_want
        from custom.record c
       where c.organization_id = new.organization_id and c.id = v_tpl;
      if coalesce(v_status, '') is distinct from coalesce(v_want, '') then
        continue;
      end if;
    end if;

    -- ONE RUN PER RECORD PER CHECKLIST. A record edited twice does not get onboarded twice.
    if exists (select 1 from custom.record r
                where r.organization_id = new.organization_id
                  and r.data_class = 'checklist_run'
                  and r.deleted_at is null
                  and nullif(r.data ->> 'template_id', '')::uuid = v_tpl
                  and nullif(r.data ->> 'about_record_id', '')::uuid = new.id) then
      continue;
    end if;

    perform custom._checklist_instantiate(new.organization_id, v_tpl, new.id, '{}'::jsonb, now(),
                                          case when tg_op = 'INSERT' then 'record_created'
                                               else 'status_reached' end);
  end loop;

  return null;
end
$$;

create trigger zz_ckl_watch
  after insert or update on custom.record
  for each row execute function custom._checklist_watch();

-- THE DOOR ROWS COME FIRST, AND THE ORDER IS LOAD-BEARING. `platform.enforce_definer_client_grants`
-- fires ON THE GRANT: a SECURITY DEFINER function in a schema declared closed that holds no
-- `platform.client_callable_door` row has its client EXECUTE taken straight back, inside the
-- same transaction, with the run still reporting success. Declare, then grant. (WORK-DOORS
-- paid for this round trip on 2026-09-20; this file does not.)

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes,
   signed_in_callers, anonymous_callers, declared_by, reason)
select 'custom', v.fn, iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes),
       true, false,
       'migrations/campaign/checklists_a_checklist_is_a_template_of_work.sql (lane CHECKLISTS)',
       v.why
  from (values
    ('checklist_refusal',
     'What is wrong with a checklist somebody is writing, in the words they would use — asked by the editor while they type, so the refusal arrives before the save rather than after it. Pure: it reads no row and writes nothing.'),
    ('checklist_declare',
     'Stores a checklist: its ordered steps, who each one belongs to by role, how many days in each is due, what each waits for, what each asks for, and what starts a run. Judged whole before it is written, so a run of it cannot be half a checklist. Editor on the table it is about.'),
    ('checklist_templates',
     'The checklists an organization has, with how many runs of each are open. Sectioned by the table they are about, so a Table page can show its own.'),
    ('checklist_template_shape',
     'One checklist in full, for the editor — its steps, roles, offsets, dependencies and trigger, plus whether this person may change it.'),
    ('checklist_start',
     'Runs a checklist for one record: one work item per step, in the one work layer, assigned by role to real people with real due dates, dependencies carried across. Viewer on the checklist is enough to run one; the steps decide their own access as they are assigned.'),
    ('checklist_run',
     'One run, step by step: who has it, when it is due, whether it is done, what it is waiting on, what it still asks for, and whether this person may finish it.'),
    ('checklist_runs',
     'The runs of a table or of one record, with progress and what is overdue — the run list a Table page and a record page both show.'),
    ('checklist_step_complete',
     'Ticks a step off with whatever it asked for — a note, an answer, a form response, a document. Refuses by name while a step it waits for is open. Closing the last step closes the run.'),
    ('checklist_step_refusal',
     'Why this step cannot be finished right now, so a screen can say so before somebody clicks rather than after.')
  ) as v(fn, why)
  join pg_proc p on p.proname = v.fn and p.pronamespace = 'custom'::regnamespace
 where not exists (select 1 from platform.client_callable_door d
                    where d.schema_name = 'custom' and d.function_name = v.fn
                      and d.identity_argtypes = platform.door_argtypes(p.proargtypes));

-- THE TWO INTERNALS, DECLARED AS INTERNALS. `platform.provision_shape_guard` refuses a
-- SECURITY DEFINER function that reaches COMMIT with no access decision in DATA, and it is
-- right to: prose in a comment is not a declaration. Neither of these is ever client-callable.

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes,
   signed_in_callers, anonymous_callers, non_client_lane, declared_by, reason)
select 'custom', v.fn, iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes),
       false, false, v.lane,
       'migrations/campaign/checklists_a_checklist_is_a_template_of_work.sql (lane CHECKLISTS)',
       v.why
  from (values
    ('checklist_steps_table',
     'server_only: reached only from custom.checklist_declare and custom._checklist_instantiate, both of which have already asked the organization wall and the rung on the table the checklist is about. It creates the organization''s one Checklist steps Table on first use, so a client grant would let anybody with an organization id write a Table into that store; p_organization_id is checked by custom.assert_client_may_reach inside it and a NULL organization_id is refused by that same call.',
     'The one Table every step of every checklist is a row of, made once per organization and given the REC-69 assignment Fields. Internal: the two doors above it have already decided.'),
    ('_checklist_instantiate',
     'server_only: reached only from custom.checklist_start, which has asked viewer on the checklist first, and from the row trigger zz_ckl_watch, where the act belongs to the organization''s own rule rather than to the person who happened to write the record. A client grant would let anybody with a template id start runs against records they cannot open; p_organization_id and p_template_id are checked by the calling door, p_about_record_id is checked here against the checklist''s own about_table_id, and a NULL about_record_id means a run about nothing in particular, which is allowed.',
     'The instantiation itself: one work item per step, assigned by role, dated from offsets, dependencies carried across, logged as a run. Internal.')
  ) as v(fn, lane, why)
  join pg_proc p on p.proname = v.fn and p.pronamespace = 'custom'::regnamespace
 where not exists (select 1 from platform.client_callable_door d
                    where d.schema_name = 'custom' and d.function_name = v.fn
                      and d.identity_argtypes = platform.door_argtypes(p.proargtypes));

grant execute on function custom.checklist_refusal(jsonb) to authenticated;
grant execute on function custom.checklist_declare(uuid, jsonb, uuid) to authenticated;
grant execute on function custom.checklist_templates(uuid, uuid, integer) to authenticated;
grant execute on function custom.checklist_template_shape(uuid, uuid) to authenticated;
grant execute on function custom.checklist_start(uuid, uuid, uuid, jsonb, timestamptz) to authenticated;
grant execute on function custom.checklist_run(uuid, uuid) to authenticated;
grant execute on function custom.checklist_runs(uuid, uuid, uuid, boolean, integer) to authenticated;
grant execute on function custom.checklist_step_complete(uuid, uuid, jsonb) to authenticated;
grant execute on function custom.checklist_step_refusal(uuid, uuid) to authenticated;
