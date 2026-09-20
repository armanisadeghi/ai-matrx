-- chair-step: it DROPS and re-creates TWO functions this lane's own first file created forty
--   minutes earlier, `custom.checklist_run` and `custom.checklist_runs`, because both gain a
--   column and a RETURNS TABLE cannot be widened by CREATE OR REPLACE. Nothing outside this
--   lane's own unlanded package code calls either one yet — they were declared, granted and
--   used by one suite, all inside this session — so the drop takes nothing away from any
--   feature. It re-declares both doors and re-issues both grants in the same transaction. The
--   inverse is `migrations/inverse/checklists_a_run_is_seen_by_the_people_in_it_down.sql`.
-- guard: custom/system_enabled
-- based-on: custom.checklist_steps_table(uuid) cdaf76aa29b4f22496a45ea18c5dbbf5e953f8d20769275006413b2a70cbcb93
--
-- CHECKLISTS — THREE DEFECTS THIS LANE FOUND IN ITS OWN FIRST LANDING.
--
-- 1. A RUN WAS VISIBLE TO EVERY MEMBER OF THE ORGANIZATION. `custom.checklist_run` and
--    `custom.checklist_runs` asked the organization wall and stopped. In an organization on
--    `shared_only` — where a member reaches exactly what has been shared with her and nothing
--    else — that made a checklist run the one object in this store that ignored the ladder.
--    Somebody with no step in a run and no share on the record it is about could read the
--    whole of somebody's onboarding.
--
--    THE RULE, and it is the same one everywhere else: a run is yours to read when you hold
--    the run, or hold one of its steps, or hold the record it is about — each at `viewer`,
--    each through `custom.has_visibility`, which is the one ladder. Being assigned a step is
--    what puts a run in front of you, which is exactly how it should be: the checklist arrives
--    with the work.
--
-- 2. A SCREEN COULD NOT FILE THE ANSWER A STEP ASKED FOR. `custom.checklist_run` handed back
--    `requires_label` — what to ASK a person — and never the KEY the checklist named. So a
--    screen collecting "Serial number" had nothing to file it under but a guess, and a guess
--    files the evidence where `custom.checklist_step_complete` does not look for it: the step
--    then refuses with the answer sitting right there in the row. `requires_key` is now
--    answered beside the label, and `@ai-matrx/records-ui`'s runner sends exactly it.
--
-- 3. THE CHECKLIST STEPS TABLE COULD NOT BE MADE AT ALL. `custom._table_shape_guard` requires
--    every Table to name a Home (REC-1, `parent_id`), and `custom.checklist_steps_table` named
--    none — so the FIRST call to `custom.checklist_declare` in any organization died with "a
--    table has to live somewhere", and nothing in this lane worked from a browser. Found by
--    this lane's own green suite before a person ever met it. The Home is the one
--    `custom.work_slots_declare` uses for the same kind of table — a Table the platform makes
--    once per organization rather than one a person put somewhere: the Table kernel itself.
--
-- The inverse is `migrations/inverse/checklists_a_run_is_seen_by_the_people_in_it_down.sql`.

set lock_timeout = '45s';

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
    -- REC-1: a Table lives somewhere. This one is made ONCE per organization by the platform
    -- rather than put anywhere by a person, so its Home is the Table kernel — exactly where
    -- custom.work_slots_declare puts the same kind of Table when nobody names a Home.
    'parent_id',      custom.table_kernel_id()::text,
    'fields', jsonb_build_array(jsonb_build_object('name', 'title'),
                                jsonb_build_object('name', 'position'))))
  returning id into v_id;

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

drop function if exists custom.checklist_run(uuid, uuid);
drop function if exists custom.checklist_runs(uuid, uuid, uuid, boolean, integer);

-- ── is this run one of mine ──────────────────────────────────────────────────────────────
create function custom._checklist_run_visible(p_organization_id uuid, p_run_id uuid, p_data jsonb)
returns boolean
language sql
stable
set search_path to 'pg_catalog'
as $$
  select custom.query_is_store_owner()
      or custom.has_visibility(custom.query_principal(), 'record', p_run_id,
                               'viewer'::public.permission_level)
      or (nullif(p_data ->> 'about_record_id', '') is not null
          and custom.has_visibility(custom.query_principal(), 'record',
                                    (p_data ->> 'about_record_id')::uuid,
                                    'viewer'::public.permission_level))
      or exists (select 1
                   from custom.record s
                  where s.organization_id = p_organization_id
                    and s.deleted_at is null
                    and s.data_class = 'record'
                    and nullif(s.data ->> 'run_id', '')::uuid = p_run_id
                    and custom.has_visibility(custom.query_principal(), 'record', s.id,
                                              'viewer'::public.permission_level));
$$;

create function custom.checklist_run(p_organization_id uuid, p_run_id uuid)
returns table (step_id uuid, step_order integer, ref text, title text, role text,
               assignee_name text, assignee_user_id uuid,
               due_on timestamptz, due_state text, status text, finished boolean,
               requires text, requires_key text, requires_label text, requires_id uuid,
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
  -- THE ONE LADDER. A run is yours when you hold it, hold a step of it, or hold the record it
  -- is about. Being given a step is what puts the checklist in front of you.
  if not custom._checklist_run_visible(p_organization_id, p_run_id, v_run.data) then
    raise exception 'You do not have any part of this checklist, so custom.checklist_run has nothing to show you.'
      using errcode = '42501',
            hint = 'DOOR-1: a run is readable by the people in it — whoever holds a step, whoever holds the record it is about, and whoever the run itself was shared with. Ask for a step, or ask an owner to share it.';
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
           nullif(s.data #>> '{requires,key}', ''),
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

create function custom.checklist_runs(p_organization_id uuid,
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
         -- THE ONE LADDER, row by row, exactly as custom.checklist_run asks it.
         and custom._checklist_run_visible(p_organization_id, r.id, r.data)
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

-- The door rows are already there from the first file, by name and by argument types, which
-- have not changed. This re-states them for the two the drop removed nothing from and declares
-- the new internal, THEN re-issues the grants the drop took away.

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes,
   signed_in_callers, anonymous_callers, non_client_lane, declared_by, reason)
select 'custom', '_checklist_run_visible', iam.door_identity_args(p.oid),
       platform.door_argtypes(p.proargtypes), false, false,
       'server_only: asked by custom.checklist_run and custom.checklist_runs, both of which have already asked the organization wall. It is the ladder question itself, so a client grant would be a way to probe which runs exist without reading one; p_organization_id and p_run_id are decided by custom.has_visibility inside it against custom.query_principal(), and a NULL principal answers false through that same call.',
       'migrations/campaign/checklists_a_run_is_seen_by_the_people_in_it.sql (lane CHECKLISTS)',
       'Whether this person holds any part of this run — the run itself, one of its steps, or the record it is about. One question, asked by both run doors, so what a list shows and what a run opens cannot differ.'
  from pg_proc p
 where p.proname = '_checklist_run_visible' and p.pronamespace = 'custom'::regnamespace
   and not exists (select 1 from platform.client_callable_door d
                    where d.schema_name = 'custom' and d.function_name = '_checklist_run_visible'
                      and d.identity_argtypes = platform.door_argtypes(p.proargtypes));

grant execute on function custom.checklist_run(uuid, uuid) to authenticated;
grant execute on function custom.checklist_runs(uuid, uuid, uuid, boolean, integer) to authenticated;
