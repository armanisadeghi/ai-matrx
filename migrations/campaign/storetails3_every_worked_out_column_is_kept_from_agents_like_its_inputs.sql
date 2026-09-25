-- chair-step: an AUDITED DATA REPAIR, after storetails3_what_an_agent_may_see_follows_what_a_column_reads.sql.
--   It re-derives every existing formula, lookup and rollup column (live AND archived) whose
--   `context_policy` is looser than the strictest column it reads, by writing each definition back
--   to itself through the new trigger (which raises the word; nothing else about the column moves —
--   its depends_on and sensitivity were already re-derived by STORE-LEAK-FORMULA's repair). Only
--   rows that must be raised are written; each write is a real Field update, so History records it
--   (who: `app.actor_system = campaign/storetails3-context-repair`), and each leaves one
--   `history.migration_log` row (verb `context_policy_rederive`, target_kind `field`) whose `inverse`
--   is the exact patch that puts the old word back. A column of an ARCHIVED table cannot be written
--   (the shape guard asks for a live table) and cannot be handed to an agent (nothing reads a
--   retired column); it is named and left, and the trigger raises it on the write that brings it
--   back. Nothing is deleted; no value in any record changes. Re-running is safe.
--   Inverse: migrations/inverse/storetails3_every_worked_out_column_is_kept_from_agents_like_its_inputs_down.sql
-- lock: custom
-- lane: STORE-TAILS-3

set local lock_timeout = '30s';
set local statement_timeout = '300s';

select set_config('app.actor_system', 'campaign/storetails3-context-repair', true);

create temp table storetails3_context_repair on commit drop as
select f.organization_id, f.id,
       f.data ->> 'entity_definition_id'                          as table_id,
       coalesce(nullif(f.data ->> 'label', ''), f.data ->> 'key') as label,
       f.deleted_at is not null                                    as archived,
       f.data ->> 'context_policy'                                 as policy_before,
       fl.context_policy                                           as floor,
       fl.reads                                                    as floor_from
  from custom.record f
  join lateral custom.field_context_policy_floor(f.organization_id, f.data, f.id) fl on true
 where f.table_id = custom.field_kernel_id()
   and f.data_class <> 'kernel'
   and f.data ->> 'type' = 'formula'
   and coalesce(f.data -> 'config', '{}'::jsonb) ?| array['expr', 'pick', 'agg']
   and custom.context_policy_rank(f.data ->> 'context_policy') < custom.context_policy_rank(fl.context_policy);

alter table storetails3_context_repair add column outcome text;

do $repair$
declare
  r      record;
  v_msg  text;
begin
  for r in select * from storetails3_context_repair order by organization_id, id loop
    begin
      insert into history.migration_log (organization_id, verb, target_kind, target_id, inverse, note)
      values (r.organization_id, 'context_policy_rederive', 'field', r.id,
              jsonb_build_object('kind', 'patch', 'record_id', r.id,
                                 'patch', jsonb_build_object('context_policy', r.policy_before)),
              format('STORE-TAILS-3: "%s" is kept from agents like what it reads: context_policy %s -> %s because it reads %s%s.',
                     r.label, coalesce(r.policy_before, 'nothing'), r.floor,
                     (select string_agg(e ->> 'label', ', ') from jsonb_array_elements(r.floor_from) e),
                     case when r.archived then ' (archived)' else '' end));
      update custom.record f set data = f.data
       where f.organization_id = r.organization_id and f.id = r.id;
      update storetails3_context_repair set outcome = 'raised'
       where organization_id = r.organization_id and id = r.id;
    exception when check_violation or invalid_parameter_value or raise_exception then
      get stacked diagnostics v_msg = message_text;
      if not r.archived then
        raise exception 'STORE-TAILS-3 repair: "%" (%) must be raised to % and its write was refused: %',
          r.label, r.id, r.floor, v_msg using errcode = '23514';
      end if;
      update storetails3_context_repair
         set outcome = 'left: archived; raised by the trigger when it comes back: ' || v_msg
       where organization_id = r.organization_id and id = r.id;
      raise notice 'STORE-TAILS-3 repair: LEFT AS IT IS — "%" (%, org %), archived: it would become % but its table is archived, so it cannot be written (and cannot be read); the trigger raises it on the write that brings it back: %',
        r.label, r.id, r.organization_id, r.floor, v_msg;
    end;
  end loop;
end
$repair$;

select r.outcome, r.organization_id, r.table_id, r.id, r.label, r.archived,
       r.policy_before, f.data ->> 'context_policy' as policy_after, r.floor_from
  from storetails3_context_repair r
  join custom.record f on f.organization_id = r.organization_id and f.id = r.id
 order by r.organization_id, r.label;

do $check$
declare
  v_left bigint;
begin
  select count(*) into v_left
    from storetails3_context_repair r
    join custom.record f on f.organization_id = r.organization_id and f.id = r.id
   where r.outcome = 'raised'
     and custom.context_policy_rank(f.data ->> 'context_policy') < custom.context_policy_rank(r.floor);
  if v_left > 0 then
    raise exception 'STORE-TAILS-3 repair: % columns were written and are still handed to agents more freely than what they read', v_left
      using errcode = '23514';
  end if;
  raise notice 'STORE-TAILS-3 repair: % column(s) raised, % archived column(s) named and left (raised when they come back)',
    (select count(*) from storetails3_context_repair where outcome = 'raised'),
    (select count(*) from storetails3_context_repair where outcome like 'left:%');
end
$check$;
