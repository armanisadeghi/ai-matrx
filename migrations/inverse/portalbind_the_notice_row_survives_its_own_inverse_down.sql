-- INVERSE: archive the share.portal_invited notice row again. Portal invitations are then
-- minted with nobody told, and communication.notify_from_sql says so by name
-- (`event_not_declared`) rather than failing silently.
update communication.notification_event_type
   set deleted_at = now()
 where event_key = 'share.portal_invited' and deleted_at is null;
