---
status: active
updated: 2026-08-15
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

**Architecture in 60 seconds.** `app/Providers.tsx` mounts exactly ONE audio thing: `providers/AudioSystemHost.tsx` — renders `null` until an engagement signal, then dynamic-imports `providers/AudioSystemHostImpl.tsx` (`ssr:false`), which statically contains everything: device manager (`providers/AudioDeviceProviderImpl.tsx`), recording engine (`providers/GlobalRecordingEngine.tsx`), Cartesia TTS speaker (`providers/AudioOutputHostImpl.tsx`), Redux mirrors (`features/audio/playback/AudioPlaybackHost.tsx`, `features/audio/session/AudioSessionHost.tsx`), audio modal host, crash recovery. Engagement = the framework-free latch `features/audio/activation.ts`, fired inside entry functions (`playbackQueue.enqueuePlayback`, `voicePlaybackBus.requestVoicePlayback`, `showAudioModal`, `captureLock.claimCapture`, `recordingCommands.startRecordingCommand`, `audioSessionRegistry.registerSession`, the `audioControlWindow` opener) — call sites never changed. State survives dormancy because the Redux slices are always registered and the framework-free singletons replay snapshots on subscribe. Full doctrine + change log: `features/audio/FEATURE.md` — read its top section (the lazy system) AND § THE AV SERVICE LAYER (one `speak()`/`transcribe()`, engines as data) FIRST.

- `useGlobalRecording()` (`providers/GlobalRecordingProvider.tsx`) is **context-free**: state from `recordingsSlice`, verbs from `features/audio/recordingCommands.ts` (cold-start queues latest-wins, warms the mic in the gesture tick, flushes when the engine registers).
- Mic singleton: `features/audio/micStream.ts` — refcounted, 6s keepalive, screams on unbalanced release. `window.__idleSched()` and `micStreamDebug()` are the live diagnostics probes.
- Sessions/panel: `features/audio/session/{audioSessionRegistry.ts,types.ts,useMediaElementPlaybackSession.ts}` → panel `features/window-panels/windows/AudioControlWindow.tsx` (overlay id `audioControlWindow`, avatar menu → Media). `AudioSession.medium: "audio"|"video"`; muted/silent elements register sessions but never claim `playbackLock`.
- Transcripts list state: `features/transcripts/redux/` + `features/transcripts/hooks/useTranscripts.ts` (context deleted).
- Guards: `audioSystemStaticImportBan` in `eslint.config.mjs`; boot-crash marker `features/audio/audioBootMarker.ts`.
- Skills to invoke before touching related code: `code-splitting`, `supabase-realtime`, `overlay-system`, `window-panels`, `tts-audio-system`.
- Test login: `/login` `admin@admin.com` / `Password1234#`. Panel: avatar menu → Media. Review-queue row "Lazy audio system…" at `/administration/users/agent-review` has the manual test scripts.

## Remaining work

1. **Real-device verification** (needs a human + iPhone): first-recording permission prompt timing on Safari/iOS cold cache (the gesture-tick mic warming should mask the Impl chunk load), and mic-light-off-within-~6s on mobile browsers. Also worth a look on a real device: the new Media-panel speed control while a video plays.
2. **Second listen engine.** `LISTEN_ENGINES` currently declares exactly one entry (`stt-default`) because that is the only alias the server exposes. When a second transcription model lands server-side, adding it is ONE registry entry — and that is the moment to add an engine picker to the transcription surfaces.
3. **Public share viewer** (`app/(public)/s/[token]/SharedResourceView.tsx:173`) — DECIDED: left outside the media system. The public shell deliberately mounts no audio system, and an anonymous visitor has no Media panel to see the session in, so mounting one would add weight for a controller nobody can open. If that changes, wire it with `SessionMediaElement` (`features/audio/session/SessionMediaElement.tsx`).
4. **`AudioPlayerButton` has no consumers.** It is purpose-built and now correct (it speaks through the one service), but nothing mounts it. Unfinished, not dead — either give it a home or let `pnpm check:unwired` keep surfacing it.
5. **Build-time regression investigation (adjacent, not audio):** compile jumped 15.1→18.7min at v0.4.116 and persists (~19.5min). Only structural candidate in that diff is the `features/window-panels/WindowPersistenceManager.tsx` → `WindowPersistenceCore.tsx` shell/core split (shape looks correct — sole importer, dynamic boundary). Settle it with one branch preview build reverting the split; compile time prints in the Vercel build log ("Compiled successfully in X").
6. **Cosmetic:** cold-open of the Media panel can flash "No audio playing" for a frame while the Impl chunk and the panel chunk race; add a brief pending state if it bothers anyone.

## Done

- The lazy audio system: 9 always-mounted providers → one activation-gated `AudioSystemHost`; contexts deleted for Redux + a command proxy; crash recovery without a gesture; ESLint ban on re-importing the heavy entry modules. (Manual tests passed by Arman 2026-07-27.)
- The mic-hold leak class killed (10-site audit) and `micStream.ts` restored as the ONLY audio `getUserMedia` site.
- Every media player in the app joined the system — file previews, inline refs, video blocks, research gallery/outputs — via `useMediaElementPlaybackSession` or the `SessionMediaElement` drop-in.
- **2026-08-15 — the AV service layer** (`features/audio/service/`): one `speak()`, one `transcribe()`, engines declared as data in one registry with a compile-time guard against registry/adapter drift; the second speak path (`useTextToSpeech`) deleted; vendor names removed from the client; five copies of the voice list collapsed to one. Contract: `features/audio/FEATURE.md` § THE AV SERVICE LAYER.
- **2026-08-15 — the three open panel decisions, taken** (modeled on browser/OS media hubs, no dedicated Video tab): video rows carry the element's poster inside the one Playback list; Speed follows whatever is actually playing (live `playbackRate` for media elements, the queue for TTS); a video capture is single-homed in the Camera tab, keyed on MEDIUM so audio-only captures stay voice memos in Recording.
