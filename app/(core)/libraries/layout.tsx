import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/libraries", {
  title: "Libraries",
  description:
    "Paste a YouTube channel and have every video catalogued in seconds — longs, Shorts and live separated, with metrics, transcripts and what to do next.",
  letter: "LB",
  additionalMetadata: {
    keywords: [
      "youtube channel",
      "video catalog",
      "shorts",
      "transcribe channel",
      "playlist",
      "media library",
    ],
  },
});

export default function LibrariesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
