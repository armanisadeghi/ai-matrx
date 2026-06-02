// app/(a)/chat/voice/page.tsx
//
// AI Matrx Introduction Agent — locked. No settings UI. This is the surface
// business users land on; the experience itself is the proof of what AI Matrx
// can do.
//
// Server Component shell — hands off to the client immediately for the
// realtime voice experience. The intro agent is a normal `agx_agent` row
// (`VOICE_INTRO_AGENT_ID`), so editing its instructions / voice / tools is
// a builder-level operation — no code change needed.

import { VoiceAgentSurface } from "@/features/voice-agent/components/VoiceAgentSurface";
import { VOICE_INTRO_AGENT_ID } from "@/features/voice-agent/constants";

export default function VoiceIntroPage() {
  return <VoiceAgentSurface preset="intro" agentId={VOICE_INTRO_AGENT_ID} />;
}
