-- chair-step: this replaces the bodies of the two FIX-7B census functions, which the additive allow-list cannot pass because a production-targeted file must also read the knob named in its `-- guard:` line, and a census over the catalogue has no knob to read. Nothing is dropped, granted or revoked: two `create or replace function` on functions this lane itself created an hour earlier, each with its `-- based-on:` hash, plus one new function and three comments. The bodies get STRICTER — the predicate they had could not go red. The inverse is migrations/inverse/fix7b_the_census_counts_the_arm_not_the_sentence_down.sql and puts the two previous bodies back verbatim.
-- lane: FIX-7B
-- based-on: iam.people_lists_a_non_member_can_read() 5d11e35246a9ebed1c55cac0fa9366c0ea45bdb391d4d2c28f47d3d57793cd93
-- based-on: iam.people_shaped_relations_with_no_verdict() b9b00376ef0f930b1c751b0fb74e1f83e8ea96f7b8649a9388d049a4f44105b4
--
-- FIX-7B — THE CENSUS COUNTS THE ARM, NOT THE SENTENCE.
--
-- `fix7b_a_list_of_people_is_never_platform_content.sql` shipped both censuses with a predicate
-- that tested the WHOLE policy expression:
--
--     pg_get_expr(...) like '%system_orgs%'
--     and pg_get_expr(...) not like '%is_super_admin%system_orgs%'
--
-- A leaking policy carries BOTH arms — the plain global-readable one AND the super-admin-walled
-- one — so `%is_super_admin%system_orgs%` matched the whole string and the row was excluded.
-- The census therefore answered ZERO for a policy in exactly the shape it exists to catch. Its
-- answer on this database was right (the reclassification really did remove the arm, proved
-- below), and it was right by accident, which is worse than being wrong: the guard could not go
-- red, and its own self-test said so.
--
-- Caught by writing the self-test, which is the whole reason a guard has one.
--
-- THE PREDICATE NOW COUNTS ARMS. `iam.policy_carries_a_plain_system_org_arm(text)` counts how
-- many times the expression names `iam.system_orgs`, counts how many of those occurrences are
-- the super-admin-walled shape, and answers whether any occurrence is left over. Measured live
-- the moment it was written: 241 policies on this database carry a plain arm (platform content,
-- which is what the arm is for), 0 of them are a relation ruled personal, and `crm.party`
-- answers false.
--
-- AND IT ASKS THE REGISTRY TOO. The arm is emitted by `iam.entity_read_expr` only for a token
-- whose class resolves to `organization` or `public`, and the kernel `iam.has_access_for_base`
-- gates its own copy on the same condition. So a personal relation whose CLASS still says
-- `organization` is a leak waiting for the next regeneration even if its policy text is clean
-- today, and the census names it. Text drift and registry drift are both caught.

create function iam.policy_carries_a_plain_system_org_arm(p_expr text)
  returns boolean
  language sql
  immutable
as $$
  -- The global-readable arm, WITHOUT the super-admin wall in front of it. Counting rather than
  -- matching, because a policy that carries both arms is exactly the leaking shape and a
  -- whole-string `not like` excludes it.
  select p_expr is not null
     and ((length(p_expr) - length(replace(p_expr, 'iam.system_orgs', '')))
            / length('iam.system_orgs'))
       > ((length(p_expr) - length(replace(p_expr,
             'is_super_admin) AND (organization_id IN ( SELECT so.organization_id', '')))
            / length('is_super_admin) AND (organization_id IN ( SELECT so.organization_id'));
$$;

comment on function iam.policy_carries_a_plain_system_org_arm(text) is
  'FIX-7B: whether a policy expression admits every signed-in account through the db-rules §6e global-readable system organization, with no super-admin wall in front of it.';

create or replace function iam.people_lists_a_non_member_can_read()
  returns table (relation text, policy_name text, why text)
  language sql
  stable
  security definer
  set search_path to 'pg_catalog', 'public'
as $$
  -- 1. the policy TEXT a real HTTP read runs against
  select r.relation,
         p.polname::text,
         r.why
    from iam.personal_data_relations() r
    join pg_catalog.pg_class c on c.oid = to_regclass(r.relation)
    join pg_catalog.pg_policy p on p.polrelid = c.oid
   where r.is_personal
     and p.polcmd in ('r', '*')
     and iam.policy_carries_a_plain_system_org_arm(
           pg_catalog.pg_get_expr(p.polqual, p.polrelid))
  union
  -- 2. and the REGISTRY, which decides what the next regeneration will emit
  select r.relation,
         'data_class ' || coalesce((iam.class_lanes(et.token)).resolved_class::text, 'unset'),
         r.why
    from iam.personal_data_relations() r
    join platform.entity_types et
      on et.is_active
     and et.schema_name || '.' || et.table_name = r.relation
   where r.is_personal
     and (iam.class_lanes(et.token)).resolved_class in ('organization', 'public')
   order by 1, 2;
$$;

comment on function iam.people_lists_a_non_member_can_read() is
  'FIX-7B census: a relation of people whose read policy still admits every signed-in account through the global-readable system organization, or whose class would make the generator emit that arm again. Must be empty.';

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
       and iam.policy_carries_a_plain_system_org_arm(
             pg_catalog.pg_get_expr(p.polqual, p.polrelid))
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

comment on function iam.people_shaped_relations_with_no_verdict() is
  'FIX-7B census: a relation that looks like people, still carries the plain §6e arm, and that iam.personal_data_relations() has never ruled on. Must be empty — rule on it, do not narrow the census.';

-- The file proves nothing itself: a DO block that queries is indistinguishable, to the
-- additive allow-list, from a DO block that builds DDL at run time. The proof lives where it
-- can be re-run at any moment instead — `pnpm check:people-lists-stay-in-your-organizations`
-- and its `--self-test`, and scripts/campaign-tests/fix7b_people_green.sql from the seat.
