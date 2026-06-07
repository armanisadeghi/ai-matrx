import type { Metadata } from "next";
import { ProjectsHub } from "@/features/projects/components/ProjectsHub";

export const metadata: Metadata = {
  title: "Projects",
  description:
    "Your projects — longer-running containers for tasks, resources, and context.",
};

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; scope?: string }>;
}) {
  const { org, scope } = await searchParams;
  return <ProjectsHub orgParam={org ?? null} scopeParam={scope ?? null} />;
}
