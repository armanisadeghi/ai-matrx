-- chair-step: THE INVERSE of migrations/campaign/sharerevoke_every_table_the_ladder_reads_empties_the_memo.sql.
--   It takes the memo-clearing triggers back off the five tables that file added and returns
--   `platform.memo_reach_tables()` to its fourteen names — which puts the defect back: inside ONE
--   statement a revoked share keeps the table "open" for the rest of that statement
--   (sharedonly_green.sql PART 6 fails again). It drops TRIGGERS, which the supautils hook fires
--   on, so at production it is window-class. No row of anybody's data is touched.
-- window-class: DROP TRIGGER is one of the two statements the supautils hook fires on; measured on
--   the clone 2026-09-23, this file takes ACCESS EXCLUSIVE on 23 auth, storage and realtime relations.
-- based-on: platform.memo_reach_tables() 5f8b874d027786b80b509c6f3cbef50e5a051222d9fb91feedbbd7a223a9ec46

drop trigger if exists zz_memo_clear_i on iam.permissions;
drop trigger if exists zz_memo_clear_u on iam.permissions;
drop trigger if exists zz_memo_clear_d on iam.permissions;
drop trigger if exists zz_memo_clear_i on custom.carrying_rule;
drop trigger if exists zz_memo_clear_u on custom.carrying_rule;
drop trigger if exists zz_memo_clear_d on custom.carrying_rule;
drop trigger if exists zz_memo_clear_i on custom.portal_table;
drop trigger if exists zz_memo_clear_u on custom.portal_table;
drop trigger if exists zz_memo_clear_d on custom.portal_table;
drop trigger if exists zz_memo_clear_i on platform.association_types;
drop trigger if exists zz_memo_clear_u on platform.association_types;
drop trigger if exists zz_memo_clear_d on platform.association_types;
drop trigger if exists zz_memo_clear_i on platform.shareable_resource_registry;
drop trigger if exists zz_memo_clear_u on platform.shareable_resource_registry;
drop trigger if exists zz_memo_clear_d on platform.shareable_resource_registry;

CREATE OR REPLACE FUNCTION platform.memo_reach_tables()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
AS $function$
  -- EVERY BASE TABLE THE STORE'S THREE DOOR PREDICATES AND THE LADDER UNDER THEM READ. Read out
  -- of the function bodies on 2026-09-20, not remembered:
  --   custom.assert_store_door -> custom.store_is_open -> platform.knob_resolve  (knob tables
  --     already carry `platform.memo_bump`, which is why they are not repeated here)
  --   custom.assert_client_may_reach -> iam.has_org_access -> iam.memberships, iam.system_orgs
  --                                  -> custom.portal_admits -> custom.portal,
  --                                     custom.portal_principal
  --   custom.assert_may_know_table -> custom.has_visibility -> custom.reaches_directly
  --                                  -> platform.associations, platform.reachability,
  --                                     platform.entity_relationships, platform.entity_types,
  --                                     platform.rulebook, platform.entity_grants,
  --                                     iam.membership_grant, iam.org_industries,
  --                                     iam.organizations, custom.record
  select array[
    'platform.associations', 'platform.entity_grants', 'platform.entity_relationships',
    'platform.entity_types', 'platform.reachability', 'platform.rulebook',
    'iam.memberships', 'iam.membership_grant', 'iam.org_industries', 'iam.organizations',
    'iam.system_orgs', 'custom.portal', 'custom.portal_principal', 'custom.record'
  ]::text[];
$function$;
