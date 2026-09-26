-- chair-step: rehearsal inverse of rca8e — the two notification preference tables go back to the entity variant (organization lane for internal rows).
-- window-class: one iam.apply_rls regeneration + a constraint drop; the supautils set (auth/storage/realtime) frozen until commit, milliseconds
-- Inverse of migrations/rca8e_notification_preferences_are_personal.sql (rehearsal only).

set local lock_timeout = '2s';

alter table communication.sms_notification_preferences
  drop constraint sms_notification_preferences_is_personal_ck;

update platform.entity_types
   set rls_variant = 'entity', data_class = 'confidential'
 where schema_name = 'communication'
   and table_name = 'notification_preference'
   and rls_variant = 'personal';

select iam.apply_rls('communication', 'notification_preference', 'notification_preference', 'entity');
