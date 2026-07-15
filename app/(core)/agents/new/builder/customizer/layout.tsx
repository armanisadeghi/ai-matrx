import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/agents/new", {
  titlePrefix: "Customizer",
  title: "New Agent",
  description: "AI experience customizer for new agents.",
  letter: "AG",
});

export default function NewAgentCustomizerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
