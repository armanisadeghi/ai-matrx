import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/agents/new", {
  titlePrefix: "Generate",
  title: "New Agent",
  description: "Generate a new agent with AI.",
  letter: "G",
});

export default function NewAgentGenerateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
