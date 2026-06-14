# Transcript recordings → system namespace (backend change, FE follow-up)

**From:** aidream (backend) · **Date:** 2026-06-14
**Status:** ✅ **CLOSED (2026-06-14).** Backend shipped + data backfilled in prod (`Matrx Main`); FE follow-up A/B/C done; product decision confirmed (**fully hidden**). No further action required by either side. See the **FE response** at the bottom for the one intentional deviation + one FYI.

---

## TL;DR

1. **Voice recordings are now stored under the hidden system namespace** —
   `system-files/transcripts/Recordings/<file>.webm` instead of the user
   folder `Transcripts/Recordings/...`.
2. **New uploads route there automatically** — the backend relocates any
   upload whose `metadata.origin === "transcripts"` (which the FE already
   sends). **No FE deploy is required for this to take effect.**
3. **All 321 existing recordings were moved** in prod (pure DB move — S3 keys
   are canonical `<owner>/<file_id>`, so playback URLs are unchanged), and the
   now-empty `Transcripts/` user folders were removed.
4. **Recordings were also being mis-typed as `video/webm`** (browser
   `MediaRecorder` quirk). Backend now detects audio-only containers from the
   bytes and corrects the MIME; 85 historical `video/webm` rows were
   backfilled to `audio/webm`.

Because recordings now live under `system-files/`, your existing
`isSystemPath()` guard **already hides them from the tree, folder views, and
recents** — no new filtering needed. The FE work is constant alignment, a
small correctness fix, and confirming one product decision.

---

## Why

Recordings are app-captured content the user manages through the **Transcripts
UI** (looked up by `cld_files.id`), never the file browser. Storing them in the
user namespace (`Transcripts/Recordings`) made them pollute the workspace —
your `isSystemManagedContentPath`/`isExcludedFromRecents` already patched the
*Recents* symptom on the FE, but the files still sat in the user tree, and the
exclusion logic was a duplicated path list maintained in two repos.

The platform already has one canonical provenance rule, server-side:
`cld_is_system_path(path)` → anything under `generations/` or `system-files/`
is system-owned and excluded from `cld_get_user_file_tree`. Moving recordings
under that root makes the backend the **single source of truth** for hiding
them — no FE path list required.

---

## What changed on the backend

### 1. New registered system folder
`matrx_utils.file_handling.system_paths`:
```python
TRANSCRIPT_RECORDINGS = register_system_folder(
    "transcript_recordings",
    root="system-files/transcripts",
    description="Audio/screen recordings captured by the Transcripts feature…",
)
```

### 2. Origin → system-folder routing at the upload boundary
`POST /files/upload` now relocates app-captured content based on
`metadata.origin`. The mapping (`aidream/api/utils/system_origins.py`):
```python
SYSTEM_ORIGIN_FOLDERS = { "transcripts": "transcript_recordings" }
```
An upload with `metadata.origin = "transcripts"` and `folderPath =
"Transcripts/Recordings"` is rewritten to
`system-files/transcripts/Recordings/<filename>` (first segment dropped, tail
preserved). Unrecognised / absent origin → path is left untouched (normal user
upload). This is server-enforced, so the placement can't drift per client.

> **Contract:** `metadata.origin: "transcripts"` is now the **required signal**
> for a recording to be classified + hidden correctly. You already send it —
> just keep sending it on every recording upload.

### 3. Evidence-based audio/video MIME detection
`matrx_utils.file_handling.media_sniff` now probes container bytes (WebM EBML
codec IDs, MP4 `hdlr`, Ogg) to decide audio-vs-video instead of trusting the
browser's `Content-Type`. An audio-only WebM that the browser labels
`video/webm` is now stored as `audio/webm`. This is **defense-in-depth** —
your `normalizeAudioContentType()` in `audioStorageService.ts` is still the
first line and should stay.

### 4. Data backfill (prod, done)
- 85 `video/webm` transcript rows → `audio/webm` (verified audio-only first).
- All 321 `Transcripts/Recordings/*.webm` → `system-files/transcripts/Recordings/*`.
- 8 now-empty `Transcripts` / `Transcripts/Recordings` folder rows soft-deleted.

Result: `0` recordings remain in the user namespace; all `321` are `audio/webm`
under the hidden system root.

---

## What the FE should do

### A. Align `features/files/utils/folder-conventions.ts`
The `TRANSCRIPT_RECORDINGS` constant is now stale — recordings no longer live
at `"Transcripts/Recordings"`; they live under `system-files/transcripts/...`.

- **Recommended:** repoint the constant to the new root and let `isSystemPath`
  handle hiding (it already covers `system-files/`):
  ```ts
  // was: TRANSCRIPT_RECORDINGS: "Transcripts/Recordings"
  TRANSCRIPT_RECORDINGS: "system-files/transcripts/Recordings",
  ```
- You can then **drop the transcript entry from `isSystemManagedContentPath`**
  (its only remaining member would be `tool-images`). Recordings are now fully
  covered by `isSystemPath` → `isExcludedFromRecents` still returns `true` for
  them transitively. Keep `tool-images` as-is.
- If you keep a stale `"Transcripts/Recordings"` literal anywhere, it's
  harmless (no files there anymore) but misleading — clean it up.

### B. Fix the returned `filePath` in `audioStorageService.ts`
`saveAudioToStorage()` currently **hand-constructs** the return path:
```ts
filePath: `Transcripts/Recordings/${filename}`,   // ← now wrong
```
The backend relocates the file, so the real path is
`system-files/transcripts/Recordings/<filename>`. Either:
- Use the path from the upload response (`normalized.filePath` if exposed by
  `fileHandler.upload`), **or**
- Drop `filePath` from `UploadResult` entirely — nothing downstream needs it
  (transcripts persist `fileId` into `transcripts.audio_file_path`, and
  playback/delete/download all go by `fileId`).

Keep sending the upload exactly as today otherwise:
```ts
fileHandler.upload(
  { kind: "file", file },
  {
    folderPath: "Transcripts/Recordings",     // fine — backend remaps it
    visibility: "private",
    metadata: { origin: "transcripts", recorded_by: userId },  // ← REQUIRED
  },
);
```
> `metadata.origin: "transcripts"` is what triggers server-side relocation.
> If it's ever dropped, the file lands in the user namespace and reappears in
> the tree. Treat it as a required field for recording uploads.

### C. Verify nothing browses the recordings folder via the file tree
Recordings are no longer reachable through `loadFolderContents("Transcripts/...")`
or the user file tree — they're fully hidden. The Transcripts UI accesses them
by `cld_files.id` (`getAudioUrl`/`downloadAudioBlob` via `fileId`), which is
unaffected. Please confirm no surface relied on listing the
`Transcripts/Recordings` folder directly.

---

## Product decision to confirm

Your current design (per `folder-conventions.ts`) deliberately kept recordings
**browsable in the Files tree but out of Recents** (`isSystemManagedContentPath`).
This backend change makes them **fully hidden** (out of the tree *and* recents),
because that's the system-namespace contract and what was approved.

- **If "fully hidden" is what you want** (recordings managed only via the
  Transcripts UI) → do A/B/C above, done.
- **If you want them to stay browsable** in the Files UI → tell us; we'd revert
  the relocation and instead rely solely on your existing
  `isExcludedFromRecents` (which already keeps `Transcripts/Recordings` out of
  Recents). In that case the MIME fix still stands; only the folder move would
  be undone.

Default assumption: **fully hidden** (no further backend action needed).

---

## Reference — backend touch points
- `packages/matrx-utils/matrx_utils/file_handling/system_paths.py` — `TRANSCRIPT_RECORDINGS`
- `packages/matrx-utils/matrx_utils/file_handling/media_sniff.py` — `detect_av_track_kind`, reworked `sniff_mime_type`
- `aidream/api/utils/system_origins.py` — origin→folder routing
- `aidream/api/routers/files/__init__.py` — `/files/upload` relocation hook
- `scripts/backfill_audio_video_mime.py` — MIME backfill (dry-run by default)
- `scripts/relocate_transcript_recordings.py` — folder relocation (dry-run by default)

Questions → ping the backend team.

---

## FE response (2026-06-14) — done, closing out

Thanks — the relocation + evidence-based MIME detection is exactly the right
split. Confirming the **fully hidden** product decision (recordings managed only
via the Transcripts UI), and all three FE items are complete:

### A. `folder-conventions.ts` — aligned ✅
- `CloudFolders.TRANSCRIPT_RECORDINGS` now points at
  `"system-files/transcripts/Recordings"`; hiding from tree / folder views /
  Recents is fully delegated to `isSystemPath` (already covers `system-files/`).
- **Intentional deviation from your "drop the transcript entry" suggestion:** we
  *kept* a separate `TRANSCRIPT_RECORDINGS_LEGACY = "Transcripts/Recordings"`
  constant and left it in `isSystemManagedContentPath` purely as a **defensive
  Recents guard**. Rationale below (FYI #1). `tool-images` stays as-is, as you
  noted. This deviation is FE-only and invisible to the backend.

### B. `audioStorageService.ts` `filePath` — fixed ✅
- Dropped `filePath` from `UploadResult` entirely (it's now
  `{ fileId, filename, size }`). Nothing downstream needed it — all four callers
  (`CreateTranscriptModal`, `AudioImportDialog`, transcript-studio
  `uploadRecordingAudioThunk`, the chunked-recorder auto-persist) key off
  `fileId` only; `transcripts.audio_file_path` stores `fileId`.
- Still uploading exactly as before: `folderPath: "Transcripts/Recordings"` +
  `metadata: { origin: "transcripts", recorded_by: userId }`. We treat
  `origin: "transcripts"` as a required field — it's sent on every recording
  upload path (single code path through `saveAudioToStorage`).

### C. Nothing browses the recordings folder via the tree — confirmed ✅
- No surface calls `loadFolderContents("Transcripts/...")` or lists that folder.
  The only remaining `"Transcripts/Recordings"` string literals are (1) the
  upload `folderPath` hint you remap server-side and (2) the defensive Recents
  guard. Playback/download/delete all go by `fileId`
  (`getAudioUrl` / `downloadAudioBlob` / `deleteAudioFromStorage`).

### Defense-in-depth on MIME — kept ✅
`features/audio/utils/audio-mime.ts` (`normalizeAudioContentType` / `toAudioFile`)
is the FE first line and stays. We now normalize at **every** outbound audio
boundary, not just storage: the transcription routes
(`useAudioTranscription`, per-chunk `useChunkedRecordAndTranscribe`) and the
URL-fallback staged upload (`audioFallbackUpload`) all send a clean `audio/*`
type + matching extension. So a recording is claimed as audio at upload time;
your byte-level `detect_av_track_kind` is the backstop. Good to have both.

### FYIs for the backend (non-blocking — no action expected)

1. **Why we kept the legacy Recents guard.** Before your relocation hook, a
   straggler upload carrying the *correct* `origin: "transcripts"` metadata was
   observed landing in the user namespace (`Transcripts/Recordings`) in prod.
   With your server-enforced routing this should no longer happen, but since a
   miss would make a recording reappear in the tree, we keep the cheap legacy
   path filter as a loud-recovery net. If you can confirm the
   `/files/upload` relocation hook is now unconditional for
   `origin === "transcripts"` (no early-return paths that skip it), we'll drop
   the legacy guard on the next touch of that file.
2. No other client writes `origin: "transcripts"`, so the single mapping in
   `SYSTEM_ORIGIN_FOLDERS` is sufficient for us today.

Nothing outstanding on our side — closing this out.
