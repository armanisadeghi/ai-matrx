-- target: branch,production
-- additive: yes
--   It ADDS three functions — `custom.context_resolve(jsonb)` (P3 a: the turn's bound cells BY
--   ID, for the person), `custom.resolve_context(text, uuid, uuid[], uuid[])` (P3 b: the
--   record store's twin of public.resolve_full_context, every contributing record checked for
--   the person) and `custom.context_compare_facts(uuid, uuid[], uuid[])` (P9: the server-lane
--   facts the compare page classes a difference with) — with their three
--   `platform.client_callable_door` rows; it REPLACES one live
--   body, `custom.context_resolve(uuid, jsonb, text)`, with a one-line hand-off to the by-id
--   door (so the server already deployed routes by id the moment this lands). Nothing is
--   dropped, revoked or written; no table, column, trigger or policy is touched. The EXECUTE
--   grants are their own chair-step file, `sc3_the_context_doors_can_be_reached.sql`; the two
--   one-big-table fixtures are archived by `sc3_the_one_big_table_fixtures_are_archived.sql`.
--   The inverse (`migrations/inverse/sc3_the_context_door_routes_by_id_for_the_person_down.sql`)
--   restores the three-argument body byte for byte and drops the two new doors and their rows.
-- guard: custom/consumer_context_enabled
--   The only organization whose agents read the store today is the one with this ramp knob on
--   (admin's Workspace). Between this file and the flip, that organization's agents read its
--   scopes by id from the copy (at the follow's lag); every other organization's turns never
--   call this door, so nothing else reads differently.
-- based-on: custom.context_resolve(uuid, jsonb, text) 6c37cae34d10d4129210944f4ff03bff1cf984a48a9b95254cccceaf345c62ab
--
-- LANE SC-3' COMPARE — THE STORE-SIDE CONTEXT RESOLVER, ROUTED BY ID, COMPUTED FOR THE PERSON.
--
-- THE USE CASE. Priya Raman, Harborline Software's lead engineer, opens a coding chat with
-- "Harborline Dispatch" selected; her agent must know the app's tech stack and its
-- non-negotiable standards. Brightline Facilities' coordinator Jordan Ellis opens Brightline's
-- pilot task, which Brightline tagged to Harborline's Dispatch app — she is not a Harborline
-- member. Jordan is also enrolled in Cedar Ridge Tutoring's AP Chemistry class without being a
-- member of the tutoring company.
--
-- WHAT WAS WRONG (SCOPES-CONTEXT-TRANSITION rev 2, §5 D1 and D12; the attack's H4):
--   1. The bridge found "the scopes" as ONE Table slugged `scopes` and each scope as a record
--      carrying the old id in its document — a second identity, and one Table cannot hold each
--      dimension's Fields. The mover lands a Table PER scope type with the SAME ids (CUT-4), so
--      the scope id IS the record id and the slug lookup reads nothing that exists.
--   2. It read every record under the ONE organization the turn was in, so a cross-organization
--      tag (Brightline's task → Harborline's app) could not resolve at all.
--   3. The old resolver checks the person only for the SELECTION; a scope arriving through a
--      tag or a project's tag delivers every cell to whoever runs the turn. The owner's law:
--      "The permission is to the person, not the org. ALWAYS."
--
-- WHAT THIS DOES. Every record a turn names — selected, tagged, or inherited from the project —
-- is asked through `custom.where_id_opens` for THIS person (the one door that reads an object's
-- own organization; ROUTE-RESOLVER and ACCESS-IS-PERSONAL stand on it), and read through
-- `custom.read_record` under its own organization. A refusal is named, never silent. So Jordan
-- receives nothing from Harborline's app through Brightline's tag (the compare page labels the
-- old path's delivery "delivered without a check"), receives AP Chemistry through her scope
-- membership (P7's read arm, `sc3_a_scope_member_reads_the_one_record_they_were_admitted_to.sql`),
-- and Priya receives Harborline Dispatch from Brightline's task, resolved under Harborline.
-- Champion: Google Drive — what you can open is decided per item, for you, wherever it lives.

-- ═════════════════════════════════════════════════════════════════════════════════════════
-- P3 (a) — custom.context_resolve(p_bindings), BY ID, FOR THE PERSON.
-- ═════════════════════════════════════════════════════════════════════════════════════════
create function custom.context_resolve(p_bindings jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_me           uuid;
  v_binding      jsonb;
  v_record_ids   uuid[] := '{}';
  v_records      jsonb := '{}'::jsonb;
  v_scope_map    jsonb := '{}'::jsonb;
  v_orgs         jsonb := '{}'::jsonb;
  v_unresolved   jsonb := '[]'::jsonb;
  v_out          jsonb := '[]'::jsonb;
  v_rec          uuid;
  v_org          uuid;
  v_where        jsonb;
  v_doc          jsonb;
  v_hidden       jsonb;
  v_values       jsonb;
  v_row          record;
  v_key          text;
  v_field        text;
  v_cell         jsonb;
  v_sens         text;
  v_hint         text;
  v_delivery     text;
  v_note         text;
  v_fresh        text;
  v_stale        text;
  v_verdict      jsonb;
  v_order        jsonb := '{}'::jsonb;
  v_ready        text[];
  v_pending      jsonb;
  v_index        int := 0;
  v_progress     boolean;
  v_dep          jsonb;
  v_blocked      boolean;
begin
  -- THE PERSON FIRST. There is no organization argument any more: each record names its own
  -- organization (custom.where_id_opens reads it from the record), so a turn whose scopes live
  -- in two organizations — Brightline's task tagged to Harborline's app — reads each under its
  -- own, and the organization the person happens to be working in decides nothing.
  v_me := custom.query_principal();
  if v_me is null then
    raise exception 'custom.context_resolve reads context for a person, and nobody is signed in.'
      using errcode = '42501',
            hint = 'DOOR-1: the read door reads the person from the session. The server calls this door acting as the person operating the agent.';
  end if;

  if p_bindings is null or jsonb_typeof(p_bindings) <> 'array' then
    raise exception 'custom.context_resolve was asked to resolve something that is not a list of bindings.'
      using errcode = '22004',
            hint = 'Pass a JSON array of {key, scope_id|record_id, field_key} objects. A turn with no context items passes [] and gets an empty answer.';
  end if;

  if jsonb_array_length(p_bindings) = 0 then
    return jsonb_build_object(
      'scope_records', '{}'::jsonb, 'records', '{}'::jsonb, 'organizations', '{}'::jsonb,
      'bindings', '[]'::jsonb, 'unresolved', '[]'::jsonb,
      'read_as', 'the person operating this agent',
      'through', 'custom.where_id_opens, then custom.read_record under the record''s own organization',
      'principal', v_me);
  end if;

  if exists (select 1 from jsonb_array_elements(p_bindings) b where jsonb_typeof(b) <> 'object') then
    raise exception 'custom.context_resolve was handed a list whose entries are not bindings.'
      using errcode = '22004',
            hint = 'Each entry is an object: {key, scope_id|record_id, field_key}. An array of strings or numbers is not a turn''s context cells.';
  end if;

  if jsonb_array_length(p_bindings) > 500 then
    raise exception 'custom.context_resolve was handed % bindings and the ceiling is 500.',
      jsonb_array_length(p_bindings)
      using errcode = '22003',
            hint = 'A turn addresses a handful of context cells. A list this long is a caller asking for a whole catalogue, which is a different door (custom.agent_context reads a Table).';
  end if;

  -- ── 1. EVERY DISTINCT RECORD THE TURN NAMES — the scope id IS the record id ─────────────
  select array_agg(distinct x) into v_record_ids from (
    select nullif(coalesce(nullif(b ->> 'record_id', ''), b ->> 'scope_id'), '')::uuid as x
      from jsonb_array_elements(p_bindings) b
  ) s where x is not null;

  -- ── 2. EACH ONE ASKED FOR THE PERSON, THEN READ ONCE UNDER ITS OWN ORGANIZATION ─────────
  foreach v_rec in array coalesce(v_record_ids, array[]::uuid[]) loop
    -- custom.where_id_opens is the ONE answer to "which organization does this id live in, and
    -- may this person open it" (ROUTE-RESOLVER; ACCESS-IS-PERSONAL uses the same door). Null is
    -- "not given to you" and "not in the store" alike, on purpose: the store does not tell a
    -- guessed id from a real one. The unresolved row says both halves, and the turn's old value
    -- stays underneath (the fallback link), so nothing is dropped.
    v_where := custom.where_id_opens(v_rec);
    if v_where is null or v_where ->> 'kind' <> 'record' then
      v_unresolved := v_unresolved || jsonb_build_object(
        'record_id', v_rec, 'key', '*', 'reason',
        'this scope is not a record you may open in the record store — it has not been shared with you, or it has not been copied into the store yet — so its fields resolve the way they always have (nothing was dropped and nothing was guessed).');
      continue;
    end if;
    if not coalesce((v_where ->> 'live')::boolean, true) then
      v_unresolved := v_unresolved || jsonb_build_object(
        'record_id', v_rec, 'key', '*', 'reason',
        'this scope''s record is in the trash, so nothing is read from it until it is restored.');
      continue;
    end if;
    v_org := (v_where ->> 'organization_id')::uuid;
    v_orgs := v_orgs || jsonb_build_object(v_rec::text, v_org);

    begin
      v_doc := custom.read_record(v_org, v_rec, false);
    exception when others then
      -- THE DOOR'S OWN REFUSAL, CARRIED, NOT SWALLOWED.
      v_unresolved := v_unresolved || jsonb_build_object(
        'record_id', v_rec, 'key', '*', 'sqlstate', sqlstate, 'reason', sqlerrm);
      continue;
    end;

    v_scope_map := v_scope_map || jsonb_build_object(v_rec::text, v_rec);
    v_hidden := coalesce(v_doc -> '_hidden', '{}'::jsonb);
    v_values := '{}'::jsonb;

    begin
      for v_row in
        select * from custom.record_values_versioned(v_org, v_rec)
      loop
        v_values := v_values || jsonb_build_object(v_row.field_key, jsonb_build_object(
          'value',         v_doc -> v_row.field_key,
          'field_id',      v_row.field_id,
          'value_version', v_row.value_version,
          'written_at',    v_row.written_at,
          'absent_reason', v_row.absent_reason,
          'actor',         v_row.actor,
          'source',        v_row.source,
          'masked',        v_hidden ? v_row.field_key,
          'mask_reason',   v_hidden -> v_row.field_key ->> 'reason'));
      end loop;
    exception when others then
      select coalesce(jsonb_object_agg(e.key, jsonb_build_object(
               'value',         e.value,
               'field_id',      null,
               'value_version', null,
               'written_at',    null,
               'absent_reason', format('the store did not let this principal read value versions (%s) — the value is the read door''s and its version is unknown rather than guessed', sqlerrm),
               'masked',        v_hidden ? e.key,
               'mask_reason',   v_hidden -> e.key ->> 'reason')), '{}'::jsonb)
        into v_values
        from jsonb_each(v_doc - '_hidden' - '_alternates' - '_retired') e;
    end;

    v_records := v_records || jsonb_build_object(v_rec::text, v_values);
  end loop;

  -- ── 3. EVERY BINDING, WITH ITS TWO CEILINGS ───────────────────────────────────────────
  for v_binding in select b from jsonb_array_elements(p_bindings) b loop
    v_key   := v_binding ->> 'key';
    v_field := v_binding ->> 'field_key';
    -- THE SCOPE ID IS THE RECORD ID (CUT-4). No slug, no document key, no second identity.
    v_rec   := nullif(coalesce(nullif(v_binding ->> 'record_id', ''), v_binding ->> 'scope_id'), '')::uuid;

    if v_rec is null then
      v_unresolved := v_unresolved || jsonb_build_object(
        'key', v_key,
        'reason', 'this binding names no scope and no record, so there is nothing to read for it (nothing was dropped and nothing was guessed).');
      continue;
    end if;
    if not (v_records ? v_rec::text) then
      continue;  -- the record's own refusal is already in v_unresolved, with its sentence
    end if;

    -- AGT-7's SENSITIVITY CEILING. Delivery may not widen what sensitivity allows. A
    -- restricted field is not dropped — dropping a real value is worse — it is moved off
    -- the inline tier so the agent fetches it when it actually needs it.
    v_hint := lower(coalesce(nullif(btrim(v_binding ->> 'fetch_hint'), ''), 'always'));
    v_sens := lower(coalesce(nullif(btrim(v_binding ->> 'sensitivity'), ''), ''));
    v_note := null;
    v_delivery := case v_hint
                    when 'always' then 'inline'
                    when 'on_demand' then 'on_demand'
                    when 'lazy' then 'on_demand'
                    when 'batch_related' then 'on_demand'
                    else null
                  end;
    if v_delivery is null then
      v_delivery := 'inline';
      v_note := format('this field asks to be fetched %L, which is not a delivery this system knows; it is delivered inline rather than dropped', v_hint);
    end if;
    if v_delivery = 'inline' and v_sens in ('restricted', 'privileged', 'confidential') then
      v_delivery := 'on_demand';
      v_note := format('this field is %s, so it is never written into the prompt unasked — the agent fetches it when it needs it (AGT-7)', v_sens);
    end if;

    v_cell := v_records -> v_rec::text -> v_field;
    if v_cell is null then
      v_unresolved := v_unresolved || jsonb_build_object(
        'key', v_key, 'record_id', v_rec,
        'reason', format('the record this field points at has no field %L you can read', v_field));
      continue;
    end if;

    -- §D's FRESHNESS CEILING. THE RULE IS NOT WRITTEN HERE ANY MORE — it is
    -- `custom.freshness_verdict`, the one implementation this door, the merge resolver and
    -- every screen that shows a value's age all read. What used to be eighteen lines of the
    -- same arithmetic is one call, and a second copy of it anywhere now fails
    -- `pnpm check:one-freshness-ceiling`.
    v_verdict := custom.freshness_verdict(
                   nullif(v_cell ->> 'written_at', '')::timestamptz,
                   nullif(v_binding ->> 'freshness_seconds', '')::numeric);
    v_fresh := v_verdict ->> 'freshness';
    v_stale := v_verdict ->> 'stale_note';

    v_out := v_out || jsonb_build_object(
      'key',           v_key,
      'scope_id',      v_binding -> 'scope_id',
      'record_id',     v_rec,
      'field_key',     v_field,
      'field_id',      v_cell -> 'field_id',
      'value',         v_cell -> 'value',
      'value_version', v_cell -> 'value_version',
      'written_at',    v_cell -> 'written_at',
      'masked',        v_cell -> 'masked',
      'mask_reason',   v_cell -> 'mask_reason',
      'absent_reason', v_cell -> 'absent_reason',
      'delivery',      v_delivery,
      'delivery_note', v_note,
      'freshness',     v_fresh,
      'stale_note',    v_stale,
      -- CARRIED, and this is not decoration: the ordering step below reads `depends_on`
      -- off these rows. Leaving it out made `v_pending` a map of empty arrays, so every
      -- binding looked ready at once and the order was whatever `jsonb_object_keys`
      -- happened to answer — which the seat suite caught as `2 < 0`.
      'depends_on',    coalesce(v_binding -> 'depends_on', '[]'::jsonb));
  end loop;

  -- ── 4. `depends_on` ORDER, AND A CYCLE NAMED RATHER THAN LOOPED ───────────────────────
  -- DYN-9 belongs at SAVE time and this is not save time, so a circle written before anybody
  -- checked it must not end somebody's turn. The bindings inside it are ordered last, and the
  -- answer SAYS which keys made the circle so the panel can render the remedy.
  select coalesce(jsonb_object_agg(b ->> 'key', coalesce(b -> 'depends_on', '[]'::jsonb)), '{}'::jsonb)
    into v_pending
    from jsonb_array_elements(v_out) b;

  loop
    v_progress := false;
    v_ready := '{}';
    for v_key in select k from jsonb_object_keys(v_pending) k loop
      v_blocked := false;
      for v_dep in select d from jsonb_array_elements(v_pending -> v_key) d loop
        if v_pending ? (v_dep #>> '{}') and (v_dep #>> '{}') <> v_key then
          v_blocked := true;
        end if;
      end loop;
      if not v_blocked then
        v_ready := v_ready || v_key;
      end if;
    end loop;
    exit when coalesce(array_length(v_ready, 1), 0) = 0;
    foreach v_key in array v_ready loop
      v_order := v_order || jsonb_build_object(v_key, v_index);
      v_index := v_index + 1;
      v_pending := v_pending - v_key;
      v_progress := true;
    end loop;
    exit when not v_progress;
  end loop;

  if v_pending <> '{}'::jsonb then
    v_unresolved := v_unresolved || jsonb_build_object(
      'key', (select string_agg(k, ' -> ') from jsonb_object_keys(v_pending) k),
      'reason', 'these context fields depend on each other in a circle, so no order can satisfy them all. They are resolved last, in the order they were declared, and the circle is what to fix.');
    for v_key in select k from jsonb_object_keys(v_pending) k loop
      v_order := v_order || jsonb_build_object(v_key, v_index);
      v_index := v_index + 1;
    end loop;
  end if;

  select coalesce(jsonb_agg(b || jsonb_build_object('order_index', v_order -> (b ->> 'key'))
                            order by coalesce((v_order ->> (b ->> 'key'))::int, 2147483647)), '[]'::jsonb)
    into v_out
    from jsonb_array_elements(v_out) b;


  return jsonb_build_object(
    'scope_records', v_scope_map,
    'records',       v_records,
    'organizations', v_orgs,
    'bindings',      v_out,
    'unresolved',    v_unresolved,
    'read_as',       'the person operating this agent',
    'through',       'custom.where_id_opens, then custom.read_record under the record''s own organization',
    'principal',     v_me);
end;
$function$;

comment on function custom.context_resolve(jsonb) is
  'P3 (a), lane SC-3''. A whole turn''s bound context cells in one round trip, BY ID and FOR THE '
  'PERSON: a binding''s scope id IS the record id (CUT-4); each record''s organization and the '
  'person''s right to open it come from custom.where_id_opens; the values come from '
  'custom.read_record under that organization, masked for the person, with the triple from '
  'custom.record_values_versioned. Unresolved rows carry the reason in words. Retires the '
  'slug bridge (one Table slugged `scopes`, a record found by a document key).';

-- ═════════════════════════════════════════════════════════════════════════════════════════
-- P3 (b) — custom.resolve_context: resolve_full_context's answer, from the record store,
-- with EVERY contributing record checked for the person.
-- ═════════════════════════════════════════════════════════════════════════════════════════
create function custom.resolve_context(p_entity_type text,
                                       p_entity_id uuid,
                                       p_record_ids uuid[] default null,
                                       p_table_ids uuid[] default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_me          uuid := custom.query_principal();
  v_org_id      uuid;
  v_project_id  uuid;
  v_task_id     uuid;
  v_cands       jsonb := '[]'::jsonb;   -- [{record_id, via}] in contribution order
  v_checks      jsonb := '[]'::jsonb;   -- one row per candidate: admitted or refused, and why
  v_withheld    jsonb := '[]'::jsonb;   -- a field the person may not see on an admitted record
  v_admitted    jsonb := '[]'::jsonb;   -- [{record_id, organization_id, table_id, name, type_label, via}]
  v_tables      jsonb := '[]'::jsonb;
  v_scope_labels jsonb := '{}'::jsonb;
  v_variables   jsonb := '{}'::jsonb;
  v_sources     jsonb := '{}'::jsonb;
  v_cells       jsonb := '{}'::jsonb;
  v_cell        jsonb;
  v_where       jsonb;
  v_doc         jsonb;
  v_hidden      jsonb;
  v_table       custom.record;
  v_title_field text;
  v_label       text;
  v_name        text;
  v_inject      text;
  v_org         uuid;
  v_rec         uuid;
  v_via         text;
  v_versions    jsonb;
  c             jsonb;
  a             jsonb;
  f             record;
  rec           record;
begin
  if v_me is null then
    raise exception 'custom.resolve_context resolves context for a person, and nobody is signed in.'
      using errcode = '42501',
            hint = 'The server calls this door acting as the person operating the agent (DOOR-1).';
  end if;

  -- ── THE ENTITY: where the turn lives (read exactly as public.resolve_full_context reads it) ─
  if p_entity_type = 'task' then
    select t.project_id, p.organization_id, t.id
      into v_project_id, v_org_id, v_task_id
      from workspace.tasks t left join workspace.projects p on t.project_id = p.id
     where t.id = p_entity_id;
  elsif p_entity_type = 'project' then
    select p.organization_id, p.id into v_org_id, v_project_id
      from workspace.projects p where p.id = p_entity_id;
  elsif p_entity_type = 'conversation' then
    select c2.organization_id,
           (select a2.target_id from platform.associations_live a2
             where a2.source_type = 'conversation' and a2.source_id = c2.id
               and a2.target_type = 'project' and a2.organization_id = c2.organization_id
             order by a2.position nulls last, a2.created_at, a2.id limit 1),
           c2.task_id
      into v_org_id, v_project_id, v_task_id
      from chat.conversation c2 where c2.id = p_entity_id;
  elsif p_entity_type = 'note' then
    select n.organization_id,
           (select a2.target_id from platform.associations_live a2
             where a2.source_type = 'note' and a2.source_id = n.id and a2.target_type = 'project'
             order by a2.position nulls last, a2.created_at, a2.id limit 1),
           (select a2.target_id from platform.associations_live a2
             where a2.source_type = 'note' and a2.source_id = n.id and a2.target_type = 'task'
             order by a2.position nulls last, a2.created_at, a2.id limit 1)
      into v_org_id, v_project_id, v_task_id
      from workbench.notes n where n.id = p_entity_id;
  end if;

  -- ── THE CANDIDATES, in the old resolver's own order: the entity's tags, else its project's,
  --    then the selection. A tag is read by its TARGET ID whichever token the edge carries —
  --    `scope` today, the `custom_record` twin once SC-2' writes it (same id, CUT-4) — and in
  --    ANY organization, because the edge belongs to the entity's organization and the record
  --    to its own (Brightline's task, Harborline's app).
  select coalesce(jsonb_agg(jsonb_build_object('record_id', t.target_id, 'via', 'entity_tag') order by t.first_at, t.target_id), '[]'::jsonb)
    into v_cands
    from (select a2.target_id, min(a2.created_at) as first_at
            from platform.associations_live a2
           where a2.source_type = p_entity_type and a2.source_id = p_entity_id
             and a2.target_type in ('scope', 'custom_record')
           group by a2.target_id) t;

  if jsonb_array_length(v_cands) = 0 and v_project_id is not null and p_entity_type <> 'project' then
    select coalesce(jsonb_agg(jsonb_build_object('record_id', t.target_id, 'via', 'project_tag') order by t.first_at, t.target_id), '[]'::jsonb)
      into v_cands
      from (select a2.target_id, min(a2.created_at) as first_at
              from platform.associations_live a2
             where a2.source_type = 'project' and a2.source_id = v_project_id
               and a2.target_type in ('scope', 'custom_record')
             group by a2.target_id) t;
  end if;

  if p_record_ids is not null then
    select v_cands || coalesce(jsonb_agg(jsonb_build_object('record_id', s.id, 'via', 'selection') order by s.ord), '[]'::jsonb)
      into v_cands
      from unnest(p_record_ids) with ordinality as s(id, ord)
     where s.id is not null
       and not (v_cands @> jsonb_build_array(jsonb_build_object('record_id', s.id)));
  end if;

  -- ── EVERY CANDIDATE CHECKED FOR THE PERSON — the one rule changed on purpose ──────────────
  -- The old resolver checked only the selection; a tag and a project's tag delivered every
  -- cell to whoever ran the turn. Here each record, however it arrived, is asked through
  -- custom.where_id_opens: organization members, direct and outside grants, and (P7's read
  -- arm) a scope membership on that record. What is refused is NAMED in `checks`, never
  -- dropped in silence.
  for c in select value from jsonb_array_elements(v_cands) loop
    v_rec := (c ->> 'record_id')::uuid;
    v_via := c ->> 'via';
    v_where := custom.where_id_opens(v_rec);
    if v_where is null then
      v_checks := v_checks || jsonb_build_object('record_id', v_rec, 'via', v_via, 'admitted', false,
        'reason', 'not_opened',
        'says', 'This scope is not one you may open in the record store — it has not been shared with you, or it has not been copied into the store yet.');
      continue;
    end if;
    if v_where ->> 'kind' <> 'record' then
      v_checks := v_checks || jsonb_build_object('record_id', v_rec, 'via', v_via, 'admitted', false,
        'reason', 'not_a_record', 'kind', v_where ->> 'kind',
        'says', 'That id opens something that is not a record, so it carries no context values.');
      continue;
    end if;
    if not coalesce((v_where ->> 'live')::boolean, true) then
      v_checks := v_checks || jsonb_build_object('record_id', v_rec, 'via', v_via, 'admitted', false,
        'reason', 'in_trash', 'organization_id', v_where -> 'organization_id',
        'says', 'This scope''s record is in the trash, so nothing is read from it until it is restored.');
      continue;
    end if;

    v_org := (v_where ->> 'organization_id')::uuid;
    begin
      v_doc := custom.read_record(v_org, v_rec, false);
    exception when others then
      v_checks := v_checks || jsonb_build_object('record_id', v_rec, 'via', v_via, 'admitted', false,
        'reason', 'door_refused', 'organization_id', v_org, 'sqlstate', sqlstate, 'says', sqlerrm);
      continue;
    end;

    select r.* into v_table
      from custom.record r
     where r.id = (select x.table_id from custom.record x where x.organization_id = v_org and x.id = v_rec)
       and r.table_id = custom.table_kernel_id()
     limit 1;
    v_title_field := coalesce(nullif(v_table.data ->> 'title_field', ''), 'name');
    v_label := coalesce(nullif(v_table.data ->> 'label_singular', ''), nullif(v_table.data ->> 'name', ''), 'record');
    v_name := coalesce(nullif(v_doc ->> v_title_field, ''), v_rec::text);
    v_hidden := coalesce(v_doc -> '_hidden', '{}'::jsonb);

    v_checks := v_checks || jsonb_build_object('record_id', v_rec, 'via', v_via, 'admitted', true,
      'organization_id', v_org, 'table_id', v_table.id, 'name', v_name);
    -- THE TRIPLE, so the compare page can say which side is behind (copy lag) rather than
    -- merely that two values differ. Asked as the caller; a refusal leaves versions unknown.
    begin
      select coalesce(jsonb_object_agg(vv.field_key, jsonb_build_object(
               'value_version', vv.value_version, 'written_at', vv.written_at)), '{}'::jsonb)
        into v_versions
        from custom.record_values_versioned(v_org, v_rec) vv;
    exception when others then
      v_versions := '{}'::jsonb;
    end;
    v_admitted := v_admitted || jsonb_build_object('record_id', v_rec, 'organization_id', v_org,
      'table_id', v_table.id, 'name', v_name, 'type_label', lower(v_label), 'via', v_via,
      'doc', v_doc - '_hidden' - '_alternates' - '_retired' - '_redirected_from' - '_redirect_says',
      'hidden', v_hidden, 'title_field', v_title_field, 'versions', v_versions);
  end loop;

  -- ── THE ACTIVE TABLES with no record chosen ("I'm working in Clients") — named, for the person ─
  if p_table_ids is not null then
    select coalesce(jsonb_agg(t.id), '[]'::jsonb) into v_tables
      from unnest(p_table_ids) t(id)
     where coalesce(custom.where_id_opens(t.id) ->> 'kind', '') = 'table';
  end if;

  -- ── SCOPE LABELS: every admitted record's name under its Table's singular label ────────────
  select coalesce(jsonb_object_agg(x.type_label, x.names), '{}'::jsonb)
    into v_scope_labels
    from (
      select e ->> 'type_label' as type_label,
             case when count(*) > 1 then jsonb_agg(e ->> 'name' order by e ->> 'name')
                  else to_jsonb(min(e ->> 'name')) end as names
        from jsonb_array_elements(v_admitted) e
       group by e ->> 'type_label'
    ) x;

  -- ── THE SYSTEM LANE, unchanged: System context stays its own table (§5 D10) ───────────────
  for rec in (
    select sci.id as context_item_id, sci.key, sci.description,
           sci.value_type::text as value_type, sci.value as value
      from context.system_context_item sci
     where sci.is_active = true and sci.deleted_at is null and sci.feed_type != 'dataset'
     order by sci.sort_order asc, sci.key asc
  ) loop
    continue when rec.value is null;
    v_cell := jsonb_build_object(
      'key', rec.key, 'value', rec.value, 'type', rec.value_type, 'description', rec.description,
      'context_item_id', rec.context_item_id,
      'scope_id', null, 'scope_name', 'System', 'scope_type_id', null, 'source', 'system');
    v_variables := v_variables || jsonb_build_object(rec.key, jsonb_build_object(
      'value', rec.value, 'type', rec.value_type, 'inject_as', 'direct',
      'source', 'system', 'description', rec.description,
      'cells', coalesce(v_variables -> rec.key -> 'cells', '[]'::jsonb) || jsonb_build_array(v_cell)));
    v_sources := v_sources || jsonb_build_object(rec.key, 'system');
    v_cells := v_cells || jsonb_build_object(rec.context_item_id::text,
      coalesce(v_cells -> rec.context_item_id::text, '[]'::jsonb) || jsonb_build_array(v_cell));
  end loop;

  for rec in (
    select sci.id as context_item_id, sci.key, sci.description, sci.display_name,
           sci.feed_config as feed_config
      from context.system_context_item sci
     where sci.is_active = true and sci.deleted_at is null and sci.feed_type = 'dataset'
       and sci.feed_config ? 'data_store_id'
     order by sci.sort_order asc, sci.key asc
  ) loop
    v_cell := jsonb_build_object(
      'key', rec.key,
      'value', jsonb_build_object('kind', 'dataset',
          'data_store_id', rec.feed_config->>'data_store_id',
          'name', coalesce(rec.feed_config->>'data_store_name', rec.display_name),
          'short_code', rec.feed_config->>'data_store_short_code'),
      'type', 'dataset', 'description', rec.description,
      'context_item_id', rec.context_item_id,
      'scope_id', null, 'scope_name', 'System', 'scope_type_id', null, 'source', 'system');
    v_variables := v_variables || jsonb_build_object(rec.key, jsonb_build_object(
      'value', jsonb_build_object('kind', 'dataset',
          'data_store_id', rec.feed_config->>'data_store_id',
          'name', coalesce(rec.feed_config->>'data_store_name', rec.display_name),
          'short_code', rec.feed_config->>'data_store_short_code',
          'hint', 'Knowledge resource — query it with the RAG tools, e.g. knowledge_search(data_store_id=<data_store_id>).'),
      'type', 'dataset', 'inject_as', 'reference', 'source', 'system', 'description', rec.description,
      'cells', coalesce(v_variables -> rec.key -> 'cells', '[]'::jsonb) || jsonb_build_array(v_cell)));
    v_sources := v_sources || jsonb_build_object(rec.key, 'system');
    v_cells := v_cells || jsonb_build_object(rec.context_item_id::text,
      coalesce(v_cells -> rec.context_item_id::text, '[]'::jsonb) || jsonb_build_array(v_cell));
  end loop;

  -- ── THE RECORDS' FIELDS: every declared Field of each admitted record, except its title and a
  --    Field declared `exclude` — in Table, Field and record order, as the old resolver orders
  --    scope type, context item and scope. A Field this person may not see is WITHHELD and
  --    named; a relation (a reference) moves to the on-demand tier, where DYN-17 says it belongs
  --    — the one declared tier move.
  for rec in (
    select e.value as a, fr.id as field_id, fr.data ->> 'key' as fkey, fr.data ->> 'type' as ftype,
           fr.data ->> 'label' as flabel, fr.data ->> 'description' as fdesc,
           coalesce(nullif(fr.data ->> 'sort', '')::int, 0) as fsort
      from jsonb_array_elements(v_admitted) with ordinality e(value, ord)
      join custom.record fr
        on fr.organization_id = (e.value ->> 'organization_id')::uuid
       and fr.table_id = custom.field_kernel_id()
       and fr.deleted_at is null
       and (fr.data ->> 'entity_definition_id')::uuid = (e.value ->> 'table_id')::uuid
     where fr.data ->> 'key' is distinct from (e.value ->> 'title_field')
       and coalesce(fr.data ->> 'context_policy', 'include') <> 'exclude'
     order by e.value ->> 'type_label', coalesce(nullif(fr.data ->> 'sort', '')::int, 0),
              e.value ->> 'name', e.value ->> 'record_id'
  ) loop
    a := rec.a;
    if (a -> 'hidden') ? rec.fkey then
      v_withheld := v_withheld || jsonb_build_object(
        'record_id', a -> 'record_id', 'record_name', a -> 'name', 'key', rec.fkey,
        'reason', coalesce(a -> 'hidden' -> rec.fkey ->> 'reason', 'this field is not visible at your level'));
      continue;
    end if;
    continue when (a -> 'doc' -> rec.fkey) is null or jsonb_typeof(a -> 'doc' -> rec.fkey) = 'null';
    v_inject := case when rec.ftype in ('relation', 'entity_reference') then 'tool_accessible' else 'direct' end;
    v_cell := jsonb_build_object(
      'key', rec.fkey, 'value', a -> 'doc' -> rec.fkey, 'type', rec.ftype,
      'description', coalesce(rec.fdesc, rec.flabel),
      'context_item_id', rec.field_id,
      'scope_id', a -> 'record_id', 'scope_name', a -> 'name', 'scope_type_id', a -> 'table_id',
      'organization_id', a -> 'organization_id', 'via', a -> 'via',
      'value_version', a -> 'versions' -> rec.fkey -> 'value_version',
      'written_at', a -> 'versions' -> rec.fkey -> 'written_at',
      'source', 'scope:' || (a ->> 'name'));
    v_variables := v_variables || jsonb_build_object(rec.fkey, jsonb_build_object(
      'value', a -> 'doc' -> rec.fkey, 'type', rec.ftype, 'inject_as', v_inject,
      'source', 'scope:' || (a ->> 'name'), 'description', coalesce(rec.fdesc, rec.flabel),
      'cells', coalesce(v_variables -> rec.fkey -> 'cells', '[]'::jsonb) || jsonb_build_array(v_cell)));
    v_sources := v_sources || jsonb_build_object(rec.fkey, 'scope:' || (a ->> 'name'));
    v_cells := v_cells || jsonb_build_object(rec.field_id::text,
      coalesce(v_cells -> rec.field_id::text, '[]'::jsonb) || jsonb_build_array(v_cell));
  end loop;

  return jsonb_build_object(
    'scope_labels', v_scope_labels,
    'variables',    v_variables,
    'sources',      v_sources,
    'cell_values',  v_cells,
    'context', jsonb_build_object(
      'user_id', v_me, 'organization_id', v_org_id, 'project_id', v_project_id, 'task_id', v_task_id,
      'scope_ids', coalesce((select jsonb_agg(e -> 'record_id') from jsonb_array_elements(v_admitted) e), '[]'::jsonb),
      'table_ids', v_tables),
    'checks',       v_checks,
    'withheld',     v_withheld,
    'resolved_at',  extract(epoch from now()),
    'read_as',      'the person operating this agent',
    'through',      'custom.where_id_opens for every contributing record, then custom.read_record under that record''s own organization');
end;
$function$;

comment on function custom.resolve_context(text, uuid, uuid[], uuid[]) is
  'P3 (b), lane SC-3''. The record store''s twin of public.resolve_full_context, in the same shape '
  '{scope_labels, variables, sources, cell_values, context, resolved_at} plus checks and withheld. '
  'ONE RULE CHANGED ON PURPOSE: every contributing record — the selection, the entity''s tags, the '
  'project''s tags — is checked for the person through custom.where_id_opens (members, direct and '
  'outside grants, and a scope membership through custom.scope_member_reaches), and read under '
  'its own organization. What is refused is named in `checks`; a Field the person may not see is '
  'named in `withheld`. A relation Field is delivered on demand (DYN-17). Writes nothing.';

-- ═════════════════════════════════════════════════════════════════════════════════════════
-- P9's FACTS — the three things the compare page needs to CLASS a difference, server lane only.
-- ═════════════════════════════════════════════════════════════════════════════════════════
-- When the old path delivered a scope the new path did not, the difference is one of three
-- things and the page must say which: the scope is not copied yet (copy lag), the person could
-- never read it on the old side either and a tag delivered it unchecked (old path delivered
-- without a check), or the person reads it on the old side and the new side refuses (a
-- defect). Only the server can know which without telling a person whether an id exists, so
-- this is a SERVER-LANE door: no client grant, called by aidream's compare builder as the store
-- owner, and only for ids the old path ALREADY delivered to that person in the same answer.
create function custom.context_compare_facts(p_user_id uuid, p_record_ids uuid[], p_item_ids uuid[] default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_records jsonb;
  v_items   jsonb;
  v_follow  jsonb;
begin
  select coalesce(jsonb_object_agg(x.id::text, jsonb_build_object(
           'in_store', exists (select 1 from custom.record r where r.id = x.id and r.deleted_at is null),
           'in_store_trash', exists (select 1 from custom.record r where r.id = x.id and r.deleted_at is not null),
           'old_readable', coalesce(context._scope_readable_for(p_user_id, x.id, 'viewer'), false))), '{}'::jsonb)
    into v_records
    from (select distinct unnest(coalesce(p_record_ids, '{}'::uuid[])) as id) x
   where x.id is not null;

  select coalesce(jsonb_object_agg(ci.id::text, jsonb_build_object(
           'old_active', ci.is_active and ci.deleted_at is null,
           'old_fetch_hint', ci.fetch_hint::text)), '{}'::jsonb)
    into v_items
    from context.context_items ci
   where ci.id = any (coalesce(p_item_ids, '{}'::uuid[]));

  -- THE FOLLOW'S LAG (P8, lane SC-2'): what the old-wins follow has not applied yet. Until
  -- SC-2' lands the follow there is no `context.follow` row at all, and the page says so.
  select jsonb_build_object(
           'running', exists (select 1 from custom.io_outbox o where o.event_key = 'context.follow'),
           'pending', count(*) filter (where o.consumed_at is null),
           'oldest_pending_at', min(o.created_at) filter (where o.consumed_at is null),
           'last_applied_at', max(o.consumed_at))
    into v_follow
    from custom.io_outbox o
   where o.event_key = 'context.follow';

  return jsonb_build_object('records', v_records, 'items', v_items, 'follow', v_follow);
end;
$function$;

comment on function custom.context_compare_facts(uuid, uuid[], uuid[]) is
  'P9, lane SC-3''. SERVER LANE ONLY (no client grant). For the compare page: per record id, '
  'whether the store holds it (live / in the trash) and whether p_user_id reads it on the old '
  'side; per context item id, whether it is active and its fetch hint; and the follow''s lag. '
  'Called by aidream''s compare builder only for ids the old path already delivered to that '
  'person. Writes nothing.';

-- ═════════════════════════════════════════════════════════════════════════════════════════
-- THE SLUG BRIDGE, RETIRED: the three-argument door hands off to the by-id door.
-- ═════════════════════════════════════════════════════════════════════════════════════════
-- The server already deployed calls this signature. Its two extra arguments are no longer
-- read: the organization is each record's own (custom.where_id_opens), and there is no Table
-- slugged `scopes` to look for. Deleted once the server calls custom.context_resolve(jsonb)
-- everywhere (matrx_records RecordStore.context_resolve does from lane SC-3').
create or replace function custom.context_resolve(p_organization_id uuid, p_bindings jsonb, p_scope_slug text default 'scopes'::text)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog'
as $function$
begin
  -- RETIRED SHAPE (lane SC-3', SCOPES-CONTEXT-TRANSITION §5 D1). p_organization_id and
  -- p_scope_slug are accepted so a caller built before this file keeps working, and ignored:
  -- the scope id IS the record id, and each record names its own organization.
  return custom.context_resolve(p_bindings);
end;
$function$;

-- ═════════════════════════════════════════════════════════════════════════════════════════
-- THE TWO DOORS, DECLARED (the grants are the chair-step file).
-- ═════════════════════════════════════════════════════════════════════════════════════════
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('custom', 'context_resolve',
   'p_bindings jsonb',
   array['jsonb'::regtype]::oid[],
   'Refuses a signed-out caller (42501). Every record id a binding names (record_id, or scope_id — the same id) is asked through custom.where_id_opens for the calling person: members, direct and outside grants, and a live scope membership (custom.scope_member_reaches) admit; anything else is an unresolved row with its reason, and the value is never read. Admitted records are read through custom.read_record under their own organization, masked for the person, versions from custom.record_values_versioned. It writes nothing.',
   'sc3_the_context_door_routes_by_id_for_the_person.sql',
   null, true, false),
  ('custom', 'resolve_context',
   'p_entity_type text, p_entity_id uuid, p_record_ids uuid[], p_table_ids uuid[]',
   array['text'::regtype, 'uuid'::regtype, 'uuid[]'::regtype, 'uuid[]'::regtype]::oid[],
   'Refuses a signed-out caller (42501). p_entity_id is read only to find the entity''s organization, project, task and tags, exactly as public.resolve_full_context reads them; it returns no field of the entity. Every contributing record — each of p_record_ids, each tag target, each project-tag target — is asked through custom.where_id_opens for the calling person and read through custom.read_record under its own organization; a refused one is a checks row saying so, never a value. p_table_ids are named back only when where_id_opens says the person may open them. It writes nothing.',
   'sc3_the_context_door_routes_by_id_for_the_person.sql',
   null, true, false),
  ('custom', 'context_compare_facts',
   'p_user_id uuid, p_record_ids uuid[], p_item_ids uuid[]',
   array['uuid'::regtype, 'uuid[]'::regtype, 'uuid[]'::regtype]::oid[],
   'Returns booleans and a fetch hint per id, never a value, a name or a field. p_user_id is the person the compare page is for (the server passes the authenticated caller); p_record_ids and p_item_ids are only ids the old context path already delivered to that person in the same answer. It writes nothing.',
   'sc3_the_context_door_routes_by_id_for_the_person.sql',
   'server_only: aidream''s agent-context compare builder (conversation_context/context_compare.py) calls it as the store owner to class a difference between the two resolvers; no client ever calls it, because telling a person whether an id is in the store is not a question a browser may ask.',
   false, false)
on conflict do nothing;
