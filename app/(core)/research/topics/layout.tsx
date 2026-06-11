import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/research", {
  titlePrefix: "Topics",
  title: "Research",
  description: "Browse and manage your research topics.",
  letter: "Rt",
});

export default function ResearchTopicsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
