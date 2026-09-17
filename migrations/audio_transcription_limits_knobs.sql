-- audio_transcription_limits_knobs — the audio/transcription ceilings stop
-- being constants in `features/audio/constants.ts` and become knob rows.
--
-- WHY (owner mandate, 2026-09-17): an expert who owns a 9-hour audiobook
-- could not get it into AI Matrx. The frontend refused anything over
-- 100 MB / 60 minutes (`AUDIO_LIMITS.MAX_FILE_SIZE_BYTES`,
-- `AUDIO_LIMITS.MAX_DURATION_SECONDS`) while the server has chunked
-- arbitrarily long audio into provider-sized pieces and reassembled it with
-- shifted timestamps since `aidream/aidream/services/audio/file_transcription.py`
-- (`plan_chunks` + `PROVIDER_LIMIT_MB`). The client gate was a stale constant
-- guarding a capability the server already had. Law 6 (opinions become knobs)
-- and `common-docs/policies/limits-are-knobs-agents-set-them.md`.
--
-- TWO LANES, deliberately separate and separately named:
--   `upload_*`    — a file the person hands us. The server chunks it, so the
--                   ceiling exists only to catch an obvious mistake (a 40 GB
--                   video dragged in by accident), not to shape the product.
--   `recording_*` — a LIVE browser capture. The blob is held in the tab's
--                   memory until it is uploaded, so this ceiling is a real
--                   practical one and is much smaller. It is a knob too — a
--                   bare constant here was the same defect one size down.
--
-- Starting values, and why:
--   upload_max_duration_seconds = 86400 (24 h)
--       An unabridged audiobook is 8–14 h; the longest commercial audiobooks
--       run ~60 h across volumes but arrive as per-volume files. 24 h is far
--       above the 12-hour audiobook the mandate names and still refuses a
--       multi-day CCTV dump handed over by mistake.
--   upload_max_file_size_bytes = 5368709120 (5 GB)
--       24 h of 320 kbps stereo MP3 is ~3.5 GB; 24 h of 128 kbps is ~1.4 GB.
--       5 GB clears the duration ceiling at any sane audio bitrate and still
--       refuses a raw video master.
--   recording_max_duration_seconds = 14400 (4 h)
--       A browser MediaRecorder holds the capture in tab memory. At the
--       measured ~16 KB/s of webm/opus, 4 h is ~230 MB resident — large but
--       survivable, and four hours covers a full workshop or deposition.
--       Someone who needs nine hours records to a file and uploads it.
--   recording_warn_duration_seconds = 13200 (3 h 40 m)
--       Twenty minutes of warning before the recorder stops itself, the same
--       proportion the old 50-of-60-minute warning carried.
--   recording_max_file_size_bytes = 536870912 (512 MB)
--       Double the 4-hour estimate, so a higher-bitrate device does not trip
--       the size ceiling before the duration ceiling it is paired with.
--   recording_chunk_rotation_ms = 10000
--       The steady-state streaming-dictation cadence: how much audio each
--       interim transcription request carries once the warm-up ramp is over.
--       Unchanged VALUE — 10 s is what `scheduleNextRotation` has always used;
--       it was simply a bare literal inside the hook while the constant file
--       carried an unrelated, unconsumed 2 s. (The first three rotations still
--       ramp 3s/3s/4s in code: that is a warm-up shape so the first words
--       appear fast, not a limit anyone would turn.)
--   chunk_fetch_timeout_ms = 30000
--       How long one chunk transcription may hang on a bad network before it
--       is abandoned so finalize never wedges. Unchanged value, now turnable.
--   estimate_confirm_min_duration_seconds = 600 (10 min)
--       THE EXPENSIVE-CLICK LINE. Above this, transcription stops and shows
--       length, estimated cost and estimated time before it spends anything
--       (`common-docs/policies/destructive-and-expensive-actions.md`). Below
--       it, a ten-minute voice memo is not worth a dialog.
--   estimated_cost_per_audio_hour_usd = 0.12
--       Deliberately ABOVE what we pay. Groq whisper-large-v3 lists at about
--       $0.111 per audio hour and the turbo model far less; the catalog
--       routes `stt-default` to Groq. An estimate shown before a spend must
--       never come in under the bill, so the number quoted is the expensive
--       end of the models we actually route to.
--   estimated_seconds_per_audio_hour = 72
--       50× real time. Measured shape, not a provider promise: the server
--       demuxes, normalizes, splits into ~80 MB windows and transcribes them,
--       so wall-clock is dominated by chunk count and upload, not by the
--       model. A 9-hour audiobook quotes ~11 minutes.
--   upload_retry_max_attempts = 3 / base 1000 ms / max 8000 ms
--       The existing retry policy, unchanged in value. It is a product
--       opinion about how hard we fight a flaky network, so it is a row.
--
-- NOT knobs, and they stay constants in `features/audio/constants.ts` with a
-- comment saying why: Vercel's 4.5 MB request-body ceiling and the 4 MB chunk
-- size derived from it (a hard platform limit, identical on every plan), the
-- measured webm/opus bitrate used to project a recording's size, the 1 KB
-- floor under which a chunk is silence, and the retryable HTTP status list.
--
-- Overridability, decided per key (never by pattern — see the SoR's
-- § Curating `overridable_by`): every one of these is tenant policy about how
-- this organization runs its own capture and transcription, so `organization`.
-- None is user-overridable: a person raising their own transcription ceiling
-- spends the organization's money, and the estimate line in particular is a
-- spend control. `estimate_confirm_min_duration_seconds` is `lower_only` so an
-- organization may demand MORE confirmation than the platform does and never
-- less.
--
-- Idempotent (ON CONFLICT DO UPDATE on metadata, never on `value`).
-- Reversible: DELETE the rows; the client then refuses to apply a ceiling and
-- says so on screen rather than silently reverting to a hardcoded one.
--
-- Ledger: public._schema_migrations (source 'matrx-frontend').

INSERT INTO platform.feature_knob (
  feature, key, value, default_value, value_type, unit,
  min_value, max_value, label, description, set_by, basis, review_due,
  overridable_by, override_direction
) VALUES
(
  'media.transcription', 'upload_max_duration_seconds',
  '86400'::jsonb, '86400'::jsonb, 'integer', 'seconds',
  60, 604800,
  'Uploaded audio — maximum length',
  'The longest audio file someone may upload for transcription. The server splits anything longer than a provider will accept into windows and stitches the timestamps back together, so this ceiling exists to catch an obviously wrong file, not to shape the product.',
  'agent',
  'Set 2026-09-17 to unblock a 9-hour audiobook the old 60-minute client constant refused. An unabridged audiobook runs 8-14 hours; 24 hours clears every realistic one and still refuses a multi-day recording handed over by mistake.',
  (current_date + 45),
  ARRAY['organization'], 'any'
),
(
  'media.transcription', 'upload_max_file_size_bytes',
  '5368709120'::jsonb, '5368709120'::jsonb, 'integer', 'bytes',
  1048576, 107374182400,
  'Uploaded audio — maximum file size',
  'The largest audio file someone may upload for transcription. Paired with the length ceiling: whichever is reached first refuses, naming itself.',
  'agent',
  'Set 2026-09-17, replacing a 100 MB constant that mirrored a single provider request limit the server no longer sends whole files to. 24 hours of 320 kbps stereo MP3 is about 3.5 GB; 5 GB clears the length ceiling at any sane audio bitrate and still refuses a raw video master.',
  (current_date + 45),
  ARRAY['organization'], 'any'
),
(
  'media.transcription', 'recording_max_duration_seconds',
  '14400'::jsonb, '14400'::jsonb, 'integer', 'seconds',
  60, 86400,
  'Browser recording — maximum length',
  'How long one live in-browser recording may run before it stops itself. Much smaller than the upload ceiling on purpose: a browser capture is held in the tab''s memory until it is saved, so this is a real practical limit rather than a sanity check.',
  'agent',
  'Set 2026-09-17. At the measured ~16 KB/s of webm/opus, 4 hours is about 230 MB resident in the tab — large but survivable — and covers a full workshop or deposition. Anyone needing longer records to a file and uploads it.',
  (current_date + 45),
  ARRAY['organization'], 'any'
),
(
  'media.transcription', 'recording_warn_duration_seconds',
  '13200'::jsonb, '13200'::jsonb, 'integer', 'seconds',
  30, 86400,
  'Browser recording — warn at',
  'When the recorder starts warning that it is approaching its own ceiling. Should sit below the browser recording length ceiling; a value above it simply never fires.',
  'agent',
  'Set 2026-09-17 to 3 hours 40 minutes: twenty minutes of warning before a 4-hour recorder stops itself, the same proportion the previous 50-of-60-minute warning carried.',
  (current_date + 45),
  ARRAY['organization'], 'any'
),
(
  'media.transcription', 'recording_max_file_size_bytes',
  '536870912'::jsonb, '536870912'::jsonb, 'integer', 'bytes',
  1048576, 10737418240,
  'Browser recording — maximum size',
  'The largest blob one live in-browser recording may reach before it stops itself.',
  'agent',
  'Set 2026-09-17 to 512 MB: roughly double the projected size of a 4-hour webm/opus capture, so a higher-bitrate device trips the length ceiling it is paired with rather than this one.',
  (current_date + 45),
  ARRAY['organization'], 'any'
),
(
  'media.transcription', 'recording_chunk_rotation_ms',
  '10000'::jsonb, '10000'::jsonb, 'integer', 'milliseconds',
  1000, 60000,
  'Live dictation — audio per interim chunk',
  'How much audio each interim transcription request carries once live dictation reaches its steady cadence. Shorter feels faster and costs more requests; longer is cheaper and lags more. The first three chunks always rotate faster so the first words appear quickly.',
  'agent',
  'Carried over unchanged in value (10 seconds) from the literal inside useChunkedRecordAndTranscribe''s scheduleNextRotation, which is what production has actually run. Now turnable without a deploy.',
  (current_date + 45),
  ARRAY['organization'], 'any'
),
(
  'media.transcription', 'chunk_fetch_timeout_ms',
  '30000'::jsonb, '30000'::jsonb, 'integer', 'milliseconds',
  5000, 300000,
  'Live dictation — chunk request timeout',
  'How long one interim chunk transcription may hang before it is abandoned. Exists so a bad network can never wedge the finalize step.',
  'agent',
  'Carried over unchanged from the constant it replaces (30 seconds), which was chosen to sit far above a normal chunk round trip and far below a person''s patience.',
  (current_date + 45),
  ARRAY['organization'], 'any'
),
(
  'media.transcription', 'estimate_confirm_min_duration_seconds',
  '600'::jsonb, '600'::jsonb, 'integer', 'seconds',
  0, 86400,
  'Transcription — confirm spend above this length',
  'Audio at least this long stops before transcribing and shows its length, estimated cost and estimated time for the person to confirm. Zero means confirm every transcription.',
  'agent',
  'Set 2026-09-17 under the expensive-click law (common-docs/policies/destructive-and-expensive-actions.md). Ten minutes keeps a voice memo dialog-free while making every long file an explicit, priced decision. Organizations may only LOWER it — demanding more confirmation is always allowed, waiving it is not.',
  (current_date + 45),
  ARRAY['organization'], 'lower_only'
),
(
  'media.transcription', 'estimated_cost_per_audio_hour_usd',
  '0.12'::jsonb, '0.12'::jsonb, 'number', 'usd',
  0, 100,
  'Transcription — quoted cost per audio hour',
  'The rate used to quote an estimate before transcription runs. It is an estimate shown to a person, not a bill: keep it at or above what the routed speech-to-text model actually costs so the quote never comes in under the charge.',
  'agent',
  'Set 2026-09-17 above what we pay on purpose. Groq whisper-large-v3 lists around $0.111 per audio hour and the turbo model far less; the catalog routes stt-default to Groq. Quoting the expensive end of the models we route to means a person is never surprised upward.',
  (current_date + 45),
  ARRAY['organization'], 'any'
),
(
  'media.transcription', 'estimated_seconds_per_audio_hour',
  '72'::jsonb, '72'::jsonb, 'integer', 'seconds',
  1, 3600,
  'Transcription — quoted processing time per audio hour',
  'The rate used to quote how long transcription will take, in wall-clock seconds per hour of audio.',
  'agent',
  'Set 2026-09-17 at 50x real time. The server demuxes, normalizes, splits into roughly 80 MB windows and transcribes them, so wall-clock is dominated by chunk count and transfer rather than by the model. A 9-hour audiobook quotes about 11 minutes.',
  (current_date + 45),
  ARRAY['organization'], 'any'
),
(
  'media.transcription', 'upload_retry_max_attempts',
  '3'::jsonb, '3'::jsonb, 'integer', 'attempts',
  1, 10,
  'Audio upload — retry attempts',
  'How many times an audio upload or chunk request is retried after a retryable failure before it gives up and says so.',
  'agent',
  'Carried over unchanged from the constant it replaces (3). It is an opinion about how hard we fight a flaky network, so it is a row rather than code.',
  (current_date + 45),
  ARRAY['organization'], 'any'
),
(
  'media.transcription', 'upload_retry_base_delay_ms',
  '1000'::jsonb, '1000'::jsonb, 'integer', 'milliseconds',
  100, 60000,
  'Audio upload — first retry delay',
  'The first backoff delay after a retryable audio upload failure. Each further attempt doubles it, up to the retry delay ceiling.',
  'agent',
  'Carried over unchanged from the constant it replaces (1 second).',
  (current_date + 45),
  ARRAY['organization'], 'any'
),
(
  'media.transcription', 'upload_retry_max_delay_ms',
  '8000'::jsonb, '8000'::jsonb, 'integer', 'milliseconds',
  100, 600000,
  'Audio upload — retry delay ceiling',
  'The longest the exponential backoff between audio upload retries may grow to.',
  'agent',
  'Carried over unchanged from the constant it replaces (8 seconds).',
  (current_date + 45),
  ARRAY['organization'], 'any'
)
ON CONFLICT (feature, key) DO UPDATE SET
  default_value      = EXCLUDED.default_value,
  value_type         = EXCLUDED.value_type,
  unit               = EXCLUDED.unit,
  min_value          = EXCLUDED.min_value,
  max_value          = EXCLUDED.max_value,
  label              = EXCLUDED.label,
  description        = EXCLUDED.description,
  basis              = EXCLUDED.basis,
  review_due         = EXCLUDED.review_due,
  -- `overridable_by` / `override_direction` are deliberately ABSENT here.
  -- Overridability is curated, never re-asserted by a re-run of a seed
  -- (common-docs/systems/platform/feature-knobs/FEATURE.md § The invariants):
  -- a later curation migration that locks one of these keys must not be
  -- silently undone by someone re-applying this file.
  updated_at         = now();
