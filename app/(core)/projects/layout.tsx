import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/projects", {
  title: "Projects",
  description:
    "Long-running containers for tasks, resources, and context across your org.",
  letter: "Pj",
});

export default function ProjectsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
