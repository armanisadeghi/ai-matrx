import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/context-items", {
  title: "Context Items",
  description: "All context items across every organization you belong to.",
  letter: "Ci",
});

export default function ContextItemsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
