import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/reports", {
  titlePrefix: "Agent Drift",
  title: "Reports",
  description: "Monitor agent behavior drift across runs.",
  letter: "Rd",
});

export default function AgentDriftReportLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
