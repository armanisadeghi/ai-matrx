-- lane: CHAIR-WORLD-LANE
-- based-on: custom.assert_client_may_reach(uuid, text) d82e01ca87b2f834672ef58d549828683e46a775977c6dec5539e1a3727ef07f
-- based-on: custom.assert_may_know_table(uuid, uuid, text) d890ec485d741ca8b8b5c6e08b6d0889f1401767608731c0b2e5b45446cb022a
-- based-on: custom.assert_client_may_open(uuid, uuid, text, permission_level, text) f95895400ef15d5dd5d188a8c9bcad51cc005d1aa7acc59a1f676896a4f9c37a
-- based-on: custom.views(uuid, uuid) 81a5a26237f7eb6e40e90ef97d8aa1e7a83248ceb7e50fb2210fe778b3ab72b9
-- based-on: custom.read_record(uuid, uuid, boolean) 641f7ece6acb44dfe7d91b10d0fe311427b2c578308b97519d53bddea55ae2d7
-- based-on: custom.table_list_everywhere(uuid) 72dcc68ca69c1c989fe4bb639b39b1b5c0019416b11ccc71a3ff81d894f905ea
-- Inverse of migrations/campaign/chairworld_a_a_public_table_is_read_by_every_signed_in_person.sql:
-- the six bodies as they were, then the four helpers dropped.

set local lock_timeout = '3s';

CREATE OR REPLACE FUNCTION custom.assert_client_may_reach(p_organization_id uuid, p_door text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_owner oid;
  v_who   name;
  v_memo  text := 'w:r:' || coalesce(p_organization_id::text, '-');
begin
  -- THE SAME YES, ALREADY GIVEN IN THIS TRANSACTION, TO THIS SEAT, ABOUT THIS ORGANIZATION.
  if platform.memo_k_get(v_memo) = '1' then
    return;
  end if;
  -- A PLATFORM CONTEXT READ IN PROGRESS (lane SCOPES-READS-ACCESS; chair ruling 2026-09-29 (1)). custom.context_scopes
  -- sets this for the length of ONE read of ONE platform context Table (custom.table_is_platform_context — a context
  -- Table of a global-readable system organization) the one ladder already lets the caller see, and clears it after;
  -- no client can set it (set_config is no client door). It admits nothing else: no memo is written, and every other
  -- door, Table and organization meets this wall as before.
  if nullif(current_setting('mx.platform_context_org', true), '') = p_organization_id::text then
    return;
  end if;
  v_who := custom.caller_role();

  -- The campaign's own lanes run as the role that owns the store. Read the owner from the
  -- catalogue, never as a role literal (rule 15), so this cannot drift from the table.
  select c.relowner into v_owner from pg_class c where c.oid = 'custom.record'::regclass;
  if pg_has_role(v_who, v_owner, 'member') then
    perform platform.memo_k_put(v_memo, '1');
    return;
  end if;

  if p_organization_id is null then
    raise exception 'custom: % was called without an organization, and the store is keyed (organization_id, id).',
      coalesce(nullif(btrim(p_door), ''), 'that door')
      using errcode = '22004',
            hint = 'Name the organization you are working in. A door that took null would be a door onto every organization at once.';
  end if;

  if iam.has_org_access(p_organization_id) then
    perform platform.memo_k_put(v_memo, '1');
    return;
  end if;

  -- VIS-31 / PORTAL (2026-09-20). A live portal principal of THIS organization may reach its
  -- doors. Not because she is a member — she is not, and nothing here says she is — but
  -- because the organization named her, through a portal, as somebody whose own records live
  -- here. The next line of every door is the ladder, and she holds exactly one grant.
  --
  -- ONE SENTENCE, ONE PLACE (lane SC-3', 2026-09-24). `custom.portal_admits` reads
  -- `custom/external_principal_enabled` itself for its portal and shared-table arms, so asking
  -- the knob here as well was a second copy of the same condition — and it is what kept a
  -- class student out: portal_admits' scope-membership arm is deliberately outside that knob.
  -- For every person the first two arms admit, this answer is unchanged.
  if custom.portal_admits(p_organization_id) then
    perform platform.memo_k_put(v_memo, '1');
    return;
  end if;

  raise exception 'You are not a member of that organization, so % has nothing to do there.',
    coalesce(nullif(btrim(p_door), ''), 'that door')
    using errcode = '42501',
          hint = 'REC-29 / T15: organizations are hard walls, and a door decides who may reach one before it decides anything else. Switch to an organization you belong to, or ask an owner of that one to add you.';
end $function$;

CREATE OR REPLACE FUNCTION custom.assert_may_know_table(p_organization_id uuid, p_table_id uuid, p_door text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me   uuid;
  v_pred text;
  v_any  boolean := false;
  v_memo text := 'w:k:' || coalesce(p_organization_id::text, '-') || ':' || coalesce(p_table_id::text, '-');
begin
  -- THE SAME YES, ALREADY GIVEN IN THIS TRANSACTION, TO THIS SEAT, ABOUT THIS TABLE. The wall
  -- below is part of that yes: this memo entry is only ever written after it has been passed.
  if platform.memo_k_get(v_memo) = '1' then
    return;
  end if;

  -- The wall first, always, and in the same order every other door asks it.
  perform custom.assert_client_may_reach(p_organization_id, p_door);

  -- WAY THROUGH 1: the Table record itself. Unchanged — this is the whole of what this
  -- function used to be, and it is still the answer under the shipped setting.
  if custom.query_is_store_owner() then
    perform platform.memo_k_put(v_memo, '1');
    return;
  end if;
  v_me := custom.query_principal();
  if v_me is null or p_table_id is null then
    perform platform.memo_k_put(v_memo, '1');
    return;
  end if;
  if custom.has_visibility(v_me, 'record', p_table_id, 'viewer'::public.permission_level) then
    perform platform.memo_k_put(v_memo, '1');
    return;
  end if;

  -- WAY THROUGH 2: anything IN it that she may see. The same ladder, asked set-wise over the
  -- table's own partition and stopped at the first row.
  v_pred := custom.visible_predicate_sql(v_me, p_organization_id, p_table_id,
                                         'viewer'::public.permission_level, 'r');
  execute format(
    'select exists (select 1 from custom.record r
                     where r.organization_id = %L::uuid
                       and r.table_id = %L::uuid
                       and r.deleted_at is null
                       and (%s)
                     limit 1)', p_organization_id, p_table_id, v_pred)
    into v_any;
  if v_any then
    perform platform.memo_k_put(v_memo, '1');
    return;
  end if;

  -- NEITHER. T10's refusal, word for word — and it is now true when it is said: there is
  -- nothing in this table she may see, so telling her it exists would be the leak.
  raise exception 'You do not have access to this table, so % has nothing to show you.',
    coalesce(nullif(btrim(p_door), ''), 'that door')
    using errcode = '42501',
          hint = 'VIS-5 / T10: you know a table if you may open the table itself, or if anything in it has been shared with you. Ask whoever owns it to share the table, or a record in it, with you.';
end;
$function$;

CREATE OR REPLACE FUNCTION custom.assert_client_may_open(p_organization_id uuid, p_subject_id uuid, p_door text, p_required permission_level DEFAULT 'viewer'::permission_level, p_subject_word text DEFAULT 'record'::text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me          uuid;
  v_subject_org uuid;
begin
  -- ONE order, always, and it is `custom.assert_client_may_change`'s order: the
  -- organization wall first, then the row.
  perform custom.assert_client_may_reach(p_organization_id, p_door);

  -- Way through 1: the role that owns the store (every campaign and server lane).
  if custom.query_is_store_owner() then
    return;
  end if;

  if p_subject_id is null then
    return;
  end if;

  -- Way through 2: no signed-in person at all — the anonymous doors, which have
  -- already decided the request against the form's own token.
  v_me := custom.query_principal();
  if v_me is null then
    return;
  end if;

  -- WHERE THE SUBJECT ACTUALLY LIVES, BY ITS ID AND NOTHING ELSE (2026-09-23).
  -- This used to look only inside p_organization_id and RETURN — let the call through —
  -- when the subject was elsewhere, trusting every door to filter by that organization a
  -- line later. Sixteen doors never did: `custom.record_as_of` handed a member of one
  -- organization the full, unmasked state of a record in an organization she does not
  -- belong to (proven live 2026-09-23 as test@test.com, rolled back). Access is a question
  -- about the PERSON and the ROW, never about which organization was passed in
  -- (organization-is-the-container rule 5).
  select r.organization_id into v_subject_org
    from custom.record r
   where r.id = p_subject_id;

  -- Not there at all: the door raises its own 02000, the same for an invented id.
  if v_subject_org is null then
    return;
  end if;

  -- The platform's globally readable tenants (the Matrx System kernel Tables every
  -- organization builds on) stay reachable exactly as before.
  if v_subject_org is distinct from p_organization_id
     and exists (select 1 from iam.system_orgs s
                  where s.organization_id = v_subject_org and s.global_readable) then
    return;
  end if;

  -- THE ONE LADDER, asked about the row wherever it lives.
  if custom.has_visibility(v_me, 'record', p_subject_id, p_required) then
    return;
  end if;

  raise exception 'You do not have access to this %, so % has nothing to show you.',
    coalesce(nullif(btrim(p_subject_word), ''), 'record'),
    coalesce(nullif(btrim(p_door), ''), 'that door')
    using errcode = '42501',
          hint = format(
            'DOOR-1 decides reading and writing with the SAME question: a %s you may not open is a %s you may not change. This needs the %s level (viewer < commenter < editor < admin) - ask whoever holds it to share it with you, or ask an owner of this organization.',
            coalesce(nullif(btrim(p_subject_word), ''), 'record'),
            coalesce(nullif(btrim(p_subject_word), ''), 'record'),
            p_required);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.views(p_organization_id uuid, p_table_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(view_id uuid, name text, table_id uuid, filters jsonb, definition jsonb, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.views');
  return query
    select sv.id, sv.name, nullif(sv.definition ->> 'table_id', '')::uuid,
           coalesce(sv.definition -> 'filters', '{}'::jsonb),
           -- THE WHOLE DOCUMENT. The layout, the Field the board groups by, the Field the
           -- calendar reads, the sorts and the look all live in here, and the screen that
           -- drew it is the one thing that knows which of them it needs.
           coalesce(sv.definition, '{}'::jsonb),
           sv.created_at
      from platform.saved_view sv
     where sv.organization_id = p_organization_id
       and sv.deleted_at is null
       and sv.surface_key = 'custom/records'
       and (p_table_id is null or (sv.definition ->> 'table_id')::uuid = p_table_id)
       -- A LIST IS A DOOR, NEVER A GRANT ON THE THING BEHIND IT: narrowed in SQL, as
       -- the definer, to Tables this caller can already open — so the list of views
       -- can never reveal a Table.
       and (sv.definition ->> 'table_id')::uuid in
             (select v from custom.query_visible_ids(p_organization_id, custom.table_kernel_id()) v)
     order by sv.name;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.read_record(p_organization_id uuid, p_record_id uuid, p_by_id boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me  uuid := auth.uid();
  v_now uuid;
begin
  if v_me is null then
    raise exception 'Nobody is signed in, so there is nothing to read.'
      using errcode = '42501', hint = 'DOOR-1: the read door reads the person from the session.';
  end if;

  -- ARGS-RULED (2026-09-21). THE WALL IS DECIDED FIRST (REC-29).
  perform custom.assert_client_may_reach(p_organization_id, 'custom.read_record');

  -- REC-21 / T5. THE ID A MERGE SENT SOMEWHERE ELSE — a redirect, never a silent substitution.
  v_now := custom.resolve_id(p_organization_id, p_record_id);

  -- AND THE LADDER BEFORE EXISTENCE: a record you may not open and a record that is not there
  -- answer the same thing (custom.has_visibility is false for an id that is not there) - except a
  -- row of a Confidential Table this person is not named on, which answers its HEADER and nothing
  -- else: {id, exists: true, submitted_at} (CHAIR-ACCESS b, HR proof gap 4: a stamp nobody can fake).
  if not custom.has_visibility(v_me, 'record', v_now, 'viewer') then
    if custom.confidential_header(v_me, v_now) is not null then
      return custom.confidential_header(v_me, v_now);
    end if;
    raise exception 'You do not have access to this record.'
      using errcode = '42501',
            hint = 'DOOR-1: nothing reads a record around this door - not a screen, not an agent, not an export. Ask somebody who holds it to share it with you.';
  end if;

  -- DOOR-1. The rest of the door — existence, the one mask at the rung this person holds on the
  -- record, the choice words, the whole-value pointers, the alternates and the retired values —
  -- is custom._read_record_with, handed the two answers this body has just worked out.
  return (select w.o_doc
            from custom._read_record_with(p_organization_id, p_record_id, p_by_id,
                   jsonb_build_object(v_now::text, jsonb_build_object(
                     's', true, 'l', custom.effective_level(v_me, null, v_now))),
                   '{}'::jsonb) w);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.table_list_everywhere(p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me     uuid := custom.query_principal();
  v_kernel uuid := custom.table_kernel_id();
  v_field  uuid := custom.field_kernel_id();
  v_orgs   uuid[] := '{}'::uuid[];
  v_org    uuid;
  v_tables jsonb;
begin
  -- NO ORGANIZATION NAMED = the optional organization FILTER left off (org-filter sweep, 2026-09-29;
  -- access-belongs-to-the-person): the Tables the caller may open in EVERY organization she belongs
  -- to. Each organization still meets its own wall (custom.assert_client_may_reach, this door's name)
  -- and its own ladder (custom.query_visible_ids) below; an organization whose wall refuses (42501)
  -- contributes nothing. No permission is changed by this branch.
  --
  -- TABLE-LIST-PERF (2026-10-03, lane data-tables-grid-overhaul; shipped by CHAIR-GRID): ONE STATEMENT
  -- FOR EVERY ORGANIZATION. This branch used to call this same door once per organization, and each
  -- call counted rows, Fields and latest activity Table by Table and asked custom.table_placement (a
  -- scan of the organization's whole Field graph) once per Table: ~25-40 s for admin@admin.com (48
  -- organizations, ~600 Tables) against an 8 s statement limit. Now the walls are asked first, the one
  -- ladder is primed once for all admitted organizations (custom.tables_seen_once_per_group, as
  -- custom.data_home_tables does), and the counts, the Field graph and the placement are read once,
  -- set-based. Same rows, same shape, same order.
  if p_organization_id is null then
    if v_me is null then
      return jsonb_build_object('success', true, 'tables', '[]'::jsonb);
    end if;
    for v_org in
      select m.organization_id
        from iam.organization_member m
        join iam.organizations o on o.id = m.organization_id and o.archived_at is null
       where m.user_id = v_me
    loop
      begin
        perform custom.assert_client_may_reach(v_org, 'custom.table_list_everywhere');
        v_orgs := v_orgs || v_org;
      exception when insufficient_privilege then
        continue;
      end;
    end loop;
  else
    perform custom.assert_client_may_reach(p_organization_id, 'custom.table_list_everywhere');
    v_orgs := array[p_organization_id];
  end if;

  if cardinality(v_orgs) = 0 then
    return jsonb_build_object('success', true, 'tables', '[]'::jsonb);
  end if;

  -- STORE-READ-PERF-3/4: the one ladder's Table answer for every admitted organization at once; the
  -- answer waits in this statement's memo and each custom.query_visible_ids below reads its own
  -- organization's part. It decides nothing: without it every answer is the same, only slower.
  if v_me is not null then
    perform count(*) from custom.tables_seen_once_per_group(v_me, v_orgs);
  end if;

  with visible as materialized (
    select o.org, v.v as id
      from unnest(v_orgs) as o(org)
      cross join lateral custom.query_visible_ids(o.org, v_kernel) v
  ),
  tbl as materialized (
    select t.*
      from custom.record t
      join visible v on v.org = t.organization_id and v.id = t.id
     where t.table_id = v_kernel
       and t.data_class = 'table'
       and t.deleted_at is null
  ),
  activity as materialized (
    -- rows and latest activity of every listed Table, one grouped read
    select r.organization_id, r.table_id,
           max(r.updated_at) as last_updated,
           count(*) filter (where r.data_class = 'record' and r.deleted_at is null) as row_count
      from (select distinct organization_id, id from tbl) k
      join custom.record r on r.organization_id = k.organization_id and r.table_id = k.id
     group by 1, 2
  ),
  field_counts as materialized (
    -- the Field graph of the admitted organizations, read once: live Fields per Table ...
    select f.organization_id, f.data ->> 'entity_definition_id' as entity_id, count(*) as field_count
      from custom.record f
     where f.organization_id = any (v_orgs)
       and f.table_id = v_field
       and f.data_class = 'field'
       and f.deleted_at is null
     group by 1, 2
  ),
  options_tables as materialized (
    -- ... and which Tables a list Field takes its choices from (custom.table_placement's one
    -- Field-graph question, asked once for every organization instead of once per Table)
    select distinct f.organization_id, f.data -> 'config' ->> 'options_table_id' as id
      from custom.record f
     where f.organization_id = any (v_orgs)
       and f.table_id = v_field
       and f.deleted_at is null
       and f.data ->> 'type' = 'list'
       and f.data -> 'config' ->> 'options_table_id' is not null
  ),
  store as materialized (
    select jsonb_build_object(
             'id', t.id,
             'table_name', coalesce(nullif(t.data ->> 'name', ''), '(unnamed table)'),
             'description', t.data ->> 'description',
             'version', t.version,
             'user_id', t.created_by,
             'is_public', false,
             'visibility', t.visibility::text,
             'organization_id', t.organization_id,
             'created_at', t.created_at,
             'updated_at', t.updated_at,
             'last_activity_at', greatest(t.updated_at, a.last_updated),
             'row_count', coalesce(a.row_count, 0),
             'field_count', coalesce(fc.field_count, 0),
             'store', 'records')
           -- SC-1 PLACEMENT: custom.table_placement(t.organization_id, t.id, t.data, false), word for
           -- word, with its one Field-graph question answered from `options_tables` above instead of per Table.
           || (select jsonb_build_object(
                        'kept_by_the_app', d.kept,
                        'kept_for', case when d.kept then coalesce(nullif(btrim(t.data ->> 'kept_for'), ''), d.word, 'app') end,
                        'offered_as_context',
                          case when jsonb_typeof(t.data -> 'offered_as_context') = 'boolean'
                               then (t.data ->> 'offered_as_context')::boolean else false end)
                 from (select w.word,
                              (w.word is not null
                               or coalesce(t.data ->> 'kept_by_the_app', '') = 'true'
                               or coalesce(btrim(t.data ->> 'kept_for'), '') <> '') as kept
                         from (select custom.table_kept_for_derived(
                                        t.data, false,
                                        ot.id is not null) as word) w) d) as doc
      from tbl t
      left join activity a on a.organization_id = t.organization_id and a.table_id = t.id
      left join field_counts fc on fc.organization_id = t.organization_id and fc.entity_id = t.id::text
      left join options_tables ot on ot.organization_id = t.organization_id and ot.id = t.id::text
  )
  -- The order keys are the door's own (latest activity, then creation, newest first); the Table's id
  -- closes a tie so two calls page the same way (CHAIR-GRID).
  select coalesce(jsonb_agg(x.doc order by (x.doc ->> 'last_activity_at') desc nulls last,
                                           (x.doc ->> 'created_at') desc,
                                           (x.doc ->> 'id')), '[]'::jsonb)
    into v_tables
    -- APP TABLES WAIT BEHIND ONE SWITCH (lane CHAIR-DOORS-2, v6 N-C8): a Table the app keeps out of every
    -- default list (custom.table_kept_out_of_lists on its placement word) only with p_include_app_tables.
    from (select s.doc from store s
           where current_setting('custom.include_app_tables', true) is not distinct from 'on'
              or not custom.table_kept_out_of_lists(s.doc ->> 'kept_for')) x;

  return jsonb_build_object('success', true, 'tables', v_tables);
end
$function$;

delete from platform.client_callable_door
 where schema_name = 'custom'
   and function_name in ('organization_has_a_public_table', 'assert_public_reader_names_a_public_table');

drop function if exists custom.assert_public_reader_names_a_public_table(uuid, uuid, text);
drop function if exists custom._not_a_member_refusal(text);
drop function if exists custom.organization_has_a_public_table(uuid);
drop function if exists custom.door_reads_only(text);
