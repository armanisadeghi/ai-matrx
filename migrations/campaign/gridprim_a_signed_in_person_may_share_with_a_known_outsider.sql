-- chair-step: it adds the `share.table_granted` notification kind (an INSERT into
--   communication.notification_event_type, which the production allow-list refuses outside a chair
--   step), (re)opens the signed-in lane on G14's door row, and runs
--   `select custom.reopen_declared_doors()`, which ISSUES the EXECUTE grant to `authenticated` for
--   `custom.table_share_outside_grant(uuid, uuid, text, permission_level)` — the ddl guard takes a
--   new definer's client grant back at birth. Nothing is replaced, dropped or revoked; `anon` gains
--   nothing. Apply AFTER gridprim_a_known_outsider_is_granted_at_once.sql. The inverse is
--   `migrations/inverse/gridprim_a_signed_in_person_may_share_with_a_known_outsider_down.sql`.
-- lane: GRID-PRIMITIVES
-- lock: custom,platform
--
-- LANE GRID-PRIMITIVES G14, THE NOTIFICATION KIND AND THE GRANT. The kind mirrors
-- share.table_invited (invitedelivery_the_invitation_reaches_the_person.sql), except that access
-- is already open, so its link opens the table rather than an invitation.

set local lock_timeout = '5s';
set local statement_timeout = '60s';

insert into communication.notification_event_type
  (organization_id, event_key, label, description, default_channels, enabled, config)
values (
  public.system_org_id('system'),
  'share.table_granted',
  'A table was shared with you',
  'Somebody at an organization you are not in gave your account access to one of its tables. '
  'Access is already open; this message says so and opens the table.',
  '{"in_app": true, "email": true}'::jsonb,
  true,
  jsonb_build_object(
    'target_kind', 'custom_table',
    'deep_link_template', '/data-v2/{{grant.table_id}}?org={{grant.organization_id}}',
    'sms_locked', true,
    'templates', jsonb_build_object(
      'in_app', jsonb_build_object(
        'body', '{{grant.sharer}} shared {{grant.table}} in {{grant.organization}} with you. You can {{grant.means}}.'),
      'email', jsonb_build_object(
        'subject', '{{grant.sharer}} shared {{grant.table}} with you',
        'body',
          '{{grant.sharer}} gave you access to {{grant.table}} in {{grant.organization}}.' || E'\n\n' ||
          'You can {{grant.means}}. It is open already — nothing to accept.' || E'\n\n' ||
          'Open it here:' || E'\n' ||
          '{{link.deep}}' || E'\n\n' ||
          'This does not put you in {{grant.organization}}. You will see {{grant.table}} and nothing else there, ' ||
          'and {{grant.sharer}} can take it back at any time.' || E'\n\n' ||
          '--' || E'\n' ||
          'AI Matrx sent this because somebody at {{grant.organization}} shared a table with you. ' ||
          'Manage notifications: {{link.preferences}}'))))
on conflict (event_key) do nothing;

update platform.client_callable_door
   set signed_in_callers = true, non_client_lane = null
 where schema_name = 'custom' and function_name = 'table_share_outside_grant'
   and declared_by = 'gridprim_a_known_outsider_is_granted_at_once.sql';

select custom.reopen_declared_doors();
