import { redirect } from "next/navigation";

// Canonical project management is /projects/[projectId]/settings.
export default async function OrgProjectSettingsRedirect({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  redirect(`/projects/${projectId}/settings`);
}
