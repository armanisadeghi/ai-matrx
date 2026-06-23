"use client";

// providers/AudioOutputHostImpl.tsx
//
// The heavy half of the app-root audio-OUTPUT singleton. Mounting this hook is
// the whole job: `useAutoVoiceResponse` owns a `useCartesiaStreamingSpeaker`
// (its WebSocket + WebPlayer + the @cartesia/cartesia-js SDK), and because this
// lives at app-root it NEVER unmounts on a tab switch or route change — so a
// read-aloud that is mid-stream keeps playing while the user navigates.
//
// Output-only: it speaks agent responses. It requests NO microphone permission
// (mic capture is the recording side — GlobalRecordingProvider). The Cartesia
// streaming speaker only plays audio out; it never opens an input stream.
//
// This file is `next/dynamic({ ssr: false })`-loaded by AudioOutputHost so the
// Cartesia SDK stays off the server render and out of every page's static
// graph — it enters the client chunk exactly once (benefit: SSR exclusion for a
// browser-only dep + a single app-shell singleton). Driven entirely by
// `voicePlaybackBus` (surfaces publish `requestVoicePlayback(...)`); renders no
// UI of its own.

import { useAutoVoiceResponse } from "@/features/transcript-studio/hooks/useAutoVoiceResponse";

export default function AudioOutputHostImpl() {
  // The hook self-drives off voicePlaybackBus + Redux; nothing to wire here.
  useAutoVoiceResponse();
  return null;
}
