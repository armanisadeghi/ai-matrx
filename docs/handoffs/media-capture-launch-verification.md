# Handoff: Media Capture — state of the system, honestly

**Owner:** unassigned. **Last touched:** 2026-07-22.
**Read this before touching `features/media-capture/` or claiming the feature is done.**

## The vision (Arman's, verbatim intent)

One capture system for **photos, video, and audio** that:
1. Works for photos AND video (and the audio it produces).
2. Handles sizing correctly — preview size, stream size, and saved size are three different things and must never be conflated.
3. Works **with** the canonical device system — the same camera/mic/speaker selection the audio stack uses, surfaced in settings AND where you capture.
4. Writes straight into the canonical cloud file system.
5. Is fully managed — list, rename, move, share, delete, recover, transcribe.
6. Has its own home (like the transcription system) with real core utilities, hooks, components, and server APIs.
7. **Bar to hit: `ProTextarea`.** Its voice affordance is one pill that is simultaneously the record button, the level meter, and the device picker; transcription streams into the destination *while you speak*; you cannot navigate away and silently lose work; every error has a "Get Help" path. Video is not audio — but the integration standard is the same.

## What is live now (released, prod)

Frontend `d14185406` (v0.4.5) · aidream `0.1.580` · matrx-files `0.2.1` on PyPI.

- **`/camera`** — Capture Studio: Photo / Video / Audio modes, device rail (camera + mic + speaker) reading and writing the canonical `userPreferences.mediaDevices` store via `useAudioDevices()`, recording HUD (monotonic pause-aware timer, live level meter off the real composed stream, duration + size gauges sharing the exact numbers the hard-stop enforces), review with playback through the selected speaker, save → `files.files` under `Captures/`, then one-click **Transcribe** via `POST /audio/transcribe-file`.
- **Capture library** on the same page — filters, per-item actions through the canonical files hooks (open/download/rename/move/share/delete), upload-state chips, failed-upload retry, recovery of interrupted recordings.
- **Media window** (avatar menu → Media) — Playback / Recording / **Camera** / Devices.
- **`/camera/admin`** — admin-gated feature map + read-only diagnostics (never acquires a camera).
- **Live-capture chip + navigation guard** — a recording survives an attempted in-app navigation via a confirm dialog that stops **and saves**; `beforeunload` covers tab close.
- **Server:** bounded-memory large-media processing (24 GB MP4 probes at +85 MB RSS), TUS browser wire (CORS, creation-with-upload, completed-session recovery, metadata parity), `audio_extracted` derivative, transcription-by-file-id with server-side chunking.
- **PDF scanner** (`/tools/scanner`) migrated onto this runtime; legacy `components/matrx/camera/` deleted.

## What is NOT done — do not claim otherwise

**Nobody has ever watched this record a real video.** Every screenshot taken during development was the permission-denied state, because the agent browser blocks camera and mic hardware. Unproven end to end: live preview, the HUD with a real ticking timer, the level meter moving, the save→upload round trip, transcription returning real text, camera switching between physical cameras, speaker routing actually changing output.

**Gaps vs the ProTextarea bar (item 7 above):**
1. The device rail is three capsules above the controls — not one integrated pill. Discoverable, not compact.
2. Transcription is a manual button *after* save. Audio streams results into the destination during capture. Four steps where audio has zero.
3. **A video recording cannot outlive the route.** The camera lease is owned by `CaptureStudio`, and the camera stops when the last lease releases. The guard saves your file instead of losing it, but true background recording requires moving lease ownership out of the component — a real architectural change, deliberately not attempted.
4. Browser back/forward bypasses the confirm dialog and falls through to the save-salvage.
5. No save-to-destination parity: captures land in `Captures/`; the only onward path is the transcript's `ContentActionBar`.

**Other open items:**
- `/tools/scanner` internals were rewritten (legacy camera engine deleted). Contract preserved in code — rear camera, 4096 over-ask, full-frame WYSIWYG, q0.92, native `takePhoto` disabled — but **never verified on a real phone**. This is a tool Arman relies on; a real-device scan is the first thing to check.
- Library tiles show no duration/size/date; `AudioControlWindow` history rows and `RecordingCard` are far richer.
- Five modules still carry inline copies of the level-meter analyser (D81); the canonical `useStreamAudioLevel` hook exists and is consumed only by media-capture.
- Standalone matrx-files service (`files.matrxserver.com`) rollout to 0.2.1 unconfirmed.

## Process notes for whoever picks this up

- Two adversarial review passes ran before release and found real defects: a permanent blank-screen dead-end (Photo→Video while denied), no retry/Get-Help path from errors, silent recording loss on navigation, mobile stage collapsing below its own chrome, hover-only actions unreachable on touch. All fixed. **Run adversarial review before handing this to Arman again — the first delivery was hollow and he rejected it.**
- A parallel session's `git pull --rebase` swept in-flight agent work into its commits twice during this build, once capturing a debug block that would have rendered a fake recording chip on every route and blocked every link app-wide. It was caught and removed (verified: zero `FORCED` occurrences in HEAD). **When multiple sessions run in this repo, verify HEAD contains what you think it does.**
- Claims in this repo's docs are not evidence. A documented build-profile behavior was quoted as verified fact and was wrong — `/demos/*` is served in production (HTTP 200). Test the URL.

## Test routes

`/camera` · `/camera/admin` · avatar menu → Media · Settings → "Camera, microphone & speakers" · `/tools/scanner` (phone) · `/demos/media-capture`
