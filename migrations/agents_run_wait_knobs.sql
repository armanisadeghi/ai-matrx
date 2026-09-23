-- How long a client waits for the server to START answering an agent run, per
-- output kind (lib/api/run-wait.ts). Additive registry data only.
--
-- The builder's manual run carried a fixed 15-second wait for the response headers,
-- and aidream's prepared-streaming routes only send headers after request
-- preparation (auth, lane, conversation create, attached-file resolution). Under
-- load or a draining deploy prep exceeded 15 s, the client aborted, and the run was
-- lost. Once the stream opens there is no wall-clock cap (server heartbeat every 5 s);
-- this wait is the one cap left, and organizations own it.
insert into platform.feature_knob
 (feature, key, value, default_value, value_type, unit, min_value, max_value,
  allowed_values, label, description, set_by, basis, review_due,
  overridable_by, override_direction)
values
 ('agents.run_wait', 'text_seconds', '60', '60', 'integer', 'seconds', 15, 3600,
  null, 'Wait for a text run to start',
  'How long the page waits for the server to start answering a text run before it stops waiting and says so. Once the answer starts streaming there is no time limit.',
  'agent', 'Request preparation before the first byte is normally 1-2 s; 60 s absorbs a busy server or a deploy drain while still telling the person within a minute when the server is truly unreachable.',
  current_date + 45, '{organization}', 'any'),
 ('agents.run_wait', 'image_seconds', '300', '300', 'integer', 'seconds', 15, 3600,
  null, 'Wait for an image generation to start',
  'How long the page waits for the server to start an image generation before it stops waiting and says so. The generation itself may take as long as the model needs.',
  'agent', 'Image runs resolve reference images before streaming and provider calls run 10-100 s (gpt-image-2 observed at 159 s); five minutes never cuts a healthy job.',
  current_date + 45, '{organization}', 'any'),
 ('agents.run_wait', 'video_seconds', '900', '900', 'integer', 'seconds', 15, 3600,
  null, 'Wait for a video generation to start',
  'How long the page waits for the server to start a video generation before it stops waiting and says so. The generation itself may take as long as the model needs.',
  'agent', 'Video jobs upload and resolve larger inputs before streaming; fifteen minutes is generous against a normal start of seconds.',
  current_date + 45, '{organization}', 'any'),
 ('agents.run_wait', 'audio_seconds', '180', '180', 'integer', 'seconds', 15, 3600,
  null, 'Wait for an audio generation to start',
  'How long the page waits for the server to start an audio (speech or music) generation before it stops waiting and says so.',
  'agent', 'Speech and music jobs start within seconds; three minutes absorbs load without leaving a person staring at a dead page.',
  current_date + 45, '{organization}', 'any')
on conflict (feature, key) do nothing;
