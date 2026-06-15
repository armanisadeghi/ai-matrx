import React from "react";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/transcripts", {
  titlePrefix: "Studio",
  title: "Transcripts",
  description:
    "Live multi-column transcription workspace — raw, cleaned, concepts, and a pluggable module column.",
  letter: "M",
});

export default function TranscriptStudioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
