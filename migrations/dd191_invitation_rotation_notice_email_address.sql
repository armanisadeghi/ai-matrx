-- dd191_invitation_rotation_notice_email_address — THE EMAIL HALF OF THE NOTICE HAD NOWHERE TO GO
-- (DD-191 part 4, fix 1. Data only.)
--
-- dd191_invalidate_leaked_invitation_tokens queued the inviter notices on both registered channels
-- but left `to_address` null on the email rows, so the send worker failed all four of them
-- immediately with `missing_recipient_address — Notification row has no to_address.` The in-app
-- half succeeded, so the inviter was told; the email half was a silent-looking dead row, which is
-- exactly what a security notice must never be.
--
-- This fills the address from the recipient's own account email and puts the rows back in the
-- queue (`status = 'pending'`, attempts reset), which is what `communication.claim_pending_
-- notifications` picks up. Only the four DD-191 rows are touched.

update communication.notification as notice
   set to_address = account.email,
       status = 'pending',
       attempt_count = 0,
       next_attempt_at = now(),
       error_code = null,
       error_message = null,
       updated_at = now()
  from auth.users as account
 where notice.event_key = 'iam.invitation.token_rotated'
   and notice.channel = 'email'
   and notice.to_address is null
   and account.id = notice.recipient_user_id
   and account.email is not null;
