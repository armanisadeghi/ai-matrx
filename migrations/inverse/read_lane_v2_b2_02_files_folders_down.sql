-- chair-step: inverse of read_lane_v2_b2_02_files_folders — un-enrolls files.folders from read-lane v2 and regenerates it back to the set-form read lane.
delete from iam.read_lane_v2_rollout where token = (select token from platform.entity_types where schema_name = 'files' and table_name = 'folders' and is_active);
select iam.apply_rls('files', 'folders', (select token from platform.entity_types where schema_name = 'files' and table_name = 'folders' and is_active), (select rls_variant from platform.entity_types where schema_name = 'files' and table_name = 'folders' and is_active));
