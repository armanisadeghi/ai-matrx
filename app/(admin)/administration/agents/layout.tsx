import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/administration", {
  title: "Agents",
  description:
    "Manage agent definitions, tools, skills, and execution surfaces.",
  letter: "ADA",
  canonicalPath: "/administration/agents",
});

export default function AgentsAdministrationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
