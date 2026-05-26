// app/(a)/chat/voice/playground/page.tsx
//
// Voice Playground — same realtime voice primitive as the intro route, with
// a right-side <Sheet> exposing voice picker, tool toggles, and instructions
// editor. Useful for prompt iteration and provider QA.

import { VoiceAgentSurface } from "@/features/voice-agent/components/VoiceAgentSurface";

export default function VoicePlaygroundPage() {
  return <VoiceAgentSurface preset="playground" />;
}
