import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/research", {
  // One name: the header says "Research topics", so the tab does too.
  title: "Research topics",
  description: "Browse and manage your research topics.",
  letter: "TP",
});

export default function ResearchTopicsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
