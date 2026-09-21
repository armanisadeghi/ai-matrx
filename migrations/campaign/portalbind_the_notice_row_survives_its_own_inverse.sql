-- PORTAL-BIND — A ROW THAT CAME BACK SOFT-DELETED, AND THE NOTICE THAT VANISHED WITH IT.
--
-- Additive: it un-deletes one `communication.notification_event_type` row and makes that row's
-- declaration idempotent. Nothing is dropped and no function changes.
--
-- 🚨 CAUGHT BY RULE 27, WHICH IS WHAT RULE 27 IS FOR. Running this lane's inverses and then
-- re-applying its files — up → inverse → up on the final bytes — turned clause 2 of
-- `scripts/campaign-tests/portalbind_green.sql` RED:
--
--     ERROR: 2: inviting her wrote NO notice — the invitation exists and nobody was told
--
-- The inverse SOFT-DELETES the `share.portal_invited` row (this platform archives, it does not
-- purge), and the re-apply's `insert … on conflict do nothing` then did exactly nothing,
-- because `notification_event_type_event_key_key` still held the deleted row. So the event was
-- present-but-deleted, `communication.notify_from_sql` answered `event_not_declared` — honestly,
-- by name, which is why this was findable at all — and every portal invitation from then on
-- would have been minted with nobody told.
--
-- THE CLASS: a soft-deleting platform and `on conflict DO NOTHING` do not mix. A declaration
-- that can be archived has to be re-stated on conflict, not skipped, or the thing that restores
-- it is the one act that breaks it. This file re-states it, and any future re-apply of it will
-- too.

set lock_timeout = '4s';

update communication.notification_event_type
   set deleted_at = null,
       enabled    = true,
       updated_at = now()
 where event_key = 'share.portal_invited';

-- Belt and braces for a clean database that never had the row: the same declaration, stated
-- rather than skipped.
insert into communication.notification_event_type
  (event_key, label, description, default_channels, config, enabled, organization_id, visibility)
select 'share.portal_invited',
       t.label, t.description, t.default_channels, t.config, true, t.organization_id, t.visibility
  from communication.notification_event_type t
 where t.event_key = 'share.portal_invited'
on conflict (event_key) do update
  set deleted_at = null, enabled = true, updated_at = now();
