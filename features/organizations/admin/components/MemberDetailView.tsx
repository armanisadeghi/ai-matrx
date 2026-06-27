"use client";

/**
 * Per-member admin surface at /organizations/[orgId]/admin/users/[userId].
 * Profile + status actions + usage metrics + controls + resource summary.
 */
import React, { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Ban,
  CircleCheck,
  FolderInput,
  Loader2,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { confirm } from "@/components/dialogs/confirm/confirmDialogOpener";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Organization } from "../../types";
import { useOrgMemberDetail, useOrgRoster } from "../hooks";
import { setMemberStatus } from "../service";
import { formatBytes, formatMcents, formatRelativeTime } from "../utils";
import { MemberControlsForm } from "./MemberControlsForm";
import { ReassignResourcesDialog, type ReassignCandidate } from "./ReassignResourcesDialog";

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold text-foreground">{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

interface Props {
  orgId: string;
  organization: Organization;
  userId: string;
}

export function MemberDetailView({ orgId, organization, userId }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const { member, loading, error, refresh } = useOrgMemberDetail(orgId, userId);
  const { members } = useOrgRoster(orgId);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);

  const candidates: ReassignCandidate[] = useMemo(
    () =>
      members
        .filter((m) => m.userId !== userId)
        .map((m) => ({ userId: m.userId, label: m.displayName || m.email || m.userId })),
    [members, userId],
  );

  if (loading && !member) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading member…
      </div>
    );
  }
  if (error || !member) {
    return (
      <div className="p-4 md:p-6">
        <Card className="mx-auto max-w-lg border-destructive/30 bg-destructive/5 p-6 text-center text-sm text-destructive">
          {error ?? "Member not found."}
        </Card>
      </div>
    );
  }

  const label = member.displayName || member.email || "this member";
  const isOwner = member.role === "owner";

  const toggleStatus = async () => {
    const suspend = member.status !== "suspended";
    const ok = await confirm({
      title: suspend ? `Suspend ${label}?` : `Reactivate ${label}?`,
      description: suspend
        ? "They will be flagged suspended across the org admin views. You can reactivate anytime."
        : "They will be marked active again.",
      confirmLabel: suspend ? "Suspend" : "Reactivate",
      variant: suspend ? "destructive" : "default",
    });
    if (!ok) return;
    setStatusBusy(true);
    try {
      await setMemberStatus(orgId, userId, suspend ? "suspended" : "active");
      toast.success(suspend ? "Member suspended" : "Member reactivated");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setStatusBusy(false);
    }
  };

  const label_lower = formatRelativeTime(member.lastOrgActivityAt);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 p-4 md:p-6">
      <Link
        href={`/organizations/${organization.slug}/admin`}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        User management
      </Link>

      {/* Identity + actions */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-12 w-12">
            {member.avatarUrl && <AvatarImage src={member.avatarUrl} alt="" />}
            <AvatarFallback>
              {(member.displayName || member.email || "?").slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-foreground">
                {member.displayName || member.email || "Unknown user"}
              </h1>
              <Badge variant={isOwner ? "default" : member.role === "admin" ? "secondary" : "outline"} className="gap-1 capitalize">
                {isOwner && <ShieldCheck className="h-3 w-3" />}
                {member.role}
              </Badge>
              {member.status === "suspended" && <Badge variant="destructive">Suspended</Badge>}
            </div>
            {member.email && <p className="text-sm text-muted-foreground">{member.email}</p>}
            <p className="text-xs text-muted-foreground">
              Joined {member.joinedAt ? new Date(member.joinedAt).toLocaleDateString() : "—"} · Last
              active here {label_lower}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {!isOwner && (
            <Button variant="outline" size="sm" onClick={toggleStatus} disabled={statusBusy}>
              {statusBusy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : member.status === "suspended" ? (
                <CircleCheck className="mr-2 h-4 w-4" />
              ) : (
                <Ban className="mr-2 h-4 w-4" />
              )}
              {member.status === "suspended" ? "Reactivate" : "Suspend"}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setReassignOpen(true)}>
            <FolderInput className="mr-2 h-4 w-4" />
            Reassign resources
          </Button>
          {!isOwner && (
            <Button variant="destructive" size="sm" onClick={() => setRemoveOpen(true)}>
              <Trash2 className="mr-2 h-4 w-4" />
              Remove
            </Button>
          )}
        </div>
      </div>

      {/* Usage metrics */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric
          label="Org files"
          value={String(member.orgFilesCount)}
          hint={formatBytes(member.orgBytesUsed)}
        />
        <Metric
          label="Account storage"
          value={formatBytes(member.accountBytesUsed)}
          hint={`${member.accountFilesCount} files (all orgs)`}
        />
        <Metric label="Spend 24h" value={formatMcents(member.cost24hMcents)} hint={`${member.requests24h} requests`} />
        <Metric label="Requests 6h" value={String(member.requests6h)} hint="account-wide" />
      </div>

      {/* Controls */}
      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Controls</h2>
        <MemberControlsForm orgId={orgId} member={member} onSaved={refresh} />
      </Card>

      {/* Resources summary */}
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Org-scoped resources</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              startTransition(() =>
                router.push(`/organizations/${organization.slug}/admin/users/${userId}/resources`),
              )
            }
          >
            View all
          </Button>
        </div>
        {member.resources.length === 0 ? (
          <p className="text-sm text-muted-foreground">No org-scoped resources owned by this member.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {member.resources.map((r) => (
              <span
                key={r.resourceType}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1 text-sm"
              >
                {r.displayLabel}
                <span className="rounded-full bg-background px-1.5 text-xs font-medium text-muted-foreground">
                  {r.count}
                </span>
              </span>
            ))}
          </div>
        )}
      </Card>

      <ReassignResourcesDialog
        open={reassignOpen}
        onOpenChange={setReassignOpen}
        orgId={orgId}
        mode="reassign"
        sourceUserId={userId}
        sourceLabel={label}
        resources={member.resources}
        candidates={candidates}
        onDone={refresh}
      />
      <ReassignResourcesDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        orgId={orgId}
        mode="remove"
        sourceUserId={userId}
        sourceLabel={label}
        resources={member.resources}
        candidates={candidates}
        onDone={() => startTransition(() => router.push(`/organizations/${organization.slug}/admin`))}
      />
    </div>
  );
}
