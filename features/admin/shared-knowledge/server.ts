import "server-only";

// features/admin/shared-knowledge/server.ts
//
// Server loader for the Shared Knowledge admin console. Runs behind the
// `(admin)` layout's super-admin gate; uses the admin client ONLY for reads
// that client-side RLS deliberately hides from a super-admin session (the
// full org directory and EVERY `kind='library'` store, including inactive /
// undiscoverable ones an admin console must not go blind to). Every mutation
// stays client-side through the existing SECURITY DEFINER RPC families —
// this file never writes.

import { createAdminClient } from "@/utils/supabase/adminClient";
import { loadAdminOrganizationDirectory } from "@/features/admin/users/server/organizationMembershipAdmin";
import type {
  AdminLibraryStore,
  SharedKnowledgeDirectory,
} from "./types";

export async function loadSharedKnowledgeDirectory(): Promise<SharedKnowledgeDirectory> {
  const admin = createAdminClient();

  const [orgDirectory, storesResult, membersResult] = await Promise.all([
    loadAdminOrganizationDirectory(),
    admin
      .schema("rag")
      .from("data_stores")
      .select(
        "id, name, short_code, description, kind, organization_id, created_by, is_active, discoverable, created_at",
      )
      .eq("kind", "library")
      .order("name", { ascending: true }),
    admin.schema("rag").from("data_store_members").select("data_store_id"),
  ]);

  if (storesResult.error) {
    throw new Error(
      `Failed to load library stores: ${storesResult.error.message}`,
    );
  }
  if (membersResult.error) {
    throw new Error(
      `Failed to load library store members: ${membersResult.error.message}`,
    );
  }

  const memberCounts = new Map<string, number>();
  for (const row of membersResult.data ?? []) {
    memberCounts.set(
      row.data_store_id,
      (memberCounts.get(row.data_store_id) ?? 0) + 1,
    );
  }

  const orgNameById = new Map(
    orgDirectory.organizations.map((o) => [o.id, o.name]),
  );

  const stores: AdminLibraryStore[] = (storesResult.data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    shortCode: s.short_code,
    description: s.description,
    organizationId: s.organization_id,
    organizationName: s.organization_id
      ? (orgNameById.get(s.organization_id) ?? null)
      : null,
    createdBy: s.created_by,
    isActive: s.is_active,
    discoverable: s.discoverable,
    createdAt: s.created_at,
    memberCount: memberCounts.get(s.id) ?? 0,
  }));

  return {
    organizations: orgDirectory.organizations,
    memberships: orgDirectory.memberships,
    stores,
  };
}
