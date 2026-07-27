"use client";

// providers/AudioOutputHostImpl.tsx
//
// The heavy half of the app-root audio-OUTPUT singleton. Mounting this hook is
// the whole job: `useAutoVoiceResponse` owns a `useCartesiaStreamingSpeaker`
// (its WebSocket + SinkAwarePlayer + the @cartesia/cartesia-js SDK), and because this
// lives at app-root it NEVER unmounts on a tab switch or route change — so a
// read-aloud that is mid-stream keeps playing while the user navigates.
//
// Output-only: it speaks agent responses. It requests NO microphone permission
// (mic capture is the recording side — GlobalRecordingEngine). The Cartesia
// streaming speaker only plays audio out; it never opens an input stream.
//
// Mounted STATICALLY inside providers/AudioSystemHostImpl.tsx — the lazy audio
// system. The Cartesia SDK therefore loads only after first audio engagement,
// never in any page's chunk. Driven entirely by `voicePlaybackBus` (surfaces
// publish `requestVoicePlayback(...)`, which itself fires the activation
// latch); a request published before this mounts is picked up on mount via
// useSyncExternalStore's snapshot read. Renders no UI of its own.

// eslint-disable-next-line no-restricted-syntax -- THE one legal importer: this host mounts the speaker owner, and lives only inside the lazy AudioSystemHostImpl.
import { useAutoVoiceResponse } from "@/features/transcript-studio/hooks/useAutoVoiceResponse";

export default function AudioOutputHostImpl() {
  // The hook self-drives off voicePlaybackBus + Redux; nothing to wire here.
  useAutoVoiceResponse();
  return null;
}
