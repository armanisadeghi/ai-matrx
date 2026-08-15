// features/scheduling/components/list/DuplicateScheduleBanner.tsx

"use client";

import { useState } from "react";
import Link from "next/link";
import { CopyCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppDispatch } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";
import { toggleTaskEnabled } from "../../redux/tasks/thunks";
import type { DuplicateScheduleGroup } from "../../service/schedulerApi.types";

/**
 * Two schedules doing one job, shown to the person paying for both.
 *
 * "Human Baseline Schedule" existed twice and fired hourly for five days
 * before anyone noticed, because two healthy schedules running perfectly look
 * exactly like one. Nothing errored, so nothing surfaced. This is the surface.
 *
 * THE DOOR LAW: every schedule named here is a link to itself, so "which one
 * is that?" is one click, not a hunt. THE ONE-CLICK FIX: a problem we can
 * detect ships with its fix — pausing the redundant copy is the resolution,
 * and it is offered right here rather than described.
 *
 * Pausing is deliberately the offered action, never deleting: pausing stops
 * the cost immediately, changes no results, and is reversible. Which of a pair
 * to keep — and whether to delete anything — stays the user's call.
 */
export function DuplicateScheduleBanner({
  groups,
  onResolved,
}: {
  groups: DuplicateScheduleGroup[];
  onResolved?: () => void;
}) {
  if (groups.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {groups.map((group) => (
        <DuplicateGroupCard
          key={group.fingerprint}
          group={group}
          onResolved={onResolved}
        />
      ))}
    </div>
  );
}

function DuplicateGroupCard({
  group,
  onResolved,
}: {
  group: DuplicateScheduleGroup;
  onResolved?: () => void;
}) {
  const dispatch = useAppDispatch();
  const [busy, setBusy] = useState(false);

  const redundant = group.members.filter((m) => !m.is_original && m.enabled);
  const original = group.members.find((m) => m.is_original);

  const pauseExtras = async () => {
    setBusy(true);
    try {
      await Promise.all(
        redundant.map((m) => dispatch(toggleTaskEnabled(m.id, false))),
      );
      toast.success(
        redundant.length === 1
          ? "Paused the duplicate schedule"
          : `Paused ${redundant.length} duplicate schedules`,
        { description: "The original keeps running. Nothing was deleted." },
      );
      onResolved?.();
    } catch {
      toast.error("Couldn't pause the duplicate", {
        description: "Nothing changed. Try again, or pause it from its own page.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/30 px-3 py-2.5">
      <div className="flex items-start gap-2.5">
        <CopyCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">
            {group.enabled_count} schedules are doing the same job
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Same agent, same instructions, same trigger — so every fire runs the
            work {group.enabled_count} times and bills for it {group.enabled_count}{" "}
            times. Different names don&apos;t make them different work.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
            {group.members.map((member) => (
              <Link
                key={member.id}
                href={`/schedules/${member.id}`}
                className="rounded border border-border bg-background px-1.5 py-0.5 text-foreground hover:bg-accent hover:text-accent-foreground"
                title={
                  member.is_original
                    ? "The original — created first"
                    : "Redundant copy"
                }
              >
                {member.title || "Untitled schedule"}
                {member.is_original ? (
                  <span className="ml-1 text-muted-foreground">original</span>
                ) : null}
                {!member.enabled ? (
                  <span className="ml-1 text-muted-foreground">paused</span>
                ) : null}
              </Link>
            ))}
          </div>
        </div>
        {redundant.length > 0 ? (
          <Button
            size="sm"
            variant="outline"
            onClick={pauseExtras}
            disabled={busy}
            className="shrink-0 gap-1.5 bg-background"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {redundant.length === 1
              ? "Pause the copy"
              : `Pause ${redundant.length} copies`}
          </Button>
        ) : null}
      </div>
      {original ? (
        <p className="mt-1.5 pl-6 text-[11px] text-muted-foreground">
          Pausing keeps{" "}
          <Link
            href={`/schedules/${original.id}`}
            className="underline underline-offset-2 hover:text-foreground"
          >
            {original.title || "the original"}
          </Link>{" "}
          running and deletes nothing.
        </p>
      ) : null}
    </div>
  );
}
