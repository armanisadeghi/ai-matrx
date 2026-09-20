-- INVERSE of migrations/campaign/fix7b_the_census_counts_the_arm_not_the_sentence.sql
--
-- Puts the two census bodies back exactly as fix7b_a_list_of_people_is_never_platform_content.sql
-- left them — the whole-expression `not like '%is_super_admin%system_orgs%'` predicate that
-- cannot go red — and drops the counting helper this file added.
--
-- Running it restores a census that answers zero for a policy in the shape it exists to catch.
-- That is what an inverse of this file MEANS, and it is why the guard's --self-test exists.

create or replace function iam.people_lists_a_non_member_can_read()
  returns table (relation text, policy_name text, why text)
  language sql
  stable
  security definer
  set search_path to 'pg_catalog', 'public'
as $$
  select r.relation,
         p.polname::text,
         r.why
    from iam.personal_data_relations() r
    join pg_catalog.pg_class c on c.oid = to_regclass(r.relation)
    join pg_catalog.pg_policy p on p.polrelid = c.oid
   where r.is_personal
     and p.polcmd in ('r', '*')
     and pg_catalog.pg_get_expr(p.polqual, p.polrelid) like '%system_orgs%'
     and pg_catalog.pg_get_expr(p.polqual, p.polrelid) not like '%is_super_admin%system_orgs%'
   order by 1, 2;
$$;

create or replace function iam.people_shaped_relations_with_no_verdict()
  returns table (relation text, why text)
  language sql
  stable
  security definer
  set search_path to 'pg_catalog', 'public'
as $$
  with person_col as (
    select distinct a.attrelid as oid
      from pg_catalog.pg_attribute a
     where a.attnum > 0 and not a.attisdropped
       and a.attname in ('email','phone','mobile','first_name','last_name','full_name',
                         'given_name','family_name','person_name','contact_email','contact_name',
                         'contact_phone','email_address','phone_number')
  ), party_fk as (
    select distinct k.conrelid as oid
      from pg_catalog.pg_constraint k
     where k.contype = 'f' and k.confrelid = to_regclass('crm.party')
  ), has_the_arm as (
    select distinct p.polrelid as oid
      from pg_catalog.pg_policy p
     where p.polcmd in ('r', '*')
       and pg_catalog.pg_get_expr(p.polqual, p.polrelid) like '%system_orgs%'
       and pg_catalog.pg_get_expr(p.polqual, p.polrelid) not like '%is_super_admin%system_orgs%'
  )
  select n.nspname || '.' || c.relname,
         case when pc.oid is not null and pf.oid is not null then 'a person''s own column, and a foreign key into crm.party'
              when pc.oid is not null then 'a person''s own column'
              else 'a foreign key into crm.party' end
    from has_the_arm h
    join pg_catalog.pg_class c on c.oid = h.oid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    left join person_col pc on pc.oid = h.oid
    left join party_fk pf on pf.oid = h.oid
   where (pc.oid is not null or pf.oid is not null)
     and not exists (select 1 from iam.personal_data_relations() r
                      where r.relation = n.nspname || '.' || c.relname)
   order by 1;
$$;

drop function if exists iam.policy_carries_a_plain_system_org_arm(text);
