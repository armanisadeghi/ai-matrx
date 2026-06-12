import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/transcripts", {
  titlePrefix: "Unsorted",
  title: "Scribe",
  description: "Review and triage unsorted Scribe capture segments.",
  letter: "Su",
});

export default function ScribeUnsortedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
