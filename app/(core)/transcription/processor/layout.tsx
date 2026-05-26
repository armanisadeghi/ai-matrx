import React from "react";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/transcription/processor", {
  title: "Transcripts",
  description: "Record, transcribe and manage your audio conversations",
});

export default function TranscriptsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
