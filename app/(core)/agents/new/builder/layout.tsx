import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/agents/new", {
  titlePrefix: "Builder",
  title: "New Agent",
  description: "Interactive agent builder.",
  letter: "Nb",
});

export default function NewAgentBuilderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
