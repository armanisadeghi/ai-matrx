"use client";

// features/education/classes/components/ClassRosterPanel.tsx
//
// The class Members / roster panel. Owner sees EVERY member (active + pending
// requests + entitled paid-but-not-enrolled) and can approve requests + remove
// members. Members see the active roster read-only. Reads edu_class_roster; every
// mutation is a role-gated edu_class_* RPC (the owner check is the SERVER's, via
// the RPC — a bypassed client `isOwner` cannot escalate).

import { Users, Check, X, UserMinus, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { useClassRoster } from "../hooks/useClassRoster";
import type { ClassRosterMember } from "../types";

// Owner sees the email; a co-member sees the display name (peer emails are
// nulled server-side — D56). Fall back to the id only if neither is present.
function memberLabel(m: ClassRosterMember): string {
  return m.email ?? m.displayName ?? m.userId;
}

function StatusChip({ member }: { member: ClassRosterMember }) {
  if (member.role === "owner") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
        <Crown className="h-3 w-3" />
        Owner
      </span>
    );
  }
  if (member.status === "pending") {
    return (
      <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
        Requested
      </span>
    );
  }
  if (member.status === "entitled") {
    return (
      <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium text-sky-600 dark:text-sky-400">
        Purchased
      </span>
    );
  }
  return (
    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
      Member
    </span>
  );
}

export function ClassRosterPanel({
  classId,
  isOwner,
  onChanged,
}: {
  classId: string;
  isOwner: boolean;
  /** Called after a roster mutation so the header member count can refresh. */
  onChanged?: () => void;
}) {
  const roster = useClassRoster(classId);

  async function approve(m: ClassRosterMember) {
    await roster.approve(m.userId);
    onChanged?.();
  }
  async function decline(m: ClassRosterMember) {
    await roster.remove(m.userId);
    onChanged?.();
  }
  async function remove(m: ClassRosterMember) {
    const ok = await confirm({
      title: `Remove ${m.email ?? m.displayName ?? "this member"}?`,
      description: "They lose access to this class. They can re-join or re-request later.",
      confirmLabel: "Remove",
      variant: "destructive",
    });
    if (!ok) return;
    await roster.remove(m.userId);
    onChanged?.();
  }

  const pending = roster.members.filter((m) => m.status === "pending");
  const active = roster.members.filter(
    (m) => m.status === "active" || m.status === "entitled",
  );

  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-1.5 text-sm font-medium text-foreground">
        <Users className="h-4 w-4 text-muted-foreground" />
        Members
        {roster.members.length > 0 && (
          <span className="text-muted-foreground">({active.length})</span>
        )}
      </h2>

      {roster.loading ? (
        <div className="space-y-2">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      ) : roster.error ? (
        <p className="text-xs text-destructive">{roster.error}</p>
      ) : (
        <div className="space-y-3">
          {/* Pending requests — owner only. */}
          {isOwner && pending.length > 0 && (
            <div className="space-y-1.5">
              <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Requests ({pending.length})
              </h3>
              <ul className="space-y-1.5">
                {pending.map((m) => (
                  <li
                    key={m.userId}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                      {memberLabel(m)}
                    </span>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        size="sm"
                        className="h-7 gap-1 text-xs"
                        disabled={roster.acting}
                        onClick={() => approve(m)}
                      >
                        <Check className="h-3.5 w-3.5" />
                        Approve
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        disabled={roster.acting}
                        onClick={() => decline(m)}
                        aria-label="Decline request"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Active roster. */}
          <ul className="space-y-1.5">
            {active.map((m) => (
              <li
                key={m.userId}
                className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2"
              >
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                  {memberLabel(m)}
                </span>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusChip member={m} />
                  {isOwner && m.role !== "owner" && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      disabled={roster.acting}
                      onClick={() => remove(m)}
                      aria-label="Remove member"
                    >
                      <UserMinus className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {active.length === 0 && (!isOwner || pending.length === 0) && (
            <p className="text-xs text-muted-foreground">
              No members yet.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
