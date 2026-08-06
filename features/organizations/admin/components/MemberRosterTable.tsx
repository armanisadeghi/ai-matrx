"use client";

/**
 * The org-admin member roster — every user in the org with org-scoped metrics.
 * Search + sort + engagement signal; each row links to the member detail surface.
 */
import React, { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Search, ShieldCheck, UserCog } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { OrgAdminMember } from "../types";
import { activityBucket, formatBytes, formatMcents, formatRelativeTime } from "../utils";

type SortKey = "name" | "role" | "lastActive" | "storage" | "spend";

const ROLE_BADGE: Record<string, "default" | "secondary" | "outline"> = {
  owner: "default",
  admin: "secondary",
  member: "outline",
};

function initials(name: string | null, email: string | null): string {
  const base = (name || email || "?").trim();
  const parts = base.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase();
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
  return <span className={`inline-block h-2 w-2 rounded-full ${color}`} aria-hidden />;
}

interface Props {
  orgSlug: string;
  members: OrgAdminMember[];
}

export function MemberRosterTable({ orgSlug, members }: Props) {
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
          return (a.displayName ?? a.email ?? "").localeCompare(b.displayName ?? b.email ?? "");
      }
    });
    return sorted;
  }, [members, query, sort]);

  const go = (userId: string) =>
    startTransition(() => router.push(`/organizations/${orgSlug}/admin/users/${userId}`));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search members by name or email"
            className="pl-8"
          />
        </div>
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
                sort === key ? "bg-accent text-foreground" : "hover:bg-accent/50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead className="w-[90px]">Role</TableHead>
              <TableHead className="w-[110px]">Status</TableHead>
              <TableHead className="w-[120px]">Last active</TableHead>
              <TableHead className="w-[140px]">Files (org)</TableHead>
              <TableHead className="w-[100px]">Spend 24h</TableHead>
              <TableHead className="w-[90px]">Tier</TableHead>
              <TableHead className="w-[44px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                  {query ? "No members match your search." : "No members yet."}
                </TableCell>
              </TableRow>
            )}
            {rows.map((m) => (
              <TableRow
                key={m.userId}
                onClick={() => go(m.userId)}
                className="cursor-pointer"
              >
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <Avatar className="h-7 w-7">
                      {m.avatarUrl && <AvatarImage src={m.avatarUrl} alt="" />}
                      <AvatarFallback className="text-[10px]">
                        {initials(m.displayName, m.email)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-foreground">
                        {m.displayName || m.email || "Unknown user"}
                      </div>
                      {m.displayName && m.email && (
                        <div className="truncate text-xs text-muted-foreground">{m.email}</div>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={ROLE_BADGE[m.role] ?? "outline"} className="gap-1 capitalize">
                    {m.role === "owner" && <ShieldCheck className="h-3 w-3" />}
                    {m.role}
                  </Badge>
                </TableCell>
                <TableCell>
                  {m.status === "suspended" ? (
                    <Badge variant="destructive">Suspended</Badge>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                      <ActivityDot member={m} />
                      Active
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatRelativeTime(m.lastOrgActivityAt)}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  <span className="text-foreground">{m.orgFilesCount}</span>{" "}
                  <span className="text-xs">({formatBytes(m.orgBytesUsed)})</span>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatMcents(m.cost24hMcents)}
                </TableCell>
                <TableCell className="text-sm">
                  {m.memberLevel ? (
                    <Badge variant="info" className="capitalize">
                      {m.memberLevel}
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">Standard</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1 text-muted-foreground">
                    <UserCog className="h-4 w-4" />
                    <ChevronRight className="h-4 w-4" />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
