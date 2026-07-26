// app/(admin)/administration/shared-knowledge/page.tsx
//
// Shared Knowledge admin console — the issuance and audit cockpit for
// Shared Knowledge Resources (P2, shared-knowledge-projects). Super-admin
// gating is inherited from app/(admin)/layout.tsx. The server loader pulls
// the org directory + every kind='library' store (reads client RLS hides);
// all mutations run client-side through the existing SECURITY DEFINER RPC
// families (industry_* / library_grant_*).

import { createRouteMetadata } from "@/utils/route-metadata";
import { loadSharedKnowledgeDirectory } from "@/features/admin/shared-knowledge/server";
import { SharedKnowledgeAdminClient } from "@/features/admin/shared-knowledge/components/SharedKnowledgeAdminClient";

export const metadata = createRouteMetadata("/administration/shared-knowledge", {
  title: "Shared Knowledge",
  description:
    "Industry taxonomy, library stores, grant issuance, ingest, and access provenance",
  letter: "SK",
});

export default async function SharedKnowledgeAdminPage() {
  const directory = await loadSharedKnowledgeDirectory();
  return <SharedKnowledgeAdminClient directory={directory} />;
}
