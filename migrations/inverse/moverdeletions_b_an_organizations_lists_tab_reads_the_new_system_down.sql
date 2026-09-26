-- chair-step: INVERSE of migrations/campaign/moverdeletions_b_an_organizations_lists_tab_reads_the_new_system.sql (lane MOVER-DELETIONS). Drops custom.organization_pick_lists(uuid): the organization's Lists tab reads only the older list table again (the frontend reader treats the missing door as an error and says so).
-- lane: MOVER-DELETIONS

delete from platform.client_callable_door where schema_name = 'custom' and function_name = 'organization_pick_lists';
drop function if exists custom.organization_pick_lists(uuid);
