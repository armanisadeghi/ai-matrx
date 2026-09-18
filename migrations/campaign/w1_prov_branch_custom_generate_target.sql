-- target: branch
--
-- W1-PROV — `custom` as a PROVISION GENERATE TARGET. A BRANCH FIXTURE, on purpose.
--
-- THE PARITY RULE, in `platform.provision_validate`'s own words: a schema is provisionable
-- only if the repository can generate for it — an ORM model target and a frontend type
-- target, both declared in `platform.provision_generate_target` by
-- `scripts/check_provision_generate_targets.py --fix`. Without a row, `custom` is refused
-- by name (`identity.schema.not_generable`) and nothing can be provisioned into it.
--
-- 🚨 AND THE CAMPAIGN REQUIRES PRODUCTION NOT TO HAVE ONE. §6's fact three is that `custom`
-- appears in no `generate:` block and in no `additional_schemas` list, and `W3-ASSERT`
-- (CUT-N-17) ships a startup assertion that FAILS if any registered model resolves into it.
-- Publishing the row on production would be publishing the opposite. So the row is the
-- rehearsal's, exactly like `w1_store_branch_registration.sql`'s entity token, and the
-- production row is switch-checklist work of the same kind as
-- `GRANT USAGE ON SCHEMA custom TO authenticated` — it goes in beside the generate lists,
-- not before them.
--
-- WHAT THAT COSTS, SAID PLAINLY: on production the store's spec is refused by the parity
-- rule until that step runs. That is a correct refusal, not a gap — the repo genuinely
-- cannot generate for `custom` yet.
--
-- THE INVERSE: `migrations/inverse/w1_prov_branch_custom_generate_target_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '120s';

do $$
begin
  if (pg_control_system()).system_identifier = 7642734024280108049 then
    raise exception
      'REFUSING: this is PRODUCTION (system_identifier %). Publishing `custom` as a generate '
      'target here contradicts §6 fact three of the OFF switch and W3-ASSERT''s startup '
      'assertion. It is switch-checklist work.', (pg_control_system()).system_identifier;
  end if;
end
$$;

insert into platform.provision_generate_target (schema_name, orm_target, types_target, published_by)
values ('custom', true, true,
        'W1-PROV rehearsal fixture — the branch half of switch-checklist step 3; production publishes this row beside the ORM generate list and package.json db-types --schema, never before')
on conflict (schema_name) do nothing;
