# Handoff: Media Capture — launch verification (post-build, post-release)

**Status:** System BUILT (all plan phases P0–P9, both repos) + adversarially verified + released 2026-07-21. This doc tracks the remaining verification-only work and captures the vision so any agent can finish without this conversation.
**Plan:** [docs/media-capture-plan.md](../media-capture-plan.md) · **Cross-repo contracts:** `/Users/armanisadeghi/code/common-docs/media-capture/FEATURE.md` · **Feature docs:** [features/media-capture/FEATURE.md](../../features/media-capture/FEATURE.md), [features/media-devices/FEATURE.md](../../features/media-devices/FEATURE.md)

## The vision (do not drift from this)

One platform-grade capture system for **photos, video, and audio** that:
1. Works on desktop and mobile browsers (Chrome/Edge/Firefox/Safari desktop; iOS Safari + Android Chrome) with the latest APIs feature-detected, never assumed.
2. Handles sizing correctly forever: preview size, stream intrinsic size, and saved output size are three separate things (`core/geometry.ts` is the law; the old demo's bug class is extinct).
3. Lives WITH the mic and speaker as one device system: one enumerator (`features/media-devices/deviceManager.ts`), one Settings tab ("Camera, microphone & speakers", registry id `devices`), one control window (Media, overlayId `audioControlWindow`), shared `mediaDevices` preference module (id+label pairs, facing mode).
4. Feeds the cloud file system directly: every byte through `fileHandler.upload` into `files.files` under `Captures/Photos|Videos|Audio`, `metadata.capture` v1 union, small files buffered, large files via TUS (80 MB policy), durable `file_id` refs only.
5. Has its own home like transcription: `/camera` (studio + management library), `/camera/admin` (map + live diagnostics), `/demos/media-capture` (harness), with full manage actions (rename/move/share/download/delete/retry/recover) reusing the files feature.
6. All three artifact types are first-class end to end: photo → image file; video (±mic) → ONE video file; audio → audio file; standalone audio from video only as the explicit server `audio_extracted` derivative with lineage; transcription by `file_id` via `POST /audio/transcribe-file`.

## Release state (2026-07-21, all run and verified by the building session)

- **Frontend v0.4.0** — released via `scripts/release.sh --minor` (all 9 release gates passed), Vercel production deployment `cdbcceab8` state READY → **live on aimatrx.com**.
- **aidream 0.1.580** — released via `scripts/release.sh --patch`, Coolify deploy verified, all health endpoints 200 (`/health` `/live` `/ready` `/detailed`).
- **matrx-files 0.2.0 + 0.2.1** — published to PyPI (CI green both times); **0.2.1 is the one that matters**: it fixes a fail-open standalone boot gate (`assert_route_auth_coverage` was blind under FastAPI ≥0.139 — routes were still authed, but the safety net was disabled in 0.2.0). "Build & Deploy to EC2" workflow succeeded on both pushes.
- **aidream `db/generate.py`** — re-run clean (the earlier statement-timeout was transient); no model changes (CHECK constraint only). The regenerate deleted a parallel session's in-flight `models_seo.py`; restored untouched.
- **CI note:** the aidream "Tests" workflow still shows red on main from OTHER sessions' work — `matrx-graph` postgres integration failures and a 24-violation API-type-audit baseline drift in untouched routers (`token_broker`, `rag`, `podcast_generator`, `prompts_execution`). Media-capture files audit clean; the matrx-files independence gate is green as of `fa88ca9e2`+. Those two red checks belong to the sessions that introduced them.

## What is DONE (released)

- Frontend: commits through `e05a2965f`, pushed to main → Vercel (aimatrx.com). All gates green at push: type-check, 143 media/audio/files/prefs tests, check:doctrine, check:page-headers, check:reuse-index. Preference backfill migration applied live (drift report = 0). Legacy `components/matrx/camera/` deleted.
- aidream: commit `3c2c31386` (merged `af8b978c6`), pushed; `scripts/release.sh --patch` run 2026-07-21 (Coolify auto-deploy from main; see release log for the deployed version). 111 server tests green. Migration 020 (`audio_extracted`) applied + verified live. `python db/generate.py` re-run clean (no model changes — CHECK constraint only; the earlier statement-timeout was transient).
- matrx-files package: `scripts/publish-package.sh matrx-files` run 2026-07-21 (PyPI publish via tag CI; standalone files.matrxserver.com self-deploys from PyPI via Ship Manager). Confirm the CI run + Ship Manager pickup (below).
- Adversarial verification: 2 independent reviewers attacked 18 claims; every confirmed defect fixed (voice-note extension map, 512 MiB quota-preflight cap, destructured-gUM ESLint ban, TUS error-response headers, Upload-Complete expose parity, truthful FLAC chunk re-encode, canonical_storage_uri fallbacks).

## PENDING — in order (all verification, no design)

1. **Confirm the deploys landed:** aidream `/api/health/ready` on the new version (release.sh monitors this — check its output); matrx-files PyPI version live + Ship Manager rolled the standalone (matrx-ship admin). If the package CI or Ship pickup failed, that is the first thing to fix.
2. **Live browser TUS E2E (prod):** on aimatrx.com `/camera`, record a video >80 MB (or use `/demos/media-capture` with a long recording); verify: TUS transport used (network tab: `POST /files/upload/tus` + PATCHes), progress, a mid-upload reload → resume prompt → completes without re-upload, file lands in `Captures/Videos` with poster + duration, `metadata.capture` matches a small buffered upload's shape.
3. **Real-device pass (needs human hands / real phone):** iOS Safari + Android Chrome — photo front/rear with preview-only mirror, rotation during preview AND recording, phone-lock during recording → recovery offer on reopen, scanner `/tools/scanner` full-frame WYSIWYG.
4. **Prod feature checks:** `POST /audio/transcribe-file` with a real captured >100 MB video (chunked path); "Extract audio" on a captured video → child row lineage + waveform; one real TUS upload against the STANDALONE surface (files.matrxserver.com) before any traffic cutover.
5. **Cleanup when 1–4 pass:** delete the three aidream handoffs (`media-capture-tus-browser-wire.md`, `media-capture-bounded-processing.md`, `media-capture-transcription-and-derivatives.md`) and this doc; record the measured prod memory ceiling + advertised max size in the common-docs contract.

## Known low-severity opens (tracked, not blockers)

- `?panels=user_preferences` deep link didn't open the settings overlay on the dev server — pre-existing (no hydration code touched); verify on prod and file separately if real.
- Scanner `CropSheet.tsx:179` still uses `toDataURL` for an ephemeral rotated-crop preview (never persisted) — nit.
- aidream: large (≥64 MiB) images/PDFs still full-read in analysis/thumbnails (PDF detectors are legit consumers; images are wasted RAM only); `extract_audio` output (not source) is read fully before managed write; multi-audio-stream videos fail loud (RuntimeError) on codec probe; migration-020 ledger row says `source='matrx-utils'` (applier quirk).
- eslint.config.mjs self-lints with 6 pre-existing storage_uri rule self-matches (config file isn't normally linted).

## Test links (dev server of the moment; swap host for https://aimatrx.com on prod)

- Capture studio + library: `/camera` — take a photo, save, see it in the library grid; switch to video mode, record with mic, save.
- Admin map + live diagnostics: `/camera/admin` — leases/lock/transport/journals all idle when nothing is capturing; never prompts for camera.
- Media control window: avatar menu → **Media** → Playback / Recording / Camera / Devices tabs.
- Settings: avatar menu → Settings → **Camera, microphone & speakers** (device picks persist; camera "Test" preview is opt-in).
- Scanner on the new runtime: `/tools/scanner` (desktop + phone).
- Harness: `/demos/media-capture` (profiles, mount/unmount leak check, diagnostics readout).
