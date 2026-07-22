"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Building2,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import SearchableSelect, {
  type Option,
} from "@/components/matrx/SearchableSelect";
import { confirm } from "@/components/dialogs/confirm/confirmDialogOpener";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/lib/toast";
import { USERS_ADMIN_LOCATION } from "@/features/admin/users/constants";
import type {
  AdminOrganizationDirectory,
  AdminOrganizationMembershipRow,
  AdminOrganizationRow,
  AdminUserRow,
} from "@/features/admin/users/types";
import {
  getRoleLabel,
  isOrgRole,
  type OrgRole,
} from "@/features/organizations/types";

interface MemberDisplayRow extends AdminOrganizationMembershipRow {
  email: string | null;
  display_name: string | null;
}

const ROLE_OPTIONS: OrgRole[] = ["owner", "admin", "member"];

export function OrganizationsAdminClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const focusedUserId = searchParams.get("user");
  const requestedOrganizationId = searchParams.get("org");

  const [directory, setDirectory] =
    useState<AdminOrganizationDirectory | null>(null);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<
    string | null
  >(requestedOrganizationId);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [addUserId, setAddUserId] = useState<string>();
  const [addRole, setAddRole] = useState<OrgRole>("member");
  const [savingMembershipId, setSavingMembershipId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [directoryResponse, usersResponse] = await Promise.all([
          fetch("/api/admin/users/organizations", { cache: "no-store" }),
          fetch("/api/admin/users", { cache: "no-store" }),
        ]);
        const directoryJson = await directoryResponse.json();
        const usersJson = await usersResponse.json();
        if (!directoryResponse.ok) {
          throw new Error(
            directoryJson.error ?? "Failed to load organizations",
          );
        }
        if (!usersResponse.ok) {
          throw new Error(usersJson.error ?? "Failed to load users");
        }
        if (!cancelled) {
          setDirectory(
            directoryJson.directory as AdminOrganizationDirectory,
          );
          setUsers(usersJson.users as AdminUserRow[]);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Failed to load organization directory",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const membershipOrganizationIds = new Set(
    (directory?.memberships ?? [])
      .filter((membership) => membership.user_id === focusedUserId)
      .map((membership) => membership.organization_id),
  );
  const visibleOrganizations = (directory?.organizations ?? []).filter(
    (organization) =>
      !focusedUserId || membershipOrganizationIds.has(organization.id),
  );

  const effectiveSelectedOrganizationId =
    visibleOrganizations.find(
      (organization) => organization.id === requestedOrganizationId,
    )?.id ??
    visibleOrganizations.find(
      (organization) => organization.id === selectedOrganizationId,
    )?.id ??
    visibleOrganizations[0]?.id ??
    null;

  const userById = new Map(users.map((user) => [user.id, user]));
  const focusedUser = focusedUserId ? userById.get(focusedUserId) : undefined;
  const selectedOrganization = directory?.organizations.find(
    (organization) => organization.id === effectiveSelectedOrganizationId,
  );
  const selectedMemberships = (directory?.memberships ?? []).filter(
    (membership) =>
      membership.organization_id === selectedOrganization?.id,
  );
  const members: MemberDisplayRow[] = selectedMemberships.map((membership) => {
    const user = userById.get(membership.user_id);
    return {
      ...membership,
      email: user?.email ?? null,
      display_name: user?.display_name ?? user?.full_name ?? null,
    };
  });
  const currentMemberIds = new Set(
    selectedMemberships.map((membership) => membership.user_id),
  );
  const availableUserOptions: Option[] = users
    .filter(
      (user) =>
        !currentMemberIds.has(user.id) &&
        (!selectedOrganization?.is_personal ||
          user.id === selectedOrganization.created_by),
    )
    .map((user) => ({
      value: user.id,
      label: `${user.display_name ?? user.full_name ?? "Unnamed user"} — ${user.email ?? user.id}`,
    }));
  const editableRoleOptions: OrgRole[] = selectedOrganization?.is_personal
    ? ["owner"]
    : ROLE_OPTIONS;

  function setOrganizationFocus(organization: AdminOrganizationRow) {
    setSelectedOrganizationId(organization.id);
    const params = new URLSearchParams(searchParams.toString());
    params.set("org", organization.id);
    router.replace(`${pathname}?${params.toString()}`);
  }

  function setUserFocus(userId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("user", userId);
    params.delete("org");
    router.replace(`${pathname}?${params.toString()}`);
  }

  function clearUserFocus() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("user");
    if (effectiveSelectedOrganizationId)
      params.set("org", effectiveSelectedOrganizationId);
    router.replace(`${pathname}?${params.toString()}`);
  }

  async function mutateMembership(
    method: "POST" | "PATCH" | "DELETE",
    body: { organizationId: string; userId: string; role?: OrgRole },
  ) {
    const response = await fetch("/api/admin/users/organizations", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await response.json();
    if (!response.ok) throw new Error(json.error ?? "Membership change failed");
    setRefreshKey((current) => current + 1);
  }

  async function addMember() {
    if (!selectedOrganization || !addUserId) return;
    setSavingMembershipId(addUserId);
    try {
      await mutateMembership("POST", {
        organizationId: selectedOrganization.id,
        userId: addUserId,
        role: selectedOrganization.is_personal ? "owner" : addRole,
      });
      toast.success("Organization member added");
      setAddOpen(false);
      setAddUserId(undefined);
      setAddRole("member");
    } catch (mutationError) {
      toast.error(
        mutationError instanceof Error
          ? mutationError.message
          : "Failed to add member",
      );
    } finally {
      setSavingMembershipId(null);
    }
  }

  async function changeRole(member: MemberDisplayRow, nextRole: string) {
    if (!selectedOrganization || !isOrgRole(nextRole) || nextRole === member.role)
      return;
    const approved = await confirm({
      title: `Change role to ${getRoleLabel(nextRole)}?`,
      description: `${member.display_name ?? member.email ?? member.user_id} will become ${getRoleLabel(nextRole)} in ${selectedOrganization.name}.`,
      confirmLabel: "Change role",
    });
    if (!approved) return;

    setSavingMembershipId(member.id);
    try {
      await mutateMembership("PATCH", {
        organizationId: selectedOrganization.id,
        userId: member.user_id,
        role: nextRole,
      });
      toast.success("Organization role updated");
    } catch (mutationError) {
      toast.error(
        mutationError instanceof Error
          ? mutationError.message
          : "Failed to change role",
      );
    } finally {
      setSavingMembershipId(null);
    }
  }

  async function removeMember(member: MemberDisplayRow) {
    if (!selectedOrganization) return;
    const approved = await confirm({
      title: `Remove from ${selectedOrganization.name}?`,
      description: `${member.display_name ?? member.email ?? member.user_id} will lose this organization membership. The last owner cannot be removed.`,
      confirmLabel: "Remove member",
      variant: "destructive",
    });
    if (!approved) return;

    setSavingMembershipId(member.id);
    try {
      await mutateMembership("DELETE", {
        organizationId: selectedOrganization.id,
        userId: member.user_id,
      });
      toast.success("Organization member removed");
    } catch (mutationError) {
      toast.error(
        mutationError instanceof Error
          ? mutationError.message
          : "Failed to remove member",
      );
    } finally {
      setSavingMembershipId(null);
    }
  }

  const organizationColumns: MatrxColumnDef<AdminOrganizationRow>[] = [
    {
      id: "name",
      accessorKey: "name",
      header: "Organization",
      cell: (organization) => (
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{organization.name}</div>
          <div className="truncate text-[11px] text-muted-foreground">
            {organization.slug}
          </div>
        </div>
      ),
      width: 220,
    },
    {
      id: "type",
      header: "Type",
      accessorFn: (organization) =>
        organization.is_system
          ? "System"
          : organization.is_personal
            ? "Personal"
            : "Shared",
      filter: "select",
      cell: (organization) => (
        <Badge variant="outline">
          {organization.is_system
            ? "System"
            : organization.is_personal
              ? "Personal"
              : "Shared"}
        </Badge>
      ),
      width: 90,
    },
    {
      id: "member_count",
      accessorKey: "member_count",
      header: "Members",
      align: "right",
      width: 80,
    },
    {
      id: "owner_count",
      accessorKey: "owner_count",
      header: "Owners",
      align: "right",
      width: 70,
    },
    {
      id: "id",
      accessorKey: "id",
      header: "Organization ID",
      cellKind: "uuid",
      sortable: false,
      filter: false,
      width: 120,
    },
  ];

  const memberColumns: MatrxColumnDef<MemberDisplayRow>[] = [
    {
      id: "display_name",
      accessorKey: "display_name",
      header: "User",
      cell: (member) => (
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">
            {member.display_name ?? "Unnamed user"}
          </div>
          <div className="truncate text-[11px] text-muted-foreground">
            {member.email ?? member.user_id}
          </div>
        </div>
      ),
      width: 240,
    },
    {
      id: "role",
      accessorKey: "role",
      header: "Role",
      filter: "select",
      cell: (member) => (
        <Select
          value={member.role}
          onValueChange={(value) => void changeRole(member, value)}
          disabled={
            (selectedOrganization?.is_personal &&
              (member.user_id !== selectedOrganization.created_by ||
                member.role === "owner")) ||
            savingMembershipId === member.id
          }
        >
          <SelectTrigger className="h-7 w-28 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {editableRoleOptions.map((role) => (
              <SelectItem key={role} value={role}>
                {getRoleLabel(role)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ),
      width: 130,
    },
    {
      id: "joined_at",
      accessorKey: "joined_at",
      header: "Joined",
      cell: (member) => (
        <span className="text-xs text-muted-foreground">
          {new Date(member.joined_at).toLocaleDateString()}
        </span>
      ),
      width: 110,
    },
    {
      id: "user_id",
      accessorKey: "user_id",
      header: "User ID",
      cellKind: "uuid",
      sortable: false,
      filter: false,
      width: 120,
    },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-4">
      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {focusedUserId ? (
        <div className="flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-2">
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <UserRound className="h-4 w-4 shrink-0 text-primary" />
            <span className="truncate">
              Organizations for {focusedUser?.display_name ?? focusedUser?.email ?? focusedUserId}
            </span>
            <Badge variant="secondary">{visibleOrganizations.length}</Badge>
          </div>
          <Button size="sm" variant="ghost" onClick={clearUserFocus}>
            <X className="mr-1 h-4 w-4" /> Show all organizations
          </Button>
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 xl:grid-cols-[minmax(26rem,0.85fr)_minmax(34rem,1.15fr)]">
        <section className="flex min-h-0 flex-col rounded-lg border bg-card">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Building2 className="h-4 w-4 text-primary" /> Organizations
              </div>
              <p className="text-xs text-muted-foreground">
                {visibleOrganizations.length} visible of {directory?.organizations.length ?? 0}
              </p>
            </div>
            <Button
              size="icon"
              variant="ghost"
              title="Refresh organizations"
              onClick={() => setRefreshKey((current) => current + 1)}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          </div>
          <div className="min-h-0 flex-1 p-2">
            <MatrxDataTable
              data={visibleOrganizations}
              columns={organizationColumns}
              getRowId={(organization) => organization.id}
              isLoading={loading}
              pageSize={50}
              selectedId={effectiveSelectedOrganizationId}
              onRowOpen={setOrganizationFocus}
              detail={{ enabled: false }}
              toolbar={{
                search: true,
                searchPlaceholder: "Search organizations…",
              }}
              copy={{
                label: "Organization",
                listLabel: "Organizations (this view)",
                location: USERS_ADMIN_LOCATION,
                rowKind: "organization",
                listKind: "organizations",
                humanRow: (organization) =>
                  `${organization.name} (${organization.slug})\nid=${organization.id}\nmembers=${organization.member_count} owners=${organization.owner_count}`,
              }}
              emptyState={{
                title: focusedUserId
                  ? "No organization memberships"
                  : "No organizations",
                description: focusedUserId
                  ? "This user does not belong to an organization."
                  : "No organizations are available.",
              }}
            />
          </div>
        </section>

        <section className="flex min-h-0 flex-col rounded-lg border bg-card">
          <div className="flex min-h-[57px] items-center justify-between gap-3 border-b px-3 py-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">
                {selectedOrganization?.name ?? "Select an organization"}
              </div>
              {selectedOrganization ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{members.length} members</span>
                  {selectedOrganization.is_personal ? (
                    <Badge variant="outline" className="h-5 text-[10px]">
                      Personal — repair only
                    </Badge>
                  ) : null}
                </div>
              ) : null}
            </div>
            <Button
              size="sm"
              onClick={() => setAddOpen(true)}
              disabled={
                !selectedOrganization ||
                (selectedOrganization.is_personal &&
                  (selectedOrganization.member_count > 0 ||
                    !selectedOrganization.created_by))
              }
            >
              <Plus className="mr-1 h-4 w-4" /> Add member
            </Button>
          </div>
          <div className="min-h-0 flex-1 p-2">
            <MatrxDataTable
              data={members}
              columns={memberColumns}
              getRowId={(member) => member.id}
              isLoading={loading}
              detail={{ enabled: false }}
              pageSize={50}
              toolbar={{
                search: true,
                searchPlaceholder: "Search members…",
              }}
              copy={
                selectedOrganization
                  ? {
                      label: "Organization member",
                      listLabel: "Organization members (this view)",
                      location: `${USERS_ADMIN_LOCATION} — ${selectedOrganization.name}`,
                      rowKind: "organization_member",
                      listKind: "organization_members",
                      humanRow: (member) =>
                        `${member.display_name ?? "Unnamed user"} <${member.email ?? "no-email"}>\nuser_id=${member.user_id}\nrole=${member.role}`,
                    }
                  : undefined
              }
              rowActions={(member) => (
                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    title="View this user's organizations"
                    onClick={() => setUserFocus(member.user_id)}
                  >
                    <Building2 className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    title="Remove member"
                    disabled={
                      (selectedOrganization?.is_personal &&
                        member.user_id === selectedOrganization.created_by) ||
                      savingMembershipId === member.id
                    }
                    onClick={() => void removeMember(member)}
                  >
                    {savingMembershipId === member.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              )}
              emptyState={{
                title: selectedOrganization
                  ? "No members"
                  : "Select an organization",
                description: selectedOrganization
                  ? "This organization has no active memberships."
                  : "Choose an organization to inspect and manage its users.",
              }}
            />
          </div>
        </section>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add organization member</DialogTitle>
            <DialogDescription>
              Add an existing account to {selectedOrganization?.name}. New-user
              invitations remain in the Invitations tab. Personal organizations
              can only restore their creator as owner.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">User</label>
              <SearchableSelect
                options={availableUserOptions}
                value={addUserId}
                onChange={(option) => setAddUserId(option.value)}
                placeholder="Select an existing user"
                searchPlaceholder="Search name, email, or ID…"
                noResultsText="Every user is already a member."
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Role</label>
              <Select
                value={selectedOrganization?.is_personal ? "owner" : addRole}
                onValueChange={(role) => {
                  if (isOrgRole(role)) setAddRole(role);
                }}
                disabled={selectedOrganization?.is_personal}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((role) => (
                    <SelectItem key={role} value={role}>
                      {getRoleLabel(role)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => void addMember()}
              disabled={!addUserId || savingMembershipId !== null}
            >
              {savingMembershipId ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Add member
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
