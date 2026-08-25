import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/administration", {
  title: "AI",
  description:
    "Manage AI models, providers, aliases, offerings, and task definitions.",
  letter: "AI",
  canonicalPath: "/administration/ai",
});

export default function AiAdministrationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
