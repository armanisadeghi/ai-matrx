import { ProjectsHub } from "@/features/projects/components/ProjectsHub";


export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; scope?: string }>;
}) {
  const { org, scope } = await searchParams;
  return <ProjectsHub orgParam={org ?? null} scopeParam={scope ?? null} />;
}
