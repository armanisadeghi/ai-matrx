-- Relocate FastFire voice-drill side-product files/folders from the user-visible
-- `FastFire/...` namespace to the hidden `system-files/fastfire/...` root
-- (parity with transcript recordings → system-files/transcripts/Recordings).
-- Idempotent: safe to re-run; only touches rows still under `FastFire`.

-- ── Files ────────────────────────────────────────────────────────────────────
UPDATE files.files
SET
  file_path = 'system-files/fastfire/' || substring(file_path FROM length('FastFire/') + 1),
  updated_at = now()
WHERE deleted_at IS NULL
  AND file_path LIKE 'FastFire/%';

-- MediaRecorder often stores `audio/webm;codecs=opus` — normalize for UI + sniffer parity.
UPDATE files.files
SET
  mime_type = 'audio/webm',
  updated_at = now()
WHERE deleted_at IS NULL
  AND lower(split_part(mime_type, ';', 1)) = 'audio/webm'
  AND mime_type <> 'audio/webm';

UPDATE files.files
SET
  metadata = coalesce(metadata, '{}'::jsonb) || '{"origin":"fastfire"}'::jsonb,
  updated_at = now()
WHERE deleted_at IS NULL
  AND file_path LIKE 'system-files/fastfire/%'
  AND coalesce(metadata->>'origin', '') = '';

-- ── Folders ──────────────────────────────────────────────────────────────────
UPDATE files.folders
SET
  folder_path = 'system-files/fastfire/' || substring(folder_path FROM length('FastFire/') + 1),
  updated_at = now()
WHERE deleted_at IS NULL
  AND folder_path LIKE 'FastFire/%';

UPDATE files.folders
SET
  folder_path = 'system-files/fastfire',
  updated_at = now()
WHERE deleted_at IS NULL
  AND folder_path = 'FastFire';
