import React from "react";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/voice", {
  title: "Voice",
  description:
    "Browse, preview, and tune production TTS voices for chat, assistants, transcripts, and podcasts.",
  letter: "Vc",
  additionalMetadata: {
    keywords: [
      "text to speech",
      "TTS",
      "voice synthesis",
      "Cartesia",
      "voice playground",
      "AI voice",
    ],
  },
});

export default function VoiceManagerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
