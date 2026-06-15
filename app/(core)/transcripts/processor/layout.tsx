import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/transcripts", {
  titlePrefix: "Processor",
  title: "Transcripts",
  description: "Record, transcribe, view, and edit individual transcripts.",
  letter: "M",
});

export default function TranscriptsProcessorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
