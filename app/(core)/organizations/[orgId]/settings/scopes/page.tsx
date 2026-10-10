import { redirect } from "next/navigation";

// The organization's scopes are managed on ONE screen: /organizations/<org>/scopes
// (ScopesManager). This settings address stays a link that lands there.
export default async function OrganizationScopesSettingsPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  redirect(`/organizations/${orgId}/scopes`);
}
