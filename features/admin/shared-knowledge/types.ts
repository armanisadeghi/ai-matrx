// features/admin/shared-knowledge/types.ts
//
// Types for the Shared Knowledge admin console
// (/administration/shared-knowledge) — the super-admin issuance cockpit for
// industry taxonomy, library stores/grants, curation ingest, and the access
// explorer. Server-loaded directory shapes only; grant/industry wire shapes
// live with their owning hooks (`useDataStoreGrants`, `features/industries`).

import type {
  AdminOrganizationMembershipRow,
  AdminOrganizationRow,
} from "@/features/admin/users/types";

/** One `rag.data_stores` row with `kind='library'`, admin-loaded (all of them). */
export interface AdminLibraryStore {
  id: string;
  name: string;
  shortCode: string | null;
  description: string | null;
  organizationId: string | null;
  organizationName: string | null;
  createdBy: string;
  isActive: boolean;
  discoverable: boolean;
  createdAt: string;
  memberCount: number;
}

/** Everything the console needs that RLS hides from a client session. */
export interface SharedKnowledgeDirectory {
  organizations: AdminOrganizationRow[];
  memberships: AdminOrganizationMembershipRow[];
  stores: AdminLibraryStore[];
}
