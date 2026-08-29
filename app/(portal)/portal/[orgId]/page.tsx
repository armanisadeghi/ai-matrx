/**
 * `/portal/[orgId]` — one organization's departed-member portal.
 *
 * This is the URL a notification links to. When an organization needs something from a former
 * employee — today, their consent to state their income on a verification letter — the spine
 * reaches them at the personal contact on file and the link lands HERE, on the employer whose
 * request it is, rather than on a chooser they then have to interpret.
 *
 * 🚨 THE `orgId` IN THE URL GRANTS NOTHING. `continued_access_portal(p_organization_id)` filters
 * the caller's OWN departed records by that id; it never looks the organization up on its own.
 * Passing somebody else's organization id returns an empty list, not somebody else's portal.
 */

import { ContinuedAccessPortal } from "@/features/continued-access/ContinuedAccessPortal";

export const metadata = { title: "Your portal" };

export default async function OrganizationPortalPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  return <ContinuedAccessPortal organizationId={orgId} />;
}
