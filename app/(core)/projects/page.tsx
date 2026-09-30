import { ProjectsHub } from "@/features/projects/components/ProjectsHub";


export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ org_filter?: string; scope?: string }>;
}) {
  const { org_filter: org, scope } = await searchParams;
  return <ProjectsHub orgParam={org ?? null} scopeParam={scope ?? null} />;
}
