-- chair-step: a STORE FIX (STORE-LEAK-FORMULA found it while testing, item 5). It ADDS two
--   functions (`custom.context_policy_rank`, `custom.field_context_policy_floor`) and REPLACES the
--   body of `custom._field_reads_what_it_reads` (the BEFORE trigger function every Field write
--   already passes, as storetails3_a_worked_out_column_never_reads_itself.sql left it — declared
--   below). No trigger is created or dropped, so nothing takes a table lock. No table, column,
--   policy or grant is added; no row of anybody's
--   data is rewritten by this file — the re-derivation of existing columns is the separate,
--   audited repair `storetails3_every_worked_out_column_is_kept_from_agents_like_its_inputs.sql`.
--   Inverse: `migrations/inverse/storetails3_what_an_agent_may_see_follows_what_a_column_reads_down.sql`.
--   Applied directly (owner, 2026-09-24 ~17:30 PT: "all db stuff applied directly"), proven on
--   the dev clone first (suite RED on the old bodies, GREEN on these; up, inverse, up).
-- lock: custom
-- lane: STORE-TAILS-3
-- based-on: custom._field_reads_what_it_reads() e9e61b6d546bb5a215bac7a1d3eaa1c45b78f64b0ede25531d5f75539e4c23da
--
-- ════════════════════════════════════════════════════════════════════════════════════════
-- WHAT AN AGENT MAY SEE FOLLOWS WHAT A COLUMN READS
-- ════════════════════════════════════════════════════════════════════════════════════════
--
-- THE DEFECT. `context_policy` is the organization's word on whether an agent is given a
-- column's values (`include`, `summarize`, `on_request`, `exclude`; custom.resolve_context and
-- custom.record_scope_context read it). STORE-LEAK-FORMULA made a formula, lookup or rollup at
-- least as SENSITIVE as what it reads, but left this word alone: a Budget the organization keeps
-- out of conversations (`exclude`) could sit beside *Budget with contingency* (`{Budget} * 1.1`)
-- saying `include`, and every conversation about a room was handed 19,800 — the hidden budget one
-- division away. Same class, the other door.
--
-- THE RULE, derived exactly the way sensitivity is (the STORE-LEAK-FORMULA walk,
-- `custom.field_input_closure`: formula leaves, a lookup's or rollup's relation and far column,
-- inputs of inputs, archived inputs counted):
--   include 1 < summarize 2 < on_request 3 < exclude 4 — `summarize` hands an agent a digest of
--   the value in every conversation, `on_request` hands it nothing until someone asks for it, and
--   `exclude` never. A missing word reads `include` (what every reader of it assumes); a word the
--   store does not know is the strictest, so an unknown can only ever withhold.
--   1. ON EVERY WRITE of a worked-out definition, its `context_policy` is raised to the strictest
--      word among everything it reads (never lowered here: a person who wants it looser says so,
--      and the floor still holds).
--   2. WHEN AN INPUT'S WORD BECOMES STRICTER (any column — Budget is a plain number), every
--      column that reads it is raised with it, in the same write.
--   The readers need no change: they read the column's own word, and the store now keeps that
--   word honest.
--
-- LOCKS. `create function` / `create or replace function` take nothing on `custom.record`; no
-- trigger is created or dropped. No data work.

set local lock_timeout = '30s';
set local statement_timeout = '120s';

create function custom.context_policy_rank(p_policy text)
returns integer
language sql
immutable parallel safe
set search_path to 'pg_catalog'
as $$
  select case coalesce(p_policy, 'include')
           when 'include'    then 1
           when 'summarize'  then 2
           when 'on_request' then 3
           when 'exclude'    then 4
           else 4
         end;
$$;
comment on function custom.context_policy_rank(text) is
  'STORE-TAILS-3: include 1 < summarize 2 < on_request 3 < exclude 4; nothing = include; an unknown word = the strictest.';
revoke all on function custom.context_policy_rank(text) from public;

create function custom.field_context_policy_floor(p_organization_id uuid, p_field_data jsonb,
                                                  p_self uuid default null)
returns table(context_policy text, reads jsonb)
language sql
stable
security definer
set search_path to 'pg_catalog'
as $$
  -- The strictest agent-visibility word among everything the column reads, and the columns that
  -- carry it. No row at all when the column reads nothing.
  with c as (
    select i.input_id, i.input_key, i.input_label, f.data ->> 'context_policy' as policy
      from custom.field_input_closure(p_organization_id, p_field_data, p_self) i
      join custom.record f
        on f.organization_id = p_organization_id and f.id = i.input_id),
  top as (select max(custom.context_policy_rank(c.policy)) as r from c)
  select (array['include', 'summarize', 'on_request', 'exclude'])[top.r],
         (select jsonb_agg(jsonb_build_object('id', c.input_id, 'key', c.input_key,
                                              'label', c.input_label, 'context_policy', c.policy)
                           order by c.input_label)
            from c where custom.context_policy_rank(c.policy) = top.r)
    from top
   where top.r is not null;
$$;
comment on function custom.field_context_policy_floor(uuid, jsonb, uuid) is
  'STORE-TAILS-3: the strictest context_policy among every column a worked-out definition reads, and the columns that carry it.';
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid), string_to_array(p.proargtypes::text, ' ')::oid[],
       'STORE-TAILS-3: what an agent may be given of a worked-out column, for the Field-row triggers; the organization is the writer''s own, already decided by the door that writes.',
       'STORE-TAILS-3',
       'server_only: called only by the Field-row triggers inside a write door that has already decided who is writing; it names Field ids of any table in the organization without asking who is asking.',
       false, false
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where p.oid = 'custom.field_context_policy_floor(uuid, jsonb, uuid)'::regprocedure;
revoke all on function custom.field_context_policy_floor(uuid, jsonb, uuid) from public;

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
