-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.work_transition_refusal(uuid, uuid, uuid) aa3dd2e2fc81b459ea14f50ec662c5c1af63e5575fbe47e364d741fde546d1d8
--
-- WORK-DOORS — THE WORKFLOW STATES ARE A TABLE'S VOCABULARY, NOT SOMEBODY'S PRIVATE ROWS.
--
-- FOUND BY THIS LANE'S OWN GREEN SUITE, from the member's seat, on the main database:
--
--     You do not have access to this state, so custom.work_transition_refusal has nothing to
--     show you.
--
-- Dana holds one record. She was given it, she can edit it, and she cannot be told which
-- states it may move to — because `custom.work_transition_refusal` asked
-- `custom.assert_client_may_open` on each STATE RECORD, and in an organization whose members
-- reach only what is shared with them nobody had shared the workflow-state rows with her.
--
-- That is a dead end of exactly the shape the platform's fourth law forbids: a person holding
-- a task, looking at a control that cannot tell her where the task can go.
--
-- THE CLASS, and the precedent is already in the store: `custom.field_options` — the options
-- of a select Field — decides at the ORGANIZATION WALL and nothing further, because a Table's
-- own vocabulary is not anybody's data. The five workflow states are precisely that: the
-- options of the `status` Field, written by `custom.work_take_assignment` for the Table, not
-- rows anybody authored. They carry a name, a sort, a terminal flag and a list of names.
--
-- So this door asks the wall, like `custom.field_options`, and stops. Nothing about WHO may
-- move a record changes: `custom.work_set_state` still asks editor on the record itself, and
-- `custom.work_record_states` still asks viewer on the record before it says a word.
--
-- THE INVERSE: `migrations/inverse/workdoors_the_states_are_vocabulary_not_somebody_s_rows_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '600s';

create or replace function custom.work_transition_refusal(p_organization_id uuid,
                                                          p_from_state_id uuid, p_to_state_id uuid)
returns text
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_from custom.record;
  v_to   custom.record;
begin
  -- THE WALL, AND ONLY THE WALL — the same decision `custom.field_options` makes about the
  -- options of a select Field, for the same reason: what comes back is a Table's declared
  -- vocabulary (two state names and the list of names one may move to), never a person's row.
  -- Deciding each state row here refused a member the answer to "where can this go?" about a
  -- task she had been handed.
  perform custom.assert_client_may_reach(p_organization_id, 'custom.work_transition_refusal');
  if p_from_state_id is null or p_to_state_id is null or p_from_state_id = p_to_state_id then
    return null;
  end if;
  select * into v_from from custom.record r
   where r.organization_id = p_organization_id and r.id = p_from_state_id and r.deleted_at is null;
  select * into v_to   from custom.record r
   where r.organization_id = p_organization_id and r.id = p_to_state_id   and r.deleted_at is null;
  if v_from.id is null or v_to.id is null then
    return null;
  end if;
  if jsonb_typeof(v_from.data -> 'next') is distinct from 'array' then
    return null;
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
