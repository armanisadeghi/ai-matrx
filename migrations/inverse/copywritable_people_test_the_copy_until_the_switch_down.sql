-- chair-step: lane COPY-WRITABLE's inverse. Puts back the copy fence, its question, the where-lives sentence, the one count, readiness and the press step exactly as they were before copywritable_people_test_the_copy_until_the_switch.sql (bodies as read from production on 2026-09-25), so a person's write to a test copy is refused again and the switch no longer re-syncs; drops the new functions and their door rows, and the two evaluation tables ONLY when both are empty — it refuses while any person's test write is noted or any switch has logged what it replaced, because dropping them would lose that record (soft-delete law). Run it only on the chair's word.
-- lane: COPY-WRITABLE
-- based-on: custom._older_table_copy_refusal(uuid) 3f9ce0bc8cfa74f4d9c563e7d9774f1cd12e96cfc078e4e094de2cc5602457d1
-- based-on: custom._context_copy_fence() ed9170166347298f9627b3bfd07eaf190fb4c5db9809c67b2c6c30964c5d8de7
-- based-on: custom.where_tables_live(uuid[]) 928323fb9011077d216322c8b768f991123cd95c380730a6edc7e00a4871c389
-- based-on: platform.cutover_tables_copied(uuid) 40fb3edcbaaf4924c9791efbbc152978f64a2920cf7ba308a5dbbfc23dc1405b
-- based-on: platform._cutover_seam_readiness(text, uuid) c471eb2c66b8dc1d4f385b4c95d1f01fe1ee6aef0a3cc2f08462be2de5d10b7b
-- based-on: platform._cutover_seam_apply(text, uuid, text, uuid, uuid) 488a54335f748bdb627ced4f7b2dd129285394562197af18991115c4fc84958b

do $r$
declare
  v_open bigint := 0;
  v_logged bigint := 0;
begin
  -- Dynamic, so this block also runs where the tables are already gone (plpgsql plans a static
  -- reference to a missing relation before any IF can skip it).
  if to_regclass('platform.cutover_evaluation_write') is not null then
    execute 'select count(*) from platform.cutover_evaluation_write' into v_open;
  end if;
  if to_regclass('platform.cutover_evaluation_replaced') is not null then
    execute 'select count(*) from platform.cutover_evaluation_replaced' into v_logged;
  end if;
  if v_open > 0 or v_logged > 0 then
    raise exception 'copywritable inverse refused: people''s test writes are noted (% rows) or a switch has logged what it replaced (% rows); undoing this file would lose that record. Replace or carry them first.',
      v_open, v_logged
      using errcode = '55000';
  end if;
end $r$;


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
begin
  -- THE ONE WRITER. The store owner's own connection — the scopes mover and the follow worker —
  -- is the only one that may write the copy. Read from the catalogue, never a role literal,
  -- exactly as custom._store_door's operator lane is.
  if pg_has_role(v_role, (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass), 'member') then
    return new;
  end if;

  -- THE OLDER TABLE IS THE WRITER UNTIL THE SWITCH (lane WHERE-LIVES-SWITCH). COPY mode keeps
  -- every older table live beside its same-id copy in this store; until an owner presses the
  -- organization's Data tables switch, the older table is the one in use and its copy only
  -- follows it (the mover's rerun). So a person, agent, workflow, sync or grid writing the copy
  -- — the Table, one of its Fields or one of its Records — is refused with the older table's
  -- address. The mover and the undo write as the store owner and passed above.
  v_older := custom._older_table_copy_refusal(
               case when new.data_class = 'table' then new.id
                    when new.data_class = 'field' then nullif(new.data ->> 'entity_definition_id', '')::uuid
                    else new.table_id end);
  if v_older is not null then
    raise exception '%', v_older
      using errcode = '42501',
            hint = 'WHERE-LIVES-SWITCH: platform.table_lives_in answers ''older'' for this table (its older table is live and the organization''s older_tables switch is off). Nothing was written. Write the older table; after the switch the copy is the table.';
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
$function$;

CREATE OR REPLACE FUNCTION custom._older_table_copy_refusal(p_table_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
  -- THE NAME ONLY TO WHO MAY OPEN THE COPY (SUITE-HEALTH-3). The same may-open ladder every
  -- door asks, about the copy by its id. A caller it refuses — a visitor whose form reached this
  -- fence, a person the copy is not shared with — is still refused the write; the sentence just
  -- names nothing. A copy that is not in the record store at all cannot be opened by anyone, so
  -- it is not named either (the ladder lets an absent id through for the calling door to say
  -- "not found"; here there is no door after it to say so).
  if exists (select 1 from custom.record r where r.id = p_table_id) then
    begin
      perform custom.assert_client_may_open(v_org, p_table_id, 'custom._older_table_copy_refusal', 'viewer', 'table');
    exception when insufficient_privilege or null_value_not_allowed then
      v_name := 'this table';
    end;
  else
    v_name := 'this table';
  end if;
  return format('This is the new system''s copy of %s; the older table is still the one in use until an owner switches Data tables on the organization''s settings page. Edit it at /data/%s.',
                v_name, p_table_id);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.where_tables_live(p_table_ids uuid[])
 RETURNS TABLE(table_id uuid, lives_in text, why text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_me     uuid  := auth.uid();
begin
  if v_me is null and v_claims is not null and coalesce(v_claims ->> 'role', '') <> 'service_role' then
    raise exception 'Sign in to ask where a table lives.' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_table_ids), 0) > 1000 then
    raise exception 'Ask about at most 1000 tables at once (% were asked).', cardinality(p_table_ids) using errcode = '22023';
  end if;
  return query
    select i.id,
           h.lives_in,
           case h.lives_in
             when 'older' then 'It is an older table, and the older table is the one in use: its copy in the new system (if it has one) is read-only until an owner switches Data tables on the organization''s settings page.'
             else 'It lives in the new system (the record store); the store''s own doors decide whether you may open it.'
           end
      from (select distinct u.id from unnest(coalesce(p_table_ids, '{}'::uuid[])) as u(id) where u.id is not null) i
      cross join lateral (select platform.table_lives_in(i.id) as lives_in) l
      -- WHO MAY BE TOLD `older` (SUITE-HEALTH-3). A person is told an older table's home only
      -- when she may open it: the older store's own read rule for her, or the one ladder on its
      -- record-store copy. Anyone else hears `record` — the word an id nobody minted answers —
      -- and the store's doors then say "not found" for it exactly as for that id. No person
      -- (the service lane, the store owner) is answered as before.
      cross join lateral (
        select case
                 when l.lives_in is distinct from 'older' or v_me is null then l.lives_in
                 when workbench.dataset_readable_by(v_me, i.id) then l.lives_in
                 when custom.has_visibility(v_me, 'record', i.id, 'viewer'::public.permission_level) then l.lives_in
                 else 'record'
               end as lives_in) h;
end;
$function$;

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
  ), rows_of_copies as (
    select count(*) filter (where r.id is null)                                   as missing,
           count(*) filter (where r.id is not null and w.updated_at > r.updated_at) as stale
      from older o
      join workbench.udt_dataset_rows w on w.table_id = o.id and w.deleted_at is null
      left join custom.record r on r.organization_id = p_org and r.id = w.id and r.deleted_at is null
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
    'counted_at',      now());
$function$;

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


delete from platform.client_callable_door
 where (schema_name, function_name) in (('platform','write_is_a_persons_own'), ('custom','_older_table_copy_verdict'),
                                        ('custom','_copy_evaluation_note'), ('custom','_copy_evaluation_is_open'),
                                        ('custom','_copy_evaluation_reimage'), ('custom','table_copy_evaluation_state'),
                                        ('platform','cutover_evaluation_carry'), ('platform','_cutover_copy_resync'));

drop function if exists platform._cutover_copy_resync(uuid, uuid, uuid);
drop function if exists platform.cutover_evaluation_carry(uuid, uuid, jsonb);
drop function if exists custom.table_copy_evaluation_state(uuid);
drop function if exists custom._copy_evaluation_reimage(uuid, uuid, jsonb);
drop function if exists custom._copy_evaluation_is_open(uuid, uuid);
drop function if exists custom._copy_evaluation_note(uuid, uuid, uuid, text);
drop function if exists custom._older_table_copy_verdict(uuid);
drop function if exists platform.write_is_a_persons_own();
drop table if exists platform.cutover_evaluation_replaced;
drop function if exists platform._cutover_evaluation_replaced_is_append_only();
drop table if exists platform.cutover_evaluation_write;

