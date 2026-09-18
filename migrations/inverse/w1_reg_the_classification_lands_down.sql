-- chair-step: this deletes registry rows and empties a classification column, which no additive judgement admits; it exists so the branch can be put back exactly as W1-REG found it
--
-- THE INVERSE of `migrations/campaign/w1_reg_the_classification_lands.sql`.
--
-- Header-less on purpose (§4.9). The up-file is `-- target: branch` and so is every
-- use of this one:
--
--     pnpm db:apply migrations/inverse/w1_reg_the_classification_lands_down.sql --target branch
--
-- IT DELETES ONLY WHAT THE UP-FILE INSERTED, and it knows which those are because the
-- up-file STAMPS each inserted row's `notes` with its own name. A row somebody else
-- registered in the meantime carries a different note and is left alone — the inverse
-- never guesses from a list it wrote down hours earlier.
--
-- IT ANNOUNCES, IT DOES NOT REFUSE, ON GENERATED POLICIES — and the difference was
-- MEASURED rather than reasoned. The first draft of this file REFUSED when a row it
-- would delete sat on a table carrying `std_*` / `svc_* `/ `platform_admin_*` policies,
-- on the theory that those could only have been generated after registration. It fired
-- immediately (SQLSTATE P0001, 2026-09-18 00:17): W1-CLASS had already found that about
-- forty of the unregistered tables carry full grants to `authenticated` with a
-- `is_platform_admin()`-only arm — policies that PREDATE any registration. `pg_policy`
-- carries no creation time, so "was this generated after the row landed?" is a question
-- the catalog cannot answer, and a guard that cannot tell is a guard that lies. It now
-- counts them, NAMES them and prints the remedy, and proceeds.

do $$
declare
  n integer;
  v text;
begin
  select count(*), string_agg(distinct e.token, ', ')
    into n, v
    from platform.entity_types e
   where e.notes like 'W1-REG: registered by the classification census%'
     and exists (select 1 from pg_policy p
                  where p.polrelid = to_regclass(format('%I.%I', e.schema_name, e.table_name))
                    and p.polname ~ '^(std_|svc_|platform_admin_)');
  if n > 0 then
    raise notice
      'W1-REG inverse: % of the row(s) being deleted sit on tables that carry generator-shaped policies: %',
      n, left(v, 2000);
    raise notice
      'Most of those policies PREDATE registration (W1-CLASS measured ~40 such tables). If any table here was actually regenerated while it was registered, drop its policies through the generator — this inverse removes the registry row, not the policy.';
  end if;
end $$;

delete from platform.entity_types
 where notes like 'W1-REG: registered by the classification census%';

update platform.entity_types
   set type = null,
       type_reason = null,
       custom_fields_enabled = false
 where type is not null
    or type_reason is not null
    or custom_fields_enabled;

alter table platform.entity_types
  drop constraint if exists entity_types_type_is_derived_or_explained,
  drop constraint if exists entity_types_custom_fields_follow_type,
  drop constraint if exists entity_types_type_is_one_of_seven;

do $$
declare
  n_rows integer;
  n_typed integer;
  n_cons integer;
begin
  select count(*) into n_rows from platform.entity_types
   where notes like 'W1-REG: registered by the classification census%';
  select count(*) into n_typed from platform.entity_types where type is not null;
  select count(*) into n_cons from pg_constraint
   where conrelid = 'platform.entity_types'::regclass
     and conname in ('entity_types_type_is_one_of_seven','entity_types_custom_fields_follow_type',
                     'entity_types_type_is_derived_or_explained');
  if n_rows <> 0 or n_typed <> 0 or n_cons <> 0 then
    raise exception 'W1-REG inverse incomplete: % inserted row(s), % typed row(s), % constraint(s) survived',
      n_rows, n_typed, n_cons;
  end if;
  raise notice 'W1-REG inverse: the classification is gone, every type is null, the three CHECKs are dropped.';
end $$;
