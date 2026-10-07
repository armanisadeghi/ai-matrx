-- Inverse of scopesw3b_the_membrane_registry_matches_the_moved_tables.sql.
insert into context.scope_door_registry (function_name, door_class, reason, reviewed_at)
values ('context.provision_scope_datasets_trigger', 'unreachable',
        'The trigger itself; short-circuits on every insert because reference_source is NULL everywhere.', date '2026-09-11')
on conflict do nothing;
