import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/transcripts", {
  title: "Transcripts",
  description:
    "All your transcripts — browse, record, upload, and open in the workspace you want.",
  letter: "T",
  additionalMetadata: {
    keywords: [
      "transcription",
      "speech to text",
      "audio transcription",
      "Whisper",
      "transcripts",
    ],
  },
});

export default function TranscriptsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
