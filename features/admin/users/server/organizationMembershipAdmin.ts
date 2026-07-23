import "server-only";

import { createAdminClient } from "@/utils/supabase/adminClient";
import { createClient } from "@/utils/supabase/server";
import type {
  AdminOrganizationDirectory,
  AdminOrganizationMembershipRow,
  AdminOrganizationRow,
} from "@/features/admin/users/types";
import type { OrgRole } from "@/features/organizations/types";

/** Load every organization and active organization membership for super-admin views. */
export async function loadAdminOrganizationDirectory(): Promise<AdminOrganizationDirectory> {
  const admin = createAdminClient();
  const [organizationsResult, membershipsResult] = await Promise.all([
    admin
      .schema("iam")
      .from("organizations")
      .select(
        "id, name, abbreviation, slug, description, website, created_at, created_by, is_personal, is_system",
      )
      .order("is_personal", { ascending: true })
      .order("name", { ascending: true }),
    admin
      .schema("iam")
      .from("organization_member")
      .select(
        "id, organization_id, user_id, role, joined_at, invited_by",
      ),
  ]);

  if (organizationsResult.error) {
    throw new Error(
      `Failed to load organizations: ${organizationsResult.error.message}`,
    );
  }
  if (membershipsResult.error) {
    throw new Error(
      `Failed to load organization memberships: ${membershipsResult.error.message}`,
    );
  }

  const memberships: AdminOrganizationMembershipRow[] = [];
  const countsByOrganization = new Map<
    string,
    { members: number; owners: number; admins: number }
  >();

  for (const row of membershipsResult.data ?? []) {
    if (
      !row.id ||
      !row.organization_id ||
      !row.user_id ||
      !row.role ||
      !row.joined_at
    ) {
      console.error("Invalid active organization membership row", row);
      continue;
    }

    memberships.push({
      id: row.id,
      organization_id: row.organization_id,
      user_id: row.user_id,
      role: row.role,
      joined_at: row.joined_at,
      invited_by: row.invited_by ?? null,
    });

    const counts = countsByOrganization.get(row.organization_id) ?? {
      members: 0,
      owners: 0,
      admins: 0,
    };
    counts.members += 1;
    if (row.role === "owner") counts.owners += 1;
    if (row.role === "admin") counts.admins += 1;
    countsByOrganization.set(row.organization_id, counts);
  }

  const organizations: AdminOrganizationRow[] = (
    organizationsResult.data ?? []
  ).map((row) => {
    const counts = countsByOrganization.get(row.id) ?? {
      members: 0,
      owners: 0,
      admins: 0,
    };
    return {
      id: row.id,
      name: row.name,
      abbreviation: row.abbreviation,
      slug: row.slug,
      description: row.description ?? null,
      website: row.website ?? null,
      created_at: row.created_at ?? null,
      created_by: row.created_by ?? null,
      is_personal: row.is_personal === true,
      is_system: row.is_system,
      member_count: counts.members,
      owner_count: counts.owners,
      admin_count: counts.admins,
    };
  });

  return { organizations, memberships };
}

/** Mutate one canonical organization membership through the audited DB RPC. */
export async function manageAdminOrganizationMembership(args: {
  action: "add" | "set_role" | "remove";
  organizationId: string;
  userId: string;
  role?: OrgRole;
}) {
  const session = await createClient();
  const { data, error } = await session.rpc(
    "admin_manage_organization_membership",
    {
      p_action: args.action,
      p_org_id: args.organizationId,
      p_user_id: args.userId,
      p_role: args.role,
    },
  );

  if (error) throw new Error(error.message || "Membership change failed");
  return data;
}
