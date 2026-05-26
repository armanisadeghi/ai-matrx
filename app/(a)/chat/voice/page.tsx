// app/(a)/chat/voice/page.tsx
//
// AI Matrx Introduction Agent — locked. No settings UI. This is the surface
// business users land on; the experience itself is the proof of what AI Matrx
// can do.
//
// Server Component shell — hands off to the client immediately for the
// realtime voice experience.

import { VoiceAgentSurface } from "@/features/voice-agent/components/VoiceAgentSurface";

export default function VoiceIntroPage() {
  return <VoiceAgentSurface preset="intro" />;
}
