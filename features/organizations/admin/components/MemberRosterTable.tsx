"use client";

/**
 * The org-admin member roster — every user in the org with org-scoped metrics.
 * Search + sort + engagement signal; each row links to the member detail surface.
 */
import React, { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, ShieldCheck, UserCog } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  MatrxDataTable,
  type MatrxColumnDef,
  type MatrxDataTableCopyConfig,
} from "@ai-matrx/design-system/data-table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { OrgAdminMember } from "../types";
// THE package initials formatter (`@ai-matrx/kit/format`, census H1
// 2026-09-07). VISIBLE CHANGE: this file previously took first+second word
// for multi-word names (package: first+last) AND took the first TWO
// characters for a single-word name or email fallback (package: first ONE
// character) — a member named "Ana" or falling back to "ana@example.com"
// now shows one letter instead of two. Recorded as intentional per the
// package's documented, once-made display decision.
import { getInitials } from "@ai-matrx/kit/format";
import { activityBucket, formatMcents, formatRelativeTime } from "../utils";
import { useCostDisplay } from "@/components/cost/useCostDisplay";
import { formatFileSize } from "@ai-matrx/kit/format";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { csvExportItem, jsonExportItem } from "@/components/agent-copy/export";
import {
  buildRosterListPayload,
  buildRosterMemberPayload,
  rosterCsvRows,
  rosterListHuman,
  rosterMemberRow,
  rosterMemberSummary,
} from "../copy";
import { UserSearchField } from "@/features/user-search/UserSearchField";

type SortKey = "name" | "role" | "lastActive" | "storage" | "spend";

const ROLE_BADGE: Record<string, "default" | "secondary" | "outline"> = {
  owner: "default",
  admin: "secondary",
  member: "outline",
};

function initials(name: string | null, email: string | null): string {
  return getInitials(name || email);
}

function ActivityDot({ member }: { member: OrgAdminMember }) {
  const bucket = activityBucket(member.lastOrgActivityAt);
  const color =
    bucket === "active"
      ? "bg-green-500"
      : bucket === "idle"
        ? "bg-yellow-500"
        : bucket === "dormant"
          ? "bg-orange-500"
          : "bg-muted-foreground/40";
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${color}`}
      aria-hidden
    />
  );
}

interface Props {
  orgSlug: string;
  members: OrgAdminMember[];
}

export function MemberRosterTable({ orgSlug, members }: Props) {
  const { unit, rate: costRate } = useCostDisplay();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("name");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? members.filter(
          (m) =>
            (m.displayName ?? "").toLowerCase().includes(q) ||
            (m.email ?? "").toLowerCase().includes(q),
        )
      : members;
    const sorted = [...filtered].sort((a, b) => {
      switch (sort) {
        case "role":
          return a.role.localeCompare(b.role);
        case "lastActive":
          return (
            new Date(b.lastOrgActivityAt ?? 0).getTime() -
            new Date(a.lastOrgActivityAt ?? 0).getTime()
          );
        case "storage":
          return b.orgBytesUsed - a.orgBytesUsed;
        case "spend":
          return b.cost24hMcents - a.cost24hMcents;
        default:
          return (a.displayName ?? a.email ?? "").localeCompare(
            b.displayName ?? b.email ?? "",
          );
      }
    });
    return sorted;
  }, [members, query, sort]);

  const go = (userId: string) =>
    startTransition(() =>
      router.push(`/organizations/${orgSlug}/admin/users/${userId}`),
    );

  const columns = useMemo<MatrxColumnDef<OrgAdminMember>[]>(
    () => [
      {
        id: "member",
        header: "Member",
        accessorFn: (member) => member.displayName ?? member.email ?? "",
        sortable: false,
        cell: (member) => (
          <div className="flex items-center gap-2.5">
            <Avatar className="h-7 w-7">
              {member.avatarUrl && (
                <AvatarImage src={member.avatarUrl} alt="" />
              )}
              <AvatarFallback className="text-[10px]">
                {initials(member.displayName, member.email)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-foreground">
                {member.displayName || member.email || "Unknown user"}
              </div>
              {member.displayName && member.email && (
                <div className="truncate text-xs text-muted-foreground">
                  {member.email}
                </div>
              )}
            </div>
          </div>
        ),
      },
      {
        accessorKey: "role",
        header: "Role",
        sortable: false,
        cell: (member) => (
          <Badge
            variant={ROLE_BADGE[member.role] ?? "outline"}
            className="gap-1 capitalize"
          >
            {member.role === "owner" && <ShieldCheck className="h-3 w-3" />}
            {member.role}
          </Badge>
        ),
      },
      {
        id: "status",
        header: "Status",
        accessorFn: (member) => member.status,
        sortable: false,
        cell: (member) =>
          member.status === "suspended" ? (
            <Badge variant="destructive">Suspended</Badge>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              <ActivityDot member={member} />
              Active
            </span>
          ),
      },
      {
        id: "last-active",
        header: "Last active",
        accessorFn: (member) => member.lastOrgActivityAt ?? "",
        sortable: false,
        cell: (member) => (
          <span className="text-sm text-muted-foreground">
            {formatRelativeTime(member.lastOrgActivityAt)}
          </span>
        ),
      },
      {
        id: "files",
        header: "Files (org)",
        accessorFn: (member) => member.orgFilesCount,
        sortable: false,
        cell: (member) => (
          <span className="text-sm text-muted-foreground">
            <span className="text-foreground">{member.orgFilesCount}</span>{" "}
            <span className="text-xs">
              ({formatFileSize(member.orgBytesUsed)})
            </span>
          </span>
        ),
      },
      {
        id: "spend",
        header: "Spend 24h",
        accessorFn: (member) => member.cost24hMcents,
        sortable: false,
        cell: (member) => (
          <span className="text-sm text-muted-foreground">
            {formatMcents(member.cost24hMcents, costRate, unit)}
          </span>
        ),
      },
      {
        id: "tier",
        header: "Tier",
        accessorFn: (member) => member.memberLevel ?? "",
        sortable: false,
        cell: (member) =>
          member.memberLevel ? (
            <Badge variant="info" className="capitalize">
              {member.memberLevel}
            </Badge>
          ) : (
            <span className="text-xs text-muted-foreground">Standard</span>
          ),
      },
    ],
    [unit, costRate],
  );
  const selectionCopy = useMemo<MatrxDataTableCopyConfig<OrgAdminMember>>(
    () => ({
      label: "Organization member",
      listLabel: "Organization members (selected)",
      location: `AI Matrx — Org admin — Member roster (/organizations/${orgSlug}/admin)`,
      rowKind: "org-admin-member",
      listKind: "org-admin-members",
      rowDescription: "One selected member from the organization roster.",
      listDescription: "The selected members from the organization roster.",
      humanRow: (member) => rosterMemberSummary(member, costRate, unit),
      agentRow: rosterMemberRow,
      rowAttributes: (member) => ({
        user_id: member.userId,
        email: member.email,
        role: member.role,
        status: member.status,
      }),
      listAttributes: (selected) => ({
        selected_members: selected.length,
        roster_total: members.length,
      }),
      listContext: () => ({
        org_slug: orgSlug,
        roster_total: members.length,
        active_search: query || undefined,
        active_sort: sort,
      }),
      // The roster header owns all-member human/JSON/CSV exports; each row
      // owns its richer member-specific menu. Keep those controls and add
      // only the table's selected-row Alchemy copy.
      showToolbar: false,
      showRow: false,
    }),
    [members.length, orgSlug, query, sort, unit, costRate],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <UserSearchField
          value={query}
          onValueChange={setQuery}
          onUserSelect={(user) => go(user.id)}
          candidates={members.map((member) => ({
            id: member.userId,
            email: member.email,
            displayName: member.displayName,
            avatarUrl: member.avatarUrl,
            phone: null,
            adminLevel: null,
            organizations: [],
            source: member.role,
            createdAt: null,
            lastSignInAt: member.lastOrgActivityAt,
          }))}
          title="Find an organization member"
          placeholder="Search members by name or email"
          ariaLabel="Open advanced member search"
          className="min-w-[200px] flex-1"
        />
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          {(
            [
              ["name", "Name"],
              ["role", "Role"],
              ["lastActive", "Last active"],
              ["storage", "Storage"],
              ["spend", "Spend"],
            ] as [SortKey, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSort(key)}
              className={`rounded px-2 py-1 transition-colors ${
                sort === key
                  ? "bg-accent text-foreground"
                  : "hover:bg-accent/50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {/* Copy/export cover ALL members, never the searched/sorted slice. */}
        {members.length > 0 && (
          <div className="flex items-center gap-1">
            <CopyButtons
              size="icon"
              label="Member roster"
              human={() => rosterListHuman(members, costRate, unit)}
              json={() => members.map(rosterMemberRow)}
              agent={() =>
                buildRosterListPayload({
                  members,
                  orgSlug,
                  searchQuery: query,
                  sort,
                  rate: costRate,
                  unit,
                })
              }
              export={{
                items: [
                  jsonExportItem(() => members.map(rosterMemberRow)),
                  csvExportItem(
                    () => rosterCsvRows(members),
                    "CSV (all members)",
                  ),
                ],
              }}
            />
          </div>
        )}
      </div>

      {/* Search, domain sorting, and all-members export remain roster-owned.
          The table contributes non-destructive selection and selected-row
          Alchemy copy; each row keeps its richer member-specific menu. */}
      <MatrxDataTable<OrgAdminMember>
        tableId="organizations/admin/member-roster"
        data={rows}
        columns={[...(columns), { id: "custom-actions", header: "Actions", sortable: false, filter: false, customActions: (member) => (
          <div className="flex items-center justify-end gap-1 text-muted-foreground">
            <CopyButtons
              size="xs"
              label={member.displayName || member.email || "Member"}
              human={() => rosterMemberSummary(member, costRate, unit)}
              json={() => rosterMemberRow(member)}
              agent={() =>
                buildRosterMemberPayload({
                  member,
                  orgSlug,
                  totalMembers: members.length,
                  rate: costRate,
                  unit,
                })
              }
            />
            <UserCog className="h-4 w-4" />
            <ChevronRight className="h-4 w-4" />
          </div>
        ) }]}
        getRowId={(member) => member.userId}
        density="condensed"
        copy={selectionCopy}
        toolbar={{ search: false }}
        detail={{ enabled: false }}
        window={{ enabled: false }}
        pageSize={0}
        coverage={{ noun: "member", answeredBy: "client" }}
        onRowOpen={(member) => go(member.userId)}
        emptyState={{
          title: query ? "No members match your search." : "No members yet.",
        }}

      />
    </div>
  );
}
