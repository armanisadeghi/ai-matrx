import HierarchyLayoutClient from "./HierarchyLayoutClient";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/agent-context", {
  titlePrefix: "Hierarchy",
  title: "Agent Context",
  description: "Manage agent context hierarchy trees.",
  letter: "X",
});

export default function HierarchyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <HierarchyLayoutClient>{children}</HierarchyLayoutClient>;
}
