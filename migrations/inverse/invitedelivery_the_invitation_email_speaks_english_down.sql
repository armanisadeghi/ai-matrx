-- chair-step: INVERSE — puts the doubled "You can can" back into the share.table_invited templates.
update communication.notification_event_type
   set config = jsonb_set(
         jsonb_set(config, '{templates,in_app,body}',
           to_jsonb('{{invite.inviter}} shared {{invite.table}} in {{invite.organization}} with you. You can {{invite.means}}.'::text)),
         '{templates,email,body}',
         to_jsonb(replace(config -> 'templates' -> 'email' ->> 'body',
                          'You {{invite.means}}.', 'You can {{invite.means}}.')))
 where event_key = 'share.table_invited' and deleted_at is null;
