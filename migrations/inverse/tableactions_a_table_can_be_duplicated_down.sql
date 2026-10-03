-- chair-step: this puts back the seven peer bodies tableactions_a_table_can_be_duplicated.sql replaced — custom.table_kept_out_of_lists, custom.tables_at_home, custom.assert_may_know_table, custom.assert_client_may_open, custom.assert_client_may_change, custom._field_reads_what_it_reads and custom.trg_associations_bump_visibility — byte for byte what pg_get_functiondef answered on the dev clone (exerfbdiksdjilwerpda, a copy of production) on 2026-10-03 before it ran; REVOKEs EXECUTE on custom.table_duplicate(uuid, boolean, text, uuid), custom.table_duplicate_continue(uuid) and custom.table_copies_in_progress() from `authenticated`, closes their platform.client_callable_door rows and DROPs the eleven functions the file added. Copies already handed over stay: they are ordinary Tables. A copy left half-made stays as it is (kept_for copying, out of every list); after this it is an ordinary kept table its maker can archive. The schema-wide door-reopen sweep is held off for this transaction only, as in the up file.
-- lane: TABLE-ACTIONS
-- lock: custom
-- based-on: custom.table_kept_out_of_lists(text) a9c57ea71bae062f257cedf6a69931a975f8de65e5209fe9c7d52b5e7dd4f2df
-- based-on: custom.assert_may_know_table(uuid, uuid, text) 9af51d73ea1e28b24ab5e4c3912b99a8e040bfdd80005096240f2f8b682589cd
-- based-on: custom.assert_client_may_open(uuid, uuid, text, permission_level, text) 0bd7a22f5a489d6452baa82b9cc7abc8010b942a06ce696c1bc0c56332aabe24
-- based-on: custom.assert_client_may_change(uuid, uuid, text, permission_level, text) 1c89432ef5f8508dd465106e6bcf7697aa49c1481b5de5c14d4519595a9a00d4
-- based-on: custom._field_reads_what_it_reads() 5d5ae705f31cc077940ca85aeff9543fcf7d688e6db8988294f0c14cd34bdef3
-- based-on: custom.trg_associations_bump_visibility() 10bb47e158f5a91c8a9e8437592b1886fb809a83d5aa8e33381678e92afb210c
-- based-on: custom.tables_at_home(uuid, uuid[]) 5117705bd62869fe41c83d3a2645cdc0a1b0227cbd01fa112b8f76fc2063172e
--
-- The door register hands a declared signed-in door its grant straight back
-- (platform.reopen_declared_doors), so the rows are closed first, with the reason, then the
-- grants are taken back and the functions dropped; the rows are then removed.

select set_config('platform.closed_schema_sweep', '1', true);

-- THE SEVEN PEER BODIES, PUT BACK FIRST (they call custom._copy_in_progress_guard, dropped below).
CREATE OR REPLACE FUNCTION custom.table_kept_out_of_lists(p_kept_for text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog'
AS $function$
  -- WHICH PLACEMENT WORDS STAY OUT OF EVERY DEFAULT LIST (lane CHAIR-DOORS-2, v6 N-C8). One word today:
  -- agent_output — the table an agent's outputs land in (KINDS-GLUE wave 2). A list shows such a Table
  -- only when its caller asks (p_include_app_tables). Null and every other word: not kept out.
  select coalesce(p_kept_for, '') = any (array['agent_output'])
$function$;

CREATE OR REPLACE FUNCTION custom.tables_at_home(p_organization_id uuid, p_home_ids uuid[])
 RETURNS TABLE(table_id uuid, home_record_id uuid, kind text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
declare
  v_me uuid := custom.query_principal();
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.tables_at_home');
  -- THIS DOOR TAKES A LIST, so the answer is FILTERED rather than refused: asking about ten
  -- homes and being refused because one of them is somebody else's would be a different
  -- leak, told the other way round. Both ends are asked — the Home the placement is in and
  -- the Table it places — because either one alone tells her something (VIS-5).
  return query
    select h.table_id, h.home_record_id, h.kind
      from custom.home h
     where h.organization_id = p_organization_id
       and h.home_record_id = any (p_home_ids)
       and (custom.query_is_store_owner()
            or (v_me is not null
                and custom.has_visibility(v_me, 'record', h.home_record_id, 'viewer'::public.permission_level)
                and custom.has_visibility(v_me, 'record', h.table_id, 'viewer'::public.permission_level)));
end;
$function$;

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
  -- THE FINAL SWITCH NEVER DEPENDS ON WHO PRESSED IT (PRESS-FENCE B). While platform.final_switch_press or
  -- platform.final_switch_undo runs (app.final_switch_step = 'on', transaction-local, set and cleared only
  -- by them; set_config is no client door), a platform administrator on the admin lane passes this wall for
  -- every organization: the press is platform-wide, so the presser's own memberships never decide it.
  if platform.final_switch_acting() then
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
  -- THE FINAL SWITCH NEVER DEPENDS ON WHO PRESSED IT (PRESS-FENCE B). While platform.final_switch_press or
  -- platform.final_switch_undo runs (app.final_switch_step = 'on', transaction-local, set and cleared only
  -- by them; set_config is no client door), a platform administrator on the admin lane passes this wall for
  -- every organization: the press is platform-wide, so the presser's own memberships never decide it.
  if platform.final_switch_acting() then
    return;
  end if;
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

CREATE OR REPLACE FUNCTION custom.assert_client_may_change(p_organization_id uuid, p_subject_id uuid, p_door text, p_required permission_level DEFAULT 'editor'::permission_level, p_subject_word text DEFAULT 'record'::text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me          uuid;
  v_subject_org uuid;
  v_held        public.permission_level;
begin
  -- THE FINAL SWITCH NEVER DEPENDS ON WHO PRESSED IT (PRESS-FENCE C): platform.final_switch_acting().
  if platform.final_switch_acting() then
    return;
  end if;
  -- ONE order, always: the organization wall first, then the row.
  perform custom.assert_client_may_reach(p_organization_id, p_door);

  -- Way through 1: the role that owns the store (every campaign and server lane).
  if custom.query_is_store_owner() then
    return;
  end if;

  if p_subject_id is null then
    return;
  end if;

  -- Way through 2: no signed-in person at all — the anonymous capture door, which has
  -- already decided this write against the form's own token.
  v_me := custom.query_principal();
  if v_me is null then
    return;
  end if;

  -- WHERE THE SUBJECT ACTUALLY LIVES, BY ITS ID AND NOTHING ELSE (2026-09-23). A subject
  -- outside p_organization_id used to be waved through on the promise that the door would
  -- filter by that organization; the same promise was broken on the read side
  -- (`custom.record_as_of`, a cross-organization leak proven live). Access is decided by the
  -- PERSON and the ROW (organization-is-the-container rule 5).
  select r.organization_id into v_subject_org
    from custom.record r
   where r.id = p_subject_id;

  -- Not there at all: the door raises its own 02000 a line later.
  if v_subject_org is null then
    return;
  end if;

  -- The globally readable platform tenant's kernel Tables: unchanged — the door decides.
  if v_subject_org is distinct from p_organization_id
     and exists (select 1 from iam.system_orgs s
                  where s.organization_id = v_subject_org and s.global_readable) then
    return;
  end if;

  if custom.has_visibility(v_me, 'record', p_subject_id, p_required) then
    return;
  end if;

  -- THE REFUSAL NAMES THE RUNG HELD, NOT ONLY THE RUNG NEEDED (lane TAILS, 2026-09-21).
  v_held := custom.effective_level(v_me, v_subject_org, p_subject_id, 'record');

  if v_held is null then
    raise exception 'You do not have access to this %, so % may not write to it.',
      coalesce(nullif(btrim(p_subject_word), ''), 'record'),
      coalesce(nullif(btrim(p_door), ''), 'that door')
      using errcode = '42501',
            hint = format(
              'DOOR-1 decides reading and writing with the SAME question: a %s you may not open is a %s you may not change. This needs the %s level (viewer < commenter < editor < admin) - ask whoever holds it to share it with you, or ask an owner of this organization. Being a member of the organization is not by itself permission to rewrite somebody else''s row.',
              coalesce(nullif(btrim(p_subject_word), ''), 'record'),
              coalesce(nullif(btrim(p_subject_word), ''), 'record'),
              p_required);
  end if;

  raise exception 'You hold the % level on this %, and % needs the % level.',
    v_held,
    coalesce(nullif(btrim(p_subject_word), ''), 'record'),
    coalesce(nullif(btrim(p_door), ''), 'that door'),
    p_required
    using errcode = '42501',
          hint = format(
            'DOOR-1 decides reading and writing with the SAME question, on ONE ladder: viewer < commenter < editor < admin. You hold %s on this %s and %s needs the %s level, so ask an admin of this %s - or an owner of this organization - to raise your level. Being a member of the organization is not by itself permission to rewrite somebody else''s row.',
            v_held,
            coalesce(nullif(btrim(p_subject_word), ''), 'record'),
            coalesce(nullif(btrim(p_door), ''), 'that door'),
            p_required,
            coalesce(nullif(btrim(p_subject_word), ''), 'record'));
end
$function$;

CREATE OR REPLACE FUNCTION custom._field_reads_what_it_reads()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_deps  jsonb;
  v_floor record;
  v_path  text[];                      -- STORE-TAILS-3: a circle this definition would close
  v_cp    record;                      -- STORE-TAILS-3: the agent-visibility floor
  r       record;
begin
  if new.table_id is distinct from custom.field_kernel_id() or new.data_class = 'kernel' then
    return new;
  end if;

  -- STORE-TAILS-3: A COLUMN AN AGENT IS NOW KEPT FROM MORE FIRMLY TAKES ITS READERS WITH IT
  -- (any column, worked out or not — Budget is a plain number). Every formula, lookup and rollup
  -- that reads it, directly or through another, is given at least the same word, here, in the
  -- write that raised it; each reader's own write passes this same trigger and carries it on.
  if tg_op = 'UPDATE'
     and custom.context_policy_rank(new.data ->> 'context_policy')
         > custom.context_policy_rank(old.data ->> 'context_policy') then
    for r in
      select f.organization_id, f.id
        from custom.record f
       where f.organization_id = new.organization_id
         and f.table_id = custom.field_kernel_id()
         and f.data_class <> 'kernel'
         and f.id <> new.id
         and f.data ->> 'type' = 'formula'
         and coalesce(f.data -> 'config', '{}'::jsonb) ?| array['expr', 'pick', 'agg']
         and custom.context_policy_rank(f.data ->> 'context_policy') < custom.context_policy_rank(new.data ->> 'context_policy')
         and exists (select 1 from custom.field_input_closure(f.organization_id, f.data, f.id) c
                      where c.input_id = new.id)
    loop
      update custom.record
         set data = jsonb_set(data, '{context_policy}', to_jsonb(new.data ->> 'context_policy'))
       where organization_id = r.organization_id
         and id = r.id;
    end loop;
  end if;
  if coalesce(new.data ->> 'type', '') <> 'formula'
     or not (coalesce(new.data -> 'config', '{}'::jsonb) ?| array['expr', 'pick', 'agg']) then
    return new;
  end if;
  -- A retirement is not a change of shape (the shared rule): the document stays byte-for-byte
  -- what it was, so every guard after this one still sees a retirement.
  if tg_op = 'UPDATE'
     and custom.is_a_retirement(old.deleted_at, new.deleted_at, old.data, new.data,
                                old.table_id, new.table_id, old.organization_id,
                                new.organization_id, old.data_class, new.data_class) then
    return new;
  end if;

  -- STORE-TAILS-3: A COLUMN THAT WOULD READ ITSELF IS NOT SAVED. The walk starts from the
  -- definition being written (not the stored one) and comes back to this column's id through
  -- whatever reads it — by id, or by key for a lookup's far column and the older formula shape.
  if new.deleted_at is null then
    v_path := custom.field_cycle(new.organization_id, new.data, new.id);
    if v_path is not null then
      raise exception 'The column "%" would be worked out from itself: % — so it was not saved.',
        coalesce(nullif(new.data ->> 'label', ''), new.data ->> 'key'),
        array_to_string(v_path, ' reads ')
        using errcode = '42P17',
              hint = 'STORE-TAILS-3: a formula, lookup or rollup that reads itself round a circle has no answer. Point one of the columns in that circle at something outside it, and save again.';
    end if;
  end if;

  -- depends_on: the columns of THIS table it reads, by key (the list custom.field_dependants
  -- and REC-18's "this field is used by …" read). Worked out from the definition, never typed.
  select coalesce(jsonb_agg(distinct i.input_key order by i.input_key), '[]'::jsonb)
    into v_deps
    from custom.field_inputs_of(new.organization_id, new.data) i
   where i.input_table::text = new.data ->> 'entity_definition_id'
     and not i.retired;
  if new.data -> 'depends_on' is distinct from v_deps then
    new.data := jsonb_set(new.data, '{depends_on}', v_deps);
  end if;

  select * into v_floor
    from custom.field_sensitivity_floor(new.organization_id, new.data, new.id);
  if v_floor.sensitivity is not null
     and custom.sensitivity_rank(new.data ->> 'sensitivity') < custom.sensitivity_rank(v_floor.sensitivity) then
    raise notice 'the column "%" reads %, which is %, so it is % too (it was %)',
      coalesce(nullif(new.data ->> 'label', ''), new.data ->> 'key'),
      (select string_agg(format('"%s"', e ->> 'label'), ', ') from jsonb_array_elements(v_floor.reads) e),
      v_floor.sensitivity, v_floor.sensitivity, coalesce(new.data ->> 'sensitivity', 'nothing');
    new.data := jsonb_set(new.data, '{sensitivity}', to_jsonb(v_floor.sensitivity));
  end if;

  -- STORE-TAILS-3: WHAT AN AGENT MAY SEE FOLLOWS WHAT THE COLUMN READS, the same way sensitivity
  -- does. A column worked out from one the organization keeps out of conversations (`exclude`),
  -- gives an agent only on request, or only as a summary, is kept from an agent at least as
  -- firmly — raised to the strictest word among everything it reads, never lowered here.
  select * into v_cp
    from custom.field_context_policy_floor(new.organization_id, new.data, new.id);
  if v_cp.context_policy is not null
     and custom.context_policy_rank(new.data ->> 'context_policy') < custom.context_policy_rank(v_cp.context_policy) then
    raise notice 'the column "%" reads %, which an agent is given as "%", so an agent is given it as "%" too (it was "%")',
      coalesce(nullif(new.data ->> 'label', ''), new.data ->> 'key'),
      (select string_agg(format('"%s"', e ->> 'label'), ', ') from jsonb_array_elements(v_cp.reads) e),
      v_cp.context_policy, v_cp.context_policy, coalesce(new.data ->> 'context_policy', 'nothing');
    new.data := jsonb_set(new.data, '{context_policy}', to_jsonb(v_cp.context_policy));
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.trg_associations_bump_visibility()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_row   record := coalesce(new, old);
  v_org   uuid;
begin
  -- The row's organization is established FIRST, because the off switch below is an
  -- org-overridable knob and resolving it without an organization silently reads the
  -- platform value for every tenant.
  v_org := v_row.organization_id;

  -- THE OFF SWITCH, READ INSIDE THE BODY. A trigger's guard cannot live in the file header: the
  -- header is not consulted at run time and an UPDATE would still pay for this work while every
  -- additive check read green. So the knob is read here, and while it resolves false this trigger
  -- is a no-op on every write to platform.associations.
  if not custom.store_is_open(v_org) then
    return null;
  end if;

  -- THE SECOND GATE, AND THE REASON THIS TRIGGER IS INERT FOR TODAY'S WRITES: it does nothing at
  -- all unless the row's role is one of the new store's declared carrying roles. A trigger WHEN
  -- clause cannot carry a subquery, so the check lives here, one index lookup on a three-row table.
  if not exists (
    select 1 from custom.carrying_rule cr
    where cr.is_active and cr.role = v_row.role
  ) then
    return null;
  end if;

  -- The moved record's own epoch, and its container's. Two rows, never a subtree.
  perform custom.bump_epoch(v_row.source_type, v_row.source_id, v_org);
  perform custom.bump_epoch(v_row.target_type, v_row.target_id, v_org);

  -- The pair's cache entries go in the SAME COMMIT. This is the "invalidated in the same commit"
  -- half of VIS-7, and it is bounded: the pair, never the closure below it.
  delete from custom.visibility_cache c
   where (c.container_type = v_row.source_type and c.container_id = v_row.source_id)
      or (c.container_type = v_row.target_type and c.container_id = v_row.target_id)
      or (c.item_type      = v_row.source_type and c.item_id      = v_row.source_id)
      or (c.item_type      = v_row.target_type and c.item_id      = v_row.target_id);

  return null;
end;
$function$;

update platform.client_callable_door
   set signed_in_callers = false,
       non_client_lane = 'Closed by tableactions_a_table_can_be_duplicated_down.sql: duplicating a table is switched off; re-apply tableactions_a_table_can_be_duplicated.sql to reopen it.'
 where schema_name = 'custom' and function_name in ('table_duplicate', 'table_duplicate_continue', 'table_copies_in_progress');

-- Each revoke only where the function exists, so the inverse also runs over an earlier shape of
-- this file.
do $do$
begin
  if to_regprocedure('custom.table_duplicate(uuid, boolean, text, uuid)') is not null then
    revoke execute on function custom.table_duplicate(uuid, boolean, text, uuid) from authenticated;
  end if;
  if to_regprocedure('custom.table_duplicate_continue(uuid)') is not null then
    revoke execute on function custom.table_duplicate_continue(uuid) from authenticated;
  end if;
  if to_regprocedure('custom.table_copies_in_progress()') is not null then
    revoke execute on function custom.table_copies_in_progress() from authenticated;
  end if;
end
$do$;

drop function if exists custom.table_duplicate(uuid, boolean, text, uuid);
drop function if exists custom.table_duplicate_continue(uuid);
drop function if exists custom.table_copies_in_progress();
drop function if exists custom._table_duplicate_step(uuid, interval);
drop function if exists custom._remap_rows(jsonb, uuid, jsonb);
drop function if exists custom._duplicate_carries_row(jsonb, uuid, uuid, uuid);
drop function if exists custom._copy_in_progress_guard(uuid, uuid);
drop function if exists custom._duplicate_id(uuid, uuid);
drop function if exists custom._uuid_remap(jsonb, jsonb);
drop function if exists custom._copied_metadata(jsonb);
drop function if exists custom._without_rows_of(jsonb, uuid, uuid);

delete from platform.client_callable_door
 where schema_name = 'custom' and function_name in ('table_duplicate', 'table_duplicate_continue', 'table_copies_in_progress')
   and declared_by = 'tableactions_a_table_can_be_duplicated.sql';

select set_config('platform.closed_schema_sweep', '0', true);
