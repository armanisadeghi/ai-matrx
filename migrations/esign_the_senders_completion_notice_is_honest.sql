-- The sender's "everyone signed" email said the signed copy was saved before anything had checked
-- that it was (2026-10-04 review). It now says where to get it — the envelope page makes the copy
-- on demand if the completion attempt missed it — and that every signer was sent theirs.
update communication.notification_event_type
   set config = jsonb_set(config, '{templates,email}', jsonb_build_object(
         'subject', 'Signed by everyone: {{envelope.title}}',
         'body', E'Everyone has signed "{{envelope.title}}". Each signer has been emailed the signed copy.\n\nDownload it and the signing record here: {{link.deep}}\n\n--\nAI Matrx sent this because you sent this document for signature. Manage notifications: {{link.preferences}}'))
 where event_key = 'esign.completed';
