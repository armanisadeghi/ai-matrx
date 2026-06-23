"use client";

// providers/AudioOutputHost.tsx
//
// App-root audio-OUTPUT singleton — the read-aloud / TTS streaming-speaker
// lifecycle, hoisted to the top of the tree so it NEVER unmounts on navigation.
// Sibling of GlobalRecordingProvider (mic capture / audio IN) and AudioModalHost
// in app/Providers.tsx.
//
// WHY THIS EXISTS
// ---------------
// Read-aloud used to be owned INSIDE ExperimentalAgentScreen (the War Room
// Agent+ tab), which the tile remounts on every tab switch (`key={sessionId}`).
// So switching tabs (or navigating away) unmounted the speaker and KILLED any
// in-flight TTS playback. Hoisting the speaker here fixes that for every surface
// at once: the requesting surface can come and go; the audio keeps playing.
//
// HOW IT WORKS (same shape as AudioModalHost: thin client host + dynamic impl)
//   • The heavy speaker (Cartesia SDK + WebSocket + WebPlayer) lives in
//     AudioOutputHostImpl, loaded via `next/dynamic({ ssr: false })` so the SDK
//     stays off the server render and out of every page's static graph.
//   • Surfaces don't import the speaker. They publish a request to the bus:
//       import { requestVoicePlayback, stopVoicePlayback }
//         from "@/features/transcript-studio/state/voicePlaybackBus";
//       requestVoicePlayback({ conversationId, enabled: autoVoice });
//     and read playback state back via voicePlaybackBus (VoicePlaybackButton).
//   • Output-only — never requests microphone permission.
//
// It's always rendered (an app-shell singleton). That's the right call here: the
// `ssr: false` boundary is the benefit we want (keep the browser-only Cartesia
// SDK off the server); the actual speaker connection is lazy inside the hook and
// only opens when a surface requests read-aloud.

import dynamic from "next/dynamic";

const AudioOutputHostImpl = dynamic(() => import("./AudioOutputHostImpl"), {
  ssr: false,
});

export function AudioOutputHost() {
  return <AudioOutputHostImpl />;
}
