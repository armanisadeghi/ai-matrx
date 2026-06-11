import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/agents/new", {
  titlePrefix: "Tabs Builder",
  title: "New Agent",
  description: "Comprehensive tabbed agent builder.",
  letter: "Nt",
});

export default function NewAgentTabsBuilderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
