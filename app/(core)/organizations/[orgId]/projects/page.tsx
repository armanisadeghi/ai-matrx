import { redirect } from "next/navigation";

// Projects are now a canonical top-level surface; the org is a filtered view.
export default async function OrgProjectsRedirect({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  redirect(`/projects?org=${orgId}`);
}
