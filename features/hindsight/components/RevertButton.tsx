"use client";

/**
 * RevertButton — the ONE revert affordance for an applied hindsight change,
 * shared by `FindingCard` (the applied finding's own row) and `VersionLadder`
 * (the `from review` row when it is the current version). Audit trail and
 * revert are one surface, so both doors run the exact same confirm + call.
 *
 * The confirm step names exactly what will happen — which version's content
 * comes back — and doors to the version diff page when the agent is known.
 * The server refuses (422, human-readable) when the agent has moved past the
 * applied version; that message is shown verbatim, never rephrased.
 */
import { useState } from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { Undo2 } from "lucide-react";
import { toast } from "@/lib/toast";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

import { revertFinding } from "../api";
import type { Finding } from "../types";

export function canRevert(finding: Finding): boolean {
  return finding.status === "applied" && finding.applied_version_number != null;
}

export function RevertButton({
  finding,
  agentId,
  onChanged,
  className,
}: {
  finding: Finding;
  /** When known, the confirm dialog doors to the returning version's diff page. */
  agentId?: string;
  onChanged: () => void;
  className?: string;
}) {
  const [confirming, setConfirming] = useState(false);

  const revert = useMutation({
    mutationFn: () => revertFinding(finding.id),
    onSuccess: (res) => {
      setConfirming(false);
      toast.success(
        `Reverted — the agent is back to its v${res.reverted_to_version} behavior` +
          (res.new_version_number != null
            ? `, recorded as v${res.new_version_number}`
            : ""),
      );
      onChanged();
    },
    onError: (err: Error) => toast.error(`Revert failed: ${err.message}`),
  });

  if (!canRevert(finding)) return null;

  // The version whose content comes back. Stamped by the apply; the arithmetic
  // fallback only covers findings applied before stamping existed, where the
  // server independently resolves (and enforces) the true target.
  const returnsTo =
    finding.pre_apply_version ?? (finding.applied_version_number ?? 1) - 1;

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className={className}
        disabled={revert.isPending}
        onClick={() => setConfirming(true)}
        title="Undo this change — the agent returns to how it was before"
        data-testid="hindsight-revert"
      >
        <Undo2 className="mr-1 h-3.5 w-3.5" />
        {revert.isPending ? "Reverting…" : "Revert"}
      </Button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Revert this change?"
        description={
          <>
            “{finding.title}” is undone: the agent returns to its v{returnsTo}{" "}
            behavior. Nothing is erased — the change stays in the version
            history, and the revert is recorded as a new version.
          </>
        }
        content={
          agentId ? (
            <p className="text-sm">
              <Link
                href={`/agents/${agentId}/v/${returnsTo}`}
                target="_blank"
                className="text-primary underline underline-offset-2"
              >
                See exactly what v{returnsTo} looks like
              </Link>{" "}
              before deciding.
            </p>
          ) : undefined
        }
        confirmLabel={`Revert to v${returnsTo}`}
        busy={revert.isPending}
        onConfirm={() => revert.mutate()}
      />
    </>
  );
}
