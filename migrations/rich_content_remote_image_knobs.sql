-- Remote images in rendered content: who wrote it decides whether a remote image loads by itself.
-- Chair ruling 2026-09-25 (RC-B11 low finding 1, full level): an image URL inside an AI answer is a
-- data-exfiltration channel (an injected answer can put private data in the query string and the
-- browser sends it when the image renders), and content written by someone else can carry a
-- tracking pixel. Claude.ai and ChatGPT do not auto-load arbitrary remote images in answers;
-- Gmail and Superhuman gate remote images in mail from others.
--
-- Client: matrx-frontend components/rich-content/prose/remote-image-policy.tsx (RemoteImageGate).
-- Our own files and same-origin images always load and are not governed here.
--
-- Knobs (organization, then person):
--   autoload_self  — content the viewer wrote themselves           default ON
--   autoload_other — content written by someone else               default OFF (click to load)
--   autoload_ai    — content a model wrote                         default OFF (click to load)
--   trusted_hosts  — {"<host>": true} hosts whose images always load; a person adds one from the
--                    placeholder ("Always show images from <host>").

insert into platform.feature_knob
 (feature, key, value, default_value, value_type, label, description, set_by, basis, review_due,
  overridable_by, override_direction)
values
 ('rich_content.remote_images', 'autoload_self', 'true', 'true', 'boolean',
  'Load images automatically in what I wrote',
  'Remote images (from other websites) in notes and documents you wrote yourself load without asking.',
  'agent', 'You chose to put the image there; loading it reveals nothing you did not already decide to share with that site.',
  current_date + 90, '{organization,user}', 'any'),
 ('rich_content.remote_images', 'autoload_other', 'false', 'false', 'boolean',
  'Load images automatically in what others wrote',
  'Remote images in comments, shared notes and documents written by someone else load without asking. Off: each shows a placeholder with a Show image button.',
  'agent', 'A remote image tells its website who opened the text and when (a tracking pixel). Gmail and Superhuman ask first for mail from others.',
  current_date + 90, '{organization,user}', 'any'),
 ('rich_content.remote_images', 'autoload_ai', 'false', 'false', 'boolean',
  'Load images automatically in AI answers',
  'Remote images in answers and output written by an AI model load without asking. Off: each shows a placeholder with a Show image button.',
  'agent', 'An image link in a model answer can carry private data to a third party the moment it renders (prompt-injection exfiltration). Claude.ai and ChatGPT do not auto-load arbitrary remote images in answers.',
  current_date + 90, '{organization,user}', 'any'),
 ('rich_content.remote_images', 'trusted_hosts', '{}', '{}', 'json',
  'Websites whose images always load',
  'Images from these websites load automatically wherever they appear. Add one from an image placeholder with "Always show images from …".',
  'agent', 'Starts empty: every trusted site is a choice somebody made on purpose.',
  current_date + 90, '{organization,user}', 'any')
on conflict (feature, key) do nothing;
