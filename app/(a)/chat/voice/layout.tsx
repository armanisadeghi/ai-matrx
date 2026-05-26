import { createRouteMetadata } from "@/utils/route-metadata";

// Inherits the parent chat layout's `shell-hide-dock` marker — voice surfaces
// hide the bottom dock so the visualizer can fill the viewport.
//
// The sub-layout itself adds no chrome; it only exists to:
//   1. Override route metadata for `/chat/voice*` (favicon letter, title).
//   2. Provide a single anchor where future voice-route-wide providers can
//      mount (e.g., a global background, a voice-feature feature flag wrapper).

export const metadata = createRouteMetadata("/chat", {
  titlePrefix: "Voice",
  title: "Chat",
  description:
    "Speak with AI Matrx — a realtime voice agent that listens, understands, and shows you what AI can do for your business.",
  letter: "VC",
});

export default function VoiceChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
