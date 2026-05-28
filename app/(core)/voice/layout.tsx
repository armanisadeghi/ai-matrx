import React from "react";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/voice", {
  titlePrefix: "Voice Manager",
  title: "Voice",
  description: "Browse and preview voices for TTS and in-app playback",
  letter: "Vm",
});

export default function VoiceManagerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
