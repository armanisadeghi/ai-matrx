import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/transcripts", {
  titlePrefix: "Admin",
  title: "Transcripts",
  description:
    "Feature admin map for the transcripts ecosystem — routes, panels, components, and demos.",
  letter: "Ta",
});

export default function TranscriptsAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
