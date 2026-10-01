import "server-only";

import { operationFailed } from "@/utils/errors";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { createClient } from "@/utils/supabase/server";
import type {
  AdminOrganizationDirectory,
  AdminOrganizationMembershipRow,
  AdminOrganizationRow,
} from "@/features/admin/users/types";
import type { OrgRole } from "@/features/organizations/types";
import { readAllRows } from "@ai-matrx/data/db";
import {
  DEFAULT_ARCHIVE_FILTER,
  type ArchiveFilterValue,
} from "@ai-matrx/design-system";

/**
 * Load every organization and active organization membership for super-admin views.
 *
 * THE ARCHIVED-ITEMS LAW: `archiveFilter` defaults to "active", so the
 * directory hides archived organizations, and "archived" / "all" are the
 * reveal. Every row carries `archived_at`, so a surface showing "all" can
 * label which of them are closed instead of mixing them in unlabelled.
 */
export async function loadAdminOrganizationDirectory(
  archiveFilter: ArchiveFilterValue = DEFAULT_ARCHIVE_FILTER,
): Promise<AdminOrganizationDirectory> {
  const admin = createAdminClient();
  // PostgREST caps one response at 1,000 rows. `readAllRows` pages each read to its declared total
  // (and throws rather than return a short list), so the directory is never silently truncated.
  let organizations_: Awaited<ReturnType<typeof readOrganizations>>;
  let memberships_: Awaited<ReturnType<typeof readMemberships>>;
  try {
    [organizations_, memberships_] = await Promise.all([
      readOrganizations(admin, archiveFilter),
      readMemberships(admin),
    ]);
  } catch (error) {
    throw new Error(
      `Failed to load organization directory: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const organizationsResult = { data: organizations_ };
  const membershipsResult = { data: memberships_ };

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
      is_system: row.is_system,
      archived_at: row.archived_at ?? null,
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

  if (error) throw operationFailed("apply that membership change", error);
  return data;
}

function readOrganizations(
  admin: ReturnType<typeof createAdminClient>,
  archiveFilter: ArchiveFilterValue,
) {
  return readAllRows(
    ({ from, to }) => {
      let query = admin
        .schema("iam")
        .from("organizations")
        .select(
          "id, name, abbreviation, slug, description, website, created_at, created_by, is_system, archived_at",
          { count: "exact" },
        );
      if (archiveFilter === "active") query = query.is("archived_at", null);
      else if (archiveFilter === "archived")
        query = query.not("archived_at", "is", null);
      return query
        .order("name", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to);
    },
    { label: "iam.organizations (admin directory)" },
  );
}

function readMemberships(admin: ReturnType<typeof createAdminClient>) {
  return readAllRows(
    ({ from, to }) =>
      admin
        .schema("iam")
        .from("organization_member")
        .select("id, organization_id, user_id, role, joined_at, invited_by", {
          count: "exact",
        })
        .order("id", { ascending: true })
        .range(from, to),
    { label: "iam.organization_member (admin directory)" },
  );
}
