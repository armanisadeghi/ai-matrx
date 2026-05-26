import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/agents", {
  title: "Agents",
  description: "Build, configure, and deploy AI agents",
  additionalMetadata: {
    keywords: [
      "AI agents",
      "agent builder",
      "autonomous AI",
      "AI automation",
      "agent deployment",
    ],
  },
});

export default function AgentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <span className="shell-hide-dock" aria-hidden="true" />
      {children}
    </>
  );
}
