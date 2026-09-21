-- FIX-7B — THE RED TWIN. The green suite must be able to FAIL, or it proves nothing.
--
-- This runs the REAL BYTES of both inverses inside ONE transaction that is rolled back, and
-- asserts that each of the green suite's clauses turns red behind them. If a block does NOT go
-- red, the green suite is passing for some reason other than the fix, and this file says so.
--
-- Run:  <psql> -f scripts/campaign-tests/fix7b_people_red.sql     (the MAIN database)
--
-- Nothing survives: the whole file ends in ROLLBACK.

\set ON_ERROR_STOP on
begin;
set local lock_timeout = '10s';

-- ── the real bytes of migrations/inverse/fix7b_a_list_of_people_is_never_platform_content_down.sql
update platform.entity_types
   set data_class = 'organization',
       data_class_reason = 'red twin: put back what the inverse puts back'
 where is_active
   and token in ('party','contact_medium','crm_blocklist_entry','crm_deal','crm_enrichment_call',
                 'commerce_print_order','platform_outcome_event','crm_outreach_list',
                 'crm_sending_identity','esign_campaign','esign_envelope');

do $$
declare r record;
begin
  for r in
    select et.schema_name as s, et.table_name as t, et.token as k, et.rls_variant as v
      from platform.entity_types et
     where et.is_active
       and et.token in ('party','contact_medium','crm_blocklist_entry','crm_deal',
                        'crm_enrichment_call','commerce_print_order','platform_outcome_event',
                        'crm_outreach_list','crm_sending_identity','esign_campaign','esign_envelope',
                        'crm_address','crm_affiliation','crm_contact_candidate','crm_interaction',
                        'crm_merge_candidate','crm_party_merge','party_contact_point',
                        'crm_outreach_list_member','crm_sending_event','esign_campaign_member',
                        'esign_envelope_signer')
     order by et.schema_name, et.table_name
  loop
    perform iam.apply_rls(r.s, r.t, r.k, r.v);
  end loop;
end $$;

do $$
declare
  c_test text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated","email":"test@test.com"}';
  k_system uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_boss text := current_user;
  n int; red int := 0; blocks int := 4;
begin
  perform set_config('request.jwt.claims', c_test, true);
  perform set_config('role', 'authenticated', true);

  -- BLOCK 1 — she reads the platform tenant's people again
  select count(*) into n from crm.party where organization_id = k_system;
  if n > 0 then
    red := red + 1;
    raise notice 'BLOCK 1 RED — she reads % person row(s) of the platform tenant again', n;
  else
    raise warning 'BLOCK 1 DID NOT GO RED — the inverse did not reopen crm.party';
  end if;

  -- BLOCK 2 — and their email addresses and phone numbers
  select count(*) into n from crm.contact_medium cm
   where exists (select 1 from crm.party_contact_point pcp
                  where pcp.medium_id = cm.id and pcp.organization_id = k_system);
  if n > 0 then
    red := red + 1;
    raise notice 'BLOCK 2 RED — she reads % contact medium row(s) of the platform tenant again', n;
  else
    raise warning 'BLOCK 2 DID NOT GO RED — the inverse did not reopen crm.contact_medium';
  end if;

  -- BLOCK 3 — the census names it
  perform set_config('role', v_boss, true);
  select count(*) into n from iam.people_lists_a_non_member_can_read();
  if n > 0 then
    red := red + 1;
    raise notice 'BLOCK 3 RED — the census names % people list(s) a non-member can read', n;
  else
    raise warning 'BLOCK 3 DID NOT GO RED — the census cannot see the reopened lists';
  end if;

  -- BLOCK 4 — and the second inverse's broken predicate cannot see any of it
  -- (the real bytes of migrations/inverse/fix7b_the_census_counts_the_arm_not_the_sentence_down.sql,
  --  inline as an expression so the function is not actually replaced mid-file)
  select count(*) into n
    from iam.personal_data_relations() r
    join pg_class c on c.oid = to_regclass(r.relation)
    join pg_policy p on p.polrelid = c.oid
   where r.is_personal
     and p.polcmd in ('r','*')
     and pg_get_expr(p.polqual, p.polrelid) like '%system_orgs%'
     and pg_get_expr(p.polqual, p.polrelid) not like '%is_super_admin%system_orgs%';
  if n = 0 then
    red := red + 1;
    raise notice 'BLOCK 4 RED — with the lists reopened, the OLD whole-expression predicate still answers 0: exactly the blindness the second migration fixed';
  else
    raise warning 'BLOCK 4 DID NOT GO RED — the old predicate saw % row(s); it was not blind after all', n;
  end if;

  perform set_config('role', v_boss, true);
  if red <> blocks then
    raise exception 'RED TWIN FAILED — only % of % blocks went red', red, blocks;
  end if;
  raise notice '% of % blocks are RED', red, blocks;
end $$;

rollback;
