---
status: active
updated: 2026-07-27
repos: [matrx-frontend]
vision: [features/audio/FEATURE.md]
---

# Audio/Video Central Controller — lazy audio system, mic reliability, video unification

## Vision — Arman's words

The founding directive (2026-07-26, verbatim):

> "We must combine all of those things into a single provider that has all of that in one. Duplicates will be removed, but options will be preserved (eg. different transcription providers)."
> "You will use a simple pattern that ensures the actual provider is paper thin and never does anything until the first engagement by the user, but once engaged, you hold nothing back and we just push it all out there."
> "Any components, utilities, packages, and anything else must be CONDITIONALLY imported using next.Dynamic ssr=false."
> "Look at the OverlayController component and notice that this MASSIVE component adds nearly ZERO overhead to the app. The chunk is created one time and then reused across 1,000 different routes."
> "You CANNOT disrupt the functionality of the system."

Refinements he added during the work:

> "We will have a SINGLE CANONICAL system for recording and playing audio, transcription, TTS, STT, etc. ONE system, multiple apis for groq, google, etc but all in one single service."
> "If [a thing] has one consumer, then it means it's either the latest incredible Gem that everyone needs or it's leftover trash that didn't get taken out. Either way, it's either part of the system or it's trashed!"
> "We use Redux for our state management so providers are an absolute last resort and I hate them. If anything could just be in redux, then that's where it should be."
> "We have a really great audio component that sits up in the user avatar menu, and it's supposed to be the universal controller for everything… I would also love to just add video to this — make it where this series of things becomes really our central controller of audio and video."

Reliability requirements he raised (both were real bugs, both fixed): the browser mic indicator must go dark within seconds of stopping a recording (ours stayed lit until refresh), and mobile must not feel worse than other sites about mic permission (per-page-load prompts on iOS are WebKit policy; per-site "Allow" in Safari/Chrome iOS settings is the user-side answer — our job is only to never tear down and re-acquire mid-session, which the warm-mic keepalive handles).

(inferred, consistent with the above) The end state: ONE service surface for all AV — capture, playback, TTS, STT, transcription — provider-pluggable (Groq/Cartesia/Google/…), state in Redux, zero cost until first engagement, and the avatar-menu **Media** panel as the single place a user sees and controls every audio/video activity.

## Resources

**Architecture in 60 seconds.** `app/Providers.tsx` mounts exactly ONE audio thing: `providers/AudioSystemHost.tsx` — renders `null` until an engagement signal, then dynamic-imports `providers/AudioSystemHostImpl.tsx` (`ssr:false`), which statically contains everything: device manager (`providers/AudioDeviceProviderImpl.tsx`), recording engine (`providers/GlobalRecordingEngine.tsx`), Cartesia TTS speaker (`providers/AudioOutputHostImpl.tsx`), Redux mirrors (`features/audio/playback/AudioPlaybackHost.tsx`, `features/audio/session/AudioSessionHost.tsx`), audio modal host, crash recovery. Engagement = the framework-free latch `features/audio/activation.ts`, fired inside entry functions (`playbackQueue.enqueuePlayback`, `voicePlaybackBus.requestVoicePlayback`, `showAudioModal`, `captureLock.claimCapture`, `recordingCommands.startRecordingCommand`, `audioSessionRegistry.registerSession`, the `audioControlWindow` opener) — call sites never changed. State survives dormancy because the Redux slices are always registered and the framework-free singletons replay snapshots on subscribe. Full doctrine + change log: `features/audio/FEATURE.md` (read its top section FIRST).

- `useGlobalRecording()` (`providers/GlobalRecordingProvider.tsx`) is **context-free**: state from `recordingsSlice`, verbs from `features/audio/recordingCommands.ts` (cold-start queues latest-wins, warms the mic in the gesture tick, flushes when the engine registers).
- Mic singleton: `features/audio/micStream.ts` — refcounted, 6s keepalive, screams on unbalanced release. `window.__idleSched()` and `micStreamDebug()` are the live diagnostics probes.
- Sessions/panel: `features/audio/session/{audioSessionRegistry.ts,types.ts,useMediaElementPlaybackSession.ts}` → panel `features/window-panels/windows/AudioControlWindow.tsx` (overlay id `audioControlWindow`, avatar menu → Media). `AudioSession.medium: "audio"|"video"`; muted/silent elements register sessions but never claim `playbackLock`.
- Transcripts list state: `features/transcripts/redux/` + `features/transcripts/hooks/useTranscripts.ts` (context deleted).
- Guards: `audioSystemStaticImportBan` in `eslint.config.mjs`; boot-crash marker `features/audio/audioBootMarker.ts`.
- Skills to invoke before touching related code: `code-splitting`, `supabase-realtime`, `overlay-system`, `window-panels`, `tts-audio-system`.
- Test login: `/login` `admin@admin.com` / `Password1234#`. Panel: avatar menu → Media. Review-queue row "Lazy audio system…" at `/administration/users/agent-review` has the manual test scripts.

## Remaining work

1. **Provider-pluggable AV service layer (the "ONE system, multiple APIs" half — largest remaining piece).** Today TTS/STT providers are scattered: Cartesia (`features/tts/hooks/useCartesiaStreamingSpeaker.ts`, `lib/cartesia/*`, `features/audio/playback/adapters/cartesiaAdapter.ts`), Groq (`adapters/groqAdapter.ts`, `features/audio/services/speechApi.ts` for chunk STT), legacy `hooks/tts/*`. The mounting/activation layer they all live behind is done; the unification of their APIs behind one service interface (swap provider per call, one config surface) is NOT started. Design it as adapters under the existing `playbackQueue` PlaybackAdapter pattern + a capture-side twin; do not create a parallel path.
2. **Media panel video lane — needs Arman's decision first (see Decisions).** Once decided: `AudioControlWindow.tsx` `AudioTab` type + mobile stack; a speed control that drives `HTMLMediaElement.playbackRate` for video sessions (current `SpeedControl` is TTS-only).
3. **Camera-capture single-homing.** Media-capture video recordings appear in BOTH the Recording tab (generic registry rows) and the Camera tab (parallel projection via `features/media-capture/runtime/mediaCaptureDiagnostics.ts:285` + a separate upload-feed history). Pick one authoritative home (Decisions), then delete the duplicate projection.
4. **Remaining unwired video players:** `features/research/components/media/MediaGallery.tsx:979`, `features/research/components/outputs/OutputsStudio.tsx:749,766`, and (decision needed — public shell mounts no audio system) `app/(public)/s/[token]/SharedResourceView.tsx:173`. Wire with `useMediaElementPlaybackSession` exactly as done in `features/files/components/core/FilePreview/previewers/VideoPreview.tsx` (the cleanest reference).
5. ~~**LiveCaptureButton migration**~~ — DONE (verified 2026-08-06): `features/education/notes/LiveCaptureButton.tsx` now uses the canonical `useVoiceCapture`/`useGlobalRecording` path (migration comment in-file).
6. **Direct `getUserMedia({audio})` stragglers** (bypass the mic singleton; each briefly double-lights the mic): `features/audio/utils/microphone-diagnostics.ts:129`, `features/audio/components/VoiceDiagnosticsDisplay.tsx:57`, `hooks/useMicrophonePermission.ts:70`. Fold into `acquireMicStream`/`releaseMicStream`.
7. **Real-device verification** (needs a human + iPhone): first-recording permission prompt timing on Safari/iOS cold cache (the gesture-tick mic warming should mask the Impl chunk load), and mic-light-off-within-~6s on mobile browsers.
8. **Build-time regression investigation (adjacent, not audio):** compile jumped 15.1→18.7min at v0.4.116 and persists (~19.5min). Only structural candidate in that diff is the `features/window-panels/WindowPersistenceManager.tsx` → `WindowPersistenceCore.tsx` shell/core split (Arman's work; shape looks correct — sole importer, dynamic boundary). Settle it with one branch preview build reverting the split; compile time prints in the Vercel build log ("Compiled successfully in X").
9. **Cosmetic:** cold-open of the Media panel can flash "No audio playing" for a frame while the Impl chunk and the panel chunk race; add a brief pending state if it bothers anyone.

## Done

- 9 always-mounted audio providers → one activation-gated `AudioSystemHost` — see `providers/AudioSystemHost*.tsx`, `app/Providers.tsx`.
- `GlobalRecordingProvider`/`TranscriptsContext` contexts deleted; Redux + command-proxy replacements — see `features/audio/recordingCommands.ts`, `features/transcripts/redux/`.
- Idle-scheduler bugs that left OverlayController/all singletons permanently unmounted fixed — see `utils/idle-scheduler/idle-scheduler.ts`.
- Mic-hold leak class killed (10-site audit; re-entrancy, release-while-acquiring, double-release, unmount races) — see the 2026-07-26 entries in `features/audio/FEATURE.md`.
- Video sessions + silent-video lock exemption wired into InlineMediaRef / FilePreview / video blocks; Film icon in panel — see `features/audio/session/useMediaElementPlaybackSession.ts`.
- Crash recovery without gesture (localStorage boot marker) — see `features/audio/audioBootMarker.ts`.
- ESLint ban on re-importing the heavy audio entry modules statically — `audioSystemStaticImportBan` in `eslint.config.mjs`.
- Basic manual tests passed by Arman 2026-07-27 (panel, recording, mic light, video rows).

## Decisions needed (Arman)

- **Video presentation in the Media panel.** Situation: video sessions currently appear inside the Playback tab's audio-styled lists, marked with a Film icon; the panel has tabs Playback / Recording / Camera / Devices. Decide: add a dedicated Video tab (or lane) vs. keep video mixed into Playback with richer chrome (thumbnail/poster rows).
- **Camera capture's single home.** Situation: a camera recording shows up twice — as a generic row in the Recording tab and in the Camera tab's own live/history view. Decide: Recording tab lanes by medium and Camera tab becomes diagnostics-only, OR Camera tab is authoritative and `source === "media-capture"` rows are excluded from Recording.
- **Public share viewer.** Situation: `app/(public)/s/[token]` plays videos anonymously; the public shell deliberately mounts no audio system, so those plays are invisible to the panel/lock (which may be fine — there's no panel for anonymous users). Decide: leave public players outside the system, or mount a minimal lock-only layer there.
