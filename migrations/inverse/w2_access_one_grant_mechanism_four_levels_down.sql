-- target: branch
--
-- W2-ACCESS — the inverse. Every object this lane created, removed; nothing else touched.
-- The two triggers it attached to live tables go with their functions, and the live tables
-- are left exactly as they were found.

set lock_timeout = '5s';

drop trigger if exists _iam_one_owner_guard on iam.memberships;
drop trigger if exists _iam_per_table_grant_guard on iam.permissions;
drop trigger if exists _iam_world_lane_is_an_act on iam.content_lane;

drop function if exists iam._one_owner_guard();
drop function if exists iam._per_table_grant_guard();
drop function if exists iam._world_lane_is_an_act();

drop function if exists iam.realtime_field_exposure();
drop function if exists iam.role_vocabulary_offenders();
drop function if exists iam.shareable_registry_repoint_plan();
drop function if exists iam.discoverable_card(text, uuid);
drop function if exists iam.lane_of(text, uuid);
drop function if exists iam.publish_to_world(text, uuid, uuid, boolean);
drop function if exists iam.membership_change_refusal(uuid, uuid, uuid, text);
drop function if exists iam.visible_field_ids(uuid, uuid, uuid, public.permission_level, text);
drop function if exists iam.may_touch_field(uuid, uuid, uuid, public.permission_level, text);
drop function if exists iam.field_sensitivity_level(text, text, uuid);
drop function if exists iam.effective_level(uuid, text, uuid, uuid, uuid);
drop function if exists iam.granted_level(uuid, text, uuid);
drop function if exists iam.owner_of(text, uuid);
drop function if exists iam.member_default_level(uuid, uuid);
drop function if exists iam.role_label(text);
drop function if exists iam.level_label(text, public.permission_level);
drop function if exists iam.top_content_level();
drop function if exists iam.organization_roles();
drop function if exists iam.content_levels();
drop function if exists iam.door_identity_args(oid);
delete from platform.client_callable_door where declared_by = 'W2-ACCESS';

drop table if exists iam.content_lane;

delete from platform.feature_knob
 where feature = 'custom' and key in ('member_default_level', 'field_sensitivity_levels');
