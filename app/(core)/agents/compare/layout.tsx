import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/agents", {
  titlePrefix: "Compare",
  title: "Agents",
  description: "Compare agents side by side.",
  letter: "Cp",
});

export default function CompareAgentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
