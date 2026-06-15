import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/agents/new", {
  titlePrefix: "Instant",
  title: "New Agent",
  description: "Instant chat assistant builder.",
  letter: "G",
});

export default function NewAgentInstantBuilderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
