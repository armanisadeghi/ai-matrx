import { redirect } from "next/navigation";

// Canonical project workspace is /projects/[projectId] (slug or UUID).
export default async function OrgProjectRedirect({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  redirect(`/projects/${projectId}`);
}
