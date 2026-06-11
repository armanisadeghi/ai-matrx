import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/transcripts", {
  titlePrefix: "New",
  title: "Transcripts",
  description: "Pick how you want to create a new transcript.",
  letter: "Tn",
});

export default function NewTranscriptLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
