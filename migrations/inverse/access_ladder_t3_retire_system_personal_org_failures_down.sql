-- Inverse of access_ladder_t3_retire_system_personal_org_failures.sql

delete from platform.deprecated_relations where old_ref = 'iam.system_personal_org_failures';

do $$ begin
  if to_regclass('graveyard.system_personal_org_failures') is not null then
    execute 'alter table graveyard.system_personal_org_failures set schema iam';
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'system_personal_org_failures_user_id_fkey'
                   and conrelid = 'iam.system_personal_org_failures'::regclass) then
    alter table iam.system_personal_org_failures
      add constraint system_personal_org_failures_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete set null not valid;
  end if;
end $$;

update platform.entity_types
   set is_active = true, schema_name = 'iam'
 where token = 'system_personal_org_failure';
