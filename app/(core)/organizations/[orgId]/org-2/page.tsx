"use client";

// Legacy alias for the org workspace, which is now the primary
// /organizations/[orgId] page. Kept so existing /org-2 links still resolve.
import { OrgWorkspace } from "@/features/organizations/components/OrgWorkspace";

export default function OrganizationWorkspaceV2Page() {
  return <OrgWorkspace />;
}
