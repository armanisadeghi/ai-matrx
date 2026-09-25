-- chair-step: an AUDITED DATA REPAIR, after storeleakformula_a_worked_out_column_is_as_sensitive_as_what_it_reads.sql.
--   It re-derives every existing formula, lookup and rollup column (live AND archived: an archived
--   table comes back with "Bring it back" exactly as it was) through the new trigger, by writing
--   each definition back to itself: `depends_on` becomes the keys the column actually reads, and a
--   column less sensitive than an input it reads is raised to that input's word. Only rows whose
--   derived document differs are written; each write is a real Field update, so History records
--   it (who: `app.actor_system = campaign/storeleakformula-repair`), and every row is printed
--   before and after (an older definition the shape guard refuses on any write, whose only change
--   would be its depends_on list, is left as it is and named; one that must be RAISED is never
--   skipped — its refusal fails the file), and each write leaves one `history.migration_log` row (verb
--   `sensitivity_rederive`, target_kind `field`) whose `inverse` is the exact patch that puts the
--   column's `depends_on` and `sensitivity` back. Nothing is deleted; no value in any record changes.
--   The inverse is migrations/inverse/storeleakformula_every_worked_out_column_reads_its_inputs_again_down.sql
--   (it applies those patches and stamps each log row `undone_at`). Re-running is safe: a second run
--   finds nothing to write.
-- lock: custom
-- lane: STORE-LEAK-FORMULA

set local lock_timeout = '30s';
set local statement_timeout = '300s';

select set_config('app.actor_system', 'campaign/storeleakformula-repair', true);

create temp table storeleakformula_repair on commit drop as
select f.organization_id, f.id,
       f.data ->> 'entity_definition_id'                       as table_id,
       coalesce(nullif(f.data ->> 'label', ''), f.data ->> 'key') as label,
       f.deleted_at is not null                                  as archived,
       f.data ->> 'sensitivity'                                  as sensitivity_before,
       f.data -> 'depends_on'                                    as depends_on_before,
       fl.sensitivity                                            as floor,
       fl.reads                                                  as floor_from,
       (select coalesce(jsonb_agg(distinct i.input_key order by i.input_key), '[]'::jsonb)
          from custom.field_inputs_of(f.organization_id, f.data) i
         where i.input_table::text = f.data ->> 'entity_definition_id'
           and not i.retired)                                    as depends_on_derived
  from custom.record f
  left join lateral custom.field_sensitivity_floor(f.organization_id, f.data, f.id) fl on true
 where f.table_id = custom.field_kernel_id()
   and f.data_class <> 'kernel'
   and f.data ->> 'type' = 'formula'
   and coalesce(f.data -> 'config', '{}'::jsonb) ?| array['expr', 'pick', 'agg'];

delete from storeleakformula_repair
 where depends_on_before is not distinct from depends_on_derived
   and (floor is null
        or custom.sensitivity_rank(sensitivity_before) >= custom.sensitivity_rank(floor));

alter table storeleakformula_repair add column outcome text;

-- One column at a time, each in its own subtransaction: the audit row, then the write. A column
-- whose ONLY change is its depends_on list and which the shape guard now refuses on any write (an
-- older definition written before a later rule, e.g. a formula naming a column by key) is left
-- exactly as it is and NAMED below — it leaks nothing, because every read asks
-- iam.may_touch_field about each column it reads. A column that must be RAISED in sensitivity
-- is never skipped: if its write is refused, this whole file fails.
do $repair$
declare
  r        record;
  v_raise  boolean;
  v_msg    text;
begin
  for r in select * from storeleakformula_repair order by organization_id, id loop
    v_raise := r.floor is not null
               and custom.sensitivity_rank(r.sensitivity_before) < custom.sensitivity_rank(r.floor);
    begin
      insert into history.migration_log (organization_id, verb, target_kind, target_id, inverse, note)
      values (r.organization_id, 'sensitivity_rederive', 'field', r.id,
              jsonb_build_object('kind', 'patch', 'record_id', r.id,
                                 'patch', jsonb_build_object('sensitivity', r.sensitivity_before,
                                                             'depends_on', r.depends_on_before)),
              format('STORE-LEAK-FORMULA (VERIFIER-18 finding 1): "%s" re-derived from what it reads: depends_on %s -> %s; sensitivity %s -> %s%s%s.',
                     r.label, r.depends_on_before, r.depends_on_derived, r.sensitivity_before,
                     case when v_raise then r.floor else r.sensitivity_before end,
                     case when v_raise
                          then ' because it reads ' || (select string_agg(e ->> 'label', ', ') from jsonb_array_elements(r.floor_from) e)
                          else '' end,
                     case when r.archived then ' (archived table)' else '' end));
      -- Written back to itself; custom._field_reads_what_it_reads derives it.
      update custom.record f set data = f.data
       where f.organization_id = r.organization_id and f.id = r.id;
      update storeleakformula_repair set outcome = case when v_raise then 'raised' else 'depends_on' end
       where organization_id = r.organization_id and id = r.id;
    exception when check_violation or invalid_parameter_value or raise_exception then
      get stacked diagnostics v_msg = message_text;
      if v_raise then
        raise exception 'STORE-LEAK-FORMULA repair: "%" (%) must be raised to % and its write was refused: %',
          r.label, r.id, r.floor, v_msg using errcode = '23514';
      end if;
      update storeleakformula_repair set outcome = 'left: ' || v_msg
       where organization_id = r.organization_id and id = r.id;
      raise notice 'STORE-LEAK-FORMULA repair: LEFT AS IT IS — "%" (%, org %): its depends_on would be % but the store refuses any write of this older definition: %',
        r.label, r.id, r.organization_id, r.depends_on_derived, v_msg;
    end;
  end loop;
end
$repair$;

select r.outcome, r.organization_id, r.table_id, r.id, r.label, r.archived,
       r.sensitivity_before, f.data ->> 'sensitivity' as sensitivity_after,
       r.depends_on_before, f.data -> 'depends_on' as depends_on_after,
       r.floor_from
  from storeleakformula_repair r
  join custom.record f on f.organization_id = r.organization_id and f.id = r.id
 order by (r.sensitivity_before is distinct from f.data ->> 'sensitivity') desc, r.organization_id, r.label;

do $check$
declare
  v_left bigint;
begin
  select count(*) into v_left
    from storeleakformula_repair r
    join custom.record f on f.organization_id = r.organization_id and f.id = r.id
   where r.outcome not like 'left:%'
     and f.data -> 'depends_on' is distinct from r.depends_on_derived
      or (r.floor is not null
          and custom.sensitivity_rank(f.data ->> 'sensitivity') < custom.sensitivity_rank(r.floor));
  if v_left > 0 then
    raise exception 'STORE-LEAK-FORMULA repair: % columns were written and still do not carry what they read', v_left
      using errcode = '23514';
  end if;
  raise notice 'STORE-LEAK-FORMULA repair: % columns re-derived (% raised in sensitivity), % older definitions left as they are and named above',
    (select count(*) from storeleakformula_repair where outcome not like 'left:%'),
    (select count(*) from storeleakformula_repair r
      where r.floor is not null
        and custom.sensitivity_rank(r.sensitivity_before) < custom.sensitivity_rank(r.floor)),
    (select count(*) from storeleakformula_repair where outcome like 'left:%');
end
$check$;
