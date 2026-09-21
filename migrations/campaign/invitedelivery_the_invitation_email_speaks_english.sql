-- INVITE-DELIVERY — "YOU CAN CAN READ IT."
--
-- 🚨 CAUGHT BY A REAL SEND, NOT BY A TEST. On 2026-09-21 at 14:01:36Z the deployed server
-- rendered and sent the first real table-share invitation through Resend
-- (provider_message_id 01a0c445-b098-712c-bdbb-64a69235d3fe, to test@test.com), and the
-- body read:
--
--     You can can read it.
--
-- `custom.share_levels().means` is ALREADY a clause — "can read it", "can change it",
-- "can change it and decide who else may" — because it is written to be read in a picker
-- ("They can: …"). The template wrapped it in a second "You can". The words a person reads
-- for a rung come from ONE place and this is not it, so the sentence AROUND them is what
-- gets fixed, never the words. The same mistake was in `custom.table_share_outside_peek`'s
-- `offer` sentence and was fixed there before it ever shipped; this is its twin, in the
-- one place a test could not see it — the registry row's template, which is rendered by
-- Python, in another process, at send time.
--
-- WHY A MIGRATION AND NOT JUST THE DECLARATION. `reconcile_notification_event_types`
-- treats `templates` as a KNOB: "the row is the admin's once it is born", never rewritten
-- from the declaration. That is the right rule and it is not being weakened here — the
-- declaration in `services/notifications/declarations.py` is corrected in the same commit,
-- and this file corrects the row that was already born.

update communication.notification_event_type
   set config = jsonb_set(
         jsonb_set(config, '{templates,in_app,body}',
           to_jsonb('{{invite.inviter}} shared {{invite.table}} in {{invite.organization}} with you. You {{invite.means}}.'::text)),
         '{templates,email,body}',
         to_jsonb(replace(config -> 'templates' -> 'email' ->> 'body',
                          'You can {{invite.means}}.', 'You {{invite.means}}.')))
 where event_key = 'share.table_invited'
   and deleted_at is null;
