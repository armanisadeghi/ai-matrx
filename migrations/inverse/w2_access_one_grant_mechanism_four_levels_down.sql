-- 🚨 ELEVEN OBJECTS ARE LEFT STANDING, ON PURPOSE (lane INVERSE-GUARD, 2026-09-21).
-- The header below says "every object this lane created, removed". That stopped being possible:
-- the access ladder this lane built is now the platform's ONE grant mechanism, and nine of its
-- functions were adopted by later lanes — five of them reached by the live triggers
-- `custom_record_rule_uses` and `custom_record_field_write_door` on `custom.record`, so dropping
-- them broke every write to the record store:
--   iam.may_touch_field         <- custom._field_write_door (reach_the_store_speaks_one_ladder.sql)
--   iam.field_sensitivity_level <- custom._field_write_door (reach_...)
--   iam.content_levels          <- iam.member_default_level_as_of (guardswitch_who_could_see_replays_the_knob.sql)
--   iam.effective_level         <- custom.reaches_directly (laddercap_a_ceiling_cannot_refuse_at_the_floor.sql)
--   iam.owner_of                <- custom.addressed_cap (laddercap_the_cap_is_resolved_once_and_governs_the_whole_ladder.sql)
--   iam.member_default_level    <- iam.member_lane_confers (laddercap_...)
--   iam.publish_to_world        <- custom.share_lane_set (share_the_store_has_a_share_door.sql)
--   iam.level_label             <- custom._table_share_invite_payload (invitedelivery_the_invitation_reaches_the_person.sql)
--   iam.top_content_level       <- custom.visibility_as_of (asof_the_audit_says_how_long.sql)
-- `iam.granted_level` stays because `iam.effective_level` calls it, and `iam.content_lane` stays
-- because `iam.content_levels` reads it — the TABLE stays and is EMPTIED instead of dropped.
--   THE DEFECT IS STILL RESTORED: the three guard triggers come off `iam.memberships`,
-- `iam.permissions` and `iam.content_lane` and their bodies go; the census and planning verbs go;
-- every `platform.client_callable_door` row this lane declared goes; the content-lane table is
-- emptied, so no lane is an act and there is no vocabulary to publish into; and the two
-- `custom/member_default_level` and `custom/field_sensitivity_levels` knob rows go, which is what
-- made the four levels one mechanism in the first place.
--
-- target: branch
--
-- W2-ACCESS — the inverse. Every object this lane created, removed; nothing else touched.
-- The two triggers it attached to live tables go with their functions, and the live tables
-- are left exactly as they were found.

set lock_timeout = '2s';

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
-- LEFT STANDING (lane INVERSE-GUARD, 2026-09-21): drop function if exists iam.publish_to_world(text, uuid, uuid, boolean);
drop function if exists iam.membership_change_refusal(uuid, uuid, uuid, text);
drop function if exists iam.visible_field_ids(uuid, uuid, uuid, public.permission_level, text);
-- LEFT STANDING (lane INVERSE-GUARD, 2026-09-21): drop function if exists iam.may_touch_field(uuid, uuid, uuid, public.permission_level, text);
-- LEFT STANDING (lane INVERSE-GUARD, 2026-09-21): drop function if exists iam.field_sensitivity_level(text, text, uuid);
-- LEFT STANDING (lane INVERSE-GUARD, 2026-09-21): drop function if exists iam.effective_level(uuid, text, uuid, uuid, uuid);
-- LEFT STANDING (lane INVERSE-GUARD, 2026-09-21): drop function if exists iam.granted_level(uuid, text, uuid);
-- LEFT STANDING (lane INVERSE-GUARD, 2026-09-21): drop function if exists iam.owner_of(text, uuid);
-- LEFT STANDING (lane INVERSE-GUARD, 2026-09-21): drop function if exists iam.member_default_level(uuid, uuid);
drop function if exists iam.role_label(text);
-- LEFT STANDING (lane INVERSE-GUARD, 2026-09-21): drop function if exists iam.level_label(text, public.permission_level);
-- LEFT STANDING (lane INVERSE-GUARD, 2026-09-21): drop function if exists iam.top_content_level();
drop function if exists iam.organization_roles();
-- LEFT STANDING (lane INVERSE-GUARD, 2026-09-21): drop function if exists iam.content_levels();
drop function if exists iam.door_identity_args(oid);
delete from platform.client_callable_door where declared_by = 'W2-ACCESS';

-- LEFT STANDING (lane INVERSE-GUARD, 2026-09-21): drop table if exists iam.content_lane;
delete from iam.content_lane;   -- the table stays; every row this lane wrote goes, which is the defect put back.

delete from platform.feature_knob
 where feature = 'custom' and key in ('member_default_level', 'field_sensitivity_levels');
