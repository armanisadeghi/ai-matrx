-- chair-step: lane TAG-COPY-PERF (2026-09-27). THE CONTEXT TAG COPY RUNS IN SHORT BATCHES. custom.context_tag_copy copied a whole organization's tags in ONE statement inside the follow's copy transaction: on production at 11:58Z two calls were 97 s and 56 s in (max 252 s since 12:42Z), each holding RowShare on auth.users (the created_by foreign key of every copied tag) to COMMIT, so no table could be sealed and any ACCESS EXCLUSIVE on auth.users queued sign-in behind it; from 10:49Z every copy of Aamir's Org and Arman's Org was cancelled by the owner role's 30 s statement_timeout, rolled back whole and retried whole on the next wake (432 + 6 edits waiting). NAMED CAUSE (measured on the clone, pg_stat_xact_user_functions): one new tag costs ~110 ms, 75 % of it the per-edge reachability refresh (platform.derive_reachability 82 ms, reachability_ancestors 37 ms per edge) and 23 ms the carrying-cycle check; 11,316 tag edges in one organization is minutes. Not a missing index (the organization's scan is 0.26 s for 16,800 edges), not the twin registration (one insert … on conflict do nothing). FIX THE CLASS: (1) custom.context_tag_copy_batch(org, cursor, rows) copies at most knob context/follow_batch_rows (seeded 10) tag groups after a keyset cursor and returns the next cursor, so each batch is its own short transaction that the follow (aidream matrx_records.movers.context_follow) commits before it starts the next: nothing is held across batches and a failed batch loses only itself (the committed batches read back `current` on the retry the released outbox rows bring). (2) The batch defers the reachability refresh its new tags cause (platform.reachability_defer_begin, 1381; transaction-local, trusted backend only, fail-closed until flushed); the follow flushes with platform.reachability_flush in its own short transactions. (3) The archive pass (a copied tag whose old edge is gone) is the batch's second phase, same bound. (4) custom.context_tag_copy(uuid) keeps its contract for SQL callers and tests as a loop over the batch; the follow no longer calls it. No row is changed by this file.
-- lane: TAG-COPY-PERF
-- lock: platform
-- based-on: custom.context_tag_copy(uuid) 955be971e3620fc8b92abd1556120f62b62dff9d0928e725beb88e69dcbb0f2d
--
-- Inverse: migrations/inverse/tagcopyperf_the_context_tag_copy_runs_in_short_batches_down.sql.
--
-- THE USE CASE. Arman's Org files 4,758 scopes' worth of notes, tasks and transcripts (11,316 tag
-- edges). Each edit to one of them wakes the context follow, which brings the record store's copy
-- current. Before this file that meant one transaction of minutes holding the sign-in table; a new
-- table build in any organization waited behind it and a sign-in could queue behind that. After it,
-- the same copy is a few hundred short transactions of a fraction of a second each.

set local statement_timeout = '120s';

-- ── the knob ──────────────────────────────────────────────────────────────────────────────────────
insert into platform.feature_knob (
  feature, key, value, default_value, value_type, unit,
  min_value, max_value, allowed_values, label, description,
  set_by, basis, overridable_by, override_direction, ui, propagation
)
values ('context', 'follow_batch_rows',
        to_jsonb(10), to_jsonb(10), 'integer', 'tags',
        1::numeric, 1000::numeric, null::jsonb,
        'Context copy batch size',
        'How many context tags the record store''s copy brings current in one short step. Each step is its own transaction, so a smaller number keeps every step short and never makes sign-in or a table build wait; a larger one finishes a very large organization in fewer steps.',
        'agent',
        'Lane TAG-COPY-PERF, 2026-09-27, measured on the clone (pg_stat_xact_user_functions): a NEW tag costs ~33 ms with its reachability refresh deferred (110 ms without: derive_reachability 82 ms, reachability_ancestors 37 ms per edge), an unchanged tag ~2 ms, the keyset scan of an 11,316-edge organization 7 ms (EXPLAIN ANALYZE, production). 10 new tags is ~0.35 s at the worst and ~30 ms in the common case, and the created_by foreign key holds RowShare on auth.users only for that step, so a table seal or a sign-in never waits longer than one step.',
        array[]::text[], 'any', '{}'::jsonb, 'next_load')
on conflict (feature, key) do nothing;

-- ── one batch ─────────────────────────────────────────────────────────────────────────────────────
create or replace function custom.context_tag_copy_batch(p_organization_id uuid, p_cursor jsonb default null, p_rows integer default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
declare
  g          record;
  v_rows     integer;
  v_phase    text := coalesce(p_cursor->>'phase', 'tags');
  v_t        uuid := nullif(p_cursor->>'target_id', '')::uuid;
  v_st       text := p_cursor->>'source_type';
  v_s        uuid := nullif(p_cursor->>'source_id', '')::uuid;
  v_after    uuid := nullif(p_cursor->>'after_id', '')::uuid;
  v_seen     integer := 0;
  v_next     jsonb;
  v_did      text;
  v_last_id  uuid;
  n_made    int := 0;
  n_revived int := 0;
  n_archived int := 0;
  n_updated int := 0;
  n_same    int := 0;
  n_current int := 0;
  n_waiting int := null;
  n_refused int := 0;
  v_refused jsonb := '[]'::jsonb;
begin
  if p_organization_id is null then
    raise exception 'custom.context_tag_copy_batch: name the organization whose tags to copy'
      using errcode = '22004';
  end if;
  if v_phase not in ('tags', 'archive') then
    raise exception 'custom.context_tag_copy_batch: the cursor names phase %, which is neither tags nor archive', v_phase
      using errcode = '22023', hint = 'Pass null to start, then the "next" this function returned.';
  end if;
  v_rows := coalesce(p_rows, (platform.knob_resolve('context', 'follow_batch_rows', p_organization_id) #>> '{}')::integer, 10);
  v_rows := least(greatest(v_rows, 1), 1000);
  -- WHO IS WRITING, NAMED (the provenance stamp refuses an automated write that does not say).
  if coalesce(current_setting('app.actor_system', true), '') = '' then
    perform set_config('app.actor_system', 'matrx_records.context_follow', true);
  end if;

  if p_cursor is null then
    -- EVERY SCOPE TAG TYPE HAS ITS STORE TWIN (lane PROOF-DEFECTS, D3), registered once per copy.
    insert into platform.association_types (source_type, target_type, label, container_side, conveys_max, is_active, notes)
    select a.source_type, 'record', a.label, a.container_side, a.conveys_max, true,
           'SC-4 P4: the record store''s copy of a context tag (role context_tag), twin of '
           || a.source_type || ' -> scope; same label, container side and conveyance. Written only by the context follow until the switch.'
      from platform.association_types a
     where a.target_type = 'scope' and a.is_active
       and not exists (select 1 from platform.association_types t
                        where t.source_type = a.source_type and t.target_type = 'record')
    on conflict (source_type, target_type) do nothing;

    -- A scope whose copy Record has not landed yet waits for the copy (counted once, never guessed).
    select count(distinct a.id) into n_waiting
      from platform.associations a
      join context.scopes s on s.id = a.target_id
     where a.target_type = 'scope' and s.organization_id = p_organization_id
       and not exists (select 1 from custom.record r
                        where r.organization_id = p_organization_id and r.id = a.target_id
                          and r.data_class = 'record');
  end if;

  if v_phase = 'tags' then
    -- A NEW TAG'S REACHABILITY REFRESH IS DEFERRED to platform.reachability_flush (1381): this
    -- transaction only, trusted backend only; a new edge conveys nothing until it is flushed.
    perform platform.reachability_defer_begin();
    for g in
      select distinct x.target_id, x.source_type, x.source_id
        from platform.associations x
        join context.scopes s on s.id = x.target_id
       where x.target_type = 'scope'
         and s.organization_id = p_organization_id
         and (v_t is null or (x.target_id, x.source_type, x.source_id) > (v_t, v_st, v_s))
         and exists (select 1 from custom.record r
                      where r.organization_id = p_organization_id and r.id = x.target_id
                        and r.data_class = 'record')
       order by x.target_id, x.source_type, x.source_id
       limit v_rows
    loop
      v_seen := v_seen + 1;
      v_t := g.target_id; v_st := g.source_type; v_s := g.source_id;
      begin
        -- ONE BODY FOR ONE TAG (SCOPES-WRITE-THROUGH): the per-edge write-through calls the same.
        v_did := custom._ctx_store_tag(p_organization_id, g.source_type, g.source_id, g.target_id);
        case v_did
          when 'made' then n_made := n_made + 1;
          when 'revived' then n_revived := n_revived + 1;
          when 'updated' then n_updated := n_updated + 1;
          when 'current' then n_current := n_current + 1;
          when 'archived' then n_archived := n_archived + 1;
          when 'same_edge_already_there' then n_same := n_same + 1;
          else null;
        end case;
      exception
        when check_violation or foreign_key_violation or insufficient_privilege or raise_exception then
          -- ONE TAG THE STORE REFUSES IS NAMED, AND THE REST OF THE ORGANIZATION IS COPIED (D3).
          n_refused := n_refused + 1;
          if jsonb_array_length(v_refused) < 20 then
            v_refused := v_refused || jsonb_build_array(jsonb_build_object(
              'pair', g.source_type || ' -> record',
              'source_id', g.source_id,
              'scope_id', g.target_id,
              'sqlstate', sqlstate,
              'says', left(split_part(sqlerrm, E'\n', 1), 300)));
          end if;
      end;
    end loop;
    if v_seen = v_rows then
      v_next := jsonb_build_object('phase', 'tags', 'target_id', v_t, 'source_type', v_st, 'source_id', v_s);
    else
      v_next := jsonb_build_object('phase', 'archive');
    end if;
  else
    -- A COPIED TAG WHOSE OLD EDGE IS GONE ALTOGETHER (hard-deleted on the old side) is archived.
    with pick as (
      select t.id
        from platform.associations t
       where t.target_type = 'record' and t.role = 'context_tag' and t.deleted_at is null
         and (v_after is null or t.id > v_after)
         and exists (select 1 from context.scopes s where s.id = t.target_id and s.organization_id = p_organization_id)
       order by t.id
       limit v_rows),
    gone as (
      update platform.associations t
         set deleted_at = now(), deleted_via_type = null, deleted_via_id = null
        from pick
       where t.id = pick.id
         and not exists (select 1 from platform.associations x
                          where x.target_type = 'scope' and x.target_id = t.target_id
                            and x.source_type = t.source_type and x.source_id = t.source_id)
      returning 1)
    select (select count(*) from pick), (select max(id::text)::uuid from pick), (select count(*) from gone)
      into v_seen, v_last_id, n_archived;
    v_next := case when v_seen = v_rows then jsonb_build_object('phase', 'archive', 'after_id', v_last_id) end;
  end if;

  return jsonb_build_object(
    'organization_id', p_organization_id, 'phase', v_phase, 'rows', v_rows, 'seen', v_seen,
    'made', n_made, 'revived', n_revived, 'archived', n_archived, 'updated', n_updated,
    'current', n_current, 'same_edge_already_there', n_same, 'waiting_for_the_record', n_waiting,
    'refused', n_refused, 'refused_tags', v_refused, 'next', v_next);
end;
$function$;

comment on function custom.context_tag_copy_batch(uuid, jsonb, integer) is
  'One short step of the record store''s copy of an organization''s context tags (lane TAG-COPY-PERF): at most knob context/follow_batch_rows tags after the cursor, reachability deferred to platform.reachability_flush, then the archive pass. Returns counts and "next" (null when done). The context follow commits each step before the next.';
revoke all on function custom.context_tag_copy_batch(uuid, jsonb, integer) from public, anon, authenticated;

insert into platform.client_callable_door (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
                                           non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'context_tag_copy_batch', 'p_organization_id uuid, p_cursor jsonb, p_rows integer',
        array['uuid'::regtype, 'jsonb'::regtype, 'integer'::regtype]::oid[],
        'p_organization_id names the organization whose copied tags are brought current; it is read only to select that organization''s scopes and their copy Records, and a NULL is refused (22004). p_cursor is the keyset position this function itself returned (no entity id is trusted from it beyond ordering within that organization''s own edges); p_rows is clamped to 1..1000.',
        'tagcopyperf_the_context_tag_copy_runs_in_short_batches.sql',
        'server_only: the context follow (aidream matrx_records.movers.context_follow, on the store owner''s own connection) calls it once per short batch after its copy of one organization commits; no client ever does, and the fence refuses any other writer of a copied tag.',
        false, false)
on conflict do nothing;

-- ── the whole-organization door, for SQL callers and tests: a loop over the batch ─────────────────
create or replace function custom.context_tag_copy(p_organization_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
declare
  v_cursor jsonb := null;
  b        jsonb;
  v_out    jsonb := jsonb_build_object('organization_id', p_organization_id,
                      'made', 0, 'revived', 0, 'archived', 0, 'updated', 0, 'current', 0,
                      'same_edge_already_there', 0, 'waiting_for_the_record', 0, 'refused', 0,
                      'refused_tags', '[]'::jsonb);
  k        text;
begin
  -- ONE TRANSACTION: the caller holds it. The context follow does NOT call this; it calls
  -- custom.context_tag_copy_batch and commits every step (lane TAG-COPY-PERF). This door stays for
  -- SQL tests and hand repairs, where one transaction is what the caller asked for.
  if p_organization_id is null then
    raise exception 'custom.context_tag_copy: name the organization whose tags to copy'
      using errcode = '22004';
  end if;
  loop
    b := custom.context_tag_copy_batch(p_organization_id, v_cursor, 1000);
    foreach k in array array['made','revived','archived','updated','current','same_edge_already_there','refused'] loop
      v_out := jsonb_set(v_out, array[k], to_jsonb((v_out->>k)::int + coalesce((b->>k)::int, 0)));
    end loop;
    if b ? 'waiting_for_the_record' and b->'waiting_for_the_record' <> 'null'::jsonb then
      v_out := jsonb_set(v_out, '{waiting_for_the_record}', b->'waiting_for_the_record');
    end if;
    if jsonb_array_length(v_out->'refused_tags') < 20 then
      v_out := jsonb_set(v_out, '{refused_tags}', (
        select coalesce(jsonb_agg(e), '[]'::jsonb) from (
          select e from jsonb_array_elements((v_out->'refused_tags') || coalesce(b->'refused_tags', '[]'::jsonb)) e limit 20) q));
    end if;
    v_cursor := b->'next';
    exit when v_cursor is null or v_cursor = 'null'::jsonb;
  end loop;
  -- In one transaction nothing else will flush what the batches deferred: flush it here.
  loop
    exit when platform.reachability_flush(500) = 0;
  end loop;
  return v_out;
end;
$function$;
