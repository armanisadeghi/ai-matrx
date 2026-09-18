-- chair-step: this drops write guards from seven live tables, puts seven registry rows back to the type they carried before, and deletes ninety-odd register rows — no additive judgement admits any of it; it exists so the branch can be put back exactly as W1-REG found it
--
-- THE INVERSE of `migrations/campaign/w1_reg_one_option_mechanism_and_one_template_mechanism.sql`.
--
-- Header-less on purpose (§4.9). The up-file is `-- target: branch` and so is every use of
-- this one:
--
--     pnpm db:apply migrations/inverse/w1_reg_one_option_mechanism_and_one_template_mechanism_down.sql --target branch
--
-- IT RESTORES FROM THE RECORD, NOT FROM MEMORY. The up-file wrote each guarded store's
-- previous registry values into its own register row as ` PRIOR={...}` json, precisely so
-- this file does not have to re-derive a type hours later and get it wrong. A store whose
-- row is missing its PRIOR block stops this file by name rather than being guessed at.
--
-- IT DELETES ONLY WHAT THE UP-FILE WROTE — every row it removes carries a `(W1-REG)` stamp
-- in its reason, so a row another lane wrote through `platform.retire_to_deprecated()` is
-- left alone.

do $$
declare
  r record; v_prior jsonb; v_n int;
begin
  for r in select old_ref, reason from platform.deprecated_relations
            where reason like 'REC-50 (W1-REG)%'
  loop
    if position(' PRIOR=' in r.reason) = 0 then
      raise exception 'REC-50 inverse: the register row for % carries no PRIOR block — the prior registry values are unknown and this file will not guess', r.old_ref;
    end if;
    v_prior := substring(r.reason from position(' PRIOR=' in r.reason) + 7)::jsonb;

    execute format('drop trigger if exists _deprecated_write_guard on %I.%I',
                   split_part(r.old_ref, '.', 1), split_part(r.old_ref, '.', 2));

    update platform.entity_types e
       set type = nullif(v_prior ->> 'type', ''),
           type_reason = v_prior ->> 'type_reason',
           custom_fields_enabled = coalesce((v_prior ->> 'custom_fields_enabled')::boolean, false)
     where e.schema_name = split_part(r.old_ref, '.', 1)
       and e.table_name  = split_part(r.old_ref, '.', 2);
  end loop;
end $$;

delete from platform.deprecated_relations
 where reason like 'REC-50 (W1-REG)%'
    or reason like 'REC-49 (W1-REG)%'
    or reason like 'REC-65 (W1-REG)%'
    or reason like 'REC-35 (W1-REG)%'
    or reason like 'REC-N-13 (W1-REG)%'
    or reason like 'REC-67 (W1-REG)%';

do $$
declare v_n int; v_g text;
begin
  select string_agg(t.tgrelid::regclass::text, ', ') into v_g
    from pg_trigger t
   where not t.tgisinternal
     and t.tgfoid = 'platform._deprecated_write_guard()'::regprocedure
     and t.tgrelid in ('seo.starter_pack'::regclass, 'seo.starter_pack_item'::regclass,
                       'web.offering_template'::regclass, 'workflow.template'::regclass,
                       'agent.template'::regclass, 'research.rs_template'::regclass,
                       'workbench.schema_templates'::regclass);
  if v_g is not null then
    raise exception 'the write guard survived the inverse on %', v_g;
  end if;

  select count(*) into v_n from platform.entity_types
   where type = 'deprecated'
     and (schema_name, table_name) in (('seo','starter_pack'),('seo','starter_pack_item'),
                                       ('web','offering_template'),('workflow','template'),
                                       ('agent','template'),('research','rs_template'),
                                       ('workbench','schema_templates'));
  if v_n <> 0 then
    raise exception '% template store(s) still read type deprecated after the inverse', v_n;
  end if;

  select count(*) into v_n from platform.deprecated_relations
   where reason like 'REC-50 (W1-REG)%' or reason like 'REC-49 (W1-REG)%'
      or reason like 'REC-65 (W1-REG)%' or reason like 'REC-35 (W1-REG)%'
      or reason like 'REC-N-13 (W1-REG)%' or reason like 'REC-67 (W1-REG)%';
  if v_n <> 0 then
    raise exception '% convergence declaration(s) survived the inverse', v_n;
  end if;

  raise notice 'W1-REG: the seven template stores are unguarded and back to their prior registry types, and every convergence declaration this file wrote is gone.';
end $$;
