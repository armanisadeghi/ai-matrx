import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/research", {
  titlePrefix: "New Topic",
  title: "Research",
  description: "Create a new research topic.",
  letter: "Rn",
});

export default function NewResearchTopicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
