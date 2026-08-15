import type { SurfaceManifest, SurfaceScopePayload } from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const VOICE_CHAT_SURFACE = "matrx-user/voice-chat";

export const voiceChatManifest: SurfaceManifest = {
  surfaceName: VOICE_CHAT_SURFACE,
  label: "Hands-free Voice Chat",
  urlPattern: "/voice/playground",
  readiness: "partial",
  readinessNote: "Runtime emitter and route mapping are wired; live microphone, mobile Safari, manifest sync, and agent review remain to be verified.",
  intro: `<surface_intro>
You are on Hands-free Voice Chat. The user speaks without holding a button, the assistant answers aloud, and speaking over the reply interrupts it. Treat transcript text as speech recognition: interpret disfluencies and homophones generously. Phase tells you whether the page is listening, hearing, thinking, speaking, sleeping, paused, or in error. Transcript turns are a record of what was said and must never be rewritten as though the user typed them.
</surface_intro>`,
  groups: [
    { key: "session", label: "Voice session", sortOrder: 100 },
    { key: "transcript", label: "Transcript", sortOrder: 200 },
  ],
  values: mergeBaselineValues(pickBaseline("content", "context"), [
    { name: "phase", label: "Live phase", description: "Current hands-free loop state.", valueType: "string", alwaysAvailable: true, typicalCharCount: 10, sortOrder: 100, group: "session" },
    { name: "microphone_listening", label: "Microphone listening", description: "Whether browser VAD is actively listening.", valueType: "boolean", alwaysAvailable: true, typicalCharCount: 5, sortOrder: 110, group: "session" },
    { name: "turn_count", label: "Turn count", description: "Completed user and assistant turn pairs in this session.", valueType: "number", alwaysAvailable: true, typicalCharCount: 4, sortOrder: 200, group: "transcript" },
    { name: "transcript_turns", label: "Transcript turns", description: "Completed speech-recognition and assistant reply pairs.", valueType: "array", alwaysAvailable: true, typicalCharCount: 4000, sortOrder: 210, group: "transcript" },
    { name: "last_user_utterance", label: "Last user utterance", description: "Most recent recognized user speech.", valueType: "string", alwaysAvailable: false, typicalCharCount: 300, sortOrder: 220, group: "transcript" },
    { name: "last_assistant_utterance", label: "Last assistant utterance", description: "Most recent assistant reply spoken aloud.", valueType: "string", alwaysAvailable: false, typicalCharCount: 600, sortOrder: 230, group: "transcript" },
  ]),
};

export function createVoiceChatScope(values: {
  phase: string;
  microphone_listening: boolean;
  turn_count: number;
  transcript_turns: Array<{ user: string; assistant: string }>;
  content?: string;
  context?: Record<string, unknown>;
  last_user_utterance?: string;
  last_assistant_utterance?: string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
