"use client";

/**
 * OrgShareReviewCard
 * ------------------
 * Org owners/admins review what members have contributed to the org. Each row
 * is a grant in the `permissions` table targeting this org. Admins can reject a
 * contribution (revokes team access — enforced in the DB) or restore it.
 *
 * Non-admins see the same list read-only (so everyone can see what's shared and
 * who shared it) but without the action buttons.
 */

import React from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck, ExternalLink, X, RotateCcw, Check } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/utils/supabase/client";
import { getShareableResource } from "@/utils/permissions/registry";
import {
  listOrgShareGrants,
  reviewOrgShare,
  type OrgShareGrant,
  type OrgShareStatus,
} from "@/utils/permissions/orgModeration";
import type { OrganizationMemberWithUser } from "../types";
import { ORG_RESOURCE_CATALOGUE, type OrgResourceEntry } from "../resource-catalogue";

interface OrgShareReviewCardProps {
  orgId: string;
  isAdmin: boolean;
  members: OrganizationMemberWithUser[];
  /** Bump to force a reload (e.g. after a contribution). */
  refreshKey?: number;
  onChanged?: () => void;
}

// canonical table (= permissions.resource_type) → catalogue entry.
const ENTRY_BY_TABLE = new Map<string, OrgResourceEntry>();
for (const entry of ORG_RESOURCE_CATALOGUE) {
  if (entry.shareKey) ENTRY_BY_TABLE.set(entry.shareKey, entry);
}

interface HydratedGrant extends OrgShareGrant {
  entry?: OrgResourceEntry;
  title: string;
}

export function OrgShareReviewCard({
  orgId,
  isAdmin,
  members,
  refreshKey = 0,
  onChanged,
}: OrgShareReviewCardProps) {
  const router = useRouter();
  const [grants, setGrants] = React.useState<HydratedGrant[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const memberName = React.useCallback(
    (userId: string | null) => {
      if (!userId) return "Someone";
      const m = members.find((mm) => mm.userId === userId);
      return m?.user?.displayName || m?.user?.email || "A member";
    },
    [members],
  );

  const load = React.useCallback(async () => {
    setLoading(true);
    const raw = await listOrgShareGrants(orgId);

    // Hydrate titles in one query per table.
    const byTable = new Map<string, string[]>();
    for (const g of raw) {
      if (!byTable.has(g.resourceTable)) byTable.set(g.resourceTable, []);
      byTable.get(g.resourceTable)!.push(g.resourceId);
    }
    const titleMaps = new Map<string, Map<string, string>>();
    await Promise.all(
      [...byTable.entries()].map(async ([table, ids]) => {
        const entry = ENTRY_BY_TABLE.get(table);
        if (!entry?.titleColumn) return;
        try {
          const { data } = await supabase
            .from(table as never)
            .select(`id, ${entry.titleColumn}`)
            .in("id", ids);
          const map = new Map<string, string>();
          for (const row of (data as unknown as Array<Record<string, unknown>>) ?? []) {
            map.set(String(row.id), String(row[entry.titleColumn!] ?? "").trim());
          }
          titleMaps.set(table, map);
        } catch {
          /* leave untitled */
        }
      }),
    );

    const hydrated: HydratedGrant[] = raw.map((g) => {
      const entry = ENTRY_BY_TABLE.get(g.resourceTable);
      const title = titleMaps.get(g.resourceTable)?.get(g.resourceId) || "";
      return { ...g, entry, title: title || entry?.label || "Shared item" };
    });
    setGrants(hydrated);
    setLoading(false);
  }, [orgId]);

  React.useEffect(() => {
    load();
  }, [load, refreshKey]);

  async function act(grant: HydratedGrant, status: OrgShareStatus) {
    setBusyId(grant.permissionId);
    const result = await reviewOrgShare(grant.permissionId, status);
    setBusyId(null);
    if (result.success) {
      setGrants((prev) =>
        prev.map((g) =>
          g.permissionId === grant.permissionId ? { ...g, status } : g,
        ),
      );
      toast.success(
        status === "rejected"
          ? "Contribution rejected — team access revoked."
          : status === "active"
            ? "Contribution restored."
            : "Marked as pending.",
      );
      onChanged?.();
    } else {
      toast.error(result.error ?? "Couldn't update the contribution.");
    }
  }

  const pendingCount = grants.filter((g) => g.status !== "rejected").length;

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Member contributions</h2>
        {grants.length > 0 && (
          <Badge variant="secondary" className="text-xs">
            {pendingCount} shared
          </Badge>
        )}
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        {isAdmin
          ? "Resources members shared with this org. Reject anything that shouldn't be here — it revokes team access immediately."
          : "Resources members have shared with this org."}
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : grants.length === 0 ? (
        <div className="text-center py-8 border-2 border-dashed border-border rounded-lg">
          <p className="text-sm text-muted-foreground">
            No member contributions yet.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {grants.map((grant) => {
            const Icon = grant.entry?.icon;
            const rejected = grant.status === "rejected";
            const shareable = getShareableResource(grant.resourceTable);
            const href = shareable
              ? shareable.urlPathTemplate.replace("{id}", grant.resourceId)
              : null;
            return (
              <li
                key={grant.permissionId}
                className={`flex items-center gap-3 p-3 rounded-lg border ${
                  rejected
                    ? "border-border bg-muted/40 opacity-70"
                    : "border-border bg-card"
                }`}
              >
                {Icon && (
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate" title={grant.title}>
                      {grant.title}
                    </span>
                    {href && (
                      <button
                        onClick={() => router.push(href)}
                        className="text-muted-foreground hover:text-foreground shrink-0"
                        title="Open"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {grant.entry?.label ?? "Item"} · shared by {memberName(grant.sharedBy)}
                    {grant.createdAt &&
                      ` · ${formatDistanceToNow(new Date(grant.createdAt), { addSuffix: true })}`}
                  </p>
                </div>

                {rejected ? (
                  <>
                    <Badge variant="outline" className="text-[10px] shrink-0 text-red-600 dark:text-red-400 border-red-300 dark:border-red-800">
                      Rejected
                    </Badge>
                    {isAdmin && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 shrink-0"
                        disabled={busyId === grant.permissionId}
                        onClick={() => act(grant, "active")}
                      >
                        {busyId === grant.permissionId ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <>
                            <RotateCcw className="h-3.5 w-3.5 mr-1" />
                            Restore
                          </>
                        )}
                      </Button>
                    )}
                  </>
                ) : (
                  <>
                    <Badge variant="secondary" className="text-[10px] shrink-0 gap-1">
                      <Check className="h-3 w-3" />
                      Shared
                    </Badge>
                    {isAdmin && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 shrink-0 text-red-600 hover:text-red-700 dark:text-red-400"
                        disabled={busyId === grant.permissionId}
                        onClick={() => act(grant, "rejected")}
                      >
                        {busyId === grant.permissionId ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <>
                            <X className="h-3.5 w-3.5 mr-1" />
                            Reject
                          </>
                        )}
                      </Button>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
