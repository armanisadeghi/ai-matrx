-- additive: yes
-- based-on: custom._checklist_instantiate(uuid, uuid, uuid, jsonb, timestamp with time zone, text) 943857caf7426d852f2e1f77cfef8132c0b51bf29d92fb81461a1b7b37e88bfc
--
-- HANDOVER (2026-09-28) — A CHECKLIST SAYS WHO IS MISSING IN WORDS, NEVER BY KEY.
--
-- Replaces ONE live body, same signature (custom._checklist_instantiate, declared server-only in
-- platform.client_callable_door); nothing dropped, granted or revoked; no row touched.
--
-- What a person met: starting "New patient intake" on a Cedar Ridge Physical Therapy patient said
-- "Nobody is named for front_desk or therapist yet" — the template's role keys. The template
-- carries each role's label; the sentence now says "Front desk or Therapist" (the label, else the
-- key read aloud). waiting_on_a_name still answers the keys, for code.
-- Guard: scripts/campaign-tests/handover_a_checklist_says_who_is_missing_in_words.sql

CREATE OR REPLACE FUNCTION custom._checklist_instantiate(p_organization_id uuid, p_template_id uuid, p_about_record_id uuid, p_roles jsonb, p_starting_at timestamp with time zone, p_origin text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
  -- The same roles in a person's words: the template's own label ("Front desk"), else the key
  -- read aloud. The message says these; waiting_on_a_name keeps the keys for code.
  v_waiting_words text[] := '{}';
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
        v_waiting_words := v_waiting_words || coalesce(
          (select nullif(btrim(e ->> 'label'), '')
             from jsonb_array_elements(coalesce(v_spec -> 'roles', '[]'::jsonb)) e
            where e ->> 'role' = v_step ->> 'role'
            limit 1),
          initcap(replace(v_step ->> 'role', '_', ' ')));
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
                                             array_to_string(v_waiting_words, ' or '),
                                             v_i - v_given,
                                             case when v_i - v_given = 1 then '' else 's' end,
                                             case when v_i - v_given = 1 then 'is' else 'are' end) end),
    'ms', round(extract(epoch from (clock_timestamp() - v_t0)) * 1000, 1));
end
$function$;
