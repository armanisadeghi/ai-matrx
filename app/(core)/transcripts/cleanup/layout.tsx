import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/transcripts", {
  titlePrefix: "Cleanup",
  title: "Transcripts",
  description:
    "High-volume transcription cleanup — raw capture, AI cleanup runs, and custom output.",
  letter: "M",
});

export default function TranscriptsCleanupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
