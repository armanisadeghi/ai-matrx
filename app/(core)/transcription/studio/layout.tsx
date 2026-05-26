import React from "react";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/transcription/studio", {
  title: "Transcript Studio",
  description:
    "Live multi-column transcription workspace — raw, cleaned, concepts, and a pluggable module column.",
});

export default function TranscriptStudioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
