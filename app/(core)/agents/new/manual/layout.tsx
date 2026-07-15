import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/agents/new", {
  titlePrefix: "Manual",
  title: "New Agent",
  description: "Create a new agent manually.",
  letter: "AG",
});

export default function NewAgentManualLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
