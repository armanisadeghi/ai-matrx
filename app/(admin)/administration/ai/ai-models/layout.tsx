import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/administration", {
  titlePrefix: "AI Models",
  title: "Admin",
  description: "Manage AI model configurations, providers, and capabilities",
  letter: "AM",
});

export default function AiModelsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
